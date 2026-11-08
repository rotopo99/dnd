// Terrain of the combat rework (docs/specs/combat-rework.md §3): destructible objects (cover tiles with HP),
// rubble, heights, cover level / flank / height modifiers of attacks, falls. Pure rules — runs in Node.
// Data: b.data.combat (data/combat.js COMBAT). Without it objects are indestructible static cover (old behaviour).
//
// Decisions:
//  - Objects live in b.objects (Map tile index -> {kind, x, y, hp, maxHp, armor, cover}); barrels stay in b.barrels
//    (surfaces.js) and only get hp/armor here, their destruction is destroyBarrel (spill oil / toxgas).
//  - Broken object: tile -> T_RUBBLE (or floor for flimsy walls), event objectBreak {x, y, kind}; gridVersion++,
//    occVersion++ (reachable cache) — AI paths and LOS see the change at once.
//  - Area hits (weapon areas, area abilities, gas explosions) hit objects in the area with the rolled damage × areaObjectMul.
//  - Height: an attacker above gets +1 hit per level (max +2) for ranged attacks and +1 range per level; below — −1 per
//    level (max −2), melee across a difference of 2 is impossible. Height ≥ 1 above the target ignores half cover.
//  - Flank: the target stands next to half/full cover but none of it covers it from the attacker -> +1 hit.

import { T_RUBBLE, T_FLOOR, tileCover, coverLevel, inCoverSpot, elevAt, inBounds, chebyshev } from './grid.js';
import { emitEvent } from './combat.js';
import { createSurface, radiusTiles, destroyBarrel, barrelAt, battleLevel } from './surfaces.js';

const cfg = (b) => (b.data && b.data.combat) || null;
export const terrainOn = (b) => !!cfg(b);
const COVER_KB_DEFAULT = [0, 1, 2, 5];

/** Object hp at battle level L: base + perL × L. */
export function objectHp(def, L) {
  const [base, perL] = def.hp || [10, 2];
  return Math.max(1, Math.round(base + perL * (L || 1)));
}

/** After units are placed (battle level is known): objects of the map get HP. */
export function initTerrain(b) {
  b.objects = new Map();
  const C = cfg(b);
  if (!C) return;
  const L = battleLevel(b);
  for (const o of b.grid.objects || []) {
    const def = C.objects[o.kind];
    if (!def) continue;
    const hp = objectHp(def, L);
    b.objects.set(o.y * b.grid.w + o.x, { kind: o.kind, x: o.x, y: o.y, hp, maxHp: hp, armor: def.armor ?? 10, cover: def.cover });
  }
  // battlefields.md: props of the map def (assets/props.js metadata copied by world/battlefields.js) replace the char objects
  // of their footprint: destructible blocking props get hp = prop.hp + perL × L and leave rubble + their debris surface;
  // the rest stay static (indestructible) cover / blocks.
  const PD = C.objects.prop || {};
  for (const p of b.grid.def?.props || []) {
    const cells = [];
    for (let i = 0; i < (p.w || 1); i++) if (inBounds(b.grid, p.x + i, p.y)) cells.push((p.y) * b.grid.w + p.x + i);
    for (const i of cells) b.objects.delete(i);
    if (!p.destructible || !p.blocks || !cells.length) continue;
    const hp = Math.max(1, Math.round((p.hp || 6) + (PD.perL ?? 1) * L));
    const o = { kind: 'prop', prop: p.id, name: p.name || null, x: p.x, y: p.y, cells, hp, maxHp: hp, armor: PD.armor ?? 8, cover: p.cover || 'none', debris: p.debris || null };
    for (const i of cells) b.objects.set(i, o);
  }
  const bd = C.objects.barrel;
  if (bd) for (const br of b.barrels || []) { br.maxHp = br.hp = objectHp(bd, L); br.armor = bd.armor ?? 6; }
}

/** Object on a tile: { kind, x, y, hp, maxHp, armor, cover, barrel? } or null. */
export function objectAt(b, x, y) {
  if (!inBounds(b.grid, x, y)) return null;
  const o = b.objects && b.objects.get(y * b.grid.w + x);
  if (o) return o;
  const br = barrelAt(b, x, y);
  if (br && br.hp != null) return { kind: 'barrel', x, y, hp: br.hp, maxHp: br.maxHp, armor: br.armor, cover: 'half', barrel: br };
  return null;
}

/** Deal `amount` damage to the object on (x, y). Returns true if it broke. */
export function damageObject(b, x, y, amount, src, dmgType) {
  if (!terrainOn(b)) return false;
  const amt = Math.max(0, Math.floor(amount));
  const br = barrelAt(b, x, y);
  if (br) {
    if (br.hp == null) return false;
    br.hp -= amt;
    emitEvent(b, { type: 'objectHit', actor: src ? src.id : null, x, y, kind: 'barrel', amount: amt, value: Math.max(0, br.hp) });
    if (br.hp <= 0) { destroyBarrel(b, x, y, src); return true; }
    return false;
  }
  const o = b.objects.get(y * b.grid.w + x);
  if (!o || amt <= 0) return false;
  o.hp -= amt;
  if (dmgType === 'fire') o.burnt = true;
  emitEvent(b, { type: 'objectHit', actor: src ? src.id : null, x, y, kind: o.kind, amount: amt, value: Math.max(0, o.hp) });
  if (o.hp <= 0) { breakObject(b, o, src); return true; }
  return false;
}

