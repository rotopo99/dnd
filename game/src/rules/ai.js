// Universal AI: drives any unit (enemies, summons, NPC allies, lost control, balance sims).
// Picks the best legal action by expected value, plans movement on the grid.
// Profiles (unit.ai): 'melee' closes in; 'ranged' / 'caster' / 'support' keep distance and like cover.

import { avgDice, firstDie, chanceD20 } from './dice.js';
import { chebyshev, lineOfSight, hasCover, distanceField, tileAt, tileCover, T_HAZARD, elevAt, inCoverSpot, isPassable, inBounds } from './grid.js';
import {
  getLegalActions, perform, endTurn, getReachable, abilityTargets, abilityRange, isHostile, isStanding, isAlive, canRevive,
  attackOdds, saveFailChance, damageMultiplier, weaponDamageBonus, spellDamageBonus, weaponAttackBonus,
  spellAttackBonus, getDc, bonusValue, tagOk, weaponRange, isMeleeUnit, statusDef, hasStatus, isStatusImmune,
  abilityUsable, targetValid, canUseWeapon, approachOk, getSpeed, tauntSource, enemyAdjacent, isMeleeAttack, HEARTBREAK_HP_LOSS, itemAbility,
  isMeleeWeapon, weaponDc, weaponAreaAbility, zoneOf, inZone, ownDrop, isLeapArea, unitAt, areaHitsCell,
} from './combat.js';
import { surfaceHarm, surfaceOf, surfaceDefs, surfaceKindsAt, cellAt, connected, surfaceEntries, harmParts } from './surfaces.js';
import { archTargetMul, archAbilityMul, archTileScore, archHarmMul, fleeAction } from './archetypes.js';
import { objectAt, bridgeAt } from './terrain.js';
import { CELL_M, cm, posM, unitRadius, navField, navFree, navPath, budgetM } from './metric.js';
import { geoOn, exactOn, ptOf, gapM, distU, losPts, coverM, areaRadiusM, nearCover, areaPolyM, itemsNear, coneLenM } from './metric-geo.js';
import { nearestOnPoly, partHas } from './geometry.js';
import { METRIC, GEO, AI_METRIC as AM } from '../data/combat.js';

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
  if (isLeapArea(a) && spec && spec.x != null) v -= landingHarm(b, u, spec.x, spec.y);
  if (exactOn(b) && a.area && b.bridges && b.bridges.length) { // stage 4: an area that brings a bridge down under foes
    let dmg = 0;
    for (const op of effects) if (op.op === 'damage' && op.dice) dmg += avgDice(op.dice);
    if (dmg > 0) for (const br of b.bridges) if (!br.down && br.cells.some((i) => areaHitsCell(b, u, a, spec, i % b.grid.w, (i / b.grid.w) | 0))) v += bridgeEV(b, u, br, dmg);
  }
  const cost = a.cost || 0;
  v -= cost * 0.3;
  if (cost > u.enr) v -= 8; // overcast risk
  return v;
}

// ---------------------------------------------------------------- surfaces (spec §7)

/** melee-aoe: cost of landing on (x, y) after a leap — surface harm (berserk scaled), legacy hazard tile 6. */
function landingHarm(b, u, x, y) {
  if (!(b.surfaces && b.surfaces.size)) return tileAt(b.grid, x, y) === T_HAZARD ? 6 : 0;
  const h = surfaceHarm(b, u, x, y);
  if (h <= 0) return h;
  const mul = u.arch ? archHarmMul(b, u) : null;
  return mul != null ? h * mul : h;
}

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
    const inSpill = exactOn(b) ? spillTest(b, u, a, sp, spec, size) : null;
    for (const e of b.units) {
      if (!isStanding(e) || (inSpill ? !inSpill(e) : chebyshev(c.x, c.y, e.x, e.y) > size)) continue;
      const h = kindHarm(b, e, sp.kind);
      v += (isHostile(b, u, e) ? h * 0.5 : -h * 0.8) * k;
    }
    if (HOT[sp.kind]) v += comboEV(b, u, c.x, c.y, size, sp.kind);
  }
  return v;
}

