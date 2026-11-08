// Grid inventory v7 (docs/specs/inventory-mods.md): personal backpack grid + quick slots of every party member,
// the shared stash (hubs only), «На земле» (loot that did not fit), item instances { item, q, mods }, mods on
// instances, equipment instances, disassembly, save migration. Pure logic over the save object (no DOM, no save.js).
//
// Data model:
//   holder (save.hero | save.party[i]).bag = { grid: [entry], quick: [{ item, q, n } | null] (QUICK_MAX) }
//   entry = { item: id, q: 'junk'|'working'|'masterwork'|'relic', mods: [mod ids], n, x, y, r (rotated: w↔h) }
//   save.stash = { grid: [entry] } (INVENTORY.stash), save.ground = { grid: [entry] } (transient)
//   holder.equipment = { weapon, armor, offhand, pack, mods (old flat list), inst: { weapon|armor|offhand|pack: { q, mods } } }
//   save.hero.items — COUNT VIEW { id: n } of all bags + quick slots + stash (equipped not counted). Old code still
//   writes it (quests, events, location); syncItems(save) turns such edits into instances (+: hero bag → companions →
//   stash; −: quick → bag → companions → stash, junk first). Every mutator here syncs first and recounts after.
//   addInst / takeItem / receive keep the view in step themselves (B1: a stale view made syncItems delete fresh loot),
//   so new code may call them without syncItems/refreshView around; old code may keep writing the counter.
// Containers: ref { c: 'bag', key } | { c: 'stash' } | { c: 'ground' }.
import { BASE_LOCATION, BASE_UNLOCK } from '../data/world/base.js';
import { ITEMS, LOCATIONS, resolveLocation } from './data.js';
import { INVENTORY as INV } from '../data/items/inventory.js';
import { QUALITY, MOD_SLOTS } from '../data/items/mods.js';
import { isBattleItem } from '../rules/combat.js';

export const QUICK_MAX = INV.quick.max;
export const EQUIP_SLOTS = ['weapon', 'offhand', 'armor', 'pack'];
const GEAR = new Set(['weapon', 'armor', 'offhand', 'mod', 'pack']);
export const isGear = (it) => !!it && GEAR.has(it.slot);
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

// ----------------------------------------------------------------------------- items
/** Grid size [w, h] of an item (field `size` wins, else INVENTORY tables). */
export function itemSize(it) {
  if (!it) return [1, 1];
  if (Array.isArray(it.size) && it.size.length === 2) return [Math.max(1, it.size[0] | 0), Math.max(1, it.size[1] | 0)];
  if (it.slot === 'weapon') return INV.weaponSize[it.type] || INV.weaponSize[it.wtype] || [1, 3];
  if (it.slot === 'armor') return INV.armorSize[it.type] || [2, 2];
  if (it.slot === 'mod') return (it.tier || 1) >= INV.modSize.highTier ? INV.modSize.high : INV.modSize.low;
  if (it.cat === 'consumable') return INV.kindSize[it.kind] || [1, 1];
  return [1, 1];
}
/** Size of a grid entry with its rotation. */
export const entrySize = (e) => { const [w, h] = itemSize(ITEMS[e.item]); return e.r ? [h, w] : [w, h]; };
export function stackOf(it) {
  if (!it) return 1;
  if (it.stack) return it.stack;
  if (isGear(it)) return 1;
  return it.cat === 'consumable' ? INV.stackDefault.consumable : it.unique ? 1 : INV.stackDefault.misc;
}
/** Default quality of a new instance of an item id (old saves, quest rewards): relic → relic, else working. */
export const defaultQ = (it) => (it?.quality === 'relic' ? 'relic' : 'working');
export const makeInst = (id, q, mods) => ({ item: id, q: QUALITY[q] ? q : defaultQ(ITEMS[id]), mods: Array.isArray(mods) ? mods.filter((m) => ITEMS[m]?.slot === 'mod') : [] });
/** Only consumables (grenades, traps, stims, food…) and ammo go into quick slots. */
export const canQuick = (it) => !!it && (it.cat === 'consumable' || it.kind === 'ammo') && !isGear(it);
const stackable = (a, b) => a.item === b.item && (a.q || 'working') === (b.q || 'working') && !(a.mods || []).length && !(b.mods || []).length && stackOf(ITEMS[a.item]) > 1;
/** Base value of an instance: price × quality price + installed mods. */
export function instValue(inst) {
  const it = ITEMS[inst.item];
  if (!it) return 0;
  const qm = it.quality === 'relic' ? 1 : QUALITY[inst.q]?.price ?? 1;
  return Math.round((it.price || 0) * qm + (inst.mods || []).reduce((s, m) => s + (ITEMS[m]?.price || 0), 0));
}
export const qualityName = (q) => QUALITY[q]?.name || '';

