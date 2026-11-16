// Metric movement (docs/specs/metric-combat.md, stage 1): a unit stands anywhere — `u.px, u.py` in metres (0.01 m).
// The cell rules (ranges, LOS, cover, AI) still read `u.x, u.y`: the cell under the point (cellOf). Any old code that
// moves a unit by cells (push, teleport, summon) leaves px/py stale -> posM() falls back to the cell centre, so the
// cell stays the single source of truth whenever the two disagree.
// Path: static nav grid 0.5 m (3x3 per cell; walls / covers / objects inflated by the unit radius), other units are
// circles (r + r), A* over 8 directions, then string pulling (a shortcut is taken when the straight segment is free and
// costs no more). Cost = length x rubble multiplier + 1.5 m per level up; a height step > 1 level is not a passage.
//   cellOf(px, py) -> {x, y} · cellCenterM(x, y) -> {px, py} · posM(u) · dispPos(u) (display cells, centre = integer)
//   unitRadius(u) · budgetM(b) (metres left this turn) · navPath(b, u, px, py, {snap}) -> {pts, len, cost, to} | null
//   pathCellsM(b, pts) -> [{x, y, px, py, s}] (cells entered along the polyline) · pullCells(b, u, from, cells) -> pts
//   subPolyline(pts, s0, s1) · polyLen(pts)
import { METRIC } from '../data/combat.js';
import { blocksMove, stepCost, T_RUBBLE } from './grid.js';
import { partHas } from './geometry.js';

export const CELL_M = METRIC.cell;
const K = Math.round(METRIC.cell / METRIC.nav); // nav cells per cell side
const NAV = METRIC.cell / K;
const SQ2 = Math.SQRT2;
export const cm = (v) => Math.round(v * 100) / 100;
export const cellOf = (px, py) => ({ x: Math.floor(px / CELL_M), y: Math.floor(py / CELL_M) });
export const cellCenterM = (x, y) => ({ px: cm((x + 0.5) * CELL_M), py: cm((y + 0.5) * CELL_M) });

/** Position in metres: px/py when they lie in the unit's cell, else the cell centre (adapter for cell-moving code). */
export function posM(u) {
  if (u.px != null && Math.floor(u.px / CELL_M) === u.x && Math.floor(u.py / CELL_M) === u.y) return { px: u.px, py: u.py };
  return cellCenterM(u.x, u.y);
}
/** Display coordinates in cells (cell centre = integer x, as the renderers expect: drawn at x + 0.5). */
export function dispPos(u) { const p = posM(u); return { x: p.px / CELL_M - 0.5, y: p.py / CELL_M - 0.5 }; }
export const unitRadius = (u) => (u && u.boss ? METRIC.r.large : METRIC.r.normal);
/** Movement left this turn, metres. */
export const budgetM = (b) => (b.turn ? cm(b.turn.move * CELL_M) : 0);

// ---------------------------------------------------------------- nav grid
function navStatic(b, r) {
  const g = b.grid, key = `${b.gridVersion || 0}|${g.w}x${g.h}`;
  const c = b.navCache || (b.navCache = {});
  if (c[r] && c[r].key === key) return c[r];
  const W = g.w * K, H = g.h * K, block = new Uint8Array(W * H);
  const solid = (x, y) => x < 0 || y < 0 || x >= g.w || y >= g.h || blocksMove(g.tiles[y * g.w + x]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = (i + 0.5) * NAV, py = (j + 0.5) * NAV, tx = Math.floor(i / K), ty = Math.floor(j / K);
    let bl = solid(tx, ty) ? 1 : 0;
    for (let dy = -1; dy <= 1 && !bl; dy++) for (let dx = -1; dx <= 1 && !bl; dx++) {
      if ((!dx && !dy) || !solid(tx + dx, ty + dy)) continue;
      const x0 = (tx + dx) * CELL_M, y0 = (ty + dy) * CELL_M;
      const ex = Math.max(x0 - px, 0, px - (x0 + CELL_M)), ey = Math.max(y0 - py, 0, py - (y0 + CELL_M));
      if (ex * ex + ey * ey < r * r - 1e-9) bl = 1;
    }
    block[j * W + i] = bl;
  }
  c[r] = { key, W, H, block, r };
  return c[r];
}

