// Surfaces on battle tiles (Stage B, docs/specs/statuses-surfaces.md §4–5). Pure JS, no DOM.
// Data comes through the battle data bundle: b.data.surfaces (SURFACES), b.data.surfaceRules (SURFACE_RULES).
//
// State: b.surfaces — Map "x,y" → { floor, gas }; a layer is { kind, turns (null = permanent), src, team, level,
// perm?, hazard?, charged? (rounds of electricity on water/blood/proxy), acidic?, proxied?, scent?, fromOil? }.
// Decisions (spec gaps):
//  - a new surface under a unit applies its statuses at once, but no damage (damage — on entry / turn start);
//  - "electrified water" is the water layer with `charged` rounds (acts as water + electric), not a second layer;
//  - acid + water → water stays `acidic` for 2 rounds (entry: acid 1 round); cringe + proxy → cringe with `proxied`
//    (tick ×1.5 and overload on entry); permanent map surfaces (T_HAZARD fire, T_WATER) are never removed;
//  - fire/electric damage to a unit standing on oil / toxgas / water also hits its tile (spark, blaze, electrify);
//  - surface damage hits a unit at most once per turn per damage type (statuses still refresh).

import { rollDice, avgDice } from './dice.js';
import { damageObjectsIn } from './terrain.js';
import { chebyshev, lineOfSight, inBounds, isPassable, walkLine, DIRS8, T_HAZARD, T_WATER, T_BARREL, T_FLOOR } from './grid.js';
import {
  emitEvent, dealDamage, applyStatus, rollSave, hasStatus, getStatus, isAlive, unitAt, hasSafePassage, pushFrom,
  isStatusImmune, unitHasTag,
} from './combat.js';

const LAYERS = ['floor', 'gas'];
const PRIORITY = { explode: 0, blaze: 1, electrify: 2 };
const SIGHT_GAS = { smoke: 1, steam: 1 };
const HOT = { fire: 1, electric: 1 };
const MAX_DEPTH = 6;

/**
 * Combination table [existing floor][incoming kind] → action (spec §5). Missing pair: replace
 * (blood never replaces anything — it only fills empty tiles).
 */
const COMBO = {
  water: { fire: 'steam', ice: 'freeze', acid: 'dissolve', electric: 'electrify', oil: 'replace', blood: 'keep' },
  fire: { water: 'steam', ice: 'melt', oil: 'blaze', acid: 'vaporAcid', blood: 'keep', cringe: 'burnout', electric: 'keep' },
  ice: { fire: 'melt', water: 'keep', electric: 'shatter', oil: 'slick', blood: 'pinkIce' },
  oil: { fire: 'blaze', electric: 'blaze', water: 'keep', acid: 'oilAcid', ice: 'slick', blood: 'keep' },
  acid: { water: 'dissolve', fire: 'vaporAcid', oil: 'oilAcid', blood: 'keep' },
  blood: { electric: 'electrify', fire: 'smokeOut', ice: 'pinkIce', water: 'replace' },
  cringe: { fire: 'burnout', proxy: 'cringeProxy', blood: 'keep' },
  proxy: { electric: 'overvolt', cringe: 'cringeProxy', blood: 'keep' },
  electric: { water: 'electrifyNew', oil: 'blaze', ice: 'shatter', blood: 'keep', fire: 'replace' },
};

export const surfaceDefs = (b) => (b.data && b.data.surfaces) || {};
const rules = (b) => (b.data && b.data.surfaceRules) || {};
export const surfacesOn = (b) => !!(b.surfaces && surfaceDefs(b).fire);

/** tier(L) = 1 + ⌊(L−1)/step⌋: multiplier of tick / surface damage. */
export function tierOf(L, step = 5) { return 1 + Math.floor((Math.max(1, L || 1) - 1) / step); }
export const tierFor = (b, L) => tierOf(L, rules(b).tierStep || 5);

/** «Уровень боя» for environment without a source: average level of non-summon units. */
export function battleLevel(b) {
  if (b.level == null) {
    const us = b.units.filter((u) => u.kind !== 'summon');
    b.level = us.length ? Math.max(1, Math.round(us.reduce((s, u) => s + (u.level || 1), 0) / us.length)) : 1;
  }
  return b.level;
}
const levelOf = (b, src) => (src && src.level) || battleLevel(b);
export const surfaceDc = (b, L) => (rules(b).dcBase ?? 10) + Math.floor((L || 1) / 2);

// ---------------------------------------------------------------- state

