// Balance harness. Deterministic by seed.
// Usage: node tools/sim/balance.mjs [--mode party|solo|races|all] [--level 1|5|both] [--n 300] [--seed 1] [--only classId] [--json]
//  party: sim A. Per trial a random trio (class/path/race) + 1 candidate hero (every class x path) vs ENCOUNTERS.party{L}.
//         Paired: same trio and battle seed for every candidate. contribution = winrate(candidate) - mean winrate over all candidates (pp).
//         Absolute party winrate = mean over all candidates (≈ random 4-hero party).
//  solo:  sim B. One hero vs standard{L}; races rotate over trials.
//  v3:    all ENCOUNTERS_V3, party of 4 of the encounter level, random class/race, talents, gadget, STARTER KITS (weapon, armor, belt).
//         --kind elite|quest|normal filter by KIND_V3; --power override via tune-v3.mjs. Reports win %, rounds, target.
//  gear:  [--items id,id] [--cat weapon|armor] paired: hero with item X vs the same hero with his starter item; delta in pp.
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
import { ENCOUNTERS_V3, ENEMIES_V3, scaleV3 } from '../../game/src/data/enemies-v3.js';
import { WEAPONS } from '../../game/src/data/items/weapons.js';
import { ARMOR } from '../../game/src/data/items/armor.js';
import { STARTER_KITS } from '../../game/src/data/items/shops.js';
import { defaultProficiencies } from '../../game/src/rules/equipment.js';

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
    const PW = Number(opt('--power', 0)); const sc = (x) => (PW ? scaledEnemy(x.split('^')[0], PW) : x);
    const enc = { ...enc0, enemies: enc0.enemies.map(sc), reduce: (enc0.reduce || []).map(sc) };
    const variants = id === 'w-cc-finale' ? [['0 terminals off', enc.enemies, 'finale0'], ['all off (reduce)', enc.enemies.filter((_, i) => true), 'finale6']] : [['', enc.enemies, kind]];
    for (const [label, list0, tk] of variants) {
      let list = (EXP_ENC && ONLY) ? EXP_ENC.split(',').map((x) => { const [b, q] = x.split('^'); return q ? scaledEnemy(b, Number(q)) : sc(x); }) : list0;
      if (tk === 'finale6') { list = [...enc.enemies]; for (const r of enc.reduce.slice(0, 5)) { const i = list.indexOf(r); if (i >= 0) list.splice(i, 1); } }
      const r = worldRate(id, size, N, SEED, list, nt);
      const tgt = size === 4 ? WORLD_TARGET[tk] : (kind === 'normal' ? WORLD_TARGET.size2 : null);
      const flag = tgt ? (r.rate < tgt[0] - 0.02 ? ' <-- TOO HARD' : r.rate > tgt[1] + 0.02 ? ' <-- TOO EASY' : '') : '';
      console.log(`${(id + ' ' + label).padEnd(34)} L${enc.level} foes ${String(Math.ceil(list.length * size / 4)).padStart(2)} ${kind.padEnd(6)} win ${pc(r.rate)} rounds ${r.rounds.toFixed(1).padStart(4)}  target ${tgt ? tgt.map((x) => (100 * x).toFixed(0)).join('-') : '-'}${flag}`);
    }
  }
}
// ---- v3: battles ENCOUNTERS_V3 and gear
const KIND_V3 = { // quest battles (enc-*), elite and boss markers; everything else is 'normal'
  elite: ['v3-pir-flagship', 'v3-wp-walker', 'v3-ai-commissar', 'v3-tin-renegade', 'v3-mech-hive', 'v3-crg-collector', 'v3-scv-kings-yard', 'v3-tek-golem', 'v3-agro-chief', 'v3-mutr-grove', 'v3-cult-temple', 'v3-mutz-alpha', 'v3-band-bisons',
    'v3-mon-lake', 'v3-mon-sea', 'v3-mon-hills', 'v3-boss-great-mech', 'v3-boss-plague-seed', 'v3-boss-vibe-burner', 'v3-boss-ice-ring', 'v3-boss-sputnik', 'v3-boss-bazaar', 'v3-boss-armory', 'v3-boss-lis-1',
    'enc-vibe-burner', 'enc-judge', 'enc-great-mech', 'enc-plague-seed', 'enc-lake-monster', 'enc-sea-monster', 'enc-hill-monster', 'enc-arena-final'],
};
const kindV3 = (id) => (KIND_V3.elite.includes(id) ? 'elite' : id.startsWith('enc-') ? 'quest' : 'normal');
const TARGET_V3 = { normal: [0.75, 0.90], quest: [0.65, 0.80], elite: [0.50, 0.65] };
const mkEquip = (cid, path) => {
  const k = STARTER_KITS[`${cid}:${path}`] || STARTER_KITS[cid];
  const inv = {}; for (const id of k.belt || []) if (GAME_DATA.ITEMS[id]) inv[id] = (inv[id] || 0) + 1;
  return { equipment: { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] }, inventory: inv };
};
function v3Hero(h, level, equipment, inventory, proficiencies) {
  const kit = mkEquip(h.b.cid, h.b.path);
  return buildCreature({ race: h.race, cls: h.b.cid, level, path: h.b.path, data: GAME_DATA, talents: h.talents, activeCombat: h.active, gadget: h.gadget,
    equipment: equipment || kit.equipment, inventory: inventory || kit.inventory, ...(proficiencies ? { proficiencies } : {}) });
}
export function v3Rate(enc, n, seedBase, size = 4) {
  const level = enc.level; const list = enc.enemies;
  for (const id of list) if (!GAME_DATA.ENEMIES[id] && ENEMIES_V3[id]) GAME_DATA.ENEMIES[id] = ENEMIES_V3[id];
  const k = Math.ceil(list.length * size / 4);
  const rng = createRng(seedBase * 104729 + enc.id.length * 31 + size + (enc.id.charCodeAt(enc.id.length - 1) * 977));
  let w = 0, rounds = 0, wr = 0;
  const map = enc.map ? MAPS[enc.map] : undefined;
  for (let t = 0; t < n; t++) {
    const hs = []; for (let i = 0; i < size; i++) hs.push(worldHero(rng, level, false));
    const heroes = hs.map((h) => v3Hero(h, level));
    const r = simulateBattle({ map, heroes, enemies: list.slice(0, k), data: GAME_DATA, seed: rng.int(1, 1e9), maxRounds: 30 });
    if (r.winner === 'heroes') { w++; wr += r.rounds; } rounds += r.rounds;
  }
  return { rate: w / n, rounds: rounds / n, winRounds: w ? wr / w : 0 };
}
function printV3() {
  const kf = opt('--kind', null);
  console.log(`\n=== v3 battles: party of 4 of own level, starter kits + talents + gadget, n=${N}, seed ${SEED} ===`);
  let bad = 0, cnt = 0, sumR = 0;
  for (const enc of Object.values(ENCOUNTERS_V3)) {
    if (ONLY && enc.id !== ONLY) continue; const kind = kindV3(enc.id); if (kf && kf !== kind) continue;
    const r = v3Rate(enc, N, SEED); const tg = TARGET_V3[kind];
    const flag = r.rate < tg[0] - 0.03 ? ' <-- HARD' : r.rate > tg[1] + 0.03 ? ' <-- EASY' : ''; const lg = r.rounds > 10.5 ? ' LONG' : '';
    if (flag) bad++; cnt++; sumR += r.rounds;
    console.log(`${enc.id.padEnd(26)} L${enc.level} foes ${String(enc.enemies.length).padStart(2)} ${kind.padEnd(6)} win ${pc(r.rate)} rounds ${r.rounds.toFixed(1).padStart(4)} (win ${r.winRounds.toFixed(1)})${lg} pw ${JSON.stringify(enc.power ?? 1)} tgt ${tg.map((x) => 100 * x).join('-')}${flag}`);
  }
  console.log(`out of target: ${bad}/${cnt}; mean rounds ${(sumR / cnt).toFixed(1)}`);
}
// gear: tier -> battery of encounters (provisional levels); item X vs hero's own starter item, same trio / seed
const GEAR_BATTERY = { 1: ['v3-pir-dock', 'v3-scv-pickers', 'v3-mutz-pack'], 2: ['v3-tin-trial', 'v3-mech-shop', 'v3-agro-field'], 3: ['enc-saboteurs', 'enc-brigands', 'enc-border-clash'], 4: ['enc-sokralnya-guard', 'enc-lox-clone', 'enc-arena-final'], 5: ['v3-pir-flagship', 'v3-wp-walker', 'enc-arsenal-cult'] };
const scoreOf = (r) => { const h = r.survivors.filter((u) => u.team === 'heroes'), e = r.survivors.filter((u) => u.team !== 'heroes'); return h.reduce((a, u) => a + u.hp / u.maxHp, 0) / 4 - e.reduce((a, u) => a + u.hp / u.maxHp, 0) / Math.max(1, e.length + 0); };
const KIT_TIER = {}; // used only for reporting
function candidates(item, kind) {
  const out = [];
  for (const b of builds) {
    const cls = GAME_DATA.CLASSES[b.cid]; const path = cls.paths.find((x) => x.id === b.path);
    const pr = defaultProficiencies(cls, path || {});
    let ok, grant = null;
    if (kind === 'weapon') { ok = (pr.weaponTypes[item.type] || 0) >= 3; if (!ok) { const rs = (path?.recommended || cls.recommended || {}); const top = Object.entries(rs).sort((a, c) => c[1] - a[1])[0]?.[0]; ok = top === item.stat; grant = { weaponTypes: { [item.type]: 3 } }; } }
    else { ok = (pr.armor[item.type] || 0) >= 3; if (!ok) { ok = (item.type === 'mech' || item.type === 'heavy') && (pr.armor.heavy >= 3); grant = { armor: { [item.type]: 3 } }; } }
    if (ok) out.push({ b, grant: (grant && !(kind === 'weapon' ? (pr.weaponTypes[item.type] || 0) >= 3 : (pr.armor[item.type] || 0) >= 3)) ? grant : null });
  }
  return out;
}
function gearDelta(item, kind, n, seedBase, noMods) {
  const tier = item.tier || 1; const encs = GEAR_BATTERY[tier].map((id) => ENCOUNTERS_V3[id]);
  const cands = candidates(item, kind); if (!cands.length) return null;
  const rng = createRng(seedBase * 7717 + item.id.length * 13 + tier);
  let wa = 0, wb = 0, N2 = 0, ra = 0, rb = 0, sa = 0, sb = 0;
  for (let t = 0; t < n; t++) {
    const enc = encs[t % encs.length]; const level = Math.max(enc.level, tier === 1 ? 1 : tier);
    const trio = [0, 1, 2].map(() => worldHero(rng, enc.level, false));
    const c = cands[rng.int(0, cands.length - 1)]; const ch = worldHero(rng, enc.level, false); ch.b = c.b; ch.race = randRace(rng, c.b.cid);
    // talents of the candidate hero depend on build: recompute
    const ch2 = (() => { const x = worldHeroFor(rng, enc.level, c.b, ch.race); return x; })();
    const kit = mkEquip(c.b.cid, c.b.path);
    const eqB = kit.equipment; const eqX = { ...eqB, [kind]: item.id };
    const bs = rng.int(1, 1e9);
    const base = trio.map((h) => v3Hero(h, enc.level));
    const run = (eq, prof) => simulateBattle({ heroes: [...base.map((_, i) => v3Hero(trio[i], enc.level)), v3Hero(ch2, enc.level, eq, kit.inventory, prof)], enemies: enc.enemies, data: GAME_DATA, seed: bs, maxRounds: 30 });
    const A = run(eqB, null), B = run(eqX, c.grant);
    wa += A.winner === 'heroes' ? 1 : 0; wb += B.winner === 'heroes' ? 1 : 0; ra += A.rounds; rb += B.rounds; sa += scoreOf(A); sb += scoreOf(B); N2++;
  }
  return { base: wa / N2, item: wb / N2, d: (wb - wa) / N2, dr: (rb - ra) / N2, ds: (sb - sa) / N2, nb: cands.length };
}
function worldHeroFor(rng, level, b, race) {
  const cls = CLASSES[b.cid]; const path = cls.paths.find((p) => p.id === b.path); const weapon = path?.weapon || cls.weapon;
  const ctx = { race: race.id, cls: b.cid, origin: null, alignment: rng.pick(ALIGN), stats: cls.recommended, level, weaponRange: weapon.range, tags: race.tags };
  const owned = [];
  for (const slot of ['race', 'job', 'faction', 'alignment']) { const opts = talentsForSlot(slot, ctx).filter(isCombatTalent); if (opts.length && rng() < 0.75) owned.push(rng.pick(opts)); }
  const uniq = [...new Map(owned.map((t) => [t.id, t])).values()]; const active = uniq.slice(0, COMBAT_TALENT_LIMIT(level)).map((t) => t.id);
  return { b, race, talents: active, active, gadget: gadgetFor(b.cid)?.id || null };
}
function printGear() {
  const cat = opt('--cat', 'both'); const only = opt('--items', null)?.split(',');
  console.log(`\n=== Gear: hero with item X vs the same hero with his starter item (paired), n=${N}/item, seed ${SEED}; d = pp winrate, dR = rounds ===`);
  const rows = [];
  for (const [kind, pool] of [['weapon', WEAPONS], ['armor', ARMOR]]) {
    if (cat !== 'both' && cat !== kind) continue;
    for (const it of Object.values(pool)) {
      if (only && !only.includes(it.id)) continue; if (it.natural) continue;
      const r = gearDelta(it, kind, N, SEED);
      if (!r) { console.log(`${kind} ${it.id} t${it.tier}: no candidates`); continue; }
      rows.push({ kind, it, r });
      console.log(`${kind.padEnd(6)} ${it.id.padEnd(20)} t${it.tier} ${(it.type || '').padEnd(10)} p${String(it.price).padStart(5)} base ${pc(r.base)} item ${pc(r.item)} d ${pp(r.d).padStart(6)} dR ${r.dr.toFixed(1).padStart(5)} dS ${(100 * r.ds).toFixed(0).padStart(4)} builds ${r.nb}`);
    }
  }
  // tier x category means and outliers
  const groups = {};
  for (const x of rows) { const k = `${x.kind}:${x.it.type === 'cloth' || x.kind === 'armor' ? x.it.type : 'w'}:t${x.it.tier}`; (groups[k] ||= []).push(x); }
  const tm = {}; for (const x of rows) { const k = `${x.kind}:t${x.it.tier}`; (tm[k] ||= []).push(x.r.d); }
  console.log('\ntier means (kind:tier -> mean d, n):'); for (const k of Object.keys(tm).sort()) console.log(`  ${k.padEnd(10)} ${pp(tm[k].reduce((a, b) => a + b, 0) / tm[k].length).padStart(6)} (${tm[k].length})`);
  console.log('outliers (|d - tier mean| > 8pp):');
  for (const x of rows) { const k = `${x.kind}:t${x.it.tier}`; const m = tm[k].reduce((a, b) => a + b, 0) / tm[k].length; if (Math.abs(x.r.d - m) > 0.08) console.log(`  ${x.it.id} t${x.it.tier} d ${pp(x.r.d)} vs mean ${pp(m)}${x.it.unique ? ' (relic)' : ''}`); }
}
export { kindV3, TARGET_V3, worldHero, v3Hero };
const t0 = Date.now();
if (process.argv[1] && process.argv[1].endsWith('balance.mjs')) {
if (MODE === 'v3') printV3();
if (MODE === 'gear') printGear();
for (const L of levels) {
  if (MODE === 'party' || MODE === 'all') printParty(L);
  if (MODE === 'solo' || MODE === 'all') printSolo(L);
  if (MODE === 'races') printRaces(L);
}
if (MODE === 'prologue' || MODE === 'all') printPrologue();
if (MODE === 'world') printWorld();
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
