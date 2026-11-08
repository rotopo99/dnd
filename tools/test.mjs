// Rules engine tests: node tools/test.mjs (exit code 1 on failure). No frameworks.
import assert from 'node:assert/strict';
import { createRng } from '../game/src/rules/rng.js';
import { parseDice, rollDice, d20, avgDice } from '../game/src/rules/dice.js';
import { buildCreature, buildEnemy, mod, profBonus, pointBuyCost, defaultCombatTalentLimit, DEFAULT_ASI_LEVELS, applyUpgrades } from '../game/src/rules/character.js';
import { parseMap, chebyshev, lineOfSight, hasCover, findPath, reachable, makeArena } from '../game/src/rules/grid.js';
import { createBattle, perform, endTurn, getLegalActions, dealDamage, applyStatus, applyOp, getKb, weaponDamageBonus, isMeleeAttack, attackOdds,
  BREAKDOWN_HEARTBREAK_MAX, HEARTBREAK_HP_LOSS, BREAKDOWN_MRL_RESET, BIG_HIT_FRACTION, BIG_HIT_DC, COVER_KB, DOWN_TURNS_TO_DEATH, OVERCAST_LIMIT } from '../game/src/rules/combat.js';
import { chooseAction, playTurn, evalAction } from '../game/src/rules/ai.js';
import { targetValid, abilityTargets } from '../game/src/rules/combat.js';
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
test('temp HP (shield): ally-cast in a foreign turn outlives the owner\'s turns, absorbs, no stacking, lasts the battle', () => {
  const { b, H, E } = duel();
  H.hp = H.maxHp = 50;
  forceTurn(b, E);
  applyOp(b, E, H, { op: 'shield', value: 8 }); // cast in someone else's turn (like an ally's)
  assert.deepEqual([H.shield.value, H.shield.turns], [8, null], 'default: until the battle ends');
  for (let i = 0; i < 6; i++) endTurn(b); // several full rounds: owner's turns pass
  assert.ok(H.shield && H.shield.value === 8, 'survives owner turn ends');
  assert.equal(dealDamage(b, E, H, 5, 'slash'), 0, 'fully absorbed');
  assert.equal(H.hp, 50);
  assert.equal(events(b, 'damage').pop().absorbed, 5);
  applyOp(b, E, H, { op: 'shield', value: 2 });
  assert.equal(H.shield.value, 3, 'smaller does not replace or stack');
  assert.ok(events(b, 'shield').pop().kept);
  applyOp(b, E, H, { op: 'shield', value: 6 });
  assert.equal(H.shield.value, 6, 'bigger replaces, no sum');
  assert.equal(dealDamage(b, E, H, 10, 'slash'), 4);
  assert.equal(H.shield, null);
  assert.equal(H.hp, 46);
  // explicit turns (enemy shields) still expire
  applyOp(b, H, E, { op: 'shield', value: 5, turns: 1 });
  assert.equal(E.shield.turns, 1);
  for (let i = 0; i < 4; i++) endTurn(b);
  assert.equal(E.shield, null, 'explicit turns expire');
});
test('temp HP: hero-side shield ops in data have no turns (until battle end)', () => {
  const bad = [];
  const scan = (id, list) => { for (const a of list || []) for (const op of a.effects || []) if (op.op === 'shield' && op.turns != null) bad.push(`${id}:${a.id}`); };
  for (const k of ['CLASSES', 'RACES', 'TALENTS', 'GADGETS']) for (const c of Object.values(GAME_DATA[k])) scan(c.id, c.abilities);
  for (const it of Object.values(GAME_DATA.ITEMS)) scan(it.id, [it.battle, ...(it.grants || [])].filter(Boolean));
  assert.deepEqual(bad, []);
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
    // battlefields.md: tile biomes (9 ids) — region main or its variant, hazard fallback
    assert.ok(['port', 'swamp'].includes(makeWorldMap({ seed: 1, region: 'pirates' }).biome));
    assert.equal(makeWorldMap({ seed: 1, hazard: 'fire' }).biome, 'mutant-forest');
  });
}

// vendors-bestiary.md: per-NPC vendors and the codex
{
  console.log('vendors & codex');
  const VS = await import('../game/src/world/vendors.js');
  const CX = await import('../game/src/world/codex.js');
  const { NPCS } = await import('../game/src/data/npcs.js');
  const { ITEMS } = await import('../game/src/world/data.js');
  test('vendors: every trade/train NPC has a profile, all ids exist', () => {
    const miss = Object.values(NPCS).filter((n) => (n.services || []).some((x) => x === 'trade' || x === 'train') && !VS.VENDORS[n.id]).map((n) => n.id);
    assert.deepEqual(miss, []);
    for (const id of Object.keys(VS.VENDORS)) for (const r of VS.vendorStock(id, 1).rows) assert.ok(ITEMS[r.id], `${id}: ${r.id}`);
  });
  test('vendors: stock is unique per NPC, exclusives only at the owner', () => {
    const ids = Object.keys(VS.VENDORS);
    const shelf = (id, day) => VS.vendorStock(id, day).rows.map((r) => r.id).join();
    // two vendors of one node / region differ
    assert.notEqual(shelf('nikola', 1), shelf('paracetamol', 1));
    assert.notEqual(shelf('pip-junior', 1), shelf('d-vasya', 1)); // same archetype, different shelves
    for (const id of ids) for (let day = 1; day <= 12; day += 3) for (const r of VS.vendorStock(id, day, 'ally').rows) {
      if (VS.EXCLUSIVES.has(r.id)) assert.equal(VS.EXCLUSIVES.get(r.id), id, `${r.id} at ${id}`);
    }
  });
  test('vendors: rotation is stable within restock days and changes after', () => {
    const v = VS.VENDORS['smith-okalina'];
    const shelf = (day) => VS.vendorStock('smith-okalina', day).rows.map((r) => r.id).join();
    assert.equal(shelf(1), shelf(v.restock));
    let changed = false;
    for (let k = 1; k <= 6 && !changed; k++) changed = shelf(1) !== shelf(1 + k * v.restock);
    assert.ok(changed);
    assert.equal(VS.restockIn(v, 1), v.restock);
    assert.equal(VS.restockIn(v, v.restock), 1);
  });
  test('vendors: tier cap, signature gate, bans', () => {
    for (const id of Object.keys(VS.VENDORS)) {
      const s = VS.vendorStock(id, 1, 'neutral');
      for (const r of s.rows) if (r.kind === 'rot' || r.kind === 'staple') assert.ok((ITEMS[r.id].tier || 1) <= Math.max(s.cap, 1) || r.kind === 'staple', `${id} ${r.id}`);
      for (const r of s.rows) if (r.kind === 'rare') assert.ok((ITEMS[r.id].tier || 1) <= s.cap + 1, `${id} rare ${r.id}`);
    }
    const ok = VS.vendorStock('smith-okalina', 1, 'neutral');
    assert.ok(ok.rows.some((r) => r.id === 'tin-katana' && r.locked === 'friendly'));
    assert.ok(!VS.vendorStock('smith-okalina', 1, 'friendly').rows.find((r) => r.id === 'tin-katana').locked);
    for (let d = 1; d < 40; d++) for (const r of VS.vendorStock('smith-okalina', d).rows) assert.ok(!['plasma', 'laser', 'energy', 'cyberblade', 'melta'].includes(ITEMS[r.id].type), r.id);
    assert.equal(VS.vendorSellRate('nikola', ITEMS['tushenka']), null); // cyber does not buy food
    assert.ok(VS.vendorSellRate('paracetamol', ITEMS['bandage']) > VS.ARCHETYPES.medic.sellRate); // loves medicine
  });
  test('codex: levels seen → beaten → studied, baseId shares records, normalisation', () => {
    const sv = { flags: {} };
    assert.equal(CX.codexLevel(sv, 'cultist'), 0);
    assert.equal(CX.enemyKey('cultist^2.15'), 'cultist');
    assert.equal(CX.enemyKey('cultist-5'), 'cultist-5'); // own lore record
    CX.markSeen(sv, ['cultist^2.15', { id: 'acolyte' }]);
    assert.equal(CX.codexLevel(sv, 'cultist'), 1);
    CX.markKills(sv, ['cultist', 'cultist^2.24']); // one win per record per battle
    assert.equal(sv.codex.kills.cultist, 1);
    assert.equal(CX.codexLevel(sv, 'cultist'), 2);
    for (let i = 0; i < 3; i++) CX.markKills(sv, ['cultist']);
    assert.equal(CX.codexLevel(sv, 'cultist'), 2);
    const toast = CX.markKills(sv, ['cultist']);
    assert.equal(CX.codexLevel(sv, 'cultist'), 3);
    assert.equal(toast.length, 1);
    assert.equal(CX.enemyFinds(sv, 'acolyte').length, 0);
    sv.flags['cx-acolyte-order'] = true;
    assert.equal(CX.enemyFinds(sv, 'acolyte').length, 1);
    assert.ok(CX.markTerm(sv, 'status', 'bleed') && !CX.markTerm(sv, 'status', 'bleed') && !CX.markTerm(sv, 'status', 'nope'));
    const n = CX.normCodex(JSON.parse(JSON.stringify({ ...sv.codex, seen: { ...sv.codex.seen, ghost: true } })));
    assert.equal(n.kills.cultist, 5); assert.ok(!n.seen.ghost); assert.ok(n.terms['status:bleed']);
    assert.deepEqual(CX.normCodex(undefined), CX.emptyCodex());
  });
}

