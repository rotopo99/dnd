// Stylised characters and enemies of the 3D battle (docs/specs/3d.md §2, stage 2 + model pass). One skinned mesh per
// template (rigid skinning: every part belongs to one of 11 bones — pelvis, torso, head, 2 x arm of 2, 2 x leg of 2),
// poses come from gfx/anim.js through the bone texture; same templates are drawn instanced (gfx/scene3d.js).
// Shapes are smooth lofted profiles (gfx/gear3d.js loft / limb) with baked AO at the joints; heads are the avatar of
// ui/avatar3d.js (heroes, companions, NPCs and enemies: same generator by race / gender / seed).
//   BONE, PARENT                         bone indices / parents
//   bodyType(u)                          -> 'humanoid' | 'robot' | 'beast' | 'drone' | 'mech' | 'spirit'
//   unitTemplate(u, {simple, lod})       -> { key, type, mb, pivots (Float32Array 33), top, scale, hover, ranged }
//     simple — «Снизить эффекты» (simple head), lod — far zoom (simple head, no small details / fingers / pouches)
//   heroes: race (silhouette, ears / horns / antenna / leaves / spikes / bones), gender (separate female silhouette),
//     armour type (cloth / light / medium / heavy / mech: plates, pauldrons, greaves, pouches), class kit (pack, tank,
//     antenna, pads, cape), weapon of the hand by type, off-hand (shield / side / tool); u.hide = {helm, armor, pads, pack,
//     weapon, cloak} hides a slot on the model only (the weapon is then shown holstered);
//   enemies: silhouette by GFX.bodies, faction details (cult robes, pirate sash, warprom rig, ...), race by faction.
import { GFX } from '../data/gfx.js';
import { ENEMIES } from '../data/index.js';
import { SPRITES, heroSpriteIds, enemySpriteIds } from '../assets/sprites.js';
import { buildAvatarMesh, defaultLook, rngOf } from '../ui/avatar3d.js';
import { heroLook3d } from '../ui/hero-avatar.js';
import { isMeleeWeapon } from '../rules/combat.js';
import { MeshBuilder, rampRGB } from './mesh.js';
import { NBONES } from './gl.js';
import { resample, surfGrid, sweep, headShape, buildHead, buildHair, hairGrad } from './body3d.js';
import { ramp } from './models.js';
import { loft, limb, beam, tube, weapon, weaponKind, offhand } from './gear3d.js';

