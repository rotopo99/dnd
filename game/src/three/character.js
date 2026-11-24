// GLB character assembly shared by cinematics (three/cinema.js) and battle / free-roam heroes (three/party.js):
// base GLB (preset hero_* or body_*) + part GLBs (hair / outfit) on one skeleton, plain Blender PBR -> toon materials
// (3 bands) with optional inverted hull / x-ray on the same skeleton and morphs, appearance tints (skin colour, hair /
// cloth through texture luminance), body shape keys, faces (atlas swap face_<sex>_<tex>.png + expression keys, blink),
// spring bones from the .json meta (VRM-like verlet chains, weight by the «Физика тела» setting).
//   heroSpec(u)                      -> F {base, parts, sex, hair:null, tint {skin, hair, cloth}, shape, key} of an editor look
//   npcSpec(nid, tint)               -> F of an assembled NPC model npc_<nid> (data/hero-models.js HERO_MODELS.npc)
//   enemySpec(model, tint)           -> F of an enemy model enemy_<model> (HERO_MODELS.enemy; F.kind humanoid / quadruped / drone)
//   assembleCharacter(F)             -> Promise<C> {inst, root, sex, bones, rest, springs, headY, height, faces, morph, mats, meta}
//   toonify(C, o)                    toon materials; o {look (CINE_LOOKS entry), tint, outline: true | (mesh) => material, xray: (mesh) => material}
//   setBodyShape(C, shape)           shape keys {bust, hips, shoulders, build, height}
//   setFace(C, tex, keys, blink)     face atlas + expression shape keys (keys {happy: 0.8, ...})
//   stepSprings(C, dt, k)            spring chains after the mixer (k 0 — rest pose)
//   disposeCharacter(C)              per-instance materials + mixer (geometry / textures stay in the GLB cache)
import * as THREE from 'three';
import { instanceGLB, loadGLB } from './models.js';
import { HERO_MODELS as HM } from '../data/hero-models.js';
import { heroLook3d } from '../ui/hero-avatar.js';
import { outfitOf, skinRamp, hairRamp } from '../ui/look-data.js';
import { keyRGB } from '../gfx/mesh.js';

