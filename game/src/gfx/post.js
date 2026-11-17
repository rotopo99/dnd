// Post-processing of the 3D layer (docs/research/premium-look.md items 4, 7, 8; STYLE «Пост-эффекты»): the scene is drawn
// into an offscreen target with two colour buffers — 0: the image, 1: emissive only (glow vertices of the world and units,
// glowing particles; gfx/gl.js `outGlow`) — then composited onto the canvas:
//   bloom of the emissive buffer only (soft threshold, 3 mips 1/2..1/8, additive) -> per-biome colour balance (<= 3 %)
//   -> soft shoulder tonemap (identity below the knee, so palette colours stay put; only bloom highlights roll off)
//   -> vignette over the map area -> light static grain (no animated noise: no flicker).
// MSAA on hardware (multisampled renderbuffers, resolved by blits); software GL — no MSAA, 2 bloom mips.
//   createPost(gl, {soft})   -> post | null (no float-free MRT support)
//   post.begin(w, h, bg)     bind the scene target (w x h drawing-buffer px), clear: colour bg, glow 0, depth / stencil
//   post.end(o)              resolve + bloom + composite to the canvas; o {area: [x, y, w, h] GL px bottom-left, bal: [r, g, b]}
//   post.dispose()
import { GFX } from '../data/gfx.js';
import { makeProgram } from './gl.js';

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
// 4 bilinear taps (= 16 texels) box down-sample; the first level applies the soft threshold on the max channel
const DOWN_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel; // 1 / source size
uniform vec2 uInv;   // 1 / target size
uniform vec2 uThr;   // threshold, knee (x < 0 — none)
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 c = texture(uSrc, uv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uSrc, uv + uTexel * vec2(1.0, -1.0)).rgb
         + texture(uSrc, uv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uSrc, uv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (uThr.x >= 0.0) c *= smoothstep(uThr.x - uThr.y, uThr.x + uThr.y, max(c.r, max(c.g, c.b)));
  o = vec4(c, 1.0);
}`;
const COMP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform sampler2D uB3;
uniform vec2 uInv;     // 1 / canvas size
uniform vec4 uArea;    // map area: centre xy, half size xy (GL px)
uniform vec4 uBloom;   // strength, weights of mips 1..3
uniform vec3 uBal;     // per-biome colour balance (multipliers)
uniform vec4 uTone;    // knee, vignette strength, vignette start, grain amplitude
out vec4 o;
float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 c = texture(uScene, uv).rgb;
  if (uBloom.x > 0.0) c += uBloom.x * (texture(uB1, uv).rgb * uBloom.y + texture(uB2, uv).rgb * uBloom.z + texture(uB3, uv).rgb * uBloom.w);
  c *= uBal;
  float m = max(c.r, max(c.g, c.b)), k = uTone.x;
  if (m > k) c *= (k + (1.0 - k) * (1.0 - exp(-(m - k) / (1.0 - k)))) / m; // shoulder: hue kept, <= 1
  vec2 q = (gl_FragCoord.xy - uArea.xy) / uArea.zw;
  c *= 1.0 - uTone.y * smoothstep(uTone.z, 1.45, length(q * vec2(1.0, 0.85)));
  c += (hash(gl_FragCoord.xy) - 0.5) * uTone.w;
  o = vec4(c, 1.0);
}`;

function tex(gl, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function fbo(gl, attach) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  attach.forEach((a, i) => {
    if (a.rb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, a.at ?? gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, a.rb);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, a.at ?? gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, a.tex, 0);
  });
  return f;
}
function rbuf(gl, samples, fmt, w, h) {
  const r = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, r);
  if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
  else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h);
  return r;
}

