// Effects of the 3D battle (docs/specs/3d.md §2–3, §7, stage 2): surfaces as flat animated decals (overlay quads) +
// low-frequency particles (instanced low-poly balls), projectiles, muzzle flashes, impact sparks, cast rings, debris puffs.
// No flicker: every brightness change is a smooth curve with a period >= 0.5 s; flashes peak smoothly over >= 150 ms.
// «Снизить эффекты» — decals only (no particles), «Снизить движение» — particles stand still.
//   spawnFx(V, fx)                      fx {kind: bolt|orb|arc|flash|spark|ring|puff, t0, dur?, from, to, at, r, color}
//   buildFx(S, V, now, prefs, ob, P)    -> true while transient effects play; decals into OverlayBuilder ob,
//                                          particles into P (array of 12 floats each: pos xyz, scale, rgba, stretch xyz, yaw)
//   particleMesh()                      -> MeshBuilder of the particle (low-poly ball)
import { GFX } from '../data/gfx.js';
import { keyRGB, MeshBuilder } from './mesh.js';

const F = GFX.fx, TW = Math.PI * 2;
const frac = (v) => v - Math.floor(v);
const hash = (x, y, k = 0) => { let h = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 1274126177); h ^= h >>> 13; return (Math.imul(h, 1103515245) >>> 0) / 4294967296; };
const DUR = { flash: F.flash, spark: F.spark, ring: F.ring, puff: F.puff };

export function spawnFx(V, fx) {
  if (!V.fx) V.fx = [];
  fx.dur = fx.dur ?? DUR[fx.kind] ?? 0.3;
  V.fx.push(fx);
  if (V.fx.length > 80) V.fx.splice(0, V.fx.length - 80);
}

let pm = null;
/** Low-poly ball (6 segments x 4 bands, 36 triangles): puffs, flames (stretched), bubbles, sparks, projectiles. */
export function particleMesh() {
  if (pm) return pm;
  pm = new MeshBuilder();
  const r = [[1, 1, 1], [1, 1, 1], [1, 1, 1]], seg = 6, lat = [-1, -0.5, 0, 0.5, 1];
  const P = (j, k) => { const y = lat[j], rr = Math.sqrt(Math.max(0, 1 - y * y)), a = ((k + (j % 2) * 0.5) / seg) * Math.PI * 2; return [Math.cos(a) * rr, y, Math.sin(a) * rr]; };
  for (let j = 0; j < 4; j++) for (let k = 0; k < seg; k++) {
    if (j === 0) pm.tri(P(0, 0), P(1, k), P(1, k + 1), r, { inside: [0, 0, 0] });
    else if (j === 3) pm.tri(P(4, 0), P(3, k), P(3, k + 1), r, { inside: [0, 0, 0] });
    else pm.quad(P(j, k), P(j, k + 1), P(j + 1, k + 1), P(j + 1, k), r, { inside: [0, 0, 0] });
  }
  return pm;
}

/** One particle: position, size, colour key / rgb, alpha, stretch, yaw. */
function part(P, x, y, z, s, c, a, sx = 1, sy = 1, sz = 1, yaw = 0) {
  if (P.length >= F.maxParticles * 12) return;
  P.push(x, y, z, s, c[0], c[1], c[2], a, sx, sy, sz, yaw);
}
const rgb = (k) => keyRGB(k);

export function buildFx(S, V, now, prefs, ob, P) {
  const b = S.b, Wd = V.world, fl = (x, y) => (Wd.floor[y * Wd.w + x] ?? 0);
  const parts = !prefs.reduceFx, tt = prefs.reduceMotion ? 0 : now;
  // ---- surfaces
  for (const [k, cell] of b.surfaces || []) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x >= Wd.w || y >= Wd.h) continue;
    const f = fl(x, y) + GFX.geo.overlay, ph = hash(x, y);
    const fd = cell.floor && !cell.floor.hazard ? b.data.surfaces?.[cell.floor.kind] : null;
    if (fd) floorDecal(ob, P, fd, x, y, f, tt, ph, parts, prefs);
    const gd = cell.gas ? b.data.surfaces?.[cell.gas.kind] : null;
    if (gd) gas(ob, P, gd.color, x, y, f, tt, ph, parts, gd.id === 'smoke' ? 0.34 : 0.26);
  }
  for (const z of b.zones || []) {
    const R = z.size || 1;
    for (let y = z.y - R; y <= z.y + R; y++) for (let x = z.x - R; x <= z.x + R; x++) {
      if (x < 0 || y < 0 || x >= Wd.w || y >= Wd.h) continue;
      gas(ob, P, z.kind === 'smoke' ? '4' : 'j', x, y, fl(x, y) + GFX.geo.overlay, tt, hash(x, y, 3), parts, 0.3);
    }
  }
  // burning tiles of the map (T_HAZARD) — flames over the baked glow
  if (parts) for (let i = 0; i < Wd.kind.length; i++) if (Wd.kind[i] === 'fire') flames(P, i % Wd.w, (i / Wd.w) | 0, Wd.floor[i], tt, hash(i, 7));
  // ---- transient effects
  let active = false;
  const keep = [];
  for (const e of V.fx || []) {
    const k = (now - e.t0) / e.dur;
    if (k >= 1) continue;
    keep.push(e); active = true;
    if (k < 0) continue;
    transient(ob, P, e, k, parts);
  }
  if (V.fx) V.fx = keep;
  return active;
}