// 0..10 body; 11..13 back-hair / ponytail chain, 14..15 cape chain, 16..17 bust, 18..19 side locks, 20..21 butt, 22 skirt hem
// (11..22 are spring bones, gfx/anim.js: they follow the unit's motion with a lag)
export const BONE = { pelvis: 0, torso: 1, head: 2, uaL: 3, faL: 4, uaR: 5, faR: 6, thL: 7, shL: 8, thR: 9, shR: 10, hair1: 11, hair2: 12, hair3: 13, cloak1: 14, cloak2: 15, bustL: 16, bustR: 17, sideL: 18, sideR: 19, buttL: 20, buttR: 21, skirt: 22 };
export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9, 2, 11, 12, 1, 14, 1, 1, 2, 2, 0, 0, 0];
const glowR = (k) => rampRGB([k, k, k]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

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

// ---------------------------------------------------------------- profile: faction / armour / race of a unit
const ARMOR = ['cloth', 'light', 'medium', 'heavy', 'mech'];
const FACTION_ARMOR = { cult: 'cloth', pirates: 'light', warprom: 'medium', aiParty: 'light', tinBrotherhood: 'medium', renegades: 'light', mechanids: 'medium', cringegons: 'cloth', scavengers: 'light', tekhonki: 'light', neutralVillages: 'cloth', agrozone: 'light', mutantsPlant: 'cloth', mutantsBeast: 'cloth' };
const FACTION_RACE = { mutantsPlant: 'mutant-plant', mutantsBeast: 'mutant-beast', cringegons: 'cringegon', tekhonki: 'tekhonok' };
const FACTION_ACC = { pirates: ['bandana'], cult: ['hood'], warprom: ['helmet'], aiParty: ['goggles'], tinBrotherhood: ['helmet'], renegades: ['respirator'], mechanids: ['cyberEye', 'jawImp'], scavengers: ['goggles'], agrozone: ['respirator'] };
const factionOf = (id) => {
  const d = ENEMIES[id];
  if (d && d.faction !== undefined) return d.faction || null;
  return d ? 'cult' : null; // the v1 enemies (cultists, acolytes, skrilets, scavengers ...) are the Judge's cult
};
function profile(u, type, base) {
  const hero = u.kind === 'hero', def = hero ? null : ENEMIES[base] || ENEMIES[u.enemyId] || null;
  const faction = hero ? null : factionOf(base);
  let armor = hero ? (u.armorType || (u.team === 'npc' ? 'cloth' : 'light')) : def?.armorType || FACTION_ARMOR[faction] || 'light';
  if (!hero && !def?.armorType) {
    const bump = def?.boss ? 3 : def?.rank === 'elite' || def?.rank === 'miniboss' ? 1 : 0;
    armor = ARMOR[Math.min(3, ARMOR.indexOf(armor) + bump)];
  }
  let race = hero ? u.raceId || 'human' : /skrilet/.test(base) ? 'skrilet' : FACTION_RACE[faction] || (type === 'robot' ? (faction === 'tinBrotherhood' ? 'skeleton' : 'android') : 'human');
  const r = rngOf(`${base}|${u.id}`);
  let gender = hero ? 'x' : r() < 0.4 ? 'f' : 'm';
  if (hero) gender = heroLook3d(u).look.gender || 'x';
  const hide = hero && u.hide ? u.hide : {};
  return { hero, def, faction, armor: hide.armor ? 'cloth' : armor, race, gender, hide, f: gender === 'f', off: hero ? u.offhand?.kind || null : null, rank: def?.rank || null, seed: r() };
}
const enemyLooks = new Map();
function enemyLook(base, pf) {
  const k = `${base}|${pf.race}|${pf.gender}`;
  let L = enemyLooks.get(k);
  if (!L) {
    L = defaultLook(pf.race, pf.gender, base);
    const acc = FACTION_ACC[pf.faction];
    if (acc) L.acc = pf.faction === 'pirates' && pf.seed < 0.5 ? ['eyepatch', 'bandana'] : pf.faction === 'scavengers' && pf.seed < 0.5 ? ['gasmask'] : [...acc];
    enemyLooks.set(k, L);
  }
  return L;
}

const tplCache = new Map();
export function unitTemplate(u, { simple = false, lod = false } = {}) {
  const hero = u.kind === 'hero';
  const type = bodyType(u);
  const melee = isMeleeWeapon(u);
  const wk = u.weapon && !u.noAttack ? weaponKind(u, melee) : null;
  const base = String(u.enemyId || '').split('^')[0];
  const pf = profile(u, type, base);
  const ks = `${simple ? 1 : 0}${lod ? 1 : 0}`;
  const key = hero
    ? `h|${type}|${u.raceId}|${u.classId}|${heroLook3d(u).key}|${wk}|${pf.armor}|${pf.off}|${JSON.stringify(pf.hide)}|${ks}`
    : `e|${type}|${base || u.id}|${pf.gender}|${wk}|${u.boss ? 1 : 0}|${ks}`;
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
  if (!hero && pf.faction !== 'cringegons') { // no own sprite (placeholder pink): faction colours
    const FC = { pirates: 'c', warprom: 'l', aiParty: 'f', tinBrotherhood: '4', renegades: '7', mechanids: '3', scavengers: '8', tekhonki: 'a', neutralVillages: '6', agrozone: 'j', mutantsPlant: 'j', mutantsBeast: '7', cult: '1' };
    if ('nop'.includes(col.body)) col.body = FC[pf.faction] || '3';
    if ('nop'.includes(col.legs)) col.legs = '1';
    if ('nop'.includes(col.skin)) col.skin = '9';
  }
  const mb = new MeshBuilder().setBone(0);
  const pv = new Float32Array(NBONES * 3);
  const P = (b, x, y, z) => { pv[b * 3] = x; pv[b * 3 + 1] = y; pv[b * 3 + 2] = z; };
  const o = { hero, u, col, wk, melee, simple: simple || lod, lod, mb, P, base, pf, tags: u.tags || [] };
  let top = 1.2, hover = false, anime = false;
  if (type === 'beast') top = beast(o);
  else if (type === 'drone') { hover = GFX.hover.some((k) => base.includes(k)); top = drone(o, hover); }
  else if (type === 'mech') top = mech(o);
  else if (type === 'spirit') top = spirit(o);
  else {
    const R = GFX.races[pf.race] || {};
    anime = type === 'humanoid' && !simple && !R.robot && !R.bone;
    top = anime ? humanoidAnime(o) : humanoid(o, type === 'robot');
  }
  const scale = (anime ? GFX.unit.scaleAnime : GFX.unit.scale) * (u.boss ? GFX.unit.bossScale : 1);
  T = { key, type, mb, pivots: pv, top, scale, hover, ranged: !!wk && !melee, anime, fem: pf.f, hero, idle: hero ? u.classId || 'x' : pf.faction || 'x', look: o.lookUsed || null };
  tplCache.set(key, T);
  return T;
}

// ---------------------------------------------------------------- head of the avatar placed on the head bone
function placeHead(o, av, hy, hs, mats, top) {
  const { mb } = o;
  for (const f of av.faces) {
    const cy = f.v.reduce((s, p) => s + p[1], 0) / f.v.length;
    if (cy < -0.72) continue; // the bust's shoulders: the body has its own
    const pts = f.v.map((p) => [p[0] * hs, hy + p[1] * hs, p[2] * hs]);
    const rr = mats[f.m] || mats.skin;
    mb._poly(pts, rr, { glow: !!rr.glow, inside: [0, hy, 0] });
    for (const p of pts) top = Math.max(top, p[1]);
  }
  return top;
}
const matsOf = (av) => { const M = {}; for (const [k, v] of Object.entries(av.mats)) { M[k] = rampRGB(v); M[k].glow = !!v.glow; } return M; };

// ---------------------------------------------------------------- humanoid (heroes, people, androids, robots)
function humanoid(o, robot) {
  const { mb, P, col, hero, u, simple, lod, pf, base } = o;
  const R = GFX.races[pf.race] || {}, F = pf.f, A = pf.armor, hide = pf.hide;
  const bone = !!R.bone, bot = robot || !!R.robot || bone;
  const w = (R.w || 1) * (F ? 0.9 : 1) * (A === 'heavy' ? 1.06 : 1), lm = (R.limb || 1) * (F ? 0.88 : 1), h = R.h || 1;
  let cloth = col.body, look = null, avatar = null;
  if (hero) { look = heroLook3d(u).look; if (look.cloth) cloth = look.cloth; } else if (!bot && !simple) look = enemyLook(base, pf);
  if (look && hide.helm) look = { ...look, acc: (look.acc || []).filter((a) => !['hood', 'helmet', 'bandana'].includes(a)) };
  if (look && !simple && !(bot && !hero)) avatar = buildAvatarMesh(look);
  const rCloth = ramp(cloth), rUnder = ramp(bone ? '3' : col.legs), rDark = ramp('1'), rLeather = ramp('6');
  const rSkin = avatar ? rampRGB(avatar.mats.skin) : ramp(bot ? '3' : col.skin);
  const plate = ramp(pf.faction === 'tinBrotherhood' || A === 'heavy' ? '4' : '3');
  const hipY = (F ? 0.51 : 0.48) * h, shY = (F ? 0.89 : 0.9) * h, neckY = shY + 0.05 * h;
  const sx = (F ? 0.2 : 0.25) * w, lx = (F ? 0.095 : 0.09) * w, t = 0.062 * lm * (lod ? 1 : 1.05);
  const kn = hipY * 0.5, ey = shY - 0.24 * h, wy = shY - 0.45 * h, tl = t * 1.25;
  const C = { w, h, t, sx, lx, hipY, shY, neckY, kn, ey, wy, tl, rCloth, rUnder, rDark, rLeather, rSkin, plate, R, F, A, bot, bone, cloth };
  P(BONE.pelvis, 0, hipY, 0); P(BONE.torso, 0, hipY + 0.04, 0); P(BONE.head, 0, neckY, 0);
  P(BONE.uaL, sx, shY, 0); P(BONE.faL, sx, ey, 0); P(BONE.uaR, -sx, shY, 0); P(BONE.faR, -sx, ey, 0);
  P(BONE.thL, lx, hipY, 0); P(BONE.shL, lx, kn, 0); P(BONE.thR, -lx, hipY, 0); P(BONE.shR, -lx, kn, 0);
  const seg = lod ? 6 : 10;
  // pelvis (hips are wider on the female silhouette)
  const hw = F ? 0.185 : 0.165;
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: hipY - 0.1, rx: hw * 0.8 * w, rz: 0.1, ao: 0.35 }, { y: hipY - 0.02, rx: hw * w, rz: F ? 0.12 : 0.11 }, { y: hipY + 0.08, rx: (F ? 0.15 : 0.155) * w, rz: 0.105 }], rUnder, { seg: lod ? 6 : 8, capBot: true });
  // torso: waist -> chest -> shoulders (female: narrow shoulders and waist, bust)
  mb.setBone(BONE.torso);
  const wst = F ? 0.1 : 0.13, chs = F ? 0.15 : 0.19, shw = F ? 0.165 : 0.21, bust = F ? 0.018 : 0;
  const rTorso = bone ? rDark : rCloth;
  loft(mb, [
    { y: hipY + 0.06, rx: (F ? 0.145 : 0.15) * w, rz: 0.105, ao: 0.25 },
    { y: hipY + 0.17, rx: wst * w, rz: F ? 0.078 : 0.095 },
    { y: hipY + 0.31, rx: chs * w, rz: 0.115 + bust, z: bust * 0.6 },
    { y: shY - 0.03, rx: shw * w, rz: 0.108 },
    { y: shY + 0.03, rx: 0.1 * w, rz: 0.078 },
  ], rTorso, { seg, rot: Math.PI / seg });
  mb.cyl(0, shY + 0.01, 0, 0.09 * h, 0.048, rSkin, { seg: 6, ao: 0 }); // neck
  loft(mb, [{ y: hipY + 0.06, rx: (F ? 0.152 : 0.158) * w, rz: 0.112, ao: 0 }, { y: hipY + 0.115, rx: (F ? 0.15 : 0.158) * w, rz: 0.112 }], rDark, { seg: 8, capTop: false }); // belt
  mb.box(-0.025, hipY + 0.07, 0.108, 0.025, hipY + 0.105, 0.125, ramp('6'), { ao: 0 });
  dress(o, C);
  raceBody(o, C);
  factionBody(o, C);
  kit(o, C);
  // head
  mb.setBone(BONE.head);
  let top = neckY + 0.3;
  const hs = GFX.unit.headScale;
  if (avatar) top = placeHead(o, avatar, neckY + 0.75 * hs, hs, matsOf(avatar), top);
  else top = simpleHead(o, C, hero ? rSkin : null);
  const hc = neckY + 0.17;
  if (R.ears) for (const s of [-1, 1]) mb.cyl(s * 0.13, hc + 0.05, -0.02, 0.16, 0.05, rSkin, { seg: 4, r1: 0, ao: 0 });
  if (R.horns) for (const s of [-1, 1]) mb.cyl(s * 0.09, hc + 0.14, 0, 0.18, 0.035, ramp('5'), { seg: 5, r1: 0, ao: 0 });
  if (R.antenna) { tube(mb, [0.1, hc + 0.1, -0.03], [0.1, hc + 0.34, -0.03], 0.012, 0.012, ramp('3'), { seg: 4 }); mb.box(0.085, hc + 0.34, -0.045, 0.115, hc + 0.375, -0.015, glowR('h'), { glow: true, ao: 0 }); top = Math.max(top, hc + 0.375); }
  if (A === 'heavy' && !avatar && !hide.helm) { loft(mb, [{ y: neckY + 0.02, rx: 0.15, ao: 0.2 }, { y: neckY + 0.17, rx: 0.17 }, { y: neckY + 0.32, rx: 0.12 }, { y: neckY + 0.37, rx: 0.02 }], plate, { seg: 8 }); top = Math.max(top, neckY + 0.37); }
  // arms
  const arms = (s) => {
    const x = s * sx, ua = s > 0 ? BONE.uaL : BONE.uaR, fa = s > 0 ? BONE.faL : BONE.faR, ts = s > 0 && R.w >= 1.2 ? 1.3 : 1; // mutants: one arm bigger
    const sleeve = pf.race === 'cringegon' ? ramp(s > 0 ? 'n' : 'i') : bone ? ramp('4') : rCloth, tt = t * ts;
    mb.setBone(ua);
    limb(mb, x, 0, shY + 0.02, ey, tt * 1.12, tt * 0.92, sleeve, { seg: lod ? 5 : 7 });
    mb.setBone(fa);
    const bare = !bot && (A === 'cloth' && F) || bone;
    limb(mb, x, 0, ey + 0.01, wy + 0.03, tt * 0.95, tt * 0.7, bare && !bone ? rSkin : bone ? ramp('4') : sleeve, { seg: lod ? 5 : 7 });
    if (!lod) mb.box(x - tt * 0.6, ey - 0.01, -tt * 0.6, x + tt * 0.6, ey + 0.015, tt * 0.6, rDark, { ao: 0 }); // elbow
    // hand: palm + thumb + fingers (bigger than real: readable at distance)
    const hr = t * (F ? 0.95 : 1.08);
    loft(mb, [{ y: wy - 0.11, rx: hr * 0.7, rz: hr * 0.55, x, ao: 0.2 }, { y: wy - 0.05, rx: hr * 1.05, rz: hr * 0.8, x }, { y: wy + 0.02, rx: hr * 0.75, rz: hr * 0.62, x }], rSkin, { seg: 6, capBot: true });
    if (!lod) mb.box(x + s * hr * 0.55, wy - 0.09, 0.0, x + s * hr * 1.0, wy - 0.03, hr * 0.7, rSkin, { ao: 0 });
    if (A === 'medium' || A === 'heavy') { limb(mb, x, 0, ey - 0.03, wy + 0.04, tt * 1.12, tt * 0.95, plate, { seg: 6, k: 1.05 }); } // bracer / vambrace
  };
  arms(1); arms(-1);
  // hand items
  mb.setBone(BONE.faR);
  if (o.wk && !hide.weapon) weapon(mb, -sx, wy - 0.05, o.wk, u.weapon?.twoHanded ? 1.15 : 1);
  if (pf.off && !hide.pack) offhand(mb.setBone(BONE.faL), pf.off, sx, wy, ey);
  if (o.wk && hide.weapon) { mb.setBone(BONE.pelvis); beam(mb, [-0.19 * w, hipY - 0.04, -0.06], [-0.2 * w, hipY - 0.2, 0.04], 0.05, 0.06, ramp('2')); } // holstered
  // legs: thigh, shin, boot (the female legs are longer and slimmer: the pelvis sits higher)
  for (const s of [1, -1]) {
    const x = s * lx, th = s > 0 ? BONE.thL : BONE.thR, sh = s > 0 ? BONE.shL : BONE.shR, big = pf.race === 'cringegon' ? 1.25 : 1;
    mb.setBone(th);
    limb(mb, x, 0, hipY - 0.01, kn, tl * 1.2, tl * 0.92, bone ? ramp('4') : rUnder, { seg: lod ? 6 : 8, bulge: 0.35 });
    if (A === 'medium' || A === 'heavy') mb.bevelBox(x - tl * 1.05, hipY - 0.2, -tl * 1.3, x + tl * 1.05, hipY - 0.02, tl * 1.3, 0.025, plate, { ao: 0 }); // tasset
    mb.setBone(sh);
    limb(mb, x, 0, kn + 0.01, 0.09, tl * 0.95, tl * 0.68, bone ? ramp('4') : rUnder, { seg: lod ? 6 : 7, bulge: 0.55, k: 1.15 });
    if (!lod) loft(mb, [{ y: kn - 0.03, rx: tl * 0.95, x, ao: 0.2 }, { y: kn + 0.04, rx: tl * 1.0, x }], rDark, { seg: 6, capTop: false }); // knee
    if (A === 'medium' || A === 'heavy') mb.bevelBox(x - tl * 0.95, 0.1, tl * 0.4, x + tl * 0.95, kn + 0.03, tl * 1.05, 0.02, plate, { ao: 0 }); // greave
    // boot: ankle -> instep -> toe
    loft(mb, [{ y: 0, rx: tl * 1.0 * big, rz: 0.15 * big, x, z: 0.05, ao: 0.4 }, { y: 0.06, rx: tl * 1.0 * big, rz: 0.14 * big, x, z: 0.045 }, { y: 0.15, rx: tl * 0.82, rz: tl * 0.85, x, z: 0 }], rDark, { seg: 7, axis: 'y', capTop: true });
    if (!lod) mb.box(x - tl * 0.9, 0.0, -tl, x + tl * 0.9, 0.025, tl * 0.5, ramp('0'), { ao: 0 }); // heel
  }
  return top;
}

