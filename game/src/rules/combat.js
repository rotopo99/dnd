// Combat engine: turn-based grid battle, pure JS (no DOM). Every outcome goes to the event log.
//
// Decisions on gaps / contradictions in docs/specs/core-rules.md (v1 + v1.1):
//  1. Status durations count the target's own turns: tick at the start of its turn, `turns` decrease at the
//     end of its turn. Statuses/buffs/shields applied during the owner's own turn are "fresh" and skip that
//     first decrement (a self-buff with turns:1 lasts until the end of the owner's next turn).
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

import { createRng } from './rng.js';
import { rollDice, d20, firstDie, chanceD20 } from './dice.js';
import { mod, normalizeData, buildCreature, buildEnemy, TIER_BONUS } from './character.js';
import {
  parseMap, makeArena, chebyshev, lineOfSight, hasCover, reachable, pathTo, walkLine,
  tileAt, isPassable, inBounds, nearestFree, DIRS8, T_HAZARD, T_EXIT, T_WALL,
} from './grid.js';

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
const CASTER_OPS = { move: 1, summon: 1, extraAction: 1 };
const HERO_KINDS = { hero: 1, ally: 1 };
const DEFAULT_STATUS_DC = 12;

// ---------------------------------------------------------------- events

function emit(b, ev) {
  ev.round = b.round;
  if (b.log) b.log.push(ev);
  if (b.onEvent) b.onEvent(ev, b);
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
  for (let i = 0; i < st.length; i++) if (st[i].stackStat === key) sum += st[i].stack;
  return sum;
}

function skipsTurn(b, u) {
  for (const s of u.statuses) if (statusDef(b, s.id)?.skipTurn) return true;
  return false;
}

function incomingDmg(b, u) {
  let sum = 0;
  for (const s of u.statuses) {
    if (s.value != null) sum += s.value;
    else {
      const m = statusDef(b, s.id)?.mods;
      if (m) sum += (m.incomingDmg || 0) + (m.dmgTaken || 0);
    }
  }
  return sum;
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
  if (ranged && attacker && hasCover(b.grid, attacker.x, attacker.y, u.x, u.y)) kb += 2;
  return kb;
}

export function weaponRange(u) { return u.weapon ? (u.weapon.range || 1) : 1; }
export const isMeleeUnit = (u) => !!u.weapon && !u.noAttack && weaponRange(u) <= 1;

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
export const getDc = (b, u, a) => (u.dcOverride != null && !(a && a.castStat) ? u.dcOverride : 8 + castMod(b, u, a) + u.prof);

export function bonusValue(b, u, bonus, a) {
  if (bonus == null) return 0;
  if (bonus === 'castMod') return castMod(b, u, a);
  if (bonus === 'weaponMod') return u.weapon ? mod(effStat(b, u, u.weapon.stat || 'str')) : 0;
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

const canUseWeapon = (b, u) => !!u.weapon && !u.noAttack && !modFlag(b, u, 'blockWeapon');

// ---------------------------------------------------------------- battle setup

function initUnit(u) {
  const c = { ...u, stats: { ...u.stats }, resist: { ...u.resist } };
  c.x = -1; c.y = -1;
  c.statuses = []; c.buffs = []; c.shield = null; c.uses = {};
  c.down = false; c.dead = false; c.removed = false; c.downTurns = 0;
  c.reactionUsed = false; c.roundHpLoss = 0; c.bigHitRound = -1;
  c.deathSavesLeft = u.deathSaves || 0; c.lostControl = 0; c.lostControlFresh = false;
  c.summonTurns = null; c.summoner = null; c.nadlom = false; c.initiative = 0;
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
  };
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
    }
    const u = b.byId[b.order[b.turnIndex]];
    if (!u || u.dead || u.removed) continue;
    if (beginTurn(b, u)) return;
    if (!b.winner) finishTurn(b, u);
  }
  b.turn = null;
}

