// GLB heroes in battle and free roam (docs/specs/threejs-migration.md §6, stage 3): party members, companions and other
// players are Blender characters (three/character.js: body + outfit + hair of the appearance editor look, tints,
// shape keys, faces, spring bones) driven by the same display state as the procedural templates (gfx/scene3d.js
// prepFrame instance p: position, facing, walk, alpha, flash, team colour; gfx/anim.js state: action / hit / fall).
// Clips: idle / walk / run / crouch_walk loops, one-shots attack_melee / attack_shoot / cast / hit / death sped up to
// the action length (missing clip — the current loop stays). Loading is async: until the character is ready (or when
// it failed — then for the whole session) the unit is drawn by the procedural template.
// Enemies (Blender pass 6, HERO_MODELS.enemy): cultists / кринжгоны, pirates, mutants / brutes on the hero rig (weapon in
// hand, hero clips), Warprom robo-wolves (idle / walk / run, bite) and drones (idle / move, shoot) on own armatures;
// pass 7: Warprom androids (hero rig), «Кузнечик» walkers (shoot / stomp / rockets by ability id), «Лис» robo-foxes;
// tint variety by the unit id hash; other enemies stay procedural. GLB units report their model top (bars, picking).
// Key characters (Lox, the Judge avatar, Ladov, the Cyber-Priest: HERO_MODELS.npc byNpc / byEnemy — companions,
// bosses, roam NPCs) and roam crowd NPCs (trader / guard / settler by role, cloth / hair tint by the npc id) use the
// assembled npc_<id>.glb. Two-handed weapons switch to the *_2h clips. Night tint / light holes as the procedural units.
//   partySpec(u)                     -> spec | null (eligible unit: data/hero-models.js teams / races, humanoid body; npc models)
//   npcModelOf(u)                    -> {nid, tint} | null (which npc_<nid>.glb a unit uses)
//   enemyModelOf(u)                  -> {model, tint} | null (which enemy_<model>.glb an enemy uses)
//   syncParty(T, p, c)               -> true when the unit p is drawn by its GLB character this frame
//                                       (c: {now (display clock), ppm (px per metre), prefs, hgt (unit heights), tops?: {id: model top, m}})
//   sweepParty(T)                    hide characters not drawn this frame; drop after HERO_MODELS.keepUnseen s
//   dropParty(T)                     dispose all (scene change: three/battle.js dropBattleThree)
// Weapon in the right hand by the equipped weapon category (three/weapons.js), re-attached when it changes.
import * as THREE from 'three';
import { HERO_MODELS as HM } from '../data/hero-models.js';
import { CINE_FACES } from '../data/cine-play.js';
import { NPCS } from '../data/npcs.js';
import { GFX } from '../data/gfx.js';
import { bodyType } from '../gfx/units3d.js';
import { heroLook3d } from '../ui/hero-avatar.js';
import { HULL_PUSH_VS, assembleCharacter, toonify, setBodyShape, setFace, stepSprings, disposeCharacter, heroSpec, npcSpec, enemySpec } from './character.js';
import { weaponKey, attachWeapon, detachWeapon, isTwoHand } from './weapons.js';
import { nightPatch } from './units.js';
import { keyRGB } from '../gfx/mesh.js';

const failed = new Set(); // spec keys that did not load: procedural for the session
const specs = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wallNow = () => performance.now() / 1000;
const ZERO = new THREE.Vector3(), CARRY_POS = new THREE.Vector3(...HM.weapon.carry2hPos);
const SPH = new THREE.Sphere(), TEAM_C = new THREE.Color();

const srgbKey = (k) => { const c = keyRGB(k); return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); };
const hashOf = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };

export function npcModelOf(u) {
  const N = HM.npc;
  if (!N?.on) return null;
  if (u.kind === 'enemy') { const nid = N.byEnemy[String(u.enemyId || '').split('^')[0]]; return nid ? { nid, tint: null } : null; }
  if (u.kind !== 'hero') return null;
  // roam pseudo units carry npcId (gfx/roam3d.js); battle companions are c-<npc id> (world/state.js)
  const id = u.npcId || (typeof u.id === 'string' && u.id.startsWith('c-') ? u.id.slice(2) : null);
  if (!id) return null;
  if (N.byNpc[id]) return { nid: N.byNpc[id], tint: null };
  if (u.team !== 'npc' || !N.crowd.races.includes(u.raceId || 'human')) return null;
  const n = NPCS[id] || {}, C = N.crowd, h = hashOf(id), T = N.crowdTint;
  const role = n.services?.includes('trade') ? 'trade' : C.guardFactions.includes(n.faction) ? 'guard' : 'other';
  const pal = T[role][h % T[role].length];
  return { nid: C[role], tint: { cloth: pal[0], coat: pal[1], skin: T.skin[(h >>> 12) % T.skin.length], pants: T.pants[(h >>> 16) % T.pants.length], hair: T.hair[(h >>> 8) % T.hair.length] } };
}