/** Enemy / simplified head: skin ball + hair cap; machines and hybrids — helmet with a glowing visor. */
function simpleHead(o, C, skinR) {
  const { mb, col, tags, pf } = o;
  const hr = 0.17, hy = C.neckY + 0.04;
  const visor = C.bot || tags.includes('mechanical') || tags.includes('hybrid');
  loft(mb, [{ y: hy - 0.02, rx: hr * 0.6, ao: 0.3 }, { y: hy + hr * 0.5, rx: hr * 0.95, rz: hr }, { y: hy + hr * 1.3, rx: hr * 0.95, rz: hr }, { y: hy + hr * 1.9, rx: hr * 0.55 }], skinR || ramp(visor ? '3' : col.skin), { seg: 8 });
  if (visor) mb.box(-hr * 0.7, hy + hr * 0.85, hr * 0.7, hr * 0.7, hy + hr * 1.3, hr * 0.98, glowR(tags.includes('hybrid') ? 'n' : pf.faction === 'tinBrotherhood' ? 'c' : 'h'), { glow: true, ao: 0 });
  else {
    loft(mb, [{ y: hy + hr * 1.0, rx: hr * 1.0, rz: hr * 1.05, z: -0.01 }, { y: hy + hr * 1.6, rx: hr * 0.9, rz: hr }, { y: hy + hr * 2.0, rx: hr * 0.4 }], ramp(col.legs === col.skin ? '1' : col.legs), { seg: 8 });
    for (const s of [-1, 1]) mb.box(s * hr * 0.38 - 0.02, hy + hr * 1.05, hr * 0.86, s * hr * 0.38 + 0.02, hy + hr * 1.2, hr * 1.0, ramp('0'), { ao: 0 });
  }
  return hy + hr * 2;
}


// ---------------------------------------------------------------- anime humanoid (heroes, companions, people)
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HAIR_KEYS = { black: ['0', '1', '2'], brown: ['6', '7', '8'], ginger: ['7', '8', 'e'], blond: ['8', 'a', 'b'], grey: ['2', '3', '4'], white: ['3', '4', '5'], green: ['k', 'j', 'j'], pink: ['o', 'n', 'n'], cyan: ['i', 'h', 'h'] };

