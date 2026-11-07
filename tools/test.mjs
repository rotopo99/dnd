// Rules engine tests: node tools/test.mjs (exit code 1 on failure). No frameworks.
import assert from 'node:assert/strict';
import { createRng } from '../game/src/rules/rng.js';
import { parseDice, rollDice, d20, avgDice } from '../game/src/rules/dice.js';
import { buildCreature, buildEnemy, mod, profBonus, pointBuyCost, defaultCombatTalentLimit, DEFAULT_ASI_LEVELS, applyUpgrades } from '../game/src/rules/character.js';
import { parseMap, chebyshev, lineOfSight, hasCover, findPath, reachable, makeArena } from '../game/src/rules/grid.js';
import { createBattle, perform, endTurn, getLegalActions, dealDamage, applyStatus, applyOp, getKb, weaponDamageBonus, isMeleeAttack, attackOdds,
  BREAKDOWN_HEARTBREAK_MAX, HEARTBREAK_HP_LOSS, BREAKDOWN_MRL_RESET, BIG_HIT_FRACTION, BIG_HIT_DC, COVER_KB, DOWN_TURNS_TO_DEATH, OVERCAST_LIMIT } from '../game/src/rules/combat.js';
import { chooseAction, playTurn, evalAction } from '../game/src/rules/ai.js';
import { applyWithdrawal, clearWithdrawal } from '../game/src/rules/aftermath.js';
import { skillCheck, skillTier } from '../game/src/rules/skills.js';
import { levelForXp, xpToNext, battleXp, questXp, gainXp, rebuildHero, XP_THRESHOLDS, levelGains, xpScale, enemyXpForLevel } from '../game/src/rules/progression.js';
import { SUMMON_HP_PER_LEVEL, SUMMON_DMG_PER_LEVEL, grantSafePassage, hasSafePassage } from '../game/src/rules/combat.js';
import { validateBuild } from '../game/src/rules/build.js';
import { profPoints, proficiencyCost, defaultProficiencies } from '../game/src/rules/equipment.js';
import { simulateBattle } from '../game/src/rules/simulate.js';
import { createSurface, radiusTiles, floorAt, gasAt, surfaceHarm, surfaceEnterPreview, tierOf } from '../game/src/rules/surfaces.js';
import { SURFACES, SURFACE_RULES } from '../game/src/data/surfaces.js';
import { DATA } from './fixtures/rules-data.mjs';
import { getReachable } from '../game/src/rules/combat.js';
const getReachable_ = (b, u) => getReachable(b, u.id);
import { rollLoot } from '../game/src/world/loot.js';
import { GAME_DATA } from '../game/src/data/index.js';
import { LOCATIONS as LOCS } from '../game/src/data/world/locations.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.stack.split('\n').slice(0, 3).join('\n       ')}`); }
}

/** rng stub: returns naturals from `nats` for d20s in order (as raw floats), then 0.5. */
function stubRng(values) {
  let i = 0;
  const r = () => (i < values.length ? values[i++] : 0.5);
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}
const nat = (n) => (n - 1) / 20 + 1e-6;

const DUEL_MAP = { id: 't', grid: ['######', '#PE..#', '######'], win: 'killAll' };
const hero = (over = {}) => buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data: DATA, ...over });
function duel(enemy = 'thug', h = hero(), map = DUEL_MAP) {
  const b = createBattle({ map, heroes: [h], enemies: [enemy], data: DATA, seed: 7, autoReactions: false });
  const H = b.units.find((u) => u.team === 'heroes');
  const E = b.units.find((u) => u.team === 'enemies');
  return { b, H, E };
}
function forceTurn(b, u) {
  b.turn = { unitId: u.id, move: 6, actions: 1, bonus: 1, disengaged: false, lostControl: false, aiMoves: 0, acted: false };
}
const events = (b, type) => b.log.filter((e) => e.type === type);

console.log('rng / dice');
test('rng is deterministic', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.notEqual(createRng(1)(), createRng(2)());
});
test('parseDice', () => {
  assert.deepEqual(parseDice('2d6+3').terms, [{ n: 2, sides: 6, sign: 1 }]);
  assert.equal(parseDice('2d6+3').bonus, 3);
  assert.equal(parseDice('d20').terms[0].n, 1);
  assert.equal(parseDice('1d8+1d4-1').terms.length, 2);
  assert.equal(parseDice('1d8+1d4-1').bonus, -1);
  assert.throws(() => parseDice('2x6'));
  assert.equal(avgDice('2d6+3'), 10);
});
test('crit doubles dice, not bonus', () => {
  const r = stubRng([0.999, 0.999, 0.999, 0.999]);
  assert.equal(rollDice(r, '2d6+3', true), 6 * 4 + 3);
});
test('d20 advantage / disadvantage / cancel', () => {
  assert.equal(d20(stubRng([nat(5), nat(17)]), { adv: true }).natural, 17);
  assert.equal(d20(stubRng([nat(5), nat(17)]), { dis: true }).natural, 5);
  const both = d20(stubRng([nat(5), nat(17)]), { adv: true, dis: true });
  assert.equal(both.natural, 5);
  assert.equal(both.rolls.length, 1);
});

console.log('character');
test('Repa sheet: HP 25, ENR 22, MRL 27 (135 / 5)', () => {
  const repa = buildCreature({ race: 'skeleton', cls: 'itishnik', level: 1, path: 'mechanic', data: DATA,
    stats: { str: 12, dex: 12, con: 10, int: 14, wil: 8, per: 12, cha: 10 } });
  assert.equal(repa.stats.dex, 13);
  assert.equal(repa.maxHp, 25);
  assert.equal(repa.maxEnr, 22);
  assert.equal(repa.maxMrl, 27);
  assert.equal(repa.maxMrl * 5, 135);
});
test('mods, prof, KB caps, any-bonus, path overrides, passives by path, todo skipped', () => {
  assert.equal(mod(8), -1); assert.equal(mod(15), 2); assert.equal(mod(10), 0);
  assert.equal(profBonus(4), 2); assert.equal(profBonus(5), 3);
  const z = hero({ stats: { str: 15, dex: 16, con: 14, int: 8, wil: 10, cha: 8, per: 10 } });
  assert.equal(z.kb, 10 + 6 + 0); // heavy: dex capped at 0
  assert.equal(z.stats.str, 16); // human any -> weapon stat for a tank
  assert.equal(z.maxHp, 10 + 14 + 5 + 2);
  const m = buildCreature({ race: 'skeleton', cls: 'itishnik', path: 'mechanic', data: DATA });
  const h = buildCreature({ race: 'skeleton', cls: 'itishnik', path: 'hacker', data: DATA });
  assert.equal(m.kb - h.kb, 1);
  assert.equal(h.weapon.range, 10);
  assert.ok(m.abilities.some((a) => a.id === 'drone'));
  assert.ok(!h.abilities.some((a) => a.id === 'drone'));
  assert.ok(!m.abilities.some((a) => a.id === 'todo-thing' || a.id === 'emp'));
  assert.ok(buildCreature({ race: 'human', cls: 'itishnik', level: 3, data: DATA }).abilities.some((a) => a.id === 'emp'));
  assert.equal(pointBuyCost(DATA.CLASSES.zabivnoy.recommended), 27);
});
test('allowedRaces throws a clear error', () => {
  assert.throws(() => buildCreature({ race: 'skeleton', cls: 'zabivnoy', data: DATA }), /not allowed/);
});
test('buildEnemy uses weapon.attack', () => {
  const e = buildEnemy('thug', { data: DATA });
  assert.equal(e.attackBonus, 3);
  assert.equal(e.maxHp, 12);
});

console.log('grid');
test('chebyshev, LOS, cover, path', () => {
  const g = parseMap({ grid: ['#######', '#.....#', '#..#..#', '#..c..#', '#######'] });
  assert.equal(chebyshev(0, 0, 3, 2), 3);
  assert.equal(lineOfSight(g, 1, 2, 5, 2), false); // wall at (3,2)
  assert.equal(lineOfSight(g, 1, 3, 5, 3), true); // cover does not block
  assert.equal(hasCover(g, 1, 3, 5, 3), true);
  assert.equal(hasCover(g, 1, 1, 5, 1), false);
  const p = findPath(g, 1, 2, 5, 2);
  assert.ok(p && p.length >= 4);
  const r = reachable(g, 1, 1, 2, null);
  assert.equal(r.dist[1 * g.w + 3], 2);
  assert.equal(r.dist[3 * g.w + 3], -1); // cover tile is impassable
});

console.log('combat');
test('hit: d20 + 5 vs KB 22 needs 17', () => {
  for (const [n, expect] of [[16, false], [17, true]]) {
    const { b, H, E } = duel();
    H.attackBonus = 5; H.hitBonus = 0;
    E.kb = 22;
    forceTurn(b, H);
    b.rng = stubRng([nat(n)]);
    assert.ok(perform(b, { type: 'attack', unit: H.id, target: E.id }).ok);
    const ev = events(b, 'attack').pop();
    assert.equal(ev.roll.total, n + 5);
    assert.equal(ev.kb, 22);
    assert.equal(ev.hit, expect, `natural ${n}`);
  }
});
test('natural 1 always misses, natural 20 always hits and crits', () => {
  let { b, H, E } = duel();
  H.attackBonus = 50; forceTurn(b, H); b.rng = stubRng([nat(1)]);
  perform(b, { type: 'attack', unit: H.id, target: E.id });
  assert.equal(events(b, 'attack').pop().hit, false);
  ({ b, H, E } = duel());
  H.attackBonus = -50; E.kb = 99; forceTurn(b, H); b.rng = stubRng([nat(20)]);
  perform(b, { type: 'attack', unit: H.id, target: E.id });
  const ev = events(b, 'attack').pop();
  assert.equal(ev.hit, true);
  assert.equal(ev.crit, true);
});
test('advantage (blind target via mods) and disadvantage (fear) in attacks', () => {
  const { b, H, E } = duel();
  forceTurn(b, H);
  applyStatus(b, H, 'fear', 2, E);
  b.rng = stubRng([nat(18), nat(3)]);
  perform(b, { type: 'attack', unit: H.id, target: E.id });
  const ev = events(b, 'attack').pop();
  assert.equal(ev.roll.mode, 'dis');
  assert.equal(ev.roll.natural, 3);
});
test('proxy x1.5 mechanical, x0.5 organic, x1 hybrid', () => {
  const { b, H, E } = duel();
  E.tags = ['mechanical']; E.hp = E.maxHp = 100;
  assert.equal(dealDamage(b, H, E, 10, 'proxy'), 15);
  E.tags = ['organic'];
  assert.equal(dealDamage(b, H, E, 10, 'proxy'), 5);
  E.tags = ['hybrid'];
  assert.equal(dealDamage(b, H, E, 10, 'proxy'), 10);
});
test('proxy damage does not crit; blunt does', () => {
  for (const [type, expected] of [['proxy', 2], ['blunt', 4]]) {
    const { b, H, E } = duel();
    E.tags = ['hybrid']; E.hp = E.maxHp = 100;
    H.weapon = { name: 't', dice: '2d1', dmgType: type, stat: 'str', range: 1, hit: 0 };
    H.stats.str = 10; H.dmgBonus = { melee: 0, ranged: 0, spell: 0, all: 0 };
    forceTurn(b, H); b.rng = stubRng([nat(20)]);
    perform(b, { type: 'attack', unit: H.id, target: E.id });
    const dmg = events(b, 'damage').pop();
    assert.equal(dmg.amount, expected, type);
    assert.equal(dmg.crit, type !== 'proxy');
  }
});
test('resist / vuln / immune', () => {
  const { b, H, E } = duel();
  E.hp = E.maxHp = 100;
  E.resist = { fire: 'resist', toxin: 'vuln', electric: 'immune' };
  assert.equal(dealDamage(b, H, E, 9, 'fire'), 4);
  assert.equal(dealDamage(b, H, E, 5, 'toxin'), 10);
  assert.equal(dealDamage(b, H, E, 50, 'electric'), 0);
});
test('cringe lowers MRL, not HP; MRL 0 -> breakdown (Срыв), MRL reset to 25%', () => {
  const { b, H } = duel();
  const hp = H.hp, mrl = H.mrl;
  dealDamage(b, null, H, 5, 'cringe');
  assert.equal(H.hp, hp);
  assert.equal(H.mrl, mrl - 5);
  b.rng = stubRng([nat(4)]); // d20 = 4 -> heartbreak
  dealDamage(b, null, H, 999, 'psychic');
  const br = events(b, 'breakdown').pop();
  assert.ok(br, 'breakdown event');
  assert.equal(br.result, 'heartbreak');
  assert.equal(H.hp, Math.max(1, hp - Math.floor(hp * 0.7)));
  assert.equal(H.mrl, Math.floor(H.maxMrl * 0.25));
  assert.ok(events(b, 'nadlom').length === 1);
  b.rng = stubRng([nat(15)]);
  dealDamage(b, null, H, 999, 'cringe');
  assert.equal(events(b, 'breakdown').pop().result, 'lostControl');
  assert.equal(H.lostControl, 1);
});
test('shield absorbs HP damage, larger shield wins', () => {
  const { b, H, E } = duel();
  E.hp = E.maxHp = 50;
  E.shield = { value: 6, turns: 2 };
  assert.equal(dealDamage(b, H, E, 10, 'slash'), 4);
  assert.equal(E.shield, null);
});
test('statuses: tick at turn start, durations, immuneTags, endOnHeal, cumulative corrosion', () => {
  const { b, H, E } = duel();
  E.hp = E.maxHp = 100;
  applyStatus(b, E, 'bleed', 2, H);
  applyStatus(b, E, 'corrosion', 5, H);
  const kb0 = getKb(b, E);
  forceTurn(b, H); endTurn(b);
  while (b.turn && b.turn.unitId !== E.id) endTurn(b);
  assert.ok(events(b, 'tick').some((e) => e.target === E.id && e.status === 'bleed'));
  assert.equal(getKb(b, E), kb0 - 1);
  const mech = { ...H, tags: ['mechanical'] };
  assert.equal(applyStatus(b, Object.assign(H, { tags: ['mechanical'] }), 'bleed', 2, E), false);
  H.tags = ['organic']; void mech;
});
test('unconscious hero dies after 3 own turns', () => {
  const { b, H, E } = duel();
  E.stats.str = 1; E.weapon = null; E.noAttack = true; E.abilities = [];
  dealDamage(b, E, H, 999, 'slash');
  assert.equal(H.down, true);
  assert.equal(b.winner, 'enemies'); // only hero is down -> lose
  // standalone death counter with an ally standing
  const b2 = createBattle({ map: makeArena({ heroes: 2, enemies: 1 }), heroes: [hero(), hero()], enemies: ['thug'], data: DATA, seed: 3, autoReactions: false });
  const [h1] = b2.units.filter((u) => u.team === 'heroes');
  for (const u of b2.units) if (u.team === 'enemies') { u.noAttack = true; u.weapon = null; u.abilities = []; }
  dealDamage(b2, null, h1, 999, 'slash');
  assert.equal(h1.down, true);
  for (let i = 0; i < 20 && !h1.dead; i++) endTurn(b2);
  assert.equal(h1.dead, true);
  assert.equal(b2.log.filter((e) => e.type === 'downTick' && e.actor === h1.id).length, 3);
});
test('big hit >= 50% max HP in a round -> CON save DC 12 or stun', () => {
  const { b, H } = duel();
  b.rng = stubRng([nat(1)]);
  dealDamage(b, null, H, Math.ceil(H.maxHp / 2), 'slash');
  assert.ok(events(b, 'bigHit').length === 1);
  assert.ok(H.statuses.some((s) => s.id === 'stun'));
});
test('ability with weapon op: status only on hit; legal actions; self damage; summon', () => {
  const { b, H, E } = duel();
  E.hp = E.maxHp = 100;
  forceTurn(b, H);
  const legal = getLegalActions(b, H.id);
  assert.ok(legal.some((a) => a.type === 'ability' && a.ability === 'steel-fist' && a.target === E.id));
  b.rng = stubRng([nat(1)]);
  perform(b, { type: 'ability', unit: H.id, ability: 'steel-fist', target: E.id });
  assert.ok(!E.statuses.some((s) => s.id === 'bleed'), 'miss -> no status');
  forceTurn(b, H);
  b.rng = stubRng([nat(20)]);
  perform(b, { type: 'ability', unit: H.id, ability: 'steel-fist', target: E.id });
  assert.ok(E.statuses.some((s) => s.id === 'bleed'), 'hit -> status');
  const hp = H.hp;
  perform(b, { type: 'ability', unit: H.id, ability: 'blood' });
  assert.ok(H.hp < hp);
  assert.ok(H.buffs.some((x) => x.stat === 'dmg' && x.value === 2));
  const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'mechanic', data: DATA });
  const b3 = createBattle({ map: DUEL_MAP, heroes: [r], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  const R = b3.units[0];
  forceTurn(b3, R);
  assert.ok(perform(b3, { type: 'ability', unit: R.id, ability: 'drone' }).ok);
  const s = b3.units.find((u) => u.kind === 'summon');
  assert.ok(s && s.team === 'heroes' && s.summonTurns === 3);
});
test('overcast without ENR rolls the table', () => {
  const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'hacker', data: DATA });
  const b = createBattle({ map: { grid: ['#######', '#P...E#', '#######'] }, heroes: [r], enemies: ['thug'], data: DATA, seed: 2, autoReactions: false });
  const R = b.units[0];
  R.enr = 0;
  forceTurn(b, R);
  assert.ok(perform(b, { type: 'ability', unit: R.id, ability: 'zap', target: b.units[1].id }).ok);
  assert.ok(events(b, 'overcast').length === 1);
});
test('AI returns a legal action', () => {
  const { b, E } = duel('gunner');
  forceTurn(b, E);
  const a = chooseAction(b, E.id);
  assert.ok(a && a.type);
  assert.ok(perform(b, a).ok);
});