function beginTurn(b, u) {
  u.reactionUsed = false;
  b.turn = { unitId: u.id, move: 0, actions: 1, bonus: 1, disengaged: false, lostControl: false, aiMoves: 0, acted: false };
  b.reachCache = null;
  emit(b, { type: 'turnStart', actor: u.id });
  if (u.down) {
    u.downTurns++;
    emit(b, { type: 'downTick', actor: u.id, turns: u.downTurns });
    if (u.downTurns >= 3) kill(b, u, 'bleedout');
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
      if (d.tick.op === 'buff' && d.tick.cumulative) {
        const cap = d.tick.cap ?? -99;
        s.stackStat = d.tick.stat;
        const next = (s.stack || 0) + (d.tick.value || 0);
        s.stack = d.tick.value < 0 ? Math.max(cap, next) : Math.min(cap, next);
        emit(b, { type: 'tick', actor: s.source, target: u.id, status: s.id, stat: s.stackStat, value: s.stack });
        continue;
      }
      emit(b, { type: 'tick', actor: s.source, target: u.id, status: s.id });
      applyOp(b, src, u, d.tick, { tick: true });
    }
  }
  if (!isStanding(u)) return false;
  if (checkVictory(b)) return false;
  if (skipsTurn(b, u)) {
    emit(b, { type: 'skipTurn', actor: u.id });
    return false;
  }
  let speed = getSpeed(b, u);
  if (hasStatus(u, 'prone')) {
    removeStatus(b, u, 'prone');
    speed = Math.floor(speed / 2);
    emit(b, { type: 'standUp', actor: u.id });
  }
  b.turn.move = speed;
  if (u.lostControl > 0) {
    b.turn.lostControl = true;
    emit(b, { type: 'lostControlTurn', actor: u.id });
  }
  return true;
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
    else if (--u.shield.turns <= 0) { u.shield = null; emit(b, { type: 'shieldEnd', target: u.id }); }
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
  if (!winner && teams > 0 && standing.size <= 1) winner = standing.size ? [...standing][0] : 'draw';
  if (winner) {
    b.winner = winner;
    emit(b, { type: 'victory', winner });
  }
  return b.winner;
}

// ---------------------------------------------------------------- damage, healing, death

function kill(b, u, reason) {
  if (u.dead) return;
  u.dead = true; u.down = false; u.hp = 0; u.shield = null;
  clearPos(b, u);
  emit(b, { type: 'death', target: u.id, reason });
  checkVictory(b);
}

function unsummon(b, u) {
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
  let amt = Math.max(0, Math.floor(amount));
  let mult = 1;
  if (dmgType === 'proxy') {
    mult = proxyFactor(tgt.tags);
    amt = Math.floor(amt * mult);
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
    if (amt > 0) {
      if (!tgt.nadlom && tgt.mrl <= tgt.maxMrl / 2) {
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
      if (tgt.downTurns >= 3) kill(b, tgt, 'finished');
    }
    return amt;
  }
  tgt.hp -= amt;
  tgt.roundHpLoss += amt;
  emit(b, { type: 'damage', actor: srcId, target: tgt.id, amount: amt, absorbed, dmgType, resource: 'hp', resist: r, mult, crit, value: Math.max(0, tgt.hp) });
  if (tgt.hp <= 0) zeroHp(b, tgt, src);
  else if (amt > 0) bigHitCheck(b, tgt);
  if (amt > 0 && isAlive(tgt)) triggerReactions(b, 'allyDamaged', tgt, src);
  return amt;
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
    if (!checkVictory(b)) triggerReactions(b, 'allyDown', u, src);
  } else {
    kill(b, u, 'killed');
  }
}

function bigHitCheck(b, u) {
  if (u.bigHitRound === b.round || u.roundHpLoss < u.maxHp * 0.5) return;
  u.bigHitRound = b.round;
  const ok = rollSave(b, u, 'con', 12, null, 'bigHit');
  emit(b, { type: 'bigHit', target: u.id, success: ok });
  if (!ok) applyStatus(b, u, 'stun', 1, null);
}

