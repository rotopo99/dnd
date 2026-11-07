// Universal AI: drives any unit (enemies, summons, NPC allies, lost control, balance sims).
// Picks the best legal action by expected value, plans movement on the grid.
// Profiles (unit.ai): 'melee' closes in; 'ranged' / 'caster' / 'support' keep distance and like cover.

import { avgDice, firstDie, chanceD20 } from './dice.js';
import { chebyshev, lineOfSight, hasCover, distanceField, tileAt, T_HAZARD } from './grid.js';
import {
  getLegalActions, perform, endTurn, getReachable, abilityTargets, abilityRange, isHostile, isStanding, isAlive, canRevive,
  attackOdds, saveFailChance, damageMultiplier, weaponDamageBonus, spellDamageBonus, weaponAttackBonus,
  spellAttackBonus, getDc, bonusValue, tagOk, weaponRange, isMeleeUnit, statusDef, hasStatus, isStatusImmune,
  abilityUsable, targetValid, canUseWeapon, approachOk, getSpeed, tauntSource, enemyAdjacent, isMeleeAttack, HEARTBREAK_HP_LOSS, itemAbility,
  isMeleeWeapon, weaponDc, weaponAreaAbility, zoneOf, inZone, ownDrop,
} from './combat.js';
import { surfaceHarm, surfaceOf, surfaceDefs, surfaceKindsAt, cellAt, connected } from './surfaces.js';
import { archTargetMul, archAbilityMul, archTileScore, archHarmMul, fleeAction } from './archetypes.js';
import { objectAt } from './terrain.js';

const STATUS_VALUE = {
  stun: 12, root: 4, slow: 3, fear: 5, blind: 5, silence: 4, disarm: 5, curse: 3, prone: 3, poison: 4,
  bleed: 4, burn: 5, cringed: 4, corrosion: 3, hallucination: 4, dazed: 3, taunt: 4, marked: 3,
  invisible: 5, stealth: 4, regen: 4, inspired: 2, blessed: 3, haste: 4, berserk: 3, fortified: 4,
  wet: 1, oiled: 2, shocked: 4, chilled: 3, frozen: 8, acid: 4, irradiated: 4, panic: 8, glitch: 4, overload: 3,
  choking: 3, scent: 1, slick: 1,
};
const HOT = { fire: 1, electric: 1 };
const BUFF_WEIGHT = { kb: 0.8, hit: 0.8, dmg: 1, init: 0.1, speed: 0.3, save: 0.4 };

// ---------------------------------------------------------------- value model

function threat(u) {
  if (u.noAttack || u.decoy) return 0.5;
  const w = u.weapon;
  return (w ? avgDice(w.dice) : 2) + (u.level || 1) * 1.5 + (u.abilities.length ? 2 : 0);
}

/** Value of dealing `amt` raw damage of a type to t. */
function dmgValue(b, t, amt, dmgType) {
  if (amt <= 0) return 0;
  const { mult, resource } = damageMultiplier(b, t, dmgType);
  const eff = amt * mult;
  if (eff <= 0) return 0;
  if (resource === 'mrl') {
    // value of «Срыв»: 50% heartbreak (70% of current HP, never kills) + 50% lost control (a turn of its threat)
    const left = Math.max(1, t.mrl);
    // v1.2: non-boss enemies/summons on 11–20 are «Сломлен» (out of the battle) — worth as much as a kill
    const prio = 1 + 0.5 * (1 - t.hp / t.maxHp);
    const breakable = t.kind !== 'hero' && t.kind !== 'ally' && !t.boss;
    const second = breakable ? (t.hp + (t.shield ? t.shield.value : 0)) * prio + 0.5 * threat(t) + 3 : threat(t) * 0.8;
    const bv = (0.5 * Math.floor(t.hp * HEARTBREAK_HP_LOSS) * prio + 0.5 * second) * (t.decoy ? 0.3 : 1);
    return (Math.min(eff, left) / Math.max(1, t.maxMrl)) * bv * 0.8 + (eff >= left ? bv : 0);
  }
  if (t.down) return eff * 0.05;
  const pool = t.hp + (t.shield ? t.shield.value : 0);
  const prio = 1 + 0.5 * (1 - t.hp / t.maxHp);
  let v = Math.min(eff, pool) * prio;
  if (eff >= pool) v += 0.5 * threat(t) + 3;
  if (t.decoy) v *= 0.3;
  return v;
}

/** Average extra damage of weapon.extra on t (v3.1). */
function extraAvg(b, w, t) {
  let v = 0;
  for (const ex of w.extra || []) if (ex && ex.dice && (!ex.only || tagOk(t, ex.only))) v += dmgValue(b, t, avgDice(ex.dice), ex.dmgType || w.dmgType);
  return v;
}