/** Query context: static grid + circles of the other units on the field (by the occupancy map). */
function navCtx(b, u) {
  const r = unitRadius(u), nav = navStatic(b, r), g = b.grid, others = [];
  b.units.forEach((o, i) => {
    if (o === u || o.x < 0 || b.occ[o.y * g.w + o.x] !== i + 1) return;
    const p = posM(o), rr = r + unitRadius(o);
    others.push(p.px, p.py, rr * rr);
  });
  return { b, g, nav, r, others };
}
const solidAt = (g, x, y) => x < 0 || y < 0 || x >= g.w || y >= g.h || blocksMove(g.tiles[y * g.w + x]);
/** Exact test of a point: r from every solid cell rectangle and r + r' from other units. */
function freeAt(X, px, py) {
  const g = X.g, r2 = X.r * X.r - 1e-9, tx = Math.floor(px / CELL_M), ty = Math.floor(py / CELL_M);
  if (solidAt(g, tx, ty)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !solidAt(g, tx + dx, ty + dy)) continue;
    const x0 = (tx + dx) * CELL_M, y0 = (ty + dy) * CELL_M;
    const ex = Math.max(x0 - px, 0, px - (x0 + CELL_M)), ey = Math.max(y0 - py, 0, py - (y0 + CELL_M));
    if (ex * ex + ey * ey < r2) return false;
  }
  return othersFree(X, px, py);
}
function othersFree(X, px, py) {
  const o = X.others;
  for (let k = 0; k < o.length; k += 3) { const dx = px - o[k], dy = py - o[k + 1]; if (dx * dx + dy * dy < o[k + 2] - 1e-9) return false; }
  if (X.avoid) for (const k of X.avoid) if (partHas(k, px, py)) return false; // stage 4: harmful surfaces to walk round
  return true;
}
const tileIdx = (g, px, py) => Math.floor(py / CELL_M) * g.w + Math.floor(px / CELL_M);
const mulAt = (g, ti) => (g.tiles[ti] === T_RUBBLE ? 2 : 1);
/** Cost of crossing from tile a to tile b (0 = no passage): the level-up surcharge in metres. */
function crossCost(g, a, c) {
  if (a === c || !g.elev) return 1e-9; // tiny positive: "passable, no surcharge"
  const sc = stepCost(g, a, c);
  if (!sc) return 0;
  const up = g.elev[c] - g.elev[a];
  return up > 0 ? up * CELL_M : 1e-9;
}

/** Cost of the straight segment a -> b in metres, or -1 when it is blocked (sampled every METRIC.sample m). */
function traceSeg(X, ax, ay, bx, by, skipStart = true) {
  const g = X.g, len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / METRIC.sample));
  let cost = 0, prevT = tileIdx(g, ax, ay);
  for (let k = skipStart ? 1 : 0; k <= n; k++) {
    const px = ax + ((bx - ax) * k) / n, py = ay + ((by - ay) * k) / n;
    if (!freeAt(X, px, py)) return -1;
    const ti = tileIdx(g, px, py);
    if (ti !== prevT) {
      const cc = crossCost(g, prevT, ti);
      if (!cc) return -1;
      cost += cc > 1e-6 ? cc : 0;
      prevT = ti;
    }
    if (k > 0) cost += (len / n) * mulAt(g, ti);
  }
  return cost;
}

// ---------------------------------------------------------------- A*
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= val) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = k[0], last = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mv = lv;
        if (l < k.length && v[l] < mv) { m = l; mv = v[l]; }
        if (r < k.length && v[r] < mv) { m = r; mv = v[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = last; v[i] = lv;
    }
    return top;
  }
  get size() { return this.k.length; }
}
const DIR = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

function astar(X, si, sj, gi, gj) {
  const { nav, g } = X, W = nav.W, H = nav.H, n = W * H;
  const free = (i, j) => (i === gi && j === gj) || (i >= 0 && j >= 0 && i < W && j < H && !nav.block[j * W + i] && othersFree(X, (i + 0.5) * NAV, (j + 0.5) * NAV));
  const cost = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const s = sj * W + si, goal = gj * W + gi;
  cost[s] = 0;
  const h = (i, j) => Math.hypot(i - gi, j - gj) * NAV;
  const heap = new Heap();
  heap.push(s, h(si, sj));
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const ci = cur % W, cj = (cur / W) | 0;
    const ct = tileIdx(g, (ci + 0.5) * NAV, (cj + 0.5) * NAV);
    for (const [dx, dy, dl] of DIR) {
      const ni = ci + dx, nj = cj + dy;
      if (!free(ni, nj)) continue;
      if (dx && dy && (!free(ci + dx, cj) || !free(ci, cj + dy))) continue; // no corner cutting
      const nk = nj * W + ni;
      if (closed[nk]) continue;
      const nt = tileIdx(g, (ni + 0.5) * NAV, (nj + 0.5) * NAV);
      const cc = crossCost(g, ct, nt);
      if (!cc) continue;
      const nc = cost[cur] + dl * NAV * (mulAt(g, ct) + mulAt(g, nt)) / 2 + (cc > 1e-6 ? cc : 0);
      if (nc >= cost[nk]) continue;
      cost[nk] = nc; parent[nk] = cur;
      heap.push(nk, nc + h(ni, nj));
    }
  }
  if (parent[goal] === -1 && goal !== s) return null;
  const out = [];
  for (let c = goal; c !== -1; c = parent[c]) out.push(c);
  return out.reverse().map((c) => [((c % W) + 0.5) * NAV, (((c / W) | 0) + 0.5) * NAV]);
}

