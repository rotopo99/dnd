// Late game / finale balance: party of 3-4 (L17-18, best-gear) vs mq4-eve waves, Cyber-Priest, Judge avatar, Great Collector, Warprom squads.
// Usage: node tools/sim/finale.mjs [--n 20] [--size 4] [--seed 1] [--only enc,enc] [--prep 0|1] [--cls id] [--chain 1] [--small 1]
//   prep 1 — eve waves with the defence flags PREP_FLAGS through world/wave4.js eveSetup (allyCap, volleys, buffs, terminal revive);
//   boss phases (hp triggers, balance-finale.md §2) always on via bossPhases; small 1 — smallParty (§3) for a party of ≤ 3.
import { GAME_DATA } from '../../game/src/data/index.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { ENCOUNTERS_V4 } from '../../game/src/data/enemies-v4.js';
import { ENEMIES_V3 } from '../../game/src/data/enemies-v3.js';
import { WEAPONS } from '../../game/src/data/items/weapons.js';
import { ARMOR } from '../../game/src/data/items/armor.js';
import { STARTER_KITS } from '../../game/src/data/items/shops.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { createBattle } from '../../game/src/rules/combat.js';
import { playTurn } from '../../game/src/rules/ai.js';
import { gearScore } from '../../game/src/world/best-gear.js';
import { createRng } from '../../game/src/rules/rng.js';
import { COMBAT } from '../../game/src/data/combat.js';
import { eveSetup, bossPhases, smallParty } from '../../game/src/world/wave4.js';

