// Combat engine: turn-based grid battle, pure JS (no DOM). Every outcome goes to the event log.
//
// Decisions on gaps / contradictions in docs/specs/core-rules.md (v1 + v1.1):
//  1. Status durations count the target's own turns: tick at the start of its turn, `turns` decrease at the
//     end of its turn. Statuses/buffs/shields applied during the owner's own turn are "fresh" and skip that
//     first decrement (a self-buff with turns:1 lasts until the end of the owner's next turn).
//     Shields = temporary HP: without explicit `turns` they last until the battle ends (addShield).
//  2. Status semantics are data-driven: STATUSES[id].mods flags as documented in effects.js header
//     (kb, hit, dmg, dmgMelee, saves, init, speed, speedMul, initDice, attackAdv/Disadv, attackedAdv/Disadv,
//     attackedAdvMelee, attackedDisadvRanged, incomingDmg, resist, blockCost, blockWeapon, randomTarget,
//     forcedTarget, noApproachSource, shieldPierce, armorKbMul, firstAttackAdv, extraWeaponDice, nextRollDice),
//     plus skipTurn, breakOn, endSave, endAction, endOnHeal, immuneTags, cumulative tick buff (cumulative/cap).
//     Statuses missing in data fall back to STATUS_FALLBACK (same vocabulary).
//  3. endSave: save at the end of the bearer's turn vs the DC the status was applied with (12 if unknown).
//     endAction: legal action { type: 'endStatus', status } spends the action. breakOn 'attack': removed after
//     the bearer's attack roll or offensive ability; 'ability': after any ability.
//  4. Only heroes (kind 'hero') and NPC allies (kind 'ally') go unconscious at 0 HP; enemies and summons die.
//     Damage to an unconscious unit adds +1 (crit +2) to its death counter (3 = dead). Every hit on it is a crit.
//     Unconscious bodies keep occupying their tile.
//  5. "Hit >= 50% max HP in one round" = HP lost since the start of the current round (cumulative), checked
//     once per unit per round: CON save DC 12 or stun for 1 turn.
//  6. Cringe/psychic vs a creature with max MRL 0 deal nothing; MRL damage to unconscious units is ignored.
//     Heartbreak: lose floor(70% of current HP), never below 1. Lost control: next own turn is AI-driven and
//     every other unit counts as hostile for that unit.
//  7. Cover tiles ('c') block movement but not sight; cover counts only for ranged attacks (distance > 1).
//     Diagonal steps are blocked only if both orthogonal tiles are impassable. Hazard '~': 1d6 fire per entry.
//  8. Prone: at the start of its turn the unit stands up (status removed) and loses half of its movement.
//  9. Reactions are automatic for every unit: opportunity attacks are always taken; reaction abilities fire on
//     their trigger if affordable (heal/shield on allyDamaged only when the ally is at <= 60% HP).
//     selfAttacked fires before the attack roll (counter-attacks may kill the attacker first).
//     Reactions never trigger other reactions. Reaction resets at the start of own turn.
// 10. Ability resolution per target: roll 'save' -> one save; roll 'attack' without `weapon` op -> one spell
//     attack roll gating all ops. Every `weapon` op makes its own weapon attack roll (+op.hit); ops after it
//     (status/push/mark/damage...) apply only if that roll hit. onSave 'half' -> damage/drain halved, no statuses.
//     `move` ops run BEFORE the rolls (charge, then strike); `summon`, `extraAction` and ops with `self: true`
//     apply once to the caster. Friendly targets never roll. ability.castStat overrides the unit castStat.
// 11. Areas: target 'enemy' | 'tile' hit only enemies, 'self' | 'ally' only own side (caster included),
//     'any' hits everyone. Self-target abilities with a `move` op take a destination tile ({ tile }).
//     A unit-targeted ability with a `move` op may target up to max(range, tiles + weapon range) away.
// 12. Overcast: if ENR < cost and the class has `overcast`, ENR drops to 0, the ability resolves, then d20 ->
//     row ceil(d20 / 2). Rows use `parts` (effects.js format); rows with `todo` are skipped.
//     summon `side: 'hostileToAll'` spawns on team 'chaos'.
// 13. Victory ignores summons: a team loses when all its non-summon units are dead or unconscious.
//     win 'reachExit' — a standing hero-team unit on 'D' wins. Initiative modifiers from statuses only matter
//     at the initial roll because the order is fixed for the whole battle.
// 14. Heal with only 'organic'/'mechanical' — 'hybrid' counts as both. Healing an unconscious unit revives it
//     with the healed amount. `soulless` units ignore heal ops on HP and stabilize (drain self-heal and passive
//     regen still work). Passive regen with every 'battleEnd' is not handled here.
// 15. Summons last `turns` of their own turns (else def.defaultTurns, else 3) and act right after the summoner.
//     A summon may be any enemy id: it fights for the summoner's team. Decoys (noAttack) just stand.
// 16. v1.2: «Срыв» 11–20 on a non-boss enemy/summon (kind not hero/ally, boss !== true) -> «Сломлен»: event
//     'broken', unit.removed = unit.broken = true, leaves the grid, counts as defeated. Overcast at most
//     OVERCAST_LIMIT (2) times per unit per battle (unit.overcastsUsed). Ranged attack rolls (weapon or ability,
//     range > 1) have disadvantage while a standing hostile is adjacent to the attacker (enemyAdjacent).
// 17. v3.1 item properties (schema — equipment.js header). Reach weapons are melee at range 2 (isMeleeWeapon).
//     ENR / charges are paid per weapon attack (a burst pays once); units with max ENR 0 ignore ENR costs.
//     Area weapons: attack { target | tile } → save (area.save || 'dex') vs 8 + prof + mod(weapon stat), half on
//     success, only enemies are hit. Thrown: { type: 'throw', target } at distance 2..thrown, the weapon lands on the
//     nearest free tile to the target (b.drops), the thrower fights with fists (UNARMED) until it steps on that tile.
//     Zones (ability/item `zone` or op 'zone'): b.zones, last `turns` rounds (decrement at roundStart); 'smoke' gives
//     disadvantage to ranged attacks whose line (ends included) touches the zone. `only: tag` on any op skips targets
//     without the tag ('hybrid' counts as any). onDeath: abilities with trigger 'death' fire from the dead unit's
//     tile (saves as usual, no action cost) and are never chosen voluntarily. nextTurnPenalty (op extraAction or
//     ability): next own turn starts with fewer actions. Opiates (item.withdrawal) queue unit.withdrawalPending;
//     aftermath.js applies it after the battle. Mech armour shield = permanent shield (turns null) at battle start.
// 18. v4 N6 Acrobatics trick: grantSafePassage(b, u) sets b.turn.safePassage — hazard tiles (and future damaging
//     zones) deal no damage to that unit until its turn ends (event 'hazard' with avoided: true). Traps still fire.
// 19. Stage B statuses & surfaces (docs/specs/statuses-surfaces.md, surfaces — rules/surfaces.js header):
//     status ticks with scale 'tier' are × tier(L) of the applier (status.level); tagMul scales duration and tick
//     damage (R 0.5 / V 1.5); shocked's −2 init for machines is skipped (initiative is rolled once). Smoke zones
//     became gas surfaces ('smoke'); other zone kinds stay in b.zones. T_HAZARD = permanent fire surface (entry
//     still logs 'hazard'). panic is applied through op status { mrlBelow } (else `elseId` or nothing).
//     glitch: an ability with cost > 0 fails on d20 ≤ failOn (resources spent); ranged weapon shots «lag» (miss)
//     with chance `lag`. overload: after an attack / offensive ability the bearer takes selfDmg. Moves avoid harmful
//     surfaces when a detour costs ≤ 3 extra steps (movePath). Cumulative stacks of one stat don't add up (acid +
//     corrosion — the bigger penalty).

import { createRng } from './rng.js';
import { rollDice, d20, firstDie, chanceD20 } from './dice.js';
import { mod, normalizeData, buildCreature, buildEnemy, TIER_BONUS } from './character.js';
import { UNARMED } from './equipment.js';
import {
  parseMap, makeArena, chebyshev, lineOfSight, hasCover, reachable, pathTo, walkLine,
  tileAt, isPassable, inBounds, nearestFree, DIRS8, T_HAZARD, T_EXIT, T_WALL, pathCost, elevAt, inCoverSpot,
} from './grid.js';
import {
  initTerrain, coverBonus, terrainHit, elevRange, meleeElevOk, objectAt, damageObject, damageObjectsIn, terrainOn,
} from './terrain.js';
import { assignArchetypes, archTurnStart, archTurnEnd, archOnDamage, archOnDeath, archHit, archDmg, archKb } from './archetypes.js';
import {
  initSurfaces, tickSurfaces, surfaceEffect, createSurface, radiusTiles, elementHit, surfacesOn, clearSurfaces,
  gasBetween, surfaceHitBonus, surfaceHarm, surfaceKindsAt, battleLevel, tierFor, breakBarrelsIn, floorAt, cellAt,
} from './surfaces.js';

export const STATUS_FALLBACK = {
  stun: { kind: 'debuff', skipTurn: true },
  bleed: { kind: 'debuff', tick: { op: 'damage', dice: '1d4', dmgType: 'slash' }, endOnHeal: true, immuneTags: ['mechanical', 'digital'] },
  poison: { kind: 'debuff', tick: { op: 'damage', dice: '1d4', dmgType: 'toxin' }, mods: { hit: -2, dmg: -2 }, immuneTags: ['mechanical', 'digital'] },
  burn: { kind: 'debuff', tick: { op: 'damage', dice: '1d6', dmgType: 'fire' }, endAction: true },
  fear: { kind: 'debuff', mods: { attackDisadv: true, noApproachSource: true }, endSave: 'wil' },
  slow: { kind: 'debuff', mods: { speedMul: 0.5, init: -2 } },
  blind: { kind: 'debuff', mods: { attackDisadv: true, attackedAdv: true } },
  root: { kind: 'debuff', mods: { speedMul: 0 }, endSave: 'con' },
  silence: { kind: 'debuff', mods: { blockCost: true } },
  disarm: { kind: 'debuff', mods: { blockWeapon: true }, endSave: 'dex' },
  curse: { kind: 'debuff', mods: { hit: -2, saves: -2 } },
  prone: { kind: 'debuff', mods: { attackedAdvMelee: true, attackedDisadvRanged: true } },
  invisible: { kind: 'buff', mods: { attackedDisadv: true }, breakOn: 'attack' },
  stealth: { kind: 'buff', mods: { firstAttackAdv: true, extraWeaponDice: 1 }, breakOn: 'attack' },
  cringed: { kind: 'debuff', tick: { op: 'damage', dice: '1d4', dmgType: 'cringe' }, mods: { initDice: '-1d4' } },
  corrosion: { kind: 'debuff', tick: { op: 'buff', stat: 'kb', value: -1, cumulative: true, cap: -4 } },
  hallucination: { kind: 'debuff', mods: { randomTarget: 0.5 } },
  dazed: { kind: 'debuff', mods: { shieldPierce: 0.5, armorKbMul: 0.5 } },
  regen: { kind: 'buff', tick: { op: 'heal', dice: '1d4', resource: 'hp' } },
  inspired: { kind: 'buff', mods: { nextRollDice: '1d4' } },
  blessed: { kind: 'buff', mods: { hit: 1, dmg: 1 } },
  haste: { kind: 'buff', mods: { init: 2, speed: 3 } },
  berserk: { kind: 'buff', mods: { dmgMelee: 2, kb: -2 } },
  taunt: { kind: 'debuff', mods: { forcedTarget: 'source' } },
  marked: { kind: 'debuff', mods: { incomingDmg: 2 } },
  fortified: { kind: 'buff', mods: { resist: { slash: 'resist', pierce: 'resist', blunt: 'resist' } } },
};

const MRL_TYPES = { cringe: 1, psychic: 1 };
const CASTER_OPS = { move: 1, summon: 1, extraAction: 1, zone: 1 };
const HERO_KINDS = { hero: 1, ally: 1 };
const DEFAULT_STATUS_DC = 12;
/** v1.2: overcasts (casting without ENR) per unit per battle. */
export const OVERCAST_LIMIT = 2;
/** «Срыв»: d20 <= this -> heartbreak, else lost control / «Сломлен». */
export const BREAKDOWN_HEARTBREAK_MAX = 10;
/** Heartbreak: share of current HP lost (never below 1). */
export const HEARTBREAK_HP_LOSS = 0.7;
/** After «Срыв» MRL is restored to this share of max. */
export const BREAKDOWN_MRL_RESET = 0.25;
/** «Надлом»: MRL at or below this share of max. */
export const NADLOM_FRACTION = 0.5;
/** «Удар ≥ 50%»: HP lost in one round >= this share of max -> CON save vs BIG_HIT_DC or stun. */
export const BIG_HIT_FRACTION = 0.5;
export const BIG_HIT_DC = 12;
export const BIG_HIT_SAVE = 'con';
/** Cover bonus to KB vs ranged attacks. */
export const COVER_KB = 2;
/** Own turns spent unconscious before death. */
export const DOWN_TURNS_TO_DEATH = 3;
/** v2: summons grow with the summoner — per summoner level above 1. */
export const SUMMON_HP_PER_LEVEL = 3;
export const SUMMON_DMG_PER_LEVEL = 1;

// ---------------------------------------------------------------- events

function emit(b, ev) {
  ev.round = b.round;
  if (b.log) b.log.push(ev);
  if (b.onEvent) b.onEvent(ev, b);
}
export { emit as emitEvent };

/** Tag check with Stage B pseudo-tags: 'mutant' (mutant races), 'cls:<class>', 'race:<race>', 'phobia:<trigger>'. */
export function unitHasTag(u, tag) {
  if (u.tags && u.tags.includes(tag)) return true;
  if (tag === 'mutant') return !!(u.raceId && String(u.raceId).startsWith('mutant'));
  if (tag.startsWith('cls:')) return u.classId === tag.slice(4);
  if (tag.startsWith('race:')) return u.raceId === tag.slice(5);
  if (tag.startsWith('phobia:')) return (u.phobias || []).some((p) => p.trigger === tag.slice(7));
  return false;
}

/** Duration / tick multiplier of a status on u from its tagMul (resistance 0.5, vulnerability 1.5). */
export function statusFactor(b, u, id) {
  const d = statusDef(b, id);
  if (!d || !d.tagMul) return 1;
  let f = 1;
  for (const [tag, k] of Object.entries(d.tagMul)) if (unitHasTag(u, tag)) f *= k;
  return f;
}

// ---------------------------------------------------------------- status helpers

export function statusDef(b, id) {
  let d = b.statusCache[id];
  if (d === undefined) {
    const src = b.data.statuses[id];
    const fb = STATUS_FALLBACK[id];
    d = src || fb ? { id, ...(fb || {}), ...(src || {}) } : null;
    if (d && !d.mods) d.mods = {};
    b.statusCache[id] = d;
  }
  return d;
}

