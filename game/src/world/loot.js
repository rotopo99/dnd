// Battle loot (spec docs/specs/items.md «Лут»): every beaten enemy (dead or «Сломлен», not a summon) rolls its
// `loot` table (credits [min, max] + `rolls` weighted draws) and each piece of its `gear` drops with GEAR_DROP by
// the item's quality; bosses add BOSS_RELICS. World flags: `battle-loot` — one extra draw from a beaten enemy's
// table, `scrap-loot` — one extra draw from a mechanical one's (no table → credits by WORLD_RULES.loot).
// Pure: no save access; the caller puts the result into the backpack. v7: weapons / armour / shields drawn from a
// table get a quality by the table's `quality` weights (items {id, n, q}); relics stay relic.
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
 * @returns {credits, items: [{id, n, q?}]}
 */
export function rollLoot(defeated, data, rng, { flags = [], owned = new Set(), extraRolls = 0, onlyExtra = false } = {}) {
  const tables = data.LOOT_TABLES || LOOT_TABLES;
  const drop = data.GEAR_DROP || GEAR_DROP;
  const relics = data.BOSS_RELICS || BOSS_RELICS;
  const items = data.ITEMS || {};
  const fl = flags instanceof Set ? flags : new Set(flags);
  const bag = new Map();
  let credits = 0;
  const add = (id, n = 1, q = null) => {
    const it = items[id];
    if (!it) return;
    if (it.unique) { if (owned.has(id) || [...bag.values()].some((x) => x.id === id)) return; n = 1; q = null; }
    const key = `${id}|${q || ''}`;
    const cur = bag.get(key) || { id, n: 0, ...(q ? { q } : {}) };
    cur.n += n;
    bag.set(key, cur);
  };
  const qualityOf = (tb, id) => {
    const it = items[id];
    if (!tb.quality || !it || !['weapon', 'armor', 'offhand'].includes(it.slot) || it.quality === 'relic') return null;
    const w = Object.entries(tb.quality).filter(([, v]) => v > 0);
    const total = w.reduce((s, [, v]) => s + v, 0);
    let r = rng() * total;
    for (const [q, v] of w) { r -= v; if (r < 0) return q; }
    return w.at(-1)?.[0] || null;
  };
  const beaten = (defeated || [])
    .map((u) => (typeof u === 'string' ? { enemyId: u } : u))
    .filter((u) => u && u.kind !== 'summon' && data.ENEMIES?.[u.enemyId])
    .map((u) => ({ def: data.ENEMIES[u.enemyId], tags: u.tags || data.ENEMIES[u.enemyId].tags || [] }));

  for (const { def } of onlyExtra ? [] : beaten) {
    const tb = def.loot && tables[def.loot];
    if (tb) {
      if (tb.credits) credits += int(rng, tb.credits[0], tb.credits[1]);
      for (let i = 0; i < (tb.rolls || 1); i++) { const e = draw(rng, tb); if (e) add(e.item, e.n || 1, qualityOf(tb, e.item)); }
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
  if (beaten.length && fl.has('battle-loot') && !onlyExtra) extra(() => true);
  // combat rework §6: objective rewards and opened chests — extra draws from a random beaten table (no table → credits)
  for (let i = 0; i < extraRolls; i++) {
    const withTb = beaten.filter((x) => x.def.loot && tables[x.def.loot]);
    const src = withTb.length ? withTb[Math.floor(rng() * withTb.length)] : null;
    const e = src && draw(rng, tables[src.def.loot]);
    if (e) add(e.item, e.n || 1, qualityOf(tables[src.def.loot], e.item));
    else credits += rollDice(rng, WORLD_RULES.loot.dice) * WORLD_RULES.loot.mult;
  }
  const isMech = (x) => x.tags.includes('mechanical');
  if (fl.has('scrap-loot') && beaten.some(isMech) && !onlyExtra) extra(isMech);

  return { credits, items: [...bag.values()] };
}