export function createPost(gl, { soft = false } = {}) {
  if ((gl.getParameter(gl.MAX_DRAW_BUFFERS) || 1) < 2) return null;
  const PO = GFX.post;
  const D = makeProgram(gl, VS, DOWN_FS), K = makeProgram(gl, VS, COMP_FS);
  const vao = gl.createVertexArray();
  const samples = soft ? 0 : Math.min(PO.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const mips = soft ? PO.softMips : 3;
  let T = null; // targets of the current size
  const C0 = gl.COLOR_ATTACHMENT0, C1 = gl.COLOR_ATTACHMENT1;

  function free() {
    if (!T) return;
    for (const f of T.fbs) gl.deleteFramebuffer(f);
    for (const t of T.texs) gl.deleteTexture(t);
    for (const r of T.rbs) gl.deleteRenderbuffer(r);
    T = null;
  }
  function ensure(w, h) {
    if (T && T.w === w && T.h === h) return;
    free();
    T = { w, h, fbs: [], texs: [], rbs: [], mip: [] };
    const scene = tex(gl, w, h), glow = tex(gl, w, h);
    T.texs.push(scene, glow);
    T.scene = scene; T.glow = glow;
    const ds = rbuf(gl, samples, gl.DEPTH24_STENCIL8, w, h);
    T.rbs.push(ds);
    if (samples > 1) {
      const c0 = rbuf(gl, samples, gl.RGBA8, w, h), c1 = rbuf(gl, samples, gl.RGBA8, w, h);
      T.rbs.push(c0, c1);
      T.draw = fbo(gl, [{ rb: c0 }, { rb: c1 }, { rb: ds, at: gl.DEPTH_STENCIL_ATTACHMENT }]);
      T.r0 = fbo(gl, [{ tex: scene }]); T.r1 = fbo(gl, [{ tex: glow }]);
      T.fbs.push(T.draw, T.r0, T.r1);
    } else {
      T.draw = fbo(gl, [{ tex: scene }, { tex: glow }, { rb: ds, at: gl.DEPTH_STENCIL_ATTACHMENT }]);
      T.fbs.push(T.draw);
    }
    let mw = w, mh = h;
    for (let i = 0; i < 3; i++) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      const t = tex(gl, mw, mh);
      const f = fbo(gl, [{ tex: t }]);
      T.texs.push(t); T.fbs.push(f);
      T.mip.push({ t, f, w: mw, h: mh });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    samples,
    begin(w, h, bg) {
      ensure(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.draw);
      gl.drawBuffers([C0, C1]);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.SCISSOR_TEST);
      gl.depthMask(true);
      gl.stencilMask(0xff);
      gl.colorMask(true, true, true, true);
      gl.clearBufferfv(gl.COLOR, 0, [bg[0], bg[1], bg[2], 1]);
      gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
      gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    },
    end({ area, bal = [1, 1, 1] }) {
      const { w, h } = T;
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      if (samples > 1) { // resolve the multisampled buffers into the textures
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.draw);
        gl.readBuffer(C0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.r0);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.readBuffer(C1);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.r1);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.readBuffer(C0);
      }
      gl.bindVertexArray(vao);
      // bloom: glow -> mip 1 (threshold) -> mip 2 -> mip 3
      gl.useProgram(D.prog);
      gl.uniform1i(D.u.uSrc, 0);
      gl.activeTexture(gl.TEXTURE0);
      let src = T.glow, sw = w, sh = h;
      for (let i = 0; i < mips; i++) {
        const M = T.mip[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, M.f);
        gl.viewport(0, 0, M.w, M.h);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform2f(D.u.uTexel, 1 / sw, 1 / sh);
        gl.uniform2f(D.u.uInv, 1 / M.w, 1 / M.h);
        gl.uniform2f(D.u.uThr, i === 0 ? PO.threshold : -1, PO.knee);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = M.t; sw = M.w; sh = M.h;
      }
      // composite onto the canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(K.prog);
      const U = K.u;
      [T.scene, T.mip[0].t, T.mip[1].t, T.mip[2].t].forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
      gl.uniform1i(U.uScene, 0); gl.uniform1i(U.uB1, 1); gl.uniform1i(U.uB2, 2); gl.uniform1i(U.uB3, 3);
      gl.uniform2f(U.uInv, 1 / w, 1 / h);
      gl.uniform4f(U.uArea, area[0] + area[2] / 2, area[1] + area[3] / 2, Math.max(1, area[2] / 2), Math.max(1, area[3] / 2));
      const wts = PO.mipW;
      gl.uniform4f(U.uBloom, PO.bloom, wts[0], mips > 1 ? wts[1] : 0, mips > 2 ? wts[2] : 0);
      gl.uniform3f(U.uBal, bal[0], bal[1], bal[2]);
      gl.uniform4f(U.uTone, PO.knee2, PO.vignette, PO.vignetteStart, PO.grain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.depthMask(true);
      gl.bindVertexArray(null);
    },
    dispose() { free(); gl.deleteVertexArray(vao); gl.deleteProgram(D.prog); gl.deleteProgram(K.prog); },
  };
}
