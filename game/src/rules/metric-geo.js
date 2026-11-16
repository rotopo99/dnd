// Metric combat geometry (docs/specs/metric-combat.md, stage 2): ranges, areas, line of sight, cover and the zone of
// control in metres. Active when b.metric >= 2 (geoOn); with smaller stages every caller keeps the cell rules.
// A «point» is {px, py, r} in metres: a unit (its circle), a cell spec {x, y} (cell centre, r 0) or {px, py} (r 0).
// Distances are edge to edge (centre distance minus both radii); distU() returns them in cells (metres / 1.5), so the
// old comparisons «d <= range», «d <= 1» (melee: 1.5 m) keep working.
// LOS: walls / full cover cells block (exact cell traversal of the segment, the cells of both ends excluded); three
// parallel rays (centres and +-rayK x r sideways): 0 free — no LOS, 1 free — partial (half cover), 2-3 — clear.
// Cover: the best cover cell crossed by a ray within coverNear m of the target's edge, or hugged by the target (edge
// within hug m, cell centre within hugDeg of the attack direction) — rubble 1, half 2, full 3;
// an attacker standing higher ignores everything below full (combat-rework §3.1).
//   geoOn(b) · ptOf(t) · gapM(A, T) · distU(b, a, t) · traceCells(g, ax, ay, bx, by, visit) · raysFree(b, A, T)
//   losU(b, a, t) · coverM(b, A, T, melee) · areaRadiusM(size) · inAreaM(b, shape, size, O, C, T) · lineEndM
//   zocExits(pts, mr, R) — samples where a polyline leaves the zone of control of R
import { METRIC } from '../data/combat.js';
import { CELL_M, posM, unitRadius, cellCenterM } from './metric.js';
import { T_WALL, T_FULL, tileCover, chebyshev, lineOfSight, elevAt } from './grid.js';
import { shapedOn, itemsOnSegment, segPolyT, ptPolyDist, ptInPoly, nearestOnPoly, geoOf, segDist, conePoly, linePoly } from './geometry.js';

export const geoOn = (b) => !!b && (b.metric || 0) >= 2;
/** Stage 4: cones / lines hit and spill by their exact form; AI by metric geometry. */
export const exactOn = (b) => !!b && (b.metric || 0) >= 4;
const EPS = 1e-6;
const isUnit = (t) => t && t.team !== undefined && t.hp !== undefined;

/** Point of a unit / cell spec / metric point. */
export function ptOf(t) {
  if (isUnit(t)) { const p = posM(t); return { px: p.px, py: p.py, r: unitRadius(t) }; }
  if (t.px != null) return { px: t.px, py: t.py, r: t.r || 0 };
  const c = cellCenterM(t.x, t.y);
  return { px: c.px, py: c.py, r: 0 };
}
/** Edge-to-edge distance in metres (>= 0). */
export const gapM = (A, T) => Math.max(0, Math.hypot(T.px - A.px, T.py - A.py) - A.r - T.r);
/** Distance in cells: metric — edge to edge / 1.5 (float); cells — Chebyshev. */
export const distU = (b, a, t) => (geoOn(b) ? gapM(ptOf(a), ptOf(t)) / CELL_M : chebyshev(a.x, a.y, t.x, t.y));

/**
 * Exact traversal of the cells under the segment a -> b (metres): visit(x, y, t) for every cell entered, t — share of
 * the segment at the entry (start cell: 0). A segment through a cell corner steps diagonally (touches neither side
 * cell). Stops when visit returns true; returns true then.
 */
export function traceCells(g, ax, ay, bx, by, visit) {
  let x = Math.floor(ax / CELL_M), y = Math.floor(ay / CELL_M);
  const ex = Math.floor(bx / CELL_M), ey = Math.floor(by / CELL_M);
  const dx = bx - ax, dy = by - ay, sx = Math.sign(dx), sy = Math.sign(dy);
  const tDx = dx ? CELL_M / Math.abs(dx) : Infinity, tDy = dy ? CELL_M / Math.abs(dy) : Infinity;
  let tMx = dx > 0 ? ((x + 1) * CELL_M - ax) / dx : dx < 0 ? (x * CELL_M - ax) / dx : Infinity;
  let tMy = dy > 0 ? ((y + 1) * CELL_M - ay) / dy : dy < 0 ? (y * CELL_M - ay) / dy : Infinity;
  if (visit(x, y, 0)) return true;
  for (let guard = 0; (x !== ex || y !== ey) && guard < 4096; guard++) {
    let t;
    if (Math.abs(tMx - tMy) < 1e-9) { t = tMx; x += sx; y += sy; tMx += tDx; tMy += tDy; }
    else if (tMx < tMy) { t = tMx; x += sx; tMx += tDx; } else { t = tMy; y += sy; tMy += tDy; }
    if (t > 1 + 1e-9) break;
    if (visit(x, y, t)) return true;
  }
  return false;
}

