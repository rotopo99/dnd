// GLB models on Three.js (docs/specs/threejs-migration.md §6, stage 3 groundwork): GLTFLoader with a shared Promise
// cache by URL, instances through SkeletonUtils.clone (own skeleton per unit), AnimationMixer per instance with named
// clips (Blender contract, tools/blender/README.md: idle walk run crouch_walk talk sit idle_2h walk_2h run_2h aim_2h loop;
// attack_melee attack_shoot cast hit death shrug shoot_2h attack_2h one-shot), parts (hair / outfit GLBs on the same bone names) bound to the instance
// skeleton (their own spring chains re-parented onto the instance bones).
// Users: three/character.js (assembly shared by three/cinema.js and three/party.js).
//   loadGLB(url)                     -> Promise<gltf> (cached; a failed load is dropped from the cache)
//   instanceGLB(url)                 -> Promise<Inst> {root, mixer, clips, play(name, o), update(dt), attach(gltf), dispose()}
//   twinGeometry(meshes)             -> merged skinned geometry of an outline / x-ray twin (cached) | null
//   bodyGeometry(meshes, faces)      -> the same + uv, slot attribute, face draw group (merged toon body, cached) | null
//   atlasOf(maps)                    -> {tex, rects} base colour textures in one canvas atlas (cached) | null
//   clearModelCache()                dispose cached geometries / materials / textures / atlases (context loss, leaving 3D)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
let loader = null;
let glbFailed = false; // a .glb 404'd once: later models load their .gltf.json twin directly
// loops of the Blender contract (meta `loops`); everything else is a one-shot
const LOOP = new Set(['idle', 'walk', 'run', 'crouch_walk', 'talk', 'sit', 'idle_2h', 'walk_2h', 'run_2h', 'aim_2h']);

export function loadGLB(url) {
  let p = cache.get(url);
  if (!p) {
    loader ||= new GLTFLoader();
    // hosts that do not serve .glb get a JSON glTF twin (<name>.gltf.json, buffers embedded) — tools/glb2json.py;
    // after the first .glb failure the session goes straight to the twins (one 404 per session, QA v39 #1)
    const isGlb = /\.glb$/.test(url), twin = url.replace(/\.glb$/, '.gltf.json');
    p = (isGlb && glbFailed ? loader.loadAsync(twin)
      : loader.loadAsync(url).catch((e) => { if (!isGlb) throw e; glbFailed = true; return loader.loadAsync(twin); }))
      .catch((e) => { cache.delete(url); throw e; });
    cache.set(url, p);
  }
  return p;
}

/** Bones of a hierarchy by name. */
function bonesOf(root) {
  const m = new Map();
  root.traverse((o) => { if (o.isBone) m.set(o.name, o); });
  return m;
}

export async function instanceGLB(url) {
  const gltf = await loadGLB(url);
  const root = cloneSkinned(gltf.scene);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  let cur = null;
  const I = {
    root, mixer, clips, current: () => cur?.getClip().name || null,
    /** Cross-fade to a clip (o.fade s, default 0.2; o.restart replays a running one); one-shots clamp on the last frame. Unknown name: no-op. */
    play(name, o = {}) {
      const clip = clips.get(name);
      if (!clip || (!o.restart && cur && cur.getClip() === clip && cur.isRunning())) return cur;
      const a = mixer.clipAction(clip);
      const loop = o.loop ?? LOOP.has(name);
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.timeScale = o.speed || 1;
      a.enabled = true; a.setEffectiveWeight(1);
      if (cur && cur !== a) a.crossFadeFrom(cur, o.fade ?? 0.2, false);
      a.play();
      cur = a;
      return a;
    },
    update(dt) { mixer.update(dt); },
    /** Part GLB (hair / outfit): its skinned meshes rebound to this instance's bones by name. */
    attach(part) {
      const bones = bonesOf(root), src = cloneSkinned(part.scene), added = [];
      // bones only the part has (hair_* / skirt_* chains): moved under the instance bone of the same parent name, so
      // they follow the animated body (left in the detached clone they would stay at the bind pose)
      const extra = [];
      src.traverse((o) => { if (o.isBone && !bones.has(o.name) && o.parent?.isBone && bones.has(o.parent.name)) extra.push(o); });
      for (const b of extra) { bones.get(b.parent.name).add(b); b.traverse((c) => { if (c.isBone) bones.set(c.name, c); }); }
      src.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const list = o.skeleton.bones.map((b) => bones.get(b.name) || b);
        o.bind(new THREE.Skeleton(list, o.skeleton.boneInverses), o.bindMatrix);
        o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
        added.push(o);
      });
      for (const o of added) root.add(o);
      return added;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
      root.parent?.remove(root);
    },
  };
  return I;
}

