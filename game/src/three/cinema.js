// Cinematic view on Three.js (docs/specs/cinematics.md §7.1): a separate scene — stage diorama (CINE_STAGES), actors from
// GLB (three/models.js: cache, SkeletonUtils.clone, AnimationMixer), toon materials + inverted-hull outline, faces
// (atlas swap face_<sex>_<emo>.png + shape keys), blinking, head look, procedural gestures for missing clips, camera by
// shots (SHOT_FRAMES / SHOT_MOVES: push pull pan orbit crane fig8 hand whip shake). Reads the runner state R
// (world/cine.js); never writes it.
//   createCinemaView(E) -> V { load(def, hero) Promise, ready, failed, frame(R, dt, W, H), shake(amp), dispose() }
import * as THREE from 'three';
import { instanceGLB, loadGLB } from './models.js';
import { SHOT_FRAMES, SHOT_MOVES } from '../data/cinematics/index.js';
import {
  CINE_VIEW as CV, CLIP_FALLBACK, CINE_GESTURES, GESTURE_IN, CINE_FACES, CINE_MODELS, CINE_LOOKS, CINE_AIM, CINE_SIDE_DEG, CINE_STAGES,
} from '../data/cine-play.js';

const DIR = new URL('../../assets/models/', import.meta.url).href;
const HAIRS = ['bob', 'long', 'ponytail', 'short', 'spiky', 'twin'];
const MORPHS = ['blink', 'happy', 'angry', 'sad', 'surprised'];
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpK = (rate, dt) => 1 - Math.exp(-rate * dt);

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function faceTex(sex, id) {
  const url = `${DIR}face_${sex}_${id}.png`;
  let t = texCache.get(url);
  if (!t) {
    t = texLoader.load(url);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return t;
}

let ramp = null;
function toonRamp() {
  if (ramp) return ramp;
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

/** GLB files of a cast entry: { base, parts, sex, hair, scale, tint }. */
function filesOf(c, hero) {
  if (c.k === 'hero') {
    const sex = hero?.avatar?.gender === 'f' ? 'f' : 'm';
    const hs = hero?.avatar?.hair;
    return { base: `hero_${sex}_field`, parts: [], sex, hair: HAIRS.includes(hs) ? hs : null };
  }
  if (c.model === null) return null;
  const m = CINE_MODELS[c.model];
  if (m) return { ...m, sex: m.base.endsWith('_f') ? 'f' : 'm', hair: c.hair || null };
  if (/^hero_[mf]_/.test(c.model || '')) return { base: c.model, parts: [], sex: c.model[5], hair: c.hair || null };
  return { base: 'body_m', parts: ['outfit_rags_m'], sex: 'm', hair: c.hair || null };
}

const outlineMat = (() => {
  let m = null;
  return () => {
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color: 0x14141c, side: THREE.BackSide });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * 0.0035;');
    };
    return m;
  };
})();

/** Plain PBR from Blender -> toon (3 bands) per instance; the Face material is kept for the atlas swap. */
function toonify(A, look) {
  const L = look ? CINE_LOOKS[look] : null;
  const meshes = [];
  A.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const conv = (m) => {
      const t = new THREE.MeshToonMaterial({ name: m.name, color: m.color?.clone() || new THREE.Color(1, 1, 1), map: m.map || null, gradientMap: toonRamp(),
        side: THREE.DoubleSide, transparent: !!L?.opacity, opacity: L?.opacity ?? 1, emissive: new THREE.Color(L?.emissive ?? (/glow/i.test(m.name) ? 0x4fa0f0 : 0)) });
      if (L?.tint) t.color.lerp(new THREE.Color(L.tint), 0.6);
      if (A.tint && m.name === 'Skin') t.color.set(A.tint);
      if (m.name === 'Face') A.faces.push(t);
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.castShadow = !L?.opacity; o.receiveShadow = true;
    if (o.morphTargetDictionary && o.morphTargetInfluences) A.morph.push(o);
    if (o.isSkinnedMesh && !L?.opacity) { // inverted hull sharing the skeleton and the morph weights
      const h = new THREE.SkinnedMesh(o.geometry, outlineMat());
      h.bind(o.skeleton, o.bindMatrix);
      if (o.morphTargetInfluences) { h.morphTargetInfluences = o.morphTargetInfluences; h.morphTargetDictionary = o.morphTargetDictionary; }
      h.frustumCulled = false; h.castShadow = false; h.userData.hull = true;
      o.parent.add(h);
      h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale);
    }
  }
}