// ----------------------------------------------------------------------------- holders, containers
export function holderOf(save, key = 'hero') {
  if (!save) return null;
  if (key === 'hero') return save.hero;
  return save.party.find((p) => p.npc === key) || null;
}
/** Party keys whose bags exist in the count view (hero + companions not gone). */
export const bagKeys = (save) => ['hero', ...save.party.filter((p) => p.state !== 'left').map((p) => p.npc)];
export function bagOf(holder) {
  if (!holder) return { grid: [], quick: [] };
  if (!holder.bag || typeof holder.bag !== 'object') holder.bag = { grid: [], quick: [] };
  if (!Array.isArray(holder.bag.grid)) holder.bag.grid = [];
  if (!Array.isArray(holder.bag.quick)) holder.bag.quick = [];
  while (holder.bag.quick.length < QUICK_MAX) holder.bag.quick.push(null);
  return holder.bag;
}
const eqOf = (holder) => holder?.equipment || {};
/** Backpack grid of a holder: equipped pack → its grid, else pockets. */
export function gridDims(holder) {
  const p = ITEMS[eqOf(holder).pack];
  return p?.grid ? [...p.grid] : [...INV.pockets];
}
/** Quick slots of a holder (2..6): armour type / vest `quick`, + mods `quick`, + pack `quick`. */
export function quickCount(holder) {
  const eq = eqOf(holder);
  const a = ITEMS[eq.armor];
  let n = a ? (a.quick ?? INV.quick.byArmor[a.type] ?? INV.quick.base) : INV.quick.base;
  const mods = [...(eq.mods || []), ...Object.values(eq.inst || {}).flatMap((x) => x?.mods || [])];
  for (const m of mods) n += ITEMS[m]?.quick || 0;
  n += ITEMS[eq.pack]?.quick || 0;
  return Math.max(0, Math.min(QUICK_MAX, n));
}
export function stashOf(save) {
  if (!save.stash || !Array.isArray(save.stash.grid)) save.stash = { grid: [] };
  return save.stash;
}
export function groundOf(save) {
  if (!save.ground || !Array.isArray(save.ground.grid)) save.ground = { grid: [] };
  return save.ground;
}
/** Is the stash reachable here (hub / town / camp / bunker or a node with rest)? */
export function canStash(save) {
  const L = LOCATIONS[resolveLocation(save.location)] || LOCATIONS[save.location];
  if (L && save.flags?.[BASE_UNLOCK.openOn.flag] && resolveLocation(save.location) === BASE_LOCATION) return true; // world-consequences ч.3: the base stash
  return !!L && (INV.stashKinds.includes(L.kind) || (L.services || []).includes('rest'));
}
/** { grid, w, h } of a container ref. */
export function contOf(save, ref) {
  if (ref.c === 'stash') return { grid: stashOf(save).grid, w: INV.stash[0], h: INV.stash[1] };
  if (ref.c === 'ground') return { grid: groundOf(save).grid, w: INV.ground[0], h: INV.ground[1] };
  const h = holderOf(save, ref.key);
  const [w, hh] = gridDims(h);
  return { grid: bagOf(h).grid, w, h: hh };
}

// ----------------------------------------------------------------------------- grid geometry
/** Entry index at cell (x, y) or -1. */
export function entryAt(grid, x, y) {
  return grid.findIndex((e) => { const [w, h] = entrySize(e); return x >= e.x && x < e.x + w && y >= e.y && y < e.y + h; });
}
/** Can a w×h rectangle stand at (x, y) (skip — entry ignored)? */
export function rectFree(cont, x, y, w, h, skip = null) {
  if (x < 0 || y < 0 || x + w > cont.w || y + h > cont.h) return false;
  return !cont.grid.some((e) => {
    if (e === skip) return false;
    const [ew, eh] = entrySize(e);
    return x < e.x + ew && e.x < x + w && y < e.y + eh && e.y < y + h;
  });
}
/** First free spot (left→right, top→bottom; unrotated, then rotated) → { x, y, r } | null. */
export function findSpot(cont, it, skip = null) {
  const [w, h] = itemSize(it);
  for (const r of w === h ? [false] : [false, true]) {
    const [sw, sh] = r ? [h, w] : [w, h];
    for (let y = 0; y + sh <= cont.h; y++) for (let x = 0; x + sw <= cont.w; x++) if (rectFree(cont, x, y, sw, sh, skip)) return { x, y, r };
  }
  return null;
}
/** Put n of an instance into a container: merge stacks, then free spots. Returns the count that did NOT fit. */
export function placeAuto(cont, inst, n = 1) {
  const it = ITEMS[inst.item];
  if (!it) return 0;
  const cap = stackOf(it);
  let left = n;
  for (const e of cont.grid) {
    if (left <= 0) break;
    if (!stackable(e, inst) || e.n >= cap) continue;
    const k = Math.min(left, cap - e.n);
    e.n += k; left -= k;
  }
  while (left > 0) {
    const at = findSpot(cont, it);
    if (!at) break;
    const k = Math.min(left, cap);
    cont.grid.push({ item: inst.item, q: inst.q || defaultQ(it), mods: [...(inst.mods || [])], n: k, ...at });
    left -= k;
  }
  return left;
}
/** Re-layout entries into a container (largest first, first fit); returns entries that did not fit. */
export function autoLayout(cont, entries) {
  const list = [...entries].sort((a, b) => { const [aw, ah] = itemSize(ITEMS[a.item]); const [bw, bh] = itemSize(ITEMS[b.item]); return bw * bh - aw * ah; });
  const out = [];
  for (const e of list) {
    const at = findSpot(cont, ITEMS[e.item]);
    if (!at) { out.push(e); continue; }
    cont.grid.push({ ...e, ...at });
  }
  return out;
}
/** Fit a grid into new dims: keep entries that still fit where they are, re-place the rest. null — impossible. */
function refit(entries, w, h) {
  const cont = { grid: [], w, h };
  const rest = [];
  for (const e of entries) { const [ew, eh] = entrySize(e); if (rectFree(cont, e.x, e.y, ew, eh)) cont.grid.push(e); else rest.push(e); }
  return autoLayout(cont, rest).length ? null : cont.grid;
}