/** Scarce weapon shots (charges / ENR) cost a little value. */
function weaponShotCost(u) {
  const w = u.weapon;
  if (!w) return 0;
  return (w.charges != null ? 1.5 : 0) + (w.enr && u.maxEnr > 0 ? w.enr * 0.3 : 0);
}

/** Area weapon (v3.1): sum over targets of the save-gated damage. */
function areaWeaponEV(b, u, center) {
  const w = u.weapon;
  const dc = weaponDc(b, u);
  let v = 0;
  for (const t of abilityTargets(b, u, weaponAreaAbility(u), center)) {
    if (!isAlive(t)) continue;
    const base = avgDice(w.dice) + weaponDamageBonus(b, u, t);
    const pf = saveFailChance(b, t, w.area.save || 'dex', dc);
    v += dmgValue(b, t, base, w.dmgType) * (pf + (1 - pf) * 0.5) + extraAvg(b, w, t) * pf;
  }
  return v - weaponShotCost(u);
}

/** Thrown weapon: ranged attack, then fists until picked up (penalty unless it likely kills). */
const THROW_LOSS = 3;
function throwEV(b, u, t) {
  const w = u.weapon;
  const odds = attackOdds(b, u, t, weaponAttackBonus(b, u), false, true);
  const base = avgDice(w.dice) + weaponDamageBonus(b, u, t);
  const v = odds.chance * (dmgValue(b, t, base, w.dmgType) + extraAvg(b, w, t));
  const kills = base >= t.hp + (t.shield ? t.shield.value : 0);
  return v - (kills ? 0.5 : THROW_LOSS);
}

function weaponEV(b, u, t, op) {
  const w = u.weapon;
  if (!w) return 0;
  const melee = isMeleeWeapon(u);
  const odds = attackOdds(b, u, t, weaponAttackBonus(b, u) + ((op && op.hit) || 0), melee, true);
  let extraWD = 0;
  for (const s of u.statuses) extraWD += statusDef(b, s.id)?.mods?.extraWeaponDice || 0;
  const die = firstDie(w.dice);
  const base = avgDice(w.dice) + weaponDamageBonus(b, u, t) + (die ? extraWD * avgDice(die) : 0);
  let v = odds.chance * dmgValue(b, t, base, w.dmgType);
  if (w.dmgType !== 'proxy') v += odds.critChance * dmgValue(b, t, avgDice(w.dice), w.dmgType) * 0.8;
  if (op && op.extraDice) v += odds.chance * dmgValue(b, t, avgDice(op.extraDice), op.extraType || w.dmgType);
  if (w.extra) v += odds.chance * extraAvg(b, w, t);
  if (!op) v -= weaponShotCost(u);
  return { v, chance: odds.chance };
}

/** «Очередь»: shot i hits at need + recoil × i (same roll mode). */
function burstEV(b, u, t) {
  const w = u.weapon;
  if (!w || !((w.rof || 1) > 1) || w.area) return 0;
  const melee = isMeleeWeapon(u);
  const odds = attackOdds(b, u, t, weaponAttackBonus(b, u), melee, true);
  const one = weaponEV(b, u, t, null);
  if (one.chance <= 0) return 0;
  const perHit = (one.v + weaponShotCost(u)) / one.chance;
  let v = 0;
  for (let i = 0; i < w.rof; i++) v += chanceD20(odds.need + (w.recoil || 0) * i, odds.mode) * perHit;
  return v - weaponShotCost(u);
}

/** Scarcity: using an item costs a bit of value so AI keeps them for when they matter. */
const ITEM_USE_COST = 1.5;

function trapEV(b, u, it, tile) {
  let best = 0;
  for (const e of b.units) {
    if (!isStanding(e) || !isHostile(b, u, e) || !isMeleeUnit(e)) continue;
    const d = chebyshev(e.x, e.y, u.x, u.y);
    if (d > 6 || chebyshev(e.x, e.y, tile.x, tile.y) >= d) continue;
    let dmg = 0;
    for (const op of it.trap.effects || []) if (op.op === 'damage') dmg += dmgValue(b, e, avgDice(op.dice) + (op.bonus | 0), op.dmgType);
    else if (op.op === 'status') dmg += statusValue(b, u, e, op.id, op.turns);
    best = Math.max(best, dmg * 0.5);
  }
  return best;
}

