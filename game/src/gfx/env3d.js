// Environment of the 3D scenes (premium-look «окружение»): everything here is baked into the static chunk meshes
// (floor tone variants, soft edges, bevel lines, decals, scattered litter, modular wall segments) or built once per
// world (backdrop beyond the map), plus the two cheap dynamic bits: point-light glow pools and ambient particles
// («Снизить эффекты» drops both). Colours are palette keys only (docs/STYLE.md «Окружение 3D»), numbers — GFX.env.
//   envCtx(Wd)                         -> per-world cache (tone ramps, noise)
//   floorTone(Wd, x, y, f)             -> ramp of the floor top (2–4 tone variants by noise)
//   floorExtras(mb, Wd, x, y)          blend strips, bevel lines on drops, shoreline foam, seams, decals
//   scatterCell(mb, Wd, x, y)          2–4 tiny details (no collision), denser at edges
//   wallBlock(mb, Wd, x, y, low, wa, wb)  modular wall segment of the biome
//   buildBackdrop(Wd, bg)              -> { ground: MeshBuilder, groups: [{mask, mb}] } sky-less horizon beyond the map
//   lampsOf(b, Wd) / lampGlow(...)     light sources + soft glow pools; ambientFx(...) — dust / ash / spores / sparks
import { GFX } from '../data/gfx.js';
import { biomeTones } from '../assets/tilesets.js';
import { MeshBuilder, OverlayBuilder, rampRGB, keyRGB } from './mesh.js';
import { VERT } from './gl.js';
import { ramp } from './models.js';

const G = GFX.geo, E = GFX.env, TAU = Math.PI * 2;
export const rnd = (x, y, k = 0) => { let h = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 1274126177); h ^= h >>> 13; return (Math.imul(h, 1103515245) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = rnd(xi, yi, k), b = rnd(xi + 1, yi, k), c = rnd(xi, yi + 1, k), d = rnd(xi + 1, yi + 1, k);
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
}
const K = keyRGB;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp3 = (a) => a.map((v) => Math.max(0, Math.min(1, v)));
const flat = (c) => [c, c, c];
const dist3 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const mulc = (c, k) => c.map((v) => Math.min(1, v * k));
/** [shade, base, light] from one colour (light = lit faces). */
const shaded = (c, lo = 0.62, hi = 1.12) => [mulc(c, lo), c, mulc(c, hi)];
const mixR = (A, B, t) => A.map((c, i) => lerp3(c, B[i], t));

// ---------------------------------------------------------------- per-world context
export function envCtx(Wd) {
  if (Wd.env) return Wd.env;
  const bt = biomeTones(Wd.biome), o = bt.o;
  const dk = K(o.dk), base = K(o.base), lt = K(o.lt), ex = K(o.ex);
  const wk = (bt.water || ['1', '2', '3']).map(K);
  const tops = E.tone.map((k) => clamp3(lerp3(base, lt, k)));
  const ramps = tops.map((top, i) => [lerp3(dk, base, 0.5 + i * 0.1), lerp3(dk, base, 0.9), top]);
  const hi = E.tone.map((k) => clamp3(lerp3(base, lt, k + 0.28)));
  const rampsHi = hi.map((top) => [base, lt, top]);
  const C = { biome: Wd.biome, bt, o, dk, base, lt, ex, wk, tops, ramps, rampsHi, hi, ink: K('0'), white: K('5') };
  Wd.env = C;
  return C;
}
function toneIdx(x, y) {
  const n = 0.62 * vnoise(x * 0.3, y * 0.3, 1) + 0.38 * rnd(x, y, 2);
  return n < 0.36 ? 0 : n < 0.5 ? 1 : n < 0.64 ? 2 : 3;
}
/** Ramp of the floor top: tone variant by low-frequency noise; upper levels (>= 1 m) lighter. */
export function floorTone(Wd, x, y, f) {
  const C = envCtx(Wd), i = toneIdx(x, y);
  return f >= 0.99 ? C.rampsHi[i] : C.ramps[i];
}
const cellCls = (Wd, x, y) => { const k = Wd.kind[y * Wd.w + x]; return k === 'deck' ? 1 : k === 'exit' ? 2 : k === 'water' || k === 'deep' ? 3 : 0; };
const cellTop = (Wd, x, y) => {
  const C = envCtx(Wd), i = y * Wd.w + x, k = Wd.kind[i];
  if (k === 'water') return C.wk[1];
  if (k === 'deep') return C.wk[0];
  if (k === 'deck') return ramp('8')[2];
  if (k === 'exit') return ramp('6')[2];
  return (Wd.floor[i] >= 0.99 ? C.hi : C.tops)[toneIdx(x, y)];
};

// ---------------------------------------------------------------- floor extras
const SIDES = [[0, 1], [0, -1], [1, 0], [-1, 0]];
function strip(mb, x, y, f, dx, dz, wd, col, yo) {
  let x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
  if (dz === 1) z0 = z1 - wd; else if (dz === -1) z1 = z0 + wd; else if (dx === 1) x0 = x1 - wd; else x1 = x0 + wd;
  mb.quad([x0, f + yo, z0], [x0, f + yo, z1], [x1, f + yo, z1], [x1, f + yo, z0], flat(col), { inside: [(x0 + x1) / 2, f - 1, (z0 + z1) / 2] });
}
function flatPoly(mb, pts, f, yo, col) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  mb._poly(pts.map((p) => [p[0], f + yo, p[1]]), flat(col), { inside: [cx, f - 1, cz] });
}
function ellipse(mb, cx, cz, rx, rz, rot, f, yo, col, n = 8) {
  const c = Math.cos(rot), s = Math.sin(rot), pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, jx = 1 + 0.18 * Math.sin(a * 3 + cx * 7), px = Math.cos(a) * rx * jx, pz = Math.sin(a) * rz * jx;
    pts.push([cx + px * c - pz * s, cz + px * s + pz * c]);
  }
  flatPoly(mb, pts, f, yo, col);
}
function seg(mb, x0, z0, x1, z1, f, yo, w, col, glow = false) {
  const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (-(z1 - z0) / l) * w / 2, nz = ((x1 - x0) / l) * w / 2;
  mb.quad([x0 - nx, f + yo, z0 - nz], [x1 - nx, f + yo, z1 - nz], [x1 + nx, f + yo, z1 + nz], [x0 + nx, f + yo, z0 + nz], flat(col), { inside: [(x0 + x1) / 2, f - 1, (z0 + z1) / 2], glow });
}
function crack(mb, cx, cz, f, h, col) {
  let a = rnd(cx * 9 | 0, cz * 9 | 0, 5) * TAU, x = cx, z = cz;
  const n = 3 + (h % 3);
  for (let k = 0; k < n; k++) {
    const l = 0.14 + ((h >>> (k * 3)) % 10) / 70, nx = x + Math.cos(a) * l, nz = z + Math.sin(a) * l;
    seg(mb, x, z, nx, nz, f, 0.005, 0.028 - k * 0.003, col);
    if (k === 1 && h % 2) seg(mb, nx, nz, nx + Math.cos(a + 1.1) * 0.12, nz + Math.sin(a + 1.1) * 0.12, f, 0.005, 0.02, col);
    x = nx; z = nz; a += ((h >>> (k + 7)) % 7 - 3) * 0.28;
  }
}