console.log('rules v1.2');
test('v1.2 «Сломлен»: non-boss enemy on 11-20 leaves the battle; boss and hero lose control', () => {
  let { b, H, E } = duel();
  b.rng = stubRng([nat(15)]);
  dealDamage(b, H, E, 999, 'cringe');
  assert.equal(events(b, 'breakdown').pop().result, 'broken');
  assert.equal(events(b, 'broken').length, 1);
  assert.equal(E.removed, true);
  assert.equal(E.broken, true);
  assert.equal(b.winner, 'heroes'); // the only enemy is broken -> counts as defeated
  ({ b, H, E } = duel());
  E.boss = true;
  b.rng = stubRng([nat(15)]);
  dealDamage(b, H, E, 999, 'cringe');
  assert.equal(events(b, 'breakdown').pop().result, 'lostControl');
  assert.equal(E.removed, false);
  assert.equal(E.lostControl, 1);
  ({ b, H, E } = duel());
  b.rng = stubRng([nat(4)]);
  dealDamage(b, H, E, 999, 'cringe');
  assert.equal(events(b, 'breakdown').pop().result, 'heartbreak');
  assert.equal(E.removed, false);
});
test('v1.2 overcast: at most 2 per battle per unit', () => {
  const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'hacker', data: DATA });
  const b = createBattle({ map: { grid: ['#######', '#P...E#', '#######'] }, heroes: [r], enemies: ['thug'], data: DATA, seed: 2, autoReactions: false });
  const R = b.units[0], E = b.units[1];
  E.hp = E.maxHp = 500;
  R.enr = 0; R.hp = R.maxHp = 500;
  for (let i = 0; i < 2; i++) {
    forceTurn(b, R);
    assert.ok(perform(b, { type: 'ability', unit: R.id, ability: 'zap', target: E.id }).ok, `overcast ${i + 1}`);
  }
  assert.equal(events(b, 'overcast').length, 2);
  forceTurn(b, R);
  const res = perform(b, { type: 'ability', unit: R.id, ability: 'zap', target: E.id });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'energy');
  assert.ok(!getLegalActions(b, R.id).some((a) => a.ability === 'zap'));
  R.enr = 5; // with enough ENR the ability works again
  forceTurn(b, R);
  assert.ok(perform(b, { type: 'ability', unit: R.id, ability: 'zap', target: E.id }).ok);
  assert.equal(events(b, 'overcast').length, 2);
});
test('v1.2 ranged attack with an adjacent enemy has disadvantage', () => {
  // adjacent: gunner next to the hero
  let { b, H, E } = duel('gunner');
  forceTurn(b, E);
  b.rng = stubRng([nat(18), nat(3)]);
  perform(b, { type: 'attack', unit: E.id, target: H.id });
  let ev = events(b, 'attack').pop();
  assert.equal(ev.melee, false);
  assert.equal(ev.roll.mode, 'dis');
  assert.equal(ev.roll.natural, 3);
  // ranged spell attack too
  const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'hacker', data: DATA });
  ({ b, H, E } = duel('thug', r));
  forceTurn(b, H);
  b.rng = stubRng([nat(18), nat(3)]);
  perform(b, { type: 'ability', unit: H.id, ability: 'zap', target: E.id });
  assert.equal(events(b, 'attack').pop().roll.mode, 'dis');
  // not adjacent: normal
  ({ b, H, E } = duel('gunner', hero(), { grid: ['#######', '#P...E#', '#######'] }));
  forceTurn(b, E);
  b.rng = stubRng([nat(18), nat(3)]);
  perform(b, { type: 'attack', unit: E.id, target: H.id });
  ev = events(b, 'attack').pop();
  assert.equal(ev.roll.mode, 'normal');
  assert.equal(ev.roll.natural, 18);
  // melee attack next to an enemy stays normal
  ({ b, H, E } = duel());
  forceTurn(b, H);
  b.rng = stubRng([nat(18), nat(3)]);
  perform(b, { type: 'attack', unit: H.id, target: E.id });
  assert.equal(events(b, 'attack').pop().roll.mode, 'normal');
});
test('v1.2 AI: ranged unit steps away from an adjacent melee enemy before shooting', () => {
  const map = { grid: ['##########', '#........#', '#.PE.....#', '#........#', '##########'] };
  const { b, E } = duel('gunner', hero(), map);
  forceTurn(b, E);
  const a = chooseAction(b, E.id);
  assert.ok(a.type === 'disengage' || a.type === 'move', `got ${a.type}`);
});