function statusValue(b, u, t, id, turns) {
  const d = statusDef(b, id);
  if (!d || isStatusImmune(b, t, id)) return 0;
  const base = (STATUS_VALUE[id] ?? 3) * (0.5 + Math.min(turns || 1, 3) / 2) * (hasStatus(t, id) ? 0.2 : 1);
  const hostile = isHostile(b, u, t);
  const good = d.kind === 'buff';
  if (hostile) return good ? -base : base;
  return good ? base : -base * 0.5;
}

function healValue(t, amt, resource) {
  if (resource === 'hp') {
    if (t.down) return 20 + amt;
    const missing = t.maxHp - t.hp;
    if (missing <= 0) return 0;
    return Math.min(amt, missing) * (t.hp / t.maxHp < 0.5 ? 1.5 : 0.7);
  }
  if (resource === 'mrl') {
    const missing = t.maxMrl - t.mrl;
    return Math.min(amt, missing) * 0.6 + (t.nadlom ? 4 : 0);
  }
  return Math.min(amt, t.maxEnr - t.enr) * 0.2;
}

function enemiesNear(b, t, r) {
  let n = 0;
  for (const e of b.units) if (isStanding(e) && e.team !== t.team && !e.noAttack && chebyshev(e.x, e.y, t.x, t.y) <= r) n++;
  return n;
}

/** Expected value of an ability with a target spec. */
export function evalAbility(b, u, a, spec) {
  const effects = a.effects || [];
  const targets = abilityTargets(b, u, a, spec);
  const dc = getDc(b, u, a);
  const hasWeapon = effects.some((e) => e.op === 'weapon');
  let v = 0;
  for (const t of targets) {
    if (!isAlive(t) && !canRevive(a, t)) continue;
    const hostile = isHostile(b, u, t);
    let pass = 1, halfP = 0;
    if (hostile && a.roll === 'save' && a.save) {
      const pf = saveFailChance(b, t, a.save, dc);
      pass = pf;
      halfP = a.onSave === 'half' ? 1 - pf : 0;
    } else if (hostile && a.roll === 'attack' && !hasWeapon) {
      pass = attackOdds(b, u, t, spellAttackBonus(b, u, a), isMeleeAttack(b, u, { type: 'ability', ability: a.id }), false).chance;
    }
    let gate = 1;
    for (const op of effects) {
      if (op.self || op.op === 'summon' || op.op === 'extraAction' || op.op === 'move' || op.op === 'zone') continue;
      if (op.only && op.op !== 'heal' && !tagOk(t, op.only)) continue;
      if (op.ifSurface && !surfaceKindsAt(b, t.x, t.y).some((k) => [].concat(op.ifSurface).includes(k))) continue;
      if (op.op === 'status' && op.mrlBelow != null && !(t.maxMrl > 0 && t.mrl <= t.maxMrl * op.mrlBelow) && !op.elseId) continue;
      const p = pass * gate;
      switch (op.op) {
        case 'weapon': {
          if (!hostile) break;
          const r = weaponEV(b, u, t, op);
          v += r.v * pass;
          gate = r.chance;
          break;
        }
        case 'damage':
        case 'drain': {
          const amt = avgDice(op.dice) + bonusValue(b, u, op.bonus, a) + (a.roll === 'attack' && !hasWeapon ? spellDamageBonus(b, u, t) : 0);
          const val = dmgValue(b, t, amt, op.dmgType) * (p + halfP * 0.5);
          v += hostile ? val : -val * (t === u ? 0.6 : 1.2);
          if (hostile && HOT[op.dmgType]) v += comboEV(b, u, t.x, t.y, 0, op.dmgType) * (p + halfP);
          if (op.op === 'drain' && hostile) v += healValue(u, amt * (op.ratio ?? 0.5) * p, op.to || 'hp') * 0.8;
          break;
        }
        case 'heal':
          if (!hostile && tagOk(t, op.only) && !(t.soulless && (op.resource || 'hp') === 'hp')) {
            v += healValue(t, avgDice(op.dice || 0) + bonusValue(b, u, op.bonus, a) + (op.value || 0), op.resource || 'hp');
          }
          break;
        case 'shield':
          if (!hostile) {
            const amt = op.value != null ? op.value : avgDice(op.dice) + bonusValue(b, u, op.bonus, a);
            if (!t.shield || t.shield.value < amt) v += (amt - (t.shield ? t.shield.value : 0)) * (enemiesNear(b, t, 8) ? 0.7 : 0.15);
          }
          break;
        case 'status':
          v += statusValue(b, u, t, op.id, op.turns) * (hostile ? p : 1);
          break;
        case 'buff': {
          const w = (BUFF_WEIGHT[op.stat] ?? 0.4) * Math.abs(op.value || 0) * Math.min(op.turns || 1, 3);
          const good = (op.value || 0) > 0;
          v += (hostile ? (good ? -w : w * p) : (good ? w : -w * 0.5));
          break;
        }
        case 'cleanse':
          if (!hostile) v += t.statuses.filter((s) => statusDef(b, s.id)?.kind === 'debuff').length * 2.5;
          break;
        case 'push':
          if (hostile) v += (1 + pushIntoHarm(b, u, t, op.tiles || 1)) * p;
          break;
        case 'stabilize':
          if (!hostile && (t.down || (op.revive && t.dead)) && !t.soulless) v += t.dead ? 30 : 20;
          break;
        case 'mark':
          if (hostile && !hasStatus(t, op.id || 'marked')) v += (op.value ?? 2) * 2 * p;
          break;
        default:
      }
    }
  }
  for (const op of effects) {
    if (op.op === 'summon') {
      const def = b.data.summons[op.unit] || b.data.enemies[op.unit];
      v += def ? (def.noAttack ? 4 : 6 + (def.hp || 5) * 0.3) : 0;
    } else if (op.op === 'extraAction') {
      const pen = op.nextTurnPenalty ?? a.nextTurnPenalty;
      v += 6 - (pen ? 5 * (typeof pen === 'number' ? pen : (pen.actions || 0) + (pen.bonus || 0) * 0.4) : 0);
    }
    else if (op.self && op.op === 'buff') v += (BUFF_WEIGHT[op.stat] ?? 0.4) * (op.value || 0) * Math.min(op.turns || 1, 3);
    else if (op.self && op.op === 'shield') v += (op.value ?? avgDice(op.dice)) * 0.5;
  }
  const z = zoneOf(a);
  if (z) v += zoneValue(b, u, a, z, spec);
  const sf = surfaceOf(a);
  if (sf) v += surfaceEV(b, u, a, spec);
  if (sf && sf.kind === 'smoke') v += zoneValue(b, u, a, { size: sf.size, turns: sf.turns, kind: 'smoke' }, spec);
  if (!targets.length && !z && !sf && !effects.some((e) => e.op === 'summon' || e.op === 'extraAction')) return 0;
  const cost = a.cost || 0;
  v -= cost * 0.3;
  if (cost > u.enr) v -= 8; // overcast risk
  return v;
}