const DECALS = {
  wasteland: [['crack', 5], ['stain', 2], ['sand', 3]],
  swamp: [['puddle', 5], ['moss', 3], ['crack', 1]],
  snow: [['drift', 5], ['crack', 2], ['tracks', 3]],
  'ruins-city': [['crack', 4], ['puddle', 3], ['stain', 2], ['moss', 1]],
  'bunker-interior': [['stain', 4], ['crack', 2], ['hatch', 1]],
  factory: [['oil', 4], ['crack', 4], ['stain', 2], ['hatch', 1]],
  port: [['puddle', 4], ['crack', 2], ['stain', 2]],
  'mutant-forest': [['moss', 5], ['puddle', 2], ['crack', 1]],
  cyberspace: [['glitch', 6], ['crack', 2]],
};
const SEAMS = { 'bunker-interior': 'plate', factory: 'joint', port: 'plank', cyberspace: 'grid' };

function decal(mb, C, kind, x, y, f, h) {
  const cx = x + 0.25 + (h % 50) / 100, cz = y + 0.25 + ((h >>> 6) % 50) / 100, rot = ((h >>> 12) % 31) / 5;
  const r = 0.2 + ((h >>> 3) % 20) / 100;
  const dark = lerp3(C.dk, C.ink, 0.45);
  switch (kind) {
    case 'crack': crack(mb, cx, cz, f, h, dark); break;
    case 'stain': ellipse(mb, cx, cz, r * 1.2, r, rot, f, 0.004, lerp3(C.lt, C.dk, 0.55)); ellipse(mb, cx + 0.03, cz, r * 0.55, r * 0.45, rot, f, 0.006, lerp3(C.lt, C.dk, 0.8)); break;
    case 'oil': ellipse(mb, cx, cz, r * 1.1, r * 0.85, rot, f, 0.004, lerp3(C.dk, C.ink, 0.7)); ellipse(mb, cx - 0.04, cz - 0.03, r * 0.45, r * 0.3, rot, f, 0.006, lerp3(C.dk, K('o'), 0.4)); break;
    case 'puddle': {
      const w = lerp3(C.wk[0], C.dk, 0.35);
      ellipse(mb, cx, cz, r * 1.35, r, rot, f, 0.004, w);
      ellipse(mb, cx - 0.05, cz - 0.04, r * 0.7, r * 0.42, rot, f, 0.006, lerp3(w, K('f'), 0.28));
      break;
    }
    case 'moss': ellipse(mb, cx, cz, r * 1.1, r * 0.9, rot, f, 0.004, lerp3(C.dk, K('k'), 0.7)); ellipse(mb, cx + 0.05, cz + 0.02, r * 0.5, r * 0.4, rot, f, 0.006, lerp3(C.dk, K('j'), 0.35)); break;
    case 'sand': ellipse(mb, cx, cz, r * 1.6, r * 1.1, rot, f, 0.004, lerp3(C.lt, K('9'), 0.2)); break;
    case 'drift': ellipse(mb, cx, cz, r * 1.5, r * 0.9, rot, f, 0.004, lerp3(C.lt, C.white, 0.55)); break;
    case 'tracks': for (let k = 0; k < 4; k++) { const px = cx + k * 0.17 * Math.cos(rot), pz = cz + k * 0.17 * Math.sin(rot), s = k % 2 ? 0.05 : -0.05; ellipse(mb, px - s * Math.sin(rot), pz + s * Math.cos(rot), 0.045, 0.03, rot, f, 0.004, lerp3(C.base, C.dk, 0.7), 6); } break;
    case 'hatch': mb.box(cx - 0.2, f, cz - 0.2, cx + 0.2, f + 0.012, cz + 0.2, shaded(lerp3(C.dk, C.lt, 0.35)), { ao: 0 }); mb.box(cx - 0.14, f + 0.012, cz - 0.14, cx + 0.14, f + 0.02, cz + 0.14, shaded(lerp3(C.dk, C.lt, 0.15)), { ao: 0 }); break;
    case 'glitch': {
      const c = h % 3 === 0 ? K('n') : K('h');
      for (let k = 0; k < 3; k++) seg(mb, cx + k * 0.08, cz - 0.15, cx + k * 0.08 + (h % 2 ? 0.1 : -0.1), cz + 0.05 + k * 0.05, f, 0.005, 0.03, lerp3(C.dk, c, 0.7), true);
      break;
    }
    default:
  }
}

/** Soft edges, bevel lines on drops, shoreline foam, floor seams, decals — one cell. */
export function floorExtras(mb, Wd, x, y) {
  const { w, h, kind, floor, obst } = Wd, C = envCtx(Wd), i = y * w + x, k = kind[i], f = floor[i];
  const wet = k === 'water' || k === 'deep';
  const own = cellTop(Wd, x, y), hv = (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0);
  if (k === 'wall' || k === 'fence' || (obst[i] > 0.3 && k !== 'floor' && k !== 'deck')) return;
  for (const [dx, dz] of SIDES) {
    const nx = x + dx, ny = y + dz;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) { if (!wet && f > -0.1) strip(mb, x, y, f, dx, dz, 0.06, lerp3(own, C.white, 0.38), 0.004); continue; }
    const ni = ny * w + nx, nk = kind[ni], nf = floor[ni];
    if (nf < f - 0.04) { if (!wet) strip(mb, x, y, f, dx, dz, 0.06, lerp3(own, C.white, 0.4), 0.004); continue; } // bevel: light line on the upper edge of a drop
    if (nf > f + 0.04 || Math.abs(nf - f) > 0.04) continue;
    const nwet = nk === 'water' || nk === 'deep';
    if (wet) { if (!nwet) strip(mb, x, y, f, dx, dz, 0.07, lerp3(own, C.white, 0.5), 0.003); continue; } // foam at the shore
    if (obst[ni] > 0.3 && nk !== 'floor') continue;
    const nt = nwet ? lerp3(own, C.wk[0], 0.5) : cellTop(Wd, nx, ny);
    if (!nwet && (cellCls(Wd, x, y) === cellCls(Wd, nx, ny) || dist3(own, nt) < 0.05)) continue; // soft edges only between floor types
    strip(mb, x, y, f, dx, dz, nwet ? 0.12 : 0.16, lerp3(own, nt, nwet ? 0.65 : 0.5), 0.003);
  }
  if (wet || k === 'exit' || Wd.under?.has(i) || obst[i] > 0.01) return;
  // seams of the biome floor
  const sm = SEAMS[Wd.biome];
  if (sm && k === 'floor') {
    const sc = lerp3(C.dk, C.ink, 0.5);
    if (sm === 'plate') {
      if (x % 2 === 0) seg(mb, x, y, x, y + 1, f, 0.004, 0.03, sc);
      if (y % 2 === 0) seg(mb, x, y, x + 1, y, f, 0.004, 0.03, sc);
      if (x % 2 === 0 && y % 2 === 0) mb.box(x + 0.04, f, y + 0.04, x + 0.1, f + 0.02, y + 0.1, shaded(C.lt), { ao: 0 });
    } else if (sm === 'joint') {
      if (x % 3 === 0) seg(mb, x, y, x, y + 1, f, 0.004, 0.035, sc);
      if (y % 3 === 0) seg(mb, x, y, x + 1, y, f, 0.004, 0.035, sc);
    } else if (sm === 'plank') {
      for (const t of [0.34, 0.67]) seg(mb, x, y + t, x + 1, y + t, f, 0.004, 0.022, sc);
      seg(mb, x + ((y + (hv % 3)) % 2 ? 0.3 : 0.7), y, x + ((y + (hv % 3)) % 2 ? 0.3 : 0.7), y + 1, f, 0.004, 0.022, sc);
    } else if (sm === 'grid') {
      const gc = lerp3(C.dk, K('i'), 0.85);
      seg(mb, x, y, x, y + 1, f, 0.004, 0.025, gc, true);
      seg(mb, x, y, x + 1, y, f, 0.004, 0.025, gc, true);
    }
  }
  // decals
  if (k === 'floor' && rnd(x, y, 7) < E.decalP) {
    const tab = DECALS[Wd.biome] || DECALS.wasteland;
    let tot = 0; for (const [, wgt] of tab) tot += wgt;
    let r = rnd(x, y, 8) * tot, pick = tab[0][0];
    for (const [id, wgt] of tab) { r -= wgt; if (r <= 0) { pick = id; break; } }
    decal(mb, C, pick, x, y, f, hv);
  }
}