// ---- merged skinned geometry (perf, docs/perf.md): ONE skinned mesh over a character's skinned sub-meshes.
// twinGeometry — outline hull / x-ray (one material): position, normal, skin (indices into the union bone list `bones` by
// name), morph targets by name (union `names`, missing — zero). bodyGeometry (pass 3) — the toon body: the same + uv and a
// per-vertex `slot` (sub-mesh index -> material slot of three/character.js bodyMaterial); the last `faces` meshes go to
// draw group 1 (face atlas material), the rest to group 0; a twin over it uses the whole range.
const twinCache = new Map();
const TWIN_MAX = 48;
const f32 = (a, n, k) => { const o = new Float32Array(n * k); if (a) for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) o[i * k + j] = a.getComponent(i, j); return new THREE.BufferAttribute(o, k); };

function mergeSkinned(meshes, body, faces) {
  const key = `${body ? `b${faces}` : 't'}|${meshes.map((m) => `${m.geometry.uuid}:${m.skeleton.bones.map((b) => b.name).join(',')}`).join('|')}`;
  let T = twinCache.get(key);
  if (T !== undefined) { twinCache.delete(key); twinCache.set(key, T); return T; }
  const bones = [], inv = [], at = new Map(), names = [];
  T = null;
  ok: {
    for (const m of meshes) {
      const sk = m.skeleton;
      for (let i = 0; i < sk.bones.length; i++) {
        const n = sk.bones[i].name, j = at.get(n);
        if (j === undefined) { at.set(n, bones.length); bones.push(n); inv.push(sk.boneInverses[i]); }
        else if (!inv[j].equals(sk.boneInverses[i]) && inv[j].elements.some((v, e) => Math.abs(v - sk.boneInverses[i].elements[e]) > 1e-4)) break ok;
      }
      if (m.geometry.morphAttributes.position && !m.geometry.morphTargetsRelative) break ok;
      for (const n of Object.keys(m.morphTargetDictionary || {})) if (!names.includes(n)) names.push(n);
    }
    const mn = meshes.some((m) => m.geometry.morphAttributes.normal);
    let idx = 0, faceStart = 0;
    const parts = meshes.map((m, k) => {
      const s = m.geometry, A = s.attributes, n = A.position.count, g = new THREE.BufferGeometry();
      g.setAttribute('position', f32(A.position, n, 3));
      g.setAttribute('normal', f32(A.normal, n, 3));
      const si = new Uint16Array(n * 4), map = m.skeleton.bones.map((b) => at.get(b.name));
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) si[i * 4 + j] = map[A.skinIndex.getComponent(i, j)] ?? 0;
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', f32(A.skinWeight, n, 4));
      if (body) {
        g.setAttribute('uv', f32(A.uv, n, 2));
        g.setAttribute('slot', new THREE.BufferAttribute(new Uint8Array(n).fill(k), 1));
      }
      if (s.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(s.index.array), 1));
      else g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: n }, (_, i) => i), 1));
      if (k === meshes.length - faces) faceStart = idx;
      idx += g.index.count;
      if (names.length) {
        const d = m.morphTargetDictionary || {}, M = s.morphAttributes;
        g.morphTargetsRelative = true;
        g.morphAttributes.position = names.map((q) => { const a = f32(d[q] != null ? M.position?.[d[q]] : null, n, 3); a.name = q; return a; });
        if (mn) g.morphAttributes.normal = names.map((q) => { const a = f32(d[q] != null ? M.normal?.[d[q]] : null, n, 3); a.name = q; return a; });
      }
      return g;
    });
    const geo = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    // mergeGeometries drops the attribute names: restore them (Mesh.updateMorphTargets builds the dictionary by name)
    if (geo) for (const k in geo.morphAttributes) geo.morphAttributes[k].forEach((at, i) => { at.name = names[i]; });
    if (geo && body && faces) { geo.addGroup(0, faceStart, 0); geo.addGroup(faceStart, idx - faceStart, 1); }
    if (geo) T = { geo, bones, inv, names };
  }
  twinCache.set(key, T);
  if (twinCache.size > TWIN_MAX) { const [k0, t0] = twinCache.entries().next().value; twinCache.delete(k0); t0?.geo.dispose(); }
  return T;
}