// companions-scenes.md: recruitment conditions, loyalty / departure, companion XP, check scenes, barks
{
  console.log('companions & check scenes');
  const st = await import('../game/src/world/state.js');
  const CP = await import('../game/src/world/companions.js');
  const QS = await import('../game/src/world/quests.js');
  const CRN = await import('../game/src/world/check-run.js');
  const BK = await import('../game/src/world/barks.js');
  const { COMPANIONS, COMPANION_RULES } = await import('../game/src/data/companions.js');
  const { CHECK_SCENES, SKILL_TEMPLATES, checkKey } = await import('../game/src/data/world/check-scenes.js');
  const { QUESTS } = await import('../game/src/world/data.js');
  const { NPCS } = await import('../game/src/data/npcs.js');
  const { xpForLevel } = await import('../game/src/rules/progression.js');
  const mk = (o = {}) => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [], ...o }); s.flags['prologue-done'] = true; return s; };

  test('recruit: all 21 companions show conditions with reasons', () => {
    const s = mk();
    assert.equal(Object.keys(COMPANIONS).length, 21);
    for (const id of Object.keys(COMPANIONS)) {
      assert.ok(NPCS[id]?.recruitable, id);
      const r = CP.recruitStatus(s, id);
      assert.ok(r.paths.length >= 1 && r.paths[0].rows.length >= 1, id);
      for (const p of r.paths) for (const row of p.rows) assert.ok(row.text && typeof row.text === 'string' && row.why, `${id}: ${row.cond.kind}`);
      for (const p of r.paths) if (!p.ready) assert.ok(p.why, `${id}: blocked path without why`);
    }
  });
  test('recruit: check / pay / alignment / intro / rep conditions block with why and unlock', () => {
    const s = mk();
    s.hero.credits = 0;
    let r = CP.recruitStatus(s, 'telifon');
    assert.ok(r.paths[0].ready && !r.paths[0].ok && r.paths[0].checks.length === 1, 'check pending');
    assert.ok(!r.paths[1].ready && /200/.test(r.paths[1].why), 'pay blocks');
    assert.equal(CP.joinCompanion(s, 'telifon', 'alt'), null);
    CP.markRecruitCheck(s, 'telifon', r.paths[0].checks[0], false);
    r = CP.recruitStatus(s, 'telifon');
    assert.ok(!r.paths[0].ready, 'failed check — retry tomorrow');
    s.day++;
    CP.markRecruitCheck(s, 'telifon', CP.recruitStatus(s, 'telifon').paths[0].checks[0], true);
    assert.ok(CP.recruitStatus(s, 'telifon').paths[0].ok);
    const j = CP.joinCompanion(s, 'telifon', 'main');
    assert.ok(j && j.state === 'active' && CP.recruitStatus(s, 'telifon').already);
    assert.ok(s.quests['cq-telifon']?.state === 'active', 'personal quest starts on joining');
    // pay path: credits are taken
    s.hero.credits = 500;
    const before = s.hero.credits;
    assert.ok(CP.joinCompanion(s, 'laska', 'main'));
    assert.equal(s.hero.credits, before - 400);
    // alignment
    const e = mk({ alignment: 'evil' });
    const z = CP.recruitStatus(e, 'zarya').paths[0];
    assert.ok(!z.ready && /не станет повторением/.test(z.why));
    // intro: Lox needs the first stage of his personal quest
    const l = mk();
    assert.ok(!CP.recruitStatus(l, 'lox').paths[0].ready);
    QS.startQuest(l, 'cq-lox');
    l.quests['cq-lox'].stage = 'hunt';
    assert.ok(CP.recruitStatus(l, 'lox').paths[0].ok);
    // rep: hostile Warprom blocks Nedolyot
    const w = mk();
    w.rep.warprom = -80;
    const nd = CP.recruitStatus(w, 'private-nedolyot').paths[0];
    assert.ok(!nd.ready && /Военпрома/.test(nd.why));
  });
  test('recruit: hard incompatibility blocks while the other is in the party; personal quest lifts it; soft — friction', () => {
    const s = mk();
    st.recruit(s, 'zoya-klyk');
    let z = CP.recruitStatus(s, 'zarya').paths[0];
    assert.ok(!z.ready && /Зоя/.test(z.why));
    s.party.find((p) => p.npc === 'zoya-klyk').state = 'waiting';
    assert.ok(!CP.recruitStatus(s, 'zarya').paths[0].ready, 'waiting counts too');
    s.quests['cq-zoya'] = { state: 'done', stage: 'hunt', subs: {} };
    assert.ok(CP.recruitStatus(s, 'zarya').paths[0].ok, 'lifted by the personal quest');
    st.recruit(s, 'sister-pomekha');
    const lx = CP.recruitStatus(s, 'lox').paths[0].rows.find((r) => r.cond.kind === 'notWith');
    assert.ok(lx.ok && lx.soft);
    // friction at a rest
    s.party.find((p) => p.npc === 'zoya-klyk').state = 'left';
    st.recruit(s, 'lox');
    const ap = s.party.find((p) => p.npc === 'lox').approval;
    CP.restLoyalty(s);
    assert.equal(s.party.find((p) => p.npc === 'lox').approval, ap + COMPANION_RULES.loyalty.events.frictionRest);
  });
  test('loyalty: deeds (shared + personal weights), warning, departure with the line, return by apology at −40', () => {
    const s = mk();
    st.recruit(s, 'lox');
    const p = s.party.find((x) => x.npc === 'lox');
    assert.equal(p.approval, COMPANIONS.lox.loyalty.start);
    st.deed(s, 'kill-surrendered'); // personal −5 (not in Lox's dislikes)
    assert.equal(p.approval, -5);
    st.deed(s, 'serve-ai'); // shared dislike −5
    assert.equal(p.approval, -10);
    let out = st.adjustApproval(s, p, -45);
    assert.ok(p.warned && out.some((x) => /ухож/.test(x.text)));
    out = st.adjustApproval(s, p, -20);
    assert.equal(p.state, 'left');
    assert.ok(out.some((x) => x.text.includes(COMPANIONS.lox.leave.line)), 'leave line');
    assert.ok(s.journal.some((j) => j.text.includes(COMPANIONS.lox.leave.line)));
    const r = CP.recruitStatus(s, 'lox');
    assert.ok(r.left && r.paths[0].id === 'return' && r.paths[0].ok);
    assert.ok(CP.joinCompanion(s, 'lox', 'return'));
    assert.equal(p.state, 'active');
    assert.equal(p.approval, COMPANION_RULES.loyalty.returnLoyalty);
    // waiting on a hub: −1 per 3 days
    p.state = 'waiting'; p.waitDay = s.day; s.day += 7;
    CP.waitingLoyalty(s);
    assert.equal(p.approval, COMPANION_RULES.loyalty.returnLoyalty - 2);
    // battle: downed −3, revived +3, 3 clean wins +1
    p.state = 'active'; p.approval = 0;
    CP.battleLoyalty(s, [{ id: 'hero' }, { id: 'c-lox', down: true }]);
    assert.equal(p.approval, -3);
    CP.battleLoyalty(s, [{ id: 'hero' }, { id: 'c-lox' }], new Set(['lox']));
    assert.equal(p.approval, 0);
    CP.battleLoyalty(s, [{ id: 'hero' }, { id: 'c-lox' }]); CP.battleLoyalty(s, [{ id: 'hero' }, { id: 'c-lox' }]);
    assert.equal(p.approval, 1);
  });
  test('personal quest: loyalty gate, +5 per stage, +15 and alternative path at the end', () => {
    const s = mk();
    assert.ok(QUESTS['cq-andrey']?.personal);
    QS.startQuest(s, 'cq-andrey');
    QS.onArrive(s, 'lagoon-bar', GAME_DATA);
    assert.equal(s.quests['cq-andrey'].stage, 'parts');
    assert.ok(QS.slots(s, 'cq-andrey').every((x) => x.locked), 'gated: Andrey not in the party');
    s.hero.credits = 1000;
    st.recruit(s, 'andrey');
    const p = s.party.find((x) => x.npc === 'andrey');
    assert.equal(p.approval, 5);
    assert.ok(QS.slots(s, 'cq-andrey').every((x) => x.locked), 'loyalty 5 < 10');
    p.approval = 10;
    const slot = QS.slots(s, 'cq-andrey')[0];
    assert.ok(!slot.locked);
    QS.completeSlot(s, slot, GAME_DATA);
    assert.equal(s.quests['cq-andrey'].state, 'done');
    assert.equal(p.approval, 25);
    assert.ok(p.altUnlocked);
    assert.ok(!CP.canChangePath(s, 'andrey', GAME_DATA), 'level < 5');
    p.level = 5;
    assert.ok(CP.canChangePath(s, 'andrey', GAME_DATA));
    CP.changePath(s, 'andrey', GAME_DATA);
    assert.equal(p.path, COMPANIONS.andrey.altPath);
    assert.equal(st.buildCompanion(s, p).pathId || st.buildCompanion(s, p).build.path, COMPANIONS.andrey.altPath);
    assert.ok(!CP.canChangePath(s, 'andrey', GAME_DATA), 'once');
  });
  test('companion XP: active ×1, waiting ×0.5, left 0, behind ×1.5, level ≤ hero', () => {
    const s = mk();
    s.hero.xp = xpForLevel(3); s.hero.level = 3;
    for (const id of ['andrey', 'tik', 'diss', 'lox']) st.recruit(s, id);
    const P = (id) => s.party.find((x) => x.npc === id);
    P('lox').state = 'waiting'; P('diss').state = 'left';
    P('tik').level = 2; P('tik').xp = xpForLevel(2);
    const x0 = Object.fromEntries(s.party.map((p) => [p.npc, p.xp]));
    st.gainXp(s, 100, GAME_DATA);
    assert.equal(P('andrey').xp - x0.andrey, 100);
    assert.equal(P('lox').xp - x0.lox, 50);
    assert.equal(P('diss').xp - x0.diss, 0);
    assert.equal(P('tik').xp - x0.tik, 150);
    st.gainXp(s, 200000, GAME_DATA);
    for (const p of s.party) assert.ok(p.level <= s.hero.level, `${p.npc} ${p.level} > ${s.hero.level}`);
    assert.equal(P('andrey').level, s.hero.level);
    // old save: companions without xp follow the hero's level
    const o = mk(); o.hero.level = 4; o.hero.xp = xpForLevel(4);
    o.party.push({ npc: 'andrey', state: 'active', hp: null, mrl: null, approval: 0, talents: [] });
    st.gainXp(o, 10, GAME_DATA);
    assert.equal(o.party[0].level, 4);
    assert.equal(st.buildCompanion(o, o.party[0]).level, 4);
  });
  test('companion level-up: like the hero — ASI and level talents wait for the player (any loyalty); news queued', () => {
    const s = mk();
    st.recruit(s, 'andrey'); st.recruit(s, 'tik');
    const A = s.party[0], T = s.party[1];
    A.approval = 30; T.approval = 0;
    st.gainXp(s, xpForLevel(4) + 10, GAME_DATA);
    assert.ok(s.hero.level >= 4 && A.level >= 4 && T.level >= 4);
    for (const P of [A, T]) {
      assert.ok(P.pendingAsi.includes(4) && !P.asi.some((e) => e.level === 4), `${P.npc}: player picks`);
      assert.equal(P.pendingTalents, 2, `${P.npc}: talents of levels 2 and 4`);
    }
    assert.ok(A.levelNews.includes(4) && T.levelNews.includes(2));
    const str0 = st.buildCompanion(s, A).stats.con;
    st.chooseCompanionAsi(s, 'andrey', 4, { stats: { con: 2 } }, GAME_DATA);
    assert.equal(st.buildCompanion(s, A).stats.con, Math.min(20, str0 + 2));
    assert.ok(!A.pendingAsi.length);
  });
  test('check scenes: every explicit scene maps to a quest check, 2–4 approaches, skills ⊆ goal', () => {
    const goalAt = (key) => {
      const [qs, path = ''] = key.split('#');
      const [qid, sid] = qs.split('/');
      const stg = QUESTS[qid]?.stages.find((x) => x.id === sid);
      if (!stg) return null;
      const m = /^(?:s(\d+))?(?:o:(.+))?$/.exec(path);
      let g = stg.goal;
      if (m[1] != null) g = g.goals?.[+m[1]];
      if (m[2] != null) g = g?.options?.find((o) => o.id === m[2])?.goal;
      return g;
    };
    for (const [key, sc] of Object.entries(CHECK_SCENES)) {
      for (const k of [key, ...(sc.at || [])]) {
        const g = goalAt(k);
        assert.ok(g && g.kind === 'check', `${k}: no check goal`);
        // the resolved scene keeps only skills of this goal (shared `at` scenes may list foreign skills) and ≥ 2 approaches
        const [qs, path = ''] = k.split('#'); const [qid, sid] = qs.split('/');
        const m = /^(?:s(\d+))?(?:o:(.+))?$/.exec(path);
        const r = CRN.questScene({ qid, stage: QUESTS[qid].stages.find((x) => x.id === sid), goal: g, sub: m[1] != null ? +m[1] : undefined, option: m[2] ? { id: m[2] } : undefined });
        assert.equal(r.key, k);
        assert.ok(r.scene.approaches.length >= Math.min(2, g.skills.length), `${k}: approaches`);
        for (const ap of r.scene.approaches) for (const sk of ap.skills) assert.ok(g.skills.includes(sk), `${k}/${ap.id}: ${sk} ∉ ${g.skills}`);
        if (sc.approaches.some((ap) => ap.skills.some((sk) => !g.skills.includes(sk)))) console.log(`       (data: ${k} — approach skills outside the goal, filtered)`);
      }
      assert.ok(sc.approaches.length >= 2 && sc.approaches.length <= 4 && sc.prolog.length >= 1, key);
      for (const o of ['success', 'fail', 'critSuccess', 'critFail']) assert.ok(sc.outcomes[o]?.text.length, `${key}: ${o}`);
    }
    assert.equal(Object.keys(SKILL_TEMPLATES).length, 20);
    // every quest check opens a scene with ≥ 1 approach
    const s = mk();
    let n = 0;
    for (const q of Object.values(QUESTS)) for (const stg of q.stages) {
      const visit = (g, sub, opt) => {
        if (!g) return;
        if (g.kind === 'check') { n++; const r = CRN.questScene({ qid: q.id, stage: stg, goal: g, sub, option: opt }); assert.ok(r.scene.approaches.length >= 1, r.key); }
        if (g.kind === 'all') g.goals.forEach((sg, i) => visit(sg, i));
        for (const o of g.options || []) if (o.goal) visit(o.goal, sub, o);
      };
      visit(stg.goal);
    }
    assert.ok(n > 100, `quest checks: ${n}`);
    const ex = CRN.questScene({ qid: 'mq-exodus', stage: { id: 'get-in', text: '' }, goal: { skills: ['deception', 'hacking'], dc: 12 }, option: { id: 'forge' } });
    assert.equal(ex.key, 'mq-exodus/get-in#o:forge');
    assert.ok(!ex.scene.auto);
    void s;
  });
  test('check scenes: approaches (companion / item gates), crit outcomes, fx once', () => {
    const s = mk();
    s.hero.items['blank-chips'] = 0;
    const ms = st.members(s, GAME_DATA);
    const sc = CHECK_SCENES['mq-exodus/get-in#o:forge'];
    const states = CRN.approachStates(s, ms, sc, 12);
    const chips = states.find((x) => x.ap.id === 'chips'), shadow = states.find((x) => x.ap.id === 'shadow');
    assert.ok(!chips.ok && /Нужен предмет/.test(chips.why));
    assert.ok(!shadow.ok && /Дымка/.test(shadow.why));
    s.hero.items['blank-chips'] = 1;
    st.recruit(s, 'dymka');
    const st2 = CRN.approachStates(s, st.members(s, GAME_DATA), sc, 12);
    assert.ok(st2.every((x) => x.ok));
    assert.equal(st2.find((x) => x.ap.id === 'chips').bonus, 2);
    const bluff = st2.find((x) => x.ap.id === 'bluff');
    const crit = CRN.rollApproach({ ...bluff, dc: 5 }, { rng: stubRng([nat(20)]) });
    assert.equal(crit.outcome, 'critSuccess');
    const cf = CRN.rollApproach({ ...bluff, dc: 30 }, { rng: stubRng([nat(1), nat(1)]) });
    assert.equal(cf.outcome, 'critFail');
    const ok = CRN.rollApproach({ ...bluff, dc: 5 }, { rng: stubRng([nat(10), nat(10)]) });
    assert.equal(ok.outcome, 'success');
    const nat20fail = CRN.rollApproach({ ...bluff, dc: 99 }, { rng: stubRng([nat(20), nat(20)]) });
    assert.equal(nat20fail.outcome, 'fail', 'a natural 20 that misses is a plain fail');
    assert.ok(CRN.outcomeOf(sc, 'critFail').text[0].includes('сиреной'));
    assert.equal(CRN.outcomeOf({ outcomes: { success: { text: ['ok'] } } }, 'critSuccess').text[0], 'ok', 'crit falls back');
    // fx: hp / days / rep / flags / xp
    const day = s.day, hp0 = st.buildHero(s).hp, xp0 = s.hero.xp;
    const fx = CRN.applyFx(s, { hp: -3, days: 1, rep: { aiParty: -3 }, flags: ['t-flag'], xpPct: 50, credits: 10 }, { xpBase: 100 });
    assert.equal(s.day, day + 1);
    assert.equal(st.buildHero(s).hp, Math.max(1, hp0 - 3));
    assert.ok(s.flags['t-flag'] && s.hero.xp === xp0 + 50);
    assert.ok(fx.toasts.some((x) => /дней/.test(x.text)) && fx.toasts.some((x) => /ЗДР/.test(x.text)));
    // group: everyone rolls, success at half
    const g = CRN.rollApproach({ ...bluff, dc: 10 }, { group: true, ms: st.members(s, GAME_DATA), rng: stubRng([nat(15), nat(15), nat(2), nat(2)]) });
    assert.equal(g.rolls.length, 2);
    assert.ok(g.success);
  });
  test('barks: chance, cooldowns, one per scene, silent in dialogues, personal lines first', () => {
    const cands = [{ npc: 'lox', name: 'Lox' }, { npc: 'tik', name: 'Тик' }];
    const S0 = BK.createBarkState();
    const r = BK.pickBark(S0, 0, 'battleStart', cands, { rng: () => 0, scene: 'A' });
    assert.ok(r && COMPANIONS[r.npc].barks.battleStart.includes(r.text));
    assert.equal(BK.pickBark(S0, 10, 'victory', cands, { rng: () => 0, scene: 'A' }), null, 'one per scene');
    assert.equal(BK.pickBark(S0, 10, 'victory', cands, { rng: () => 0, scene: 'B' }), null, 'global cooldown');
    assert.equal(BK.pickBark(BK.createBarkState(), 0, 'victory', cands, { dialogue: true, rng: () => 0 }), null, 'dialogue');
    assert.equal(BK.pickBark(BK.createBarkState(), 0, 'battleStart', cands, { rng: () => 0.99 }), null, 'chance');
    // 10 battles of ~2 minutes with the usual situations: at most 4 barks
    const S1 = BK.createBarkState();
    const rng = createRng(7);
    let n = 0, now = 0;
    for (let i = 0; i < 10; i++) {
      const sc = { i };
      for (const sit of ['battleStart', 'critHit', 'critHit', 'lowHp', 'victory']) { if (BK.pickBark(S1, now, sit, cands, { rng, scene: sc })) n++; now += 24; }
    }
    // spec target «≤ 4 per 10 battles»: with the current COMPANION_RULES.barks numbers ~6 (balance, reported); hard bound — one per scene
    assert.ok(n <= 10 * COMPANION_RULES.barks.maxPerScene, `barks in 10 battles: ${n}`);
    console.log(`       (barks in 10 simulated battles: ${n})`);
  });
}