// ----------------------------------------------------------------------------- count view
function eachStore(save, fn) {
  for (const key of bagKeys(save)) {
    const b = bagOf(holderOf(save, key));
    fn(b.quick, { c: 'quick', key }); fn(b.grid, { c: 'bag', key });
  }
  fn(stashOf(save).grid, { c: 'stash' });
}
/** { id: n } over all bags, quick slots and the stash. */
export function countAll(save) {
  const out = {};
  eachStore(save, (list) => { for (const e of list) if (e && ITEMS[e.item]) out[e.item] = (out[e.item] || 0) + (e.n || 1); });
  return out;
}
/** Recount save.hero.items in place (same object — old code may hold a reference). */
export function refreshView(save) {
  const items = save.hero.items || (save.hero.items = {});
  const fresh = countAll(save);
  for (const k of Object.keys(items)) if (!fresh[k]) delete items[k];
  Object.assign(items, fresh);
  return items;
}
/** Remove n of an id (quick → bag → companions → stash; junk and unmodded first). Returns removed count. */
export function takeItem(save, id, n = 1) {
  let left = n;
  const QR = { junk: 0, working: 1, masterwork: 2, relic: 3 };
  eachStore(save, (list, ref) => {
    if (left <= 0) return;
    const idx = list.map((e, i) => [e, i]).filter(([e]) => e && e.item === id)
      .sort(([a], [b]) => (QR[a.q] ?? 1) - (QR[b.q] ?? 1) || (a.mods?.length || 0) - (b.mods?.length || 0));
    for (const [e, i] of idx) {
      if (left <= 0) break;
      const k = Math.min(left, e.n || 1);
      e.n = (e.n || 1) - k; left -= k;
      if (e.n <= 0) { if (ref.c === 'quick') list[i] = null; else e.dead = true; }
    }
    if (ref.c !== 'quick') for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  });
  bump(save, id, -(n - left));
  return n - left;
}
/** Keep the count view in step with a direct instance change (counted stores only: bags, quick, stash). */
function bump(save, id, d) {
  if (!d || !save?.hero) return;
  const v = save.hero.items || (save.hero.items = {});
  const k = Math.max(0, (v[id] || 0) + d);
  if (k) v[id] = k; else delete v[id];
}
/**
 * Add n of an id/instance to a member (hero by default): his bag, then other members, then the stash
 * (`overflow: 'stash'`, default) or nothing. Returns the count that did not fit anywhere.
 */
export function addInst(save, inst, n = 1, { key = 'hero', overflow = 'stash', others = true } = {}) {
  const r = receive(save, inst, n, { key, others, stash: overflow === 'stash', ground: overflow === 'ground' });
  return r.left;
}
/**
 * The single way to put items into the party's inventory: member's bag → other members → stash (if `stash`)
 * → «На земле» (if `ground`). Updates the count view. → { bag, stash, ground, left } (counts).
 */
export function receive(save, inst, n = 1, { key = 'hero', others = true, stash = false, ground = false } = {}) {
  const out = { bag: 0, stash: 0, ground: 0, left: n };
  if (!ITEMS[inst?.item] || n <= 0) return out;
  let left = placeAuto(contOf(save, { c: 'bag', key }), inst, n);
  if (left && others) for (const k of bagKeys(save)) if (k !== key && left) left = placeAuto(contOf(save, { c: 'bag', key: k }), inst, left);
  out.bag = n - left;
  if (left && stash) { const l2 = placeAuto(contOf(save, { c: 'stash' }), inst, left); out.stash = left - l2; left = l2; }
  if (left && ground) { const l2 = placeAuto(contOf(save, { c: 'ground' }), inst, left); out.ground = left - l2; left = l2; }
  out.left = left;
  bump(save, inst.item, out.bag + out.stash);
  return out;
}
const v7 = (save) => (save?.v || 1) >= 2 && !!save.hero?.bag;
/**
 * Single entry point for game code (quests, events, caches, shop gifts, theft, turn-ins…): add n of an id to the
 * party — hero bag → companions → stash → «На земле». Before the v7 migration (newSave) — the count view only.
 * Returns the count placed (bags + stash + ground).
 */
export function giveItem(save, id, n = 1, q) {
  if (!ITEMS[id] || !(n > 0)) return 0;
  if (!v7(save)) { bump(save, id, n); return n; }
  const r = receive(save, makeInst(id, q), n, { stash: true, ground: true });
  return n - r.left;
}
/** Remove n of an id from the party (see takeItem); view-only before v7. Returns the count removed. */
export function dropItem(save, id, n = 1) {
  if (!(n > 0)) return 0;
  if (!v7(save)) { const had = save.hero.items?.[id] || 0; bump(save, id, -n); return Math.min(had, n); }
  return takeItem(save, id, n);
}
/** Turn edits of the count view by old code into instances (see header). Returns ids that went to the stash. */
export function syncItems(save) {
  if (!save?.hero) return [];
  // a companion who left the party leaves his backpack behind (hero → others → stash); his worn gear goes with him
  for (const p of save.party || []) {
    if (p.state !== 'left' || !p.bag) continue;
    const b = bagOf(p);
    for (const e of [...b.grid, ...b.quick.filter(Boolean)]) addInst(save, e, e.n || 1); // addInst bumps the view
    p.bag = { grid: [], quick: Array(QUICK_MAX).fill(null) };
  }
  const items = save.hero.items || (save.hero.items = {});
  const have = countAll(save);
  const stashed = [];
  for (const id of new Set([...Object.keys(items), ...Object.keys(have)])) {
    if (!ITEMS[id]) { delete items[id]; continue; }
    const want = Math.max(0, Math.floor(Number(items[id]) || 0)), cur = have[id] || 0;
    if (want > cur) {
      const inBags = addInst(save, makeInst(id), want - cur, { overflow: null });
      if (inBags) { placeAuto(contOf(save, { c: 'stash' }), makeInst(id), inBags); stashed.push(id); }
    } else if (want < cur) takeItem(save, id, cur - want);
  }
  refreshView(save);
  return stashed;
}
/** Run fn over synced bags and recount after. */
export function mutate(save, fn) {
  syncItems(save);
  const r = fn();
  refreshView(save);
  return r;
}

