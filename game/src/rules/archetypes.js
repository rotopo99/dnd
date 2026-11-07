// AI archetypes of the combat rework (docs/specs/combat-rework.md §4): assault, sniper, support, controller, coward,
// berserk, summoner, boss (phases). Pure rules — runs in Node (sims use it through ai.js / combat.js hooks).
// Data: b.data.combat (data/combat.js COMBAT: `arch` numbers, `bindings`, `aiFallback`, `minions`).
//
// Decisions:
//  - u.arch is set once at battle start (assignArchetype); old profiles stay in u.ai (movement style).
//  - Binding order: def.archetype > exact id > rank boss/miniboss > wildcard id > coward faction rule (25% grunts,
//    deterministic by unit id) > aiFallback[u.ai]. Summons never get summoner/boss.
//  - Engine-side behaviour (works for the player's view and the sims alike): summoner spawns minions on its turns,
//    boss phases on damage (event `phase`), coward leaves the field from an edge tile (event `flee`, no loot, XP ×0.5),
//    berserk rage when an ally dies (event `rage`). Combat numbers come through archHit/archDmg/archKb.
//  - AI-side: archTargetMul (target preference), archTileScore (where to stand), archAbilityMul, fleeAction.
//  - intentOf(b, u) — a cheap forecast for the UI (no simulation): flee / summon / heal / zone / melee / ranged.

import { chebyshev, elevAt, inCoverSpot, lineOfSight } from './grid.js';
import { avgDice } from './dice.js';
import {
  emitEvent, isAlive, isStanding, isHostile, spawnSummon, unsummon, removeFromBattle, getReachable, getSpeed,
  removeStatus, weaponRange, isMeleeWeapon, enemyAdjacent,
} from './combat.js';
import { createSurface, radiusTiles } from './surfaces.js';

const cfg = (b) => (b.data && b.data.combat) || null;
export const baseId = (id) => String(id || '').split('^')[0];
const strip = (id) => id.replace(/-l\d+$/, '');
const reCache = new Map();
function wild(p, id) {
  let re = reCache.get(p);
  if (!re) { re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\-]/g, '\\$&')).join('.*') + '$'); reCache.set(p, re); }
  return re.test(id);
}
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
const ARCHES = ['assault', 'sniper', 'support', 'controller', 'coward', 'berserk', 'summoner', 'boss'];
export const ARCHETYPES = ARCHES;

/** Archetype of a unit (null — no combat data / a player-driven unit). */
export function archetypeFor(b, u) {
  const C = cfg(b);
  if (!C || u.control !== 'ai') return null;
  const fb = C.aiFallback[u.ai] || 'assault';
  if (!u.enemyId) return fb;
  const def = b.data.enemies[u.enemyId] || b.data.summons[u.enemyId] || {};
  const summon = u.kind === 'summon';
  const ok = (a) => (summon && (a === 'summoner' || a === 'boss') ? fb : a);
  if (def.archetype && ARCHES.includes(def.archetype)) return ok(def.archetype);
  const id = baseId(u.enemyId), sid = strip(id);
  for (const a of ARCHES) if ((C.bindings[a] || []).some((p) => !p.includes('*') && (p === id || p === sid))) return ok(a);
  if (!summon && (u.boss || def.rank === 'boss' || def.rank === 'miniboss')) return 'boss';
  for (const a of ARCHES) if ((C.bindings[a] || []).some((p) => p.includes('*') && (wild(p, id) || wild(p, sid)))) return ok(a);
  if (def.rank === 'grunt' && (C.cowardFactions || []).includes(def.faction) && !(C.notCoward || []).includes(sid)
    && hash01(u.id + id) < (C.arch.coward.share ?? 0.25)) return 'coward';
  return fb;
}

export function assignArchetypes(b) {
  for (const u of b.units) u.arch = archetypeFor(b, u);
}

// ---------------------------------------------------------------- numbers

const A = (b, k) => cfg(b).arch[k];
const hpShare = (u) => u.hp / Math.max(1, u.maxHp);

