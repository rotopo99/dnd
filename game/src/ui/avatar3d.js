// 3D avatar of the hero (low-poly bust, own Canvas 2D renderer: projection, painter's sort, 3-tone flat light).
// No dependencies. Only STYLE palette colours: every material is a ramp [shadow, base, light] of palette keys.
//   LOOK_OPTIONS                          option lists with Russian names (UI)
//   defaultLook(race, gender, seed)       -> look { v, race, gender, skin, face {w,j,h}, hair, hairColor, beard, eyes, acc[], cloth }
//   buildAvatarMesh(look)                 -> mesh { faces, mats, count }  (<= MAX_FACES)
//   renderAvatar(ctx, mesh, {x,y,size,yaw,pitch,light,zoom})   draws into the size x size box (top-left x,y)
//   avatarToPortrait(look, size, opts)    -> cached offscreen canvas (HUD / dialogues)
//   isLook3d(look)                        -> true for the new object format (old hero.look is a palette key string)
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';

export const MAX_FACES = 600;
const pc = (k) => PALETTE[PALETTE_KEYS.indexOf(k)];

// ---------------------------------------------------------------- options
export const LOOK_OPTIONS = {
  gender: [{ id: 'm', name: 'Мужской' }, { id: 'f', name: 'Женский' }, { id: 'x', name: 'Не указан' }],
  skin: [{ id: 0, name: 'Светлая' }, { id: 1, name: 'Загар' }, { id: 2, name: 'Смуглая' }, { id: 3, name: 'Тёмная' }, { id: 4, name: 'Очень тёмная' }, { id: 5, name: 'Бледная' }],
  face: [{ id: 'w', name: 'Ширина лица' }, { id: 'j', name: 'Челюсть' }, { id: 'h', name: 'Высота лица' }],
  hair: [{ id: 'bald', name: 'Лысый' }, { id: 'crop', name: 'Ёжик' }, { id: 'short', name: 'Короткая' }, { id: 'fringe', name: 'Чёлка' }, { id: 'long', name: 'Длинные' },
    { id: 'tail', name: 'Хвост' }, { id: 'bun', name: 'Пучок' }, { id: 'mohawk', name: 'Ирокез' }, { id: 'spiky', name: 'Колючая' }, { id: 'dreads', name: 'Дреды' }, { id: 'afro', name: 'Кудри' }],
  hairColor: [{ id: 'black', name: 'Чёрный' }, { id: 'brown', name: 'Каштан' }, { id: 'ginger', name: 'Рыжий' }, { id: 'blond', name: 'Блонд' }, { id: 'grey', name: 'Седой' },
    { id: 'white', name: 'Белый' }, { id: 'green', name: 'Ядовито-зелёный' }, { id: 'pink', name: 'Кринж-розовый' }, { id: 'cyan', name: 'Кибер-циан' }],
  beard: [{ id: 'none', name: 'Нет' }, { id: 'stubble', name: 'Щетина' }, { id: 'mustache', name: 'Усы' }, { id: 'goatee', name: 'Эспаньолка' }, { id: 'full', name: 'Борода' }],
  eyes: [{ id: 'brown', name: 'Карие' }, { id: 'blue', name: 'Синие' }, { id: 'green', name: 'Зелёные' }, { id: 'grey', name: 'Серые' }, { id: 'amber', name: 'Янтарные' }, { id: 'red', name: 'Красные' }, { id: 'cyan', name: 'Циановые' }],
  acc: [{ id: 'scarEye', name: 'Шрам через глаз' }, { id: 'scarCheek', name: 'Шрам на щеке' }, { id: 'cyberEye', name: 'Кибер-глаз' }, { id: 'plate', name: 'Пластина на виске' },
    { id: 'antenna', name: 'Антенна' }, { id: 'jawImp', name: 'Имплант челюсти' }, { id: 'gasmask', name: 'Противогаз' }, { id: 'respirator', name: 'Респиратор' },
    { id: 'hood', name: 'Капюшон' }, { id: 'helmet', name: 'Каска' }, { id: 'goggles', name: 'Очки-гогглы' }, { id: 'eyepatch', name: 'Повязка на глазу' }, { id: 'bandana', name: 'Бандана' }],
};
const HAT_ACC = ['hood', 'helmet', 'bandana'];
const FACE_ACC = ['gasmask', 'respirator', 'goggles', 'eyepatch', 'cyberEye'];

const HAIR_RAMP = { black: ['0', '1', '2'], brown: ['6', '7', '8'], ginger: ['7', '8', 'e'], blond: ['8', 'a', 'b'], grey: ['2', '3', '4'], white: ['3', '4', '5'], green: ['k', 'j', 'j'], pink: ['o', 'n', 'n'], cyan: ['i', 'h', 'h'] };
const EYE_RAMP = { brown: '8', blue: 'f', green: 'j', grey: '4', amber: 'a', red: 'c', cyan: 'h' };
const SKIN_RAMP = [['8', '9', 'p'], ['7', '8', '9'], ['6', '7', '8'], ['1', '6', '7'], ['1', '6', '6'], ['3', 'p', '5']];
const DARKER = { c: 'd', a: '8', j: 'k', b: 'a', n: 'o', f: 'g', e: 'c', 4: '3', o: '1', h: 'i', 3: '2', 2: '1', 1: '0', 0: '0', 5: '4', 8: '7', 7: '6', 9: '8', l: 'k', m: 'l', g: '1', i: '1', k: '1', d: '6', p: 'm', 6: '1' };
const LIGHTER = { c: 'e', a: 'b', j: 'h', n: 'p', f: 'h', e: 'a', 4: '5', 3: '4', 2: '3', 1: '2', 0: '1', 8: '9', 7: '8', 9: 'p', l: 'm', m: 'p', k: 'j', g: 'f', i: 'h', 6: '7', o: 'n', d: 'c' };