async function buildActor(who, c, hero) {
  const F = filesOf(c, hero);
  if (!F) return null;
  const inst = await instanceGLB(`${DIR}${F.base}.glb`);
  const A = { who, inst, root: inst.root, sex: F.sex, faces: [], morph: [], tint: F.tint, look: c.look || null, bones: new Map(), rest: new Map(),
    yaw: 0, headYaw: 0, headPitch: 0, w: Object.fromEntries(MORPHS.map((k) => [k, 0])), blinkT: 0, nextBlink: 1 + Math.random() * 3,
    face: null, act: null, clip: null, gT: 0, gesture: null, placed: false, headY: 1.62 };
  const parts = [...(F.parts || [])];
  if (F.hair) {
    A.root.traverse((o) => { if (o.isMesh && /^Hair/i.test(o.name)) o.visible = false; });
    parts.push(`hair_${F.hair}_${F.sex}`);
  }
  for (const p of parts) { try { inst.attach(await loadGLB(`${DIR}${p}.glb`)); } catch (e) { console.warn('cinema part', p, e?.message || e); } }
  const hidden = [];
  A.root.traverse((o) => { if (o.isMesh && !o.visible) hidden.push(o); });
  for (const o of hidden) o.parent?.remove(o);
  if (F.scale) A.root.scale.setScalar(F.scale);
  toonify(A, c.look);
  A.root.traverse((o) => { if (o.isBone && !A.bones.has(o.name)) { A.bones.set(o.name, o); A.rest.set(o.name, o.quaternion.clone()); } });
  inst.play('idle');
  inst.update(0);
  A.root.updateMatrixWorld(true);
  const hb = A.bones.get('head');
  if (hb) A.headY = hb.getWorldPosition(new THREE.Vector3()).y + 0.08;
  return A;
}

