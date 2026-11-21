// Weapons in the hand of GLB heroes (three/party.js): a stylized procedural mesh by weapon category (data/hero-models.js
// HERO_MODELS.weapon: gfx/gear3d.js weaponKind -> blade / blunt / staff / pistol / rifle; none — empty hand) parented to
// the right-hand bone, or stowed at the hip when the editor hides the weapon (u.hide.weapon). Toon materials per
// character (alpha / hit flash go through C.mats), inverted-hull outline sharing the body hull's grow uniform.
// Geometries are cached per category (a handful, kept for the session); materials are disposed with the character.
//   weaponKey(u)                     -> 'cat|glow|hidden' | null (what the unit should carry)
//   attachWeapon(C, key, hull)       -> W {group, mats, hullMat} | null (hull: party hull material, colour + grow source)
//   detachWeapon(C, W)               remove and dispose (C.mats / C.extra entries dropped)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HERO_MODELS as HM } from '../data/hero-models.js';
import { weaponKind } from '../gfx/gear3d.js';
import { isMeleeWeapon } from '../rules/combat.js';
import { toonRamp } from './character.js';

const W = HM.weapon;
const kinds = new WeakMap(); // u.weapon -> kind (weaponKind runs regexps on the name)

export function weaponKey(u) {
  if (!u.weapon || u.noAttack) return null;
  let k = kinds.get(u.weapon);
  if (k === undefined) { k = weaponKind(u, isMeleeWeapon(u)) || null; kinds.set(u.weapon, k); }
  const cat = k && W.cat[k];
  return cat ? `${cat}|${W.glow.includes(k) ? 1 : 0}|${u.hide?.weapon ? 1 : 0}` : null;
}

// ---------------------------------------------------------------- geometry (weapon frame: grip at 0, +y blade / shaft, +z barrel)
const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
const cylY = (r, y0, y1, seg = 8, r1 = r) => new THREE.CylinderGeometry(r1, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0);
const cylZ = (r, z0, z1, y = 0, seg = 8) => new THREE.CylinderGeometry(r, r, z1 - z0, seg).rotateX(Math.PI / 2).translate(0, y, (z0 + z1) / 2);
const BUILD = {
  blade: (glow) => ({
    grip: [cylY(0.019, -0.08, 0.07), new THREE.SphereGeometry(0.026, 8, 6).translate(0, -0.09, 0)],
    dark: [box(0.04, 0.03, 0.16, 0, 0.085, 0)],
    [glow ? 'glow' : 'metal']: [box(0.014, 0.6, 0.06, 0, 0.4, 0), new THREE.ConeGeometry(0.042, 0.12, 4).rotateY(Math.PI / 4).scale(0.33, 1, 1).translate(0, 0.76, 0)],
  }),
  blunt: () => ({
    wood: [cylY(0.021, -0.1, 0.42)],
    dark: [box(0.12, 0.15, 0.22, 0, 0.44, 0)],
    metal: [box(0.13, 0.03, 0.23, 0, 0.36, 0), box(0.13, 0.03, 0.23, 0, 0.52, 0)],
  }),
  staff: (glow) => ({
    wood: [cylY(0.022, -0.6, 0.86, 7, 0.018)],
    metal: [cylY(0.03, 0.82, 0.88, 7)],
    [glow ? 'glow' : 'dark']: [new THREE.OctahedronGeometry(0.065).scale(1, 1.4, 1).translate(0, 0.97, 0)],
  }),
  pistol: () => ({
    grip: [box(0.032, 0.11, 0.045, 0, 0, -0.005, -0.2)],
    dark: [box(0.038, 0.05, 0.21, 0, 0.075, 0.06)],
    metal: [cylZ(0.012, 0.16, 0.21, 0.08)],
  }),
  rifle: (glow) => ({
    grip: [box(0.032, 0.1, 0.045, 0, 0, -0.005, -0.25)],
    dark: [box(0.05, 0.085, 0.5, 0, 0.075, 0.12), box(0.032, 0.13, 0.05, 0, 0.0, 0.2, 0.15)],
    wood: [box(0.042, 0.1, 0.26, 0, 0.045, -0.24, 0.12)],
    metal: [cylZ(0.015, 0.36, 0.66, 0.09)],
    ...(glow ? { glow: [box(0.054, 0.024, 0.32, 0, 0.1, 0.14)] } : {}),
  }),
};
const geoCache = new Map(); // `${cat}|${glow}` -> [[part, geometry]]
function geometries(cat, glow) {
  const k = `${cat}|${glow}`;
  let g = geoCache.get(k);
  if (!g) {
    g = Object.entries(BUILD[cat](glow)).map(([part, list]) => {
      const m = mergeGeometries(list.map((x) => x.toNonIndexed()));
      for (const x of list) x.dispose();
      return [part, m];
    });
    geoCache.set(k, g);
  }
  return g;
}

function hullFor(hull) {
  const m = new THREE.MeshBasicMaterial({ color: hull.color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrow = hull.userData.grow; // same grow as the body hull (px -> model units, set by party.js)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * uGrow;');
  };
  m.customProgramCacheKey = () => 'weaponHull';
  return m;
}

export function attachWeapon(C, key, hull) {
  if (!key) return null;
  const [cat, glow, hidden] = key.split('|');
  const bone = C.bones.get(hidden === '1' ? W.holster.bone : W.bone);
  if (!bone || !BUILD[cat]) return null;
  const group = new THREE.Group(), mats = [], hullMat = hull ? hullFor(hull) : null;
  for (const [part, geo] of geometries(cat, glow === '1')) {
    const glowing = part === 'glow';
    const m = new THREE.MeshToonMaterial({ color: W.color[part], gradientMap: toonRamp(), emissive: new THREE.Color(glowing ? W.color.glow : 0) });
    m.userData.emissive0 = m.emissive.clone();
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true; mesh.receiveShadow = !glowing; mesh.renderOrder = 2;
    group.add(mesh);
    if (hullMat) { const h = new THREE.Mesh(geo, hullMat); h.userData.hull = true; h.renderOrder = 2; group.add(h); C.extra.push(h); }
  }
  // hand frame: weapon +y -> thumb side (-x of the hand bone), +z (barrel) -> wrist -> knuckles (+y)
  if (hidden === '1') { group.position.fromArray(W.holster.pos); group.rotation.fromArray(W.holster.rot); }
  else {
    group.position.fromArray(W.grip);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
  }
  // bones may carry the armature scale: undo it so the weapon keeps metres x W.scale
  bone.updateWorldMatrix(true, false);
  const ws = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld), rs = new THREE.Vector3().setFromMatrixScale(C.root.matrixWorld);
  group.scale.setScalar((W.scale * rs.x) / (ws.x || 1));
  group.name = 'weapon';
  bone.add(group);
  C.mats.push(...mats);
  return { group, mats, hullMat };
}

export function detachWeapon(C, Wp) {
  if (!Wp) return;
  Wp.group.parent?.remove(Wp.group);
  C.mats = C.mats.filter((m) => !Wp.mats.includes(m));
  C.extra = C.extra.filter((h) => !Wp.group.children.includes(h));
  for (const m of Wp.mats) m.dispose();
  Wp.hullMat?.dispose();
}
