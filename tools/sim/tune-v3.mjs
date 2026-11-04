// Tunes POWER_V3 (enemies-v3.js) per battle by bisection to the centre of the target band.
// Usage: node tools/sim/tune-v3.mjs [--n 150] [--seed 5] [--part i/k] [--out file.json] [--only id,id] [--from file.json]
// Output: JSON { id: power }. Apply: node tools/sim/tune-v3.mjs --apply file.json [file2.json ...] (rewrites POWER_V3 in enemies-v3.js).
import fs from 'node:fs';
import { ENCOUNTERS_V3, scaleV3 } from '../../game/src/data/enemies-v3.js';
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
const N = Number(opt('--n', 150)), SEED = Number(opt('--seed', 5));
const [pi, pk] = opt('--part', '0/1').split('/').map(Number);
const only = opt('--only', null)?.split(',');
const prev = opt('--from', null) ? JSON.parse(fs.readFileSync(opt('--from'), 'utf8')) : {};
const out = {};
const ids = Object.keys(ENCOUNTERS_V3).filter((_, i) => i % pk === pi).filter((id) => !only || only.includes(id));
const rnd = (x) => Math.round(x * 20) / 20;
for (const id of ids) {
  const enc0 = ENCOUNTERS_V3[id]; const base = enc0.enemies.map((x) => x.split('^')[0]);
  const tg = TARGET_V3[kindV3(id)]; const mid = (tg[0] + tg[1]) / 2;
  const at = (p) => v3Rate({ ...enc0, enemies: base.map((b) => scaleV3(b, p)) }, N, SEED);
  let lo = 0.4, hi = 7, best = null;
  for (let it = 0; it < 9; it++) { const m = (lo + hi) / 2; const r = at(rnd(m)); best = { p: rnd(m), ...r }; if (r.rate > mid) lo = m; else hi = m; }
  out[id] = best.p;
  console.log(`${id.padEnd(26)} p ${best.p} win ${(100 * best.rate).toFixed(0)}% rounds ${best.rounds.toFixed(1)} foes ${base.length}`);
}
if (opt('--out', null)) fs.writeFileSync(opt('--out'), JSON.stringify(out));