// ---------------------------------------------------------------- surfaces (spec §7)

const specCenter = (b, u, spec) => (spec && spec.unit && b.byId[spec.unit] ? b.byId[spec.unit] : spec && spec.x != null ? spec : u);

/** Harm of standing in a surface kind for e (data `ai`, 0 for its native / immune element). */
function kindHarm(b, e, kind) {
  const def = surfaceDefs(b)[kind];
  if (!def) return 0;
  if (kind === 'proxy' && e.tags.includes('proxy')) return 0;
  if (!def.enter?.dice && (def.enter?.statuses || []).every(([id]) => isStatusImmune(b, e, id))) return 0;
  return def.ai || 0;
}

/**
 * Value of surfaces an ability creates: Σ hostile units in the area × harm − own units × harm, plus fire / electric
 * combinations (blaze, gas explosion, electrified puddle).
 */
function surfaceEV(b, u, a, spec) {
  const c = specCenter(b, u, spec);
  const list = [];
  if (a.surface) list.push(a.surface);
  for (const op of a.effects || []) if (op.op === 'surface' && !op.per && !op.crit) list.push(op);
  let v = 0;
  for (const sp of list) {
    const size = sp.size ?? (a.area ? a.area.size || 1 : 0);
    const k = Math.min(sp.turns ?? 2, 3) / 2;
    for (const e of b.units) {
      if (!isStanding(e) || chebyshev(c.x, c.y, e.x, e.y) > size) continue;
      const h = kindHarm(b, e, sp.kind);
      v += (isHostile(b, u, e) ? h * 0.5 : -h * 0.8) * k;
    }
    if (HOT[sp.kind]) v += comboEV(b, u, c.x, c.y, size, sp.kind);
  }
  return v;
}

/** Fire / electricity reaching oil, toxgas or water near (x, y): +4 per hostile in the region, −6 per own unit. */
function comboEV(b, u, x, y, size, kind) {
  if (!b.surfaces || !b.surfaces.size) return 0;
  const tiles = new Set();
  for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
    const c = cellAt(b, x + dx, y + dy);
    if (!c) continue;
    const add = (layer, kinds) => { for (const p of connected(b, x + dx, y + dy, layer, kinds, 40)) tiles.add(`${p.x},${p.y}`); };
    if (c.gas && c.gas.kind === 'toxgas') add('gas', ['toxgas']);
    if (c.floor && c.floor.kind === 'oil') add('floor', ['oil']);
    if (kind === 'electric' && c.floor && (c.floor.kind === 'water' || c.floor.kind === 'blood') && !c.floor.charged) add('floor', [c.floor.kind]);
  }
  if (!tiles.size) return 0;
  let v = 0;
  for (const e of b.units) {
    if (!isStanding(e) || !tiles.has(`${e.x},${e.y}`)) continue;
    v += isHostile(b, u, e) ? 4 : e === u ? -8 : -6;
  }
  return v;
}