// ----------------------------------------------------------------------------- equipment instances
export function eqInst(holder, slot) {
  const eq = eqOf(holder);
  const id = eq[slot];
  if (!id || !ITEMS[id]) return null;
  const x = eq.inst?.[slot] || {};
  return { item: id, q: QUALITY[x.q] ? x.q : defaultQ(ITEMS[id]), mods: Array.isArray(x.mods) ? x.mods : [] };
}
function setEq(holder, slot, inst) {
  const eq = holder.equipment || (holder.equipment = { weapon: null, armor: null, offhand: null, pack: null, mods: [] });
  eq.inst = eq.inst || {};
  eq[slot] = inst ? inst.item : null;
  if (inst) eq.inst[slot] = { q: inst.q, mods: [...(inst.mods || [])] }; else delete eq.inst[slot];
}
/** Which equipment slot an item goes to (null — not wearable). */
export const slotFor = (it) => (it && ['weapon', 'armor', 'offhand', 'pack'].includes(it.slot) ? it.slot : null);
/** Off-hand blocked by a two-handed weapon: the weapon item or null. */
export const twoHandedBlock = (holder) => { const w = ITEMS[eqOf(holder).weapon]; return w?.twoHanded ? w : null; };
/** Quick slots beyond the count go back into the bag. false — no room. */
function fixQuick(save, key) {
  const h = holderOf(save, key);
  const b = bagOf(h);
  const n = quickCount(h);
  const cont = contOf(save, { c: 'bag', key });
  for (let i = n; i < b.quick.length; i++) {
    const e = b.quick[i];
    if (!e) continue;
    // move into a free active slot first
    const j = b.quick.findIndex((x, k) => k < n && !x);
    if (j >= 0) { b.quick[j] = e; b.quick[i] = null; continue; }
    if (placeAuto(cont, e, e.n)) return false;
    b.quick[i] = null;
  }
  return true;
}

// ----------------------------------------------------------------------------- moves (drag & drop)
// from: { at: 'grid', ref, index } | { at: 'quick', key, i } | { at: 'equip', key, slot } | { at: 'mod', host, i }
// to:   { at: 'grid', ref, x, y, r } | { at: 'quick', key, i } | { at: 'equip', key, slot } | { at: 'member', key }
//       | { at: 'mod', host }      host: { at: 'equip', key, slot } | { at: 'grid', ref, index }
/** The instance a `from` points at ({ item, q, mods, n }) or null. */
export function peek(save, from) {
  if (from.at === 'grid') { const e = contOf(save, from.ref).grid[from.index]; return e ? { ...e } : null; }
  if (from.at === 'quick') { const e = bagOf(holderOf(save, from.key)).quick[from.i]; return e ? { ...e, mods: [] } : null; }
  if (from.at === 'equip') { const e = eqInst(holderOf(save, from.key), from.slot); return e ? { ...e, n: 1 } : null; }
  if (from.at === 'mod') { const host = hostInst(save, from.host); const m = host?.mods?.[from.i]; return m ? makeInst(m) : null; }
  return null;
}
/** The live host instance of mods (equipment inst record or grid entry). */
export function hostInst(save, host) {
  if (!host) return null;
  if (host.at === 'grid') return contOf(save, host.ref).grid[host.index] || null;
  if (host.at === 'equip') {
    const h = holderOf(save, host.key);
    if (!eqOf(h)[host.slot]) return null;
    const eq = h.equipment;
    eq.inst = eq.inst || {};
    const x = eq.inst[host.slot] || (eq.inst[host.slot] = { q: defaultQ(ITEMS[eq[host.slot]]), mods: [] });
    if (!Array.isArray(x.mods)) x.mods = [];
    Object.defineProperty(x, 'item', { value: eq[host.slot], enumerable: false, configurable: true, writable: true }); // not saved
    return x;
  }
  return null;
}
function lift(save, from, n) {
  if (from.at === 'grid') {
    const g = contOf(save, from.ref).grid;
    const e = g[from.index];
    if (!e) return null;
    const k = Math.min(n ?? e.n, e.n);
    const out = { item: e.item, q: e.q, mods: [...(e.mods || [])], n: k, x: e.x, y: e.y, r: e.r };
    e.n -= k;
    if (e.n <= 0) g.splice(from.index, 1);
    return out;
  }
  if (from.at === 'quick') {
    const b = bagOf(holderOf(save, from.key));
    const e = b.quick[from.i];
    if (!e) return null;
    const k = Math.min(n ?? e.n, e.n);
    const out = { item: e.item, q: e.q, mods: [], n: k };
    e.n -= k;
    if (e.n <= 0) b.quick[from.i] = null;
    return out;
  }
  if (from.at === 'equip') {
    const h = holderOf(save, from.key);
    const e = eqInst(h, from.slot);
    if (!e) return null;
    setEq(h, from.slot, null);
    return { ...e, n: 1 };
  }
  if (from.at === 'mod') {
    const host = hostInst(save, from.host);
    const m = host?.mods?.[from.i];
    if (!m) return null;
    host.mods.splice(from.i, 1);
    return { ...makeInst(m), n: 1 };
  }
  return null;
}
const fail = (msg, extra) => ({ ok: false, msg, ...extra });