export function hasStatus(u, id) {
  const s = u.statuses;
  for (let i = 0; i < s.length; i++) if (s[i].id === id) return true;
  return false;
}
export function getStatus(u, id) {
  const s = u.statuses;
  for (let i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
  return null;
}

/** Sum of numeric mods[key] (and optional alias) over the unit's statuses. */
export function statusMod(b, u, key, alias) {
  let sum = 0;
  const s = u.statuses;
  for (let i = 0; i < s.length; i++) {
    const m = statusDef(b, s[i].id)?.mods;
    if (!m) continue;
    if (typeof m[key] === 'number') sum += m[key];
    if (alias && typeof m[alias] === 'number') sum += m[alias];
  }
  return sum;
}

/** First status entry whose mods[key] is truthy (or null). */
function modFlag(b, u, key) {
  const s = u.statuses;
  for (let i = 0; i < s.length; i++) {
    const m = statusDef(b, s[i].id)?.mods;
    if (m && m[key]) return s[i];
  }
  return null;
}
function modValue(b, u, key) {
  const e = modFlag(b, u, key);
  return e ? statusDef(b, e.id).mods[key] : null;
}
function modProduct(b, u, key) {
  let p = 1;
  for (const s of u.statuses) {
    const m = statusDef(b, s.id)?.mods;
    if (m && typeof m[key] === 'number') p *= m[key];
  }
  return p;
}

/** Buffs + cumulative status stacks for a stat key. */
export function buffSum(u, key) {
  let sum = 0;
  const s = u.buffs;
  for (let i = 0; i < s.length; i++) if (s[i].stat === key) sum += s[i].value;
  const st = u.statuses;
  let neg = 0, pos = 0;
  for (let i = 0; i < st.length; i++) {
    if (st[i].stackStat !== key) continue;
    if (st[i].stack < 0) neg = Math.min(neg, st[i].stack); else pos = Math.max(pos, st[i].stack);
  }
  return sum + neg + pos;
}

function skipsTurn(b, u) {
  for (const s of u.statuses) if (statusDef(b, s.id)?.skipTurn) return true;
  return false;
}

function incomingDmg(b, u) {
  let sum = 0;
  for (const s of u.statuses) {
    const m = statusDef(b, s.id)?.mods;
    const counts = s.mark || (m && (m.incomingDmg || m.dmgTaken));
    if (!counts) continue;
    sum += s.value != null ? s.value : (m.incomingDmg || 0) + (m.dmgTaken || 0);
  }
  return sum;
}

/** v2 conditional passives ({ cond: 'targetWounded', hit, dmg }). */
function condMatches(cond, tgt) {
  if (cond === 'targetWounded') return tgt.hp < tgt.maxHp;
  return false;
}
function condBonus(att, tgt, key) {
  let v = 0;
  const list = att.condBonuses;
  if (!list || !tgt) return 0;
  for (let i = 0; i < list.length; i++) if (condMatches(list[i].cond, tgt)) v += list[i][key] || 0;
  return v;
}

function breakStatuses(b, u, what) {
  for (let i = u.statuses.length - 1; i >= 0; i--) {
    const d = statusDef(b, u.statuses[i].id);
    if (d && d.breakOn === what) removeStatus(b, u, u.statuses[i].id);
  }
}

// ---------------------------------------------------------------- derived numbers

export const isStanding = (u) => !u.dead && !u.down && !u.removed;
export const isAlive = (u) => !u.dead && !u.removed;
/** levels-20: `{op: 'stabilize', revive: true}` also raises a dead ally (not soulless, not a summon) within the battle. */
export const hasReviveOp = (a) => !!a && (a.effects || []).some((op) => op.op === 'stabilize' && op.revive);
export const canRevive = (a, t) => !!t && t.dead && !t.removed && !t.soulless && t.kind !== 'summon' && hasReviveOp(a);

export function effStat(b, u, s) {
  return (u.stats[s] ?? 10) + buffSum(u, s) + statusMod(b, u, s);
}

export function getSpeed(b, u) {
  const s = u.speed + buffSum(u, 'speed') + statusMod(b, u, 'speed');
  return Math.max(0, Math.floor(s * modProduct(b, u, 'speedMul')));
}

/** Effective KB of u (attacker optional; ranged adds cover from the attacker's tile). */
export function getKb(b, u, attacker, ranged) {
  let kb = u.kb + buffSum(u, 'kb') + statusMod(b, u, 'kb');
  const mul = modProduct(b, u, 'armorKbMul');
  if (mul !== 1) kb -= u.armorKb - Math.floor(u.armorKb * mul);
  if (attacker) kb += coverBonus(b, attacker.x, attacker.y, u.x, u.y, !ranged).kb;
  if (u.holdPos) kb += b.data.combat?.cover.holdKb ?? 0;
  if (u.arch) kb += archKb(b, u);
  return kb;
}

export function weaponRange(u) { return u.weapon ? (u.weapon.range || 1) : 1; }
/** Melee weapon: range 1 or reach (weapon.melee). */
export const isMeleeWeapon = (u) => !u.weapon || !!u.weapon.melee || weaponRange(u) <= 1;
export const isMeleeUnit = (u) => !!u.weapon && !u.noAttack && isMeleeWeapon(u);

export function weaponAttackBonus(b, u) {
  const w = u.weapon;
  if (!w) return 0;
  if (u.attackBonus != null) return u.attackBonus;
  return mod(effStat(b, u, w.stat || 'str')) + u.prof + (TIER_BONUS[u.weaponTier] || 0) + (w.hit || 0);
}
/** Casting modifier; ability.castStat overrides the unit's castStat. */
export function castMod(b, u, a) {
  const st = (a && a.castStat) || u.castStat;
  return st ? mod(effStat(b, u, st)) : 0;
}
export const spellAttackBonus = (b, u, a) => castMod(b, u, a) + u.prof;
export const getDc = (b, u, a) => (a && a.dc != null ? a.dc : u.dcOverride != null && !(a && a.castStat) ? u.dcOverride : 8 + castMod(b, u, a) + u.prof);

export function bonusValue(b, u, bonus, a) {
  if (bonus == null) return 0;
  if (bonus === 'castMod') return castMod(b, u, a);
  if (bonus === 'weaponMod') return u.weapon ? mod(effStat(b, u, u.weapon.stat || 'str')) : 0;
  if (Array.isArray(bonus)) return bonus.reduce((s, x) => s + bonusValue(b, u, x, a), 0);
  return Number(bonus) || 0;
}

function resistOf(b, u, dmgType) {
  if (!dmgType) return null;
  let r = u.resist[dmgType] || null;
  for (const s of u.statuses) {
    const v = statusDef(b, s.id)?.mods?.resist?.[dmgType];
    if (!v) continue;
    if (r === 'immune' || v === 'immune') r = 'immune';
    else if (!r) r = v;
    else if (r !== v) r = null;
  }
  return r;
}

export function isHostile(b, a, t) {
  if (a === t) return false;
  if (a.team !== t.team) return true;
  return !!(b.turn && b.turn.unitId === a.id && b.turn.lostControl);
}

/** v3.1: ENR, charges and overheat lock of the current weapon. Returns null or a reason. */
export function weaponBlocked(b, u) {
  const w = u.weapon;
  if (!w) return 'noWeapon';
  if (u.weaponHot) return 'overheat';
  if (w.charges != null && (u.weaponCharges ?? w.charges) <= 0) return 'charges';
  if (w.enr && u.maxEnr > 0 && u.enr < w.enr) return 'energy';
  return null;
}
const canUseWeapon = (b, u) => !!u.weapon && !u.noAttack && !modFlag(b, u, 'blockWeapon') && !weaponBlocked(b, u);

/** Pay ENR / one charge for a weapon attack. */
function payWeapon(b, u) {
  const w = u.weapon;
  if (!w) return;
  if (w.enr && u.maxEnr > 0) {
    u.enr = Math.max(0, u.enr - w.enr);
    emit(b, { type: 'weaponEnr', actor: u.id, value: w.enr, enr: u.enr });
  }
  if (w.charges != null) {
    u.weaponCharges = Math.max(0, (u.weaponCharges ?? w.charges) - 1);
    emit(b, { type: 'weaponCharge', actor: u.id, left: u.weaponCharges });
  }
}

/** Overheat after a shot (natural — d20 or null). Returns true if the weapon stops firing. */
function afterShot(b, u, natural) {
  const w = u.weapon;
  const oh = w && w.overheat;
  if (!oh) return false;
  if (typeof oh === 'string' || (oh.dice && !oh.shots)) {
    if (natural !== 1) return false;
    const dice = typeof oh === 'string' ? oh : oh.dice;
    emit(b, { type: 'overheat', actor: u.id, dice });
    dealDamage(b, null, u, rollDice(b.rng, dice), (oh && oh.dmgType) || 'fire');
    return true;
  }
  u.weaponShots = (u.weaponShots || 0) + 1;
  if (u.weaponShots < oh.shots) return false;
  u.weaponShots = 0;
  u.weaponLock = oh.turns ?? 1;
  u.weaponHot = true;
  emit(b, { type: 'overheat', actor: u.id, turns: u.weaponLock });
  if (oh.dice) dealDamage(b, null, u, rollDice(b.rng, oh.dice), oh.dmgType || 'fire');
  return true;
}

// ---------------------------------------------------------------- battle setup

function initUnit(u) {
  const c = { ...u, stats: { ...u.stats }, resist: { ...u.resist } };
  c.x = -1; c.y = -1;
  c.statuses = []; c.buffs = []; c.shield = null; c.uses = {};
  c.down = false; c.dead = false; c.removed = false; c.downTurns = 0;
  c.reactionUsed = false; c.roundHpLoss = 0; c.bigHitRound = -1;
  c.deathSavesLeft = u.deathSaves || 0; c.lostControl = 0; c.lostControlFresh = false;
  c.summonTurns = null; c.summoner = null; c.nadlom = false; c.initiative = 0;
  c.overcastsUsed = 0; c.broken = false;
  c.inventory = { ...(u.inventory || {}) };
  c.backpack = { ...(u.backpack || {}) }; // v7: battle items in the backpack («Порыться» → quick slot)
  c.weaponCharges = u.weapon && u.weapon.charges != null ? u.weapon.charges : null;
  c.weaponShots = 0; c.weaponLock = 0; c.weaponHot = false; c.turnPenalty = null; c.withdrawalPending = [];
  c.deathFired = false;
  if (u.mechShield > 0) c.shield = { value: u.mechShield, turns: null, fresh: false, mech: true };
  c.phobias = (u.phobias || []).map((p) => ({ ...p, lastRound: -1 }));
  if (c.hp <= 0 && HERO_KINDS[c.kind]) c.down = true;
  return c;
}

function isUnitObject(x) { return x && typeof x === 'object' && typeof x.maxHp === 'number'; }

function addUnit(b, u, pos) {
  const free = b.occ[pos.y * b.grid.w + pos.x] === 0 && isPassable(b.grid, pos.x, pos.y)
    ? pos : nearestFree(b.grid, pos.x, pos.y, b.occ);
  if (!free) throw new Error(`No free tile for ${u.id}`);
  if (b.byId[u.id]) u.id = `${u.id}_${b.units.length + 1}`;
  u.x = free.x; u.y = free.y;
  b.occ[free.y * b.grid.w + free.x] = b.units.length + 1;
  b.units.push(u);
  b.byId[u.id] = u;
  b.occVersion++;
}

function setPos(b, u, x, y) {
  const w = b.grid.w;
  const marker = b.occ[u.y * w + u.x] || b.units.indexOf(u) + 1;
  b.occ[u.y * w + u.x] = 0;
  u.x = x; u.y = y;
  b.occ[y * w + x] = marker;
  b.occVersion++;
}

function clearPos(b, u) {
  if (u.x >= 0) b.occ[u.y * b.grid.w + u.x] = 0;
  b.occVersion++;
}

/** Leave the battle alive (coward fled, …): out of the grid, counts as not defeated (no loot / kill XP). */
export function removeFromBattle(b, u, reason) {
  u.removed = true;
  u.shield = null;
  clearPos(b, u);
  emit(b, { type: reason || 'leave', target: u.id, actor: u.id });
  checkVictory(b);
}

export const unitAt = (b, x, y) => {
  if (!inBounds(b.grid, x, y)) return null;
  const m = b.occ[y * b.grid.w + x];
  return m ? b.units[m - 1] : null;
};

/**
 * createBattle({ map, heroes, enemies, allies, data, seed, log, onEvent, autoReactions })
 * heroes: built creatures or specs { race, cls, level, path, stats } (ids are resolved via data).
 * enemies: creatures, enemy defs or ids; default — map.enemies. allies: default — map.allies.
 * The list defines the side ('heroes' / 'enemies'). Units are cloned: callers' objects are not mutated.
 * Start points 'P' / 'E' / 'A' are taken row by row, left to right.
 */
export function createBattle({ map, heroes = [], enemies, allies, data, seed = 1, log = true, onEvent = null, autoReactions = true } = {}) {
  const D = normalizeData(data);
  const enemyList = enemies || (map && map.enemies) || [];
  const mapDef = map || makeArena({ heroes: heroes.length, enemies: enemyList.length });
  const grid = parseMap(mapDef);
  const b = {
    grid, map: mapDef, data: D, rng: createRng(seed), seed,
    units: [], byId: {}, order: [], turnIndex: -1, round: 1, turn: null,
    log: log ? [] : null, onEvent, winner: null, occ: new Int32Array(grid.w * grid.h), occVersion: 0,
    summonCount: 0, reactionDepth: 0, statusCache: {}, autoReactions, reachCache: null,
    traps: [], trapCount: 0, drops: [], zones: [], zoneCount: 0,
  };
  initSurfaces(b);
  const spawn = (list, starts, team, kind) => {
    list.forEach((item, i) => {
      let u;
      if (isUnitObject(item)) u = initUnit(item);
      else if (typeof item === 'string' || (item && item.hp != null && !item.race)) {
        u = initUnit(buildEnemy(item, { data: D, team, kind: kind === 'enemy' ? 'enemy' : 'ally', id: `${kind[0]}${i + 1}` }));
      } else u = initUnit(buildCreature({ ...item, data: D, team, id: item.id || `${kind[0]}${i + 1}` }));
      if (kind === 'ally' && u.kind !== 'hero') u.kind = 'ally';
      u.team = team;
      const pos = starts[i] || starts[starts.length - 1] || { x: 1, y: 1 };
      addUnit(b, u, pos);
    });
  };
  spawn(heroes, grid.starts.P, 'heroes', 'hero');
  spawn(allies || mapDef.allies || [], grid.starts.A.length ? grid.starts.A : grid.starts.P, 'heroes', 'ally');
  spawn(enemyList, grid.starts.E, 'enemies', 'enemy');
  // combat rework: destructible objects get HP from the battle level, AI archetypes (terrain.js, archetypes.js)
  initTerrain(b);
  assignArchetypes(b);
  // opiate withdrawal carried over from earlier battles (aftermath.js): status at battle start
  for (const u of b.units) {
    const nb = u.withdrawal && u.withdrawal.nextBattle;
    if (nb && nb.status) applyStatus(b, u, nb.status, nb.turns || 1, null);
  }

  const rolls = b.units.map((u) => {
    const r = d20(b.rng);
    let init = r.natural + mod(u.stats.per) + u.initBonus + buffSum(u, 'init') + statusMod(b, u, 'init');
    const dice = modValue(b, u, 'initDice');
    if (dice) init += rollDice(b.rng, dice);
    u.initiative = init;
    return { u, init, tie: mod(u.stats.dex) * 100 + b.rng() * 100, natural: r.natural };
  });
  rolls.sort((a, c) => c.init - a.init || c.tie - a.tie);
  b.order = rolls.map((r) => r.u.id);
  emit(b, { type: 'battleStart', units: b.units.map((u) => u.id), map: mapDef.id });
  emit(b, { type: 'initiative', order: rolls.map((r) => ({ id: r.u.id, init: r.init, natural: r.natural })) });
  emit(b, { type: 'roundStart' });
  checkVictory(b);
  startNextTurn(b);
  return b;
}

export const currentUnit = (b) => (b.turn ? b.byId[b.turn.unitId] : null);

/** True when the current unit must be driven by AI (enemy, summon, NPC ally or lost control). */
export function isAiTurn(b) {
  const u = currentUnit(b);
  return !!u && (u.control === 'ai' || !!b.turn.lostControl);
}

// ---------------------------------------------------------------- turn flow

function startNextTurn(b) {
  const guard = b.order.length * 20 + 10;
  for (let g = 0; g < guard; g++) {
    if (b.winner) { b.turn = null; return; }
    b.turnIndex++;
    if (b.turnIndex >= b.order.length) {
      b.turnIndex = 0;
      b.round++;
      for (const u of b.units) u.roundHpLoss = 0;
      emit(b, { type: 'roundStart' });
      tickZones(b);
      tickSurfaces(b);
    }
    const u = b.byId[b.order[b.turnIndex]];
    if (!u || u.dead || u.removed) continue;
    if (beginTurn(b, u)) return;
    if (!b.winner && !u.dead && !u.removed) finishTurn(b, u);
  }
  b.turn = null;
}

function beginTurn(b, u) {
  u.reactionUsed = false;
  u.holdPos = false;
  b.turn = { unitId: u.id, move: 0, actions: 1, bonus: 1 + (u.extraBonusActions || 0), disengaged: false, lostControl: false, aiMoves: 0, acted: false };
  b.reachCache = null;
  emit(b, { type: 'turnStart', actor: u.id });
  u.weaponHot = u.weaponLock > 0;
  if (u.weaponHot) u.weaponLock--;
  if (u.turnPenalty) {
    const p = u.turnPenalty;
    u.turnPenalty = null;
    b.turn.actions = Math.max(0, b.turn.actions - (p.actions || 0));
    b.turn.bonus = Math.max(0, b.turn.bonus - (p.bonus || 0));
    emit(b, { type: 'turnPenalty', actor: u.id, actions: p.actions || 0, bonus: p.bonus || 0 });
  }
  if (u.down) {
    u.downTurns++;
    emit(b, { type: 'downTick', actor: u.id, turns: u.downTurns });
    if (u.downTurns >= DOWN_TURNS_TO_DEATH) kill(b, u, 'bleedout');
    return false;
  }
  if (u.summonTurns != null && u.summonTurns <= 0) { unsummon(b, u); return false; }
  for (const r of u.regen) {
    if (r.every && r.every !== 'turn') continue;
    const res = r.resource || 'hp';
    if (u[res] >= u['max' + res[0].toUpperCase() + res.slice(1)]) continue;
    healUnit(b, u, u, rollDice(b.rng, r.dice), res);
  }
  if (u.statuses.length) {
    for (const s of u.statuses.slice()) {
      if (!isStanding(u)) break;
      if (!u.statuses.includes(s)) continue;
      const d = statusDef(b, s.id);
      if (!d || !d.tick) continue;
      const src = (s.source && b.byId[s.source]) || u;
      for (const tk of Array.isArray(d.tick) ? d.tick : [d.tick]) {
        if (!isStanding(u) || !u.statuses.includes(s)) break;
        if (tk.ifStatus && !hasStatus(u, tk.ifStatus)) continue;
        if (tk.op === 'buff' && tk.cumulative) {
          const cap = tk.cap ?? (tk.value < 0 ? -99 : 99);
          s.stackStat = tk.stat;
          const next = (s.stack || 0) + (tk.value || 0);
          s.stack = tk.value < 0 ? Math.max(cap, next) : Math.min(cap, next);
          emit(b, { type: 'tick', actor: s.source, target: u.id, status: s.id, stat: s.stackStat, value: s.stack });
          continue;
        }
        if (tk.op === 'maxHpLoss') { radiationTick(b, u, s, tk); continue; }
        emit(b, { type: 'tick', actor: s.source, target: u.id, status: s.id });
        const mul = (tk.scale === 'tier' ? tierFor(b, s.level || battleLevel(b)) : 1) * statusFactor(b, u, s.id);
        applyOp(b, src, u, tk, { tick: true, mul });
      }
      if (d.bleedSurface && isAlive(u) && (u.tags.includes('organic') || u.tags.includes('hybrid'))) {
        s.bleedN = (s.bleedN || 0) + 1;
        const every = b.data.surfaceRules?.bleedEvery ?? 2;
        if (s.bleedN % every === 0) createSurface(b, 'blood', [{ x: u.x, y: u.y }], src === u ? null : src, {});
      }
    }
  }
  // Stage B: the tile under the unit acts at the start of its turn
  if (isStanding(u) && b.surfaces.size) surfaceEffect(b, u, 'turn');
  // whatever the tick phase applied to this unit belongs to THIS turn (no extra "fresh" turn)
  for (const s of u.statuses) s.fresh = false;
  for (const s of u.buffs) s.fresh = false;
  if (u.shield) u.shield.fresh = false;
  u.lostControlFresh = false;
  if (!isStanding(u)) return false;
  if (checkVictory(b)) return false;
  if (skipsTurn(b, u)) {
    emit(b, { type: 'skipTurn', actor: u.id });
    return false;
  }
  if (modFlag(b, u, 'noBonus')) b.turn.bonus = 0;
  let speed = getSpeed(b, u);
  if (hasStatus(u, 'prone')) {
    removeStatus(b, u, 'prone');
    speed = Math.floor(speed / 2);
    emit(b, { type: 'standUp', actor: u.id });
  }
  b.turn.move = speed;
  if (u.arch) archTurnStart(b, u);
  if (u.lostControl > 0) {
    b.turn.lostControl = true;
    emit(b, { type: 'lostControlTurn', actor: u.id });
  }
  return true;
}

/** irradiated: −pct of max HP per own turn, up to cap (rounded up); restored when the status goes. */
function radiationTick(b, u, s, tk) {
  if (u.baseMaxHp == null) u.baseMaxHp = u.maxHp;
  s.stack = Math.min(tk.cap ?? 0.25, (s.stack || 0) + (tk.pct ?? 0.05));
  u.maxHp = Math.max(1, u.baseMaxHp - Math.ceil(u.baseMaxHp * s.stack));
  if (u.hp > u.maxHp) u.hp = u.maxHp;
  emit(b, { type: 'tick', actor: s.source, target: u.id, status: s.id, maxHp: u.maxHp });
}

function decTimed(list, onExpire) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s.fresh) { s.fresh = false; continue; }
    if (s.turns == null) continue;
    s.turns--;
    if (s.turns <= 0) { list.splice(i, 1); onExpire && onExpire(s); }
  }
}