/** +3 when a push lands the target on a harmful surface. */
function pushIntoHarm(b, u, t, tiles) {
  if (!b.surfaces || !b.surfaces.size) return 0;
  const dx = Math.sign(t.x - u.x), dy = Math.sign(t.y - u.y);
  if (!dx && !dy) return 0;
  for (let i = 1; i <= tiles; i++) if (surfaceHarm(b, t, t.x + dx * i, t.y + dy * i) > 0) return 3;
  return 0;
}

/**
 * Smoke zone value: hostile ranged units inside (their shots get disadvantage) minus own ranged units that
 * would have to shoot into it.
 */
function zoneValue(b, u, a, z, spec) {
  const c = spec && spec.unit && b.byId[spec.unit] ? b.byId[spec.unit] : spec && spec.x != null ? spec : u;
  const zone = { x: c.x, y: c.y, size: z.size ?? (a.area ? a.area.size || 1 : 1) };
  const turns = Math.min(z.turns ?? 2, 3);
  if ((z.kind || 'smoke') !== 'smoke' && !z.rangedDis) return 0;
  let v = 0;
  for (const e of b.units) {
    if (!isStanding(e) || e.noAttack || isMeleeWeapon(e) || !inZone(zone, e.x, e.y)) continue;
    v += (isHostile(b, u, e) ? 1.5 : -1) * turns;
  }
  return v;
}

export function evalAction(b, u, act) {
  switch (act.type) {
    case 'attack': {
      if (u.weapon && u.weapon.area) {
        const t = act.target ? b.byId[act.target] : null;
        const c = t ? { x: t.x, y: t.y } : act.tile ? { x: act.tile.x, y: act.tile.y } : null;
        return c ? areaWeaponEV(b, u, c) : 0;
      }
      const t = b.byId[act.target];
      if (!t) return 0;
      const r = weaponEV(b, u, t, null);
      let v = r.v;
      if (u.weapon && HOT[u.weapon.dmgType]) v += comboEV(b, u, t.x, t.y, 0, u.weapon.dmgType) * (r.chance ?? 0.6);
      if (hasStatus(t, 'scent') && u.tags.includes('beast')) v *= 1.5;
      if (u.arch) v *= archTargetMul(b, u, t);
      return v;
    }
    case 'throw': {
      const t = b.byId[act.target];
      return t && u.weapon ? throwEV(b, u, t) : 0;
    }
    case 'ability': {
      const a = u.abilities.find((x) => x.id === act.ability);
      if (!a) return 0;
      let spec = act.target ? { unit: act.target } : act.tile ? { x: act.tile.x, y: act.tile.y } : {};
      const mv = (a.effects || []).find((e) => e.op === 'move');
      if (mv && a.target === 'self') return 0; // pure repositioning: handled by movement planning
      const v = evalAbility(b, u, a, spec);
      return u.arch ? v * archAbilityMul(b, u, a, act.target ? b.byId[act.target] : null) : v;
    }
    case 'burst': {
      const t = b.byId[act.target];
      return t ? burstEV(b, u, t) : 0;
    }
    case 'useItem': {
      const it = b.data.items[act.item];
      if (!it) return 0;
      if (it.trap) return act.tile ? trapEV(b, u, it, act.tile) - ITEM_USE_COST : 0;
      const spec = act.target ? { unit: act.target } : act.tile ? { x: act.tile.x, y: act.tile.y } : {};
      return evalAbility(b, u, itemAbility(it), spec) - ITEM_USE_COST;
    }
    case 'smash':
      return smashEV(b, u, act.tile);
    case 'endStatus': {
      const s = u.statuses.find((x) => x.id === act.status);
      if (!s) return 0;
      const base = act.status === 'burn' ? 3.5 : (STATUS_VALUE[act.status] ?? 3) * 0.4;
      return base * Math.min(s.turns || 1, 3);
    }
    default:
      return 0;
  }
}

