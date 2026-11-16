// Battle geometry of metric combat stage 3 (docs/specs/metric-combat.md «Геометрия», b.metric >= 3): the tile grid is
// only a loader. Pure JS, runs in Node.
//  - b.geo: polygons in metres of everything that blocks sight / gives cover: props by their real footprint
//    (data/combat.js GEO.propSize, centred in the prop's cells), barrel tiles, the remaining wall / cover / rubble
//    cells (merged into horizontal runs) and the def's `geometry` [{type: 'rect'|'poly'|'low'|'wall', pts: [[x, y]…]
//    in cells, cover?}]. Item {pts, x0, y0, x1, y1, cover 0..3, sight (blocks LOS), wall (stops lines), prop?}.
//    Rebuilt when b.gridVersion changes (a broken prop / barrel / bridge drops its polygon at once).
//  - surface shapes: a layer's `shape` is a list of circles {cx, cy, r} (m) — the union; no shape = the whole cell.
//   shapedOn(b) · geoOf(b) · segPolyT(ax, ay, bx, by, it) · ptPolyDist(px, py, it) · itemsOnSegment(b, ax, ay, bx, by, visit)
//   inShape(shape, px, py) · cellShape(shape, x, y) · unionShape(a, b) · circleTiles(b, cx, cy, r)
import { GEO } from '../data/combat.js';
import { T_WALL, T_FULL, T_BARREL, tileCover, inBounds, isPassable, lineOfSight } from './grid.js';

const CM = 1.5;
const EPS = 1e-9;
export const shapedOn = (b) => !!b && (b.metric || 0) >= 3;

// ---------------------------------------------------------------- surface shapes (circles)

const circleHitsCell = (c, x, y) => {
  const x0 = x * CM, y0 = y * CM;
  const ex = Math.max(x0 - c.cx, 0, c.cx - (x0 + CM)), ey = Math.max(y0 - c.cy, 0, c.cy - (y0 + CM));
  return ex * ex + ey * ey < c.r * c.r - EPS;
};
const circleCoversCell = (c, x, y) => {
  const fx = Math.max(Math.abs(x * CM - c.cx), Math.abs((x + 1) * CM - c.cx)), fy = Math.max(Math.abs(y * CM - c.cy), Math.abs((y + 1) * CM - c.cy));
  return fx * fx + fy * fy <= c.r * c.r;
};
/** Point inside the union of circles (no shape — the whole cell). */
export const inShape = (shape, px, py) => !shape || shape.some((c) => (px - c.cx) ** 2 + (py - c.cy) ** 2 <= c.r * c.r + 1e-6);
/** The circles of `shape` touching cell (x, y); null (whole cell) when one of them covers the cell. */
export function cellShape(shape, x, y) {
  if (!shape) return null;
  const s = shape.filter((c) => circleHitsCell(c, x, y));
  if (s.some((c) => circleCoversCell(c, x, y))) return null;
  return s.length ? s : shape;
}
/** Union of two shapes (null = whole cell wins); circles inside others are dropped, at most 6 kept (largest). */
export function unionShape(a, b) {
  if (!a || !b) return null;
  const all = [...a, ...b.filter((c) => !a.some((d) => d.cx === c.cx && d.cy === c.cy && d.r === c.r))];
  const keep = all.filter((c, i) => !all.some((d, j) => j !== i && d.r >= c.r && Math.hypot(d.cx - c.cx, d.cy - c.cy) + c.r <= d.r + 1e-6 && (d.r > c.r || j < i)));
  return keep.length > 6 ? keep.sort((p, q) => q.r - p.r).slice(0, 6) : keep;
}
/** Cells a circle spill reaches: touched by the circle, enterable (or a barrel), in LOS of the centre cell (walls clip). */
export function circleTiles(b, cx, cy, r) {
  const g = b.grid, out = [];
  const ox = Math.floor(cx / CM), oy = Math.floor(cy / CM);
  for (let y = Math.floor((cy - r) / CM); y <= Math.floor((cy + r) / CM); y++) for (let x = Math.floor((cx - r) / CM); x <= Math.floor((cx + r) / CM); x++) {
    if (!inBounds(g, x, y)) continue;
    if (!circleHitsCell({ cx, cy, r }, x, y) && !(x === ox && y === oy)) continue;
    if (!isPassable(g, x, y) && g.tiles[y * g.w + x] !== T_BARREL) continue;
    if ((x !== ox || y !== oy) && inBounds(g, ox, oy) && !lineOfSight(g, ox, oy, x, y)) continue;
    out.push({ x, y });
  }
  return out;
}