// ---------------------------------------------------------------- scattered litter
const SCATTER = {
  wasteland: [['pebble', 5], ['weed', 3], ['bone', 1], ['can', 1], ['shell', 1]],
  swamp: [['reed', 4], ['lily', 2], ['pebble', 2], ['bone', 1], ['tuft', 2]],
  snow: [['pebble', 3], ['ice', 3], ['mound', 3], ['twig', 2]],
  'ruins-city': [['pebble', 3], ['paper', 3], ['can', 2], ['wire', 2], ['shard', 2], ['weed', 2], ['shell', 1]],
  'bunker-interior': [['bolt', 3], ['paper', 2], ['wire', 3], ['can', 1], ['shell', 1], ['shard', 1]],
  factory: [['bolt', 3], ['wire', 3], ['can', 2], ['paper', 1], ['shell', 1], ['pebble', 2]],
  port: [['plank', 3], ['rope', 2], ['can', 2], ['bone', 1], ['pebble', 1], ['wire', 1]],
  'mutant-forest': [['tuft', 5], ['mushroom', 3], ['pebble', 2], ['weed', 2], ['bone', 1]],
  cyberspace: [['data', 1], ['wire', 3], ['bolt', 3], ['shard', 1]],
};
function bit(mb, id, px, f, pz, h, C) {
  const r1 = (h % 100) / 100, r2 = ((h >>> 7) % 100) / 100, rot = r2 * TAU;
  const mute = (c) => lerp3(c, C.base, 0.5), mix = (a, b, t) => shaded(mute(lerp3(K(a), K(b), t)));
  switch (id) {
    case 'pebble': { const s = 0.035 + r1 * 0.05; mb.bevelBox(px - s, f, pz - s * 0.8, px + s, f + s * 0.9, pz + s * 0.8, 0.02, shaded(lerp3(C.base, C.lt, 0.3 + r2 * 0.5)), { ao: 0.3 }); break; }
    case 'weed': for (let k = 0; k < 3; k++) { const ox = (k - 1) * 0.045; mb.wedge(px + ox - 0.04, f, pz - 0.015, px + ox + 0.04, f + 0.13 + r1 * 0.1 + k * 0.02, pz + 0.015, mix('l', 'm', r2), { ao: 0 }); } break;
    case 'tuft': for (let k = 0; k < 4; k++) { const ox = (k - 1.5) * 0.04, oz = (k % 2 - 0.5) * 0.05; mb.wedge(px + ox - 0.035, f, pz + oz - 0.015, px + ox + 0.035, f + 0.1 + ((h >>> (k * 4)) % 9) / 60, pz + oz + 0.015, ramp(k % 2 ? 'l' : 'k'), { ao: 0 }); } break;
    case 'reed': for (let k = 0; k < 3; k++) mb.wedge(px + k * 0.04 - 0.03, f, pz - 0.012, px + k * 0.04 + 0.03, f + 0.28 + r1 * 0.14, pz + 0.012, ramp(k % 2 ? 'j' : 'm'), { ao: 0 }); break;
    case 'bone': mb.box(px - 0.09, f, pz - 0.015, px + 0.09, f + 0.025, pz + 0.015, shaded(K('4')), { ao: 0 }); mb.box(px - 0.1, f, pz - 0.03, px - 0.07, f + 0.03, pz + 0.03, shaded(K('5')), { ao: 0 }); mb.box(px + 0.07, f, pz - 0.03, px + 0.1, f + 0.03, pz + 0.03, shaded(K('5')), { ao: 0 }); break;
    case 'can': mb.cyl(px, f, pz, 0.085, 0.032, shaded(mute(K(['4', 'f', '7', '3', '8'][h % 5]))), { seg: 6, ao: 0.2 }); break;
    case 'shell': mb.cyl(px, f, pz, 0.035, 0.012, shaded(mute(K('a'))), { seg: 5, ao: 0 }); mb.cyl(px + 0.04, f, pz + 0.02, 0.035, 0.012, shaded(mute(K('a'))), { seg: 5, ao: 0 }); break;
    case 'bolt': mb.cyl(px, f, pz, 0.025, 0.02, ramp('4'), { seg: 6, ao: 0 }); mb.cyl(px + 0.07, f, pz - 0.03, 0.04, 0.012, ramp('3'), { seg: 5, ao: 0 }); break;
    case 'paper': {
      const c = Math.cos(rot), s = Math.sin(rot), a = 0.07, b = 0.095;
      const P = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => [px + u * c - v * s, pz + u * s + v * c]);
      flatPoly(mb, P, f, 0.007, lerp3(C.lt, C.white, 0.25)); break;
    }
    case 'wire': {
      let x = px - 0.12, z = pz - 0.06;
      const col = lerp3(C.dk, C.ink, 0.6);
      for (let k = 0; k < 3; k++) { const nx = x + 0.08 + ((h >>> k) % 5) / 100, nz = z + ((h >>> (k + 4)) % 9 - 4) / 50; seg(mb, x, z, nx, nz, f, 0.008, 0.022, col); x = nx; z = nz; }
      break;
    }
    case 'shard': mb.wedge(px - 0.04, f, pz - 0.03, px + 0.04, f + 0.06 + r1 * 0.05, pz + 0.03, shaded(mute(K('4'))), { ao: 0 }); break;
    case 'mushroom': mb.cyl(px, f, pz, 0.07, 0.014, ramp('5'), { seg: 5, ao: 0 }); mb.cyl(px, f + 0.06, pz, 0.04, 0.05, ramp(h % 3 ? 'n' : 'a'), { seg: 6, r1: 0.02, ao: 0 }); break;
    case 'plank': mb.box(px - 0.15, f, pz - 0.035, px + 0.15, f + 0.025, pz + 0.035, ramp('7'), { ao: 0.2 }); break;
    case 'rope': mb.cyl(px, f, pz, 0.035, 0.085, ramp('8'), { seg: 7, ao: 0.2 }); mb.cyl(px, f + 0.035, pz, 0.004, 0.04, ramp('6'), { seg: 6, ao: 0 }); break;
    case 'lily': ellipse(mb, px, pz, 0.1, 0.09, rot, f, 0.012, K('j'), 6); break;
    case 'ice': mb.cyl(px, f, pz, 0.1 + r1 * 0.08, 0.04, ramp('h'), { seg: 4, r1: 0, ao: 0 }); break;
    case 'mound': mb.wedge(px - 0.12, f, pz - 0.07, px + 0.12, f + 0.06, pz + 0.07, ramp('5'), { ao: 0 }); break;
    case 'twig': seg(mb, px - 0.1, pz - 0.04, px + 0.1, pz + 0.05, f, 0.012, 0.02, K('6')); break;
    case 'data': mb.cyl(px, f, pz, 0.09 + r1 * 0.08, 0.035, rampRGB(h % 4 === 0 ? [h % 2 ? 'i' : 'o', h % 2 ? 'h' : 'n', h % 2 ? 'h' : 'n'] : [h % 2 ? 'i' : 'o', h % 2 ? 'i' : 'o', h % 2 ? 'i' : 'o']), { seg: 4, r1: 0.005, glow: h % 4 === 0, ao: 0 }); break;
    default:
  }
}
const OBSTACLE = (Wd, x, y) => (x < 0 || y < 0 || x >= Wd.w || y >= Wd.h ? true : Wd.obst[y * Wd.w + x] > 0.3 || Wd.kind[y * Wd.w + x] === 'wall');
export function scatterCell(mb, Wd, x, y) {
  const i = y * Wd.w + x, k = Wd.kind[i];
  if ((k !== 'floor' && k !== 'deck') || Wd.under?.has(i) || Wd.obst[i] > 0.01) return;
  const C = envCtx(Wd), S = E.scatter, tab = SCATTER[Wd.biome] || SCATTER.wasteland;
  let edge = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && OBSTACLE(Wd, x + dx, y + dy)) edge++;
  const n = Math.min(S.max, S.base + (rnd(x, y, 11) * (S.rand + 1) | 0) + (edge ? Math.min(S.edge, 1 + (edge > 2 ? 1 : 0)) : 0));
  let tot = 0; for (const [, wgt] of tab) tot += wgt;
  const f = Wd.floor[i];
  for (let j = 0; j < n; j++) {
    const h = Math.imul(x * 73856093 ^ y * 19349663 ^ j * 83492791, 1274126177) >>> 0;
    // edge cells put the litter against the wall side
    let px = x + 0.14 + (h % 72) / 100, pz = y + 0.14 + ((h >>> 8) % 72) / 100;
    if (edge) {
      if (OBSTACLE(Wd, x - 1, y) && (h >>> 20) % 2) px = x + 0.12 + ((h >>> 9) % 20) / 100;
      else if (OBSTACLE(Wd, x + 1, y) && (h >>> 20) % 2) px = x + 0.88 - ((h >>> 9) % 20) / 100;
      else if (OBSTACLE(Wd, x, y - 1) && (h >>> 21) % 2) pz = y + 0.12 + ((h >>> 9) % 20) / 100;
      else if (OBSTACLE(Wd, x, y + 1) && (h >>> 21) % 2) pz = y + 0.88 - ((h >>> 9) % 20) / 100;
    }
    let r = ((h >>> 11) % 1000) / 1000 * tot, id = tab[0][0];
    for (const [t, wgt] of tab) { r -= wgt; if (r <= 0) { id = t; break; } }
    bit(mb, id, px, f, pz, h, C);
  }
}

