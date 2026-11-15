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
const SKIN_HEAD = `
layout(location=6) in float aBone;
uniform highp sampler2D uBones;
uniform int uBase;
uniform int uMode; // 0 body (instance tint + alpha), 1 flat team colour (outline / x-ray)
uniform float uFlatMul;
uniform float uXAlpha;
flat out vec4 vTintI;
flat out vec4 vFlatI;
flat out float vAlphaI;
vec4 bx(int row, int k) { return texelFetch(uBones, ivec2(k, row), 0); }`;
const WORLD_VS = (skin, depth) => `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aS;
layout(location=3) in vec3 aB;
layout(location=4) in vec3 aL;
layout(location=5) in vec2 aX;
${skin ? SKIN_HEAD : 'uniform mat4 uModel;'}
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
void main() {
${skin ? `  int row = uBase + gl_InstanceID, b = int(aBone + 0.5) * 3;
  vec4 r0 = bx(row, b), r1 = bx(row, b + 1), r2 = bx(row, b + 2);
  vec4 ex = bx(row, 35);
  vec3 p = aPos + aNrm * (uGrow + (uMode == 1 && uGrow > 0.0 ? ex.x : 0.0));
  vec4 lp = vec4(p, 1.0), ln = vec4(aNrm, 0.0);
  vec4 wp = vec4(dot(r0, lp), dot(r1, lp), dot(r2, lp), 1.0);
  vec3 n = normalize(vec3(dot(r0, ln), dot(r1, ln), dot(r2, ln)));
  vec4 tm = bx(row, 34);
  vTintI = bx(row, 33);
  vFlatI = uMode == 1 ? vec4(tm.rgb * uFlatMul, 1.0) : vec4(0.0);
  vAlphaI = uMode == 1 ? uXAlpha : tm.a;` : `  vec3 n = normalize(mat3(uModel) * aNrm);
  vec4 wp = uModel * vec4(aPos + aNrm * uGrow, 1.0);`}
  vWorld = wp.xyz;
  gl_Position = uVP * wp;
${depth ? '' : `  vec4 sp = uShadowVP * wp;
  vShadow = sp.xyz * 0.5 + 0.5;
  float d = dot(n, uLight);
  vec3 c = aX.y > 0.5 ? aB : (d > uSteps.x ? aL : (d > uSteps.y ? aB : aS));
  vLitFace = aX.y > 0.5 || d <= uSteps.y ? 0.0 : 1.0;
  vShade = aS;
  vCol = mix(c, aS, clamp(aX.x * uAo, 0.0, 1.0));`}
}`;
const WORLD_FS = (skin) => `#version 300 es
precision highp float;
precision highp sampler2DShadow;
flat in vec3 vCol;
flat in vec3 vShade;
flat in float vLitFace;
in vec3 vWorld;
in vec3 vShadow;
${skin ? 'flat in vec4 vTintI;\nflat in vec4 vFlatI;\nflat in float vAlphaI;' : 'uniform vec4 uTint;\nuniform vec4 uFlat;\nuniform float uAlpha;'}
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
${skin ? '  vec4 uTint = vTintI, uFlat = vFlatI; float uAlpha = vAlphaI;' : ''}
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
const DEPTH_FS = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }`;
export const worldProgram = (gl) => makeProgram(gl, WORLD_VS(false, false), WORLD_FS(false));
/** Units: instanced, rigid skinning from the bone texture (gfx/anim.js layout). */
export const skinProgram = (gl) => makeProgram(gl, WORLD_VS(true, false), WORLD_FS(true));
/** Shadow pass (depth only): static world / skinned units. */
export const depthProgram = (gl, skin) => makeProgram(gl, WORLD_VS(skin, true), DEPTH_FS);
/** Bone texture width: 11 bones x 3 texels + tint + team/alpha + grow. */
export const BONE_TEX_W = 36;

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