/** Shooting a barrel / generator next to enemies (combat rework §3.2): +4 per enemy, −6 per ally in radius 1. */
function smashEV(b, u, tile) {
  const o = tile && objectAt(b, tile.x, tile.y);
  if (!o || (o.kind !== 'barrel' && o.kind !== 'generator') || o.hp > avgDice(u.weapon.dice) * 1.6 + 2) return 0;
  let v = 0;
  for (const e of b.units) {
    if (!isStanding(e) || chebyshev(e.x, e.y, o.x, o.y) > 1) continue;
    v += isHostile(b, u, e) ? 4 : e.team === u.team ? -6 : 0;
  }
  return v * 0.65;
}

// ---------------------------------------------------------------- movement planning

/** Offensive / support options independent of position: [{ range, noLos, ranged, action:boolean, list:[{t, v}] }]. */
function buildOptions(b, u) {
  const t = b.turn;
  const opts = [];
  const taunt = tauntSource(b, u);
  if (t.actions > 0 && canUseWeapon(b, u)) {
    const list = [];
    for (const e of b.units) {
      if (!isAlive(e) || !isHostile(b, u, e) || e.down) continue;
      if (taunt && taunt !== e) continue;
      let v = u.weapon.area ? areaWeaponEV(b, u, { x: e.x, y: e.y }) : Math.max(weaponEV(b, u, e, null).v, burstEV(b, u, e));
      if (u.arch) v *= archTargetMul(b, u, e);
      if (v > 0) list.push({ t: e, v });
    }
    const arc = !!u.weapon.arc;
    if (list.length) opts.push({ range: weaponRange(u), noLos: arc, arc, ranged: !isMeleeWeapon(u), action: true, list: list.sort((x, y) => y.v - x.v) });
    if (u.weapon.thrown) {
      const tl = [];
      for (const e of b.units) {
        if (!isAlive(e) || !isHostile(b, u, e) || e.down || (taunt && taunt !== e)) continue;
        const v = throwEV(b, u, e);
        if (v > 0) tl.push({ t: e, v });
      }
      if (tl.length) opts.push({ range: u.weapon.thrown, minRange: 2, noLos: false, ranged: true, action: true, list: tl.sort((x, y) => y.v - x.v) });
    }
  }
  for (const a of u.abilities) {
    if (a.action === 'reaction' || a.target === 'self') continue;
    const slot = a.action === 'bonus' ? t.bonus > 0 : t.actions > 0;
    if (!slot) continue;
    const why = abilityUsable(b, u, a, false);
    if (why) continue;
    const range = abilityRange(u, a);
    if (range === 0) {
      // self-centred area (beast-roar, cringe-field): worth it from tiles within area.size of the targets
      if (!a.area || a.area.shape !== 'radius' || a.target === 'ally' || a.target === 'any') continue;
      const single = { ...a, area: null, target: 'enemy', range: a.area.size || 1 };
      const list = [];
      for (const e of b.units) {
        if (!isAlive(e) || !isHostile(b, u, e) || e.down) continue;
        const v = evalAbility(b, u, single, { unit: e.id });
        if (v > 0.5) list.push({ t: e, v });
      }
      if (list.length) opts.push({ range: a.area.size || 1, noLos: false, ranged: false, action: a.action !== 'bonus', list: list.sort((x, y) => y.v - x.v) });
      continue;
    }
    const mv = (a.effects || []).find((e) => e.op === 'move');
    const list = [];
    for (const e of b.units) {
      if (!isAlive(e)) continue;
      if (a.target === 'enemy' && (!isHostile(b, u, e) || e.down || (taunt && taunt !== e))) continue;
      if (a.target === 'ally' && e.team !== u.team) continue;
      if (a.target === 'tile' && (!isHostile(b, u, e) || e.down)) continue;
      const spec = a.target === 'tile' ? { x: e.x, y: e.y } : { unit: e.id };
      const v = evalAbility(b, u, a, spec);
      if (v > 0.5) list.push({ t: e, v });
    }
    if (!list.length) continue;
    const hasW = (a.effects || []).some((e) => e.op === 'weapon');
    const reach = mv ? Math.max(range, mv.tiles + (hasW ? weaponRange(u) : 1)) : hasW ? Math.min(Math.max(range, 1), weaponRange(u)) : range;
    opts.push({ range: reach, noLos: !!mv, ranged: reach > 1 && a.roll === 'attack', action: a.action !== 'bonus', list: list.sort((x, y) => y.v - x.v) });
  }
  return opts;
}

function preferredRange(b, u) {
  let r = u.weapon && !u.noAttack ? weaponRange(u) : 1;
  for (const a of u.abilities) if (a.target === 'enemy' || a.target === 'tile') r = Math.max(r, abilityRange(u, a));
  return Math.max(3, Math.min(6, r - 1));
}