export function archHit(b, u) {
  if (!u.arch) return 0;
  if (u.arch === 'berserk' && hpShare(u) <= A(b, 'berserk').rageBelow) return A(b, 'berserk').rageHit;
  if (u.arch === 'boss' && (u.phase || 1) >= 2) return A(b, 'boss').p2Hit;
  return 0;
}
export function archDmg(b, u) {
  if (!u.arch) return 0;
  if (u.arch === 'assault' && hpShare(u) <= A(b, 'assault').lastStand) return A(b, 'assault').lastStandDmg;
  if (u.arch === 'berserk' && u.rage) return A(b, 'berserk').allyDeathDmg;
  return 0;
}
export function archKb(b, u) {
  if (u.arch === 'berserk' && hpShare(u) <= A(b, 'berserk').rageBelow) return A(b, 'berserk').rageKb;
  return 0;
}

// ---------------------------------------------------------------- summoner

function summonCap(b, u) {
  const caps = A(b, 'summoner').caps;
  const L = u.level || 1;
  for (const [lv, n] of caps) if (L <= lv) return n;
  return caps[caps.length - 1][1];
}
function minionOf(b, u) {
  const C = cfg(b);
  const id = baseId(u.enemyId);
  if (C.minions[id] && (b.data.summons[C.minions[id]] || b.data.enemies[C.minions[id]])) return C.minions[id];
  for (const a of u.abilities || []) for (const op of a.effects || []) if (op.op === 'summon' && op.unit) return op.unit;
  const fb = A(b, 'summoner').fallback;
  return b.data.summons[fb] || b.data.enemies[fb] ? fb : null;
}
const minionsOf = (b, u) => b.units.filter((s) => s.summoner === u.id && isAlive(s) && s.archMinion);
function spawnMinions(b, u, n) {
  const id = minionOf(b, u);
  if (!id) return 0;
  const S = A(b, 'summoner');
  let made = 0;
  for (let i = 0; i < n; i++) {
    const s = spawnSummon(b, u, id, S.turns, null);
    if (!s) break;
    const hp = Math.max(1, Math.round((8 + 4.5 * (u.level || 1)) * S.hpK));
    s.maxHp = s.hp = hp;
    s.archMinion = true;
    s.arch = archetypeFor(b, s);
    made++;
  }
  return made;
}
export function summonDue(b, u) {
  if (u.arch !== 'summoner') return false;
  if (minionsOf(b, u).length >= summonCap(b, u)) return false;
  return u.archLast == null || b.round - u.archLast >= A(b, 'summoner').every;
}

// ---------------------------------------------------------------- turn hooks (combat.js)

export function archTurnStart(b, u) {
  if (!u.arch || !cfg(b)) return;
  if (u.arch === 'summoner' && summonDue(b, u)) {
    const cap = summonCap(b, u), have = minionsOf(b, u).length;
    const n = u.archLast == null ? Math.max(1, Math.ceil(cap / 2)) - have : 1;
    if (n > 0 && spawnMinions(b, u, Math.min(n, cap - have))) emitEvent(b, { type: 'archSummon', actor: u.id });
    u.archLast = b.round;
  }
  if (u.arch === 'boss' && u.phase === 3 && b.round % (A(b, 'boss').p3ExtraEvery || 2) === 0) {
    b.turn.actions++;
    emitEvent(b, { type: 'extraAction', actor: u.id, kind: 'action' });
  }
  if (u.arch === 'coward' && !u.fleeing && hpShare(u) <= A(b, 'coward').fleeBelow) {
    u.fleeing = true;
    emitEvent(b, { type: 'fleeStart', actor: u.id });
  }
}

const atEdge = (g, x, y) => x <= 1 || y <= 1 || x >= g.w - 2 || y >= g.h - 2;
const edgeDist = (g, x, y) => Math.min(x - 1, y - 1, g.w - 2 - x, g.h - 2 - y);

export function archTurnEnd(b, u) {
  if (u.arch === 'coward' && u.fleeing && isStanding(u) && atEdge(b.grid, u.x, u.y)) {
    u.fled = true;
    u.xpMul = A(b, 'coward').xpMul;
    removeFromBattle(b, u, 'flee');
  }
}

const BOSS_SURFACE = { fire: 'fire', toxin: 'toxgas', acid: 'acid', electric: 'electric', cringe: 'cringe', proxy: 'proxy', cold: 'ice', psychic: 'cringe' };