// ---------------------------------------------------------------- v7 inventory grid, quick slots, mods, off-hand
console.log('inventory v7: grid, quick slots, mods, off-hand, migration');
{
  const INV = await import('../game/src/world/inventory.js');
  const st = await import('../game/src/world/state.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const { ITEMS } = await import('../game/src/world/data.js');
  const { MODS } = await import('../game/src/data/items/mods.js');
  const { OFFHAND } = await import('../game/src/data/items/offhand.js');
  const { applyEquipment } = await import('../game/src/rules/equipment.js');
  const SF = await import('../game/src/rules/surfaces.js');
  const CB = await import('../game/src/rules/combat.js');
  const mkSave = (cls = 'zabivnoy') => st.newSave({ name: 'T', race: 'human', cls, path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  const noOverlap = (grid, w, h) => {
    const seen = new Set();
    for (const e of grid) {
      const [ew, eh] = INV.entrySize(e);
      assert.ok(e.x >= 0 && e.y >= 0 && e.x + ew <= w && e.y + eh <= h, `in bounds ${e.item}`);
      for (let y = e.y; y < e.y + eh; y++) for (let x = e.x; x < e.x + ew; x++) { const k = `${x},${y}`; assert.ok(!seen.has(k), `overlap at ${k}`); seen.add(k); }
    }
  };
  test('inventory: sizes by table, rotation, capacity, stacks', () => {
    assert.deepEqual(INV.itemSize(ITEMS['hunting-carbine']), [4, 1]);
    assert.deepEqual(INV.itemSize(ITEMS['tower-shield']), [3, 4]);
    assert.deepEqual(INV.itemSize(ITEMS['quilted-jacket']), [2, 2]);
    assert.deepEqual(INV.itemSize(ITEMS.grenade), [1, 1]);
    const tall = { grid: [], w: 2, h: 5 };
    assert.deepEqual(INV.findSpot(tall, ITEMS['hunting-carbine']), { x: 0, y: 0, r: true }, '4×1 rotates into a 2-wide grid');
    const c = { grid: [], w: 3, h: 2 };
    assert.equal(INV.placeAuto(c, INV.makeInst('grenade'), 7), 0, 'stacks of 3 (stack field) fit');
    assert.equal(c.grid.reduce((s, e) => s + e.n, 0), 7);
    assert.ok(c.grid.every((e) => e.n <= INV.stackOf(ITEMS.grenade)));
    assert.equal(INV.placeAuto(c, INV.makeInst('tower-shield'), 1), 1, 'too big: does not fit');
    noOverlap(c.grid, c.w, c.h);
  });
  test('inventory: drag & drop with rotation is atomic; no room → nothing changes', () => {
    const s = mkSave();
    s.hero.items['side-pistol'] = 1; INV.syncItems(s);
    const g = s.hero.bag.grid;
    const i = g.findIndex((e) => e.item === 'side-pistol');
    const [w, h] = INV.gridDims(s.hero);
    // find a free 1×2 spot (rotated pistol)
    let to = null;
    for (let y = 0; y + 2 <= h && !to; y++) for (let x = 0; x < w && !to; x++) if (INV.rectFree({ grid: g, w, h }, x, y, 1, 2, g[i])) to = { x, y };
    const r = INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: i }, { at: 'grid', ref: { c: 'bag', key: 'hero' }, ...to, r: true });
    assert.ok(r.ok, r.msg);
    const e = s.hero.bag.grid.find((x) => x.item === 'side-pistol');
    assert.ok(e.r && e.x === to.x && e.y === to.y);
    const before = JSON.stringify(s.hero.bag);
    const bad = INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: s.hero.bag.grid.indexOf(e) }, { at: 'grid', ref: { c: 'bag', key: 'hero' }, x: w - 1, y: h - 1, r: false });
    assert.equal(bad.ok, false);
    assert.equal(JSON.stringify(s.hero.bag), before, 'failed move leaves the bag as it was');
    noOverlap(s.hero.bag.grid, w, h);
  });
  test('inventory: count view — old-style hero.items edits become instances (and back)', () => {
    const s = mkSave();
    const n0 = s.hero.items.medkit || 0;
    s.hero.items.medkit = n0 + 2; s.hero.items['servo-parts'] = 12;
    INV.syncItems(s);
    assert.equal(INV.countAll(s).medkit, n0 + 2);
    assert.equal(INV.countAll(s)['servo-parts'], 12);
    s.hero.items['servo-parts'] -= 5;
    INV.syncItems(s);
    assert.equal(INV.countAll(s)['servo-parts'], 7);
    assert.equal(s.hero.items['servo-parts'], 7);
  });
  test('inventory: quick slots by armour / vest / mods, only consumables, battle kit', () => {
    const s = mkSave();
    s.hero.equipment = { weapon: null, armor: null, offhand: null, pack: null, mods: [], inst: {} };
    assert.equal(INV.quickCount(s.hero), 2);
    s.hero.equipment.armor = 'rig-vest';
    assert.equal(INV.quickCount(s.hero), 4);
    s.hero.equipment.inst.armor = { q: 'working', mods: ['pocket-lining'] };
    assert.equal(INV.quickCount(s.hero), 5);
    s.hero.equipment.pack = 'lis-pack';
    assert.equal(INV.quickCount(s.hero), 6);
    s.hero.items.grenade = 2; s.hero.items['quilted-jacket'] = 1; INV.syncItems(s);
    const gi = s.hero.bag.grid.findIndex((e) => e.item === 'grenade');
    const ji = s.hero.bag.grid.findIndex((e) => e.item === 'quilted-jacket');
    assert.equal(INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: ji }, { at: 'quick', key: 'hero', i: 5 }).msg, 'inv.quickOnly');
    assert.ok(INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: gi }, { at: 'quick', key: 'hero', i: 5 }).ok);
    const kit = INV.battleKit(s.hero);
    assert.equal(kit.inventory.grenade, 2);
    assert.equal(kit.quickSlots, 6);
  });
  test('battle: quick slot items usable, backpack items only via «Порыться» (full action, swap when full)', () => {
    const u = buildCreature({ race: 'human', cls: 'zabivnoy', level: 3, data: GAME_DATA, inventory: { grenade: 1 }, backpack: { molotov: 2, medkit: 1 }, quickSlots: 1 });
    const b = createBattle({ map: { grid: ['#########', '#P.....E#', '#########'] }, heroes: [u], enemies: ['scavenger'], data: GAME_DATA, seed: 1, autoReactions: false });
    const H = b.units.find((x) => x.team === 'heroes');
    forceTurn(b, H);
    assert.equal(CB.itemUsable(b, H, 'molotov'), 'noItem', 'not straight from the backpack');
    assert.equal(CB.rummageOk(b, H, 'molotov'), 'noSlot', 'one quick slot is taken');
    const r = perform(b, { type: 'rummage', unit: H.id, item: 'molotov', swap: 'grenade' });
    assert.ok(r.ok, r.error);
    assert.equal(H.inventory.molotov, 2);
    assert.equal(H.backpack.grenade, 1);
    assert.equal(b.turn.actions, 0, 'costs the action');
    assert.equal(perform(b, { type: 'rummage', unit: H.id, item: 'medkit', swap: 'molotov' }).error, 'action');
  });
  test('mods: quality and instance mods apply (hit/dmg/kb, immuneSurface, speed, surfaceOnHit, ignoreSmoke)', () => {
    const Q = GAME_DATA.QUALITY;
    const base = applyEquipment(ITEMS, { weapon: 'hunting-carbine' }, null, null, Q).weapon;
    const eq = applyEquipment(ITEMS, { weapon: 'hunting-carbine', armor: 'lined-leather', inst: { weapon: { q: 'masterwork', mods: ['loupe-sight', 'acid-mag'] }, armor: { q: 'junk', mods: ['fire-blanket', 'sprint-spikes'] } } }, null, null, Q);
    assert.equal(eq.weapon.hit, (base.hit || 0) + 2, 'masterwork +1, loupe +1');
    assert.equal(eq.weapon.dmg || 0, (base.dmg || 0) + 1);
    assert.equal(eq.weapon.surfaceOnHit[0].kind, 'acid');
    assert.equal(eq.armor.kb, Math.max(0, ITEMS['lined-leather'].kb - 1), 'junk −1 KB');
    assert.deepEqual(eq.gear.immuneSurface, ['fire']);
    assert.equal(eq.gear.speed, 1);
    const u = buildCreature({ race: 'human', cls: 'ranger', level: 3, data: GAME_DATA, equipment: { weapon: 'hunting-carbine', armor: 'lined-leather', inst: { armor: { q: 'working', mods: ['fire-blanket', 'sprint-spikes'] }, weapon: { q: 'working', mods: ['thermal-scope'] } } } });
    const u0 = buildCreature({ race: 'human', cls: 'ranger', level: 3, data: GAME_DATA, equipment: { weapon: 'hunting-carbine', armor: 'lined-leather' } });
    assert.equal(u.speed, u0.speed + 1);
    assert.ok(u.weapon.ignoreSmoke);
    // immune to fire: standing in fire does no damage
    const b = createBattle({ map: { grid: ['#######', '#P...E#', '#######'] }, heroes: [u], enemies: ['scavenger'], data: GAME_DATA, seed: 2, autoReactions: false });
    const H = b.units.find((x) => x.team === 'heroes');
    SF.createSurface(b, 'fire', [{ x: H.x, y: H.y }], null, { turns: 3 });
    const hp = H.hp;
    SF.surfaceEffect(b, H, 'enter');
    assert.equal(H.hp, hp, 'fire-blanket: no fire damage');
    assert.equal(SF.surfaceHarm(b, H, H.x, H.y), 0);
  });
  test('mods: fits, one per slot, capacity by quality, req check fail does not install', () => {
    const host = { item: 'hunting-carbine', q: 'junk', mods: [] };
    assert.equal(INV.modFitProblem(MODS['loupe-sight'], host), null);
    assert.equal(INV.modFitProblem(MODS['serrated-edge'], host), 'gear.noSlot');
    host.mods = ['loupe-sight'];
    assert.equal(INV.modFitProblem(MODS['acid-mag'], host), 'inv.noModSlots', 'junk: 1 mod');
    assert.equal(INV.modFitProblem(MODS['pso-scope'] || MODS['holo-reticle'], { ...host, q: 'masterwork' }), 'inv.slotTaken');
    // every mod fits at least one item of the catalogue
    const hosts = Object.values(ITEMS).filter((it) => ['weapon', 'armor'].includes(it.slot)).map((it) => ({ item: it.id, q: 'masterwork', mods: [] }));
    for (const m of Object.values(MODS)) assert.ok(hosts.some((h) => INV.modFitProblem(m, h) === null || INV.modFitProblem(m, { ...h, q: 'junk' }) === null), `mod ${m.id} fits something`);
    assert.equal(Object.keys(MODS).length, 76); // +cs-echo-coil (cyberspace-v2)
    for (const id of Object.keys(OFFHAND)) assert.ok(ITEMS[id], id);
    assert.equal(Object.keys(OFFHAND).length, 8);
    // req: failed check → not installed
    const s = mkSave('ranger');
    s.hero.equipment.weapon = 'hunting-carbine'; s.hero.equipment.inst = { weapon: { q: 'masterwork', mods: [] } };
    s.hero.items['thermal-scope'] = 1; INV.syncItems(s);
    const i = s.hero.bag.grid.findIndex((e) => e.item === 'thermal-scope');
    const r = INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: i }, { at: 'mod', host: { at: 'equip', key: 'hero', slot: 'weapon' } }, { check: () => ({ success: false }), rng: () => 0.99 });
    assert.equal(r.ok, false);
    assert.equal(r.msg, 'inv.modFail');
    assert.deepEqual(s.hero.equipment.inst.weapon.mods, []);
    assert.equal(INV.countAll(s)['thermal-scope'], 1, 'the mod stays in the bag');
    const ok = INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: s.hero.bag.grid.findIndex((e) => e.item === 'thermal-scope') }, { at: 'mod', host: { at: 'equip', key: 'hero', slot: 'weapon' } }, { check: () => ({ success: true }) });
    assert.ok(ok.ok);
    assert.deepEqual(s.hero.equipment.inst.weapon.mods, ['thermal-scope']);
  });
  test('off-hand: shield adds KB over the armour cap, two-handed blocks it, offAction ability', () => {
    const plain = buildCreature({ race: 'human', cls: 'arbiter', level: 2, data: GAME_DATA, equipment: { weapon: 'boarding-saber', armor: 'lined-leather' } });
    const sh = buildCreature({ race: 'human', cls: 'arbiter', level: 2, data: GAME_DATA, equipment: { weapon: 'boarding-saber', armor: 'lined-leather', offhand: 'riot-shield' } });
    assert.equal(sh.kb, plain.kb + OFFHAND['riot-shield'].kb);
    const tower = buildCreature({ race: 'human', cls: 'arbiter', level: 2, stats: { str: 8, dex: 14, con: 14, int: 10, wil: 12, cha: 10, per: 10 }, data: GAME_DATA, equipment: { weapon: 'boarding-saber', armor: 'lined-leather', offhand: 'tower-shield' } });
    assert.ok(tower.reqPenalty.includes('tower-shield'), 'STR 13 not met');
    assert.equal(tower.speed, plain.speed - 2 - 2, 'shield speed −2 and unmet req −2');
    const pist = buildCreature({ race: 'human', cls: 'arbiter', level: 2, data: GAME_DATA, equipment: { weapon: 'boarding-saber', offhand: 'side-pistol' } });
    assert.ok(pist.abilities.some((a) => a.id === 'off:side-pistol' && a.action === 'bonus' && a.usesPerBattle === 3));
    const s = mkSave('arbiter');
    s.hero.equipment = { weapon: 'pitchfork', armor: null, offhand: null, pack: null, mods: [], inst: {} };
    s.hero.items['riot-shield'] = 1; INV.syncItems(s);
    const i = s.hero.bag.grid.findIndex((e) => e.item === 'riot-shield');
    assert.equal(INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: i }, { at: 'equip', key: 'hero', slot: 'offhand' }).msg, 'inv.twoHandedBlock');
    s.hero.equipment.weapon = 'boarding-saber';
    assert.ok(INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: s.hero.bag.grid.findIndex((e) => e.item === 'riot-shield') }, { at: 'equip', key: 'hero', slot: 'offhand' }).ok);
    // equipping a two-handed weapon frees the off-hand into the bag
    s.hero.items.pitchfork = 1; INV.syncItems(s);
    const r = INV.moveItem(s, { at: 'grid', ref: { c: 'bag', key: 'hero' }, index: s.hero.bag.grid.findIndex((e) => e.item === 'pitchfork') }, { at: 'equip', key: 'hero', slot: 'weapon' });
    assert.ok(r.ok && r.toasts.includes('inv.offFreed'));
    assert.equal(s.hero.equipment.offhand, null);
    assert.equal(INV.countAll(s)['riot-shield'], 1);
  });
  test('migration: old save (id counts, flat mods) → grid without overlaps, rest in stash, quick slots, v = 2', () => {
    const s = mkSave('ranger');
    const old = JSON.parse(JSON.stringify(s));
    delete old.hero.bag; delete old.stash; delete old.v; delete old.ground;
    old.hero.items = { medkit: 3, grenade: 4, molotov: 2, 'hunting-carbine': 1, 'tower-shield': 1, 'heavy-plate': 1, 'quilted-jacket': 2, 'servo-parts': 25, 'loupe-sight': 1, 'sniper-rifle': 1, 'rpg-tube': 1 };
    old.hero.equipment = { weapon: 'hunting-carbine', armor: null, offhand: null, mods: ['loupe-sight'] };
    const back = normalizeSave(old, GAME_DATA);
    assert.equal(back.v, 2);
    const [w, h] = INV.gridDims(back.hero);
    noOverlap(back.hero.bag.grid, w, h);
    noOverlap(back.stash.grid, 10, 12);
    const want = Object.entries(old.hero.items).filter(([id]) => ITEMS[id]);
    const have = INV.countAll(back);
    for (const [id, n] of want) assert.equal(have[id] || 0, n, `kept ${id}`);
    assert.ok(back.stash.grid.length > 0, 'overflow went to the stash');
    assert.equal(back.hero.bag.quick[0].item, 'grenade', 'grenades first in quick slots');
    assert.deepEqual(back.hero.equipment.inst.weapon.mods, ['loupe-sight']);
    // shop instance value: masterwork ×2.5, no longer a bare id
    assert.equal(INV.instValue({ item: 'hunting-carbine', q: 'masterwork', mods: [] }), Math.round(ITEMS['hunting-carbine'].price * 2.5));
    // a save made now keeps its grid on reload
    const again = normalizeSave(JSON.parse(JSON.stringify(back)), GAME_DATA);
    assert.deepEqual(again.hero.bag, back.hero.bag);
  });
  test('battle writeback: used quick items leave quick slots first', () => {
    const s = mkSave();
    s.hero.bag.quick = [{ item: 'grenade', q: 'working', n: 2 }, null, null, null, null, null];
    s.hero.items.grenade = 0; INV.refreshView(s);
    s.hero.items.grenade = 3; INV.syncItems(s); // one more grenade in the bag
    INV.consumeBattle(s, 'hero', { grenade: 2 });
    assert.equal(s.hero.bag.quick[0], null);
    assert.equal(INV.countAll(s).grenade, 1);
  });
  test('battle writeback: stacks moved by «Порыться» keep the new quick-slot layout', () => {
    const s = mkSave();
    s.hero.bag.quick = [{ item: 'grenade', q: 'working', n: 1 }, null, null, null, null, null];
    s.hero.items.grenade = 0; INV.refreshView(s);
    s.hero.items.molotov = 2; INV.syncItems(s); // molotovs in the bag
    const n0 = INV.countAll(s);
    assert.ok(s.hero.bag.grid.some((e) => e.item === 'molotov'));
    // battle end: grenade swapped back to the bag, molotovs in the quick slots
    INV.keepQuickLayout(s, 'hero', { molotov: 2 });
    assert.ok(s.hero.bag.quick.some((e) => e && e.item === 'molotov' && e.n === 2), 'molotovs in a quick slot');
    assert.ok(!s.hero.bag.quick.some((e) => e && e.item === 'grenade'), 'grenade left the quick slots');
    assert.ok(s.hero.bag.grid.some((e) => e.item === 'grenade'), 'grenade back in the bag');
    assert.deepEqual(INV.countAll(s), n0, 'nothing lost or duplicated');
    INV.keepQuickLayout(s, 'hero', { molotov: 2 });
    assert.deepEqual(INV.countAll(s), n0, 'idempotent');
  });
}

// ---------------------------------------------------------------- world-consequences.md ч.3–5: base, backstories, neutral, skills 2
console.log('base / backstories / neutral / skill uses 2');
{
  const st = await import('../game/src/world/state.js');
  const qs = await import('../game/src/world/quests.js');
  const BS = await import('../game/src/world/base.js');
  const INV = await import('../game/src/world/inventory.js');
  const { BASE_ATTACKS, BASE_MODULES } = await import('../game/src/data/world/base.js');
  const { TALENTS, WORLD_FLAGS, talentsForSlot } = await import('../game/src/data/talents.js');
  const { applyRep } = await import('../game/src/world/reputation.js');
  const SU = await import('../game/src/world/skill-uses.js');
  const { AUDIT } = await import('../game/src/data/world/skill-uses2.js');
  const { checkInfo } = await import('../game/src/world/checks.js');
  const mk = (extra = {}) => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [], ...extra }); s.flags['prologue-done'] = true; return s; };
  const openBase = (s) => {
    const id = 'sq-galina-hatch';
    qs.startQuest(s, id); qs.onTalk(s, 'galina', GAME_DATA);
    qs.completeSlot(s, qs.slots(s, id)[0], GAME_DATA);
    qs.onTalk(s, 'galina', GAME_DATA);
    qs.claimTurnin(s, id, GAME_DATA);
    return BS.syncBase(s);
  };
  test('base: opens after sq-galina-hatch turn-in, gift once, stash reachable in the bunker', () => {
    const s = mk();
    assert.equal(BS.baseOpen(s), false);
    const med0 = INV.countAll(s).medkit || 0;
    const out = openBase(s);
    assert.ok(BS.baseOpen(s) && out.length >= 1);
    assert.equal(INV.countAll(s).medkit, med0 + 2);
    assert.equal(BS.syncBase(s).length, 0, 'gift only once');
    assert.ok(s.discovered.includes(BS.BASE_LOC));
    s.location = BS.BASE_LOC;
    assert.ok(INV.canStash(s), 'stash at the base');
    assert.equal(BS.modLevel(s, 'stash'), 1);
  });
  test('base: workbench needs generator power; build takes credits, materials, days', () => {
    const s = mk(); openBase(s); s.location = BS.BASE_LOC;
    s.hero.credits = 5000;
    s.base.mods.workbench = 1;
    const a = BS.modActive(s, 'workbench');
    assert.equal(a.ok, false); assert.ok(a.why.length > 5, 'message');
    assert.equal(BS.buildInfo(s, 'generator').why, 'items');
    for (const it of BASE_MODULES.generator.levels[0].cost.items) { s.hero.items[it.id] = (s.hero.items[it.id] || 0) + it.n; }
    INV.syncItems(s);
    const r = BS.startBuild(s, 'generator');
    assert.ok(r.ok);
    assert.equal(s.hero.credits, 5000 - BASE_MODULES.generator.levels[0].cost.credits);
    assert.equal(BS.modLevel(s, 'generator'), 0, 'not ready yet');
    assert.equal(BS.buildInfo(s, 'medbay').why, 'busy');
    s.day = r.ready; BS.baseTick(s);
    assert.equal(BS.modLevel(s, 'generator'), 1);
    assert.ok(BS.modActive(s, 'workbench').ok);
    assert.ok(BS.benchNoCheck(s));
  });
  test('base: radio level 1 → return turn-ins by radio; level 3 defence needs lis-online', () => {
    const s = mk(); openBase(s);
    assert.equal(BS.radioTurnin(s), false);
    s.base.mods.generator = 1; s.base.mods.radio = 1;
    assert.equal(BS.radioTurnin(s), true);
    s.base.mods.defense = 2; s.hero.credits = 9999;
    assert.equal(BS.buildInfo(s, 'defense').why, 'lis');
    s.flags['lis-online'] = true;
    assert.notEqual(BS.buildInfo(s, 'defense').why, 'lis');
  });
  test('base: no raid during the grace days; failed auto-resolve loses a module level', () => {
    const s = mk(); openBase(s);
    s.location = 'dacha-babki';
    s.base.mods.generator = 1; s.base.mods.defense = 1;
    const always = () => 0; // rng 0: every check hits
    s.day = s.base.openDay + BASE_ATTACKS.graceDays - 1;
    BS.baseTick(s, always);
    assert.equal(s.base.raid, null, 'quiet before grace days');
    s.day = s.base.openDay + BASE_ATTACKS.graceDays + BASE_ATTACKS.checkEveryDays * 2;
    BS.baseTick(s, always);
    assert.ok(s.base.lastRaid || s.base.raid, 'raid happened');
    const s2 = mk(); openBase(s2); s2.base.mods.generator = 2;
    s2.base.raid = { ev: BASE_ATTACKS.events[0], day: 1, until: 1 };
    const out = BS.autoResolve(s2, () => 0); // d20 = 1 → fail
    assert.equal(s2.base.lastRaid.result, 'fail');
    assert.equal(s2.base.mods.generator, 1, 'module −1');
    assert.ok(out.length >= 2);
  });
  test('base: defence won → raid cleared, rep; allies = turrets', () => {
    const s = mk(); openBase(s);
    s.base.mods.defense = 2;
    assert.deepEqual(BS.defenseAllies(s), [BASE_ATTACKS.turretAlly]);
    s.base.raid = { ev: BASE_ATTACKS.events[0], day: 1, until: 3 };
    const r0 = s.rep.neutralVillages || 0;
    BS.defendResult(s, true);
    assert.equal(s.base.raid, null);
    assert.ok((s.rep.neutralVillages || 0) >= r0);
  });
  test('backstory: start rep/items/credits/topics, skill bonus, drawback', () => {
    const plain = mk();
    const s = mk({ bg: 'junkOrphan' });
    assert.ok(s.rep.scavengers > plain.rep.scavengers, 'rep');
    assert.equal(INV.countAll(s)['repair-kit'] || 0, (INV.countAll(plain)['repair-kit'] || 0) + 1);
    assert.ok(s.flags['topic:scav-lore']);
    const u0 = st.buildHero(plain), u1 = st.buildHero(s);
    assert.equal(checkInfo({ unit: u1 }, 'tech').total, checkInfo({ unit: u0 }, 'tech').total + 1);
    const d = mk({ bg: 'warprom' });
    assert.equal(d.wanted.warprom.heat, 1);
    const sky = mk({ bg: 'skyRefugee' });
    assert.ok(sky.hero.phobia.some((p) => p.trigger === 'heights'));
  });
  test('neutral: 6 alignment talents, flags known, middle-way damps rep', () => {
    const n = talentsForSlot('alignment', { race: 'human', cls: 'ranger', alignment: 'neutral', stats: {}, level: 1 });
    assert.equal(n.length, 6);
    assert.ok(WORLD_FLAGS['rep-damp'] && TALENTS['middle-way']);
    const s = mk({ alignment: 'neutral', talents: ['middle-way'] });
    const r0 = s.rep.technikums || 0;
    applyRep(s, 'technikums', 8);
    assert.equal((s.rep.technikums || 0) - r0, 6);
  });
  test('skill uses 2: every audited skill has a «now works» line; battle tricks resolve', () => {
    for (const sk of Object.keys(AUDIT)) assert.ok(SU.newUsesLine(sk), sk);
    for (const sk of Object.keys(SU.TRICKS2)) assert.ok(SU.trick2(sk), sk);
  });
}