// ---------------------------------------------------------------- modular walls
const hash2 = (x, y, k = 0) => Math.floor(rnd(x, y, k) * 4294967296) >>> 0;
/** Quad on a face of the cell block. side: 0 S(+z) 1 N(-z) 2 E(+x) 3 W(-x); a — 0..1 along the face, v — height above f. */
function face(mb, side, x, y, f, a0, a1, v0, v1, off, rmp, o = {}) {
  let p0, p1, p2, p3;
  if (side === 0) { const z = y + 1 + off; p0 = [x + a0, f + v0, z]; p1 = [x + a1, f + v0, z]; p2 = [x + a1, f + v1, z]; p3 = [x + a0, f + v1, z]; }
  else if (side === 1) { const z = y - off; p0 = [x + a0, f + v0, z]; p1 = [x + a1, f + v0, z]; p2 = [x + a1, f + v1, z]; p3 = [x + a0, f + v1, z]; }
  else if (side === 2) { const xx = x + 1 + off; p0 = [xx, f + v0, y + a0]; p1 = [xx, f + v0, y + a1]; p2 = [xx, f + v1, y + a1]; p3 = [xx, f + v1, y + a0]; }
  else { const xx = x - off; p0 = [xx, f + v0, y + a0]; p1 = [xx, f + v0, y + a1]; p2 = [xx, f + v1, y + a1]; p3 = [xx, f + v1, y + a0]; }
  mb.quad(p0, p1, p2, p3, rmp, { inside: [x + 0.5, f + (v0 + v1) / 2, y + 0.5], glow: o.glow, ao: o.ao });
}
/** Point on a face (a along, d out) as x, z. */
const fp = (side, x, y, a, d) => (side === 0 ? [x + a, y + 1 + d] : side === 1 ? [x + a, y - d] : side === 2 ? [x + 1 + d, y + a] : [x - d, y + a]);
const AX = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function pipe(mb, side, x, y, f, v, r, rmp) {
  const [px, pz] = fp(side, x, y, 0, r + 0.01), alongX = side < 2;
  const [qx, qz] = fp(side, x, y, 1, r + 0.01);
  if (alongX) mb.cyl(Math.min(px, qx), f + v, pz, 1, r, rmp, { axis: 'x', seg: 6 });
  else mb.cyl(px, f + v, Math.min(pz, qz), 1, r, rmp, { axis: 'z', seg: 6 });
  for (const a of [0.15, 0.85]) { // brackets
    const [bx, bz] = fp(side, x, y, a, r * 0.5);
    mb.box(bx - 0.025, f + v - r - 0.03, bz - 0.025, bx + 0.025, f + v + r + 0.03, bz + 0.025, ramp('1'), { ao: 0 });
  }
}

const WSTYLE = { brick: { rag: 0.34, plinth: true, pipe: 0.2 }, slab: { rag: 0.12, plinth: true, pipe: 0.3 }, corrug: { rag: 0.14, plinth: true, pipe: 0.25 }, rock: { rag: 0.4, plinth: false, pipe: 0 }, data: { rag: 0, plinth: true, pipe: 0 } };
const wstyleOf = (biome, tones) => (tones.wall === 'trees' ? null : WSTYLE[tones.wall] || WSTYLE.rock);