function oaRisk(b, u, x, y) {
  if (b.turn.disengaged) return 0;
  if (chebyshev(x, y, u.x, u.y) === 0) return 0;
  let risk = 0;
  for (const e of b.units) {
    if (!isStanding(e) || e.team === u.team || e.reactionUsed || !isMeleeUnit(e)) continue;
    if (chebyshev(e.x, e.y, u.x, u.y) === 1 && chebyshev(e.x, e.y, x, y) > 1) risk += weaponEV(b, e, u, null).v;
  }
  return risk;
}

/** Best tile to stand on now. Returns { x, y, score, pot, current }. opts.ignoreOA — assume «Отход». */
export function planTile(b, u, opts) {
  const ignoreOA = !!(opts && opts.ignoreOA);
  const canAct = b.turn.actions > 0;
  const g = b.grid;
  const enemies = b.units.filter((e) => isStanding(e) && isHostile(b, u, e));
  const reach = getReachable(b, u.id);
  const options = buildOptions(b, u);
  const df = enemies.length ? distanceField(g, enemies) : null;
  const melee = u.ai === 'melee';
  const harmMul = u.arch ? archHarmMul(b, u) : null;
  const pref = preferredRange(b, u);
  let best = null;
  let current = null;
  // v1.2: ranged attack rolls with an enemy adjacent have disadvantage (~0.55 of the EV); option EVs were
  // computed from the current tile, so rescale relative to it
  const adjNow = enemyAdjacent(b, u);
  const drop = b.drops.length ? ownDrop(b, u) : null;
  for (const idx of reach.list) {
    const x = idx % g.w, y = (idx / g.w) | 0;
    if (reach.dist[idx] > 0 && !approachOk(b, u, x, y)) continue;
    const adjHere = reach.dist[idx] === 0 ? adjNow : enemyAdjacent(b, u, x, y);
    const rangedMul = adjHere === adjNow ? 1 : adjHere ? 0.55 : 1 / 0.55;
    let potA = 0, potB = 0;
    for (const o of options) {
      for (const it of o.list) {
        const d = chebyshev(x, y, it.t.x, it.t.y);
        if (d > o.range || (d === 0) || (o.minRange && d < o.minRange)) continue;
        if (!o.noLos && d > 1 && !lineOfSight(g, x, y, it.t.x, it.t.y)) continue;
        let v = it.v;
        if (o.ranged && !o.arc && d > 1 && hasCover(g, x, y, it.t.x, it.t.y)) v *= 0.8;
        if (o.ranged) v *= rangedMul;
        if (o.action) { if (v > potA) potA = v; } else if (v > potB) potB = v;
        break;
      }
    }
    const pot = potA + potB;
    let s = pot;
    const wd = df ? df[idx] : 0;
    if (pot === 0 && df && wd >= 0) {
      // melee closes in; ranged approaches to its preferred range only while it can still act, else holds back
      if (melee) s -= wd;
      else s -= canAct ? Math.abs(wd - pref) * 0.7 : Math.max(0, pref - wd) * 0.7;
    }
    if (!melee) {
      let adj = 0, near = 0, cover = false;
      for (const e of enemies) {
        const d = chebyshev(x, y, e.x, e.y);
        if (d <= 1 && isMeleeUnit(e)) adj++;
        else if (d <= 2) near++;
        if (!cover && !isMeleeWeapon(e) && hasCover(g, e.x, e.y, x, y)) cover = true;
      }
      s -= adj * 4 + near;
      if (cover) s += 1.5;
    }
    if (b.surfaces && b.surfaces.size) {
      const h = surfaceHarm(b, u, x, y);
      if (h) s -= h > 0 && harmMul != null ? h * harmMul : h > 0 && melee ? h * 0.5 : h;
    } else if (tileAt(g, x, y) === T_HAZARD) s -= 6;
    if (u.arch) s += archTileScore(b, u, x, y, enemies);
    if (drop && x === drop.x && y === drop.y) s += 8; // v3.1: pick the thrown weapon back up
    if (!ignoreOA) s -= oaRisk(b, u, x, y);
    s -= reach.dist[idx] * 0.05;
    const cand = { x, y, score: s, pot };
    if (reach.dist[idx] === 0) current = cand;
    if (!best || s > best.score) best = cand;
  }
  if (best) best.current = current;
  return best;
}

// ---------------------------------------------------------------- decision

function chaotic(b, u) {
  const legal = getLegalActions(b, u.id, { noMoves: true }).filter((a) => a.type === 'attack' || (a.type === 'ability' && a.target));
  if (legal.length && b.turn.actions > 0) return b.rng.pick(legal);
  return { type: 'endTurn', unit: u.id };
}

function adjacentThreats(b, u) {
  let n = 0;
  for (const e of b.units) if (isStanding(e) && isHostile(b, u, e) && isMeleeUnit(e) && chebyshev(e.x, e.y, u.x, u.y) === 1) n++;
  return n;
}

