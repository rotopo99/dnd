// WebGL2 context, shader programs, context loss (docs/specs/3d.md §1). No game logic here.
//   hasWebGL2()                      -> bool (probe once)
//   softwareGL()                     -> true on SwiftShader / llvmpipe (auto mode picks 2D there)
//   createGL(canvas, {onLost, onRestored}) -> WebGL2RenderingContext | null
//   makeProgram(gl, vs, fs)          -> { prog, u: {name: location} } (throws on compile / link error)
//   worldProgram(gl), overlayProgram(gl) — the two programs of the renderer
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
// tone to the shadow colour, linear depth fog, night tint with static light holes, brightness, 90 % pixel cap.
const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aS;
layout(location=3) in vec3 aB;
layout(location=4) in vec3 aL;
layout(location=5) in vec2 aX;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uLight;
uniform vec2 uSteps;
uniform float uAo;
uniform float uGrow;
flat out vec3 vCol;
out vec3 vWorld;
void main() {
  vec3 n = normalize(mat3(uModel) * aNrm);
  vec4 wp = uModel * vec4(aPos + aNrm * uGrow, 1.0);
  vWorld = wp.xyz;
  gl_Position = uVP * wp;
  float d = dot(n, uLight);
  vec3 c = aX.y > 0.5 ? aB : (d > uSteps.x ? aL : (d > uSteps.y ? aB : aS));
  vCol = mix(c, aS, clamp(aX.x * uAo, 0.0, 1.0));
}`;
const WORLD_FS = `#version 300 es
precision mediump float;
flat in vec3 vCol;
in vec3 vWorld;
uniform vec4 uFogPlane;
uniform vec4 uFog;
uniform vec2 uFogRange;
uniform vec4 uNight;
uniform vec3 uLights[8];
uniform int uNumLights;
uniform vec4 uTint;
uniform vec4 uFlat;
uniform float uAlpha;
uniform float uBright;
uniform float uMaxPix;
out vec4 outColor;
void main() {
  vec3 c = uFlat.a > 0.0 ? uFlat.rgb : mix(vCol, uTint.rgb, uTint.a);
  if (uNight.a > 0.0) {
    float lit = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uNumLights) break;
      float r = uLights[i].z;
      float dd = length(vWorld.xz - uLights[i].xy);
      lit = max(lit, 1.0 - smoothstep(r * 0.6, r, dd));
    }
    c = mix(c, uNight.rgb, uNight.a * (1.0 - lit));
  }
  float depth = dot(vWorld, uFogPlane.xyz) + uFogPlane.w;
  float f = clamp((depth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0) * uFog.a;
  c = mix(c, uFog.rgb, f);
  c = min(c * uBright, vec3(uMaxPix));
  outColor = vec4(c, uAlpha);
}`;
export const worldProgram = (gl) => makeProgram(gl, WORLD_VS, WORLD_FS);

// Highlights / rings / surfaces: plain coloured translucent triangles (pos3 + rgba4).
const OVER_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uVP;
out vec4 vCol;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vCol = aCol; }`;
const OVER_FS = `#version 300 es
precision mediump float;
in vec4 vCol;
uniform float uBright;
uniform float uMaxPix;
out vec4 outColor;
void main() { outColor = vec4(min(vCol.rgb * uBright, vec3(uMaxPix)), vCol.a); }`;
export const overlayProgram = (gl) => makeProgram(gl, OVER_VS, OVER_FS);