// race id -> body kind of the avatar (unknown -> human)
const KIND = { human: 'human', skeleton: 'skeleton', android: 'android', 'mutant-beast': 'beast', 'mutant-plant': 'plant', tekhonok: 'tekhonok', cringegon: 'cringe', skrilet: 'beast' };
const kindOf = (race) => KIND[race] || 'human';

// ---------------------------------------------------------------- rng / defaults
export function rngOf(seed) {
  let s = (typeof seed === 'string' ? [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) : (seed | 0)) + 0x9e3779b9;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function isLook3d(look) { return !!look && typeof look === 'object' && look.v === 1; }

export function defaultLook(race = 'human', gender = 'x', seed = 1) {
  const r = rngOf(`${race}|${gender}|${seed}`);
  const pick = (a) => a[Math.floor(r() * a.length)].id;
  const kind = kindOf(race);
  const look = {
    v: 1, race, gender, skin: Math.floor(r() * 6), face: { w: +(r() * 1.2 - 0.6).toFixed(2), j: +(r() * 1.2 - 0.6).toFixed(2), h: +(r() * 1.2 - 0.6).toFixed(2) },
    hair: pick(LOOK_OPTIONS.hair), hairColor: pick(LOOK_OPTIONS.hairColor.slice(0, 5)), beard: gender === 'm' && r() < 0.4 ? pick(LOOK_OPTIONS.beard) : 'none',
    eyes: pick(LOOK_OPTIONS.eyes.slice(0, 5)), acc: [], cloth: null,
  };
  if (gender === 'f' && ['crop', 'mohawk'].includes(look.hair)) look.hair = 'long';
  if (kind === 'skeleton' || kind === 'android') { look.hair = 'bald'; look.beard = 'none'; look.eyes = kind === 'skeleton' ? 'red' : 'cyan'; }
  if (kind === 'tekhonok') look.acc = ['cyberEye', 'antenna'];
  if (kind === 'beast') { look.eyes = 'amber'; look.skin = 2; }
  if (kind === 'plant') look.eyes = 'amber';
  if (kind === 'cringe') { look.hairColor = 'pink'; look.skin = 5; }
  return look;
}

// ---------------------------------------------------------------- geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function newell(v) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
/** Adds a face; `center` (inside of the solid) orients the normal outward; `ds` — double sided (flat plates). */
function face(F, v, m, center, ds) {
  const w = [];
  for (const p of v) if (!w.length || Math.hypot(...sub(p, w[w.length - 1])) > 1e-4) w.push(p);
  if (w.length > 1 && Math.hypot(...sub(w[0], w[w.length - 1])) < 1e-4) w.pop();
  if (w.length < 3) return;
  let n = newell(w);
  if (center && !ds) {
    const c = [0, 0, 0];
    for (const p of w) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    const d = sub([c[0] / w.length, c[1] / w.length, c[2] / w.length], center);
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) { w.reverse(); n = [-n[0], -n[1], -n[2]]; }
  }
  F.push({ v: w, n, m, ds: !!ds });
}
/** Low-poly ellipsoid shell (rings of theta from t0 to t1 in [0, PI]); deform(p) -> p; mat may be a function of the face centre. */
function ell(F, c, r, o = {}) {
  const seg = o.seg || 10, rings = o.rings || 6, t0 = o.t0 ?? 0, t1 = o.t1 ?? Math.PI;
  const P = [];
  for (let i = 0; i <= rings; i++) {
    const th = t0 + ((t1 - t0) * i) / rings, row = [];
    for (let j = 0; j < seg; j++) {
      const ph = (2 * Math.PI * j) / seg, rr = Math.sin(th);
      let p = [c[0] + r[0] * rr * Math.sin(ph), c[1] + r[1] * Math.cos(th), c[2] + r[2] * rr * Math.cos(ph)];
      if (o.deform) p = o.deform(p);
      row.push(p);
    }
    P.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const v = [P[i][j], P[i][j2], P[i + 1][j2], P[i + 1][j]];
      if (o.skip && o.skip(v[0], v[2])) continue;
      const mid = [(v[0][0] + v[2][0]) / 2, (v[0][1] + v[2][1]) / 2, (v[0][2] + v[2][2]) / 2];
      face(F, v, typeof o.m === 'function' ? o.m(mid) : o.m, o.center || c, o.ds);
    }
  }
}
/** Tube between two points (open ends). */
function tube(F, a, b, ra, rb, m, seg = 6) {
  const d = sub(b, a), l = Math.hypot(...d) || 1, u = [d[0] / l, d[1] / l, d[2] / l];
  const t = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  const sl = Math.hypot(...s) || 1, S = [s[0] / sl, s[1] / sl, s[2] / sl];
  const T = [u[1] * S[2] - u[2] * S[1], u[2] * S[0] - u[0] * S[2], u[0] * S[1] - u[1] * S[0]];
  const ring = (p, r) => Array.from({ length: seg }, (_, j) => {
    const ph = (2 * Math.PI * j) / seg, cs = Math.cos(ph) * r, sn = Math.sin(ph) * r;
    return [p[0] + S[0] * cs + T[0] * sn, p[1] + S[1] * cs + T[1] * sn, p[2] + S[2] * cs + T[2] * sn];
  });
  const A = ring(a, ra), B = ring(b, rb), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let j = 0; j < seg; j++) face(F, [A[j], A[(j + 1) % seg], B[(j + 1) % seg], B[j]], m, c);
}
/** Flat plate on the front (z) surface, double sided. */
function plate(F, cx, cy, cz, w, h, m, rot = 0, dz = 0) {
  const co = Math.cos(rot), si = Math.sin(rot);
  const q = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [cx + x * co - y * si, cy + x * si + y * co, cz + (x > 0 ? dz : -dz)]);
  face(F, q, m, null, true);
}
function pyramid(F, c, w, h, d, m, center) {
  const b = [[c[0] - w, c[1], c[2] - d], [c[0] + w, c[1], c[2] - d], [c[0] + w, c[1], c[2] + d], [c[0] - w, c[1], c[2] + d]];
  const apex = [c[0], c[1] + h, c[2]];
  for (let i = 0; i < 4; i++) face(F, [b[i], b[(i + 1) % 4], apex], m, center || [c[0], c[1] - 0.05, c[2]]);
}
function box(F, c, r, m) {
  const [x, y, z] = c, [a, b, d] = r;
  const V = (sx, sy, sz) => [x + sx * a, y + sy * b, z + sz * d];
  const Q = [[V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1)], [V(1, -1, -1), V(-1, -1, -1), V(-1, 1, -1), V(1, 1, -1)], [V(-1, 1, 1), V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1)],
    [V(-1, -1, -1), V(1, -1, -1), V(1, -1, 1), V(-1, -1, 1)], [V(1, -1, 1), V(1, -1, -1), V(1, 1, -1), V(1, 1, 1)], [V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), V(-1, 1, -1)]];
  for (const q of Q) face(F, q, m, c);
}

