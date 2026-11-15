// WebGL2 context, shader programs, context loss (docs/specs/3d.md §1). No game logic here.
//   hasWebGL2()                      -> bool (probe once)
//   softwareGL()                     -> true on SwiftShader / llvmpipe (auto mode picks 2D there)
//   createGL(canvas, {onLost, onRestored}) -> WebGL2RenderingContext | null
//   makeProgram(gl, vs, fs)          -> { prog, u: {name: location} } (throws on compile / link error)
//   worldProgram(gl), skinProgram(gl), depthProgram(gl, skin), particleProgram(gl), overlayProgram(gl)
//   VERT — layout of the world vertex (floats): pos3 nrm3 shadow3 base3 light3 ao glow
let probe = null;
function probeGL() {
  if (probe) return probe;
  probe = { ok: false, renderer: '' };
  try {
    const c = globalThis.document?.createElement('canvas');
    const g = c?.getContext('webgl2');
    if (g) {
      probe.ok = true;
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      probe.renderer = String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { probe.ok = false; }
  return probe;
}
export const hasWebGL2 = () => probeGL().ok;
export const softwareGL = () => /swiftshader|llvmpipe|software/i.test(probeGL().renderer);

export function createGL(canvas, { onLost, onRestored } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => onRestored?.());
  return gl;
}

export function makeProgram(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`program: ${gl.getProgramInfoLog(prog)}`);
  const u = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, u };
}

export const VERT = 17;

