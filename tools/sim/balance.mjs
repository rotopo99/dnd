// Balance harness. Deterministic by seed.
// Usage: node tools/sim/balance.mjs [--mode party|solo|races|all] [--level 1|5|both] [--n 300] [--seed 1] [--only classId] [--json]
//  party: sim A. Per trial a random trio (class/path/race) + 1 candidate hero (every class x path) vs ENCOUNTERS.party{L}.
//         Paired: same trio and battle seed for every candidate. contribution = winrate(candidate) - mean winrate over all candidates (pp).
//         Absolute party winrate = mean over all candidates (≈ random 4-hero party).
//  solo:  sim B. One hero vs standard{L}; races rotate over trials.
//  races: sim A, fixed class (or all), race effect = winrate with race - class mean (pp).
import { RACES } from '../../game/src/data/races.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from '../../game/src/data/effects.js';
import { ENEMIES, ENCOUNTERS, scaledEnemy } from '../../game/src/data/enemies.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { simulateBattle } from '../../game/src/rules/simulate.js';
import { MAPS, GAME_DATA } from '../../game/src/data/index.js';
import { TALENTS, COMBAT_TALENT_LIMIT, talentsForSlot, isCombatTalent } from '../../game/src/data/talents.js';
import { gadgetFor } from '../../game/src/data/gadgets.js';
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

