// Animated 3D portrait of the hero for HUD / dialogues / battle cards (the 3D replacement of drawHeroPortrait).
//   heroLook3d(h)                       save.hero | battle unit | build -> look (avatar + clothes colour; none saved -> default from race/name)
//   heroAvatarFrame(h, size, opts)      cached offscreen canvas of the current frame (15 fps, frames cached by quantised pose)
//   drawHeroAvatar(ctx, h, x, y, box, opts)   opts { emotion, hp, mrl (0..1), hurtAt (performance.now of last damage), time (ms), bg }
// Since the model pass the portrait is the real 3D head of the hero (gfx/stage.js: the same toon shaders as the battle, close-up of
// the head and shoulders, face atlas emotions / blink); without WebGL2 (or after a lost context) the old Canvas 2D bust is drawn.
// Animation: breathing (bust scale +-1%), slow head sway (yaw +-3 deg), blink every 3-6 s, flinch + red flash on damage, tremor when morale is low.
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';
import { defaultLook, buildAvatarMesh, renderAvatar, isLook3d, rngOf, woundLevel, AVATAR_EMOTIONS } from './avatar3d.js';
import { migrateLook } from './look-data.js';
import { hasWebGL2 } from '../gfx/gl.js';
import { getStage } from '../gfx/stage.js';
import { unitTemplate } from '../gfx/units3d.js';
import { animState } from '../gfx/anim.js';

const FPS = 15;
const pc = (k) => PALETTE[PALETTE_KEYS.indexOf(k)];
const makeCanvas = (w, h) => {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
};