// Flat 3-step Lambert from a palette ramp (no multiplication: colours stay in the STYLE palette), baked AO pulls the
// tone to the shadow colour, shadow map (1 directional light, PCF 3x3: lit faces in shadow take the ramp's shadow
// tone), linear depth fog, night tint with static light holes, brightness, 90 % pixel cap.
// Variants: static world (uModel) | SKIN — units: rigid skinning, 11 bones per instance read from a float texture
// (row = instance: 3 texels per bone = rows of a 3x4 affine, then tint / team+alpha / grow) | DEPTH — shadow pass.
const WORLD_VS = (depth) => `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aS;
layout(location=3) in vec3 aB;
layout(location=4) in vec3 aL;
layout(location=5) in vec2 aX;
uniform mat4 uModel;
uniform mat4 uVP;
uniform mat4 uShadowVP;
uniform vec3 uLight;
uniform vec2 uSteps;
uniform float uAo;
uniform float uGrow;
flat out vec3 vCol;
flat out vec3 vShade;
flat out float vLitFace;
out vec3 vWorld;
out vec3 vShadow;
${depth ? '' : 'out vec3 vNw;'}
void main() {
  vec3 n = normalize(mat3(uModel) * aNrm);
  vec4 wp = uModel * vec4(aPos + aNrm * uGrow, 1.0);
  vWorld = wp.xyz;
${depth ? '' : '  vNw = n;'}
  gl_Position = uVP * wp;
${depth ? '' : `  vec4 sp = uShadowVP * wp;
  vShadow = sp.xyz * 0.5 + 0.5;
  float d = dot(n, uLight);
  vec3 c = aX.y > 0.5 ? aB : (d > uSteps.x ? aL : (d > uSteps.y ? aB : aS));
  vLitFace = aX.y > 0.5 || d <= uSteps.y ? 0.0 : 1.0;
  vShade = aS;
  vCol = mix(c, aS, clamp(aX.x * uAo, 0.0, 1.0));`}
}`;
const WORLD_FS = () => `#version 300 es
precision highp float;
precision highp sampler2DShadow;
flat in vec3 vCol;
flat in vec3 vShade;
flat in float vLitFace;
in vec3 vWorld;
in vec3 vShadow;
in vec3 vNw;
// metric-combat.md «Обзор»: floor height per cell (R32F), cut-away (focus xz, camera dir xz | fade k, cut height, cos,
// x-ray keep share), see-through holes (gl_FragCoord xy, radius px, window depth) around the active unit / cursor
uniform highp sampler2D uFloorT;
uniform vec4 uCut;
uniform vec4 uCutK;
uniform vec4 uSee[4];
uniform int uNumSee;
uniform float uSeeKeep;
uniform vec4 uTint;
uniform vec4 uFlat;
uniform float uAlpha;
uniform vec4 uFogPlane;
uniform vec4 uFog;
uniform vec2 uFogRange;
uniform vec4 uNight;
uniform vec3 uLights[8];
uniform vec4 uLightCol; // warm glow of night lights: palette rgb, strength
uniform int uNumLights;
uniform float uBright;
uniform float uMaxPix;
uniform sampler2DShadow uShadow;
uniform vec3 uShadowOn; // strength, texel size, bias
out vec4 outColor;
void main() {
  if (uCutK.x > 0.0 || uCutK.w > 0.0 || uNumSee > 0) {
    ivec2 ts = textureSize(uFloorT, 0);
    ivec2 tc = clamp(ivec2(floor(vWorld.xz - vNw.xz * 0.02)), ivec2(0), ts - 1);
    float hh = vWorld.y - texelFetch(uFloorT, tc, 0).r;
    if (hh > 0.04) {
      float dith = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (uCutK.x > 0.0 && hh > mix(6.0, uCutK.y, uCutK.x)) {
        vec2 v = vWorld.xz - uCut.xy;
        float l = length(v);
        if (l > 0.35 && dot(v, uCut.zw) > uCutK.z * l) discard;
      }
      if (uCutK.w > 0.0 && dith > uCutK.w) discard;
      for (int i = 0; i < 4; i++) {
        if (i >= uNumSee) break;
        vec4 sp = uSee[i];
        if (gl_FragCoord.z < sp.w && distance(gl_FragCoord.xy, sp.xy) < sp.z && dith > uSeeKeep) discard;
      }
    }
  }
  vec3 c = uFlat.a > 0.0 ? uFlat.rgb : mix(vCol, uTint.rgb, uTint.a);
  if (uShadowOn.x > 0.0 && vLitFace > 0.5 && uFlat.a <= 0.0) {
    float lit = 0.0;
    vec3 s = vShadow;
    if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) {
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)
        lit += texture(uShadow, vec3(s.xy + vec2(float(x), float(y)) * uShadowOn.y, s.z - uShadowOn.z));
      lit /= 9.0;
    } else lit = 1.0;
    c = mix(c, vShade, (1.0 - lit) * uShadowOn.x);
  }
  if (uNight.a > 0.0) {
    float lit = 0.0, glow = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uNumLights) break;
      float r = uLights[i].z;
      float dd = length(vWorld.xz - uLights[i].xy);
      lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
      glow = max(glow, 1.0 - smoothstep(0.0, r * 0.9, dd));
    }
    c = mix(c, uNight.rgb, uNight.a * (1.0 - lit));
    c = mix(c, uLightCol.rgb, uLightCol.a * glow * glow); // static warm pool, no flicker
  }
  float depth = dot(vWorld, uFogPlane.xyz) + uFogPlane.w;
  float f = clamp((depth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0) * uFog.a;
  c = mix(c, uFog.rgb, f);
  c = min(c * uBright, vec3(uMaxPix));
  outColor = vec4(c, uAlpha);
}`;

