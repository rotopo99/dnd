// Grid: map parsing, Chebyshev distance, Bresenham line of sight, cover, pathfinding.
// Tiles are stored in a flat Uint8Array; index = y * w + x.

export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_COVER = 2;
export const T_HAZARD = 3;
export const T_EXIT = 4;
/** Statuses & surfaces: a water puddle (floor, permanent `water` surface) and a breakable barrel (blocks like cover). */
export const T_WATER = 6;
export const T_BARREL = 7;
/** combat-rework §3: full cover (concrete 'C', flimsy wall 'x') — blocks movement AND line of sight. */
export const T_FULL = 8;
/** Rubble left by a broken object (',' in maps): passable for 2 movement, +1 KB vs ranged, no LOS block. */
export const T_RUBBLE = 9;

const CHAR_TILE = {
  '#': T_WALL, c: T_COVER, '~': T_HAZARD, D: T_EXIT, w: T_WATER, b: T_BARREL, g: T_BARREL,
  C: T_FULL, x: T_FULL, m: T_COVER, G: T_COVER, ',': T_RUBBLE,
};
/** Map chars of destructible objects (combat-rework §3.2) -> object kind (numbers in data/combat.js OBJECTS). */
export const OBJECT_CHARS = { c: 'crate', C: 'concrete', m: 'machine', x: 'wall', G: 'generator' };
/** Tiles that cannot be entered (walls, cover, full cover, barrels). */
export const blocksMove = (t) => t === T_WALL || t === T_COVER || t === T_BARREL || t === T_FULL;
/** Cover level a tile gives: 0 none, 1 rubble, 2 half, 3 full. */
export const tileCover = (t) => (t === T_FULL ? 3 : t === T_COVER || t === T_BARREL ? 2 : t === T_RUBBLE ? 1 : 0);
export const COVER_NAMES = ['none', 'rubble', 'half', 'full'];

export const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * parseMap(def) -> { w, h, tiles, starts: { P, E, A }, exits, def }
 * Unknown characters are floor. 'P' / 'E' / 'A' are floor tiles with a start marker.
 */
export function parseMap(def) {
  const rows = def.grid;
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const tiles = new Uint8Array(w * h);
  const starts = { P: [], E: [], A: [] };
  const exits = [];
  const barrels = [];
  const objects = [];
  let elev = null, rubble = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? '#';
      const t = CHAR_TILE[ch] ?? T_FLOOR;
      tiles[y * w + x] = t;
      if (ch === 'P' || ch === 'E' || ch === 'A') starts[ch].push({ x, y });
      if (t === T_EXIT) exits.push({ x, y });
      if (t === T_BARREL) barrels.push({ x, y, kind: ch === 'g' ? 'toxgas' : 'oil' });
      if (OBJECT_CHARS[ch]) objects.push({ x, y, kind: OBJECT_CHARS[ch] });
      if (t === T_RUBBLE) rubble = true;
      // combat-rework §3.3: '1' / '2' — floor on height 1 / 2 (optional def.elev rows override)
      const e = def.elev ? Number(def.elev[y]?.[x]) || 0 : ch === '1' ? 1 : ch === '2' ? 2 : 0;
      if (e) { if (!elev) elev = new Uint8Array(w * h); elev[y * w + x] = e; }
    }
  }
  return { w, h, tiles, starts, exits, barrels, objects, elev, costly: !!(elev || rubble), def };
}

/** Height of a tile (0 without an elevation layer). */
export const elevAt = (g, x, y) => (g.elev && inBounds(g, x, y) ? g.elev[y * g.w + x] : 0);

/**
 * Movement cost of one step ci -> ni (both passable): 1, +1 rubble, +1 per level up.
 * 0 = not connected (height difference > 1 needs a ramp; falls happen only by push).
 */
export function stepCost(g, ci, ni) {
  let c = g.tiles[ni] === T_RUBBLE ? 2 : 1;
  if (g.elev) {
    const d = g.elev[ni] - g.elev[ci];
    if (d > 1 || d < -1) return 0;
    if (d > 0) c += d;
  }
  return c;
}
/** Total cost of walking `path` ({x,y}[], start excluded) from (sx,sy); first `n` steps (default all). */
export function pathCost(g, sx, sy, path, n = path.length) {
  if (!g.costly) return Math.min(n, path.length);
  let c = 0, prev = sy * g.w + sx;
  for (let i = 0; i < n && i < path.length; i++) {
    const ni = path[i].y * g.w + path[i].x;
    c += stepCost(g, prev, ni) || 1;
    prev = ni;
  }
  return c;
}