// ---- look of a hero
const lookMemo = new WeakMap();
const migMemo = new WeakMap();
const defMemo = new Map();
export function heroLook3d(h) {
  const race = h?.race ?? h?.raceId ?? 'human';
  let av = h?.avatar;
  if (isLook3d(av) && av.v === 1) { let mg = migMemo.get(av); if (!mg) { mg = migrateLook(av, race); migMemo.set(av, mg); } av = mg; }
  if (!isLook3d(av)) {
    const seed = String(h?.name ?? h?.cls ?? h?.classId ?? 'hero');
    const k = `${race}|${seed}`;
    av = defMemo.get(k);
    if (!av) { av = defaultLook(race, 'x', seed); defMemo.set(k, av); }
  }
  const cloth = h?.look || av.cloth || null;
  let m = lookMemo.get(av);
  if (!m) { m = new Map(); lookMemo.set(av, m); }
  const hh = h?.hide?.helm ? 1 : 0; // «show on model» off for the helmet / hood: no hat accessories
  const mk = `${cloth}|${hh}`;
  let r = m.get(mk);
  if (!r) { const look = { ...av, cloth }; if (hh) look.acc = (av.acc || []).filter((a) => !['hood', 'helmet', 'bandana'].includes(a)); r = { look, key: JSON.stringify(look) }; m.set(mk, r); }
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

// ---- GL portrait: one shared 288 x 288 stage, templates cached by look, wounds / flash painted over in 2D
const GLK = { yawDeg: 15, pitch: 4, view: 0.72 };
const tplMemo = new Map();
const poseStates = new Map();
const stateOf = (key) => { let s = poseStates.get(key); if (!s) { s = animState({ anim: {} }, 'p'); s.seed = 0.3; if (poseStates.size > 80) poseStates.clear(); poseStates.set(key, s); } return s; };
let glBroken = false, budgetAt = 0, budgetN = 0;
function portraitTemplate(h, r) {
  const k = `${r.key.length}${r.key}|${h?.race ?? h?.raceId}|${h?.cls ?? h?.classId}|${h?.armorType || ''}|${JSON.stringify(h?.hide || 0)}`;
  let T = tplMemo.get(k);
  if (T) return T;
  const u = { kind: 'hero', team: 'heroes', id: 'portrait', raceId: h?.race ?? h?.raceId ?? 'human', classId: h?.cls ?? h?.classId ?? 'x', armorType: h?.armorType || 'cloth', weapon: null,
    avatar: r.look, look: null, hide: h?.hide || null, tags: [], name: h?.name };
  T = unitTemplate(u);
  if (tplMemo.size > 24) tplMemo.clear();
  tplMemo.set(k, T);
  return T;
}
const lastGl = new Map();
function glFrame(h, r, size, p) {
  if (glBroken || !hasWebGL2()) return null;
  const stage = getStage('portrait', 288, 288);
  if (!stage) { glBroken = true; return null; }
  const hk = r.key.length + r.key.slice(0, 60);
  // at most 3 new GL frames per ~16 ms: the rest keep the previous frame of that hero
  const nw = nowMs();
  if (nw - budgetAt > 16) { budgetAt = nw; budgetN = 0; }
  if (++budgetN > 3 && lastGl.has(hk)) return lastGl.get(hk);
  let T;
  try { T = portraitTemplate(h, r); } catch (e) { glBroken = true; console.warn('portrait 3d failed', e); return null; }
  const top = T.top * T.scale, headC = T.headY ? T.headY * T.scale : top - 0.16;
  const zoom = (top + 0.12) / (GLK.view / p.zoomK);
  const cv = makeCanvas(size, size), c = cv.getContext('2d');
  if (p.bg) { c.fillStyle = pc('1'); c.fillRect(0, 0, size, size); const g = c.createRadialGradient(size * 0.4, size * 0.3, 2, size * 0.5, size * 0.5, size * 0.8); g.addColorStop(0, 'rgba(141,149,168,0.22)'); g.addColorStop(1, 'rgba(20,20,28,0.0)'); c.fillStyle = g; c.fillRect(0, 0, size, size); c.fillStyle = pc('2'); c.fillRect(0, size * 0.86, size, size * 0.14); }
  stage.draw(T, stateOf(hk), { vx: 0, vy: 0, vw: size, vh: size, yaw: GLK.yawDeg + p.yawD, pitch: GLK.pitch + p.pitchD, zoom, focus: headC - 0.07, now: 3, emo: p.emo, blink: p.blink, physics: 0, reduceMotion: true });
  c.drawImage(stage.canvas, 0, 0, size, size, 0, 0, size, size);
  woundMarks(c, size, p.lvl, p.nervous);
  lastGl.set(hk, cv); if (lastGl.size > 60) lastGl.clear();
  return cv;
}
/** Wounds (by the hp share) and the nervous sweat painted over the head: scratches, bruise, blood, bandage (palette colours). */
function woundMarks(c, size, lvl, nervous) {
  const u = size / 96, px = (x, y, w, h, k, a = 1) => { c.globalAlpha = a; c.fillStyle = pc(k); c.fillRect(Math.round(x * u), Math.round(y * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u))); c.globalAlpha = 1; };
  if (lvl >= 1) { px(33, 50, 9, 1.2, 'd'); px(35, 52, 7, 1.2, 'c', 0.85); }
  if (lvl >= 2) { c.globalAlpha = 0.55; c.fillStyle = pc('o'); c.beginPath(); c.ellipse(57 * u, 44 * u, 5 * u, 3 * u, 0, 0, 7); c.fill(); c.globalAlpha = 1; px(47, 17, 1.4, 11, 'c'); px(46, 27, 3, 2, 'd'); }
  if (lvl >= 3) { c.save(); c.translate(52 * u, 21 * u); c.rotate(-0.2); c.fillStyle = pc('5'); c.fillRect(-14 * u, -3 * u, 28 * u, 6 * u); c.fillStyle = pc('4'); c.fillRect(-14 * u, 2 * u, 28 * u, 1 * u); c.fillStyle = pc('c'); c.fillRect(4 * u, -3 * u, 4 * u, 6 * u); c.restore(); px(64, 52, 1.5, 7, 'c'); }
  if (nervous) { c.fillStyle = pc('h'); c.beginPath(); c.ellipse(70 * u, 30 * u, 1.8 * u, 2.6 * u, 0, 0, 7); c.fill(); }
}

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
  // perf (docs/perf.md): breathing is a 2D scale of the cached frame (drawHeroAvatar), not a new GL frame + GPU readback —
  // only the look, the sway yaw, blink and emotion make new frames (a few dozen per look, then all from frameCache)
  const zoom = 1.25;
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
  const gk = glFrame(h, r, size, { zoomK: q(zoom, 400) / 400 / 1.25, yawD: (q(yaw, 100) / 100 - 0.3) * 57.3, pitchD: (q(pitch, 100) / 100 - 0.05) * 57.3, emo, lvl, nervous, blink, bg: o.bg !== false });
  if (gk) {
    cv = gk;
    if (flash) { const f = makeCanvas(size, size), g2 = f.getContext('2d'); g2.drawImage(gk, 0, 0); g2.globalCompositeOperation = 'source-atop'; g2.globalAlpha = 0.45; g2.fillStyle = pc('c'); g2.fillRect(0, 0, size, size); cv = f; }
    if (frameCache.size > 500) frameCache.clear();
    frameCache.set(key, cv);
    return cv;
  }
  cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  if (o.bg !== false) { c.fillStyle = pc('1'); c.fillRect(0, 0, size, size); c.fillStyle = pc('2'); c.fillRect(0, size * 0.72, size, size * 0.28); }
  renderAvatar(c, meshOf(r, { emo, lvl, nervous, blink }), { x: 0, y: 0, size, yaw: q(yaw, 100) / 100, pitch: q(pitch, 100) / 100, zoom: q(zoom, 400) / 400 });
  if (flash) { c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.45; c.fillStyle = pc('c'); c.fillRect(0, 0, size, size); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  if (frameCache.size > 500) frameCache.clear();
  frameCache.set(key, cv);
  return cv;
}