// ---------------------------------------------------------------- units: anime toon shading + 2-bone skinning
// Bones: NBONES per instance, 3 texels (rows of a 3x4 affine) each, then tint (hit flash) / team colour + alpha /
// (outline px, face expression u-offset). Vertex: smooth normal, own ramp (hair gradients), 2 bones + weight, uv + kind.
// Toon: 3 soft bands (smoothstep edge uToon.x) from the ramp, shadow hue-shifted (uShadeHue), rim light, hair
// highlight ring, canvas atlases: faces (uFace, kind 9, per-instance expression column) and materials (uMatTex, kinds 1-5).
export const NBONES = 23;
export const BONE_TEX_W = NBONES * 3 + 3;
const SKIN_VS = (depth) => `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aS;
layout(location=3) in vec3 aB;
layout(location=4) in vec3 aL;
layout(location=5) in vec2 aX;
layout(location=6) in vec3 aBone;
layout(location=7) in vec3 aUV;
uniform highp sampler2D uBones;
uniform int uBase;
uniform int uMode; // 0 body, 1 flat team colour (x-ray), 2 outline hull
uniform float uFlatMul;
uniform float uXAlpha;
uniform float uPxM; // metres per screen pixel (outline thickness)
uniform mat4 uVP;
uniform mat4 uShadowVP;
flat out vec4 vTintI;
flat out vec4 vFlatI;
flat out float vAlphaI;
out vec3 vN;
out vec3 vWorld;
out vec3 vShadow;
out vec3 vS;
out vec3 vB;
out vec3 vL;
out vec2 vAX;
out vec3 vUV;
out vec3 vBP;
out vec3 vBN;
vec4 bx(int row, int k) { return texelFetch(uBones, ivec2(k, row), 0); }
void main() {
  int row = uBase + gl_InstanceID;
  int b0 = int(aBone.x + 0.5) * 3, b1 = int(aBone.y + 0.5) * 3;
  float w = aBone.z;
  vec4 r0 = bx(row, b0), r1 = bx(row, b0 + 1), r2 = bx(row, b0 + 2);
  if (w > 0.0) { r0 = mix(r0, bx(row, b1), w); r1 = mix(r1, bx(row, b1 + 1), w); r2 = mix(r2, bx(row, b1 + 2), w); }
  vec4 ex = bx(row, ${NBONES * 3 + 2});
  float sc = length(r0.xyz);
  vec3 p = aPos + (uMode == 2 ? aNrm * (ex.x * uPxM / sc) : vec3(0.0));
  vec4 lp = vec4(p, 1.0), ln = vec4(aNrm, 0.0);
  vec4 wp = vec4(dot(r0, lp), dot(r1, lp), dot(r2, lp), 1.0);
  vec3 n = normalize(vec3(dot(r0, ln), dot(r1, ln), dot(r2, ln)));
  vec4 tm = bx(row, ${NBONES * 3 + 1});
  vTintI = bx(row, ${NBONES * 3});
  vFlatI = uMode >= 1 ? vec4(tm.rgb * uFlatMul, 1.0) : vec4(0.0);
  vAlphaI = uMode == 1 ? uXAlpha : tm.a;
  vWorld = wp.xyz;
  gl_Position = uVP * wp;
${depth ? '' : `  vec4 sp = uShadowVP * wp;
  vShadow = sp.xyz * 0.5 + 0.5;
  vN = n; vS = aS; vB = aB; vL = aL; vAX = aX;
  vUV = vec3(aUV.xy + vec2(aUV.z > 8.5 ? ex.y : 0.0, 0.0), aUV.z);
  vBP = aPos; vBN = aNrm;`}
}`;
const SKIN_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
flat in vec4 vTintI;
flat in vec4 vFlatI;
flat in float vAlphaI;
in vec3 vN;
in vec3 vWorld;
in vec3 vShadow;
in vec3 vS;
in vec3 vB;
in vec3 vL;
in vec2 vAX;
in vec3 vUV;
in vec3 vBP;
in vec3 vBN;
uniform vec3 uLight;
uniform vec2 uSteps;
uniform float uAo;
uniform vec4 uToon;     // soft edge, rim strength, shadow hue amount, outline darkness
uniform vec3 uShadeHue; // palette colour the shadows lean to
uniform vec3 uRimCol;
uniform vec3 uRustCol;
uniform vec3 uView;     // camera forward (towards the scene)
uniform int uMode;
uniform vec4 uFogPlane;
uniform vec4 uFog;
uniform vec2 uFogRange;
uniform vec4 uNight;
uniform vec3 uLights[8];
uniform vec4 uLightCol;
uniform int uNumLights;
uniform float uBright;
uniform float uMaxPix;
uniform sampler2DShadow uShadow;
uniform vec3 uShadowOn;
uniform sampler2D uFace;
uniform sampler2D uMatTex;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 c;
  if (uMode == 1) c = vFlatI.rgb;
  else {
    float d = dot(n, uLight), e = uToon.x;
    float t1 = smoothstep(uSteps.y - e, uSteps.y + e, d), t2 = smoothstep(uSteps.x - e, uSteps.x + e, d);
    vec3 shade = mix(vS, uShadeHue, uToon.z);
    c = mix(shade, vB, t1);
    c = mix(c, vL, t2);
    int kind = int(vUV.z + 0.5);
    if (uMode == 2) {
      c = mix(vS * (1.0 - uToon.w), vFlatI.rgb, 0.3);
    } else if (vAX.y > 0.5) {
      c = vB;
    } else {
      c = mix(c, shade, clamp(vAX.x * uAo, 0.0, 1.0));
      if (kind == 9) {
        vec4 tc = texture(uFace, vUV.xy);
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
        float ring = (1.0 - smoothstep(0.04, 0.17, abs(n.y - 0.6))) * smoothstep(-0.25, 0.3, d);
        c = mix(c, min(vL * 1.18, vec3(1.0)), ring * 0.75);
      }
      if (uShadowOn.x > 0.0 && d > uSteps.y - e) {
        float lit = 0.0;
        vec3 s = vShadow;
        if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) {
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)
            lit += texture(uShadow, vec3(s.xy + vec2(float(x), float(y)) * uShadowOn.y, s.z - uShadowOn.z));
          lit /= 9.0;
        } else lit = 1.0;
        c = mix(c, shade, (1.0 - lit) * uShadowOn.x * smoothstep(uSteps.y - e, uSteps.y + e, d));
      }
      float fr = 1.0 - clamp(dot(n, -uView), 0.0, 1.0);
      float rim = smoothstep(0.52, 0.86, fr) * (0.35 + 0.65 * smoothstep(-0.35, 0.35, d));
      c = mix(c, mix(vL, uRimCol, 0.55), rim * uToon.y);
      c = mix(c, vTintI.rgb, vTintI.a);
    }
  }
  if (uNight.a > 0.0) {
    float lit = 0.0, glow = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uNumLights) break;
      float r = uLights[i].z;
      float dd = length(vWorld.xz - uLights[i].xy);
      lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
      glow = max(glow, 1.0 - smoothstep(0.0, r * 0.9, dd));
    }
    c = mix(c, uNight.rgb, uNight.a * (1.0 - lit));
    c = mix(c, uLightCol.rgb, uLightCol.a * glow * glow);
  }
  float depth = dot(vWorld, uFogPlane.xyz) + uFogPlane.w;
  float f = clamp((depth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0) * uFog.a;
  c = mix(c, uFog.rgb, f);
  c = min(c * uBright, vec3(uMaxPix));
  outColor = vec4(c, vAlphaI);
}`;
const DEPTH_FS = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }`;
export const worldProgram = (gl) => makeProgram(gl, WORLD_VS(false), WORLD_FS());
/** Units: instanced, rigid skinning from the bone texture (gfx/anim.js layout). */
export const skinProgram = (gl) => makeProgram(gl, SKIN_VS(false), SKIN_FS);
/** Shadow pass (depth only): static world / skinned units. */
export const depthProgram = (gl, skin) => makeProgram(gl, skin ? SKIN_VS(true) : WORLD_VS(true), DEPTH_FS);

