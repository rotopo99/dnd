// Low-poly characters and enemies of the 3D battle (docs/specs/3d.md §2, stage 2). One skinned mesh per template
// (rigid skinning: every part belongs to one of 11 bones — pelvis, torso, head, 2 x arm of 2, 2 x leg of 2), poses come
// from gfx/anim.js through the bone texture; same templates are drawn instanced (gfx/scene3d.js).
//   BONE, PARENT                         bone indices / parents
//   bodyType(u)                          -> 'humanoid' | 'robot' | 'beast' | 'drone' | 'mech' | 'spirit'
//   unitTemplate(u, {simple})            -> { key, type, mb, pivots (Float32Array 33), top, scale, hover, ranged }
//     heroes: humanoid by race (proportions, ears / horns / antenna / leaves / spikes) and class kit (pack, tank,
//     antenna, pads, cape), avatar head of ui/avatar3d.js (simple head with «Снизить эффекты»), clothes — hero.look;
//     enemies: silhouette by GFX.bodies rules (id / tags), colours of the 2D sprite; bosses x GFX.unit.bossScale.
import { GFX } from '../data/gfx.js';
import { SPRITES, heroSpriteIds, enemySpriteIds } from '../assets/sprites.js';
import { buildAvatarMesh } from '../ui/avatar3d.js';
import { heroLook3d } from '../ui/hero-avatar.js';
import { isMeleeWeapon } from '../rules/combat.js';
import { MeshBuilder, rampRGB } from './mesh.js';
import { ramp } from './models.js';

export const BONE = { pelvis: 0, torso: 1, head: 2, uaL: 3, faL: 4, uaR: 5, faR: 6, thL: 7, shL: 8, thR: 9, shR: 10 };
export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
const glowR = (k) => rampRGB([k, k, k]);

