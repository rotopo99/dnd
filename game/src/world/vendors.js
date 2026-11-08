// Per-NPC vendor stock (docs/specs/vendors-bestiary.md, part 1). Pure and deterministic: the same npc and day give
// the same shelf; the shelf rotates every `restock` days (seed = npcId + ':' + floor((day − 1) / restock)).
// Data — data/items/vendors.js (VENDORS, ARCHETYPES, ROTATION, FACTION_BANS, tierCap). UI — scenes/shop.js.
import { VENDORS, ARCHETYPES, ROTATION, FACTION_BANS, tierCap } from '../data/items/vendors.js';
import { QUALITY } from '../data/items/mods.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS, LOCATIONS, REGIONS } from './data.js';
import { normFaction } from './reputation.js';
import { createRng, hashSeed } from '../rules/rng.js';
import { vendorMods } from './consequences.js';

export { VENDORS, ARCHETYPES };
const RANK = { hostile: 0, suspicious: 1, neutral: 2, friendly: 3, ally: 4 };

/** Exclusive ids (`sig` as a string): sold only by their owner, never in any pool. */
export const EXCLUSIVES = new Map();
for (const [npc, v] of Object.entries(VENDORS)) for (const s of v.sig || []) if (typeof s === 'string') EXCLUSIVES.set(s, npc);

export const vendorOf = (npcId) => VENDORS[npcId] || null;
export const restockOf = (v) => v?.restock || ROTATION.defaultRestock;
export const periodOf = (v, day) => Math.floor((Math.max(1, day) - 1) / restockOf(v));
/** Days until the shelf changes (1…restock). */
export const restockIn = (v, day) => restockOf(v) - ((Math.max(1, day) - 1) % restockOf(v));

/** Region level of the vendor (vendor.lvl or levels[1] of the node's region). */
export function vendorLevel(npcId) {
  const v = VENDORS[npcId];
  if (v?.lvl) return v.lvl;
  const loc = LOCATIONS[NPCS[npcId]?.location];
  return REGIONS[loc?.region]?.levels?.[1] ?? 1;
}

export const itemCat = (it) => it.cat || (it.slot === 'consumable' ? 'consumable' : it.slot) || 'consumable';

/** Ban token ('kind:x' or weapon/consumable type) matches the item. */
function banned(it, bans) {
  return bans.some((b) => (b.startsWith('kind:') ? it.kind === b.slice(5) : it.type === b || it.kind === b));
}
const bansOf = (npcId) => FACTION_BANS[normFaction(NPCS[npcId]?.faction)] || [];

/** 'cat:x' | 'kind:x' | 'type:x' | 'group:x' */
export function loves(v, it) {
  return (v.loves || []).some((l) => {
    const [k, x] = l.split(':');
    return k === 'cat' ? itemCat(it) === x : it[k] === x;
  });
}

/** Required reputation tier for a signature item above the cap (null — none). */
export function gateFor(it, cap) {
  const d = (it.tier || 1) - cap;
  return d <= 0 ? null : d === 1 ? 'friendly' : 'ally';
}

/**
 * Shelf of an NPC on a day. tier — reputation tier with the vendor (for the signature gate).
 * → { npcId, vendor, arch, cap, period, restock, left, rows: [{ id, q, kind, mult, locked? }] } | null
 *   kind: 'staple' | 'sig' (exclusive) | 'edition' (masterwork) | 'rot' | 'rare'; mult — price multiplier
 *   (quality × archetype markup × (1 + greed) × rare markup); `locked` — the tier the item needs.
 */
export function vendorStock(npcId, day, tier = 'neutral', save = null) {
  const vs = vendorStockBase(npcId, day, tier);
  if (!vs || !save) return vs;
  // world-consequences.md: quest consequences — price ×mult, add / remove goods (closed shops are checked by the caller)
  const m = vendorMods(save, npcId);
  if (m.mult === 1 && !m.add.length && !m.remove.size) return vs;
  const rows = vs.rows.filter((r) => !m.remove.has(r.id)).map((r) => ({ ...r, mult: r.mult * m.mult }));
  const base = vs.arch.markup * (1 + (vs.vendor.greed || 0));
  for (const id of m.add) if (ITEMS[id] && !rows.some((r) => r.id === id)) rows.push({ id, q: 'working', kind: 'staple', mult: base * m.mult });
  return { ...vs, rows, worldMult: m.mult };
}