// Particles / projectiles: one low-poly mesh drawn instanced (pos+scale, rgba, stretch xyz + yaw per instance).
const PART_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iPos;
layout(location=3) in vec4 iCol;
layout(location=4) in vec4 iShape;
uniform mat4 uVP;
out vec4 vCol;
void main() {
  float c = cos(iShape.w), s = sin(iShape.w);
  vec3 p = aPos * iShape.xyz * iPos.w;
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  gl_Position = uVP * vec4(p + iPos.xyz, 1.0);
  vec3 n = vec3(c * aNrm.x + s * aNrm.z, aNrm.y, -s * aNrm.x + c * aNrm.z);
  vCol = vec4(iCol.rgb * (0.86 + 0.14 * n.y), iCol.a);
}`;
export const particleProgram = (gl) => makeProgram(gl, PART_VS, OVER_FS_SRC);

// Highlights / rings / surfaces: plain coloured translucent triangles (pos3 + rgba4).
const OVER_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uVP;
out vec4 vCol;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vCol = aCol; }`;
const OVER_FS_SRC = `#version 300 es
precision mediump float;
in vec4 vCol;
uniform float uBright;
uniform float uMaxPix;
out vec4 outColor;
void main() { outColor = vec4(min(vCol.rgb * uBright, vec3(uMaxPix)), vCol.a); }`;
export const overlayProgram = (gl) => makeProgram(gl, OVER_VS, OVER_FS_SRC);
