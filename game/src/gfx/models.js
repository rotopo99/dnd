// Procedural models of the 3D battlefield (docs/specs/3d.md §2, stage 1): props of assets/props.js by type
// (car / barrel / wagon / container / crate / generator / shelf / block ..., the rest — a box of the prop's colour and
// height). Units — gfx/units3d.js.
//   ramp(key)                     -> rgb ramp of a palette key (GFX.ramps)
//   propColors(id)                -> [main, second] palette keys (most common colours of the prop sprite)
//   propModel(id)                 -> MeshBuilder in footprint space (0..w × 0..h cells, y up from the floor), cached
//   propTop(id)                   -> height (m) used for picking / cover readability
import { GFX } from '../data/gfx.js';
import { PROPS, propGrid } from '../assets/props.js';
import { MeshBuilder, rampRGB } from './mesh.js';

const rampCache = new Map();
export function ramp(k) {
  let r = rampCache.get(k);
  if (!r) { r = rampRGB(GFX.ramps[k] || GFX.ramps['3']); rampCache.set(k, r); }
  return r;
}
const glowR = (k) => rampRGB([k, k, k]);

const colorMemo = new Map();
export function propColors(id) {
  let c = colorMemo.get(id);
  if (c) return c;
  const n = {};
  for (const r of propGrid(id)) for (const ch of r) if (ch !== '.' && ch !== '0') n[ch] = (n[ch] || 0) + 1;
  const keys = Object.keys(n).sort((a, b) => n[b] - n[a]);
  c = [keys[0] || '3', keys[1] || keys[0] || '2'];
  colorMemo.set(id, c);
  return c;
}

// heights (m) by prop id; props not listed: half cover 0.6, full cover 1.2, else 0.5 (+ height levels / rise)
const H = {
  lada: 0.9, moskvich: 0.9, bus: 1.7, kamaz: 1.6, barrel: 0.8, 'barrel-toxic': 0.8, crate: 0.6, 'crate-stack': 1.2, fence: 1.2,
  'concrete-block': 1.1, sandbags: 0.6, tower: 2.8, wagon: 1.7, container: 1.5, 'container-red': 1.5, transformer: 1.3, garages: 1.5,
  campfire: 0.3, tent: 1.0, 'monument-stump': 1.4, kiosk: 1.4, heatpipe: 0.65, buoy: 0.7, bollard: 0.5, server: 1.4, 'glitch-cube': 1.1,
  'tire-pile': 0.55, 'dead-tree': 2.2, lamp: 2.4, bench: 0.45, slab: 0.7, generator: 0.7, dumpster: 0.8, 'ice-block': 1.1, antenna: 3.2,
  rowboat: 0.45, 'hologram-pillar': 1.3, 'data-pylon': 1.6, 'pallet-stack': 0.6, trench: 0.02, bridge: 0.15,
};
export function propTop(id) {
  const p = PROPS[id];
  if (!p) return 0;
  return H[id] ?? (p.cover === 'full' ? 1.2 : p.cover === 'half' ? 0.6 : 0.5);
}

