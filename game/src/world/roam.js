// Free node map logic without DOM (free-roam.md этап 1): which map a node has, NPC placement from npcsAt (source of
// truth), live objects (the node's caches in crates, opened stashes by flags roam:<loc>:<id>), what an interaction
// does, the cell to walk to for an interaction, save.roam. Rendering and input — scenes/roam.js.
import { ROAM, roamTypeOf } from '../data/world/roam.js';
import { generateRoam, roamGrid, seeded, hashSeed } from './roam-gen.js';
import { LOCATIONS, npcsAt, resolveLocation } from './data.js';
import { NPCS } from '../data/npcs.js';
import { VENDORS } from './vendors.js';
import { reachable, findPath, isPassable, DIRS8 } from '../rules/grid.js';

const cache = new Map();

/** Map def of a node (generated; hand-made maps — этап 3) or null — the node stays a menu. */
export function roamMapFor(locId) {
  const id = resolveLocation(locId);
  if (!ROAM.enabled) return null;
  if (cache.has(id)) return cache.get(id);
  const loc = LOCATIONS[id];
  const m = loc && !loc.alias ? generateRoam(id, loc, roamTypeOf(loc)) : null;
  cache.set(id, m);
  return m;
}
export const hasRoam = (locId) => !!roamMapFor(locId);

export { roamGrid };
export const stashKey = (locId, objId) => `roam:${locId}:${objId}`;

/** A trader stands behind a stall and does not walk. */
export const isTrader = (npc) => !!npc && ((npc.services || []).includes('trade') || !!VENDORS[npc.id]);

/** NPCs of the node now (npcsAt with the save, minus active companions — they walk in the party chain). */
export function roamNpcIds(locId, save) {
  const inParty = new Set((save?.party || []).filter((p) => p.state === 'active').map((p) => p.npc));
  return npcsAt(locId, save).filter((id) => NPCS[id] && !inParty.has(id));
}

/**
 * Positions of NPCs: traders at stall stands, the rest at block spots, then free cells near the spawn; deterministic
 * by locId + npc id. Wanderers get a route of 2–3 reachable points (cycle). → [{id, x, y, trader, route}]
 */
export function placeNpcs(map, grid, ids, objects = map.objects) {
  const sorted = [...ids].sort();
  const stalls = objects.filter((o) => o.type === 'stall' && o.stand);
  const used = new Set();
  const key = (x, y) => y * grid.w + x;
  const [sx, sy] = map.spawn.world;
  const reach = reachable(grid, sx, sy, 99999, null);
  const free = reach.list.filter((i) => {
    const x = i % grid.w, y = (i / grid.w) | 0;
    return map.grid[y][x] === '.' && Math.abs(x - sx) + Math.abs(y - sy) > 3;
  });
  const out = [];
  const take = (x, y) => { used.add(key(x, y)); return [x, y]; };
  let si = 0, pi = 0;
  for (const id of sorted) {
    const npc = NPCS[id];
    const rnd = seeded(hashSeed(`${map.id}:${id}`));
    let pos = null, trader = false;
    if (isTrader(npc)) {
      const st = stalls[si++];
      if (st) { pos = take(st.stand[0], st.stand[1]); trader = true; st.npc = id; }
    }
    while (!pos && pi < map.spots.length) { const p = map.spots[pi++]; if (!used.has(key(p[0], p[1]))) pos = take(p[0], p[1]); }
    for (let k = 0; !pos && k < 60 && free.length; k++) {
      const i = free[Math.floor(rnd() * free.length)];
      if (!used.has(i)) pos = take(i % grid.w, (i / grid.w) | 0);
    }
    if (!pos) continue;
    let route = null;
    if (!trader && rnd() < ROAM.npcWander) {
      const near = free.filter((i) => Math.abs((i % grid.w) - pos[0]) <= 6 && Math.abs(((i / grid.w) | 0) - pos[1]) <= 6);
      if (near.length > 3) {
        route = [pos];
        for (let k = 0; k < 2; k++) { const i = near[Math.floor(rnd() * near.length)]; route.push([i % grid.w, (i / grid.w) | 0]); }
      }
    }
    out.push({ id, x: pos[0], y: pos[1], trader, route });
  }
  return out;
}

/**
 * Live objects: the node's own unfound caches go into the first crates (searchCache — the same check as the menu),
 * the rest are generated stashes; `opened` from save.caches / flags.
 */
export function liveObjects(map, locId, save) {
  const loc = LOCATIONS[resolveLocation(locId)];
  const caches = [...(loc?.caches || [])];
  const out = [];
  for (const o0 of map.objects) {
    const o = { ...o0 };
    if (o.type === 'stash') {
      const c = caches.shift();
      if (c) { o.cache = c; o.opened = (save.caches || []).includes(c.id); } else o.opened = !!save.flags?.[stashKey(locId, o.id)];
    }
    out.push(o);
  }
  return out;
}

/** What an interaction with an object does (the scene maps it to the existing windows). */
export function objectAction(o) {
  switch (o.type) {
    case 'stall': return o.npc ? { kind: 'trade', npc: o.npc } : { kind: 'none' };
    case 'stash': return o.opened ? { kind: 'empty' } : o.cache ? { kind: 'cache', cache: o.cache } : { kind: 'stash' };
    case 'bed': return { kind: 'rest' };
    case 'bench': return { kind: 'disassemble' };
    case 'terminal': return { kind: 'terminal' };
    case 'exit': return { kind: 'exit', to: o.to || 'world' };
    default: return { kind: 'flavor' };
  }
}

/** Nearest passable cell next to (tx,ty) by walking distance from (sx,sy) (or the cell itself if it is passable). */
export function approachCell(grid, sx, sy, tx, ty, { self = false } = {}) {
  if (self && isPassable(grid, tx, ty)) return { x: tx, y: ty };
  const r = reachable(grid, sx, sy, 99999, null);
  let best = null, bd = 1e9;
  for (const [dx, dy] of DIRS8) {
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
    const d = r.dist[y * grid.w + x];
    if (d >= 0 && d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

/** A* path for the party leader; null when unreachable. */
export const roamPath = (grid, sx, sy, tx, ty) => (sx === tx && sy === ty ? [] : findPath(grid, sx, sy, tx, ty, null));

/** Within the interaction radius (free-roam.md: 1.5 tiles). */
export const inReach = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) <= ROAM.interact + 1e-6;

/** save.roam = { loc, x, y, party: [[x,y]…] } — restored only if the cell is still walkable. */
export function restorePos(grid, save, locId) {
  const r = save?.roam;
  if (!r || r.loc !== locId || !isPassable(grid, r.x, r.y)) return null;
  return { x: r.x, y: r.y, party: (r.party || []).filter((p) => Array.isArray(p) && isPassable(grid, p[0], p[1])) };
}
