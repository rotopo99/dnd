// Balance harness. Deterministic by seed.
// Usage: node tools/sim/balance.mjs [--mode party|solo|races|all] [--level 1|5|both] [--n 300] [--seed 1] [--only classId] [--json]
//  party: sim A. Per trial a random trio (class/path/race) + 1 candidate hero (every class x path) vs ENCOUNTERS.party{L}.
//         Paired: same trio and battle seed for every candidate. contribution = winrate(candidate) - mean winrate over all candidates (pp).
//         Absolute party winrate = mean over all candidates (≈ random 4-hero party).
//  solo:  sim B. One hero vs standard{L}; races rotate over trials.
//  races: sim A, fixed class (or all), race effect = winrate with race - class mean (pp).
import { RACES } from '../../game/src/data/races.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from '../../game/src/data/effects.js';
import { ENEMIES, ENCOUNTERS } from '../../game/src/data/enemies.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { simulateBattle } from '../../game/src/rules/simulate.js';
import { createRng } from '../../game/src/rules/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--n', 300));
const SEED = Number(opt('--seed', 1));
const MODE = opt('--mode', 'all');
const ONLY = opt('--only', null);
const LV = opt('--level', 'both');
const EXP_ENC = opt('--enc', null); // experiment: comma-separated enemy ids overriding party encounter
const JSON_OUT = args.includes('--json');
const levels = LV === 'both' ? [1, 5] : [Number(LV)];
const data = { RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE };
const races = Object.values(RACES).filter((r) => r.playable);
const builds = []; // class x path
for (const cid of CLASS_ORDER) for (const p of CLASSES[cid].paths) builds.push({ cid, path: p.id, key: `${cid}/${p.id}` });
const pp = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
const pc = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const mk = (cid, path, race, level) => buildCreature({ race, cls: cid, level, path, data });
const randRace = (rng, cid) => { const ok = races.filter((r) => isAllowed(r, CLASSES[cid])); return rng.pick(ok); };
const win = (heroes, enc, seed) => simulateBattle({ heroes, enemies: enc.enemies, data, seed, maxRounds: 30 }).winner === 'heroes' ? 1 : 0;
const roleOf = (cid, pid) => { const p = CLASSES[cid].paths.find((x) => x.id === pid); return (p && p.role) || CLASSES[cid].role; };

function partySim(level, filterBuilds, fixedRace) {
  const enc = EXP_ENC ? { enemies: EXP_ENC.split(',') } : ENCOUNTERS[`party${level}`];
  const rng = createRng(SEED * 7919 + level);
  const stat = new Map(builds.map((b) => [b.key, { w: 0, n: 0 }]));
  const byRace = {};
  let trioW = 0;
  for (let t = 0; t < N; t++) {
    const trio = [];
    for (let i = 0; i < 3; i++) { const b = rng.pick(builds); trio.push({ b, race: randRace(rng, b.cid).id }); }
    const raceSeedPick = rng.int(0, 1e6);
    const bs = rng.int(1, 1e9);
    for (const b of builds) {
      if (filterBuilds && !filterBuilds(b)) continue;
      const ok = races.filter((r) => isAllowed(r, CLASSES[b.cid]));
      const rl = fixedRace ? ok.filter((r) => r.id === fixedRace) : [ok[raceSeedPick % ok.length]];
      if (!rl.length) continue;
      const heroes = trio.map((m) => mk(m.b.cid, m.b.path, m.race, level)).concat([mk(b.cid, b.path, rl[0], level)]);
      const w = win(heroes, enc, bs);
      const s = stat.get(b.key); s.w += w; s.n++;
      const rk = `${b.cid}|${rl[0].id}`; (byRace[rk] ||= { w: 0, n: 0 }); byRace[rk].w += w; byRace[rk].n++;
    }
  }
  return { stat, byRace };
}

