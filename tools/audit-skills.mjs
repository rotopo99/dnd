// Audit: for each skill of data/talents.js SKILLS count real application places by category (docs/qa/SKILLS-AUDIT-v3.md).
// Usage: node tools/audit-skills.mjs [--md]  (prints a table; --md writes the markdown report body).
import { SKILLS } from '../game/src/data/talents.js';
import * as D from '../game/src/world/data.js';
import { CHECK_SCENES } from '../game/src/data/world/check-scenes.js';
import { SKILL_EVENTS } from '../game/src/data/world/travel-skills.js';
import { CACHES_DENSITY } from '../game/src/data/world/density-caches.js';
import { SKILL_RULES } from '../game/src/data/world/skill-rules.js';
import { SKILL_USES2 } from '../game/src/data/world/skill-uses2.js';
import { CRIME_RULES, WANTED, ATTACK_RULES } from '../game/src/data/world/crime.js';
import { TRICKS, TRICKS2 } from '../game/src/world/skill-uses.js';
import { COMPANIONS } from '../game/src/data/companions.js';
import * as BASE from '../game/src/data/world/base.js';
let NA = []; try { NA = (await import('../game/src/data/world/node-skill-actions.js')).NODE_SKILL_ACTIONS; } catch {}
let HINTS = {}; try { HINTS = await import('../game/src/data/world/skill-hints.js'); } catch {}

const FOCUS = 3; const RAW = {};
const ids = Object.keys(SKILLS);
const cats = ['quests', 'events', 'travel', 'caches', 'systems', 'nodeActions', 'battle'];
const T = Object.fromEntries(ids.map((s) => [s, Object.fromEntries(cats.map((c) => [c, 0]))]));
const scenes = Object.fromEntries(ids.map((s) => [s, 0]));
const add = (cat, v, n = 1) => { for (const s of String(v).split('|')) if (T[s]) T[s][cat] += n; };

// generic walker: objects with `skill` (string) or `skills` (array) are one application each (per listed skill)
function walk(o, cat, seen = new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
  if (typeof o.skill === 'string') add(cat, o.skill);
  // «видимое» применение: навык один из ≤ 3 альтернатив (иначе размыто — игрок не видит, чей навык сработал)
  if (Array.isArray(o.skills) && o.skills.length <= FOCUS) for (const s of o.skills) add(cat, s);
  else if (Array.isArray(o.skills)) for (const s of o.skills) RAW[s] = (RAW[s] || 0) + 1;
  for (const v of Object.values(o)) walk(v, cat, seen);
}
const dedupeSkills = (o) => o;
walk(Object.values(D.QUESTS), 'quests');
walk(Object.values(D.EVENTS), 'events');
for (const l of Object.values(D.LOCATIONS)) walk({ c: l.caches, h: l.hidden, e: l.entry }, 'caches');
walk(CACHES_DENSITY, 'caches');
walk(SKILL_EVENTS, 'travel');
for (const sc of Object.values(CHECK_SCENES)) for (const a of sc.approaches || []) for (const s of a.skills || []) if (scenes[s] !== undefined) scenes[s]++;
walk([SKILL_RULES, CRIME_RULES, WANTED, ATTACK_RULES, BASE, COMPANIONS], 'systems');
for (const [sk, arr] of Object.entries(SKILL_USES2)) for (const u of arr) { if (u.where === 'battle') continue; add('systems', sk); }
// hard-wired skills of code (mirrored from skill-uses.js / travel / camp / shop; see audit doc section "code")
const CODE = { persuasion: ['shop haggle', 'parley', 'bribe'], deception: ['shop junk', 'parley'], intimidation: ['parley'],
  survival: ['camp rations', 'forage'], stealth: ['rest ambush', 'surprise', 'theft'], tech: ['disassemble'], medicine: ['medkit mult'],
  biology: ['samples'], athletics: ['crates'], military: ['appraise', 'pre-battle'], lockpicking: ['theft'], perception: ['ambush spot'] };
for (const [s, arr] of Object.entries(CODE)) add('systems', s, arr.length);
// battle: tricks of N6 + TRICKS2 + SKILL_USES2 where=battle
for (const s of TRICKS) add('battle', s);
for (const s of Object.keys(TRICKS2)) add('battle', s);
for (const [sk, arr] of Object.entries(SKILL_USES2)) for (const u of arr) if (u.where === 'battle' && !TRICKS2[sk]) add('battle', sk);
for (const a of NA) add('nodeActions', a.skill);
let BT = []; try { BT = (await import('../game/src/data/world/node-skill-actions.js')).BATTLE_SKILL_TRICKS || []; } catch {}
for (const b of BT) add('battle', b.skill);

const rows = ids.map((s) => { const t = T[s]; const world = t.quests + t.events + t.travel + t.caches + t.systems + t.nodeActions; return { s, ...t, scenes: scenes[s], diluted: RAW[s] || 0, world, ok: world >= 5 && t.battle >= 1 }; });
if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
else {
  const head = ['skill', ...cats, 'scenes', 'diluted', 'world', 'ok'];
  console.log(head.join('\t'));
  for (const r of rows) console.log([r.s, ...cats.map((c) => r[c]), r.scenes, r.diluted, r.world, r.ok ? 'OK' : 'LOW'].join('\t'));
}
export { rows };