const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--n', 20), SEED = +opt('--seed', 1), SIZE = +opt('--size', 4), PREP = +opt('--prep', 0), CLS = opt('--cls', null), SMALL = +opt('--small', 0);
// prep 1 — the «allies» flags (units + volleys; allyCap trims them to 1 unit + 2 volleys a wave); --flags all — every defence flag
// (+ mines −15% wave 1, barricades KB+1 3 rounds, the hub terminal revive once a mission)
const ALLY_FLAGS = ['harmony-ai', 'harmony-pir', 'saved-workshop', 'saved-sector-d', 'ally-tin', 'ladov-named'];
const ALL_FLAGS = [...ALLY_FLAGS, 'harmony-ren', 'harmony-council', 'saved-terminal'];
const PREP_FLAGS = opt('--flags', null) === 'all' ? ALL_FLAGS : opt('--flags', null)?.split(',') || ALLY_FLAGS;
const ONLY = opt('--only', null)?.split(',');
for (const [k, v] of Object.entries(ENEMIES_V3)) if (!GAME_DATA.ENEMIES[k]) GAME_DATA.ENEMIES[k] = v;
for (const [k, v] of Object.entries(ENCOUNTERS_V4)) GAME_DATA.ENCOUNTERS[k] = v;
const races = Object.values(GAME_DATA.RACES).filter((r) => r.playable);
const TIERMAX = 4;
const wl = Object.values(WEAPONS).filter((w) => (w.tier || 1) <= TIERMAX && !w.unique);
const al = Object.values(ARMOR).filter((a) => (a.tier || 1) <= TIERMAX && !a.unique);
const gearCache = {};
function bestGear(cid, path, race) {
  const key = `${cid}:${path}:${race.id}`; if (gearCache[key]) return gearCache[key];
  const cls = CLASSES[cid]; const k = STARTER_KITS[`${cid}:${path}`] || STARTER_KITS[cid];
  const mk = (eq) => { try { return buildCreature({ race, cls, level: 17, path, data: GAME_DATA, equipment: eq }); } catch { return null; } };
  let eq = { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] };
  let best = mk(eq), bs = best ? gearScore(best) : -1e9;
  for (const w of wl) { const e = { ...eq, weapon: w.id }; const u = mk(e); if (!u) continue; const s = gearScore(u); if (s > bs) { bs = s; eq = e; } }
  best = mk(eq); bs = gearScore(best);
  for (const a of al) { const e = { ...eq, armor: a.id }; const u = mk(e); if (!u) continue; const s = gearScore(u); if (s > bs) { bs = s; eq = e; } }
  const inv = { medkit: 2 };
  return (gearCache[key] = { equipment: eq, inventory: GAME_DATA.ITEMS.medkit ? inv : {} });
}
const mkHero = (cid, path, level, rng) => {
  const cls = CLASSES[cid]; const race = rng.pick(races.filter((r) => isAllowed(r, cls)));
  const g = bestGear(cid, path, race);
  return buildCreature({ race, cls, level, path, data: GAME_DATA, equipment: g.equipment, inventory: g.inventory, asi: 'auto' });
};
const mkParty = (cid, level, size, rng) => {
  const cls = CLASSES[cid]; const out = [mkHero(cid, rng.pick(cls.paths).id, level, rng)];
  while (out.length < size) { const c = rng.pick(CLASS_ORDER.filter((x) => x !== cid)); out.push(mkHero(c, rng.pick(CLASSES[c].paths).id, level, rng)); }
  return out;
};
// scenarios: enemies + allies (prepared) + options
const E = (id) => ENCOUNTERS_V4[id].enemies;
const scale = (list, size) => list.slice(0, Math.max(1, Math.ceil(list.length * size / 4)));
const SC = {
  'w-eve-1': { lvl: 17, enc: 'w-eve-1', en: (s) => scale(E('w-eve-1'), s) },
  'w-eve-2': { lvl: 17, enc: 'w-eve-2', en: (s) => scale(E('w-eve-2'), s), boss: 'wp-cmd' },
  'w-eve-3': { lvl: 18, enc: 'w-eve-3', en: (s) => scale(E('w-eve-3'), s) },
  'cyber-priest-gate': { lvl: 18, enc: 'enc-cyber-priest-strong', en: (s) => scale(E('enc-cyber-priest-strong'), s), boss: 'boss-' },
  'cyber-priest-sokr': { lvl: 19, enc: 'v4-boss-cyber-priest', en: (s) => scale(E('v4-boss-cyber-priest'), s), boss: 'boss-' },
  'judge-normal(3 term)': { lvl: 20, enc: 'w-cc-finale', en: (s) => scale(ENCOUNTERS_V4['w-cc-finale'].enemies.filter((_, i) => i < 7 - 3 || i === 0), s), boss: 'boss-' },
  'judge-normal(0 term)': { lvl: 20, enc: 'w-cc-finale', en: (s) => scale(E('w-cc-finale'), s), boss: 'boss-' },
  'judge-hard(incarnate)': { lvl: 20, enc: 'w-cc-finale', en: (s) => { const l = scale(E('w-cc-finale'), s); const id = l[0]; const e = GAME_DATA.ENEMIES[id]; const nid = `${id}^inc`; GAME_DATA.ENEMIES[nid] ||= { ...e, id: nid, hp: Math.round(e.hp * 1.25) }; return [nid, ...l.slice(1)]; }, boss: 'boss-' },
  'collector': { lvl: 16, enc: 'v4-boss-collector', en: (s) => scale(E('v4-boss-collector'), s), boss: 'boss-' },
  'collector(c8 torn -20%hp)': { lvl: 16, enc: 'v4-boss-collector', flags: ['ladov-torn'], en: (s) => scale(E('v4-boss-collector'), s).map((e, i) => (i === 0 ? { enemy: e, hpPct: 0.8 } : e)), boss: 'boss-' },
  'collector(c8 named: solo boss)': { lvl: 16, enc: 'v4-boss-collector', flags: ['ladov-named'], en: () => [E('v4-boss-collector')[0]], boss: 'boss-' },
  'wp-patrol L16': { lvl: 16, en: (s) => scale(E('v4-wp-patrol'), s) },
  'wp-host L16': { lvl: 16, en: (s) => scale(E('v4-wp-host'), s) },
  'wp-elite L16 (walker cmd)': { lvl: 16, en: (s) => scale(E('v4-wp-elite'), s), boss: 'wp-cmd' },
};
// the battle setup as scenes/world-battle.js encounterSetup builds it: eve flags, small party, boss phases
const fakeSave = (flags) => ({ flags: Object.fromEntries(flags.map((k) => [k, true])) });
function setup(sc, size, flags) {
  const save = fakeSave([...(PREP ? PREP_FLAGS : []), ...(sc.flags || []), ...flags]);
  const eve = sc.enc ? eveSetup(save, sc.enc, sc.en(size)) : { enemies: sc.en(size), allies: [], buffs: [], triggers: [] };
  const sp = SMALL && sc.enc ? smallParty(size, sc.enc, eve.enemies, GAME_DATA.ENEMIES) : { enemies: eve.enemies, allies: [] };
  return { enemies: sp.enemies, allies: [...eve.allies, ...sp.allies], buffs: eve.buffs || [], triggers: [...(eve.triggers || []), ...bossPhases(save, sp.enemies)] };
}
function battle(heroes, st, rng, objectives) {
  const b = createBattle({ heroes, enemies: st.enemies, allies: st.allies.length ? st.allies : undefined, data: GAME_DATA, seed: rng.int(1, 1e9), log: false, objectives, triggers: st.triggers.length ? st.triggers : null });
  for (const h of st.buffs) for (const u of b.units) if (u.team === 'heroes' && !u.dead) u.buffs.push({ stat: h.stat, value: h.value, turns: h.turns ?? 1, fresh: false, source: null });
  for (const u of b.units) u.control = 'ai';
  return b;
}
const fired = (b, id) => !!b.triggers?.find((t) => t.id === id)?.fired;
const run = (name, cid, i) => {
  const sc = SC[name]; const rng = createRng(SEED * 7919 + i * 131 + CLASS_ORDER.indexOf(cid));
  const heroes = mkParty(cid, sc.lvl, SIZE, rng);
  const b = battle(heroes, setup(sc, SIZE, []), rng, sc.boss ? { retreat: true, exitLock: true } : undefined);
  let guard = 0, phaseRound = null, firstDown = null; const maxR = 30;
  while (!b.winner && b.turn && b.round <= maxR && guard++ < 6000) {
    playTurn(b);
    if (phaseRound == null && b.objectives && sc.boss && !b.objectives.exitLock) phaseRound = b.round;
    if (firstDown == null && b.units.some((u) => u.team === 'heroes' && u.kind !== 'ally' && (u.down || u.dead))) firstDown = b.round;
  }
  const heroHp = b.units.filter((u) => u.team === 'heroes' && !u.dead && !u.down).length;
  const ph = (b.triggers || []).filter((t) => /-p[23]$/.test(t.id || ''));
  return { win: b.winner === 'heroes', rounds: Math.min(b.round, maxR), phaseRound, firstDown, alive: heroHp, lockedAtEnd: !!b.objectives?.exitLock,
    phases: ph.length ? [ph.some((t) => t.fired && t.id.endsWith('p2')), ph.some((t) => t.fired && t.id.endsWith('p3'))] : null,
    propBroken: (b.triggers || []).some((t) => /-break$/.test(t.id || '') && t.fired) };
};
// chain: waves 1-3 back to back, between waves a short rest (survivors +REST of max HP, downed back at 25%); win = all 3 won
const REST = +opt('--rest', 0.35);
const runChain = (cid, i) => {
  const rng = createRng(SEED * 104729 + i * 131 + CLASS_ORDER.indexOf(cid));
  const heroes = mkParty(cid, 17, SIZE, rng); let hpPct = heroes.map(() => 1);
  const used = []; // saved-terminal: one revive for the whole mission (eve-revive-used)
  for (let w = 0; w < 3; w++) {
    const sc = SC[`w-eve-${w + 1}`];
    const hs = heroes.map((h, k) => Object.assign(h, { hpPct: hpPct[k] }));
    const b = battle(hs, setup(sc, SIZE, used), rng);
    let g = 0; while (!b.winner && b.turn && b.round <= 30 && g++ < 6000) playTurn(b);
    if (fired(b, 'eve-terminal')) used.push('eve-revive-used');
    if (b.winner !== 'heroes') return { win: false, wave: w + 1 };
    const mine = b.units.filter((u) => u.team === 'heroes' && u.kind !== 'ally');
    hpPct = mine.map((u) => (u.dead || u.down || u.hp <= 0 ? 0.25 : Math.min(1, u.hp / u.maxHp + REST)));
    if (w === 2) return { win: true, wave: 3 };
  }
};
const pc = (x) => `${(100 * x).toFixed(0)}%`;
const names = Object.keys(SC).filter((n) => !ONLY || ONLY.some((o) => n.includes(o)));
if (ONLY && ONLY[0] === 'none') names.length = 0;
const classes = CLS ? [CLS] : CLASS_ORDER;
console.log(`size ${SIZE}, prep ${PREP}, small ${SMALL}, n/class ${N}, seed ${SEED}`);
console.log('scenario'.padEnd(34) + 'win'.padStart(6) + ' minCls'.padStart(16) + ' rnd'.padStart(6) + ' lockOpen%'.padStart(11) + ' downBefore'.padStart(12) + ' p2/p3/prop%'.padStart(14) + ' rndWin'.padStart(8));
const perCls = {};
for (const name of names) {
  let w = 0, t = 0, rs = 0, locked = 0, hasBoss = 0, opened = 0, lockedWipe = 0, ph = 0, p2 = 0, p3 = 0, pb = 0, rw = 0; const byC = {};
  for (const cid of classes) { let cw = 0; for (let i = 0; i < N; i++) {
    let r; try { r = run(name, cid, i); } catch (e) { console.error(name, cid, e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
    t++; rs += r.rounds; if (r.win) { w++; cw++; rw += r.rounds; }
    if (SC[name].boss) { hasBoss++; if (r.phaseRound != null) opened++; else if (!r.win) lockedWipe++; }
    if (r.phases) { ph++; p2 += r.phases[0]; p3 += r.phases[1]; pb += r.propBroken; }
  } byC[cid] = cw / N; (perCls[cid] ||= {})[name] = cw / N; }
  const worst = Object.entries(byC).sort((a, b) => a[1] - b[1])[0];
  console.log(name.padEnd(34) + pc(w / t).padStart(6) + (` ${worst[0]} ${pc(worst[1])}`).padStart(16) + (rs / t).toFixed(1).padStart(6) + (hasBoss ? pc(opened / hasBoss) : '-').padStart(11) + (hasBoss ? pc(lockedWipe / hasBoss) : '-').padStart(12)
    + (ph ? `${pc(p2 / ph)}/${pc(p3 / ph)}/${pc(pb / ph)}` : '-').padStart(14) + (w ? (rw / w).toFixed(1) : '-').padStart(8));
}
console.log('\nper class win%:'); console.log('class'.padEnd(12) + names.map((n) => n.slice(0, 9).padStart(10)).join(''));
for (const cid of classes) console.log(cid.padEnd(12) + names.map((n) => pc(perCls[cid][n] ?? 0).padStart(10)).join(''));

if (opt('--chain', 0) === '1') {
  console.log('\nchain w-eve-1..3 (rest +' + REST + ' HP):');
  let w = 0, t = 0; const fails = [0, 0, 0, 0]; const byC = {};
  for (const cid of classes) { let cw = 0; for (let i = 0; i < N; i++) { const r = runChain(cid, i); t++; if (r.win) { w++; cw++; } else fails[r.wave]++; } byC[cid] = cw / N; }
  console.log('win', pc(w / t), 'fails at wave 1/2/3:', fails.slice(1).join('/'), Object.entries(byC).map(([c, v]) => `${c} ${pc(v)}`).join(', '));
}