/** Wall cell (modular segment): block with a ragged top, plinth, biome face detail, pipes, openings, ruined sections. */
export function wallBlock(mb, Wd, x, y, low, wa, wb) {
  const tones = biomeTones(Wd.biome), wc = tones.wc, f = Wd.floor[y * Wd.w + x], H = Wd.wallH || G.wall;
  const st = wstyleOf(Wd.biome, tones), hv = hash2(x, y, 3);
  if (low) { mb.bevelBox(x, f, y, x + 1, f + G.cut, y + 1, 0.04, ramp(wa), { top: ramp(wb) }); return; }
  const ruined = st.rag > 0 && hv % 13 === 5, rag = st.rag;
  const top = ruined ? H * 0.52 : H - (st.rag ? rag * (0.3 + 0.7 * ((hv >>> 5) % 100) / 100) * 0.7 : 0);
  mb.bevelBox(x, f, y, x + 1, f + top, y + 1, G.bevel, ramp(wa), { top: ramp(wb) });
  // crown / rubble on the uneven top
  if (ruined) {
    for (let r = 0; r < 4; r++) {
      const h2 = hash2(x * 3 + r, y * 5 - r, 4), px = x + 0.12 + (h2 % 60) / 100, pz = y + 0.12 + ((h2 >>> 8) % 60) / 100, s = 0.09 + ((h2 >>> 16) % 10) / 100;
      mb.bevelBox(px - s, f + top - 0.02, pz - s, px + s, f + top + 0.06 + (h2 % 7) / 60, pz + s, 0.03, ramp(r % 2 ? wb : wa));
    }
    if (wc.brick) mb.cyl(x + 0.3 + (hv % 40) / 100, f + top - 0.02, y + 0.5, 0.32, 0.012, ramp('6'), { seg: 4 }); // rebar
  } else if (rag > 0.01 && top < H - 0.04) {
    const n = 1 + (hv % 2);
    for (let r = 0; r < n; r++) {
      const h2 = hash2(x * 7 + r, y * 11 + r, 6), wdt = 0.28 + (h2 % 28) / 100, wz = 0.3 + ((h2 >>> 6) % 50) / 100;
      const x0 = x + 0.04 + ((h2 >>> 10) % Math.max(1, Math.round((0.92 - wdt) * 100))) / 100, z0 = y + 0.5 - wz / 2;
      mb.bevelBox(x0, f + top - 0.03, z0, x0 + wdt, f + H - ((h2 >>> 14) % 8) / 100, z0 + wz, 0.03, ramp(wa), { top: ramp(wb) });
    }
  }
  // exposed faces
  const kindAt = (xx, yy) => (xx < 0 || yy < 0 || xx >= Wd.w || yy >= Wd.h ? 'out' : Wd.kind[yy * Wd.w + xx]);
  for (let s = 0; s < 4; s++) {
    const nk = kindAt(x + AX[s][0], y + AX[s][1]);
    if (nk === 'wall' || nk === 'out') continue;
    const h3 = hash2(x * 5 + s, y * 9 + s, 12), hh = Math.min(top, H) - 0.08, lo = 0.05;
    if (st.plinth && !ruined) { // base
      const [a, b] = [fp(s, x, y, 0, 0.05), fp(s, x, y, 1, 0)];
      mb.box(Math.min(a[0], b[0]), f, Math.min(a[1], b[1]), Math.max(a[0], b[0]), f + 0.2, Math.max(a[1], b[1]), ramp('1'), { top: ramp('2'), ao: 0.3 });
    }
    if (tones.wall === 'brick') {
      const brick = ramp(wc.brick), mort = rampRGB(['1', wc.mortar, wc.mortar]), dark = rampRGB(['1', '6', '6']);
      for (let r = 0; r < 6; r++) { // courses: mortar line + a few lighter / darker bricks
        const v = 0.28 + r * 0.22; if (v > hh) break;
        face(mb, s, x, y, f, 0, 1, v, v + 0.025, 0.004, mort);
        const shift = r % 2 ? 0.12 : 0.37;
        for (const a of [shift, shift + 0.5]) face(mb, s, x, y, f, a, a + 0.02, v - 0.2, Math.min(v, hh), 0.004, mort);
        const hb = hash2(x * 17 + s, y * 13 + r, 14);
        if (hb % 3 === 0) { const a = (hb >>> 4) % 70 / 100; face(mb, s, x, y, f, a, a + 0.22, v - 0.19, Math.min(v - 0.03, hh), 0.006, hb % 2 ? ramp(wc.hi) : dark); }
      }
      if (h3 % 6 === 0 && hh > 1.1) { // window opening
        const a = 0.28 + (h3 >>> 5) % 20 / 100;
        face(mb, s, x, y, f, a - 0.04, a + 0.38, 0.62, 1.2, 0.007, ramp('3'));
        face(mb, s, x, y, f, a, a + 0.34, 0.66, 1.16, 0.012, rampRGB(['0', '0', '1']));
        face(mb, s, x, y, f, a - 0.05, a + 0.39, 0.58, 0.63, 0.02, ramp('4'));
      } else if (h3 % 11 === 1) { // doorway
        face(mb, s, x, y, f, 0.26, 0.74, 0.0, 0.98, 0.007, ramp('3'));
        face(mb, s, x, y, f, 0.3, 0.7, 0.0, 0.94, 0.012, rampRGB(['0', '0', '1']));
      }
    } else if (tones.wall === 'slab') {
      const seam = rampRGB([wc.seam, wc.seam, wc.seam]), band = ramp(wc.dark);
      for (const a of [0.0, 0.5]) face(mb, s, x, y, f, a, a + 0.025, lo, hh, 0.004, seam);
      face(mb, s, x, y, f, 0, 1, 0.5, 0.56, 0.005, band);
      face(mb, s, x, y, f, 0, 1, hh - 0.14, hh - 0.06, 0.005, band);
      for (let k = 0; k < 5; k++) { const [rx, rz] = fp(s, x, y, 0.1 + k * 0.2, 0.012); mb.box(rx - 0.02, f + hh - 0.1, rz - 0.02, rx + 0.02, f + hh - 0.06, rz + 0.02, ramp('4'), { ao: 0 }); }
      if (h3 % 3 === 0) face(mb, s, x, y, f, 0.18, 0.82, 1.0, 1.06, 0.008, rampRGB([wc.lamp, wc.lamp, wc.lamp]), { glow: true });
      else if (h3 % 5 === 1) { // glass pane
        face(mb, s, x, y, f, 0.2, 0.8, 0.7, 1.15, 0.007, ramp('2'));
        face(mb, s, x, y, f, 0.25, 0.75, 0.75, 1.1, 0.012, rampRGB(['i', 'i', 'h']));
      } else if (h3 % 7 === 2) { face(mb, s, x, y, f, 0.3, 0.7, 0.0, 0.95, 0.007, ramp('1')); face(mb, s, x, y, f, 0.34, 0.66, 0.0, 0.9, 0.012, ramp('2')); }
    } else if (tones.wall === 'corrug') {
      const rib = ramp(wc.hi), rust = rampRGB(['1', '6', '7']);
      for (let a = 0.05; a < 1; a += 0.2) face(mb, s, x, y, f, a, a + 0.07, lo, hh, 0.004, rib);
      for (let k = 0; k < 3; k++) { const hb = hash2(x * 3 + k, y + s, 15); if (hb % 3) continue; const a = (hb >>> 4) % 85 / 100; face(mb, s, x, y, f, a, a + 0.06, hh - 0.2 - (hb >>> 9) % 70 / 100, hh, 0.007, rust); }
      for (const v of [0.3, hh - 0.08]) for (let k = 0; k < 5; k++) { const [rx, rz] = fp(s, x, y, 0.1 + k * 0.2, 0.012); mb.box(rx - 0.018, f + v, rz - 0.018, rx + 0.018, f + v + 0.035, rz + 0.018, ramp('4'), { ao: 0 }); }
      if (h3 % 9 === 3) { face(mb, s, x, y, f, 0.15, 0.85, 0.0, 1.05, 0.007, ramp('2')); for (let v = 0.12; v < 1; v += 0.14) face(mb, s, x, y, f, 0.15, 0.85, v, v + 0.02, 0.012, ramp('1')); }
    } else if (tones.wall === 'data') {
      const gl = rampRGB([wc.glow, wc.glow, wc.glow]), dim = rampRGB(['i', 'i', 'i']);
      face(mb, s, x, y, f, 0.08, 0.1, lo, hh, 0.005, dim, { glow: true });
      face(mb, s, x, y, f, 0.9, 0.92, lo, hh, 0.005, dim, { glow: true });
      const v = 0.3 + (h3 % 8) * 0.12;
      face(mb, s, x, y, f, 0.1, 0.9, v, v + 0.03, 0.006, h3 % 4 === 0 ? rampRGB([wc.hi, wc.hi, wc.hi]) : gl, { glow: true });
      if (h3 % 4 === 1) face(mb, s, x, y, f, 0.25, 0.75, 0.9, 1.25, 0.007, rampRGB(['i', 'i', 'o']));
    } else { // rock: strata, boulders
      const dkR = ramp(wc.dark), hiR = ramp(wc.hi);
      for (let r = 0; r < 3; r++) { const v = 0.2 + r * 0.42 + ((h3 >>> (r * 3)) % 10) / 100; if (v < hh) face(mb, s, x, y, f, 0, 1, v, v + 0.05 + r * 0.01, 0.004, r % 2 ? hiR : dkR); }
      if (h3 % 3 === 0) { const [bx, bz] = fp(s, x, y, 0.3 + (h3 >>> 4) % 40 / 100, 0.06); mb.bevelBox(bx - 0.17, f, bz - 0.17, bx + 0.17, f + 0.34 + (h3 >>> 9) % 20 / 100, bz + 0.17, 0.05, ramp(wc.face), { top: ramp(wc.top) }); }
    }
    // pipes and cables along the wall
    if (st.pipe > 0 && hh > 0.8) {
      const run = s < 2 ? rnd((x / 4) | 0, y, 40 + s) : rnd((y / 4) | 0, x, 40 + s);
      if (run < st.pipe) pipe(mb, s, x, y, f, 0.55 + (s < 2 ? (x / 4 | 0) : (y / 4 | 0)) % 3 * 0.3, 0.045, ramp(tones.wall === 'brick' ? '7' : '3'));
      else if (h3 % 8 === 4) { const [cx, cz] = fp(s, x, y, 0.2 + (h3 >>> 6) % 60 / 100, 0.02); mb.cyl(cx, f + hh - 0.5, cz, 0.5, 0.014, ramp('1'), { seg: 4, ao: 0 }); }
    }
  }
}