/** Simple arena map def for sims/tests: heroes on the left, enemies on the right. */
export function makeArena({ w = 14, h = 9, heroes = 1, enemies = 3, cover = true } = {}) {
  const g = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.';
    g.push(row);
  }
  const set = (x, y, ch) => { g[y] = g[y].slice(0, x) + ch + g[y].slice(x + 1); };
  const mid = h >> 1;
  for (let i = 0; i < heroes; i++) set(2, Math.min(h - 2, Math.max(1, mid + (i % 2 ? -1 : 1) * Math.ceil(i / 2))), 'P');
  for (let i = 0; i < enemies; i++) set(w - 3 - (i >> 2), Math.min(h - 2, Math.max(1, mid + ((i % 4) % 2 ? -1 : 1) * Math.ceil((i % 4) / 2) * 2)), 'E');
  if (cover) {
    const cx = w >> 1;
    set(cx, mid - 2, 'c'); set(cx, mid + 2, 'c'); set(cx - 3, mid, 'c'); set(cx + 3, mid, 'c');
  }
  return { id: 'arena', name: 'Arena', grid: g, enemies: [], allies: [], win: 'killAll', lose: 'teamDown' }; // sims: a side loses when all of it is down
}

export const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const inBounds = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const tileAt = (g, x, y) => (inBounds(g, x, y) ? g.tiles[y * g.w + x] : T_WALL);
const isCoverTile = (t) => t === T_COVER || t === T_BARREL || t === T_FULL;
/** Walls, cover and barrels cannot be entered. */
export const isPassable = (g, x, y) => {
  return !blocksMove(tileAt(g, x, y));
};

/**
 * Bresenham walk from a to b, calling visit(x, y) for intermediate tiles (endpoints excluded).
 * Stops early if visit returns true. Returns true if stopped early.
 */
export function walkLine(ax, ay, bx, by, visit) {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === bx && y === by) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === bx && y === by) return false;
    if (visit(x, y)) return true;
  }
}

/** Walls and full cover block line of sight; half cover does not. */
export function lineOfSight(g, ax, ay, bx, by) {
  if (ax === bx && ay === by) return true;
  const { w, tiles } = g;
  return !walkLine(ax, ay, bx, by, (x, y) => tiles[y * w + x] === T_WALL || tiles[y * w + x] === T_FULL);
}

/**
 * combat-rework §3.1: cover level of target (tx,ty) against an attacker at (ax,ay) — 0 none, 1 rubble, 2 half, 3 full.
 * Ranged (distance > 1): the best cover tile on the line or adjacent to the target on the attacker's side
 * (rubble only under the target's neighbourhood too). An attacker standing higher ignores half cover and rubble.
 * Melee (adjacent): only full cover counts — a diagonal attack «around the corner» of a full-cover tile.
 */
export function coverLevel(g, ax, ay, tx, ty, melee) {
  const d = chebyshev(ax, ay, tx, ty);
  if (d === 0) return 0;
  const sx = Math.sign(ax - tx), sy = Math.sign(ay - ty);
  if (melee || d <= 1) {
    if (d > 1 || !sx || !sy) return 0;
    return tileAt(g, tx + sx, ty) === T_FULL || tileAt(g, tx, ty + sy) === T_FULL ? 3 : 0;
  }
  let lvl = 0;
  const { w, tiles } = g;
  walkLine(ax, ay, tx, ty, (x, y) => { const c = tileCover(tiles[y * w + x]); if (c > lvl) lvl = c; return lvl === 3; });
  const side = (x, y) => { const c = tileCover(tileAt(g, x, y)); if (c > lvl) lvl = c; };
  side(tx + sx, ty + sy);
  if (sx && sy) { side(tx + sx, ty); side(tx, ty + sy); }
  if (lvl && lvl < 3 && g.elev && elevAt(g, ax, ay) > elevAt(g, tx, ty)) lvl = 0;
  return lvl;
}

/** The tile is «in cover»: a half/full cover tile orthogonally or diagonally next to it (for flanking). */
export function inCoverSpot(g, x, y) {
  for (const [dx, dy] of DIRS8) if (tileCover(tileAt(g, x + dx, y + dy)) >= 2) return true;
  return false;
}

/**
 * Cover (+2 KB): a cover tile on the line shooter -> target, or adjacent to the target
 * on the shooter's side. Only for ranged attacks (distance > 1).
 */