/** Horizontal band around the head at height y (half-height hh). */
function band(F, y, hh, rx, rz, m) {
  const a = Math.asin(Math.min(1, hh / 0.5));
  ell(F, [0, y, -0.02], [rx, 0.5, rz], { seg: 10, rings: 1, t0: Math.PI / 2 - a, t1: Math.PI / 2 + a, m });
}

/** Mouth by emotion at height y, depth z, half-width w. */
function mouth(F, kind, y, z, w, fem) {
  const lipM = fem ? 'lip' : 'dark';
  if (kind === 'smile') {
    plate(F, 0, y - 0.012, z, w * 0.8, 0.03, 'dark', 0); plate(F, 0, y - 0.0, z + 0.004, w * 0.62, 0.012, 'white', 0);
    for (const s of [-1, 1]) plate(F, s * w * 0.9, y + 0.012, z, w * 0.3, 0.012, 'dark', s * 0.6);
  } else if (kind === 'smirk') {
    plate(F, -w * 0.25, y, z, w * 0.7, 0.014, lipM, 0); plate(F, w * 0.68, y + 0.016, z, w * 0.34, 0.013, lipM, 0.6);
  } else if (kind === 'frown') {
    plate(F, 0, y - 0.01, z, w * 0.55, 0.014, lipM, 0);
    for (const s of [-1, 1]) plate(F, s * w * 0.72, y - 0.03, z, w * 0.34, 0.013, lipM, -s * 0.6);
  } else if (kind === 'grit') {
    plate(F, 0, y - 0.005, z, w * 0.95, 0.032, 'white', 0); plate(F, 0, y - 0.005, z + 0.004, w * 0.95, 0.006, 'dark', 0);
    plate(F, 0, y + 0.03, z, w * 0.95, 0.008, 'dark', 0); plate(F, 0, y - 0.04, z, w * 0.95, 0.008, 'dark', 0);
  } else if (kind === 'gasp') {
    plate(F, 0, y - 0.015, z, w * 0.6, 0.04, 'dark', 0); plate(F, 0, y + 0.01, z + 0.004, w * 0.5, 0.01, 'white', 0);
  } else if (kind === 'o') {
    plate(F, 0, y - 0.03, z, 0.045, 0.06, 'dark', 0); plate(F, 0, y - 0.03, z + 0.004, 0.025, 0.04, 'red', 0);
  } else if (kind === 'wavy') {
    for (let i = 0; i < 4; i++) plate(F, (i - 1.5) * w * 0.5, y + (i % 2 ? 0.012 : -0.012), z, w * 0.26, 0.012, 'dark', i % 2 ? 0.5 : -0.5);
  } else plate(F, 0, y, z, w, fem ? 0.026 : 0.018, lipM, 0);
}

// ---------------------------------------------------------------- mesh
// emotion -> face params: eye = eye height factor, lift/liftR = brow raise (L/R), ang = brow tilt (> 0 inner ends up = sad/scared, < 0 = angry), mouth kind, visor colour (androids)
const EMO = {
  neutral: { eye: 1, lift: 0, ang: 0, mouth: 'flat', visor: 'h' },
  happy: { eye: 0.55, lift: 0.02, ang: 0.05, mouth: 'smile', visor: 'j' },
  angry: { eye: 0.8, lift: -0.02, ang: -0.5, mouth: 'grit', visor: 'c' },
  sad: { eye: 0.8, lift: 0, ang: 0.55, mouth: 'frown', visor: 'f' },
  scared: { eye: 1.5, lift: 0.06, ang: 0.3, mouth: 'gasp', visor: 'c', sweat: true },
  smug: { eye: 0.6, lift: 0.01, liftR: 0.06, ang: -0.12, mouth: 'smirk', visor: 'a' },
  surprised: { eye: 1.5, lift: 0.08, ang: 0, mouth: 'o', visor: 'b' },
  cringe: { eye: 0.7, lift: 0.03, ang: 0.35, mouth: 'wavy', visor: 'n', sweat: true },
};
export const AVATAR_EMOTIONS = Object.keys(EMO);
/** hp share (0..1) -> wound level 0..3 (same thresholds as the 2D portraits). */
export const woundLevel = (hp) => (hp == null ? 0 : hp < 0.15 ? 3 : hp < 0.4 ? 2 : hp < 0.7 ? 1 : 0);

