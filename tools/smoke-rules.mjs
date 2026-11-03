// Smoke test of the rules engine on real game data:
// every class x every playable race x levels 1 and 5 vs ENCOUNTERS.standard1/5, N battles each.
// Usage: node tools/smoke-rules.mjs [--n 20] [--seed 1]   (exit code 1 on exceptions)
import fs from 'node:fs';
import { RACES } from '../game/src/data/races.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from '../game/src/data/effects.js';
import { ENEMIES, ENCOUNTERS } from '../game/src/data/enemies.js';
import { CLASSES, CLASS_ORDER } from '../game/src/data/classes/index.js';
import { buildCreature, isAllowed } from '../game/src/rules/character.js';
import { simulateBattle } from '../game/src/rules/simulate.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const N = arg('--n', 20);
const SEED = arg('--seed', 1);
const data = { RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE };
const races = Object.values(RACES).filter((r) => r.playable);

let battles = 0, errors = 0, skipped = 0;
const t0 = Date.now();
const rows = [];
for (const level of [1, 5]) {
  const enc = ENCOUNTERS[level === 1 ? 'standard1' : 'standard5'];
  for (const cid of CLASS_ORDER) {
    const cls = CLASSES[cid];
    let wins = 0, total = 0, draws = 0;
    for (const race of races) {
      if (!isAllowed(race, cls)) { skipped++; continue; }
      for (const path of cls.paths.map((p) => p.id)) {
        for (let i = 0; i < N; i++) {
          try {
            const hero = buildCreature({ race, cls, level, path, data });
            const r = simulateBattle({ heroes: [hero], enemies: enc.enemies, data, seed: SEED + i, maxRounds: 30 });
            battles++; total++;
            if (r.winner === 'heroes') wins++;
            if (r.winner === 'draw') draws++;
          } catch (e) {
            errors++;
            if (errors <= 5) console.error(`ERROR ${cid}/${race.id}/${path} L${level} seed ${SEED + i}:`, e.stack.split('\n').slice(0, 4).join('\n'));
          }
        }
      }
    }
    rows.push(`L${level} ${cid.padEnd(11)} win ${(100 * wins / Math.max(1, total)).toFixed(0).padStart(3)}%  draws ${draws}  (${total} battles)`);
  }
}
// story maps from game/src/data/maps (map.enemies / map.allies, 'P' 'E' 'A' points)
const mapDir = new URL('../game/src/data/maps/', import.meta.url);
for (const f of fs.readdirSync(mapDir).filter((x) => x.endsWith('.js')).sort()) {
  const map = (await import(new URL(f, mapDir))).default;
  let wins = 0;
  for (let i = 0; i < N; i++) {
    try {
      const hero = buildCreature({ race: 'human', cls: CLASS_ORDER[i % CLASS_ORDER.length], level: 1, data });
      const r = simulateBattle({ map, heroes: [hero], data, seed: SEED + i, maxRounds: 30 });
      battles++;
      if (r.winner === 'heroes') wins++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`ERROR map ${f} seed ${SEED + i}:`, e.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
  rows.push(`map ${map.id.padEnd(12)} win ${(100 * wins / N).toFixed(0).padStart(3)}%  (enemies ${JSON.stringify(map.enemies)}, allies ${JSON.stringify(map.allies || [])}, win ${map.win})`);
}

console.log(rows.join('\n'));
console.log(`\n${battles} battles, ${errors} exceptions, ${skipped} disallowed class/race pairs skipped (per level), ${Date.now() - t0} ms`);
process.exit(errors ? 1 : 0);