/** Boss phases on damage: 66% / 33% (or def.phases [{hp, say, surface}]). */
export function archOnDamage(b, u) {
  if (u.arch !== 'boss' || !isAlive(u) || u.down) return;
  const def = b.data.enemies[u.enemyId] || {};
  const list = def.phases && def.phases.length ? def.phases : A(b, 'boss').phases.map((hp) => ({ hp }));
  const share = hpShare(u);
  while ((u.phase || 1) - 1 < list.length && share < list[(u.phase || 1) - 1].hp) {
    const ph = list[(u.phase || 1) - 1];
    u.phase = (u.phase || 1) + 1;
    emitEvent(b, { type: 'phase', actor: u.id, n: u.phase, say: ph.say || null });
    const B = A(b, 'boss');
    if (u.phase === 2) {
      const kind = ph.surface || BOSS_SURFACE[u.weapon && u.weapon.dmgType];
      if (kind && b.data.surfaces && b.data.surfaces[kind]) {
        const tiles = radiusTiles(b, u.x, u.y, 2).filter((p) => b.units.some((e) => isStanding(e) && isHostile(b, u, e) && chebyshev(e.x, e.y, p.x, p.y) <= 1));
        if (tiles.length) createSurface(b, kind, tiles, u, {});
      }
      if ((u.abilities || []).some((a) => (a.effects || []).some((op) => op.op === 'summon'))) spawnMinions(b, u, B.p2Summon || 2);
    } else if (u.phase >= 3) {
      u.archDmgMul = B.p3DmgMul || 1.25;
      if (u.statuses.some((s) => s.id === 'fear')) removeStatus(b, u, 'fear');
      if (!u.immuneStatus.includes('fear')) u.immuneStatus = [...u.immuneStatus, 'fear'];
    }
  }
}

export function archOnDeath(b, u) {
  if (!cfg(b)) return;
  if (u.arch === 'summoner') {
    u.xpMul = 1 + (A(b, 'summoner').xpBonus || 0);
    for (const s of b.units) if (s.summoner === u.id && isAlive(s) && s.archMinion) unsummon(b, s);
  }
  if (u.kind === 'summon') return;
  for (const a of b.units) {
    if (a.arch !== 'berserk' || a.team !== u.team || a === u || a.rage || !isStanding(a)) continue;
    a.rage = true;
    emitEvent(b, { type: 'rage', actor: a.id });
  }
}

// ---------------------------------------------------------------- AI hooks (ai.js)

const ROLE_PRIO = { support: 1, caster: 1, control: 1, healer: 1 };

/** Target preference multiplier of u attacking t. */
export function archTargetMul(b, u, t) {
  switch (u.arch) {
    case 'assault': return Math.max(0.85, Math.min(1.2, 1 + (16 - t.kb) * 0.03));
    case 'sniper': return ROLE_PRIO[t.role] ? A(b, 'sniper').prio : t.kb <= 13 ? 1.15 : 1;
    case 'coward': return hpShare(t) <= A(b, 'coward').woundedBelow ? A(b, 'coward').woundedMul : 0.8;
    case 'berserk': return 1 / (1 + 0.2 * Math.max(0, chebyshev(u.x, u.y, t.x, t.y) - 1));
    default: return 1;
  }
}

/** Ability EV multiplier: support heals the wounded, controller likes control (not on controlled targets). */
export function archAbilityMul(b, u, a, t) {
  if (!u.arch) return 1;
  const ops = a.effects || [];
  if (u.arch === 'support' && ops.some((op) => op.op === 'heal' || op.op === 'shield')) {
    const S = A(b, 'support');
    return t && t.team === u.team && hpShare(t) <= S.healBelow ? S.healMul : 1;
  }
  if (u.arch === 'controller' && (ops.some((op) => op.op === 'status' || op.op === 'surface' || op.op === 'zone') || a.zone || a.surface)) {
    const K = A(b, 'controller');
    if (t && t.team !== u.team && t.statuses.some((s) => K.controlled.includes(s.id))) return 0.3;
    return K.ctrlMul;
  }
  return 1;
}

/** Extra tile score for planTile. */
export function archTileScore(b, u, x, y, enemies) {
  switch (u.arch) {
    case 'sniper': {
      const S = A(b, 'sniper');
      let s = elevAt(b.grid, x, y) * S.elevScore + (inCoverSpot(b.grid, x, y) ? S.coverScore : 0);
      for (const e of enemies) if (chebyshev(x, y, e.x, e.y) <= S.threatRange && isMeleeWeapon(e)) s -= 2;
      return s;
    }
    case 'support': case 'summoner': {
      const k = A(b, 'support').keepAway;
      let s = inCoverSpot(b.grid, x, y) ? 1 : 0;
      for (const e of enemies) { const d = chebyshev(x, y, e.x, e.y); if (d < k) s -= (k - d) * 1.5; }
      return s;
    }
    case 'assault': case 'berserk':
      return 0;
    default:
      return u.ai !== 'melee' ? elevAt(b.grid, x, y) * 1.5 : 0;
  }
}