function vendorStockBase(npcId, day, tier) {
  const v = VENDORS[npcId];
  const arch = v && ARCHETYPES[v.arch];
  if (!arch) return null;
  const cap = tierCap(vendorLevel(npcId));
  const period = periodOf(v, day);
  const rng = createRng(hashSeed(`${npcId}:${period}`));
  const bans = bansOf(npcId);
  const base = arch.markup * (1 + (v.greed || 0));
  const rows = [];
  const have = new Set();
  const ok = (id) => ITEMS[id] && !have.has(id) && !banned(ITEMS[id], bans);
  const add = (id, q, kind, extra = {}) => {
    have.add(id);
    rows.push({ id, q, kind, mult: (QUALITY[q]?.price ?? 1) * base * (extra.rare ? ROTATION.rareMarkup : 1), ...extra });
  };
  for (const id of arch.staples || []) if (ok(id) && !EXCLUSIVES.has(id)) add(id, 'working', 'staple');
  for (const s of v.sig || []) {
    const id = typeof s === 'string' ? s : s.id;
    if (!ok(id)) continue;
    const need = gateFor(ITEMS[id], cap);
    add(id, typeof s === 'string' ? 'working' : s.q || 'masterwork', typeof s === 'string' ? 'sig' : 'edition',
      need && (RANK[tier] ?? 2) < RANK[need] ? { locked: need } : {});
  }
  // pools 1..cap (weight: cap 3, cap−1 2, lower 1); exclusives of anyone never appear in pools
  const pool = new Map();
  for (let t = 1; t <= cap; t++) {
    for (const id of arch.tiers?.[t] || []) {
      if (!ok(id) || EXCLUSIVES.has(id) || (ITEMS[id].tier || 1) > cap) continue;
      pool.set(id, Math.max(pool.get(id) || 0, t === cap ? 3 : t === cap - 1 ? 2 : 1));
    }
  }
  // mini-vendors (no sig): an edition — explicit `ed` list or one auto pick of weapon/armor/mod at the highest tier
  if (!v.sig) {
    let eds = v.ed;
    if (!eds) {
      const gear = [...pool.keys()].filter((id) => ['weapon', 'armor', 'mod'].includes(itemCat(ITEMS[id])));
      const top = Math.max(0, ...gear.map((id) => ITEMS[id].tier || 1));
      const best = gear.filter((id) => (ITEMS[id].tier || 1) === top);
      eds = best.length ? [best[Math.floor(rng() * best.length)]] : [];
    }
    for (const id of eds) if (ok(id) && !EXCLUSIVES.has(id)) { add(id, 'masterwork', 'edition'); pool.delete(id); }
  }
  const size = Math.min(ROTATION.sizes[v.size] || ROTATION.sizes.M, v.mentor ? ROTATION.sizes.S : Infinity);
  let slots = Math.max(0, size - rows.length);
  const junkN = v.arch === 'junk' || normFaction(NPCS[npcId]?.faction) === 'scavengers' ? Math.round(slots * ROTATION.junkShare) : 0;
  let n = 0;
  for (const id of have) pool.delete(id);
  while (slots > 0 && pool.size) {
    const total = [...pool.values()].reduce((a, w) => a + w, 0);
    let r = rng() * total;
    let pick = null;
    for (const [id, w] of pool) { r -= w; if (r < 0) { pick = id; break; } }
    pick = pick || [...pool.keys()].at(-1);
    pool.delete(pick);
    const gear = ['weapon', 'armor'].includes(itemCat(ITEMS[pick]));
    add(pick, gear && n < junkN ? 'junk' : 'working', 'rot');
    if (gear) n++;
    slots--;
  }
  // «ходовой» товар: one item of tier cap+1 with a markup
  if (rng() < ROTATION.rareChance) {
    const rare = (arch.tiers?.[cap + 1] || []).filter((id) => ok(id) && !EXCLUSIVES.has(id));
    if (rare.length) add(rare[Math.floor(rng() * rare.length)], 'working', 'rare', { rare: true });
  }
  return { npcId, vendor: v, arch, cap, period, restock: restockOf(v), left: restockIn(v, day), rows };
}

/** Sell rate of an item to this vendor (null — does not buy). Relics and bans are never bought. */
export function vendorSellRate(npcId, it) {
  const v = VENDORS[npcId];
  const arch = v && ARCHETYPES[v.arch];
  if (!arch || !it || it.quality === 'relic' || banned(it, bansOf(npcId))) return null;
  const lv = loves(v, it);
  if (!lv && !(arch.buys || []).includes(itemCat(it))) return null;
  return arch.sellRate * (lv ? ROTATION.lovesMul ?? 1.25 : 1);
}