/** Greedy string pulling over the polyline P ([[x, y]...]): skip ahead while the shortcut is free and not dearer. */
function pull(X, P) {
  if (P.length <= 2) return P;
  const seg = []; // cost of each original segment
  for (let k = 1; k < P.length; k++) seg.push(Math.max(0, traceSeg(X, P[k - 1][0], P[k - 1][1], P[k][0], P[k][1])));
  const out = [P[0]];
  let i = 0;
  while (i < P.length - 1) {
    let best = i + 1, along = seg[i], miss = 0;
    for (let j = i + 2; j < P.length && miss < 4; j++) {
      along += seg[j - 1];
      const c = traceSeg(X, P[i][0], P[i][1], P[j][0], P[j][1]);
      if (c >= 0 && c <= along + 1e-6) { best = j; miss = 0; } else miss++;
    }
    out.push(P[best]);
    i = best;
  }
  return tighten(X, out);
}
/** Pull every corner towards the chord of its neighbours while both segments stay free (the nav grid is 0.5 m
 *  coarse: corners hug the real clearance r, not the cell centres). A corner on the chord is dropped. */
function tighten(X, P) {
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 1; k < P.length - 1; k++) {
      const a = P[k - 1], c = P[k + 1], p = P[k];
      const before = traceSeg(X, a[0], a[1], p[0], p[1]) + traceSeg(X, p[0], p[1], c[0], c[1]);
      const vx = c[0] - a[0], vy = c[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const t0 = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
      const fx = a[0] + vx * t0, fy = a[1] + vy * t0;
      let lo = 0, hi = 1;
      const ok = (t) => {
        const qx = p[0] + (fx - p[0]) * t, qy = p[1] + (fy - p[1]) * t;
        const s1 = traceSeg(X, a[0], a[1], qx, qy), s2 = s1 < 0 ? -1 : traceSeg(X, qx, qy, c[0], c[1]);
        return s2 >= 0 && s1 + s2 <= before + 1e-6;
      };
      if (ok(1)) { P.splice(k, 1); k--; continue; }
      for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      if (lo > 0) P[k] = [p[0] + (fx - p[0]) * lo, p[1] + (fy - p[1]) * lo];
    }
  }
  return P;
}
const toPts = (P) => P.map(([x, y]) => ({ px: cm(x), py: cm(y) }));
export function polyLen(pts) { let l = 0; for (let k = 1; k < pts.length; k++) l += Math.hypot(pts[k].px - pts[k - 1].px, pts[k].py - pts[k - 1].py); return l; }
function polyCost(X, pts) {
  let c = 0;
  for (let k = 1; k < pts.length; k++) { const s = traceSeg(X, pts[k - 1].px, pts[k - 1].py, pts[k].px, pts[k].py); if (s < 0) return -1; c += s; }
  return c;
}