function finishTurn(b, u) {
  // combat rework §3.1 «Занял позицию»: a sniper that did not move, next to cover — +1 KB until its next turn
  const C = b.data.combat;
  if (C && b.turn && b.turn.unitId === u.id && !b.turn.moved && isStanding(u) && (C.cover.holdArch || []).includes(u.arch) && inCoverSpot(b.grid, u.x, u.y)) {
    u.holdPos = true;
    emit(b, { type: 'holdPos', actor: u.id });
  }
  if (u.arch) archTurnEnd(b, u);
  if (u.removed) { emit(b, { type: 'turnEnd', actor: u.id }); return; }
  if (isStanding(u)) {
    for (const s of u.statuses.slice()) {
      const d = statusDef(b, s.id);
      if (!d || !d.endSave || s.fresh) continue;
      if (rollSave(b, u, d.endSave, s.dc ?? DEFAULT_STATUS_DC, null, 'endSave:' + s.id)) removeStatus(b, u, s.id);
    }
  }
  decTimed(u.statuses, (s) => emit(b, { type: 'statusEnd', target: u.id, id: s.id }));
  decTimed(u.buffs, (s) => emit(b, { type: 'buffEnd', target: u.id, stat: s.stat }));
  if (u.shield) {
    if (u.shield.fresh) u.shield.fresh = false;
    else if (u.shield.turns != null && --u.shield.turns <= 0) { u.shield = null; emit(b, { type: 'shieldEnd', target: u.id }); }
  }
  if (u.summonTurns != null) u.summonTurns--;
  if (u.lostControl > 0) {
    if (u.lostControlFresh) u.lostControlFresh = false;
    else u.lostControl--;
  }
  emit(b, { type: 'turnEnd', actor: u.id });
}

/** End the current unit's turn and start the next one. Returns events of this step. */
export function endTurn(b) {
  const start = b.log ? b.log.length : 0;
  if (!b.winner && b.turn) {
    const u = b.byId[b.turn.unitId];
    if (u && !u.dead && !u.removed) finishTurn(b, u);
    startNextTurn(b);
  }
  return b.log ? b.log.slice(start) : [];
}

// ---------------------------------------------------------------- victory

export function checkVictory(b) {
  if (b.winner) return b.winner;
  const standing = new Set();
  let teams = 0;
  for (const u of b.units) {
    if (u.kind === 'summon' || u.removed) continue;
    teams++;
    if (isStanding(u)) standing.add(u.team);
  }
  let winner = null;
  if (b.map.win === 'reachExit') {
    for (const u of b.units) {
      if (u.team === 'heroes' && isStanding(u) && u.kind !== 'summon' && tileAt(b.grid, u.x, u.y) === T_EXIT) winner = 'heroes';
    }
  }
  if (!winner && b.map.lose === 'heroDown') {
    for (const u of b.units) if (u.kind === 'hero' && u.team === 'heroes' && !isStanding(u)) { winner = 'enemies'; break; }
  }
  if (!winner && teams === 0) winner = 'draw';
  if (!winner && teams > 0 && standing.size <= 1) winner = standing.size ? [...standing][0] : 'draw';
  if (winner) {
    b.winner = winner;
    emit(b, { type: 'victory', winner });
  }
  return b.winner;
}

// ---------------------------------------------------------------- damage, healing, death

/** Raise a dead unit (stabilize + revive): 1 HP on its death tile or the nearest free one, statuses cleared. */
function reviveUnit(b, caster, t) {
  if (t.soulless || t.kind === 'summon') { emit(b, { type: 'healBlocked', actor: caster.id, target: t.id }); return; }
  const free = b.occ[t.y * b.grid.w + t.x] === 0 && isPassable(b.grid, t.x, t.y) ? { x: t.x, y: t.y } : nearestFree(b.grid, t.x, t.y, b.occ);
  if (!free) return;
  t.dead = false; t.down = false; t.downTurns = 0; t.hp = 1; t.statuses = [];
  t.x = free.x; t.y = free.y;
  b.occ[free.y * b.grid.w + free.x] = b.units.indexOf(t) + 1;
  b.occVersion++;
  emit(b, { type: 'stabilize', actor: caster.id, target: t.id, value: t.hp, revive: true });
}

function kill(b, u, reason) {
  if (u.dead) return;
  const x = u.x, y = u.y;
  const burning = hasStatus(u, 'burn');
  u.dead = true; u.down = false; u.hp = 0; u.shield = null;
  clearPos(b, u);
  emit(b, { type: 'death', target: u.id, reason });
  if (surfacesOn(b) && x >= 0 && u.kind !== 'summon') {
    const SR = b.data.surfaceRules || {};
    if (burning) createSurface(b, 'fire', [{ x, y }], null, { turns: SR.burnDeathFire ?? 2 });
    else if (u.tags.includes('organic') && !floorAt(b, x, y)) createSurface(b, 'blood', [{ x, y }], null, { turns: SR.deathBlood ?? 6 });
  }
  if (!u.deathFired) { u.deathFired = true; deathEffects(b, u, x, y); }
  if (u.arch || terrainOn(b)) archOnDeath(b, u);
  checkVictory(b);
}

/** onDeath: abilities with trigger 'death' (or onDeath: true) fire from the death tile. */
export const isDeathAbility = (a) => !!a && (a.trigger === 'death' || a.onDeath === true);
function deathEffects(b, u, x, y) {
  const list = (u.abilities || []).filter(isDeathAbility);
  if (!list.length || x < 0) return;
  for (const a of list) {
    emit(b, { type: 'onDeath', actor: u.id, ability: a.id, x, y });
    const dc = getDc(b, u, a);
    const size = a.area ? a.area.size || 1 : 1;
    const all = a.target === 'any';
    for (const t of b.units.slice()) {
      if (!isAlive(t) || t === u || (!all && t.team === u.team)) continue;
      if (chebyshev(x, y, t.x, t.y) > size || !lineOfSight(b.grid, x, y, t.x, t.y)) continue;
      let half = false;
      if (a.roll === 'save' && a.save && rollSave(b, t, a.save, dc, u, a.id)) {
        if (a.onSave !== 'half') continue;
        half = true;
      }
      for (const op of a.effects || []) if (isAlive(t)) applyOp(b, u, t, op, { half, dc, ability: a });
    }
    for (const op of a.effects || []) if (op.op === 'surface' && !op.per && !op.crit) placeSurfaceOp(b, u, a, op, { x, y }, null);
  }
}

export function unsummon(b, u) {
  u.removed = true;
  clearPos(b, u);
  emit(b, { type: 'unsummon', target: u.id });
}

function proxyFactor(tags) {
  if (tags.includes('hybrid')) return 1;
  if (tags.includes('mechanical')) return 1.5;
  if (tags.includes('organic')) return 0.5;
  return 1;
}

/**
 * Apply damage of a type (after dice). Handles proxy multipliers, resist/vuln/immune, MRL damage,
 * shields, unconsciousness, death, big-hit stun check and allyDamaged reactions.
 * Returns the amount actually removed from HP / MRL.
 */
export function dealDamage(b, src, tgt, amount, dmgType, opts) {
  if (!isAlive(tgt)) return 0;
  const crit = !!(opts && opts.crit);
  let amt = Math.max(0, Math.floor(amount * (src && src.archDmgMul && src !== tgt ? src.archDmgMul : 1)));
  let mult = 1;
  if (dmgType === 'proxy') {
    mult = proxyFactor(tgt.tags);
    amt = Math.floor(amt * mult);
  }
  // Stage B: status reactions to a damage type (wet ×1.5 electric, frozen cracks on blunt)
  let broke = null;
  if (dmgType && tgt.statuses.length) {
    for (const st of tgt.statuses) {
      const d = statusDef(b, st.id);
      if (!d) continue;
      if (d.vulnMul && d.vulnMul[dmgType]) { amt = Math.floor(amt * d.vulnMul[dmgType]); mult *= d.vulnMul[dmgType]; }
      if (d.breakOnDmg && d.breakOnDmg[dmgType] != null && amt > 0) { amt += d.breakOnDmg[dmgType]; broke = st.id; }
    }
    if (broke) removeStatus(b, tgt, broke);
  }
  const r = resistOf(b, tgt, dmgType);
  if (r === 'immune') amt = 0;
  else if (r === 'resist') amt = Math.floor(amt / 2);
  else if (r === 'vuln') amt *= 2;
  const srcId = src ? src.id : null;

  if (MRL_TYPES[dmgType]) {
    if (tgt.maxMrl <= 0 || tgt.down) amt = 0;
    tgt.mrl = Math.max(0, tgt.mrl - amt);
    emit(b, { type: 'damage', actor: srcId, target: tgt.id, amount: amt, dmgType, resource: 'mrl', resist: r, mult, crit, value: tgt.mrl });
    if (amt > 0) phobiaDamage(b, tgt, dmgType, src);
    if (amt > 0 && isAlive(tgt)) {
      if (!tgt.nadlom && tgt.mrl <= tgt.maxMrl * NADLOM_FRACTION) {
        tgt.nadlom = true;
        emit(b, { type: 'nadlom', target: tgt.id });
      }
      if (tgt.mrl <= 0) breakdown(b, tgt);
    }
    return amt;
  }

  let absorbed = 0;
  if (tgt.shield && amt > 0) {
    const pierce = modValue(b, tgt, 'shieldPierce') || 0;
    const direct = Math.ceil(amt * pierce);
    absorbed = Math.min(amt - direct, tgt.shield.value);
    tgt.shield.value -= absorbed;
    amt -= absorbed;
    if (tgt.shield.value <= 0) {
      tgt.shield = null;
      emit(b, { type: 'shieldBreak', target: tgt.id });
    }
  }
  if (tgt.down) {
    emit(b, { type: 'damage', actor: srcId, target: tgt.id, amount: amt, absorbed, dmgType, resource: 'hp', resist: r, mult, crit, value: 0 });
    if (amt > 0) {
      tgt.downTurns += crit ? 2 : 1;
      if (tgt.downTurns >= DOWN_TURNS_TO_DEATH) kill(b, tgt, 'finished');
    }
    return amt;
  }
  const tx = tgt.x, ty = tgt.y;
  tgt.hp -= amt;
  tgt.roundHpLoss += amt;
  emit(b, { type: 'damage', actor: srcId, target: tgt.id, amount: amt, absorbed, dmgType, resource: 'hp', resist: r, mult, crit, value: Math.max(0, tgt.hp) });
  if (tgt.hp <= 0) zeroHp(b, tgt, src);
  else if (amt > 0) { bigHitCheck(b, tgt); phobiaDamage(b, tgt, dmgType, src); if (opts && opts.phobia) phobiaTrigger(b, tgt, opts.phobia, null); }
  if (amt > 0 && tgt.arch === 'boss') archOnDamage(b, tgt);
  if (amt > 0 && isAlive(tgt)) damageReactions(b, src, tgt, dmgType, opts);
  if (amt > 0 && isAlive(tgt)) triggerReactions(b, 'allyDamaged', tgt, src);
  if (amt > 0 && (dmgType === 'fire' || dmgType === 'electric') && !(opts && (opts.surface || opts.extra))) elementHit(b, src, tx, ty, dmgType);
  return amt;
}

/** Stage B: statuses reacting to damage (oiled + fire, wet + electric, fire thaws ice) and «Запах крови». */
function damageReactions(b, src, tgt, dmgType, opts) {
  if (dmgType) {
    for (const st of tgt.statuses.slice()) {
      const d = statusDef(b, st.id);
      if (!d || !tgt.statuses.includes(st)) continue;
      if (d.endOnDmg && d.endOnDmg.includes(dmgType)) { removeStatus(b, tgt, st.id); continue; }
      if (d.onDmgStatus && d.onDmgStatus[dmgType]) {
        const [id, turns] = d.onDmgStatus[dmgType];
        applyStatus(b, tgt, id, turns, src || null);
      }
      if (d.onDmgExtra && d.onDmgExtra[dmgType] && !(opts && opts.extra) && isAlive(tgt)) {
        const L = (src && src.level) || battleLevel(b);
        dealDamage(b, src, tgt, rollDice(b.rng, d.onDmgExtra[dmgType]) * tierFor(b, L), dmgType, { extra: true });
      }
      if (!isAlive(tgt)) return;
    }
  }
  const share = b.data.surfaceRules?.scentHpShare;
  if (share && tgt.roundHpLoss >= tgt.maxHp * share && !hasStatus(tgt, 'scent') && tgt.tags.includes('organic') && statusDef(b, 'scent')) {
    applyStatus(b, tgt, 'scent', null, null);
  }
}

function zeroHp(b, u, src) {
  if (u.deathSavesLeft > 0) {
    u.deathSavesLeft--;
    u.hp = 1;
    emit(b, { type: 'deathSave', target: u.id });
    return;
  }
  u.hp = 0;
  if (HERO_KINDS[u.kind]) {
    u.down = true;
    u.downTurns = 0;
    u.shield = null;
    emit(b, { type: 'down', target: u.id, actor: src ? src.id : null });
    for (const a of b.units) if (a !== u && a.team === u.team && isStanding(a)) phobiaTrigger(b, a, 'blood', src);
    if (!checkVictory(b)) triggerReactions(b, 'allyDown', u, src);
  } else {
    kill(b, u, 'killed');
  }
}

function bigHitCheck(b, u) {
  if (u.bigHitRound === b.round || u.roundHpLoss < u.maxHp * BIG_HIT_FRACTION) return;
  u.bigHitRound = b.round;
  const ok = rollSave(b, u, BIG_HIT_SAVE, BIG_HIT_DC, null, 'bigHit');
  emit(b, { type: 'bigHit', target: u.id, success: ok });
  if (!ok) applyStatus(b, u, 'stun', 1, null);
}

function breakdown(b, u) {
  const roll = 1 + Math.floor(b.rng() * 20);
  if (roll <= BREAKDOWN_HEARTBREAK_MAX) {
    const before = u.hp;
    u.hp = Math.max(1, u.hp - Math.floor(u.hp * HEARTBREAK_HP_LOSS));
    emit(b, { type: 'breakdown', target: u.id, roll, result: 'heartbreak', amount: before - u.hp, value: u.hp });
  } else if (!HERO_KINDS[u.kind] && !u.boss) {
    // v1.2: non-boss enemies and summons are «Сломлен» — surrender / flee, out of the battle (counts as defeated)
    emit(b, { type: 'breakdown', target: u.id, roll, result: 'broken' });
    u.mrl = 0;
    u.broken = true;
    u.removed = true;
    u.shield = null;
    clearPos(b, u);
    emit(b, { type: 'broken', target: u.id });
    checkVictory(b);
    return;
  } else {
    u.lostControl = 1;
    u.lostControlFresh = !!(b.turn && b.turn.unitId === u.id);
    emit(b, { type: 'breakdown', target: u.id, roll, result: 'lostControl' });
  }
  u.mrl = Math.floor(u.maxMrl * BREAKDOWN_MRL_RESET);
}

/** Heal a resource. Healing an unconscious unit's HP revives it. Returns amount healed. */
export function healUnit(b, src, tgt, amount, resource = 'hp') {
  if (!isAlive(tgt) || amount <= 0) return 0;
  amount = Math.floor(amount);
  let got = 0;
  if (resource === 'hp') {
    if (tgt.down) {
      tgt.down = false;
      tgt.downTurns = 0;
      tgt.hp = Math.min(tgt.maxHp, amount);
      got = tgt.hp;
      emit(b, { type: 'stabilize', actor: src ? src.id : null, target: tgt.id, value: tgt.hp });
    } else {
      const hm = modProduct(b, tgt, 'healMul');
      if (hm !== 1) amount = Math.max(1, Math.floor(amount * hm));
      got = Math.min(tgt.maxHp - tgt.hp, amount);
      tgt.hp += got;
    }
    for (let i = tgt.statuses.length - 1; i >= 0; i--) {
      const st = tgt.statuses[i];
      const d = statusDef(b, st.id);
      if (d?.endOnHeal) removeStatus(b, tgt, st.id);
      else if (d?.healShortens && st.turns != null && (st.turns -= d.healShortens) <= 0) removeStatus(b, tgt, st.id);
    }
  } else if (resource === 'mrl') {
    got = Math.min(tgt.maxMrl - tgt.mrl, amount);
    tgt.mrl += got;
    if (tgt.nadlom && tgt.mrl > tgt.maxMrl * NADLOM_FRACTION) tgt.nadlom = false;
  } else if (resource === 'enr') {
    got = Math.min(tgt.maxEnr - tgt.enr, amount);
    tgt.enr += got;
  }
  emit(b, { type: 'heal', actor: src ? src.id : null, target: tgt.id, amount: got, resource, value: tgt[resource] });
  return got;
}

// ---------------------------------------------------------------- statuses, buffs, shields

/** Apply a status. dc — DC for endSave (defaults to 12). value — mark value (incomingDmg override). */
export function applyStatus(b, tgt, id, turns, src, value, dc) {
  if (!isAlive(tgt)) return false;
  const d = statusDef(b, id);
  if (!d) {
    emit(b, { type: 'statusUnknown', target: tgt.id, id });
    return false;
  }
  if (tgt.immuneStatus.includes(id) || (d.immuneTags && d.immuneTags.some((t) => unitHasTag(tgt, t)))) {
    emit(b, { type: 'statusImmune', actor: src ? src.id : null, target: tgt.id, id });
    return false;
  }
  // Stage B interactions (effects.js header): swaps, blockers, upgrades, mutual removal
  if (d.organicSwap && tgt.tags.includes('organic') && !tgt.tags.includes('hybrid')) {
    return applyStatus(b, tgt, d.organicSwap.id, d.organicSwap.turns, src, value, dc);
  }
  if (d.blockedBy) {
    for (const bid of Object.keys(d.blockedBy)) {
      if (!hasStatus(tgt, bid)) continue;
      removeStatus(b, tgt, bid);
      emit(b, { type: 'extinguish', actor: src ? src.id : null, target: tgt.id, id, by: bid });
      return false;
    }
  }
  if (d.upgradeTo && hasStatus(tgt, id) && statusDef(b, d.upgradeTo)) {
    removeStatus(b, tgt, id);
    return applyStatus(b, tgt, d.upgradeTo, null, src, value, dc);
  }
  if (d.removes) for (const rid of d.removes) if (rid !== id && hasStatus(tgt, rid)) removeStatus(b, tgt, rid);
  let n = turns ?? (d.turns === null ? null : d.turns ?? 1);
  if (d.wetTurns && n != null && hasStatus(tgt, 'wet')) n = Math.max(n, d.wetTurns);
  const fct = statusFactor(b, tgt, id);
  if (fct !== 1 && n != null) n = Math.max(1, Math.round(n * fct));
  const fresh = !!(b.turn && b.turn.unitId === tgt.id);
  const cur = getStatus(tgt, id);
  const level = (src && src.level) || null;
  if (cur) {
    cur.turns = n == null || cur.turns == null ? null : Math.max(cur.turns, n);
    if (src) cur.source = src.id;
    if (value != null) cur.value = Math.max(cur.value ?? 0, value);
    if (dc != null) cur.dc = Math.max(cur.dc ?? 0, dc);
    if (cur.turns != null && n == null) cur.turns = null;
    if (level) cur.level = level;
    cur.fresh = cur.fresh || fresh;
  } else {
    tgt.statuses.push({ id, turns: n, source: src ? src.id : null, fresh, value: value ?? null, dc: dc ?? null, stack: 0, stackStat: null, level });
  }
  emit(b, { type: 'status', actor: src ? src.id : null, target: tgt.id, id, turns: n });
  if (d.withTag) {
    for (const [tag, [wid, wt]] of Object.entries(d.withTag)) if (wid !== id && unitHasTag(tgt, tag)) applyStatus(b, tgt, wid, wt, src, null, dc);
  }
  return true;
}