function humanoidAnime(o) {
  const { mb, P, col, hero, u, lod, pf, base } = o;
  const R = GFX.races[pf.race] || {}, F = pf.f, A = pf.armor, hide = pf.hide, thin = lod || !hero;
  const w = (R.w || 1) * (F ? 0.93 : 1) * (A === 'heavy' ? 1.05 : 1), lm = (R.limb || 1) * (F ? 0.88 : 1), hm = R.h || 1;
  let look = hero ? heroLook3d(u).look : enemyLook(base, pf);
  if (hide.helm) look = { ...look, acc: (look.acc || []).filter((a) => !['hood', 'helmet', 'bandana'].includes(a)) };
  const av = buildAvatarMesh(look), M = matsOf(av);
  const cloth = (hero && look.cloth) || col.body;
  const rCloth = ramp(cloth), rUnder = ramp(col.legs), rDark = ramp('1'), rLeather = ramp('6'), rSkin = M.skin;
  const tights = F && (A === 'cloth' || A === 'light') ? ramp('1') : rUnder;
  const plate = ramp(pf.faction === 'tinBrotherhood' || A === 'heavy' ? '4' : '3');
  const shY = (F ? 1.105 : 1.13) * hm, hipY = (F ? 0.71 : 0.7) * hm, neckY = shY + 0.05 * hm, kn = hipY * 0.52;
  const sx = (F ? 0.176 : 0.212) * w, lx = (F ? 0.088 : 0.093) * w, t = 0.056 * lm, tl = 0.075 * lm * (F ? 1.04 : 1);
  const ey = shY - 0.25 * hm, wy = shY - 0.5 * hm;
  const C = { w, h: hm, t, sx, lx, hipY, shY, neckY, kn, ey, wy, tl, rCloth, rUnder, rDark, rLeather, rSkin, plate, R, F, A, bot: false, bone: false, cloth };
  P(BONE.pelvis, 0, hipY, 0); P(BONE.torso, 0, hipY + 0.04, 0); P(BONE.head, 0, neckY, 0);
  P(BONE.uaL, sx, shY, 0); P(BONE.faL, sx, ey, 0); P(BONE.uaR, -sx, shY, 0); P(BONE.faR, -sx, ey, 0);
  P(BONE.thL, lx, hipY, 0); P(BONE.shL, lx, kn, 0); P(BONE.thR, -lx, hipY, 0); P(BONE.shR, -lx, kn, 0);
  P(BONE.cloak1, 0, shY - 0.02, -0.12); P(BONE.cloak2, 0, hipY, -0.17);
  P(BONE.bustL, 0.055 * w, shY - 0.05, 0.03); P(BONE.bustR, -0.055 * w, shY - 0.05, 0.03);
  P(BONE.buttL, 0.07 * w, hipY + 0.02, -0.06); P(BONE.buttR, -0.07 * w, hipY + 0.02, -0.06); P(BONE.skirt, 0, hipY, 0);
  // weight hooks: waist, neck, bust, knee / elbow, hem, butt (every vertex built under these bones gets its blend)
  mb.hooks = {
    [BONE.torso]: { b2: BONE.pelvis, fn: (p) => {
      const y = p[1];
      if (y > shY - 0.01) return [BONE.head, sstep(shY + 0.015, shY + 0.065, y)];
      if (F && p[2] > 0.0) { const s = p[0] > 0 ? 1 : -1, d = Math.hypot(p[0] - s * 0.052 * w, y - (shY - 0.06), p[2] - 0.06) * 1.0; const k = 1 - sstep(0.035, 0.1, d); if (k > 0.01) return [s > 0 ? BONE.bustL : BONE.bustR, k * 0.92]; }
      return [BONE.pelvis, sstep(hipY + 0.17, hipY - 0.01, y)];
    } },
    [BONE.pelvis]: { b2: BONE.skirt, fn: (p) => {
      const y = p[1];
      if (y < hipY - 0.025) return [BONE.skirt, sstep(hipY - 0.02, hipY - 0.33, y) * (F ? 1 : 0.7)];
      if (F && p[2] < -0.03 && y > hipY - 0.1 && y < hipY + 0.13) { const k = 0.8 * Math.sin(Math.PI * sstep(hipY - 0.1, hipY + 0.13, y)); return [p[0] > 0 ? BONE.buttL : BONE.buttR, k * sstep(0.0, 0.1, -p[2])]; }
      return 0;
    } },
    [BONE.thL]: { b2: BONE.shL, fn: (p) => sstep(kn + 0.07, kn - 0.07, p[1]) },
    [BONE.thR]: { b2: BONE.shR, fn: (p) => sstep(kn + 0.07, kn - 0.07, p[1]) },
    [BONE.uaL]: { b2: BONE.faL, fn: (p) => sstep(ey + 0.05, ey - 0.05, p[1]) },
    [BONE.uaR]: { b2: BONE.faR, fn: (p) => sstep(ey + 0.05, ey - 0.05, p[1]) },
  };
  const seg = lod ? 8 : thin ? 11 : 14, N = lod ? 9 : thin ? 12 : 16;
  // ---- trunk (waist -> chest -> neck), one smooth loft
  const f = (k) => hipY + k * (shY - hipY);
  const keys = F ? [
    { y: f(-0.16), rx: 0.138, rz: 0.098, z: -0.004, ao: 0.3 }, { y: f(0.0), rx: 0.168, rz: 0.118, z: -0.012 }, { y: f(0.22), rx: 0.15, rz: 0.106, z: -0.006 }, { y: f(0.45), rx: 0.104, rz: 0.078 },
    { y: f(0.62), rx: 0.114, rz: 0.084 }, { y: f(0.76), rx: 0.133, rz: 0.1, z: 0.006 }, { y: f(0.9), rx: 0.139, rz: 0.094 }, { y: f(1.0), rx: 0.128, rz: 0.086 }, { y: f(1.07), rx: 0.07, rz: 0.062 }, { y: f(1.14), rx: 0.044, rz: 0.044 },
  ] : [
    { y: f(-0.16), rx: 0.136, rz: 0.096, ao: 0.3 }, { y: f(0.0), rx: 0.148, rz: 0.104 }, { y: f(0.22), rx: 0.142, rz: 0.102 }, { y: f(0.45), rx: 0.13, rz: 0.098 },
    { y: f(0.62), rx: 0.15, rz: 0.108 }, { y: f(0.78), rx: 0.186, rz: 0.118, z: 0.004 }, { y: f(0.92), rx: 0.2, rz: 0.114 }, { y: f(1.0), rx: 0.196, rz: 0.104 }, { y: f(1.07), rx: 0.105, rz: 0.075 }, { y: f(1.14), rx: 0.054, rz: 0.054 },
  ];
  for (const k of keys) { k.rx *= w; }
  const trunkR = A === 'cloth' || A === 'light' ? rCloth : (A === 'mech' ? ramp('2') : rDark);
  mb.setBone(BONE.torso).setMat(1);
  loft(mb, resample(keys, N), trunkR, { seg, rot: Math.PI / seg });
  mb.setMat(0);
  mb.cyl(0, shY + 0.0, 0, 0.085 * hm, 0.044, rSkin, { seg: 8, ao: 0 }); // neck shaft (blended torso -> head by the hook)
  // ---- belt
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: hipY + 0.05, rx: (F ? 0.152 : 0.152) * w, rz: 0.11, ao: 0 }, { y: hipY + 0.105, rx: (F ? 0.148 : 0.152) * w, rz: 0.108 }], rDark, { seg: 12, capTop: false });
  mb.box(-0.026, hipY + 0.058, 0.104, 0.026, hipY + 0.098, 0.122, ramp('a'), { ao: 0 });
  // ---- legs: one smooth loft hip -> ankle per side (knee bend by weights), boots on the shin bone
  for (const s of [1, -1]) {
    const x = s * lx, big = pf.race === 'cringegon' ? 1.2 : 1;
    mb.setBone(s > 0 ? BONE.thL : BONE.thR).setMat(F && A === 'cloth' ? 5 : 1);
    const lk = [
      { y: 0.06, rx: tl * 0.5, rz: tl * 0.5, x, ao: 0.3 }, { y: 0.2, rx: tl * 0.66, rz: tl * 0.7, x, z: -0.004 }, { y: kn - 0.02, rx: tl * 0.58, rz: tl * 0.6, x, z: 0.004 },
      { y: kn + 0.04, rx: tl * 0.66, rz: tl * 0.66, x, z: 0.004 }, { y: hipY * 0.75, rx: tl * 0.95, rz: tl * 0.95, x: x * 0.97 }, { y: hipY - 0.02, rx: tl * 1.02 * (F ? 1.06 : 1), rz: tl * 1.0, x: x * 0.93 },
    ];
    loft(mb, resample(lk, lod ? 8 : 13), tights, { seg: lod ? 7 : 11, rot: Math.PI / 11 });
    mb.setMat(0);
    mb.setBone(s > 0 ? BONE.shL : BONE.shR);
    // boot: toe -> ankle -> shaft
    loft(mb, resample([
      { y: 0.0, rx: tl * 0.62 * big, rz: 0.12 * big, x, z: 0.05, ao: 0.4 }, { y: 0.045, rx: tl * 0.66 * big, rz: 0.108 * big, x, z: 0.046 }, { y: 0.1, rx: tl * 0.58, rz: 0.062, x, z: 0.02 },
      { y: 0.19, rx: tl * 0.64, rz: tl * 0.66, x, z: 0 }, { y: 0.26, rx: tl * 0.74, rz: tl * 0.76, x, z: 0.002 },
    ], lod ? 6 : 9), rDark, { seg: lod ? 7 : 10, capTop: false, capBot: true });
    if (!lod) mb.box(x - tl * 0.6, 0.0, -0.045, x + tl * 0.6, 0.02, 0.0, ramp('0'), { ao: 0 }); // heel
    if (A === 'medium' || A === 'heavy') { mb.bevelBox(x - tl * 0.9, 0.12, tl * 0.35, x + tl * 0.9, kn + 0.02, tl * 0.95, 0.02, plate, { ao: 0 }); }
    mb.setBone(s > 0 ? BONE.thL : BONE.thR);
    if (A === 'medium' || A === 'heavy') mb.bevelBox(x - tl * 1.15, hipY - 0.24, -tl * 1.2, x + tl * 1.15, hipY - 0.02, tl * 1.2, 0.025, plate, { ao: 0 });
  }
  // ---- arms: sleeve loft (shoulder -> cuff), bare forearm, hand with fingers
  const bareArm = (A === 'cloth' || A === 'light') && (F || A === 'light') || false;
  for (const s of [1, -1]) {
    const x = s * sx, ua = s > 0 ? BONE.uaL : BONE.uaR, fa = s > 0 ? BONE.faL : BONE.faR, ts = s > 0 && R.w >= 1.2 ? 1.3 : 1, r = t * ts;
    const sleeve = pf.race === 'cringegon' ? ramp(s > 0 ? 'n' : 'i') : rCloth;
    mb.setBone(ua).setMat(1);
    const cuffY = bareArm ? ey - 0.02 : wy + 0.05;
    loft(mb, resample([
      { y: cuffY, rx: r * 0.7, rz: r * 0.7, x, ao: 0.2 }, { y: ey - 0.07, rx: r * 0.78, rz: r * 0.8, x }, { y: ey, rx: r * 0.72, rz: r * 0.74, x, z: 0.004 },
      { y: ey + 0.08, rx: r * 0.8, rz: r * 0.82, x }, { y: shY - 0.06, rx: r * 0.92, rz: r * 0.92, x, z: 0 }, { y: shY + 0.015, rx: r * 0.9, rz: r * 0.86, x: x * 0.97 },
    ], lod ? 7 : 11), sleeve, { seg: lod ? 7 : 10, capTop: true, rot: Math.PI / 10 });
    mb.setMat(0);
    if (bareArm) {
      mb.setBone(fa);
      loft(mb, resample([{ y: wy - 0.005, rx: r * 0.5, rz: r * 0.5, x, ao: 0.1 }, { y: ey - 0.07, rx: r * 0.62, rz: r * 0.64, x, z: 0.004 }, { y: ey - 0.01, rx: r * 0.68, rz: r * 0.7, x }], lod ? 5 : 7), rSkin, { seg: lod ? 6 : 8, capTop: false });
    }
    mb.setBone(fa);
    const cuff = bareArm ? sleeve : ramp('1');
    if (!lod) loft(mb, [{ y: wy + 0.045, rx: r * 0.64, rz: r * 0.64, x, ao: 0 }, { y: wy + 0.07, rx: r * 0.7, rz: r * 0.7, x }], A === 'medium' || A === 'heavy' ? plate : rDark, { seg: 8, capTop: false });
    // hand: palm + 4 fingers + thumb (stylised, a little bigger than real)
    const hr = r * (F ? 0.62 : 0.7), gl = A === 'medium' || A === 'heavy' || (A === 'light' && !F) ? rDark : rSkin;
    loft(mb, [{ y: wy - 0.115, rx: hr * 0.8, rz: hr * 0.5, x, z: 0.006, ao: 0.2 }, { y: wy - 0.06, rx: hr * 1.08, rz: hr * 0.62, x, z: 0.004 }, { y: wy - 0.005, rx: hr * 0.78, rz: hr * 0.58, x }], gl, { seg: 8, capBot: true });
    if (!thin) {
      for (let k = 0; k < 4; k++) { const fx = x + (k - 1.5) * hr * 0.52; tube(mb, [fx, wy - 0.108, 0.008], [fx, wy - 0.158 + (k === 3 ? 0.02 : 0), 0.026], hr * 0.2, hr * 0.15, gl, { seg: 5, caps: true }); }
      tube(mb, [x + s * hr * 0.95, wy - 0.045, 0.012], [x + s * hr * 1.35, wy - 0.108, 0.03], hr * 0.22, hr * 0.17, gl, { seg: 5 });
    }
    if (A === 'medium' || A === 'heavy') { mb.setBone(fa); limb(mb, x, 0, ey - 0.03, wy + 0.04, t * 0.95, t * 0.8, plate, { seg: 8, k: 1.05 }); }
  }
  // ---- head, face, hair
  mb.setBone(BONE.head);
  const y0 = neckY + 0.015 * hm, Hd = headShape({ F, face: look.face || {}, y0, hh: 0.215 * (R.h ? Math.min(1.1, R.h) : 1) });
  const hat = (look.acc || []).includes('hood') || (look.acc || []).includes('helmet') ? 'full' : null;
  buildHead(mb, Hd, rSkin, { look, lod: thin, F, ears: !!R.ears, skinTag: pf.race });
  const hk = HAIR_KEYS[look.hairColor] || HAIR_KEYS.brown, grad = hairGrad(rampRGB(look.hairColor ? (M.hair ? hk : hk) : hk));
  const bones = { c1: BONE.hair1, c2: BONE.hair2, c3: BONE.hair3, sL: BONE.sideL, sR: BONE.sideR };
  let style = look.hair === 'bald' && F ? 'bald' : look.hair;
  const pvH = buildHair(mb, Hd, hat ? 'bald' : style, grad, { F, lod: thin, seed: pf.seed, bones, hat });
  P(BONE.hair1, ...pvH.c1); P(BONE.hair2, ...pvH.c2); P(BONE.hair3, ...pvH.c3); P(BONE.sideL, ...pvH.sL); P(BONE.sideR, ...pvH.sR);
  const hc = Hd.y0 + Hd.hh * 0.5;
  if (R.horns) for (const s of [-1, 1]) mb.cyl(s * 0.075, Hd.y0 + Hd.hh * 0.85, 0, 0.18, 0.03, ramp('5'), { seg: 6, r1: 0, ao: 0 });
  if (R.antenna) { tube(mb, [0.1, hc + 0.1, -0.03], [0.1, hc + 0.34, -0.03], 0.012, 0.012, ramp('3'), { seg: 4 }); mb.box(0.085, hc + 0.34, -0.045, 0.115, hc + 0.375, -0.015, glowR('h'), { glow: true, ao: 0 }); }
  let top = Hd.y0 + Hd.hh * (style === 'afro' ? 1.4 : style === 'mohawk' || style === 'spiky' ? 1.55 : 1.08);
  top = Math.max(top, headGear(o, C, Hd, look, grad, rCloth, plate));
  // ---- bust (female): two soft domes on the bust bones over the trunk (the hook blends the trunk skin onto them)
  if (F && !lod) for (const s of [1, -1]) {
    mb.setBone(s > 0 ? BONE.bustL : BONE.bustR);
    const b = s * 0.052 * w;
    loft(mb, [{ y: shY - 0.106, rx: 0.036, rz: 0.03, x: b, z: 0.054, ao: 0.3 }, { y: shY - 0.075, rx: 0.049, rz: 0.044, x: b, z: 0.063 }, { y: shY - 0.045, rx: 0.046, rz: 0.043, x: b, z: 0.06 }, { y: shY - 0.015, rx: 0.026, rz: 0.026, x: b, z: 0.05 }], A === 'medium' || A === 'heavy' ? plate : trunkR, { seg: 10, capTop: true });
  }
  dressAnime(o, C);
  raceBody(o, C);
  factionBody(o, C);
  kit(o, C);
  // hand items
  mb.setBone(BONE.faR);
  if (o.wk && !hide.weapon) weapon(mb, -sx, wy - 0.05, o.wk, u.weapon?.twoHanded ? 1.15 : 1);
  if (pf.off && !hide.pack) offhand(mb.setBone(BONE.faL), pf.off, sx, wy, ey);
  if (o.wk && hide.weapon) { mb.setBone(BONE.pelvis); beam(mb, [-0.19 * w, hipY - 0.04, -0.06], [-0.2 * w, hipY - 0.2, 0.04], 0.05, 0.06, ramp('2')); }
  mb.hooks = null;
  return top;
}

