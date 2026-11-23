// Unit materials on Three.js (docs/specs/threejs-migration.md §4, stage 2): a port of the old anime toon program
// (gfx/gl.js SKIN_FS) onto MeshLambertMaterial (Three skinning, shadow map, fog): 3 soft bands from the per-vertex
// palette ramps (shade / base / light, sRGB), shadow hue shift, fill light on the shadow side, baked AO, glowing
// vertices flat (+ emissive for bloom), face atlas (kind 9, expression column per unit), material atlas (cloth /
// leather / metal / rust, kinds 1-5), hair highlight band (kind 6), rim light, hit flash; night tint with static light
// holes (as the old renderer: the palette stays readable). Colours are computed in sRGB like the old shader and
// converted to linear at the end (tonemap / grade of the post chain follow).
//   unitUniforms()                   -> UU shared uniforms of all unit materials of a scene
//   syncUnitUniforms(UU, o)          per frame: light / fill dirs (world), view dir, night, lights, toon numbers
//   unitMaterial(UU)                 body material (per unit: m.userData.faceU / tint uniforms)
//   hullMaterial(UU)                 inverted-hull outline: dark shade of the vertex ramp + 30 % team colour
//   nightPatch(m, UU)                the same night tint + light holes on any built-in material (GLB characters,
//                                    three/party.js); chains an existing onBeforeCompile
// Geometry attributes (three/battle.js geoFromMB skin): rampS, color (= base ramp, sRGB), rampL, aox (ao, glow), uvk.
import * as THREE from 'three';
import { GFX } from '../data/gfx.js';
import { keyRGB } from '../gfx/mesh.js';
import { faceAtlas, buildMatAtlas } from '../gfx/faces.js';

const V3 = () => new THREE.Vector3();
export function unitUniforms() {
  return {
    uLightW: { value: V3() }, uFillW: { value: new THREE.Vector4() }, uViewW: { value: V3() },
    uSteps: { value: new THREE.Vector2(...GFX.light.steps) }, uAo: { value: GFX.light.ao },
    uToon: { value: new THREE.Vector4() }, uShadeHue: { value: V3() }, uRimCol: { value: V3() }, uRustCol: { value: V3() },
    uNight: { value: new THREE.Vector4() }, uLightCol: { value: new THREE.Vector4() }, uLights: { value: Array.from({ length: 8 }, V3) }, uNumLights: { value: 0 },
    uShadowK: { value: 0 }, uFace: { value: null }, uMatTex: { value: null }, uGlowE: { value: GFX.three.unit.glow },
  };
}

let faceTex = null, matTex = null;
/** Face / material atlases as Three textures (raw sRGB values: the shader works in sRGB like the old one). */
function atlases(UU) {
  const fc = faceAtlas.canvas;
  if (fc && (!faceTex || faceTex.image !== fc)) {
    faceTex?.dispose();
    faceTex = new THREE.CanvasTexture(fc);
    faceTex.colorSpace = THREE.NoColorSpace;
    faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
    faceTex.userData.ver = faceAtlas.ver;
  }
  if (faceTex && faceTex.userData.ver !== faceAtlas.ver) { faceTex.needsUpdate = true; faceTex.userData.ver = faceAtlas.ver; }
  if (!matTex) {
    const mc = buildMatAtlas();
    if (mc) { matTex = new THREE.CanvasTexture(mc); matTex.colorSpace = THREE.NoColorSpace; matTex.wrapS = THREE.RepeatWrapping; matTex.wrapT = THREE.ClampToEdgeWrapping; }
  }
  UU.uFace.value = faceTex; UU.uMatTex.value = matTex;
}

/**
 * Per-frame uniforms. o: {r, f} camera basis (gfx/camera.js basis), reduceFx, night {rgb (sRGB 0..1), amount},
 * lights [[x, y, r]] (cells), shadow (0 = off).
 */