export function hasCover(g, ax, ay, tx, ty) {
  if (chebyshev(ax, ay, tx, ty) <= 1) return false;
  const { w, tiles } = g;
  if (walkLine(ax, ay, tx, ty, (x, y) => isCoverTile(tiles[y * w + x]))) return true;
  const sx = Math.sign(ax - tx), sy = Math.sign(ay - ty);
  if (isCoverTile(tileAt(g, tx + sx, ty + sy))) return true;
  if (sx && sy) {
    if (isCoverTile(tileAt(g, tx + sx, ty))) return true;
    if (isCoverTile(tileAt(g, tx, ty + sy))) return true;
  }
  return false;
}

/** Diagonal step is forbidden only when both orthogonal neighbours are impassable terrain. */
function diagonalOk(g, x, y, dx, dy) {
  if (!dx || !dy) return true;
  return isPassable(g, x + dx, y) || isPassable(g, x, y + dy);
}

/**
 * BFS over 8 directions from (sx,sy) up to maxCost steps.
 * occ: Int32Array (0 = free) of occupied tiles; the start tile is ignored.
 * opts.avoidHazard — hazards are not entered (but can be the start).
 * Returns { dist: Int16Array (-1 unreachable), parent: Int32Array, w, h, list: [idx...] }.
 */
export function reachable(g, sx, sy, maxCost, occ, opts) {
  const n = g.w * g.h;
  const dist = new Int16Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const list = [];
  const avoidHazard = !!(opts && opts.avoidHazard);
  const blocked = (opts && opts.blocked) || null; // Uint8Array mask: tiles not to pass through
  const start = sy * g.w + sx;
  dist[start] = 0;
  if (g.costly) return reachableCost(g, sx, sy, maxCost, occ, avoidHazard, blocked, dist, parent, list);
  let qh = 0, qt = 0;
  queue[qt++] = start;
  while (qh < qt) {
    const cur = queue[qh++];
    const cd = dist[cur];
    list.push(cur);
    if (cd >= maxCost) continue;
    const cx = cur % g.w, cy = (cur / g.w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS8[d][0], ny = cy + DIRS8[d][1];
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (dist[ni] !== -1) continue;
      const t = g.tiles[ni];
      if (blocksMove(t)) continue;
      if (avoidHazard && t === T_HAZARD) continue;
      if (blocked && blocked[ni]) continue;
      if (occ && occ[ni] !== 0) continue;
      if (!diagonalOk(g, cx, cy, DIRS8[d][0], DIRS8[d][1])) continue;
      dist[ni] = cd + 1;
      parent[ni] = cur;
      queue[qt++] = ni;
    }
  }
  return { dist, parent, w: g.w, h: g.h, list };
}

/** reachable() on a map with step costs (rubble, heights): Dijkstra with a bucket queue. */
function reachableCost(g, sx, sy, maxCost, occ, avoidHazard, blocked, dist, parent, list) {
  const buckets = [[sy * g.w + sx]];
  for (let c = 0; c < buckets.length; c++) {
    const bk = buckets[c];
    if (!bk) continue;
    for (let k = 0; k < bk.length; k++) {
      const cur = bk[k];
      if (dist[cur] !== c) continue;
      list.push(cur);
      const cx = cur % g.w, cy = (cur / g.w) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS8[d][0], ny = cy + DIRS8[d][1];
        if (!inBounds(g, nx, ny)) continue;
        const ni = ny * g.w + nx;
        const t = g.tiles[ni];
        if (blocksMove(t)) continue;
        if (avoidHazard && t === T_HAZARD) continue;
        if (blocked && blocked[ni]) continue;
        if (occ && occ[ni] !== 0) continue;
        if (!diagonalOk(g, cx, cy, DIRS8[d][0], DIRS8[d][1])) continue;
        const sc = stepCost(g, cur, ni);
        if (!sc) continue;
        const nc = c + sc;
        if (nc > maxCost || (dist[ni] !== -1 && dist[ni] <= nc)) continue;
        dist[ni] = nc;
        parent[ni] = cur;
        (buckets[nc] || (buckets[nc] = [])).push(ni);
      }
    }
  }
  return { dist, parent, w: g.w, h: g.h, list };
}

/** Path (array of {x,y}, start excluded) from a reachable() result to tile index. */
export function pathTo(reach, idx) {
  if (reach.dist[idx] < 0) return null;
  const out = [];
  let cur = idx;
  while (reach.parent[cur] !== -1) {
    out.push({ x: cur % reach.w, y: (cur / reach.w) | 0 });
    cur = reach.parent[cur];
  }
  return out.reverse();
}

/**
 * A* path from (sx,sy) to (tx,ty) over 8 directions. Returns array of {x,y} (start excluded) or null.
 * occ — occupied tiles (target tile is allowed even if occupied when opts.toOccupied).
 */