/** Clothes on top of the trunk by the armour type: coat (cloth: hem swings on the skirt bone), shorts / skirt, light, plates. */
function dressAnime(o, C) {
  const { mb, lod, pf } = o, { w, hipY, shY, rCloth, rDark, F, A } = C;
  if (A === 'cloth') {
    const long = F ? 0.26 : 0.4, ramps = rCloth;
    mb.setBone(BONE.torso).setMat(1);
    // upper part of the coat (shoulders -> hip), then the skirt part under the pelvis bone (hem blends to the skirt bone)
    const up = F ? [{ y: shY - 0.02, rx: 0.14 * w, rz: 0.097 }, { y: shY - 0.15, rx: 0.145 * w, rz: 0.108 }, { y: hipY + 0.2, rx: 0.113 * w, rz: 0.088 }, { y: hipY + 0.07, rx: 0.158 * w, rz: 0.115 }, { y: hipY, rx: 0.178 * w, rz: 0.13 }]
      : [{ y: shY - 0.02, rx: 0.205 * w, rz: 0.11 }, { y: shY - 0.16, rx: 0.2 * w, rz: 0.12 }, { y: hipY + 0.2, rx: 0.142 * w, rz: 0.108 }, { y: hipY + 0.05, rx: 0.16 * w, rz: 0.115 }, { y: hipY, rx: 0.17 * w, rz: 0.125 }];
    loft(mb, resample(up, lod ? 7 : 11), ramps, { seg: lod ? 9 : 14, capTop: false, capBot: false, rot: Math.PI / 14, ao: 0 });
    mb.setBone(BONE.pelvis);
    const lo = [{ y: hipY - long, rx: (F ? 0.27 : 0.235) * w, rz: F ? 0.22 : 0.17, ao: 0.4 }, { y: hipY - long * 0.55, rx: (F ? 0.235 : 0.2) * w, rz: F ? 0.19 : 0.15 }, { y: hipY - 0.1, rx: (F ? 0.205 : 0.185) * w, rz: F ? 0.16 : 0.14 }, { y: hipY, rx: (F ? 0.178 : 0.17) * w, rz: F ? 0.13 : 0.125 }];
    loft(mb, resample(lo, lod ? 6 : 9), ramps, { seg: lod ? 9 : 14, capTop: false, rot: Math.PI / 14 });
    mb.setMat(0);
    mb.setBone(BONE.torso);
    if (!lod) { loft(mb, [{ y: shY - 0.035, rx: 0.115 * w, rz: 0.088 }, { y: shY + 0.03, rx: 0.098 * w, rz: 0.08 }], rDark, { seg: 12, capTop: false }); } // collar
    return;
  }
  if (F && (A === 'light')) { // short shorts over the leggings
    mb.setBone(BONE.pelvis).setMat(1);
    loft(mb, resample([{ y: hipY - 0.12, rx: 0.184 * w, rz: 0.13, ao: 0.3 }, { y: hipY - 0.04, rx: 0.19 * w, rz: 0.135 }, { y: hipY + 0.06, rx: 0.165 * w, rz: 0.117 }], 6), C.rUnder, { seg: 14, capTop: false });
    mb.setMat(0);
  }
  dress(o, C);
}

/** Hoods, helmets, bandanas, goggles, respirators on the head bone (acc of the look); heavy armour gets a helm. Returns top. */
function headGear(o, C, Hd, look, grad, rCloth, plate) {
  const { mb, lod, pf } = o, acc = look.acc || [], TAU = Math.PI * 2, hide = pf.hide;
  const heavyHelm = pf.armor === 'heavy' && !hide.helm && o.hero;
  let top = 0;
  const shell = (back, front, th, ramp) => surfGrid(mb, (u, v) => {
    const ang = TAU * u, f = Math.sin(ang), tb = f > 0 ? back + (front - back) * f : back, t = tb + v * (1 - tb);
    return add(Hd.S(ang, t), mul(Hd.out(ang, t), th));
  }, lod ? 14 : 22, lod ? 5 : 7, () => ramp, { closed: true, center: (p) => [0, p[1], -0.005] });
  if (acc.includes('helmet') || heavyHelm) {
    shell(0.3, 0.7, 0.02, plate);
    mb.box(-0.012, Hd.y0 + Hd.hh * 0.6, 0.083, 0.012, Hd.y0 + Hd.hh * 1.0, 0.11, ramp('5'), { ao: 0 }); // brow ridge
    if (heavyHelm) mb.box(-0.05, Hd.y0 + Hd.hh * 0.44, 0.088, 0.05, Hd.y0 + Hd.hh * 0.52, 0.112, rampRGB(['h', 'h', 'h']), { glow: true, ao: 0 }); // visor slit
    top = Hd.y0 + Hd.hh * 1.12;
  }
  if (acc.includes('hood')) {
    shell(0.12, 0.62, 0.028, rCloth);
    sweep(mb, [[0, Hd.y0 + Hd.hh * 0.3, -0.1], [0, Hd.y0 - 0.02, -0.14], [0, Hd.y0 - 0.12, -0.15]], (s) => 0.2 - 0.06 * s, () => 0.03, () => rCloth, { seg: 6, side: () => [1, 0, 0] });
    top = Math.max(top, Hd.y0 + Hd.hh * 1.12);
  }
  if (acc.includes('bandana')) {
    const r = rampRGB(['d', 'c', 'e']);
    surfGrid(mb, (u, v) => { const a = TAU * u, t = 0.74 + v * 0.1; return add(Hd.S(a, t), mul(Hd.out(a, t), 0.014)); }, lod ? 12 : 20, 2, () => r, { closed: true, center: (p) => [0, p[1], -0.005] });
    sweep(mb, [[0.0, Hd.y0 + Hd.hh * 0.8, -0.1], [0.03, Hd.y0 + Hd.hh * 0.72, -0.15], [0.05, Hd.y0 + Hd.hh * 0.6, -0.17]], (s) => 0.04 * (1 - s * 0.6), () => 0.012, () => r, { seg: 4, side: () => [1, 0, 0] });
  }
  if (acc.includes('goggles') && !lod) {
    const g = rampRGB(['0', '1', '2']);
    surfGrid(mb, (u, v) => { const a = TAU * u, t = 0.5 + v * 0.1; return add(Hd.S(a, t), mul(Hd.out(a, t), 0.012)); }, 20, 2, () => g, { closed: true, center: (p) => [0, p[1], -0.005] });
    for (const s of [-1, 1]) mb.cyl(s * 0.04, Hd.y0 + Hd.hh * 0.5, 0.082, 0.018, 0.027, rampRGB(['h', 'h', 'h']), { axis: 'z', seg: 8, glow: true, ao: 0 });
  }
  if (acc.includes('respirator') || acc.includes('gasmask')) {
    const g = rampRGB(['1', '2', '3']);
    surfGrid(mb, (u, v) => { const a = Math.PI / 2 - 1.15 * (2 * u - 1), t = 0.02 + v * 0.3; return add(Hd.S(a, t), mul(Hd.out(a, t), 0.02)); }, lod ? 8 : 12, 5, () => g, { center: (p) => [0, p[1], -0.005] });
    mb.cyl(0, Hd.y0 + Hd.hh * 0.12, 0.1, 0.045, 0.026, rampRGB(['0', '1', '2']), { axis: 'z', seg: 8, ao: 0 });
    if (acc.includes('gasmask')) for (const s of [-1, 1]) mb.cyl(s * 0.04, Hd.y0 + Hd.hh * 0.4, 0.09, 0.022, 0.03, rampRGB(['h', 'i', 'h']), { axis: 'z', seg: 8, glow: true, ao: 0 });
  }
  return top;
}

// ---------------------------------------------------------------- armour by type (torso, shoulders, hips, pouches)
function dress(o, C) {
  const { mb, lod, pf } = o, { w, t, sx, shY, hipY, rCloth, rLeather, plate, rDark, F, A } = C, hide = pf.hide;
  const pouch = (x, y, z) => mb.bevelBox(x - 0.04, y - 0.045, z - 0.03, x + 0.04, y + 0.045, z + 0.03, 0.012, rLeather, { ao: 0 });
  const dome = (s, r, rp, spike) => {
    mb.setBone(s > 0 ? BONE.uaL : BONE.uaR);
    const x = s * sx;
    loft(mb, [{ y: shY - 0.05, rx: r * 1.05, rz: r, x, ao: 0.3 }, { y: shY + 0.02, rx: r * 1.15, rz: r * 1.05, x }, { y: shY + 0.075, rx: r * 0.8, rz: r * 0.75, x }, { y: shY + 0.095, rx: r * 0.3, x }], rp, { seg: lod ? 6 : 8 });
    if (spike) mb.cyl(x, shY + 0.09, 0, 0.1, 0.035, ramp('5'), { seg: 4, r1: 0, ao: 0 });
  };
  mb.setBone(BONE.torso);
  if (A === 'cloth') {
    mb.setBone(BONE.pelvis);
    loft(mb, [{ y: hipY - (F ? 0.17 : 0.22), rx: (F ? 0.2 : 0.2) * w, rz: 0.15, ao: 0.4 }, { y: hipY - 0.08, rx: 0.18 * w, rz: 0.13 }, { y: hipY + 0.08, rx: 0.16 * w, rz: 0.11 }], rCloth, { seg: 8, capTop: false }); // coat skirt (short for women)
    mb.setBone(BONE.torso);
    if (!lod) loft(mb, [{ y: shY - 0.03, rx: 0.13 * w, rz: 0.1 }, { y: shY + 0.02, rx: 0.12 * w, rz: 0.1 }], rDark, { seg: 8, capTop: false }); // collar
    return;
  }
  if (A === 'light') {
    if (!lod) { pouch(0.08 * w, hipY + 0.2, 0.115); pouch(-0.08 * w, hipY + 0.2, 0.115); pouch(0.16 * w, hipY + 0.06, 0.07); pouch(-0.16 * w, hipY + 0.06, 0.07); }
    beam(mb, [0.15 * w, shY - 0.02, 0.1], [-0.13 * w, hipY + 0.1, 0.125], 0.045, 0.02, rLeather); // bandolier
    if (!hide.pads) { dome(1, t * 1.7, rCloth); dome(-1, t * 1.7, rCloth); }
    mb.setBone(BONE.torso);
  } else if (A === 'medium' || A === 'heavy') {
    const k = A === 'heavy' ? 0.025 : 0.014;
    loft(mb, [{ y: hipY + 0.16, rx: 0.115 * w + k, rz: 0.1 + k, ao: 0.2 }, { y: hipY + 0.3, rx: (F ? 0.155 : 0.19) * w + k, rz: 0.125 + k + (F ? 0.014 : 0) }, { y: shY - 0.02, rx: (F ? 0.17 : 0.21) * w + k, rz: 0.115 + k }, { y: shY + 0.03, rx: 0.12 * w, rz: 0.09 }], plate, { seg: 10, rot: Math.PI / 10 }); // breastplate
    if (!lod) { pouch(0.1 * w, hipY + 0.07, 0.12); pouch(-0.1 * w, hipY + 0.07, 0.12); }
    if (A === 'heavy') mb.box(-0.02, hipY + 0.17, 0.12, 0.02, shY - 0.06, 0.15, ramp('5'), { ao: 0 }); // ridge
    if (!hide.pads) { dome(1, t * (A === 'heavy' ? 2.4 : 2.0), plate, A === 'heavy'); dome(-1, t * (A === 'heavy' ? 2.4 : 2.0), plate, A === 'heavy'); }
    mb.setBone(BONE.torso);
  } else if (A === 'mech') {
    mb.bevelBox(-0.07, hipY + 0.2, 0.1, 0.07, hipY + 0.34, 0.16, 0.02, ramp('3'), { ao: 0 });
    mb.box(-0.04, hipY + 0.24, 0.16, 0.04, hipY + 0.3, 0.175, glowR('h'), { glow: true, ao: 0 });
    if (!hide.pads) { dome(1, t * 2.3, ramp('3')); dome(-1, t * 2.3, ramp('3')); }
    mb.setBone(BONE.torso);
  }
}