// ---------------------------------------------------------------- polygons

function item(pts, o) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { pts, x0, y0, x1, y1, cover: 0, sight: false, wall: false, ...o };
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Point inside a polygon (even-odd). */
export function ptInPoly(px, py, it) {
  if (px < it.x0 || px > it.x1 || py < it.y0 || py > it.y1) return false;
  const P = it.pts;
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from a point to a polygon (0 inside). */
export function ptPolyDist(px, py, it) {
  if (ptInPoly(px, py, it)) return 0;
  const P = it.pts;
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
  }
  return best;
}
/** Nearest point of a polygon to (px, py). */
export function nearestOnPoly(px, py, it) {
  const P = it.pts;
  let best = Infinity, out = [px, py];
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(px - qx, py - qy);
    if (d < best) { best = d; out = [qx, qy]; }
  }
  return out;
}
/** Share t (0..1) of the segment a -> b where it first touches the polygon; Infinity — misses (0 — starts inside). */
export function segPolyT(ax, ay, bx, by, it) {
  if (Math.max(ax, bx) < it.x0 || Math.min(ax, bx) > it.x1 || Math.max(ay, by) < it.y0 || Math.min(ay, by) > it.y1) return Infinity;
  if (ptInPoly(ax, ay, it)) return 0;
  const P = it.pts, rx = bx - ax, ry = by - ay;
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [cx, cy] = P[j], sx = P[i][0] - cx, sy = P[i][1] - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < EPS) continue;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) best = Math.min(best, Math.max(0, t));
  }
  return best;
}

/** Real footprint polygon of a prop at cells (x, y) w x h. */
function propRect(id, x, y, w, h) {
  const s = GEO.propSize[id] || [w * CM - 2 * GEO.inset, h * CM - 2 * GEO.inset];
  const cx = (x + w / 2) * CM, cy = (y + h / 2) * CM;
  return rectPts(cx - s[0] / 2, cy - s[1] / 2, cx + s[0] / 2, cy + s[1] / 2);
}