/** Remove an object: rubble / floor, its surface (generator: electricity, burnt machine: smoke), junk loot roll. */
export function breakObject(b, o, src) {
  const C = cfg(b);
  const def = (C && C.objects[o.kind]) || {};
  const g = b.grid;
  const cells = o.cells || [o.y * g.w + o.x];
  const rubble = def.leaves === 'rubble';
  for (const i of cells) { b.objects.delete(i); g.tiles[i] = rubble ? T_RUBBLE : T_FLOOR; }
  if (rubble) g.costly = true;
  b.gridVersion = (b.gridVersion || 0) + 1;
  b.occVersion++;
  b.reachCache = null;
  emitEvent(b, { type: 'objectBreak', actor: src ? src.id : null, x: o.x, y: o.y, kind: o.kind });
  if (o.debris && b.data.surfaces) createSurface(b, o.debris, cells.map((i) => ({ x: i % g.w, y: (i / g.w) | 0 })), src, { turns: def.turns });
  if (def.surface && b.data.surfaces) createSurface(b, def.surface.kind, radiusTiles(b, o.x, o.y, def.surface.r || 1), src, { turns: def.surface.turns });
  if (def.fireLeaves && o.burnt && b.data.surfaces) createSurface(b, def.fireLeaves, [{ x: o.x, y: o.y }], src, {});
  if (def.junk && b.rng() < def.junk) {
    b.junk = (b.junk || 0) + 1;
    emitEvent(b, { type: 'objectLoot', x: o.x, y: o.y, kind: o.kind });
  }
}

/** Area damage to objects (not barrels — surfaces.js breaks those on any area hit). test(x, y) -> in area. */
export function damageObjectsIn(b, test, amount, src, dmgType) {
  if (!terrainOn(b) || !b.objects.size || amount <= 0) return;
  const amt = amount * (cfg(b).areaObjectMul ?? 1);
  for (const o of new Set(b.objects.values())) if (o.hp > 0 && (o.cells ? o.cells.some((i) => test(i % b.grid.w, (i / b.grid.w) | 0)) : test(o.x, o.y))) damageObject(b, o.x, o.y, amt, src, dmgType);
}

// ---------------------------------------------------------------- attack modifiers

/** KB bonus from cover for a target at (tx, ty) vs an attacker at (ax, ay). Returns { level, kb }. */
export function coverBonus(b, ax, ay, tx, ty, melee) {
  const level = coverLevel(b.grid, ax, ay, tx, ty, melee);
  if (!level) return { level, kb: 0 };
  const C = cfg(b);
  if (melee) return { level, kb: C ? C.cover.fullMelee ?? 2 : 0 };
  return { level, kb: (C ? C.cover.kb : COVER_KB_DEFAULT)[level] || 0 };
}

/** Height difference attacker - target (positive: the attacker is above). */
export const elevDiff = (b, ax, ay, tx, ty) => (b.grid.elev ? elevAt(b.grid, ax, ay) - elevAt(b.grid, tx, ty) : 0);

/** Hit modifier from height and flank: { elev, flank, total }. */
export function terrainHit(b, att, tgt, melee, fx = att.x, fy = att.y) {
  const C = cfg(b);
  if (!C) return { elev: 0, flank: 0, total: 0 };
  let elev = 0;
  const d = elevDiff(b, fx, fy, tgt.x, tgt.y);
  const E = C.elev;
  if (d > 0 && !melee) elev = Math.min(d * E.hitPer, E.hitMax);
  else if (d < 0) elev = -Math.min(-d * E.hitPer, E.hitMax);
  let flank = 0;
  if (chebyshev(fx, fy, tgt.x, tgt.y) > 0 && inCoverSpot(b.grid, tgt.x, tgt.y) && !coverLevel(b.grid, fx, fy, tgt.x, tgt.y, melee)) flank = C.cover.flankHit ?? 1;
  return { elev, flank, total: elev + flank };
}

/** Extra weapon range from standing above the target (ranged weapons only). */
export function elevRange(b, u, tx, ty) {
  const C = cfg(b);
  if (!C || !b.grid.elev) return 0;
  const d = elevDiff(b, u.x, u.y, tx, ty);
  return d > 0 ? d * (C.elev.rangePer ?? 1) : 0;
}

/** Melee across a height difference of 2+ is impossible. */
export const meleeElevOk = (b, ax, ay, tx, ty) => !b.grid.elev || Math.abs(elevDiff(b, ax, ay, tx, ty)) < 2;

/** «Занял позицию»: the unit stays in a tile next to cover. */
export const holdsCover = (b, u) => inCoverSpot(b.grid, u.x, u.y);

export { tileCover };
