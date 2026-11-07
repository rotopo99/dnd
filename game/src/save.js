// Save game in localStorage (world.md §8). Every access is wrapped in try/catch: private mode / quota / old data
// must never break the game. loadGame() normalises the object (defaults, types, unknown ids dropped).
import { TALENTS } from './data/talents.js';
import { NPCS } from './data/npcs.js';
import { LOCATIONS, START_LOCATION, START_DISCOVERED, QUESTS, ITEMS, resolveLocation, starterKit } from './world/data.js';
import { FACTION_IDS } from './world/reputation.js';
import { WORLD_RULES as R } from './data/world/rules.js';
import { MAX_LEVEL } from './rules/progression.js';

export const SAVE_KEY = 'ruslania-save-v1';
export const SAVE_VERSION = 1;

let onError = null;
/** Called with no args when a save could not be written (UI shows a toast). */
export function setSaveErrorHandler(fn) { onError = fn; }

export function hasSave() {
  try {
    return !!globalThis.localStorage?.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const uniq = (a) => [...new Set(a)];

/** Defaults, types and id validation. Returns null if the hero itself is unusable. */
export function normalizeSave(s, data) {
  if (!s || typeof s !== 'object' || !s.hero || typeof s.hero !== 'object') return null;
  const h = s.hero;
  if (!data?.RACES?.[h.race] || !data?.CLASSES?.[h.cls]) return null;
  const out = { ...s, version: SAVE_VERSION };
  out.day = Math.max(1, num(s.day, 1));
  out.seed = num(s.seed, 1);
  const talents = uniq(arr(h.talents).filter((id) => TALENTS[id]));
  out.hero = {
    ...h, name: String(h.name || '').slice(0, 24) || '—',
    level: Math.min(MAX_LEVEL, Math.max(1, num(h.level, 1))), xp: Math.max(0, num(h.xp)),
    talents, activeCombat: uniq(arr(h.activeCombat).filter((id) => talents.includes(id))),
    hp: h.hp == null ? null : Math.max(0, num(h.hp)), mrl: h.mrl == null ? null : Math.max(0, num(h.mrl)),
    judgeMarks: Math.max(0, Math.min(R.cyberspace.maxMarks, num(h.judgeMarks))), credits: Math.max(0, num(h.credits, R.start.credits)),
    items: Object.fromEntries(Object.entries(obj(h.items)).filter(([k]) => ITEMS[k]).map(([k, v]) => [k, Math.max(0, num(v))])),
    pendingTalents: Math.max(0, num(h.pendingTalents)), uniqueTalent: !!h.uniqueTalent,
    // levels-20.md: ASI choices, levels waiting for a choice, levels not yet shown in the level-up window
    asi: arr(h.asi).filter((e) => e && Number.isInteger(e.level) && (e.talent ? TALENTS[e.talent] : e.stats && typeof e.stats === 'object')),
    pendingAsi: uniq(arr(h.pendingAsi).filter((l) => Number.isInteger(l))), levelNews: uniq(arr(h.levelNews).filter((l) => Number.isInteger(l))),
    equipment: normEquipment(h.equipment, h.cls, h.path),
  };
  out.party = arr(s.party).filter((p) => p && NPCS[p.npc]).map((p) => ({
    approval: 0, talents: [], warned: false, ultimatum: false, ...p,
    state: ['active', 'waiting', 'cyberspace', 'left'].includes(p.state) ? p.state : 'waiting',
    hp: p.hp == null ? null : Math.max(0, num(p.hp)), mrl: p.mrl == null ? null : Math.max(0, num(p.mrl)),
    approval: num(p.approval), talents: arr(p.talents).filter((id) => TALENTS[id]),
    // v4: companion gear (old saves — the class starter kit)
    equipment: normEquipment(p.equipment, data.CLASSES[NPCS[p.npc].cls] ? NPCS[p.npc].cls : 'zabivnoy', NPCS[p.npc].path),
  }));
  // v3: v1.0 ids are aliases on the canon map → stored as their real node (resolveLocation)
  const loc = (id) => (LOCATIONS[id] ? resolveLocation(id) : null);
  const locs = (a) => uniq(arr(a).map(loc).filter(Boolean));
  out.location = loc(s.location) || START_LOCATION;
  out.prevLocation = loc(s.prevLocation);
  out.discovered = uniq([...START_DISCOVERED, ...locs(s.discovered), out.location]);
  out.visited = locs(s.visited);
  const rep = obj(s.rep);
  out.rep = Object.fromEntries(FACTION_IDS.map((f) => [f, Math.max(-100, Math.min(100, num(rep[f])))]));
  out.quests = Object.fromEntries(Object.entries(obj(s.quests)).filter(([id, q]) => QUESTS[id] && q && QUESTS[id].stages.some((x) => x.id === q.stage))
    .map(([id, q]) => [id, { opt: null, subs: {}, fails: {}, failedOpts: {}, ...q, subs: obj(q.subs), fails: obj(q.fails), failedOpts: obj(q.failedOpts) }]));
  out.terminals = obj(s.terminals);
  for (const l of Object.values(LOCATIONS)) if (l.terminal && !['ritual', 'dead', 'ours'].includes(out.terminals[l.terminal.id])) out.terminals[l.terminal.id] = l.terminal.state;
  out.flags = Object.fromEntries(Object.entries(obj(s.flags)).map(([k, v]) => {
    const m = /^route:([^:]+):([^:]+)$/.exec(k); // opened hidden routes keyed by old ids
    return [m ? `route:${loc(m[1]) || m[1]}:${loc(m[2]) || m[2]}` : k, v];
  })); out.deeds = obj(s.deeds); out.npcs = obj(s.npcs); out.memo = obj(s.memo);
  out.caches = uniq(arr(s.caches)); out.battlesDone = uniq(arr(s.battlesDone)); out.events = arr(s.events);
  out.journal = arr(s.journal).filter((e) => e && typeof e.text === 'string').slice(-200);
  out.settings = { aiCompanions: false, ...obj(s.settings) };
  out.cyberspace = s.cyberspace && typeof s.cyberspace === 'object' ? s.cyberspace : null;
  out.pendingTalentChoice = arr(s.pendingTalentChoice);
  return out;
}

/** Equipment ids must exist in the item catalogue; a save without gear gets the class starter kit (same numbers as the class weapon). */
function normEquipment(e, cls, path) {
  const ok = (id, cat) => (typeof id === 'string' && ITEMS[id]?.slot === cat ? id : null);
  if (!e || typeof e !== 'object') {
    const k = starterKit(cls, path);
    return k ? { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] } : null;
  }
  return { weapon: ok(e.weapon, 'weapon'), armor: ok(e.armor, 'armor'), offhand: ok(e.offhand, 'offhand'), mods: uniq(arr(e.mods).filter((m) => ok(m, 'mod'))) };
}

/** Returns the normalised save or null (missing / corrupted / other version). */
export function loadGame(data) {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    return normalizeSave(s, data);
  } catch {
    return null;
  }
}

export function saveGame(save) {
  if (!save) return false;
  try {
    if (save.battlesDone) save.battlesDone = uniq(save.battlesDone);
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    onError?.();
    return false;
  }
}

export function deleteSave() {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* no-op */
  }
}