/** Surface harm multiplier in tile planning. */
export const archHarmMul = (b, u) => (u.arch === 'berserk' ? A(b, 'berserk').surfaceMul : null);

/** Coward on the run: disengage, step to the edge, dash; null — not fleeing. */
export function fleeAction(b, u) {
  if (!u.fleeing) return null;
  const t = b.turn, g = b.grid;
  if (atEdge(g, u.x, u.y)) return { type: 'endTurn', unit: u.id };
  if (t.bonus > 0 && !t.disengaged && t.move > 0 && enemyAdjacent(b, u)) return { type: 'disengage', unit: u.id };
  if (t.move > 0) {
    const reach = getReachable(b, u.id);
    let best = null, bd = edgeDist(g, u.x, u.y);
    for (const i of reach.list) {
      if (reach.dist[i] <= 0) continue;
      const x = i % g.w, y = (i / g.w) | 0;
      const d = edgeDist(g, x, y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return { type: 'move', unit: u.id, to: best };
  }
  if (t.actions > 0 && !t.aiDashed && getSpeed(b, u) > 0) { t.aiDashed = true; return { type: 'dash', unit: u.id }; }
  return { type: 'endTurn', unit: u.id };
}

// ---------------------------------------------------------------- intent (UI forecast)

const statMod = (v) => Math.floor(((v ?? 10) - 10) / 2);
const avgHit = (u) => (u.weapon ? Math.max(1, Math.round(avgDice(u.weapon.dice) + statMod(u.stats[u.weapon.stat || 'str']) + (u.weapon.dmg || 0))) : 0);

/** What the enemy will probably do next: { kind: flee|summon|heal|zone|melee|ranged|ready, target?, dmg? } or null. */
export function intentOf(b, u) {
  if (!u || !isStanding(u) || u.control !== 'ai') return null;
  if (u.fleeing) return { kind: 'flee' };
  if (u.arch === 'summoner' && summonDue(b, u)) return { kind: 'summon' };
  const allies = b.units.filter((a) => isStanding(a) && a.team === u.team);
  const foes = b.units.filter((e) => isStanding(e) && isHostile(b, u, e));
  const free = (a) => a.action !== 'reaction' && !a.todo && (!a.usesPerBattle || (u.uses[a.id] || 0) < a.usesPerBattle) && (a.cost || 0) <= u.enr;
  if (u.arch === 'support') {
    const heal = (u.abilities || []).find((a) => free(a) && (a.effects || []).some((op) => op.op === 'heal'));
    const hurt = allies.filter((a) => hpShare(a) <= A(b, 'support').healBelow).sort((p, q) => hpShare(p) - hpShare(q))[0];
    if (heal && hurt) return { kind: 'heal', target: hurt.id };
  }
  if (u.arch === 'controller' || (u.arch === 'boss' && u.phase >= 2)) {
    const ctl = (u.abilities || []).find((a) => free(a) && (a.target === 'tile' || a.area) && (a.effects || []).some((op) => op.op === 'status' || op.op === 'surface' || op.op === 'zone'));
    if (ctl && foes.length) return { kind: 'zone', target: nearest(u, foes).id };
  }
  if (!u.weapon || u.noAttack || !foes.length) return null;
  if (isMeleeWeapon(u)) {
    let best = null, bs = -1e9;
    for (const e of foes) { const s = archTargetMul(b, u, e) * 10 - chebyshev(u.x, u.y, e.x, e.y); if (s > bs) { bs = s; best = e; } }
    return { kind: 'melee', target: best.id, dmg: avgHit(u) };
  }
  const r = weaponRange(u);
  let best = null, bs = -1e9;
  for (const e of foes) {
    const d = chebyshev(u.x, u.y, e.x, e.y);
    const s = archTargetMul(b, u, e) * 10 - (d > r ? 5 : 0) - (d > 1 && !lineOfSight(b.grid, u.x, u.y, e.x, e.y) ? 4 : 0) - d * 0.1;
    if (s > bs) { bs = s; best = e; }
  }
  return { kind: 'ranged', target: best.id, dmg: avgHit(u) };
}
function nearest(u, list) {
  let best = list[0], bd = 1e9;
  for (const e of list) { const d = chebyshev(u.x, u.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best;
}
