// Save game in localStorage (world.md §8). Every access is wrapped in try/catch: private mode / quota / old data
// must never break the game. loadGame() normalises the object (defaults, types, unknown ids dropped).
import { TALENTS } from './data/talents.js';
import { NPCS } from './data/npcs.js';
import { LOCATIONS, START_LOCATION, START_DISCOVERED, QUESTS, ITEMS, resolveLocation, starterKit } from './world/data.js';
import { FACTION_IDS, startMet, normFaction } from './world/reputation.js';
import { locFaction } from './world/state.js';
import { npcRepFaction } from './world/data.js';
import { WORLD_RULES as R } from './data/world/rules.js';
import { MAX_LEVEL } from './rules/progression.js';
import { EXODUS } from './data/world/exodus.js';
import { normCodex } from './world/codex.js';
import { normalizeInventory, syncItems } from './world/inventory.js';

export const SAVE_KEY = 'ruslania-save-v1'; // the autosave slot (also the single save of older versions)
export const SAVE_VERSION = 1;
/** Manual slots 1..SLOT_COUNT + 'auto'. Every saveGame() writes the autosave; saveToSlot() — a manual slot. */
export const SLOT_COUNT = 4;
export const SLOTS = ['auto', ...Array.from({ length: SLOT_COUNT }, (_, i) => i + 1)];
export const slotKey = (slot) => (slot === 'auto' ? SAVE_KEY : `${SAVE_KEY}-slot${slot}`);

let onError = null;
/** Called with no args when a save could not be written (UI shows a toast). */
export function setSaveErrorHandler(fn) { onError = fn; }

function readRaw(slot) {
  try {
    return globalThis.localStorage?.getItem(slotKey(slot)) || null;
  } catch {
    return null;
  }
}

/** Any slot has a save. */
export function hasSave() { return SLOTS.some((s) => !!readRaw(s)); }

/**
 * Slot list for the load / save windows: [{ slot, empty, broken?, name, level, location, day, savedAt }].
 * Reads only the header fields (no normalisation); `location` is the raw id.
 */
export function listSlots() {
  return SLOTS.map((slot) => {
    const raw = readRaw(slot);
    if (!raw) return { slot, empty: true };
    try {
      const s = JSON.parse(raw);
      if (!s?.hero || s.version !== SAVE_VERSION) return { slot, empty: false, broken: true };
      return { slot, empty: false, name: s.hero.name, level: s.hero.level || 1, location: s.location, day: s.day || 1, savedAt: s.savedAt || 0, cyberspace: !!s.cyberspace };
    } catch {
      return { slot, empty: false, broken: true };
    }
  });
}

/** The most recently written usable slot (for «Продолжить»), or null. */
export function latestSlot() {
  const ok = listSlots().filter((x) => !x.empty && !x.broken);
  if (!ok.length) return null;
  ok.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || (a.slot === 'auto' ? -1 : 1));
  return ok[0].slot;
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
    // 3D avatar (ui/avatar3d.js look object); old saves have none -> 2D portrait
    avatar: h.avatar && typeof h.avatar === 'object' && h.avatar.v === 1 ? h.avatar : null,
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
  // factions met (reputation hidden until then); old saves: prologue + origin + factions of visited nodes and met NPCs
  out.met = Array.isArray(s.met) ? uniq(s.met.filter((f) => FACTION_IDS.includes(f)))
    : uniq([...startMet(h.origin), ...out.visited.map(locFaction), ...Object.keys(obj(s.npcs)).filter((id) => NPCS[id] && s.npcs[id]?.met).map((id) => normFaction(npcRepFaction(NPCS[id])))]
      .filter((f) => FACTION_IDS.includes(f)));
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
  out.codex = normCodex(s.codex); // vendors-bestiary.md: bestiary progress (old saves — empty)
  out.pendingRadio = arr(s.pendingRadio).filter((id) => QUESTS[id]); // quest radio calls not shown yet (world/quests.js)
  // third-exodus.md: the Exodus timer; old saves after the prologue start it now (full T0)
  const ex = obj(s.exodus);
  out.exodus = s.exodus && typeof s.exodus === 'object'
    ? { start: Math.max(1, num(ex.start, out.day)), ext: Math.max(0, Math.min(EXODUS.extCap, num(ex.ext))), mark: Math.max(0, Math.min(EXODUS.marks.length, Math.floor(num(ex.mark)))) }
    : out.flags[EXODUS.startFlag] ? { start: out.day, ext: 0, mark: 0 } : null;
  // v7 (inventory-mods.md §5): backpack grids, quick slots, stash; old saves (v < 2) — auto-layout of hero.items
  out.v = s.v;
  normalizeInventory(out);
  return out;
}

/** Equipment ids must exist in the item catalogue; a save without gear gets the class starter kit (same numbers as the class weapon). */
function normEquipment(e, cls, path) {
  const ok = (id, cat) => (typeof id === 'string' && ITEMS[id]?.slot === cat ? id : null);
  if (!e || typeof e !== 'object') {
    const k = starterKit(cls, path);
    return k ? { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] } : null;
  }
  return { weapon: ok(e.weapon, 'weapon'), armor: ok(e.armor, 'armor'), offhand: ok(e.offhand, 'offhand'), pack: ok(e.pack, 'pack'),
    mods: uniq(arr(e.mods).filter((m) => ok(m, 'mod'))), inst: obj(e.inst) };
}

/** Returns the normalised save of a slot (default — autosave) or null (missing / corrupted / other version). */
export function loadGame(data, slot = 'auto') {
  try {
    const raw = readRaw(slot);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    return normalizeSave(s, data);
  } catch {
    return null;
  }
}

/** Autosave (every world action calls it). */
export function saveGame(save) { return saveToSlot(save, 'auto'); }

/** Write a save into a slot ('auto' or 1..SLOT_COUNT). */
export function saveToSlot(save, slot) {
  if (!save) return false;
  try {
    if (save.battlesDone) save.battlesDone = uniq(save.battlesDone);
    if (save.hero?.bag) syncItems(save); // v7: old-style edits of hero.items → backpack instances
    save.savedAt = Date.now();
    globalThis.localStorage?.setItem(slotKey(slot), JSON.stringify(save));
    return true;
  } catch {
    onError?.();
    return false;
  }
}

/** Deletes the autosave (game over); manual slots stay — they are the player's. */
export function deleteSave(slot = 'auto') {
  try {
    globalThis.localStorage?.removeItem(slotKey(slot));
  } catch {
    /* no-op */
  }
}