/** st: { emo, lvl (wounds 0..3), nervous, blink } — face state; the default is the calm neutral face. */
export function buildAvatarMesh(lookIn, st = {}) {
  const look = isLook3d(lookIn) ? lookIn : defaultLook(lookIn?.race || 'human', 'x', 1);
  const kind = kindOf(look.race), g = look.gender, F = [];
  const acc = new Set(look.acc || []);
  const fc = { w: 0, j: 0, h: 0, ...(look.face || {}) };
  const clamp = (v) => Math.max(-1, Math.min(1, +v || 0));
  const fw = clamp(fc.w), fj = clamp(fc.j), fh = clamp(fc.h);

  // materials: name -> [shadow, base, light] (+ glow)
  const mats = {};
  const ramp = (a) => a.map(pc);
  const robot = kind === 'skeleton' || kind === 'android';
  let skin = SKIN_RAMP[Math.max(0, Math.min(5, look.skin | 0))];
  if (kind === 'skeleton') skin = ['3', '4', '5'];
  else if (kind === 'android') skin = ['2', '3', '4'];
  else if (kind === 'beast') skin = ['6', '7', '8'];
  else if (kind === 'plant') skin = ['k', 'j', 'j'];
  else if (kind === 'cringe') skin = SKIN_RAMP[5];
  mats.skin = ramp(skin);
  mats.stub = ramp([skin[0], skin[0], skin[1]]);
  mats.hair = ramp(HAIR_RAMP[look.hairColor] || HAIR_RAMP.brown);
  if (kind === 'plant') mats.hair = ramp(['k', 'j', 'j']);
  const cl = look.cloth && PALETTE_KEYS.includes(look.cloth) ? look.cloth : '3';
  mats.cloth = ramp([DARKER[cl] || '0', cl, LIGHTER[cl] || cl]);
  mats.clothD = ramp(['0', DARKER[cl] || '1', cl]);
  mats.dark = ramp(['0', '0', '1']);
  mats.metal = ramp(['1', '2', '3']);
  mats.metalL = ramp(['2', '3', '4']);
  mats.white = ramp(['4', '5', '5']);
  mats.eye = ramp([EYE_RAMP[look.eyes] || '8', EYE_RAMP[look.eyes] || '8', EYE_RAMP[look.eyes] || '8']); mats.eye.glow = true;
  mats.glow = ramp(['h', 'h', 'h']); mats.glow.glow = true;
  mats.amber = ramp(['a', 'a', 'b']); mats.amber.glow = true;
  mats.red = ramp(['c', 'c', 'c']); mats.red.glow = true;
  mats.lip = ramp(['d', 'c', 'c']);
  mats.blood = ramp(['d', 'd', 'c']);
  mats.blush = ramp(['n', 'n', 'n']);
  mats.glass = ramp(['i', 'a', 'a']); mats.glass.glow = true;
  mats.rust = ramp(['6', '7', '8']);
  mats.bandage = ramp(['4', '5', '5']);
  mats.bruise = ramp(['o', 'o', 'o']);
  const E = EMO[st.emo] || EMO.neutral, lvl = st.lvl | 0, eh = st.blink ? 0.1 : E.eye;
  mats.visor = ramp([E.visor, E.visor, E.visor]); mats.visor.glow = true;
  const BL = robot ? 'amber' : 'blood'; // «blood» of machines is oil sparks

  // proportions
  const fem = g === 'f', masc = g === 'm';
  const rx = (fem ? 0.5 : masc ? 0.54 : 0.52) * (1 + fw * 0.14);
  const ry = 0.62 * (1 + fh * 0.12), rz = 0.56;
  const jaw = (masc ? 0.12 : fem ? 0.42 : 0.28) + fj * 0.28 + (kind === 'skeleton' ? 0.15 : 0);
  const jx = (y) => 1 - jaw * 0.38 * Math.max(0, -y / ry);
  const sz = (x, y) => rz * Math.sqrt(Math.max(0.03, 1 - (x / (rx * jx(y))) ** 2 - (y / ry) ** 2));
  const headDeform = (p) => {
    const y = p[1];
    if (y < 0) { const t = -y / ry; p[0] *= jx(y); p[2] += t > 0.75 ? 0.04 * (t - 0.75) * 4 : 0; if (p[2] > 0 && t > 0.6) p[2] *= 1 - 0.1 * jaw; }
    return p;
  };
  const head = [0, 0, 0];

  // bust + neck
  const shoulder = (fem ? 0.78 : masc ? 1.0 : 0.88) * (kind === 'beast' ? 1.1 : 1);
  ell(F, [0, -1.28, -0.04], [0.86 * shoulder, 0.5, 0.46], { seg: 10, rings: 4, t1: Math.PI * 0.62, m: (m) => (m[1] > -1.05 ? 'cloth' : 'clothD') });
  if (kind === 'skeleton') ell(F, [0, -1.12, 0.12], [0.34, 0.26, 0.28], { seg: 8, rings: 3, t1: Math.PI * 0.6, m: 'white' }); // ribcage hint
  const nk = fem ? 0.15 : 0.2;
  tube(F, [0, -0.5, -0.04], [0, -0.98, -0.02], nk, nk * 1.08, kind === 'skeleton' ? 'dark' : 'skin', 8);
  tube(F, [0, -0.88, -0.02], [0, -1.02, -0.02], nk * 1.5, nk * 1.7, 'clothD', 8); // collar
  if (robot) { plate(F, 0, -1.0, 0.43, 0.26, 0.05, 'glow', 0, 0); }

  // head
  ell(F, head, [rx, ry, rz], { seg: 10, rings: 7, m: kind === 'android' ? ((m) => (m[2] > 0.2 && m[1] > 0.1 ? 'metalL' : 'skin')) : 'skin', deform: headDeform });
  // ears
  if (kind !== 'skeleton') {
    const big = kind === 'beast';
    for (const s of [-1, 1]) {
      if (kind === 'android') { ell(F, [s * (rx + 0.03), 0.02, -0.04], [0.05, 0.16, 0.16], { seg: 6, rings: 2, m: 'metal' }); continue; }
      ell(F, [s * (rx * 0.97), big ? 0.12 : 0.0, -0.06], [big ? 0.1 : 0.07, big ? 0.3 : 0.14, 0.09], { seg: 6, rings: 3, m: 'skin' });
    }
  }
  const covered = acc.has('gasmask');
  // eyes, brows
  const eyeY = 0.08, eyeX = rx * 0.4;
  const noEyes = kind === 'skeleton' || (kind === 'android' && !acc.has('goggles'));
  for (const s of [-1, 1]) {
    const x = s * eyeX, z = sz(x, eyeY) + 0.012;
    if (kind === 'skeleton') {
      plate(F, x, eyeY, z, 0.1, 0.1, 'dark', s * 0.12);
      plate(F, x, eyeY, z + 0.012, 0.035 * Math.max(0.5, eh), 0.035 * Math.max(0.5, eh), 'red', 0);
    } else if (kind === 'android') {
      // single visor band added below
    } else {
      if (s === 1 && acc.has('eyepatch')) continue;
      if (eh < 0.25) plate(F, x, eyeY - 0.01, z + 0.01, 0.1, 0.014, 'dark', 0); // closed eye: lash line
      else {
        plate(F, x, eyeY, z, 0.1, 0.055 * eh, 'white', 0);
        plate(F, x, eyeY, z + 0.01, 0.048, 0.05 * Math.min(eh, 1.15), s === 1 && (acc.has('cyberEye') || kind === 'tekhonok') ? 'red' : 'eye', 0);
        plate(F, x + s * 0.005, eyeY, z + 0.02, 0.02, 0.025 * Math.min(eh, 1.2), 'dark', 0);
        if (eh < 0.9) plate(F, x, eyeY + 0.055 * eh, z + 0.025, 0.105, 0.055 * (1 - eh) + 0.004, 'skin', 0); // lowered lid
      }
    }
    if (!robot) {
      const lift = (s === 1 && E.liftR != null ? E.liftR : E.lift) + (st.nervous ? 0.012 : 0);
      const bz = sz(x, eyeY + 0.14 + lift) + 0.012;
      plate(F, x, eyeY + 0.14 + lift, bz, 0.12, masc ? 0.032 : 0.018, 'hair', -s * ((masc ? 0.12 : 0.2) + E.ang));
    }
  }
  if (kind === 'android') {
    const z = sz(0, eyeY) + 0.02;
    plate(F, 0, eyeY, z, rx * 0.82, Math.max(0.012, 0.055 * eh), 'visor', 0, -0.07);
    plate(F, 0, eyeY + 0.3, sz(0, eyeY + 0.3) + 0.01, 0.02, 0.28, 'dark', 0); // panel seam
  }
  // nose
  const nz = sz(0, -0.08);
  if (kind === 'skeleton') {
    pyramid(F, [0, -0.2, nz + 0.01], 0.06, 0.12, 0.01, 'dark', [0, -0.1, 0]);
  } else if (kind === 'beast') {
    box(F, [0, -0.14, nz + 0.1], [0.14, 0.12, 0.12], 'skin');
    box(F, [0, -0.07, nz + 0.2], [0.06, 0.04, 0.03], 'dark');
    for (const s of [-1, 1]) pyramid(F, [s * 0.09, -0.3, nz + 0.12], 0.025, -0.1, 0.02, 'white', [s * 0.09, -0.35, nz]);
  } else if (!covered) {
    const nh = fem ? 0.9 : 1.1;
    const top = [0, 0.02, sz(0, 0.02) + 0.01], bl = [-0.07 * nh, -0.15, sz(0.07, -0.15)], br = [0.07 * nh, -0.15, sz(0.07, -0.15)], tip = [0, -0.12, nz + 0.1 * nh];
    face(F, [top, tip, bl], 'skin', [0, -0.1, 0.3]); face(F, [top, br, tip], 'skin', [0, -0.1, 0.3]); face(F, [bl, tip, br], 'skin', [0, -0.2, 0.2]);
  }
  // mouth + beard
  const beard = look.beard || 'none';
  const my = -0.31 - fh * 0.02;
  const mz = sz(0, my) + (beard === 'full' || beard === 'stubble' ? 0.06 : 0.012);
  if (!covered && !acc.has('respirator') && kind !== 'beast') {
    if (kind === 'skeleton') {
      plate(F, 0, my, mz, 0.17, 0.05, 'white', 0); plate(F, 0, my, mz + 0.01, 0.17, 0.008, 'dark', 0);
    } else mouth(F, E.mouth, my, mz + 0.01, fem ? 0.085 : 0.1, fem);
  }
  if (kind === 'skeleton' && ['o', 'gasp'].includes(E.mouth)) plate(F, 0, my - 0.05, mz + 0.02, 0.1, 0.07, 'dark', 0);
  if (!robot && kind !== 'beast' && !covered) {
    if (beard === 'stubble' || beard === 'full') {
      ell(F, head, [rx * 1.04, ry * 1.03, rz * 1.04], { seg: 10, rings: 4, t0: Math.PI * 0.56, t1: Math.PI * 0.97, m: beard === 'full' ? 'hair' : 'stub', deform: headDeform });
      if (beard === 'full') box(F, [0, -0.62, sz(0, -0.55) - 0.08], [0.14 * jx(-0.55) * 1.4, 0.14, 0.08], 'hair');
    }
    if (beard === 'mustache' || beard === 'full') plate(F, 0, my + 0.07, sz(0, my + 0.07) + 0.07, 0.12, 0.03, 'hair', 0, 0.02);
    if (beard === 'goatee') box(F, [0, -0.55, sz(0, -0.5) - 0.02], [0.05, 0.1, 0.04], 'hair');
  }
  if (kind === 'cringe') for (const s of [-1, 1]) plate(F, s * 0.28, -0.1, sz(0.28, -0.1) + 0.012, 0.06, 0.035, 'blush', 0);
  if (kind === 'plant') for (const s of [-1, 1]) plate(F, s * 0.3, -0.2, sz(0.3, -0.2) + 0.012, 0.012, 0.1, 'dark', s * 0.4);

  // ---- state: nervous (low morale) and wounds (hp share): scrapes, bruises, blood, bandages
  if (st.nervous || E.sweat) {
    for (const s2 of [-1, 1]) plate(F, s2 * eyeX, eyeY - 0.1, sz(s2 * eyeX, eyeY - 0.1) + 0.012, 0.09, 0.016, 'stub', 0);
    plate(F, rx * 0.78, 0.22, sz(rx * 0.78, 0.22) + 0.012, 0.028, 0.055, 'glow', 0.15);
  }
  if (lvl >= 1) {
    plate(F, -0.3, -0.12, sz(-0.3, -0.12) + 0.016, 0.1, 0.012, BL, 0.5);
    plate(F, -0.24, -0.17, sz(-0.24, -0.17) + 0.016, 0.05, 0.01, BL, 0.4);
  }
  if (lvl >= 2) {
    plate(F, -eyeX, eyeY - 0.1, sz(-eyeX, eyeY - 0.1) + 0.02, 0.11, 0.045, robot ? 'rust' : 'bruise', 0);
    plate(F, eyeX * 1.15, eyeY + 0.02, sz(eyeX, eyeY) + 0.022, 0.014, 0.1, BL, 0);
    band(F, 0.36, 0.08, rx * 1.07, rz * 1.07, 'bandage');
    plate(F, 0.12, 0.36, sz(0.12, 0.36) + 0.08, 0.05, 0.04, BL, 0.2);
  }
  if (lvl >= 3) {
    plate(F, 0.02, -0.2, sz(0, -0.2) + 0.045, 0.012, 0.07, BL, 0);
    plate(F, 0.3, -0.12, sz(0.3, -0.12) + 0.024, 0.1, 0.075, 'bandage', 0.2);
    plate(F, 0.3, -0.12, sz(0.3, -0.12) + 0.03, 0.07, 0.01, 'metal', 0.2);
    plate(F, eyeX, eyeY - 0.1, sz(eyeX, eyeY - 0.1) + 0.02, 0.11, 0.045, robot ? 'rust' : 'bruise', 0);
    plate(F, -0.1, -0.36, mz + 0.03, 0.012, 0.06, BL, 0);
    tube(F, [0, -0.66, -0.04], [0, -0.78, -0.04], nk * 1.28, nk * 1.28, 'bandage', 8);
  }

  // ---- hair
  const hairHidden = acc.has('helmet') || acc.has('hood') || kind === 'skeleton' || kind === 'android';
  const hs = look.hair || 'bald';
  const hairCap = (k, lift = 0.34, side = 0) => ell(F, [0, 0.03, -0.03], [rx * k, ry * k, rz * k], {
    seg: 10, rings: 4, t1: Math.PI * 0.56, m: 'hair',
    deform: (p) => { const q = headDeform([p[0], p[1] - 0.03, p[2] + 0.03]); q[1] += 0.03; q[2] -= 0.03; if (q[2] > 0) q[1] = Math.max(q[1], ry * (lift - (side && q[0] * side > 0 ? 0.14 : 0))); return q; },
  });
  if (kind === 'plant' && hs !== 'bald') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; pyramid(F, [Math.sin(a) * rx * 0.6, ry * 0.78, Math.cos(a) * rz * 0.5 - 0.05], 0.1, 0.34 + (i % 2) * 0.1, 0.03, 'hair', [0, ry * 0.5, -0.05]); }
  } else if (!hairHidden && hs !== 'bald') {
    if (hs === 'crop') hairCap(1.03, 0.55);
    else if (hs === 'short') hairCap(1.08, 0.4);
    else if (hs === 'fringe') hairCap(1.1, 0.12, 1);
    else if (hs === 'afro') hairCap(1.32, 0.2);
    else if (hs === 'long') { hairCap(1.1, 0.38); ell(F, [0, -0.5, -0.32], [rx * 1.05, 0.78, 0.26], { seg: 8, rings: 4, t0: Math.PI * 0.18, t1: Math.PI * 0.95, m: 'hair' }); }
    else if (hs === 'tail') { hairCap(1.08, 0.4); ell(F, [0, -0.35, -0.7], [0.12, 0.4, 0.12], { seg: 6, rings: 3, m: 'hair' }); }
    else if (hs === 'bun') { hairCap(1.08, 0.4); ell(F, [0, ry + 0.12, -0.12], [0.18, 0.17, 0.18], { seg: 7, rings: 3, m: 'hair' }); }
    else if (hs === 'mohawk') { hairCap(1.01, 0.62); for (let i = 0; i < 6; i++) pyramid(F, [0, ry * 0.78 - i * 0.045, 0.34 - i * 0.14], 0.035, 0.26 - Math.abs(i - 2) * 0.02, 0.09, 'hair', [0, 0.2, 0]); }
    else if (hs === 'spiky') { hairCap(1.05, 0.45); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pyramid(F, [Math.sin(a) * rx * 0.62, ry * 0.8, Math.cos(a) * rz * 0.5], 0.08, 0.26, 0.05, 'hair', [0, 0.2, 0]); } }
    else if (hs === 'dreads') {
      hairCap(1.08, 0.36);
      for (let i = 0; i < 9; i++) { const a = Math.PI * (0.45 + 1.1 * (i / 8)) * (i % 2 ? 1 : -1) + (i % 2 ? 0 : 0); tube(F, [Math.sin(a) * rx * 0.95, 0.35 - (i % 3) * 0.1, -0.1 + Math.cos(a) * rz * 0.7], [Math.sin(a) * rx * 1.15, -0.7 - (i % 3) * 0.12, -0.15 + Math.cos(a) * rz * 0.7], 0.05, 0.04, 'hair', 5); }
    }
  }

  // ---- implants and marks
  if (acc.has('scarEye')) { plate(F, -eyeX * 1.05, eyeY + 0.02, sz(-eyeX, eyeY) + 0.02, 0.016, 0.2, 'blood', 0.5); }
  if (acc.has('scarCheek')) { plate(F, eyeX * 1.5, -0.14, sz(eyeX * 1.5, -0.14) + 0.016, 0.1, 0.014, 'blood', -0.4); }
  if (acc.has('cyberEye') && !robot) { ell(F, [eyeX, eyeY, sz(eyeX, eyeY) - 0.02], [0.09, 0.09, 0.07], { seg: 6, rings: 2, m: 'metal' }); }
  if (acc.has('plate')) { plate(F, -rx * 0.9, 0.22, sz(-rx * 0.9, 0.22) - 0.12, 0.02, 0.14, 'metalL', 0, 0.12); plate(F, -rx * 0.88, 0.2, sz(-rx * 0.9, 0.22) - 0.1, 0.008, 0.06, 'glow', 0, 0.1); }
  if (acc.has('antenna')) { tube(F, [rx * 0.9, 0.35, -0.1], [rx * 1.1, 1.0, -0.15], 0.03, 0.015, 'metalL', 5); ell(F, [rx * 1.1, 1.03, -0.15], [0.05, 0.05, 0.05], { seg: 5, rings: 2, m: 'amber' }); }
  if (acc.has('jawImp')) { plate(F, rx * 0.5, -0.46, sz(rx * 0.5, -0.46) + 0.01, 0.12, 0.05, 'metalL', -0.55, 0.05); plate(F, rx * 0.5, -0.46, sz(rx * 0.5, -0.46) + 0.02, 0.05, 0.012, 'glow', -0.55, 0.05); }
  if (kind === 'tekhonok') plate(F, 0, 0.42, sz(0, 0.42) + 0.012, 0.012, 0.16, 'amber', 0);

  // ---- face / head gear
  if (acc.has('goggles')) {
    for (const s of [-1, 1]) ell(F, [s * eyeX, eyeY, sz(s * eyeX, eyeY) + 0.03], [0.13, 0.12, 0.05], { seg: 7, rings: 2, m: (m) => (m[2] > 0.5 ? 'glass' : 'metal') });
    band(F, eyeY, 0.04, rx * 1.03, rz * 1.03, 'clothD');
  }
  if (acc.has('eyepatch')) { plate(F, eyeX, eyeY, sz(eyeX, eyeY) + 0.02, 0.12, 0.09, 'dark', 0.1); plate(F, 0, eyeY + 0.06, sz(0, eyeY + 0.06) + 0.02, rx, 0.012, 'dark', -0.18, 0); }
  if (acc.has('respirator')) {
    box(F, [0, -0.27, sz(0, -0.27) + 0.07], [0.2, 0.16, 0.08], 'metalL');
    for (const s of [-1, 1]) ell(F, [s * 0.18, -0.34, sz(0.18, -0.34) + 0.06], [0.09, 0.09, 0.07], { seg: 6, rings: 2, m: 'metal' });
    band(F, -0.2, 0.03, rx * 1.0, rz * 1.0, 'dark');
  }
  if (acc.has('gasmask')) {
    ell(F, [0, -0.12, 0.1], [rx * 1.0, 0.52, rz * 0.9], { seg: 9, rings: 4, t0: Math.PI * 0.18, t1: Math.PI * 0.86, m: 'clothD', skip: (a) => a[2] < 0 });
    ell(F, [0, -0.3, sz(0, -0.3) + 0.12], [0.2, 0.2, 0.17], { seg: 7, rings: 3, m: 'metal' });
    ell(F, [0, -0.4, sz(0, -0.3) + 0.28], [0.09, 0.09, 0.09], { seg: 6, rings: 2, m: 'metalL' });
    for (const s of [-1, 1]) {
      ell(F, [s * eyeX, eyeY, sz(s * eyeX, eyeY) + 0.1], [0.13, 0.13, 0.06], { seg: 7, rings: 2, m: (m) => (m[2] > 0.58 ? 'glass' : 'metal') });
      ell(F, [s * 0.46, -0.25, 0.2], [0.1, 0.1, 0.1], { seg: 6, rings: 2, m: 'metalL' });
    }
  }
  if (acc.has('bandana')) band(F, 0.3, 0.09, rx * 1.07, rz * 1.07, 'red');
  if (acc.has('helmet')) {
    ell(F, [0, 0.07, -0.03], [rx * 1.12, ry * 1.0, rz * 1.12], { seg: 10, rings: 4, t1: Math.PI * 0.55, m: (m) => (m[1] > 0.45 ? 'metalL' : 'metal') });
    ell(F, [0, 0.07, -0.03], [rx * 1.14, 0.06, rz * 1.18], { seg: 10, rings: 1, t0: Math.PI * 0.5, t1: Math.PI * 0.58, m: 'rust' });
    box(F, [0, 0.4, sz(0, 0.4) + 0.1], [0.05, 0.04, 0.05], 'amber');
  }
  if (acc.has('hood')) {
    ell(F, [0, 0.02, -0.12], [rx * 1.24, ry * 1.14, rz * 1.22], { seg: 10, rings: 5, t1: Math.PI * 0.85, m: 'cloth', skip: (a, b) => (a[2] + b[2]) / 2 > 0.28 && Math.abs(a[0] + b[0]) / 2 < rx * 0.78 && (a[1] + b[1]) / 2 < ry * 0.8 });
  }
  void HAT_ACC; void FACE_ACC;

  return { faces: F, mats, count: F.length, look };
}