const enemyRule = new Map(); // enemy id -> model | null
export function enemyModelOf(u) {
  const E = HM.enemy;
  if (!E?.on || u.kind !== 'enemy') return null;
  const id = String(u.enemyId || u.id || '').split('^')[0];
  let rule = enemyRule.get(id);
  if (rule === undefined) {
    const bt = bodyType(u), r = E.rules.find((q) => new RegExp(q.re).test(id) && (!q.body || q.body.includes(bt))), model = r?.model || null;
    // a humanoid model over a non-humanoid template (beast mutants): fixed humanoid height instead of the template's
    const M = model && E.models[model];
    rule = model && { model, fixH: M.h || (M.kind === 'humanoid' && bt !== 'humanoid' ? E.humanH : 0), scale: r.scale || 1, tint: r.tint || null };
    enemyRule.set(id, rule);
  }
  if (!rule) return null;
  const model = rule.model;
  const P = { ...(E.tint[model] || {}), ...(rule.tint || {}) }, h = hashOf(String(u.id ?? id));
  const tint = {};
  let bit = 0;
  const hm = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; // mixed: sequential unit ids differ in the low bits only
  for (const k of ['cloth', 'coat', 'pants', 'skin', 'mul']) { const L = P[k]; if (L?.length) tint[k] = L[((k === 'mul' ? hm : h) >>> bit) % L.length]; bit += 5; }
  return { model, tint, fixH: rule.fixH, scale: rule.scale };
}

export function partySpec(u) {
  if (!HM.on) return null;
  const nm = npcModelOf(u);
  if (nm) {
    let m = specs.get(u);
    if (!m || m.sig !== 'npc') { m = { sig: 'npc', spec: npcSpec(nm.nid, nm.tint) }; specs.set(u, m); }
    if (!failed.has(m.spec.key)) return m.spec;
  }
  if (u.kind === 'enemy') {
    let m = specs.get(u);
    if (!m || m.sig !== 'enemy') { const em = enemyModelOf(u); m = { sig: 'enemy', spec: em && { ...enemySpec(em.model, em.tint), fixH: em.fixH, scale: em.scale } }; specs.set(u, m); }
    return m.spec && !failed.has(m.spec.key) ? m.spec : null;
  }
  if (u.kind !== 'hero' || !HM.teams.includes(u.team) || !HM.races.includes(u.raceId || 'human') || bodyType(u) !== 'humanoid') return null;
  const sig = `${heroLook3d(u).key}|${JSON.stringify(u.hide || 0)}|${u.armorType || ''}`;
  let m = specs.get(u);
  if (!m || m.sig !== sig) { m = { sig, spec: heroSpec(u) }; specs.set(u, m); }
  return failed.has(m.spec.key) ? null : m.spec;
}

function hullMat() {
  const m = new THREE.MeshBasicMaterial({ color: HM.outline, side: THREE.BackSide });
  m.userData.grow = { value: 0.01 };
  m.userData.push = { value: 0 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrow = m.userData.grow; s.uniforms.uPush = m.userData.push;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrow, uPush;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * uGrow;')
      .replace('#include <project_vertex>', HULL_PUSH_VS);
  };
  m.customProgramCacheKey = () => 'partyHull2';
  return m;
}
const xrayMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: GFX.unit.xray, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });

function build(T, id, R, spec) {
  assembleCharacter(spec).then((C) => {
    if (R.dead) { disposeCharacter(C); return; }
    R.hull = hullMat(); R.xray = xrayMat();
    const EM = spec.enemy && HM.enemy.models[spec.enemy], ET = spec.enemy && HM.enemy.tint[spec.enemy];
    toonify(C, { tint: spec.tint, outline: () => R.hull, xray: () => R.xray,
      ...(EM && { glow: HM.enemy.glow, glowK: HM.enemy.glowK, mulRe: ET?.mulRe, mulK: ET?.mulK, faceSkin: EM.faceSkin ? HM.enemy.faceRef : null }) });
    // locomotion / action clips: hero rig (HERO_MODELS) or the mech set of the enemy model
    R.prof = EM && EM.kind !== 'humanoid' ? EM : null;
    R.size = spec.enemy ? (C.meta?.scale || 1) * (spec.scale || 1) : 1; // brute: meta scale 1.18; bosses: rule scale
    R.fixH = spec.fixH || 0;
    // head top of the model in its own units (bind-pose bounds incl. helmet / hair / hull): HP bar / bubble anchor, picking
    C.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(C.root);
    R.topL = Number.isFinite(bb.max.y) ? (bb.max.y - C.root.position.y) / (C.root.scale.y || 1) : C.height;
    const L = spec.npc && HM.npc.lift?.[spec.npc];
    if (L) { // QA v42 L3: lighter key model + light rim (Ladov: dark grey on a grey dais)
      for (const m of C.mats) { if (m.name === 'Face') continue; m.color.multiplyScalar(L.gain); m.userData.emissive0.addScalar(L.emissive); }
      R.rim = { c: srgbKey(L.rim), k: L.rimK, grow: L.grow };
    }
    for (const m of C.mats) nightPatch(m, T.UU);
    nightPatch(R.hull, T.UU);
    setBodyShape(C, spec.shape);
    C.bodies = [];
    C.root.traverse((o) => {
      if (!o.isMesh) return;
      o.renderOrder = o.userData.xray ? 1 : 2; // x-ray in the opaque list before the bodies (as the procedural units)
      if (o.userData.hull || o.userData.xray) return;
      C.bodies.push(o);
      o.userData.unit = true; // quality without aoUnits: out of the GTAO g-buffer (three/engine.js)
      // perf: small parts (face, trims, buckles) do not cast — their shadow lies inside the body's (GFX.three.shadowMinR)
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.userData.caster = o.geometry.boundingSphere.radius >= GFX.three.shadowMinR;
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
    const a2 = R.two && HM.clip2h[st.act], P = R.prof;
    const act = P ? P.act[st.abil] || P.act[st.act] || P.actDefault : a2 && I.clips.has(a2) ? a2 : HM.clip[st.act] || 'attack_melee';
    // a long frame (hitch, software GL) can jump over the whole action window: the previous drawn frame (R.pn) was before
    // its start — play it late rather than never (three-enemies.mjs «attack -> idle»)
    const late = (t0) => R.pn != null && R.pn < t0;
    if (st.act && st.t0 !== R.actT0 && now >= st.t0 && (now < st.t0 + st.dur || late(st.t0))) { R.actT0 = st.t0; one(act, st.dur, now); }
    else if (st.hitT0 !== R.hitT0 && now >= st.hitT0 && (now < st.hitT0 + 1 || late(st.hitT0))) { R.hitT0 = st.hitT0; one('hit', 0, now); }
  }
  if (fall || now < R.oneEnd) return;
  const moving = p.walking || R.v > 0.3;
  let name = 'idle', sp = 1;
  if (moving) {
    const P = R.prof || HM, crouch = !R.prof && (p.it.crouch || 0) > 0.5 && I.clips.has('crouch_walk');
    const run = R.v > P.runAt && I.clips.has(R.prof ? P.loop.run : 'run');
    name = crouch ? 'crouch_walk' : R.prof ? P.loop[run ? 'run' : 'walk'] : run ? 'run' : 'walk';
    sp = clamp(R.v / (run ? P.runSpeed : P.walkSpeed) / (R.k || 1), 0.6, 2);
  }
  if (!I.clips.has(name)) name = 'idle';
  const n2 = R.two && HM.loop2h[name];
  if (n2 && I.clips.has(n2)) name = n2;
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
  const wk = R.prof ? null : weaponKey(u); // mechs: the weapon is part of the model
  if (wk !== R.wkey) {
    detachWeapon(C, R.W); R.W = attachWeapon(C, wk, R.hull); R.wkey = wk;
    R.two = isTwoHand(wk) && C.inst.clips.has('idle_2h');
    if (R.W) { for (const m of R.W.mats) nightPatch(m, T.UU); if (R.W.hullMat) nightPatch(R.W.hullMat, T.UU); }
  }
  const dt = R.lastNow == null ? 0 : clamp(now - R.lastNow, 0, 0.25);
  R.pn = R.lastNow; R.lastNow = now;
  const x = d.x + 0.5, z = d.y + 0.5, y = c.hgt[id] ?? 0;
  if (R.lx != null && dt > 0) R.v += (Math.hypot(x - R.lx, z - R.lz) / dt - R.v) * Math.min(1, dt * 8);
  if (!p.walking && dt > 0 && R.v < 0.05) R.v = 0;
  R.lx = x; R.lz = z;
  R.k = (R.fixH || p.T.top * p.T.scale) / C.height * R.size; // same height as the template: 2D anchors (bars, bubbles) and picking match
  if (c.tops) c.tops[id] = Math.max(R.topL, C.height) * R.k; // m over the feet (gfx/scene3d.js unitScreen, three/battle.js pick)
  // perf: outside the camera frustum (+ margin for the shadow) — not drawn, not animated (bodies are not culled by Three:
  // the skinned bounding sphere costs a pass over all vertices, the hull / x-ray twins have none)
  const hh = Math.max(R.topL, C.height) * R.k;
  SPH.center.set(x, y + hh * 0.5, z); SPH.radius = hh * 0.75 + 1;
  if (c.frustum && !c.frustum.intersectsSphere(SPH)) { C.root.visible = false; R.lastNow = null; R.lx = null; return true; }
  C.root.position.set(x, y, z);
  C.root.rotation.y = p.a ?? 0;
  C.root.scale.setScalar(R.k);
  C.root.visible = true;
  // quality (gfx/quality.js): far from the camera focus — no outline, no spring bones; roam crowd — x-ray by the preset
  const Q = c.Q, far = !!(Q?.near && c.focus && Math.hypot(x - c.focus.x, z - c.focus.z) > Q.near);
  const xrayOff = Q && !Q.xrayCrowd && p.it.u.team === 'npc';
  animate(R, p, now, dt);
  if (R.W?.carry) { // two-handed carry <-> native shaft (attack_2h)
    const nat = HM.weapon.carry2hNative.includes(C.inst.current()), pv = R.W.pivot, k = Math.min(1, dt * HM.weapon.carryLerp);
    pv.rotation.x += ((nat ? 0 : R.W.carry) - pv.rotation.x) * k;
    pv.position.lerp(nat ? ZERO : CARRY_POS, k);
  }
  C.inst.update(dt);
  C.root.updateMatrixWorld(true);
  if (!far) stepSprings(C, dt, (HM.physics[c.prefs.physics] ?? 1) * (c.prefs.reduceMotion ? 0.5 : 1));
  // face: emotion of the display state (CINE_FACES), blink as the procedural faces
  const d2 = p.it.d, emo = d2.emoT > 0 && d2.emo ? d2.emo : 'neutral', F = CINE_FACES[emo] || CINE_FACES.neutral;
  const blink = p.dead || d2.down || ((now * 0.37 + (p.st.seed || 0) * 7.3) % 1) < 0.045;
  if (C.faces.length || C.morph.length) setFace(C, F.tex, F.keys, blink ? 1 : 0);
  // alpha, flash, shadows, outline (team colour, px -> metres -> model units), x-ray
  const fl = p.flash * HM.flash;
  for (const m of C.mats) {
    m.opacity = p.alpha; m.transparent = p.trans; m.depthWrite = !p.trans;
    m.emissive.copy(m.userData.emissive0); if (fl > 0) m.emissive.addScalar(fl);
  }
  for (const o of C.bodies) o.castShadow = !p.trans && o.userData.caster !== false;
  const tm = p.team;
  // QA v42 L2: roam NPCs keep a near-dark hull — the team yellow over a thick hull turned the crowd into gold silhouettes
  R.hull.color.set(HM.outline).lerp(TEAM_C.setRGB(tm[0], tm[1], tm[2], THREE.SRGBColorSpace), p.it.u.team === 'npc' ? HM.outlineTeamNpc : HM.outlineTeam);
  if (R.rim) R.hull.color.lerp(R.rim.c, R.rim.k);
  R.hull.userData.grow.value = p.grow / c.ppm / R.k * (R.rim?.grow || 1);
  R.hull.userData.push.value = p.grow / c.ppm * (R.rim?.grow || 1) * HM.outlinePush; // world m (view space)
  R.W?.hullMat?.color.copy(R.hull.color);
  R.xray.color.setRGB(tm[0], tm[1], tm[2], THREE.SRGBColorSpace);
  for (const o of C.extra) o.visible = o.userData.hull ? !p.trans && !far : !p.trans && !p.dead && !xrayOff;
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