function breakdown(b, u) {
  const roll = 1 + Math.floor(b.rng() * 20);
  if (roll <= 10) {
    const before = u.hp;
    u.hp = Math.max(1, u.hp - Math.floor(u.hp * 0.7));
    emit(b, { type: 'breakdown', target: u.id, roll, result: 'heartbreak', amount: before - u.hp, value: u.hp });
  } else {
    u.lostControl = 1;
    u.lostControlFresh = !!(b.turn && b.turn.unitId === u.id);
    emit(b, { type: 'breakdown', target: u.id, roll, result: 'lostControl' });
  }
  u.mrl = Math.floor(u.maxMrl * 0.25);
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
      got = Math.min(tgt.maxHp - tgt.hp, amount);
      tgt.hp += got;
    }
    for (let i = tgt.statuses.length - 1; i >= 0; i--) {
      if (statusDef(b, tgt.statuses[i].id)?.endOnHeal) removeStatus(b, tgt, tgt.statuses[i].id);
    }
  } else if (resource === 'mrl') {
    got = Math.min(tgt.maxMrl - tgt.mrl, amount);
    tgt.mrl += got;
    if (tgt.nadlom && tgt.mrl > tgt.maxMrl / 2) tgt.nadlom = false;
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
  if (tgt.immuneStatus.includes(id) || (d.immuneTags && d.immuneTags.some((t) => tgt.tags.includes(t)))) {
    emit(b, { type: 'statusImmune', actor: src ? src.id : null, target: tgt.id, id });
    return false;
  }
  const n = turns ?? d.turns ?? 1;
  const fresh = !!(b.turn && b.turn.unitId === tgt.id);
  const cur = getStatus(tgt, id);
  if (cur) {
    cur.turns = Math.max(cur.turns ?? 0, n);
    if (src) cur.source = src.id;
    if (value != null) cur.value = Math.max(cur.value ?? 0, value);
    if (dc != null) cur.dc = Math.max(cur.dc ?? 0, dc);
    cur.fresh = cur.fresh || fresh;
  } else {
    tgt.statuses.push({ id, turns: n, source: src ? src.id : null, fresh, value: value ?? null, dc: dc ?? null, stack: 0, stackStat: null });
  }
  emit(b, { type: 'status', actor: src ? src.id : null, target: tgt.id, id, turns: n });
  return true;
}

export function removeStatus(b, u, id) {
  for (let i = u.statuses.length - 1; i >= 0; i--) {
    if (u.statuses[i].id === id) {
      u.statuses.splice(i, 1);
      emit(b, { type: 'statusEnd', target: u.id, id });
    }
  }
}

function addBuff(b, src, tgt, stat, value, turns) {
  tgt.buffs.push({ stat, value, turns: turns ?? 1, fresh: !!(b.turn && b.turn.unitId === tgt.id), source: src ? src.id : null });
  emit(b, { type: 'buff', actor: src ? src.id : null, target: tgt.id, stat, value, turns: turns ?? 1 });
}

