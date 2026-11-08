// Import check of ids for node-skill-actions.js / skill-hints.js (node tools/check-skill-data.mjs).
import { SKILLS } from '../game/src/data/talents.js';
import { LOCATIONS } from '../game/src/data/world/locations.js';
import * as D from '../game/src/world/data.js';
import { FACTIONS } from '../game/src/data/factions.js';
import { NODE_SKILL_ACTIONS, BATTLE_SKILL_TRICKS } from '../game/src/data/world/node-skill-actions.js';
import { NODE_HINTS, NPC_HINTS } from '../game/src/data/world/skill-hints.js';
import { NPCS } from '../game/src/data/npcs.js';
import { STATUSES } from '../game/src/data/effects.js';
const err = []; const ids = new Set();
const nodes = D.LOCATIONS; const kinds = new Set(Object.values(nodes).map((l) => l.kind));
const FX = ['hp', 'mrl', 'party', 'days', 'rep', 'repLocal', 'credits', 'items', 'removeItems', 'flags', 'xp', 'text'];
const itemOk = (i) => !!D.ITEMS[i];
for (const a of NODE_SKILL_ACTIONS) {
  if (ids.has(a.id)) err.push('dup ' + a.id); ids.add(a.id);
  if (!SKILLS[a.skill]) err.push(`${a.id}: skill ${a.skill}`);
  if (a.node && !nodes[D.resolveLocation(a.node)]) err.push(`${a.id}: node ${a.node}`);
  if (a.nodeType && !kinds.has(a.nodeType)) err.push(`${a.id}: nodeType ${a.nodeType}`);
  if (!a.node && !a.nodeType) err.push(`${a.id}: no where`);
  if (a.label.length > 38) err.push(`${a.id}: label ${a.label.length}`);
  for (const k of ['success', 'fail']) {
    const f = a[k]; if (!f?.text) err.push(`${a.id}.${k}: no text`);
    for (const x of Object.keys(f)) if (!FX.includes(x)) err.push(`${a.id}.${k}: fx ${x}`);
    for (const r of Object.keys(f.rep || {})) if (!FACTIONS[r]) err.push(`${a.id}.${k}: rep ${r}`);
    for (const it of f.items || []) if (!itemOk(it.item)) err.push(`${a.id}.${k}: item ${it.item}`);
  }
}
for (const b of BATTLE_SKILL_TRICKS) {
  if (!SKILLS[b.skill]) err.push('trick skill ' + b.skill);
  if (b.op.status && !STATUSES[b.op.status]) err.push('trick status ' + b.op.status);
  for (const s of b.op.cleanse || []) if (!STATUSES[s]) err.push('trick cleanse ' + s);
}
for (const [n, arr] of Object.entries(NODE_HINTS)) { if (!nodes[n]) err.push('hint node ' + n); for (const s of arr) if (!SKILLS[s]) err.push('hint skill ' + s); }
for (const [n, arr] of Object.entries(NPC_HINTS)) { if (!NPCS[n]) err.push('hint npc ' + n); for (const s of arr) if (!SKILLS[s]) err.push('hint skill ' + s); }
console.log(err.length ? err.join('\n') : 'OK', `actions ${NODE_SKILL_ACTIONS.length}, tricks ${BATTLE_SKILL_TRICKS.length}`);
process.exit(err.length ? 1 : 0);