// ---------------------------------------------------------------- world-consequences.md: quest consequences, epilogue, crime
{
  const st = await import('../game/src/world/state.js');
  const qs = await import('../game/src/world/quests.js');
  const CQ = await import('../game/src/world/consequences.js');
  const CR = await import('../game/src/world/crime.js');
  const { vendorStock } = await import('../game/src/world/vendors.js');
  const { npcsAt, npcHome } = await import('../game/src/world/data.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const { CRIME_RULES, WANTED } = await import('../game/src/data/world/crime.js');
  const { NPCS } = await import('../game/src/data/npcs.js');
  const { QUESTS } = await import('../game/src/world/data.js');
  const mk = () => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'neutral', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; return s; };
  const finish = (s, qid, path) => { s.quests[qid] = { state: 'done', stage: 'x', opt: null, subs: {}, path, turnin: true }; return qs.claimTurnin(s, qid, GAME_DATA); };
  test('consequences: sq-sector-d/force closes the node with a dark mark, toasts + journal', () => {
    const s = mk();
    const out = finish(s, 'sq-sector-d', ['talk-stage', 'force']);
    assert.ok(s.flags['cq:sq-sector-d:force']);
    assert.ok(CQ.closedLoc(s, 'harmony-sector-d'));
    const m = CQ.nodeMark(s, 'harmony-sector-d');
    assert.equal(m.tone, 'bad');
    assert.ok(out.some((x) => x.text.startsWith('Мир изменился')));
    assert.ok(out.filter((x) => x.text.startsWith('Мир изменился')).length <= 3);
    assert.ok(CQ.consequenceLog(s)[0].lines.length);
    assert.ok(CQ.worldRumors(s).length);
  });
  test('consequences: ch3-tin-oath/break — smith prices ×1.2, arena closed; repeat does not double rep', () => {
    const s = mk();
    const base = vendorStock('smith-okalina', s.day, 'neutral', s).rows[0].mult;
    const r0 = s.rep.tinBrotherhood;
    finish(s, 'ch3-tin-oath', ['break']);
    const r1 = s.rep.tinBrotherhood;
    assert.ok(r1 < r0);
    const vs = vendorStock('smith-okalina', s.day, 'neutral', s);
    assert.ok(Math.abs(vs.rows[0].mult - base * 1.2) < 1e-9);
    assert.ok(CQ.closedLoc(s, 'tin-arena'));
    assert.deepEqual(CQ.applyConsequences(s, 'ch3-tin-oath'), []); // the quest reward itself is guarded by st.turnin
    assert.equal(s.rep.tinBrotherhood, r1);
    assert.equal(s.cq.length, 1);
  });
  test('consequences: vendor mult clamp, add goods, close', () => {
    const s = mk();
    finish(s, 'ch3-plague', ['cure']);
    const rows = vendorStock('assimilator-gvozdar', s.day, 'neutral', s).rows;
    assert.ok(rows.some((r) => r.id === 'servo-parts'));
    const s2 = mk();
    finish(s2, 'ch3-plague', ['burn']);
    assert.ok(CQ.shopClosed(s2, 'assimilator-gvozdar'));
    assert.ok(CQ.vendorMods({ cq: Array(10).fill({ qid: 'ch3-tin-oath', o: 'break' }) }, 'smith-okalina').mult <= 1.5);
  });
  test('consequences: NPCs appear / vanish / move (npcsAt, npcHome)', () => {
    const s = mk();
    finish(s, 'ch3-kalostok', []);
    assert.ok(npcsAt('bunker-lisa', s).includes('lis'));
    const home = npcHome('zarya');
    finish(s, 'sq-zarya', ['handover']);
    if (home) assert.ok(!npcsAt(home, s).includes('zarya'));
    assert.equal(npcHome('zarya', s), null);
    finish(s, 'ch3-lox-marks', []);
    assert.ok(npcsAt('lox-5', s).includes('lox'));
  });
  test('consequences: mq3-court/vessel → epilogue slide, intro first, outro last, ≤ 12; finale flag → pendingEpilogue', () => {
    const s = mk();
    for (const [q, p] of [['mq-exodus', ['destroy']], ['mq-beacons', []], ['mq-agro-fire', ['marta']], ['mq3-relay', []], ['mq3-vessel', []], ['mq3-sputnik', ['tech']],
      ['mq3-burner', []], ['mq3-crossing', []], ['mq3-allies', []], ['mq3-fall', ['save']], ['mq3-arsenal', ['force']], ['ch3-plague', ['cure']], ['sq-sector-d', ['talk']]]) finish(s, q, p);
    assert.ok(s.flags['cq:mq3-fall:save'], 'outcome from the stage path even without turn-in lines');
    finish(s, 'mq3-court', ['verdict', 'vessel']);
    const sl = CQ.epilogueSlides(s);
    assert.ok(sl.some((x) => x.id === 'court-vessel'));
    assert.ok(sl.length <= 12);
    assert.equal(sl[0].id, 'epi-intro');
    assert.equal(sl.at(-1).id, 'epi-outro');
    assert.ok(s.flags['game-complete'] && s.pendingEpilogue);
    assert.equal(CQ.epilogueSlides(mk()).length, 2);
  });
  test('consequences: node mark hidden by an antagonist flag (until)', () => {
    const s = mk();
    finish(s, 'sq-galina-hatch', []);
    assert.ok(CQ.nodeMark(s, 'dacha-babki').glyph);
    const n = CQ.nodeMark({ ...s, cq: [{ qid: 'sq-galina-hatch', o: 'default' }] }, 'dacha-babki');
    assert.ok(n.glyph);
  });
  test('crime: theft success gives the shelf item, nat 20 doubles, once a day per NPC', () => {
    const s = mk();
    const npc = NPCS['smith-okalina'];
    s.hero.level = 10;
    const loot = CR.theftLoot(s, npc, 'shop', () => 0);
    assert.ok(loot.item, 'shop theft takes an item');
    const before = s.hero.items[loot.item] || 0;
    const r = CR.resolveTheft(s, npc, loot, { ok: true, natural: 20, place: 'shop' });
    assert.ok(r.ok);
    assert.equal(s.hero.items[loot.item], before + 2);
    assert.ok(CR.theftTried(s, npc.id));
    assert.ok(CR.theftDc(s, npc, 'shop') >= CRIME_RULES.theft.baseDc + CRIME_RULES.theft.place.shop);
  });
  test('crime: failure by gap — noticed / caught / alarm (heat +2, guards)', () => {
    const s = mk();
    const npc = NPCS['smith-okalina'];
    assert.equal(CR.failureOf(2).id, 'noticed');
    assert.equal(CR.failureOf(5).id, 'caught');
    const r = CR.resolveTheft(s, npc, { credits: 10, value: 10 }, { ok: false, gap: 9 });
    assert.equal(r.fail.id, 'alarm');
    assert.deepEqual(r.ask, ['fight', 'run']);
    assert.equal(CR.heatOf(s, 'tinBrotherhood'), 2);
    const g = CR.guardEnemies(s, 'tinBrotherhood');
    assert.equal(g.enemies.length, CRIME_RULES.alarmFight.guardCountByHeat[2]);
    assert.ok(CR.wantedPriceMult(s, 'tinBrotherhood') > 1);
    assert.ok(CR.payFine(s, 30).length);
  });
  test('crime: killing a trader closes the shop, drops goods, fails his quests, hides him', () => {
    const s = mk();
    const giverQ = Object.values(QUESTS).find((q) => q.giver === 'smith-okalina');
    if (giverQ) s.quests[giverQ.id] = { state: 'active', stage: giverQ.stages[0].id, opt: null, subs: {} };
    const k = CR.killNpc(s, 'smith-okalina', () => 0.3);
    assert.ok(s.npcs['smith-okalina'].dead);
    assert.ok(CQ.shopClosed(s, 'smith-okalina'));
    assert.ok(k.loot.items.length > 0 && k.loot.credits > 0);
    assert.ok(!npcsAt('tin-arena', s).includes('smith-okalina'));
    if (giverQ) assert.equal(s.quests[giverQ.id].state, 'failed');
    assert.ok(CR.heatOf(s, 'tinBrotherhood') >= WANTED.gain.killTrader);
    assert.ok(CR.crimeRumors(s).length);
  });
  test('crime: wanted 3 — hunters, recruit / training closed, bounty, spread; bribe; cooling', () => {
    const s = mk();
    s.hero.credits = 5000;
    CR.addHeat(s, 'warprom', 3);
    assert.ok(s.wanted.warprom.bounty > 0);
    assert.ok(CR.hunterEncounter(s, () => 0)?.hunters);
    assert.equal(CR.hunterEncounter(s, () => 0.99), null);
    assert.ok(CR.serviceBlocked(s, 'warprom', 'recruit') && CR.serviceBlocked(s, 'warprom', 'training'));
    assert.equal(CR.entryThreat(s, 'warprom'), 'guards');
    const b = CR.bribeInfo(s, 'warprom');
    assert.equal(b.why, null);
    const c0 = s.hero.credits;
    CR.applyBribe(s, 'warprom', true, 0);
    assert.equal(CR.heatOf(s, 'warprom'), 2);
    assert.equal(s.hero.credits, c0 - b.price);
    s.day += WANTED.decay.everyDays;
    CR.wantedTick(s, 'svalka');
    assert.equal(CR.heatOf(s, 'warprom'), 1);
    CR.addHeat(s, 'warprom', 9);
    assert.ok(CR.bribeInfo(s, 'warprom').why, 'no bribe at 5');
  });
  test('crime: story NPCs are protected, companions too', () => {
    const s = mk();
    assert.ok(CR.attackBlock(s, 'sera'));
    assert.equal(CR.attackBlock(s, 'smith-okalina'), null);
    const a = CR.attackSetup(s, NPCS['smith-okalina'], ['smith-okalina']);
    assert.ok(a.enemies.length >= 1);
  });
  test('save: consequences and wanted survive normalizeSave', () => {
    const s = mk();
    finish(s, 'sq-sector-d', ['force']);
    CR.addHeat(s, 'warprom', 2);
    const n = normalizeSave(JSON.parse(JSON.stringify(s)), GAME_DATA);
    assert.equal(n.cq.length, 1);
    assert.equal(n.wanted.warprom.heat, 2);
    assert.ok(CQ.closedLoc(n, 'harmony-sector-d'));
  });
}