console.log('review fixes');
/** Make `u` the next unit to start its turn on endTurn() (no round wrap). */
function nextIs(b, u) {
  const other = b.units.find((x) => x !== u && !x.dead);
  forceTurn(b, other);
  b.turnIndex = b.order.indexOf(u.id) - 1;
}
test('fix 1: lost control from a cringe tick lasts exactly 1 turn', () => {
  const { b, H } = duel();
  H.mrl = 1;
  applyStatus(b, H, 'cringed', 5, null);
  nextIs(b, H);
  b.rng = stubRng([0.5, nat(15)]); // tick 1d4, then breakdown d20 = 15 -> lost control
  endTurn(b);
  assert.equal(b.turn.unitId, H.id);
  assert.equal(b.turn.lostControl, true);
  assert.equal(H.lostControlFresh, false);
  H.statuses = [];
  endTurn(b);
  while (b.turn && b.turn.unitId !== H.id) endTurn(b);
  assert.equal(b.turn.lostControl, false);
  assert.equal(H.lostControl, 0);
});
test('fix 1: stun from a big hit during own tick skips only that turn', () => {
  const { b, H } = duel();
  applyStatus(b, H, 'bleed', 1, null);
  H.roundHpLoss = Math.ceil(H.maxHp * BIG_HIT_FRACTION) - 1;
  nextIs(b, H);
  b.rng = stubRng([0.5, nat(1)]); // bleed 1d4 = 3, CON save natural 1 -> stun
  endTurn(b);
  assert.ok(events(b, 'skipTurn').some((e) => e.actor === H.id), 'this turn skipped');
  assert.ok(!H.statuses.some((x) => x.id === 'stun'), 'stun gone after this turn');
});
test('fix 2: lose "heroDown" — any hero down -> enemies win; no teams -> draw', () => {
  const map = { ...makeArena({ heroes: 2, enemies: 1 }), lose: 'heroDown' };
  const b = createBattle({ map, heroes: [hero(), hero()], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  dealDamage(b, null, b.units[0], 999, 'slash');
  assert.equal(b.winner, 'enemies');
  const b2 = createBattle({ map: makeArena({ heroes: 2, enemies: 1 }), heroes: [hero(), hero()], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  dealDamage(b2, null, b2.units[0], 999, 'slash');
  assert.equal(b2.winner, null, 'arena: team must be down');
  const b3 = createBattle({ map: makeArena({ heroes: 0, enemies: 0 }), heroes: [], enemies: [], data: DATA, seed: 1 });
  assert.equal(b3.winner, 'draw');
});
test('fix 3: endTurn works when the current unit is down', () => {
  const b = createBattle({ map: makeArena({ heroes: 2, enemies: 1 }), heroes: [hero(), hero()], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  const h = b.units[0];
  forceTurn(b, h);
  h.hp = 0; h.down = true;
  const r = perform(b, { type: 'endTurn', unit: h.id });
  assert.ok(r.ok);
  assert.notEqual(b.turn && b.turn.unitId, h.id);
});
test('fix 4: dash ability respects root and fear; unreachable destination -> unavailable, no ENR spent', () => {
  const far = { grid: ['#######', '#P...E#', '#######'] };
  let { b, H, E } = duel('thug', hero(), far);
  forceTurn(b, H);
  assert.ok(getLegalActions(b, H.id).some((a) => a.ability === 'rush'), 'rush available normally');
  b.data.statuses.root = { id: 'root', kind: 'debuff', mods: { speedMul: 0 } };
  b.statusCache = {};
  applyStatus(b, H, 'root', 2, E);
  assert.ok(!getLegalActions(b, H.id).some((a) => a.ability === 'rush'), 'root blocks the dash');
  delete b.data.statuses.root;
  ({ b, H, E } = duel('thug', hero(), far));
  forceTurn(b, H);
  applyStatus(b, H, 'fear', 2, E);
  assert.ok(!getLegalActions(b, H.id).some((a) => a.ability === 'rush'), 'fear: cannot dash toward the source');
  ({ b, H, E } = duel('thug', hero(), { grid: ['#######', '#P..#E#', '#######'] }));
  forceTurn(b, H);
  const enr = H.enr;
  const r = perform(b, { type: 'ability', unit: H.id, ability: 'rush', target: E.id });
  assert.equal(r.ok, false);
  assert.equal(H.enr, enr);
});
test('fix 5: enemyLeaves reaction never overcasts', () => {
  const map = { grid: ['#######', '#.....#', '#.PE..#', '#.....#', '#######'] };
  const { b, H, E } = duel('thug', hero(), map);
  E.abilities = [{ id: 'trip', name: 'trip', action: 'reaction', trigger: 'enemyLeaves', cost: 5, range: 1, target: 'enemy', roll: 'auto', effects: [{ op: 'status', id: 'stun', turns: 1 }] }];
  E.enr = 0; E.overcast = 'veil';
  b.autoReactions = true;
  forceTurn(b, H);
  assert.ok(perform(b, { type: 'move', unit: H.id, to: { x: 1, y: 2 } }).ok);
  assert.equal(events(b, 'reaction').length, 0);
  assert.equal(events(b, 'overcast').length, 0);
  assert.equal(events(b, 'opportunity').length, 1);
});
test('fix 6: cumulative tick without cap grows (positive values)', () => {
  const { b, H } = duel();
  b.data.statuses.grow = { id: 'grow', kind: 'buff', tick: { op: 'buff', stat: 'kb', value: 1, cumulative: true } };
  applyStatus(b, H, 'grow', 5, null);
  const kb0 = getKb(b, H);
  nextIs(b, H);
  endTurn(b);
  assert.equal(getKb(b, H), kb0 + 1);
  delete b.data.statuses.grow;
});
test('fix 7: status value counts as incoming damage only for marks / incomingDmg statuses', () => {
  const { b, H, E } = duel();
  const base = weaponDamageBonus(b, H, E);
  applyStatus(b, E, 'blessed', 2, H, 5);
  assert.equal(weaponDamageBonus(b, H, E), base);
  applyOp(b, H, E, { op: 'mark', id: 'marked', value: 3, turns: 2 });
  assert.equal(weaponDamageBonus(b, H, E), base + 3);
});
test('fix 8: no turnEnd for a unit that died at the start of its turn', () => {
  const b = createBattle({ map: makeArena({ heroes: 2, enemies: 1 }), heroes: [hero(), hero()], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  const h = b.units[0];
  dealDamage(b, null, h, 999, 'slash');
  h.downTurns = DOWN_TURNS_TO_DEATH - 1;
  nextIs(b, h);
  const evs = endTurn(b);
  const i = evs.findIndex((e) => e.type === 'death' && e.target === h.id);
  assert.ok(i >= 0);
  assert.ok(!evs.slice(i).some((e) => e.type === 'turnEnd' && e.actor === h.id));
});
test('fix 9: rule constants exported', () => {
  assert.deepEqual([BREAKDOWN_HEARTBREAK_MAX, HEARTBREAK_HP_LOSS, BREAKDOWN_MRL_RESET, BIG_HIT_FRACTION, BIG_HIT_DC, COVER_KB, DOWN_TURNS_TO_DEATH, OVERCAST_LIMIT],
    [10, 0.7, 0.25, 0.5, 12, 2, 3, 2]);
});
test('fix 10: isMeleeAttack matches attack logic', () => {
  const { b, H, E } = duel('gunner');
  assert.equal(isMeleeAttack(b, H, { type: 'attack', target: E.id }), true);
  assert.equal(isMeleeAttack(b, H, { type: 'ability', ability: 'steel-fist' }), true);
  assert.equal(isMeleeAttack(b, E, { type: 'attack', target: H.id }), false);
  const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'hacker', data: DATA });
  const d = duel('thug', r);
  assert.equal(isMeleeAttack(d.b, d.H, { type: 'ability', ability: 'zap' }), false);
});

console.log('v2: talents, gadgets, skills, progression');
test('talent «Кожевник» +1 KB; «Грязный боец» once per battle, blind on hit', () => {
  const base = hero();
  const t = hero({ talents: ['tanner', 'dirty-fighter'] });
  assert.equal(t.kb, base.kb + 1);
  assert.ok(t.abilities.some((a) => a.id === 'talent-dirty-fighter'));
  const { b, H, E } = duel('thug', t);
  E.hp = E.maxHp = 200;
  forceTurn(b, H);
  assert.ok(getLegalActions(b, H.id).some((a) => a.ability === 'talent-dirty-fighter'));
  b.rng = stubRng([nat(20)]);
  assert.ok(perform(b, { type: 'ability', unit: H.id, ability: 'talent-dirty-fighter', target: E.id }).ok);
  assert.ok(E.statuses.some((s) => s.id === 'blind'));
  forceTurn(b, H);
  assert.ok(!getLegalActions(b, H.id).some((a) => a.ability === 'talent-dirty-fighter'), 'once per battle');
});
test('COMBAT_TALENT_LIMIT: 2 on level 1, 3 on level 4; activeCombat; world talents unlimited', () => {
  assert.throws(() => hero({ talents: ['tanner', 'dirty-fighter', 'iron-will'] }), /COMBAT_TALENT_LIMIT/);
  assert.ok(hero({ level: 4, talents: ['tanner', 'dirty-fighter', 'iron-will'] }));
  const h = hero({ talents: ['tanner', 'dirty-fighter', 'iron-will'], activeCombat: ['tanner', 'iron-will'] });
  assert.deepEqual(h.activeTalents, ['tanner', 'iron-will']);
  assert.ok(!h.abilities.some((a) => a.id === 'talent-dirty-fighter'), 'inactive combat talent has no effect');
  assert.throws(() => hero({ talents: ['tanner'], activeCombat: ['tanner', 'iron-will'] }), /not owned/);
  assert.throws(() => hero({ talents: ['nope'] }), /unknown talent/);
  assert.throws(() => hero({ talents: ['implant'] }), /requires level 3/);
  const w = hero({ talents: ['tanner', 'dirty-fighter', 'eagle-eye', 'lock-master', 'deep-pocket'] });
  assert.equal(w.activeTalents.length, 2);
});
test('passive maxHp; worldFlags and skill mods exposed, not applied in combat', () => {
  assert.equal(hero({ talents: ['iron-will'] }).maxHp, hero().maxHp + 4);
  const h = hero({ talents: ['beast-nose', 'deep-pocket', 'eagle-eye'] });
  assert.deepEqual(h.worldFlags.map((f) => f.id).sort(), ['hide-item', 'no-ambush']);
  assert.equal(h.skillMods.perception.bonus, 2);
  assert.equal(h.initBonus, hero().initBonus + 2);
});
test('passive cond targetWounded: +2 to hit only vs wounded targets', () => {
  for (const wounded of [false, true]) {
    const { b, H, E } = duel('thug', hero({ talents: ['prey-game'] }));
    if (wounded) E.hp = E.maxHp - 1;
    forceTurn(b, H);
    b.rng = stubRng([nat(10)]);
    perform(b, { type: 'attack', unit: H.id, target: E.id });
    const ev = events(b, 'attack').pop();
    const plain = duel('thug', hero());
    forceTurn(plain.b, plain.H);
    plain.b.rng = stubRng([nat(10)]);
    perform(plain.b, { type: 'attack', unit: plain.H.id, target: plain.E.id });
    assert.equal(ev.roll.total - events(plain.b, 'attack').pop().roll.total, wounded ? 2 : 0);
  }
});
test('passive thorns: melee hit on the bearer hurts the attacker', () => {
  const { b, H, E } = duel('thug', hero({ talents: ['acid-sweat'] }));
  H.hp = H.maxHp = 200;
  const hp = E.hp;
  forceTurn(b, E);
  b.rng = stubRng([nat(20)]);
  perform(b, { type: 'attack', unit: E.id, target: H.id });
  assert.ok(events(b, 'thorns').length === 1);
  assert.equal(E.hp, hp - 2);
});
test('gadget: passives, ability and world effects; unknown gadget throws', () => {
  const g = buildCreature({ race: 'human', cls: 'itishnik', data: DATA, gadget: 'multitool' });
  const n = buildCreature({ race: 'human', cls: 'itishnik', data: DATA });
  assert.equal(g.initBonus, n.initBonus + 1);
  assert.ok(g.abilities.some((a) => a.id === 'gadget-patch'));
  assert.equal(g.gadget, 'multitool');
  assert.ok(g.worldFlags.some((f) => f.id === 'craft-medkit'));
  assert.equal(g.skillMods.tech.bonus, 1);
  assert.throws(() => buildCreature({ race: 'human', cls: 'itishnik', data: DATA, gadget: 'nope' }), /unknown gadget/);
});
test('range 0 + target tile area (beast-roar style): legal for the player and used by AI', () => {
  const roar = { id: 'roar', name: 'Рык', level: 1, cost: 0, action: 'bonus', range: 0, target: 'tile', area: { shape: 'radius', size: 2 },
    roll: 'save', save: 'wil', onSave: 'none', usesPerBattle: null, effects: [{ op: 'status', id: 'fear', turns: 1 }] };
  const { b, H, E } = duel();
  H.abilities = [...H.abilities, roar];
  forceTurn(b, H);
  const legal = getLegalActions(b, H.id).filter((a) => a.ability === 'roar');
  assert.equal(legal.length, 1);
  assert.ok(!legal[0].target && !legal[0].tile);
  b.rng = stubRng([nat(1)]);
  assert.ok(perform(b, legal[0]).ok);
  assert.ok(E.statuses.some((s) => s.id === 'fear'));
  assert.ok(!H.statuses.some((s) => s.id === 'fear'), 'caster is not affected');
  const d = duel();
  d.H.abilities = [roar]; // the only bonus action available
  d.H.control = 'ai';
  d.E.hp = d.E.maxHp = 200; // keep the battle going after the main action
  forceTurn(d.b, d.H);
  playTurn(d.b);
  assert.ok(events(d.b, 'ability').some((e) => e.ability === 'roar'), 'AI uses it');
});
test('summons grow with summoner level', () => {
  for (const level of [1, 5]) {
    const r = buildCreature({ race: 'human', cls: 'itishnik', path: 'mechanic', level, data: DATA });
    const b = createBattle({ map: DUEL_MAP, heroes: [r], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
    forceTurn(b, b.units[0]);
    perform(b, { type: 'ability', unit: b.units[0].id, ability: 'drone' });
    const s = b.units.find((u) => u.kind === 'summon');
    assert.equal(s.maxHp, DATA.ENEMIES.drone.hp + SUMMON_HP_PER_LEVEL * (level - 1));
    assert.equal(s.dmgBonus.all, SUMMON_DMG_PER_LEVEL * (level - 1));
  }
});
test('skillCheck: spec adv + prof, related normal + prof, other dis; talent bonus and adv', () => {
  const z = hero({ talents: ['eagle-eye', 'lock-master'] });
  const opts = (vals) => ({ rng: stubRng(vals), data: DATA });
  let r = skillCheck(z, 'intimidation', 13, opts([nat(5), nat(15)]));
  assert.equal(r.tier, 'spec'); assert.equal(r.mode, 'adv'); assert.equal(r.roll, 15);
  assert.equal(r.total, 15 + Math.floor((z.stats.cha - 10) / 2) + z.prof);
  r = skillCheck(z, 'perception', 13, opts([nat(12)]));
  assert.equal(r.tier, 'related'); assert.equal(r.mode, 'normal');
  assert.ok(r.parts.some((p) => p.label === 'Глазомер' && p.value === 2));
  assert.equal(r.total, 12 + Math.floor((z.stats.per - 10) / 2) + z.prof + 2);
  r = skillCheck(z, 'hacking', 13, opts([nat(15), nat(5)]));
  assert.equal(r.tier, 'other'); assert.equal(r.mode, 'dis'); assert.equal(r.roll, 5);
  assert.ok(!r.parts.some((p) => p.label === 'prof'));
  r = skillCheck(z, 'hacking', 13, { ...opts([nat(15), nat(5)]), adv: true });
  assert.equal(r.mode, 'normal', 'adv cancels dis');
  assert.equal(skillTier(hero(), 'athletics', DATA.SPECIALIZATIONS), 'spec');
  const it = buildCreature({ race: 'human', cls: 'itishnik', data: DATA, talents: ['lock-master'] });
  assert.equal(skillTier(it, 'athletics', DATA.SPECIALIZATIONS), 'spec', 'talent adv makes a specialization');
  assert.equal(r.success, r.total >= 13);
});
test('XP and levels: thresholds, battle and quest XP, level-up rebuild keeps choices', () => {
  assert.equal(XP_THRESHOLDS.length, 20);
  assert.deepEqual(XP_THRESHOLDS.slice(0, 5), [0, 300, 900, 2700, 6500]);
  assert.equal(levelForXp(299), 1); assert.equal(levelForXp(300), 2); assert.equal(levelForXp(6500), 5); assert.equal(levelForXp(1e6), 20);
  assert.equal(levelForXp(64000), 10); assert.equal(levelForXp(354999), 19);
  assert.equal(xpToNext(250), 50); assert.equal(xpToNext(7000), 7000); assert.equal(xpToNext(400000), 0);
  assert.equal(battleXp(['thug', 'gunner'], DATA), 20);
  const { b, H, E } = duel();
  dealDamage(b, H, E, 999, 'slash');
  assert.equal(battleXp(b), 10);
  assert.equal(questXp({ rewards: { xp: 600 } }), 600);
  assert.equal(questXp({ key: true }), 800);
  const g = gainXp({ xp: 250, level: 1 }, 100, DATA);
  assert.deepEqual([g.xp, g.level, g.leveledUp, g.talentPicks], [350, 2, true, 1]);
  assert.equal(gainXp({ xp: 0, level: 1 }, 3000, DATA).talentPicks, 2);
  const h1 = buildCreature({ race: 'human', cls: 'itishnik', path: 'hacker', data: DATA, talents: ['tanner', 'eagle-eye'], gadget: 'multitool' });
  h1.hp -= 5;
  const h2 = rebuildHero(h1, { level: 2, data: DATA });
  assert.equal(h2.level, 2);
  assert.equal(h2.path, 'hacker');
  assert.deepEqual(h2.talents, ['tanner', 'eagle-eye']);
  assert.equal(h2.gadget, 'multitool');
  assert.ok(h2.maxHp > h1.maxHp);
  assert.equal(h2.maxHp - h2.hp, 5, 'damage kept');
  assert.equal(h2.id, h1.id);
});

test('levels 1–20: proficiency, combat talent limit, gainXp to 20, ASI levels, rebuild to 20', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(profBonus), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  assert.deepEqual([1, 3, 4, 7, 8, 12, 13, 20].map(defaultCombatTalentLimit), [2, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepEqual([1, 3, 4, 7, 8, 12, 13, 20].map(GAME_DATA.COMBAT_TALENT_LIMIT), [2, 2, 3, 3, 4, 4, 5, 5]);
  const g = gainXp({ xp: 0, level: 1, cls: 'zabivnoy' }, 400000, DATA);
  assert.equal(g.level, 20); assert.equal(g.levels.length, 19);
  assert.deepEqual(g.asiLevels, DEFAULT_ASI_LEVELS);
  assert.deepEqual(gainXp({ xp: 0, level: 1, cls: { asiLevels: [6] } }, 20000, DATA).asiLevels, [6]);
  const h = buildCreature({ race: 'human', cls: 'zabivnoy', data: DATA });
  const h20 = rebuildHero(h, { level: 20, data: DATA });
  assert.equal(h20.level, 20); assert.equal(h20.prof, 6);
  assert.equal(h20.maxHp - h.maxHp, 19 * (5 + 2));
});
test('ASI: +2 / +1+1 / talent, cap 20, validateBuild, companions auto', () => {
  const base = buildCreature({ race: 'human', cls: 'zabivnoy', level: 8, data: DATA });
  const asi = [{ level: 4, stats: { str: 2 } }, { level: 8, stats: { con: 1, dex: 1 } }];
  const u = buildCreature({ race: 'human', cls: 'zabivnoy', level: 8, data: DATA, asi });
  assert.equal(u.stats.str, base.stats.str + 2); assert.equal(u.stats.con, base.stats.con + 1); assert.equal(u.stats.dex, base.stats.dex + 1);
  const lo = buildCreature({ race: 'human', cls: 'zabivnoy', level: 7, data: DATA, asi });
  assert.equal(lo.stats.con, buildCreature({ race: 'human', cls: 'zabivnoy', level: 7, data: DATA }).stats.con, 'level 8 ASI not yet applied');
  const capped = buildCreature({ race: 'human', cls: 'zabivnoy', level: 20, data: DATA, asi: [4, 8, 12, 16, 19].map((level) => ({ level, stats: { str: 2 } })) });
  assert.equal(capped.stats.str, 20); assert.ok(capped.asiOverflow.includes('str'));
  const tl = buildCreature({ race: 'human', cls: 'zabivnoy', level: 4, data: DATA, asi: [{ level: 4, talent: 'iron-will' }] });
  assert.ok(tl.talents.includes('iron-will')); assert.equal(tl.maxHp, buildCreature({ race: 'human', cls: 'zabivnoy', level: 4, data: DATA }).maxHp + 4);
  assert.deepEqual(rebuildHero(tl, { level: 5, data: DATA }).talents, ['iron-will'], 'ASI talent survives rebuild');
  const auto = buildCreature({ race: 'human', cls: 'zabivnoy', level: 20, data: DATA, asi: 'auto' });
  const plain = buildCreature({ race: 'human', cls: 'zabivnoy', level: 20, data: DATA });
  assert.equal(auto.stats.str, 20); assert.equal(auto.asi.length, 5);
  assert.equal(Object.values(auto.asi).reduce((s, e) => s + Object.values(e.stats).reduce((a, b) => a + b, 0), 0), 10);
  assert.ok(auto.stats.con > plain.stats.con, 'overflow goes to CON');
  const okB = { race: 'human', cls: 'zabivnoy', path: 'titan', stats: DATA.CLASSES.zabivnoy.recommended,
    skills: { base: ['athletics', 'intimidation'], extra: ['perception', 'survival'] }, level: 8, asi };
  assert.deepEqual(validateBuild(okB, DATA), []);
  const codes = (b) => validateBuild({ ...okB, ...b }, DATA).map((e) => e.code);
  assert.deepEqual(codes({ asi: [asi[0]] }), ['asiMissing']);
  assert.ok(codes({ asi: [asi[0], { level: 8, stats: { str: 3 } }] }).includes('asiShape'));
  assert.ok(codes({ asi: [asi[0], { level: 8, stats: { str: 1 } }] }).includes('asiShape'));
  assert.ok(codes({ asi: [...asi, { level: 5, stats: { str: 2 } }] }).includes('asiLevel'));
  assert.ok(codes({ asi: [asi[0], asi[0], asi[1]] }).includes('asiDuplicate'));
  assert.ok(codes({ asi: [asi[0], { level: 8, talent: 'nope' }] }).includes('asiTalent'));
  assert.ok(codes({ asi: [asi[0], { level: 8, talent: 'iron-will', stats: { str: 2 } }] }).includes('asiBoth'));
  assert.ok(codes({ level: 7 }).includes('asiFuture'));
  assert.deepEqual(codes({ asi: [asi[0], { level: 8, talent: 'iron-will' }] }), []);
  assert.deepEqual(codes({ level: 20, asi: [4, 8, 12, 16, 19].map((level) => ({ level, stats: { str: 2 } })) }), ['asiCap']);
});
test('upgrades: dice, cost, uses, area, bonus, other fields; by level and path; levelGains', () => {
  const it = DATA.CLASSES.itishnik;
  const cls = { ...it, id: 'itishnik', upgrades: [
    { level: 2, ability: 'zap', changes: { dice: '2d10' } },
    { level: 4, ability: 'zap', changes: { cost: 1, bonus: ['castMod', 2], range: 10 } },
    { level: 4, ability: 'emp', changes: { area: 2, usesPerBattle: '+1' } },
    { level: 8, ability: 'repair', changes: { dice: '2d8', cost: 1 } },
    { level: 2, ability: 'drone', path: 'hacker', changes: { cost: 0 } },
  ], abilities: [...it.abilities, { id: 'big-zap', name: 'Большой разряд', level: 6, cost: 5, action: 'action', range: 8, target: 'enemy', roll: 'attack', effects: [] }] };
  const D2 = { ...DATA, CLASSES: { ...DATA.CLASSES, itishnik: cls } };
  const ab = (lv, path = 'mechanic') => Object.fromEntries(buildCreature({ race: 'human', cls: 'itishnik', path, level: lv, data: D2 }).abilities.map((a) => [a.id, a]));
  assert.equal(ab(1).zap.effects[0].dice, '1d10'); assert.equal(ab(1).zap.upgrades, undefined);
  assert.equal(ab(2).zap.effects[0].dice, '2d10'); assert.deepEqual(ab(2).zap.upgrades, [2]);
  const z4 = ab(4).zap;
  assert.equal(z4.cost, 1); assert.deepEqual(z4.effects[0].bonus, ['castMod', 2]); assert.equal(z4.range, 10); assert.deepEqual(z4.upgrades, [2, 4]);
  assert.equal(it.abilities.find((a) => a.id === 'zap').effects[0].dice, '1d10', 'class data not mutated');
  const e4 = ab(4).emp;
  assert.equal(e4.area.size, 2); assert.equal(e4.usesPerBattle, 1);
  assert.equal(ab(8).repair.cost, 1); assert.equal(ab(8).repair.effects[0].dice, '2d8');
  assert.equal(ab(2).drone.cost, 3, 'path upgrade of another path is ignored');
  assert.ok(!ab(5)['big-zap'] && ab(6)['big-zap']);
  const lg = levelGains(cls, 'mechanic', 4);
  assert.deepEqual(lg.upgrades.map((g) => g.ability), ['zap', 'emp']); assert.equal(lg.asi, true);
  assert.deepEqual(levelGains(cls, 'mechanic', 6).abilities.map((a) => a.id), ['big-zap']);
  assert.deepEqual(levelGains(cls, 'mechanic', 1).passives.map((p) => p.id), ['tinker']);
  // upgraded ability works in battle (bonus array)
  const H = buildCreature({ race: 'human', cls: 'itishnik', path: 'mechanic', level: 4, data: D2, id: 'H' });
  const b = createBattle({ map: { id: 't', grid: ['########', '#P...E.#', '########'], win: 'killAll' }, heroes: [H], enemies: ['thug'], data: D2, seed: 3 });
  const r = perform(b, { type: 'ability', unit: b.units.find((x) => x.team === 'heroes').id, ability: 'zap', target: b.units.find((x) => x.team === 'enemies').id });
  assert.ok(r.ok, r.error);
  // weapon op: `dice` is the op's extraDice (new value); bonus is a new value
  const zb = { ...DATA.CLASSES.zabivnoy, upgrades: [{ level: 2, ability: 'steel-fist', changes: { dice: '2d6' } }, { level: 3, ability: 'blood', changes: { bonus: 3, cost: 2 } }] };
  const D3 = { ...DATA, CLASSES: { ...DATA.CLASSES, zabivnoy: zb } };
  const zab = Object.fromEntries(buildCreature({ race: 'human', cls: 'zabivnoy', level: 3, data: D3 }).abilities.map((a) => [a.id, a]));
  assert.equal(zab['steel-fist'].effects[0].extraDice, '2d6'); assert.equal(zab['steel-fist'].effects[0].dice, undefined);
  assert.equal(zab.blood.effects[0].bonus, 3); assert.equal(zab.blood.cost, 2);
  const mk = applyUpgrades([{ id: 'm', effects: [{ op: 'mark', value: 2 }] }], [{ level: 1, ability: 'm', changes: { bonus: 4 } }], 1, null);
  assert.equal(mk[0].effects[0].value, 4, 'mark: bonus is its value');
});
test('stabilize revive: raises a dead ally (not soulless) on its tile; plain stabilize does not', () => {
  const raise = { id: 'raise', name: 'Подъём', level: 1, cost: 0, action: 'action', range: 6, target: 'ally', roll: 'auto',
    effects: [{ op: 'stabilize', revive: true }, { op: 'heal', dice: '2d1', resource: 'hp' }] };
  const lift = { ...raise, id: 'lift', effects: [{ op: 'stabilize' }] };
  const it = { ...DATA.CLASSES.itishnik, abilities: [...DATA.CLASSES.itishnik.abilities, raise, lift] };
  const D4 = { ...DATA, CLASSES: { ...DATA.CLASSES, itishnik: it } };
  const map = { id: 't', grid: ['#########', '#PP....E#', '#########'], win: 'killAll' };
  const mk = () => {
    const H = buildCreature({ race: 'human', cls: 'itishnik', level: 20, data: D4, id: 'H' });
    const F = buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data: D4, id: 'F' });
    const b = createBattle({ map, heroes: [H, F], enemies: ['thug'], data: D4, seed: 5 });
    return { b, H: b.byId.H, F: b.byId.F };
  };
  let { b, H, F } = mk();
  F.deathSavesLeft = 0;
  for (let i = 0; i < 5 && !F.dead; i++) dealDamage(b, H, F, 999, 'slash');
  assert.ok(F.dead, 'ally is dead');
  b.turn.unitId = H.id; b.turn.actions = 1; b.order.splice(b.order.indexOf(H.id), 1); b.order.splice(b.turnIndex, 0, H.id);
  assert.ok(!getLegalActions(b, H.id).some((x) => x.ability === 'lift' && x.target === 'F'), 'plain stabilize cannot target the dead');
  assert.ok(getLegalActions(b, H.id).some((x) => x.ability === 'raise' && x.target === 'F'));
  const r = perform(b, { type: 'ability', unit: H.id, ability: 'raise', target: 'F' });
  assert.ok(r.ok, r.error);
  assert.ok(!F.dead && !F.down && F.hp === 3, `revived with 1 + 2 HP: ${F.hp}`);
  assert.ok(F.x >= 0 && b.occ[F.y * b.grid.w + F.x] > 0, 'back on the grid');
  ({ b, H, F } = mk());
  F.soulless = true; F.deathSavesLeft = 0;
  for (let i = 0; i < 5 && !F.dead; i++) dealDamage(b, H, F, 999, 'slash');
  assert.ok(!getLegalActions(b, H.id).some((x) => x.ability === 'raise' && x.target === 'F'), 'soulless cannot be raised');
});
test('XP scale above level 5: enemy and quest fallbacks follow the XP a level needs', () => {
  assert.equal(xpScale(3), 1); assert.equal(xpScale(5), 1);
  assert.ok(Math.abs(xpScale(10) - 21000 / 7500) < 1e-9);
  assert.equal(enemyXpForLevel(1), 20); assert.equal(enemyXpForLevel(5), 150); assert.equal(enemyXpForLevel(10), 420);
  assert.equal(battleXp([{ level: 10 }, { level: 1, xp: 7 }], DATA), 427);
  assert.equal(questXp({ size: 'small', level: 10 }), 420); assert.equal(questXp({ size: 'small', level: 3 }), 150);
  assert.equal(questXp({ level: 10, rewards: { xp: 99 } }), 99, 'explicit XP wins');
});

console.log('v3: equipment, proficiencies, burst, items, creation');
const z = (o = {}) => hero(o); // zabivnoy: heavy armour, class weapon has no type
test('equipment overrides class weapon/armour; offhand, mods, resist, two-handed, unknown', () => {
  const h = z({ equipment: { weapon: 'sabre', armor: 'chain', offhand: 'buckler', mods: ['scope'] } });
  assert.equal(h.weapon.id, 'sabre');
  assert.equal(h.weapon.hit, 1, 'scope mod');
  const dexMod = Math.min(Math.floor((h.stats.dex - 10) / 2), 2);
  assert.equal(h.kb, 10 + 4 + dexMod + 1);
  assert.equal(h.resist.fire, 'resist');
  assert.deepEqual(h.equipment, { weapon: 'sabre', armor: 'chain', offhand: 'buckler', mods: ['scope'] });
  assert.throws(() => z({ equipment: { weapon: 'greatsword', offhand: 'buckler' } }), /two-handed/);
  assert.throws(() => z({ equipment: { weapon: 'nope' } }), /unknown item/);
  assert.throws(() => z({ equipment: { weapon: 'vest' } }), /not a weapon/);
});
test('proficiency tiers: weapon type hit / disadvantage, damage type bonus, armour tiers and mastery', () => {
  const base = z({ equipment: { weapon: 'ak' } });
  assert.equal(base.weaponTier, 2, 'unknown type defaults to «умеет»');
  const pro = z({ equipment: { weapon: 'ak' }, proficiencies: { weaponTypes: { auto: 3 } } });
  assert.equal(pro.weaponTier, 3);
  let d = duel('thug', pro);
  const d0 = duel('thug', base);
  assert.equal(d.H.weaponTier - d0.H.weaponTier, 1);
  // tier 1 -> disadvantage
  const none = z({ equipment: { weapon: 'ak' }, proficiencies: { weaponTypes: {} } });
  none.weaponTier = 1;
  d = duel('thug', none, { grid: ['#######', '#P...E#', '#######'] });
  forceTurn(d.b, d.H); d.b.rng = stubRng([nat(18), nat(3)]);
  perform(d.b, { type: 'attack', unit: d.H.id, target: d.E.id });
  assert.equal(events(d.b, 'attack').pop().roll.mode, 'dis');
  // damage type tier
  const slashPro = z({ equipment: { weapon: 'sabre' }, proficiencies: { dmgTypes: { slash: 4 } } });
  const slash0 = z({ equipment: { weapon: 'sabre' } });
  const a = duel('thug', slashPro), c = duel('thug', slash0);
  assert.equal(weaponDamageBonus(a.b, a.H, a.E) - weaponDamageBonus(c.b, c.H, c.E), 2);
  // armour: itishnik (light class armour) in plate = tier 1 -> attack disadvantage + stealth disadvantage
  const it = buildCreature({ race: 'human', cls: 'itishnik', data: DATA, equipment: { armor: 'plate' } });
  assert.equal(it.armorTier, 1);
  assert.ok(it.armorPenalty && it.stealthDis);
  d = duel('thug', it);
  forceTurn(d.b, d.H); d.b.rng = stubRng([nat(18), nat(3)]);
  perform(d.b, { type: 'attack', unit: d.H.id, target: d.E.id });
  assert.equal(events(d.b, 'attack').pop().roll.mode, 'dis');
  // heavy mastery +1 KB; light mastery +1 bonus action
  assert.equal(z({ proficiencies: { armor: { heavy: 4 } } }).kb, z().kb + 1);
  const lm = buildCreature({ race: 'human', cls: 'itishnik', data: DATA, equipment: { armor: 'vest' }, proficiencies: { armor: { light: 4 } } });
  assert.equal(lm.extraBonusActions, 1);
  const bl = createBattle({ map: DUEL_MAP, heroes: [lm], enemies: ['thug'], data: DATA, seed: 1, autoReactions: false });
  const L = bl.units[0];
  nextIs(bl, L); endTurn(bl);
  assert.equal(bl.turn.unitId, L.id);
  assert.equal(bl.turn.bonus, 2);
  // medium mastery ignores stealth disadvantage
  assert.equal(z({ equipment: { armor: 'chain' } }).stealthDis, true);
  assert.equal(z({ equipment: { armor: 'chain' }, proficiencies: { armor: { medium: 4 } } }).stealthDis, false);
});
test('armour piercing lowers KB; onHit status applies on a hit', () => {
  const h = z({ equipment: { weapon: 'ap-rifle' } });
  const { b, H, E } = duel('thug', h, { grid: ['#######', '#P...E#', '#######'] });
  E.kb = 18; E.armorKb = 6; E.hp = E.maxHp = 200;
  forceTurn(b, H); b.rng = stubRng([nat(20)]);
  perform(b, { type: 'attack', unit: H.id, target: E.id });
  assert.equal(events(b, 'attack').pop().kb, 15);
  assert.ok(E.statuses.some((s) => s.id === 'bleed'));
});
test('«Очередь»: rof shots, KB + recoil × i, next-attack bonus on the first shot only', () => {
  const h = z({ equipment: { weapon: 'ak' } });
  const { b, H, E } = duel('thug', h, { grid: ['#######', '#P...E#', '#######'] });
  H.attackBonus = 0; H.hitBonus = 0; E.kb = 13; E.armorKb = 0; E.hp = E.maxHp = 200;
  forceTurn(b, H);
  assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'burst' && a.target === E.id));
  b.rng = stubRng([nat(14), 0.5, nat(14), nat(18), 0.5]);
  assert.ok(perform(b, { type: 'burst', unit: H.id, target: E.id }).ok);
  const shots = events(b, 'attack');
  assert.deepEqual(shots.map((e) => e.kb), [13, 15, 17]);
  assert.deepEqual(shots.map((e) => e.hit), [true, false, true]);
  assert.equal(events(b, 'burstEnd').pop().hits, 2);
  const d = duel('thug', z({ equipment: { weapon: 'ak' } }), { grid: ['#######', '#P...E#', '#######'] });
  d.E.hp = d.E.maxHp = 200;
  applyStatus(d.b, d.H, 'inspired', 3, null);
  forceTurn(d.b, d.H);
  perform(d.b, { type: 'burst', unit: d.H.id, target: d.E.id });
  const s2 = events(d.b, 'attack');
  assert.ok(s2[0].roll.bonus > s2[1].roll.bonus, 'inspired only on the first shot');
  assert.equal(s2[1].roll.bonus, s2[2].roll.bonus);
});
test('items in battle: medkit, battery, grenade (area, save, enemies only), inventory spent', () => {
  const h = z({ inventory: { medkit: 1, battery: 1, frag: 1 } });
  const b = createBattle({ map: { grid: ['#########', '#P.....E#', '#......E#', '#########'] }, heroes: [h], enemies: ['thug', 'thug'], data: DATA, seed: 1, autoReactions: false });
  const H = b.units[0];
  H.hp = 5; H.enr = 0;
  forceTurn(b, H);
  assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'useItem' && a.item === 'medkit'));
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'medkit', target: H.id }).ok);
  assert.ok(H.hp > 5);
  assert.equal(H.inventory.medkit, undefined);
  assert.equal(perform(b, { type: 'useItem', unit: H.id, item: 'medkit', target: H.id }).error, 'noItem');
  forceTurn(b, H);
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'battery' }).ok);
  assert.equal(H.enr, 5);
  forceTurn(b, H);
  const E1 = b.units[1];
  const hp = b.units.slice(1).map((u) => u.hp);
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'frag', tile: { x: E1.x, y: E1.y } }).ok);
  assert.equal(events(b, 'save').filter((e) => e.reason === 'item:frag').length, 2);
  assert.ok(b.units.slice(1).every((u, i) => u.hp < hp[i] || u.dead));
});
test('trap: placed on a tile, triggers on an enemy entering, not on allies', () => {
  const h = z({ inventory: { snare: 1 } });
  const map = { grid: ['#########', '#.P.....#', '#.....E.#', '#########'] };
  const { b, H, E } = duel('thug', h, map);
  forceTurn(b, H);
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'snare', tile: { x: 3, y: 1 } }).ok);
  assert.equal(b.traps.length, 1);
  forceTurn(b, H);
  perform(b, { type: 'move', unit: H.id, to: { x: 4, y: 1 } }); // own team walks over it
  assert.equal(b.traps.length, 1);
  perform(b, { type: 'move', unit: H.id, to: { x: 1, y: 2 } });
  forceTurn(b, E);
  b.rng = stubRng([nat(1)]);
  perform(b, { type: 'move', unit: E.id, to: { x: 3, y: 1 } });
  assert.equal(events(b, 'trapTriggered').length, 1);
  assert.ok(E.statuses.some((s) => s.id === 'root'));
  assert.equal(b.traps.length, 0);
});
test('AI uses items: wounded unit drinks a medkit', () => {
  const h = z({ inventory: { medkit: 1 } });
  const { b, H } = duel('thug', h);
  H.control = 'ai'; H.hp = 3; H.abilities = [];
  forceTurn(b, H);
  playTurn(b);
  assert.ok(events(b, 'useItem').some((e) => e.item === 'medkit'));
});
test('phobia: fire damage triggers fear once per round', () => {
  const h = z({ phobia: { trigger: 'fire' } });
  const { b, H } = duel('thug', h);
  H.hp = H.maxHp = 200;
  dealDamage(b, null, H, 3, 'fire');
  dealDamage(b, null, H, 3, 'fire');
  assert.equal(events(b, 'phobia').length, 1);
  assert.ok(H.statuses.some((s) => s.id === 'fear'));
});
test('skillCheck: base +2 / extra +1 skills, stealth disadvantage from armour', () => {
  const h = z({ skills: { base: ['acrobatics', 'stealth'], extra: ['hacking', 'medicine'] }, equipment: { armor: 'plate' } });
  let r = skillCheck(h, 'acrobatics', 10, { rng: stubRng([nat(10), nat(10)]), data: DATA });
  assert.ok(r.parts.some((p) => p.label === 'base' && p.value === 2));
  r = skillCheck(h, 'hacking', 10, { rng: stubRng([nat(10), nat(10)]), data: DATA });
  assert.ok(r.parts.some((p) => p.label === 'extra' && p.value === 1));
  r = skillCheck(h, 'stealth', 10, { rng: stubRng([nat(15), nat(4)]), data: DATA, adv: true });
  assert.equal(r.armorDis, true);
  assert.equal(r.mode, 'normal', 'adv + armour dis cancel');
});
test('validateBuild: valid build, stats, skills, proficiencies, phobia, multiclass, equipment', () => {
  const ok = { race: 'human', cls: 'zabivnoy', path: 'titan', stats: DATA.CLASSES.zabivnoy.recommended,
    skills: { base: ['athletics', 'intimidation'], extra: ['perception', 'survival'] },
    proficiencies: { weaponTypes: { pistol: 3 }, armor: {} }, phobia: { trigger: 'water' },
    equipment: { weapon: 'sabre', armor: 'plate' } };
  assert.deepEqual(validateBuild(ok, DATA), []);
  const codes = (b) => validateBuild(b, DATA).map((e) => e.code);
  assert.ok(codes({ ...ok, stats: { ...ok.stats, str: 16 } }).includes('statRange'));
  assert.ok(codes({ ...ok, stats: { ...ok.stats, dex: 15 } }).includes('overspent'));
  assert.ok(codes({ ...ok, stats: { ...ok.stats, str: 14 } }).includes('unspent'));
  assert.ok(codes({ ...ok, skills: { base: ['athletics'], extra: ['athletics', 'x'] } }).includes('baseCount'));
  assert.ok(codes({ ...ok, skills: { base: ['athletics', 'stealth'], extra: ['athletics', 'medicine'] } }).includes('duplicateSkill'));
  assert.ok(codes({ ...ok, proficiencies: { weaponTypes: { pistol: 3, rifle: 3, smg: 3, bow: 3 } } }).includes('profOverspent'));
  assert.ok(codes({ ...ok, proficiencies: { weaponTypes: { pistol: 4 } } }).includes('masteryAtCreation'));
  assert.ok(codes({ ...ok, phobia: { trigger: 'spiders' } }).includes('unknownTrigger'));
  assert.ok(codes({ ...ok, multiclass: { cls: 'itishnik' } }).includes('level'));
  assert.ok(codes({ ...ok, race: 'skeleton' }).includes('raceNotAllowed'));
  assert.ok(codes({ ...ok, equipment: { weapon: 'greatsword', offhand: 'buckler' } }).includes('build'));
  assert.equal(profPoints(1), 3);
  assert.equal(proficiencyCost(defaultProficiencies(DATA.CLASSES.zabivnoy), { weaponTypes: { pistol: 4 } }), 3);
});
test('multiclass (level 3+): second class abilities up to level − 2 and the MULTICLASS pool', () => {
  const h = z({ level: 3, multiclass: { cls: 'itishnik', path: 'mechanic' } });
  const ids = h.abilities.map((a) => a.id);
  assert.ok(ids.includes('repair') && ids.includes('zap') && ids.includes('drone'));
  assert.ok(!ids.includes('emp'), 'level 3 ability of the second class needs multiclass level 3');
  assert.ok(ids.includes('mc-tactical-gadget'));
  assert.equal(h.abilities.find((a) => a.id === 'zap').castStat, 'int');
  assert.throws(() => z({ level: 2, multiclass: { cls: 'itishnik' } }), /level 3/);
  assert.equal(rebuildHero(h, { level: 5, data: DATA }).multiclass.cls, 'itishnik');
});

