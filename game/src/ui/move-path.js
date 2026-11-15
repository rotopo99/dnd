// Metric movement UI (docs/specs/metric-combat.md stage 1, Divinity style): the budget ring around the active hero,
// the dashed path line to the cursor (string-pulled points of S.hoverPath) and a pill «7.5 м» at its end.
// Colours: in budget — `h`, needs Рывок — `a`, unreachable — `c`. 2D draws on the canvas, 3D adds floor quads.
// Stage 2: the budget «ring» is the contour of the reachable area on the nav grid (walls / units cut it), aiming
// shows the range circle, the area under the cursor (circle / cone / line in metres, fill zoneA) and the line of fire
// to the target (h — clear, a — cover / partial, c — blocked). S.aim is set by battle-view drawHighlights.
//   drawMovePath2d(ctx, S) · movePathOverlay3d(S, ob, fl) (drawBattle3d overlay hook) · drawMovePill(ctx, S)
//   aimShapes(S, hero, {range, a, tc, target}) -> S.aim {ring, area, ray}
import { t } from '../data/text/index.js';
import { C, FONT_B, text } from './draw.js';
import { GFX } from '../data/gfx.js';
import { CELL_M, budgetM, posM, unitRadius, navField, reachContour } from '../rules/metric.js';
import { geoOn, ptOf, coverM, areaRadiusM, coneLenM, coneHalf, lineEndM } from '../rules/metric-geo.js';
import { METRIC } from '../data/combat.js';
import { getSpeed } from '../rules/combat.js';
import { keyRGB } from '../gfx/mesh.js';
import { project } from '../gfx/camera.js';

const KEY = { move: 'h', dash: 'a', no: 'c' };
const VW = GFX.view;

function heroOf(S) {
  const b = S.b;
  if (!b.metric || !S.playerTurn || S.sel || S.queue.length || S.result) return null;
  const h = b.byId[S.heroId];
  return h && !h.dead ? h : null;
}
/** Dashes along the path in metres: [[x0, y0, x1, y1] ...] in cell units (cell x spans [x, x + 1]). */
function dashes(pts) {
  const out = [];
  let on = true, left = VW.dash;
  for (let k = 1; k < pts.length; k++) {
    let ax = pts[k - 1].px, ay = pts[k - 1].py;
    const bx = pts[k].px, by = pts[k].py;
    let len = Math.hypot(bx - ax, by - ay);
    const ux = len ? (bx - ax) / len : 0, uy = len ? (by - ay) / len : 0;
    while (len > 1e-6) {
      const s = Math.min(left, len), nx = ax + ux * s, ny = ay + uy * s;
      if (on) out.push([ax / CELL_M, ay / CELL_M, nx / CELL_M, ny / CELL_M]);
      ax = nx; ay = ny; len -= s; left -= s;
      if (left <= 1e-6) { on = !on; left = on ? VW.dash : VW.gap; }
    }
  }
  return out;
}
const rings = (S, h) => {
  const b = S.b, have = budgetM(b), d = S.dispOf(h);
  const dash = b.turn.actions > 0 ? getSpeed(b, h) * CELL_M : 0;
  return { cx: d.x + 0.5, cy: d.y + 0.5, r: have / CELL_M, r2: dash ? (have + dash) / CELL_M : 0, ...contours(S, h, have, dash) };
};
/** Stage 2: contours of the reachable area (budget, budget + Рывок) on the nav grid, cached per position / budget. */
function contours(S, h, have, dash) {
  const b = S.b;
  if (!geoOn(b)) return {};
  const p = posM(h), key = `${h.id}|${p.px},${p.py}|${have}|${dash}|${b.occVersion}|${b.gridVersion || 0}`;
  if (!S.reachC || S.reachC.key !== key) {
    const f = navField(b, h, have + dash);
    S.reachC = { key, c1: have > 0.05 ? reachContour(f, have) : [], c2: dash ? reachContour(f, have + dash) : [] };
  }
  return { c1: S.reachC.c1, c2: S.reachC.c2 };
}