const sightBlock = (g, x, y) => {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return true;
  const t = g.tiles[y * g.w + x];
  return t === T_WALL || t === T_FULL;
};
/** The segment is free of sight blockers (cells of both ends excluded). */
export function rayFree(g, ax, ay, bx, by) {
  const sx = Math.floor(ax / CELL_M), sy = Math.floor(ay / CELL_M), ex = Math.floor(bx / CELL_M), ey = Math.floor(by / CELL_M);
  return !traceCells(g, ax, ay, bx, by, (x, y) => !((x === sx && y === sy) || (x === ex && y === ey)) && sightBlock(g, x, y));
}
/** Stage 3 (shapedOn): the segment misses every sight-blocking polygon of b.geo (polygons holding an end skipped). */
export function rayFreeB(b, ax, ay, bx, by) {
  if (!shapedOn(b)) return rayFree(b.grid, ax, ay, bx, by);
  return !itemsOnSegment(b, ax, ay, bx, by, (it) => it.sight && !ptInPoly(ax, ay, it) && !ptInPoly(bx, by, it) && segPolyT(ax, ay, bx, by, it) <= 1, () => true);
}
/** The three parallel rays A -> T: [[ax, ay, bx, by] x3] (centre first). */
export function raysOf(A, T) {
  const dx = T.px - A.px, dy = T.py - A.py, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, ka = A.r * METRIC.rayK, kt = T.r * METRIC.rayK;
  const out = [[A.px, A.py, T.px, T.py]];
  if (ka || kt) for (const s of [1, -1]) out.push([A.px + nx * ka * s, A.py + ny * ka * s, T.px + nx * kt * s, T.py + ny * kt * s]);
  return out;
}
/** Free rays of 3 (a point target with r 0 from a point: 0 or 3). */
export function raysFree(b, A, T) {
  const R = raysOf(A, T);
  let n = 0;
  for (const r of R) if (rayFreeB(b, r[0], r[1], r[2], r[3])) n++;
  return R.length === 1 ? n * 3 : n;
}
/** Line of sight a -> t: metric — at least one ray free; cells — Bresenham. */
export function losU(b, a, t) {
  if (!geoOn(b)) return lineOfSight(b.grid, a.x, a.y, t.x, t.y);
  return raysFree(b, ptOf(a), ptOf(t)) > 0;
}
/** Point-to-point LOS in metres (centre ray + side rays by radii). */
export const losPts = (b, A, T) => raysFree(b, A, T) > 0;

const rectDist = (px, py, x, y) => {
  const x0 = x * CELL_M, y0 = y * CELL_M;
  const ex = Math.max(x0 - px, 0, px - (x0 + CELL_M)), ey = Math.max(y0 - py, 0, py - (y0 + CELL_M));
  return Math.hypot(ex, ey);
};
/** Edge distance in metres from a point (with radius) to the rectangle of cell (x, y). */
export const rectGapM = (A, x, y) => Math.max(0, rectDist(A.px, A.py, x, y) - A.r);

/**
 * Cover level of target point T against attacker point A: 0 none, 1 rubble, 2 half (or partial — one ray free),
 * 3 full (or no ray free). Melee: only «round the corner» (one ray free) counts, as full.
 */