export function syncUnitUniforms(UU, o) {
  const { r, f } = o, rel = (D, out) => out.set(r[0] * D[0] - f[0] * D[2], D[1], r[2] * D[0] - f[2] * D[2]).normalize();
  rel(GFX.light.dir, UU.uLightW.value);
  const fv = rel(GFX.fill.dir, V3());
  UU.uFillW.value.set(fv.x, fv.y, fv.z, o.reduceFx ? 0 : GFX.fill.k);
  UU.uViewW.value.set(f[0], f[1], f[2]).normalize();
  const T2 = GFX.toon, NT = GFX.light.night;
  UU.uToon.value.set(T2.soft, o.reduceFx ? T2.rim2 * 0.5 : T2.rimK, T2.hue, T2.outline);
  UU.uShadeHue.value.set(...keyRGB(T2.shadeHue)); UU.uRimCol.value.set(...keyRGB(T2.rim)); UU.uRustCol.value.set(...keyRGB(T2.rust));
  const n = o.night;
  UU.uNight.value.set(n.rgb[0], n.rgb[1], n.rgb[2], n.amount);
  const wc = keyRGB(NT.warm);
  UU.uLightCol.value.set(wc[0], wc[1], wc[2], n.amount ? NT.warmAmt * n.amount / NT.amount : 0);
  o.lights.slice(0, 8).forEach(([x, y, rr], k) => UU.uLights.value[k].set(x + 0.5, y + 0.5, (rr + 0.5) * NT.radiusMul));
  UU.uNumLights.value = Math.min(8, o.lights.length);
  UU.uShadowK.value = o.shadow ? GFX.shadow.strength : 0;
  atlases(UU);
}

const VS_PARS = `
attribute vec3 rampS;
attribute vec3 rampL;
attribute vec2 aox;
attribute vec3 uvk;
uniform float uFaceU;
varying vec3 vS; varying vec3 vB; varying vec3 vL; varying vec2 vAX; varying vec3 vUVK; varying vec3 vBP; varying vec3 vBN; varying vec3 vWorldP;`;
const VS_MAIN = `
vS = rampS; vB = color.rgb; vL = rampL; vAX = aox;
vUVK = vec3(uvk.xy + vec2(uvk.z > 8.5 ? uFaceU : 0.0, 0.0), uvk.z);
vBP = position; vBN = normal;
vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
const FS_SHADOW = `
float keyShadow() {
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    return getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, 1.0, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
  #else
    return 1.0;
  #endif
}`;
const FS_PARS = `
varying vec3 vS; varying vec3 vB; varying vec3 vL; varying vec2 vAX; varying vec3 vUVK; varying vec3 vBP; varying vec3 vBN; varying vec3 vWorldP;
uniform vec3 uLightW; uniform vec4 uFillW; uniform vec3 uViewW; uniform vec2 uSteps; uniform float uAo;
uniform vec4 uToon; uniform vec3 uShadeHue; uniform vec3 uRimCol; uniform vec3 uRustCol;
uniform vec4 uNight; uniform vec4 uLightCol; uniform vec3 uLights[8]; uniform int uNumLights;
uniform float uShadowK; uniform sampler2D uFace; uniform sampler2D uMatTex; uniform vec4 uTint; uniform float uGlowE;
vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 nightTint(vec3 c) {
  if (uNight.a <= 0.0) return c;
  float lit = 0.0, glow = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumLights) break;
    float r = uLights[i].z, dd = length(vWorldP.xz - uLights[i].xy);
    lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
    glow = max(glow, 1.0 - smoothstep(0.0, r * 0.9, dd));
  }
  c = mix(c, uNight.rgb, uNight.a * (1.0 - lit));
  return mix(c, uLightCol.rgb, uLightCol.a * glow * glow);
}`;
// body: the old SKIN_FS colour (uMode 0) in sRGB -> linear outgoingLight; glowing vertices also emissive (bloom)
const FS_BODY = `
vec3 n = inverseTransformDirection( normal, viewMatrix );
float d = dot(n, uLightW), e = uToon.x;
float t1 = smoothstep(uSteps.y - e, uSteps.y + e, d), t2 = smoothstep(uSteps.x - e, uSteps.x + e, d);
vec3 shade = mix(vS, uShadeHue, uToon.z);
vec3 c = mix(shade, vB, t1);
c = mix(c, vL, t2);
c = mix(c, vB, uFillW.w * smoothstep(0.0, 0.6, dot(n, uFillW.xyz)) * (1.0 - t1));
int kind = int(vUVK.z + 0.5);
float glowV = 0.0;
if (vAX.y > 0.5) { c = vB; glowV = 1.0; }
else {
  c = mix(c, shade, clamp(vAX.x * uAo, 0.0, 1.0));
  if (kind == 9) {
    vec4 tc = texture2D(uFace, vUVK.xy);
    c = tc.rgb * mix(vec3(1.0), clamp(c / (vB + 0.03), 0.0, 1.5), 0.65);
  } else if (kind >= 1 && kind <= 5) {
    vec3 an = abs(vBN);
    vec2 pu = an.y > an.x && an.y > an.z ? vBP.xz : (an.x > an.z ? vBP.zy : vBP.xy);
    pu *= 7.0;
    vec2 fp = fract(pu), dx = dFdx(pu), dy = dFdy(pu);
    float row = float(kind - 1);
    vec4 t = textureGrad(uMatTex, vec2(fp.x, (row + fp.y) * 0.2), dx * vec2(1.0, 0.2), dy * vec2(1.0, 0.2));
    if (kind == 4) c = mix(c * (0.85 + 0.3 * t.r), uRustCol * (0.65 + 0.5 * t.r), t.g * 0.8);
    else c *= 0.84 + 0.32 * t.r;
    if (kind == 3) c = mix(c, vL, t.b * t2 * 0.5);
  } else if (kind == 6) {
    float yb = n.y - 0.1 * n.x;
    float ring = (1.0 - smoothstep(0.03, 0.12, abs(yb - 0.55))) * smoothstep(-0.2, 0.3, d);
    float halo = (1.0 - smoothstep(0.1, 0.4, abs(yb - 0.55))) * smoothstep(-0.2, 0.3, d);
    c = mix(c, min(vL * 1.1, vec3(1.0)), halo * 0.22);
    c = mix(c, min(vL * 1.22 + 0.06, vec3(1.0)), ring * 0.8);
  }
  if (uShadowK > 0.0 && d > uSteps.y - e) c = mix(c, shade, (1.0 - keyShadow()) * uShadowK * smoothstep(uSteps.y - e, uSteps.y + e, d));
  float fr = 1.0 - clamp(dot(n, -uViewW), 0.0, 1.0);
  float rim = smoothstep(0.52, 0.86, fr) * (0.35 + 0.65 * smoothstep(-0.35, 0.35, d));
  c = mix(c, mix(vL, uRimCol, 0.55), rim * uToon.y);
  c = mix(c, uTint.rgb, uTint.a);
}
c = nightTint(c);
outgoingLight = s2l(c) * (1.0 + glowV * uGlowE);`;
const FS_HULL = `
vec3 c = mix(vS * (1.0 - uToon.w), uTeam, 0.3);
outgoingLight = s2l(nightTint(c));`;

function patch(m, UU, body) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, UU, m.userData.u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VS_PARS}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VS_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FS_PARS}\nuniform vec3 uTeam;`)
      .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${FS_SHADOW}`)
      .replace('#include <opaque_fragment>', `${body ? FS_BODY : FS_HULL}\n#include <opaque_fragment>`);
  };
}