export function initSurfaces(b) {
  b.surfaces = new Map();
  b.surfaceVersion = 0;
  b.gridVersion = 0;
  b.barrels = (b.grid.barrels || []).map((o) => ({ ...o }));
  const defs = surfaceDefs(b);
  if (!defs.fire) return;
  const g = b.grid;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t = g.tiles[y * g.w + x];
    if (t === T_HAZARD) setLayer(b, x, y, 'floor', { kind: 'fire', turns: null, src: null, team: null, level: null, perm: true, hazard: true });
    else if (t === T_WATER && defs.water) setLayer(b, x, y, 'floor', { kind: 'water', turns: null, src: null, team: null, level: null, perm: true });
  }
}

export const cellAt = (b, x, y) => (b.surfaces ? b.surfaces.get(`${x},${y}`) || null : null);
export const floorAt = (b, x, y) => cellAt(b, x, y)?.floor || null;
export const gasAt = (b, x, y) => cellAt(b, x, y)?.gas || null;
/** Kinds on a tile (floor first), e.g. ['oil', 'toxgas']. Electrified water/blood also lists 'electric'. */
export function surfaceKindsAt(b, x, y) {
  const c = cellAt(b, x, y);
  if (!c) return [];
  const out = [];
  if (c.floor) { out.push(c.floor.kind); if (c.floor.charged && c.floor.kind !== 'electric') out.push('electric'); }
  if (c.gas) out.push(c.gas.kind);
  return out;
}

function setLayer(b, x, y, layer, obj) {
  const k = `${x},${y}`;
  let c = b.surfaces.get(k);
  if (!c) {
    if (!obj) return;
    c = { floor: null, gas: null };
    b.surfaces.set(k, c);
  }
  c[layer] = obj;
  if (!c.floor && !c.gas) b.surfaces.delete(k);
  b.surfaceVersion++;
}
function clearLayer(b, x, y, layer) {
  const c = cellAt(b, x, y);
  if (!c || !c[layer] || c[layer].perm) return false;
  setLayer(b, x, y, layer, null);
  return true;
}

const maxTurns = (a, n) => (a == null ? null : n == null ? null : Math.max(a, n));

/** Tiles of a radius around a centre: in bounds, enterable, in line of sight of the centre. */
export function radiusTiles(b, cx, cy, size) {
  const out = [];
  const r = Math.max(0, size || 0);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inBounds(b.grid, x, y)) continue;
    if (!isPassable(b.grid, x, y) && !barrelAt(b, x, y)) continue;
    if ((x !== cx || y !== cy) && !lineOfSight(b.grid, cx, cy, x, y)) continue;
    out.push({ x, y });
  }
  return out;
}

