// 3D battlefield renderer numbers (docs/specs/3d.md). Geometry in metres: 1 cell = 1 m, one `elev` level = 0.5 m.
// Colours are palette keys (docs/STYLE.md) only.
export const GFX = {
  storageKey: 'dnd.gfx',
  // defaults of the settings window (ui/settings-ui.js); brightness 0.8–1.2
  defaults: { mode: 'auto', reduceFx: false, reduceMotion: false, brightness: 1, shadows: 'high', highlight: 'always', physics: 'normal' },
  // shadow map of 1 directional light (§3): texture size by quality; «Снизить эффекты» = off
  shadow: { size: { high: 1024, low: 512 }, levels: ['high', 'low', 'off'], strength: 0.8, bias: 0.0025, pad: 1.5, dir: [-0.55, 1.5, 0.3] },
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
    // zoom levels: 0 — the whole map fits the area; 1 (default) — the floor diamond takes `widthFill` of the area width
    // (corners may leave the screen: the camera leans to the active unit); 2 — level 1 x `closer`
    widthFill: 0.85, closer: 1.4,
    zoomDefault: 1, follow: 6, // 1/s, camera centre lerp
    // stage 3: pan — drag with the middle / right button (right: after dragMin px, a right click stays a click), arrows px/s
    dragMin: 6, panSpeed: 720,
    maxDt: 0.25, // s per drawn frame for camera / animation tweens (= main loop cap: slow frames keep real-time tweens)
  },
  light: {
    // direction in camera space: left, up, towards the camera -> top faces get the base tone, left faces light, right shadow
    dir: [-0.75, 0.55, 0.35], steps: [0.62, 0.22], ao: 0.55,
    fog: { near: 2, far: 22, max: 0.32, visMul: 0.06 },
    // max — point lights per frame (shader limit 8); warm / warmAmt — static warm pool of the lights (palette key, strength)
    night: { amount: 0.62, dusk: 0.25, radiusMul: 1.2, max: 8, warm: 'a', warmAmt: 0.36 },
  },
  // anime toon shading of units (gfx/gl.js SKIN_FS): soft band edge, rim strength, shadow hue-shift amount, outline darkness
  toon: { soft: 0.07, rimK: 0.55, rim2: 0.3, hue: 0.2, outline: 0.62, shadeHue: 'o', rim: '4', rust: '8' },
  unit: { scale: 1.2, scaleAnime: 1.05, outlinePx: 1.5, outlineTargetPx: 2.4, r: 0.26, body: 0.95, head: 0.26, ring: [0.36, 0.46], hull: 1.07, xray: 0.3, headScale: 0.27, lerpH: 10, bossScale: 1.3, grow: 0.022, growTarget: 0.035 },
  // enemy silhouettes (gfx/units3d.js): first rule that matches the enemy id (regexp) or tag wins; else humanoid
  bodies: [
    { re: 'spirit|hologram|cyber-demon|soul|scriptlet|ghost|glitch', tag: 'digital', type: 'spirit' },
    { re: 'drone|turret|sprayer|beacon|hive-node|mech-node|lis-drone|lis-5|lis-2|sentry|battery', type: 'drone' },
    { re: 'junk-mech|kuznechik|golem|harvester|great-mech|matyorny|mech-pilot|assimilator|loader|vibe-burner|sputnik|armory', tag: 'mech', type: 'mech' },
    { re: 'wolf|beast|crawler|panther|spider|biomass|(^|-)rat($|-)|(^|-)dog($|-)|lis-4|lis-9|lis-1', tag: 'beast', type: 'beast' },
    { tag: 'mechanical', type: 'robot' },
  ],
  hover: ['drone', 'sprayer', 'lis-drone', 'scout', 'beacon'], // drones that float (turrets / nodes stand)
  // humanoid proportions by race: w — width, limb — limb thickness, h — height; extras on the head / shoulders
  races: {
    human: {}, skeleton: { limb: 0.7, w: 0.9, bone: true }, android: { limb: 0.85, robot: true }, 'mutant-beast': { w: 1.2, limb: 1.25, h: 1.05, ears: true },
    'mutant-plant': { leaves: true, limb: 1.1 }, tekhonok: { h: 0.86, w: 1.05, antenna: true }, cringegon: { h: 1.08, w: 0.9, limb: 0.85, horns: true },
    skrilet: { spikes: true, limb: 0.95 }, 'cyber-spirit': { spirit: true },
  },
  // class kit on the back / shoulders
  classes: {
    zabivnoy: 'pads', ranger: 'pack', technomant: 'antenna', slavotech: 'pack', cybertech: 'tank', arbiter: 'cape',
    itishnik: 'pack', reper: 'pads', ugolovnik: 'none', ecolog: 'tank', mutant: 'spikes',
  },
  // procedural animation (gfx/anim.js); seconds / radians; nothing repeats faster than 2 Hz (§7)
  anim: {
    breathHz: 0.28, breath: 0.012, walkStride: 1.15, walkSwing: 0.55, walkBob: 0.03, bobHz: 0.35,
    swing: 0.62, shoot: 0.5, cast: 0.8, throw: 0.62, hit: 0.38, death: 0.55, use: 0.45,
    hitTilt: 0.32, hitPush: 0.08, lunge: 0.16, recoil: 0.12, launch: { shoot: 0.24, throw: 0.3, cast: 0.45 },
    boltSpeed: 22, throwSpeed: 9, castSpeed: 10, // m/s
    reduce: 0.5, // «Снизить движение»: amplitude of hit / lunge / recoil
  },
  // effects of surfaces and actions (gfx/fx3d.js): low frequency, no flicker over 2 Hz
  fx: {
    flameHz: 0.8, bubbleT: 1.6, puffT: 6.5, shineT: 3.2, arcHz: 0.6, emberT: 1.7, maxParticles: 900,
    flash: 0.2, spark: 0.35, ring: 0.6, puff: 0.9, boltLen: 0.35,
    color: { bolt: 'b', flash: 'b', spark: 'a', cast: 'n', heal: 'j', throw: '5', debris: '3' },
  },
  // stage 3: weather particles (gfx/fx3d.js weatherFx) around the camera centre; «Снизить эффекты» — none.
  // Low frequency, thin and translucent: rain — slanted streaks + a slow wet sheen on the floor; snow / blizzard — flakes;
  // fog — a few slow flat banks (the depth fog itself is in the shader)
  weather: {
    radius: 14, // m around the camera centre (scaled with the visible area, clamped to [8, 22])
    rain: { n: 170, speed: 7.5, len: 13, size: 0.02, slant: 0.18, color: 'f', alpha: 0.42, top: 6, sheen: 0.25, sheenColor: 'f', sheenAlpha: 0.16, sheenHz: 0.12 },
    snow: { n: 130, speed: 0.75, size: 0.035, sway: 0.35, swayHz: 0.09, color: '5', alpha: 0.55, top: 5, wind: 0.25 },
    blizzard: { n: 170, speed: 1.4, size: 0.032, sway: 0.25, swayHz: 0.12, color: '5', alpha: 0.5, top: 5, wind: 2.2 },
    fog: { n: 14, size: 1.6, speed: 0.18, color: '4', alpha: 0.08, flat: 0.22 },
  },
  // stage 3: free node map in 3D (gfx/roam3d.js): lower walls (rooms stay readable), camera area, NPC / object tones
  roam: {
    wall: 1.25, zoomDefault: 2, // whole map at 0; 1 — floor fills the width; 2 — closer (follows the leader)
    npc: 'b', guard: 'a', hunter: 'c', other: 'h', // ring / outline palette keys
    lightR: { fire: 3.5, lamp: 3, party: 2.5 }, // night point lights (cells)
    cone: { fill: 0.16, hot: 0.26, edge: 0.45 },
  },
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
