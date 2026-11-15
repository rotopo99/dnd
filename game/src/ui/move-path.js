// Metric movement UI (docs/specs/metric-combat.md stage 1, Divinity style): the budget ring around the active hero,
// the dashed path line to the cursor (string-pulled points of S.hoverPath) and a pill «7.5 м» at its end.
// Colours: in budget — `h`, needs Рывок — `a`, unreachable — `c`. 2D draws on the canvas, 3D adds floor quads.
//   drawMovePath2d(ctx, S) · movePathOverlay3d(S, ob, fl) (drawBattle3d overlay hook) · drawMovePill(ctx, S)
import { t } from '../data/text/index.js';
import { C, FONT_B, text } from './draw.js';
import { GFX } from '../data/gfx.js';
import { CELL_M, budgetM } from '../rules/metric.js';
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
  return { cx: d.x + 0.5, cy: d.y + 0.5, r: have / CELL_M, r2: dash ? (have + dash) / CELL_M : 0 };
};

export function drawMovePath2d(ctx, S) {
  const h = heroOf(S);
  if (!h) return;
  const L = S.L, c = L.cell, R = rings(S, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(L.map.x, L.map.y, L.map.w, L.map.h); ctx.clip();
  ctx.lineWidth = Math.max(1.5, L.s * 1.5);
  if (R.r > 0.05) { ctx.strokeStyle = C.h; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(L.mapX + R.cx * c, L.mapY + R.cy * c, R.r * c, 0, Math.PI * 2); ctx.stroke(); }
  if (R.r2) { ctx.strokeStyle = C.a; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(L.mapX + R.cx * c, L.mapY + R.cy * c, R.r2 * c, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
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
  const h = heroOf(S);
  if (!h) return;
  const b = S.b, R = rings(S, h);
  const flAt = (x, y) => fl(Math.max(0, Math.min(b.grid.w - 1, Math.floor(x))), Math.max(0, Math.min(b.grid.h - 1, Math.floor(y)))) + 0.006;
  const ch = keyRGB('h'), ca = keyRGB('a');
  const y0 = flAt(R.cx, R.cy);
  if (R.r > 0.05) ob.ring(R.cx, R.cy, y0, R.r - VW.ringW / 2, R.r + VW.ringW / 2, [ch[0], ch[1], ch[2], 0.85], 64);
  if (R.r2) ob.ring(R.cx, R.cy, y0, R.r2 - VW.ringW / 3, R.r2 + VW.ringW / 3, [ca[0], ca[1], ca[2], 0.4], 64);
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