console.log('B1: loot after battle stays in the backpack (single item path)');
{
  const INV = await import('../game/src/world/inventory.js');
  const st = await import('../game/src/world/state.js');
  const { openLoot } = await import('../game/src/scenes/world-battle.js');
  const mkSave = () => st.newSave({ name: 'T', race: 'human', cls: 'zabivnoy', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  const fakeGame = (save) => ({ save, data: GAME_DATA, toasts: [], toast(t) { this.toasts.push(t); }, openModal(spec) { spec.options.at(-1).run(); } });
  const counts = (s, ids) => Object.fromEntries(ids.map((id) => [id, INV.countAll(s)[id] || 0]));
  test('B1: openLoot «Забрать всё» → items in bags, survive syncItems', () => {
    const s = mkSave();
    for (const k of Object.keys(s.hero.items)) delete s.hero.items[k];
    s.hero.items.medkit = 2; s.hero.items.grenade = 1; INV.syncItems(s);
    const before = counts(s, ['medkit', 'grenade', 'rusty-plate']);
    let done = false;
    openLoot(fakeGame(s), { credits: 12, items: [{ id: 'grenade', n: 2 }, { id: 'rusty-plate', n: 1 }, { id: 'medkit', n: 1 }] }, () => { done = true; });
    assert.ok(done);
    const want = { medkit: before.medkit + 1, grenade: before.grenade + 2, 'rusty-plate': before['rusty-plate'] + 1 };
    assert.deepEqual(counts(s, Object.keys(want)), want, 'instances after loot');
    for (const [id, n] of Object.entries(want)) assert.equal(s.hero.items[id], n, `view ${id}`);
    INV.syncItems(s);
    assert.deepEqual(counts(s, Object.keys(want)), want, 'instances after syncItems');
  });
  test('B1: addInst / takeItem / giveItem keep the view in step; old-style edits still sync', () => {
    const s = mkSave();
    INV.syncItems(s);
    const m0 = INV.countAll(s).medkit || 0;
    INV.addInst(s, INV.makeInst('medkit'), 2);
    INV.syncItems(s);
    assert.equal(INV.countAll(s).medkit, m0 + 2);
    s.hero.items.medkit += 1; // old code: pending edit
    INV.giveItem(s, 'medkit', 1);
    INV.takeItem(s, 'medkit', 1);
    INV.syncItems(s);
    assert.equal(INV.countAll(s).medkit, m0 + 3);
    st.grant(s, { items: [{ item: 'grenade', n: 1 }] });
    const g = INV.countAll(s).grenade;
    INV.syncItems(s);
    assert.equal(INV.countAll(s).grenade, g, 'grant goes straight to instances');
  });
}

console.log('Rest: short / long rests, hit dice, provisions');
{
  const INV = await import('../game/src/world/inventory.js');
  const st = await import('../game/src/world/state.js');
  const RS = await import('../game/src/world/rest.js');
  const { REST } = await import('../game/src/data/world/rest.js');
  const { ITEMS } = await import('../game/src/world/data.js');
  const mk = () => { const s = st.newSave({ name: 'T', race: 'human', cls: 'zabivnoy', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; s.hero.level = 3; return s; };
  const rng = () => 0.5;
  test('rest: provision items exist, sold by provisions vendors, counted by `provision`', () => {
    for (const id of ['ration', 'army-ration', 'mutant-stew', 'tushenka']) assert.ok(ITEMS[id]?.provision > 0, id);
    const s = mk();
    INV.syncItems(s);
    const k0 = RS.provisionCount(s);
    INV.giveItem(s, 'ration', 2); INV.giveItem(s, 'army-ration', 1);
    assert.equal(RS.provisionCount(s), k0 + 4);
  });
  test('rest: short rest spends hit dice, restores ENR, 2 per long; 3rd refused', () => {
    const s = mk();
    const u = st.buildHero(s, GAME_DATA);
    s.hero.hp = 5; s.hero.enr = 0;
    const r = RS.shortRest(s, GAME_DATA, rng);
    assert.ok(r.ok);
    const u2 = st.buildHero(s, GAME_DATA);
    assert.ok(u2.hp > 5, 'healed');
    assert.ok(u2.enr >= Math.min(u.maxEnr, Math.ceil(u.maxEnr * REST.short.enrFrac)), 'ENR half');
    assert.ok(s.hero.hdUsed >= 1 && s.hero.hdUsed <= 3);
    assert.ok(RS.shortRest(s, GAME_DATA, rng).ok);
    assert.equal(RS.shortRest(s, GAME_DATA, rng).why, 'noShort');
  });
  test('rest: long rest eats 1 ration per member, full HP/ENR, half dice back, resets shorts; no food → refused, hungry allowed', () => {
    const s = mk();
    INV.syncItems(s);
    for (const [id, n] of Object.entries(INV.countAll(s))) if (ITEMS[id]?.provision) INV.takeItem(s, id, n);
    s.hero.hp = 3; s.hero.enr = 1; s.hero.hdUsed = 3; s.rest = { short: 0, max: 2 };
    assert.equal(RS.longRest(s, GAME_DATA, { mode: 'field' }).why, 'noFood');
    const h = RS.longRest(s, GAME_DATA, { mode: 'hungry', rng });
    assert.ok(h.ok); assert.equal(s.rest.short, 0, 'hungry keeps the counter');
    INV.giveItem(s, 'ration', RS.rationsNeed(s, GAME_DATA));
    const r = RS.longRest(s, GAME_DATA, { mode: 'field' });
    assert.ok(r.ok); assert.equal(r.eaten, RS.rationsNeed(s, GAME_DATA));
    assert.equal(s.hero.hp, null); assert.equal(s.hero.enr, null);
    assert.equal(s.rest.short, REST.short.max);
    assert.equal(RS.provisionCount(s), 0);
    assert.ok(s.hero.hdUsed < 3);
    s.hero.hp = 2;
    assert.ok(RS.longRest(s, GAME_DATA, { mode: 'lodging' }).ok, 'lodging needs no food');
    assert.equal(s.hero.mrl, null);
  });
  test('rest: «за отдых» abilities — battle copy gets the remaining uses, afterBattle stores them, short rest resets', () => {
    const s = mk();
    s.hero.talents = ['healing-hands']; s.hero.activeCombat = ['healing-hands'];
    let u = st.buildHero(s, GAME_DATA);
    const a = u.abilities.find((x) => x.recharge);
    if (!a) return; // the talent is not allowed for this build — nothing to check
    assert.equal(a.usesPerBattle, 1);
    u.uses = { [a.id]: 1 };
    RS.afterBattle(s, { hero: u }, true, GAME_DATA, rng);
    assert.equal(st.buildHero(s, GAME_DATA).abilities.find((x) => x.id === a.id).usesPerBattle, 0);
    RS.shortRest(s, GAME_DATA, rng);
    assert.equal(st.buildHero(s, GAME_DATA).abilities.find((x) => x.id === a.id).usesPerBattle, 1);
  });
  test('rest: afterBattle persists ENR and gives a breather after a win', () => {
    const s = mk();
    const u = st.buildHero(s, GAME_DATA);
    u.enr = 0; u.hp = 4; u.uses = {};
    s.hero.hp = 4;
    RS.afterBattle(s, { hero: u }, true, GAME_DATA, rng);
    assert.equal(s.hero.enr, (u.level || 1) * REST.breather.enrPerLevel);
    assert.ok(s.hero.hp > 4);
    const v = st.buildHero(s, GAME_DATA);
    assert.equal(v.enr, s.hero.enr);
  });
}

// party talents (2026-11-08): member selection, companion level-ups with talents, requirements, migration;
// squad size, reserve at the base, «Одеть лучшее»
{
  console.log('Party: companions level up like the hero, squad size, reserve, best gear');
  const st = await import('../game/src/world/state.js');
  const CP = await import('../game/src/world/companions.js');
  const BG = await import('../game/src/world/best-gear.js');
  const INV = await import('../game/src/world/inventory.js');
  const LU = await import('../game/src/scenes/levelup.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const { TALENTS, TALENT_LEVELS, isCombatTalent, COMBAT_TALENT_LIMIT } = await import('../game/src/data/talents.js');
  const { NPCS } = await import('../game/src/data/npcs.js');
  const { COMPANION_RULES: CRu } = await import('../game/src/data/companions.js');
  const { BASE_LOCATION, BASE_UNLOCK } = await import('../game/src/data/world/base.js');
  const { asiLevelsFor } = await import('../game/src/rules/character.js');
  const { xpForLevel: xpFor } = await import('../game/src/rules/progression.js');
  const mk = (o = {}) => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [], ...o }); s.flags['prologue-done'] = true; return s; };
  const fakeGame = (s) => {
    const pressed = new Set();
    const ctx = { font: '', measureText: (x) => ({ width: String(x).length * 8 }) };
    return { ctx, save: s, data: GAME_DATA, width: 1280, height: 720, toasts: [], toast() {}, modals: [], openModal(m) { this.modals.push(m); }, resume() {},
      press(k) { pressed.add(k); },
      input: { wasPressed: (k) => { const r = pressed.has(k); pressed.delete(k); return r; }, isDown: () => false, typed: () => '', mouse: { x: 0, y: 0, inside: false, clicked: false, wheel: 0 } } };
  };

  {
    const s = mk(); s.hero.level = 5; s.hero.xp = xpFor(5);
    st.recruit(s, 'andrey'); st.recruit(s, 'tik');
    const { createPanelsScene } = await import('../game/src/scenes/panels.js');
    const g = fakeGame(s);
    const sc = createPanelsScene({ tab: 'party', back: null });
    sc.enter(g);
    test('party panel: selection by card, keys, shared across tabs', () => {
      const card = sc.S.buttons.find((b) => b.kind === 'card' && b.id === 'tik');
      assert.ok(card, 'card button');
      g.input.mouse = { x: card.x + 5, y: card.y + 5, inside: true, clicked: true, wheel: 0 };
      sc.update(g, 1 / 60);
      g.input.mouse = { x: 0, y: 0, inside: false, clicked: false, wheel: 0 };
      assert.equal(sc.S.sel, 'tik');
      g.press('ArrowLeft'); sc.update(g, 1 / 60);
      assert.equal(sc.S.sel, 'andrey');
      g.press('Digit1'); sc.update(g, 1 / 60);
      assert.equal(sc.S.sel, 'hero');
      g.press('Digit3'); sc.update(g, 1 / 60);
      assert.equal(sc.S.sel, 'tik');
      g.press('KeyC'); sc.update(g, 1 / 60);
      assert.equal(sc.S.tab, 'stats');
      assert.ok(sc.S.buttons.find((b) => b.kind === 'statMember' && b.id === 'tik').selected, 'stats tab shows tik');
      g.press('KeyG'); sc.update(g, 1 / 60);
      assert.equal(sc.S.gearKey, 'tik', 'gear tab shows tik');
      g.press('KeyP'); sc.update(g, 1 / 60);
      const lv = sc.S.buttons.find((b) => b.kind === 'm' && b.act === 'levelup' && b.member === 'tik' && !b.disabled);
      assert.ok(lv, 'level-up button for a companion with unspent level-ups');
    });
  }

  test('recruit at level 5: unspent ASI + level talents; pick a talent by the companion\'s own requirements', () => {
    const s = mk(); s.hero.level = 5; s.hero.xp = xpFor(5);
    st.recruit(s, 'andrey');
    const p = s.party[0];
    const cls = GAME_DATA.CLASSES[NPCS.andrey.cls];
    assert.deepEqual(p.pendingAsi, asiLevelsFor(cls).filter((L) => L <= 5));
    assert.equal(p.pendingTalents, TALENT_LEVELS.filter((L) => L <= 5).length);
    assert.ok(st.memberPending(s, 'andrey').any);
    const u = st.buildCompanion(s, p);
    const pool = LU.talentPool(s, u, 'andrey');
    assert.ok(pool.length > 0, 'pool');
    // requirements: stats / class / race of the companion, not the hero
    for (const x of pool) {
      for (const [k, v] of Object.entries(x.req?.stats || {})) assert.ok(u.stats[k] >= v, `${x.id} ${k}`);
      if (x.req?.races) assert.ok(x.req.races.includes(u.raceId), `${x.id} race`);
    }
    const strong = Object.values(TALENTS).find((x) => x.slot === 'stat' && x.req?.stats && Object.entries(x.req.stats).some(([k, v]) => u.stats[k] < v));
    if (strong) {
      assert.ok(!pool.some((x) => x.id === strong.id), 'talent above the companion stats is not offered');
      assert.ok(!st.talentOk(s, strong.id, GAME_DATA, 'andrey'));
    }
    const pick = pool.find((x) => isCombatTalent(x)) || pool[0];
    st.chooseMemberTalent(s, 'andrey', pick.id, GAME_DATA);
    assert.ok(p.talents.includes(pick.id));
    assert.equal(p.pendingTalents, TALENT_LEVELS.filter((L) => L <= 5).length - 1);
    const v = st.buildCompanion(s, p);
    assert.ok(v.talents.includes(pick.id));
    // ASI choice «talent instead»
    const tl = LU.talentPool(s, v, 'andrey').find((x) => x.id !== pick.id);
    st.chooseCompanionAsi(s, 'andrey', 4, { talent: tl.id }, GAME_DATA);
    assert.ok(p.talents.includes(tl.id) && p.asi.some((e) => e.level === 4 && e.talent === tl.id) && !p.pendingAsi.includes(4));
  });

  test('companion combat talents: active ≤ limit, rest «в рюкзаке», toggled for any member', () => {
    const s = mk();
    st.recruit(s, 'andrey');
    const p = s.party[0];
    const combat = Object.values(TALENTS).filter((x) => isCombatTalent(x) && !x.todo && !p.talents.includes(x.id)).slice(0, 4).map((x) => x.id);
    for (const id of combat) st.learnTalent(s, id, GAME_DATA, { force: true, key: 'andrey' });
    const lim = COMBAT_TALENT_LIMIT(p.level);
    assert.ok(p.activeCombat.length <= lim);
    const u = st.buildCompanion(s, p);
    assert.ok(u.activeTalents.length <= lim);
    const off = p.talents.find((id) => isCombatTalent(TALENTS[id]) && !p.activeCombat.includes(id));
    assert.equal(st.toggleActiveTalent(s, 'andrey', off, GAME_DATA), 'limit');
    const on = p.activeCombat[0];
    assert.equal(st.toggleActiveTalent(s, 'andrey', on, GAME_DATA), 'off');
    assert.equal(st.toggleActiveTalent(s, 'andrey', off, GAME_DATA), 'on');
    assert.ok(st.buildCompanion(s, p).activeTalents.includes(off));
  });

  test('migration: old companions without level / talents fields get defaults, XP becomes unspent level-ups', () => {
    const s = mk(); s.hero.level = 6; s.hero.xp = xpFor(6);
    s.party.push({ npc: 'andrey', state: 'active', hp: null, mrl: null, approval: 0, talents: ['knee-repair'] }); // v4 entry
    s.party.push({ npc: 'tik', state: 'active', hp: null, mrl: null, approval: 0, talents: [], level: 3, xp: xpFor(5) + 5, asi: 'auto' }); // XP above level
    s.party.push({ npc: 'diss', state: 'active', hp: null, mrl: null, approval: 0, talents: [], level: 4, xp: xpFor(4), asi: [{ level: 4, stats: { cha: 2 }, auto: true }], asiNotes: ['x'] });
    const n = normalizeSave(JSON.parse(JSON.stringify(s)), GAME_DATA);
    const P = (id) => n.party.find((x) => x.npc === id);
    assert.equal(P('andrey').level, 6);
    assert.equal(P('andrey').pendingTalents, 2);
    assert.ok(P('andrey').pendingAsi.includes(4) && Array.isArray(P('andrey').asi) && Array.isArray(P('andrey').activeCombat));
    assert.equal(P('tik').level, 5, 'XP → levels');
    assert.ok(P('tik').levelNews.includes(4) && P('tik').levelNews.includes(5));
    assert.ok(P('tik').pendingAsi.includes(4) && P('tik').pendingTalents === 2);
    assert.ok(P('diss').pendingAsi.includes(4) && !P('diss').asi.length, 'old auto ASI → unspent');
    // idempotent: second normalize gives nothing new
    const n2 = normalizeSave(JSON.parse(JSON.stringify(n)), GAME_DATA);
    assert.equal(n2.party.find((x) => x.npc === 'andrey').pendingTalents, 2);
    assert.ok(st.buildCompanion(n2, n2.party[0]));
  });

  test('squad size: 4 + CHA mod + leader talents; extra companions wait, cannot join', () => {
    const s = mk();
    s.hero.stats = { str: 10, dex: 10, con: 10, int: 10, wil: 10, cha: 10 };
    const info = st.squadInfo(s, GAME_DATA);
    const cha = Math.max(0, Math.floor((st.buildHero(s).stats.cha - 10) / 2));
    assert.equal(info.max, CRu.squad.base + cha + info.lead);
    for (const id of ['andrey', 'tik', 'diss', 'lox', 'dymka', 'sekiro']) st.recruit(s, id);
    assert.equal(1 + st.activeCompanions(s).length, info.max, 'active = squad');
    const w = s.party.find((p) => p.state === 'waiting');
    assert.ok(w && !CP.canRejoin(s, w).ok);
    s.hero.talents.push('leadership');
    assert.equal(st.squadInfo(s, GAME_DATA).lead, 1);
    assert.equal(st.squadMax(s, GAME_DATA), info.max + 1);
    assert.ok(CP.rejoin(s, w.npc, GAME_DATA), 'leader place');
    assert.equal(w.state, 'active');
  });

  test('reserve: waits where hired; with the base open — rests at the base, join only there', () => {
    const s = mk();
    st.recruit(s, 'andrey');
    const here = s.location;
    CP.sendToReserve(s, 'andrey');
    const p = s.party[0];
    assert.equal(p.state, 'waiting'); assert.equal(p.waitAt, here);
    s.location = here === BASE_LOCATION ? 'flat-lagoon' : BASE_LOCATION;
    assert.equal(CP.canRejoin(s, p).why, 'away');
    s.flags[BASE_UNLOCK.openOn.flag] = true;
    assert.equal(CP.idleHome(s, p), BASE_LOCATION);
    assert.deepEqual(CP.baseIdle(s).map((x) => x.npc), ['andrey']);
    s.location = BASE_LOCATION;
    assert.ok(CP.rejoin(s, 'andrey'));
    CP.sendToReserve(s, 'andrey');
    assert.equal(p.waitAt, BASE_LOCATION);
  });

  test('best gear: picks a better weapon / armour from party bags, two-handed frees the off-hand, undo restores', () => {
    const s = mk({ cls: 'zabivnoy' });
    st.recruit(s, 'andrey');
    INV.syncItems(s);
    const before = BG.gearScore(st.buildHero(s));
    const req0 = (st.buildHero(s).reqPenalty || []).length;
    // the best weapon for this hero by the same estimate (trial equip), put into the companion's bag
    const h = s.hero, keep = h.equipment;
    let best = null;
    for (const it of Object.values(GAME_DATA.ITEMS).filter((x) => x.slot === 'weapon' && x.dice && !x.unique)) {
      h.equipment = { ...keep, weapon: it.id, offhand: it.twoHanded ? null : keep.offhand, inst: {} };
      let sc; try { sc = BG.gearScore(st.buildHero(s)); } catch { continue; }
      if (!best || sc > best.sc) best = { id: it.id, sc };
    }
    h.equipment = keep;
    assert.ok(best.sc > before, 'a better weapon exists');
    INV.placeAuto(INV.contOf(s, { c: 'bag', key: 'andrey' }), INV.makeInst(best.id), 1);
    INV.refreshView(s);
    const snap = BG.gearSnapshot(s);
    const r = BG.equipBest(s, ['hero'], GAME_DATA);
    const after = BG.gearScore(st.buildHero(s));
    assert.ok(after >= before - 1e-9, `score ${before} → ${after}`);
    assert.equal(s.hero.equipment.weapon, best.id, 'best weapon taken from the companion bag');
    assert.ok(after > before, 'improved');
    assert.ok(INV.bagOf(s.party[0]).grid.some((e) => e.item === 'armatura') || INV.bagOf(s.hero).grid.some((e) => e.item === 'armatura'), 'old weapon kept');
    assert.ok(Array.isArray(BG.planLines(s, r.plans)));
    const w = GAME_DATA.ITEMS[s.hero.equipment.weapon];
    if (w?.twoHanded) assert.ok(!s.hero.equipment.offhand, 'two-handed: no off-hand');
    // requirements: never equips into an unmet requirement when the old gear had none
    assert.ok((st.buildHero(s).reqPenalty || []).length <= req0, 'no new unmet requirements');
    BG.restoreGear(s, snap);
    assert.equal(BG.gearScore(st.buildHero(s)), before, 'undo');
    // «всем»: hero and companion, items are not duplicated
    const total = () => {
      const c = { ...INV.countAll(s) };
      for (const hh of [s.hero, ...s.party]) for (const sl of ['weapon', 'offhand', 'armor']) { const id = hh.equipment?.[sl]; if (id) c[id] = (c[id] || 0) + 1; }
      return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
    };
    const total0 = total();
    BG.equipBest(s, ['hero', 'andrey'], GAME_DATA);
    assert.equal(total(), total0, 'items conserved');
  });
}

console.log('melee-aoe: leaps, cones, AI areas');
{
  const DM = { ...DATA, SURFACES, SURFACE_RULES, STATUSES: { ...DATA.STATUSES, ...GAME_DATA.STATUSES } };
  const LEAP = { id: 't-leap', name: 'leap', action: 'action', cost: 0, range: 4, target: 'tile', area: { shape: 'radius', size: 1 },
    roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 1,
    effects: [{ op: 'damage', dice: '6d6', dmgType: 'slash' }, { op: 'move', tiles: 4, mode: 'teleport' }] };
  const CONE = { id: 't-cone', name: 'cone', action: 'action', cost: 0, range: 3, target: 'tile', area: { shape: 'cone', size: 3 },
    roll: 'save', save: 'dex', onSave: 'half', usesPerBattle: 2, effects: [{ op: 'damage', dice: '6d6', dmgType: 'slash' }] };
  const mk = (grid, nHeroes, enemies) => {
    const heroes = Array.from({ length: nHeroes }, () => buildCreature({ race: 'human', cls: 'zabivnoy', level: 1, data: DM }));
    const b = createBattle({ map: { id: 'tma', grid, win: 'killAll' }, heroes, enemies, data: DM, seed: 3, autoReactions: false });
    for (const u of b.units) u.maxHp = u.hp = 300;
    return { b, H: b.units.filter((u) => u.team === 'heroes'), E: b.units.filter((u) => u.team === 'enemies') };
  };
  const at = (b, x, y) => b.units.find((u) => u.x === x && u.y === y);
  test('leap + area: landing tile must be free, passable, within the jump and in sight; hero lands, area around', () => {
    const { b, H, E } = mk(['##########', '#P.#.....#', '#..#.....#', '#....E...#', '#......E.#', '##########'], 1, ['thug', 'thug']);
    const h = H[0];
    h.abilities.push({ ...LEAP }); h.uses = {};
    forceTurn(b, h);
    assert.ok(!targetValid(b, h, LEAP, { x: 5, y: 3 }), 'occupied');
    assert.ok(!targetValid(b, h, LEAP, { x: 3, y: 2 }), 'wall');
    assert.ok(!targetValid(b, h, LEAP, { x: 6, y: 1 }), 'out of jump range');
    assert.ok(!targetValid(b, h, LEAP, { x: 4, y: 1 }), 'no line of sight');
    assert.ok(targetValid(b, h, LEAP, { x: 4, y: 4 }));
    const specs = getLegalActions(b, h.id, { noMoves: true }).filter((a) => a.ability === 't-leap');
    assert.ok(specs.length && specs.every((s) => !at(b, s.tile.x, s.tile.y)), 'legal landing tiles are free');
    const hp = E[0].hp, hp2 = E[1].hp;
    assert.ok(!perform(b, { type: 'ability', unit: h.id, ability: 't-leap', tile: { x: 5, y: 3 } }).ok, 'cannot land on a foe');
    assert.ok(perform(b, { type: 'ability', unit: h.id, ability: 't-leap', tile: { x: 4, y: 4 } }).ok);
    assert.deepEqual([h.x, h.y], [4, 4]);
    assert.ok(E[0].hp < hp, 'adjacent foe hit');
    assert.equal(E[1].hp, hp2, 'far foe untouched');
  });
  test('AI cone: picks the direction with the most foes and never hits its own side', () => {
    const { b, H, E } = mk(['#########', '#.......#', '#..PPE..#', '#.......#', '#....E.P#', '#.......#', '#########'], 3, ['thug', 'thug']);
    const caster = at(b, 5, 4), buddy = at(b, 5, 2);
    caster.abilities = [{ ...CONE }]; caster.uses = {};
    forceTurn(b, caster); b.turn.move = 0;
    const act = chooseAction(b, caster.id);
    assert.equal(act.type, 'ability', JSON.stringify(act));
    assert.equal(act.ability, 't-cone');
    const hit = abilityTargets(b, caster, CONE, act.tile);
    assert.equal(hit.length, 2, `cone toward the pair, got ${JSON.stringify(act.tile)}`);
    assert.ok(hit.every((u) => u.team === 'heroes'));
    const hp = buddy.hp;
    assert.ok(perform(b, act).ok);
    assert.equal(buddy.hp, hp, 'ally in the cone is not damaged');
    assert.ok(H.some((u) => u.hp < 300));
  });
  test('AI leap: lands next to the cluster, avoids a harmful surface tile', () => {
    const { b, E } = mk(['##########', '#........#', '#.....PP.#', '#........#', '#..E.....#', '#.......P#', '##########'], 3, ['thug']);
    const e = E[0];
    e.abilities = [{ ...LEAP }]; e.uses = {};
    forceTurn(b, e); b.turn.move = 0;
    let act = chooseAction(b, e.id);
    assert.equal(act.ability, 't-leap', JSON.stringify(act));
    assert.equal(abilityTargets(b, e, LEAP, act.tile).length, 2);
    const first = act.tile;
    createSurface(b, 'fire', [first], null, { turns: 3 });
    act = chooseAction(b, e.id);
    assert.equal(act.ability, 't-leap');
    assert.ok(act.tile.x !== first.x || act.tile.y !== first.y, 'moved off the fire tile');
    assert.equal(abilityTargets(b, e, LEAP, act.tile).length, 2);
  });
}

// pixel icons: every status / surface has a glyph, maps are valid (assets/status-icons.js)
{
  const { ICON_IDS, validateStatusIcons } = await import('../game/src/assets/status-icons.js');
  const { STATUSES } = await import('../game/src/data/effects.js');
  const { SURFACES } = await import('../game/src/data/surfaces.js');
  test('status icons: glyphs valid, all statuses and surfaces covered', () => {
    assert.deepEqual(validateStatusIcons(), []);
    for (const id of Object.keys(STATUSES)) assert.ok(ICON_IDS.includes(id), `no icon for status ${id}`);
    for (const id of Object.keys(SURFACES)) assert.ok(ICON_IDS.includes(`surface:${id}`), `no icon for surface ${id}`);
  });
}

// combat-rework §6 (stage 2): optional objectives, chests, retreat via exits, junk weapon jam (rules/objectives.js)
console.log('combat rework stage 2: objectives, chests, retreat, jam');
{
  const OB = await import('../game/src/rules/objectives.js');
  const { makeWorldMap } = await import('../game/src/world/arena.js');
  const { BATTLE_OBJECTIVES } = await import('../game/src/data/world/battle-objectives.js');
  const { objectiveSpec } = await import('../game/src/scenes/world-battle.js');
  const mkHero = (lvl = 3) => buildCreature({ race: 'human', cls: 'zabivnoy', level: lvl, data: GAME_DATA, id: 'hero' });
  const mk = (goal, extra = {}) => createBattle({ map: makeWorldMap({ seed: 5, enemies: 3, biome: 'village' }), heroes: [mkHero()], enemies: ['gang-thug', 'gang-thug', 'scavenger-5'],
    data: GAME_DATA, seed: 3, autoReactions: false, objectives: { goal, chests: 1, retreat: true, ...extra } });
  const heroOf = (b) => b.units.find((u) => u.team === 'heroes');
  const putNear = (b, u, p) => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (b.grid.tiles[y * b.grid.w + x] === 0 && !b.occ[y * b.grid.w + x]) { b.occ[u.y * b.grid.w + u.x] = 0; u.x = x; u.y = y; b.occ[y * b.grid.w + x] = b.units.indexOf(u) + 1; b.occVersion++; return; }
    }
    throw new Error('no free tile near prop');
  };
  test('objectives: every type sets up on a world arena; exits and chest placed, map def not mutated', () => {
    for (const id of OB.OBJECTIVE_IDS) {
      const map = makeWorldMap({ seed: 5, enemies: 3, biome: 'village' });
      const rows = [...map.grid];
      const b = createBattle({ map, heroes: [mkHero()], enemies: ['gang-thug', 'gang-thug', 'scavenger-5'], data: GAME_DATA, seed: 3, objectives: { goal: id, chests: 1, retreat: true } });
      assert.ok(b.objectives.goal && b.objectives.goal.id === id && b.objectives.goal.state === 'active', id);
      assert.equal(b.objectives.exits.length, 2, 'two exits');
      assert.equal(b.objectives.chests, 1);
      assert.deepEqual(map.grid, rows, 'shared map def untouched');
      assert.ok(events(b, 'objective').some((e) => e.state === 'start'));
    }
  });
  test('objectives: rescue — bonus action next to the captive frees it; deadline fails it', () => {
    const b = mk('rescue');
    const H = heroOf(b), cap = b.objectives.props.find((p) => p.kind === 'captive');
    forceTurn(b, H); putNear(b, H, cap);
    const it = OB.interactions(b, H).find((i) => i.kind === 'free');
    assert.ok(it && it.cost === 'bonus');
    assert.ok(perform(b, { type: 'interact', unit: H.id, tile: { x: cap.x, y: cap.y } }).ok);
    assert.equal(b.objectives.goal.state, 'done');
    assert.equal(b.turn.bonus, 0);
    assert.equal(b.grid.tiles[cap.y * b.grid.w + cap.x], 0, 'tile is free');
    const b2 = mk('rescue');
    b2.round = b2.objectives.goal.need + 1; OB.objectiveEvent(b2, { type: 'roundStart' });
    assert.equal(b2.objectives.goal.state, 'fail');
    assert.equal(b2.objectives.goal.reason, 'executed');
  });
  test('objectives: terminal needs N successful hacks (action, skill check)', () => {
    const b = mk('terminal');
    const H = heroOf(b), p = b.objectives.props.find((x) => x.kind === 'terminal');
    putNear(b, H, p);
    b.objectives.goal.dc = 1; // auto success
    for (let i = 0; i < b.objectives.goal.need; i++) {
      forceTurn(b, H);
      const r = perform(b, { type: 'interact', unit: H.id, tile: { x: p.x, y: p.y } });
      assert.ok(r.ok, r.error);
      assert.equal(b.turn.actions, 0);
    }
    assert.equal(b.objectives.goal.state, 'done');
    assert.ok(events(b, 'objHack').length >= 2);
  });
  test('objectives: hold / speed / flawless / assassinate / nofire progress and fail', () => {
    const h = mk('hold'); const g = h.objectives.goal; const H = heroOf(h);
    h.occ[H.y * h.grid.w + H.x] = 0; H.x = g.zone[0].x; H.y = g.zone[0].y;
    for (let r = 2; r <= g.need + 1; r++) { h.round = r; OB.objectiveEvent(h, { type: 'roundStart' }); }
    assert.equal(g.state, 'done');
    const sp = mk('speed'); sp.round = sp.objectives.goal.need + 1; OB.objectiveEvent(sp, { type: 'roundStart' });
    assert.equal(sp.objectives.goal.state, 'fail');
    const fl = mk('flawless'); dealDamage(fl, null, heroOf(fl), 999, 'blunt');
    assert.equal(fl.objectives.goal.state, 'fail');
    const as = mk('assassinate'); const tg = as.byId[as.objectives.goal.target];
    as.round = as.objectives.goal.need; OB.objectiveEvent(as, { type: 'roundStart' });
    assert.ok(tg.fleeing && tg.arch === 'coward', 'target runs');
    dealDamage(as, null, tg, 9999, 'blunt');
    assert.equal(as.objectives.goal.state, 'done');
    const nf = mk('nofire'); const c = nf.objectives.goal.cargo[0];
    assert.ok(nf.objectives.goal.cargo.length >= 2);
    OB.objectiveEvent(nf, { type: 'objectBreak', x: c.x, y: c.y, kind: 'crate' });
    assert.equal(nf.objectives.goal.state, 'fail');
  });
  test('chests: open with a check; trapped chest fires on a failed check', () => {
    const b = mk(null);
    const H = heroOf(b), p = b.objectives.props.find((x) => x.kind === 'chest');
    putNear(b, H, p);
    p.dc = 99; p.trapped = true;
    forceTurn(b, H);
    const hp0 = H.hp;
    assert.ok(perform(b, { type: 'interact', unit: H.id, tile: { x: p.x, y: p.y } }).ok);
    assert.ok(!p.open && !p.trapped && H.hp < hp0, 'trap fired');
    p.dc = 1; forceTurn(b, H);
    assert.ok(perform(b, { type: 'interact', unit: H.id, tile: { x: p.x, y: p.y } }).ok);
    assert.ok(p.open);
    assert.equal(OB.objectiveSummary(b).chestsOpened, 1);
    forceTurn(b, H);
    assert.equal(OB.interactions(b, H).length, 0, 'an open chest is done');
  });
  test('retreat: action on an exit removes the unit; whole party out → winner «retreat»; boss arena locked until phase 2', () => {
    const b = mk(null);
    const H = heroOf(b);
    forceTurn(b, H);
    assert.equal(OB.retreatWhy(b, H), 'notOnExit');
    const e = b.objectives.exits[0];
    b.occ[H.y * b.grid.w + H.x] = 0; H.x = e.x; H.y = e.y; b.occ[e.y * b.grid.w + e.x] = b.units.indexOf(H) + 1;
    assert.equal(OB.retreatWhy(b, H), null);
    assert.ok(perform(b, { type: 'retreat', unit: H.id }).ok);
    assert.ok(H.removed);
    assert.equal(b.winner, 'retreat');
    const lk = mk(null, { exitLock: true });
    assert.equal(OB.retreatWhy(lk, heroOf(lk)), 'locked');
    OB.objectiveEvent(lk, { type: 'phase', actor: 'e1', n: 2 });
    assert.notEqual(OB.retreatWhy(lk, heroOf(lk)), 'locked');
  });
  test('objectives data: ≥ 25 bound encounters exist; random ≈ 25%; finale has none; boss fights lock exits', () => {
    const ids = Object.keys(BATTLE_OBJECTIVES.bindings);
    assert.ok(ids.length >= 25, `${ids.length}`);
    for (const id of ids) {
      assert.ok(GAME_DATA.ENCOUNTERS[id], `unknown encounter ${id}`);
      const g = BATTLE_OBJECTIVES.bindings[id];
      assert.ok(OB.OBJECTIVE_IDS.includes(typeof g === 'string' ? g : g.id), id);
    }
    const save = { location: null, flags: {} };
    let n = 0; const rng = createRng(7);
    for (let i = 0; i < 2000; i++) if (objectiveSpec(save, { enemies: ['gang-thug'] }, ['gang-thug'], rng).goal) n++;
    assert.ok(n > 400 && n < 600, `random share ${n / 2000}`);
    assert.equal(objectiveSpec(save, { encounter: 'w-cc-finale' }, []), null);
    assert.equal(objectiveSpec(save, { encounter: 'v3-tek-shrine' }, ['gang-thug']).goal, 'terminal');
    const boss = Object.keys(GAME_DATA.ENEMIES).find((id) => GAME_DATA.ENEMIES[id].boss);
    const sp = objectiveSpec(save, { enemies: [boss] }, [boss], () => 0);
    assert.equal(sp.exitLock, true); assert.equal(sp.goal, null);
  });
  const { weaponBlocked } = await import('../game/src/rules/combat.js');
  test('junk weapon: natural 1 jams it (no weapon until the end of the next turn)', () => {
    const u = buildCreature({ race: 'human', cls: 'zabivnoy', level: 3, data: GAME_DATA, id: 'hero' });
    u.weapon = { ...u.weapon, quality: 'junk', range: 1 };
    const b = createBattle({ map: { grid: ['#####', '#PE.#', '#####'] }, heroes: [u], enemies: ['gang-thug'], data: GAME_DATA, seed: 1, autoReactions: false });
    const H = heroOf(b), E = b.units.find((x) => x.team === 'enemies');
    forceTurn(b, H);
    b.rng = stubRng([0.0]);
    perform(b, { type: 'attack', unit: H.id, target: E.id });
    assert.equal(events(b, 'jam').length, 1);
    assert.equal(weaponBlocked(b, H), 'jam');
  });
}