// ---------------------------------------------------------------- race bodies
function raceBody(o, C) {
  const { mb, lod, pf } = o, { w, t, sx, shY, hipY, R, bone } = C;
  mb.setBone(BONE.torso);
  if (bone) { // ribs + spine
    for (let k = 0; k < 4; k++) loft(mb, [{ y: hipY + 0.19 + k * 0.052, rx: (0.1 + k * 0.014) * w, rz: 0.095 + k * 0.004 }, { y: hipY + 0.2 + k * 0.052, rx: (0.1 + k * 0.014) * w + 0.012, rz: 0.1 + k * 0.004 }], ramp('5'), { seg: 8, capTop: false });
    tube(mb, [0, hipY + 0.08, -0.07], [0, shY, -0.075], 0.022, 0.02, ramp('4'), { seg: 5 });
    if (!lod) mb.box(-0.03, hipY + 0.28, 0.07, 0.03, hipY + 0.34, 0.1, glowR('c'), { glow: true, ao: 0 }); // core
  }
  if (pf.race === 'android') { mb.box(-0.012, hipY + 0.14, 0.108, 0.012, shY - 0.05, 0.12, glowR('h'), { glow: true, ao: 0 }); mb.box(-0.17 * w, hipY + 0.17, -0.1, 0.17 * w, hipY + 0.185, 0.1, ramp('1'), { ao: 0 }); }
  if (R.leaves) for (const s of [-1, 1]) { mb.setBone(s > 0 ? BONE.uaL : BONE.uaR); loft(mb, [{ y: shY - 0.03, rx: 0.02, x: s * sx }, { y: shY + 0.06, rx: 0.09, rz: 0.04, x: s * sx }, { y: shY + 0.2, rx: 0.01, x: s * sx + s * 0.04 }], ramp('j'), { seg: 4 }); }
  if (R.leaves && !lod) { mb.setBone(BONE.torso); tube(mb, [0.12, hipY + 0.05, 0.1], [-0.1, shY - 0.05, 0.12], 0.014, 0.014, ramp('k'), { seg: 4 }); mb.cyl(0.14 * w, shY - 0.02, 0.05, 0.1, 0.05, ramp('o'), { seg: 5, r1: 0.005, ao: 0 }); }
  if (R.spikes) for (const s of [-1, 0, 1]) mb.cyl(s * 0.08, shY - 0.15 + Math.abs(s) * 0.05, -0.12, 0.15, 0.002, ramp('4'), { axis: 'z', seg: 4, r1: 0.035, ao: 0 });
  if (pf.race === 'skrilet') for (const s of [1, -1]) { mb.setBone(s > 0 ? BONE.faL : BONE.faR); beam(mb, [s * sx, C.wy + 0.05, 0.05], [s * sx, C.wy + 0.08, 0.42], 0.035, 0.012, ramp('5')); }
  if (R.w >= 1.2 && !lod) { // mutant: mane spikes + back hump
    mb.setBone(BONE.torso);
    loft(mb, [{ y: hipY + 0.2, rx: 0.1, rz: 0.07, z: -0.12 }, { y: hipY + 0.36, rx: 0.15 * w, rz: 0.1, z: -0.13 }, { y: shY, rx: 0.08, rz: 0.06, z: -0.1 }], ramp('7'), { seg: 7 });
    for (let k = 0; k < 4; k++) mb.cyl(0, hipY + 0.2 + k * 0.1, -0.2, 0.1, 0.03, ramp('8'), { axis: 'z', seg: 4, r1: 0.003, ao: 0, bottom: false });
  }
  if (pf.race === 'cringegon') { mb.setBone(BONE.torso); loft(mb, [{ y: shY - 0.02, rx: 0.15, rz: 0.13 }, { y: shY + 0.03, rx: 0.2, rz: 0.17 }, { y: shY + 0.08, rx: 0.1, rz: 0.09 }], ramp('o'), { seg: 9 }); }
  if (pf.race === 'tekhonok' && !lod) { mb.setBone(BONE.torso); mb.cyl(0, shY - 0.12, -0.2, 0.04, 0.12, ramp('a'), { axis: 'z', seg: 8, ao: 0 }); }
}

// ---------------------------------------------------------------- faction details (enemies)
function factionBody(o, C) {
  const { mb, lod, pf } = o, { w, t, sx, shY, hipY, rCloth, rLeather, plate, rDark } = C;
  const fc = pf.faction;
  if (!fc) return;
  mb.setBone(BONE.torso);
  const glowTri = (k) => mb.tri([-0.045, hipY + 0.3, 0.138], [0.045, hipY + 0.3, 0.138], [0, hipY + 0.2, 0.14], glowR(k), { glow: true });
  switch (fc) {
    case 'cult':
      mb.setBone(BONE.pelvis);
      loft(mb, [{ y: 0.12, rx: 0.26 * w, rz: 0.2, ao: 0.4 }, { y: hipY - 0.1, rx: 0.21 * w, rz: 0.15 }, { y: hipY + 0.08, rx: 0.16 * w, rz: 0.11 }], rCloth, { seg: 9, capTop: false }); // robe
      mb.setBone(BONE.torso); glowTri('c');
      loft(mb, [{ y: shY - 0.14, rx: 0.27 * w, rz: 0.17, ao: 0.2 }, { y: shY, rx: 0.23 * w, rz: 0.14 }, { y: shY + 0.05, rx: 0.11, rz: 0.09 }], ramp('1'), { seg: 9 }); // mantle
      break;
    case 'pirates':
      beam(mb, [0.17 * w, shY - 0.03, 0.1], [-0.16 * w, hipY + 0.08, 0.13], 0.06, 0.018, ramp('c'));
      mb.setBone(BONE.pelvis); beam(mb, [0.15, hipY + 0.02, 0.1], [0.17, hipY - 0.2, 0.1], 0.05, 0.012, ramp('c')); // sash tail
      if (!lod) mb.box(-0.03, hipY + 0.01, 0.115, 0.03, hipY + 0.07, 0.13, ramp('5'), { ao: 0 }); // skull buckle
      break;
    case 'warprom':
      if (!lod) for (const s of [-1, 1]) mb.box(s * 0.09 * w - 0.03, hipY + 0.24, 0.12, s * 0.09 * w + 0.03, hipY + 0.31, 0.15, rLeather, { ao: 0 });
      mb.box(-0.1, hipY + 0.2, -0.2, 0.1, shY - 0.04, -0.11, ramp('6'), { ao: 0 });
      tube(mb, [0.07, shY - 0.04, -0.17], [0.07, shY + 0.32, -0.17], 0.01, 0.01, ramp('3'), { seg: 4 });
      break;
    case 'aiParty':
      mb.box(-0.035, hipY + 0.26, 0.12, 0.035, hipY + 0.32, 0.135, glowR('h'), { glow: true, ao: 0 });
      beam(mb, [0.15 * w, shY - 0.02, 0.1], [-0.13 * w, hipY + 0.1, 0.125], 0.04, 0.016, rDark);
      mb.setBone(BONE.uaL); loft(mb, [{ y: shY - 0.15, rx: t * 1.15, x: sx }, { y: shY - 0.1, rx: t * 1.2, x: sx }], ramp('c'), { seg: 7, capTop: false }); // armband
      break;
    case 'tinBrotherhood':
      mb.setBone(BONE.pelvis);
      loft(mb, [{ y: hipY - 0.2, rx: 0.2 * w, rz: 0.16, ao: 0.3 }, { y: hipY - 0.1, rx: 0.19 * w, rz: 0.14 }, { y: hipY + 0.07, rx: 0.16 * w, rz: 0.115 }], plate, { seg: 8, capTop: false, ramps: [plate, ramp('2')] });
      mb.setBone(BONE.torso); tube(mb, [0, shY - 0.1, -0.15], [0, shY + 0.55, -0.15], 0.012, 0.012, ramp('5'), { seg: 4 }); mb.box(-0.02, shY + 0.3, -0.165, 0.18, shY + 0.52, -0.15, ramp('c'), { ao: 0 }); // banner
      break;
    case 'renegades':
      loft(mb, [{ y: shY - 0.02, rx: 0.12, rz: 0.1 }, { y: shY + 0.04, rx: 0.115, rz: 0.1 }], ramp('c'), { seg: 8, capTop: false }); // scarf
      beam(mb, [-0.15 * w, shY - 0.02, 0.1], [0.13 * w, hipY + 0.1, 0.125], 0.04, 0.02, ramp('a'));
      break;
    case 'mechanids':
      tube(mb, [0.12, hipY + 0.06, 0.1], [-0.12, shY - 0.04, 0.12], 0.014, 0.014, ramp('1'), { seg: 4 });
      tube(mb, [-0.1, hipY + 0.06, 0.11], [0.1, shY - 0.08, 0.125], 0.012, 0.012, glowR('c'), { seg: 4, glow: true });
      mb.box(-0.05, hipY + 0.24, 0.12, 0.05, hipY + 0.32, 0.14, glowR('c'), { glow: true, ao: 0 });
      mb.setBone(BONE.uaR); limb(mb, -sx, 0, shY + 0.02, C.ey, t * 1.2, t * 1.0, ramp('3'), { seg: 6 }); // mechanical arm
      break;
    case 'scavengers':
      mb.setBone(BONE.uaL); loft(mb, [{ y: shY - 0.04, rx: 0.1, x: sx }, { y: shY + 0.1, rx: 0.14, x: sx }], ramp('2'), { seg: 8, capTop: false, capBot: true }); // bucket pauldron
      mb.setBone(BONE.torso);
      mb.box(-0.15, hipY + 0.14, -0.28, 0.15, shY - 0.02, -0.11, ramp('6'), { ao: 0 }); mb.box(-0.1, shY - 0.02, -0.26, 0.1, shY + 0.1, -0.14, ramp('2'), { ao: 0 }); mb.box(0.04, hipY + 0.1, -0.31, 0.16, hipY + 0.22, -0.26, ramp('a'), { ao: 0 });
      break;
    case 'tekhonki':
      mb.cyl(0, shY - 0.16, -0.2, 0.05, 0.13, ramp('a'), { axis: 'z', seg: 8, ao: 0 });
      mb.box(-0.1, hipY + 0.1, 0.1, 0.1, hipY + 0.17, 0.13, rLeather, { ao: 0 });
      break;
    case 'agrozone':
      for (const s of [-1, 1]) beam(mb, [s * 0.09, hipY + 0.1, 0.11], [s * 0.1, shY, 0.1], 0.03, 0.015, ramp('6'));
      for (const s of [-1, 1]) mb.cyl(s * 0.07, hipY + 0.1, -0.2, shY - hipY - 0.1, 0.06, ramp(s > 0 ? 'j' : '3'), { seg: 6, ao: 0 });
      break;
    case 'neutralVillages': mb.bevelBox(-0.1 * w, hipY - 0.02, 0.1, 0.1 * w, hipY + 0.2, 0.125, 0.01, rLeather, { ao: 0 }); break; // apron
    default: break;
  }
}