export function coverM(b, A, T, melee) {
  const g = b.grid;
  if (Math.hypot(T.px - A.px, T.py - A.py) < EPS) return 0;
  const R = raysOf(A, T);
  let free = 0;
  for (const r of R) if (rayFreeB(b, r[0], r[1], r[2], r[3])) free++;
  if (R.length === 1) free *= 3;
  if (!free) return 3;
  if (melee) return free === 1 ? 3 : 0;
  let lvl = free === 1 ? 2 : 0;
  if (shapedOn(b)) return coverGeo(b, A, T, R, lvl);
  const ac = [Math.floor(A.px / CELL_M), Math.floor(A.py / CELL_M)], tc = [Math.floor(T.px / CELL_M), Math.floor(T.py / CELL_M)];
  const near = METRIC.coverNear + T.r;
  for (const r of R) {
    if (lvl === 3) break;
    traceCells(g, r[0], r[1], r[2], r[3], (x, y) => {
      if ((x === ac[0] && y === ac[1]) || (x === tc[0] && y === tc[1]) || x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
      const c = tileCover(g.tiles[y * g.w + x]);
      if (c > lvl && rectDist(T.px, T.py, x, y) <= near + EPS) lvl = c;
      return lvl === 3;
    });
  }
  // «вплотную к цели»: cover the target hugs on the attacker's side (within hugDeg of the attack line) counts too
  if (lvl < 3) {
    const L = Math.hypot(A.px - T.px, A.py - T.py), ux = (A.px - T.px) / L, uy = (A.py - T.py) / L, cosMax = Math.cos((METRIC.hugDeg * Math.PI) / 180);
    for (let y = tc[1] - 1; y <= tc[1] + 1; y++) for (let x = tc[0] - 1; x <= tc[0] + 1; x++) {
      if ((x === tc[0] && y === tc[1]) || x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const c = tileCover(g.tiles[y * g.w + x]);
      if (c <= lvl || rectDist(T.px, T.py, x, y) > T.r + METRIC.hug + EPS) continue;
      const vx = (x + 0.5) * CELL_M - T.px, vy = (y + 0.5) * CELL_M - T.py, vl = Math.hypot(vx, vy) || 1;
      if ((vx * ux + vy * uy) / vl >= cosMax) lvl = c;
    }
  }
  if (lvl && lvl < 3 && g.elev && elevAt(g, ac[0], ac[1]) > elevAt(g, tc[0], tc[1])) lvl = 0;
  return lvl;
}

/**
 * Stage 3 cover: polygons of b.geo (props by their real footprint) crossed by a ray within coverNear m of the target's
 * edge, or hugged by the target (edge within hug m, the nearest point within hugDeg of the attack direction).
 */
function coverGeo(b, A, T, R, lvl) {
  const g = b.grid, near = METRIC.coverNear + T.r;
  const own = (it) => ptInPoly(A.px, A.py, it) || ptInPoly(T.px, T.py, it);
  for (const r of R) {
    if (lvl === 3) break;
    itemsOnSegment(b, r[0], r[1], r[2], r[3], (it) => {
      if (it.cover > lvl && !own(it) && segPolyT(r[0], r[1], r[2], r[3], it) <= 1 && ptPolyDist(T.px, T.py, it) <= near + EPS) lvl = it.cover;
      return lvl === 3;
    });
  }
  if (lvl < 3) {
    const L = Math.hypot(A.px - T.px, A.py - T.py), ux = (A.px - T.px) / L, uy = (A.py - T.py) / L, cosMax = Math.cos((METRIC.hugDeg * Math.PI) / 180);
    for (const it of itemsNear(b, T.px, T.py, T.r + METRIC.hug)) {
      if (it.cover <= lvl || own(it) || ptPolyDist(T.px, T.py, it) > T.r + METRIC.hug + EPS) continue;
      const [qx, qy] = nearestOnPoly(T.px, T.py, it), vx = qx - T.px, vy = qy - T.py, vl = Math.hypot(vx, vy) || 1;
      if ((vx * ux + vy * uy) / vl >= cosMax) lvl = it.cover;
    }
  }
  const ac = [Math.floor(A.px / CELL_M), Math.floor(A.py / CELL_M)], tc = [Math.floor(T.px / CELL_M), Math.floor(T.py / CELL_M)];
  if (lvl && lvl < 3 && g.elev && elevAt(g, ac[0], ac[1]) > elevAt(g, tc[0], tc[1])) lvl = 0;
  return lvl;
}
/** Geometry items whose bounding box is within lim m of the point. */
export function itemsNear(b, px, py, lim) {
  const G = geoOf(b), g = b.grid, out = new Set();
  for (let y = Math.floor((py - lim) / CELL_M); y <= Math.floor((py + lim) / CELL_M); y++) for (let x = Math.floor((px - lim) / CELL_M); x <= Math.floor((px + lim) / CELL_M); x++) {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
    for (const it of G.cells[y * g.w + x] || []) out.add(it);
  }
  return [...out];
}

// ---------------------------------------------------------------- areas

/** Circle radius in metres of an area of `size` cells (R x 1.5 x areaK — the circle vs the Chebyshev square). */
export const areaRadiusM = (size) => size * CELL_M * METRIC.areaK;
export const coneLenM = (size) => size * CELL_M;
export const coneHalf = () => (METRIC.coneDeg * Math.PI) / 360;

/** Where a line of `size` cells from O toward aim C stops: the first wall cell (or the full length). */
export function lineEndM(b, O, C, size) {
  const dx = C.px - O.px, dy = C.py - O.py, L = Math.hypot(dx, dy);
  if (L < EPS) return null;
  const len = coneLenM(size), fx = O.px + (dx / L) * len, fy = O.py + (dy / L) * len;
  let tEnd = 1;
  const g = b.grid;
  if (shapedOn(b)) {
    itemsOnSegment(b, O.px, O.py, fx, fy, (it) => { if (it.wall) tEnd = Math.min(tEnd, segPolyT(O.px, O.py, fx, fy, it)); return false; });
    if (fx < 0 || fy < 0 || fx > g.w * CELL_M || fy > g.h * CELL_M) traceCells(g, O.px, O.py, fx, fy, (x, y, t) => { if (x < 0 || y < 0 || x >= g.w || y >= g.h) { tEnd = Math.min(tEnd, t); return true; } return false; });
    return { px: O.px + (fx - O.px) * tEnd, py: O.py + (fy - O.py) * tEnd, len: len * tEnd };
  }
  traceCells(g, O.px, O.py, fx, fy, (x, y, t) => {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h || g.tiles[y * g.w + x] === T_WALL) { tEnd = t; return true; }
    return false;
  });
  return { px: O.px + (fx - O.px) * tEnd, py: O.py + (fy - O.py) * tEnd, len: len * tEnd };
}

/**
 * Does the circle T fall into the area? shape 'radius' — circle of areaRadiusM(size) around C (LOS from C; centred on
 * the caster O — plus O's radius);
 * 'cone' — from O toward C, coneLenM(size) long, coneDeg wide (LOS from O); 'line' — from O toward C, lineW wide,
 * stops at walls. The caster's own point (distance 0 from O) is never in a cone / line.
 */
export function inAreaM(b, shape, size, O, C, T) {
  if (shape === 'radius') {
    // centred on the caster: the radius counts from its edge (like ranges), so an aura of 1 reaches diagonal neighbours
    const d = Math.hypot(T.px - C.px, T.py - C.py), own = O && Math.hypot(C.px - O.px, C.py - O.py) < 0.01 ? O.r : 0;
    if (d > areaRadiusM(size) + own + T.r + EPS) return false;
    return d < EPS || losPts(b, { px: C.px, py: C.py, r: 0 }, T);
  }
  const vx = C.px - O.px, vy = C.py - O.py, vl = Math.hypot(vx, vy);
  if (vl < EPS) return false;
  const tx = T.px - O.px, ty = T.py - O.py, d = Math.hypot(tx, ty);
  if (d < 0.05) return false;
  if (shape === 'cone') {
    const len = coneLenM(size);
    if (d - T.r > len + EPS) return false;
    const cos = Math.max(-1, Math.min(1, (vx * tx + vy * ty) / (vl * d)));
    if (Math.acos(cos) > coneHalf() + EPS) {
      // stage 4 (exact form): outside the angle the circle must reach one of the two side edges of the sector
      if (!exactOn(b)) { const extra = d > T.r ? Math.asin(T.r / d) : Math.PI; if (Math.acos(cos) > coneHalf() + extra + EPS) return false; }
      else {
        const a0 = Math.atan2(vy, vx), h = coneHalf();
        const e1 = segDist(T.px, T.py, O.px, O.py, O.px + Math.cos(a0 + h) * len, O.py + Math.sin(a0 + h) * len);
        const e2 = segDist(T.px, T.py, O.px, O.py, O.px + Math.cos(a0 - h) * len, O.py + Math.sin(a0 - h) * len);
        if (Math.min(e1, e2) > T.r + EPS) return false;
      }
    }
    return losPts(b, { px: O.px, py: O.py, r: 0 }, T);
  }
  const E = lineEndM(b, O, C, size);
  if (!E) return false;
  const ux = vx / vl, uy = vy / vl, s = tx * ux + ty * uy, perp = Math.abs(tx * uy - ty * ux);
  if (exactOn(b)) { // stage 4: the circle against the exact rectangle O..E, lineW wide
    const hw = METRIC.lineW / 2, ds = Math.max(0, -s, s - E.len), dp = Math.max(0, perp - hw);
    return s > 0 && Math.hypot(ds, dp) <= T.r + EPS;
  }
  if (s <= 0 || s > E.len + T.r + EPS) return false;
  if (s > E.len) return Math.hypot(T.px - E.px, T.py - E.py) <= T.r + EPS;
  return perp <= METRIC.lineW / 2 + T.r + EPS;
}

/** Stage 4: exact polygon (metres) of a cone / line from O toward C, from O's edge; null — no direction. */
export function areaPolyM(b, shape, size, O, C) {
  const vx = C.px - O.px, vy = C.py - O.py;
  if (Math.hypot(vx, vy) < EPS) return null;
  if (shape === 'cone') return conePoly(O.px, O.py, Math.atan2(vy, vx), coneHalf(), coneLenM(size), O.r || 0);
  if (shape !== 'line') return null;
  const E = lineEndM(b, O, C, size);
  return E && E.len > (O.r || 0) + 0.05 ? linePoly(O.px, O.py, E.px, E.py, METRIC.lineW, O.r || 0) : null;
}

// ---------------------------------------------------------------- zone of control

/**
 * Exits of a mover (radius mr) walking polyline pts from the zone of control of R (zoc m edge to edge): [{s, px, py}]
 * — the last sample still inside before a sample outside. Samples follow metric.js pathCellsM (every `sample` m).
 * Entering the zone does nothing; walking inside it is free.
 */
export function zocExits(pts, mr, R) {
  const out = [];
  if (pts.length < 2) return out;
  const lim = METRIC.zoc + mr + R.r + EPS;
  const inside = (px, py) => Math.hypot(px - R.px, py - R.py) <= lim;
  let prev = { px: pts[0].px, py: pts[0].py, s: 0 }, pin = inside(prev.px, prev.py), s0 = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], c = pts[k], len = Math.hypot(c.px - a.px, c.py - a.py);
    const n = Math.max(1, Math.ceil(len / METRIC.sample));
    for (let q = 1; q <= n; q++) {
      const px = a.px + ((c.px - a.px) * q) / n, py = a.py + ((c.py - a.py) * q) / n, s = s0 + (len * q) / n;
      const cin = inside(px, py);
      if (pin && !cin) out.push({ s: prev.s, px: prev.px, py: prev.py });
      prev = { px, py, s }; pin = cin;
    }
    s0 += len;
  }
  return out;
}
/** A step from point P to point Q leaves the zone of control of R (cell walks in a metric battle). */
export function leavesZoc(P, Q, mr, R) {
  const lim = METRIC.zoc + mr + R.r + EPS;
  return Math.hypot(P.px - R.px, P.py - R.py) <= lim && Math.hypot(Q.px - R.px, Q.py - R.py) > lim;
}