export function findPath(g, sx, sy, tx, ty, occ, opts) {
  const n = g.w * g.h;
  const goal = ty * g.w + tx;
  const gScore = new Int16Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = []; // small binary heap of [f, idx]
  const push = (f, i) => {
    open.push([f, i]);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p][0] <= open[k][0]) break;
      [open[p], open[k]] = [open[k], open[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === k) break;
        [open[m], open[k]] = [open[k], open[m]];
        k = m;
      }
    }
    return top;
  };
  const start = sy * g.w + sx;
  gScore[start] = 0;
  push(chebyshev(sx, sy, tx, ty), start);
  const toOcc = !!(opts && opts.toOccupied);
  const avoidHazard = !!(opts && opts.avoidHazard);
  while (open.length) {
    const [, cur] = pop();
    if (cur === goal) {
      const out = [];
      let c = cur;
      while (parent[c] !== -1) { out.push({ x: c % g.w, y: (c / g.w) | 0 }); c = parent[c]; }
      return out.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w, cy = (cur / g.w) | 0;
    for (let d = 0; d < 8; d++) {
      const dx = DIRS8[d][0], dy = DIRS8[d][1];
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (closed[ni]) continue;
      const t = g.tiles[ni];
      if (blocksMove(t)) continue;
      if (avoidHazard && t === T_HAZARD && ni !== goal) continue;
      if (occ && occ[ni] !== 0 && !(toOcc && ni === goal)) continue;
      if (!diagonalOk(g, cx, cy, dx, dy)) continue;
      const sc = g.costly ? stepCost(g, cur, ni) : 1;
      if (!sc) continue;
      const ng = gScore[cur] + sc;
      if (gScore[ni] !== -1 && gScore[ni] <= ng) continue;
      gScore[ni] = ng;
      parent[ni] = cur;
      push(ng + chebyshev(nx, ny, tx, ty), ni);
    }
  }
  return null;
}

/**
 * Multi-source walking distance (ignores units) from a list of {x,y}. Used by AI to approach.
 * Returns Int16Array (-1 unreachable).
 */
export function distanceField(g, sources, out) {
  const n = g.w * g.h;
  const dist = out && out.length === n ? out.fill(-1) : new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (const s of sources) {
    const i = s.y * g.w + s.x;
    if (dist[i] === -1) { dist[i] = 0; queue[qt++] = i; }
  }
  if (g.costly) {
    // step costs: relax until stable (SPFA over the queue; maps are small)
    const inQ = new Uint8Array(n);
    let q = []; for (let i = 0; i < qt; i++) { q.push(queue[i]); inQ[queue[i]] = 1; }
    while (q.length) {
      const next = [];
      for (const cur of q) {
        inQ[cur] = 0;
        const cx = cur % g.w, cy = (cur / g.w) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DIRS8[d][0], ny = cy + DIRS8[d][1];
          if (!inBounds(g, nx, ny)) continue;
          const ni = ny * g.w + nx;
          if (blocksMove(g.tiles[ni]) || !diagonalOk(g, cx, cy, DIRS8[d][0], DIRS8[d][1])) continue;
          const sc = stepCost(g, ni, cur); // walking from ni towards the source
          if (!sc) continue;
          const nd = dist[cur] + sc;
          if (dist[ni] !== -1 && dist[ni] <= nd) continue;
          dist[ni] = nd;
          if (!inQ[ni]) { inQ[ni] = 1; next.push(ni); }
        }
      }
      q = next;
    }
    return dist;
  }
  while (qh < qt) {
    const cur = queue[qh++];
    const cx = cur % g.w, cy = (cur / g.w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS8[d][0], ny = cy + DIRS8[d][1];
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (dist[ni] !== -1) continue;
      if (blocksMove(g.tiles[ni])) continue;
      if (!diagonalOk(g, cx, cy, DIRS8[d][0], DIRS8[d][1])) continue;
      dist[ni] = dist[cur] + 1;
      queue[qt++] = ni;
    }
  }
  return dist;
}

/** Nearest free passable tile to (x,y) by BFS (for spawning). */
export function nearestFree(g, x, y, occ) {
  const reach = reachable(g, x, y, 99, null);
  let best = -1, bestD = 1e9;
  for (const i of reach.list) {
    if (occ && occ[i] !== 0) continue;
    if (g.tiles[i] === T_HAZARD) continue;
    const d = reach.dist[i];
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : { x: best % g.w, y: (best / g.w) | 0 };
}