/** Mod slot types of an item (unique/relic items — their own `slots`, else by group, §3.1). */
export function modSlotTypes(it) {
  if (!it) return [];
  if (it.slot === 'armor') return it.unique || it.quality === 'relic' ? [...(it.slots || [])] : INV.modSlots.armor;
  if (it.slot !== 'weapon') return [];
  if (it.unique || it.quality === 'relic') return [...(it.slots || [])];
  return INV.modSlots[it.group] || (it.range > 1 ? INV.modSlots.ranged : INV.modSlots.melee);
}
/** How many mods an instance holds (quality; relic — its slots; heavy armour / mech +1). */
export function modCapacity(it, q) {
  const types = modSlotTypes(it);
  if (!types.length) return 0;
  const base = q === 'relic' || it.quality === 'relic' ? types.length : INV.modCount[q] ?? INV.modCount.working;
  return base + (it.slot === 'armor' && INV.heavyExtraMod.includes(it.type) ? 1 : 0);
}
/** Why a mod does not go onto this host instance now (null — fits). Text keys of data/text (inv.*). */
export function modFitProblem(mod, host) {
  const it = host && ITEMS[host.item];
  if (!mod || mod.slot !== 'mod') return 'inv.notMod';
  if (!it || !['weapon', 'armor'].includes(it.slot)) return 'gear.noHost';
  if ((mod.target || 'weapon') !== it.slot) return 'gear.noFit';
  if (!modSlotTypes(it).includes(mod.modSlot)) return 'gear.noSlot';
  const f = mod.fits || {};
  if (f.group && it.group && !f.group.includes(it.group)) return 'gear.noFit';
  if (f.wtype && !f.wtype.includes(it.wtype) && !f.wtype.includes(it.type)) return 'gear.noFit';
  if (f.atype && !f.atype.includes(it.atype) && !f.atype.includes(it.type)) return 'gear.noFit';
  if (f.rofMin && (it.rof || 1) < f.rofMin) return 'gear.noFit';
  if (f.quality && !f.quality.includes(host.q || 'working')) return 'gear.noFit';
  const mods = host.mods || [];
  if (mods.some((m) => ITEMS[m]?.modSlot === mod.modSlot)) return 'inv.slotTaken';
  if (mods.length >= modCapacity(it, host.q)) return 'inv.noModSlots';
  return null;
}

function placeEquip(save, key, slot, inst, back) {
  const h = holderOf(save, key);
  const it = ITEMS[inst.item];
  if (slotFor(it) !== slot) return fail(slot === 'offhand' ? 'inv.offhandOnly' : 'inv.wrongSlot');
  if (slot === 'offhand' && twoHandedBlock(h)) return fail('inv.twoHandedBlock');
  const toasts = [];
  const old = eqInst(h, slot);
  if (slot === 'weapon' && it.twoHanded && eqOf(h).offhand) {
    const off = eqInst(h, 'offhand');
    setEq(h, 'offhand', null);
    if (placeAuto(contOf(save, back || { c: 'bag', key }), off, 1)) return fail('inv.noRoomOff');
    toasts.push('inv.offFreed');
  }
  setEq(h, slot, { ...inst, n: undefined });
  if (slot === 'pack') {
    const c = contOf(save, { c: 'bag', key });
    const g = refit(c.grid, c.w, c.h);
    if (!g) return fail('inv.packTooSmall');
    bagOf(h).grid = g;
  }
  if (old) { const left = placeAuto(contOf(save, back || { c: 'bag', key }), old, 1); if (left) return fail('inv.noRoom'); }
  if (!fixQuick(save, key)) return fail('inv.quickNoRoom');
  return { ok: true, toasts };
}

/**
 * Move an item (drag & drop). n — how many of a stack (default all). Atomic: on failure nothing changes.
 * Returns { ok, msg?, toasts: [text keys] }. `check(req)` → { success, member? } for mods with `req` (UI rolls it).
 */
export function moveItem(save, from, to, { n, check, rng = Math.random } = {}) {
  syncItems(save);
  const snap = clone({ hero: { bag: save.hero.bag, equipment: save.hero.equipment }, party: save.party.map((p) => ({ bag: p.bag, equipment: p.equipment })), stash: save.stash, ground: save.ground });
  const undo = (r) => {
    save.hero.bag = snap.hero.bag; save.hero.equipment = snap.hero.equipment;
    save.party.forEach((p, i) => { p.bag = snap.party[i].bag; p.equipment = snap.party[i].equipment; });
    save.stash = snap.stash; save.ground = snap.ground;
    refreshView(save);
    return r;
  };
  const r = doMove(save, from, to, { n, check, rng });
  if (!r.ok) return r.keep ? (refreshView(save), r) : undo(r);
  refreshView(save);
  return r;
}

function backRef(from) {
  if (from.at === 'grid') return from.ref;
  if (from.at === 'quick' || from.at === 'equip') return { c: 'bag', key: from.key };
  if (from.at === 'mod') return from.host.at === 'grid' ? from.host.ref : { c: 'bag', key: from.host.key };
  return { c: 'bag', key: 'hero' };
}

