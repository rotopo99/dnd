// GLB heroes in battle and free roam (docs/specs/threejs-migration.md §6, stage 3): party members, companions and other
// players are Blender characters (three/character.js: body + outfit + hair of the appearance editor look, tints,
// shape keys, faces, spring bones) driven by the same display state as the procedural templates (gfx/scene3d.js
// prepFrame instance p: position, facing, walk, alpha, flash, team colour; gfx/anim.js state: action / hit / fall).
// Clips: idle / walk / run / crouch_walk loops, one-shots attack_melee / attack_shoot / cast / hit / death sped up to
// the action length (missing clip — the current loop stays). Loading is async: until the character is ready (or when
// it failed — then for the whole session) the unit is drawn by the procedural template. Enemies stay procedural.
//   partySpec(u)                     -> spec | null (eligible unit: data/hero-models.js teams / races, humanoid body)
//   syncParty(T, p, c)               -> true when the unit p is drawn by its GLB character this frame
//                                       (c: {now (display clock), ppm (px per metre), prefs, hgt (unit heights)})
//   sweepParty(T)                    hide characters not drawn this frame; drop after HERO_MODELS.keepUnseen s
//   dropParty(T)                     dispose all (scene change: three/battle.js dropBattleThree)
// Weapon in the right hand by the equipped weapon category (three/weapons.js), re-attached when it changes.
import * as THREE from 'three';
import { HERO_MODELS as HM } from '../data/hero-models.js';
import { CINE_FACES } from '../data/cine-play.js';
import { GFX } from '../data/gfx.js';
import { bodyType } from '../gfx/units3d.js';
import { heroLook3d } from '../ui/hero-avatar.js';
import { assembleCharacter, toonify, setBodyShape, setFace, stepSprings, disposeCharacter, heroSpec } from './character.js';
import { weaponKey, attachWeapon, detachWeapon } from './weapons.js';

const failed = new Set(); // spec keys that did not load: procedural for the session
const specs = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wallNow = () => performance.now() / 1000;

export function partySpec(u) {
  if (!HM.on || u.kind !== 'hero' || !HM.teams.includes(u.team) || !HM.races.includes(u.raceId || 'human') || bodyType(u) !== 'humanoid') return null;
  const sig = `${heroLook3d(u).key}|${JSON.stringify(u.hide || 0)}|${u.armorType || ''}`;
  let m = specs.get(u);
  if (!m || m.sig !== sig) { m = { sig, spec: heroSpec(u) }; specs.set(u, m); }
  return failed.has(m.spec.key) ? null : m.spec;
}

function hullMat() {
  const m = new THREE.MeshBasicMaterial({ color: HM.outline, side: THREE.BackSide });
  m.userData.grow = { value: 0.01 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrow = m.userData.grow;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrow;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * uGrow;');
  };
  m.customProgramCacheKey = () => 'partyHull';
  return m;
}
const xrayMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: GFX.unit.xray, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });

function build(T, id, R, spec) {
  assembleCharacter(spec).then((C) => {
    if (R.dead) { disposeCharacter(C); return; }
    R.hull = hullMat(); R.xray = xrayMat();
    toonify(C, { tint: spec.tint, outline: () => R.hull, xray: () => R.xray });
    setBodyShape(C, spec.shape);
    C.bodies = [];
    C.root.traverse((o) => {
      if (!o.isMesh) return;
      o.renderOrder = o.userData.xray ? 1 : 2; // x-ray in the opaque list before the bodies (as the procedural units)
      if (!o.userData.hull && !o.userData.xray) C.bodies.push(o);
    });
    C.root.visible = false;
    T.scene.add(C.root);
    R.C = C;
    R.wkey = undefined; // weapon attached by syncParty (follows the equipped weapon)
  }).catch((e) => {
    console.warn('party model', spec.key, e?.message || e);
    failed.add(spec.key);
    if (T.party.get(id) === R) T.party.delete(id);
  });
}

function dropRec(R) {
  R.dead = true;
  if (R.C) { R.C.root.parent?.remove(R.C.root); disposeCharacter(R.C); R.W = null; R.hull?.dispose(); R.xray?.dispose(); R.C = null; }
}

