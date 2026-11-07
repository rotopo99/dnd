// Broken links in the world density data (third-exodus.md §3): nodes, NPCs, quests, encounters, items, skills, factions.
// Usage: node tools/sim/check-density.mjs  (exit 1 on errors)
import { GAME_DATA } from '../../game/src/data/index.js';
import { SKILLS } from '../../game/src/data/talents.js';
import { NPCS } from '../../game/src/data/npcs.js';
import { FACTIONS } from '../../game/src/data/factions.js';
import { RACES } from '../../game/src/data/races.js';
import { LOCATIONS, QUESTS, EVENTS, ITEMS, npcsAt } from '../../game/src/world/data.js';
import { FACTION_IDS, normFaction } from '../../game/src/world/reputation.js';
import { DENSITY_NPCS } from '../../game/src/data/world/density-npcs.js';
import { QUESTS_DENSITY } from '../../game/src/data/world/density-quests.js';
import { EVENTS_DENSITY } from '../../game/src/data/world/density-events.js';
import { CACHES_DENSITY } from '../../game/src/data/world/density-caches.js';
const errs = [];
const bad = (where, what) => errs.push(`${where}: ${what}`);
const loc = (w, id) => { if (id && !LOCATIONS[id]) bad(w, `node "${id}"`); };
const item = (w, id) => { if (!ITEMS[id]) bad(w, `item "${id}"`); };
const skill = (w, id) => { if (!SKILLS[id]) bad(w, `skill "${id}"`); };
const enc = (w, id) => { if (!GAME_DATA.ENCOUNTERS[id]) bad(w, `encounter "${id}"`); };
const fac = (w, f) => { if (!FACTION_IDS.includes(normFaction(f))) bad(w, `faction "${f}"`); };
const known = new Set(Object.keys(FACTIONS).concat(['none', 'technikums', 'predlozhka']));
for (const n of DENSITY_NPCS) {
  const w = `npc ${n.id}`;
  loc(w, n.location);
  if (!known.has(n.faction) && !FACTION_IDS.includes(normFaction(n.faction))) bad(w, `faction "${n.faction}"`);
  if (!RACES[n.race] && !['ai', 'unknown'].includes(n.race)) bad(w, `race "${n.race}"`);
  if (n.quest && !QUESTS[n.quest]) bad(w, `quest "${n.quest}"`);
  if (LOCATIONS[n.location] && !npcsAt(n.location).includes(n.id)) bad(w, `not shown at ${n.location}`);
}
const goal = (w, g) => {
  if (!g) return;
  loc(w, g.location);
  if (g.kind === 'talk' && !NPCS[g.npc]) bad(w, `npc "${g.npc}"`);
  if (g.kind === 'battle') enc(w, g.encounter);
  if (g.kind === 'item') item(w, g.item);
  for (const s of g.skills || []) skill(w, s);
  for (const o of g.options || []) { goal(`${w}/${o.id}`, o.goal); for (const it of o.effects?.items || []) item(w, it.item); }
  for (const sg of g.goals || []) goal(w, sg);
};
for (const q of QUESTS_DENSITY) {
  const w = `quest ${q.id}`;
  if (!NPCS[q.giver]) bad(w, `giver "${q.giver}"`);
  else if (!DENSITY_NPCS.some((n) => n.id === q.giver && n.quest === q.id)) bad(w, `giver ${q.giver} has no quest link`);
  for (const s of q.stages) { goal(`${w}/${s.id}`, s.goal); if (s.next && !q.stages.some((x) => x.id === s.next)) bad(w, `next "${s.next}"`); }
  for (const it of q.rewards?.items || []) item(w, it.item);
  for (const f of Object.keys(q.rewards?.rep || {})) fac(w, f);
}
const outcome = (w, o) => {
  if (!o) return;
  for (const it of o.items || []) item(w, it.item);
  for (const f of Object.keys(o.rep || {})) fac(w, f);
  if (o.battle?.encounter) enc(w, o.battle.encounter);
};
for (const ev of Object.values(EVENTS_DENSITY)) {
  const w = `event ${ev.id}`;
  loc(w, ev.location);
  if (!EVENTS[ev.id]) bad(w, 'not merged');
  for (const c of ev.choices) { if (c.check) skill(w, c.check.skill); outcome(`${w}/${c.id}`, c.success); outcome(`${w}/${c.id}`, c.fail); }
}
for (const c of CACHES_DENSITY) {
  const w = `cache ${c.id}`;
  loc(w, c.node);
  skill(w, c.check?.skill);
  for (const id of c.loot) item(w, id);
  if (LOCATIONS[c.node] && !LOCATIONS[c.node].caches.some((x) => x.id === c.id)) bad(w, 'not on node');
}
const ids = [...DENSITY_NPCS.map((n) => n.id), ...QUESTS_DENSITY.map((q) => q.id), ...CACHES_DENSITY.map((c) => c.id)];
for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) bad('dup', id);
console.log(`density: ${DENSITY_NPCS.length} NPC, ${QUESTS_DENSITY.length} quests, ${Object.keys(EVENTS_DENSITY).length} events, ${CACHES_DENSITY.length} caches`);
console.log(errs.length ? errs.join('\n') : 'no broken links');
process.exit(errs.length ? 1 : 0);
