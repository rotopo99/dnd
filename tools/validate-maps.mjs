// Checker of hand-made maps (docs/specs/level-design.md §7.3): node tools/validate-maps.mjs [file.js|file.json …] [--quiet]
// Without files — every map of game/src/data/maps/handmade/index.js. Exit code 1 on errors. Logic — world/handmade-check.js.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateAll } from '../game/src/world/handmade-check.js';
import { HANDMADE_LIST } from '../game/src/data/maps/handmade/index.js';
import { ENEMIES, ENCOUNTERS, ITEMS } from '../game/src/data/index.js';
import { NPCS } from '../game/src/data/npcs.js';
import { LOCATIONS } from '../game/src/data/world/locations.js';
import { SKILLS } from '../game/src/data/talents.js';
import { PROPS } from '../game/src/assets/props.js';

export const REFS = { ENEMIES, ENCOUNTERS, ITEMS, NPCS, LOCATIONS, SKILLS, PROPS };

async function load(f) {
  const p = resolve(f);
  if (p.endsWith('.json')) return JSON.parse(readFileSync(p, 'utf8'));
  return (await import(pathToFileURL(p).href)).default;
}

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const files = args.filter((a) => !a.startsWith('--'));
const defs = files.length ? await Promise.all(files.map(load)) : HANDMADE_LIST;
const res = validateAll(defs, REFS);
let bad = 0;
for (const [id, r] of Object.entries(res)) {
  if (id === '_all' && !r.errors.length) continue;
  bad += r.errors.length;
  console.log(`${r.errors.length ? 'FAIL' : 'ok  '} ${id}${quiet ? '' : `  ${JSON.stringify(r.stats)}`}`);
  for (const e of r.errors) console.log(`   error: ${e}`);
  if (!quiet) for (const w of r.warnings) console.log(`   warn:  ${w}`);
}
console.log(bad ? `\n${bad} error(s)` : '\nall maps ok');
process.exit(bad ? 1 : 0);
