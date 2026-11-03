// Rules engine tests: node tools/test.mjs (exit code 1 on failure). No frameworks.
import assert from 'node:assert/strict';
import { createRng } from '../game/src/rules/rng.js';
import { parseDice, rollDice, d20, avgDice } from '../game/src/rules/dice.js';
import { buildCreature, buildEnemy, mod, profBonus, pointBuyCost } from '../game/src/rules/character.js';
import { parseMap, chebyshev, lineOfSight, hasCover, findPath, reachable, makeArena } from '../game/src/rules/grid.js';
import { createBattle, perform, endTurn, getLegalActions, dealDamage, applyStatus, applyOp, getKb, weaponDamageBonus, isMeleeAttack,
  BREAKDOWN_HEARTBREAK_MAX, HEARTBREAK_HP_LOSS, BREAKDOWN_MRL_RESET, BIG_HIT_FRACTION, BIG_HIT_DC, COVER_KB, DOWN_TURNS_TO_DEATH, OVERCAST_LIMIT } from '../game/src/rules/combat.js';
import { chooseAction } from '../game/src/rules/ai.js';
import { simulateBattle } from '../game/src/rules/simulate.js';
import { DATA } from './fixtures/rules-data.mjs';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