console.log('v3.1: item properties (reach, thrown, arc, area, charges, enr, overheat, extra, onCrit, only, zone, ...)');
const W3 = (o) => ({ slot: 'weapon', stat: 'str', range: 1, dmgType: 'pierce', dice: '1d8', ...o });
const D31 = {
  ...DATA,
  WEAPONS: {
    ...DATA.WEAPONS,
    pike: W3({ id: 'pike', name: 'Вилы', type: 'polearm', props: { reach: true } }),
    hatchet: W3({ id: 'hatchet', name: 'Топорик', type: 'axe', dice: '1d6', dmgType: 'slash', props: { thrown: 4 } }),
    mortar: W3({ id: 'mortar', name: 'Картофелемёт', type: 'launcher', stat: 'dex', range: 8, dmgType: 'blunt', props: { arc: true } }),
    rpg: W3({ id: 'rpg', name: 'РПГ', type: 'launcher', stat: 'dex', range: 10, dice: '2d6', dmgType: 'fire', props: { arc: true, area: { shape: 'radius', size: 1 }, charges: 2 } }),
    plasma: W3({ id: 'plasma', name: 'Плазма', type: 'plasma', stat: 'dex', range: 8, dmgType: 'energy', props: { enr: 2, overheat: '1d6' } }),
    coil: W3({ id: 'coil', name: 'Катушка', type: 'energy', stat: 'dex', range: 8, props: { overheat: { shots: 2, turns: 1 } } }),
    bolter: W3({ id: 'bolter', name: 'Болтер', type: 'bolter', stat: 'dex', range: 8, props: { extra: { dice: '1d4', dmgType: 'fire' } } }),
    zapper: W3({ id: 'zapper', name: 'Шокер', type: 'fist', props: { extra: { dice: '1d4', dmgType: 'electric', only: 'mechanical' } } }),
    hook: W3({ id: 'hook', name: 'Багор', type: 'polearm', onCrit: [{ op: 'status', id: 'prone', turns: 1 }],
      onHit: [{ op: 'status', id: 'prone', turns: 1, chance: 1, fromCrit: true }] }),
    blade: W3({ id: 'blade', name: 'Кибер-клинок', type: 'cyberblade', props: { stigma: { tinBrotherhood: -5, tekhonki: -5 } } }),
  },
  ARMOR: {
    ...DATA.ARMOR,
    exo: { id: 'exo', name: 'Экзокостюм', slot: 'armor', type: 'mech', kb: 6, mech: { shield: 10 }, passives: [{ id: 'exo-str', op: { statBonus: { str: 2 } } }],
      grants: [{ id: 'exo-core', name: 'Протокол', action: 'bonus', range: 0, target: 'self', roll: 'auto', usesPerBattle: 1, effects: [{ op: 'shield', value: 5, turns: 2 }] }] },
  },
  CONSUMABLES: {
    ...DATA.CONSUMABLES,
    emp: { id: 'emp', name: 'ЭМ-граната', slot: 'consumable', action: 'action', range: 8, target: 'tile', area: { shape: 'radius', size: 2 }, roll: 'auto',
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'electric', only: 'mechanical' }, { op: 'status', id: 'stun', turns: 1, only: 'mechanical' }] },
    smoke: { id: 'smoke', name: 'Дым', slot: 'consumable', action: 'action', range: 8, target: 'tile', area: { shape: 'radius', size: 1 }, roll: 'auto',
      effects: [{ op: 'zone', kind: 'smoke', turns: 2 }] },
    adren: { id: 'adren', name: 'Адреналин', slot: 'consumable', action: 'bonus', range: 0, target: 'self', roll: 'auto',
      effects: [{ op: 'extraAction', kind: 'action', nextTurnPenalty: 1 }] },
    opium: { id: 'opium', name: 'Морфин', slot: 'consumable', action: 'bonus', range: 0, target: 'self', roll: 'auto', opiate: 3,
      effects: [{ op: 'heal', dice: '2d6', resource: 'hp' }], withdrawal: { mrl: '1d4', nextBattle: { status: 'fear', turns: 1 } } },
  },
  ENEMIES: {
    ...DATA.ENEMIES,
    robot: { ...DATA.ENEMIES.thug, id: 'robot', tags: ['mechanical'], abilities: [] },
    bloat: { ...DATA.ENEMIES.thug, id: 'bloat', hp: 5, abilities: [{ id: 'pop', name: 'Лопнуть', action: 'action', trigger: 'death', range: 0, target: 'tile',
      area: { shape: 'radius', size: 2 }, roll: 'auto', effects: [{ op: 'damage', dice: '3d1', dmgType: 'blunt' }] }] },
    lancer: { ...DATA.ENEMIES.thug, id: 'lancer', abilities: [], weapon: { name: 'Вилы', dice: '1d8', dmgType: 'pierce', stat: 'str', range: 1, hit: 0, attack: 3, item: 'pike' },
      gear: { weapon: 'pike', armor: 'exo' } },
    mortarman: { ...DATA.ENEMIES.gunner, id: 'mortarman', weapon: { name: 'Картофелемёт', dice: '1d8', dmgType: 'blunt', stat: 'dex', range: 8, hit: 0, attack: 4, item: 'mortar' } },
    axeman: { ...DATA.ENEMIES.thug, id: 'axeman', abilities: [], weapon: { name: 'Топорик', dice: '1d6', dmgType: 'slash', stat: 'str', range: 1, hit: 0, attack: 3, item: 'hatchet' } },
  },
};
const h31 = (over = {}) => buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data: D31, ...over });
function battle31(grid, enemies, h = h31(), opts = {}) {
  const b = createBattle({ map: { id: 't31', grid, win: 'killAll' }, heroes: [h], enemies, data: D31, seed: 3, autoReactions: false, ...opts });
  const H = b.units.find((u) => u.team === 'heroes');
  const E = b.units.filter((u) => u.team === 'enemies');
  forceTurn(b, H);
  return { b, H, E, E0: E[0] };
}
const LINE = (n) => ['#'.repeat(n + 2), '#' + 'P' + '.'.repeat(n - 1) + '#', '#'.repeat(n + 2)];

