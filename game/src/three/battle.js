// Battle field on Three.js (docs/specs/threejs-migration.md, stage 1). Reads the battle state only (co-op determinism):
// the world description, overlay batch, particles and unit poses come from the backend-independent gfx/scene3d.js
// prepFrame; this module turns them into a Three scene: static chunks (MeshStandardMaterial, vertex colours + baked
// AO + world-space value noise, glow vertices -> emissive, cut-away of walls in front of the focus), map border walls
// (low on the near sides), horizon backdrop, barrels (InstancedMesh per kind), units (heroes: GLB characters of three/party.js; others SkinnedMesh per unit on the old templates: toon material,
// inverted-hull outline in the team colour, x-ray silhouette behind walls, hit flash -> emissive), floor decals
// (highlights, path, zones, surfaces, rings, contact blobs: one dynamic translucent mesh), particles (instanced shader),
// key light with soft shadows + fill + hemisphere, night point lights, linear fog; post chain of three/engine.js.
// Picking: Raycaster against unit proxies (capsules) and an invisible pick surface (cell tops + sides of tall cells).
//   drawBattleThree(E, game, S, opts)   one frame (same opts as gfx/scene3d.js drawBattle3d)
//   dropBattleThree(E, V)               free the scene of a 3D state
//   V.T.pick(S, px, py)                 -> {x, y, fx, fz, unit?} | null (gfx/scene3d.js pickBattle delegates here)
import * as THREE from 'three';
import { GFX } from '../data/gfx.js';
import { WEATHER } from '../data/combat.js';
import { keyRGB } from '../gfx/mesh.js';
import { ortho, basis } from '../gfx/camera.js';
import { prepFrame, frameBatches, poseInst, buildChunk, buildEdges, nearMask, topAt, chunkSig, inView } from '../gfx/scene3d.js';
import { buildBackdrop } from '../gfx/env3d.js';
import { propModel } from '../gfx/models.js';
import { particleMesh } from '../gfx/fx3d.js';
import { unitTemplate } from '../gfx/units3d.js';
import { NBONES } from '../gfx/gl.js';
import { visionOf, lightSources } from '../world/battlefields.js';
import { gfxPrefs } from '../gfx/settings.js';
import { unitUniforms, syncUnitUniforms, unitMaterial, hullMaterial } from './units.js';
import { syncParty, sweepParty, dropParty } from './party.js';

const G = GFX.geo;
const DIST = 100; // camera distance behind the view target (orthographic: only depth precision depends on it)
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linRGB = (c) => [lin(c[0]), lin(c[1]), lin(c[2])];
const colorOf = (k) => { const c = linRGB(keyRGB(k)); return new THREE.Color(c[0], c[1], c[2]); };

// ---------------------------------------------------------------- geometry from the old mesh builders
/** MeshBuilder (gfx/mesh.js, 17 floats per vertex) -> BufferGeometry: position, normal, colour (base tone, linear, AO
 *  baked), glow; skinned templates also skinIndex / skinWeight (2 bones). null when empty. */
