// Battle loot (spec docs/specs/items.md «Лут»): every beaten enemy (dead or «Сломлен», not a summon) rolls its
// `loot` table (credits [min, max] + `rolls` weighted draws) and each piece of its `gear` drops with GEAR_DROP by
// the item's quality; bosses add BOSS_RELICS. World flags: `battle-loot` — one extra draw from a beaten enemy's
// table, `scrap-loot` — one extra draw from a mechanical one's (no table → credits by WORLD_RULES.loot).
// Pure: no save access; the caller puts the result into the backpack. Table `quality` weights are not used —
// the backpack stores items by id, an item's quality is fixed in its record.
import { LOOT_TABLES, GEAR_DROP, BOSS_RELICS } from '../data/items/loot.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { rollDice } from '../rules/dice.js';

const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

function draw(rng, table) {
  const pool = (table.entries || []).filter((e) => e.w > 0);
  const total = pool.reduce((s, e) => s + e.w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const e of pool) { r -= e.w; if (r < 0) return e; }
  return pool.at(-1);
}

/**
 * @param defeated  battle units ({enemyId, kind, tags}) or enemy ids
 * @param data      {ENEMIES, ITEMS, LOOT_TABLES?, GEAR_DROP?, BOSS_RELICS?}
 * @param rng       () => [0, 1)
 * @param opts      {flags: Set|Array of world flag ids, owned?: Set of unique item ids already owned}
 * @returns {credits, items: [{id, n}]}
 */
export function rollLoot(defeated, data, rng, { flags = [], owned = new Set() } = {}) {
  const tables = data.LOOT_TABLES || LOOT_TABLES;
  const drop = data.GEAR_DROP || GEAR_DROP;
  const relics = data.BOSS_RELICS || BOSS_RELICS;
  const items = data.ITEMS || {};
  const fl = flags instanceof Set ? flags : new Set(flags);
  const bag = new Map();
  let credits = 0;
  const add = (id, n = 1) => {
    const it = items[id];
    if (!it) return;
    if (it.unique) { if (owned.has(id) || bag.has(id)) return; n = 1; }
    bag.set(id, (bag.get(id) || 0) + n);
  };
  const beaten = (defeated || [])
    .map((u) => (typeof u === 'string' ? { enemyId: u } : u))
    .filter((u) => u && u.kind !== 'summon' && data.ENEMIES?.[u.enemyId])
    .map((u) => ({ def: data.ENEMIES[u.enemyId], tags: u.tags || data.ENEMIES[u.enemyId].tags || [] }));

  for (const { def } of beaten) {
    const tb = def.loot && tables[def.loot];
    if (tb) {
      if (tb.credits) credits += int(rng, tb.credits[0], tb.credits[1]);
      for (let i = 0; i < (tb.rolls || 1); i++) { const e = draw(rng, tb); if (e) add(e.item, e.n || 1); }
    }
    const g = def.gear || {};
    for (const id of [g.weapon, g.armor, ...(g.items || [])]) {
      if (!id || !items[id]) continue;
      if (rng() < (drop[items[id].quality || 'working'] ?? 0)) add(id);
    }
    if (relics[def.id]) add(relics[def.id]);
  }

  const extra = (pick) => {
    const src = beaten.find((x) => pick(x) && x.def.loot && tables[x.def.loot]);
    const e = src && draw(rng, tables[src.def.loot]);
    if (e) add(e.item, e.n || 1);
    else credits += rollDice(rng, WORLD_RULES.loot.dice) * WORLD_RULES.loot.mult;
  };
  if (beaten.length && fl.has('battle-loot')) extra(() => true);
  const isMech = (x) => x.tags.includes('mechanical');
  if (fl.has('scrap-loot') && beaten.some(isMech)) extra(isMech);

  return { credits, items: [...bag].map(([id, n]) => ({ id, n })) };
}