/** Geometry of the battle (cached by gridVersion): { v, items, cells (index -> [item]) }. */
export function geoOf(b) {
  const g = b.grid, v = b.gridVersion || 0;
  if (b.geo && b.geo.v === v && b.geo.g === g) return b.geo;
  const W = g.w, H = g.h, items = [], cells = new Array(W * H), used = new Uint8Array(W * H);
  const add = (it) => {
    items.push(it);
    for (let y = Math.max(0, Math.floor(it.y0 / CM)); y <= Math.min(H - 1, Math.floor((it.y1 - EPS) / CM)); y++)
      for (let x = Math.max(0, Math.floor(it.x0 / CM)); x <= Math.min(W - 1, Math.floor((it.x1 - EPS) / CM)); x++) (cells[y * W + x] || (cells[y * W + x] = [])).push(it);
  };
  const tile = (x, y) => g.tiles[y * W + x];
  for (const p of g.def?.props || []) {
    const w = p.w || 1, h = p.h || 1;
    let cov = 0, sight = false, any = false;
    for (let y = p.y; y < p.y + h; y++) for (let x = p.x; x < p.x + w; x++) {
      if (!inBounds(g, x, y)) continue;
      const t = tile(x, y);
      if (t === T_WALL) continue; // a prop stamped over a wall: the wall stays a cell
      const c = tileCover(t);
      if (c >= 2 || t === T_FULL) { any = true; cov = Math.max(cov, c); sight = sight || t === T_FULL; used[y * W + x] = 1; }
    }
    if (any) add(item(propRect(p.id, p.x, p.y, w, h), { cover: cov, sight, prop: p.id }));
  }
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const t = tile(x, y), c = tileCover(t), wall = t === T_WALL;
      if (used[y * W + x] || (!c && !wall)) { x++; continue; }
      if (t === T_BARREL) { add(item(propRect('barrel', x, y, 1, 1), { cover: c })); x++; continue; }
      let e = x + 1;
      while (e < W && !used[y * W + e] && tile(e, y) === t) e++;
      add(item(rectPts(x * CM, y * CM, e * CM, (y + 1) * CM), { cover: wall ? 3 : c, sight: wall || t === T_FULL, wall }));
      x = e;
    }
  }
  for (const s of g.def?.geometry || []) {
    if (!s.pts || s.pts.length < 2 || !['rect', 'poly', 'low', 'wall', 'rail'].includes(s.type)) continue;
    const pts = s.type === 'rect' || s.pts.length === 2
      ? rectPts(Math.min(s.pts[0][0], s.pts[1][0]) * CM, Math.min(s.pts[0][1], s.pts[1][1]) * CM, Math.max(s.pts[0][0], s.pts[1][0]) * CM, Math.max(s.pts[0][1], s.pts[1][1]) * CM)
      : s.pts.map(([x, y]) => [x * CM, y * CM]);
    const low = s.type === 'low' || s.type === 'rail';
    add(item(pts, { cover: s.cover ?? (low ? 2 : 3), sight: s.sight ?? !low, wall: s.type === 'wall' }));
  }
  b.geo = { v, g, items, cells };
  return b.geo;
}

/**
 * Items under the segment (cells traversed by a 1.5 m DDA, each item once): visit(item) -> true stops. `out` is
 * called once when the segment leaves the grid (returns its result). Returns true if stopped.
 */
export function itemsOnSegment(b, ax, ay, bx, by, visit, out) {
  const G = geoOf(b), g = b.grid, seen = new Set();
  let x = Math.floor(ax / CM), y = Math.floor(ay / CM);
  const ex = Math.floor(bx / CM), ey = Math.floor(by / CM);
  const dx = bx - ax, dy = by - ay, sx = Math.sign(dx), sy = Math.sign(dy);
  const tDx = dx ? CM / Math.abs(dx) : Infinity, tDy = dy ? CM / Math.abs(dy) : Infinity;
  let tMx = dx > 0 ? ((x + 1) * CM - ax) / dx : dx < 0 ? (x * CM - ax) / dx : Infinity;
  let tMy = dy > 0 ? ((y + 1) * CM - ay) / dy : dy < 0 ? (y * CM - ay) / dy : Infinity;
  const cell = () => {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return out ? out() : false;
    for (const it of G.cells[y * g.w + x] || []) { if (seen.has(it)) continue; seen.add(it); if (visit(it)) return true; }
    return false;
  };
  if (cell()) return true;
  for (let guard = 0; (x !== ex || y !== ey) && guard < 4096; guard++) {
    let t;
    if (Math.abs(tMx - tMy) < 1e-9) {
      // through a corner: both side cells too (a polygon may stick into them)
      const ox = x, oy = y;
      x = ox + sx; if (cell()) return true; x = ox; y = oy + sy; if (cell()) return true;
      t = tMx; x = ox + sx; y = oy + sy; tMx += tDx; tMy += tDy;
    } else if (tMx < tMy) { t = tMx; x += sx; tMx += tDx; } else { t = tMy; y += sy; tMy += tDy; }
    if (t > 1 + 1e-9) break;
    if (cell()) return true;
  }
  return false;
}
