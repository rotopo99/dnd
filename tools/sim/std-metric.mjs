// Smoke-style (ENCOUNTERS.standard5 x level/5, all races/paths) win rate per class by metric stage. Usage: node tools/sim/std-metric.mjs [--n 20] [--levels 5,10,15,20] [--only cls] [--metric 0|2]
import { RACES } from '../../game/src/data/races.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from '../../game/src/data/effects.js';
import { ENEMIES, ENCOUNTERS } from '../../game/src/data/enemies.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { simulateBattle } from '../../game/src/rules/simulate.js';
const a = process.argv.slice(2); const o = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const N = +o('--n', 20), ONLY = o('--only', null), M = +o('--metric', 2), LV = o('--levels', '5,10,15,20').split(',').map(Number);
const data = { RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE };
const races = Object.values(RACES).filter((r) => r.playable);
const res = {};
for (const L of LV) { const base = ENCOUNTERS[L === 1 ? 'standard1' : 'standard5']; const enemies = Array.from({ length: Math.max(1, Math.floor(L / 5)) }, () => base.enemies).flat();
  for (const cid of CLASS_ORDER) { if (ONLY && ONLY !== cid) continue; const cls = CLASSES[cid]; let w = 0, t = 0, r = 0; const byPath = {};
    for (const race of races) { if (!isAllowed(race, cls)) continue; for (const p of cls.paths) for (let i = 0; i < N; i++) {
      const h = buildCreature({ race, cls, level: L, path: p.id, data, asi: 'auto' }); const x = simulateBattle({ heroes: [h], enemies, data, seed: 1 + i, maxRounds: 40, metric: M });
      t++; r += x.rounds; const win = x.winner === 'heroes'; if (win) w++; (byPath[p.id] ||= [0, 0]); byPath[p.id][1]++; if (win) byPath[p.id][0]++; } }
    (res[cid] ||= {})[L] = `${(100 * w / t).toFixed(0)}% r${(r / t).toFixed(1)} [${Object.entries(byPath).map(([k, v]) => k.slice(0, 3) + (100 * v[0] / v[1]).toFixed(0)).join(' ')}]`; } }
console.log('metric', M); for (const c of Object.keys(res)) console.log(c.padEnd(11) + LV.map((l) => (res[c][l] || '').padEnd(34)).join(''));
