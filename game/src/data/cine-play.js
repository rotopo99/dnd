// Cinematic player numbers and tables (docs/specs/cinematics.md §6–7). Scene data — data/cinematics/*.js (game-designer);
// here — how the player shows it: UI timings, clip fallbacks, procedural gestures, faces, stage dioramas, camera aim.
export const CINE_VIEW = {
  letterbox: 2.35,              // image aspect between the black bars
  fadeSec: 0.35,                // `tr: 'fade'` half (out + in)
  whipSec: 0.25,                // `tr: 'whip'` smear
  checkSec: 1.8,                // check result on screen before the branch
  qteResultSec: 0.6,            // QTE flash / thud before the branch
  silenceFlashSec: 0.5,         // timer ran out: the «silence» plate flashes, then is taken
  endFadeSec: 0.6,              // end without its own fade
  loadTimeoutSec: 8,            // GLB / three.js not up by then -> comic fallback
  threeWaitSec: 3,              // wait for the dynamic import of three/engine.js before falling back
  skipHoldSec: 1,               // «Пропустить» needs a confirmation (pause menu) — kept for a hold variant
  toastSec: 2.5,                // «X запомнит это» (CINE_RULES.remember.sec wins when set)
  choirOffsetsMs: [0, 55, 110], // choir lines: 3 voices 40–80 ms apart (spec §6)
  choirPitch: [1, 1.26, 0.75],
  qteKeys: ['Q', 'W', 'E', 'A', 'S', 'D', 'R', 'F'], // letters the QTE listens to (a wrong one fails a series)
  blinkEvery: [2.5, 5],         // s between blinks
  blinkSec: 0.14,
  lookMaxDeg: 55,               // head turn limit towards the look target
  lookLerp: 6,                  // 1/s
  moveLerp: 3,                  // actors walk to a new `at` (1/s)
  turnLerp: 5,
  emoLerp: 8,
  camLerp: 4,                   // camera follows moving actors within one shot
  heightM: 1.75,                // actor height when a model has no meta
};

// Clip asked by the scene -> the nearest clip the GLB has (Blender contract: idle walk run crouch_walk attack_melee
// attack_shoot cast hit death). A procedural gesture (CINE_GESTURES) plays on top when the clip itself is missing.
export const CLIP_FALLBACK = {
  talk: 'idle', shrug: 'idle', point: 'idle', lean: 'idle', sit: 'idle', nod: 'idle', shake: 'idle', laugh: 'idle',
  cry: 'idle', hands_up: 'idle', stagger: 'hit', reach: 'idle', run: 'idle', walk: 'idle', crouch_walk: 'idle',
};