function printParty(level) {
  const { stat } = partySim(level, ONLY ? (b) => b.cid === ONLY : null);
  let sw = 0, sn = 0; for (const s of stat.values()) { sw += s.w; sn += s.n; }
  const avg = sw / Math.max(1, sn);
  console.log(`\n=== Sim A: party vs party${level}  (n=${N} trios x builds, seed ${SEED}); party winrate avg ${pc(avg)}  ===`);
  const out = { level, avg, classes: {}, paths: {} };
  for (const cid of CLASS_ORDER) {
    if (ONLY && cid !== ONLY) continue;
    const bl = builds.filter((b) => b.cid === cid);
    const cw = bl.reduce((a, b) => a + stat.get(b.key).w, 0), cn = bl.reduce((a, b) => a + stat.get(b.key).n, 0);
    const cc = cw / cn - avg;
    out.classes[cid] = cc;
    console.log(`${cid.padEnd(11)} [${CLASSES[cid].role.padEnd(7)}] class ${pc(cw / cn)} contrib ${pp(cc).padStart(6)}`);
    for (const b of bl) {
      const s = stat.get(b.key); const c = s.w / s.n - avg; out.paths[b.key] = c;
      console.log(`   ${b.path.padEnd(26)} {${roleOf(b.cid, b.path).padEnd(7)}} ${pc(s.w / s.n)} contrib ${pp(c).padStart(6)} ${Math.abs(c) > 0.05 ? ' <-- OUT' : ''}`);
    }
  }
  const vals = Object.values(out.paths);
  const bad = vals.filter((v) => Math.abs(v) > 0.05).length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / vals.length);
  console.log(`paths out of ±5pp: ${bad}/${vals.length}; rms ${(100 * sd).toFixed(1)}pp; noise per build ≈ ±${(100 * 1.96 * Math.sqrt(0.25 / N)).toFixed(1)}pp (95%)`);
  return out;
}

function printSolo(level) {
  const enc = ENCOUNTERS[`standard${level}`];
  console.log(`\n=== Sim B: solo vs standard${level} (n=${N}, races rotate, seed ${SEED}) ===`);
  for (const b of builds) {
    if (ONLY && b.cid !== ONLY) continue;
    const role = roleOf(b.cid, b.path); const rng = createRng(SEED * 31 + level);
    let w = 0;
    for (let i = 0; i < N; i++) {
      const ok = races.filter((r) => isAllowed(r, CLASSES[b.cid])); const r = ok[i % ok.length];
      w += win([mk(b.cid, b.path, r, level)], enc, rng.int(1, 1e9));
    }
    const x = w / N; const core = ['tank', 'melee', 'ranged', 'caster'].includes(role);
    const flag = core ? (x < 0.4 || x > 0.7 ? ' <-- OUT(40-70)' : '') : (x < 0.2 ? ' <-- OUT(>=20)' : '');
    console.log(`${b.key.padEnd(40)} {${role.padEnd(7)}} ${pc(x)}${flag}`);
  }
}

function printRaces(level) {
  const enc = ENCOUNTERS[`party${level}`];
  console.log(`\n=== Races: party vs party${level}, effect of race on candidate (pp vs class mean), n=${N} ===`);
  const per = {};
  for (const r of races) {
    const { byRace } = partySim(level, (b) => !ONLY || b.cid === ONLY, r.id);
    for (const k in byRace) { (per[k] ||= {}); per[k] = byRace[k]; }
  }
  const raceSum = {};
  for (const cid of CLASS_ORDER) {
    if (ONLY && cid !== ONLY) continue;
    const row = races.filter((r) => per[`${cid}|${r.id}`]).map((r) => ({ id: r.id, x: per[`${cid}|${r.id}`].w / per[`${cid}|${r.id}`].n }));
    const m = row.reduce((a, r) => a + r.x, 0) / row.length;
    console.log(cid.padEnd(11) + row.map((r) => `${r.id.slice(0, 9)} ${pp(r.x - m).padStart(6)}`).join(' | '));
    for (const r of row) { (raceSum[r.id] ||= []).push(r.x - m); }
  }
  console.log('race mean effect: ' + Object.entries(raceSum).map(([k, v]) => `${k} ${pp(v.reduce((a, b) => a + b, 0) / v.length)}`).join(' | '));
}

const t0 = Date.now();
for (const L of levels) {
  if (MODE === 'party' || MODE === 'all') printParty(L);
  if (MODE === 'solo' || MODE === 'all') printSolo(L);
  if (MODE === 'races') printRaces(L);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