// ---- spirit variant (docs/specs/cyberspace-v2.md §8): translucent cyan glitch silhouette, scanlines, RGB-split echoes, noise decay
export const isSpirit = (h, o = {}) => !!(o.spirit || h?.spirit === true || h?.isSpirit || h?.race === 'cyber-spirit' || h?.raceId === 'cyber-spirit');
const spiritCache = new Map();
const tintOf = (src, size, key, a) => {
  const cv = makeCanvas(size, size), c = cv.getContext('2d');
  c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = a; c.fillStyle = pc(key); c.fillRect(0, 0, size, size);
  return cv;
};
function spiritFrame(h, box, o) {
  const ms = o.time ?? nowMs();
  const ph = Math.floor(ms / 150) % 3;           // 0 normal / 1 slice / 2 echo
  const seed = Math.floor(ms / 250) % 8;
  const base = heroAvatarFrame(h, box, { ...o, bg: false, spirit: false, hurtAt: o.hurtAt });
  const size = base.width;
  const key = `${heroLook3d(h).key.length}${heroLook3d(h).key}|${size}|${ph}|${seed % 4}|${o.bg === false ? 0 : 1}|${o.hp ?? 1}|${o.emotion || ''}|${Math.floor((o.time ?? nowMs()) / 66)}`;
  let cv = spiritCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  const u = Math.max(2, Math.round(size / 48)), r = rngOf(`sp${seed}${ph}`);
  if (o.bg !== false) { c.fillStyle = pc('1'); c.fillRect(0, 0, size, size); c.fillStyle = pc('i'); c.globalAlpha = 0.5; c.fillRect(0, size * 0.72, size, size * 0.28); c.globalAlpha = 1; }
  const body = tintOf(base, size, 'h', 0.55);
  if (ph === 2) { // RGB echo: pink left, cyan right
    c.globalAlpha = 0.4; c.drawImage(tintOf(base, size, 'n', 0.8), -u * 2, 0); c.drawImage(tintOf(base, size, 'h', 0.9), u * 2, 0);
  } else { c.globalAlpha = 0.18; c.drawImage(tintOf(base, size, 'n', 0.8), -u, 0); }
  c.globalAlpha = 0.72;
  if (ph === 1) { // horizontal row slices shifted +-3 units
    let y0 = 0;
    while (y0 < size) {
      const hh = Math.round(size * (0.03 + r() * 0.08)), slice = r() < 0.35;
      const dx = slice ? (r() < 0.5 ? -1 : 1) * u * (1 + Math.floor(r() * 2)) : 0;
      c.drawImage(body, 0, y0, size, hh, dx, y0, size, hh);
      y0 += hh;
    }
  } else c.drawImage(body, 0, 0);
  c.globalAlpha = 1;
  // lower third decays into noise: erase random cells (denser lower) and drop falling pixels
  const top = size * 0.62;
  for (let yy = top; yy < size; yy += u) for (let xx = 0; xx < size; xx += u) {
    const p = (yy - top) / (size - top);
    const q = r();
    if (q < p * 0.85) { c.clearRect(xx, yy, u, u); if (q < p * 0.12) { c.fillStyle = pc(r() < 0.2 ? '5' : 'h'); c.globalAlpha = 0.8; c.fillRect(xx, yy + u, u, u); c.globalAlpha = 1; } }
  }
  c.fillStyle = pc('0'); c.globalAlpha = 0.38;
  for (let yy = 0; yy < size; yy += u * 3 / 2 | 0 || 3) c.fillRect(0, yy, size, Math.max(1, u / 2 | 0));
  c.globalAlpha = 1;
  if (ph === 1 && r() < 0.5) { c.fillStyle = pc('n'); c.fillRect(0, Math.floor(r() * size / u) * u, size, u / 2); } // pink glitch line
  if (spiritCache.size > 300) spiritCache.clear();
  spiritCache.set(key, cv);
  return cv;
}