export function removeStatus(b, u, id) {
  for (let i = u.statuses.length - 1; i >= 0; i--) {
    if (u.statuses[i].id === id) {
      u.statuses.splice(i, 1);
      emit(b, { type: 'statusEnd', target: u.id, id });
      if (u.baseMaxHp != null && !u.statuses.some((s) => statusDef(b, s.id)?.tick?.op === 'maxHpLoss')) { u.maxHp = u.baseMaxHp; u.baseMaxHp = null; }
    }
  }
}

function addBuff(b, src, tgt, stat, value, turns) {
  tgt.buffs.push({ stat, value, turns: turns ?? 1, fresh: !!(b.turn && b.turn.unitId === tgt.id), source: src ? src.id : null });
  emit(b, { type: 'buff', actor: src ? src.id : null, target: tgt.id, stat, value, turns: turns ?? 1 });
}

/**
 * Temporary HP (UI «Врем. ЗДР», D&D temp hit points). Default: until the battle ends (turns null);
 * explicit `turns` (enemy shields) count the owner's turns as statuses do. Never stacks: the bigger value
 * stays (a kept shield still gets the longer duration). Mech armour shields share the same slot.
 */
function addShield(b, src, tgt, value, turns) {
  value = Math.floor(value);
  if (!(value > 0)) return;
  const tn = turns ?? null;
  const fresh = !!(b.turn && b.turn.unitId === tgt.id);
  if (tgt.shield && tgt.shield.value >= value) {
    const cur = tgt.shield;
    if (cur.turns != null && (tn == null || tn > cur.turns)) { cur.turns = tn; cur.fresh = fresh; }
    emit(b, { type: 'shield', actor: src ? src.id : null, target: tgt.id, value: cur.value, kept: true, turns: cur.turns });
    return;
  }
  tgt.shield = { value, turns: tn, fresh, mech: tgt.shield?.mech || undefined };
  emit(b, { type: 'shield', actor: src ? src.id : null, target: tgt.id, value, turns: tn });
}

/** +dice from a nextRollDice status (inspired); the status is consumed. */
function consumeNextRoll(b, u) {
  const e = modFlag(b, u, 'nextRollDice');
  if (!e) return 0;
  const dice = statusDef(b, e.id).mods.nextRollDice;
  removeStatus(b, u, e.id);
  return rollDice(b.rng, typeof dice === 'string' ? dice : '1d4');
}

// ---------------------------------------------------------------- rolls

function saveMode(u, stat) {
  const adv = u.advantages.includes('save' + stat[0].toUpperCase() + stat.slice(1)) || u.advantages.includes('save');
  const dis = stat === 'wil' && u.maxMrl > 0 && u.mrl <= u.maxMrl * NADLOM_FRACTION; // «Надлом»
  return { adv, dis };
}
function saveBonusOf(b, u, stat) {
  let sm = 0;
  for (const s of u.statuses) { const v = statusDef(b, s.id)?.mods?.saveMods?.[stat]; if (v) sm += v; }
  return mod(effStat(b, u, stat)) + (u.saves.includes(stat) ? u.prof : 0) + statusMod(b, u, 'saves', 'save') + buffSum(u, 'save') + sm;
}

/** Saving throw. Returns true on success. */
export function rollSave(b, u, stat, dc, src, reason) {
  const r = d20(b.rng, saveMode(u, stat));
  const bonus = saveBonusOf(b, u, stat) + consumeNextRoll(b, u);
  const total = r.natural + bonus;
  const success = total >= dc;
  emit(b, { type: 'save', actor: src ? src.id : null, target: u.id, stat, dc, roll: { natural: r.natural, rolls: r.rolls, mode: r.mode, bonus, total }, success, reason: reason || null });
  return success;
}

/** v1.2: a standing hostile adjacent to (x, y) -> ranged attacks from there have disadvantage. */
export function enemyAdjacent(b, att, x = att.x, y = att.y) {
  for (const e of b.units) {
    if (e === att || !isStanding(e) || !isHostile(b, att, e)) continue;
    if (Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) return true;
  }
  return false;
}

function attackMode(b, att, tgt, melee, isWeapon, fx = att.x, fy = att.y) {
  const adv = !!modFlag(b, att, 'attackAdv') || !!modFlag(b, att, 'firstAttackAdv') || !!modFlag(b, tgt, 'attackedAdv')
    || (melee && !!modFlag(b, tgt, 'attackedAdvMelee')) || tgt.down
    || (att.kind !== 'hero' && hasStatus(tgt, 'scent') && att.tags.includes('beast') && tgt.hp <= tgt.maxHp * 0.5);
  const dis = !!modFlag(b, att, 'attackDisadv') || !!modFlag(b, tgt, 'attackedDisadv')
    || (!melee && !!modFlag(b, tgt, 'attackedDisadvRanged')) || (isWeapon && att.weaponTier <= 1) || (!melee && enemyAdjacent(b, att, fx, fy)) || !!att.armorPenalty || !!(att.reqPenalty && att.reqPenalty.length)
    || (!melee && !!modFlag(b, att, 'rangedDisadv'))
    || (!melee && !(isWeapon && att.weapon?.ignoreSmoke) && (b.zones.length > 0 || b.surfaces.size > 0) && smokeBetween(b, fx, fy, tgt.x, tgt.y));
  return { adv, dis };
}

/** Attack roll d20 + bonus >= KB. Triggers selfAttacked reactions. Returns { hit, crit, extraDice }. */
/** v3: armour piercing of the attacker's weapon — ignores up to weapon.ap of the target's armour KB. */
function apReduction(att, tgt, isWeapon) {
  const ap = isWeapon && att.weapon ? att.weapon.ap || 0 : 0;
  return ap > 0 ? Math.min(ap, tgt.armorKb || 0) : 0;
}

/**
 * Attack roll d20 + bonus >= KB (+ kbPenalty for later burst shots). Triggers selfAttacked reactions (unless
 * opts.noReact). Returns { hit, crit, extraDice }.
 */
function attackRoll(b, att, tgt, bonus, melee, isWeapon, opts) {
  if (!(opts && opts.noReact)) triggerReactions(b, 'selfAttacked', tgt, att);
  if (!isAlive(tgt) || !isStanding(att)) return { hit: false, crit: false, extraDice: 0 };
  const extraDice = isWeapon ? statusMod(b, att, 'extraWeaponDice') : 0;
  const r = d20(b.rng, attackMode(b, att, tgt, melee, isWeapon));
  const total = r.natural + bonus + att.hitBonus + condBonus(att, tgt, 'hit') + statusMod(b, att, 'hit') + buffSum(att, 'hit') + consumeNextRoll(b, att)
    + (b.surfaces.size ? surfaceHitBonus(b, att) : 0) + terrainHit(b, att, tgt, melee).total + (att.arch ? archHit(b, att) : 0);
  const arc = isWeapon && !melee && att.weapon && att.weapon.arc;
  const kb = getKb(b, tgt, arc ? null : att, !melee) - apReduction(att, tgt, isWeapon) + ((opts && opts.kbPenalty) || 0);
  let crit = r.natural >= Math.min(20, att.critRange || 20);
  const hit = r.natural !== 1 && (crit || total >= kb);
  if (modFlag(b, att, 'noCrit')) crit = false;
  if (hit && tgt.down) crit = true;
  if (!hit) crit = false;
  emit(b, { type: 'attack', actor: att.id, target: tgt.id, roll: { natural: r.natural, rolls: r.rolls, mode: r.mode, bonus: total - r.natural, total }, kb, hit, crit, melee });
  breakStatuses(b, att, 'attack');
  return { hit, crit, extraDice, natural: r.natural };
}

function attackDmgBonus(b, att, tgt, kind) {
  let v = (att.dmgBonus.all || 0) + (att.dmgBonus[kind] || 0) + condBonus(att, tgt, 'dmg') + buffSum(att, 'dmg') + statusMod(b, att, 'dmg') + incomingDmg(b, tgt)
    + (att.arch ? archDmg(b, att) : 0);
  if (kind === 'melee') v += statusMod(b, att, 'dmgMelee', 'meleeDmg');
  return v;
}

function weaponDamage(b, att, tgt, crit, extraWeaponDice, extraDice, extraType, ranged) {
  const w = att.weapon;
  const melee = !ranged && isMeleeWeapon(att);
  const critDice = crit && w.dmgType !== 'proxy';
  let amt = rollDice(b.rng, w.dice, critDice) + mod(effStat(b, att, w.stat || 'str')) + attackDmgBonus(b, att, tgt, melee ? 'melee' : 'ranged')
    + (w.dmg || 0) + dmgTypeTier(att, w.dmgType);
  if (extraWeaponDice > 0) {
    const die = firstDie(w.dice);
    for (let i = 0; die && i < extraWeaponDice; i++) amt += rollDice(b.rng, die, critDice);
  }
  dealDamage(b, att, tgt, Math.max(0, amt), w.dmgType, { crit: critDice });
  if (extraDice && isAlive(tgt)) {
    const type = extraType || w.dmgType;
    const c = crit && type !== 'proxy';
    dealDamage(b, att, tgt, rollDice(b.rng, extraDice, c), type, { crit: c });
  }
  weaponExtra(b, att, tgt, w, crit, false);
  if (((w.onHit && w.onHit.length) || (crit && w.onCrit)) && isAlive(tgt)) weaponOnHit(b, att, tgt, w, crit);
  if (w.surfaceOnHit) weaponSurface(b, att, tgt, w, crit);
}

/** v7 mods: surfaceOnHit [{ kind, size, turns, on: 'hit' | 'crit' }] — a surface under the target (size 1 — its tile). */
function weaponSurface(b, att, tgt, w, crit) {
  if (!surfacesOn(b) || tgt.x < 0) return;
  for (const so of w.surfaceOnHit) {
    if (!so || !so.kind || (so.on === 'crit' && !crit)) continue;
    createSurface(b, so.kind, radiusTiles(b, tgt.x, tgt.y, Math.max(0, (so.size || 1) - 1)), att.id, { turns: so.turns });
  }
}

/** v3.1 extra damage on a hit: [{ dice, dmgType, only?, cond? }] (half — area weapon save). */
function weaponExtra(b, att, tgt, w, crit, half) {
  if (!w.extra) return;
  for (const ex of w.extra) {
    if (!isAlive(tgt)) break;
    if (!ex || !ex.dice || (ex.only && !tagOk(tgt, ex.only)) || (ex.cond && !condMatches(ex.cond, tgt))) continue;
    const type = ex.dmgType || w.dmgType;
    const c = crit && type !== 'proxy';
    let amt = rollDice(b.rng, ex.dice, c);
    if (half) amt = Math.floor(amt / 2);
    dealDamage(b, att, tgt, amt, type, { crit: c });
  }
}

/** «Тип урона» tier bonus (equipment.js DMG_TYPE_TIER_DMG). */
function dmgTypeTier(u, dmgType) {
  return (u.dmgTypeBonus && dmgType && u.dmgTypeBonus[dmgType]) || 0;
}

/** v3 weapon properties on a hit: ops (status with chance / save vs 8 + prof + mod(weapon stat)). */
function weaponOnHit(b, att, tgt, w, crit) {
  const dc = 8 + att.prof + mod(effStat(b, att, w.stat || 'str'));
  const hasCrit = !!(w.onCrit && w.onCrit.length);
  const list = [...(w.onHit || []).filter((op) => !(hasCrit && op.fromCrit)), ...(crit && hasCrit ? w.onCrit : [])];
  for (const op of list) {
    if (!isAlive(tgt)) break;
    if (op.chance != null && b.rng() >= op.chance) continue;
    if (op.save && rollSave(b, tgt, op.save, dc, att, 'onHit:' + (w.id || w.name))) continue;
    applyOp(b, att, tgt, op, { dc });
  }
}

/** v2 passive thorns ({ dice, dmgType }): a melee hit on tgt hurts the attacker. */
function applyThorns(b, att, tgt) {
  if (!tgt.thorns || !tgt.thorns.length || !isAlive(att) || !isAlive(tgt) || tgt.down) return;
  for (const th of tgt.thorns) {
    if (!isAlive(att)) break;
    emit(b, { type: 'thorns', actor: tgt.id, target: att.id });
    dealDamage(b, tgt, att, rollDice(b.rng, th.dice || '1d4'), th.dmgType || null);
  }
}

/** Full weapon attack (roll + damage). Returns { hit, crit }. */
function weaponAttack(b, att, tgt, op) {
  if (!att.weapon) return { hit: false, crit: false };
  const melee = isMeleeWeapon(att);
  payWeapon(b, att);
  if (!melee && glitchLag(b, att, tgt)) return { hit: false, crit: false };
  const res = attackRoll(b, att, tgt, weaponAttackBonus(b, att) + ((op && op.hit) || 0), melee, true);
  if (res.hit) {
    weaponDamage(b, att, tgt, res.crit, res.extraDice, op && op.extraDice, op && op.extraType);
    if (melee) applyThorns(b, att, tgt);
  }
  if (res.natural != null && isAlive(att)) afterShot(b, att, res.natural);
  return res;
}

/** Stage B glitch: the bearer's status with a `glitch` spec, or null. */
function glitchSpec(b, u) {
  for (const s of u.statuses) { const g = statusDef(b, s.id)?.glitch; if (g) return g; }
  return null;
}
/** Ranged shot «lag» under glitch: the shot misses (event glitchLag). */
function glitchLag(b, att, tgt) {
  const g = u_glitch(b, att);
  if (!g || !g.lag || b.rng() >= g.lag) return false;
  emit(b, { type: 'glitchLag', actor: att.id, target: tgt.id });
  return true;
}
const u_glitch = (b, u) => (u.statuses.length ? glitchSpec(b, u) : null);
/** overload: after an attack / offensive ability the bearer hurts itself (selfDmg). */
function selfDamage(b, u) {
  if (!isAlive(u) || !u.statuses.length) return;
  for (const s of u.statuses.slice()) {
    const sd = statusDef(b, s.id)?.selfDmg;
    if (sd && isAlive(u)) dealDamage(b, null, u, rollDice(b.rng, sd.dice), sd.dmgType || null, { surface: true });
  }
}

/** Weapon save DC (area weapons): 8 + prof + mod(weapon stat). */
export const weaponDc = (b, u) => 8 + u.prof + mod(effStat(b, u, (u.weapon && u.weapon.stat) || 'str'));
/** Ability-shaped view of an area weapon (targeting via abilityTargets / inArea). */
export const weaponAreaAbility = (u) => ({ id: 'weapon:area', target: 'tile', area: u.weapon.area, range: weaponRange(u), effects: [] });

/** v3.1 area weapon: everyone hostile in the area saves; damage = weapon dice + mod + bonuses, half on save. */
function areaWeaponAttack(b, att, center) {
  const w = att.weapon;
  payWeapon(b, att);
  const save = w.area.save || 'dex';
  const dc = weaponDc(b, att);
  const targets = abilityTargets(b, att, weaponAreaAbility(att), center);
  emit(b, { type: 'weaponArea', actor: att.id, x: center.x, y: center.y, shape: w.area.shape, size: w.area.size || 1, targets: targets.map((t) => t.id) });
  if (b.barrels && b.barrels.length) breakBarrelsIn(b, (x, y) => inArea(b, att, weaponAreaAbility(att), center, { x, y }) || (x === center.x && y === center.y), att);
  if (b.objects && b.objects.size) damageObjectsIn(b, (x, y) => inArea(b, att, weaponAreaAbility(att), center, { x, y }), rollDice(b.rng, w.dice), att, w.dmgType);
  for (const t of targets) {
    if (!isAlive(t)) continue;
    const half = rollSave(b, t, save, dc, att, 'weapon:' + (w.id || w.name));
    let amt = rollDice(b.rng, w.dice) + mod(effStat(b, att, w.stat || 'str')) + attackDmgBonus(b, att, t, 'ranged') + (w.dmg || 0) + dmgTypeTier(att, w.dmgType);
    if (half) amt = Math.floor(amt / 2);
    dealDamage(b, att, t, Math.max(0, amt), w.dmgType);
    weaponExtra(b, att, t, w, false, half);
    if (!half && w.onHit && w.onHit.length && isAlive(t)) weaponOnHit(b, att, t, w, false);
  }
  breakStatuses(b, att, 'attack');
  if (isAlive(att)) afterShot(b, att, null);
}

/** v3.1 thrown melee weapon: ranged attack, the weapon drops near the target; fists until picked up. */
function throwWeapon(b, att, tgt) {
  const w = att.weapon;
  payWeapon(b, att);
  const res = attackRoll(b, att, tgt, weaponAttackBonus(b, att), false, true);
  if (res.hit) weaponDamage(b, att, tgt, res.crit, res.extraDice, null, null, true);
  const spot = isAlive(tgt) && tgt.x >= 0 ? nearestFree(b.grid, tgt.x, tgt.y, b.occ) || { x: att.x, y: att.y } : { x: tgt.x, y: tgt.y };
  const drop = { id: `drop${b.drops.length + 1}`, x: spot.x, y: spot.y, owner: att.id, weapon: w, tier: att.weaponTier, attackBonus: att.attackBonus };
  b.drops.push(drop);
  att.weapon = { ...UNARMED };
  att.weaponTier = 2;
  if (att.attackBonus != null) att.attackBonus = mod(effStat(b, att, 'str')) + att.prof;
  emit(b, { type: 'throw', actor: att.id, target: tgt.id, hit: res.hit, drop: drop.id, x: spot.x, y: spot.y, item: w.id || w.name });
  return res;
}

/** Own dropped weapon on u's tile → back in hand. */
function pickUpCheck(b, u) {
  const i = b.drops.findIndex((d) => d.owner === u.id && d.x === u.x && d.y === u.y);
  if (i < 0) return;
  const d = b.drops.splice(i, 1)[0];
  u.weapon = d.weapon; u.weaponTier = d.tier; u.attackBonus = d.attackBonus;
  emit(b, { type: 'pickUp', actor: u.id, drop: d.id, item: d.weapon.id || d.weapon.name });
}
export const ownDrop = (b, u) => b.drops.find((d) => d.owner === u.id) || null;

// ---------------------------------------------------------------- zones (smoke)

