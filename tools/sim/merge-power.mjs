// Merge tuner outputs into the current POWER_V3 so that `tune-v3.mjs --apply` (which rewrites the whole table) keeps old entries.
// Usage: node tools/sim/merge-power.mjs out.json part1.json [part2.json ...]   then   node tools/sim/tune-v3.mjs --apply out.json
import fs from 'node:fs';
import { POWER_V3 } from '../../game/src/data/enemies-v3.js';
const [out, ...parts] = process.argv.slice(2);
const all = { ...POWER_V3 };
for (const f of parts) Object.assign(all, JSON.parse(fs.readFileSync(f, 'utf8')));
fs.writeFileSync(out, JSON.stringify(all));
console.log('merged', Object.keys(all).length, 'entries ->', out);
