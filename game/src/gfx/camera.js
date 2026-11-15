// Isometric orthographic camera (docs/specs/3d.md §1): yaw in 90° steps with a 0.25 s ease, 3 zoom levels relative to
// «the whole map fits the area», pitch 35.26°. World: X = cell x, Z = cell y, Y = up (metres).
//   createCamera()                         -> cam
//   fitCamera(cam, area, w, h, maxH)       screen area {x,y,w,h} + map size -> base pixels per metre + zoom levels
//                                          (0 — whole map, 1 default — floor = GFX.camera.widthFill of the width, 2 — closer)
//   rotateCamera(cam, dir), zoomCamera(cam, d), updateCamera(cam, dt, {focus:{x,z}, follow, instant})
//                                          follow — centre on focus (roam: the leader), else lean to it when zoomed in
//   panCamera(cam, dx, dy)                 drag / keys: move the view by screen pixels (offset cam.px/pz, kept on the map)
//   centerCamera(cam, x, z)                pan so that (x, z) is in the centre («к активному юниту»)
//   viewProj(cam, W, H)                    -> Float32Array(16) (column-major, for gl)
//   project(cam, x, y, z)                  -> {x, y, d} screen px + depth
//   rayAt(cam, px, py)                     -> {o:[3], d:[3]} picking ray;  basis(cam) -> {r, u, f}
//   pickCell(cam, px, py, w, h, topAt(x,y)) -> {x, y} | null — nearest cell top hit by the ray
import { GFX } from '../data/gfx.js';

const DEG = Math.PI / 180;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createCamera() {
  const C = GFX.camera;
  return {
    step: 0, yaw: C.yaw, yawFrom: C.yaw, yawTo: C.yaw, tw: 1, pitch: C.pitch,
    zoomIdx: C.zoomDefault, zoom: 1, zooms: [1, 1.3, 1.3 * C.closer], zoomSet: false, ppmFit: 30, area: { x: 0, y: 0, w: 1, h: 1 },
    cx: 0, cz: 0, cy: 0, mapW: 1, mapH: 1, moving: false, px: 0, pz: 0, bx: 0, bz: 0,
  };
}

