// «Память киберспейса» — meta-progression between runs (docs/specs/roguelike.md §7). Own localStorage key
// (`dnd.run.meta`), apart from world saves; every storage call is wrapped in try/catch (private mode / tests).
// Pure logic: tools/test.mjs passes its own storage via setMetaStorage.
import { META, TEMPLATES, ASCENSIONS } from '../data/roguelike.js';
import { runMemory } from './run.js';

export const META_KEY = 'dnd.run.meta';
export const META_VERSION = 1;

let custom = null;
/** Tests: an object with getItem/setItem (null — back to localStorage). */
export function setMetaStorage(s) { custom = s; }
const store = () => { if (custom) return custom; try { return globalThis.localStorage || null; } catch { return null; } };

export const freshMeta = () => ({ version: META_VERSION, memory: 0, earned: 0, unlocked: [], ascMax: 0, spirit: null, runs: 0, wins: 0, best: 0 });

export function loadMeta() {
  try {
    const raw = store()?.getItem(META_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (!m || typeof m !== 'object') return freshMeta();
    return { ...freshMeta(), ...m, version: META_VERSION, unlocked: Array.isArray(m.unlocked) ? m.unlocked : [] };
  } catch { return freshMeta(); }
}
export function saveMeta(m) {
  try { store()?.setItem(META_KEY, JSON.stringify(m)); return true; } catch { return false; }
}

export const unlockDef = (id) => META.unlocks.find((u) => u.id === id);
/** Unlocks that can be bought (ascension is earned, not bought). */
export const shopUnlocks = () => META.unlocks.filter((u) => u.kind !== 'ascension');
export const owns = (m, id) => m.unlocked.includes(id);

/** → null (ok) | 'owned' | 'memory' */
export function buyBlock(m, id) {
  const u = unlockDef(id);
  if (!u || u.kind === 'ascension') return 'owned';
  if (owns(m, id)) return 'owned';
  if (m.memory < u.cost) return 'memory';
  return null;
}
export function buyUnlock(m, id) {
  if (buyBlock(m, id)) return false;
  m.memory -= unlockDef(id).cost;
  m.unlocked.push(id);
  saveMeta(m);
  return true;
}

const lockedRaces = (m) => new Set(META.unlocks.filter((u) => u.kind === 'race' && !owns(m, u.id)).map((u) => u.ref));
/** Templates with availability: { ...tpl, open, races (allowed by race unlocks) }. */
export function templatesFor(m) {
  const lr = lockedRaces(m);
  return TEMPLATES.map((t) => {
    const u = META.unlocks.find((x) => x.kind === 'template' && x.ref === t.id);
    const races = t.races.filter((r) => !lr.has(r));
    return { ...t, open: (t.unlocked || (u && owns(m, u.id))) && races.length > 0, races: races.length ? races : t.races, unlock: u?.id || null };
  });
}

/** Start bonus of owned kits and the saved spirit → newRun({ bonus }). */
export function startBonus(m) {
  const b = { credits: 0, items: [], relics: [], freeTalents: 0, spiritWeapon: null };
  for (const u of META.unlocks) {
    if (u.kind !== 'startKit' || !owns(m, u.id)) continue;
    b.credits += u.credits || 0;
    for (const it of u.add || []) b.items.push(it);
    b.freeTalents += u.extraTalentChoice || 0;
  }
  if (m.spirit) {
    b.freeTalents += META.spirit.bonus.freeTalentReward || 0;
    if (META.spirit.bonus.carryWeapon && m.spirit.weapon) b.spiritWeapon = m.spirit.weapon;
  }
  return b;
}
/** The spirit is spent by starting a run. */
export function consumeSpirit(m) { if (m.spirit) { m.spirit = null; saveMeta(m); } }

export const unlockedRelics = (m) => m.unlocked.filter((id) => unlockDef(id)?.kind === 'relicPool');
export const ascMaxLevel = () => ASCENSIONS[ASCENSIONS.length - 1].lvl;

/** Finish a run into meta: memory (always, even on a loss), stats, ascension N+1 on a win at N. → { gained, ascUnlocked } */
export function recordRun(m, run) {
  const mem = runMemory(run);
  m.memory += mem.total; m.earned += mem.total; m.runs++;
  let ascUnlocked = null;
  if (run.status === 'win') {
    m.wins++;
    if (run.asc >= m.ascMax && run.asc < ascMaxLevel()) { m.ascMax = run.asc + 1; ascUnlocked = m.ascMax; }
  }
  m.best = Math.max(m.best || 0, run.act + (run.status === 'win' ? 1 : 0));
  saveMeta(m);
  return { gained: mem.total, mem, ascUnlocked };
}

/** Keep a dead hero of the run as the spirit (one slot, costs memory). → true | reason */
export function saveSpirit(m, death) {
  if (m.memory < META.spirit.saveCost) return 'memory';
  m.memory -= META.spirit.saveCost;
  m.spirit = { name: death.name, cls: death.cls, race: death.race, weapon: death.weapon || null };
  saveMeta(m);
  return true;
}
