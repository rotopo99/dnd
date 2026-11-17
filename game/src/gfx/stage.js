// Live model stage: the real skin shader (toon / rim / outline / face atlas / materials) into an own offscreen WebGL2 canvas,
// transparent background, orthographic orbit camera. Used by the appearance editor (scenes/create-look.js, full body, live
// animation with spring bones) and by the hero portraits (ui/hero-avatar.js, face close-up). The game itself uses gfx/scene3d.js.
//   createStage(w, h)                 -> stage | null (no WebGL2)
//   stage.draw(T, st, o)              -> { sx, sy, ppm } projection of the model origin; T — unitTemplate, st — animState
//     o { vx, vy, vw, vh   viewport in canvas px (top-left origin; default the whole canvas), yaw, pitch (deg), zoom, focus (m, world y),
//         now (s), walk (m/s, in place), emo, blink, physics, reduceMotion, modelYaw, clear }
//   stage.canvas / stage.resize(w, h) / stage.lost() / stage.dispose()
import { GFX } from '../data/gfx.js';
import { skinProgram, NBONES, BONE_TEX_W } from './gl.js';
import { uploadMesh, freeMesh, keyRGB } from './mesh.js';
import { poseBones } from './anim.js';
import { gpuAtlas, faceCol, FACE_COLS } from './faces.js';

const DEG = Math.PI / 180;