export function basis(cam) {
  const p = cam.pitch * DEG, y = cam.yaw * DEG;
  const f = [-Math.sin(y) * Math.cos(p), -Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r = [Math.cos(y), 0, -Math.sin(y)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { r, u, f };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function fitCamera(cam, area, w, h, maxH = 1.6) {
  cam.area = area;
  const first = cam.mapW !== w || cam.mapH !== h;
  cam.mapW = w; cam.mapH = h;
  // extents of the map box at the default yaw (a 90° turn gives the same diamond up to w <-> h)
  const { r, u } = basis({ yaw: GFX.camera.yaw, pitch: cam.pitch });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const X of [0, w]) for (const Z of [0, h]) for (const Y of [GFX.geo.base, maxH]) {
    const P = [X, Y, Z], a = dot(P, r), b = dot(P, u);
    x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
  }
  cam.ppmFit = Math.max(8, Math.min(area.w / (x1 - x0), area.h / (y1 - y0)) * 0.97);
  // default level: the floor diamond takes widthFill of the area width (3d.md stage 2: the field was too small)
  let f0 = Infinity, f1 = -Infinity;
  for (const X of [0, w]) for (const Z of [0, h]) { const a = dot([X, 0, Z], r); f0 = Math.min(f0, a); f1 = Math.max(f1, a); }
  const C = GFX.camera, wide = Math.max(1, (area.w * C.widthFill) / (f1 - f0) / cam.ppmFit);
  cam.zooms = [1, wide, wide * C.closer];
  if (first || !cam.zoomSet) { cam.zoom = cam.zooms[cam.zoomIdx]; cam.zoomSet = true; }
  if (first) { cam.cx = w / 2; cam.cz = h / 2; }
}

export function rotateCamera(cam, dir) {
  cam.step = (cam.step + (dir > 0 ? 1 : 3)) % 4;
  cam.yawFrom = cam.yaw;
  cam.yawTo = cam.yawTo + (dir > 0 ? 90 : -90);
  cam.tw = 0;
}
export function zoomCamera(cam, d) {
  const n = cam.zooms.length;
  cam.zoomIdx = Math.max(0, Math.min(n - 1, cam.zoomIdx + (d > 0 ? 1 : -1)));
}

/** Advance tweens. focus — the point the camera leans to when zoomed in (active unit). Returns true while moving. */
export function updateCamera(cam, dt, { focus = null, follow = false, instant = false } = {}) {
  const C = GFX.camera;
  let moving = false;
  if (cam.tw < 1) {
    cam.tw = instant ? 1 : Math.min(1, cam.tw + dt / C.tween);
    cam.yaw = cam.yawFrom + (cam.yawTo - cam.yawFrom) * ease(cam.tw);
    moving = true;
  } else cam.yaw = cam.yawTo;
  const zt = cam.zooms[cam.zoomIdx];
  const k = instant ? 1 : 1 - Math.exp(-dt * 12);
  if (Math.abs(cam.zoom - zt) > 1e-3) { cam.zoom += (zt - cam.zoom) * k; moving = true; } else cam.zoom = zt;
  const mx = cam.mapW / 2, mz = cam.mapH / 2;
  const lean = follow ? 1 : Math.max(0, Math.min(1, (1 - 1 / cam.zoom) * 1.5));
  const bx = focus ? mx + (focus.x - mx) * lean : mx, bz = focus ? mz + (focus.z - mz) * lean : mz;
  cam.bx = bx; cam.bz = bz;
  clampPan(cam);
  // the pan offset keeps every corner reachable: the target may go anywhere on the map box
  const tx = bx + cam.px, tz = bz + cam.pz;
  const kc = instant ? 1 : 1 - Math.exp(-dt * C.follow);
  if (Math.abs(cam.cx - tx) + Math.abs(cam.cz - tz) > 1e-3) { cam.cx += (tx - cam.cx) * kc; cam.cz += (tz - cam.cz) * kc; moving = true; }
  cam.moving = moving;
  return moving;
}

function clampPan(cam) {
  cam.px = Math.max(-cam.bx, Math.min(cam.mapW - cam.bx, cam.px));
  cam.pz = Math.max(-cam.bz, Math.min(cam.mapH - cam.bz, cam.pz));
}
/** Move the view by (dx, dy) screen pixels: the ground under the cursor follows the drag. */
export function panCamera(cam, dx, dy) {
  const { r, u, f } = basis(cam), s = ppm(cam);
  const fl = Math.hypot(f[0], f[2]) || 1, fh = [f[0] / fl, 0, f[2] / fl];
  const k = dot(fh, u) || 1;
  const ox = cam.px, oz = cam.pz;
  cam.px += -r[0] * dx / s + fh[0] * dy / (s * k);
  cam.pz += -r[2] * dx / s + fh[2] * dy / (s * k);
  clampPan(cam);
  cam.cx += cam.px - ox; cam.cz += cam.pz - oz; // a drag moves the view at once (no follow lag)
}
export function centerCamera(cam, x, z) {
  cam.px = x - cam.bx; cam.pz = z - cam.bz;
  clampPan(cam);
}

const ppm = (cam) => cam.ppmFit * cam.zoom;
const center = (cam) => [cam.area.x + cam.area.w / 2, cam.area.y + cam.area.h / 2];
const target = (cam) => [cam.cx, cam.cy, cam.cz];
const DEPTH = 200;

export function viewProj(cam, W, H) {
  const { r, u, f } = basis(cam), T = target(cam), [cx, cy] = center(cam), s = ppm(cam);
  const ax = (2 * s) / W, ay = (2 * s) / H;
  const bx = (2 * cx) / W - 1 - ax * dot(r, T), by = 1 - (2 * cy) / H - ay * dot(u, T);
  const m = new Float32Array(16);
  // column-major: m[col * 4 + row]
  m[0] = ax * r[0]; m[4] = ax * r[1]; m[8] = ax * r[2]; m[12] = bx;
  m[1] = ay * u[0]; m[5] = ay * u[1]; m[9] = ay * u[2]; m[13] = by;
  m[2] = f[0] / DEPTH; m[6] = f[1] / DEPTH; m[10] = f[2] / DEPTH; m[14] = -dot(f, T) / DEPTH;
  m[15] = 1;
  return m;
}

export function project(cam, x, y, z) {
  const { r, u, f } = basis(cam), T = target(cam), [cx, cy] = center(cam), s = ppm(cam);
  const P = [x - T[0], y - T[1], z - T[2]];
  return { x: cx + s * dot(P, r), y: cy - s * dot(P, u), d: dot(P, f) };
}

export function rayAt(cam, px, py) {
  const { r, u, f } = basis(cam), T = target(cam), [cx, cy] = center(cam), s = ppm(cam);
  const a = (px - cx) / s, b = (cy - py) / s;
  return { o: [T[0] + r[0] * a + u[0] * b - f[0] * 100, T[1] + r[1] * a + u[1] * b - f[1] * 100, T[2] + r[2] * a + u[2] * b - f[2] * 100], d: f };
}

/** Nearest cell whose top (topAt(x, y) metres) the ray hits; walls / blocks win over the floor behind them.
 *  Returns {x, y, fx, fz} — fx/fz: the hit point in world units (metric movement aims at it). */
export function pickCell(cam, px, py, w, h, topAt) {
  const { o, d } = rayAt(cam, px, py);
  let best = null, bt = Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const top = topAt(x, y);
    const t = (top - o[1]) / d[1];
    if (t >= bt) continue;
    const X = o[0] + d[0] * t, Z = o[2] + d[2] * t;
    if (X >= x && X < x + 1 && Z >= y && Z < y + 1) { bt = t; best = { x, y, fx: X, fz: Z }; }
    else if (top > 0.3) { // side faces of tall cells: the ray passes through the column below its top
      const t2 = (0 - o[1]) / d[1];
      // sample the segment between the top plane and the floor plane
      for (let k = 1; k <= 3; k++) {
        const tt = t + ((t2 - t) * k) / 4;
        if (tt >= bt) break;
        const X2 = o[0] + d[0] * tt, Z2 = o[2] + d[2] * tt, Y2 = o[1] + d[1] * tt;
        if (Y2 <= top && X2 >= x && X2 < x + 1 && Z2 >= y && Z2 < y + 1) { bt = tt; best = { x, y, fx: X2, fz: Z2 }; break; }
      }
    }
  }
  return best;
}