function doMove(save, from, to, { n, check, rng }) {
  const src = peek(save, from);
  if (!src) return fail('inv.nothing');
  const it = ITEMS[src.item];
  // mods: install onto a host instance
  if (to.at === 'mod') {
    if (from.at === 'mod' && sameHost(from.host, to.host)) return { ok: true, toasts: [] };
    const host = hostInst(save, to.host); // live object: stays valid when the lifted entry leaves the same grid
    const why = modFitProblem(it, host);
    if (why) return fail(why);
    const inst = lift(save, from, 1);
    if (it.req && check && from.at !== 'mod') {
      const res = check(it.req);
      if (!res?.success) {
        const broke = rng() < INV.modBreakChance;
        if (!broke || inst.q !== 'junk') placeAuto(contOf(save, backRef(from)), inst, 1);
        return { ok: false, keep: true, msg: broke ? 'inv.modBroke' : 'inv.modFail', member: res?.member, broke };
      }
    }
    host.mods.push(inst.item);
    return { ok: true, toasts: ['inv.modOn'] };
  }
  if (to.at === 'equip') {
    if (from.at === 'equip' && from.key === to.key && from.slot === to.slot) return { ok: true, toasts: [] };
    if (slotFor(it) !== to.slot) return fail(to.slot === 'offhand' ? 'inv.offhandOnly' : 'inv.wrongSlot');
    if (to.slot === 'offhand' && twoHandedBlock(holderOf(save, to.key))) return fail('inv.twoHandedBlock');
    const inst = lift(save, from, 1);
    // the old piece goes where the new one came from (a bag of the source; equip → the target member's bag)
    const back = from.at === 'grid' ? from.ref : { c: 'bag', key: to.key };
    const r = placeEquip(save, to.key, to.slot, inst, back);
    if (!r.ok) return r;
    if (from.at === 'equip' && !fixQuick(save, from.key)) return fail('inv.quickNoRoom');
    return r;
  }
  if (to.at === 'quick') {
    if (!canQuick(it)) return fail('inv.quickOnly');
    const h = holderOf(save, to.key);
    if (to.i >= quickCount(h)) return fail('inv.quickLocked');
    const b = bagOf(h);
    const cur = b.quick[to.i];
    if (from.at === 'quick' && from.key === to.key && from.i === to.i) return { ok: true, toasts: [] };
    const cap = stackOf(it);
    if (cur && stackable(cur, src)) {
      const k = Math.min(n ?? src.n, cap - cur.n);
      if (k <= 0) return fail('inv.stackFull');
      const inst = lift(save, from, k);
      cur.n += inst.n;
      return { ok: true, toasts: [] };
    }
    const inst = lift(save, from, Math.min(n ?? src.n, cap));
    if (cur) { // swap: the old one goes back to the source
      b.quick[to.i] = null;
      if (from.at === 'quick') bagOf(holderOf(save, from.key)).quick[from.i] = cur;
      else if (placeAuto(contOf(save, backRef(from)), cur, cur.n)) return fail('inv.noRoom');
    }
    b.quick[to.i] = { item: inst.item, q: inst.q, n: inst.n };
    return { ok: true, toasts: [] };
  }
  if (to.at === 'member') {
    const inst = lift(save, from, n ?? src.n);
    const left = placeAuto(contOf(save, { c: 'bag', key: to.key }), inst, inst.n);
    if (left) return fail('inv.memberFull');
    if (from.at === 'equip' && !fixQuick(save, from.key)) return fail('inv.quickNoRoom');
    return { ok: true, toasts: ['inv.given'] };
  }
  if (to.at === 'grid') {
    const cont = contOf(save, to.ref);
    // dropping a stack onto the same kind of stack merges
    const tgtIdx = entryAt(cont.grid, to.x, to.y);
    const tgt = tgtIdx >= 0 ? cont.grid[tgtIdx] : null;
    const self = from.at === 'grid' && sameRef(from.ref, to.ref) ? cont.grid[from.index] : null;
    if (tgt && tgt !== self && stackable(tgt, src) && tgt.n < stackOf(it)) {
      const k = Math.min(n ?? src.n, stackOf(it) - tgt.n);
      const inst = lift(save, from, k);
      const t2 = contOf(save, to.ref).grid.find((e) => e.x === tgt.x && e.y === tgt.y);
      t2.n += inst.n;
      return { ok: true, toasts: [] };
    }
    const [w, h] = itemSize(it);
    const [sw, sh] = to.r ? [h, w] : [w, h];
    if (!rectFree(cont, to.x, to.y, sw, sh, self)) return fail('inv.noFit');
    if (from.at === 'equip' && from.slot === 'pack' && to.ref.c === 'bag' && to.ref.key === from.key) {
      // putting the worn backpack into itself: the grid shrinks to pockets
      const inst = lift(save, from, 1);
      const c = contOf(save, to.ref);
      const g = refit(c.grid, c.w, c.h);
      if (!g) return fail('inv.packTooSmall');
      bagOf(holderOf(save, from.key)).grid = g;
      if (placeAuto(contOf(save, to.ref), inst, 1)) return fail('inv.noRoom');
      if (!fixQuick(save, from.key)) return fail('inv.quickNoRoom');
      return { ok: true, toasts: [] };
    }
    const inst = lift(save, from, n ?? src.n);
    const c2 = contOf(save, to.ref);
    if (!rectFree(c2, to.x, to.y, sw, sh)) return fail('inv.noFit');
    c2.grid.push({ item: inst.item, q: inst.q || defaultQ(it), mods: [...(inst.mods || [])], n: inst.n, x: to.x, y: to.y, r: !!to.r });
    if (from.at === 'equip' && !fixQuick(save, from.key)) return fail('inv.quickNoRoom');
    return { ok: true, toasts: [] };
  }
  return fail('inv.nothing');
}
const sameRef = (a, b) => a.c === b.c && (a.c !== 'bag' || a.key === b.key);
const sameHost = (a, b) => a.at === b.at && (a.at === 'equip' ? a.key === b.key && a.slot === b.slot : sameRef(a.ref, b.ref) && a.index === b.index);
/** Shift+click / context menu: put an item into the first fitting place (equip / quick / mod on the card host). */
export function quickMove(save, from, key, { host, check } = {}) {
  const src = peek(save, from);
  const it = src && ITEMS[src.item];
  if (!it) return fail('inv.nothing');
  if (from.at === 'equip' || from.at === 'quick') return moveItem(save, from, { at: 'member', key: from.key });
  if (from.at === 'mod') return moveItem(save, from, { at: 'member', key: from.host.key || key });
  const slot = slotFor(it);
  if (slot) return moveItem(save, from, { at: 'equip', key, slot });
  if (canQuick(it)) {
    const h = holderOf(save, key);
    const b = bagOf(h);
    const n = quickCount(h);
    let i = b.quick.findIndex((e, k) => k < n && e && stackable(e, src) && e.n < stackOf(it));
    if (i < 0) i = b.quick.findIndex((e, k) => k < n && !e);
    if (i < 0) return fail('inv.quickFull');
    return moveItem(save, from, { at: 'quick', key, i });
  }
  if (it.slot === 'mod' && host) return moveItem(save, from, { at: 'mod', host }, { check });
  return fail('inv.noAuto');
}