/** Class kit on the torso bone: pack / tank / antenna / pads / cape / spikes (hide.pack / hide.cloak hide them). */
function kit(o, C) {
  const { mb, u, hero, pf } = o, { sx, shY, hipY, rCloth, w, plate } = C, hide = pf.hide;
  const k = GFX.classes[u.classId] || (hero ? 'pack' : null);
  mb.setBone(BONE.torso);
  if (!k || k === 'none') return;
  const straps = () => { for (const s of [-1, 1]) beam(mb, [s * 0.09 * w, shY - 0.02, 0.1], [s * 0.1 * w, hipY + 0.14, -0.1], 0.03, 0.02, ramp('6')); };
  if ((k === 'pack' || k === 'antenna') && !hide.pack) {
    mb.bevelBox(-0.14, hipY + 0.1, -0.26, 0.14, shY - 0.02, -0.11, 0.035, ramp(o.col.accent === o.col.body ? '6' : '7'), { ao: 0 });
    mb.cyl(0, hipY + 0.06, -0.19, 0.28, 0.07, ramp('3'), { axis: 'x', seg: 6, ao: 0, r1: 0.07 }); // bedroll
    if (!o.lod) straps();
    if (k === 'antenna') { tube(mb, [0.08, shY - 0.02, -0.2], [0.08, shY + 0.42, -0.2], 0.012, 0.012, ramp('3'), { seg: 4 }); mb.box(0.065, shY + 0.42, -0.215, 0.095, shY + 0.46, -0.185, glowR('h'), { glow: true, ao: 0 }); }
  } else if (k === 'tank' && !hide.pack) {
    for (const s of [-1, 1]) loft(mb, [{ y: hipY + 0.08, rx: 0.06, x: s * 0.07, z: -0.19, ao: 0.3 }, { y: hipY + 0.2, rx: 0.075, x: s * 0.07, z: -0.19 }, { y: shY - 0.04, rx: 0.06, x: s * 0.07, z: -0.19 }, { y: shY - 0.01, rx: 0.02, x: s * 0.07, z: -0.19 }], ramp(s > 0 ? 'j' : '3'), { seg: 7 });
    if (!o.lod) straps();
  } else if (k === 'pads' && !hide.pads && C.A !== 'medium' && C.A !== 'heavy') {
    for (const s of [-1, 1]) mb.bevelBox(s * sx - 0.1, shY - 0.04, -0.1, s * sx + 0.1, shY + 0.07, 0.1, 0.03, ramp('3'), { ao: 0 });
  } else if (k === 'cape' && !hide.cloak) {
    mb.quad([-0.2, shY, -0.13], [0.2, shY, -0.13], [0.27, hipY * 0.4, -0.25], [-0.27, hipY * 0.4, -0.25], rCloth, { inside: [0, hipY, 0] });
    mb.quad([-0.2, shY, -0.135], [-0.27, hipY * 0.4, -0.255], [0.27, hipY * 0.4, -0.255], [0.2, shY, -0.135], ramp('1'), { inside: [0, hipY, -1] });
  } else if (k === 'spikes' && !hide.pads) {
    for (const s of [-1, 1]) mb.cyl(s * sx, shY + 0.06, 0, 0.16, 0.05, ramp('5'), { seg: 4, r1: 0, ao: 0 });
  }
}

// ---------------------------------------------------------------- beast (mutant wolves, crawlers, robo-wolves)
function beast(o) {
  const { mb, P, col, tags, base, lod } = o;
  const metal = tags.includes('mechanical'), big = base.includes('biomass') || base.includes('panther') ? 1.15 : 1;
  const rBody = ramp(metal ? '3' : col.body), rLegs = ramp(metal ? '2' : col.legs), rHead = ramp(metal ? '4' : col.body), rBelly = ramp(metal ? '2' : '8');
  const y = 0.42 * big, L = 0.32 * big;
  P(BONE.pelvis, 0, y, -0.15); P(BONE.torso, 0, y, 0.0); P(BONE.head, 0, y + 0.12, L + 0.04);
  P(BONE.uaL, 0.13, y - 0.04, L * 0.7); P(BONE.faL, 0.13, y * 0.5, L * 0.7); P(BONE.uaR, -0.13, y - 0.04, L * 0.7); P(BONE.faR, -0.13, y * 0.5, L * 0.7);
  P(BONE.thL, 0.13, y - 0.04, -L); P(BONE.shL, 0.13, y * 0.5, -L); P(BONE.thR, -0.13, y - 0.04, -L); P(BONE.shR, -0.13, y * 0.5, -L);
  const seg = lod ? 6 : 8;
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: -L - 0.16, rx: 0.1, rz: 0.1, cy: y + 0.02, ao: 0.2 }, { y: -L - 0.02, rx: 0.17, rz: 0.15, cy: y + 0.03 }, { y: 0.02, rx: 0.15, rz: 0.14, cy: y + 0.04, ao: 0.1 }], rBody, { seg, axis: 'z', capBot: true });
  for (let k = 0; k < 4; k++) mb.cyl(0, y + 0.06 - k * 0.01, -L - 0.2 - k * 0.1, 0.12, 0.05 - k * 0.011, rBody, { axis: 'z', seg: 5, r1: 0.04 - k * 0.011, ao: 0, bottom: true }); // tail
  mb.setBone(BONE.torso);
  loft(mb, [{ y: -0.02, rx: 0.15, rz: 0.15, cy: y + 0.04 }, { y: L * 0.5, rx: 0.2, rz: 0.19, cy: y + 0.05, ao: 0 }, { y: L + 0.06, rx: 0.19, rz: 0.2, cy: y + 0.07 }], rBody, { seg, axis: 'z', capTop: true });
  if (!lod) for (let k = 0; k < 4; k++) mb.cyl(0, y + 0.2, 0.0 + k * 0.1, 0.07, 0.04, ramp(metal ? '1' : '8'), { seg: 4, r1: 0.003, ao: 0 }); // spine ridge
  if (o.wk === 'ranged' || (metal && !lod)) { beam(mb, [0, y + 0.22, 0], [0, y + 0.26, L + 0.2], 0.08, 0.07, ramp('2')); tube(mb, [0, y + 0.26, L + 0.2], [0, y + 0.26, L + 0.34], 0.018, 0.018, ramp('4'), { seg: 5 }); }
  mb.setBone(BONE.head);
  loft(mb, [{ y: L + 0.02, rx: 0.1, rz: 0.1, cy: y + 0.14 }, { y: L + 0.16, rx: 0.13, rz: 0.12, cy: y + 0.14 }, { y: L + 0.28, rx: 0.08, rz: 0.07, cy: y + 0.1 }, { y: L + 0.4, rx: 0.045, rz: 0.04, cy: y + 0.08 }], rHead, { seg: 7, axis: 'z', capTop: true });
  if (!lod) { mb.box(-0.07, y + 0.04, L + 0.26, 0.07, y + 0.07, L + 0.38, rBelly, { ao: 0 }); for (const s of [-1, 1]) mb.cyl(s * 0.04, y + 0.075, L + 0.37, 0.04, 0.01, ramp('5'), { seg: 3, r1: 0, ao: 0 }); } // jaw + fangs
  for (const s of [-1, 1]) {
    mb.box(s * 0.075 - 0.025, y + 0.17, L + 0.24, s * 0.075 + 0.025, y + 0.21, L + 0.26, glowR(metal ? 'c' : 'b'), { glow: true, ao: 0 });
    mb.cyl(s * 0.08, y + 0.22, L + 0.1, 0.13, 0.05, rHead, { seg: 4, r1: 0, ao: 0 });
  }
  for (const [ua, fa, x, z, hind] of [[BONE.uaL, BONE.faL, 0.14, L * 0.7, 0], [BONE.uaR, BONE.faR, -0.14, L * 0.7, 0], [BONE.thL, BONE.shL, 0.14, -L, 1], [BONE.thR, BONE.shR, -0.14, -L, 1]]) {
    mb.setBone(ua); limb(mb, x, z, y + 0.02, y * 0.5, hind ? 0.085 : 0.07, 0.05, rLegs, { seg: 6, bulge: 0.4 });
    mb.setBone(fa); limb(mb, x, z + (hind ? 0.03 : 0), y * 0.5 + 0.01, 0.04, 0.05, 0.035, rLegs, { seg: 6, ao: 0.3 });
    mb.box(x - 0.045, 0, z - 0.02, x + 0.045, 0.045, z + 0.08, rLegs, { ao: 0.3 }); // paw
    if (!lod) for (const q of [-1, 0, 1]) mb.cyl(x + q * 0.025, 0.01, z + 0.08, 0.04, 0.01, ramp('5'), { axis: 'z', seg: 3, r1: 0.002, ao: 0 }); // claws
  }
  return y + 0.3;
}

// ---------------------------------------------------------------- drone / turret / node
function drone(o, hover) {
  const { mb, P, col, lod } = o;
  const y = hover ? 0.8 : 0.55, rB = ramp(col.body === '0' ? '3' : col.body), rS = ramp('3'), eye = glowR(o.tags.includes('digital') ? 'h' : 'c');
  P(BONE.pelvis, 0, y, 0); P(BONE.torso, 0, y + 0.12, 0); P(BONE.head, 0, y + 0.1, 0.2);
  P(BONE.uaL, 0.24, y + 0.05, 0); P(BONE.faL, 0.4, y + 0.05, 0); P(BONE.uaR, -0.24, y + 0.05, 0); P(BONE.faR, -0.4, y + 0.05, 0);
  P(BONE.thL, 0.12, y - 0.1, 0); P(BONE.shL, 0.2, y * 0.5, 0); P(BONE.thR, -0.12, y - 0.1, 0); P(BONE.shR, -0.2, y * 0.5, 0);
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: y - 0.16, rx: 0.14, ao: 0.4 }, { y: y - 0.06, rx: 0.27 }, { y: y + 0.04, rx: 0.24 }, { y: y + 0.1, rx: 0.14 }], rB, { seg: lod ? 6 : 10, capBot: true });
  mb.setBone(BONE.torso);
  loft(mb, [{ y: y + 0.1, rx: 0.1 }, { y: y + 0.18, rx: 0.13 }, { y: y + 0.26, rx: 0.07 }], rS, { seg: 8 });
  mb.box(-0.02, y + 0.26, -0.02, 0.02, y + 0.42, 0.02, rS, { ao: 0 });
  mb.setBone(BONE.head);
  loft(mb, [{ y: 0.14, rx: 0.1, rz: 0.1, cy: y + 0.1 }, { y: 0.26, rx: 0.115, rz: 0.115, cy: y + 0.1 }, { y: 0.31, rx: 0.07, rz: 0.07, cy: y + 0.1 }], rS, { seg: 8, axis: 'z' });
  mb.box(-0.07, y + 0.07, 0.3, 0.07, y + 0.13, 0.33, eye, { glow: true, ao: 0 });
  for (const s of [1, -1]) {
    const ua = s > 0 ? BONE.uaL : BONE.uaR, fa = s > 0 ? BONE.faL : BONE.faR;
    mb.setBone(ua); beam(mb, [s * 0.14, y + 0.03, 0], [s * 0.4, y + 0.05, 0], 0.07, 0.05, rS);
    mb.setBone(fa);
    if (hover) { mb.cyl(s * 0.46, y + 0.08, 0, 0.03, 0.17, ramp('1'), { seg: 10, ao: 0, bottom: true }); mb.cyl(s * 0.46, y + 0.04, 0, 0.04, 0.05, rS, { seg: 6, ao: 0 }); }
    else tube(mb, [s * 0.4, y + 0.05, -0.05], [s * 0.4, y + 0.05, 0.4], 0.05, 0.04, ramp('2'), { seg: 6 });
  }
  if (!hover) for (const s of [1, -1]) { // tripod legs
    mb.setBone(s > 0 ? BONE.thL : BONE.thR); beam(mb, [s * 0.1, y - 0.1, 0], [s * 0.2, y * 0.5, 0], 0.06, 0.06, rS);
    mb.setBone(s > 0 ? BONE.shL : BONE.shR); beam(mb, [s * 0.2, y * 0.5, 0], [s * 0.26, 0, 0], 0.07, 0.07, rS); mb.box(s * 0.26 - 0.06, 0, -0.06, s * 0.26 + 0.06, 0.03, 0.06, ramp('1'), { ao: 0.3 });
  }
  if (!hover) { mb.setBone(BONE.pelvis); mb.cyl(0, 0, -0.12, y * 0.6, 0.045, rS, { seg: 5, ao: 0 }); }
  return y + 0.3;
}

