// Generated node maps (free-roam.md §1.1): a border (or rock for bunkers) + blocks from data/maps/blocks.js placed with
// paths between them, exits as gaps in the border, decor, then markers → objects. Deterministic: seed = locId.
// Connectivity is checked (≤ ROAM.genTries attempts); after that unreachable objects are dropped. No DOM.
import { BLOCKS } from '../data/maps/blocks.js';
import { ROAM, ROAM_SIZE, ROAM_TYPES, roamTypeOf } from '../data/world/roam.js';
import { parseMap, reachable, T_WALL, T_COVER, T_WATER } from '../rules/grid.js';

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Marker char → object type; `solid` objects block their cell. */
export const MARKERS = {
  S: { type: 'stall', solid: true }, B: { type: 'bed', solid: true }, K: { type: 'stash', solid: true },
  H: { type: 'bench', solid: true }, T: { type: 'terminal', solid: true }, F: { type: 'fire', solid: true },
  O: { type: 'well', solid: true }, Q: { type: 'exit', solid: true, boat: true },
};

export const mapSize = (type) => ROAM_SIZE[ROAM_TYPES[type]?.size || type] || ROAM_SIZE.default;

/** → map def { id, type, size, grid: [string], objects, spots, zones, spawn: { world: [x, y] } } or null (menu node). */
export function generateRoam(locId, loc, type = roamTypeOf(loc)) {
  if (!type || !ROAM_TYPES[type]) return null;
  let last = null;
  for (let a = 0; a < ROAM.genTries; a++) {
    last = tryGen(locId, type, hashSeed(`${locId}#${a}`));
    if (last.ok) return last.map;
  }
  // repair: keep only what is reachable
  const m = last.map;
  m.objects = m.objects.filter((o) => !last.bad.has(o.id));
  m.spots = m.spots.filter((p) => !last.badSpots.has(`${p[0]},${p[1]}`));
  return m;
}