const cache = new Map();
export function propModel(id) {
  let mb = cache.get(id);
  if (mb) return mb;
  mb = new MeshBuilder();
  const p = PROPS[id] || { w: 1, h: 1 };
  const W = p.w || 1, D = p.h || 1, top = propTop(id);
  const [k1, k2] = propColors(id);
  const A = ramp(k1), B = ramp(k2), dark = ramp('1'), steel = ramp('3');
  const m = 0.08; // inset from the footprint edge
  const wheels = (n, r = 0.17) => {
    for (let i = 0; i < n; i++) {
      const x = m + 0.3 + ((W - 2 * m - 0.6) * i) / Math.max(1, n - 1);
      mb.cyl(x, r, m + 0.02, 0.12, r, dark, { axis: 'z', seg: 8 });
      mb.cyl(x, r, D - m - 0.14, 0.12, r, dark, { axis: 'z', seg: 8 });
    }
  };
  switch (id) {
    case 'lada': case 'moskvich': case 'rowboat':
      if (id === 'rowboat') { mb.box(m, 0, 0.2, W - m, top, D - 0.2, A); mb.box(m + 0.15, top - 0.05, 0.3, W - m - 0.15, top, D - 0.3, dark); break; }
      mb.box(m, 0.15, 0.14, W - m, 0.55, D - 0.14, A, { ao: 0.2 });
      mb.box(W * 0.3, 0.55, 0.2, W * 0.75, top, D - 0.2, A, { top: B });
      mb.box(W * 0.31, 0.6, 0.18, W * 0.74, top - 0.06, D - 0.18, glowR('i'));
      wheels(2);
      break;
    case 'bus': case 'wagon': case 'container': case 'container-red': case 'garages': case 'kamaz': {
      if (id === 'kamaz') {
        mb.box(m, 0.3, 0.12, W * 0.42, top, D - 0.12, A, { top: B });
        mb.box(m + 0.02, top - 0.55, 0.1, m + 0.04, top - 0.15, D - 0.1, glowR('i'));
        mb.box(W * 0.42, 0.3, 0.16, W - m, 0.75, D - 0.16, steel);
        wheels(2, 0.25);
        break;
      }
      const y0 = id === 'bus' || id === 'wagon' ? 0.25 : 0;
      mb.bevelBox(m, y0, 0.1, W - m, top, D - 0.1, 0.06, A, { top: B });
      if (id === 'bus') mb.box(m + 0.1, top - 0.6, 0.08, W - m - 0.1, top - 0.25, D - 0.08, glowR('i'));
      if (id === 'container' || id === 'container-red' || id === 'wagon') {
        for (let x = m + 0.25; x < W - m - 0.1; x += 0.35) { mb.box(x, y0 + 0.05, 0.06, x + 0.06, top - 0.08, 0.1, B); mb.box(x, y0 + 0.05, D - 0.1, x + 0.06, top - 0.08, D - 0.06, B); }
      }
      if (id === 'garages') for (let i = 0; i < W; i++) mb.box(i + 0.15, 0, D - 0.12, i + 0.85, top - 0.35, D - 0.08, B);
      if (y0) wheels(id === 'wagon' ? 3 : 2, 0.2);
      break;
    }
    case 'barrel': case 'barrel-toxic': case 'buoy': case 'bollard':
      mb.cyl(W / 2, 0, D / 2, top, id === 'bollard' ? 0.2 : 0.3, A, { seg: 10, cap: B });
      if (id !== 'bollard') for (const y of [0.22, top - 0.2]) mb.cyl(W / 2, y, D / 2, 0.05, 0.315, B, { seg: 10 });
      if (id === 'barrel-toxic') mb.cyl(W / 2, top, D / 2, 0.02, 0.18, glowR('j'), { seg: 10, glow: true });
      break;
    case 'tire-pile':
      for (let i = 0; i < 3; i++) mb.cyl(W / 2 + (i % 2) * 0.05, i * 0.17, D / 2, 0.16, 0.34 - i * 0.03, dark, { seg: 10, cap: ramp('0') });
      break;
    case 'crate': case 'crate-stack': case 'pallet-stack': case 'dumpster': {
      if (id === 'crate-stack') { mb.box(0.1, 0, 0.1, 0.9, 0.6, 0.9, A, { top: B }); mb.box(0.18, 0.6, 0.15, 0.85, top, 0.82, A, { top: B, ao: 0.3 }); break; }
      if (id === 'pallet-stack') { for (let i = 0; i < 4; i++) mb.box(0.1, i * 0.15, 0.1, 0.9, i * 0.15 + 0.11, 0.9, i % 2 ? B : A); break; }
      mb.box(0.12, 0, 0.12, W - 0.12, top, D - 0.12, A, { top: B });
      if (id === 'crate') { mb.box(0.1, 0.25, 0.1, W - 0.1, 0.33, D - 0.1, B); }
      break;
    }
    case 'generator':
      mb.box(0.12, 0, 0.18, 0.88, top - 0.15, 0.82, A, { top: B });
      mb.cyl(0.3, top - 0.15, 0.5, 0.15, 0.06, steel, { seg: 6 });
      mb.box(0.6, top - 0.15, 0.3, 0.8, top - 0.1, 0.45, glowR('a'), { glow: true });
      break;
    case 'server': case 'transformer': case 'kiosk':
      mb.bevelBox(0.14, 0, 0.14, 0.86, top, 0.86, 0.05, A, { top: B });
      if (id === 'server') for (let y = 0.3; y < top - 0.1; y += 0.25) mb.box(0.2, y, 0.86, 0.8, y + 0.04, 0.88, glowR('h'), { glow: true });
      if (id === 'kiosk') mb.box(0.2, 0.6, 0.86, 0.8, 1.05, 0.88, glowR('i'));
      if (id === 'transformer') mb.box(0.4, 0.6, 0.86, 0.6, 0.85, 0.88, glowR('a'), { glow: true });
      break;
    case 'concrete-block': case 'slab': case 'monument-stump': case 'ice-block':
      if (id === 'monument-stump') { mb.box(0.15, 0, 0.15, 0.85, 0.35, 0.85, B); mb.bevelBox(0.3, 0.35, 0.3, 0.7, top, 0.7, 0.06, A); break; }
      mb.bevelBox(0.1, 0, 0.1, 0.9, top, 0.9, GFX.geo.bevel, A, { top: id === 'ice-block' ? ramp('5') : B });
      break;
    case 'glitch-cube': case 'data-pylon': case 'hologram-pillar':
      if (id === 'hologram-pillar') { mb.cyl(0.5, 0, 0.5, 0.15, 0.3, steel, { seg: 8 }); mb.cyl(0.5, 0.15, 0.5, top - 0.15, 0.18, glowR('h'), { seg: 8, glow: true, r1: 0.12 }); break; }
      mb.box(0.15, 0, 0.15, 0.85, top, 0.85, ramp('i'), { top: glowR(id === 'glitch-cube' ? 'n' : 'h') });
      mb.box(0.13, top * 0.45, 0.13, 0.87, top * 0.45 + 0.06, 0.87, glowR(id === 'glitch-cube' ? 'n' : 'h'), { glow: true });
      break;
    case 'sandbags':
      for (let i = 0; i < 3; i++) mb.bevelBox(0.08, i * 0.2, 0.15 + (i % 2) * 0.04, 0.92, i * 0.2 + 0.2, 0.85 - (i % 2) * 0.04, 0.06, A, { ao: i ? 0.2 : 0.6 });
      break;
    case 'heatpipe':
      for (let x = 0.3; x < W; x += 1) mb.box(x - 0.06, 0, 0.42, x + 0.06, 0.35, 0.58, steel);
      mb.cyl(0.02, 0.45, 0.5, W - 0.04, 0.2, A, { axis: 'x', seg: 8, cap: B });
      break;
    case 'fence':
      for (const x of [0.1, 0.9]) mb.box(x - 0.04, 0, 0.46, x + 0.04, top, 0.54, steel);
      mb.box(0.1, 0.1, 0.49, 0.9, top - 0.05, 0.51, B);
      break;
    case 'tower':
      for (const [x, z] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) mb.box(x - 0.04, 0, z - 0.04, x + 0.04, top - 0.7, z + 0.04, B);
      mb.box(0.05, top - 0.7, 0.05, 0.95, top - 0.6, 0.95, A);
      mb.wedge(0.05, top - 0.15, 0.05, 0.95, top, 0.95, A);
      mb.box(0.1, top - 0.6, 0.1, 0.9, top - 0.15, 0.9, B, { ao: 0.2 });
      break;
    case 'antenna': case 'lamp':
      mb.cyl(0.5, 0, 0.5, top, 0.06, steel, { seg: 6, r1: 0.04 });
      if (id === 'lamp') mb.box(0.5, top - 0.1, 0.42, 0.85, top, 0.58, steel).box(0.7, top - 0.13, 0.44, 0.84, top - 0.1, 0.56, glowR('b'), { glow: true });
      else { mb.box(0.35, top - 0.9, 0.48, 0.65, top - 0.85, 0.52, steel); mb.box(0.47, top - 0.05, 0.47, 0.53, top, 0.53, glowR('c'), { glow: true }); }
      break;
    case 'dead-tree':
      mb.cyl(0.5, 0, 0.5, top * 0.75, 0.13, A, { seg: 6, r1: 0.06 });
      mb.cyl(0.5, top * 0.45, 0.5, 0.7, 0.04, A, { axis: 'x', seg: 5 });
      mb.cyl(0.5, top * 0.62, 0.5, 0.55, 0.035, A, { axis: 'z', seg: 5 });
      break;
    case 'campfire':
      mb.cyl(0.2, 0.06, 0.5, 0.6, 0.06, ramp('7'), { axis: 'x', seg: 5 });
      mb.cyl(0.5, 0.06, 0.2, 0.6, 0.06, ramp('6'), { axis: 'z', seg: 5 });
      mb.cyl(0.5, 0.05, 0.5, 0.3, 0.16, glowR('e'), { seg: 6, r1: 0.02, glow: true });
      break;
    case 'tent':
      mb.wedge(0.1, 0, 0.1, W - 0.1, top, D - 0.1, A);
      break;
    case 'bench':
      mb.box(0.1, 0.25, 0.3, 0.9, 0.32, 0.7, A).box(0.15, 0, 0.35, 0.22, 0.25, 0.65, steel).box(0.78, 0, 0.35, 0.85, 0.25, 0.65, steel).box(0.1, 0.32, 0.64, 0.9, top, 0.7, A);
      break;
    case 'trench':
      mb.box(0.05, -0.02, 0.15, W - 0.05, 0.0, D - 0.15, ramp('1'), { ao: 0 });
      mb.box(0.05, 0, 0.08, W - 0.05, 0.12, 0.15, A).box(0.05, 0, D - 0.15, W - 0.05, 0.12, D - 0.08, A);
      break;
    case 'bridge':
      mb.box(0, 0, 0.12, W, 0.08, D - 0.12, ramp('8'), { ao: 0.2 });
      mb.box(0, 0.08, 0.1, W, 0.5, 0.15, ramp('7')).box(0, 0.08, D - 0.15, W, 0.5, D - 0.1, ramp('7'));
      break;
    default:
      mb.bevelBox(0.1, 0, 0.1, W - 0.1, top, D - 0.1, 0.06, A, { top: B });
  }
  cache.set(id, mb);
  return mb;
}