// ---------------------------------------------------------------- mech (walkers, golems, junk mechs)
function mech(o) {
  const { mb, P, col, lod } = o;
  const rB = ramp(col.body === '0' ? '3' : col.body), rS = ramp('3'), rD = ramp('2'), hipY = 0.68, shY = 1.22;
  P(BONE.pelvis, 0, hipY, 0); P(BONE.torso, 0, hipY + 0.05, 0); P(BONE.head, 0, shY, 0.1);
  P(BONE.uaL, 0.42, shY - 0.05, 0); P(BONE.faL, 0.46, shY - 0.35, 0); P(BONE.uaR, -0.42, shY - 0.05, 0); P(BONE.faR, -0.46, shY - 0.35, 0);
  P(BONE.thL, 0.2, hipY, 0); P(BONE.shL, 0.2, hipY * 0.5, 0.06); P(BONE.thR, -0.2, hipY, 0); P(BONE.shR, -0.2, hipY * 0.5, 0.06);
  mb.setBone(BONE.pelvis).bevelBox(-0.28, hipY - 0.12, -0.18, 0.28, hipY + 0.08, 0.18, 0.05, rD, { ao: 0 });
  mb.setBone(BONE.torso);
  loft(mb, [{ y: hipY + 0.06, rx: 0.28, rz: 0.22, ao: 0.3 }, { y: hipY + 0.3, rx: 0.37, rz: 0.27 }, { y: shY, rx: 0.36, rz: 0.26 }, { y: shY + 0.07, rx: 0.2, rz: 0.17 }], rB, { seg: 8, rot: Math.PI / 8 });
  mb.box(-0.3, shY - 0.22, -0.38, 0.3, shY - 0.02, -0.26, rS, { ao: 0 }); // exhaust block
  if (!lod) for (const s of [-1, 1]) tube(mb, [s * 0.2, shY - 0.02, -0.32], [s * 0.2, shY + 0.38, -0.32], 0.04, 0.05, rD, { seg: 6 });
  mb.box(-0.12, shY - 0.12, 0.25, 0.12, shY - 0.02, 0.29, glowR('c'), { glow: true, ao: 0 }); // chest light
  mb.setBone(BONE.head);
  loft(mb, [{ y: -0.02, rx: 0.12, rz: 0.12, cy: shY + 0.14 }, { y: 0.14, rx: 0.19, rz: 0.15, cy: shY + 0.14 }, { y: 0.3, rx: 0.14, rz: 0.12, cy: shY + 0.14 }], rS, { seg: 8, axis: 'z' });
  mb.box(-0.13, shY + 0.1, 0.28, 0.13, shY + 0.19, 0.32, glowR('c'), { glow: true, ao: 0 });
  for (const s of [1, -1]) {
    const x = s * 0.46;
    mb.setBone(s > 0 ? BONE.uaL : BONE.uaR);
    loft(mb, [{ y: shY - 0.38, rx: 0.1, x, ao: 0.3 }, { y: shY - 0.1, rx: 0.13, x }, { y: shY + 0.06, rx: 0.15, x }, { y: shY + 0.12, rx: 0.08, x }], rB, { seg: 8 });
    mb.setBone(s > 0 ? BONE.faL : BONE.faR);
    if (s < 0) { mb.bevelBox(x - 0.1, shY - 0.62, -0.1, x + 0.1, shY - 0.35, 0.12, 0.03, rS, { ao: 0 }); for (const q of [-1, 1]) tube(mb, [x + q * 0.04, shY - 0.52, 0.1], [x + q * 0.04, shY - 0.52, 0.52], 0.035, 0.03, rD, { seg: 6 }); }
    else { mb.bevelBox(x - 0.12, shY - 0.72, -0.1, x + 0.12, shY - 0.35, 0.1, 0.03, rS, { ao: 0 }); if (!lod) for (const q of [-1, 0, 1]) mb.box(x + q * 0.07 - 0.02, shY - 0.82, -0.02, x + q * 0.07 + 0.02, shY - 0.72, 0.1, ramp('5'), { ao: 0 }); } // claw
    mb.setBone(s > 0 ? BONE.thL : BONE.thR);
    loft(mb, [{ y: hipY * 0.5, rx: 0.1, rz: 0.1, x: s * 0.2, ao: 0.3 }, { y: hipY - 0.05, rx: 0.13, rz: 0.13, x: s * 0.2 }, { y: hipY, rx: 0.11, rz: 0.11, x: s * 0.2 }], rB, { seg: 7 });
    mb.setBone(s > 0 ? BONE.shL : BONE.shR);
    loft(mb, [{ y: 0.1, rx: 0.07, rz: 0.08, x: s * 0.2, z: 0.05 }, { y: hipY * 0.5, rx: 0.1, rz: 0.1, x: s * 0.2 }], rS, { seg: 7 });
    mb.bevelBox(s * 0.2 - 0.15, 0, -0.14, s * 0.2 + 0.15, 0.1, 0.26, 0.03, rD, { ao: 0.3 });
  }
  return shY + 0.3;
}

// ---------------------------------------------------------------- cyber spirit (digital enemies, spirit heroes)
function spirit(o) {
  const { mb, P, col, hero, u, simple, lod } = o;
  const k = ['h', 'n', 'i', 'f', 'm'].includes(col.body) ? col.body : 'h';
  const rG = ramp(k), rI = ramp('i'), eye = glowR(k === 'n' ? 'h' : 'n');
  const y = 0.55, shY = 1.0;
  P(BONE.pelvis, 0, y, 0); P(BONE.torso, 0, y + 0.05, 0); P(BONE.head, 0, shY + 0.02, 0);
  P(BONE.uaL, 0.24, shY - 0.04, 0); P(BONE.faL, 0.26, shY - 0.27, 0); P(BONE.uaR, -0.24, shY - 0.04, 0); P(BONE.faR, -0.26, shY - 0.27, 0);
  P(BONE.thL, 0.08, y - 0.1, 0); P(BONE.shL, 0.08, y - 0.3, -0.05); P(BONE.thR, -0.08, y - 0.1, 0); P(BONE.shR, -0.08, y - 0.3, -0.05);
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: 0.12, rx: 0.03, ao: 0.3 }, { y: 0.3, rx: 0.09 }, { y: y, rx: 0.16 }], rI, { seg: 8 });
  mb.setBone(BONE.torso);
  loft(mb, [{ y: y, rx: 0.15, ao: 0.2 }, { y: y + 0.2, rx: 0.14 }, { y: shY - 0.05, rx: 0.22, rz: 0.15 }, { y: shY + 0.02, rx: 0.1 }], rG, { seg: 8 });
  mb.box(-0.06, y + 0.3, 0.14, 0.06, y + 0.38, 0.17, eye, { glow: true, ao: 0 });
  if (!lod) for (const s of [-1, 1]) mb.cyl(s * 0.35, shY + 0.1, -0.1, 0.18, 0.03, rI, { seg: 3, r1: 0, ao: 0 }); // shards
  mb.setBone(BONE.head);
  let top = shY + 0.36;
  if (hero && !simple) {
    const av = buildAvatarMesh(heroLook3d(u).look), hs = GFX.unit.headScale, M = matsOf(av);
    M.skin = rampRGB(k === 'n' ? ['o', 'n', 'p'] : ['i', k, 'h']);
    top = placeHead(o, av, shY + 0.02 + 0.75 * hs, hs, M, top);
  } else {
    loft(mb, [{ y: shY + 0.03, rx: 0.06 }, { y: shY + 0.14, rx: 0.15 }, { y: shY + 0.28, rx: 0.1 }, { y: shY + 0.33, rx: 0.02 }], rG, { seg: 7 });
    mb.box(-0.1, shY + 0.16, 0.12, 0.1, shY + 0.21, 0.15, eye, { glow: true, ao: 0 });
  }
  for (const s of [1, -1]) {
    const x = s * 0.24;
    mb.setBone(s > 0 ? BONE.uaL : BONE.uaR); limb(mb, x, 0, shY + 0.02, shY - 0.27, 0.05, 0.04, rG, { seg: 6 });
    mb.setBone(s > 0 ? BONE.faL : BONE.faR).cyl(s * 0.26, shY - 0.5, 0, 0.23, 0.015, rI, { seg: 5, r1: 0.045, ao: 0 });
    mb.setBone(s > 0 ? BONE.thL : BONE.thR).cyl(s * 0.08, y - 0.3, 0, 0.2, 0.012, rI, { seg: 4, r1: 0.04, ao: 0 });
    mb.setBone(s > 0 ? BONE.shL : BONE.shR).cyl(s * 0.08, y - 0.48, -0.05, 0.18, 0.0, rG, { seg: 4, r1: 0.03, ao: 0 });
  }
  if (o.wk) { mb.setBone(BONE.faR); weapon(mb, -0.26, shY - 0.52, o.wk); }
  return top;
}