// ---------------------------------------------------------------- render
const LIGHT0 = [-0.45, 0.6, 0.66];
const lowRes = new Map();
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
const OUT = () => pc('0');

/** Rasterises the mesh into a square canvas context of `px` pixels. */
function raster(c, mesh, px, yaw, pitch, light, zoom) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const L = (() => { const l = light || LIGHT0, m = Math.hypot(l[0], l[1], l[2]) || 1; return [l[0] / m, l[1] / m, l[2] / m]; })();
  const s = (px / 2.7) * zoom, ox = px / 2, oy = px / 2 - 0.4 * s;
  const rot = (p) => { const x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy, y = p[1] * cp - z * sp; return [x, y, p[1] * sp + z * cp]; };
  const rotN = rot;
  const out = [];
  for (const f of mesh.faces) {
    const n = rotN(f.n);
    if (!f.ds && n[2] <= 0.02) continue;
    const pts = f.v.map(rot);
    let z = 0; for (const p of pts) z += p[2];
    const nn = f.ds && n[2] < 0 ? [-n[0], -n[1], -n[2]] : n;
    out.push({ f, pts, z: z / pts.length, d: nn[0] * L[0] + nn[1] * L[1] + nn[2] * L[2] });
  }
  out.sort((a, b) => a.z - b.z);
  c.clearRect(0, 0, px, px);
  c.lineJoin = 'round';
  const path = (pts) => { c.beginPath(); pts.forEach((p, i) => { const X = ox + p[0] * s, Y = oy - p[1] * s; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); };
  c.fillStyle = OUT(); c.strokeStyle = OUT(); c.lineWidth = Math.max(1.6, px / 48);
  for (const o of out) { path(o.pts); c.stroke(); c.fill(); }
  for (const o of out) {
    const m = mesh.mats[o.f.m] || mesh.mats.skin;
    const col = m.glow ? m[1] : o.d > 0.5 ? m[2] : o.d > 0.05 ? m[1] : m[0];
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.7;
    path(o.pts); c.fill(); c.stroke();
  }
  return out.length;
}