// Procedural gestures: bone rotations about actor axes (l = actor's left, pitch: + bends forward; u = up, yaw;
// f = forward, roll). angle = base + amp * sin(2π·hz·t), rad; fades in over `in` s.
export const CINE_GESTURES = {
  talk: [{ bone: 'head', axis: 'l', base: 0, amp: 0.05, hz: 2.2 }, { bone: 'chest', axis: 'u', base: 0, amp: 0.04, hz: 0.9 }],
  nod: [{ bone: 'head', axis: 'l', base: 0.1, amp: 0.22, hz: 1.6 }],
  shake: [{ bone: 'head', axis: 'u', base: 0, amp: 0.35, hz: 1.8 }],
  shrug: [{ bone: 'leftShoulder', axis: 'f', base: 0.22, amp: 0.05, hz: 0.6 }, { bone: 'rightShoulder', axis: 'f', base: -0.22, amp: 0.05, hz: 0.6 },
    { bone: 'head', axis: 'f', base: 0.12, amp: 0, hz: 0 }],
  point: [{ bone: 'rightUpperArm', axis: 'l', base: -1.25, amp: 0.03, hz: 0.5 }, { bone: 'rightUpperArm', axis: 'f', base: 0.3, amp: 0, hz: 0 }],
  reach: [{ bone: 'rightUpperArm', axis: 'l', base: -1.0, amp: 0.08, hz: 0.7 }, { bone: 'leftUpperArm', axis: 'l', base: -0.8, amp: 0.08, hz: 0.7 },
    { bone: 'spine', axis: 'l', base: 0.25, amp: 0, hz: 0 }],
  hands_up: [{ bone: 'rightUpperArm', axis: 'f', base: -1.9, amp: 0.05, hz: 0.8 }, { bone: 'leftUpperArm', axis: 'f', base: 1.9, amp: 0.05, hz: 0.8 }],
  laugh: [{ bone: 'chest', axis: 'l', base: -0.08, amp: 0.08, hz: 4 }, { bone: 'head', axis: 'l', base: -0.2, amp: 0.06, hz: 4 }],
  cry: [{ bone: 'head', axis: 'l', base: 0.45, amp: 0.03, hz: 3 }, { bone: 'chest', axis: 'l', base: 0.18, amp: 0.03, hz: 3 }],
  lean: [{ bone: 'spine', axis: 'f', base: 0.14, amp: 0, hz: 0 }, { bone: 'head', axis: 'f', base: -0.1, amp: 0, hz: 0 }],
  sit: [{ bone: 'spine', axis: 'l', base: 0.3, amp: 0, hz: 0 }, { bone: 'head', axis: 'l', base: -0.15, amp: 0, hz: 0 }],
  stagger: [{ bone: 'spine', axis: 'l', base: -0.2, amp: 0.1, hz: 2 }],
  run: [{ bone: 'spine', axis: 'l', base: 0.15, amp: 0.04, hz: 2.5 }],
  walk: [{ bone: 'spine', axis: 'u', base: 0, amp: 0.05, hz: 1 }],
};
export const GESTURE_IN = 0.3;

// Emotion (EMOS, data/cinematics) -> face: atlas swap (`face_<sex>_<tex>.png`) + shape keys (GLB morph targets).
export const CINE_FACES = {
  neutral: { tex: 'neutral', keys: {} },
  happy: { tex: 'happy', keys: { happy: 0.8 } },
  angry: { tex: 'angry', keys: { angry: 0.8 } },
  sad: { tex: 'sad', keys: { sad: 0.8 } },
  scared: { tex: 'surprised', keys: { surprised: 0.6, sad: 0.4 } },
  smug: { tex: 'happy', keys: { happy: 0.35, angry: 0.25 } },
  surprised: { tex: 'surprised', keys: { surprised: 0.9 } },
  cringe: { tex: 'sad', keys: { sad: 0.45, angry: 0.35 } },
};

// Model keys of the cast -> GLB files (game/assets/models). `base` + `parts`; missing models (judge-avatar) -> stand-ins.
export const CINE_MODELS = {
  'judge-avatar': { base: 'body_m', parts: ['outfit_cyber_m'], tint: 0xb9a39e, scale: 1.25 },
  outfit_cyber_m: { base: 'body_m', parts: ['outfit_cyber_m', 'hair_short_m'] },
  outfit_cyber_f: { base: 'body_f', parts: ['outfit_cyber_f', 'hair_bob_f'] },
};
// Actor looks: `look: 'spirit'` — translucent cyan; `blank` — empty eyes (neutral face, no blink).
export const CINE_LOOKS = { spirit: { opacity: 0.55, tint: 0x70d8f2, emissive: 0x1c4a5a }, blank: { noBlink: true, face: 'neutral' } };

// Camera aim height per frame (m, × actor height / 1.75); stage centre for `wide`.
export const CINE_AIM = { wide: 1.0, two: 1.35, med: 1.3, close: 1.55, xclose: 1.6, ots: 1.5, low: 1.45, high: 1.0, dutch: 1.45 };
export const CINE_SIDE_DEG = 22; // single-actor frames: camera this far off the actor's facing towards +z