/** Aim point of a spec in metres (exact point / unit / cell centre / the caster). */
function specPt(b, u, spec) {
  if (spec && spec.px != null) return { px: spec.px, py: spec.py, r: 0 };
  if (spec && spec.unit && b.byId[spec.unit]) return ptOf(b.byId[spec.unit]);
  if (spec && spec.x != null) return ptOf({ x: spec.x, y: spec.y });
  return ptOf(u);
}
/**
 * Metric stage 4: who stands in the surface a spill makes (combat.js placeSurfaceOp): a cone / line — its exact
 * polygon from the caster, else a circle (size N — the area circle, 0 — a pool) round the aim point. → (unit) => bool.
 */
function spillTest(b, u, a, sp, spec, size) {
  const C = specPt(b, u, spec);
  if (sp.size == null && a.area && (a.area.shape === 'cone' || a.area.shape === 'line') && !(spec && spec.unit && a.target !== 'tile')) {
    const pts = areaPolyM(b, a.area.shape, a.area.size || 1, ptOf(u), C);
    if (!pts) return () => false;
    const part = { pts };
    return (e) => { const E = ptOf(e); return partHas(part, E.px, E.py); };
  }
  const r = size > 0 ? areaRadiusM(size) : GEO.pool;
  return (e) => { const E = ptOf(e); return Math.hypot(E.px - C.px, E.py - C.py) <= r + 1e-6; };
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

/** +3 when a push lands the target on a harmful surface (stage 4: also + a drop off a bridge / ledge). */
function pushIntoHarm(b, u, t, tiles) {
  if (exactOn(b)) return pushValueM(b, u, t, tiles);
  if (!b.surfaces || !b.surfaces.size) return 0;
  const dx = Math.sign(t.x - u.x), dy = Math.sign(t.y - u.y);
  if (!dx && !dy) return 0;
  for (let i = 1; i <= tiles; i++) if (surfaceHarm(b, t, t.x + dx * i, t.y + dy * i) > 0) return 3;
  return 0;
}

/**
 * Metric stage 4: the push walked like combat.js pushUnit (cell steps away from u): a drop of N levels (off a bridge
 * deck / a ledge) +pushFall x N, the landing cell harmful (its real form round the cell centre) +3, a slam +1.
 */
function pushValueM(b, u, t, tiles) {
  const dx = Math.sign(t.x - u.x), dy = Math.sign(t.y - u.y);
  if (!dx && !dy) return 0;
  const g = b.grid;
  let x = t.x, y = t.y, fall = 0, v = 0;
  for (let i = 0; i < tiles; i++) {
    const nx = x + dx, ny = y + dy;
    const up = g.elev ? elevAt(g, nx, ny) - elevAt(g, x, y) : 0;
    if (!inBounds(g, nx, ny) || !isPassable(g, nx, ny) || unitAt(b, nx, ny) || up > 0) { v += 1; break; }
    if (up < 0) fall -= up;
    x = nx; y = ny;
    if (b.surfaces && b.surfaces.size && surfaceHarm(b, t, x, y) >= 5) break;
  }
  if (fall > 0 && !t.tags.includes('fly') && !t.tags.includes('flying')) v += AM.pushFall * fall;
  if (b.surfaces && b.surfaces.size && (x !== t.x || y !== t.y) && surfaceHarm(b, t, x, y, ptOf({ x, y })) > 0) v += 3;
  return v;
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

/**
 * skirmishes.md: with three sides the non-party teams prefer each other a bit (+RIVAL_BONUS to a positive score),
 * so A and B start fighting at once instead of both waiting for the party.
 */
const RIVAL_BONUS = 2;
export function evalAction(b, u, act) {
  const v = evalAction0(b, u, act);
  if (v > 0 && act.target && u.team !== 'heroes') {
    const t = b.byId[act.target];
    if (t && t.team !== 'heroes' && t.team !== u.team && isHostile(b, u, t)) return v + RIVAL_BONUS;
  }
  return v;
}

function evalAction0(b, u, act) {
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
      let spec = act.target ? { unit: act.target } : act.tile ? { x: act.tile.x, y: act.tile.y, ...(act.tile.px != null ? { px: act.tile.px, py: act.tile.py } : {}) } : {};
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
  const br = tile && exactOn(b) && !objectAt(b, tile.x, tile.y) ? bridgeAt(b, tile.x, tile.y) : null;
  if (br) return bridgeEV(b, u, br, avgDice(u.weapon.dice) * 1.6 + 2);
  const o = tile && objectAt(b, tile.x, tile.y);
  if (!o || (o.kind !== 'barrel' && o.kind !== 'generator') || o.hp > avgDice(u.weapon.dice) * 1.6 + 2) return 0;
  let v = 0;
  for (const e of b.units) {
    if (!isStanding(e) || chebyshev(e.x, e.y, o.x, o.y) > 1) continue;
    v += isHostile(b, u, e) ? 4 : e.team === u.team ? -6 : 0;
  }
  return v * 0.65;
}

/**
 * Metric stage 4: value of bringing bridge br down with `dmg` damage (only if it breaks): +bridgeFoe per foe on the
 * deck, bridgeAlly per own unit (the caster included); 0 when nobody hostile stands on it.
 */
function bridgeEV(b, u, br, dmg) {
  if (!br || br.down || br.hp > dmg) return 0;
  let foes = 0, own = 0;
  for (const i of br.cells) {
    const e = unitAt(b, i % b.grid.w, (i / b.grid.w) | 0);
    if (!e || !isStanding(e) || e.tags.includes('fly') || e.tags.includes('flying')) continue;
    if (isHostile(b, u, e)) foes++; else if (e.team === u.team) own++;
  }
  return foes ? foes * AM.bridgeFoe + own * AM.bridgeAlly : 0;
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
      if (list.length) opts.push({ range: a.area.size || 1, selfArea: true, noLos: false, ranged: false, action: a.action !== 'bonus', list: list.sort((x, y) => y.v - x.v) });
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

function oaRisk(b, u, x, y, P) {
  if (b.turn.disengaged) return 0;
  if (P) { // metric: leaving a foe's zone of control (zoc m edge to edge)
    const H = ptOf(u);
    if (Math.hypot(P.px - H.px, P.py - H.py) < 0.05) return 0;
    let risk = 0;
    for (const e of b.units) {
      if (!isStanding(e) || e.team === u.team || e.reactionUsed || !isMeleeUnit(e)) continue;
      const E = ptOf(e);
      if (gapM(H, E) <= METRIC.zoc + 1e-6 && gapM(P, E) > METRIC.zoc + 1e-6) risk += weaponEV(b, e, u, null).v;
    }
    return risk;
  }
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
  if (geoOn(b)) return planPointM(b, u, opts);
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
      else s -= canAct || b.turn.aiDashed ? Math.abs(wd - pref) * 0.7 : Math.max(0, pref - wd) * 0.7;
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

/**
 * Metric stage 2: the best point to stand on (metres). Candidates — reachable cell centres, points coverGap m off the
 * edges of cover cells, rings round the targets at melee reach / weapon range / preferred range; reach by the nav
 * cost field (navField), the winner is checked with navPath. Scores — the planTile weights with metric distances,
 * rays for LOS and cover. Returns { x, y, px, py, score, pot, current }.
 */
function planPointM(b, u, opts) {
  const ignoreOA = !!(opts && opts.ignoreOA);
  const canAct = b.turn.actions > 0;
  const g = b.grid;
  const enemies = b.units.filter((e) => isStanding(e) && isHostile(b, u, e));
  const options = buildOptions(b, u);
  const df = enemies.length ? distanceField(g, enemies) : null;
  const melee = u.ai === 'melee';
  const harmMul = u.arch ? archHarmMul(b, u) : null;
  const pref = preferredRange(b, u);
  const drop = b.drops.length ? ownDrop(b, u) : null;
  const budget = budgetM(b), ur = unitRadius(u), here = posM(u);
  const fk = `${u.id}|${here.px},${here.py}|${budget}|${b.occVersion}|${b.gridVersion || 0}`;
  if (!b.aiField || b.aiField.key !== fk) b.aiField = { key: fk, field: navField(b, u, budget) };
  const field = b.aiField.field, free = navFree(b, u);
  const W = g.w * CELL_M, H = g.h * CELL_M;
  const cands = [{ px: here.px, py: here.py, x: u.x, y: u.y, cost: 0, cur: true }];
  const seen = new Set([`${Math.round(here.px * 4)},${Math.round(here.py * 4)}`]);
  const add = (px, py) => {
    px = cm(px); py = cm(py);
    if (!(px > 0 && py > 0 && px < W && py < H)) return;
    const key = `${Math.round(px * 4)},${Math.round(py * 4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const c = field.at(px, py);
    if (!(c <= budget - 0.35) || !free(px, py)) return;
    const x = Math.floor(px / CELL_M), y = Math.floor(py / CELL_M), holder = b.occ[y * g.w + x];
    if (holder && b.units[holder - 1] !== u) return;
    if (!approachOk(b, u, x, y)) return;
    cands.push({ px, py, x, y, cost: c });
  };
  const span = Math.ceil(budget / CELL_M) + 1;
  const bx0 = Math.max(0, u.x - span), bx1 = Math.min(g.w - 1, u.x + span), by0 = Math.max(0, u.y - span), by1 = Math.min(g.h - 1, u.y + span);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) add((x + 0.5) * CELL_M, (y + 0.5) * CELL_M);
  const exact = exactOn(b);
  const EP = enemies.map((e) => ({ e, E: ptOf(e) }));
  if (exact) coverCands(b, here, budget, EP, add);
  // points at the cover edges (both sides, corners)
  const off = CELL_M / 2 + METRIC.coverGap, offD = CELL_M / 2 + METRIC.coverGap * 0.7;
  if (!exact) for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    if (tileCoverAt(g, x, y) < 2) continue;
    const cx = (x + 0.5) * CELL_M, cy = (y + 0.5) * CELL_M;
    add(cx + off, cy); add(cx - off, cy); add(cx, cy + off); add(cx, cy - off);
    add(cx + offD, cy + offD); add(cx - offD, cy + offD); add(cx + offD, cy - offD); add(cx - offD, cy - offD);
  }
  // rings round the targets: melee reach, just inside each option's range, the preferred range
  const nd = METRIC.ringDirs, reachM = budget + ur;
  const ring = (T, rad) => {
    if (rad <= 0) return;
    const d0 = Math.hypot(T.px - here.px, T.py - here.py);
    if (d0 - rad > reachM + 0.5 || rad - d0 > reachM + 0.5) return;
    const a0 = Math.atan2(here.py - T.py, here.px - T.px); // first direction — toward the unit
    for (let k = 0; k < nd; k++) { const a = a0 + (2 * Math.PI * k) / nd; add(T.px + Math.cos(a) * rad, T.py + Math.sin(a) * rad); }
  };
  const ringed = new Set();
  for (const o of options) for (const it of o.list.slice(0, 3)) {
    const T = ptOf(it.t);
    const rad = o.selfArea ? areaRadiusM(o.range) + ur + T.r - 0.2 : ur + T.r + Math.max(0.2, o.range * CELL_M - 0.25);
    const key = `${it.t.id}:${Math.round(rad * 10)}`;
    if (ringed.has(key)) continue;
    ringed.add(key);
    ring(T, rad);
    if (!o.selfArea && o.range > 1 && !ringed.has(`${it.t.id}:m`)) { ringed.add(`${it.t.id}:m`); ring(T, ur + T.r + 0.2); }
  }
  if (!melee) for (const e of enemies.slice(0, 4)) { const E = ptOf(e); ring(E, ur + E.r + pref * CELL_M); }

  const P = { px: 0, py: 0, r: ur };
  const nearAdj = (Q) => enemies.some((e) => gapM(Q, ptOf(e)) <= CELL_M + 1e-6);
  const adjNow = nearAdj({ px: here.px, py: here.py, r: ur });
  const low = exact && u.maxHp > 0 && u.hp / u.maxHp < AM.retreatHp && !u.boss && u.arch !== 'berserk';
  const hitNow = new Map(); // stage 4: hit modifiers (height, flank) of the current spot per target
  for (const c of cands) {
    P.px = c.px; P.py = c.py;
    const adjHere = c.cur ? adjNow : nearAdj(P);
    const rangedMul = adjHere === adjNow ? 1 : adjHere ? 0.55 : 1 / 0.55;
    let potA = 0, potB = 0;
    for (const o of options) {
      for (const it of o.list) {
        const T = ptOf(it.t);
        let cv = 1;
        if (o.selfArea) {
          if (Math.hypot(T.px - P.px, T.py - P.py) > areaRadiusM(o.range) + ur + T.r + 1e-6) continue;
        } else {
          const d = gapM(P, T) / CELL_M;
          if (d > o.range + 1e-6 || (o.minRange && d <= o.minRange - 1)) continue;
          if (!o.noLos && d > 1 && !losPts(b, P, T)) continue;
          if (o.ranged && !o.arc && d > 1 && coverM(b, P, T, false) >= 2) cv = 0.8;
          if (exact && !o.selfArea) { // height / flank of this point against the target, relative to where u stands
            const melee0 = !o.ranged;
            const k = `${it.t.id}|${melee0 ? 1 : 0}`;
            if (!hitNow.has(k)) hitNow.set(k, hitAtM(b, ptOf(u), u.x, u.y, it.t, melee0));
            cv *= Math.max(0.5, 1 + AM.hitStep * (hitAtM(b, P, c.x, c.y, it.t, melee0) - hitNow.get(k)));
          }
        }
        let v = it.v * cv;
        if (o.ranged) v *= rangedMul;
        if (o.action) { if (v > potA) potA = v; } else if (v > potB) potB = v;
        break;
      }
    }
    const pot = potA + potB;
    let s = pot;
    const idx = c.y * g.w + c.x, wd = df ? df[idx] : 0;
    let near = Infinity;
    for (const { E } of EP) near = Math.min(near, gapM(P, E) / CELL_M);
    if (pot === 0 && df && wd >= 0) {
      if (melee) s -= wd + near * 0.1;
      // a unit that dashed to close in still has to close in (else it dashes in place forever: slavotech AI, battle 1)
      else s -= canAct || b.turn.aiDashed ? Math.abs(near - pref) * 0.7 : Math.max(0, pref - near) * 0.7;
    }
    if (exact && (!melee || low)) {
      // stage 4: cover against each ranged threat that reaches this point (side of the threat), exposure costs
      let adj = 0, nearN = 0, cov = 0;
      for (const { e, E } of EP) {
        const d = gapM(P, E) / CELL_M;
        if (d <= 1 && isMeleeUnit(e)) adj++;
        else if (d <= 2) nearN++;
        if (e.noAttack || isMeleeWeapon(e) || d > weaponRange(e) + 2) continue;
        const cl = coverM(b, E, P, false);
        cov += cl >= 3 ? AM.coverFull : cl >= 2 ? AM.coverHalf : -AM.exposed;
      }
      if (!melee) s -= adj * 4 + nearN;
      s += cov * (low ? AM.retreatCover : 1);
      if (low) s += Math.min(near, AM.retreatFar) * AM.retreatDist;
    } else if (!melee) {
      let adj = 0, nearN = 0, cover = false;
      for (const { e, E } of EP) {
        const d = gapM(P, E) / CELL_M;
        if (d <= 1 && isMeleeUnit(e)) adj++;
        else if (d <= 2) nearN++;
        if (!cover && !isMeleeWeapon(e) && coverM(b, E, P, false) >= 2) cover = true;
      }
      s -= adj * 4 + nearN;
      if (cover) s += 1.5;
    }
    if (b.surfaces && b.surfaces.size) {
      const h = surfaceHarm(b, u, c.x, c.y, exact ? P : null);
      if (h) s -= h > 0 && harmMul != null ? h * harmMul : h > 0 && melee ? h * 0.5 : h;
    } else if (tileAt(g, c.x, c.y) === T_HAZARD) s -= 6;
    if (u.arch) s += archTileScore(b, u, c.x, c.y, enemies, P);
    if (drop && c.x === drop.x && c.y === drop.y) s += 8;
    if (!ignoreOA) s -= oaRisk(b, u, c.x, c.y, P);
    s -= (c.cost / CELL_M) * 0.05;
    c.score = s; c.pot = pot;
  }
  const current = cands[0];
  const order = cands.slice(1).sort((p, q) => q.score - p.score);
  let best = current, avoid = false;
  if (exact) {
    // stage 4: walk round harmful surfaces by their real form; what the walk still crosses costs pathHarm x harm
    const parts = b.surfaces && b.surfaces.size ? harmParts(b, u, AM.avoidMin) : [];
    let bestAdj = current.score, valid = 0;
    // keep looking while nothing beat standing still: after a dash the top points can all sit behind a harmful
    // surface, and stopping at 3 left the unit dashing in place every turn (slavotech AI, prologue battle 2)
    for (let k = 0; k < Math.min(order.length, 16) && (valid < 3 ? k < 8 || best === current : best === current && valid < 8); k++) {
      const c = order[k];
      if (c.score <= bestAdj) break;
      let np = parts.length ? navPath(b, u, c.px, c.py, { snap: 0, avoid: parts }) : null, av = !!np && np.cost <= budget + 1e-6 && np.len > 0;
      if (!av) np = navPath(b, u, c.px, c.py, { snap: 0 });
      if (!np || np.cost > budget + 1e-6 || !(np.len > 0)) continue;
      valid++;
      const adj = c.score - pathHarm(b, u, np.pts) * AM.pathHarm;
      if (adj > bestAdj) { best = c; bestAdj = adj; avoid = av && parts.length > 0; }
    }
  } else for (let k = 0; k < Math.min(order.length, 6); k++) {
    const c = order[k];
    if (c.score <= current.score) break;
    const np = navPath(b, u, c.px, c.py, { snap: 0 });
    if (np && np.cost <= budget + 1e-6 && np.len > 0) { best = c; break; }
  }
  const out = { x: best.x, y: best.y, px: best.px, py: best.py, score: best.score, pot: best.pot, ...(avoid ? { avoid } : {}) };
  out.current = { x: current.x, y: current.y, px: current.px, py: current.py, score: current.score, pot: current.pot };
  return out;
}
const tileCoverAt = (g, x, y) => tileCover(tileAt(g, x, y));

/**
 * Metric stage 4: candidate points behind the cover polygons near u (cover >= half) on the side away from each of the
 * nearest threats — coverGap m off the polygon edge; small props — through the centre, long runs — at the point
 * nearest to u and to its shadow.
 */
function coverCands(b, here, budget, EP, add) {
  const thr = EP.slice().sort((p, q) => Math.hypot(p.E.px - here.px, p.E.py - here.py) - Math.hypot(q.E.px - here.px, q.E.py - here.py)).slice(0, 3);
  if (!thr.length) return;
  const items = itemsNear(b, here.px, here.py, budget + 1).filter((it) => it.cover >= 2)
    .map((it) => ({ it, d: Math.hypot((it.x0 + it.x1) / 2 - here.px, (it.y0 + it.y1) / 2 - here.py) })).sort((p, q) => p.d - q.d).slice(0, AM.coverItems);
  const gap = METRIC.coverGap;
  for (const { it } of items) {
    const cx = (it.x0 + it.x1) / 2, cy = (it.y0 + it.y1) / 2, hx = (it.x1 - it.x0) / 2, hy = (it.y1 - it.y0) / 2;
    for (const { E } of thr) {
      const dx = cx - E.px, dy = cy - E.py, L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      const ux = dx / L, uy = dy / L;
      if (hx <= 1.6 && hy <= 1.6) {
        const t = Math.min(ux ? hx / Math.abs(ux) : Infinity, uy ? hy / Math.abs(uy) : Infinity);
        add(cx + ux * (t + gap), cy + uy * (t + gap));
      } else {
        for (const [sx, sy] of [[here.px, here.py], [cx + ux * (Math.max(hx, hy) + 2), cy + uy * (Math.max(hx, hy) + 2)]]) {
          const [qx, qy] = nearestOnPoly(sx, sy, it), vx = qx - E.px, vy = qy - E.py, vl = Math.hypot(vx, vy) || 1;
          add(qx + (vx / vl) * gap, qy + (vy / vl) * gap);
        }
      }
    }
  }
}
/** Metric stage 4: hit modifier of attacking t from point Q (cell qx, qy) — height (ranged only up) and flank. */
function hitAtM(b, Q, qx, qy, t, melee) {
  const C = b.data.combat;
  if (!C) return 0;
  let h = 0;
  const d = b.grid.elev ? elevAt(b.grid, qx, qy) - elevAt(b.grid, t.x, t.y) : 0;
  if (d > 0 && !melee) h += Math.min(d * C.elev.hitPer, C.elev.hitMax);
  else if (d < 0) h -= Math.min(-d * C.elev.hitPer, C.elev.hitMax);
  if (inCoverSpot(b.grid, t.x, t.y) && !coverM(b, Q, ptOf(t), melee)) h += C.cover.flankHit ?? 1;
  return h;
}
/** Metric stage 4: harm of the surfaces a walk crosses into (each entry once). */
function pathHarm(b, u, pts) {
  if (!b.surfaces || !b.surfaces.size || pts.length < 2) return 0;
  let h = 0;
  for (const en of surfaceEntries(b, pts)) for (const s of en.layers) h += Math.max(0, kindHarm(b, u, s.kind)) + (s.charged ? 4 : 0);
  return h;
}
/** Is tile (a planTile result) somewhere else than u stands now? */
const elsewhere = (u, tile) => (tile.px != null ? Math.hypot(tile.px - tile.current.px, tile.py - tile.current.py) > 0.05 : tile.x !== u.x || tile.y !== u.y);
const moveTo = (tile) => (tile.px != null ? { px: tile.px, py: tile.py, ...(tile.avoid ? { avoid: true } : {}) } : { x: tile.x, y: tile.y });

// ---------------------------------------------------------------- decision

function chaotic(b, u) {
  const legal = getLegalActions(b, u.id, { noMoves: true }).filter((a) => a.type === 'attack' || (a.type === 'ability' && a.target));
  if (legal.length && b.turn.actions > 0) return b.rng.pick(legal);
  return { type: 'endTurn', unit: u.id };
}

function adjacentThreats(b, u) {
  let n = 0;
  for (const e of b.units) if (isStanding(e) && isHostile(b, u, e) && isMeleeUnit(e) && (geoOn(b) ? distU(b, e, u) <= 1 : chebyshev(e.x, e.y, u.x, u.y) === 1)) n++;
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
  if (exactOn(b)) aimAreas(b, u, legal);
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
    if (tile && tile.current && elsewhere(u, tile) && tile.score > tile.current.score + 1) {
      const risk = t.disengaged ? 0 : oaRisk(b, u, tile.x, tile.y, tile.px != null ? { px: tile.px, py: tile.py, r: unitRadius(u) } : null);
      if (canDisengage && risk > (bestBonus ? bestBonus.v : 0) * 0.8) return { type: 'disengage', unit: unitId };
      if (tile.score - risk <= tile.current.score + 1) return top0(best, bestBonus, end);
      t.aiMoves++;
      return { type: 'move', unit: unitId, to: moveTo(tile) };
    }
  }

  // act if something worthwhile is in reach; compare with what moving first could give
  const top = best && bestBonus ? (best.v >= bestBonus.v ? best : bestBonus) : best || bestBonus;
  if (top && top.v > 0.5) {
    if (t.move > 0 && t.aiMoves < 2) {
      const tile = planTile(b, u);
      if (tile && tile.current && elsewhere(u, tile) && tile.pot > top.v * 1.5 + 1 && tile.score > tile.current.score + 1) {
        t.aiMoves++;
        return { type: 'move', unit: unitId, to: moveTo(tile) };
      }
    }
    return top.act;
  }

  if (t.move > 0 && t.aiMoves < (t.aiDashed ? 3 : 2)) {
    const tile = planTile(b, u);
    if (tile && tile.current && elsewhere(u, tile) && tile.score > tile.current.score + 0.05) {
      // nothing to do here and nothing reachable: dash first to get further
      if (tile.pot === 0 && t.actions > 0 && !t.acted && !t.aiDashed && getSpeed(b, u) > 0 && hasHostiles(b, u)) {
        t.aiDashed = true;
        return { type: 'dash', unit: unitId };
      }
      t.aiMoves++;
      return { type: 'move', unit: unitId, to: moveTo(tile) };
    }
  }
  return end;
}

/**
 * Metric stage 4: cones / lines aimed by their exact form — for every such ability among the legal tile actions try
 * aimDirs directions plus toward each foe in reach (+-aimSpread); the aim point sits next to the caster (any distance
 * gives the direction), the best valid aim joins the legal list (evalAbility counts foes in the polygon and own units
 * in the spilled surface, so the aim keeps allies out).
 */
function aimAreas(b, u, legal) {
  const done = new Set();
  for (const act of legal.slice()) {
    if (act.type !== 'ability' || !act.tile || done.has(act.ability)) continue;
    const a = u.abilities.find((x) => x.id === act.ability);
    if (!a || !a.area || a.target !== 'tile' || (a.area.shape !== 'cone' && a.area.shape !== 'line') || isLeapArea(a)) continue;
    done.add(a.id);
    const O = ptOf(u), reach = coneLenM(a.area.size || 1) + 2;
    const angs = [];
    for (let k = 0; k < AM.aimDirs; k++) angs.push((2 * Math.PI * k) / AM.aimDirs);
    for (const e of b.units) {
      if (!isStanding(e) || !isHostile(b, u, e)) continue;
      const E = ptOf(e);
      if (Math.hypot(E.px - O.px, E.py - O.py) > reach + E.r) continue;
      const a0 = Math.atan2(E.py - O.py, E.px - O.px);
      angs.push(a0, a0 - AM.aimSpread, a0 + AM.aimSpread);
    }
    let bestV = 0.5, bestT = null;
    for (const ang of angs) {
      for (const d0 of [O.r * 0.5, O.r + 0.6]) {
        const px = cm(O.px + Math.cos(ang) * d0), py = cm(O.py + Math.sin(ang) * d0);
        const spec = { x: Math.floor(px / CELL_M), y: Math.floor(py / CELL_M), px, py };
        if (!inBounds(b.grid, spec.x, spec.y) || !targetValid(b, u, a, spec)) continue;
        let v = evalAbility(b, u, a, spec);
        if (u.arch) v *= archAbilityMul(b, u, a, null);
        if (v > bestV) { bestV = v; bestT = spec; }
        break;
      }
    }
    if (bestT) legal.push({ type: 'ability', unit: u.id, ability: a.id, tile: bestT });
  }
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