function addShield(b, src, tgt, value, turns) {
  if (value <= 0) return;
  if (tgt.shield && tgt.shield.value >= value) {
    emit(b, { type: 'shield', actor: src ? src.id : null, target: tgt.id, value: tgt.shield.value, kept: true });
    return;
  }
  tgt.shield = { value, turns: turns ?? 1, fresh: !!(b.turn && b.turn.unitId === tgt.id) };
  emit(b, { type: 'shield', actor: src ? src.id : null, target: tgt.id, value, turns: turns ?? 1 });
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
  const dis = stat === 'wil' && u.maxMrl > 0 && u.mrl <= u.maxMrl / 2; // «Надлом»
  return { adv, dis };
}
function saveBonusOf(b, u, stat) {
  return mod(effStat(b, u, stat)) + (u.saves.includes(stat) ? u.prof : 0) + statusMod(b, u, 'saves', 'save') + buffSum(u, 'save');
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

function attackMode(b, att, tgt, melee, isWeapon) {
  const adv = !!modFlag(b, att, 'attackAdv') || !!modFlag(b, att, 'firstAttackAdv') || !!modFlag(b, tgt, 'attackedAdv')
    || (melee && !!modFlag(b, tgt, 'attackedAdvMelee')) || tgt.down;
  const dis = !!modFlag(b, att, 'attackDisadv') || !!modFlag(b, tgt, 'attackedDisadv')
    || (!melee && !!modFlag(b, tgt, 'attackedDisadvRanged')) || (isWeapon && att.weaponTier <= 1);
  return { adv, dis };
}

/** Attack roll d20 + bonus >= KB. Triggers selfAttacked reactions. Returns { hit, crit, extraDice }. */
function attackRoll(b, att, tgt, bonus, melee, isWeapon) {
  triggerReactions(b, 'selfAttacked', tgt, att);
  if (!isAlive(tgt) || !isStanding(att)) return { hit: false, crit: false, extraDice: 0 };
  const extraDice = isWeapon ? statusMod(b, att, 'extraWeaponDice') : 0;
  const r = d20(b.rng, attackMode(b, att, tgt, melee, isWeapon));
  const total = r.natural + bonus + att.hitBonus + statusMod(b, att, 'hit') + buffSum(att, 'hit') + consumeNextRoll(b, att);
  const kb = getKb(b, tgt, att, !melee);
  let crit = r.natural >= Math.min(20, att.critRange || 20);
  const hit = r.natural !== 1 && (crit || total >= kb);
  if (hit && tgt.down) crit = true;
  if (!hit) crit = false;
  emit(b, { type: 'attack', actor: att.id, target: tgt.id, roll: { natural: r.natural, rolls: r.rolls, mode: r.mode, bonus: total - r.natural, total }, kb, hit, crit, melee });
  breakStatuses(b, att, 'attack');
  return { hit, crit, extraDice };
}

function attackDmgBonus(b, att, tgt, kind) {
  let v = (att.dmgBonus.all || 0) + (att.dmgBonus[kind] || 0) + buffSum(att, 'dmg') + statusMod(b, att, 'dmg') + incomingDmg(b, tgt);
  if (kind === 'melee') v += statusMod(b, att, 'dmgMelee', 'meleeDmg');
  return v;
}

function weaponDamage(b, att, tgt, crit, extraWeaponDice, extraDice, extraType) {
  const w = att.weapon;
  const melee = weaponRange(att) <= 1;
  const critDice = crit && w.dmgType !== 'proxy';
  let amt = rollDice(b.rng, w.dice, critDice) + mod(effStat(b, att, w.stat || 'str')) + attackDmgBonus(b, att, tgt, melee ? 'melee' : 'ranged');
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
}

/** Full weapon attack (roll + damage). Returns { hit, crit }. */
function weaponAttack(b, att, tgt, op) {
  if (!att.weapon) return { hit: false, crit: false };
  const melee = weaponRange(att) <= 1;
  const res = attackRoll(b, att, tgt, weaponAttackBonus(b, att) + ((op && op.hit) || 0), melee, true);
  if (res.hit) weaponDamage(b, att, tgt, res.crit, res.extraDice, op && op.extraDice, op && op.extraType);
  return res;
}

// ---------------------------------------------------------------- movement

function hazardEnter(b, u) {
  if (tileAt(b.grid, u.x, u.y) !== T_HAZARD || !isAlive(u)) return;
  emit(b, { type: 'hazard', target: u.id, x: u.x, y: u.y });
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
    if (tileAt(b.grid, u.x, u.y) === T_HAZARD) { flush(); hazardEnter(b, u); }
  }
  flush();
  return steps;
}

function opportunity(b, r, mover) {
  if (r.reactionUsed || !isStanding(r) || skipsTurn(b, r)) return;
  const a = r.abilities.find((x) => x.action === 'reaction' && x.trigger === 'enemyLeaves' && abilityUsable(b, r, x, true) === null);
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
  const from = { x: tgt.x, y: tgt.y };
  let moved = 0;
  for (let i = 0; i < tiles; i++) {
    const nx = tgt.x + dx, ny = tgt.y + dy;
    if (!isPassable(b.grid, nx, ny) || unitAt(b, nx, ny)) break;
    setPos(b, tgt, nx, ny);
    moved++;
    if (tileAt(b.grid, nx, ny) === T_HAZARD) break;
  }
  emit(b, { type: 'push', actor: src.id, target: tgt.id, from, to: { x: tgt.x, y: tgt.y }, tiles: moved });
  if (moved) hazardEnter(b, tgt);
}

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
  if (!isStanding(u)) return 'down';
  if (a.usesPerBattle != null && (u.uses[a.id] || 0) >= a.usesPerBattle) return 'uses';
  const cost = a.cost || 0;
  if (cost > u.enr && !u.overcast) return 'energy';
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