/** Body material: per unit (opacity, flash tint, face column live in m.userData.u). */
export function unitMaterial(UU) {
  // double-sided: some template loft caps face inwards (the old renderer hid them behind its body pass the same way)
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.userData.u = { uFaceU: { value: 0 }, uTint: { value: new THREE.Vector4() }, uTeam: { value: V3() } };
  patch(m, UU, true);
  m.customProgramCacheKey = () => 'dnd-unit2';
  return m;
}
/** Outline hull: back faces grown along the skinned normal by uGrow metres; colour = old uMode 2. */
export function hullMaterial(UU) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.BackSide });
  m.userData.u = { uFaceU: { value: 0 }, uTint: { value: new THREE.Vector4() }, uTeam: { value: V3() }, uGrow: { value: 0.02 } };
  m.userData.grow = m.userData.u.uGrow;
  patch(m, UU, false);
  const ob = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    ob(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrow;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uGrow;');
  };
  m.customProgramCacheKey = () => 'dnd-hull2';
  return m;
}
export function disposeUnitAtlases() { faceTex?.dispose(); matTex?.dispose(); faceTex = matTex = null; }

// night tint for built-in materials (MeshToon / MeshBasic of GLB characters): outgoingLight (linear) -> sRGB -> the
// same nightTint as the procedural units -> linear; world position from the skinned vertex
const NIGHT_VS = 'varying vec3 vWorldP;';
const NIGHT_FS = `varying vec3 vWorldP;
uniform vec4 uNight; uniform vec4 uLightCol; uniform vec3 uLights[8]; uniform int uNumLights;
vec3 l2sN(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 s2lN(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 nightTintL(vec3 l) {
  if (uNight.a <= 0.0) return l;
  vec3 c = l2sN(l);
  float lit = 0.0, glow = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumLights) break;
    float r = uLights[i].z, dd = length(vWorldP.xz - uLights[i].xy);
    lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
    glow = max(glow, 1.0 - smoothstep(0.0, r * 0.9, dd));
  }
  c = mix(c, uNight.rgb, uNight.a * (1.0 - lit));
  return s2lN(mix(c, uLightCol.rgb, uLightCol.a * glow * glow));
}`;
export function nightPatch(m, UU) {
  if (m.userData.night) return m;
  m.userData.night = true;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    for (const k of ['uNight', 'uLightCol', 'uLights', 'uNumLights']) sh.uniforms[k] = UU[k];
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NIGHT_VS}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NIGHT_FS}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = nightTintL(outgoingLight);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `${key.call(m)}|night`;
  m.needsUpdate = true;
  return m;
}