/** Zone spec of an ability: a.zone or an effect { op: 'zone' }. */
export function zoneOf(a) {
  if (!a) return null;
  if (a.zone) return a.zone;
  return (a.effects || []).find((e) => e.op === 'zone') || null;
}

function placeZone(b, u, a, center) {
  const z = zoneOf(a);
  if ((z.kind || 'smoke') === 'smoke' && surfacesOn(b) && b.data.surfaces.smoke) {
    const size = z.size ?? (a.area ? a.area.size || 1 : 1);
    createSurface(b, 'smoke', radiusTiles(b, center.x, center.y, size), u, { turns: z.turns, size });
    return null;
  }
  const zone = {
    id: `zone${++b.zoneCount}`, kind: z.kind || 'smoke', x: center.x, y: center.y,
    size: z.size ?? (a.area ? a.area.size || 1 : 1), turns: z.turns ?? 2, owner: u.id, team: u.team,
    rangedDis: z.rangedDis ?? (z.kind || 'smoke') === 'smoke',
  };
  b.zones.push(zone);
  emit(b, { type: 'zone', actor: u.id, zone: zone.id, kind: zone.kind, x: zone.x, y: zone.y, size: zone.size, turns: zone.turns });
  return zone;
}

function tickZones(b) {
  for (let i = b.zones.length - 1; i >= 0; i--) {
    const z = b.zones[i];
    if (--z.turns <= 0) { b.zones.splice(i, 1); emit(b, { type: 'zoneEnd', zone: z.id }); }
  }
}

export const inZone = (z, x, y) => chebyshev(z.x, z.y, x, y) <= z.size;

/** Does the line a → t (ends included) touch a smoke zone? */
export function smokeBetween(b, ax, ay, tx, ty) {
  for (const z of b.zones) {
    if (!z.rangedDis) continue;
    if (inZone(z, ax, ay) || inZone(z, tx, ty)) return true;
    if (walkLine(ax, ay, tx, ty, (x, y) => inZone(z, x, y))) return true;
  }
  return gasBetween(b, ax, ay, tx, ty);
}

// ---------------------------------------------------------------- surfaces (rules/surfaces.js) glue

/** Tiles a surface spec covers: op.size → radius around the centre; null size → the ability area; else 1 tile. */
function surfaceTiles(b, u, a, op, center) {
  if (op.size != null) return radiusTiles(b, center.x, center.y, op.size);
  if (a && a.area) {
    const out = [];
    const sz = a.area.size || 1;
    const ox = a.area.shape === 'radius' ? center.x : u.x, oy = a.area.shape === 'radius' ? center.y : u.y;
    for (let y = oy - sz; y <= oy + sz; y++) for (let x = ox - sz; x <= ox + sz; x++) {
      if (!inBounds(b.grid, x, y)) continue;
      if (inArea(b, u, a, center, { x, y })) out.push({ x, y });
    }
    if (a.area.shape === 'radius' && !out.some((p) => p.x === center.x && p.y === center.y)) out.push({ ...center });
    return out;
  }
  return [{ x: center.x, y: center.y }];
}
/** Place one surface op / spec { kind, size, turns } of ability a at center. */
function placeSurfaceOp(b, u, a, op, center, tgt) {
  if (!surfacesOn(b) || !op || !op.kind) return;
  if (op.ifSurface && !surfaceKindsAt(b, center.x, center.y).some((k) => [].concat(op.ifSurface).includes(k))) return;
  createSurface(b, op.kind, surfaceTiles(b, u, tgt ? null : a, op, center), u, { turns: op.turns ?? undefined, size: op.size ?? (a && a.area ? a.area.size : 0) });
}
/** Center of an ability's area (self / target unit / tile). */
function abilityCenter(b, u, a, spec) {
  return isSelfCentered(u, a, spec) ? { x: u.x, y: u.y } : spec && spec.unit && b.byId[spec.unit] ? { x: b.byId[spec.unit].x, y: b.byId[spec.unit].y }
    : spec && spec.x != null ? { x: spec.x, y: spec.y } : { x: u.x, y: u.y };
}
/** Path of a move to `to` (index) that avoids harmful surfaces if a detour costs ≤ 3 extra steps. */
export function movePath(b, u, to) {
  const reach = getReachable(b, u.id);
  const idx = to.y * b.grid.w + to.x;
  const path = pathTo(reach, idx);
  if (!path || !b.surfaces.size || !surfacesOn(b)) return path;
  const harmful = (p) => surfaceHarm(b, u, p.x, p.y) > 0;
  if (!path.slice(0, -1).some(harmful)) return path;
  const blocked = new Uint8Array(b.grid.w * b.grid.h);
  for (const k of b.surfaces.keys()) {
    const [x, y] = k.split(',').map(Number);
    if ((x !== to.x || y !== to.y) && surfaceHarm(b, u, x, y) > 0) blocked[y * b.grid.w + x] = 1;
  }
  const move = b.turn && b.turn.unitId === u.id ? b.turn.move : getSpeed(b, u);
  const alt = pathTo(reachable(b.grid, u.x, u.y, move, b.occ, { blocked }), idx);
  return alt && alt.length <= path.length + 3 ? alt : path;
}

// ---------------------------------------------------------------- movement

/** v4 N6 Acrobatics trick (decision 18): for the rest of its turn the unit passes hazard tiles (and any zone that
 * deals damage on entry) without damage. A flag on b.turn, so it ends with the turn. Returns false if not its turn. */
export function grantSafePassage(b, u) {
  if (!b.turn || b.turn.unitId !== u.id) return false;
  b.turn.safePassage = true;
  emit(b, { type: 'safePassage', actor: u.id });
  return true;
}
export const hasSafePassage = (b, u) => !!(b.turn && b.turn.safePassage && b.turn.unitId === u.id);

function hazardEnter(b, u) {
  if (surfacesOn(b)) { if (b.surfaces.size && cellAt(b, u.x, u.y)) surfaceEffect(b, u, 'enter'); return; }
  if (tileAt(b.grid, u.x, u.y) !== T_HAZARD || !isAlive(u)) return;
  if (hasSafePassage(b, u)) { emit(b, { type: 'hazard', target: u.id, x: u.x, y: u.y, avoided: true }); return; }
  emit(b, { type: 'hazard', target: u.id, x: u.x, y: u.y });
  phobiaTrigger(b, u, 'hazard', null);
  dealDamage(b, null, u, rollDice(b.rng, '1d6'), 'fire');
}

/** noApproachSource (fear): the move may not END closer to the source than it started. */
function approachOk(b, u, x, y) {
  for (const s of u.statuses) {
    if (!s.source || !statusDef(b, s.id)?.mods?.noApproachSource) continue;
    const src = b.byId[s.source];
    if (!src || !isAlive(src)) continue;
    if (chebyshev(x, y, src.x, src.y) < chebyshev(u.x, u.y, src.x, src.y)) return false;
  }
  return true;
}

/** Reachable tiles for a unit with its remaining movement (cached per occupancy state). */
export function getReachable(b, unitId) {
  const u = b.byId[unitId];
  const move = b.turn && b.turn.unitId === unitId ? b.turn.move : getSpeed(b, u);
  const c = b.reachCache;
  if (c && c.id === unitId && c.x === u.x && c.y === u.y && c.move === move && c.v === b.occVersion) return c.reach;
  const reach = reachable(b.grid, u.x, u.y, move, b.occ);
  b.reachCache = { id: unitId, x: u.x, y: u.y, move, v: b.occVersion, reach };
  return reach;
}

/** Walk along a path: opportunity attacks, hazards. Returns steps taken. noProvoke — disengage/dash op. */
function walk(b, u, path, noProvoke) {
  let seg = [];
  let steps = 0;
  const from = { x: u.x, y: u.y };
  const flush = () => {
    if (seg.length) emit(b, { type: 'move', actor: u.id, from: { ...from }, path: seg, to: { x: u.x, y: u.y } });
    seg = [];
    from.x = u.x; from.y = u.y;
  };
  const sx = u.x, sy = u.y;
  for (const step of path) {
    if (!isStanding(u) || b.winner) break;
    if (!noProvoke && !b.reactionDepth) {
      let provokers = null;
      for (const r of b.units) {
        if (!isStanding(r) || r.team === u.team || r.reactionUsed) continue;
        if (chebyshev(r.x, r.y, u.x, u.y) !== 1 || chebyshev(r.x, r.y, step.x, step.y) <= 1) continue;
        (provokers || (provokers = [])).push(r);
      }
      if (provokers) {
        flush();
        for (const r of provokers) { if (isStanding(u)) opportunity(b, r, u); }
        if (!isStanding(u) || b.winner) break;
      }
    }
    if (unitAt(b, step.x, step.y)) break;
    setPos(b, u, step.x, step.y);
    steps++;
    seg.push({ x: step.x, y: step.y });
    if (b.surfaces.size ? cellAt(b, u.x, u.y) : tileAt(b.grid, u.x, u.y) === T_HAZARD) { flush(); hazardEnter(b, u); }
    if (b.traps.length && trapAt(b, u.x, u.y, u)) { flush(); trapCheck(b, u); }
    if (b.drops.length) pickUpCheck(b, u);
  }
  flush();
  return pathCost(b.grid, sx, sy, path, steps); // movement spent (rubble / steps up cost more)
}

function opportunity(b, r, mover) {
  if (r.reactionUsed || !isStanding(r) || skipsTurn(b, r)) return;
  const a = r.abilities.find((x) => x.action === 'reaction' && x.trigger === 'enemyLeaves' && (x.cost || 0) <= r.enr && abilityUsable(b, r, x, true) === null);
  if (a && targetValid(b, r, a, { unit: mover.id })) {
    b.reactionDepth++;
    emit(b, { type: 'reaction', actor: r.id, target: mover.id, trigger: 'enemyLeaves', ability: a.id });
    resolveAbility(b, r, a, { unit: mover.id }, true);
    b.reactionDepth--;
    return;
  }
  if (!isMeleeUnit(r) || !canUseWeapon(b, r)) return;
  r.reactionUsed = true;
  b.reactionDepth++;
  emit(b, { type: 'opportunity', actor: r.id, target: mover.id });
  weaponAttack(b, r, mover, null);
  b.reactionDepth--;
}

function pushUnit(b, src, tgt, tiles) {
  const dx = Math.sign(tgt.x - src.x), dy = Math.sign(tgt.y - src.y);
  if (!dx && !dy) return;
  for (const st of tgt.statuses) tiles += statusDef(b, st.id)?.pushPlus || 0;
  const C = b.data.combat;
  // combat rework §3.4: heavy targets (mechanical KB 18+, bosses) are pushed 1 tile less
  if (C && (tgt.boss || (tgt.tags.includes('mechanical') && tgt.kb >= (C.push.heavyKb ?? 18)))) tiles = Math.max(0, tiles - 1);
  const from = { x: tgt.x, y: tgt.y };
  let moved = 0, fall = 0, blocker = null;
  for (let i = 0; i < tiles; i++) {
    const nx = tgt.x + dx, ny = tgt.y + dy;
    const other = unitAt(b, nx, ny);
    const up = C && b.grid.elev ? elevAt(b.grid, nx, ny) - elevAt(b.grid, tgt.x, tgt.y) : 0;
    if (!isPassable(b.grid, nx, ny) || other || up > 0) { blocker = { x: nx, y: ny, unit: other, left: tiles - i }; break; }
    if (up < 0) fall += -up;
    setPos(b, tgt, nx, ny);
    moved++;
    if (tileAt(b.grid, nx, ny) === T_HAZARD || (b.traps.length && trapAt(b, nx, ny, tgt)) || (b.surfaces.size && surfaceHarm(b, tgt, nx, ny) >= 5)) break;
  }
  emit(b, { type: 'push', actor: src.id, target: tgt.id, from, to: { x: tgt.x, y: tgt.y }, tiles: moved });
  const srcU = src.id ? b.byId[src.id] : null;
  if (C && blocker && isAlive(tgt)) {
    // slammed into a wall / object / unit: die × tier blunt per undelivered tile (a unit — half to both)
    const tier = tierFor(b, (srcU && srcU.level) || battleLevel(b));
    let amt = 0;
    for (let k = 0; k < blocker.left; k++) amt += rollDice(b.rng, C.push.die || '1d4');
    amt *= tier;
    emit(b, { type: 'slam', actor: src.id, target: tgt.id, x: blocker.x, y: blocker.y, unit: blocker.unit ? blocker.unit.id : null, amount: amt });
    if (blocker.unit) {
      const half = Math.floor(amt / 2);
      dealDamage(b, srcU, tgt, half, 'blunt');
      if (isAlive(blocker.unit)) dealDamage(b, srcU, blocker.unit, half, 'blunt');
    } else {
      dealDamage(b, srcU, tgt, amt, 'blunt');
      if (objectAt(b, blocker.x, blocker.y)) damageObject(b, blocker.x, blocker.y, amt, srcU, 'blunt');
    }
  }
  if (C && fall > 0 && isAlive(tgt)) fallDamage(b, srcU, tgt, fall);
  if (moved) { hazardEnter(b, tgt); trapCheck(b, tgt); }
}

/** combat rework §3.3: falling N levels — die × N × tier blunt; DEX save (Acrobatics) vs 10 + L/2 — half; `fly` — none. */
export function fallDamage(b, src, u, levels) {
  const C = b.data.combat;
  if (!C || levels <= 0 || !isAlive(u) || u.tags.includes('fly') || u.tags.includes('flying')) return 0;
  const L = battleLevel(b);
  let amt = rollDice(b.rng, C.elev.fallDie || '1d6') * levels * tierFor(b, L);
  const half = rollSave(b, u, 'dex', (C.elev.acroDc ?? 10) + Math.floor(L / 2), src, 'fall');
  if (half) amt = Math.floor(amt / 2);
  emit(b, { type: 'fall', target: u.id, levels, amount: amt, half });
  return dealDamage(b, src, u, amt, 'blunt');
}
/** Weapon attack roll vs the object's armor; a hit deals full weapon damage (crit doubles the dice). */
function smashObject(b, u, o) {
  const w = u.weapon;
  payWeapon(b, u);
  const r = d20(b.rng);
  const total = r.natural + weaponAttackBonus(b, u) + u.hitBonus + buffSum(u, 'hit');
  const crit = r.natural >= 20;
  const hit = r.natural !== 1 && (crit || total >= o.armor);
  emit(b, { type: 'smash', actor: u.id, x: o.x, y: o.y, kind: o.kind, roll: { natural: r.natural, total }, kb: o.armor, hit, crit });
  if (!hit) return;
  const amt = rollDice(b.rng, w.dice, crit) + mod(effStat(b, u, w.stat || 'str')) + (w.dmg || 0) + (u.dmgBonus.all || 0);
  damageObject(b, o.x, o.y, Math.max(1, amt), u, w.dmgType);
}

/** Push tgt away from a point { id, x, y } (gas explosions). */
export function pushFrom(b, src, tgt, tiles) { pushUnit(b, src, tgt, tiles); }

// ---------------------------------------------------------------- abilities: legality & targets

export function abilityRange(u, a) {
  if (a.target === 'self') return 0;
  if (a.range === 'weapon') return weaponRange(u);
  if (a.range != null) return a.range;
  return a.effects && a.effects.some((e) => e.op === 'weapon') ? weaponRange(u) : 1;
}

function hasOp(a, op) { return !!(a.effects && a.effects.some((e) => e.op === op)); }
function moveOp(a) { return a.effects ? a.effects.find((e) => e.op === 'move') : null; }

/** null if usable now, else a reason string. asReaction — checks reaction instead of action economy. */
export function abilityUsable(b, u, a, asReaction) {
  if (a.todo) return 'todo';
  if (isDeathAbility(a)) return 'trigger';
  if (!isStanding(u)) return 'down';
  if (a.usesPerBattle != null && (u.uses[a.id] || 0) >= a.usesPerBattle) return 'uses';
  const cost = a.cost || 0;
  if (cost > u.enr && (!u.overcast || (u.overcastsUsed || 0) >= OVERCAST_LIMIT)) return 'energy';
  if (cost > 0 && modFlag(b, u, 'blockCost')) return 'silence';
  if (hasOp(a, 'weapon') && !canUseWeapon(b, u)) return 'disarm';
  if (asReaction) {
    if (a.action !== 'reaction') return 'action';
    if (u.reactionUsed) return 'reaction';
    return null;
  }
  if (a.action === 'reaction') return 'reaction';
  const t = b.turn;
  if (!t || t.unitId !== u.id) return 'turn';
  if (a.action === 'bonus' ? t.bonus <= 0 : t.actions <= 0) return 'action';
  return null;
}

/** forcedTarget 'source' (taunt): the standing source the unit must attack, or null. */
export function tauntSource(b, u) {
  for (const s of u.statuses) {
    if (statusDef(b, s.id)?.mods?.forcedTarget !== 'source' || !s.source) continue;
    const src = b.byId[s.source];
    if (src && isStanding(src)) return src;
  }
  return null;
}

/** Dash-mode ability movement is impossible at speed 0 (root, speedMul 0). Teleport ignores speed. */
const moveBlocked = (b, u, mv) => mv.mode !== 'teleport' && getSpeed(b, u) === 0;

/**
 * Destination of a `move` op toward a unit target: 'stay' (already adjacent), {x, y}, or null (impossible).
 * Dash: free tile adjacent to the target, reachable within op.tiles. Teleport: free tile within op.tiles in
 * line of sight. Both respect noApproachSource (fear).
 */