function tryGen(locId, type, seed) {
  const R = ROAM_TYPES[type];
  const rnd = seeded(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const [W, H] = mapSize(type);
  const fill = R.fill || '.';
  const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : fill)));
  const occ = Array.from({ length: H }, () => new Uint8Array(W)); // block rects
  const water = R.water || 0;
  const yMax = H - 1 - (water ? water + 1 : 0); // last usable row + 1
  if (water) for (let y = H - water; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = 'w';
  const rooms = [];
  const fits = (x0, y0, bw, bh) => {
    if (x0 < 2 || y0 < 2 || x0 + bw > W - 2 || y0 + bh > yMax - 1) return false;
    for (let y = y0 - 1; y <= y0 + bh; y++) for (let x = x0 - 1; x <= x0 + bw; x++) if (occ[y]?.[x]) return false;
    return true;
  };
  const put = (id, cx = null, cy = null) => {
    let tpl = BLOCKS[id];
    if (!tpl) return;
    if (!tpl.join('').includes('S') && rnd() < 0.5) tpl = [...tpl].reverse(); // door up or down
    if (rnd() < 0.5) tpl = tpl.map((r) => [...r].reverse().join(''));
    const bh = tpl.length, bw = tpl[0].length;
    for (let k = 0; k < 120; k++) {
      const x0 = cx != null && k < 20 ? cx - (bw >> 1) + ri(-1, 1) : ri(2, W - 2 - bw);
      const y0 = cy != null && k < 20 ? cy - (bh >> 1) + ri(-1, 1) : ri(2, Math.max(2, yMax - 1 - bh));
      if (!fits(x0, y0, bw, bh)) continue;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { g[y0 + y][x0 + x] = tpl[y][x]; occ[y0 + y][x0 + x] = 1; }
      rooms.push({ id, x: x0, y: y0, w: bw, h: bh });
      return;
    }
  };
  for (const [id, lo, hi] of R.blocks) {
    const n = ri(lo, hi);
    for (let i = 0; i < n; i++) put(id, (id === 'fire' || id === 'plaza') ? W >> 1 : null, (id === 'fire' || id === 'plaza') ? yMax >> 1 : null);
  }
  // exits: gaps in the border (bunker: a hatch above the first room, joined by a corridor)
  const exits = [];
  const carve = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && g[y][x] === '#') g[y][x] = '.'; };
  if (fill === '#') {
    const cs = rooms.map((r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < cs.length; i++) {
      const [ax, ay] = cs[i - 1], [bx, by] = cs[i];
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) { carve(x, ay); carve(x, ay + 1); }
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) { carve(bx, y); carve(bx + 1, y); }
    }
    const a = rooms.find((r) => r.id === 'airlock') || rooms[0];
    const ex = a ? a.x + (a.w >> 1) : W >> 1;
    for (let y = 1; y <= (a ? a.y + (a.h >> 1) : 3); y++) { carve(ex, y); carve(ex + 1, y); }
    g[0][ex] = 'D'; g[0][ex + 1] = 'D';
    exits.push({ cells: [[ex, 0], [ex + 1, 0]], in: [ex, 1] });
  } else {
    const sides = ['top', 'left', 'right', 'bottom'].filter((s) => !(water && s === 'bottom'));
    const order = water ? ['top', 'left', 'right'] : (R.exits === 1 ? ['bottom'] : sides);
    for (let i = 0; i < R.exits; i++) {
      const side = order[i % order.length];
      if (side === 'top' || side === 'bottom') {
        const x = ri(Math.floor(W * 0.3), Math.floor(W * 0.6)), y = side === 'top' ? 0 : H - 1;
        g[y][x] = 'D'; g[y][x + 1] = 'D';
        exits.push({ cells: [[x, y], [x + 1, y]], in: [x, side === 'top' ? 1 : H - 2] });
      } else {
        const y = ri(Math.floor(yMax * 0.3), Math.floor(yMax * 0.6)), x = side === 'left' ? 0 : W - 1;
        g[y][x] = 'D'; g[y + 1][x] = 'D';
        exits.push({ cells: [[x, y], [x, y + 1]], in: [side === 'left' ? 1 : W - 2, y] });
      }
    }
  }
  // port: a pier into the water and a boat at its end
  if (R.pier && water) {
    const px = ri(Math.floor(W * 0.55), Math.floor(W * 0.8));
    for (let y = H - water - 1; y < H - 2; y++) { g[y][px] = '='; g[y][px + 1] = '='; }
    g[H - 3][px + 2] = 'Q';
  }
  // faction city: an inner fence with gaps; the north half is the restricted district
  const zones = [];
  if (R.fence) {
    const fy = yMax >> 1;
    const gaps = [[3, 5], [(W >> 1) - 1, (W >> 1) + 1], [W - 6, W - 4]];
    for (let x = 1; x < W - 1; x++) if (g[fy][x] === '.' && !occ[fy][x] && !gaps.some(([a, b]) => x >= a && x <= b)) g[fy][x] = 'x';
    zones.push({ id: 'inner', rect: [1, 1, W - 2, fy - 1], restricted: true });
  }
  // decor on free ground (never on the ring next to the border, never in blocks' margins)
  for (const [ch, n] of R.decor || []) {
    for (let i = 0; i < n; i++) {
      const x = ri(2, W - 3), y = ri(2, yMax - 2);
      if (g[y][x] !== fill || fill === '#' || occ[y][x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (occ[y + dy]?.[x + dx] || g[y + dy]?.[x + dx] === 'D') near = true;
      if (near && ch !== ',') continue;
      g[y][x] = ch;
    }
  }
  // markers → objects
  const objects = [], spots = [], stands = [];
  const counts = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = g[y][x];
    const M = MARKERS[ch];
    if (M) {
      const n = counts[M.type] = (counts[M.type] || 0) + 1;
      objects.push({ id: `${M.type}${n}`, type: M.type, x, y, solid: M.solid, ...(M.boat ? { to: 'world', boat: true } : {}) });
      g[y][x] = ch === 'Q' ? 'w' : '.';
    } else if (ch === 'n') { spots.push([x, y]); g[y][x] = '.'; } else if (ch === 's') { stands.push([x, y]); g[y][x] = '.'; }
  }
  for (const o of objects) {
    if (o.type !== 'stall') continue;
    let best = null, bd = 9;
    for (const s of stands) { const d = Math.abs(s[0] - o.x) + Math.abs(s[1] - o.y); if (d < bd) { bd = d; best = s; } }
    if (best) o.stand = best;
  }
  exits.forEach((e, i) => objects.push({ id: `exit${i + 1}`, type: 'exit', to: 'world', x: e.cells[0][0], y: e.cells[0][1], cells: e.cells, solid: false }));
  const map = { id: locId, type, size: [W, H], grid: g.map((r) => r.join('')), objects, spots, zones, spawn: { world: exits[0]?.in || [W >> 1, H >> 1] } };
  // connectivity: every exit, the neighbours of every object, every spot and stand
  const grid = roamGrid(map);
  const [sx, sy] = map.spawn.world;
  const r = reachable(grid, sx, sy, 99999, null);
  const reached = (x, y) => x >= 0 && y >= 0 && x < W && y < H && r.dist[y * W + x] >= 0;
  const bad = new Set(), badSpots = new Set();
  for (const o of objects) {
    const cells = o.cells || [[o.x, o.y]];
    let ok = false;
    for (const [cx, cy] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (reached(cx + dx, cy + dy)) ok = true;
    if (o.stand && !reached(o.stand[0], o.stand[1])) ok = false;
    if (!ok) bad.add(o.id);
  }
  for (const p of spots) if (!reached(p[0], p[1])) badSpots.add(`${p[0]},${p[1]}`);
  return { ok: !bad.size && !badSpots.size && reached(sx, sy), map, bad, badSpots };
}

/** Walkable grid of a roam map: battle tiles, water and solid objects block, `=` / `"` are floor. */
export function roamGrid(map) {
  const grid = parseMap({ grid: map.grid });
  grid.costly = false;
  for (let i = 0; i < grid.tiles.length; i++) if (grid.tiles[i] === T_WATER) grid.tiles[i] = T_WALL;
  // rubble and heights only slow the walk (scenes/roam.js), A* stays plain
  for (const o of map.objects) if (o.solid) grid.tiles[o.y * grid.w + o.x] = T_COVER;
  grid.costly = false;
  return grid;
}