/** Point of unit u standing at cell (fx, fy): its own point when that is its cell, else the cell centre. */
export function fromPt(u, fx = u.x, fy = u.y) {
  if (fx === u.x && fy === u.y) return ptOf(u);
  const c = cellCenterM(fx, fy);
  return { px: c.px, py: c.py, r: unitRadius(u) };
}
/** Unit / cell t within a circle area of `size` cells around c (metric: circles intersect; cells: Chebyshev). */
export function inRadiusU(b, c, t, size) {
  if (!geoOn(b)) return chebyshev(c.x, c.y, t.x, t.y) <= size;
  const C = ptOf(c), T = ptOf(t);
  return Math.hypot(T.px - C.px, T.py - C.py) <= areaRadiusM(size) + T.r + EPS;
}
/** Metric «in a cover spot»: a half / full cover cell within r + 0.7 m of the point (the cell rule: a neighbour cell). */
export function nearCover(b, P) {
  const g = b.grid, lim = P.r + 0.7;
  if (shapedOn(b)) return itemsNear(b, P.px, P.py, lim).some((it) => it.cover >= 2 && ptPolyDist(P.px, P.py, it) <= lim);
  const x0 = Math.floor((P.px - lim) / CELL_M), x1 = Math.floor((P.px + lim) / CELL_M);
  const y0 = Math.floor((P.py - lim) / CELL_M), y1 = Math.floor((P.py + lim) / CELL_M);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h || tileCover(g.tiles[y * g.w + x]) < 2) continue;
    if (rectDist(P.px, P.py, x, y) <= lim) return true;
  }
  return false;
}