// ---------------------------------------------------------------- free node map objects (3d.md stage 3, gfx/roam3d.js)
const objCache = new Map();
/**
 * Model of a roam object (world/roam-gen.js MARKERS) in cell space (0..1, y up): stall, bed, stash (closed / opened),
 * bench (workbench), terminal, fire, well, transit, boat. Gates of exits — gfx/roam3d.js (they span the exit cells).
 */
export function roamObjModel(type, variant = '') {
  const key = `${type}|${variant}`;
  let mb = objCache.get(key);
  if (mb) return mb;
  mb = new MeshBuilder();
  const dark = ramp('1'), steel = ramp('3'), wood = ramp('7'), wood2 = ramp('6');
  switch (type) {
    case 'stall':
      mb.box(0.04, 0, 0.3, 0.96, 0.78, 0.92, ramp('8'), { top: ramp('6') });
      mb.box(0.04, 0.6, 0.28, 0.96, 0.66, 0.32, ramp('6'), { ao: 0 });
      for (const x of [0.06, 0.88]) mb.box(x, 0, 0.06, x + 0.06, 1.55, 0.12, wood2);
      mb.wedge(0, 1.5, 0.0, 1, 1.72, 0.7, ramp('c'), { ao: 0 });
      for (const x of [0.18, 0.58]) mb.box(x, 1.505, 0.02, x + 0.2, 1.53, 0.66, ramp('5'), { ao: 0 });
      mb.box(0.2, 0.78, 0.45, 0.4, 0.9, 0.6, ramp('a')).box(0.55, 0.78, 0.5, 0.8, 0.86, 0.75, ramp('j'));
      break;
    case 'bed':
      mb.box(0.12, 0, 0.04, 0.88, 0.28, 0.96, wood2);
      mb.box(0.15, 0.28, 0.08, 0.85, 0.38, 0.93, ramp('g'), { ao: 0.2 });
      mb.box(0.2, 0.38, 0.1, 0.8, 0.46, 0.28, ramp('5'), { ao: 0 });
      mb.box(0.12, 0, 0.0, 0.88, 0.62, 0.06, wood);
      break;
    case 'stash':
      mb.box(0.15, 0, 0.18, 0.85, 0.45, 0.82, wood, { top: ramp('8') });
      mb.box(0.13, 0.2, 0.16, 0.87, 0.26, 0.84, wood2, { ao: 0 });
      if (variant === 'open') { mb.box(0.2, 0.43, 0.24, 0.8, 0.455, 0.76, dark, { ao: 0 }); mb.box(0.15, 0.45, 0.78, 0.85, 0.85, 0.86, wood, { ao: 0.2 }); }
      else { mb.box(0.15, 0.45, 0.18, 0.85, 0.52, 0.82, ramp('8')); mb.box(0.46, 0.3, 0.83, 0.54, 0.4, 0.86, rampRGB(['a', 'a', 'a']), { glow: true, ao: 0 }); }
      break;
    case 'bench': // workbench
      mb.box(0.05, 0.7, 0.15, 0.95, 0.8, 0.85, wood, { top: ramp('8') });
      for (const [x, z] of [[0.08, 0.18], [0.84, 0.18], [0.08, 0.74], [0.84, 0.74]]) mb.box(x, 0, z, x + 0.08, 0.7, z + 0.08, wood2);
      mb.box(0.12, 0.25, 0.2, 0.88, 0.3, 0.8, wood2, { ao: 0.2 });
      mb.box(0.15, 0.8, 0.25, 0.45, 0.95, 0.45, ramp('4')).box(0.6, 0.8, 0.55, 0.75, 1.0, 0.7, steel);
      break;
    case 'terminal':
      mb.bevelBox(0.22, 0, 0.3, 0.78, 1.3, 0.7, 0.05, ramp('2'), { top: steel });
      for (const z of [0.29, 0.69]) mb.box(0.28, 0.75, z, 0.72, 1.15, z + 0.02, rampRGB(['i', 'i', 'i']), { glow: true, ao: 0 });
      mb.box(0.32, 0.55, 0.24, 0.68, 0.6, 0.3, ramp('4'), { ao: 0 });
      break;
    case 'fire':
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; mb.bevelBox(0.5 + Math.cos(a) * 0.36 - 0.07, 0, 0.5 + Math.sin(a) * 0.36 - 0.06, 0.5 + Math.cos(a) * 0.36 + 0.07, 0.12, 0.5 + Math.sin(a) * 0.36 + 0.06, 0.03, ramp('3')); }
      mb.add(propModel('campfire'), 0, 0, 0);
      break;
    case 'well':
      mb.cyl(0.5, 0, 0.5, 0.6, 0.42, ramp('3'), { seg: 10 });
      mb.cyl(0.5, 0.6, 0.5, 0.02, 0.33, dark, { seg: 10 });
      for (const x of [0.1, 0.84]) mb.box(x, 0.6, 0.45, x + 0.06, 1.5, 0.55, wood2);
      mb.wedge(0.02, 1.45, 0.25, 0.98, 1.7, 0.75, ramp('8'));
      mb.cyl(0.1, 1.15, 0.5, 0.8, 0.04, wood, { axis: 'x', seg: 5 });
      break;
    case 'transit':
      mb.cyl(0.5, 0, 0.5, 2.0, 0.05, ramp('6'), { seg: 6 });
      mb.box(0.1, 1.55, 0.46, 0.9, 1.95, 0.54, ramp('b'), { top: ramp('a') });
      mb.box(0.15, 0, 0.3, 0.85, 0.06, 0.7, ramp('7'), { ao: 0 });
      break;
    case 'boat':
      mb.bevelBox(0.05, -0.1, 0.12, 0.95, 0.3, 0.88, 0.08, ramp('7'), { top: ramp('6') });
      mb.box(0.12, 0.25, 0.2, 0.88, 0.3, 0.8, ramp('6'), { ao: 0 });
      mb.cyl(0.45, 0.3, 0.5, 1.5, 0.03, ramp('5'), { seg: 5 });
      mb.wedge(0.47, 0.7, 0.45, 0.85, 1.7, 0.55, ramp('5'), { ao: 0 });
      break;
    // level-design.md: hand-made interactives
    case 'note': // a sheet on a crate / the floor
      if (variant !== 'open') mb.box(0.3, 0, 0.3, 0.7, 0.3, 0.7, wood2, { top: wood });
      mb.box(0.33, variant === 'open' ? 0 : 0.3, 0.36, 0.66, (variant === 'open' ? 0 : 0.3) + 0.02, 0.62, ramp('5'), { ao: 0 });
      break;
    case 'secret': // a loose grate with a glint
      mb.box(0.25, 0, 0.25, 0.75, 0.04, 0.75, steel, { ao: 0 });
      mb.box(0.45, 0.04, 0.45, 0.55, 0.12, 0.55, rampRGB(['n', 'n', 'n']), { glow: true, ao: 0 });
      break;
    case 'lever':
      mb.bevelBox(0.25, 0, 0.3, 0.75, 0.45, 0.7, 0.04, steel, { top: dark });
      if (variant === 'open') mb.box(0.55, 0.45, 0.46, 0.62, 1.05, 0.54, ramp('j'));
      else mb.box(0.38, 0.45, 0.46, 0.45, 1.05, 0.54, ramp('c'));
      break;
    case 'door':
      if (variant === 'open') mb.box(0.0, 0, 0.0, 0.12, 1.9, 0.9, wood2);
      else { mb.box(0.05, 0, 0.38, 0.95, 1.9, 0.62, wood, { top: wood2 }); mb.box(0.75, 0.9, 0.34, 0.85, 1.0, 0.66, ramp('a'), { ao: 0 }); }
      break;
    case 'hatch':
      mb.box(0.08, 0, 0.08, 0.92, 0.06, 0.92, steel, { ao: 0 });
      if (variant === 'open') mb.box(0.18, 0.0, 0.18, 0.82, 0.065, 0.82, dark, { ao: 0 });
      else mb.box(0.15, 0.06, 0.45, 0.85, 0.1, 0.55, wood2, { ao: 0 });
      break;
    default:
      mb.bevelBox(0.2, 0, 0.2, 0.8, 0.5, 0.8, 0.05, steel);
  }
  objCache.set(key, mb);
  return mb;
}
