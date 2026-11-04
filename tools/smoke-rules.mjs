// Smoke test of the rules engine on real game data:
// every class x every playable race x levels 1 and 5 vs ENCOUNTERS.standard1/5, N battles each;
// story maps; every v3 weapon (items/weapons.js) on a hero vs ENCOUNTERS_V3 (counts v3.1 item-property events).
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

// v3 / v3.1: every weapon of items/weapons.js on a hero vs v3 encounters (GAME_DATA: ENEMIES + ENEMIES_V3, ITEMS)
const { GAME_DATA } = await import('../game/src/data/index.js');
const { WEAPONS } = await import('../game/src/data/items/weapons.js');
const { ENCOUNTERS_V3 } = await import('../game/src/data/enemies-v3.js');
const v3enc = Object.values(ENCOUNTERS_V3).filter((e) => (e.enemies || []).every((id) => GAME_DATA.ENEMIES[id]));
const kit = { 'smoke-grenade': 1, 'emp-grenade': 1, 'adrenaline-stim': 1, 'codeine-syrup': 1 };
const seen = {};
const NEW_EVENTS = ['throw', 'pickUp', 'weaponArea', 'weaponCharge', 'weaponEnr', 'overheat', 'zone', 'onlySkip', 'onDeath', 'turnPenalty', 'withdrawalPending'];
let v3wins = 0, v3total = 0;
const wlist = Object.values(WEAPONS);
for (let wi = 0; wi < wlist.length; wi++) {
  const w = wlist[wi];
  for (let i = 0; i < N; i++) {
    const enc = v3enc[(wi * 7 + i) % v3enc.length];
    const cid = CLASS_ORDER[(wi + i) % CLASS_ORDER.length];
    try {
      const level = Math.max(1, Math.min(5, enc.level || 1));
      const race = isAllowed('human', CLASSES[cid]) ? 'human' : CLASSES[cid].allowedRaces[0];
      const h1 = buildCreature({ race, cls: cid, level, data: GAME_DATA, equipment: { weapon: w.id }, inventory: kit });
      const h2 = buildCreature({ race: 'human', cls: CLASS_ORDER[(wi + i + 3) % CLASS_ORDER.length], level, data: GAME_DATA });
      const r = simulateBattle({ heroes: [h1, h2], enemies: enc.enemies, data: GAME_DATA, seed: SEED + wi * 31 + i, maxRounds: 30, log: true });
      battles++; v3total++;
      if (r.winner === 'heroes') v3wins++;
      for (const e of r.log) if (NEW_EVENTS.includes(e.type)) seen[e.type] = (seen[e.type] || 0) + 1;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`ERROR v3 weapon ${w.id} vs ${enc.id} seed ${SEED + i}:`, e.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
}
rows.push(`v3 weapons x encounters: ${v3total} battles, heroes win ${(100 * v3wins / Math.max(1, v3total)).toFixed(0)}% (${v3enc.length}/${Object.keys(ENCOUNTERS_V3).length} encounters resolvable)`);
rows.push(`v3.1 events: ${JSON.stringify(seen)}`);

console.log(rows.join('\n'));
console.log(`\n${battles} battles, ${errors} exceptions, ${skipped} disallowed class/race pairs skipped (per level), ${Date.now() - t0} ms`);
process.exit(errors ? 1 : 0);