function buildStage(scene, id) {
  const S = CINE_STAGES[id] || CINE_STAGES['dock-riot'];
  const disp = [];
  const mat = (col, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, metalness: 0.05, ...o }); disp.push(m); return m; };
  const geo = (g) => { disp.push(g); return g; };
  scene.background = new THREE.Color(S.fog);
  scene.fog = new THREE.Fog(S.fog, 14, 34);
  const floor = new THREE.Mesh(geo(new THREE.PlaneGeometry(40, 40)), mat(S.floor));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new THREE.Mesh(geo(new THREE.PlaneGeometry(40, 12)), mat(S.wall));
  wall.position.set(0, 6, -9); wall.receiveShadow = true; scene.add(wall);
  const strip = new THREE.Mesh(geo(new THREE.BoxGeometry(40, 0.08, 0.08)), mat(S.glow, { emissive: new THREE.Color(S.glow), emissiveIntensity: 1.5 }));
  strip.position.set(0, 3.2, -8.9); scene.add(strip);
  for (const [x, z, w, h, d, col] of S.props || []) {
    const b = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), mat(col));
    b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; scene.add(b);
  }
  scene.add(new THREE.HemisphereLight(0x8d95a8, S.floor, 0.9));
  const key = new THREE.DirectionalLight(S.key, 2.4);
  key.position.set(4, 7, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const fill = new THREE.DirectionalLight(S.fill, 0.7); fill.position.set(-5, 3, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(S.glow, 1.2); rim.position.set(0, 4, -8); scene.add(rim);
  return disp;
}

// ------------------------------------------------------------------------------------------------ per-frame actors

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _pw = new THREE.Quaternion(), _bw = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/** Rotate a bone about a world axis through its joint (matrices must be current). */
function rotWorld(bone, axis, ang) {
  if (!bone || !ang || !bone.parent) return;
  bone.parent.getWorldQuaternion(_pw);
  bone.getWorldQuaternion(_bw);
  _q.setFromAxisAngle(axis, ang);
  _bw.premultiply(_q);
  bone.quaternion.copy(_pw.invert().multiply(_bw));
  bone.updateMatrixWorld(true);
}
function actorAxis(A, k) {
  const y = A.yaw;
  if (k === 'u') return _axis.set(0, 1, 0);
  if (k === 'f') return _axis.set(Math.sin(y), 0, Math.cos(y));
  return _axis.set(Math.cos(y), 0, -Math.sin(y)); // 'l': the actor's left (+X of the model)
}

function facePoint(R, who, st, actors) {
  const f = st.face;
  if (f == null) return null;
  if (typeof f === 'number') return { yaw: (f * Math.PI) / 180 };
  if (Array.isArray(f)) return { x: f[0], z: f[1] };
  const o = R.cast[f];
  return o ? { x: o.at[0], z: o.at[1], who: f } : null;
}

const visibleIn = (R, who) => {
  const s = R.shot;
  return !!(R.cast[who]?.set || s?.a === who || s?.b === who || R.speaking === who || R.react?.who === who);
};

function wantClip(A, R, st, moving) {
  let anim = st.anim || 'idle';
  if (['walk', 'run', 'crouch_walk'].includes(anim) && !moving) anim = anim === 'run' ? 'run-still' : 'idle';
  if (moving) anim = 'walk';
  if (anim === 'run-still') return { clip: 'idle', gesture: 'run' };
  const has = A.inst.clips.has(anim);
  const clip = has ? anim : CLIP_FALLBACK[anim] || 'idle';
  let gesture = has ? null : CINE_GESTURES[anim] ? anim : null;
  if (!gesture && R.speaking === A.who && clip === 'idle') gesture = 'talk';
  return { clip, gesture };
}

function updateActor(A, R, dt, now) {
  const st = R.cast[A.who];
  const show = !!st && visibleIn(R, A.who);
  A.root.visible = show;
  if (!show) { A.placed = false; return; }
  // position / facing
  const tx = st.at[0], tz = st.at[1];
  if (!A.placed) { A.root.position.set(tx, 0, tz); }
  const dx = tx - A.root.position.x, dz = tz - A.root.position.z, dist = Math.hypot(dx, dz);
  const moving = A.placed && dist > 0.15;
  if (moving) { const k = Math.min(1, (CV.moveLerp * dt * 1.4) / Math.max(dist, 0.001)); A.root.position.x += dx * Math.min(1, k * dist); A.root.position.z += dz * Math.min(1, k * dist); }
  const fp = facePoint(R, A.who, st, null);
  let yaw = A.yaw;
  if (moving) yaw = Math.atan2(dx, dz);
  else if (fp?.yaw != null) yaw = fp.yaw;
  else if (fp) yaw = Math.atan2(fp.x - A.root.position.x, fp.z - A.root.position.z);
  else yaw = 0;
  let dy = yaw - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  A.yaw = A.placed ? A.yaw + dy * lerpK(CV.turnLerp, dt) : yaw;
  A.root.rotation.y = A.yaw;
  A.placed = true;
  // clip + gesture
  const w = wantClip(A, R, st, moving);
  let clip = w.clip;
  if (clip === A.spent) clip = 'idle'; else A.spent = null;
  if (clip !== A.clip) { A.act = A.inst.play(clip, { fade: 0.25 }); A.clip = clip; }
  else if (A.act && !A.act.isRunning() && clip !== 'death' && clip !== 'idle') {
    // a one-shot finished (hit / cast): settle back to idle until the scene asks for another clip
    A.spent = clip; A.act = A.inst.play('idle', { fade: 0.3 }); A.clip = 'idle';
  }
  if (w.gesture !== A.gesture) { A.gesture = w.gesture; A.gT = 0; }
  A.gT += dt;
  // rest pose for touched bones, then the mixer
  for (const n of ['head', 'neck', 'chest', 'spine', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm']) { const b = A.bones.get(n); if (b) b.quaternion.copy(A.rest.get(n)); }
  A.inst.update(dt);
  A.root.updateMatrixWorld(true);
  const G = A.gesture && CINE_GESTURES[A.gesture];
  if (G) {
    const fin = smooth(clamp(A.gT / GESTURE_IN, 0, 1));
    for (const g of G) rotWorld(A.bones.get(g.bone), actorAxis(A, g.axis).clone(), fin * (g.base + g.amp * Math.sin(2 * Math.PI * g.hz * A.gT)));
  }
  // head look: listener -> speaker, speaker -> who they face (or the camera)
  let look = null;
  if (R.speaking && R.speaking !== A.who && R.cast[R.speaking]?.set) look = R.cast[R.speaking].at;
  else if (fp && fp.x != null) look = [fp.x, fp.z];
  let hy = 0, hp = 0;
  if (look) {
    const ly = Math.atan2(look[0] - A.root.position.x, look[1] - A.root.position.z);
    let d = ly - A.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const lim = (CV.lookMaxDeg * Math.PI) / 180;
    hy = clamp(d, -lim, lim);
    hp = Math.abs(d) > lim * 1.6 ? 0 : 0.04;
  }
  const lk = lerpK(CV.lookLerp, dt);
  A.headYaw += (hy - A.headYaw) * lk; A.headPitch += (hp - A.headPitch) * lk;
  rotWorld(A.bones.get('neck'), UP, A.headYaw * 0.4);
  rotWorld(A.bones.get('head'), UP, A.headYaw * 0.6);
  rotWorld(A.bones.get('head'), actorAxis(A, 'l').clone(), A.headPitch);
  // face: emotion atlas + shape keys, blink
  const L = A.look ? CINE_LOOKS[A.look] : null;
  const emo = L?.face || st.emo || 'neutral', F = CINE_FACES[emo] || CINE_FACES.neutral;
  if (A.face !== F.tex) { A.face = F.tex; const tx2 = faceTex(A.sex, F.tex); for (const m of A.faces) { m.map = tx2; m.needsUpdate = true; } }
  A.blinkT += dt;
  let blink = 0;
  if (!L?.noBlink) {
    if (A.blinkT > A.nextBlink) { A.blinkT = 0; A.nextBlink = CV.blinkEvery[0] + Math.random() * (CV.blinkEvery[1] - CV.blinkEvery[0]); }
    blink = A.blinkT < CV.blinkSec ? Math.sin((A.blinkT / CV.blinkSec) * Math.PI) : 0;
  }
  const ek = lerpK(CV.emoLerp, dt);
  for (const k of MORPHS) {
    const target = k === 'blink' ? blink : F.keys[k] || 0;
    A.w[k] = k === 'blink' ? target : A.w[k] + (target - A.w[k]) * ek;
  }
  for (const o of A.morph) for (const k of MORPHS) { const i = o.morphTargetDictionary[k]; if (i != null) o.morphTargetInfluences[i] = A.w[k]; }
}

// ------------------------------------------------------------------------------------------------ camera

function actorAt(R, V, who) {
  const A = V.actors.get(who), st = R.cast[who];
  if (!st) return null;
  const p = A?.placed ? A.root.position : _v2.set(st.at[0], 0, st.at[1]);
  return { p: p.clone(), yaw: A ? A.yaw : 0, k: A ? A.headY / 1.62 : 1 };
}

function camDesired(R, V, shot, t) {
  const fr = SHOT_FRAMES[shot?.frame] || SHOT_FRAMES.wide;
  const name = SHOT_FRAMES[shot?.frame] ? shot.frame : 'wide';
  const mv = shot?.move ? SHOT_MOVES[shot.move] : null;
  const dur = shot?.dur ?? mv?.dur ?? 4;
  const e = dur > 0 ? smooth(clamp(t / dur, 0, 1)) : 1;
  const A = shot?.a ? actorAt(R, V, shot.a) : null, B = shot?.b ? actorAt(R, V, shot.b) : null;
  let dist = fr.dist, fov = fr.fov, h = fr.h;
  const target = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
  if (fr.target === 'stage' || !A) {
    const set = Object.entries(R.cast).filter(([, s]) => s.set);
    if (set.length) { for (const [, s] of set) target.x += s.at[0] / set.length, target.z += s.at[1] / set.length; }
    target.y = CINE_AIM.wide;
  } else if (B && fr.over) { // over the second's shoulder at the first
    const ba = B.p.clone().sub(A.p).setY(0);
    const len = Math.max(0.5, ba.length()); ba.normalize();
    target.copy(A.p).setY(CINE_AIM.ots * A.k);
    dir.copy(ba).add(new THREE.Vector3(ba.z, 0, -ba.x).multiplyScalar(0.28)).normalize();
    dist = len + fr.dist * 0.45;
  } else if (B) {
    target.copy(A.p).add(B.p).multiplyScalar(0.5).setY(CINE_AIM.two * A.k);
    const ab = B.p.clone().sub(A.p).setY(0);
    dir.set(-ab.z, 0, ab.x).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
    if (dir.z < 0) dir.negate();
    dist = Math.max(fr.dist, ab.length() * 1.15 + 1.2);
  } else {
    target.copy(A.p).setY((CINE_AIM[name] || 1.3) * A.k);
    const f = new THREE.Vector3(Math.sin(A.yaw), 0, Math.cos(A.yaw));
    const side = (CINE_SIDE_DEG * Math.PI) / 180 * (f.x > 0 ? 1 : -1);
    dir.copy(f).applyAxisAngle(UP, f.z > 0.98 ? side : -side * 0.6 * Math.sign(f.x || 1)).normalize();
    if (fr.dist < 2) h = fr.h * A.k;
  }
  if (mv && (shot.move === 'push' || shot.move === 'pull')) { dist *= 1 + mv.dist * e; fov += mv.fov * e; }
  if (mv && shot.move === 'orbit') dir.applyAxisAngle(UP, (mv.deg * Math.PI / 180) * e);
  if (mv && shot.move === 'crane') h = Math.max(0.4, h - mv.h * 0.5 + mv.h * e);
  const pos = target.clone().addScaledVector(dir, dist);
  pos.y = h;
  if (mv && shot.move === 'pan') {
    const P = shot.args?.[1] ? actorAt(R, V, shot.args[1]) : B;
    if (P) target.lerp(P.p.clone().setY(target.y), e);
    else target.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.tan(0.35) * dist * (e - 0.5)));
  }
  const sideV = new THREE.Vector3(-dir.z, 0, dir.x);
  if (mv && shot.move === 'fig8') {
    const w = (2 * Math.PI * t) / (mv.period || 8);
    pos.addScaledVector(sideV, mv.amp * Math.sin(w)); pos.y += mv.amp * 0.5 * Math.sin(2 * w);
  }
  let roll = fr.roll ? (fr.roll * Math.PI) / 180 : 0;
  let jit = 0;
  if (mv && shot.move === 'hand') jit = mv.amp;
  if (mv && shot.move === 'shake') jit = mv.amp * (1 - clamp(t / (mv.dur || 0.6), 0, 1));
  let whip = 0;
  if ((mv && shot.move === 'whip') || R.tr === 'whip') { const wd = mv?.dur || CV.whipSec; whip = (1 - smooth(clamp(t / wd, 0, 1))) * 0.6; }
  return { pos, target, fov, roll, jit, whip, sideV };
}

export function createCinemaView(E) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 80);
  const V = { E, scene, cam, actors: new Map(), ready: false, failed: false, disp: [], shotN: -1, cur: null, shakeAmp: 0, shakeT: 0, time: 0 };

  V.load = async (def, hero) => {
    try {
      V.disp = buildStage(scene, def.stage);
      const jobs = Object.entries(def.cast || {}).map(async ([who, c]) => {
        try { const A = await buildActor(who, c, hero); if (A) { V.actors.set(who, A); scene.add(A.root); } }
        catch (e) { console.warn('cinema actor', who, e?.message || e); }
      });
      await Promise.all(jobs);
      V.ready = true;
    } catch (e) { console.warn('cinema view', e); V.failed = true; }
  };

  /** Canvas px of an actor's head (QTE hint «у героя»), null when off screen. */
  V.screen = (who, W, H) => {
    const A = V.actors.get(who);
    if (!A?.root.visible) return null;
    const p = A.root.position.clone().setY(A.headY * 0.82).project(cam);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
  };

  V.shake = (amp) => { V.shakeAmp = Math.max(V.shakeAmp, amp); V.shakeT = 0; };

  V.frame = (R, dt, W, H) => {
    if (!V.ready || !E.ok()) return false;
    V.time += dt;
    for (const A of V.actors.values()) updateActor(A, R, dt, V.time);
    const d = camDesired(R, V, R.shot, R.shotT);
    if (V.shotN !== R.shotN || !V.cur) { V.cur = { pos: d.pos.clone(), target: d.target.clone() }; V.shotN = R.shotN; }
    else { const k = lerpK(CV.camLerp, dt); V.cur.pos.lerp(d.pos, k); V.cur.target.lerp(d.target, k); }
    const p = V.cur.pos.clone(), tg = V.cur.target.clone();
    V.shakeT += dt;
    const sh = V.shakeAmp * Math.max(0, 1 - V.shakeT / 0.6) + d.jit;
    if (sh) { const tt = V.time; p.x += sh * Math.sin(tt * 37.1) * 0.6; p.y += sh * Math.sin(tt * 29.3) * 0.5; tg.x += sh * Math.sin(tt * 23.7) * 0.3; }
    if (d.whip) tg.addScaledVector(d.sideV, d.whip * p.distanceTo(tg));
    const band = Math.min(H, W / CV.letterbox);
    cam.fov = (2 * Math.atan(Math.tan(((d.fov * Math.PI) / 180) / 2) * (H / band)) * 180) / Math.PI;
    cam.aspect = W / H;
    cam.position.copy(p);
    cam.up.set(0, 1, 0);
    cam.lookAt(tg);
    if (d.roll) cam.rotateZ(d.roll);
    cam.updateProjectionMatrix();
    // actors outside the shot that stand between the camera and its target are hidden (no back of a head over the frame)
    const seg = new THREE.Line3(p, tg), cp = new THREE.Vector3(), dT = p.distanceTo(tg);
    for (const A of V.actors.values()) {
      if (!A.root.visible || A.who === R.shot?.a || A.who === R.shot?.b) continue;
      const c = A.root.position.clone().setY(A.headY * 0.6);
      seg.closestPointToPoint(c, true, cp);
      if (cp.distanceTo(c) < 0.55 && p.distanceTo(c) < dT - 0.3) A.root.visible = false;
    }
    E.use();
    E.clipTo({ x: 0, y: 0, w: E.w, h: E.h });
    const r = E.renderer;
    r.setRenderTarget(null);
    r.render(scene, cam);
    return true;
  };

  V.dispose = () => {
    for (const A of V.actors.values()) {
      A.root.traverse((o) => { if (o.isMesh && !o.userData.hull) for (const m of [].concat(o.material)) m.dispose(); });
      A.inst.dispose();
    }
    V.actors.clear();
    for (const x of V.disp) x.dispose?.();
    scene.clear();
  };
  return V;
}