/** Nearest free point to (px, py) within `snap` nav cells (a click next to a wall), or null. */
function snapFree(X, px, py, snap) {
  if (freeAt(X, px, py)) return [px, py];
  const i0 = Math.floor(px / NAV), j0 = Math.floor(py / NAV);
  let best = null, bd = Infinity;
  for (let j = j0 - snap; j <= j0 + snap; j++) for (let i = i0 - snap; i <= i0 + snap; i++) {
    const x = (i + 0.5) * NAV, y = (j + 0.5) * NAV;
    if (!freeAt(X, x, y)) continue;
    const d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

/**
 * Path of unit u from its position to the point (px, py) in metres. The end point may not lie in a cell held by
 * another unit (cell rules stay unique) nor inside another unit's circle. Returns
 * { pts: [{px, py}] (start included), len (m), cost (m, with rubble / steps up), to: {px, py, x, y} } or null.
 * `avoid` (stage 4) — shape parts the centre must not enter (harmful surfaces; surfaces.js harmParts): null when no such way.
 */
export function navPath(b, u, px, py, { snap = METRIC.snap, avoid = null } = {}) {
  const g = b.grid;
  if (!(px >= 0 && py >= 0 && px < g.w * CELL_M && py < g.h * CELL_M)) return null;
  const X = navCtx(b, u);
  if (avoid && avoid.length) { // metric stage 4: surface parts (circles / polygons) the path walks round (not the ones at the ends)
    const s0 = posM(u), keep = avoid.filter((k) => !partHas(k, s0.px, s0.py) && !partHas(k, px, py));
    if (keep.length) X.avoid = keep;
  }
  const end = snapFree(X, px, py, snap);
  if (!end) return null;
  const ex = cm(end[0]), ey = cm(end[1]), ec = cellOf(ex, ey);
  const holder = b.occ[ec.y * g.w + ec.x];
  if (holder && b.units[holder - 1] !== u) return null;
  const s = posM(u);
  if (Math.hypot(ex - s.px, ey - s.py) < 0.01) return { pts: [{ ...s }], len: 0, cost: 0, to: { px: s.px, py: s.py, x: u.x, y: u.y } };
  // straight line first (most moves in the open)
  let pts;
  const direct = traceSeg(X, s.px, s.py, ex, ey);
  if (direct >= 0) pts = [{ ...s }, { px: ex, py: ey }];
  else {
    const P = astar(X, Math.floor(s.px / NAV), Math.floor(s.py / NAV), Math.floor(ex / NAV), Math.floor(ey / NAV));
    if (!P) return null;
    P[0] = [s.px, s.py];
    P[P.length - 1] = [ex, ey];
    pts = toPts(pull(X, P));
  }
  const cost = polyCost({ ...X, r: X.r - 0.01 }, pts); // 1 cm slack: points are rounded to centimetres
  if (cost < 0) return null;
  return { pts, len: cm(polyLen(pts)), cost: cm(cost), to: { px: ex, py: ey, x: ec.x, y: ec.y } };
}

/** Cells entered along the polyline (start cell excluded): {x, y, px, py (first sample inside), s (m from start)}. */
export function pathCellsM(b, pts) {
  const out = [];
  if (!pts.length) return out;
  let cx = Math.floor(pts[0].px / CELL_M), cy = Math.floor(pts[0].py / CELL_M), s0 = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], c = pts[k], len = Math.hypot(c.px - a.px, c.py - a.py);
    const n = Math.max(1, Math.ceil(len / METRIC.sample));
    for (let q = 1; q <= n; q++) {
      const px = a.px + ((c.px - a.px) * q) / n, py = a.py + ((c.py - a.py) * q) / n;
      const x = Math.floor(px / CELL_M), y = Math.floor(py / CELL_M);
      if (x !== cx || y !== cy) { cx = x; cy = y; out.push({ x, y, px: cm(px), py: cm(py), s: s0 + (len * q) / n }); }
    }
    s0 += len;
  }
  return out;
}

/** Polyline between distances s0..s1 along pts. */
export function subPolyline(pts, s0, s1) {
  const out = [];
  let acc = 0;
  const at = (a, c, t) => ({ px: cm(a.px + (c.px - a.px) * t), py: cm(a.py + (c.py - a.py) * t) });
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], c = pts[k], len = Math.hypot(c.px - a.px, c.py - a.py);
    const t0 = len ? (s0 - acc) / len : 0, t1 = len ? (s1 - acc) / len : 1;
    if (t1 >= 0 && t0 <= 1) {
      if (!out.length) out.push(at(a, c, Math.max(0, t0)));
      out.push(at(a, c, Math.min(1, t1)));
    }
    acc += len;
    if (acc >= s1) break;
  }
  return out;
}

/** Smoothed display path through cell centres (cell-based moves of the AI / old commands): from -> cells. */
export function pullCells(b, u, from, cells) {
  const X = navCtx(b, u);
  const P = [[from.px, from.py], ...cells.map((c) => { const p = cellCenterM(c.x, c.y); return [p.px, p.py]; })];
  return toPts(pull(X, P));
}

// ---------------------------------------------------------------- stage 2: reach field (AI candidates, UI contour)