export function geoFromMB(mb, skin = false) {
  if (!mb || !mb.n) return null;
  const n = mb.n, v = mb.v, A = GFX.three.world.ao;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const o = k * 17, ao = 1 - v[o + 15] * A;
    pos[k * 3] = v[o]; pos[k * 3 + 1] = v[o + 1]; pos[k * 3 + 2] = v[o + 2];
    nrm[k * 3] = v[o + 3]; nrm[k * 3 + 1] = v[o + 4]; nrm[k * 3 + 2] = v[o + 5];
    col[k * 3] = lin(v[o + 9]) * ao; col[k * 3 + 1] = lin(v[o + 10]) * ao; col[k * 3 + 2] = lin(v[o + 11]) * ao;
    glow[k] = v[o + 16];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(mb.i, 1) : new THREE.Uint16BufferAttribute(mb.i, 1));
  if (skin && mb.b) {
    // toon port (three/units.js): ramps in sRGB (base ramp -> colour without AO), ao + glow, uv + material kind
    const rs = new Float32Array(n * 3), rl = new Float32Array(n * 3), ax = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const o = k * 17;
      rs[k * 3] = v[o + 6]; rs[k * 3 + 1] = v[o + 7]; rs[k * 3 + 2] = v[o + 8];
      col[k * 3] = v[o + 9]; col[k * 3 + 1] = v[o + 10]; col[k * 3 + 2] = v[o + 11];
      rl[k * 3] = v[o + 12]; rl[k * 3 + 1] = v[o + 13]; rl[k * 3 + 2] = v[o + 14];
      ax[k * 2] = v[o + 15]; ax[k * 2 + 1] = v[o + 16];
    }
    g.setAttribute('rampS', new THREE.BufferAttribute(rs, 3));
    g.setAttribute('rampL', new THREE.BufferAttribute(rl, 3));
    g.setAttribute('aox', new THREE.BufferAttribute(ax, 2));
    g.setAttribute('uvk', new THREE.BufferAttribute(new Float32Array(mb.x || n * 3), 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const w = mb.b[k * 3 + 2];
      si[k * 4] = mb.b[k * 3]; si[k * 4 + 1] = mb.b[k * 3 + 1];
      sw[k * 4] = 1 - w; sw[k * 4 + 1] = w;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- materials
const NOISE_GLSL = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + 1.0), f.x), f.y); }
float wnoise(vec3 w, vec2 s) { return vn(w.xz * s.x + w.y * 0.7) * 0.6 + vn(w.xz * s.y + vec2(w.y * 1.3, 0.0)) * 0.4; }`;
const CUT_GLSL = `
uniform vec4 uCutP[2];
uniform int uNumCut;
uniform vec2 uCutDir;
uniform float uCutH;
uniform sampler2D uFloorT;
uniform vec2 uFloorN;
void cutTest(vec3 wp) {
  for (int i = 0; i < 2; i++) {
    if (i >= uNumCut) break;
    vec2 cc = floor(wp.xz) + 0.5, d = cc - uCutP[i].xy;
    float t = dot(d, uCutDir), q = abs(d.x * uCutDir.y - d.y * uCutDir.x);
    if (t > 0.3 && t < uCutP[i].z && q < uCutP[i].w) {
      float fl = texelFetch(uFloorT, ivec2(clamp(floor(wp.xz), vec2(0.0), uFloorN - 1.0)), 0).r;
      if (wp.y > fl + uCutH) discard;
    }
  }
}`;

// night / dusk tint with static light holes (as the old renderer, linear colours; point lights add the warm light) and
// height fog (low ground towards the fog colour, GFX.hfog x biome)
const ATMO_PARS = `
uniform vec4 uNightW;
uniform vec4 uLightColW;
uniform vec3 uLightsW[8];
uniform int uNumLightsW;
uniform vec4 uHFogW;
uniform vec4 uHFogCW;`;
const ATMO_GLSL = `
if (uNightW.a > 0.0) {
  float lit = 0.0, glw = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumLightsW) break;
    float r = uLightsW[i].z, dd = length(vWP.xz - uLightsW[i].xy);
    lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
    glw = max(glw, 1.0 - smoothstep(0.0, r * 0.9, dd));
  }
  outgoingLight = mix(outgoingLight, uNightW.rgb, uNightW.a * (1.0 - lit));
  outgoingLight = mix(outgoingLight, uLightColW.rgb, uLightColW.a * glw * glw);
}
if (uHFogCW.a > 0.0) outgoingLight = mix(outgoingLight, uHFogCW.rgb, (1.0 - smoothstep(uHFogW.x, uHFogW.y, vWP.y)) * uHFogCW.a);`;

/** World material: PBR (MeshStandard) on vertex colours, value noise on albedo / roughness, glow vertices emissive,
 *  cut-away (uniforms U shared by every world mesh of the battle). */
function worldMaterial(U) {
  const W = GFX.three.world;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: W.rough, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vWP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGlow = glow;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlow;\nvarying vec3 vWP;\nuniform float uNoise;\nuniform vec2 uNS;\nuniform float uGlow;\n${ATMO_PARS}\n${NOISE_GLSL}\n${CUT_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\ncutTest(vWP);')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat nz = wnoise(vWP, uNS);\ndiffuseColor.rgb *= 1.0 + (nz - 0.5) * uNoise;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (nz - 0.5) * 0.2, 0.35, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;')
      .replace('#include <opaque_fragment>', `${ATMO_GLSL}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'dnd-world';
  return m;
}