function printPrologue() {
  console.log(`\n=== Prologue maps: solo level-1 hero, class x path x races rotating (n=${N} per build, seed ${SEED}) ===`);
  const res = {};
  for (const mid of Object.keys(MAPS)) {
    const perClass = {}; let tw = 0, tn = 0;
    for (const b of builds) {
      if (ONLY && b.cid !== ONLY) continue;
      const ok = races.filter((r) => isAllowed(r, CLASSES[b.cid]));
      let w = 0;
      for (let i = 0; i < N; i++) {
        const hero = mk(b.cid, b.path, ok[i % ok.length], 1);
        w += simulateBattle({ map: MAPS[mid], heroes: [hero], data, seed: SEED * 1000 + i, maxRounds: 30 }).winner === 'heroes' ? 1 : 0;
      }
      (perClass[b.cid] ||= []).push(w / N); tw += w; tn += N;
    }
    res[mid] = { avg: tw / tn, perClass };
  }
  for (const mid of Object.keys(res)) console.log(`${mid}: avg ${pc(res[mid].avg)}`);
  console.log('class'.padEnd(12) + Object.keys(res).map((m) => m.padStart(12)).join(''));
  for (const cid of CLASS_ORDER) {
    if (ONLY && cid !== ONLY) continue;
    console.log(cid.padEnd(12) + Object.keys(res).map((m) => { const a = res[m].perClass[cid]; return pc(a.reduce((x, y) => x + y, 0) / a.length).padStart(12); }).join(''));
  }
}
// ---- world mode: w-* encounters, party of 4 (or --size s) of own level, random class/path/race + talents + gadget.
const WORLD_TARGET = {
  normal: [0.75, 0.90], quest: [0.65, 0.80], elite: [0.60, 0.70], finale0: [0.40, 0.50], finale6: [0.70, 0.80], size2: [0.60, 0.80],
};
const WORLD_KIND = {
  'w-agro-checkpoint': 'elite', 'w-agro-svoboda-raid': 'elite',
  'w-villages-terminal': 'quest', 'w-agro-terminal': 'quest', 'w-cc-terminal': 'quest', 'w-villages-beacon': 'quest', 'w-cc-duel': 'quest',
};
const ALIGN = ['good', 'evil'];
function worldHero(rng, level, noTalents) {
  const b = rng.pick(builds); const race = randRace(rng, b.cid);
  let talents = [], active = [];
  if (!noTalents) {
    const cls = CLASSES[b.cid];
    const path = cls.paths.find((p) => p.id === b.path);
    const weapon = path?.weapon || cls.weapon;
    const ctx = { race: race.id, cls: b.cid, origin: null, alignment: rng.pick(ALIGN), stats: cls.recommended, level, weaponRange: weapon.range, tags: race.tags };
    const owned = [];
    for (const slot of ['race', 'job', 'faction', 'alignment']) {
      const opts = talentsForSlot(slot, ctx).filter(isCombatTalent);
      if (opts.length && rng() < 0.75) owned.push(rng.pick(opts));
    }
    const lim = COMBAT_TALENT_LIMIT(level);
    const uniq = [...new Map(owned.map((t) => [t.id, t])).values()];
    active = uniq.slice(0, lim).map((t) => t.id); talents = active;
  }
  return { b, race, talents, active, gadget: noTalents ? null : (gadgetFor(b.cid)?.id || null) };
}
function buildWorldHero(h, level) {
  return buildCreature({ race: h.race, cls: h.b.cid, level, path: h.b.path, data: GAME_DATA, talents: h.talents, activeCombat: h.active, gadget: h.gadget });
}
function worldRate(id, size, n, seedBase, enemyOverride, noTalents) {
  const enc = ENCOUNTERS[id]; const level = enc.level;
  let list = enemyOverride || enc.enemies;
  const k = Math.ceil(list.length * size / 4); list = list.slice(0, k);
  const rng = createRng(seedBase * 104729 + id.length * 31 + size);
  let w = 0, rounds = 0;
  for (let t = 0; t < n; t++) {
    const hs = []; for (let i = 0; i < size; i++) hs.push(worldHero(rng, level, noTalents));
    const heroes = hs.map((h) => buildWorldHero(h, level));
    const map = enc.map ? MAPS[enc.map] : undefined;
    const r = simulateBattle({ map, heroes, enemies: list, data: GAME_DATA, seed: rng.int(1, 1e9), maxRounds: 30 });
    if (r.winner === 'heroes') w++; rounds += r.rounds;
  }
  return { rate: w / n, rounds: rounds / n };
}
function printWorld() {
  const size = Number(opt('--size', 4)); const nt = args.includes('--no-talents');
  console.log(`\n=== World: party of ${size}${nt ? ' (no talents/gadgets)' : ' (random combat talents + gadget)'}, n=${N}, seed ${SEED} ===`);
  const ids = Object.keys(ENCOUNTERS).filter((k) => k.startsWith('w-'));
  for (const id of ids) {
    if (ONLY && id !== ONLY) continue;
    const enc0 = ENCOUNTERS[id]; const kind = WORLD_KIND[id] || 'normal';
    const PW = Number(opt('--power', 0)); const sc = (x) => (PW ? scaledEnemy(x, PW) : x);
    const enc = { ...enc0, enemies: enc0.enemies.map(sc), reduce: (enc0.reduce || []).map(sc) };
    const variants = id === 'w-cc-finale' ? [['0 terminals off', enc.enemies, 'finale0'], ['all off (reduce)', enc.enemies.filter((_, i) => true), 'finale6']] : [['', enc.enemies, kind]];
    for (const [label, list0, tk] of variants) {
      let list = (EXP_ENC && ONLY) ? EXP_ENC.split(',').map((x) => { const [b, q] = x.split('^'); return q ? scaledEnemy(b, Number(q)) : sc(x); }) : list0;
      if (tk === 'finale6') { list = [...enc.enemies]; for (const r of enc.reduce) { const i = list.indexOf(r); if (i >= 0) list.splice(i, 1); } }
      const r = worldRate(id, size, N, SEED, list, nt);
      const tgt = size === 4 ? WORLD_TARGET[tk] : (kind === 'normal' ? WORLD_TARGET.size2 : null);
      const flag = tgt ? (r.rate < tgt[0] - 0.02 ? ' <-- TOO HARD' : r.rate > tgt[1] + 0.02 ? ' <-- TOO EASY' : '') : '';
      console.log(`${(id + ' ' + label).padEnd(34)} L${enc.level} foes ${String(Math.ceil(list.length * size / 4)).padStart(2)} ${kind.padEnd(6)} win ${pc(r.rate)} rounds ${r.rounds.toFixed(1).padStart(4)}  target ${tgt ? tgt.map((x) => (100 * x).toFixed(0)).join('-') : '-'}${flag}`);
    }
  }
}
const t0 = Date.now();
for (const L of levels) {
  if (MODE === 'party' || MODE === 'all') printParty(L);
  if (MODE === 'solo' || MODE === 'all') printSolo(L);
  if (MODE === 'races') printRaces(L);
}
if (MODE === 'prologue' || MODE === 'all') printPrologue();
if (MODE === 'world') printWorld();
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