// ----------------------------------------------------------------------------- disassembly (§3.3)
/**
 * Disassemble a grid entry (gear): `success` — the Tech check result (UI rolls it). Mods come back always; success →
 * + parts (`partsId` × `parts`); failure → the item is lost. Junk/masterwork: 50% for one more mod `bonusMod`.
 * Returns { ok, msg, got: [{ id, n }] }.
 */
export function disassemble(save, ref, index, { success, partsId, parts = 1, bonusMod = null, rng = Math.random }) {
  return mutate(save, () => {
    const cont = contOf(save, ref);
    const e = cont.grid[index];
    if (!e || !isGear(ITEMS[e.item]) || ITEMS[e.item].slot === 'mod') return fail('inv.cantDisassemble');
    cont.grid.splice(index, 1);
    const got = [];
    const give = (id, n) => { if (!ITEMS[id] || n <= 0) return; addInst(save, makeInst(id), n, { key: ref.key || 'hero' }); got.push({ id, n }); };
    for (const m of e.mods || []) give(m, 1);
    if (success) give(partsId, parts);
    if ((e.q === 'junk' || e.q === 'masterwork') && bonusMod && rng() < 0.5) give(bonusMod, 1);
    return { ok: true, msg: success ? 'inv.disOk' : 'inv.disFail', got };
  });
}

// ----------------------------------------------------------------------------- battle
/** Battle kit of a member: quick slots → unit.inventory, battle items of the bag → unit.backpack, quickSlots. */
export function battleKit(holder) {
  const b = bagOf(holder);
  const n = quickCount(holder);
  const inventory = {}, backpack = {};
  b.quick.forEach((e, i) => { if (e && i < n && isBattleItem(ITEMS[e.item])) inventory[e.item] = (inventory[e.item] || 0) + e.n; });
  for (const e of b.grid) if (isBattleItem(ITEMS[e.item])) backpack[e.item] = (backpack[e.item] || 0) + e.n;
  return { inventory, backpack, quickSlots: n };
}
/** After a battle: remove `used` { id: n } from a member (quick slots first, then his bag). */
export function consumeBattle(save, key, used) {
  mutate(save, () => {
    const b = bagOf(holderOf(save, key));
    for (const [id, n0] of Object.entries(used || {})) {
      let n = n0;
      for (let i = 0; i < b.quick.length && n > 0; i++) {
        const e = b.quick[i];
        if (!e || e.item !== id) continue;
        const k = Math.min(n, e.n); e.n -= k; n -= k;
        if (e.n <= 0) b.quick[i] = null;
      }
      for (let i = b.grid.length - 1; i >= 0 && n > 0; i--) {
        const e = b.grid[i];
        if (e.item !== id) continue;
        const k = Math.min(n, e.n); e.n -= k; n -= k;
        if (e.n <= 0) b.grid.splice(i, 1);
      }
    }
  });
}

/**
 * After a battle: «Порыться» moved stacks between the bag and the quick slots (unit.inventory = quick slots at the end).
 * Mirror the layout in the save: quick stacks no longer wanted go back to the bag (if it has room), wanted ones come
 * from the bag into a matching / empty quick slot. Run after consumeBattle (counts already match).
 */
export function keepQuickLayout(save, key, quickNow) {
  mutate(save, () => {
    const h = holderOf(save, key);
    if (!h) return;
    const b = bagOf(h);
    const n = quickCount(h);
    const cont = { grid: b.grid, w: gridDims(h)[0], h: gridDims(h)[1] };
    const want = {}, have = {};
    for (const [id, k] of Object.entries(quickNow || {})) if (k > 0 && ITEMS[id]) want[id] = k;
    b.quick.forEach((e, i) => { if (e && i < n && isBattleItem(ITEMS[e.item])) have[e.item] = (have[e.item] || 0) + e.n; });
    // quick → bag (swapped back during the battle)
    for (let i = 0; i < n; i++) {
      const e = b.quick[i];
      if (!e || !isBattleItem(ITEMS[e.item]) || (have[e.item] || 0) <= (want[e.item] || 0)) continue;
      const k = Math.min(e.n, have[e.item] - (want[e.item] || 0));
      const put = k - placeAuto(cont, { item: e.item, q: e.q }, k); // placeAuto returns what did not fit
      e.n -= put; have[e.item] -= put;
      if (e.n <= 0) b.quick[i] = null;
    }
    // bag → quick (rummaged)
    for (const [id, w] of Object.entries(want)) {
      let need = w - (have[id] || 0);
      const cap = stackOf(ITEMS[id]);
      for (let gi = b.grid.length - 1; gi >= 0 && need > 0; gi--) {
        const e = b.grid[gi];
        if (e.item !== id || (e.mods || []).length) continue;
        let i = b.quick.findIndex((q, k) => k < n && q && q.item === id && (q.q || 'working') === (e.q || 'working') && q.n < cap);
        if (i < 0) i = b.quick.findIndex((q, k) => k < n && !q);
        if (i < 0) return;
        const q = b.quick[i] || (b.quick[i] = { item: id, q: e.q, n: 0 });
        const k = Math.min(need, e.n, cap - q.n);
        q.n += k; e.n -= k; need -= k;
        if (e.n <= 0) b.grid.splice(gi, 1);
        if (k <= 0) break;
      }
    }
  });
}