/** Clip choice: fall / action / hit one-shots by the gfx/anim.js state, else the locomotion loop by display speed. */
function animate(R, p, now, dt) {
  const C = R.C, I = C.inst, st = p.st, d = p.it.d;
  const fall = p.dead || !!d.down, fallT = p.dead ? st.deathT0 : st.downT0;
  const one = (name, dur, t0) => {
    const clip = I.clips.get(name);
    if (!clip) return false;
    const sp = dur ? clamp(clip.duration / dur, HM.clipSpeed[0], HM.clipSpeed[1]) : 1;
    I.play(name, { restart: true, speed: sp, fade: HM.fade * 0.6 });
    R.cur = name; R.oneEnd = name === 'death' ? Infinity : t0 + clip.duration / sp;
    return true;
  };
  if (fall) {
    if (R.cur !== 'death' && now >= fallT) one('death', 0, now);
  } else {
    if (R.cur === 'death') R.oneEnd = 0;
    if (st.act && st.t0 !== R.actT0 && now >= st.t0 && now < st.t0 + st.dur) { R.actT0 = st.t0; one(HM.clip[st.act] || 'attack_melee', st.dur, now); }
    else if (st.hitT0 !== R.hitT0 && now >= st.hitT0 && now < st.hitT0 + 1) { R.hitT0 = st.hitT0; one('hit', 0, now); }
  }
  if (fall || now < R.oneEnd) return;
  const moving = p.walking || R.v > 0.3;
  let name = 'idle', sp = 1;
  if (moving) {
    const crouch = (p.it.crouch || 0) > 0.5 && I.clips.has('crouch_walk');
    name = crouch ? 'crouch_walk' : R.v > HM.runAt && I.clips.has('run') ? 'run' : 'walk';
    sp = clamp(R.v / (name === 'run' ? HM.runSpeed : HM.walkSpeed) / (R.k || 1), 0.6, 2);
  }
  if (!I.clips.has(name)) name = 'idle';
  const a = I.play(name, { fade: HM.fade, speed: sp });
  if (a) a.timeScale = sp;
  R.cur = name;
}

export function syncParty(T, p, c) {
  const u = p.it.u, spec = partySpec(u);
  if (!spec) return false;
  const id = u.id;
  let R = T.party.get(id);
  if (R && R.key !== spec.key) { dropRec(R); R = null; }
  if (!R) { R = { key: spec.key, C: null, dead: false, v: 0, oneEnd: 0, actT0: p.st.act ? p.st.t0 : null, hitT0: p.st.hitT0, cur: null }; T.party.set(id, R); build(T, id, R, spec); }
  R.seen = T.partyFrame; R.seenAt = wallNow();
  if (!R.C) return false;
  const C = R.C, d = p.it.d, now = c.now;
  const wk = weaponKey(u);
  if (wk !== R.wkey) { detachWeapon(C, R.W); R.W = attachWeapon(C, wk, R.hull); R.wkey = wk; }
  const dt = R.lastNow == null ? 0 : clamp(now - R.lastNow, 0, 0.25);
  R.lastNow = now;
  const x = d.x + 0.5, z = d.y + 0.5, y = c.hgt[id] ?? 0;
  if (R.lx != null && dt > 0) R.v += (Math.hypot(x - R.lx, z - R.lz) / dt - R.v) * Math.min(1, dt * 8);
  if (!p.walking && dt > 0 && R.v < 0.05) R.v = 0;
  R.lx = x; R.lz = z;
  R.k = (p.T.top * p.T.scale) / C.height; // same height as the template: 2D anchors (bars, bubbles) and picking match
  C.root.position.set(x, y, z);
  C.root.rotation.y = p.a ?? 0;
  C.root.scale.setScalar(R.k);
  C.root.visible = true;
  animate(R, p, now, dt);
  C.inst.update(dt);
  C.root.updateMatrixWorld(true);
  stepSprings(C, dt, (HM.physics[c.prefs.physics] ?? 1) * (c.prefs.reduceMotion ? 0.5 : 1));
  // face: emotion of the display state (CINE_FACES), blink as the procedural faces
  const d2 = p.it.d, emo = d2.emoT > 0 && d2.emo ? d2.emo : 'neutral', F = CINE_FACES[emo] || CINE_FACES.neutral;
  const blink = p.dead || d2.down || ((now * 0.37 + (p.st.seed || 0) * 7.3) % 1) < 0.045;
  setFace(C, F.tex, F.keys, blink ? 1 : 0);
  // alpha, flash, shadows, outline (team colour, px -> metres -> model units), x-ray
  const fl = p.flash * HM.flash;
  for (const m of C.mats) {
    m.opacity = p.alpha; m.transparent = p.trans; m.depthWrite = !p.trans;
    m.emissive.copy(m.userData.emissive0); if (fl > 0) m.emissive.addScalar(fl);
  }
  for (const o of C.bodies) o.castShadow = !p.trans;
  const tm = p.team;
  R.hull.color.set(HM.outline).lerp(new THREE.Color().setRGB(tm[0], tm[1], tm[2], THREE.SRGBColorSpace), HM.outlineTeam);
  R.hull.userData.grow.value = p.grow / c.ppm / R.k;
  R.W?.hullMat?.color.copy(R.hull.color);
  R.xray.color.setRGB(tm[0], tm[1], tm[2], THREE.SRGBColorSpace);
  for (const o of C.extra) o.visible = o.userData.hull ? !p.trans : !p.trans && !p.dead;
  return true;
}

export function sweepParty(T) {
  const t = wallNow();
  for (const [id, R] of T.party) {
    if (R.seen === T.partyFrame) continue;
    if (R.C) R.C.root.visible = false;
    R.lastNow = null; R.lx = null;
    if (t - (R.seenAt || 0) > HM.keepUnseen) { dropRec(R); T.party.delete(id); }
  }
  T.partyFrame = (T.partyFrame || 0) + 1;
}

export function dropParty(T) {
  for (const R of T.party.values()) dropRec(R);
  T.party.clear();
}