function floorDecal(ob, P, d, x, y, f, t, ph, parts, prefs) {
  const c = rgb(d.color || '5'), core = rgb(d.core || d.color || '5');
  const base = d.id === 'cringe' ? 0.3 + 0.08 * Math.sin(TW * 0.5 * t + ph * TW) : d.id === 'ice' ? 0.42 : 0.33;
  ob.rect(x, y, x + 1, y + 1, f, [c[0], c[1], c[2], base]).frame(x, y, x + 1, y + 1, f + 0.001, 0.05, [c[0], c[1], c[2], 0.72]);
  const g = f + 0.002;
  switch (d.id) {
    case 'fire': {
      const a = 0.32 + 0.1 * Math.sin(TW * 0.5 * t + ph * TW); // 0.5 Hz glow breathing
      ob.rect(x + 0.2, y + 0.2, x + 0.8, y + 0.8, g, [core[0], core[1], core[2], a]);
      if (parts) flames(P, x, y, f, t, ph);
      break;
    }
    case 'electric': {
      // two zigzag arcs drifting slowly along the cell (continuous motion, no blinking)
      for (let r = 0; r < 2; r++) {
        const z0 = y + 0.3 + r * 0.4, pts = [];
        for (let i = 0; i <= 5; i++) pts.push([x + 0.08 + i * 0.168, z0 + 0.11 * Math.sin(i * 2.4 + TW * F.arcHz * t + ph * 9 + r * 2)]);
        for (let i = 0; i < 5; i++) seg(ob, pts[i], pts[i + 1], g, 0.035, [core[0], core[1], core[2], 0.8]);
      }
      if (parts) { const k = frac(t * 0.45 + ph); part(P, x + 0.1 + 0.8 * k, f + 0.06, y + 0.3 + 0.4 * Math.round(ph), 0.05, core, 0.85); }
      break;
    }
    case 'water': case 'oil': case 'blood': {
      if (d.id === 'water' && prefs.reduceFx) break;
      const k = d.id === 'blood' ? 0.35 : frac(t / F.shineT + ph), s0 = -0.3 + 1.3 * k;
      const a0 = Math.max(0, Math.min(1, s0)), a1 = Math.max(0, Math.min(1, s0 + 0.18));
      if (a1 > a0) ob.quad([x + a0, g, y + 0.15], [x + a0, g, y + 0.85], [x + a1, g, y + 0.85], [x + a1, g, y + 0.15], [core[0], core[1], core[2], d.id === 'water' ? 0.28 : 0.2]);
      break;
    }
    case 'acid': {
      ob.rect(x + 0.25, y + 0.25, x + 0.75, y + 0.75, g, [core[0], core[1], core[2], 0.22]);
      if (parts) for (let i = 0; i < 2; i++) {
        const k = frac(t / F.bubbleT + ph + i * 0.5), px = x + 0.25 + 0.5 * hash(x, y, i + 1), pz = y + 0.25 + 0.5 * hash(x, y, i + 5);
        part(P, px, f + 0.03 + k * 0.14, pz, 0.035 + 0.045 * k, c, 0.75 * (1 - k));
      }
      break;
    }
    case 'ice': {
      ob.rect(x + 0.12, y + 0.12, x + 0.88, y + 0.88, g, [core[0], core[1], core[2], 0.22]);
      if (parts) for (let i = 0; i < 2; i++) part(P, x + 0.25 + 0.5 * hash(x, y, i + 2), f + 0.04, y + 0.25 + 0.5 * hash(x, y, i + 4), 0.07, rgb('h'), 0.85, 0.8, 1.6, 0.8, ph * 6);
      break;
    }
    case 'proxy': {
      for (let i = 0; i < 3; i++) { const z0 = y + 0.15 + i * 0.27; ob.rect(x + 0.1, z0, x + 0.9, z0 + 0.1, g, [core[0], core[1], core[2], 0.3]); }
      break;
    }
    default:
  }
}