/** Connected tiles (8 directions) whose `layer` kind is in kinds, starting at (x, y). */
export function connected(b, x, y, layer, kinds, cap = 400) {
  const seen = new Set();
  const out = [];
  const q = [[x, y]];
  while (q.length && out.length < cap) {
    const [cx, cy] = q.shift();
    const k = `${cx},${cy}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const s = cellAt(b, cx, cy)?.[layer];
    if (!s || !kinds.includes(s.kind)) continue;
    out.push({ x: cx, y: cy });
    for (const [dx, dy] of DIRS8) q.push([cx + dx, cy + dy]);
  }
  return out;
}

// ---------------------------------------------------------------- creation & combinations

/**
 * Create a surface on tiles. src — creating unit (level → tier), o: { turns, level, size, noIgnite }.
 * Returns the tiles where `kind` actually lies afterwards.
 */
export function createSurface(b, kind, tiles, src, o = {}) {
  const def = surfaceDefs(b)[kind];
  if (!def || !surfacesOn(b) || !tiles || !tiles.length) return [];
  if ((b.surfDepth || 0) > MAX_DEPTH) return [];
  b.surfDepth = (b.surfDepth || 0) + 1;
  const L = o.level ?? levelOf(b, src);
  const turns = o.turns ?? def.turns;
  const queue = [];
  const placed = [];
  for (const p of tiles) {
    if (barrelAt(b, p.x, p.y)) { if (HOT[kind]) queue.push({ type: 'barrel', x: p.x, y: p.y }); continue; }
    if (!inBounds(b.grid, p.x, p.y) || !isPassable(b.grid, p.x, p.y)) continue;
    if (addSurface(b, p.x, p.y, kind, { turns, src, level: L, noIgnite: o.noIgnite }, queue)) placed.push(p);
  }
  if (placed.length) {
    const c = tiles[0];
    emitEvent(b, { type: 'surfaceCreate', actor: src ? src.id : null, kind, x: c.x, y: c.y, size: o.size ?? 0, turns, tiles: placed.length });
  }
  resolveQueue(b, queue, src, L);
  for (const p of placed) {
    const u = unitAt(b, p.x, p.y);
    const s = cellAt(b, p.x, p.y)?.[def.layer];
    if (u && isAlive(u) && s && s.kind === kind) applyKind(b, u, s, 'create');
  }
  b.surfDepth--;
  return placed.filter((p) => cellAt(b, p.x, p.y)?.[def.layer]?.kind === kind);
}

function combo(b, a, k, result, x, y, tiles = 1) {
  emitEvent(b, { type: 'surfaceCombo', a, b: k, result, x, y, tiles });
}

/** Put one surface on one tile, resolving local combinations; region ones go to `queue`. */
function addSurface(b, x, y, kind, o, queue) {
  const defs = surfaceDefs(b);
  const R = rules(b);
  const def = defs[kind];
  const c = cellAt(b, x, y);
  const f = c ? c.floor : null;
  const gs = c ? c.gas : null;
  const mk = (k, turns, extra) => ({ kind: k, turns: turns === undefined ? defs[k].turns : turns, src: o.src ? o.src.id : null, team: o.src ? o.src.team : null, level: o.level, ...extra });
  const put = (layer, s) => setLayer(b, x, y, layer, s);
  const putGas = (k, turns, extra) => { if (!(gs && gs.perm)) put('gas', mk(k, turns, extra)); };
  const unitHere = () => { const u = unitAt(b, x, y); return u && isAlive(u) ? u : null; };

  if (def.layer === 'gas') {
    if (gs && gs.kind === kind) { gs.turns = maxTurns(gs.turns, o.turns); return true; }
    if (gs && gs.perm) return false;
    put('gas', mk(kind, o.turns));
    if (kind === 'toxgas' && !o.noIgnite && f && (f.kind === 'fire' || f.kind === 'electric' || f.charged)) {
      queue.push({ type: 'explode', x, y, by: f.kind === 'fire' ? 'fire' : 'electric' });
    }
    return true;
  }
  if (HOT[kind] && gs && gs.kind === 'toxgas') queue.push({ type: 'explode', x, y, by: kind });
  if (!f) {
    const t = kind === 'fire' && gs && gs.kind === 'smoke' && o.turns != null ? o.turns + (R.smokeFirePlus ?? 1) : o.turns;
    put('floor', mk(kind, t));
    return true;
  }
  if (f.kind === kind) { f.turns = maxTurns(f.turns, o.turns); return true; }
  const action = (COMBO[f.kind] && COMBO[f.kind][kind]) || (kind === 'blood' ? 'keep' : 'replace');
  switch (action) {
    case 'keep':
      if (f.kind === 'ice' && kind === 'water') f.turns = maxTurns(f.turns, R.freezeTurns ?? 6);
      return false;
    case 'replace':
      if (f.perm) return false;
      put('floor', mk(kind, o.turns));
      return true;
    case 'steam':
      clearLayer(b, x, y, 'floor');
      putGas('steam', R.steamTurns ?? 2);
      combo(b, f.kind, kind, 'steam', x, y);
      return false;
    case 'melt':
      if (!f.perm) put('floor', mk('water', R.meltTurns ?? defs.water.turns));
      combo(b, f.kind, kind, 'melt', x, y);
      return false;
    case 'freeze': {
      if (!f.perm) put('floor', mk('ice', R.freezeTurns ?? 6));
      const u = unitHere();
      if (u) applyStatus(b, u, 'frozen', R.frozenTurns ?? 1, o.src || null);
      combo(b, f.kind, kind, 'freeze', x, y);
      return !f.perm;
    }
    case 'dissolve':
      if (f.kind === 'water') f.acidic = R.acidicTurns ?? 2;
      else put('floor', mk('water', undefined, { acidic: R.acidicTurns ?? 2 }));
      combo(b, f.kind, kind, 'dissolve', x, y);
      return kind === 'water';
    case 'electrify':
      queue.push({ type: 'electrify', x, y, kind: f.kind });
      return false;
    case 'electrifyNew':
      put('floor', mk('water', o.turns, { charged: f.turns ?? (R.electrify?.water ?? 3) }));
      queue.push({ type: 'electrify', x, y, kind: 'water' });
      return true;
    case 'blaze':
      if (f.kind !== 'oil') put('floor', mk('oil', undefined));
      queue.push({ type: 'blaze', x, y });
      return false;
    case 'vaporAcid':
      if (f.kind === 'acid') clearLayer(b, x, y, 'floor');
      addSurface(b, x, y, 'toxgas', { ...o, turns: R.vaporAcidTurns ?? 2, noIgnite: true }, queue);
      combo(b, f.kind, kind, 'toxgas', x, y);
      return false;
    case 'oilAcid':
      clearLayer(b, x, y, 'floor');
      if (!gs) putGas('smoke', R.smokeOutTurns ?? 1);
      combo(b, f.kind, kind, 'smoke', x, y);
      return false;
    case 'smokeOut':
      if (f.perm) return false;
      put('floor', mk(kind, o.turns));
      if (!gs) putGas('smoke', R.smokeOutTurns ?? 1);
      combo(b, f.kind, kind, 'smoke', x, y);
      return true;
    case 'pinkIce':
      if (f.kind === 'ice') { f.scent = true; return false; }
      put('floor', mk('ice', o.turns, { scent: true }));
      return true;
    case 'burnout': {
      const u = unitHere();
      if (u) applyStatus(b, u, 'panic', R.burnoutPanic ?? 2, o.src || null);
      combo(b, f.kind, kind, 'burnout', x, y);
      if (f.kind === 'cringe') { put('floor', mk(kind, o.turns)); return true; }
      return false;
    }
    case 'cringeProxy':
      if (f.kind === 'cringe') { f.proxied = true; f.turns = maxTurns(f.turns, o.turns); }
      else put('floor', mk('cringe', o.turns, { proxied: true }));
      combo(b, f.kind, kind, 'cringeProxy', x, y);
      return kind === 'cringe';
    case 'overvolt':
      queue.push({ type: 'electrify', x, y, kind: 'proxy' });
      return false;
    case 'shatter':
      if (!f.perm) put('floor', mk('water', R.shatterTurns ?? 3));
      combo(b, f.kind, kind, 'shatter', x, y);
      return false;
    case 'slick': {
      const u = unitHere();
      if (u) applyStatus(b, u, 'slick', R.slickTurns ?? 3, o.src || null);
      if (kind === 'oil' && !f.perm) { put('floor', mk('oil', o.turns)); return true; }
      return false;
    }
    default:
      return false;
  }
}

function resolveQueue(b, queue, src, L) {
  if (!queue.length) return;
  queue.sort((p, q) => (PRIORITY[p.type] ?? 9) - (PRIORITY[q.type] ?? 9));
  for (const job of queue) {
    if (job.type === 'explode') explode(b, job.x, job.y, src, L, job.by);
    else if (job.type === 'blaze') blaze(b, job.x, job.y, src, L);
    else if (job.type === 'electrify') electrify(b, job.x, job.y, src, L, job.kind);
    else if (job.type === 'barrel') destroyBarrel(b, job.x, job.y, src);
  }
}

/** Gas explosion: 2d6 × tier fire to everyone in the connected toxgas (DEX save — half), push 1, fire at the centre. */
function explode(b, x, y, src, L, by) {
  const g = gasAt(b, x, y);
  if (!g || g.kind !== 'toxgas' || (b.surfDepth || 0) > MAX_DEPTH) return;
  const R = rules(b).explosion || { dice: '2d6', save: 'dex', push: 1, fireTurns: 2 };
  const lvl = L ?? g.level ?? battleLevel(b);
  const region = connected(b, x, y, 'gas', ['toxgas']);
  for (const p of region) setLayer(b, p.x, p.y, 'gas', null);
  combo(b, 'toxgas', by || 'fire', 'explosion', x, y, region.length);
  const dc = surfaceDc(b, lvl);
  const tier = tierFor(b, lvl);
  for (const p of region) {
    const u = unitAt(b, p.x, p.y);
    if (!u || !isAlive(u)) continue;
    const half = rollSave(b, u, R.save || 'dex', dc, src, 'surface:explosion');
    let amt = rollDice(b.rng, R.dice) * tier;
    if (half) amt = Math.floor(amt / 2);
    dealDamage(b, src && isAlive(src) ? src : null, u, amt, 'fire', { surface: true });
    if (isAlive(u) && !half && R.push) pushFrom(b, { id: src ? src.id : null, x, y }, u, R.push);
  }
  for (const br of b.barrels.slice()) if (region.some((p) => chebyshev(p.x, p.y, br.x, br.y) <= 1)) destroyBarrel(b, br.x, br.y, src);
  damageObjectsIn(b, (ox, oy) => region.some((p) => chebyshev(p.x, p.y, ox, oy) <= 1), rollDice(b.rng, R.dice) * tier, src, 'fire');
  createSurface(b, 'fire', [{ x, y }], src, { turns: R.fireTurns ?? 2, level: lvl });
}

/** Oil fire: the connected oil (up to chainCap tiles) turns into fire, units in it burn. */
function blaze(b, x, y, src, L) {
  const f = floorAt(b, x, y);
  if (!f || f.kind !== 'oil') return;
  const R = rules(b);
  const B = R.blaze || { dice: '1d6', fireTurns: 5, smokeTurns: 2, burnTurns: 3 };
  const lvl = L ?? f.level ?? battleLevel(b);
  const region = connected(b, x, y, 'floor', ['oil'], R.chainCap ?? 12);
  for (const p of region) if (gasAt(b, p.x, p.y)?.kind === 'toxgas') explode(b, p.x, p.y, src, lvl, 'fire');
  igniteTiles(b, region, src, lvl, B);
  combo(b, 'oil', 'fire', 'blaze', x, y, region.length);
}

function igniteTiles(b, tiles, src, lvl, B) {
  const tier = tierFor(b, lvl);
  for (const p of tiles) {
    const cur = floorAt(b, p.x, p.y);
    if (!cur || cur.kind !== 'oil') continue;
    setLayer(b, p.x, p.y, 'floor', { kind: 'fire', turns: B.fireTurns, src: src ? src.id : null, team: src ? src.team : null, level: lvl, fromOil: true });
  }
  for (const p of tiles) {
    const u = unitAt(b, p.x, p.y);
    if (!u || !isAlive(u)) continue;
    dealDamage(b, src && isAlive(src) ? src : null, u, rollDice(b.rng, B.dice) * tier, 'fire', { surface: true });
    if (isAlive(u)) applyStatus(b, u, 'burn', B.burnTurns ?? 3, src || null);
  }
}

/** Electrified puddle: the whole connected water (blood — 1 tile around, proxy — the tile) carries current. */
function electrify(b, x, y, src, L, kind) {
  const f = floorAt(b, x, y);
  if (!f || (b.surfDepth || 0) > MAX_DEPTH) return;
  const R = rules(b).electrify || { water: 3, blood: 3, proxy: 2, proxyMechMul: 1.5, overloadPlus: 1 };
  const lvl = L ?? f.level ?? battleLevel(b);
  let region;
  if (kind === 'water') region = connected(b, x, y, 'floor', ['water']);
  else if (kind === 'blood') region = connected(b, x, y, 'floor', ['blood'], 9).filter((p) => chebyshev(p.x, p.y, x, y) <= 1);
  else region = [{ x, y }];
  const turns = R[kind] ?? 3;
  for (const p of region) {
    const s = floorAt(b, p.x, p.y);
    if (s) { s.charged = Math.max(s.charged || 0, turns); s.chargeLevel = lvl; }
  }
  b.surfaceVersion++;
  combo(b, kind, 'electric', kind === 'proxy' ? 'overvolt' : 'electrify', x, y, region.length);
  for (const p of region) {
    const u = unitAt(b, p.x, p.y);
    if (u && isAlive(u)) shockUnit(b, u, kind, lvl, src, false);
  }
}

/** Electric hit from a charged / electric tile: 1d6 × tier, shocked; proxy: ×1.5 to machines, overload +1. */
function shockUnit(b, u, kind, lvl, src, dedupe) {
  const defs = surfaceDefs(b);
  const R = rules(b).electrify || {};
  const e = (defs.electric && defs.electric.enter) || { dice: '1d6', dmgType: 'electric', statuses: [['shocked', 1]] };
  if (kind === 'water') applyStatus(b, u, 'wet', defs.water?.enter?.statuses?.[0]?.[1] ?? 3, src || null);
  if (!hasSafePassage(b, u) && !(dedupe && hitThisTurn(b, u, 'electric'))) {
    let amt = rollDice(b.rng, e.dice) * tierFor(b, lvl);
    if (kind === 'proxy' && u.tags.includes('mechanical')) amt = Math.floor(amt * (R.proxyMechMul ?? 1.5));
    dealDamage(b, null, u, amt, 'electric', { surface: true });
  }
  if (!isAlive(u)) return;
  for (const [id, t] of e.statuses || []) applyStatus(b, u, id, t, src || null);
  if (kind === 'proxy') {
    const cur = getStatus(u, 'overload');
    applyStatus(b, u, 'overload', (cur ? cur.turns || 0 : 0) + (R.overloadPlus ?? 1), src || null);
  }
}

/** Fire / electric damage dealt to a unit also reaches its tile (spark on oil, gas explosion, electrified puddle). */
export function elementHit(b, src, x, y, dmgType) {
  if (!surfacesOn(b) || !HOT[dmgType] || (b.surfDepth || 0) > 2 || x < 0) return;
  const c = cellAt(b, x, y);
  if (!c) return;
  const queue = [];
  if (c.gas && c.gas.kind === 'toxgas') queue.push({ type: 'explode', x, y, by: dmgType });
  const f = c.floor;
  if (f && f.kind === 'oil') queue.push({ type: 'blaze', x, y });
  else if (f && dmgType === 'electric' && (f.kind === 'water' || f.kind === 'blood') && !f.charged) queue.push({ type: 'electrify', x, y, kind: f.kind });
  else if (f && dmgType === 'fire' && f.kind === 'ice' && !f.perm) {
    setLayer(b, x, y, 'floor', { ...f, kind: 'water', turns: rules(b).meltTurns ?? 8, scent: false });
    combo(b, 'ice', 'fire', 'melt', x, y);
  }
  if (!queue.length) return;
  b.surfDepth = (b.surfDepth || 0) + 1;
  resolveQueue(b, queue, src, levelOf(b, src));
  b.surfDepth--;
}

// ---------------------------------------------------------------- barrels (T_BARREL)

export const barrelAt = (b, x, y) => (b.barrels ? b.barrels.find((r) => r.x === x && r.y === y) || null : null);

/** Break a barrel: the tile becomes floor, its content spills in radius 1 (oil or toxgas). */
export function destroyBarrel(b, x, y, src) {
  const br = barrelAt(b, x, y);
  if (!br) return;
  b.barrels.splice(b.barrels.indexOf(br), 1);
  b.grid.tiles[y * b.grid.w + x] = T_FLOOR;
  b.gridVersion = (b.gridVersion || 0) + 1;
  b.occVersion++;
  b.reachCache = null;
  emitEvent(b, { type: 'barrelBreak', actor: src ? src.id : null, x, y, kind: br.kind });
  createSurface(b, br.kind, radiusTiles(b, x, y, 1), src, {});
}
/** Barrels touched by an area (predicate over tiles). */
export function breakBarrelsIn(b, test, src) {
  if (!b.barrels || !b.barrels.length) return;
  for (const br of b.barrels.slice()) if (test(br.x, br.y)) destroyBarrel(b, br.x, br.y, src);
}

// ---------------------------------------------------------------- entering / standing

function hitThisTurn(b, u, dmgType) {
  const key = `${b.round}:${b.turnIndex}`;
  if (!u.surfHit || u.surfHit.key !== key) u.surfHit = { key, types: [] };
  if (u.surfHit.types.includes(dmgType)) return true;
  u.surfHit.types.push(dmgType);
  return false;
}

/** Effects of the unit's tile. mode: 'enter' (step, push, teleport) | 'turn' (start of its turn) | 'create'. */
export function surfaceEffect(b, u, mode = 'enter') {
  if (!surfacesOn(b) || !isAlive(u) || u.x < 0) return;
  const c = cellAt(b, u.x, u.y);
  if (!c) return;
  const f = c.floor, g = c.gas;
  if (f) applyKind(b, u, f, mode);
  if (g && isAlive(u) && cellAt(b, u.x, u.y)?.gas === g) applyKind(b, u, g, mode);
}

function applyKind(b, u, s, mode) {
  const defs = surfaceDefs(b);
  const def = defs[s.kind];
  if (!def) return;
  const R = rules(b);
  const e = def.enter || {};
  if (s.kind === 'proxy' && u.tags.includes('proxy')) return; // native element
  if (u.immuneSurface && u.immuneSurface.includes(s.kind)) return; // v7 mods (immuneSurface): no damage, no statuses
  const L = s.level || battleLevel(b);
  const tier = tierFor(b, L);
  const dc = surfaceDc(b, L);
  const src = (s.src && b.byId[s.src]) || null;
  const safe = hasSafePassage(b, u);
  const harmful = !!e.dice;
  if (mode !== 'create') {
    if (s.hazard) emitEvent(b, { type: 'hazard', target: u.id, x: u.x, y: u.y, avoided: safe || undefined });
    else emitEvent(b, { type: 'surfaceEnter', target: u.id, kind: s.kind, x: u.x, y: u.y, mode, avoided: (safe && harmful) || undefined });
  }
  const hadSlick = hasStatus(u, 'slick');
  let saved = false;
  if (e.save) saved = rollSave(b, u, e.save, dc, null, 'surface:' + s.kind);
  if (harmful && mode !== 'create' && !safe && !hitThisTurn(b, u, e.dmgType)) {
    let amt = rollDice(b.rng, e.dice) * tier;
    if (s.kind === 'cringe' && s.proxied) amt = Math.floor(amt * (R.cringeProxyMul ?? 1.5));
    if (saved) amt = Math.floor(amt / 2);
    dealDamage(b, src && isAlive(src) && src !== u ? src : null, u, amt, e.dmgType, { surface: true, phobia: 'hazard' });
  }
  if (!isAlive(u)) return;
  if (!saved) {
    for (const [id, t] of e.statuses || []) applyStatus(b, u, id, t, src);
    if (u.tags.includes('organic') || u.tags.includes('hybrid')) for (const [id, t] of e.organic || []) applyStatus(b, u, id, t, src);
    if (u.tags.includes('mechanical') || u.tags.includes('hybrid')) for (const [id, t] of e.mech || []) applyStatus(b, u, id, t, src);
  }
  if (s.kind === 'water' && s.acidic) applyStatus(b, u, 'acid', 1, src);
  if (s.kind === 'cringe' && s.proxied) for (const [id, t] of defs.proxy?.enter?.statuses || []) if (!u.tags.includes('proxy')) applyStatus(b, u, id, t, src);
  if (s.charged && s.kind !== 'electric' && mode !== 'create') shockUnit(b, u, s.kind, s.chargeLevel || L, src, true);
  if (s.kind === 'ice') {
    if (e.fallSave && mode !== 'turn' && !rollSave(b, u, e.fallSave, dc, null, 'surface:ice')) applyStatus(b, u, 'prone', 1, src);
    if (e.wetStatus && hasStatus(u, 'wet')) applyStatus(b, u, e.wetStatus[0], e.wetStatus[1], src);
    if (s.scent && (u.tags.includes('organic') || u.tags.includes('hybrid'))) applyStatus(b, u, 'scent', 3, src);
  }
  if (s.kind === 'oil' && mode === 'enter' && hadSlick && !rollSave(b, u, 'dex', dc, null, 'surface:oil')) applyStatus(b, u, 'prone', 1, src);
  if (s.kind === 'cringe' && e.panic && mode === 'turn' && u.maxMrl > 0 && u.mrl <= u.maxMrl * (e.panic.mrlBelow ?? 0.25)
    && !rollSave(b, u, e.panic.save || 'wil', dc, null, 'surface:cringe')) applyStatus(b, u, 'panic', e.panic.turns ?? 2, src);
  if (s.kind === 'oil' && hasStatus(u, 'burn') && mode !== 'create') elementHit(b, u, u.x, u.y, 'fire');
}

// ---------------------------------------------------------------- round tick

/** roundStart: −1 round, expired surfaces vanish (oil fire leaves smoke), fire spreads to adjacent oil / gas. */
export function tickSurfaces(b) {
  if (!b.surfaces || !b.surfaces.size) return;
  const R = rules(b);
  const ended = [];
  for (const [k, c] of b.surfaces) {
    for (const layer of LAYERS) {
      const s = c[layer];
      if (!s) continue;
      if (s.charged && --s.charged <= 0) delete s.charged;
      if (s.acidic && --s.acidic <= 0) delete s.acidic;
      if (s.turns == null) continue;
      if (--s.turns <= 0) ended.push({ k, layer, s });
    }
  }
  const byKind = {};
  for (const e of ended) {
    const [x, y] = e.k.split(',').map(Number);
    setLayer(b, x, y, e.layer, null);
    (byKind[e.s.kind] || (byKind[e.s.kind] = [])).push({ x, y });
    if (e.s.kind === 'fire' && e.s.fromOil && !gasAt(b, x, y) && surfaceDefs(b).smoke) {
      setLayer(b, x, y, 'gas', { kind: 'smoke', turns: R.blaze?.smokeTurns ?? 2, src: null, team: null, level: e.s.level });
    }
  }
  for (const [kind, tiles] of Object.entries(byKind)) emitEvent(b, { type: 'surfaceEnd', kind, x: tiles[0].x, y: tiles[0].y, tiles: tiles.length });
  spreadFire(b);
  b.surfaceVersion++;
}

function spreadFire(b) {
  const R = rules(b);
  const oil = [], gas = [];
  const seen = new Set();
  for (const [k, c] of b.surfaces) {
    if (!c.floor || c.floor.kind !== 'fire') continue;
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy, nk = `${nx},${ny}`;
      if (seen.has(nk)) continue;
      const n = cellAt(b, nx, ny);
      if (!n) continue;
      if (n.floor && n.floor.kind === 'oil') { seen.add(nk); oil.push({ x: nx, y: ny, level: c.floor.level }); }
      if (n.gas && n.gas.kind === 'toxgas') { seen.add(nk); gas.push({ x: nx, y: ny, level: c.floor.level }); }
    }
  }
  for (const p of gas) explode(b, p.x, p.y, null, p.level, 'fire');
  const cap = R.chainCap ?? 12;
  const list = oil.filter((p) => floorAt(b, p.x, p.y)?.kind === 'oil').slice(0, cap);
  if (!list.length) return;
  igniteTiles(b, list, null, list[0].level || battleLevel(b), R.blaze || { dice: '1d6', fireTurns: 5, burnTurns: 3 });
  emitEvent(b, { type: 'surfaceIgnite', x: list[0].x, y: list[0].y, tiles: list.length });
}

// ---------------------------------------------------------------- queries for rules / AI / UI

/** Smoke or steam on the tile (ranged attacks through it have disadvantage). */
export const sightGasAt = (b, x, y) => !!SIGHT_GAS[gasAt(b, x, y)?.kind];
export function gasBetween(b, ax, ay, tx, ty) {
  if (!b.surfaces || !b.surfaces.size) return false;
  if (sightGasAt(b, ax, ay) || sightGasAt(b, tx, ty)) return true;
  return walkLine(ax, ay, tx, ty, (x, y) => sightGasAt(b, x, y));
}

/** Remove surfaces of given kinds in a radius (code-cleanse). */
export function clearSurfaces(b, kinds, cx, cy, size, src) {
  if (!b.surfaces) return 0;
  let n = 0;
  for (let y = cy - size; y <= cy + size; y++) for (let x = cx - size; x <= cx + size; x++) {
    const c = cellAt(b, x, y);
    if (!c) continue;
    for (const layer of LAYERS) if (c[layer] && kinds.includes(c[layer].kind) && clearLayer(b, x, y, layer)) n++;
  }
  if (n) emitEvent(b, { type: 'surfaceEnd', actor: src ? src.id : null, kind: kinds.join(','), x: cx, y: cy, tiles: n, cleared: true });
  return n;
}

/** +1 to attack rolls: techonki on proxy, rappers / cringegons on cringe. */
export function surfaceHitBonus(b, u) {
  const f = floorAt(b, u.x, u.y);
  if (!f) return 0;
  const v = rules(b).nativeHit ?? 1;
  if (f.kind === 'proxy' && u.tags.includes('proxy')) return v;
  if (f.kind === 'cringe' && (u.tags.includes('cringe') || unitHasTag(u, 'cls:reper'))) return v;
  return 0;
}

/** Statuses a surface entry would put on u (non-immune). */
function entryStatuses(b, u, s) {
  const e = surfaceDefs(b)[s.kind]?.enter || {};
  const ids = (e.statuses || []).map((x) => x[0]);
  if (u.tags.includes('organic') || u.tags.includes('hybrid')) ids.push(...(e.organic || []).map((x) => x[0]));
  if (u.tags.includes('mechanical') || u.tags.includes('hybrid')) ids.push(...(e.mech || []).map((x) => x[0]));
  if (s.charged) ids.push('shocked');
  return ids.filter((id) => !isStatusImmune(b, u, id));
}

/**
 * Preview of stepping onto (x, y): { dmg (average HP/MRL loss), dmgType, statuses: [ids], kinds } or null.
 */
export function surfaceEnterPreview(b, u, x, y) {
  const c = cellAt(b, x, y);
  if (!c || !surfacesOn(b)) return null;
  const out = { dmg: 0, dmgType: null, statuses: [], kinds: [] };
  const safe = hasSafePassage(b, u);
  for (const layer of LAYERS) {
    const s = c[layer];
    if (!s) continue;
    if (s.kind === 'proxy' && u.tags.includes('proxy')) continue;
    if (u.immuneSurface && u.immuneSurface.includes(s.kind)) continue;
    out.kinds.push(s.kind);
    const e = surfaceDefs(b)[s.kind]?.enter || {};
    const tier = tierFor(b, s.level || battleLevel(b));
    if (e.dice && !safe) { out.dmg += Math.round(avgDice(e.dice) * tier); out.dmgType = out.dmgType || e.dmgType; }
    if (s.charged && !safe) { out.dmg += Math.round(3.5 * tier); out.dmgType = out.dmgType || 'electric'; }
    for (const id of entryStatuses(b, u, s)) if (!out.statuses.includes(id)) out.statuses.push(id);
  }
  return out.kinds.length ? out : null;
}

/**
 * AI penalty for standing on / walking through (x, y) (spec §7). 0 — harmless for this unit.
 * Ignores damage under safe passage; fire is "not worse" for a burning unit; water is attractive while burning.
 */
export function surfaceHarm(b, u, x, y) {
  const c = cellAt(b, x, y);
  if (!c) return 0;
  const defs = surfaceDefs(b);
  const R = rules(b);
  const safe = hasSafePassage(b, u);
  let h = 0;
  for (const layer of LAYERS) {
    const s = c[layer];
    if (!s) continue;
    const def = defs[s.kind];
    if (!def || (u.immuneSurface && u.immuneSurface.includes(s.kind))) continue;
    let v = s.hazard ? (R.hazardAi ?? 6) : def.ai || 0;
    switch (s.kind) {
      case 'fire': if (hasStatus(u, 'burn')) v = 1; break;
      case 'cringe': if (u.maxMrl <= 0) v = 0; else if (u.mrl <= u.maxMrl * 0.25) v = 9; break;
      case 'proxy': v = u.tags.includes('proxy') ? -2 : u.tags.includes('organic') ? 8 : v; break;
      case 'oil': if (fireNear(b, x, y)) v = 12; break;
      case 'water': if (hasStatus(u, 'burn')) v = -6; break;
      default:
    }
    if (s.charged && s.kind !== 'electric') v += defs.electric?.ai ?? 7;
    const e = def.enter || {};
    if (v > 0 && safe && e.dice) v *= 0.3;
    if (v > 0 && !e.dice && !s.charged && !entryStatuses(b, u, s).length) v = 0;
    h += v;
  }
  return h;
}
function fireNear(b, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floorAt(b, x + dx, y + dy)?.kind === 'fire') return true;
  return false;
}

/** Spec of a surface created by an ability / item (a.surface or the first non-per-target op 'surface'). */
export function surfaceOf(a) {
  if (!a) return null;
  if (a.surface) return a.surface;
  return (a.effects || []).find((e) => e.op === 'surface' && !e.per && !e.crit) || null;
}