function moveTileValid(b, u, a, mv, x, y) {
  if (!inBounds(b.grid, x, y) || !isPassable(b.grid, x, y) || unitAt(b, x, y)) return false;
  const lim = a.target === 'self' || a.range == null || a.range === 0 ? mv.tiles : Math.min(abilityRange(u, a), mv.tiles);
  if (chebyshev(u.x, u.y, x, y) > lim) return false;
  if (mv.mode !== 'teleport') {
    const reach = reachable(b.grid, u.x, u.y, mv.tiles, b.occ);
    return reach.dist[y * b.grid.w + x] > 0;
  }
  return true;
}

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
    if (mv && !a.area) return moveTileValid(b, u, a, mv, spec.x, spec.y);
    if (tileAt(b.grid, spec.x, spec.y) === T_WALL) return false;
    return chebyshev(u.x, u.y, spec.x, spec.y) <= range && lineOfSight(b.grid, u.x, u.y, spec.x, spec.y);
  }
  const t = spec && spec.unit ? b.byId[spec.unit] : null;
  if (!t || !isAlive(t)) return false;
  if (a.target === 'enemy') {
    if (!isHostile(b, u, t)) return false;
    const ts = tauntSource(b, u);
    if (ts && ts !== t) return false;
  } else if (a.target === 'ally') {
    if (t.team !== u.team) return false;
  }
  const d = chebyshev(u.x, u.y, t.x, t.y);
  if (mv) return d <= Math.max(range, mv.tiles + (hasOp(a, 'weapon') ? weaponRange(u) : 1));
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
  return t.tags.includes(only) || t.tags.includes('hybrid');
}
export { tagOk };

/**
 * Apply one effect operation from caster to target.
 * ctx: { crit, half, attacked, tick, ability, dc, dmgBonusUsed }.
 */