// particles (gfx/fx3d.js PARTS: pos + size, rgba (alpha + 2 = glowing), stretch xyz + yaw per instance)
const PART_VS = `
attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iShape;
varying vec4 vCol; varying float vGlow;
void main() {
  float c = cos(iShape.w), s = sin(iShape.w);
  vec3 p = position * iShape.xyz * iPos.w;
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 n = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p + iPos.xyz, 1.0);
  vGlow = iCol.a > 1.5 ? 1.0 : 0.0;
  vCol = vec4(iCol.rgb * (0.86 + 0.14 * n.y), iCol.a - 2.0 * vGlow);
}`;
const PART_FS = `
uniform float uGlowK;
varying vec4 vCol; varying float vGlow;
void main() {
  vec3 c = pow(vCol.rgb, vec3(2.2)) * (1.0 + vGlow * uGlowK);
  gl_FragColor = vec4(c, vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- camera
/** Orthographic camera = the game camera (gfx/camera.js): same screen mapping, so 2D anchors / old picking agree. */
function syncCamera(c3, cam, W, H, Wd) {
  const { r, u, f, T, c, s } = ortho(cam);
  c3.position.set(T[0] - f[0] * DIST, T[1] - f[1] * DIST, T[2] - f[2] * DIST);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...r), new THREE.Vector3(...u), new THREE.Vector3(-f[0], -f[1], -f[2]));
  c3.quaternion.setFromRotationMatrix(m);
  c3.left = -c[0] / s; c3.right = (W - c[0]) / s; c3.top = c[1] / s; c3.bottom = (c[1] - H) / s;
  const R = Math.hypot(Wd.w, Wd.h) / 2 + GFX.env.backdrop.ring + 6;
  c3.near = Math.max(0.5, DIST - R); c3.far = DIST + R;
  c3.updateProjectionMatrix();
  c3.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- scene state
function createState(E, V) {
  const scene = new THREE.Scene();
  const cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
  const U = {
    uCutP: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uNumCut: { value: 0 }, uCutDir: { value: new THREE.Vector2(1, 0) },
    uCutH: { value: 6 }, uFloorT: { value: null }, uFloorN: { value: new THREE.Vector2(1, 1) },
    uNightW: { value: new THREE.Vector4() }, uLightColW: { value: new THREE.Vector4() }, uLightsW: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uNumLightsW: { value: 0 },
    uHFogW: { value: new THREE.Vector4() }, uHFogCW: { value: new THREE.Vector4() },
    uNoise: { value: GFX.three.world.noise }, uNS: { value: new THREE.Vector2(...GFX.three.world.noiseScale) }, uGlow: { value: GFX.three.world.glow },
  };
  const world = worldMaterial(U);
  const T3 = GFX.three;
  const hemi = new THREE.HemisphereLight(colorOf(T3.hemi.sky), colorOf(T3.hemi.ground), T3.hemi.k);
  const key = new THREE.DirectionalLight(colorOf(T3.keyColor), T3.key);
  key.castShadow = true;
  key.shadow.bias = T3.shadow.bias; key.shadow.normalBias = T3.shadow.normalBias; key.shadow.radius = T3.shadow.radius;
  const fill = new THREE.DirectionalLight(colorOf(T3.hemi.sky), T3.fill);
  scene.add(hemi, key, key.target, fill, fill.target);
  // decals: one dynamic translucent triangle batch on the floor (no depth write, polygon offset against z-fighting)
  const ovGeo = new THREE.BufferGeometry();
  const overlay = new THREE.Mesh(ovGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  overlay.frustumCulled = false; overlay.renderOrder = 5; overlay.userData.noAO = true;
  scene.add(overlay);
  // particles
  const pm = particleMesh(), pg = new THREE.InstancedBufferGeometry();
  const base = geoFromMB(pm);
  pg.setAttribute('position', base.getAttribute('position')); pg.setAttribute('normal', base.getAttribute('normal')); pg.setIndex(base.getIndex());
  const parts = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: PART_VS, fragmentShader: PART_FS, uniforms: { uGlowK: { value: T3.particleGlow } }, transparent: true, depthWrite: false }));
  parts.frustumCulled = false; parts.renderOrder = 6; parts.userData.noAO = true; parts.visible = false;
  scene.add(parts);
  const T = {
    scene, cam3, U, UU: unitUniforms(), world, hemi, key, fill, overlay, parts, ovCap: 0, ptCap: 0,
    chunks: new Map(), edges: [], backdrop: null, backKey: '', barrels: new Map(), units: new Map(), party: new Map(), partyFrame: 0, points: [], props: new Map(),
    pickMesh: null, pickCells: null, proxies: new Map(), ray: new THREE.Raycaster(), gv: -1, shadowSize: -1,
  };
  T.pick = (S, px, py) => pickThree(E, V, T, S, px, py);
  return T;
}

function disposeObj(o, geoToo = true) {
  o.parent?.remove(o);
  if (geoToo) o.geometry?.dispose();
}

/** World meshes of a new world version: changed chunks, border walls, backdrop, floor height texture, pick surface. */
function syncWorld(E, V, T) {
  const Wd = V.world, CH = GFX.chunk;
  for (let cy = 0; cy < Wd.h; cy += CH) for (let cx = 0; cx < Wd.w; cx += CH) {
    const key = `${cx},${cy}`, s = chunkSig(Wd, cx, cy), c = T.chunks.get(key);
    if (c && c.sig === s) continue;
    if (c?.mesh) disposeObj(c.mesh);
    let top = 0;
    for (let y = cy; y < Math.min(Wd.h, cy + CH); y++) for (let x = cx; x < Math.min(Wd.w, cx + CH); x++) { const i = y * Wd.w + x; top = Math.max(top, Wd.floor[i] + Wd.obst[i]); }
    const geo = geoFromMB(buildChunk(Wd, cx, cy));
    const mesh = geo ? new THREE.Mesh(geo, T.world) : null;
    if (mesh) { mesh.castShadow = mesh.receiveShadow = true; T.scene.add(mesh); }
    T.chunks.set(key, { sig: s, mesh, box: [cx, cy, Math.min(Wd.w, cx + CH), Math.min(Wd.h, cy + CH), top + 2.5] });
  }
  V.chunks = T.chunks; // tests / stats read V.chunks.size
  for (const e of T.edges) { if (e.full) disposeObj(e.full); if (e.low) disposeObj(e.low); }
  T.edges = buildEdges(Wd).map((e) => {
    const mk = (mb) => { const g = geoFromMB(mb); if (!g) return null; const m = new THREE.Mesh(g, T.world); m.castShadow = m.receiveShadow = true; T.scene.add(m); return m; };
    return { mask: e.mask, full: mk(e.full), low: mk(e.low) };
  });
  const bk = `${Wd.biome}|${Wd.w}x${Wd.h}`;
  if (T.backKey !== bk) {
    if (T.backdrop) for (const m of T.backdrop.all) disposeObj(m);
    const B = buildBackdrop(Wd, GFX.sky[Wd.biome] || GFX.sky.default);
    const all = [], groundGeo = overlayGeo(B.ground.v, null);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ground.renderOrder = -1; ground.userData.noAO = true; T.scene.add(ground); all.push(ground);
    const lg = geoFromMB(B.low), low = lg ? new THREE.Mesh(lg, T.world) : null;
    if (low) { low.receiveShadow = true; T.scene.add(low); all.push(low); }
    const groups = B.groups.map((g) => { const geo = geoFromMB(g.mb); if (!geo) return { mask: g.mask, mesh: null }; const m = new THREE.Mesh(geo, T.world); T.scene.add(m); all.push(m); return { mask: g.mask, mesh: m }; });
    T.backdrop = { all, groups };
    T.backKey = bk;
  }
  // floor heights for the cut-away test
  T.U.uFloorT.value?.dispose();
  const ft = new THREE.DataTexture(new Float32Array(Wd.floor), Wd.w, Wd.h, THREE.RedFormat, THREE.FloatType);
  ft.needsUpdate = true;
  T.U.uFloorT.value = ft; T.U.uFloorN.value.set(Wd.w, Wd.h);
  buildPick(V, T);
  // contact-free static props: barrels are drawn per frame; key light fitted to the map box (static per yaw: no swimming)
  T.gv = V.gv;
}

/** Invisible pick surface: per cell its pick top (gfx/scene3d.js topAt: covers / props are surfaces, walls see-through)
 *  + the sides of tall cells down to y 0; triangle -> cell index. */
function buildPick(V, T) {
  const Wd = V.world, top = topAt(V), pos = [], cells = [];
  const quad = (a, b, c, d, i) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); cells.push(i, i); };
  for (let y = 0; y < Wd.h; y++) for (let x = 0; x < Wd.w; x++) {
    const i = y * Wd.w + x, t = top(x, y);
    quad([x, t, y], [x, t, y + 1], [x + 1, t, y + 1], [x + 1, t, y], i);
    if (t > 0.3) {
      quad([x, 0, y], [x + 1, 0, y], [x + 1, t, y], [x, t, y], i);
      quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, t, y + 1], [x, t, y + 1], i);
      quad([x, 0, y], [x, 0, y + 1], [x, t, y + 1], [x, t, y], i);
      quad([x + 1, 0, y], [x + 1, 0, y + 1], [x + 1, t, y + 1], [x + 1, t, y], i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  T.pickMesh?.geometry.dispose();
  T.pickMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  T.pickMesh.updateMatrixWorld(true);
  T.pickCells = cells;
}

/** OverlayBuilder floats (pos3 + rgba, sRGB) -> geometry (linear colours); reuses `geo` while it has room. */
function overlayGeo(v, geo, cap = 0) {
  const n = v.length / 7;
  let g = geo;
  if (!g || n > cap) {
    g?.dispose();
    g = new THREE.BufferGeometry();
    const c = Math.max(64, n * 1.5 | 0);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.userData.cap = c;
  }
  const P = g.getAttribute('position'), C = g.getAttribute('color');
  for (let k = 0; k < n; k++) {
    const o = k * 7;
    P.array[k * 3] = v[o]; P.array[k * 3 + 1] = v[o + 1]; P.array[k * 3 + 2] = v[o + 2];
    C.array[k * 4] = lin(v[o + 3]); C.array[k * 4 + 1] = lin(v[o + 4]); C.array[k * 4 + 2] = lin(v[o + 5]); C.array[k * 4 + 3] = v[o + 6];
  }
  P.needsUpdate = true; C.needsUpdate = true;
  P.clearUpdateRanges(); C.clearUpdateRanges();
  P.addUpdateRange(0, n * 3); C.addUpdateRange(0, n * 4);
  g.setDrawRange(0, n);
  return g;
}

// ---------------------------------------------------------------- units
const IDENT = new THREE.Matrix4(), BM = new THREE.Matrix4();
function makeUnit(E, T, tpl) {
  const geo = E.geometry(`tpl:${tpl.key}`, () => geoFromMB(tpl.mb, true));
  if (!geo) return null;
  const bones = Array.from({ length: NBONES }, () => new THREE.Bone());
  const skel = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const pose = new Float32Array(NBONES * 12 + 12);
  // poses come from gfx/anim.js poseBones (rows of 3x4 world matrices): copied as column-major 4x4 on every render
  skel.update = function () {
    const M = this.boneMatrices;
    for (let b = 0; b < NBONES; b++) {
      const o = b * 12, m = b * 16;
      M[m] = pose[o]; M[m + 1] = pose[o + 4]; M[m + 2] = pose[o + 8]; M[m + 3] = 0;
      M[m + 4] = pose[o + 1]; M[m + 5] = pose[o + 5]; M[m + 6] = pose[o + 9]; M[m + 7] = 0;
      M[m + 8] = pose[o + 2]; M[m + 9] = pose[o + 6]; M[m + 10] = pose[o + 10]; M[m + 11] = 0;
      M[m + 12] = pose[o + 3]; M[m + 13] = pose[o + 7]; M[m + 14] = pose[o + 11]; M[m + 15] = 1;
    }
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
  };
  const mk = (mat) => { const m = new THREE.SkinnedMesh(geo, mat); m.bind(skel, IDENT); m.frustumCulled = false; return m; };
  const body = mk(unitMaterial(T.UU));
  body.castShadow = true; body.receiveShadow = true;
  const hull = mk(hullMaterial(T.UU));
  hull.userData.noAO = true;
  // x-ray: drawn in the opaque list after the world and before the bodies (renderOrder 1 < 2), against the world depth
  // only — the same-depth test against its own body is unreliable across programs; custom blending works with
  // transparent = false (stays in the opaque list)
  const xray = mk(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: GFX.unit.xray, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  xray.userData.noAO = true; xray.renderOrder = 1;
  body.renderOrder = 2; hull.renderOrder = 2;
  T.scene.add(body, hull, xray);
  return { key: tpl.key, body, hull, xray, skel, pose };
}
function dropUnit(o) {
  for (const m of [o.body, o.hull, o.xray]) { m.parent?.remove(m); m.material.dispose(); }
  o.skel.dispose();
}

// ---------------------------------------------------------------- picking
const proxyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8).translate(0, 0.5, 0);
const proxyMat = new THREE.MeshBasicMaterial();
function pickThree(E, V, T, S, px, py) {
  const b = S.b, Wd = V.world;
  if (!Wd || !T.pickMesh) return null;
  syncCamera(T.cam3, V.cam, E.w, E.h, Wd);
  T.ray.setFromCamera(new THREE.Vector2((px / E.w) * 2 - 1, 1 - (py / E.h) * 2), T.cam3);
  // unit bodies: capsule proxies at the displayed positions (a body under the cursor wins)
  const list = [];
  for (const u of b.units) {
    if (u.dead || u.removed) continue;
    let p = T.proxies.get(u.id);
    if (!p) { p = new THREE.Mesh(proxyGeo, proxyMat); p.userData.unit = u; T.proxies.set(u.id, p); }
    const d = S.dispOf(u), tp = unitTemplate(u, { simple: !!gfxPrefs().reduceFx });
    p.userData.unit = u;
    p.position.set(d.x + 0.5, V.hgt[u.id] ?? 0, d.y + 0.5);
    p.scale.set(1, tp.top * tp.scale, 1);
    p.updateMatrixWorld(true);
    list.push(p);
  }
  const hu = T.ray.intersectObjects(list, false)[0];
  const hf = T.ray.intersectObject(T.pickMesh, false)[0];
  const fl = hf ? (() => { const i = T.pickCells[hf.faceIndex]; return { x: i % Wd.w, y: (i / Wd.w) | 0, fx: hf.point.x, fz: hf.point.z }; })() : null;
  if (!hu) return fl;
  const u = hu.object.userData.unit, best = { x: u.x, y: u.y, unit: u.id };
  return fl ? { ...best, fx: fl.fx, fz: fl.fz } : best;
}

// ---------------------------------------------------------------- frame
export function drawBattleThree(E, game, S, opts) {
  const V = S.v3;
  if (!V.T) V.T = createState(E, V);
  const T = V.T, r = E.renderer;
  const F = prepFrame(game, S, opts, { soft: E.soft, size: `${E.w}x${E.h}x${E.scale}` });
  if (!F) return;
  const { b, Wd, prefs, cam, now, view, busy, inst, lampsN, ambN, wxActive } = F;
  if (T.gv !== V.gv) syncWorld(E, V, T);
  const L = S.L, A = cam.area, W = E.w, H = E.h;
  E.clipTo({ x: A.x, y: L.area.y, w: A.w, h: L.area.h });
  syncCamera(T.cam3, cam, W, H, Wd);

  // world visibility: chunks in view (orthographic culling as before), near-side border walls low, far backdrop only
  let shownN = 0;
  for (const c of T.chunks.values()) if (c.mesh) { c.mesh.visible = inView(S, cam, c.box); shownN += c.mesh.visible ? 1 : 0; }
  const near = nearMask(cam);
  for (const e of T.edges) { const lowSide = !!(e.mask & near); if (e.full) e.full.visible = !lowSide; if (e.low) e.low.visible = lowSide; }
  for (const g of T.backdrop?.groups || []) if (g.mesh) g.mesh.visible = !(g.mask & near);

  // cut-away (metric-combat «Обзор»): boxes toward the camera from the focus / cursor, height sinks with view.k
  const VW = GFX.view;
  T.U.uNumCut.value = view.k > 0 ? view.cuts.length : 0;
  view.cuts.slice(0, 2).forEach((c, i) => T.U.uCutP.value[i].set(c[0], c[1], c[2], c[3]));
  T.U.uCutDir.value.set(view.dir[0], view.dir[1]);
  T.U.uCutH.value = 6 + (VW.cutH - 6) * view.k + GFX.three.world.cutPad;

  // barrels (break mid-battle): one InstancedMesh per kind (capacity grows by doubling)
  const brs = b.barrels || [], byKind = new Map();
  for (const br of brs) { const id = br.kind === 'toxgas' ? 'barrel-toxic' : 'barrel'; if (!byKind.has(id)) byKind.set(id, []); byKind.get(id).push(br); }
  for (const id of new Set([...byKind.keys(), ...T.barrels.keys()])) {
    const list = byKind.get(id) || [];
    let m = T.barrels.get(id);
    if (!list.length) { if (m) m.count = 0; continue; }
    if (!m || m.instanceMatrix.count < list.length) {
      if (m) { m.parent?.remove(m); m.dispose(); }
      const geo = E.geometry(`prop:${id}`, () => geoFromMB(propModel(id)));
      m = new THREE.InstancedMesh(geo, T.world, Math.max(4, list.length * 2));
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
      T.scene.add(m); T.barrels.set(id, m);
    }
    list.forEach((br, i) => { BM.makeTranslation(br.x, Wd.floor[br.y * Wd.w + br.x] || 0, br.y); m.setMatrixAt(i, BM); });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  }

  // units
  const seen = new Set(), ppm = cam.ppmFit * cam.zoom, PC = { now, ppm, prefs, hgt: V.hgt };
  let glbN = 0;
  for (const p of inst) {
    const id = p.it.u.id;
    if (syncParty(T, p, PC)) { glbN++; continue; } // GLB hero (three/party.js); its procedural twin is dropped below
    let o = T.units.get(id);
    if (o && o.key !== p.T.key) { dropUnit(o); o = null; }
    if (!o) { o = makeUnit(E, T, p.T); if (!o) continue; T.units.set(id, o); }
    seen.add(id);
    poseInst(p, V, now, prefs, o.pose, 0);
    const team = p.team, tc = linRGB(team);
    o.body.material.opacity = p.alpha;
    o.body.material.transparent = p.trans;
    o.body.material.depthWrite = !p.trans;
    const bu = o.body.material.userData.u;
    bu.uTint.value.set(o.pose[NBONES * 12], o.pose[NBONES * 12 + 1], o.pose[NBONES * 12 + 2], o.pose[NBONES * 12 + 3]);
    bu.uFaceU.value = o.pose[NBONES * 12 + 9];
    o.body.castShadow = !p.trans;
    o.hull.visible = !p.trans;
    o.hull.material.userData.u.uTeam.value.set(team[0] * 0.8, team[1] * 0.8, team[2] * 0.8);
    o.hull.material.userData.grow.value = p.grow / ppm;
    o.xray.visible = !p.trans && !p.dead;
    o.xray.material.color.setRGB(tc[0], tc[1], tc[2]);
    o.body.visible = true;
  }
  for (const [id, o] of T.units) if (!seen.has(id)) { dropUnit(o); T.units.delete(id); }
  sweepParty(T);

  // decals + particles of the frame
  const { ob, PARTS } = frameBatches();
  T.overlay.geometry = overlayGeo(ob.v, T.overlay.geometry, T.overlay.geometry.userData.cap || 0);
  T.overlay.visible = ob.v.length > 0;
  const np = PARTS.length / 12;
  T.parts.visible = np > 0;
  if (np) {
    const g = T.parts.geometry;
    if (np > T.ptCap) {
      T.ptCap = Math.max(64, np * 2);
      for (const [k, off] of [['iPos', 0], ['iCol', 4], ['iShape', 8]]) {
        void off;
        g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(T.ptCap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      }
    }
    const a = [g.getAttribute('iPos'), g.getAttribute('iCol'), g.getAttribute('iShape')];
    for (let i = 0; i < np; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) a[k].array[i * 4 + j] = PARTS[i * 12 + k * 4 + j];
    for (const x of a) x.needsUpdate = true;
    g.instanceCount = np;
  }

  // lights: key (shadow caster) and fill camera-relative like the old renderer; night / dusk dims + point lights
  const T3 = GFX.three, { r: rr, f } = basis(cam), rel = (D) => { const v = new THREE.Vector3(rr[0] * D[0] - f[0] * D[2], D[1], rr[2] * D[0] - f[2] * D[2]); return v.normalize(); };
  const ctr = new THREE.Vector3(Wd.w / 2, 0, Wd.h / 2), R = Math.hypot(Wd.w, Wd.h) / 2 + GFX.shadow.pad + 1;
  const kd = rel(GFX.shadow.dir);
  T.key.position.copy(ctr).addScaledVector(kd, 60); T.key.target.position.copy(ctr);
  T.fill.position.copy(ctr).addScaledVector(rel(GFX.fill.dir), 60); T.fill.target.position.copy(ctr);
  T.key.target.updateMatrixWorld(); T.fill.target.updateMatrixWorld();
  const shSize = prefs.reduceFx || prefs.shadows === 'off' ? 0 : (T3.shadow[prefs.shadows] || T3.shadow.high) * (E.lite ? T3.soft.shadow : 1);
  T.key.castShadow = shSize > 0;
  if (shSize && shSize !== T.shadowSize) {
    T.shadowSize = shSize;
    T.key.shadow.mapSize.set(shSize, shSize);
    T.key.shadow.map?.dispose(); T.key.shadow.map = null;
  }
  const sc = T.key.shadow.camera;
  if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 130; sc.updateProjectionMatrix(); }
  const vis = visionOf(b.map), tod = b.map.tod, NT = GFX.light.night;
  const amount = vis.dark ? NT.amount : tod === 'dusk' ? NT.dusk : 0;
  const dim = 1 - amount * (1 - T3.night.ambient);
  T.hemi.intensity = T3.hemi.k * dim;
  T.key.intensity = T3.key * dim;
  T.fill.intensity = prefs.reduceFx ? 0 : T3.fill * dim;
  const nc = colorOf(WEATHER.tod[tod]?.overlay?.[0] || '0');
  const moon = vis.dark ? amount / NT.amount : 0; // night: cold moonlight key, blue sky
  T.hemi.color.copy(colorOf(T3.hemi.sky)).lerp(vis.dark ? colorOf(T3.night.sky) : nc, vis.dark ? moon * 0.8 : amount * 0.6);
  T.hemi.groundColor.copy(colorOf(T3.hemi.ground));
  T.key.color.copy(colorOf(T3.keyColor)).lerp(colorOf(T3.night.moon), moon * 0.7);
  const ls = amount && vis.dark ? (S.lights3 || lightSources(b)).slice(0, NT.max) : [];
  if (ls.length && !T.points.length) for (let k = 0; k < NT.max; k++) { const pl = new THREE.PointLight(colorOf(NT.warm), 0, 1, 2); T.scene.add(pl); T.points.push(pl); }
  T.points.forEach((pl, k) => {
    const l = ls[k];
    if (!l) { pl.intensity = 0; return; }
    const [x, y, rad] = l, fy = Wd.floor[Math.min(Wd.h - 1, y) * Wd.w + Math.min(Wd.w - 1, x)] || 0;
    pl.position.set(x + 0.5, fy + 1.1, y + 0.5);
    pl.distance = (rad + 0.5) * NT.radiusMul * T3.night.dist;
    pl.intensity = T3.night.point * amount / NT.amount;
  });
  // night: tint towards deep blue (GFX.three.night.tint) outside the light holes; dusk: the dusk overlay colour
  const tintKey = vis.dark ? T3.night.tint : WEATHER.tod[tod]?.overlay?.[0] || '0', tintA = amount * (vis.dark ? T3.night.tintK : 1);
  syncUnitUniforms(T.UU, { r: rr, f, reduceFx: !!prefs.reduceFx, night: { rgb: keyRGB(tintKey), amount: tintA }, lights: ls, shadow: shSize });
  const tl = linRGB(keyRGB(tintKey)), wl = linRGB(keyRGB(NT.warm));
  T.U.uNightW.value.set(tl[0], tl[1], tl[2], tintA);
  T.U.uLightColW.value.set(wl[0], wl[1], wl[2], amount ? NT.warmAmt * T3.night.warmK * amount / NT.amount : 0);
  ls.forEach(([x, y, rr2], k) => T.U.uLightsW.value[k].set(x + 0.5, y + 0.5, (rr2 + 0.5) * NT.radiusMul));
  T.U.uNumLightsW.value = ls.length;
  const HF = GFX.hfog, hk = GFX.env.hfog[Wd.biome] || [1, 1], hc = linRGB(keyRGB(GFX.fogColor[Wd.biome] || GFX.fogColor.default));
  T.U.uHFogW.value.set(HF.y0, HF.y1 * hk[1], 0, 0);
  T.U.uHFogCW.value.set(hc[0], hc[1], hc[2], prefs.reduceFx ? 0 : HF.amount * hk[0]);
  // background, fog (linear; old max share reached at the old far distance)
  const bg = colorOf(GFX.sky[Wd.biome] || GFX.sky.default);
  T.scene.background = bg;
  const FG = GFX.light.fog;
  if (prefs.reduceFx) T.scene.fog = null;
  else {
    const fc = colorOf(GFX.fogColor[Wd.biome] || GFX.fogColor.default);
    const nearD = DIST + (vis.vis ? -4 : FG.near), farD = DIST + (vis.vis ? vis.vis * 2 : FG.far), mx = vis.vis ? Math.min(0.6, FG.max + 0.2) : FG.max;
    if (!T.scene.fog) T.scene.fog = new THREE.Fog(fc, nearD, farD);
    T.scene.fog.color.copy(fc); T.scene.fog.near = nearD; T.scene.fog.far = nearD + (farD - nearD) / mx;
  }
  r.toneMappingExposure = T3.exposure * (prefs.brightness || 1);

  // render: post chain (GTAO, bloom, tonemap, grade) or straight («Снизить эффекты»)
  if (prefs.reduceFx) {
    r.setRenderTarget(null);
    r.render(T.scene, T.cam3);
  } else {
    const P = E.composer(T.scene, T.cam3);
    const Gd = P.grade.uniforms, gr = T3.grade, bal = GFX.post.balance[Wd.biome] || GFX.post.balance.default;
    Gd.uArea.value.set(A.x / W, 1 - (L.area.y + L.area.h) / H, A.w / W, L.area.h / H);
    Gd.uBal.value.set(bal[0], bal[1], bal[2]);
    Gd.uVig.value.set(gr.vignette, gr.start);
    Gd.uMax.value = gr.max;
    Gd.uSat.value = gr.sat;
    P.comp.render();
  }
  V.stats = { units: inst.length, glb: glbN, groups: new Set(inst.map((p) => p.T.key)).size, particles: np, shadow: shSize, busy, chunks: shownN, chunksAll: T.chunks.size, lights: ls.length, glow: lampsN, ambient: ambN, weather: wxActive, post: !prefs.reduceFx, msaa: E.soft ? 0 : T3.msaa, three: true, calls: r.info.render.calls, tris: r.info.render.triangles };
}

export function dropBattleThree(E, V) {
  const T = V.T;
  if (!T) return;
  for (const o of T.units.values()) dropUnit(o);
  T.units.clear();
  dropParty(T);
  for (const m of T.barrels.values()) m.dispose();
  T.barrels.clear();
  for (const c of T.chunks.values()) c.mesh?.geometry.dispose();
  for (const e of T.edges) { e.full?.geometry.dispose(); e.low?.geometry.dispose(); }
  for (const m of T.backdrop?.all || []) m.geometry.dispose();
  T.overlay.geometry.dispose(); T.overlay.material.dispose();
  T.parts.geometry.dispose(); T.parts.material.dispose();
  T.pickMesh?.geometry.dispose();
  T.U.uFloorT.value?.dispose();
  T.world.dispose();
  T.key.shadow.map?.dispose();
  if (E.post?.scene === T.scene) E.disposePost();
  T.chunks.clear();
  V.T = null;
}