/**
 * Dijkstra cost field (metres, the A* step rules) over the nav grid from u's position up to maxCost:
 * { W, H, nav (cell side m), cost: Float32Array (Infinity — out of reach), at(px, py) (cost of the nav cell + the
 * offset to the point) }. Grid costs are >= the string-pulled path, so at() <= budget is a safe «reachable».
 */
export function navField(b, u, maxCost) {
  const X = navCtx(b, u), { nav, g } = X, W = nav.W, H = nav.H, n = W * H;
  const s = posM(u), si = Math.floor(s.px / NAV), sj = Math.floor(s.py / NAV);
  const ok = new Int8Array(n); // 0 unknown, 1 free, -1 blocked (lazy: only cells the search touches)
  const free = (i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    const k = j * W + i;
    if (!ok[k]) ok[k] = !nav.block[k] && othersFree(X, (i + 0.5) * NAV, (j + 0.5) * NAV) ? 1 : -1;
    return ok[k] === 1;
  };
  const cost = new Float32Array(n).fill(Infinity), closed = new Uint8Array(n), heap = new Heap();
  const st = sj * W + si;
  if (si >= 0 && sj >= 0 && si < W && sj < H) {
    cost[st] = Math.hypot((si + 0.5) * NAV - s.px, (sj + 0.5) * NAV - s.py);
    heap.push(st, cost[st]);
  }
  const lim = maxCost + NAV;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % W, cj = (cur / W) | 0, ct = tileIdx(g, (ci + 0.5) * NAV, (cj + 0.5) * NAV);
    for (const [dx, dy, dl] of DIR) {
      const ni = ci + dx, nj = cj + dy;
      if (!free(ni, nj)) continue;
      if (dx && dy && (!free(ci + dx, cj) || !free(ci, cj + dy))) continue;
      const nk = nj * W + ni;
      if (closed[nk]) continue;
      const nt = tileIdx(g, (ni + 0.5) * NAV, (nj + 0.5) * NAV), cc = crossCost(g, ct, nt);
      if (!cc) continue;
      const nc = cost[cur] + dl * NAV * (mulAt(g, ct) + mulAt(g, nt)) / 2 + (cc > 1e-6 ? cc : 0);
      if (nc >= cost[nk] || nc > lim) continue;
      cost[nk] = nc;
      heap.push(nk, nc);
    }
  }
  const at = (px, py) => {
    const i = Math.floor(px / NAV), j = Math.floor(py / NAV);
    if (i < 0 || j < 0 || i >= W || j >= H) return Infinity;
    return cost[j * W + i] + Math.hypot(px - (i + 0.5) * NAV, py - (j + 0.5) * NAV);
  };
  return { W, H, nav: NAV, cost, at };
}

/** Exact free-point test for unit u (walls inflated by r, other units' circles): (px, py) -> bool. */
export function navFree(b, u) {
  const X = navCtx(b, u);
  return (px, py) => freeAt(X, px, py);
}

/**
 * Contour of the area with field cost <= limit (marching squares over the nav cell centres, linear interpolation;
 * blocked / unreachable samples count as limit + 2 nav cells): flat [x1, y1, x2, y2, ...] in metres.
 */
export function reachContour(field, limit) {
  const { W, H, nav, cost } = field, out = [], far = limit + 2 * nav;
  const v = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? far : Math.min(far, cost[j * W + i]));
  const lerp = (a, c) => (Math.abs(c - a) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, (limit - a) / (c - a))));
  for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
    const a = v(i, j), c = v(i + 1, j), d = v(i + 1, j + 1), e = v(i, j + 1);
    const k = (a <= limit ? 1 : 0) | (c <= limit ? 2 : 0) | (d <= limit ? 4 : 0) | (e <= limit ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const x0 = (i + 0.5) * nav, y0 = (j + 0.5) * nav;
    const T = [x0 + lerp(a, c) * nav, y0], Rr = [x0 + nav, y0 + lerp(c, d) * nav], B = [x0 + lerp(e, d) * nav, y0 + nav], L = [x0, y0 + lerp(a, e) * nav];
    const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);
    switch (k) {
      case 1: case 14: seg(L, T); break;
      case 2: case 13: seg(T, Rr); break;
      case 3: case 12: seg(L, Rr); break;
      case 4: case 11: seg(Rr, B); break;
      case 6: case 9: seg(T, B); break;
      case 7: case 8: seg(L, B); break;
      case 5: seg(L, T); seg(Rr, B); break;
      case 10: seg(T, Rr); seg(L, B); break;
      default: break;
    }
  }
  return out;
}