// ----------------------------------------------------------------------------- migration / normalisation
const QOK = (q) => (QUALITY[q] ? q : null);
function normEntry(e) {
  if (!e || typeof e !== 'object' || !ITEMS[e.item]) return null;
  const it = ITEMS[e.item];
  return { item: e.item, q: QOK(e.q) || defaultQ(it), mods: Array.isArray(e.mods) ? e.mods.filter((m) => ITEMS[m]?.slot === 'mod') : [],
    n: Math.max(1, Math.min(stackOf(it), Math.floor(Number(e.n) || 1))), x: Math.floor(Number(e.x) || 0), y: Math.floor(Number(e.y) || 0), r: !!e.r };
}
/** Validate a stored grid: drop unknown/overlapping entries (they are re-placed); returns { grid, rest }. */
function normGrid(list, w, h) {
  const cont = { grid: [], w, h };
  const rest = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = normEntry(raw);
    if (!e) continue;
    const [ew, eh] = entrySize(e);
    if (rectFree(cont, e.x, e.y, ew, eh)) cont.grid.push(e); else rest.push(e);
  }
  return { cont, rest: autoLayout(cont, rest) };
}
/** Old flat equipment.mods → instance mods of the worn weapon / armour (§5: kept even over the slot limit). */
function migrateEquipment(holder) {
  const eq = holder?.equipment;
  if (!eq) return;
  eq.inst = eq.inst && typeof eq.inst === 'object' ? eq.inst : {};
  if (eq.pack && ITEMS[eq.pack]?.slot !== 'pack') eq.pack = null;
  eq.pack = eq.pack || null;
  for (const s of EQUIP_SLOTS) {
    if (!eq[s]) { delete eq.inst[s]; continue; }
    const x = eq.inst[s] || {};
    eq.inst[s] = { q: QOK(x.q) || defaultQ(ITEMS[eq[s]]), mods: Array.isArray(x.mods) ? x.mods.filter((m) => ITEMS[m]?.slot === 'mod') : [] };
  }
  for (const m of eq.mods || []) {
    const t = ITEMS[m]?.target === 'armor' ? 'armor' : 'weapon';
    if (eq[t] && eq.inst[t] && !eq.inst[t].mods.includes(m)) eq.inst[t].mods.push(m);
  }
  eq.mods = [];
}
/**
 * Normalise / migrate the inventory of a save in place (save.js normalizeSave, state.newSave):
 * no bags (old save, v < 2) → auto-layout of hero.items (largest first, first fit; rotated if needed), the rest → stash,
 * battle items → 2–4 quick slots (grenades first); bags present → validated. Sets save.v = 2.
 */
export function normalizeInventory(save) {
  const fresh = !save.hero.bag || (save.v || 1) < 2;
  for (const key of ['hero', ...save.party.map((p) => p.npc)]) migrateEquipment(holderOf(save, key));
  const stash = normGrid(save.stash?.grid, INV.stash[0], INV.stash[1]);
  save.stash = { grid: stash.cont.grid };
  const ground = normGrid(save.ground?.grid, INV.ground[0], INV.ground[1]);
  save.ground = { grid: ground.cont.grid };
  if (fresh) {
    const counts = save.hero.items || {};
    save.hero.bag = { grid: [], quick: Array(QUICK_MAX).fill(null) };
    for (const p of save.party) p.bag = { grid: [], quick: Array(QUICK_MAX).fill(null) };
    const h = save.hero;
    const qn = quickCount(h);
    // battle items into quick slots: grenades first
    const battle = Object.entries(counts).filter(([id, n]) => n > 0 && canQuick(ITEMS[id]) && isBattleItem(ITEMS[id]))
      .sort(([a], [b]) => (ITEMS[b].kind === 'grenade') - (ITEMS[a].kind === 'grenade'));
    const left = { ...counts };
    let qi = 0;
    for (const [id] of battle) {
      if (qi >= qn) break;
      const k = Math.min(left[id], stackOf(ITEMS[id]));
      h.bag.quick[qi++] = { item: id, q: defaultQ(ITEMS[id]), n: k };
      left[id] -= k;
    }
    const entries = [];
    for (const [id, n0] of Object.entries(left)) {
      const it = ITEMS[id];
      if (!it || !(n0 > 0)) continue;
      const cap = stackOf(it);
      for (let n = Math.floor(n0); n > 0; n -= cap) entries.push({ item: id, q: defaultQ(it), mods: [], n: Math.min(cap, n), r: false });
    }
    const [w, hh] = gridDims(h);
    const cont = { grid: [], w, h: hh };
    const rest = autoLayout(cont, entries);
    h.bag.grid = cont.grid;
    const st = contOf(save, { c: 'stash' });
    for (const e of rest) if (placeAuto(st, e, e.n)) placeAuto(contOf(save, { c: 'ground' }), e, e.n);
  } else {
    for (const key of ['hero', ...save.party.map((p) => p.npc)]) {
      const h = holderOf(save, key);
      const [w, hh] = gridDims(h);
      const g = normGrid(h.bag?.grid, w, hh);
      const quick = (Array.isArray(h.bag?.quick) ? h.bag.quick : []).slice(0, QUICK_MAX).map((e) => {
        const x = e && ITEMS[e.item] && canQuick(ITEMS[e.item]) ? { item: e.item, q: QOK(e.q) || 'working', n: Math.max(1, Math.min(stackOf(ITEMS[e.item]), Math.floor(Number(e.n) || 1))) } : null;
        return x;
      });
      while (quick.length < QUICK_MAX) quick.push(null);
      h.bag = { grid: g.cont.grid, quick };
      for (const e of g.rest) if (placeAuto(contOf(save, { c: 'stash' }), e, e.n)) placeAuto(contOf(save, { c: 'ground' }), e, e.n);
    }
  }
  save.v = 2;
  refreshView(save);
  return save;
}
export { MOD_SLOTS };