// Stage dioramas (STAGES): floor / back wall / fog colours (palette), key light, props (boxes: [x, z, w, h, d, colour]).
export const CINE_STAGES = {
  'dock-riot': { floor: '#3c3f4f', wall: '#262833', fog: '#14141c', key: '#f0b050', fill: '#4fa0f0', glow: '#f06a24',
    props: [[-4, -3, 1.2, 1.2, 1.2, '#6e3d22'], [3.5, -3.5, 2, 2.6, 0.4, '#5b6175'], [-3, -8.3, 6, 3.5, 0.3, '#3c3f4f'], [5, 1, 1, 0.9, 1, '#a95f2c']] },
  'server-hall': { floor: '#262833', wall: '#1f3563', fog: '#14141c', key: '#70d8f2', fill: '#e04fa8', glow: '#4fa0f0',
    props: [[-3.5, -4, 1, 2.6, 1, '#3c3f4f'], [-1.5, -4, 1, 2.6, 1, '#3c3f4f'], [1.5, -4, 1, 2.6, 1, '#3c3f4f'], [3.5, -4, 1, 2.6, 1, '#3c3f4f']] },
  'reactor-log': { floor: '#2e5030', wall: '#262833', fog: '#14141c', key: '#74c050', fill: '#70d8f2', glow: '#74c050',
    props: [[0, -5, 2.4, 3.2, 2.4, '#4b5a2f'], [-3, -2, 1.4, 1, 0.8, '#5b6175'], [3, -2, 1.4, 1.1, 0.8, '#5b6175']] },
  'court-cyber': { floor: '#1c4a5a', wall: '#1f3563', fog: '#14141c', key: '#dfe3e8', fill: '#e04fa8', glow: '#70d8f2',
    props: [[0, -6.5, 4, 2.2, 1.2, '#3c3f4f'], [-4, -4, 0.4, 4, 0.4, '#5b6175'], [4, -4, 0.4, 4, 0.4, '#5b6175'], [0, 1.6, 2.2, 0.9, 0.6, '#3c3f4f']] },
  'roof-night': { floor: '#262833', wall: '#14141c', fog: '#1f3563', key: '#4fa0f0', fill: '#f0b050', glow: '#f0b050',
    props: [[-3, -2, 0.6, 1, 0.6, '#6e3d22'], [2.5, -3, 2.5, 0.5, 0.8, '#5b6175'], [0, -0.4, 2.4, 0.45, 0.6, '#6e3d22']] },
  'door-hall': { floor: '#3c3f4f', wall: '#262833', fog: '#14141c', key: '#dfe3e8', fill: '#c42828', glow: '#70d8f2',
    props: [[0, -5.5, 3, 4, 0.5, '#5b6175'], [-3.5, -3, 0.5, 3.5, 0.5, '#3c3f4f'], [3.5, -3, 0.5, 3.5, 0.5, '#3c3f4f']] },
};

// Colour grades (fx grade): 2D tint over the image (Three and comic alike). `flash` fades out over fx.d.
export const CINE_GRADES = {
  'mono-blue': { color: 'rgba(31,53,99,0.35)' }, 'red-dim': { color: 'rgba(94,24,24,0.30)' },
  'white-dim': { color: 'rgba(223,227,232,0.16)' }, 'white-flash': { color: 'rgba(255,255,255,0.9)', flash: true },
  off: null,
};

// Comic fallback panels: frame -> panel share of the strip width, portrait scale, tilt (deg).
export const COMIC_FRAMES = {
  wide: { w: 1, scale: 3, tilt: 0 }, two: { w: 0.62, scale: 5, tilt: 0 }, med: { w: 0.42, scale: 6, tilt: 0 },
  close: { w: 0.34, scale: 7, tilt: 0 }, xclose: { w: 0.28, scale: 8, tilt: 0 }, ots: { w: 0.5, scale: 5, tilt: 0 },
  low: { w: 0.36, scale: 6, tilt: 0 }, high: { w: 0.4, scale: 4, tilt: 0 }, dutch: { w: 0.38, scale: 5, tilt: -6 },
};
export const COMIC_KEEP = 3; // panels on the page at once

// Skill ids used by scene checks that differ from data/talents.js SKILLS (scene data is the designer's; mapped here).
export const CINE_SKILL_ALIAS = { hack: 'hacking', engineering: 'tech' };