export function drawMovePath2d(ctx, S) {
  drawAim2d(ctx, S);
  const h = heroOf(S);
  if (!h) return;
  const L = S.L, c = L.cell, R = rings(S, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(L.map.x, L.map.y, L.map.w, L.map.h); ctx.clip();
  ctx.lineWidth = Math.max(1.5, L.s * 1.5);
  const segs2d = (sg) => { ctx.beginPath(); for (let k = 0; k < sg.length; k += 4) { ctx.moveTo(L.mapX + (sg[k] / CELL_M) * c, L.mapY + (sg[k + 1] / CELL_M) * c); ctx.lineTo(L.mapX + (sg[k + 2] / CELL_M) * c, L.mapY + (sg[k + 3] / CELL_M) * c); } ctx.stroke(); };
  if (R.c1) {
    if (R.c1.length) { ctx.strokeStyle = C.h; ctx.globalAlpha = 0.85; segs2d(R.c1); }
    if (R.c2 && R.c2.length) { ctx.strokeStyle = C.a; ctx.globalAlpha = 0.4; segs2d(R.c2); }
  } else {
    if (R.r > 0.05) { ctx.strokeStyle = C.h; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(L.mapX + R.cx * c, L.mapY + R.cy * c, R.r * c, 0, Math.PI * 2); ctx.stroke(); }
    if (R.r2) { ctx.strokeStyle = C.a; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(L.mapX + R.cx * c, L.mapY + R.cy * c, R.r2 * c, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  const hp = S.hoverPath;
  if (hp) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C[KEY[hp.ok]];
    ctx.lineWidth = Math.max(2, L.s * 2.5);
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of dashes(hp.pts)) { ctx.moveTo(L.mapX + x0 * c, L.mapY + y0 * c); ctx.lineTo(L.mapX + x1 * c, L.mapY + y1 * c); }
    ctx.stroke();
    const e = hp.pts[hp.pts.length - 1];
    ctx.beginPath(); ctx.arc(L.mapX + (e.px / CELL_M) * c, L.mapY + (e.py / CELL_M) * c, Math.max(3, c * 0.12), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function movePathOverlay3d(S, ob, fl) {
  const b = S.b;
  const flAt = (x, y) => fl(Math.max(0, Math.min(b.grid.w - 1, Math.floor(x))), Math.max(0, Math.min(b.grid.h - 1, Math.floor(y)))) + 0.006;
  aimOverlay3d(S, ob, flAt);
  const h = heroOf(S);
  if (!h) return;
  const R = rings(S, h);
  const ch = keyRGB('h'), ca = keyRGB('a');
  const y0 = flAt(R.cx, R.cy);
  const segs3d = (sg, w, col) => { for (let k = 0; k < sg.length; k += 4) { const x0 = sg[k] / CELL_M, z0 = sg[k + 1] / CELL_M, x1 = sg[k + 2] / CELL_M, z1 = sg[k + 3] / CELL_M; ob.line(x0, z0, x1, z1, flAt((x0 + x1) / 2, (z0 + z1) / 2), w, col); } };
  if (R.c1) {
    segs3d(R.c1, VW.ringW, [ch[0], ch[1], ch[2], 0.85]);
    if (R.c2) segs3d(R.c2, VW.ringW * 0.7, [ca[0], ca[1], ca[2], 0.4]);
  } else {
    if (R.r > 0.05) ob.ring(R.cx, R.cy, y0, R.r - VW.ringW / 2, R.r + VW.ringW / 2, [ch[0], ch[1], ch[2], 0.85], 64);
    if (R.r2) ob.ring(R.cx, R.cy, y0, R.r2 - VW.ringW / 3, R.r2 + VW.ringW / 3, [ca[0], ca[1], ca[2], 0.4], 64);
  }
  const hp = S.hoverPath;
  if (!hp) return;
  const k = keyRGB(KEY[hp.ok]), col = [k[0], k[1], k[2], 0.95];
  for (const [x0, z0, x1, z1] of dashes(hp.pts)) ob.line(x0, z0, x1, z1, flAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.002, VW.lineW, col);
  const e = hp.pts[hp.pts.length - 1];
  ob.ring(e.px / CELL_M, e.py / CELL_M, flAt(e.px / CELL_M, e.py / CELL_M) + 0.003, 0.1, 0.16, col, 16);
}

/** Pill «7.5 м» (+ «Рывок») next to the path end. */
export function drawMovePill(ctx, S) {
  const h = heroOf(S), hp = S.hoverPath;
  if (!h || !hp) return;
  const e = hp.pts[hp.pts.length - 1], L = S.L, V = S.v3;
  let sx, sy;
  if (V?.world) {
    const X = e.px / CELL_M, Z = e.py / CELL_M, i = Math.min(V.world.w * V.world.h - 1, Math.floor(Z) * V.world.w + Math.floor(X));
    const p = project(V.cam, X, V.world.floor[i] || 0, Z);
    sx = p.x; sy = p.y;
  } else { sx = L.mapX + (e.px / CELL_M) * L.cell; sy = L.mapY + (e.py / CELL_M) * L.cell; }
  const m = t('battle.metres');
  const label = hp.ok === 'no' && hp.cost == null ? '—' : `${(hp.cost ?? hp.len).toFixed(1)} ${m}${hp.ok === 'dash' ? ` · ${t('battle.dash')}` : ''}`;
  ctx.font = FONT_B;
  const w = Math.ceil(ctx.measureText(label).width) + 14, x = Math.round(sx + 14), y = Math.round(sy - 30);
  ctx.fillStyle = 'rgba(20,20,28,0.85)';
  ctx.fillRect(x, y, w, 22);
  ctx.strokeStyle = C[KEY[hp.ok]];
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 21);
  text(ctx, label, x + 7, y + 3, C[KEY[hp.ok]], FONT_B);
}

// ---------------------------------------------------------------- stage 2: aiming (range, area, line of fire)

/**
 * Shapes of the current aim in metres: ring — range circle round the hero (range cells x 1.5 + hero r: the edge of a
 * point target), area — circle / cone / line of ability a at target tc (cursor point for cones / lines), ray — the
 * line of fire to `target` coloured by cover. Null when the battle is not metric stage 2.
 */
export function aimShapes(S, hero, { range = 0, a = null, tc = null, target = null } = {}) {
  const b = S.b;
  if (!geoOn(b) || !hero) return null;
  const O = posM(hero), out = { ring: null, area: null, ray: null };
  if (range > 0) out.ring = { px: O.px, py: O.py, r: range * CELL_M + unitRadius(hero) };
  if (a && a.area) {
    const size = a.area.size || 1, sh = a.area.shape;
    const tu = tc && tc.target ? b.byId[tc.target] : null;
    const C0 = !tc ? O : tu ? posM(tu) : tc.tile ? (tc.tile.px != null ? { px: tc.tile.px, py: tc.tile.py } : ptOf(tc.tile)) : O;
    const selfC = a.target === 'self' || !tc;
    if (sh === 'cone' || sh === 'line') {
      if (!selfC && Math.hypot(C0.px - O.px, C0.py - O.py) > 0.05) {
        if (sh === 'cone') out.area = { k: 'cone', ox: O.px, oy: O.py, ang: Math.atan2(C0.py - O.py, C0.px - O.px), half: coneHalf(), len: coneLenM(size) };
        else { const E = lineEndM(b, O, C0, size); if (E) out.area = { k: 'line', ox: O.px, oy: O.py, ex: E.px, ey: E.py, w: METRIC.lineW }; }
      }
    } else out.area = { k: 'circle', px: (selfC ? O : C0).px, py: (selfC ? O : C0).py, r: areaRadiusM(size) + (selfC ? unitRadius(hero) : 0) };
    if (out.area) out.area.own = a.target === 'self' || a.target === 'ally';
  }
  if (target && target !== hero && !target.dead) {
    const A = ptOf(hero), T = ptOf(target), lvl = coverM(b, A, T, false);
    out.ray = { ax: A.px, ay: A.py, bx: T.px, by: T.py, key: lvl === 0 ? 'h' : lvl < 3 ? 'a' : 'c' };
  }
  return out;
}
const conePts = (Z, n = 18) => {
  const P = [[Z.ox, Z.oy]];
  for (let k = 0; k <= n; k++) { const a = Z.ang - Z.half + (2 * Z.half * k) / n; P.push([Z.ox + Math.cos(a) * Z.len, Z.oy + Math.sin(a) * Z.len]); }
  return P;
};
const linePts = (Z) => {
  const l = Math.hypot(Z.ex - Z.ox, Z.ey - Z.oy) || 1, nx = (-(Z.ey - Z.oy) / l) * Z.w / 2, ny = ((Z.ex - Z.ox) / l) * Z.w / 2;
  return [[Z.ox + nx, Z.oy + ny], [Z.ex + nx, Z.ey + ny], [Z.ex - nx, Z.ey - ny], [Z.ox - nx, Z.oy - ny]];
};
const zoneKey = (Z) => (Z.own ? 'j' : 'n');

function drawAim2d(ctx, S) {
  const A = S.aim;
  if (!A) return;
  const L = S.L, c = L.cell, X = (m) => L.mapX + (m / CELL_M) * c, Y = (m) => L.mapY + (m / CELL_M) * c;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.map.x, L.map.y, L.map.w, L.map.h); ctx.clip();
  ctx.lineWidth = Math.max(1.5, L.s * 1.5);
  if (A.ring) {
    ctx.strokeStyle = C.h; ctx.globalAlpha = VW.rangeA; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(X(A.ring.px), Y(A.ring.py), (A.ring.r / CELL_M) * c, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  const Z = A.area;
  if (Z) {
    ctx.beginPath();
    if (Z.k === 'circle') ctx.arc(X(Z.px), Y(Z.py), (Z.r / CELL_M) * c, 0, Math.PI * 2);
    else { const P = Z.k === 'cone' ? conePts(Z) : linePts(Z); P.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); }
    ctx.fillStyle = C[zoneKey(Z)]; ctx.globalAlpha = VW.zoneA; ctx.fill();
    ctx.strokeStyle = C[zoneKey(Z)]; ctx.globalAlpha = 0.9; ctx.stroke();
  }
  if (A.ray) {
    ctx.strokeStyle = C[A.ray.key]; ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(2, L.s * 2);
    ctx.beginPath(); ctx.moveTo(X(A.ray.ax), Y(A.ray.ay)); ctx.lineTo(X(A.ray.bx), Y(A.ray.by)); ctx.stroke();
  }
  ctx.restore();
}

function aimOverlay3d(S, ob, flAt) {
  const A = S.aim;
  if (!A) return;
  const u = (m) => m / CELL_M;
  if (A.ring) { const k = keyRGB('h'); ob.ring(u(A.ring.px), u(A.ring.py), flAt(u(A.ring.px), u(A.ring.py)), u(A.ring.r) - VW.ringW / 2, u(A.ring.r) + VW.ringW / 2, [k[0], k[1], k[2], VW.rangeA], 72); }
  const Z = A.area;
  if (Z) {
    const k = keyRGB(zoneKey(Z)), fill = [k[0], k[1], k[2], VW.zoneA], edge = [k[0], k[1], k[2], 0.9];
    if (Z.k === 'circle') {
      const cx = u(Z.px), cz = u(Z.py), r = u(Z.r), y = flAt(cx, cz) + 0.002, P = [[cx, cz]];
      for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; P.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      ob.poly(P, y, fill);
      ob.ring(cx, cz, y + 0.001, r - VW.ringW / 2, r + VW.ringW / 2, edge, 40);
    } else {
      const P = (Z.k === 'cone' ? conePts(Z) : linePts(Z)).map(([x, y]) => [u(x), u(y)]);
      const y = flAt(u(Z.ox), u(Z.oy)) + 0.002;
      if (Z.k === 'cone') ob.poly(P, y, fill); else ob.quad([P[0][0], y, P[0][1]], [P[1][0], y, P[1][1]], [P[2][0], y, P[2][1]], [P[3][0], y, P[3][1]], fill);
      for (let i = Z.k === 'cone' ? 0 : 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; ob.line(p[0], p[1], q[0], q[1], y + 0.001, VW.ringW, edge); }
    }
  }
  if (A.ray) {
    const k = keyRGB(A.ray.key), x0 = u(A.ray.ax), z0 = u(A.ray.ay), x1 = u(A.ray.bx), z1 = u(A.ray.by);
    ob.line(x0, z0, x1, z1, Math.max(flAt(x0, z0), flAt(x1, z1)) + 0.004, VW.lineW, [k[0], k[1], k[2], 0.9]);
  }
}