/** Spirit portrait: the hero avatar as a flickering cyberspace ghost. Same signature as drawHeroAvatar. */
export function drawSpiritPortrait(ctx, h, x, y, box, o = {}) {
  const cv = spiritFrame(h, box, o);
  const prev = ctx.imageSmoothingEnabled, ga = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  const ms = o.time ?? nowMs();
  ctx.globalAlpha = ga * (o.alpha ?? 1) * (Math.floor(ms / 90) % 11 === 0 ? 0.6 : 1); // rare brightness flicker
  ctx.drawImage(cv, x, y, box, box);
  ctx.globalAlpha = ga; ctx.imageSmoothingEnabled = prev;
}

/** Draws the animated portrait into the box x box square at (x, y). Spirit heroes (hero.spirit / opts.spirit) -> drawSpiritPortrait. */
export function drawHeroAvatar(ctx, h, x, y, box, o = {}) {
  if (o.spirit !== false && isSpirit(h, o) && !o._spiritBase) return drawSpiritPortrait(ctx, h, x, y, box, o);
  const cv = heroAvatarFrame(h, box, o);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const ga = ctx.globalAlpha;
  if (o.alpha != null) ctx.globalAlpha = ga * o.alpha;
  // breathing: up to +2 % zoom around the head (upper 40 %), clipped to the box
  const t = Math.floor(((o.time ?? nowMs()) / 1000) * FPS) / FPS;
  const k = o.still === true ? 0 : Math.round(box * 0.01 * (1 + Math.sin((t * 2 * Math.PI) / 3.6)));
  if (k > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, box, box); ctx.clip(); ctx.drawImage(cv, x - k / 2, y - k * 0.4, box + k, box + k); ctx.restore(); }
  else ctx.drawImage(cv, x, y, box, box);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingEnabled = prev;
}