const dominant = (rows, y0 = 0, y1 = 99, skip = '') => {
  const n = {};
  rows.forEach((r, y) => { if (y >= y0 && y <= y1) for (const ch of r) if (ch !== '.' && ch !== '0' && ch !== ' ' && !skip.includes(ch)) n[ch] = (n[ch] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
};
const frame0 = (id) => SPRITES[id]?.frames?.[0] || [];

/** Silhouette of a unit: heroes — humanoid (spirit race — spirit); enemies — first GFX.bodies rule by id / tag. */
export function bodyType(u) {
  if (u.kind === 'hero') return u.raceId === 'cyber-spirit' || u.spirit ? 'spirit' : 'humanoid';
  const id = String(u.enemyId || u.id || '').split('^')[0], tags = u.tags || [];
  for (const r of GFX.bodies) {
    if (r.re && new RegExp(r.re).test(id)) return r.type;
    if (r.tag && tags.includes(r.tag)) return r.type;
  }
  return 'humanoid';
}

const tplCache = new Map();
export function unitTemplate(u, { simple = false } = {}) {
  const hero = u.kind === 'hero';
  const type = bodyType(u);
  const wk = u.weapon && !u.noAttack ? (isMeleeWeapon(u) ? 'melee' : 'ranged') : null;
  const base = String(u.enemyId || '').split('^')[0];
  const key = hero
    ? `h|${type}|${u.raceId}|${u.classId}|${heroLook3d(u).key}|${wk}|${simple ? 1 : 0}`
    : `e|${type}|${base || u.id}|${wk}|${u.boss ? 1 : 0}|${simple ? 1 : 0}`;
  let T = tplCache.get(key);
  if (T) return T;
  const ids = hero ? heroSpriteIds(u.raceId, u.classId, u.look) : enemySpriteIds(u.enemyId || u.id);
  const f0 = frame0(ids[0]), layer = ids[1] ? frame0(ids[1]) : [];
  const col = {
    body: dominant(layer, 7, 13) || dominant(f0, 7, 13) || '3',
    legs: dominant(f0, 13, 15) || dominant(f0, 11, 15) || '1',
    skin: dominant(f0, 1, 6) || '9',
    accent: dominant(f0, 0, 15, `${dominant(f0, 0, 15) || ''}${dominant(layer, 7, 13) || ''}`) || 'a',
  };
  const mb = new MeshBuilder().setBone(0);
  const pv = new Float32Array(33);
  const P = (b, x, y, z) => { pv[b * 3] = x; pv[b * 3 + 1] = y; pv[b * 3 + 2] = z; };
  const o = { hero, u, col, wk, simple, mb, P, base, tags: u.tags || [] };
  let top = 1.2, hover = false;
  if (type === 'beast') top = beast(o);
  else if (type === 'drone') { hover = GFX.hover.some((k) => base.includes(k)); top = drone(o, hover); }
  else if (type === 'mech') top = mech(o);
  else if (type === 'spirit') top = spirit(o);
  else top = humanoid(o, type === 'robot');
  const scale = GFX.unit.scale * (u.boss ? GFX.unit.bossScale : 1);
  T = { key, type, mb, pivots: pv, top, scale, hover, ranged: wk === 'ranged' };
  tplCache.set(key, T);
  return T;
}

// ---------------------------------------------------------------- weapon in the right hand (forearm bone)
function weapon(o, hx, hy, kind, big = 1) {
  const { mb } = o;
  mb.setBone(BONE.faR);
  if (kind === 'ranged') {
    mb.box(hx - 0.03 * big, hy - 0.05 * big, -0.04, hx + 0.03 * big, hy + 0.02 * big, 0.36 * big, ramp('2'), { ao: 0 });
    mb.box(hx - 0.02 * big, hy - 0.12 * big, 0.02, hx + 0.02 * big, hy - 0.04 * big, 0.08, ramp('1'), { ao: 0 });
  } else if (kind === 'melee') {
    mb.box(hx - 0.02, hy - 0.03, -0.06, hx + 0.02, hy + 0.02, 0.12, ramp('6'), { ao: 0 });
    mb.box(hx - 0.012, hy - 0.025, 0.12, hx + 0.012, hy + 0.035, 0.5 * big, ramp('4'), { ao: 0 });
  }
}

// ---------------------------------------------------------------- humanoid (heroes, people, androids)
function humanoid(o, robot) {
  const { mb, P, col, hero, u, simple } = o;
  const R = hero ? GFX.races[u.raceId] || {} : {};
  const w = R.w || 1, lm = R.limb || 1, h = R.h || 1, isBot = robot || R.robot || R.bone;
  let cloth = col.body;
  let avatar = null;
  if (hero) { const L = heroLook3d(u).look; if (L.cloth) cloth = L.cloth; if (!simple) avatar = buildAvatarMesh(L); }
  const rCloth = ramp(cloth), rLegs = ramp(R.bone ? '4' : col.legs), rSkin = avatar ? rampRGB(avatar.mats.skin) : ramp(isBot ? '3' : col.skin);
  const rDark = ramp('1'), rLimb = R.bone ? ramp('4') : rCloth;
  const hipY = 0.48 * h, shY = 0.9 * h, neckY = 0.95 * h, sx = 0.25 * w, lx = 0.09 * w;
  const t = 0.06 * lm;
  P(BONE.pelvis, 0, hipY, 0); P(BONE.torso, 0, hipY + 0.04, 0); P(BONE.head, 0, neckY, 0);
  P(BONE.uaL, sx, shY, 0); P(BONE.faL, sx, shY - 0.24 * h, 0); P(BONE.uaR, -sx, shY, 0); P(BONE.faR, -sx, shY - 0.24 * h, 0);
  P(BONE.thL, lx, hipY, 0); P(BONE.shL, lx, hipY * 0.5, 0); P(BONE.thR, -lx, hipY, 0); P(BONE.shR, -lx, hipY * 0.5, 0);
  // pelvis
  mb.setBone(BONE.pelvis).box(-0.16 * w, hipY - 0.09, -0.1, 0.16 * w, hipY + 0.06, 0.1, rLegs, { ao: 0 });
  // torso
  mb.setBone(BONE.torso);
  if (isBot) mb.bevelBox(-0.18 * w, hipY + 0.04, -0.11, 0.18 * w, shY + 0.04, 0.12, 0.04, rCloth, { ao: 0 });
  else mb.cyl(0, hipY + 0.04, 0, shY - hipY + 0.02, 0.15 * w, rCloth, { seg: 6, r1: 0.2 * w, ao: 0, rot: Math.PI / 6 });
  mb.box(-0.155 * w, hipY + 0.03, -0.115, 0.155 * w, hipY + 0.09, 0.115, rDark, { ao: 0 }); // belt
  kit(o, GFX.classes[u.classId] || (hero ? 'pack' : null), sx, shY, hipY, rCloth);
  if (R.leaves) for (const s of [-1, 1]) mb.wedge(s * sx - 0.09, shY - 0.02, -0.08, s * sx + 0.09, shY + 0.12, 0.08, ramp('j'), { ao: 0 });
  if (R.spikes) for (const s of [-1, 0, 1]) mb.cyl(s * 0.08, shY - 0.15 + Math.abs(s) * 0.05, -0.27, 0.15, 0.002, ramp('4'), { axis: 'z', seg: 4, r1: 0.035, ao: 0 });
  // head
  mb.setBone(BONE.head);
  let top = neckY + 0.3;
  if (avatar) {
    const RM = {};
    for (const [k, v] of Object.entries(avatar.mats)) { RM[k] = rampRGB(v); RM[k].glow = !!v.glow; }
    const hs = GFX.unit.headScale, hy = neckY + 0.75 * hs;
    for (const f of avatar.faces) {
      const cy = f.v.reduce((s, p) => s + p[1], 0) / f.v.length;
      if (cy < -0.72) continue; // the bust's shoulders: the body has its own
      const pts = f.v.map((p) => [p[0] * hs, hy + p[1] * hs, p[2] * hs]);
      const rr = RM[f.m] || RM.skin;
      mb._poly(pts, rr, { glow: rr.glow, inside: [0, hy, 0] });
      for (const p of pts) top = Math.max(top, p[1]);
    }
  } else top = simpleHead(o, neckY, isBot, hero ? rSkin : null);
  const hc = neckY + 0.17;
  if (R.ears) for (const s of [-1, 1]) mb.cyl(s * 0.13, hc + 0.05, -0.02, 0.16, 0.05, rSkin, { seg: 4, r1: 0, ao: 0 });
  if (R.horns) for (const s of [-1, 1]) mb.cyl(s * 0.09, hc + 0.12, 0, 0.16, 0.035, ramp('5'), { seg: 5, r1: 0, ao: 0 });
  if (R.antenna) { mb.cyl(0.1, hc + 0.1, -0.03, 0.22, 0.012, ramp('3'), { seg: 4, ao: 0 }); mb.box(0.085, hc + 0.32, -0.045, 0.115, hc + 0.35, -0.015, glowR('h'), { glow: true, ao: 0 }); top = Math.max(top, hc + 0.35); }
  // arms: upper (cloth), forearm (cloth / skin), hand
  for (const s of [1, -1]) {
    const x = s * sx, ua = s > 0 ? BONE.uaL : BONE.uaR, fa = s > 0 ? BONE.faL : BONE.faR, ey = shY - 0.24 * h, wy = shY - 0.45 * h;
    mb.setBone(ua).box(x - t, ey, -t, x + t, shY + 0.04, t, rLimb, { ao: 0 });
    mb.setBone(fa).box(x - t * 0.85, wy, -t * 0.85, x + t * 0.85, ey, t * 0.85, isBot ? rLimb : rCloth, { ao: 0 });
    mb.box(x - t * 0.8, wy - 0.07, -t * 0.8, x + t * 0.8, wy, t * 0.8, rSkin, { ao: 0 });
  }
  weapon(o, -sx, shY - 0.48 * h, o.wk);
  // legs: thigh, shin, boot
  for (const s of [1, -1]) {
    const x = s * lx, th = s > 0 ? BONE.thL : BONE.thR, sh = s > 0 ? BONE.shL : BONE.shR, kn = hipY * 0.5, tl = t * 1.25;
    mb.setBone(th).box(x - tl, kn, -tl, x + tl, hipY - 0.02, tl, rLegs, { ao: 0 });
    mb.setBone(sh).box(x - tl * 0.9, 0.08, -tl * 0.9, x + tl * 0.9, kn, tl * 0.9, rLegs, { ao: 0 });
    mb.box(x - tl, 0, -tl, x + tl, 0.08, tl + 0.06, rDark, { ao: 0.3 });
  }
  return top;
}

/** Enemy / simplified head: skin ball + hair cap; machines and hybrids — helmet with a glowing visor. */
function simpleHead(o, neckY, bot, skinR) {
  const { mb, col, tags } = o;
  const hr = 0.15, hy = neckY + 0.02;
  const visor = bot || tags.includes('mechanical') || tags.includes('hybrid');
  mb.cyl(0, hy, 0, hr * 1.9, hr, skinR || ramp(visor ? '3' : col.skin), { seg: 7, r1: hr * 0.85, ao: 0 });
  if (visor) mb.box(-hr * 0.7, hy + hr * 0.9, hr * 0.62, hr * 0.7, hy + hr * 1.25, hr * 0.9, glowR(tags.includes('hybrid') ? 'n' : 'c'), { glow: true, ao: 0 });
  else {
    mb.cyl(0, hy + hr * 1.5, -0.01, hr * 0.5, hr * 0.95, ramp(col.legs === col.skin ? '1' : col.legs), { seg: 7, r1: hr * 0.5, ao: 0 });
    for (const s of [-1, 1]) mb.box(s * hr * 0.35 - 0.018, hy + hr * 1.05, hr * 0.8, s * hr * 0.35 + 0.018, hy + hr * 1.2, hr * 0.92, ramp('0'), { ao: 0 });
  }
  return hy + hr * 2;
}

/** Class kit on the torso bone: pack / tank / antenna / pads / cape / spikes. */
function kit(o, k, sx, shY, hipY, rCloth) {
  const { mb } = o;
  if (!k || k === 'none') return;
  if (k === 'pack' || k === 'antenna') {
    mb.box(-0.13, hipY + 0.12, -0.24, 0.13, shY - 0.02, -0.11, ramp(o.col.accent === o.col.body ? '6' : '7'), { ao: 0 });
    if (k === 'antenna') { mb.cyl(0.08, shY - 0.02, -0.2, 0.42, 0.012, ramp('3'), { seg: 4, ao: 0 }); mb.box(0.065, shY + 0.38, -0.215, 0.095, shY + 0.42, -0.185, glowR('h'), { glow: true, ao: 0 }); }
  } else if (k === 'tank') {
    for (const s of [-1, 1]) mb.cyl(s * 0.07, hipY + 0.1, -0.18, shY - hipY - 0.06, 0.065, ramp(s > 0 ? 'j' : '3'), { seg: 6, ao: 0 });
  } else if (k === 'pads') {
    for (const s of [-1, 1]) mb.bevelBox(s * sx - 0.1, shY - 0.04, -0.1, s * sx + 0.1, shY + 0.07, 0.1, 0.03, ramp('3'), { ao: 0 });
  } else if (k === 'cape') {
    mb.quad([-0.2, shY, -0.13], [0.2, shY, -0.13], [0.26, hipY * 0.45, -0.24], [-0.26, hipY * 0.45, -0.24], rCloth, { inside: [0, hipY, 0] });
    mb.quad([-0.2, shY, -0.135], [-0.26, hipY * 0.45, -0.245], [0.26, hipY * 0.45, -0.245], [0.2, shY, -0.135], ramp('1'), { inside: [0, hipY, -1] });
  } else if (k === 'spikes') {
    for (const s of [-1, 1]) mb.cyl(s * sx, shY + 0.04, 0, 0.14, 0.05, ramp('5'), { seg: 4, r1: 0, ao: 0 });
  }
}

// ---------------------------------------------------------------- beast (mutant wolves, crawlers, robo-wolves)
function beast(o) {
  const { mb, P, col, tags, base } = o;
  const metal = tags.includes('mechanical'), big = base.includes('biomass') || base.includes('panther') ? 1.15 : 1;
  const rBody = ramp(metal ? '3' : col.body), rLegs = ramp(metal ? '2' : col.legs), rHead = ramp(metal ? '4' : col.body);
  const y = 0.42 * big, L = 0.32 * big;
  P(BONE.pelvis, 0, y, -0.15); P(BONE.torso, 0, y, 0.0); P(BONE.head, 0, y + 0.12, L + 0.04);
  P(BONE.uaL, 0.13, y - 0.04, L * 0.7); P(BONE.faL, 0.13, y * 0.5, L * 0.7); P(BONE.uaR, -0.13, y - 0.04, L * 0.7); P(BONE.faR, -0.13, y * 0.5, L * 0.7);
  P(BONE.thL, 0.13, y - 0.04, -L); P(BONE.shL, 0.13, y * 0.5, -L); P(BONE.thR, -0.13, y - 0.04, -L); P(BONE.shR, -0.13, y * 0.5, -L);
  mb.setBone(BONE.pelvis).bevelBox(-0.17, y - 0.12, -L - 0.12, 0.17, y + 0.14, 0.02, 0.04, rBody, { ao: 0 });
  mb.cyl(0, y + 0.08, -L - 0.42, 0.32, 0.015, rBody, { axis: 'z', seg: 4, r1: 0.04, ao: 0, rot: Math.PI / 4 }); // tail
  mb.setBone(BONE.torso).bevelBox(-0.2, y - 0.14, 0, 0.2, y + 0.2, L + 0.06, 0.05, rBody, { ao: 0 });
  if (o.wk === 'ranged') mb.box(-0.04, y + 0.2, 0, 0.04, y + 0.27, L + 0.2, ramp('2'), { ao: 0 }); // back gun
  mb.setBone(BONE.head).bevelBox(-0.12, y + 0.02, L + 0.04, 0.12, y + 0.24, L + 0.24, 0.03, rHead, { ao: 0 });
  mb.box(-0.07, y + 0.0, L + 0.24, 0.07, y + 0.12, L + 0.4, rHead, { ao: 0 }); // snout
  for (const s of [-1, 1]) {
    mb.box(s * 0.07 - 0.025, y + 0.15, L + 0.23, s * 0.07 + 0.025, y + 0.19, L + 0.245, glowR(metal ? 'c' : 'b'), { glow: true, ao: 0 });
    mb.cyl(s * 0.08, y + 0.22, L + 0.1, 0.12, 0.045, rHead, { seg: 4, r1: 0, ao: 0 });
  }
  for (const [ua, fa, x, z] of [[BONE.uaL, BONE.faL, 0.13, L * 0.7], [BONE.uaR, BONE.faR, -0.13, L * 0.7], [BONE.thL, BONE.shL, 0.13, -L], [BONE.thR, BONE.shR, -0.13, -L]]) {
    mb.setBone(ua).box(x - 0.05, y * 0.5, z - 0.06, x + 0.05, y, z + 0.06, rLegs, { ao: 0 });
    mb.setBone(fa).box(x - 0.04, 0, z - 0.045, x + 0.04, y * 0.5, z + 0.05, rLegs, { ao: 0.3 });
  }
  return y + 0.3;
}

// ---------------------------------------------------------------- drone / turret / node
function drone(o, hover) {
  const { mb, P, col } = o;
  const y = hover ? 0.8 : 0.55, rB = ramp(col.body === '0' ? '3' : col.body), rS = ramp('3'), eye = glowR(o.tags.includes('digital') ? 'h' : 'c');
  P(BONE.pelvis, 0, y, 0); P(BONE.torso, 0, y + 0.12, 0); P(BONE.head, 0, y + 0.1, 0.2);
  P(BONE.uaL, 0.24, y + 0.05, 0); P(BONE.faL, 0.4, y + 0.05, 0); P(BONE.uaR, -0.24, y + 0.05, 0); P(BONE.faR, -0.4, y + 0.05, 0);
  P(BONE.thL, 0.12, y - 0.1, 0); P(BONE.shL, 0.2, y * 0.5, 0); P(BONE.thR, -0.12, y - 0.1, 0); P(BONE.shR, -0.2, y * 0.5, 0);
  mb.setBone(BONE.pelvis).cyl(0, y - 0.12, 0, 0.24, 0.26, rB, { seg: 8, r1: 0.24, ao: 0, bottom: true });
  mb.setBone(BONE.torso).cyl(0, y + 0.12, 0, 0.14, 0.22, rS, { seg: 8, r1: 0.1, ao: 0 });
  mb.setBone(BONE.head).box(-0.09, y + 0.0, 0.2, 0.09, y + 0.1, 0.28, eye, { glow: true, ao: 0 });
  for (const s of [1, -1]) {
    const ua = s > 0 ? BONE.uaL : BONE.uaR, fa = s > 0 ? BONE.faL : BONE.faR;
    mb.setBone(ua).box(s > 0 ? 0.22 : -0.42, y + 0.02, -0.04, s > 0 ? 0.42 : -0.22, y + 0.08, 0.04, rS, { ao: 0 });
    mb.setBone(fa);
    if (hover) mb.cyl(s * 0.46, y + 0.08, 0, 0.03, 0.16, ramp('1'), { seg: 8, ao: 0, bottom: true });
    else mb.cyl(s * 0.4, y + 0.05, -0.05, 0.42, 0.045, ramp('2'), { axis: 'z', seg: 6, ao: 0 });
  }
  if (!hover) for (const s of [1, -1]) { // tripod legs
    mb.setBone(s > 0 ? BONE.thL : BONE.thR).box(s * 0.12 - 0.03, y * 0.5, -0.03, s * 0.12 + 0.03, y - 0.1, 0.03, rS, { ao: 0 });
    mb.setBone(s > 0 ? BONE.shL : BONE.shR).box(s * 0.2 - 0.035, 0, -0.035, s * 0.2 + 0.035, y * 0.5, 0.035, rS, { ao: 0.3 });
  }
  else mb.setBone(BONE.pelvis).cyl(0, 0.0, 0, 0.01, 0.01, rS, { seg: 3, ao: 0 });
  if (!hover) mb.setBone(BONE.pelvis).cyl(0, 0, -0.12, y * 0.6, 0.04, rS, { seg: 5, ao: 0 });
  return y + 0.3;
}

// ---------------------------------------------------------------- mech (walkers, golems, junk mechs)
function mech(o) {
  const { mb, P, col } = o;
  const rB = ramp(col.body === '0' ? '3' : col.body), rS = ramp('3'), rD = ramp('2'), hipY = 0.68, shY = 1.22;
  P(BONE.pelvis, 0, hipY, 0); P(BONE.torso, 0, hipY + 0.05, 0); P(BONE.head, 0, shY, 0.1);
  P(BONE.uaL, 0.42, shY - 0.05, 0); P(BONE.faL, 0.46, shY - 0.35, 0); P(BONE.uaR, -0.42, shY - 0.05, 0); P(BONE.faR, -0.46, shY - 0.35, 0);
  P(BONE.thL, 0.2, hipY, 0); P(BONE.shL, 0.2, hipY * 0.5, 0.06); P(BONE.thR, -0.2, hipY, 0); P(BONE.shR, -0.2, hipY * 0.5, 0.06);
  mb.setBone(BONE.pelvis).box(-0.28, hipY - 0.12, -0.18, 0.28, hipY + 0.08, 0.18, rD, { ao: 0 });
  mb.setBone(BONE.torso).bevelBox(-0.36, hipY + 0.06, -0.26, 0.36, shY + 0.06, 0.28, 0.07, rB, { ao: 0 });
  mb.box(-0.3, shY - 0.2, -0.36, 0.3, shY, -0.26, rS, { ao: 0 }); // exhaust block
  mb.setBone(BONE.head).bevelBox(-0.17, shY + 0.02, -0.02, 0.17, shY + 0.26, 0.3, 0.04, rS, { ao: 0 });
  mb.box(-0.13, shY + 0.1, 0.3, 0.13, shY + 0.18, 0.32, glowR('c'), { glow: true, ao: 0 });
  for (const s of [1, -1]) {
    const x = s * 0.46;
    mb.setBone(s > 0 ? BONE.uaL : BONE.uaR).bevelBox(x - 0.11, shY - 0.38, -0.12, x + 0.11, shY + 0.08, 0.12, 0.03, rB, { ao: 0 });
    mb.setBone(s > 0 ? BONE.faL : BONE.faR);
    if (s < 0) { mb.box(x - 0.09, shY - 0.6, -0.1, x + 0.09, shY - 0.35, 0.12, rS, { ao: 0 }); mb.cyl(x, shY - 0.52, 0.1, 0.42, 0.06, rD, { axis: 'z', seg: 6, ao: 0 }); }
    else mb.box(x - 0.1, shY - 0.72, -0.08, x + 0.1, shY - 0.35, 0.1, rS, { ao: 0 });
    mb.setBone(s > 0 ? BONE.thL : BONE.thR).bevelBox(s * 0.2 - 0.11, hipY * 0.5, -0.11, s * 0.2 + 0.11, hipY, 0.11, 0.03, rB, { ao: 0 });
    mb.setBone(s > 0 ? BONE.shL : BONE.shR).box(s * 0.2 - 0.09, 0.1, -0.06, s * 0.2 + 0.09, hipY * 0.5, 0.15, rS, { ao: 0 });
    mb.box(s * 0.2 - 0.13, 0, -0.14, s * 0.2 + 0.13, 0.1, 0.22, rD, { ao: 0.3 });
  }
  return shY + 0.3;
}

// ---------------------------------------------------------------- cyber spirit (digital enemies, spirit heroes)
function spirit(o) {
  const { mb, P, col, hero, u, simple } = o;
  const k = ['h', 'n', 'i', 'f', 'm'].includes(col.body) ? col.body : 'h';
  const rG = ramp(k), rI = ramp('i'), eye = glowR(k === 'n' ? 'h' : 'n');
  const y = 0.55, shY = 1.0;
  P(BONE.pelvis, 0, y, 0); P(BONE.torso, 0, y + 0.05, 0); P(BONE.head, 0, shY + 0.02, 0);
  P(BONE.uaL, 0.24, shY - 0.04, 0); P(BONE.faL, 0.26, shY - 0.27, 0); P(BONE.uaR, -0.24, shY - 0.04, 0); P(BONE.faR, -0.26, shY - 0.27, 0);
  P(BONE.thL, 0.08, y - 0.1, 0); P(BONE.shL, 0.08, y - 0.3, -0.05); P(BONE.thR, -0.08, y - 0.1, 0); P(BONE.shR, -0.08, y - 0.3, -0.05);
  mb.setBone(BONE.pelvis).cyl(0, 0.12, 0, y - 0.07, 0.04, rI, { seg: 6, r1: 0.17, ao: 0 });
  mb.setBone(BONE.torso).cyl(0, y + 0.05, 0, shY - y, 0.17, rG, { seg: 6, r1: 0.22, ao: 0 });
  mb.box(-0.06, y + 0.3, 0.17, 0.06, y + 0.38, 0.2, eye, { glow: true, ao: 0 });
  mb.setBone(BONE.head);
  let top = shY + 0.36;
  if (hero && !simple) {
    const av = buildAvatarMesh(heroLook3d(u).look), hs = GFX.unit.headScale, hy = shY + 0.02 + 0.75 * hs;
    for (const f of av.faces) {
      const cy = f.v.reduce((s, p) => s + p[1], 0) / f.v.length;
      if (cy < -0.72) continue;
      const pts = f.v.map((p) => [p[0] * hs, hy + p[1] * hs, p[2] * hs]);
      mb._poly(pts, f.m === 'skin' ? rG : rI, { inside: [0, hy, 0], glow: !!av.mats[f.m]?.glow });
      for (const p of pts) top = Math.max(top, p[1]);
    }
  } else {
    mb.cyl(0, shY + 0.03, 0, 0.3, 0.15, rG, { seg: 6, r1: 0.1, ao: 0 });
    mb.box(-0.1, shY + 0.16, 0.12, 0.1, shY + 0.21, 0.15, eye, { glow: true, ao: 0 });
  }
  for (const s of [1, -1]) {
    const x = s * 0.24;
    mb.setBone(s > 0 ? BONE.uaL : BONE.uaR).box(x - 0.045, shY - 0.27, -0.045, x + 0.045, shY + 0.02, 0.045, rG, { ao: 0 });
    mb.setBone(s > 0 ? BONE.faL : BONE.faR).cyl(s * 0.26, shY - 0.5, 0, 0.23, 0.015, rI, { seg: 5, r1: 0.04, ao: 0 });
    mb.setBone(s > 0 ? BONE.thL : BONE.thR).cyl(s * 0.08, y - 0.3, 0, 0.2, 0.012, rI, { seg: 4, r1: 0.04, ao: 0 });
    mb.setBone(s > 0 ? BONE.shL : BONE.shR).cyl(s * 0.08, y - 0.48, -0.05, 0.18, 0.0, rG, { seg: 4, r1: 0.03, ao: 0 });
  }
  if (o.wk) weapon(o, -0.26, shY - 0.52, o.wk === 'ranged' ? 'ranged' : null);
  return top;
}
