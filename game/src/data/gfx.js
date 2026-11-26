// 3D battlefield renderer numbers (docs/specs/3d.md). Geometry in metres: 1 cell = 1 m, one `elev` level = 0.5 m.
// Colours are palette keys (docs/STYLE.md) only.
export const GFX = {
  storageKey: 'dnd.gfx',
  // defaults of the settings window (ui/settings-ui.js); brightness 0.8–1.2
  defaults: { mode: 'auto', reduceFx: false, reduceMotion: false, brightness: 1, shadows: 'high', highlight: 'always', physics: 'normal', walls: 'cut', xray: 'hold', metric: 'on', engine: 'three', quality: 'auto', autoQ: null },
  // shadow map of 1 directional light (§3): texture size by quality; «Снизить эффекты» = off
  shadow: { size: { high: 1024, low: 512 }, levels: ['high', 'low', 'off'], strength: 0.8, bias: 0.0025, pad: 1.5, dir: [-0.55, 1.5, 0.3] },
  brightness: { min: 0.8, max: 1.2, step: 0.1 },
  maxPixel: 0.9, // §7: brightest pixel of the world <= 90 %
  lostTimeout: 2, // s without `webglcontextrestored` -> 2D
  idleFps: 15, // render on demand: nothing moves -> redraw at 15 fps
  chunk: 8, // static world chunks 8x8 cells
  meshIdle: 8, // cached model meshes (unit templates / props) kept on the GPU without a live 3D state using them
  soft: { scale: 0.75, idleFps: 6 }, // software GL (SwiftShader / llvmpipe): GL layer resolution (no MSAA), idle refresh — fill rate bound
  // metric-combat.md «Обзор»: walls between the camera and the active unit / cursor (cells in a box cutLen cells long
  // toward the camera, cutW cells half wide) sink to cutH over fade s and get a dark lid (palette `lid`); obstacles in
  // front of the active unit / cursor / target are dithered to seeAlpha within seeR m (screen); X-ray: every obstacle
  // at xrayAlpha. Path line: dash / gap m, width m; budget ring width m; zone fill alpha, range ring alpha.
  view: { cutH: 0.6, cutLen: 2.6, cutW: 1.15, lid: '1', fade: 0.2, seeAlpha: 0.25, seeR: 0.95, xrayAlpha: 0.2, dash: 0.22, gap: 0.14, lineW: 0.07, ringW: 0.05, zoneA: 0.25, rangeA: 0.55 },
  hlAlpha: 1.7, // 2D highlight fills are made for flat tiles: x alpha on the shaded 3D floor

  geo: {
    elev: 0.5, wall: 1.6, cut: 0.3, block: 1.6, fence: 1.2, full: 1.1, half: 0.55, water: -0.15, base: -0.35,
    bevel: 0.08, rubble: [3, 5], hazard: 0.03, overlay: 0.012, pathDot: 0.12, border: 0.06,
  },
  // QA v49 #20: the 3D model in the Снаряжение tab (scenes/panel-gear.js; offset from the panel origin, px), camera as the editor's
  gearModel: { x: 1004, y: 436, w: 252, h: 254, yaw: 22, sway: 14, pitch: 10, zoom: 0.9, focus: 0.9 },
  camera: {
    pitch: 35.26, yaw: 45, tween: 0.25, // s, ease in-out; «Снизить движение» — no tween
    // zoom levels: 0 — the whole map fits the area; 1 (default) — the floor diamond takes `widthFill` of the area width
    // (corners may leave the screen: the camera leans to the active unit); 2 — level 1 x `closer`
    widthFill: 0.85, closer: 1.4,
    zoomDefault: 1, follow: 6, // 1/s, camera centre lerp
    // QA v48 #5: at the hero's turn start — frame hero + nearest foe: margin (m) around both, part of the area they may fill
    frameMargin: 2.5, frameFill: 0.8,
    // QA v48/v49 #4: the turn framing never goes wider than the first zoom level with at least readPpm px per metre
    // (a unit ~60 px tall); big maps get an extra level at readPpm. Wheel zoom still reaches «whole map».
    readPpm: 40,
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
  unit: { scale: 1.2, scaleAnime: 1.05, outlinePx: 1.5, outlineTargetPx: 2.4, r: 0.26, body: 0.95, head: 0.26, ring: [0.36, 0.46], activeRing: { grow: 0.03, gap: 0.04, band: 0.07, bandAlpha: 0.85, halo: 0.16, haloAlpha: 0.3 }, hull: 1.07, xray: 0.3, headScale: 0.27, lerpH: 10, bossScale: 1.3, grow: 0.022, growTarget: 0.035 },
  // enemy silhouettes (gfx/units3d.js): first rule that matches the enemy id (regexp) or tag wins; else humanoid
  bodies: [
    { re: 'spirit|hologram|cyber-demon|soul|scriptlet|ghost|glitch', tag: 'digital', type: 'spirit' },
    { re: 'drone|turret|sprayer|beacon|hive-node|mech-node|lis-drone|lis-5|lis-2|sentry|battery', type: 'drone' },
    { re: '^(boss-)?wolf-\\d', type: 'beast' }, // Warprom «Wolf» robo-wolves (wolf-5 included), gfx/robo3d.js
    { re: 'junk-mech|kuznechik|golem|harvester|great-mech|matyorny|mech-pilot|assimilator|loader|vibe-burner|sputnik|armory', tag: 'mech', type: 'mech' },
    { re: 'wolf|beast|crawler|panther|spider|biomass|(^|-)rat($|-)|(^|-)dog($|-)|lis-4|lis-9|lis-1', tag: 'beast', type: 'beast' },
    { tag: 'mechanical', type: 'robot' },
  ],
  hover: ['drone', 'sprayer', 'lis-drone', 'scout', 'beacon'], // drones that float (turrets / nodes stand)
  // humanoid proportions by race: w — width, limb — limb thickness, h — height; extras on the head / shoulders
  races: {
    human: {}, skeleton: { limb: 0.7, w: 0.9, bone: true }, android: { limb: 0.85, robot: true }, 'mutant-beast': { w: 1.2, limb: 1.25, h: 1.05, ears: true },
    'mutant-plant': { leaves: true, limb: 1.1 }, tekhonok: { h: 0.86, w: 1.05, antenna: true }, cringegon: { h: 1.08, w: 0.9, limb: 0.85, horns: true, ears: true },
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
    // controls-divinity.md: sneaking crouch (radians of thigh / shin / torso, sink — share of the height kept on the floor)
    crouch: { thigh: -1.0, shin: 1.5, torso: 0.4, head: -0.25, arm: -0.3, sink: 0.145 },
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
  // post-processing (gfx/post.js; premium-look, STYLE «Пост-эффекты»): off with «Снизить эффекты». Bloom of the emissive
  // buffer only: soft threshold on the max channel (threshold ± knee), strength, weights of the 3 mips (software GL — softMips);
  // knee2 — tonemap shoulder start (palette colours are <= maxPixel 0.9: ~0.2 % shift); vignette strength / start (share of
  // the half-diagonal of the map area); grain amplitude (static); msaa samples on hardware
  post: {
    threshold: 0.6, knee: 0.22, bloom: 0.32, mipW: [0.8, 1.0, 1.1], softMips: 2, knee2: 0.88,
    vignette: 0.22, vignetteStart: 0.55, grain: 0.03, msaa: 4,
    // colour balance by biome (multipliers, |k - 1| <= 0.03; no LUT — the floor colour tells the biome)
    balance: {
      default: [1, 1, 1], wasteland: [1.03, 1.0, 0.97], 'ruins-city': [1.02, 1.0, 0.98], factory: [1.02, 1.0, 0.98], 'bunker-interior': [1.01, 1.0, 0.99],
      snow: [0.98, 1.0, 1.03], swamp: [0.98, 1.02, 0.98], 'mutant-forest': [0.98, 1.02, 0.98], cyberspace: [0.98, 0.99, 1.03], port: [0.98, 1.0, 1.02],
    },
  },
  // fill light (opposite the key, horizontal + up; share of the way shadow -> base tone) and height fog (low ground hazier:
  // full below y0, none above y1 m, amount; colour = biome fog colour); both off with «Снизить эффекты»
  fill: { dir: [0.75, 0.35, -0.35], k: 0.3 },
  hfog: { y0: -0.4, y1: 0.4, amount: 0.16 },
  // premium-look «окружение» (gfx/env3d.js): floor tone variants (share base -> light), litter per cell (base + random + at
  // edges, max), decal chance, backdrop beyond the map (ring width m, gradient bands, silhouettes), point-light glow pools
  // (nearest max, radius m, alpha day / night, flicker share < 1 Hz, palette keys), ambient particles cap; per-biome height
  // fog: [amount x, top m] — ground mist in swamp / forest / port, thin haze elsewhere
  env: {
    tone: [0.3, 0.55, 0.8, 1.0], decalP: 0.16,
    scatter: { base: 0, rand: 2, edge: 2, max: 4 },
    backdrop: { ring: 24, bands: 9, n: 96 },
    light: { max: 8, rWarm: 2.7, rCold: 2.0, aDay: 0.2, aNight: 0.38, flick: 0.1, warm: 'a', cold: 'h', hot: 'b', props: ['lamp', 'campfire', 'server', 'hologram-pillar', 'data-pylon', 'glitch-cube', 'kiosk'] },
    ambientMax: 56,
    hfog: { swamp: [1.9, 0.7], 'mutant-forest': [1.6, 0.6], port: [1.7, 0.6], cyberspace: [1.4, 0.5], snow: [1.3, 0.5] },
  },
  // contact shadows: soft dark blobs under units (radius m, alpha) and obstacles / props (only without «Снизить эффекты»)
  contact: { color: '0', unitR: 0.42, unitA: 0.5, objR: 0.8, objA: 0.36 },
  sky: { default: '0', night: '0', cyberspace: '0', snow: '1' }, // background (no white skies)
  fogColor: { default: '1', snow: '3', swamp: 'k', 'mutant-forest': 'k', cyberspace: 'i', port: 'g' },
  team: { player: 'h', ally: 'j', enemy: 'c', rival: 'a' },
  // Three.js backend (docs/specs/threejs-migration.md, game/src/three/): exposure (Neutral tonemap), DPR cap, MSAA of
  // the post target; lights (key = GFX.shadow.dir camera-relative, casts the shadow; fill = GFX.fill.dir; hemisphere
  // sky / ground palette keys); shadow map size by quality; world material: roughness, value-noise amount on the albedo
  // (world xz scales), AO baked in vertices (share), glow vertices -> emissive x; units: toon steps; GTAO (radius m,
  // blend), bloom of HDR > threshold (emissive only); grade: vignette [strength, start], brightest pixel; night: ambient x,
  // point lights (intensity, distance x light radius)
  three: {
    exposure: 1.4, maxDpr: 1.5, msaa: 4,
    key: 3.0, fill: 0.75, hemi: { sky: '5', ground: '3', k: 1.8 }, keyColor: '5',
    shadow: { high: 2048, low: 1024, bias: -0.0006, normalBias: 0.025, radius: 3 },
    world: { rough: 0.86, noise: 0.16, noiseScale: [2.3, 9.0], ao: 0.55, glow: 2.6, cutPad: 0.01 },
    unit: { steps: [0.42, 0.72, 1.0], glow: 2.2, flash: 1.6 },
    // GTAO on the orthographic camera (picked on ?hq=1: radius 0.6 gave ~1 % change, 1.5 m reads in wall / crate corners)
    ao: { radius: 1.5, distanceExponent: 1.0, thickness: 2.0, scale: 1.5, samples: 12, intensity: 1.0 },
    bloom: { strength: 0.42, radius: 0.35, threshold: 0.92 },
    grade: { vignette: 0.22, start: 0.55, max: 0.93, sat: 0.85 },
    // night: lights x ambient, tint (palette key) x tintK outside the light holes, moonlight key / sky colours (sky lerp
    // skyK), warm pools; floor — minimum light multiplier of night / storm / dusk (QA v48: runs too dark; visual only,
    // the sight range stays WEATHER.tod / weather vis); fogMax — extra depth fog share in low-visibility weather
    night: { ambient: 0.8, point: 3.2, dist: 1.6, tint: 'g', tintK: 0.45, moon: 'f', sky: 'g', skyK: 0.5, warmK: 1.2, floor: 0.85, fogMax: 0.1 },
    particleGlow: 2.4,
    // software GL (SwiftShader / llvmpipe — fill rate): no bloom / GTAO, shadow map size x shadow; `?hq=1` keeps full quality
    soft: { bloom: false, gtao: false, shadow: 0.5 },
    // character shadows (perf): GLB sub-meshes smaller than this bounding radius (m, bind pose: face, trims, buckles)
    // do not cast — their shadow lies inside the body's; halves the shadow-pass draw calls of a character
    shadowMinR: 0.25,
  },
  // quality presets (docs/perf.md; setting «Качество», gfx/quality.js). dpr — render scale cap (x GFX.three.maxDpr cap),
  // msaa — samples of the post target, gtao — 0 off | resolution share, aoUnits — characters in the AO g-buffer,
  // bloom, shadow — shadow map size x, near — outlines / springs only within near m of the camera focus (0 — all),
  // xrayCrowd — x-ray silhouettes of roam crowd NPCs, oldPost — post chain of the old WebGL2 renderer.
  // auto: high on hardware (low on software GL); steps down one level when the 80th percentile of frame intervals with a
  // 3D scene stays above 1000 / downFps ms for `window` s (after `warm` s on the scene); the result is remembered.
  quality: {
    levels: ['auto', 'low', 'medium', 'high'],
    high: { dpr: 1.5, msaa: 4, gtao: 0.5, aoUnits: true, bloom: true, shadow: 1, near: 0, xrayCrowd: true, oldPost: true },
    medium: { dpr: 1.25, msaa: 2, gtao: 0.25, aoUnits: false, bloom: true, shadow: 1, near: 16, xrayCrowd: false, oldPost: true },
    low: { dpr: 0.75, msaa: 0, gtao: 0, aoUnits: false, bloom: false, shadow: 0.5, near: 9, xrayCrowd: false, oldPost: false },
    auto: { downFps: 40, window: 3, warm: 2, minFrames: 30 },
  },
};