export function createStage(w = 256, h = 256) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  let gl = null;
  try { gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true, stencil: false, preserveDrawingBuffer: false }); } catch { gl = null; }
  if (!gl) return null;
  let K;
  try { K = skinProgram(gl); } catch { return null; }
  const U = K.u, X = { gen: 1 };
  // shadow dummy (sampler2DShadow must be backed by a depth texture)
  const sh = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sh);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const bt = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bt);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BONE_TEX_W, 1, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.enable(gl.SCISSOR_TEST);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  const T2 = GFX.toon, sc = keyRGB(T2.shadeHue), rc = keyRGB(T2.rim), ru = keyRGB(T2.rust);
  const row = new Float32Array(BONE_TEX_W * 4);
  const meshes = new Map(); // template -> gpu mesh (LRU by insertion)
  const meshOf = (T) => {
    let m = meshes.get(T);
    if (m) { meshes.delete(T); meshes.set(T, m); return m; }
    m = uploadMesh(gl, T.mb);
    meshes.set(T, m);
    while (meshes.size > 12) { const [k, v] = meshes.entries().next().value; meshes.delete(k); if (v) freeMesh(gl, v); }
    return m;
  };

  const stage = {
    canvas, gl,
    resize(nw, nh) { if (canvas.width !== nw || canvas.height !== nh) { canvas.width = nw; canvas.height = nh; } },
    lost: () => gl.isContextLost(),
    /** Drop a template's GPU mesh (editor: every change builds a new template). */
    release(T) { const m = meshes.get(T); if (m) { freeMesh(gl, m); } meshes.delete(T); },
    dispose() { for (const m of meshes.values()) if (m) freeMesh(gl, m); meshes.clear(); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    draw(T, st, o = {}) {
      const cw = canvas.width, ch = canvas.height;
      const vw = o.vw ?? cw, vh = o.vh ?? ch, vx = o.vx ?? 0, vy = o.vy ?? 0;
      const yaw = (o.yaw ?? 35) * DEG, pitch = (o.pitch ?? 12) * DEG;
      const f = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const Ld = GFX.light.dir, lv = [r[0] * Ld[0] - f[0] * Ld[2], Ld[1], r[2] * Ld[0] - f[2] * Ld[2]], ll = Math.hypot(...lv);
      gl.viewport(vx, ch - vy - vh, vw, vh);
      gl.scissor(vx, ch - vy - vh, vw, vh);
      if (o.clear !== false) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
      // pose
      const now = o.now ?? 0, moving = (o.walk || 0) > 0;
      const flags = { walking: moving, reduceMotion: !!o.reduceMotion, physics: o.physics ?? 1 };
      const my = o.modelYaw ?? 0;
      const dt = Math.min(0.05, Math.max(0.001, o.dt ?? 1 / 60));
      if (moving) { // walk in place: the springs see the velocity along the facing
        const spd = o.walk;
        st.spX = -Math.sin(my) * spd * dt; st.spZ = -Math.cos(my) * spd * dt; st.spT = now - dt; st.spY = 0; st.spYaw = my;
      }
      poseBones(T, st, { dead: false }, now, { x: 0, y: 0, z: 0, yaw: my }, row, 0, flags);
      const emo = o.emo || 'neutral';
      row.set([1, 1, 1, 0, 0.44, 0.63, 0.95, 1, 1.5, T.anime ? faceCol(emo, !!o.blink) / FACE_COLS : 0, 0, 0], NBONES * 12);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BONE_TEX_W, 1, gl.RGBA, gl.FLOAT, row);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sh);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'face'));
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'mat'));
      gl.activeTexture(gl.TEXTURE0);
      // ortho view-projection: the view is `H` metres tall, centred on the model axis at height `focus`
      const top = T.top * T.scale, zoom = o.zoom || 1, H = (top + 0.12) / zoom, hhh = H * 0.5, hw = hhh * (vw / vh), ctr = [0, o.focus ?? top * 0.5, 0];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const VP = new Float32Array([r[0] / hw, up[0] / hhh, f[0] / 20, 0, r[1] / hw, up[1] / hhh, f[1] / 20, 0, r[2] / hw, up[2] / hhh, f[2] / 20, 0,
        -dot(r, ctr) / hw, -dot(up, ctr) / hhh, -dot(f, ctr) / 20, 1]);
      gl.useProgram(K.prog);
      gl.uniformMatrix4fv(U.uVP, false, VP);
      gl.uniformMatrix4fv(U.uShadowVP, false, VP);
      gl.uniform3f(U.uLight, lv[0] / ll, lv[1] / ll, lv[2] / ll);
      gl.uniform2f(U.uSteps, GFX.light.steps[0], GFX.light.steps[1]);
      gl.uniform1f(U.uAo, GFX.light.ao);
      gl.uniform4f(U.uToon, T2.soft, T2.rimK, T2.hue, T2.outline);
      gl.uniform3f(U.uShadeHue, sc[0], sc[1], sc[2]); gl.uniform3f(U.uRimCol, rc[0], rc[1], rc[2]); gl.uniform3f(U.uRustCol, ru[0], ru[1], ru[2]);
      gl.uniform3f(U.uView, f[0], f[1], f[2]);
      gl.uniform1f(U.uPxM, (hhh * 2) / vh);
      gl.uniform1i(U.uFace, 2); gl.uniform1i(U.uMatTex, 3); gl.uniform1i(U.uShadow, 1); gl.uniform1i(U.uBones, 0);
      gl.uniform3f(U.uShadowOn, 0, 1, 0);
      gl.uniform4f(U.uFogPlane, 0, 0, 0, 0); gl.uniform4f(U.uFog, 0, 0, 0, 0); gl.uniform2f(U.uFogRange, 0, 1);
      gl.uniform4f(U.uNight, 0, 0, 0, 0); gl.uniform1i(U.uNumLights, 0);
      gl.uniform1f(U.uBright, 1); gl.uniform1f(U.uMaxPix, GFX.maxPixel);
      gl.uniform1i(U.uBase, 0); gl.uniform1f(U.uXAlpha, 1); gl.uniform1f(U.uFlatMul, 0.8);
      const m = meshOf(T);
      if (m) {
        gl.bindVertexArray(m.vao);
        gl.cullFace(gl.BACK); gl.uniform1i(U.uMode, 0);
        gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, 1);
        gl.cullFace(gl.FRONT); gl.uniform1i(U.uMode, 2);
        gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, 1);
        gl.cullFace(gl.BACK);
      }
      // projection of the origin (feet) into canvas px: for the floor and the shadow drawn by the caller
      const o0 = [0 - ctr[0], 0 - ctr[1], 0 - ctr[2]];
      return { sx: vx + vw / 2 + (dot(o0, r) / hw) * (vw / 2), sy: vy + vh / 2 - (dot(o0, up) / hhh) * (vh / 2), ppm: vh / H, pitch };
    },
  };
  return stage;
}

// shared stages by name (the editor and the portraits each keep one; a lost context is replaced)
const stages = new Map();
export function getStage(name, w, h) {
  let s = stages.get(name);
  if (s && s.lost()) { stages.delete(name); s = null; }
  if (s === undefined || s === null) {
    if (stages.get(name) === false) return null;
    s = createStage(w, h);
    stages.set(name, s || false);
    if (!s) return null;
  }
  if (!s) return null;
  s.resize(w, h);
  return s;
}