// ---------------------------------------------------------------- backdrop beyond the map
const BACK = {
  wasteland: { base: '6', shapes: [['mesa', 4], ['spire', 3], ['pylon', 1]], low: 'rock' },
  swamp: { base: 'k', shapes: [['tree', 6], ['deadtree', 2]], low: 'bush' },
  snow: { base: '2', shapes: [['mountain', 4], ['pine', 4]], low: 'rock' },
  'ruins-city': { base: '1', shapes: [['tower', 6], ['crane', 1], ['stack', 2]], low: 'rubble' },
  'bunker-interior': { base: '1', shapes: [['pillar', 4], ['tank', 2], ['hall', 2]], low: 'rubble' },
  factory: { base: '1', shapes: [['chimney', 3], ['tank', 3], ['hall', 4]], low: 'rubble' },
  port: { base: '1', shapes: [['crane', 3], ['stack', 5], ['hall', 2]], low: 'rock' },
  'mutant-forest': { base: 'k', shapes: [['tree', 7], ['bigtree', 2]], low: 'bush' },
  cyberspace: { base: '1', shapes: [['monolith', 7], ['shard', 3]], low: 'cube' },
};
export function buildBackdrop(Wd, bgKey) {
  const C = envCtx(Wd), B = BACK[Wd.biome] || BACK.wasteland, R = E.backdrop.ring, bg = K(bgKey);
  const fogC = K(GFX.fogColor[Wd.biome] || GFX.fogColor.default);
  const groups = [4, 1, 2, 8].map((mask) => ({ mask, mb: new MeshBuilder() })), low = new MeshBuilder(), ground = new OverlayBuilder(); // ground: flat colours drawn by the cheap overlay program
  const W = Wd.w, Hh = Wd.h, y0 = G.base - 0.02;
  // ground: banded gradient towards the sky colour
  const gc = Wd.biome === 'port' ? C.wk[0] : lerp3(C.dk, C.base, 0.3);
  const bands = E.backdrop.bands;
  for (let b = 0; b < bands; b++) {
    const t0 = b / bands, t1 = (b + 1) / bands, d0 = t0 * R, d1 = t1 * R;
    const col = lerp3(gc, lerp3(fogC, bg, 0.55), Math.pow(t1, 0.9) * 0.92);
    const rp = [col[0], col[1], col[2], 1];
    const q = (xa, za, xb, zb) => ground.quad([xa, y0, za], [xa, y0, zb], [xb, y0, zb], [xb, y0, za], rp);
    q(-d1, -d1, W + d1, -d0); q(-d1, Hh + d0, W + d1, Hh + d1); q(-d1, -d0, -d0, Hh + d0); q(W + d0, -d0, W + d1, Hh + d0);
  }
  if (Wd.biome === 'cyberspace') { // grid on the void floor
    const gl = lerp3(gc, K('i'), 0.8);
    const gc4 = [gl[0], gl[1], gl[2], 1], y1 = y0 + 0.003;
    for (let k = -10; k <= W + 10; k += 2) { if (k > 0 && k < W) { ground.line(k, -10, k, 0, y1, 0.04, gc4); ground.line(k, Hh, k, Hh + 10, y1, 0.04, gc4); } }
    for (let k = -10; k <= Hh + 10; k += 2) { if (k > 0 && k < Hh) { ground.line(-10, k, 0, k, y1, 0.04, gc4); ground.line(W, k, W + 10, k, y1, 0.04, gc4); } }
  }
  const tint = (key, d, hz = 0.5) => { const c = lerp3(K(key), lerp3(fogC, bg, 0.3), Math.min(0.85, 0.18 + (d / R) * hz)); return shaded(c, 0.7, 1.15); };
  let tot = 0; for (const [, wgt] of B.shapes) tot += wgt;
  for (let n = 0; n < E.backdrop.n; n++) {
    const h = hash2(n, W * 31 + Hh, 21), r1 = (h % 1000) / 1000, r2 = ((h >>> 10) % 1000) / 1000, r3 = ((h >>> 20) % 1000) / 1000;
    const s = (h >>> 3) % 4, d = 1.6 + R * Math.pow(r1, 1.15) * 0.95;
    const along = (r2 * 1.5 - 0.25);
    const [px, pz] = s === 0 ? [along * W, Hh + d] : s === 1 ? [along * W, -d] : s === 2 ? [W + d, along * Hh] : [-d, along * Hh];
    let rr = r3 * tot, id = B.shapes[0][0];
    for (const [t, wgt] of B.shapes) { rr -= wgt; if (rr <= 0) { id = t; break; } }
    const tmp = new MeshBuilder(), k2 = ((h >>> 5) % 100) / 100;
    shape(tmp, id, px, pz, d, k2, h, B, tint, C);
    let top = G.base;
    for (let q = 1; q < tmp.v.length; q += VERT) top = Math.max(top, tmp.v[q]);
    // an object d m beyond the map edge hides ground 1.41 x its height behind it: low enough -> drawn on every side
    (top - G.base <= (d - 0.8) / 1.5 ? low : groups[s].mb).add(tmp);
  }
  for (let n = 0; n < E.backdrop.n * 1.6; n++) { // low clutter close to the map: always drawn
    const h = hash2(n, W * 17 + Hh, 22), s = (h >>> 3) % 4, d = 0.9 + ((h % 100) / 100) * 4.5, along = ((h >>> 10) % 1000) / 1000 * 1.3 - 0.15;
    const [px, pz] = s === 0 ? [along * W, Hh + d] : s === 1 ? [along * W, -d] : s === 2 ? [W + d, along * Hh] : [-d, along * Hh];
    lowShape(low, B.low, px, pz, d, h, tint, C);
  }
  return { ground, low, groups };
}
function lowShape(mb, id, x, z, d, h, tint, C) {
  const s = 0.09 + ((h >>> 6) % 22) / 100, y0 = G.base;
  if (id === 'bush') { mb.cyl(x, y0, z, s * 1.4, s * 1.1, tint('k', d, 0.4), { seg: 6, r1: s * 0.3, ao: 0 }); }
  else if (id === 'cube') { mb.bevelBox(x - s, y0, z - s, x + s, y0 + s * 1.6, z + s, 0.04, rampRGB(['1', 'i', 'h']), { ao: 0 }); }
  else mb.bevelBox(x - s, y0, z - s * 0.8, x + s, y0 + s * (0.7 + ((h >>> 12) % 10) / 12), z + s * 0.8, 0.05, tint(id === 'rubble' ? '2' : '6', d, 0.4), { ao: 0 });
}
function shape(mb, id, x, z, d, k, h, B, tint, C) {
  const y0 = G.base;
  switch (id) {
    case 'mesa': { const w = 2 + k * 3, dp = 1.5 + k * 2, ht = 1.6 + k * 2.4; mb.bevelBox(x - w, y0, z - dp, x + w, y0 + ht, z + dp, 0.15, tint(B.base, d), { top: tint('7', d) }); mb.bevelBox(x - w * 0.45, y0 + ht - 0.1, z - dp * 0.5, x + w * 0.45, y0 + ht + 0.7 * k, z + dp * 0.5, 0.1, tint(B.base, d, 0.6), { top: tint('7', d) }); break; }
    case 'spire': mb.cyl(x, y0, z, 2.6 + k * 3.5, 0.9 + k * 0.9, tint('6', d, 0.55), { seg: 5, r1: 0.12, ao: 0 }); break;
    case 'pylon': mb.box(x - 0.1, y0, z - 0.1, x + 0.1, y0 + 4.5, z + 0.1, tint('1', d, 0.5), { ao: 0 }); mb.box(x - 0.8, y0 + 3.6, z - 0.05, x + 0.8, y0 + 3.7, z + 0.05, tint('1', d, 0.5), { ao: 0 }); break;
    case 'tree': case 'bigtree': case 'deadtree': {
      const sc = id === 'bigtree' ? 1.5 : 1, ht = (2.2 + k * 2.4) * sc, tr = 0.14 * sc;
      mb.cyl(x, y0, z, ht * 0.5, tr, tint('6', d, 0.5), { seg: 5, ao: 0 });
      if (id === 'deadtree') { mb.cyl(x, y0 + ht * 0.4, z, ht * 0.4, 0.1, tint('6', d, 0.5), { seg: 4, r1: 0.02, ao: 0, axis: 'x' }); break; }
      for (let l = 0; l < 3; l++) mb.cyl(x, y0 + ht * (0.3 + l * 0.22), z, ht * 0.38, (0.95 - l * 0.22) * sc, tint(l % 2 ? 'k' : 'l', d, 0.6), { seg: 6, r1: 0.05, ao: 0, rot: l });
      break;
    }
    case 'pine': for (let l = 0; l < 3; l++) mb.cyl(x, y0 + 0.5 + l * 0.8, z, 1.1, 0.8 - l * 0.2, tint(l === 2 ? '3' : 'k', d, 0.5), { seg: 6, r1: 0.05, ao: 0 }); break;
    case 'mountain': { const r = 3.5 + k * 3.5, ht = 4 + k * 5; mb.cyl(x, y0, z, ht, r, tint('2', d, 0.55), { seg: 5, r1: 0.3, ao: 0, rot: k * 3 }); mb.cyl(x, y0 + ht * 0.62, z, ht * 0.38, r * 0.38, tint('4', d, 0.5), { seg: 5, r1: 0.25, ao: 0, rot: k * 3 }); break; }
    case 'tower': {
      const w = 0.7 + k * 0.9, dp = 0.7 + ((h >>> 9) % 10) / 14, ht = 3.5 + k * 6;
      const col = tint('1', d, 0.45);
      mb.bevelBox(x - w, y0, z - dp, x + w, y0 + ht, z + dp, 0.06, col, { top: tint('2', d, 0.45) });
      if ((h >>> 4) % 2) mb.bevelBox(x - w * 0.5, y0 + ht - 0.1, z - dp, x + w * 0.9, y0 + ht + 0.6 + k, z + dp * 0.6, 0.05, col, { top: tint('2', d, 0.45) });
      for (let n = 0; n < 5; n++) { // lit windows on the 4 faces (sparse)
        const hh = hash2(n, h % 977, 23), v = 0.8 + (hh % 100) / 100 * (ht - 1.6), a = ((hh >>> 8) % 100) / 100;
        if (hh % 3) continue;
        const wc = rampRGB(['a', 'a', 'a']);
        mb.quad([x - w + a * 2 * w, y0 + v, z + dp + 0.01], [x - w + a * 2 * w + 0.18, y0 + v, z + dp + 0.01], [x - w + a * 2 * w + 0.18, y0 + v + 0.22, z + dp + 0.01], [x - w + a * 2 * w, y0 + v + 0.22, z + dp + 0.01], wc, { inside: [x, y0 + v, z], glow: true });
        mb.quad([x + w + 0.01, y0 + v, z - dp + a * 2 * dp], [x + w + 0.01, y0 + v, z - dp + a * 2 * dp + 0.18], [x + w + 0.01, y0 + v + 0.22, z - dp + a * 2 * dp + 0.18], [x + w + 0.01, y0 + v + 0.22, z - dp + a * 2 * dp], wc, { inside: [x, y0 + v, z], glow: true });
      }
      break;
    }
    case 'crane': { const c = tint('2', d, 0.5); mb.box(x - 0.12, y0, z - 0.12, x + 0.12, y0 + 6, z + 0.12, c, { ao: 0 }); mb.box(x - 2.8, y0 + 5.8, z - 0.1, x + 1.2, y0 + 6, z + 0.1, c, { ao: 0 }); mb.box(x + 0.9, y0 + 5.2, z - 0.1, x + 1.0, y0 + 5.8, z + 0.1, c, { ao: 0 }); break; }
    case 'stack': { const n = 1 + (h % 3); for (let j = 0; j < n; j++) mb.bevelBox(x - 1.1, y0 + j * 0.8, z - 0.5, x + 1.1, y0 + (j + 1) * 0.8, z + 0.5, 0.04, tint(['7', 'g', '6', '3'][(h >>> (j + 3)) % 4], d, 0.45), { top: tint('2', d, 0.45), ao: 0 }); break; }
    case 'chimney': mb.cyl(x, y0, z, 6 + k * 3, 0.55, tint('3', d, 0.5), { seg: 8, r1: 0.42, ao: 0 }); mb.cyl(x, y0 + 6 + k * 3 - 0.05, z, 0.22, 0.5, tint('6', d, 0.5), { seg: 8, ao: 0 }); break;
    case 'tank': mb.cyl(x, y0, z, 2 + k * 1.5, 1.2 + k * 0.6, tint('3', d, 0.5), { seg: 10, ao: 0 }); break;
    case 'hall': { const w = 2 + k * 2.5, ht = 1.8 + k * 1.8; mb.bevelBox(x - w, y0, z - 1.4, x + w, y0 + ht, z + 1.4, 0.06, tint('2', d, 0.45), { top: tint('3', d, 0.45), ao: 0 }); break; }
    case 'pillar': mb.bevelBox(x - 0.5, y0, z - 0.5, x + 0.5, y0 + 4 + k * 3, z + 0.5, 0.05, tint('2', d, 0.4), { top: tint('3', d, 0.4), ao: 0 }); mb.box(x - 0.52, y0 + 2 + k, z - 0.52, x + 0.52, y0 + 2.12 + k, z + 0.52, rampRGB(['i', 'i', 'h']), { glow: true, ao: 0 }); break;
    case 'monolith': {
      const w = 0.4 + k * 0.5, ht = 3 + k * 6, yb = y0 + (h % 3 === 0 ? 0.8 + k : 0);
      mb.bevelBox(x - w, yb, z - w * 0.6, x + w, yb + ht, z + w * 0.6, 0.04, tint('1', d, 0.3), { top: tint('i', d, 0.3), ao: 0 });
      const gl = rampRGB(['i', h % 4 === 0 ? 'n' : 'h', h % 4 === 0 ? 'n' : 'h']), dm = lerp3(K('i'), K('0'), Math.min(0.6, d / 30));
      for (const sd of [1, -1]) { mb.quad([x - w * 0.3, yb + 0.1, z + sd * (w * 0.6 + 0.012)], [x + w * 0.3, yb + 0.1, z + sd * (w * 0.6 + 0.012)], [x + w * 0.3, yb + ht - 0.2, z + sd * (w * 0.6 + 0.012)], [x - w * 0.3, yb + ht - 0.2, z + sd * (w * 0.6 + 0.012)], flat(lerp3(dm, K('h'), 0.35)), { inside: [x, yb + 1, z], glow: true }); }
      void gl; break;
    }
    case 'shard': mb.cyl(x, y0 + 0.5 + k * 2, z, 1.2 + k, 0.35, rampRGB(['i', 'h', 'h']), { seg: 4, r1: 0.02, glow: true, ao: 0 }); break;
    default:
  }
}