test('reach: polearm hits 2 tiles away as melee; a plain sword does not', () => {
  const { b, H, E0 } = battle31(['######', '#P.E.#', '######'], ['thug'], h31({ equipment: { weapon: 'pike' } }));
  assert.equal(H.weapon.reach, true);
  assert.equal(H.weapon.range, 2);
  assert.ok(isMeleeAttack(b, H, { type: 'attack' }));
  assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'attack' && a.target === E0.id));
  b.rng = stubRng([nat(15)]);
  assert.ok(perform(b, { type: 'attack', unit: H.id, target: E0.id }).ok);
  assert.equal(events(b, 'attack').pop().melee, true);
  const s = battle31(['######', '#P.E.#', '######'], ['thug'], h31({ equipment: { weapon: 'sabre' } }));
  assert.ok(!getLegalActions(s.b, s.H.id).some((a) => a.type === 'attack'));
});

test('thrown: ranged throw at 2..N, weapon drops near the target, fists until picked up; AI walks to it', () => {
  const { b, H, E0 } = battle31(['########', '#......#', '#P..E..#', '#......#', '########'], ['thug'], h31({ equipment: { weapon: 'hatchet' } }));
  assert.equal(H.weapon.thrown, 4);
  assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'throw' && a.target === E0.id));
  b.rng = stubRng([nat(2)]); // miss: the target stays, the axe lands next to it
  assert.ok(perform(b, { type: 'throw', unit: H.id, target: E0.id }).ok);
  assert.equal(H.weapon.name, 'Кулак');
  assert.equal(b.drops.length, 1);
  const d = b.drops[0];
  assert.ok(chebyshev(d.x, d.y, E0.x, E0.y) <= 1 && !(d.x === E0.x && d.y === E0.y));
  assert.equal(events(b, 'attack').pop().melee, false);
  // AI of the thrower: go and pick it up
  H.control = 'ai'; H.abilities = [];
  const act = chooseAction(b, H.id);
  assert.equal(act.type, 'move');
  assert.deepEqual(act.to, { x: d.x, y: d.y });
  assert.ok(perform(b, act).ok);
  assert.equal(H.weapon.id, 'hatchet');
  assert.equal(b.drops.length, 0);
  assert.equal(events(b, 'pickUp').length, 1);
});

test('arc: no line of sight needed, cover ignored; AI fires over a wall', () => {
  const wall = ['#######', '#P.#.E#', '#######'];
  const m = battle31(wall, ['thug'], h31({ equipment: { weapon: 'mortar' } }));
  assert.ok(getLegalActions(m.b, m.H.id).some((a) => a.type === 'attack'));
  const r = battle31(wall, ['thug'], h31({ equipment: { weapon: 'ak' } }));
  assert.ok(!getLegalActions(r.b, r.H.id).some((a) => a.type === 'attack'));
  const cov = battle31(['#######', '#P..cE#', '#######'], ['thug'], h31({ equipment: { weapon: 'mortar' } }));
  cov.b.rng = stubRng([nat(10)]);
  perform(cov.b, { type: 'attack', unit: cov.H.id, target: cov.E0.id });
  assert.equal(events(cov.b, 'attack').pop().kb, getKb(cov.b, cov.E0));
  const ai = createBattle({ map: { id: 'w', grid: ['#######', '#P.#.E#', '#######'], win: 'killAll' }, heroes: [h31()], enemies: ['mortarman'], data: D31, seed: 1, autoReactions: false });
  const M = ai.units.find((u) => u.enemyId === 'mortarman');
  assert.equal(M.weapon.arc, true, 'enemy weapon enriched from item');
  forceTurn(ai, M);
  assert.equal(chooseAction(ai, M.id).type, 'attack');
});

test('area + charges: save for half on everyone in the radius, 2 shots per battle', () => {
  const { b, H, E } = battle31(['#########', '#P....EE#', '#########'], ['thug', 'thug'], h31({ equipment: { weapon: 'rpg' } }));
  assert.equal(H.weaponCharges, 2);
  assert.ok(!getLegalActions(b, H.id).some((a) => a.type === 'burst'));
  E[0].hp = E[1].hp = 99;
  assert.ok(perform(b, { type: 'attack', unit: H.id, target: E[0].id }).ok);
  const ev = events(b, 'weaponArea').pop();
  assert.deepEqual(ev.targets.sort(), [E[0].id, E[1].id].sort());
  assert.equal(events(b, 'save').length, 2);
  assert.ok(E[0].hp < 99 && E[1].hp < 99);
  assert.equal(H.weaponCharges, 1);
  forceTurn(b, H);
  assert.ok(perform(b, { type: 'attack', unit: H.id, tile: { x: E[1].x, y: E[1].y } }).ok);
  assert.equal(H.weaponCharges, 0);
  forceTurn(b, H);
  assert.ok(!getLegalActions(b, H.id).some((a) => a.type === 'attack'));
  assert.equal(perform(b, { type: 'attack', unit: H.id, target: E[0].id }).error, 'charges');
});

test('enr: ENR per shot, no shot without ENR; overheat dice on natural 1', () => {
  const { b, H, E0 } = battle31(LINE(5).map((r, i) => (i === 1 ? '#P...E#' : r)), ['thug'], h31({ equipment: { weapon: 'plasma' } }));
  const enr0 = H.enr;
  b.rng = stubRng([nat(15)]);
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  assert.equal(H.enr, enr0 - 2);
  assert.equal(events(b, 'weaponEnr').length, 1);
  forceTurn(b, H);
  const hp0 = H.hp;
  b.rng = stubRng([nat(1)]);
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  assert.equal(events(b, 'overheat').length, 1);
  assert.ok(H.hp < hp0, 'shooter burns');
  forceTurn(b, H);
  H.enr = 1;
  assert.ok(!getLegalActions(b, H.id).some((a) => a.type === 'attack'));
  assert.equal(perform(b, { type: 'attack', unit: H.id, target: E0.id }).error, 'energy');
});

test('overheat { shots }: after N shots the weapon skips its next turn', () => {
  const { b, H, E0 } = battle31(['#######', '#P...E#', '#######'], ['thug'], h31({ equipment: { weapon: 'coil' } }));
  E0.hp = 99;
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  forceTurn(b, H); b.turn.actions = 1;
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  assert.equal(H.weaponHot, true);
  assert.equal(events(b, 'overheat').pop().turns, 1);
  const toHero = () => { endTurn(b); while (b.turn.unitId !== H.id) endTurn(b); };
  toHero();
  assert.ok(!getLegalActions(b, H.id).some((a) => a.type === 'attack'), 'locked this turn');
  toHero();
  assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'attack'), 'cooled down');
});

test('extra: bonus damage dice on a hit; `only` filters by target tag', () => {
  const { b, H, E0 } = battle31(['#######', '#P...E#', '#######'], ['thug'], h31({ equipment: { weapon: 'bolter' } }));
  E0.hp = 99;
  b.rng = stubRng([nat(18)]);
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  const dm = events(b, 'damage').map((e) => e.dmgType);
  assert.deepEqual(dm, ['pierce', 'fire']);
  const z1 = battle31(['#####', '#PE.#', '#####'], ['thug'], h31({ equipment: { weapon: 'zapper' } }));
  z1.E0.hp = 99; z1.b.rng = stubRng([nat(18)]);
  perform(z1.b, { type: 'attack', unit: z1.H.id, target: z1.E0.id });
  assert.deepEqual(events(z1.b, 'damage').map((e) => e.dmgType), ['pierce']);
  const z2 = battle31(['#####', '#PE.#', '#####'], ['robot'], h31({ equipment: { weapon: 'zapper' } }));
  z2.E0.hp = 99; z2.b.rng = stubRng([nat(18)]);
  perform(z2.b, { type: 'attack', unit: z2.H.id, target: z2.E0.id });
  assert.deepEqual(events(z2.b, 'damage').map((e) => e.dmgType), ['pierce', 'electric']);
});

test('onCrit: ops on a critical hit only; onHit copies with fromCrit are ignored', () => {
  const { b, H, E0 } = battle31(['#####', '#PE.#', '#####'], ['thug'], h31({ equipment: { weapon: 'hook' } }));
  E0.hp = 99;
  b.rng = stubRng([nat(15)]);
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  assert.ok(!E0.statuses.some((s) => s.id === 'prone'), 'plain hit: no prone');
  forceTurn(b, H);
  b.rng = stubRng([nat(20)]);
  perform(b, { type: 'attack', unit: H.id, target: E0.id });
  assert.ok(E0.statuses.some((s) => s.id === 'prone'), 'crit: prone');
});

test('only: EMP hits and stuns only mechanical targets', () => {
  const { b, H, E } = battle31(['########', '#P...EE#', '########'], ['thug', 'robot'], h31({ inventory: { emp: 1 } }));
  const [thug, robot] = E;
  const hp = [thug.hp, robot.hp];
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'emp', tile: { x: robot.x, y: robot.y } }).ok);
  assert.equal(thug.hp, hp[0]);
  assert.ok(robot.hp < hp[1]);
  assert.ok(robot.statuses.some((s) => s.id === 'stun'));
  assert.ok(!thug.statuses.some((s) => s.id === 'stun'));
  assert.ok(events(b, 'onlySkip').length >= 2);
});

test('zone: smoke cloud gives disadvantage to ranged attacks through it, expires; AI values it', () => {
  const { b, H, E0 } = battle31(['#########', '#P.....E#', '#########'], ['gunner'], h31({ inventory: { smoke: 1 } }));
  assert.equal(attackOdds(b, E0, H, 4, false, true).mode, 'normal');
  H.control = 'ai';
  const sm = getLegalActions(b, H.id).filter((a) => a.type === 'useItem' && a.item === 'smoke');
  assert.ok(sm.length && evalAction(b, H, sm[0]) > 0, 'AI sees value in smoking a shooter');
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'smoke', tile: { x: 4, y: 1 } }).ok);
  assert.equal(b.zones.length, 1);
  assert.equal(attackOdds(b, E0, H, 4, false, true).mode, 'dis');
  assert.equal(attackOdds(b, H, E0, 4, true, true).mode, 'normal', 'melee is not affected');
  const r0 = b.round;
  while (b.zones.length && b.round < r0 + 5) endTurn(b);
  assert.equal(b.round, r0 + 2);
  assert.equal(events(b, 'zoneEnd').length, 1);
});

test('nextTurnPenalty: adrenaline gives an action now and takes one next turn', () => {
  const { b, H } = battle31(['#######', '#P...E#', '#######'], ['thug'], h31({ inventory: { adren: 1 } }));
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'adren' }).ok);
  assert.equal(b.turn.actions, 2);
  endTurn(b); while (b.turn.unitId !== H.id) endTurn(b);
  assert.equal(b.turn.actions, 0);
  assert.equal(events(b, 'turnPenalty').length, 1);
});

test('onDeath: the bloat pops when it dies (not by choice)', () => {
  const { b, H, E0 } = battle31(['######', '#PE..#', '######'], ['bloat']);
  b.turn = { unitId: E0.id, move: 6, actions: 1, bonus: 1, disengaged: false, lostControl: false, aiMoves: 0, acted: false };
  assert.ok(!getLegalActions(b, E0.id).some((a) => a.type === 'ability'));
  forceTurn(b, H);
  const hp0 = H.hp;
  dealDamage(b, H, E0, 50, 'blunt');
  assert.ok(E0.dead);
  assert.equal(events(b, 'onDeath').length, 1);
  assert.equal(H.hp, hp0 - 3);
});

