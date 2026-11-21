// GLB models on Three.js (docs/specs/threejs-migration.md §6, stage 3 groundwork): GLTFLoader with a shared Promise
// cache by URL, instances through SkeletonUtils.clone (own skeleton per unit), AnimationMixer per instance with named
// clips (Blender contract, tools/blender/README.md: idle walk run crouch_walk loop; attack_melee attack_shoot cast hit
// death one-shot), parts (hair / outfit GLBs on the same bone names) bound to the instance skeleton.
// Nothing loads unless asked: units stay on the procedural templates (three/units.js) until a model key exists.
//   loadGLB(url)                     -> Promise<gltf> (cached; a failed load is dropped from the cache)
//   instanceGLB(url)                 -> Promise<Inst> {root, mixer, clips, play(name, o), update(dt), attach(gltf), dispose()}
//   clearModelCache()                dispose cached geometries / materials / textures (context loss, leaving 3D)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const cache = new Map();
let loader = null;
const LOOP = new Set(['idle', 'walk', 'run', 'crouch_walk']);

export function loadGLB(url) {
  let p = cache.get(url);
  if (!p) {
    loader ||= new GLTFLoader();
    p = loader.loadAsync(url).catch((e) => { cache.delete(url); throw e; });
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
    /** Cross-fade to a clip (o.fade s, default 0.2); one-shots clamp on the last frame. Unknown name: no-op. */
    play(name, o = {}) {
      const clip = clips.get(name);
      if (!clip || (cur && cur.getClip() === clip && cur.isRunning())) return cur;
      const a = mixer.clipAction(clip);
      const loop = o.loop ?? LOOP.has(name);
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.timeScale = o.speed || 1;
      if (cur && cur !== a) a.crossFadeFrom(cur, o.fade ?? 0.2, false);
      a.play();
      cur = a;
      return a;
    },
    update(dt) { mixer.update(dt); },
    /** Part GLB (hair / outfit): its skinned meshes rebound to this instance's bones by name. */
    attach(part) {
      const bones = bonesOf(root), src = cloneSkinned(part.scene), added = [];
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

export function clearModelCache() {
  for (const p of cache.values()) p.then((g) => g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
  })).catch(() => {});
  cache.clear();
}