/** Choose the next action for the current unit (one step). Returns an action object. */
export function chooseAction(b, unitId) {
  const t = b.turn;
  const u = b.byId[unitId];
  const end = { type: 'endTurn', unit: unitId };
  if (!t || t.unitId !== unitId || !u || !isStanding(u)) return end;
  if (t.lostControl) return chaotic(b, u);
  if (u.decoy || (u.noAttack && !u.abilities.length)) return end;
  const flee = u.arch === 'coward' ? fleeAction(b, u) : null;
  if (flee) return flee;

  const legal = getLegalActions(b, unitId, { noMoves: true });
  let best = null, bestBonus = null;
  for (const act of legal) {
    if (act.type !== 'attack' && act.type !== 'ability' && act.type !== 'endStatus' && act.type !== 'burst' && act.type !== 'useItem' && act.type !== 'throw' && act.type !== 'smash') continue;
    const v = evalAction(b, u, act);
    const isBonus = (act.type === 'ability' && u.abilities.find((x) => x.id === act.ability)?.action === 'bonus')
      || (act.type === 'useItem' && b.data.items[act.item]?.action === 'bonus');
    if (isBonus) { if (!bestBonus || v > bestBonus.v) bestBonus = { act, v }; }
    else if (!best || v > best.v) best = { act, v };
  }

  // kiting: ranged profiles step away from melee threats before acting
  if (u.ai !== 'melee' && t.move > 0 && t.aiMoves === 0 && adjacentThreats(b, u) > 0) {
    const canDisengage = t.bonus > 0 && !t.disengaged;
    const tile = planTile(b, u, { ignoreOA: canDisengage });
    if (tile && tile.current && (tile.x !== u.x || tile.y !== u.y) && tile.score > tile.current.score + 1) {
      const risk = t.disengaged ? 0 : oaRisk(b, u, tile.x, tile.y);
      if (canDisengage && risk > (bestBonus ? bestBonus.v : 0) * 0.8) return { type: 'disengage', unit: unitId };
      if (tile.score - risk <= tile.current.score + 1) return top0(best, bestBonus, end);
      t.aiMoves++;
      return { type: 'move', unit: unitId, to: { x: tile.x, y: tile.y } };
    }
  }

  // act if something worthwhile is in reach; compare with what moving first could give
  const top = best && bestBonus ? (best.v >= bestBonus.v ? best : bestBonus) : best || bestBonus;
  if (top && top.v > 0.5) {
    if (t.move > 0 && t.aiMoves < 2) {
      const tile = planTile(b, u);
      if (tile && tile.current && (tile.x !== u.x || tile.y !== u.y) && tile.pot > top.v * 1.5 + 1 && tile.score > tile.current.score + 1) {
        t.aiMoves++;
        return { type: 'move', unit: unitId, to: { x: tile.x, y: tile.y } };
      }
    }
    return top.act;
  }

  if (t.move > 0 && t.aiMoves < (t.aiDashed ? 3 : 2)) {
    const tile = planTile(b, u);
    if (tile && tile.current && (tile.x !== u.x || tile.y !== u.y) && tile.score > tile.current.score + 0.05) {
      // nothing to do here and nothing reachable: dash first to get further
      if (tile.pot === 0 && t.actions > 0 && !t.acted && !t.aiDashed && getSpeed(b, u) > 0 && hasHostiles(b, u)) {
        t.aiDashed = true;
        return { type: 'dash', unit: unitId };
      }
      t.aiMoves++;
      return { type: 'move', unit: unitId, to: { x: tile.x, y: tile.y } };
    }
  }
  return end;
}

function top0(best, bestBonus, end) {
  const top = best && bestBonus ? (best.v >= bestBonus.v ? best : bestBonus) : best || bestBonus;
  return top && top.v > 0.5 ? top.act : end;
}

function hasHostiles(b, u) {
  for (const e of b.units) if (isStanding(e) && isHostile(b, u, e)) return true;
  return false;
}

/** Play the whole turn of the current unit with AI, then end the turn. */
export function playTurn(b, maxSteps = 16) {
  if (!b.turn || b.winner) return;
  const id = b.turn.unitId;
  for (let i = 0; i < maxSteps; i++) {
    if (b.winner || !b.turn || b.turn.unitId !== id) return;
    const act = chooseAction(b, id);
    if (!act || act.type === 'endTurn') break;
    const res = perform(b, act);
    if (!res.ok) break;
  }
  if (!b.winner && b.turn && b.turn.unitId === id) endTurn(b);
}

export { targetValid };