test('mech armour: permanent shield, tier 3 needed (else disadvantage), passives and grants; enemy gear too', () => {
  const low = h31({ equipment: { armor: 'exo' } });
  assert.equal(low.mechShield, 10);
  assert.equal(low.armorPenalty, true, 'zabivnoy has mech at tier 2');
  const ok = h31({ equipment: { armor: 'exo' }, proficiencies: { armor: { mech: 3 } } });
  assert.equal(ok.armorPenalty, false);
  assert.equal(ok.stats.str, low.stats.str);
  assert.equal(ok.stats.str, h31().stats.str + 2, 'armour passive');
  assert.ok(ok.abilities.some((a) => a.id === 'exo-core'), 'armour grant');
  const { b, H } = battle31(['######', '#P..E#', '######'], ['thug'], ok);
  assert.deepEqual([H.shield.value, H.shield.mech], [10, true]);
  endTurn(b); endTurn(b); endTurn(b);
  assert.equal(H.shield.value, 10, 'does not expire');
  const L = buildEnemy('lancer', { data: D31 });
  assert.equal(L.mechShield, 10);
  assert.equal(L.weapon.reach, true);
  assert.equal(L.weapon.range, 2);
});

test('withdrawal: opiate queues withdrawal; after battle −MRL and a debuff until rest', () => {
  const h = h31({ inventory: { opium: 1 } });
  const { b, H } = battle31(['######', '#P..E#', '######'], ['thug'], h);
  H.hp -= 5;
  assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'opium' }).ok);
  assert.equal(H.withdrawalPending.length, 1);
  const res = applyWithdrawal(h, H, createRng(1));
  assert.ok(res.loss >= 1 && res.loss <= 4);
  assert.equal(h.mrl, H.mrl - res.loss);
  assert.equal(h.withdrawal.until, 'rest');
  const b2 = createBattle({ map: { id: 'x', grid: ['######', '#P..E#', '######'], win: 'killAll' }, heroes: [h], enemies: ['thug'], data: D31, seed: 2 });
  assert.ok(b2.units.find((u) => u.team === 'heroes').statuses.some((s) => s.id === 'fear'));
  clearWithdrawal(h);
  const b3 = createBattle({ map: { id: 'x', grid: ['######', '#P..E#', '######'], win: 'killAll' }, heroes: [h], enemies: ['thug'], data: D31, seed: 2 });
  assert.ok(!b3.units.find((u) => u.team === 'heroes').statuses.some((s) => s.id === 'fear'));
});

test('stigma: gear puts world flags with the source item', () => {
  const h = h31({ equipment: { weapon: 'blade' } });
  const st = h.worldFlags.filter((f) => f.id === 'stigma');
  assert.deepEqual(st, [
    { id: 'stigma', value: -5, factions: ['tinBrotherhood'], source: 'blade' },
    { id: 'stigma', value: -5, factions: ['tekhonki'], source: 'blade' },
  ]);
});

test('AI uses thrown, arc and area weapons in fixture battles without errors', () => {
  for (let i = 0; i < 30; i++) {
    const w = ['hatchet', 'rpg', 'mortar', 'pike', 'plasma', 'coil'][i % 6];
    const heroes = [h31({ equipment: { weapon: w }, inventory: { smoke: 1, adren: 1, emp: 1 } })];
    const r = simulateBattle({ map: makeArena({ heroes: 1, enemies: 3 }), heroes, enemies: ['axeman', 'mortarman', 'bloat'], data: D31, seed: 500 + i, maxRounds: 30, log: true });
    assert.ok(['heroes', 'enemies', 'draw'].includes(r.winner));
  }
});

console.log('simulation');
const party = () => [hero(), buildCreature({ race: 'skeleton', cls: 'itishnik', path: 'mechanic', data: DATA })];
test('determinism: same seed -> same outcome and log', () => {
  const p = { heroes: party(), enemies: ['thug', 'gunner', 'thug'], data: DATA, maxRounds: 30, log: true };
  const a = simulateBattle({ ...p, seed: 123 });
  const c = simulateBattle({ ...p, seed: 123 });
  assert.equal(a.winner, c.winner);
  assert.equal(a.rounds, c.rounds);
  assert.equal(JSON.stringify(a.log), JSON.stringify(c.log));
});
test('200 fixture battles without exceptions', () => {
  const t0 = Date.now();
  const tally = {};
  for (let i = 0; i < 200; i++) {
    const level = i % 2 ? 5 : 1;
    const heroes = [
      buildCreature({ race: 'human', cls: i % 3 ? 'zabivnoy' : 'itishnik', level, data: DATA }),
      buildCreature({ race: 'skeleton', cls: 'itishnik', level, path: i % 4 ? 'mechanic' : 'hacker', data: DATA }),
    ];
    const map = i % 5 ? makeArena({ heroes: 2, enemies: 3 }) : undefined;
    const r = simulateBattle({ map, heroes, enemies: ['thug', 'gunner', 'thug'], data: DATA, seed: 1000 + i, maxRounds: 30 });
    tally[r.winner] = (tally[r.winner] || 0) + 1;
  }
  console.log(`       results ${JSON.stringify(tally)} in ${Date.now() - t0} ms`);
});

console.log('v4 acrobatics trick');
test('safePassage: hazard tiles deal no damage this turn, flag ends with the turn', () => {
  const HZ = { id: 'hz', grid: ['##########', '#P~~...E.#', '##########'], win: 'killAll' };
  const { b, H } = duel('thug', hero(), HZ);
  forceTurn(b, H);
  assert.equal(grantSafePassage(b, H), true);
  assert.ok(hasSafePassage(b, H));
  const hp = H.hp;
  assert.ok(perform(b, { type: 'move', unit: H.id, to: { x: 4, y: 1 } }).ok);
  assert.equal(H.hp, hp);
  assert.ok(events(b, 'hazard').length >= 1 && events(b, 'hazard').every((e) => e.avoided));
  // without the flag the same walk burns
  const r = duel('thug', hero(), HZ);
  forceTurn(r.b, r.H);
  const hp2 = r.H.hp;
  perform(r.b, { type: 'move', unit: r.H.id, to: { x: 4, y: 1 } });
  assert.ok(r.H.hp < hp2);
  // next turn: no flag; not your turn: cannot grant
  forceTurn(b, H);
  assert.ok(!hasSafePassage(b, H));
  const E = b.units.find((u) => u.team === 'enemies');
  assert.equal(grantSafePassage(b, E), false);
});

test('rollLoot: deterministic by seed, summons drop nothing, gear by GEAR_DROP, world flags', () => {
  const D = GAME_DATA;
  const foes = ['pir-deckhand', 'pir-knifer', 'ai-patrol'].filter((id) => D.ENEMIES[id]);
  assert.ok(foes.length >= 2, 'enemies exist');
  const units = foes.map((id) => ({ enemyId: id, tags: D.ENEMIES[id].tags || [] }));
  const a = rollLoot(units, D, createRng(42));
  const b = rollLoot(units, D, createRng(42));
  assert.deepEqual(a, b);
  assert.ok(a.credits > 0 && a.items.length > 0);
  for (const x of a.items) { assert.ok(D.ITEMS[x.id], x.id); assert.ok(x.n >= 1); }
  // summons: nothing
  const s = rollLoot(units.map((u) => ({ ...u, kind: 'summon' })), D, createRng(42), { flags: ['battle-loot', 'scrap-loot'] });
  assert.deepEqual(s, { credits: 0, items: [] });
  // gear always drops at chance 1, never at 0
  const def = D.ENEMIES[foes[0]];
  const all = rollLoot([foes[0]], { ...D, LOOT_TABLES: {}, GEAR_DROP: { junk: 1, working: 1, masterwork: 1, relic: 1 } }, createRng(1));
  assert.ok(all.items.some((x) => x.id === def.gear.weapon));
  assert.deepEqual(rollLoot([foes[0]], { ...D, LOOT_TABLES: {}, GEAR_DROP: {} }, createRng(1)), { credits: 0, items: [] });
  // flags add draws (no table → credits); scrap-loot only with a mechanical foe
  const noT = { ...D, LOOT_TABLES: {}, GEAR_DROP: {} };
  assert.ok(rollLoot([foes[0]], noT, createRng(3), { flags: ['battle-loot'] }).credits > 0);
  assert.equal(rollLoot([foes[0]], noT, createRng(3), { flags: ['scrap-loot'] }).credits, 0);
  const cnt = (r) => r.items.reduce((n, x) => n + x.n, 0);
  const base = rollLoot([foes[0]], { ...D, GEAR_DROP: {} }, createRng(5));
  const more = rollLoot([foes[0]], { ...D, GEAR_DROP: {} }, createRng(5), { flags: ['battle-loot'] });
  assert.ok(cnt(more) > cnt(base));
});

// ---------------------------------------------------------------- third-exodus.md: Exodus timer, extensions, marks, gates
{
  const st = await import('../game/src/world/state.js');
  const ex = await import('../game/src/world/exodus.js');
  const qs = await import('../game/src/world/quests.js');
  const { EXODUS: X, EXODUS_GATES: G } = await import('../game/src/data/world/exodus.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const mk = () => {
    const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    return s;
  };
  test('exodus: no timer before prologue-done; starts once; rest/travel days count', () => {
    const s = mk();
    assert.equal(ex.exodusSync(s).zero, false);
    assert.equal(s.exodus, undefined);
    assert.equal(ex.exodusHud(s), null);
    s.flags['prologue-done'] = true; s.day = 3;
    ex.exodusSync(s);
    assert.deepEqual(s.exodus, { start: 3, ext: 0, mark: 0 });
    assert.equal(ex.exodusLeft(s), X.t0);
    ex.passDays(s, 6);
    assert.equal(ex.exodusLeft(s), X.t0 - 6);
    ex.passDays(s, X.restDays);
    assert.equal(ex.exodusLeft(s), X.t0 - 6 - X.restDays);
    assert.ok(ex.exodusHud(s).text.includes(String(ex.exodusLeft(s))));
  });
  test('exodus: extensions fire once, survive save/load, capped at extCap', () => {
    const s = mk(); s.flags['prologue-done'] = true; ex.exodusSync(s);
    s.terminals['term-villages'] = 'dead';
    assert.equal(ex.exodusSync(s).out.length, 1);
    assert.equal(s.exodus.ext, 8);
    ex.exodusSync(s);
    assert.equal(s.exodus.ext, 8, 'no double extension');
    s.terminals['term-villages'] = 'ours';
    ex.exodusSync(s);
    assert.equal(s.exodus.ext, 12, 'reflash +4 on top');
    const back = normalizeSave(JSON.parse(JSON.stringify(s)), GAME_DATA);
    ex.exodusSync(back);
    assert.equal(back.exodus.ext, 12, 'reload does not double');
    for (const id of ['term-agrozone', 'cc-terminal-1', 'cc-terminal-2', 'cc-terminal-3']) s.terminals[id] = 'ours';
    Object.assign(s.flags, { 'beacons-out': true, 'agro-marta': true, 'terminals-marked': true });
    s.quests['sq-archon'] = { state: 'done' }; s.quests['sq-cult-mines'] = { state: 'done' };
    ex.exodusSync(s);
    assert.equal(s.exodus.ext, X.extCap);
    assert.equal(ex.exodusLeft(s), X.t0 + X.extCap);
  });
  test('exodus: marks one-way at thresholds, Harmony falls at 4, zero, stop', () => {
    const s = mk(); s.flags['prologue-done'] = true; ex.exodusSync(s);
    const T = X.t0;
    const dayAt = (share) => s.exodus.start + Math.ceil(T - share * T);
    s.day = dayAt(0.75) - 1; ex.exodusSync(s); assert.equal(s.exodus.mark, 0);
    s.day = dayAt(0.75); ex.exodusSync(s); assert.equal(s.exodus.mark, 1);
    assert.equal(ex.encounterMod(s, 'cult'), 1); assert.equal(ex.encounterMod(s, 'harmony'), 0);
    s.day = dayAt(0.5); ex.exodusSync(s); assert.equal(s.exodus.mark, 2); assert.equal(ex.tollMult(s), 1.25);
    s.day = dayAt(0.3); ex.exodusSync(s); assert.equal(s.exodus.mark, 3); assert.equal(ex.priceMult(s), 1.2);
    assert.ok(!s.flags['harmony-fallen']);
    s.day = dayAt(0.15); const r = ex.exodusSync(s); assert.equal(s.exodus.mark, 4);
    assert.ok(s.flags['harmony-fallen'] && r.out.length === 2);
    assert.ok(ex.serviceOff(s, { region: 'harmony' }, 'rest') && !ex.serviceOff(s, { region: 'pirates' }, 'rest'));
    s.exodus.ext = 30; ex.exodusSync(s); assert.equal(s.exodus.mark, 4, 'marks do not roll back');
    s.exodus.ext = 0; s.day = dayAt(0.05); ex.exodusSync(s); assert.equal(s.exodus.mark, 5); assert.equal(ex.priceMult(s), 1.4);
    assert.equal(ex.exodusSync(s).zero, false);
    s.day = s.exodus.start + T; assert.equal(ex.exodusSync(s).zero, true);
    s.flags['exodus-zero'] = true; assert.ok(ex.exodusZeroFinale(s));
    s.flags['node-destroyed-late'] = true;
    assert.equal(ex.exodusSync(s).zero, false); assert.equal(ex.exodusHud(s), null); assert.equal(ex.priceMult(s), 1);
    assert.ok(!ex.exodusZeroFinale(s));
    const d = { 'boss-x': { id: 'boss-x', hp: 100 } };
    assert.deepEqual(ex.incarnate(['boss-x', 'y'], d), ['boss-x^inc', 'y']); assert.equal(d['boss-x^inc'].hp, 125);
  });
  test('exodus: old saves load (prologue-done → timer from now; none → no timer)', () => {
    const s = mk(); s.flags['prologue-done'] = true; s.day = 40; delete s.exodus;
    const a = normalizeSave(JSON.parse(JSON.stringify(s)), GAME_DATA);
    assert.deepEqual(a.exodus, { start: 40, ext: 0, mark: 0 });
    const b = normalizeSave(JSON.parse(JSON.stringify(mk())), GAME_DATA);
    assert.equal(b.exodus, null);
    const c = normalizeSave({ ...JSON.parse(JSON.stringify(s)), exodus: { start: 'x', ext: 999, mark: 9 } }, GAME_DATA);
    assert.deepEqual(c.exodus, { start: 40, ext: X.extCap, mark: X.marks.length });
  });
  test('requires: avgLevel / any / not / terminalsOff / visitedRegions', () => {
    const s = mk();
    s.hero.level = 11;
    assert.ok(!st.requiresOk(s, { avgLevel: 12 }));
    s.hero.level = 12;
    assert.ok(st.requiresOk(s, { avgLevel: 12 }));
    assert.ok(st.requiresOk(s, { any: [{ flag: 'nope' }, { avgLevel: 5 }] }));
    assert.ok(!st.requiresOk(s, { not: { avgLevel: 5 } }));
    assert.ok(!st.requiresOk(s, { terminalsOff: 1 }));
    s.terminals['cc-terminal-1'] = 'dead';
    assert.ok(st.requiresOk(s, { terminalsOff: 1 }));
    assert.ok(!st.requiresOk(s, { visitedRegions: ['warprom'] }));
    s.visited.push(Object.values(LOCS).find((l) => l.region === 'warprom').id);
    assert.ok(st.requiresOk(s, { visitedRegions: ['warprom'] }));
  });
  test('mq-exodus gates: find-node risk option, assault locked until level/terminals/zero', () => {
    const s = mk(); s.flags['prologue-done'] = true; s.hero.level = 8;
    qs.startQuest(s, 'mq-exodus');
    s.quests['mq-exodus'].stage = 'find-node';
    let sl = qs.slots(s, 'mq-exodus');
    assert.equal(sl.length, 1); assert.ok(sl[0].gate);
    assert.deepEqual(sl[0].choice.options.map((o) => o.id), ['gate-risk']);
    qs.chooseOption(s, sl[0], 'gate-risk', GAME_DATA);
    assert.ok(s.flags['gate-passed-early']);
    assert.equal(s.quests['mq-exodus'].stage, 'find-node');
    sl = qs.slots(s, 'mq-exodus');
    assert.ok(!sl[0].gate && sl[0].choice.options.some((o) => o.id === 'trace'));
    // old save without the gate flag but level 12 → open
    delete s.flags['gate-passed-early']; s.hero.level = G.findNode;
    assert.ok(!qs.slots(s, 'mq-exodus')[0].gate);
    s.quests['mq-exodus'].stage = 'assault';
    sl = qs.slots(s, 'mq-exodus');
    assert.ok(sl[0].locked && sl[0].goal.kind === 'battle');
    assert.deepEqual(qs.completeSlot(s, sl[0], GAME_DATA), []);
    assert.equal(qs.onBattleWon(s, 'w-cc-finale', 'cc-node', GAME_DATA).length, 0);
    assert.equal(s.quests['mq-exodus'].stage, 'assault');
    s.flags['exodus-zero'] = true;
    assert.ok(!qs.slots(s, 'mq-exodus')[0].locked);
    delete s.flags['exodus-zero'];
    for (const id of ['term-villages', 'term-agrozone', 'cc-terminal-1']) s.terminals[id] = 'dead';
    assert.ok(qs.slots(s, 'mq-exodus')[0].locked, 'terminals alone are not enough');
    const LOC = Object.values(LOCS);
    s.visited.push(LOC.find((l) => l.region === 'warprom').id, LOC.find((l) => l.region === 'cringegons').id);
    assert.ok(!qs.slots(s, 'mq-exodus')[0].locked);
    s.visited = []; s.hero.level = G.assault;
    assert.ok(!qs.slots(s, 'mq-exodus')[0].locked);
  });
}

