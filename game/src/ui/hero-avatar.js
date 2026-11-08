// Animated 3D portrait of the hero for HUD / dialogues / battle cards (the 3D replacement of drawHeroPortrait).
//   heroLook3d(h)                       save.hero | battle unit | build -> look (avatar + clothes colour; none saved -> default from race/name)
//   heroAvatarFrame(h, size, opts)      cached offscreen canvas of the current frame (15 fps, frames cached by quantised pose)
//   drawHeroAvatar(ctx, h, x, y, box, opts)   opts { emotion, hp, mrl (0..1), hurtAt (performance.now of last damage), time (ms), bg }
// Animation: breathing (bust scale +-1%), slow head sway (yaw +-3 deg), blink every 3-6 s, flinch + red flash on damage, tremor when morale is low.
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';
import { defaultLook, buildAvatarMesh, renderAvatar, isLook3d, rngOf, woundLevel, AVATAR_EMOTIONS } from './avatar3d.js';

const FPS = 15;
const pc = (k) => PALETTE[PALETTE_KEYS.indexOf(k)];
const makeCanvas = (w, h) => {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
};

// ---- look of a hero
const lookMemo = new WeakMap();
const defMemo = new Map();
export function heroLook3d(h) {
  const race = h?.race ?? h?.raceId ?? 'human';
  let av = h?.avatar;
  if (!isLook3d(av)) {
    const seed = String(h?.name ?? h?.cls ?? h?.classId ?? 'hero');
    const k = `${race}|${seed}`;
    av = defMemo.get(k);
    if (!av) { av = defaultLook(race, 'x', seed); defMemo.set(k, av); }
  }
  const cloth = h?.look || av.cloth || null;
  let m = lookMemo.get(av);
  if (!m) { m = new Map(); lookMemo.set(av, m); }
  let r = m.get(cloth);
  if (!r) { const look = { ...av, cloth }; r = { look, key: JSON.stringify(look) }; m.set(cloth, r); }
  return r;
}

// ---- caches
const meshCache = new Map();
const frameCache = new Map();
function meshOf(r, st) {
  const key = `${r.key}|${st.emo}|${st.lvl}|${st.nervous ? 1 : 0}|${st.blink ? 1 : 0}`;
  let m = meshCache.get(key);
  if (!m) { m = buildAvatarMesh(r.look, st); if (meshCache.size > 120) meshCache.clear(); meshCache.set(key, m); }
  return m;
}

// ---- blink schedule per hero: a blink every 3..6 s, lasts 0.14 s
const blinks = new Map();
function blinkOn(key, t) {
  let s = blinks.get(key);
  if (!s || t < s.next - 7) { const r = rngOf(key); s = { r, next: t + 1 + r() * 3 }; blinks.set(key, s); }
  while (t >= s.next + 0.14) s.next += 3 + s.r() * 3;
  return t >= s.next;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const bucket = (box) => (box <= 100 ? 96 : box <= 200 ? 192 : 288);

/** Current frame canvas (square, bucketed size). */
export function heroAvatarFrame(h, box = 96, o = {}) {
  const r = heroLook3d(h);
  const ms = o.time ?? nowMs();
  const tick = Math.floor((ms / 1000) * FPS), t = tick / FPS;
  const emo = AVATAR_EMOTIONS.includes(o.emotion) ? o.emotion : 'neutral';
  const lvl = woundLevel(o.hp);
  const nervous = o.mrl != null && o.mrl < 0.3;
  const blink = o.blink !== false && blinkOn(r.key.length + r.key.slice(0, 80), t);
  const still = o.still === true;
  // pose: breathing, sway, flinch, tremor
  let yaw = 0.3 + (still ? 0 : (3 * Math.PI) / 180 * Math.sin((t * 2 * Math.PI) / 7));
  let pitch = 0.05;
  const zoom = 1.25 * (1 + (still ? 0 : 0.01 * Math.sin((t * 2 * Math.PI) / 3.6)));
  let flash = 0;
  if (o.hurtAt != null) {
    const age = (ms - o.hurtAt) / 1000;
    if (age >= 0 && age < 0.5) {
      const j = 1 - age / 0.5;
      yaw += Math.sin(age * 40) * 0.14 * j; pitch += 0.1 * j;
      flash = age < 0.3 && tick % 2 === 0 ? 1 : 0;
    }
  }
  if (nervous && !still) yaw += (tick % 2 ? 1 : -1) * 0.012;
  const q = (v, k) => Math.round(v * k);
  const size = bucket(box);
  const key = `${r.key.length}${r.key}|${size}|${emo}|${lvl}|${nervous ? 1 : 0}|${blink ? 1 : 0}|${q(yaw, 100)}|${q(pitch, 100)}|${q(zoom, 400)}|${flash}|${o.bg === false ? 0 : 1}`;
  let cv = frameCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  if (o.bg !== false) { c.fillStyle = pc('1'); c.fillRect(0, 0, size, size); c.fillStyle = pc('2'); c.fillRect(0, size * 0.72, size, size * 0.28); }
  renderAvatar(c, meshOf(r, { emo, lvl, nervous, blink }), { x: 0, y: 0, size, yaw: q(yaw, 100) / 100, pitch: q(pitch, 100) / 100, zoom: q(zoom, 400) / 400 });
  if (flash) { c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.45; c.fillStyle = pc('c'); c.fillRect(0, 0, size, size); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  if (frameCache.size > 500) frameCache.clear();
  frameCache.set(key, cv);
  return cv;
}

/** Draws the animated portrait into the box x box square at (x, y). */
export function drawHeroAvatar(ctx, h, x, y, box, o = {}) {
  const cv = heroAvatarFrame(h, box, o);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const ga = ctx.globalAlpha;
  if (o.alpha != null) ctx.globalAlpha = ga * o.alpha;
  ctx.drawImage(cv, x, y, box, box);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingEnabled = prev;
}