function moveDestination(b, u, op, t) {
  if (!t || t === u || chebyshev(u.x, u.y, t.x, t.y) <= 1) return 'stay';
  if (moveBlocked(b, u, op)) return null;
  const tiles = op.tiles || 1;
  const reach = op.mode === 'teleport' ? null : reachable(b.grid, u.x, u.y, tiles, b.occ);
  let best = null, bestD = 1e9;
  for (const [dx, dy] of DIRS8) {
    const x = t.x + dx, y = t.y + dy;
    if (!isPassable(b.grid, x, y) || unitAt(b, x, y)) continue;
    const d = reach ? reach.dist[y * b.grid.w + x] : chebyshev(u.x, u.y, x, y);
    if (d < 0 || d > tiles) continue;
    if (!reach && !lineOfSight(b.grid, u.x, u.y, x, y)) continue;
    if (!approachOk(b, u, x, y)) continue;
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function moveTileValid(b, u, a, mv, x, y) {
  if (!inBounds(b.grid, x, y) || !isPassable(b.grid, x, y) || unitAt(b, x, y)) return false;
  if (moveBlocked(b, u, mv) || !approachOk(b, u, x, y)) return false;
  const lim = a.target === 'self' || a.range == null || a.range === 0 ? mv.tiles : Math.min(abilityRange(u, a), mv.tiles);
  if (chebyshev(u.x, u.y, x, y) > lim) return false;
  if (mv.mode !== 'teleport') {
    const reach = reachable(b.grid, u.x, u.y, mv.tiles, b.occ);
    return reach.dist[y * b.grid.w + x] > 0;
  }
  return lineOfSight(b.grid, u.x, u.y, x, y);
}

/** Leap + area (melee-aoe: target 'tile', area, move op): the landing tile must be a valid move destination. */
export const isLeapArea = (a) => a.target === 'tile' && !!a.area && !!moveOp(a) && !moveOp(a).random;

const isSelfCentered = (u, a, spec) => a.target === 'self' || (abilityRange(u, a) === 0 && !(spec && (spec.unit || spec.x != null)));

/** Validate a target spec { unit } | { x, y } for ability a used by u. */
export function targetValid(b, u, a, spec) {
  const mv = moveOp(a);
  if (a.target === 'self') {
    if (mv && spec && spec.x != null) return moveTileValid(b, u, a, mv, spec.x, spec.y);
    return !mv || !(spec && spec.x != null);
  }
  const range = abilityRange(u, a);
  if (range === 0 && !(spec && (spec.unit || spec.x != null))) return true;
  if (a.target === 'tile') {
    if (!spec || spec.x == null || !inBounds(b.grid, spec.x, spec.y)) return false;
    if (mv && (!a.area || !mv.random)) return moveTileValid(b, u, a, mv, spec.x, spec.y);
    if (tileAt(b.grid, spec.x, spec.y) === T_WALL) return false;
    return chebyshev(u.x, u.y, spec.x, spec.y) <= range && lineOfSight(b.grid, u.x, u.y, spec.x, spec.y);
  }
  const t = spec && spec.unit ? b.byId[spec.unit] : null;
  if (!t || (!isAlive(t) && !(a.target === 'ally' && canRevive(a, t)))) return false;
  if (a.target === 'enemy') {
    if (!isHostile(b, u, t)) return false;
    const ts = tauntSource(b, u);
    if (ts && ts !== t) return false;
  } else if (a.target === 'ally') {
    if (t.team !== u.team) return false;
  }
  const d = chebyshev(u.x, u.y, t.x, t.y);
  if (mv && !mv.random) {
    if (d > Math.max(range, mv.tiles + (hasOp(a, 'weapon') ? weaponRange(u) : 1))) return false;
    return moveDestination(b, u, mv, t) !== null;
  }
  const lim = hasOp(a, 'weapon') ? Math.min(Math.max(range, 1), weaponRange(u)) : Math.max(range, t === u ? 0 : 1);
  if (d > lim) return false;
  if (d > 1 && !lineOfSight(b.grid, u.x, u.y, t.x, t.y)) return false;
  return true;
}

function inArea(b, u, a, center, t) {
  const area = a.area;
  const size = area.size || 1;
  if (area.shape === 'radius') {
    return chebyshev(center.x, center.y, t.x, t.y) <= size && lineOfSight(b.grid, center.x, center.y, t.x, t.y);
  }
  const vx = center.x - u.x, vy = center.y - u.y;
  if (!vx && !vy) return false;
  const tx = t.x - u.x, ty = t.y - u.y;
  const d = Math.max(Math.abs(tx), Math.abs(ty));
  if (d < 1 || d > size) return false;
  if (area.shape === 'cone') {
    const cos = (vx * tx + vy * ty) / (Math.hypot(vx, vy) * Math.hypot(tx, ty));
    return cos >= 0.7 && lineOfSight(b.grid, u.x, u.y, t.x, t.y);
  }
  // line: Bresenham from the caster toward a far point in the target's direction, stops at walls
  const k = size / Math.max(Math.abs(vx), Math.abs(vy));
  const ex = u.x + Math.round(vx * k), ey = u.y + Math.round(vy * k);
  let hit = false;
  let blocked = false;
  walkLine(u.x, u.y, ex, ey, (x, y) => {
    if (tileAt(b.grid, x, y) === T_WALL) { blocked = true; return true; }
    if (x === t.x && y === t.y) { hit = true; return true; }
    return false;
  });
  if (!hit && !blocked && t.x === ex && t.y === ey) hit = true;
  return hit;
}

/** Units affected by an ability given a target spec (v1.1 sides: enemy/tile -> enemies, self/ally -> own). */
export function abilityTargets(b, u, a, spec) {
  let center;
  let primary = null;
  if (isSelfCentered(u, a, spec)) { center = { x: u.x, y: u.y }; primary = u; }
  else if (spec && spec.unit) { primary = b.byId[spec.unit]; center = primary ? { x: primary.x, y: primary.y } : null; }
  else if (spec && spec.x != null) center = { x: spec.x, y: spec.y };
  if (!center) return [];
  if (!a.area) return primary ? [primary] : [];
  const own = a.target === 'self' || a.target === 'ally';
  const foes = a.target === 'enemy' || a.target === 'tile';
  const out = [];
  for (const t of b.units) {
    if (!isAlive(t)) continue;
    if (foes && !isHostile(b, u, t)) continue;
    if (own && t.team !== u.team) continue;
    if (t === u) {
      if (own || (a.target === 'any' && a.area.shape === 'radius' && inArea(b, u, a, center, t))) out.push(t);
      continue;
    }
    if (inArea(b, u, a, center, t)) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- effect ops

function tagOk(t, only) {
  if (!only) return true;
  if (Array.isArray(only)) return only.some((o) => t.tags.includes(o)) || t.tags.includes('hybrid');
  return t.tags.includes(only) || t.tags.includes('hybrid');
}
export { tagOk };

/**
 * Apply one effect operation from caster to target.
 * ctx: { crit, half, attacked, tick, ability, dc, dmgBonusUsed }.
 */
export function applyOp(b, caster, t, op, ctx = {}) {
  if (op.op === 'stabilize' && op.revive && t.dead && !t.removed) { reviveUnit(b, caster, t); return; }
  if (!isAlive(t)) return;
  if (op.only && op.op !== 'heal' && !tagOk(t, op.only)) { emit(b, { type: 'onlySkip', actor: caster.id, target: t.id, op: op.op, only: op.only }); return; }
  const half = !!ctx.half;
  if (half && op.op !== 'damage' && op.op !== 'drain') return;
  if (op.ifSurface && !surfaceKindsAt(b, t.x, t.y).some((k) => [].concat(op.ifSurface).includes(k))) return;
  const a = ctx.ability || null;
  switch (op.op) {
    case 'damage': {
      const critDice = !!ctx.crit && op.dmgType !== 'proxy';
      let amt = rollDice(b.rng, op.dice, critDice) + bonusValue(b, caster, op.bonus, a);
      if (ctx.attacked && !ctx.dmgBonusUsed) { amt += attackDmgBonus(b, caster, t, 'spell'); ctx.dmgBonusUsed = true; }
      if (!ctx.tick && a && caster !== t) amt += dmgTypeTier(caster, op.dmgType);
      if (ctx.mul != null && ctx.mul !== 1) amt = Math.floor(amt * ctx.mul);
      if (half) amt = Math.floor(amt / 2);
      dealDamage(b, ctx.tick ? null : caster, t, Math.max(0, amt), op.dmgType || null, { crit: critDice });
      break;
    }
    case 'weapon':
      if (caster.weapon) weaponAttack(b, caster, t, op);
      break;
    case 'heal': {
      if (!tagOk(t, op.only)) break;
      const res = op.resource || 'hp';
      if (res === 'hp' && t.soulless) { emit(b, { type: 'healBlocked', actor: caster.id, target: t.id }); break; }
      const amt = (op.dice ? rollDice(b.rng, op.dice) : 0) + bonusValue(b, caster, op.bonus, a) + (op.value || 0);
      healUnit(b, caster, t, Math.max(1, amt), res);
      break;
    }
    case 'shield': {
      const v = op.value != null ? op.value : rollDice(b.rng, op.dice) + bonusValue(b, caster, op.bonus, a);
      addShield(b, caster, t, v, op.turns);
      break;
    }
    case 'status': {
      let id = op.id;
      if (op.mrlBelow != null && !(t.maxMrl > 0 && t.mrl <= t.maxMrl * op.mrlBelow)) { id = op.elseId || null; if (!id) break; }
      applyStatus(b, t, id, op.turns, caster, op.value, ctx.dc ?? getDc(b, caster, a));
      break;
    }
    case 'surface':
      // per-target surfaces (crit blood, oil under the target…); area surfaces are placed once in resolveAbility
      if ((op.per || op.crit || ctx.trap) && (!op.crit || ctx.crit)) placeSurfaceOp(b, caster, a, { ...op, ifSurface: null }, { x: t.x, y: t.y }, t);
      break;
    case 'clearSurface':
      if (ctx.trap || !a) clearSurfaces(b, op.kinds || [], t.x, t.y, op.size ?? 1, caster);
      break;
    case 'cleanse': {
      let n = op.ids ? op.ids.length : op.count || 1;
      const list = t.statuses
        .map((s) => ({ s, d: statusDef(b, s.id) }))
        .filter((x) => (op.ids ? op.ids.includes(x.s.id) : op.kind === 'any' || x.d?.kind === 'debuff'))
        .sort((x, y) => (x.d?.kind === 'debuff' ? 0 : 1) - (y.d?.kind === 'debuff' ? 0 : 1));
      const removed = [];
      for (const x of list) { if (n-- <= 0) break; removeStatus(b, t, x.s.id); removed.push(x.s.id); }
      emit(b, { type: 'cleanse', actor: caster.id, target: t.id, removed });
      break;
    }
    case 'buff':
      addBuff(b, caster, t, op.stat, op.value || 0, op.turns); // cumulative buffs are handled in status ticks
      break;
    case 'push':
      pushUnit(b, caster, t, op.tiles || 1);
      break;
    case 'stabilize':
      if (t.down) {
        if (t.soulless) { emit(b, { type: 'healBlocked', actor: caster.id, target: t.id }); break; }
        t.down = false; t.downTurns = 0; t.hp = Math.max(1, t.hp);
        emit(b, { type: 'stabilize', actor: caster.id, target: t.id, value: t.hp });
      }
      break;
    case 'drain': {
      const critDice = !!ctx.crit && op.dmgType !== 'proxy';
      let amt = rollDice(b.rng, op.dice, critDice) + bonusValue(b, caster, op.bonus, a);
      if (half) amt = Math.floor(amt / 2);
      const dealt = dealDamage(b, caster, t, Math.max(0, amt), op.dmgType || null, { crit: critDice });
      const back = Math.floor(dealt * (op.ratio ?? 0.5));
      if (back > 0 && isAlive(caster)) healUnit(b, caster, caster, back, op.to || 'hp');
      break;
    }
    case 'mark': {
      const id = op.id || 'marked';
      const fresh = !!(b.turn && b.turn.unitId === t.id);
      const cur = getStatus(t, id);
      const val = op.value ?? 2;
      if (cur) { cur.turns = Math.max(cur.turns ?? 0, op.turns ?? 1); cur.value = Math.max(cur.value ?? 0, val); cur.source = caster.id; cur.mark = true; }
      else t.statuses.push({ id, turns: op.turns ?? 1, source: caster.id, fresh, value: val, dc: null, stack: 0, stackStat: null, mark: true });
      emit(b, { type: 'mark', actor: caster.id, target: t.id, id, value: val, turns: op.turns ?? 1 });
      break;
    }
    case 'summon':
      spawnSummon(b, caster, op.unit, op.turns, null, op.side === 'hostileToAll' ? 'chaos' : op.team);
      break;
    case 'extraAction':
      if (b.turn && b.turn.unitId === caster.id) {
        if (op.kind === 'bonus') b.turn.bonus++; else b.turn.actions++;
        emit(b, { type: 'extraAction', actor: caster.id, kind: op.kind || 'action' });
        const pen = op.nextTurnPenalty ?? (a && a.nextTurnPenalty);
        if (pen) {
          const p = typeof pen === 'number' ? { actions: pen } : pen;
          const cur = caster.turnPenalty || { actions: 0, bonus: 0 };
          caster.turnPenalty = { actions: (cur.actions || 0) + (p.actions || 0), bonus: (cur.bonus || 0) + (p.bonus || 0) };
        }
      }
      break;
    case 'zone':
      break; // placed once per ability in resolveAbility
    case 'move':
      if (op.random) randomHop(b, t, op.tiles || 1);
      break; // caster moves are handled before the roll in resolveAbility
    default:
      emit(b, { type: 'unknownOp', actor: caster.id, op: op.op });
  }
}

function randomHop(b, u, tiles) {
  const cands = [];
  for (let y = u.y - tiles; y <= u.y + tiles; y++) for (let x = u.x - tiles; x <= u.x + tiles; x++) {
    if ((x !== u.x || y !== u.y) && isPassable(b.grid, x, y) && !unitAt(b, x, y)) cands.push({ x, y });
  }
  if (!cands.length) return;
  const to = b.rng.pick(cands);
  const from = { x: u.x, y: u.y };
  setPos(b, u, to.x, to.y);
  emit(b, { type: 'teleport', actor: u.id, from, to });
  hazardEnter(b, u);
  trapCheck(b, u);
}

function abilityMove(b, u, op, spec) {
  const tiles = op.tiles || 1;
  let dest = null;
  if (moveBlocked(b, u, op)) return;
  if (spec && spec.x != null) {
    dest = { x: spec.x, y: spec.y };
    if (!approachOk(b, u, dest.x, dest.y)) return;
  } else if (spec && spec.unit) {
    const d = moveDestination(b, u, op, b.byId[spec.unit]);
    if (!d || d === 'stay') return;
    dest = d;
  }
  if (!dest || (dest.x === u.x && dest.y === u.y)) return;
  if (op.mode === 'teleport') {
    if (!isPassable(b.grid, dest.x, dest.y) || unitAt(b, dest.x, dest.y)) return;
    const from = { x: u.x, y: u.y };
    setPos(b, u, dest.x, dest.y);
    emit(b, { type: 'teleport', actor: u.id, from, to: { ...dest } });
    hazardEnter(b, u);
    trapCheck(b, u);
  } else {
    const reach = reachable(b.grid, u.x, u.y, tiles, b.occ);
    const path = pathTo(reach, dest.y * b.grid.w + dest.x);
    if (path && path.length) walk(b, u, path, true);
  }
}

/** v2: +SUMMON_HP_PER_LEVEL max HP and +SUMMON_DMG_PER_LEVEL damage per summoner level above 1. */
export function scaleSummon(s, ownerLevel) {
  const lv = Math.max(0, (ownerLevel || 1) - 1);
  if (!lv) return s;
  s.maxHp += SUMMON_HP_PER_LEVEL * lv;
  s.hp = s.maxHp;
  s.dmgBonus = { ...s.dmgBonus, all: (s.dmgBonus.all || 0) + SUMMON_DMG_PER_LEVEL * lv };
  s.summonerLevel = ownerLevel;
  return s;
}

export function spawnSummon(b, owner, unitId, turns, tile, team) {
  const def = b.data.summons[unitId] || b.data.enemies[unitId];
  if (!def) { emit(b, { type: 'summonFail', actor: owner.id, unit: unitId }); return null; }
  let pos = null;
  if (tile && chebyshev(owner.x, owner.y, tile.x, tile.y) <= 1 && isPassable(b.grid, tile.x, tile.y) && !unitAt(b, tile.x, tile.y)) pos = tile;
  if (!pos) {
    for (const [dx, dy] of DIRS8) {
      const x = owner.x + dx, y = owner.y + dy;
      if (isPassable(b.grid, x, y) && !unitAt(b, x, y) && tileAt(b.grid, x, y) !== T_HAZARD) { pos = { x, y }; break; }
    }
  }
  if (!pos) pos = nearestFree(b.grid, owner.x, owner.y, b.occ);
  if (!pos) { emit(b, { type: 'summonFail', actor: owner.id, unit: unitId }); return null; }
  const s = initUnit(buildEnemy(def, { id: `${owner.id}~${unitId}${++b.summonCount}`, team: team || owner.team, kind: 'summon', data: b.data }));
  s.summonTurns = turns ?? def.defaultTurns ?? 3;
  scaleSummon(s, owner.level || 1);
  s.summoner = owner.id;
  addUnit(b, s, pos);
  const at = b.order.indexOf(owner.id);
  const idx = at >= 0 ? at + 1 : b.order.length;
  b.order.splice(idx, 0, s.id);
  if (idx <= b.turnIndex) b.turnIndex++;
  emit(b, { type: 'summon', actor: owner.id, target: s.id, unit: unitId, x: s.x, y: s.y, turns: s.summonTurns });
  return s;
}

// ---------------------------------------------------------------- overcast tables

function partTargets(b, u, primary, part) {
  const alive = b.units.filter((x) => isStanding(x));
  let list;
  switch (part.target) {
    case 'spellTarget': case 'target': list = primary && isAlive(primary) ? [primary] : []; break;
    case 'casterAllies': case 'allies': list = alive.filter((x) => x.team === u.team && x !== u); break;
    case 'casterEnemies': case 'enemies': list = alive.filter((x) => x.team !== u.team); break;
    case 'all': list = alive; break;
    case 'randomUnit': case 'random': list = alive.length ? [b.rng.pick(alive)] : []; break;
    default: list = isAlive(u) ? [u] : [];
  }
  if (part.area) {
    const c = part.area.center === 'spellTarget' && primary ? primary : u;
    const size = part.area.size || 1;
    list = list.filter((x) => chebyshev(c.x, c.y, x.x, x.y) <= size);
  }
  const tags = part.filterTags || part.tags;
  if (tags) list = list.filter((x) => tags.some((tg) => x.tags.includes(tg)));
  if (part.filter && part.filter.ranged) list = list.filter((x) => !isMeleeWeapon(x));
  return list;
}

function overcastRoll(b, u, primary) {
  const table = u.overcast === 'veil' ? b.data.veilTable : u.overcast === 'proxyStorm' ? b.data.proxyStormTable : null;
  const roll = 1 + Math.floor(b.rng() * 20);
  const d10 = Math.ceil(roll / 2);
  const row = table ? (Array.isArray(table) ? (table.find((r) => r.roll === d10) || table[d10 - 1]) : table[d10]) : null;
  emit(b, { type: 'overcast', actor: u.id, table: u.overcast, roll, d10, row: row ? (row.name || row.id || d10) : null, skipped: !!(row && row.todo) });
  if (!row || row.todo) return;
  const parts = row.parts || (row.effects ? [{ target: row.target, tags: row.tags, effects: row.effects }] : []);
  for (const part of parts) {
    const targets = partTargets(b, u, primary, part);
    const summonOps = part.effects.filter((op) => op.op === 'summon');
    for (const op of summonOps) spawnSummon(b, u, op.unit, op.turns, null, op.side === 'hostileToAll' ? 'chaos' : op.team);
    for (const t of targets) {
      for (const op of part.effects) if (op.op !== 'summon') applyOp(b, u, t, op, {});
    }
  }
}

// ---------------------------------------------------------------- ability resolution

function hallucinate(b, u, t, range) {
  const chance = modValue(b, u, 'randomTarget');
  if (!chance || b.rng() >= chance) return t;
  const cands = b.units.filter((x) => x !== u && x !== t && isStanding(x)
    && chebyshev(u.x, u.y, x.x, x.y) <= Math.max(1, range) && lineOfSight(b.grid, u.x, u.y, x.x, x.y));
  if (!cands.length) return t;
  const nt = b.rng.pick(cands);
  emit(b, { type: 'hallucination', actor: u.id, target: nt.id, intended: t.id });
  return nt;
}

// ---------------------------------------------------------------- v3: burst fire, items, traps, phobias

/** Phobia triggers handled in battle (others are world-only, exposed on creature.phobias). */
export const PHOBIA_COMBAT_TRIGGERS = ['fire', 'electric', 'toxin', 'cringe', 'psychic', 'cyber', 'energy', 'proxy', 'blood', 'tech', 'hazard'];
export const PHOBIA_WORLD_TRIGGERS = ['water', 'hacking', 'heights', 'darkness', 'crowds', 'moral', 'medicine'];
/** Default phobia effect: fear for 1 turn (source = whatever triggered it). Once per round per phobia. */
export const PHOBIA_DEFAULT_EFFECT = { op: 'status', id: 'fear', turns: 1 };

function phobiaDamage(b, u, dmgType, src) {
  if (!u.phobias || !u.phobias.length) return;
  if (dmgType) phobiaTrigger(b, u, dmgType, src);
  if (src && src !== u && src.tags && src.tags.includes('mechanical')) phobiaTrigger(b, u, 'tech', src);
}

function phobiaTrigger(b, u, trigger, src) {
  if (!u.phobias || !u.phobias.length || !isStanding(u)) return;
  for (const p of u.phobias) {
    if (p.trigger !== trigger || p.lastRound === b.round) continue;
    p.lastRound = b.round;
    emit(b, { type: 'phobia', target: u.id, actor: src ? src.id : null, trigger });
    applyOp(b, src && isAlive(src) ? src : u, u, p.effect || PHOBIA_DEFAULT_EFFECT, {});
  }
}

/** «Очередь» (canon rule 8): rof shots, shot i needs KB + recoil × i; next-attack effects go to the first shot. */
function burstAttack(b, att, tgt) {
  const w = att.weapon;
  const n = Math.max(1, w.rof || 1);
  const recoil = w.recoil || 0;
  const melee = isMeleeWeapon(att);
  payWeapon(b, att);
  emit(b, { type: 'burst', actor: att.id, target: tgt.id, shots: n, recoil });
  let hits = 0, fired = 0;
  for (let i = 0; i < n; i++) {
    if (!isAlive(tgt) || !isStanding(att)) break;
    fired++;
    const res = attackRoll(b, att, tgt, weaponAttackBonus(b, att), melee, true, { noReact: i > 0, kbPenalty: recoil * i });
    if (res.hit) {
      hits++;
      weaponDamage(b, att, tgt, res.crit, res.extraDice, null, null);
      if (melee) applyThorns(b, att, tgt);
    }
    if (res.natural != null && isAlive(att) && afterShot(b, att, res.natural)) break;
  }
  emit(b, { type: 'burstEnd', actor: att.id, target: tgt.id, shots: fired, hits });
  return hits;
}

/** Usable in battle: consumables, grenades and traps (anything with effects or trap). */
export const isBattleItem = (it) => !!it && (!!it.trap || (Array.isArray(it.effects) && it.effects.length > 0))
  && it.slot !== 'weapon' && it.slot !== 'armor' && it.slot !== 'offhand' && it.slot !== 'mod';

/** Ability-shaped view of an item (so items reuse targeting, saves and ops). DC: item.dc or 8 + prof + mod(dex). */
export function itemAbility(it) {
  return {
    id: 'item:' + it.id, name: it.name, level: 1, path: null, cost: 0, action: it.action || 'action', trigger: null,
    range: it.range ?? (it.target === 'self' ? 0 : 1), target: it.target || 'self', area: it.area || null,
    roll: it.roll || 'auto', save: it.save || null, onSave: it.onSave || 'none', usesPerBattle: null,
    effects: it.trap ? [] : (it.effects || []), castStat: it.castStat || 'dex', dc: it.dc ?? null, item: it.id, trap: it.trap || null,
    zone: it.zone || null, surface: it.surface || null, nextTurnPenalty: it.nextTurnPenalty || null,
  };
}

export const trapAt = (b, x, y, u) => b.traps.find((t) => t.x === x && t.y === y && (!u || t.team !== u.team)) || null;

function placeTrap(b, u, it, tile) {
  const tr = it.trap;
  const trap = {
    id: `trap${++b.trapCount}`, item: it.id, name: it.name, x: tile.x, y: tile.y, owner: u.id, team: u.team,
    effects: tr.effects || [], roll: tr.roll || (tr.save ? 'save' : 'auto'), save: tr.save || null, onSave: tr.onSave || 'none',
    dc: tr.dc ?? it.dc ?? getDc(b, u, { castStat: it.castStat || 'dex' }), area: tr.area || null,
  };
  b.traps.push(trap);
  emit(b, { type: 'trapPlaced', actor: u.id, item: it.id, trap: trap.id, x: tile.x, y: tile.y });
  return trap;
}

/** Trigger a hostile trap on u's tile (one use). */
function trapCheck(b, u) {
  if (!b.traps.length || !isAlive(u)) return;
  const trap = trapAt(b, u.x, u.y, u);
  if (!trap) return;
  b.traps.splice(b.traps.indexOf(trap), 1);
  emit(b, { type: 'trapTriggered', target: u.id, actor: trap.owner, trap: trap.id, item: trap.item, x: trap.x, y: trap.y });
  const owner = b.byId[trap.owner] || u;
  const victims = trap.area
    ? b.units.filter((x) => isAlive(x) && x.team !== trap.team && chebyshev(x.x, x.y, trap.x, trap.y) <= (trap.area.size || 1))
    : [u];
  for (const t of victims) {
    let half = false;
    if (trap.roll === 'save' && trap.save && rollSave(b, t, trap.save, trap.dc, owner, trap.id)) {
      if (trap.onSave !== 'half') continue;
      half = true;
    }
    for (const op of trap.effects) { if (isAlive(t)) applyOp(b, owner, t, op, { half, dc: trap.dc, trap: true }); }
  }
}

function useItem(b, u, it, spec) {
  u.inventory[it.id]--;
  if (u.inventory[it.id] <= 0) delete u.inventory[it.id];
  emit(b, { type: 'useItem', actor: u.id, item: it.id, target: spec.unit || null, tile: spec.x != null ? { x: spec.x, y: spec.y } : null });
  if (it.trap) {
    if ((it.action || 'action') === 'bonus') b.turn.bonus--; else b.turn.actions--;
    b.turn.acted = true;
    placeTrap(b, u, it, spec);
    return;
  }
  resolveAbility(b, u, itemAbility(it), spec, false);
  if (it.withdrawal) {
    const t = (spec.unit && b.byId[spec.unit]) || u;
    t.withdrawalPending.push({ item: it.id, opiate: it.opiate || 0, ...it.withdrawal });
    emit(b, { type: 'withdrawalPending', actor: u.id, target: t.id, item: it.id });
  }
}

/**
 * v7 «Порыться в рюкзаке» (docs/specs/inventory-mods.md §2): a full action — one stack of `id` from u.backpack goes to a
 * quick slot (u.inventory); no free slot (u.quickSlots distinct items) → `swap` (an id in the quick slots) goes back.
 * Returns null if allowed, else a reason.
 */
export function rummageOk(b, u, id, swap) {
  const it = b.data.items[id];
  if (!it || !(u.backpack?.[id] > 0)) return 'noItem';
  const t = b.turn;
  if (!t || t.unitId !== u.id) return 'turn';
  if (t.actions <= 0) return 'action';
  const used = Object.keys(u.inventory).filter((k) => u.inventory[k] > 0);
  if (u.quickSlots != null && !used.includes(id) && used.length >= u.quickSlots && !(swap && u.inventory[swap] > 0)) return 'noSlot';
  return null;
}

function rummage(b, u, id, swap) {
  const it = b.data.items[id];
  const used = Object.keys(u.inventory).filter((k) => u.inventory[k] > 0);
  if (u.quickSlots != null && !used.includes(id) && used.length >= u.quickSlots && swap) {
    u.backpack[swap] = (u.backpack[swap] || 0) + u.inventory[swap];
    delete u.inventory[swap];
  }
  const n = Math.min(u.backpack[id], Math.max(1, it.stack || 1));
  u.backpack[id] -= n;
  if (u.backpack[id] <= 0) delete u.backpack[id];
  u.inventory[id] = (u.inventory[id] || 0) + n;
  emit(b, { type: 'rummage', actor: u.id, item: id, n, swap: swap || null });
}

/** null if u can use item id now, else a reason. */
export function itemUsable(b, u, id) {
  const it = b.data.items[id];
  if (!it || !isBattleItem(it)) return 'noItem';
  if (!(u.inventory[id] > 0)) return 'noItem';
  const t = b.turn;
  if (!t || t.unitId !== u.id) return 'turn';
  if ((it.action || 'action') === 'bonus' ? t.bonus <= 0 : t.actions <= 0) return 'action';
  return null;
}

function itemTargetValid(b, u, it, spec) {
  const a = itemAbility(it);
  if (it.trap) {
    if (!spec || spec.x == null) return false;
    if (!isPassable(b.grid, spec.x, spec.y) || unitAt(b, spec.x, spec.y) || b.traps.some((t) => t.x === spec.x && t.y === spec.y)) return false;
    return chebyshev(u.x, u.y, spec.x, spec.y) <= (a.range || 1) && lineOfSight(b.grid, u.x, u.y, spec.x, spec.y);
  }
  return targetValid(b, u, a, spec);
}

/** Is this attack-roll ability melee (no cover, no point-blank disadvantage)? Same rule as attackRoll. */
function abilityIsMelee(u, a) {
  return hasOp(a, 'weapon') ? isMeleeWeapon(u) : abilityRange(u, a) <= 1;
}

/**
 * For UI hit chance: is the action's attack roll melee? action: { type: 'attack' } | { type: 'ability', ability }.
 * Use with attackOdds(b, u, target, bonus, isMeleeAttack(...), isWeapon).
 */
export function isMeleeAttack(b, u, action) {
  if (!action) return false;
  if (action.type === 'attack') return isMeleeWeapon(u);
  if (action.type === 'throw') return false;
  if (action.type === 'ability') {
    const a = u.abilities.find((x) => x.id === action.ability);
    return !!a && abilityIsMelee(u, a);
  }
  return false;
}

function resolveAbility(b, u, a, spec, asReaction) {
  const cost = a.cost || 0;
  const overcast = cost > u.enr;
  u.enr = overcast ? 0 : u.enr - cost;
  if (overcast) u.overcastsUsed = (u.overcastsUsed || 0) + 1;
  u.uses[a.id] = (u.uses[a.id] || 0) + 1;
  if (asReaction) u.reactionUsed = true;
  else if (a.action === 'bonus') b.turn.bonus--;
  else b.turn.actions--;
  if (!asReaction && b.turn) b.turn.acted = true;
  if (spec && spec.unit && a.target === 'enemy' && !a.area) {
    const t0 = b.byId[spec.unit];
    const t1 = hallucinate(b, u, t0, abilityRange(u, a));
    if (t1 !== t0) spec = { unit: t1.id };
  }
  emit(b, { type: 'ability', actor: u.id, ability: a.id, name: a.name, target: spec && spec.unit ? spec.unit : null, tile: spec && spec.x != null ? { x: spec.x, y: spec.y } : null, cost, overcast });
  const gl = cost > 0 && u.statuses.length ? glitchSpec(b, u) : null;
  if (gl && 1 + Math.floor(b.rng() * 20) <= (gl.failOn ?? 5)) {
    emit(b, { type: 'glitchFail', actor: u.id, ability: a.id, name: a.name });
    return;
  }
  const effects = a.effects || [];
  for (const op of effects) if (op.op === 'move' && !op.random) abilityMove(b, u, op, spec);
  if (!isStanding(u)) return;
  const hasWeapon = hasOp(a, 'weapon');
  const reachLimit = hasWeapon ? Math.max(weaponRange(u), a.range === 'weapon' ? 0 : 1) : Math.max(1, abilityRange(u, a));
  const dc = getDc(b, u, a);
  const targets = abilityTargets(b, u, a, spec);
  let offensive = false;
  for (const t of targets) {
    if (!isAlive(t) && !canRevive(a, t)) continue;
    const hostile = isHostile(b, u, t);
    if (hostile) offensive = true;
    if (!a.area && t !== u && chebyshev(u.x, u.y, t.x, t.y) > reachLimit) {
      emit(b, { type: 'outOfRange', actor: u.id, target: t.id });
      continue;
    }
    const ctx = { crit: false, half: false, attacked: false, ability: a, dc, dmgBonusUsed: false };
    if (hostile && a.roll === 'save' && a.save) {
      if (rollSave(b, t, a.save, dc, u, a.id)) {
        if (a.onSave !== 'half') continue;
        ctx.half = true;
      }
    } else if (hostile && a.roll === 'attack' && !hasWeapon) {
      const r = attackRoll(b, u, t, spellAttackBonus(b, u, a), abilityIsMelee(u, a), false);
      if (!r.hit) continue;
      ctx.crit = r.crit;
      ctx.attacked = true;
      ctx.thorns = abilityIsMelee(u, a);
    }
    let gate = true;
    for (const op of effects) {
      if (CASTER_OPS[op.op] && !op.random) continue;
      if (op.self) continue;
      if (op.op === 'weapon') {
        if (!hostile || !u.weapon) continue;
        const r = weaponAttack(b, u, t, op);
        gate = r.hit;
        ctx.crit = r.crit;
        ctx.dmgBonusUsed = true;
      } else if (gate) {
        applyOp(b, u, t, op, ctx);
      }
      if (!isAlive(t) || !isStanding(u)) break;
    }
    if (ctx.thorns) applyThorns(b, u, t);
  }
  if (zoneOf(a)) placeZone(b, u, a, abilityCenter(b, u, a, spec));
  if (a.area && b.objects && b.objects.size) {
    // combat rework §3.2: area damage hits objects in the area (rolled once)
    let amt = 0;
    for (const op of effects) if (op.op === 'damage' && op.dice) amt += rollDice(b.rng, op.dice);
    if (amt > 0) {
      const c = abilityCenter(b, u, a, spec);
      damageObjectsIn(b, (x, y) => inArea(b, u, a, c, { x, y }), amt, u, (effects.find((op) => op.op === 'damage') || {}).dmgType);
    }
  }
  if (surfacesOn(b)) {
    const c = abilityCenter(b, u, a, spec);
    if (a.area && effects.some((op) => op.op === 'damage') && b.barrels.length) {
      breakBarrelsIn(b, (x, y) => inArea(b, u, a, c, { x, y }) || (a.area.shape === 'radius' && x === c.x && y === c.y), u);
    }
    if (a.surface) placeSurfaceOp(b, u, a, a.surface, c, null);
    for (const op of effects) {
      if (op.op === 'surface' && !op.per && !op.crit) placeSurfaceOp(b, u, a, op, c, null);
      else if (op.op === 'clearSurface') clearSurfaces(b, op.kinds || [], c.x, c.y, op.size ?? 1, u);
    }
  }
  for (const op of effects) {
    if (op.op === 'summon') spawnSummon(b, u, op.unit, op.turns, spec && spec.x != null ? spec : null, op.side === 'hostileToAll' ? 'chaos' : op.team);
    else if (op.op === 'extraAction') applyOp(b, u, u, op, { ability: a });
    else if (op.self && op.op !== 'move') applyOp(b, u, u, op, { ability: a, dc });
  }
  if (offensive) { breakStatuses(b, u, 'attack'); if (!asReaction) selfDamage(b, u); }
  breakStatuses(b, u, 'ability');
  if (overcast && cost > 0) overcastRoll(b, u, targets.find((t) => t !== u) || null);
  checkVictory(b);
}

// ---------------------------------------------------------------- reactions

function triggerReactions(b, trigger, unit, source) {
  if (!b.autoReactions || b.reactionDepth > 0 || b.winner) return;
  for (let i = 0; i < b.units.length; i++) {
    const r = b.units[i];
    if (!isStanding(r) || r.reactionUsed || !r.abilities.length) continue;
    if (trigger === 'selfAttacked' ? r !== unit : (r === unit || r.team !== unit.team)) continue;
    if (skipsTurn(b, r)) continue;
    for (const a of r.abilities) {
      if (a.action !== 'reaction' || a.trigger !== trigger) continue;
      if (abilityUsable(b, r, a, true) !== null) continue;
      if (a.cost > r.enr) continue; // reactions never overcast
      let spec;
      if (a.target === 'enemy') { if (!source || !isAlive(source) || !isHostile(b, r, source)) continue; spec = { unit: source.id }; }
      else if (a.target === 'self') spec = {};
      else spec = { unit: unit.id };
      if (trigger === 'allyDamaged' && a.target !== 'enemy' && !unit.down && unit.hp > unit.maxHp * 0.6) continue;
      if (!targetValid(b, r, a, spec)) continue;
      b.reactionDepth++;
      emit(b, { type: 'reaction', actor: r.id, target: spec.unit || r.id, trigger, ability: a.id });
      resolveAbility(b, r, a, spec, true);
      b.reactionDepth--;
      break;
    }
  }
}

// ---------------------------------------------------------------- legal actions & perform

/**
 * All legal actions for the current unit. Action shapes:
 *  { type: 'move', unit, to: {x,y}, cost } · { type: 'dash', unit } · { type: 'disengage', unit }
 *  { type: 'attack', unit, target } · { type: 'ability', unit, ability, target?: unitId, tile?: {x,y} }
 *  { type: 'endStatus', unit, status } · { type: 'endTurn', unit }
 * opts.noMoves — skip move enumeration (use getReachable directly).
 */
/** Can the status be ended by an action now (endAction; endNeeds 'water' — wet or next to water)? */
export function endStatusOk(b, u, id) {
  const d = statusDef(b, id);
  if (!d || !d.endAction) return false;
  if (d.endNeeds === 'water') {
    if (hasStatus(u, 'wet')) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floorAt(b, u.x + dx, u.y + dy)?.kind === 'water') return true;
    return false;
  }
  return true;
}

export function getLegalActions(b, unitId, opts) {
  const u = b.byId[unitId];
  const t = b.turn;
  if (!u || !t || t.unitId !== unitId || b.winner || !isStanding(u)) return [];
  const out = [{ type: 'endTurn', unit: unitId }];
  if (t.move > 0 && !(opts && opts.noMoves)) {
    const reach = getReachable(b, unitId);
    for (const i of reach.list) {
      const d = reach.dist[i];
      if (d <= 0) continue;
      const x = i % b.grid.w, y = (i / b.grid.w) | 0;
      if (!approachOk(b, u, x, y)) continue;
      out.push({ type: 'move', unit: unitId, to: { x, y }, cost: d });
    }
  }
  if (t.actions > 0 && getSpeed(b, u) > 0) out.push({ type: 'dash', unit: unitId });
  if (t.bonus > 0 && !t.disengaged) out.push({ type: 'disengage', unit: unitId });
  for (const s of u.statuses) {
    const sd = statusDef(b, s.id);
    if (!sd?.endAction || !(sd.endActionKind === 'bonus' ? t.bonus > 0 : t.actions > 0) || !endStatusOk(b, u, s.id)) continue;
    out.push({ type: 'endStatus', unit: unitId, status: s.id });
  }
  if (t.actions > 0 && canUseWeapon(b, u)) {
    const range = weaponRange(u);
    for (const e of b.units) {
      if (!isAlive(e) || !isHostile(b, u, e)) continue;
      if (canAttack(b, u, e, range)) out.push({ type: 'attack', unit: unitId, target: e.id });
    }
  }
  if (t.actions > 0 && canUseWeapon(b, u) && terrainOn(b) && !(opts && opts.noSmash)) {
    for (const o of smashTargets(b, u)) out.push({ type: 'smash', unit: unitId, tile: { x: o.x, y: o.y } });
  }
  if (t.actions > 0 && canUseWeapon(b, u) && u.weapon.thrown) {
    for (const e of b.units) {
      if (!isAlive(e) || !isHostile(b, u, e)) continue;
      if (canThrow(b, u, e)) out.push({ type: 'throw', unit: unitId, target: e.id });
    }
  }
  if (t.actions > 0 && canUseWeapon(b, u) && (u.weapon.rof || 1) > 1 && !u.weapon.area) {
    const range = weaponRange(u);
    for (const e of b.units) {
      if (!isAlive(e) || !isHostile(b, u, e)) continue;
      if (canAttack(b, u, e, range)) out.push({ type: 'burst', unit: unitId, target: e.id });
    }
  }
  for (const a of u.abilities) {
    if (abilityUsable(b, u, a, false) !== null) continue;
    for (const spec of abilitySpecs(b, u, a)) out.push({ type: 'ability', unit: unitId, ability: a.id, ...spec });
  }
  for (const id of Object.keys(u.inventory || {})) {
    if (itemUsable(b, u, id) !== null) continue;
    const it = b.data.items[id];
    const a = itemAbility(it);
    for (const spec of abilitySpecs(b, u, a)) {
      const sp = spec.target ? { unit: spec.target } : spec.tile ? spec.tile : {};
      if (itemTargetValid(b, u, it, sp)) out.push({ type: 'useItem', unit: unitId, item: id, ...spec });
    }
  }
  return out;
}

function canAttack(b, u, e, range) {
  const ts = tauntSource(b, u);
  if (ts && ts !== e) return false;
  const d = chebyshev(u.x, u.y, e.x, e.y);
  if (b.grid.elev) {
    if (d <= 1 && !meleeElevOk(b, u.x, u.y, e.x, e.y)) return false;
    if (range > 1) range += elevRange(b, u, e.x, e.y);
  }
  return d <= range && (d <= 1 || !!(u.weapon && u.weapon.arc) || lineOfSight(b.grid, u.x, u.y, e.x, e.y));
}

/** combat rework §3.2: a deliberate weapon attack on an object (melee — adjacent / reach, ranged — range + LOS). */
export function smashOk(b, u, x, y) {
  if (!u.weapon || !objectAt(b, x, y)) return false;
  const d = chebyshev(u.x, u.y, x, y);
  if (d < 1) return false;
  if (isMeleeWeapon(u)) return d <= Math.max(1, weaponRange(u));
  return d <= weaponRange(u) && (d <= 1 || !!u.weapon.arc || lineOfSight(b.grid, u.x, u.y, x, y));
}
/** Objects u can smash now. */
export function smashTargets(b, u) {
  const out = [];
  if (!b.objects) return out;
  for (const o of b.objects.values()) if (smashOk(b, u, o.x, o.y)) out.push(o);
  for (const br of b.barrels || []) if (br.hp != null && smashOk(b, u, br.x, br.y)) out.push(br);
  return out;
}

/** Thrown weapon: distance 2..weapon.thrown, line of sight. */
function canThrow(b, u, e) {
  const ts = tauntSource(b, u);
  if (ts && ts !== e) return false;
  const d = chebyshev(u.x, u.y, e.x, e.y);
  return d >= 2 && d <= (u.weapon.thrown || 0) && lineOfSight(b.grid, u.x, u.y, e.x, e.y);
}

/** Area weapon fired at a tile (no unit needed). */
function areaTileOk(b, u, x, y) {
  if (!inBounds(b.grid, x, y) || tileAt(b.grid, x, y) === T_WALL) return false;
  const d = chebyshev(u.x, u.y, x, y);
  return d >= 1 && d <= weaponRange(u) && (d <= 1 || !!u.weapon.arc || lineOfSight(b.grid, u.x, u.y, x, y));
}

/** Candidate target specs for an ability (enumeration for UI/AI). */
export function abilitySpecs(b, u, a) {
  const mv = moveOp(a);
  const out = [];
  const tilesAround = (r) => {
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) {
      if ((x !== u.x || y !== u.y) && targetValid(b, u, a, { x, y })) out.push({ tile: { x, y } });
    }
  };
  if (a.target === 'self') {
    if (mv && !mv.random) tilesAround(mv.tiles);
    else out.push({});
    return out;
  }
  const range = abilityRange(u, a);
  // range 0: centred on the caster (self-centred areas like beast-roar / cringe-field, target 'tile' included)
  if (range === 0 && !(a.target === 'tile' && mv && !a.area)) return [{}];
  if (a.target === 'tile') {
    if (mv && !a.area) { tilesAround(Math.min(range || mv.tiles, mv.tiles)); return out; }
    if (!a.area) {
      for (const [dx, dy] of DIRS8) {
        const x = u.x + dx, y = u.y + dy;
        if (isPassable(b.grid, x, y) && !unitAt(b, x, y)) out.push({ tile: { x, y } });
      }
      return out;
    }
    return areaTileSpecs(b, u, a);
  }
  for (const e of b.units) {
    if (!isAlive(e) && !canRevive(a, e)) continue;
    if (targetValid(b, u, a, { unit: e.id })) out.push({ target: e.id });
  }
  return out;
}

/**
 * Candidate tiles of a ranged area ability (only those whose area catches a hostile, so AI / UI lists stay short):
 * radius — hostile tiles; cone / line — hostile tiles plus a ring of directions at min(range, size);
 * leap + area — free landing tiles within the jump with a hostile inside the area around them.
 */
function areaTileSpecs(b, u, a) {
  const out = [];
  const seen = new Set();
  const hostiles = b.units.filter((e) => isAlive(e) && e !== u && isHostile(b, u, e));
  const push = (x, y) => {
    const k = y * b.grid.w + x;
    if (seen.has(k)) return;
    seen.add(k);
    if (targetValid(b, u, a, { x, y }) && abilityTargets(b, u, a, { x, y }).length) out.push({ tile: { x, y } });
  };
  const R = a.area.size || 1;
  if (isLeapArea(a)) {
    const mv = moveOp(a);
    const r = Math.min(abilityRange(u, a) || mv.tiles, mv.tiles);
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) {
      if ((x === u.x && y === u.y) || !hostiles.some((e) => chebyshev(e.x, e.y, x, y) <= R)) continue;
      push(x, y);
    }
    return out;
  }
  for (const e of hostiles) push(e.x, e.y);
  if (a.area.shape === 'cone' || a.area.shape === 'line') {
    const r = Math.max(1, Math.min(abilityRange(u, a), R));
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) {
      if (Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) === r && inBounds(b.grid, x, y)) push(x, y);
    }
  }
  return out;
}

