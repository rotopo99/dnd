// 3D battlefield renderer numbers (docs/specs/3d.md). Geometry in metres: 1 cell = 1 m, one `elev` level = 0.5 m.
// Colours are palette keys (docs/STYLE.md) only.
export const GFX = {
  storageKey: 'dnd.gfx',
  // defaults of the settings window (ui/settings-ui.js); brightness 0.8–1.2
  defaults: { mode: 'auto', reduceFx: false, reduceMotion: false, brightness: 1 },
  brightness: { min: 0.8, max: 1.2, step: 0.1 },
  maxPixel: 0.9, // §7: brightest pixel of the world <= 90 %
  lostTimeout: 2, // s without `webglcontextrestored` -> 2D
  idleFps: 15, // render on demand: nothing moves -> redraw at 15 fps
  chunk: 8, // static world chunks 8x8 cells
  hlAlpha: 1.7, // 2D highlight fills are made for flat tiles: x alpha on the shaded 3D floor

  geo: {
    elev: 0.5, wall: 1.6, cut: 0.3, block: 1.6, fence: 1.2, full: 1.1, half: 0.55, water: -0.15, base: -0.35,
    bevel: 0.08, rubble: [3, 5], hazard: 0.03, overlay: 0.012, pathDot: 0.12, border: 0.06,
  },
  camera: {
    pitch: 35.26, yaw: 45, tween: 0.25, // s, ease in-out; «Снизить движение» — no tween
    zoom: [1, 1.35, 1.8], // x «fit the map into the area»
    zoomDefault: 0, follow: 6, // 1/s, camera centre lerp
  },
  light: {
    // direction in camera space: left, up, towards the camera -> top faces get the base tone, left faces light, right shadow
    dir: [-0.75, 0.55, 0.35], steps: [0.62, 0.22], ao: 0.55,
    fog: { near: 2, far: 22, max: 0.32, visMul: 0.06 },
    night: { amount: 0.55, dusk: 0.25, radiusMul: 1 },
  },
  unit: { scale: 1.2, r: 0.26, body: 0.95, head: 0.26, ring: [0.36, 0.46], hull: 1.07, xray: 0.3, headScale: 0.24, lerpH: 10 },
  // palette ramps [shadow, base, light] for materials without a biome ramp
  ramps: {
    '0': ['0', '0', '1'], '1': ['0', '1', '2'], '2': ['1', '2', '3'], '3': ['2', '3', '4'], '4': ['3', '4', '5'], '5': ['4', '5', '5'],
    '6': ['1', '6', '7'], '7': ['6', '7', '8'], '8': ['7', '8', '9'], '9': ['8', '9', 'p'], a: ['8', 'a', 'b'], b: ['a', 'b', 'b'],
    c: ['d', 'c', '8'], d: ['6', 'd', 'c'], e: ['c', 'e', 'a'], f: ['g', 'f', 'h'], g: ['1', 'g', 'f'], h: ['i', 'h', 'h'],
    i: ['1', 'i', 'h'], j: ['k', 'j', 'j'], k: ['1', 'k', 'l'], l: ['k', 'l', 'm'], m: ['l', 'm', 'p'], n: ['o', 'n', 'p'],
    o: ['1', 'o', 'n'], p: ['m', 'p', '5'],
  },
  sky: { default: '0', night: '0', cyberspace: '0', snow: '1' }, // background (no white skies)
  fogColor: { default: '1', snow: '3', swamp: 'k', 'mutant-forest': 'k', cyberspace: 'i', port: 'g' },
  team: { player: 'h', ally: 'j', enemy: 'c', rival: 'a' },
};