// ---------------------------------------------------------------- lights (glow pools) and ambient particles
const COLD = ['server', 'hologram-pillar', 'data-pylon', 'glitch-cube', 'kiosk'];
/** Static light sources of a world: lamps / fires / screens as {x, z, y, warm, ph, r}. */
export function lampsOf(Wd, b) {
  const out = [], LP = E.light;
  const add = (cx, cz, warm, big) => out.push({ x: cx, z: cz, y: Wd.floor[Math.max(0, Math.min(Wd.h - 1, Math.floor(cz))) * Wd.w + Math.max(0, Math.min(Wd.w - 1, Math.floor(cx)))] || 0, warm, ph: rnd(cx * 3 | 0, cz * 3 | 0, 31), r: warm ? LP.rWarm * (big || 1) : LP.rCold });
  for (const p of Wd.props) { if (!(LP.props.includes(p.id))) continue; add(p.x + (p.w || 1) / 2, p.y + 0.5, !COLD.includes(p.id), p.id === 'campfire' ? 1.2 : 1); }
  for (let i = 0; i < Wd.kind.length; i++) if (Wd.kind[i] === 'fire') add((i % Wd.w) + 0.5, ((i / Wd.w) | 0) + 0.5, true, 0.9);
  for (const o of Wd.objs) if (o.glow) add(o.x + 0.5, o.y + 0.5, o.glow === 'warm', o.glow === 'warm' ? 1.1 : 1);
  return out.slice(0, 40);
}
const byDist = (cx, cz) => (a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2);
/** Soft glow pools of the nearest lights into the overlay (≤ E.light.max, no shadows, flicker < 1 Hz); returns the count. */
export function lampGlow(Wd, cam, tt, prefs, ob, night) {
  if (prefs.reduceFx || !Wd.lamps?.length) return 0;
  const LP = E.light, list = [...Wd.lamps].sort(byDist(cam.cx, cam.cz)).slice(0, LP.max);
  const warmC = K(LP.warm), coldC = K(LP.cold), hotC = K(LP.hot);
  for (const l of list) {
    const t = prefs.reduceMotion ? 0 : tt;
    const fl = prefs.reduceMotion ? 1 : 1 + LP.flick * (0.6 * Math.sin(TAU * (0.7 * t + l.ph)) + 0.4 * Math.sin(TAU * (0.93 * t + l.ph * 2.3)));
    const a = (night ? LP.aNight : LP.aDay) * fl, c = l.warm ? warmC : coldC, y = l.y + G.overlay + 0.003, r = l.r * (0.96 + 0.04 * fl);
    ob.blob(l.x, l.z, y, r, r, [c[0], c[1], c[2], a], 20);
    ob.blob(l.x, l.z, y + 0.001, r * 0.42, r * 0.42, [(l.warm ? hotC : c)[0], (l.warm ? hotC : c)[1], (l.warm ? hotC : c)[2], a * 0.9], 16);
  }
  return list.length;
}