function fail(b, start, error) {
  return { ok: false, error, events: b.log ? b.log.slice(start) : [] };
}

/** Perform an action for the current unit. Returns { ok, error?, events }. */
export function perform(b, action) {
  const start = b.log ? b.log.length : 0;
  if (b.winner) return fail(b, start, 'battleOver');
  if (!action || !b.turn) return fail(b, start, 'noTurn');
  const uid = action.unit || b.turn.unitId;
  if (uid !== b.turn.unitId) return fail(b, start, 'notYourTurn');
  if (action.type === 'endTurn') return { ok: true, events: endTurn(b) };
  const u = b.byId[uid];
  if (!isStanding(u)) return fail(b, start, 'down');
  const t = b.turn;
  switch (action.type) {
    case 'move': {
      if (!action.to || !inBounds(b.grid, action.to.x, action.to.y)) return fail(b, start, 'noTarget');
      const reach = getReachable(b, uid);
      const idx = action.to.y * b.grid.w + action.to.x;
      if (reach.dist[idx] <= 0) return fail(b, start, 'unreachable');
      if (!approachOk(b, u, action.to.x, action.to.y)) return fail(b, start, 'fear');
      const steps = walk(b, u, movePath(b, u, action.to), t.disengaged);
      t.move = Math.max(0, t.move - steps);
      if (steps > 0) t.moved = true;
      checkVictory(b);
      break;
    }
    case 'dash':
      if (t.actions <= 0) return fail(b, start, 'noAction');
      t.actions--;
      t.move += getSpeed(b, u);
      emit(b, { type: 'dash', actor: uid });
      break;
    case 'disengage':
      if (t.bonus <= 0) return fail(b, start, 'noBonus');
      t.bonus--;
      t.disengaged = true;
      emit(b, { type: 'disengage', actor: uid });
      break;
    case 'endStatus': {
      const sd = statusDef(b, action.status);
      const bonusKind = sd?.endActionKind === 'bonus';
      if (bonusKind ? t.bonus <= 0 : t.actions <= 0) return fail(b, start, bonusKind ? 'noBonus' : 'noAction');
      if (!hasStatus(u, action.status) || !endStatusOk(b, u, action.status)) return fail(b, start, 'badStatus');
      if (bonusKind) t.bonus--; else t.actions--;
      emit(b, { type: 'endStatus', actor: uid, id: action.status });
      removeStatus(b, u, action.status);
      break;
    }
    case 'attack': {
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!canUseWeapon(b, u)) return fail(b, start, weaponBlocked(b, u) || 'noWeapon');
      if (u.weapon.area && action.tile && !action.target) {
        if (!areaTileOk(b, u, action.tile.x, action.tile.y)) return fail(b, start, 'outOfRange');
        t.actions--;
        t.acted = true;
        areaWeaponAttack(b, u, { x: action.tile.x, y: action.tile.y });
        selfDamage(b, u);
        checkVictory(b);
        break;
      }
      let tgt = b.byId[action.target];
      if (!tgt || !isAlive(tgt) || !isHostile(b, u, tgt)) return fail(b, start, 'badTarget');
      if (!canAttack(b, u, tgt, weaponRange(u))) return fail(b, start, 'outOfRange');
      t.actions--;
      t.acted = true;
      tgt = hallucinate(b, u, tgt, weaponRange(u));
      if (u.weapon.area) areaWeaponAttack(b, u, { x: tgt.x, y: tgt.y });
      else weaponAttack(b, u, tgt, null);
      selfDamage(b, u);
      checkVictory(b);
      break;
    }
    case 'smash': {
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!canUseWeapon(b, u)) return fail(b, start, weaponBlocked(b, u) || 'noWeapon');
      const o = action.tile ? objectAt(b, action.tile.x, action.tile.y) : null;
      if (!o || !smashOk(b, u, o.x, o.y)) return fail(b, start, 'badTarget');
      t.actions--;
      t.acted = true;
      smashObject(b, u, o);
      checkVictory(b);
      break;
    }
    case 'throw': {
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!canUseWeapon(b, u) || !u.weapon.thrown) return fail(b, start, 'noThrow');
      let tgt = b.byId[action.target];
      if (!tgt || !isAlive(tgt) || !isHostile(b, u, tgt)) return fail(b, start, 'badTarget');
      if (!canThrow(b, u, tgt)) return fail(b, start, 'outOfRange');
      t.actions--;
      t.acted = true;
      tgt = hallucinate(b, u, tgt, u.weapon.thrown);
      throwWeapon(b, u, tgt);
      selfDamage(b, u);
      checkVictory(b);
      break;
    }
    case 'burst': {
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!canUseWeapon(b, u) || !((u.weapon.rof || 1) > 1) || u.weapon.area) return fail(b, start, 'noBurst');
      let tgt = b.byId[action.target];
      if (!tgt || !isAlive(tgt) || !isHostile(b, u, tgt)) return fail(b, start, 'badTarget');
      if (!canAttack(b, u, tgt, weaponRange(u))) return fail(b, start, 'outOfRange');
      t.actions--;
      t.acted = true;
      tgt = hallucinate(b, u, tgt, weaponRange(u));
      burstAttack(b, u, tgt);
      selfDamage(b, u);
      checkVictory(b);
      break;
    }
    case 'rummage': {
      const why = rummageOk(b, u, action.item, action.swap);
      if (why) return fail(b, start, why);
      t.actions--;
      rummage(b, u, action.item, action.swap);
      break;
    }
    case 'useItem': {
      const why = itemUsable(b, u, action.item);
      if (why) return fail(b, start, why);
      const it = b.data.items[action.item];
      const spec = action.target ? { unit: action.target } : action.tile ? { x: action.tile.x, y: action.tile.y } : {};
      if (!itemTargetValid(b, u, it, spec)) return fail(b, start, 'badTarget');
      useItem(b, u, it, spec);
      checkVictory(b);
      break;
    }
    case 'ability': {
      const a = u.abilities.find((x) => x.id === action.ability);
      if (!a) return fail(b, start, 'noAbility');
      const why = abilityUsable(b, u, a, false);
      if (why) return fail(b, start, why);
      const spec = action.target ? { unit: action.target } : action.tile ? { x: action.tile.x, y: action.tile.y } : {};
      if (!targetValid(b, u, a, spec)) return fail(b, start, 'badTarget');
      resolveAbility(b, u, a, spec, false);
      break;
    }
    default:
      return fail(b, start, 'unknownAction');
  }
  return { ok: true, events: b.log ? b.log.slice(start) : [] };
}