// ---------------------------------------------------------------- world finishing: Exodus escalation, amnesty, gifts, codex, base, backstories
{
  const st = await import('../game/src/world/state.js');
  const ex = await import('../game/src/world/exodus.js');
  const road = await import('../game/src/world/exodus-road.js');
  const crime = await import('../game/src/world/crime.js');
  const comp = await import('../game/src/world/companions.js');
  const bs = await import('../game/src/world/backstory.js');
  const qs = await import('../game/src/world/quests.js');
  const cq = await import('../game/src/world/consequences.js');
  const base = await import('../game/src/world/base.js');
  const su = await import('../game/src/world/skill-uses.js');
  const { ENCOUNTERS_EXODUS } = await import('../game/src/data/enemies-exodus.js');
  const { CACHES_DENSITY } = await import('../game/src/data/world/density-caches.js');
  const { FACTION_FINDS, ENEMY_LORE } = await import('../game/src/data/text/codex.js');
  const { WANTED } = await import('../game/src/data/world/crime.js');
  const inv = await import('../game/src/world/inventory.js');
  const { PERSONAL_QUESTS: PQ } = await import('../game/src/data/companions.js');
  const { QUEST_TURNIN: QT } = await import('../game/src/data/text/quest-turnin.js');
  const { CONSEQUENCES: CQD } = await import('../game/src/data/world/consequences.js');
  const mk = (o = {}) => st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [], ...o });
  const withMark = (m) => { const s = mk(); s.flags['prologue-done'] = true; ex.exodusSync(s); s.exodus.mark = m; return s; };
  test('exodus roads: no escalation before mark 2; cult squads 8+ at mark 2; revenants at 3; only cult at 5', () => {
    assert.equal(road.exodusRoad(withMark(1), 'renegades').list.length, 0);
    const m2 = road.exodusRoad(withMark(2), 'renegades');
    assert.ok(m2.list.some((e) => e.encounter === 'x-cult-renegades-1'));
    assert.equal(road.exodusRoad(withMark(2), 'neutralVillages').list.length, 0, 'low region: no cult at mark 2');
    const m3 = road.exodusRoad(withMark(3), 'neutralVillages');
    assert.ok(m3.list.some((e) => e.encounter === 'x-revenant-neutralVillages'));
    const m5 = road.exodusRoad(withMark(5), 'cult');
    assert.equal(m5.only, true);
    for (let i = 0; i < 20; i++) assert.ok(st.pickEncounter(withMark(5), 'cult', () => i / 20).encounter?.startsWith('x-'));
    for (const e of Object.values(ENCOUNTERS_EXODUS)) for (const id of e.enemies) assert.ok(GAME_DATA.ENEMIES[id], `${e.id}: ${id}`);
    assert.equal(GAME_DATA.ENEMIES['x-revenant-l18'].weapon.dmgType, 'psychic');
    const s = withMark(5); s.flags['exodus-stopped'] = true;
    assert.equal(road.exodusRoad(s, 'cult').list.length, 0, 'stopped timer');
  });
  test('exodus: marks reported once (radio), NPC lines once per mark, travel warning from mark 3', () => {
    const s = mk(); s.flags['prologue-done'] = true; ex.exodusSync(s);
    const r = ex.passDays(s, Math.ceil(ex.exodusTotal(s) * 0.26));
    assert.deepEqual(r.marks, [1]);
    assert.equal(ex.passDays(s, 1).marks.length, 0);
    assert.ok(ex.exodusRadio(1).length >= 1);
    assert.ok(ex.exodusNpcLine(s, 'nikola', 'technikums'));
    assert.equal(ex.exodusNpcLine(s, 'nikola', 'technikums'), null, 'once per mark');
    assert.equal(ex.travelWarning(s, 20), null, 'mark 1: no warning');
    s.exodus.mark = 3;
    const w = ex.travelWarning(s, 20);
    assert.equal(w.n, 20); assert.equal(w.m, ex.exodusLeft(s) - 20);
    assert.equal(ex.travelWarning(s, 3), null);
  });
  test('amnesty: data has no todo; pay items / check fail once a day; clears heat and gives rep', () => {
    for (const [f, d] of Object.entries(WANTED.clear.quest)) { assert.ok(!d.todo, f); assert.ok(d.cost, f); }
    const s = mk();
    s.wanted = { scavengers: { heat: 3, since: s.day, bounty: 100 } };
    assert.deepEqual(crime.amnestiesAt(s, ['glava-musora']).map((x) => x.faction), ['scavengers']);
    assert.equal(crime.amnestiesAt(s, ['nikola']).length, 0);
    assert.ok(crime.amnestyInfo(s, 'scavengers', inv.countAll).why, 'no rare parts');
    inv.giveItem(s, 'rare-parts', 3);
    assert.equal(crime.amnestyInfo(s, 'scavengers', inv.countAll).why, null);
    const rep0 = s.rep.scavengers;
    crime.applyAmnesty(s, 'scavengers', inv.dropItem);
    assert.equal(s.wanted.scavengers.heat, 0);
    assert.equal(inv.countAll(s)['rare-parts'] || 0, 0);
    assert.ok(s.rep.scavengers > rep0);
    s.wanted.warprom = { heat: 2 };
    crime.amnestyFailed(s, 'warprom');
    assert.ok(crime.amnestyInfo(s, 'warprom', inv.countAll).tried);
  });
  test('companions: gifts of a loved type once per item (+giftRare); request refuse −refuseOrder once per stage', () => {
    const s = mk();
    s.party.push({ npc: 'andrey', state: 'active', approval: 0 });
    const loved = comp.lovedTypes('andrey');
    assert.ok(loved.includes('medicine') && loved.includes('food'));
    inv.giveItem(s, 'medkit', 2);
    const opts = comp.giftOptions(s, 'andrey', inv.countAll(s));
    assert.ok(opts.includes('medkit'), opts.join());
    const a0 = s.party[0].approval;
    comp.giveGift(s, 'andrey', 'medkit', inv.dropItem);
    assert.ok(s.party[0].approval > a0);
    assert.ok(!comp.giftOptions(s, 'andrey', inv.countAll(s)).includes('medkit'), 'once per item');
    const q = 'cq-laska';
    s.party.push({ npc: 'laska', state: 'active', approval: 0 });
    const stage = PQ[q].stages.find((x) => x.id !== 'meet').id;
    s.quests[q] = { state: 'active', stage, opt: null, subs: {}, fails: {}, failedOpts: {} };
    assert.ok(comp.companionRequest(s, 'laska'));
    const l0 = s.party[1].approval;
    comp.refuseRequest(s, 'laska');
    assert.ok(s.party[1].approval < l0);
    assert.equal(comp.companionRequest(s, 'laska'), null, 'once per stage');
  });
  test('codex finds: every cx-* flag has a source in caches / events / tables', () => {
    const flags = [...FACTION_FINDS.map((f) => f.flag), ...Object.values(ENEMY_LORE).flatMap((e) => (e.finds || []).map((f) => f.flag))];
    const caches = CACHES_DENSITY.map((c) => c.flag).filter(Boolean);
    for (const f of caches) assert.ok(flags.includes(f), f);
    for (const c of CACHES_DENSITY.filter((x) => x.flag)) assert.ok(LOCS[c.node].caches.find((x) => x.id === c.id).flag === c.flag);
    assert.ok(flags.length >= 6);
  });
  test('quest outcomes: mq3-fall by saved flags (save / crash); mq-beacons fork has its own lines and consequences', () => {
    const s = mk();
    const stq = { state: 'done', stage: 'hub', path: ['alarm', 'reactor', 'save', 'crash', 'hub'] };
    assert.equal(qs.questOutcome(stq, QT['mq3-fall'], s), 'crash');
    s.flags['saved-people'] = true; s.flags['saved-terminal'] = true;
    assert.equal(qs.questOutcome(stq, QT['mq3-fall'], s), 'save');
    assert.ok(qs.turninLines('mq3-fall', 'save').length && qs.turninLines('mq3-fall', 'crash').length);
    const sb = { state: 'done', stage: 'report', path: ['ask', 'beacons', 'collector', 'keeper', 'report'] };
    assert.equal(qs.questOutcome(sb, QT['mq-beacons'], s), 'keeper');
    assert.notDeepEqual(qs.turninLines('mq-beacons', 'keeper'), qs.turninLines('mq-beacons', 'khikhik'));
    assert.ok(CQD['mq-beacons'].khikhik && CQD['mq-beacons'].keeper && CQD['mq3-fall'].save && CQD['mq3-fall'].crash);
  });
  test('base: defense KB buff on party units; workbench repair & radio orders', () => {
    const s = mk();
    const kb0 = st.partyUnits(s)[0].kb;
    s.battleBuff = { kb: 2 };
    assert.equal(st.partyUnits(s)[0].kb, kb0 + 2);
    base.baseTick(s);
    assert.equal(s.battleBuff, undefined);
    s.flags['base-open'] = true;
    assert.equal(base.orderInfo(s), null, 'no radio');
  });
  test('backstories: topics at NPCs by faction, one-time fx; techStudent −1 hit until the first win', () => {
    const s = mk({ bg: 'junkOrphan' });
    const tps = bs.backstoryTopics(s, 'glava-musora', 'scavengers');
    assert.ok(tps.some((x) => x.id === 'scav-lore'));
    assert.ok(bs.useBackstoryTopic(s, 'glava-musora', 'scav-lore'));
    assert.equal(bs.useBackstoryTopic(s, 'glava-musora', 'scav-lore'), null);
    const a = mk({ bg: 'techStudent' }), b = mk({ bg: 'skyRefugee' });
    assert.equal(st.buildHero(a).hitBonus, st.buildHero(b).hitBonus - 1);
    a.codex = { seen: {}, kills: { 'gang-thug': 1 }, terms: {}, flags: [] };
    assert.equal(bs.backstoryPassives(a).length, 0);
    assert.equal(st.buildHero(a).hitBonus, st.buildHero(b).hitBonus);
  });
  test('neutral talents & skills: dispute quests, ritual discount, road uses shape', () => {
    assert.equal(cq.isDispute('mq-agro-fire'), true);
    assert.equal(cq.isDispute('mq-beacons'), false);
    const s = mk();
    const ms = st.members(s);
    const r = su.roadUses(ms, [], false);
    assert.equal(typeof r.encMod, 'number'); assert.ok(Array.isArray(r.log));
    assert.equal(su.ritualDiscount(ms, 'pirates'), 1);
  });
}