const frac = (v) => v - Math.floor(v);
const AMB = {
  wasteland: [{ n: 26, c: 'm', a: 0.3, s: 0.034, rise: 0.02, drift: [0.5, 0.1], top: 2.2, sway: 0.35 }],
  swamp: [{ n: 22, c: 'j', a: 0.6, s: 0.032, rise: 0.08, drift: [0.06, 0.03], top: 1.8, sway: 0.5, glow: true, blink: 0.4 }],
  snow: [{ n: 18, c: '5', a: 0.5, s: 0.028, rise: -0.15, drift: [0.3, 0.1], top: 3, sway: 0.3 }],
  'ruins-city': [{ n: 26, c: '3', a: 0.42, s: 0.03, rise: -0.14, drift: [0.35, 0.1], top: 3.4, sway: 0.25 }],
  'bunker-interior': [{ n: 18, c: '4', a: 0.26, s: 0.026, rise: 0.02, drift: [0.05, 0.03], top: 2.4, sway: 0.18 }],
  factory: [{ n: 16, c: '3', a: 0.4, s: 0.03, rise: -0.1, drift: [0.4, 0.1], top: 3.2, sway: 0.25 }, { n: 8, c: 'e', a: 0.75, s: 0.03, rise: 0.55, drift: [0.15, 0.05], top: 3.2, sway: 0.25, glow: true }],
  port: [{ n: 16, c: '5', a: 0.2, s: 0.04, rise: 0.03, drift: [0.6, 0.2], top: 2.2, sway: 0.4 }],
  'mutant-forest': [{ n: 24, c: 'j', a: 0.65, s: 0.032, rise: 0.12, drift: [0.1, 0.05], top: 2.6, sway: 0.5, glow: true, blink: 0.35 }, { n: 6, c: 'n', a: 0.6, s: 0.03, rise: 0.1, drift: [0.1, 0.05], top: 2.6, sway: 0.5, glow: true, blink: 0.5 }],
  cyberspace: [{ n: 26, c: 'h', a: 0.75, s: 0.028, rise: 0.5, drift: [0, 0], top: 3.4, sway: 0.1, glow: true, blink: 0.9 }, { n: 6, c: 'n', a: 0.7, s: 0.03, rise: 0.4, drift: [0, 0], top: 3, sway: 0.1, glow: true, blink: 0.6 }],
};
/** Rare particles of the biome air (dust / ash / spores / embers / digital sparks), ≤ E.ambientMax; tt — quantised time. */
export function ambientFx(V, biome, tt, prefs, P, emit) {
  if (prefs.reduceFx) return 0;
  const set = AMB[biome];
  if (!set) return 0;
  const cam = V.cam, Wd = V.world;
  const R = 12, cx = cam.cx, cz = cam.cz;
  const wrap = (v, c) => c - R + ((((v - (c - R)) % (2 * R)) + 2 * R) % (2 * R));
  const t = prefs.reduceMotion ? 0 : tt;
  let used = 0;
  for (const S of set) {
    const col = K(S.c);
    for (let i = 0; i < S.n && used < E.ambientMax; i++, used++) {
      const hx = rnd(i, S.n, 41), hz = rnd(i, S.n, 42), hp = rnd(i, S.n, 43), hs = 0.6 + 0.8 * rnd(i, S.n, 44);
      const life = S.top / Math.max(0.05, Math.abs(S.rise)), ph = frac(hp + (t * hs) / (S.rise ? life : 20));
      const y = S.rise < 0 ? S.top - S.top * ph : S.rise > 0 ? S.top * ph : 0.3 + hp * S.top;
      const sw = Math.sin(TAU * (0.08 * t * hs + hp)) * S.sway;
      const x = wrap(hx * 2 * R + t * S.drift[0] * hs + sw, cx), z = wrap(hz * 2 * R + t * S.drift[1] * hs + sw * 0.6, cz);
      if (x < 0 || z < 0 || x > Wd.w || z > Wd.h) continue;
      const fade = S.rise ? Math.min(1, ph * 6, (1 - ph) * 4) : 1;
      const bl = S.blink ? 0.55 + 0.45 * Math.sin(TAU * (S.blink * t * 0.9 + hp * 5)) : 1;
      const yf = Wd.floor[Math.max(0, Math.min(Wd.h - 1, z | 0)) * Wd.w + Math.max(0, Math.min(Wd.w - 1, x | 0))] || 0;
      emit(P, x, yf + 0.15 + y, z, S.s, col, S.a * fade * bl, S.glow ? 1 : 0);
    }
  }
  return used;
}
