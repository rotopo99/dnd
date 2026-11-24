// Packs every model meta game/assets/models/<name>.json into one file, assets/models/meta-pack.json,
// so the web build loads one file instead of ~60 (artifact hosts cap the file count).
// Run after tools/blender exports: node tools/pack-meta.mjs   (tools/test.mjs checks it is in sync)
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../game/assets/models');
export const PACK = 'meta-pack.json';

export function buildPack() {
  const out = {};
  for (const f of fs.readdirSync(DIR).sort()) {
    if (!f.endsWith('.json') || f.endsWith('.gltf.json') || f === PACK) continue;
    out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  return JSON.stringify(out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const s = buildPack();
  fs.writeFileSync(path.join(DIR, PACK), s);
  console.log(`${PACK}: ${Object.keys(JSON.parse(s)).length} models, ${s.length} bytes`);
}