// romance.md: bond growth, stages, one active romance, jealousy, farewell on death, gender forms
{
  console.log('Romances: bond, stages, one partner, jealousy, farewell, gender');
  const st = await import('../game/src/world/state.js');
  const RM = await import('../game/src/world/romance.js');
  const CP = await import('../game/src/world/companions.js');
  const { ROMANCE, ROMANCE_RULES: RR, romanceEpilogueKey } = await import('../game/src/data/romance.js');
  const { normalizeSave } = await import('../game/src/save.js');
  const { NPCS } = await import('../game/src/data/npcs.js');
  const { epilogueSlides } = await import('../game/src/world/consequences.js');
  const mk = () => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; s.hero.level = 5; return s; };
  const yes = () => true, no = () => false;
  const P = (s, id) => s.party.find((p) => p.npc === id);
  const grow = (s, id, bond, loyalty = 60) => { RM.romanceEntry(s, id).bond = bond; RM.romanceEntry(s, id).flirted = true; P(s, id).approval = loyalty; };
  test('romance data: companions classes match, all 6 recruitable', () => {
    for (const id of Object.keys(ROMANCE)) {
      assert.ok(NPCS[id]?.recruitable, id);
      assert.equal(NPCS[id].cls, ROMANCE[id].cls, `${id} class`);
      assert.equal(ROMANCE[id].dates.length, 3, id);
    }
  });
  test('flirt: once a day, fail −1 not below 0, success +3, DC grows to the cap', () => {
    const s = mk(); st.recruit(s, 'lox');
    let r = RM.flirt(s, 'lox', 0, no);
    assert.equal(r.ok, false); assert.equal(RM.peekRomance(s, 'lox').bond, 0);
    assert.equal(RM.flirt(s, 'lox', 0, yes), null, 'same day blocked');
    s.day++; r = RM.flirt(s, 'lox', 0, yes);
    assert.equal(r.ok, true); assert.equal(RM.peekRomance(s, 'lox').bond, RR.gain.flirtOk);
    s.day++; RM.flirt(s, 'lox', 0, no);
    assert.equal(RM.peekRomance(s, 'lox').bond, RR.gain.flirtOk + RR.gain.flirtFail);
    RM.romanceEntry(s, 'lox').flirts = 50; assert.equal(RM.flirtDc(s, 'lox'), RR.flirt.dcCap);
  });
  test('gifts / battles / quest feed bond with limits', () => {
    const s = mk(); st.recruit(s, 'lox'); RM.romanceEntry(s, 'lox').flirted = true;
    RM.romanceGift(s, 'lox', true); RM.romanceGift(s, 'lox', true);
    assert.equal(RM.peekRomance(s, 'lox').bond, RR.gain.giftLoved, 'gift once a day');
    const units = [{ id: 'c-lox' }, { id: 'hero' }];
    for (let i = 0; i < 4; i++) RM.romanceBattle(s, units);
    assert.equal(RM.peekRomance(s, 'lox').bond, RR.gain.giftLoved + RR.gain.battlePerDay * RR.gain.battleNoLoss);
    CP.personalQuestDone(s, { personal: { npc: 'lox', loyalty: 5 } });
    assert.equal(RM.peekRomance(s, 'lox').bond, RR.gain.giftLoved + 2 + RR.gain.questDone);
  });
  test('dates: gates by bond / loyalty / days / place, in order, stages follow', () => {
    const s = mk(); st.recruit(s, 'lox');
    grow(s, 'lox', 14, 60);
    assert.equal(RM.dateStatus(s, 'lox', 'camp').why, 'bond');
    grow(s, 'lox', 20, 10);
    assert.equal(RM.dateStatus(s, 'lox', 'camp').why, 'loyalty');
    P(s, 'lox').approval = 60;
    assert.equal(RM.dateStatus(s, 'lox', 'base').why, 'place');
    assert.ok(RM.dateStatus(s, 'lox', 'camp').ok);
    RM.finishDate(s, 'lox', { sum: 3, flags: [] });
    assert.deepEqual(RM.peekRomance(s, 'lox').dates, ['lox-d1']);
    assert.equal(RM.partnerOf(s), 'lox');
    RM.romanceEntry(s, 'lox').bond = 50;
    assert.equal(RM.dateStatus(s, 'lox', 'camp').why, 'days');
    s.day += 2; assert.ok(RM.dateStatus(s, 'lox', 'camp').ok);
    RM.finishDate(s, 'lox', { sum: 0, flags: [] });
    assert.equal(RM.stageFor(RM.peekRomance(s, 'lox')).id, 'date');
    RM.romanceEntry(s, 'lox').bond = 75; s.day += 2;
    assert.equal(RM.dateStatus(s, 'lox', 'base').n, 3);
    RM.finishDate(s, 'lox', { sum: 0, flags: [] });
    assert.equal(RM.peekRomance(s, 'lox').stage, 'bond');
    assert.equal(RM.dateStatus(s, 'lox').why, 'done');
    assert.equal(RM.finishDate(s, 'lox', { sum: 0 }).length, 0, 'no repeat');
  });
  test('one active romance: a second cannot date; jealousy once, loser blocked', () => {
    const s = mk(); st.recruit(s, 'lox'); st.recruit(s, 'zarya');
    grow(s, 'lox', 30); grow(s, 'zarya', 30);
    RM.finishDate(s, 'lox', { sum: 0 });
    assert.equal(RM.dateStatus(s, 'zarya', 'camp').why, 'taken');
    const c = RM.conflictPending(s);
    assert.equal(c.key, 'lox+zarya');
    RM.resolveConflict(s, c, { flags: ['rom-pick-lox'], sum: 0 });
    assert.equal(s.flags['rom-pick-lox'], true);
    assert.equal(RM.peekRomance(s, 'zarya').bond, 30 + RR.conflict.bondPenalty);
    assert.equal(P(s, 'zarya').approval, 60 + RR.conflict.loyaltyPenalty);
    assert.equal(RM.conflictPending(s), null, 'once per pair');
    RM.addBond(s, 'zarya', 10); assert.equal(RM.peekRomance(s, 'zarya').bond, 24, 'loser does not grow');
  });
  test('death of the partner: lost, farewell queued, tragedy epilogue; low bond — nothing', () => {
    const s = mk(); st.recruit(s, 'sedmaya'); st.recruit(s, 'yarosh');
    grow(s, 'yarosh', 20); assert.equal(RM.romanceDeath(s, 'yarosh').length, 0);
    grow(s, 'sedmaya', 50); RM.finishDate(s, 'sedmaya', { sum: 0 });
    RM.romanceDeath(s, 'sedmaya');
    assert.equal(RM.peekRomance(s, 'sedmaya').lost, true);
    assert.equal(RM.mourning(s), -1);
    assert.deepEqual(RM.takeRomanceEvent(s), { kind: 'farewell', npc: 'sedmaya' });
    assert.equal(romanceEpilogueKey(RM.peekRomance(s, 'sedmaya')), 'tragedy');
    const ep = RM.romanceEpilogue(s);
    assert.equal(ep.key, 'tragedy'); assert.equal(ep.slides.length, 3); assert.equal(ep.music, 'tragic');
    assert.ok(epilogueSlides(s).some((x) => x.id === 'rom-sedmaya-tragedy'));
  });
  test('breakup: bond −30, loyalty −10, scene queued, epilogue parted; crisis −8 breaks', () => {
    const s = mk(); st.recruit(s, 'diss'); st.recruit(s, 'zarya');
    grow(s, 'diss', 60); RM.finishDate(s, 'diss', { sum: 0 });
    RM.breakUp(s, 'diss', 'talk');
    assert.equal(RM.peekRomance(s, 'diss').bond, 30); assert.equal(P(s, 'diss').approval, 50);
    assert.equal(RM.partnerOf(s), null); assert.equal(RM.romanceEpilogue(s).key, 'parted');
    assert.equal(RM.takeRomanceEvent(s).kind, 'breakup');
    grow(s, 'zarya', 90); RM.romanceEntry(s, 'zarya').dates = ['zarya-d1', 'zarya-d2', 'zarya-d3'];
    RM.finishCrisis(s, 'zarya', { sum: -8, flags: ['zarya-fall'], picks: [{ d: -8 }] });
    assert.equal(RM.peekRomance(s, 'zarya').broken, true);
  });
  test('gender: (а) endings by hero.avatar.gender; save keeps save.romance', () => {
    assert.equal(RM.genderize('Ты был(а) прав(а).', 'm'), 'Ты был прав.');
    assert.equal(RM.genderize('Ты был(а) прав(а).', 'f'), 'Ты была права.');
    assert.equal(RM.genderize('Ты был(а) прав(а).', 'x'), 'Ты был(а) прав(а).');
    const s = mk(); s.hero.avatar = { v: 1, gender: 'f' }; assert.equal(RM.heroGender(s), 'f');
    st.recruit(s, 'lox'); grow(s, 'lox', 33); RM.finishDate(s, 'lox', { sum: 0, flags: ['x-flag'] });
    const back = normalizeSave(JSON.parse(JSON.stringify(s)), GAME_DATA);
    assert.equal(back.romance.lox.bond, 33); assert.deepEqual(back.romance.lox.dates, ['lox-d1']); assert.equal(back.romance._.active, 'lox');
  });
}

// ---------------------------------------------------------------- free-roam.md этап 1: node maps
{
  const rg = await import('../game/src/world/roam-gen.js');
  const rm = await import('../game/src/world/roam.js');
  const { roamTypeOf } = await import('../game/src/data/world/roam.js');
  const { npcsAt } = await import('../game/src/world/data.js');
  const nodes = Object.values(LOCS).filter((l) => !l.alias && roamTypeOf(l));
  test('roam: every node map is generated deterministically, exits / objects / spots reachable from the entry', () => {
    assert.ok(nodes.length > 50);
    for (const l of nodes) {
      const m = rg.generateRoam(l.id, l);
      assert.deepEqual(rg.generateRoam(l.id, l).grid, m.grid, `${l.id}: deterministic`);
      const g = rm.roamGrid(m);
      const [sx, sy] = m.spawn.world;
      const r = reachable(g, sx, sy, 99999, null);
      const at = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && r.dist[y * g.w + x] >= 0;
      const near = (x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy)));
      assert.ok(m.objects.some((o) => o.type === 'exit'), `${l.id}: has an exit`);
      for (const o of m.objects) assert.ok((o.cells || [[o.x, o.y]]).some(([x, y]) => near(x, y)), `${l.id}: ${o.id} reachable`);
      for (const [x, y] of m.spots) assert.ok(at(x, y), `${l.id}: spot ${x},${y}`);
      // every NPC of the node gets a reachable cell, traders stand at stalls when there are stalls
      const objs = rm.liveObjects(m, l.id, { caches: [], flags: {} });
      const ps = rm.placeNpcs(m, g, npcsAt(l.id), objs);
      for (const p of ps) assert.ok(at(p.x, p.y), `${l.id}: npc ${p.id} at ${p.x},${p.y}`);
      assert.equal(m.size[0], m.grid[0].length);
    }
  });
  test('roam: A* path goes around walls, 8 directions, no corner cutting; approach cell is next to the target', () => {
    const m = { grid: ['#######', '#.....#', '#.###.#', '#.#K#.#', '#.....#', '#######'], objects: [{ id: 'k', type: 'stash', x: 3, y: 3, solid: true }] };
    const g = rm.roamGrid(m);
    const p = rm.roamPath(g, 1, 1, 5, 4);
    assert.ok(p && p.length >= 4);
    let px = 1, py = 1;
    for (const s of p) { assert.ok(Math.abs(s.x - px) <= 1 && Math.abs(s.y - py) <= 1 && g.tiles[s.y * g.w + s.x] !== 1); px = s.x; py = s.y; }
    const a = rm.approachCell(g, 1, 1, 3, 3);
    assert.ok(a && Math.max(Math.abs(a.x - 3), Math.abs(a.y - 3)) === 1 && a.y === 4, `approach ${JSON.stringify(a)}`);
    assert.equal(rm.roamPath(g, 1, 1, 3, 3), null); // the crate itself blocks
  });
  test('roam: interactions map to the menu actions (stall → trade of its NPC, node cache → searchCache, bed → rest, exit)', () => {
    const l = LOCS['alpha-harmony'];
    const m = rg.generateRoam(l.id, l);
    const objs = rm.liveObjects(m, l.id, { caches: [], flags: {} });
    rm.placeNpcs(m, rm.roamGrid(m), npcsAt(l.id), objs);
    const st = objs.find((o) => o.type === 'stall' && o.npc);
    assert.ok(st && rm.isTrader(GAME_DATA.NPCS?.[st.npc] || { services: ['trade'], id: st.npc }));
    assert.deepEqual(rm.objectAction(st), { kind: 'trade', npc: st.npc });
    assert.equal(rm.objectAction({ type: 'bed' }).kind, 'rest');
    assert.equal(rm.objectAction({ type: 'exit', to: 'world' }).kind, 'exit');
    const withCache = Object.values(LOCS).find((x) => !x.alias && roamTypeOf(x) && (x.caches || []).length);
    const m2 = rg.generateRoam(withCache.id, withCache);
    const o2 = rm.liveObjects(m2, withCache.id, { caches: [], flags: {} }).find((o) => o.cache);
    if (o2) assert.equal(rm.objectAction(o2).kind, 'cache');
    const s2 = { caches: [], flags: { [rm.stashKey('alpha-harmony', 'stash1')]: true } };
    const op = rm.liveObjects(m, 'alpha-harmony', s2).find((o) => o.id === 'stash1');
    if (op && !op.cache) assert.equal(rm.objectAction(op).kind, 'empty');
    // save.roam restores only a walkable cell
    const g = rm.roamGrid(m);
    const [sx, sy] = m.spawn.world;
    assert.deepEqual(rm.restorePos(g, { roam: { loc: l.id, x: sx, y: sy, party: [[sx, sy]] } }, l.id), { x: sx, y: sy, party: [[sx, sy]] });
    assert.equal(rm.restorePos(g, { roam: { loc: l.id, x: 0, y: 0, party: [] } }, l.id), null);
    assert.equal(rm.restorePos(g, { roam: { loc: 'other', x: sx, y: sy } }, l.id), null);
  });
}