/** Two flame tongues (outer + core) slowly changing height (0.8 Hz) and a rising ember. */
function flames(P, x, y, f, t, ph) {
  const e = rgb('e'), cb = rgb('b'), a = rgb('a');
  for (let i = 0; i < 2; i++) {
    const px = x + 0.32 + 0.36 * i + 0.08 * (hash(x, y, i) - 0.5), pz = y + 0.4 + 0.25 * hash(x, y, i + 9);
    const hgt = 1 + 0.25 * Math.sin(TW * F.flameHz * t + ph * TW + i * 2.1);
    part(P, px, f + 0.16 * hgt, pz, 0.15, e, 0.85, 1, 2.1 * hgt, 1);
    part(P, px, f + 0.1 * hgt, pz, 0.085, cb, 0.92, 1, 1.8 * hgt, 1);
  }
  const k = frac(t / F.emberT + ph);
  part(P, x + 0.5 + 0.15 * Math.sin(TW * (k + ph)), f + 0.2 + k * 0.8, y + 0.5, 0.03, a, 0.8 * Math.sin(Math.PI * k));
}

/** Gas / smoke: soft puffs slowly circling over the cell; flat haze without particles. */
function gas(ob, P, key, x, y, f, t, ph, parts, alpha) {
  const c = rgb(key);
  if (!parts) { ob.rect(x, y, x + 1, y + 1, f + 0.6, [c[0], c[1], c[2], alpha * 0.8]); return; }
  ob.rect(x, y, x + 1, y + 1, f + 0.003, [c[0], c[1], c[2], alpha * 0.45]);
  for (let i = 0; i < 3; i++) {
    const a = TW * (t / F.puffT + ph + i / 3), r = 0.17;
    const s = 0.34 + 0.06 * Math.sin(TW * (t / F.puffT) * 1.3 + i + ph * 5);
    part(P, x + 0.5 + Math.cos(a) * r, f + 0.42 + 0.12 * i + 0.05 * Math.sin(a * 0.7), y + 0.5 + Math.sin(a) * r, s, c, alpha, 1.3, 0.75, 1.3, a);
  }
}

/** Thin horizontal segment (arc of electricity) as a quad. */
function seg(ob, a, b, y, w, c) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
  ob.quad([a[0] + nx, y, a[1] + nz], [a[0] - nx, y, a[1] - nz], [b[0] - nx, y, b[1] - nz], [b[0] + nx, y, b[1] + nz], c);
}

function transient(ob, P, e, k, parts) {
  const col = rgb(e.color || F.color[e.kind] || F.color.bolt);
  const lerp = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  switch (e.kind) {
    case 'bolt': case 'orb': case 'arc': {
      const p = lerp(e.from, e.to);
      if (e.kind === 'arc') p[1] += Math.sin(Math.PI * k) * Math.max(0.6, Math.hypot(e.to[0] - e.from[0], e.to[2] - e.from[2]) * 0.25);
      const yaw = Math.atan2(e.to[0] - e.from[0], e.to[2] - e.from[2]);
      if (e.kind === 'bolt') part(P, p[0], p[1], p[2], 0.05, col, 0.95, 0.8, 0.8, F.boltLen / 0.05, yaw);
      else if (e.kind === 'orb') { part(P, p[0], p[1], p[2], 0.11, col, 0.9); if (parts) part(P, p[0], p[1], p[2], 0.17, col, 0.3); }
      else part(P, p[0], p[1], p[2], 0.07, rgb(F.color.throw), 1, 1, 1, 1, k * 6);
      break;
    }
    case 'flash': { // smooth peak over the whole duration (>= 150 ms), small
      const a = Math.sin(Math.PI * k);
      part(P, e.at[0], e.at[1], e.at[2], 0.06 + 0.07 * a, col, 0.85 * a);
      break;
    }
    case 'spark': {
      if (!parts) { part(P, e.at[0], e.at[1], e.at[2], 0.08 * (1 - k), col, 0.8 * (1 - k)); break; }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TW + 0.6, r = 0.1 + 0.3 * k;
        part(P, e.at[0] + Math.cos(a) * r, e.at[1] + 0.15 * Math.sin(Math.PI * k) + (i % 2) * 0.05, e.at[2] + Math.sin(a) * r, 0.035, col, 0.9 * (1 - k));
      }
      break;
    }
    case 'ring': {
      const r = 0.2 + (e.r || 0.8) * k;
      ob.ring(e.at[0], e.at[2], e.at[1] + GFX.geo.overlay + 0.006, Math.max(0, r - 0.07), r, [col[0], col[1], col[2], 0.6 * (1 - k)], 24);
      break;
    }
    case 'puff': {
      if (!parts) break;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TW, r = 0.1 + 0.35 * k;
        part(P, e.at[0] + Math.cos(a) * r, e.at[1] + 0.25 * k, e.at[2] + Math.sin(a) * r, 0.12 + 0.12 * k, col, 0.5 * (1 - k), 1.2, 0.8, 1.2, a);
      }
      break;
    }
    default:
  }
}