// ---------------------------------------------------------------- third-exodus.md §3: world density (caches, events, quests)
{
  const st = await import('../game/src/world/state.js');
  const qs = await import('../game/src/world/quests.js');
  const ex = await import('../game/src/world/exodus.js');
  const D = await import('../game/src/world/data.js');
  const { cacheLoot } = await import('../game/src/data/world/locations.js');
  const { CACHES_DENSITY } = await import('../game/src/data/world/density-caches.js');
  const { EVENTS_DENSITY } = await import('../game/src/data/world/density-events.js');
  const { eventsFor } = await import('../game/src/scenes/event.js');
  const mk = () => st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  test('density caches: loot ids grouped into {item,n} + credits, placed on nodes with check and text', () => {
    assert.deepEqual(cacheLoot(['a', 'b', 'a'], 25), [{ item: 'a', n: 2 }, { item: 'b', n: 1 }, { credits: 25 }]);
    assert.deepEqual(cacheLoot(['a']), [{ item: 'a', n: 1 }]);
    for (const c of CACHES_DENSITY) {
      const on = D.LOCATIONS[c.node].caches.find((x) => x.id === c.id);
      assert.ok(on && on.check.skill === c.check.skill && on.text === c.text, c.id);
      assert.equal(on.loot.filter((x) => x.item).reduce((s, x) => s + x.n, 0), c.loot.length);
      for (const x of on.loot) if (x.item) assert.ok(D.ITEMS[x.item], x.item);
    }
    // the location takes the loot through grant (same shape as searchCache)
    const s = mk(); const c = D.LOCATIONS['alpha-harmony'].caches.find((x) => x.id === 'dc-harmony-bunk');
    const before = s.hero.credits;
    st.grant(s, { items: c.loot.filter((x) => x.item), credits: c.loot.reduce((n, x) => n + (x.credits || 0), 0) });
    assert.equal(s.hero.credits, before + 25); assert.ok(s.hero.items['servo-parts'] >= 1);
  });
  test('density events: merged, plain-string texts, fire once at their node, battle encounters exist, negative credits clamp', () => {
    const ids = Object.keys(EVENTS_DENSITY);
    assert.ok(ids.length >= 20 && ids.every((id) => D.EVENTS[id]));
    assert.equal(D.storyText('Просто строка'), 'Просто строка');
    const e = EVENTS_DENSITY['de-nightwatch'];
    const s = mk(); s.hero.level = e.trigger.level[0];
    const rnd = Math.random; Math.random = () => 0;
    try {
      assert.ok(eventsFor(s, e.location, 'enter').some((x) => x.id === e.id));
      s.flags[`event:${e.id}`] = true;
      assert.ok(!eventsFor(s, e.location, 'enter').some((x) => x.id === e.id), 'once');
    } finally { Math.random = rnd; }
    for (const ev of Object.values(EVENTS_DENSITY)) for (const c of ev.choices) for (const o of [c.success, c.fail]) if (o?.battle) assert.ok(D.ENCOUNTERS[o.battle.encounter], o.battle.encounter);
    const p = mk(); p.hero.credits = 3; st.grant(p, { credits: -10 }); assert.equal(p.hero.credits, 0);
  });
  test('density quests: given by their NPC, exodus bonus once on completion', () => {
    const q = Object.values(D.QUESTS).find((x) => x.density && x.exodus?.ext);
    assert.ok(q && D.isNpcQuest(q.id));
    const s = mk(); s.flags['prologue-done'] = true; ex.exodusSync(s);
    assert.ok(qs.questsOffered(s, q.giver).some((x) => x.id === q.id));
    qs.startQuest(s, q.id);
    s.quests[q.id].stage = q.stages[q.stages.length - 1].id;
    qs.onTalk(s, q.giver, GAME_DATA);
    assert.equal(s.quests[q.id].state, 'done');
    qs.claimTurnin(s, q.id, GAME_DATA); // 'return' turn-in (quest-turnin.js): the reward waits for the NPC
    assert.equal(s.exodus.ext, q.exodus.ext);
    assert.deepEqual(ex.exodusExtend(s, q.id, q.exodus.ext), []);
  });
}

// ---------------------------------------------------------------- quest turn-in (data/text/quest-turnin.js)
{
  const st = await import('../game/src/world/state.js');
  const qs = await import('../game/src/world/quests.js');
  const D = await import('../game/src/world/data.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const mk = () => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; return s; };
  test('turn-in return: last goal → «turn in» (no reward), NPC claims it once with outcome lines', () => {
    const s = mk(); const id = 'sq-galina-hatch';
    assert.equal(D.QUEST_TURNIN[id].mode, 'return');
    qs.startQuest(s, id); qs.onTalk(s, 'galina', GAME_DATA);
    qs.completeSlot(s, qs.slots(s, id)[0], GAME_DATA);
    const xp0 = s.hero.xp;
    const out = qs.onTalk(s, 'galina', GAME_DATA);
    assert.equal(s.quests[id].state, 'done'); assert.equal(s.quests[id].turnin, true);
    assert.equal(s.hero.xp, xp0, 'no reward yet');
    assert.ok(out.some((x) => x.text === qs.turninText(s, id)) && qs.turninText(s, id).startsWith('Вернуться'));
    assert.deepEqual(qs.pendingTurnins(s, 'galina'), [id]);
    assert.ok(D.npcsAt(D.npcHome('galina'), s).includes('galina'));
    qs.claimTurnin(s, id, GAME_DATA);
    assert.ok(s.hero.xp > xp0 && !s.quests[id].turnin);
    const xp1 = s.hero.xp; assert.deepEqual(qs.claimTurnin(s, id, GAME_DATA), []); assert.equal(s.hero.xp, xp1, 'once');
    // survives save normalization
    const s2 = mk(); qs.startQuest(s2, id); s2.quests[id] = { ...s2.quests[id], state: 'done', turnin: true, outcome: 'default' };
    s2.pendingRadio = ['mq-exodus', 'nope'];
    const n2 = normalizeSave(JSON.parse(JSON.stringify(s2)), GAME_DATA);
    assert.equal(n2.quests[id].turnin, true); assert.deepEqual(n2.pendingRadio, ['mq-exodus']);
  });
  test('turn-in outcome: id of the chosen option (or end-<key> stage), failed, default', () => {
    const td = { lines: { default: ['d'], marta: ['m'], light: ['l'], failed: ['f'] } };
    assert.equal(qs.questOutcome({ state: 'done', path: ['a', 'marta', 'back'] }, td), 'marta');
    assert.equal(qs.questOutcome({ state: 'done', path: ['choose', 'end-light'] }, td), 'light');
    assert.equal(qs.questOutcome({ state: 'done', path: [], opt: null, stage: 'x' }, td), 'default');
    assert.equal(qs.questOutcome({ state: 'failed', path: ['marta'] }, td), 'failed');
    assert.deepEqual(qs.turninLines('mq-agro-fire', 'truce'), D.QUEST_TURNIN['mq-agro-fire'].lines.truce);
    assert.deepEqual(qs.turninLines('mq-agro-fire', 'nope'), D.QUEST_TURNIN['mq-agro-fire'].lines.default);
    // a real run: sq-sector-d, option 'talk' → outcome 'talk'
    const s = mk(); const id = 'sq-sector-d'; const q = D.QUESTS[id];
    qs.startQuest(s, id);
    for (let i = 0; i < 12 && s.quests[id].state === 'active'; i++) {
      qs.autoProgress(s, GAME_DATA);
      const sl = qs.slots(s, id)[0]; if (!sl) { qs.onTalk(s, q.stages.find((x) => x.id === s.quests[id].stage)?.goal.npc, GAME_DATA); continue; }
      if (sl.kind === 'choice') qs.chooseOption(s, sl, sl.choice.options.some((o) => o.id === 'talk') ? 'talk' : sl.choice.options[0].id, GAME_DATA);
      else if (sl.goal.kind === 'talk') qs.onTalk(s, sl.goal.npc, GAME_DATA);
      else qs.completeSlot(s, sl, GAME_DATA);
    }
    assert.equal(s.quests[id].state, 'done'); assert.equal(s.quests[id].outcome, 'talk');
  });
  test('turn-in radio: reward at once, call queued; failed quests get failed lines', () => {
    const id = Object.keys(D.QUEST_TURNIN).find((k) => D.QUEST_TURNIN[k].mode === 'radio' && D.QUESTS[k] && !D.QUESTS[k].exodus && !D.QUESTS[k].rewards?.exodus);
    const s = mk(); qs.startQuest(s, id); const q = D.QUESTS[id];
    s.quests[id].stage = q.stages[q.stages.length - 1].id;
    const xp0 = s.hero.xp;
    qs.completeSlot(s, { qid: id, stage: q.stages[q.stages.length - 1], goal: q.stages[q.stages.length - 1].goal }, GAME_DATA);
    assert.equal(s.quests[id].state, 'done'); assert.ok(s.hero.xp > xp0); assert.ok(!s.quests[id].turnin);
    assert.deepEqual(s.pendingRadio, [id]);
    const f = 'sq-cult-mines'; assert.ok(D.QUEST_TURNIN[f].lines.failed);
    const s2 = mk(); qs.startQuest(s2, f); s2.quests[f].fails = {};
    const fq = D.QUESTS[f]; const stage = fq.stages.find((x) => x.id === s2.quests[f].stage);
    const slot = { qid: f, stage, goal: { kind: 'check' } };
    for (let i = 0; i < 5 && s2.quests[f].state === 'active'; i++) qs.failSlot(s2, slot, GAME_DATA);
    assert.equal(s2.quests[f].state, 'failed'); assert.equal(s2.quests[f].outcome, 'failed');
    assert.ok(s2.quests[f].turnin || (s2.pendingRadio || []).includes(f));
    assert.deepEqual(qs.turninLines(f, 'failed'), D.QUEST_TURNIN[f].lines.failed);
  });
  test('turn-in fallback: NPC nowhere → reward at once with a short line; quests without an entry unchanged', () => {
    const s = mk(); const id = 'sq-galina-hatch'; qs.startQuest(s, id);
    s.quests[id] = { ...s.quests[id], state: 'done', turnin: true, outcome: 'default' };
    s.npcs.galina = { dead: true };
    const xp0 = s.hero.xp;
    const out = qs.turninFallback(s, GAME_DATA);
    assert.ok(out[0].text.includes('«') && s.hero.xp > xp0 && !s.quests[id].turnin);
    const plain = Object.values(D.QUESTS).find((q) => !D.QUEST_TURNIN[q.id] && q.stages.length === 1 && !q.stages[0].goal.goals && q.stages[0].goal.kind !== 'choice');
    if (plain) {
      const p = mk(); qs.startQuest(p, plain.id); const x0 = p.hero.xp;
      qs.completeSlot(p, { qid: plain.id, stage: plain.stages[0], goal: plain.stages[0].goal }, GAME_DATA);
      assert.equal(p.quests[plain.id].state, 'done'); assert.ok(!p.quests[plain.id].turnin && p.hero.xp > x0);
    }
  });
}

console.log('stage B: statuses & surfaces');
{
  const DS = {
    ...D31, SURFACES, SURFACE_RULES,
    STATUSES: { ...D31.STATUSES, ...GAME_DATA.STATUSES },
    CONSUMABLES: { ...D31.CONSUMABLES, molotov: GAME_DATA.ITEMS.molotov, 'smoke-grenade': GAME_DATA.ITEMS['smoke-grenade'] },
  };
  const sb = (grid, enemies = ['thug'], over = {}) => {
    const b = createBattle({ map: { id: 'tsb', grid, win: 'killAll' }, heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data: DS, ...over })], enemies, data: DS, seed: 5, autoReactions: false });
    const H = b.units.find((u) => u.team === 'heroes');
    const E = b.units.filter((u) => u.team === 'enemies');
    for (const u of E) { u.maxHp = u.hp = 300; }
    H.maxHp = H.hp = 300;
    forceTurn(b, H);
    return { b, H, E, E0: E[0] };
  };
  const has = (u, id) => u.statuses.some((s) => s.id === id);
  const OPEN = ['############', '#P.........#', '#..........#', '#.........E#', '############'];

  test('tier(L): 1–5 ×1, 6–10 ×2, 11–15 ×3, 16–20 ×4', () => {
    assert.deepEqual([1, 5, 6, 10, 11, 16, 20].map((l) => tierOf(l)), [1, 1, 2, 2, 3, 4, 4]);
  });
  test('T_HAZARD becomes a permanent fire surface; T_WATER — permanent water; barrels parse', () => {
    const { b } = sb(['#######', '#P~wbE#', '#######']);
    assert.equal(floorAt(b, 2, 1).kind, 'fire'); assert.equal(floorAt(b, 2, 1).turns, null);
    assert.equal(floorAt(b, 3, 1).kind, 'water');
    assert.equal(b.barrels.length, 1);
  });
  test('molotov into an oil puddle: the whole puddle burns, units in it burn, surfaceCombo blaze', () => {
    const { b, H, E0 } = sb(OPEN, ['thug'], { inventory: { molotov: 1 } });
    const oil = []; for (let x = 4; x <= 10; x++) oil.push({ x, y: 3 });
    createSurface(b, 'oil', oil, null, {});
    assert.ok(has(E0, 'oiled'), 'standing in new oil → oiled');
    assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'molotov', tile: { x: 4, y: 2 } }).ok);
    for (const p of oil) assert.equal(floorAt(b, p.x, p.y).kind, 'fire', `${p.x},${p.y}`);
    assert.ok(events(b, 'surfaceCombo').some((e) => e.result === 'blaze'));
    assert.ok(has(E0, 'burn'));
  });
  test('wet + electric: +50% damage and shocked without a save; burn is put out by wet', () => {
    const { b, H, E0 } = sb(OPEN);
    applyStatus(b, E0, 'burn', 3, H);
    applyStatus(b, E0, 'wet', 3, H);
    assert.ok(!has(E0, 'burn') && has(E0, 'wet'));
    const got = dealDamage(b, H, E0, 10, 'electric');
    assert.equal(got, 15);
    assert.ok(has(E0, 'shocked'));
    applyStatus(b, E0, 'burn', 3, H);
    assert.ok(!has(E0, 'burn') && !has(E0, 'wet'), 'water puts the fire out (both gone)');
    assert.ok(events(b, 'extinguish').length >= 1);
  });
  test('electric on water spreads through the whole connected puddle', () => {
    const { b, E0 } = sb(OPEN);
    const pool = []; for (let x = 3; x <= 10; x++) pool.push({ x, y: 3 }); pool.push({ x: 3, y: 2 });
    createSurface(b, 'water', pool, null, {});
    assert.ok(has(E0, 'wet'));
    const hp = E0.hp;
    createSurface(b, 'electric', [{ x: 3, y: 2 }], null, {});
    assert.ok(pool.every((p) => floorAt(b, p.x, p.y).kind === 'water' && floorAt(b, p.x, p.y).charged > 0));
    assert.ok(E0.hp < hp && has(E0, 'shocked'));
    assert.ok(events(b, 'surfaceCombo').some((e) => e.result === 'electrify' && e.tiles === pool.length));
  });
  test('toxgas + fire explodes (gas gone, fire at the centre); water + fire → steam; ice + fire → water', () => {
    const { b, E0 } = sb(OPEN);
    createSurface(b, 'toxgas', radiusTiles(b, 9, 3, 1), null, {});
    const hp = E0.hp;
    createSurface(b, 'fire', [{ x: 8, y: 2 }], null, {});
    assert.ok(events(b, 'surfaceCombo').some((e) => e.result === 'explosion'));
    assert.ok(!gasAt(b, 9, 3) && !gasAt(b, 10, 3));
    assert.ok(E0.hp < hp, 'explosion damage');
    assert.equal(floorAt(b, 8, 2).kind, 'fire');
    createSurface(b, 'water', [{ x: 2, y: 2 }], null, {});
    createSurface(b, 'fire', [{ x: 2, y: 2 }], null, {});
    assert.ok(!floorAt(b, 2, 2) && gasAt(b, 2, 2).kind === 'steam');
    createSurface(b, 'ice', [{ x: 3, y: 1 }], null, {});
    createSurface(b, 'fire', [{ x: 3, y: 1 }], null, {});
    assert.equal(floorAt(b, 3, 1).kind, 'water');
  });
  test('surface ticks: −1 per round, surfaceEnd at 0; entry damage once per turn per type; status ticks × tier', () => {
    const { b, H, E0 } = sb(OPEN);
    createSurface(b, 'acid', [{ x: 5, y: 1 }], null, { turns: 2 });
    const r0 = b.round;
    while (floorAt(b, 5, 1) && b.round < r0 + 4) endTurn(b);
    assert.equal(b.round, r0 + 2);
    assert.ok(events(b, 'surfaceEnd').some((e) => e.kind === 'acid'));
    // tier 2 source: burn tick = 1d6 × 2 (always even)
    const src = { ...H, level: 8 };
    while (b.turn.unitId !== H.id) endTurn(b);
    applyStatus(b, E0, 'burn', 3, src);
    endTurn(b);
    while (b.turn.unitId !== E0.id) endTurn(b);
    const tick = b.log.filter((e) => e.type === 'damage' && e.target === E0.id && e.dmgType === 'fire').pop();
    assert.ok(tick && tick.amount % 2 === 0 && tick.amount >= 2);
  });
  test('statuses: glitch on pure organics → hallucination; chilled twice → frozen; frozen cracks on blunt (+3)', () => {
    const { b, H, E0 } = sb(OPEN);
    applyStatus(b, E0, 'glitch', 2, H);
    assert.ok(has(E0, 'hallucination') && !has(E0, 'glitch'));
    applyStatus(b, E0, 'chilled', 2, H);
    applyStatus(b, E0, 'chilled', 2, H);
    assert.ok(has(E0, 'frozen') && !has(E0, 'chilled'));
    assert.equal(dealDamage(b, H, E0, 5, 'blunt'), 8);
    assert.ok(!has(E0, 'frozen'));
  });
  test('smoke grenade with surfaces: gas smoke gives disadvantage to ranged shots', () => {
    const { b, H, E0 } = sb(['#########', '#P.....E#', '#########'], ['gunner'], { inventory: { 'smoke-grenade': 1 } });
    assert.ok(perform(b, { type: 'useItem', unit: H.id, item: 'smoke-grenade', tile: { x: 4, y: 1 } }).ok);
    assert.equal(gasAt(b, 4, 1).kind, 'smoke');
    assert.equal(attackOdds(b, E0, H, 4, false, true).mode, 'dis');
  });
  test('AI avoids fire when there is a way around; harm and enter preview', () => {
    const { b, H, E0 } = sb(['##########', '#P...~..E#', '#........#', '##########']);
    assert.ok(surfaceHarm(b, E0, 5, 1) > 0);
    const pv = surfaceEnterPreview(b, H, 5, 1);
    assert.ok(pv.dmg > 0 && pv.statuses.includes('burn'));
    endTurn(b);
    let guard = 0;
    while (b.turn && b.turn.unitId === E0.id && guard++ < 3) playTurn(b);
    assert.ok(E0.x < 8, 'enemy advanced');
    assert.ok(!b.log.some((e) => (e.type === 'hazard' || e.type === 'surfaceEnter') && e.target === E0.id), 'no fire entered');
  });
  test('AI values setting fire to a target standing in oil', () => {
    const { b, H, E0 } = sb(OPEN, ['thug'], { inventory: { molotov: 1 } });
    H.control = 'ai';
    const act = { type: 'useItem', unit: H.id, item: 'molotov', tile: { x: E0.x, y: E0.y } };
    const dry = evalAction(b, H, act);
    createSurface(b, 'oil', radiusTiles(b, E0.x, E0.y, 1), null, {});
    assert.ok(evalAction(b, H, act) > dry + 2);
  });
}

