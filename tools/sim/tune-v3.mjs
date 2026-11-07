// Tunes POWER_V3 (enemies-v3.js) per battle by bisection to the centre of the target band.
// Usage: node tools/sim/tune-v3.mjs [--n 150] [--seed 5] [--part i/k] [--out file.json] [--only id,id] [--from file.json]
// Output: JSON { id: power }. Apply: node tools/sim/tune-v3.mjs --apply file.json [file2.json ...] (rewrites POWER_V3 in enemies-v3.js; ENCOUNTERS_V3 + ENCOUNTERS_V4). NB: --apply replaces the WHOLE table — merge with the current POWER_V3 first (tools/sim/merge-power.mjs).
import fs from 'node:fs';
import { ENCOUNTERS_V3, scaleV3, SCALE_V3 } from '../../game/src/data/enemies-v3.js';
import { ENCOUNTERS_V4 } from '../../game/src/data/enemies-v4.js';
const ALL_ENC = { ...ENCOUNTERS_V3, ...ENCOUNTERS_V4 };
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FILE = new URL('../../game/src/data/enemies-v3.js', import.meta.url).pathname;
if (args.includes('--apply')) {
  const files = args.slice(args.indexOf('--apply') + 1); const all = {};
  for (const f of files) Object.assign(all, JSON.parse(fs.readFileSync(f, 'utf8')));
  let s = fs.readFileSync(FILE, 'utf8');
  const body = Object.entries(all).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`).join('\n');
  s = s.replace(/export const POWER_V3 = \{[\s\S]*?\n\};/, `export const POWER_V3 = {\n${body}\n};`);
  fs.writeFileSync(FILE, s); console.log('applied', Object.keys(all).length); process.exit(0);
}
const { v3Rate, kindV3, TARGET_V3 } = await import('./balance.mjs');
if (process.env.SCALE) Object.assign(SCALE_V3, JSON.parse(process.env.SCALE));
const N = Number(opt('--n', 150)), SEED = Number(opt('--seed', 5));
const [pi, pk] = opt('--part', '0/1').split('/').map(Number);
const only = opt('--only', null)?.split(',');
const prev = opt('--from', null) ? JSON.parse(fs.readFileSync(opt('--from'), 'utf8')) : {};
const out = {};
const ids = Object.keys(ALL_ENC).filter((_, i) => i % pk === pi).filter((id) => !only || only.includes(id));
const rnd = (x) => Math.round(x * 20) / 20;
for (const id of ids) {
  const enc0 = ALL_ENC[id]; const base = enc0.enemies.map((x) => x.split('^')[0]);
  const tg = TARGET_V3[kindV3(id)]; const mid = args.includes('--hi') ? tg[1] - 0.02 : (tg[0] + tg[1]) / 2;
  const VARS = [null, { hp: 0.2, atk: 2, dmg: 4, kb: 1 }, { hp: 0, atk: 2, dmg: 5, kb: 0 }];
  const cands = [];
  for (const v of VARS) {
    const at = (p) => v3Rate({ ...enc0, enemies: base.map((b) => scaleV3(b, p, v)) }, N, SEED);
    let lo = 0.4, hi = 7, best = null;
    for (let it = 0; it < 9; it++) { const m = (lo + hi) / 2; const r = at(rnd(m)); best = { p: rnd(m), v, ...r }; if (r.rate > mid) lo = m; else hi = m; }
    cands.push(best);
    if (best.rounds <= 9.5 || best.p >= 6.9) break;
  }
  const okc = cands.filter((c) => c.p < 6.9);
  let best = (okc.length ? okc : cands).reduce((a, c) => (c.rounds < a.rounds - 0.3 ? c : a));
  if (cands[0].rounds <= 10) best = cands[0];
  out[id] = best.v ? { p: best.p, ...best.v } : best.p;
  console.log(`${id.padEnd(26)} p ${best.p} win ${(100 * best.rate).toFixed(0)}% rounds ${best.rounds.toFixed(1)} ${best.v ? 'var' + JSON.stringify(best.v) : ''} foes ${base.length}`);
}
if (opt('--out', null)) fs.writeFileSync(opt('--out'), JSON.stringify(out));