export const MODEL_DIR = new URL('../../assets/models/', import.meta.url).href;
export const HAIRS = ['bob', 'long', 'ponytail', 'short', 'spiky', 'twin'];
export const MORPHS = ['blink', 'happy', 'angry', 'sad', 'surprised'];

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
/** Shared face atlas texture (never disposed per instance). */
export function faceTex(sex, id) {
  const url = `${MODEL_DIR}face_${sex}_${id}.png`;
  let t = texCache.get(url);
  if (!t) {
    t = texLoader.load(url);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return t;
}

let ramp = null;
export function toonRamp() {
  if (ramp) return ramp;
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

let outline = null;
/** Shared dark inverted hull of the cinematics (fixed 3.5 mm). */
export function outlineMat() {
  if (outline) return outline;
  outline = new THREE.MeshBasicMaterial({ color: 0x14141c, side: THREE.BackSide });
  outline.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * 0.0035;');
  };
  return outline;
}

const metaCache = new Map();
/** <name>.json meta of tools/blender (springBones, height_m, animations); null when missing. */
export function modelMeta(name) {
  let p = metaCache.get(name);
  if (!p) { p = fetch(`${MODEL_DIR}${name}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null); metaCache.set(name, p); }
  return p;
}

const srgb = (k) => { const c = keyRGB(k); return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); };

/** GLB files + tints of a hero / companion from the appearance editor look (ui/hero-avatar.js heroLook3d). */
export function heroSpec(u) {
  const L = heroLook3d(u), look = L.look, hide = u?.hide || {};
  const sex = look.gender === 'f' ? 'f' : look.gender === 'm' ? 'm' : HM.xSex;
  const hs = look.hair in HM.hair ? HM.hair[look.hair] : HM.hairDefault;
  const of = outfitOf(look);
  const armor = hide.armor && !of ? 'cloth' : of?.armor || u?.armorType || 'light';
  const outfit = (of && HM.outfit[of.id]) || HM.armor[armor] || 'field';
  const parts = [`outfit_${outfit}_${sex}`];
  if (hs) parts.push(`hair_${hs}_${sex}`);
  const sk = skinRamp(look)[1], hk = hairRamp(look)[1], ck = look.cloth || null;
  const shape = { build: HM.build[look.build] ?? 0 };
  for (const [k, [f, m]] of Object.entries(HM.shape)) shape[k] = (+look[f] || 0) * m;
  const key = `${sex}|${parts.join(',')}|${sk}${hk}${ck || '-'}|${Object.values(shape).map((v) => v.toFixed(2)).join(',')}`;
  return { base: `body_${sex}`, parts, sex, hair: null, tint: { skin: sk, hair: hs ? hk : null, cloth: ck }, shape, key };
}

/** Assembled key-character / crowd model npc_<nid> (hair and outfit are in the GLB); tint {skin, hair, cloth} keys or null. */
export function npcSpec(nid, tint = null) {
  const sex = HM.npc.sex[nid] || 'm';
  return { base: `npc_${nid}`, parts: [], sex, hair: null, tint: tint || {}, shape: {}, npc: nid, key: `npc|${nid}|${tint ? Object.values(tint).join('') : '-'}` };
}

/** Enemy model enemy_<model> (Blender pass 6): humanoids on the hero rig, mechs (wolf / drone) on own armatures. */
export function enemySpec(model, tint = null) {
  const M = HM.enemy.models[model] || {};
  return { base: `enemy_${model}`, parts: [], sex: 'm', hair: null, tint: tint || {}, shape: {}, enemy: model, kind: M.kind || 'humanoid', key: `enemy|${model}|${tint ? Object.values(tint).map((v) => v || '-').join('') : '-'}` };
}

/** Base + parts on one skeleton, idle pose applied (C.headY: head top over the feet, m). */
export async function assembleCharacter(F) {
  const inst = await instanceGLB(`${MODEL_DIR}${F.base}.glb`);
  const C = { inst, root: inst.root, sex: F.sex, tint: F.tint || null, bones: new Map(), rest: new Map(), springs: [], faces: [], morph: [], mats: [], extra: [], headY: 1.62, height: HM.height[F.sex] || 1.75 };
  const parts = [...(F.parts || [])];
  if (F.hair) {
    C.root.traverse((o) => { if (o.isMesh && /^Hair/i.test(o.name)) o.visible = false; });
    parts.push(`hair_${F.hair}_${F.sex}`);
  }
  const got = [F.base];
  for (const p of parts) {
    try { inst.attach(await loadGLB(`${MODEL_DIR}${p}.glb`)); got.push(p); } catch (e) { console.warn('character part', p, e?.message || e); }
  }
  const hidden = [];
  C.root.traverse((o) => { if (o.isMesh && !o.visible) hidden.push(o); });
  for (const o of hidden) o.parent?.remove(o);
  if (F.scale) C.root.scale.setScalar(F.scale);
  C.root.traverse((o) => { if (o.isBone && !C.bones.has(o.name)) { C.bones.set(o.name, o); C.rest.set(o.name, o.quaternion.clone()); } });
  // spring chains (rest = bind pose: the clips do not animate hair_* / skirt_* bones)
  const metas = await Promise.all(got.map(modelMeta));
  if (metas[0]?.height_m) C.height = metas[0].height_m;
  C.meta = metas[0] || null; // grip2h (two-handed weapon frame in rightHand), loops, npc
  const seen = new Set();
  for (const m of metas) for (const sb of m?.springBones || []) {
    const joints = [];
    for (const n of sb.bones || []) {
      const b = C.bones.get(n);
      if (!b || !b.parent || seen.has(n)) continue;
      seen.add(n);
      const child = b.children.find((c) => c.isBone);
      const tail = child ? child.position.clone() : b.position.clone(); // last bone: continue the chain direction
      const len = tail.length();
      if (len < 1e-5) continue;
      joints.push({ b, rest: b.quaternion.clone(), axis: tail.normalize(), len, cur: new THREE.Vector3(), prev: new THREE.Vector3(), init: false });
    }
    if (joints.length) C.springs.push({ joints, stiff: sb.stiffness ?? 1, drag: sb.dragForce ?? 0.4, grav: sb.gravityPower ?? 0, gdir: new THREE.Vector3(...(sb.gravityDir || [0, -1, 0])).normalize() });
  }
  inst.play('idle');
  inst.update(0);
  C.root.updateMatrixWorld(true);
  const hb = C.bones.get('head');
  if (hb) C.headY = hb.getWorldPosition(new THREE.Vector3()).y + 0.08; // world (with F.scale)
  return C;
}

/** Texture -> luminance x material colour x gain (hair / cloth tints keep the painted shading). */
function lumTint(m, gain) {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor.rgb *= vec3( dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * ${gain.toFixed(2)} );
#endif`);
  };
  m.customProgramCacheKey = () => `lumTint${gain}`;
}

/**
 * Plain PBR from Blender -> toon per instance (the Face material is kept for the atlas swap). o: {look} — CINE_LOOKS
 * entry (opacity / tint / emissive), {tint} — {skin, hair, cloth, coat?, pants?} palette keys or C.tint, {skinHex} — cinematics tint,
 * outline: true — shared dark hull, or (mesh) => material per unit; xray: (mesh) => material (GreaterDepth silhouette).
 */
export function toonify(C, o = {}) {
  const L = o.look || null, T = o.tint || C.tint || {};
  const tSkin = T.skin ? srgb(T.skin) : null, tHair = T.hair ? srgb(T.hair) : null, tCloth = T.cloth ? srgb(T.cloth) : null;
  const tCoat = T.coat ? srgb(T.coat) : null, tPants = T.pants ? srgb(T.pants) : null; // crowd NPCs: apron / vest / hat, pants (HM.tint)
  const tMul = T.mul && o.mulRe ? new THREE.Color(1, 1, 1).lerp(srgb(T.mul), o.mulK ?? 0.5) : null; // enemy mechs: plate colour
  const meshes = [];
  C.root.traverse((m) => { if (m.isMesh) meshes.push(m); });
  for (const mesh of meshes) {
    const conv = (m) => {
      const t = new THREE.MeshToonMaterial({ name: m.name, color: m.color?.clone() || new THREE.Color(1, 1, 1), map: m.map || null, gradientMap: toonRamp(),
        side: THREE.DoubleSide, transparent: !!L?.opacity, opacity: L?.opacity ?? 1, emissive: new THREE.Color(L?.emissive ?? (/glow/i.test(m.name) ? 0x4fa0f0 : 0)) });
      if (o.glow?.test(m.name) && m.emissive) t.emissive.copy(m.emissive).multiplyScalar(o.glowK ?? 1); // enemies: GLB emissive (eyes, tokens)
      if (tMul && o.mulRe.test(m.name)) t.color.multiply(tMul);
      if (L?.tint) t.color.lerp(new THREE.Color(L.tint), L.tintK ?? 0.6);
      if (m.name === 'Skin') { if (o.skinHex != null) t.color.set(o.skinHex); else if (tSkin) t.color.copy(tSkin); }
      else if (t.map && tHair && HM.tint.hair.test(m.name)) { t.color.copy(tHair); lumTint(t, HM.tint.hairGain); }
      else if (t.map && tCloth && HM.tint.cloth.test(m.name)) { t.color.copy(tCloth); lumTint(t, HM.tint.clothGain); }
      else if (t.map && tCoat && HM.tint.coat.test(m.name)) { t.color.copy(tCoat); lumTint(t, HM.tint.coatGain); }
      else if (t.map && tPants && HM.tint.pants.test(m.name)) { t.color.copy(tPants); lumTint(t, HM.tint.pantsGain); }
      t.userData.emissive0 = t.emissive.clone();
      if (m.name === 'Face') C.faces.push(t);
      C.mats.push(t);
      return t;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
    mesh.castShadow = !L?.opacity; mesh.receiveShadow = true;
    if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) C.morph.push(mesh);
    if (!mesh.isSkinnedMesh || L?.opacity) continue;
    const twin = (mat, tag) => { // same geometry, skeleton and morph weights
      const h = new THREE.SkinnedMesh(mesh.geometry, mat);
      h.bind(mesh.skeleton, mesh.bindMatrix);
      if (mesh.morphTargetInfluences) { h.morphTargetInfluences = mesh.morphTargetInfluences; h.morphTargetDictionary = mesh.morphTargetDictionary; }
      h.frustumCulled = false; h.castShadow = false; h.receiveShadow = false; h.userData[tag] = true; h.userData.noAO = true;
      mesh.parent.add(h);
      h.position.copy(mesh.position); h.quaternion.copy(mesh.quaternion); h.scale.copy(mesh.scale);
      C.extra.push(h);
      return h;
    };
    if (o.outline) twin(o.outline === true ? outlineMat() : o.outline(mesh), 'hull');
    if (o.xray) twin(o.xray(mesh), 'xray');
  }
  // o.faceSkin [r, g, b] (linear Skin colour the face atlas is painted for): the face follows the Skin tint (mutant green)
  const sk = o.faceSkin && C.mats.find((m) => m.name === 'Skin'), fr = o.faceSkin;
  if (sk) for (const f of C.faces) f.color.setRGB(Math.min(1, sk.color.r / fr[0]), Math.min(1, sk.color.g / fr[1]), Math.min(1, sk.color.b / fr[2]));
}

/** Body sliders -> shape keys of the body and the outfits (same names). */
export function setBodyShape(C, shape) {
  for (const m of C.morph) for (const [k, v] of Object.entries(shape || {})) { const i = m.morphTargetDictionary[k]; if (i != null) m.morphTargetInfluences[i] = v; }
}

/** Face atlas (tex id of face_<sex>_<tex>.png) + expression keys + blink (0..1). */
export function setFace(C, tex, keys, blink) {
  if (C.face !== tex) { C.face = tex; const t = faceTex(C.sex, tex); for (const m of C.faces) { m.map = t; m.needsUpdate = true; } }
  for (const m of C.morph) for (const k of MORPHS) {
    const i = m.morphTargetDictionary[k];
    if (i != null) m.morphTargetInfluences[i] = k === 'blink' ? blink : keys?.[k] || 0;
  }
}

const _h = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _q = new THREE.Quaternion(), _lq = new THREE.Quaternion();
/** Spring chains (VRM 1.0 style: inertia, stiffness to the rest direction, gravity, fixed length); after the mixer and
 *  root.updateMatrixWorld. k — weight (0 — rest pose, simulation reset). */
export function stepSprings(C, dt, k) {
  if (!C.springs.length) return;
  dt = Math.min(dt, 1 / 30);
  for (const ch of C.springs) for (const j of ch.joints) {
    const b = j.b;
    b.quaternion.copy(j.rest);
    if (k <= 0) { j.init = false; b.updateMatrixWorld(true); continue; }
    b.updateMatrixWorld(true);
    b.parent.getWorldQuaternion(_pq);
    _wq.copy(_pq).multiply(j.rest);
    _h.setFromMatrixPosition(b.matrixWorld);
    _d.copy(j.axis).applyQuaternion(_wq);
    const len = j.len * _s.setFromMatrixScale(b.matrixWorld).x;
    if (!j.init || j.cur.distanceTo(_h) > len * 4) { j.cur.copy(_h).addScaledVector(_d, len); j.prev.copy(j.cur); j.init = true; }
    if (dt <= 0) continue;
    _n.copy(j.cur).sub(j.prev).multiplyScalar(1 - ch.drag).add(j.cur)
      .addScaledVector(_d, ch.stiff * dt).addScaledVector(ch.gdir, ch.grav * dt).sub(_h);
    if (_n.lengthSq() < 1e-12) _n.copy(_d);
    _n.normalize();
    j.prev.copy(j.cur);
    j.cur.copy(_h).addScaledVector(_n, len);
    _q.setFromUnitVectors(_d, _n);
    _lq.copy(_pq).invert().multiply(_q.multiply(_wq));
    b.quaternion.copy(j.rest).slerp(_lq, k);
    b.updateMatrixWorld(true);
  }
}

export function disposeCharacter(C) {
  for (const m of C.mats) m.dispose();
  for (const h of C.extra) { h.parent?.remove(h); if (h.material !== outline) h.material.dispose(); }
  C.inst.dispose();
}