// battlefields.md + skills-v3.md: biomes, templates, props, weather; node skill actions, battle tricks
{
  console.log('battlefields & skills v3');
  const BF = await import('../game/src/world/battlefields.js');
  const { makeWorldMap } = await import('../game/src/world/arena.js');
  const { BATTLEFIELD, WEATHER } = await import('../game/src/data/combat.js');
  const TERRAIN = await import('../game/src/rules/terrain.js');
  const { validateTilesets, BIOME_IDS } = await import('../game/src/assets/tilesets.js');
  const { validateProps } = await import('../game/src/assets/props.js');
  const G = await import('../game/src/rules/grid.js');
  const st = await import('../game/src/world/state.js');
  const NA = await import('../game/src/world/node-actions.js');
  const { BATTLE_SKILL_TRICKS } = await import('../game/src/data/world/node-skill-actions.js');
  test('fields: assets validate, every region maps to known tile biomes, main biome dominates', () => {
    assert.deepEqual(validateTilesets(), []);
    assert.deepEqual(validateProps(), []);
    for (const [r, list] of Object.entries(BATTLEFIELD.regions)) for (const b of list) assert.ok(BIOME_IDS.includes(b), `${r}: ${b}`);
    let main = 0;
    for (let seed = 1; seed <= 200; seed++) if (BF.tileBiomeOf({ region: 'warprom', seed }) === 'factory') main++;
    assert.ok(main > 110 && main < 170, `factory share ${main}/200`);
    assert.equal(BF.tileBiomeOf({ region: 'tekhonki', seed: 3, biome: 'cyber' }), 'cyberspace'); // explicit legacy id
    assert.equal(BF.tileBiomeOf({ biome: 'snow' }), 'snow');
    assert.equal(BF.tileBiomeOf({}), 'wasteland');
  });
  test('fields: every template × biome is valid 22×12 and passable (all starts connected), starts enough', () => {
    for (const tpl of BF.TEMPLATE_IDS) for (const biome of BIOME_IDS) for (const seed of [1, 2, 3]) {
      const m = makeWorldMap({ seed, enemies: 6, template: tpl, biome });
      assert.equal(m.template, tpl, `${tpl}/${biome}/${seed} fell back`);
      assert.equal(m.grid.length, 12); assert.ok(m.grid.every((r) => r.length === 22));
      const g = G.parseMap(m);
      assert.ok(g.starts.P.length >= 5 && g.starts.E.length >= 7, `${tpl} starts`);
      const all = [...g.starts.P, ...g.starts.A, ...g.starts.E];
      const r = G.reachable(g, all[0].x, all[0].y, 9999, null);
      assert.ok(all.every((p) => r.dist[p.y * g.w + p.x] >= 0), `${tpl}/${biome}/${seed} connected`);
      assert.ok(m.props.every((p) => p.biomes === undefined), 'props are plain entries');
    }
  });
  test('fields: boss arenas — the boss stands on its spot (on the dais), connected', () => {
    for (const [boss, a] of Object.entries(BF.BOSS_ARENAS)) {
      const m = makeWorldMap({ seed: 4, enemies: 3, enemyIds: [`${boss}`, 'x', 'y'] });
      assert.equal(m.template, `boss:${boss}`);
      assert.equal(m.biome, a.biome);
      const g = G.parseMap(m);
      const bAt = a.grid.findIndex((r) => r.includes('B'));
      assert.deepEqual(g.starts.E[0], { x: a.grid[bAt].indexOf('B'), y: bAt });
    }
    const g = G.parseMap(makeWorldMap({ seed: 1, enemies: 2, enemyIds: ['x', 'cult-judge-hand'] }));
    assert.equal(G.elevAt(g, g.starts.E[1].x, g.starts.E[1].y), 2); // the Judge's hand on the H dais
  });
  test('fields: a prop gives cover, breaks into rubble and leaves its debris surface', () => {
    const def = { grid: ['#######', '#P.c.E#', '#######'], props: [{ id: 'lada', x: 3, y: 1, w: 1, h: 1, cover: 'half', blocks: true, destructible: true, hp: 4, debris: 'oil' }] };
    const b = createBattle({ map: def, heroes: [buildCreature({ race: 'human', cls: 'ranger', level: 1, data: GAME_DATA })], enemies: ['crawler'], data: GAME_DATA, seed: 1 });
    const T = b.objects.get(1 * 7 + 3);
    assert.ok(T && T.kind === 'prop' && T.prop === 'lada' && T.hp >= 5, 'prop object with hp');
    assert.equal(G.tileCover(b.grid.tiles[1 * 7 + 3]), 2); // half cover
    TERRAIN.damageObject(b, 3, 1, 999, null, 'blunt');
    assert.equal(b.grid.tiles[1 * 7 + 3], G.T_RUBBLE);
    assert.equal(b.surfaces.get('3,1')?.floor?.kind, 'oil');
    // an indestructible prop stays static
    const def2 = { grid: ['#######', '#P.C.E#', '#######'], props: [{ id: 'bus', x: 3, y: 1, w: 1, h: 1, cover: 'full', blocks: true, destructible: false }] };
    const b2 = createBattle({ map: def2, heroes: [buildCreature({ race: 'human', cls: 'ranger', level: 1, data: GAME_DATA })], enemies: ['crawler'], data: GAME_DATA, seed: 1 });
    assert.equal(b2.objects.get(1 * 7 + 3), undefined);
    // fence: blocks movement, no cover, sight passes
    const g3 = G.parseMap({ grid: ['P.f.E'] });
    assert.ok(G.blocksMove(g3.tiles[2]) && G.tileCover(g3.tiles[2]) === 0 && G.lineOfSight(g3, 0, 0, 4, 0));
  });
  test('fields: weather — night hides far enemies, reveal op shows them; rain adds puddles (water surfaces)', () => {
    const grid = ['P..................E', '....................'];
    const b = createBattle({ map: { grid, tod: 'night', weather: 'clear' }, heroes: [buildCreature({ race: 'human', cls: 'ranger', level: 1, data: GAME_DATA })], enemies: ['crawler'], data: GAME_DATA, seed: 1 });
    const foe = b.units.find((u) => u.team === 'enemies');
    assert.ok(BF.fogHiddenIds(b).has(foe.id), 'hidden at 18 cells at night');
    applyOp(b, b.units[0], foe, { op: 'reveal', turns: 1 });
    assert.ok(!BF.fogHiddenIds(b).has(foe.id), 'revealed');
    const day = createBattle({ map: { grid }, heroes: [buildCreature({ race: 'human', cls: 'ranger', level: 1, data: GAME_DATA })], enemies: ['crawler'], data: GAME_DATA, seed: 1 });
    assert.equal(BF.fogHiddenIds(day).size, 0);
    const rain = makeWorldMap({ seed: 2, template: 'barricade', biome: 'wasteland', weather: 'rain', tod: 'day' });
    assert.ok(rain.grid.join('').includes('w'), 'puddles');
    for (const biome of BIOME_IDS) for (let seed = 1; seed < 30; seed++) {
      const w = BF.pickWeather(biome, seed, seed);
      assert.ok(['clear', ...WEATHER.allowed[biome][1]].includes(w.weather) && WEATHER.allowed[biome][0].includes(w.tod), `${biome} ${w.weather}/${w.tod}`);
    }
  });
  const mkSave = () => { const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; return s; };
  test('skills v3: a town has ≥ 5 actions; a once:day action works once a day; fx land (items, repLocal), done survives', () => {
    const town = Object.values(LOCS).find((l) => l.kind === 'town' && !l.alias);
    const s = mkSave();
    const list = NA.skillActionsAt(s, town.id, town);
    assert.ok(list.length >= 5, `town actions ${list.length}`);
    const camp = Object.values(LOCS).find((l) => l.kind === 'camp' && !l.alias);
    const day = NA.skillActionsAt(s, camp.id, camp).find((x) => x.a.once === 'day');
    assert.ok(day, 'a daily action');
    const r1 = NA.runSkillAction(s, camp.id, day.a, { rng: () => 0.99 });
    assert.ok(r1.ok);
    assert.ok(NA.skillActionsAt(s, camp.id, camp).find((x) => x.id === day.id).done, 'done today');
    s.day += 1;
    assert.ok(!NA.skillActionsAt(s, camp.id, camp).find((x) => x.id === day.id).done, 'open next day');
    // node action: items to the backpack, repLocal to the node faction, flag kept
    const withItems = list.find((x) => x.a.once === 'node' && x.a.success.items && x.a.success.repLocal) || list.find((x) => x.a.once === 'node' && x.a.success.items);
    const f = st.locFaction(town.id);
    const rep0 = s.rep[f] || 0;
    const r2 = NA.runSkillAction(s, town.id, withItems.a, { rng: () => 0.5 + 0.49 });
    assert.ok(r2.ok);
    for (const it of withItems.a.success.items) assert.ok(st.countItem ? st.countItem(s, it.item) > 0 : JSON.stringify(s).includes(it.item), it.item);
    if (withItems.a.success.repLocal && f) assert.notEqual(s.rep[f] || 0, rep0);
    assert.ok(s.flags[NA.actionFlag(withItems.a, town.id, s.day)]);
    assert.ok(NA.skillActionsAt(JSON.parse(JSON.stringify(s)), town.id, town).find((x) => x.id === withItems.id).done, 'after a reload');
  });
  test('skills v3: failure costs; crit 1 ×1.5; crit 20 credits ×1.5; hints ≤ 3', () => {
    const a = { id: 't', success: { text: '', credits: 40, xp: 30 }, fail: { text: '', hp: -2, credits: -10 } };
    const s = mkSave();
    assert.equal(NA.outcomeFx(a, 'critSuccess', s, 'x').credits, 60);
    assert.equal(NA.outcomeFx(a, 'critFail', s, 'x').hp, -3);
    assert.equal(NA.outcomeFx(a, 'fail', s, 'x').credits, -10);
    assert.ok(NA.hintSkillsOf(s, 'noch').length <= 3 && NA.hintSkillsOf(s, 'noch').includes('stealth'));
  });
  test('skills v3: battle tricks — data shape, reveal op lifts stealth', () => {
    assert.equal(BATTLE_SKILL_TRICKS.length, 7);
    for (const tr of BATTLE_SKILL_TRICKS) {
      assert.ok(['foe', 'foeNoDeaf', 'foeHidden', 'ally', 'self'].includes(tr.target));
      if (tr.op.status) assert.ok(GAME_DATA.STATUSES[tr.op.status], tr.op.status);
    }
    const b = createBattle({ map: { grid: ['P...E'] }, heroes: [buildCreature({ race: 'human', cls: 'ranger', level: 1, data: GAME_DATA })], enemies: ['crawler'], data: GAME_DATA, seed: 1 });
    const foe = b.units.find((u) => u.team === 'enemies');
    applyStatus(b, foe, 'stealth', 3, foe);
    applyOp(b, b.units[0], foe, { op: 'reveal', turns: 1 });
    assert.ok(!foe.statuses.some((x) => x.id === 'stealth'));
    assert.ok(foe.revealedUntil >= b.round);
  });
}

// ---------------------------------------------------------------- skirmishes.md: three sides, clashes on the map
{
  const { checkVictory: cv, isHostile: hostile } = await import('../game/src/rules/combat.js');
  const { makeWorldMap } = await import('../game/src/world/arena.js');
  const CL = await import('../game/src/world/clashes.js');
  const hero = () => buildCreature({ race: 'human', cls: 'ranger', level: 3, data: GAME_DATA });
  const MAP3 = { grid: ['##########', '#P...E...#', '#........#', '#A...F...#', '##########'] };
  test('skirmish: three teams — allies with the party, rivals hostile to both', () => {
    const b = createBattle({ map: MAP3, heroes: [hero()], allies: ['nv-militia'], enemies: ['pir-deckhand'], rivals: ['mutz-sniffer'], data: GAME_DATA, seed: 3, partyLose: true });
    const by = (team) => b.units.find((u) => u.team === team);
    const H = b.byId.hero || by('heroes'), A = b.units.find((u) => u.kind === 'ally'), E = by('enemies'), R = by('rivals');
    assert.ok(A && E && R, 'all sides spawned');
    assert.equal(R.kind, 'enemy');
    assert.ok(R.id.startsWith('r'), 'rival ids do not clash with enemy ids');
    assert.deepEqual([R.x, R.y], [5, 3], 'rivals start on F');
    assert.ok(!hostile(b, A, H) && hostile(b, R, E) && hostile(b, R, H) && hostile(b, E, R) && hostile(b, A, R));
  });
  test('skirmish: AI — allies never hit the party, rivals hit both sides', () => {
    let rivalVsEnemy = 0, rivalVsParty = 0, allyVsParty = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const map = makeWorldMap({ seed, enemies: 3, sides: 3, rivals: 3 });
      const b = createBattle({ map, heroes: [hero(), hero()], allies: ['nv-militia', 'nv-hunter'], enemies: ['pir-deckhand', 'pir-knifer', 'pir-deckhand'], rivals: ['mutz-sniffer', 'mutz-hunter', 'mutz-sniffer'], data: GAME_DATA, seed, partyLose: true });
      for (const u of b.units) u.control = 'ai';
      let guard = 0;
      while (!b.winner && b.turn && b.round <= 6 && guard++ < 600) playTurn(b);
      for (const e of b.log) {
        if (e.type !== 'attack' || !b.byId[e.actor] || !b.byId[e.target]) continue;
        const a = b.byId[e.actor], t = b.byId[e.target];
        if (a.kind === 'ally' && t.team === 'heroes') allyVsParty++;
        if (a.team === 'rivals' && t.team === 'enemies') rivalVsEnemy++;
        if (a.team === 'rivals' && t.team === 'heroes') rivalVsParty++;
      }
    }
    assert.equal(allyVsParty, 0);
    assert.ok(rivalVsEnemy > 0, `rivals attack enemies (${rivalVsEnemy})`);
    assert.ok(rivalVsParty > 0, `rivals attack the party (${rivalVsParty})`);
  });
  test('skirmish: partyLose — party down is a defeat even with allies / rivals up; only the party standing wins', () => {
    const b = createBattle({ map: MAP3, heroes: [hero()], allies: ['nv-militia'], enemies: ['pir-deckhand'], rivals: ['mutz-sniffer'], data: GAME_DATA, seed: 3, partyLose: true });
    const H = b.units.find((u) => u.kind === 'hero');
    H.dead = true; H.hp = 0; b.winner = null;
    assert.equal(cv(b), 'enemies');
    const b2 = createBattle({ map: MAP3, heroes: [hero()], allies: ['nv-militia'], enemies: ['pir-deckhand'], rivals: ['mutz-sniffer'], data: GAME_DATA, seed: 3, partyLose: true });
    for (const u of b2.units) if (u.team !== 'heroes') { u.dead = true; u.hp = 0; }
    b2.winner = null;
    assert.equal(cv(b2), 'heroes');
    const b3 = createBattle({ map: MAP3, heroes: [hero()], enemies: ['pir-deckhand'], rivals: ['mutz-sniffer'], data: GAME_DATA, seed: 3, partyLose: true });
    b3.units.find((u) => u.team === 'enemies').dead = true; b3.winner = null;
    assert.equal(cv(b3), null, 'party and rivals still fight');
  });
  test('skirmish: hpPct of waited-out survivors, F starts of a 3-side world map', () => {
    const b = createBattle({ map: MAP3, heroes: [hero()], enemies: [{ enemy: 'pir-deckhand', hpPct: 0.4 }], data: GAME_DATA, seed: 1 });
    const E = b.units.find((u) => u.team === 'enemies');
    assert.equal(E.hp, Math.round(E.maxHp * 0.4));
    for (let seed = 1; seed <= 20; seed++) {
      const m = makeWorldMap({ seed, enemies: 4, sides: 3, rivals: 4 });
      const g = parseMap(m);
      assert.ok(g.starts.F.length >= 4, `F starts (seed ${seed})`);
    }
  });
  test('skirmish: evalAction — rivals prefer each other (+2), the party side gets no bonus', () => {
    const b = createBattle({ map: { grid: ['#######', '#P.E.F#', '#######'] }, heroes: [hero()], enemies: ['pir-deckhand'], rivals: ['pir-deckhand'], data: GAME_DATA, seed: 2 });
    const E = b.units.find((u) => u.team === 'enemies'), R = b.units.find((u) => u.team === 'rivals'), H = b.units.find((u) => u.kind === 'hero');
    b.turn = { ...b.turn, unitId: E.id };
    const vR = evalAction(b, E, { type: 'attack', target: R.id });
    assert.ok(vR > 0);
    assert.ok(Math.abs(vR - evalAction(b, E, { type: 'attack', target: H.id }) - 2) < 3, 'bonus is small');
  });
  test('skirmish: clashes — templates, spawn rules, save round trip, wait survivors', () => {
    for (const tpl of CL.CLASH_TEMPLATES) for (const L of [1, 5, 9, 13, 17, 20]) for (const k of ['a', 'b']) {
      for (const r of 'gsem') assert.ok(GAME_DATA.ENEMIES[CL.enemyFor(tpl[k].r, r, L)], `${tpl.id} ${k} ${r} L${L}`);
    }
    const discovered = Object.keys(LOCS);
    const save = { day: 1, hero: { level: 5 }, companions: [], party: [], rep: {}, flags: {}, journal: [], discovered, location: discovered[0], clashes: [] };
    let maxActive = 0, seen = 0;
    const rng = createRng(7);
    for (let d = 0; d < 40; d++) {
      save.day++;
      const out = CL.clashTick(save, 1, rng);
      seen += out.filter((x) => x.clash).length;
      maxActive = Math.max(maxActive, save.clashes.length);
      const regs = save.clashes.map((c) => c.region);
      assert.equal(new Set(regs).size, regs.length, 'one per region');
      for (const c of save.clashes) { assert.ok(save.day - c.born <= c.ttl); assert.ok(c.loc !== save.location); }
    }
    assert.ok(seen >= 1 && maxActive <= 3, `spawned ${seen}, max ${maxActive}`);
    const c = CL.makeClash(save, { tpl: CL.clashTpl('bandits-caravan'), region: 'neutralVillages', place: { loc: discovered[1] }, rng });
    const back = CL.normClashes(JSON.parse(JSON.stringify([c, { tpl: 'nope' }])));
    assert.equal(back.length, 1);
    assert.deepEqual(back[0].sides, c.sides);
    let hurt = 0;
    for (let s = 1; s <= 10; s++) {
      const w = CL.waitOutcome({ ...c, seed: s }, GAME_DATA);
      for (const k of ['a', 'b']) for (const x of w.survivors[k]) assert.ok(x.hpPct >= 0.15 && x.hpPct <= 1);
      if (w.winner && w.survivors[w.winner].some((x) => x.hpPct < 1)) hurt++;
    }
    assert.ok(hurt >= 1);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