// ---------------------------------------------------------------- previews (AI / UI hints, no side effects)

/** Hit chance of att vs tgt with a given base bonus, optionally from a hypothetical tile (fx, fy). */
export function attackOdds(b, att, tgt, bonus, melee, isWeapon, fx = att.x, fy = att.y) {
  const m = attackMode(b, att, tgt, melee, isWeapon, fx, fy);
  const mode = m.adv === m.dis ? 'normal' : m.adv ? 'adv' : 'dis';
  let kb = getKb(b, tgt, null, false) - apReduction(att, tgt, isWeapon);
  const arc = isWeapon && !melee && att.weapon && att.weapon.arc;
  if (!arc) kb += coverBonus(b, fx, fy, tgt.x, tgt.y, melee).kb;
  const total = bonus + att.hitBonus + condBonus(att, tgt, 'hit') + statusMod(b, att, 'hit') + buffSum(att, 'hit') + (b.surfaces.size ? surfaceHitBonus(b, att) : 0)
    + terrainHit(b, att, tgt, melee, fx, fy).total + (att.arch ? archHit(b, att) : 0);
  const critRange = Math.min(20, att.critRange || 20);
  const need = Math.min(kb - total, critRange);
  return { need, mode, chance: chanceD20(need, mode), critChance: chanceD20(critRange, mode) };
}

/** Probability that u fails a save of `stat` vs dc. */
export function saveFailChance(b, u, stat, dc) {
  const m = saveMode(u, stat);
  const mode = m.adv === m.dis ? 'normal' : m.adv ? 'adv' : 'dis';
  const p = Math.min(1, Math.max(0, (21 - (dc - saveBonusOf(b, u, stat))) / 20));
  const succ = mode === 'adv' ? 1 - (1 - p) * (1 - p) : mode === 'dis' ? p * p : p;
  return 1 - succ;
}

/** Multiplier and resource for a damage type against tgt: { mult, resource: 'hp' | 'mrl' }. */
export function damageMultiplier(b, tgt, dmgType) {
  let mult = dmgType === 'proxy' ? proxyFactor(tgt.tags) : 1;
  if (dmgType) for (const st of tgt.statuses) { const v = statusDef(b, st.id)?.vulnMul?.[dmgType]; if (v) mult *= v; }
  const r = resistOf(b, tgt, dmgType);
  if (r === 'immune') mult = 0;
  else if (r === 'resist') mult *= 0.5;
  else if (r === 'vuln') mult *= 2;
  const mrl = !!MRL_TYPES[dmgType];
  if (mrl && (tgt.maxMrl <= 0 || tgt.down)) mult = 0;
  return { mult, resource: mrl ? 'mrl' : 'hp' };
}

/** Flat damage bonus of a weapon hit (stat mod + passives + buffs + marks on target). */
export function weaponDamageBonus(b, att, tgt) {
  if (!att.weapon) return 0;
  return mod(effStat(b, att, att.weapon.stat || 'str')) + attackDmgBonus(b, att, tgt, isMeleeWeapon(att) ? 'melee' : 'ranged')
    + (att.weapon.dmg || 0) + dmgTypeTier(att, att.weapon.dmgType);
}
export function spellDamageBonus(b, att, tgt) { return attackDmgBonus(b, att, tgt, 'spell'); }
export function isStatusImmune(b, u, id) {
  const d = statusDef(b, id);
  return !d || u.immuneStatus.includes(id) || !!(d.immuneTags && d.immuneTags.some((t) => unitHasTag(u, t)));
}
export { canUseWeapon, approachOk };

/** Snapshot for UI. */
export function unitView(b, u) {
  return {
    id: u.id, name: u.name, team: u.team, kind: u.kind, x: u.x, y: u.y,
    hp: u.hp, maxHp: u.maxHp, mrl: u.mrl, maxMrl: u.maxMrl, enr: u.enr, maxEnr: u.maxEnr,
    kb: getKb(b, u), speed: getSpeed(b, u), shield: u.shield ? u.shield.value : 0,
    statuses: u.statuses.map((s) => ({ id: s.id, turns: s.turns, value: s.value, source: s.source })),
    buffs: u.buffs.map((s) => ({ stat: s.stat, value: s.value, turns: s.turns })),
    down: u.down, dead: u.dead, nadlom: u.nadlom, lostControl: u.lostControl > 0,
    weaponCharges: u.weaponCharges, weaponHot: !!u.weaponHot, weaponBlocked: u.weapon ? weaponBlocked(b, u) : null,
    mechShield: !!(u.shield && u.shield.mech),
  };
}