/** Draws the avatar into the size x size box at (x, y). yaw: radians (0 = front), pitch: radians. */
export function renderAvatar(ctx, mesh, { x = 0, y = 0, size = 192, yaw = 0.3, pitch = 0.05, light = null, zoom = 1 } = {}) {
  const px = Math.max(48, Math.min(160, Math.round(size / 2.5)));
  let cv = lowRes.get(px);
  if (!cv) { cv = makeCanvas(px, px); lowRes.set(px, cv); }
  const c = cv.getContext('2d');
  raster(c, mesh, px, yaw, pitch, light, zoom);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, x, y, size, size);
  ctx.imageSmoothingEnabled = prev;
}

const portraitCache = new Map();
/** Offscreen canvas `size` x size with the avatar on a dark panel (cached by look+size+yaw). */
export function avatarToPortrait(look, size = 96, { yaw = 0.3, pitch = 0.05, bg = true, zoom = 1.25 } = {}) {
  const key = `${JSON.stringify(look)}|${size}|${yaw}|${pitch}|${bg}|${zoom}`;
  let cv = portraitCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  if (bg) { c.fillStyle = pc('1'); c.fillRect(0, 0, size, size); c.fillStyle = pc('2'); c.fillRect(0, size * 0.72, size, size * 0.28); }
  renderAvatar(c, buildAvatarMesh(look), { x: 0, y: 0, size, yaw, pitch, zoom });
  if (portraitCache.size > 60) portraitCache.clear();
  portraitCache.set(key, cv);
  return cv;
}