export function applyOp(b, caster, t, op, ctx = {}) {
  if (!isAlive(t)) return;
  const half = !!ctx.half;
  if (half && op.op !== 'damage' && op.op !== 'drain') return;
  const a = ctx.ability || null;
  switch (op.op) {
    case 'damage': {
      const critDice = !!ctx.crit && op.dmgType !== 'proxy';
      let amt = rollDice(b.rng, op.dice, critDice) + bonusValue(b, caster, op.bonus, a);
      if (ctx.attacked && !ctx.dmgBonusUsed) { amt += attackDmgBonus(b, caster, t, 'spell'); ctx.dmgBonusUsed = true; }
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
    case 'status':
      applyStatus(b, t, op.id, op.turns, caster, op.value, ctx.dc ?? getDc(b, caster, a));
      break;
    case 'cleanse': {
      let n = op.count || 1;
      const list = t.statuses
        .map((s) => ({ s, d: statusDef(b, s.id) }))
        .filter((x) => op.kind === 'any' || x.d?.kind === 'debuff')
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
      if (cur) { cur.turns = Math.max(cur.turns ?? 0, op.turns ?? 1); cur.value = Math.max(cur.value ?? 0, val); cur.source = caster.id; }
      else t.statuses.push({ id, turns: op.turns ?? 1, source: caster.id, fresh, value: val, dc: null, stack: 0, stackStat: null });
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
      }
      break;
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
}

function abilityMove(b, u, op, spec) {
  const tiles = op.tiles || 1;
  let dest = null;
  if (spec && spec.x != null) dest = { x: spec.x, y: spec.y };
  else if (spec && spec.unit) {
    const t = b.byId[spec.unit];
    if (!t || t === u || chebyshev(u.x, u.y, t.x, t.y) <= 1) return;
    const reach = op.mode === 'teleport' ? null : reachable(b.grid, u.x, u.y, tiles, b.occ);
    let best = null, bestD = 1e9;
    for (const [dx, dy] of DIRS8) {
      const x = t.x + dx, y = t.y + dy;
      if (!isPassable(b.grid, x, y) || unitAt(b, x, y)) continue;
      const d = reach ? reach.dist[y * b.grid.w + x] : chebyshev(u.x, u.y, x, y);
      if (d < 0 || d > tiles) continue;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    dest = best;
  }
  if (!dest || (dest.x === u.x && dest.y === u.y)) return;
  if (op.mode === 'teleport') {
    if (!isPassable(b.grid, dest.x, dest.y) || unitAt(b, dest.x, dest.y)) return;
    const from = { x: u.x, y: u.y };
    setPos(b, u, dest.x, dest.y);
    emit(b, { type: 'teleport', actor: u.id, from, to: { ...dest } });
    hazardEnter(b, u);
  } else {
    const reach = reachable(b.grid, u.x, u.y, tiles, b.occ);
    const path = pathTo(reach, dest.y * b.grid.w + dest.x);
    if (path && path.length) walk(b, u, path, true);
  }
}

function spawnSummon(b, owner, unitId, turns, tile, team) {
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
  if (part.filter && part.filter.ranged) list = list.filter((x) => weaponRange(x) > 1);
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

function resolveAbility(b, u, a, spec, asReaction) {
  const cost = a.cost || 0;
  const overcast = cost > u.enr;
  u.enr = overcast ? 0 : u.enr - cost;
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
  const effects = a.effects || [];
  for (const op of effects) if (op.op === 'move' && !op.random) abilityMove(b, u, op, spec);
  if (!isStanding(u)) return;
  const hasWeapon = hasOp(a, 'weapon');
  const reachLimit = hasWeapon ? Math.max(weaponRange(u), a.range === 'weapon' ? 0 : 1) : Math.max(1, abilityRange(u, a));
  const dc = getDc(b, u, a);
  const targets = abilityTargets(b, u, a, spec);
  let offensive = false;
  for (const t of targets) {
    if (!isAlive(t)) continue;
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
      const r = attackRoll(b, u, t, spellAttackBonus(b, u, a), abilityRange(u, a) <= 1, false);
      if (!r.hit) continue;
      ctx.crit = r.crit;
      ctx.attacked = true;
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
  }
  for (const op of effects) {
    if (op.op === 'summon') spawnSummon(b, u, op.unit, op.turns, spec && spec.x != null ? spec : null, op.side === 'hostileToAll' ? 'chaos' : op.team);
    else if (op.op === 'extraAction') applyOp(b, u, u, op, { ability: a });
    else if (op.self && op.op !== 'move') applyOp(b, u, u, op, { ability: a, dc });
  }
  if (offensive) breakStatuses(b, u, 'attack');
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
  if (t.actions > 0) {
    for (const s of u.statuses) if (statusDef(b, s.id)?.endAction) out.push({ type: 'endStatus', unit: unitId, status: s.id });
  }
  if (t.actions > 0 && canUseWeapon(b, u)) {
    const range = weaponRange(u);
    for (const e of b.units) {
      if (!isAlive(e) || !isHostile(b, u, e)) continue;
      if (canAttack(b, u, e, range)) out.push({ type: 'attack', unit: unitId, target: e.id });
    }
  }
  for (const a of u.abilities) {
    if (abilityUsable(b, u, a, false) !== null) continue;
    for (const spec of abilitySpecs(b, u, a)) out.push({ type: 'ability', unit: unitId, ability: a.id, ...spec });
  }
  return out;
}

function canAttack(b, u, e, range) {
  const ts = tauntSource(b, u);
  if (ts && ts !== e) return false;
  const d = chebyshev(u.x, u.y, e.x, e.y);
  return d <= range && (d <= 1 || lineOfSight(b.grid, u.x, u.y, e.x, e.y));
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
  if (range === 0 && a.target !== 'tile') return [{}];
  if (a.target === 'tile') {
    if (mv && !a.area) { tilesAround(Math.min(range || mv.tiles, mv.tiles)); return out; }
    if (!a.area) {
      for (const [dx, dy] of DIRS8) {
        const x = u.x + dx, y = u.y + dy;
        if (isPassable(b.grid, x, y) && !unitAt(b, x, y)) out.push({ tile: { x, y } });
      }
      return out;
    }
    for (const e of b.units) {
      if (!isAlive(e) || e === u || !isHostile(b, u, e)) continue;
      if (targetValid(b, u, a, { x: e.x, y: e.y })) out.push({ tile: { x: e.x, y: e.y } });
    }
    return out;
  }
  for (const e of b.units) {
    if (!isAlive(e)) continue;
    if (targetValid(b, u, a, { unit: e.id })) out.push({ target: e.id });
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
  const u = b.byId[uid];
  if (!isStanding(u)) return fail(b, start, 'down');
  const t = b.turn;
  switch (action.type) {
    case 'endTurn':
      return { ok: true, events: endTurn(b) };
    case 'move': {
      if (!action.to || !inBounds(b.grid, action.to.x, action.to.y)) return fail(b, start, 'noTarget');
      const reach = getReachable(b, uid);
      const idx = action.to.y * b.grid.w + action.to.x;
      if (reach.dist[idx] <= 0) return fail(b, start, 'unreachable');
      if (!approachOk(b, u, action.to.x, action.to.y)) return fail(b, start, 'fear');
      const steps = walk(b, u, pathTo(reach, idx), t.disengaged);
      t.move = Math.max(0, t.move - steps);
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
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!hasStatus(u, action.status) || !statusDef(b, action.status)?.endAction) return fail(b, start, 'badStatus');
      t.actions--;
      emit(b, { type: 'endStatus', actor: uid, id: action.status });
      removeStatus(b, u, action.status);
      break;
    }
    case 'attack': {
      if (t.actions <= 0) return fail(b, start, 'noAction');
      if (!canUseWeapon(b, u)) return fail(b, start, 'noWeapon');
      let tgt = b.byId[action.target];
      if (!tgt || !isAlive(tgt) || !isHostile(b, u, tgt)) return fail(b, start, 'badTarget');
      if (!canAttack(b, u, tgt, weaponRange(u))) return fail(b, start, 'outOfRange');
      t.actions--;
      t.acted = true;
      tgt = hallucinate(b, u, tgt, weaponRange(u));
      weaponAttack(b, u, tgt, null);
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
  const m = attackMode(b, att, tgt, melee, isWeapon);
  const mode = m.adv === m.dis ? 'normal' : m.adv ? 'adv' : 'dis';
  let kb = getKb(b, tgt, null, false);
  if (!melee && hasCover(b.grid, fx, fy, tgt.x, tgt.y)) kb += 2;
  const total = bonus + att.hitBonus + statusMod(b, att, 'hit') + buffSum(att, 'hit');
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
  return mod(effStat(b, att, att.weapon.stat || 'str')) + attackDmgBonus(b, att, tgt, weaponRange(att) <= 1 ? 'melee' : 'ranged');
}
export function spellDamageBonus(b, att, tgt) { return attackDmgBonus(b, att, tgt, 'spell'); }
export function isStatusImmune(b, u, id) {
  const d = statusDef(b, id);
  return !d || u.immuneStatus.includes(id) || !!(d.immuneTags && d.immuneTags.some((t) => u.tags.includes(t)));
}
export { canUseWeapon, approachOk };

/** Snapshot for UI. */
export function unitView(b, u) {
  return {
    id: u.id, name: u.name, team: u.team, kind: u.kind, x: u.x, y: u.y,
    hp: u.hp, maxHp: u.maxHp, mrl: u.mrl, maxMrl: u.maxMrl, enr: u.enr, maxEnr: u.maxEnr,
    kb: getKb(b, u), speed: getSpeed(b, u), shield: u.shield ? u.shield.value : 0,
    statuses: u.statuses.map((s) => ({ id: s.id, turns: s.turns, value: s.value })),
    buffs: u.buffs.map((s) => ({ stat: s.stat, value: s.value, turns: s.turns })),
    down: u.down, dead: u.dead, nadlom: u.nadlom, lostControl: u.lostControl > 0,
  };
}