/**
 * Twin geometry of skinned meshes sharing the parent / transform / bind matrix -> {geo, bones: [name], inv: [Matrix4], names} | null
 * (cached by the source geometries + skeletons; null when the bind poses disagree — the caller keeps per-mesh twins).
 */
export const twinGeometry = (meshes) => mergeSkinned(meshes, false, 0);
/** Body geometry (+ uv, slot = index in `meshes`; the last `faces` meshes — draw group 1) -> as twinGeometry | null. */
export const bodyGeometry = (meshes, faces = 0) => mergeSkinned(meshes, true, faces);

// ---- texture atlas of a merged body (pass 3): the sub-mesh base colour textures in one canvas texture. Every texture keeps
// its resolution and gets a wrap-around gutter (1/16 of its size, the source textures repeat) against mip bleeding; cells on
// a grid of the smallest cell, first fit. rects[i] [u0, v0, su, sv] (glTF uv, flipY false) of maps[i]; null without a map.
const atlasCache = new Map();
const ATLAS_MAX = 48, ATLAS_W = 1024, ATLAS_LIM = 4096;
const gutter = (s) => Math.max(4, s >> 4);

/** Atlas of base colour textures -> {tex: CanvasTexture | null, rects: [Vector4 | null]} | null (no image / too big). */
export function atlasOf(maps) {
  const key = maps.map((t) => t?.uuid || '-').join(',');
  let A = atlasCache.get(key);
  if (A !== undefined) { atlasCache.delete(key); atlasCache.set(key, A); return A; }
  A = null;
  ok: {
    const uniq = [...new Set(maps.filter(Boolean))];
    if (!uniq.length) { A = { tex: null, rects: maps.map(() => null) }; break ok; }
    const dim = uniq.map((t) => { const im = t.image; return { t, w: im?.width || 0, h: im?.height || 0 }; });
    if (dim.some((d) => !d.w || !d.h)) break ok;
    const U = Math.min(...dim.map((d) => Math.min(d.w + 2 * gutter(d.w), d.h + 2 * gutter(d.h))));
    for (const d of dim) { d.gx = gutter(d.w); d.gy = gutter(d.h); d.kw = Math.ceil((d.w + 2 * d.gx) / U); d.kh = Math.ceil((d.h + 2 * d.gy) / U); }
    const GW = Math.max(Math.floor(ATLAS_W / U), ...dim.map((d) => d.kw));
    const grid = []; // rows of booleans
    const free = (r, c, d) => { for (let y = r; y < r + d.kh; y++) for (let x = c; x < c + d.kw; x++) if (grid[y]?.[x]) return false; return true; };
    for (const d of [...dim].sort((a, b) => b.kw * b.kh - a.kw * a.kh)) {
      place: for (let r = 0; ; r++) for (let c = 0; c + d.kw <= GW; c++) {
        if (!free(r, c, d)) continue;
        for (let y = r; y < r + d.kh; y++) { grid[y] ||= []; for (let x = c; x < c + d.kw; x++) grid[y][x] = true; }
        d.x = c * U; d.y = r * U;
        break place;
      }
    }
    const CW = GW * U, CH = grid.length * U;
    if (CW > ATLAS_LIM || CH > ATLAS_LIM) break ok;
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d');
    const at = new Map();
    for (const d of dim) {
      g.save();
      g.beginPath(); g.rect(d.x, d.y, d.w + 2 * d.gx, d.h + 2 * d.gy); g.clip();
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) g.drawImage(d.t.image, d.x + d.gx + i * d.w, d.y + d.gy + j * d.h, d.w, d.h);
      g.restore();
      at.set(d.t, new THREE.Vector4((d.x + d.gx) / CW, (d.y + d.gy) / CH, d.w / CW, d.h / CH));
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = uniq[0].anisotropy;
    A = { tex, rects: maps.map((t) => (t ? at.get(t) : null)) };
  }
  atlasCache.set(key, A);
  if (atlasCache.size > ATLAS_MAX) { const [k0, a0] = atlasCache.entries().next().value; atlasCache.delete(k0); a0?.tex?.dispose(); }
  return A;
}

export function clearModelCache() {
  for (const t of twinCache.values()) t?.geo.dispose();
  twinCache.clear();
  for (const a of atlasCache.values()) a?.tex?.dispose();
  atlasCache.clear();
  for (const p of cache.values()) p.then((g) => g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
  })).catch(() => {});
  cache.clear();
}