console.log('combat rework: cover, objects, heights, pushes, archetypes, arenas');
{
  const { COMBAT } = await import('../game/src/data/combat.js');
  const T = await import('../game/src/rules/terrain.js');
  const AR = await import('../game/src/rules/archetypes.js');
  const G = await import('../game/src/rules/grid.js');
  const { makeWorldMap } = await import('../game/src/world/arena.js');
  const C = await import('../game/src/rules/combat.js');
  const DC = {
    ...D31, SURFACES, SURFACE_RULES, COMBAT,
    STATUSES: { ...D31.STATUSES, ...GAME_DATA.STATUSES },
  };
  const cb = (grid, enemies = ['thug'], over = {}, data = DC) => {
    const b = createBattle({ map: { id: 'tcr', grid, win: 'killAll' }, heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data, ...over })], enemies, data, seed: 5, autoReactions: false });
    const H = b.units.find((u) => u.team === 'heroes');
    const E = b.units.filter((u) => u.team === 'enemies');
    for (const u of E) { u.maxHp = u.hp = 300; }
    H.maxHp = H.hp = 300;
    forceTurn(b, H);
    return { b, H, E, E0: E[0] };
  };

  test('cover: half +2 KB, full +5 KB vs ranged; full cover blocks LOS; melee only full «around the corner» +2', () => {
    const { b, H, E0 } = cb(['#########', '#P..c.E.#', '#.......#', '#########']);
    const base = getKb(b, E0);
    assert.equal(getKb(b, E0, H, true) - base, 2);
    const g = G.parseMap({ grid: ['#########', '#P..C.E.#', '#....C..#', '#########'] });
    assert.equal(G.lineOfSight(g, 1, 1, 6, 1), false);
    assert.equal(G.coverLevel(g, 1, 2, 6, 1, false), 3);
    assert.equal(G.coverLevel(g, 6, 2, 5, 1, true), 3, 'diagonal around full cover');
    assert.equal(G.coverLevel(g, 6, 2, 6, 1, true), 0, 'orthogonal melee: no cover');
    const { b: b2, H: H2, E0: E2 } = cb(['#########', '#P...CE.#', '#.......#', '#########']);
    H2.weapon = { ...H2.weapon, range: 10, melee: false };
    assert.ok(!getLegalActions(b2, H2.id).some((a) => a.type === 'attack'), 'line through full cover: no LOS');
  });
  test('flank: target next to cover but not covered from the attacker — no cover, +1 hit', () => {
    const { b, H, E0 } = cb(['#########', '#.....c.#', '#P....E.#', '#.......#', '#########']);
    // cover is above the target, attacker shoots from the left: flank
    const th = T.terrainHit(b, H, E0, false);
    assert.equal(th.flank, 1);
    assert.equal(getKb(b, E0, H, true), getKb(b, E0));
    H.x = 6; H.y = 0; // not used further
  });
  test('objects: crate has HP by level, smash breaks it into rubble (cost 2, +1 KB), objectBreak, paths update', () => {
    const { b, H } = cb(['#######', '#Pc..E#', '#######']);
    const o = T.objectAt(b, 2, 1);
    assert.equal(o.kind, 'crate'); assert.equal(o.hp, 12); assert.equal(o.armor, 8);
    assert.ok(getLegalActions(b, H.id).some((a) => a.type === 'smash'));
    T.damageObject(b, 2, 1, 50, H, 'blunt');
    assert.equal(G.tileAt(b.grid, 2, 1), G.T_RUBBLE);
    assert.ok(b.log.some((e) => e.type === 'objectBreak' && e.kind === 'crate'));
    const r = getReachable_(b, H);
    assert.equal(r.dist[1 * b.grid.w + 2], 2, 'rubble costs 2');
    assert.equal(r.dist[1 * b.grid.w + 3], 3);
    assert.equal(G.coverLevel(b.grid, 1, 1, 4, 1, false), 1);
  });
  test('objects: smash a barrel -> oil surface; generator -> electricity; area damage hits objects', () => {
    const { b, H } = cb(['########', '#.Pb.G.#', '#.....E#', '########']);
    for (let i = 0; i < 5 && T.objectAt(b, 3, 1); i++) { forceTurn(b, H); perform(b, { type: 'smash', tile: { x: 3, y: 1 } }); }
    assert.equal(T.objectAt(b, 3, 1), null);
    assert.equal(floorAt(b, 3, 1).kind, 'oil');
    T.damageObjectsIn(b, (x, y) => x === 5 && y === 1, 99, H, 'blunt');
    assert.ok(b.log.some((e) => e.type === 'objectBreak' && e.kind === 'generator'));
    assert.equal(floorAt(b, 5, 1).kind, 'electric');
  });
  test('without COMBAT data objects are static cover (old behaviour)', () => {
    const { b, H } = cb(['#######', '#Pc..E#', '#######'], ['thug'], {}, { ...DC, COMBAT: undefined });
    assert.equal(T.objectAt(b, 2, 1), null);
    assert.ok(!getLegalActions(b, H.id).some((a) => a.type === 'smash'));
  });
  test('height: +1 hit / +1 range from above, −1 from below, no melee across 2 levels, step up costs +1', () => {
    const { b, H, E0 } = cb(['#########', '#P1.2..E#', '#.......#', '#########']);
    H.x = 2; H.y = 1; // on height 1
    E0.x = 6; E0.y = 2;
    assert.equal(T.terrainHit(b, H, E0, false).elev, 1);
    assert.equal(T.terrainHit(b, E0, H, false).elev, -1);
    assert.equal(T.elevRange(b, H, E0.x, E0.y), 1);
    assert.equal(T.meleeElevOk(b, 4, 1, 5, 1), false);
    assert.equal(G.stepCost(b.grid, 1 * b.grid.w + 1, 1 * b.grid.w + 2), 2);
    assert.equal(G.stepCost(b.grid, 1 * b.grid.w + 3, 1 * b.grid.w + 4), 0, 'h0 -> h2: no ramp');
  });
  test('push: into a wall — slam damage per undelivered tile; into a unit — half each; off a height — fall', () => {
    const { b, H, E0 } = cb(['#######', '#P.E#.#', '#.....#', '#######']);
    H.x = 2; H.y = 1; E0.x = 3; E0.y = 1;
    const hp = E0.hp;
    C.pushFrom(b, H, E0, 2);
    assert.ok(b.log.some((e) => e.type === 'slam'));
    assert.ok(E0.hp < hp);
    const r2 = cb(['########', '#P.2...#', '#......#', '########']);
    r2.H.x = 1; r2.H.y = 1; r2.E0.x = 2; r2.E0.y = 1;
    C.pushFrom(r2.b, r2.H, r2.E0, 1);
    assert.ok(r2.b.log.some((e) => e.type === 'slam'), 'push up the height is blocked');
    const r3 = cb(['########', '#P.2...#', '#......#', '########']);
    r3.H.x = 2; r3.H.y = 1; r3.b.grid.elev[1 * r3.b.grid.w + 2] = 2; r3.b.grid.elev[1 * r3.b.grid.w + 3] = 2;
    r3.E0.x = 3; r3.E0.y = 1;
    C.pushFrom(r3.b, r3.H, r3.E0, 1);
    const f = r3.b.log.find((e) => e.type === 'fall');
    assert.ok(f && f.levels === 2 && f.amount >= 0);
  });
  test('push into a harmful surface: surfaceEnter (fire)', () => {
    const { b, H, E0 } = cb(['########', '#P.E~..#', '#......#', '########']);
    H.x = 2; H.y = 1; E0.x = 3; E0.y = 1;
    C.pushFrom(b, H, E0, 2);
    assert.equal(E0.x, 4);
    assert.ok(b.log.some((e) => (e.type === 'surfaceEnter' || e.type === 'hazard') && e.target === E0.id));
  });
  test('archetypes: bindings by id / rank / faction rule / fallback; missing spec ids skipped', () => {
    const b = createBattle({ map: makeArena({ w: 16, h: 9, heroes: 1, enemies: 8 }), heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 5, data: GAME_DATA })],
      enemies: ['gang-thug', 'pirate-gunner', 'nv-watchman', 'tek-ritualist', 'scavenger-5', 'mutz-alpha', 'mech-hive-node', 'cyber-priest'], data: GAME_DATA, seed: 3 });
    const arch = b.units.filter((u) => u.team === 'enemies').map((u) => u.arch);
    assert.deepEqual(arch, ['assault', 'sniper', 'support', 'controller', 'coward', 'berserk', 'summoner', 'boss']);
    assert.equal(b.units[0].arch, null, 'player hero has no archetype');
    for (const id of ['pir-boarder']) assert.ok(!GAME_DATA.ENEMIES[id]);
  });
  test('archetypes: coward flees at ≤40% HP and leaves from the edge (event flee, no kill XP)', () => {
    const b = createBattle({ map: makeArena({ w: 10, h: 7, heroes: 1, enemies: 1 }), heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 5, data: GAME_DATA })],
      enemies: ['scavenger-5'], data: GAME_DATA, seed: 3 });
    const E = b.units.find((u) => u.team === 'enemies');
    E.hp = Math.floor(E.maxHp * 0.3);
    let guard = 0;
    while (!E.removed && !b.winner && guard++ < 40) { if (b.turn.unitId === E.id) playTurn(b); else endTurn(b); }
    assert.ok(E.fled && E.removed);
    assert.ok(b.log.some((e) => e.type === 'flee'));
    assert.equal(battleXp(b), Math.round(E.xp * 0.5), 'fled: XP ×0.5');
  });
  test('archetypes: summoner calls minions up to the cap; boss phase at 66% / 33%; berserk rage; support heals the wounded', () => {
    const b = createBattle({ map: makeArena({ w: 16, h: 9, heroes: 1, enemies: 3 }), heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 5, data: GAME_DATA })],
      enemies: ['mech-hive-node', 'cyber-priest', 'mutz-alpha'], data: GAME_DATA, seed: 3 });
    const [S, B, R] = b.units.filter((u) => u.team === 'enemies');
    for (let i = 0; i < 30 && !b.winner; i++) { if (b.turn.unitId === S.id) { playTurn(b); } else endTurn(b); }
    const mins = b.units.filter((u) => u.summoner === S.id && u.archMinion);
    assert.ok(mins.length >= 1 && mins.filter((m) => !m.removed && !m.dead).length <= 2);
    dealDamage(b, null, B, Math.ceil(B.maxHp * 0.4), null);
    assert.equal(B.phase, 2);
    dealDamage(b, null, B, Math.ceil(B.maxHp * 0.35), null);
    assert.equal(B.phase, 3);
    assert.equal(b.log.filter((e) => e.type === 'phase').length, 2);
    assert.ok(B.immuneStatus.includes('fear'));
    dealDamage(b, null, S, 9999, null);
    assert.ok(R.rage, 'berserk rages when an ally dies');
    assert.ok(mins.every((m) => m.removed || m.dead), 'summoner death unsummons minions');
    const heal = { effects: [{ op: 'heal', dice: '1d8' }] };
    const sup = { arch: 'support', team: 'enemies' };
    assert.ok(AR.archAbilityMul(b, sup, heal, { team: 'enemies', hp: 3, maxHp: 10 }) > 1);
    assert.equal(AR.archAbilityMul(b, sup, heal, { team: 'enemies', hp: 9, maxHp: 10 }), 1);
  });
  test('intent: enemies forecast melee / ranged with a target and damage', () => {
    const b = createBattle({ map: makeArena({ w: 12, h: 7, heroes: 1, enemies: 2 }), heroes: [buildCreature({ race: 'human', cls: 'zabivnoy', level: 5, data: GAME_DATA })],
      enemies: ['gang-thug', 'pirate-gunner'], data: GAME_DATA, seed: 3 });
    const [a, s] = b.units.filter((u) => u.team === 'enemies');
    const ia = AR.intentOf(b, a), is = AR.intentOf(b, s);
    assert.equal(ia.kind, 'melee'); assert.equal(is.kind, 'ranged');
    assert.equal(ia.target, b.units[0].id); assert.ok(ia.dmg > 0);
  });
  test('arenas: every biome map is connected, starts free, heights have ramps', () => {
    for (const biome of ['wasteland', 'village', 'agro', 'cyber', 'port', 'mutant']) for (let seed = 1; seed <= 15; seed++) {
      const m = makeWorldMap({ seed, enemies: 6, biome });
      const g = G.parseMap(m);
      const all = [...g.starts.P, ...g.starts.E];
      const r = G.reachable(g, all[0].x, all[0].y, 999, null);
      assert.ok(all.every((p) => r.dist[p.y * g.w + p.x] >= 0), `${biome} ${seed}`);
      if (g.elev) for (let i = 0; i < g.w * g.h; i++) if (g.elev[i] === 2) {
        const x = i % g.w, y = (i / g.w) | 0;
        assert.ok(G.DIRS8.every(([dx, dy]) => g.elev[(y + dy) * g.w + x + dx] >= 1), 'h2 ringed by h1');
      }
    }
    assert.equal(makeWorldMap({ seed: 1, region: 'pirates' }).biome, 'port');
    assert.equal(makeWorldMap({ seed: 1, hazard: 'fire' }).biome, 'agro');
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
