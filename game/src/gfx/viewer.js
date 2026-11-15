// Model viewer: renders unit templates with the real skin shaders into a sheet (tools/out/models-sheet.mjs). Same programs,
// toon / rim / outline / face atlas as the battle, no world. Not used by the game itself.
//   renderSheet(cells, {cols, cw, ch, yaw, pitch, emo, time, physics}) -> canvas (2D, with labels)
//   cells: [{label, u, lod?, zoom?, emo?, pose?}]  — u is a unit-like object (see units3d unitTemplate)
import { GFX } from '../data/gfx.js';
import { createGL, skinProgram, NBONES, BONE_TEX_W } from './gl.js';
import { uploadMesh, keyRGB } from './mesh.js';
import { unitTemplate } from './units3d.js';
import { poseBones, animState } from './anim.js';
import { gpuAtlas, faceCol, FACE_COLS } from './faces.js';

const DEG = Math.PI / 180;
export function renderSheet(cells, o = {}) {
  const cols = o.cols || 6, cw = o.cw || 220, ch = o.ch || 300, rows = Math.ceil(cells.length / cols);
  const gc = document.createElement('canvas');
  gc.width = cw * cols; gc.height = ch * rows;
  const gl = createGL(gc);
  if (!gl) throw new Error('no webgl2');
  const K = skinProgram(gl), U = K.u, X = { gen: 1 };
  const yaw = (o.yaw ?? 35) * DEG, pitch = (o.pitch ?? 20) * DEG;
  // camera basis (as gfx/camera.js)
  const f = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const Ld = GFX.light.dir, lv = [r[0] * Ld[0] - f[0] * Ld[2], Ld[1], r[2] * Ld[0] - f[2] * Ld[2]], ll = Math.hypot(...lv);
  // shadow dummy (sampler2DShadow must be backed by a depth texture)
  const sh = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sh);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const tpls = cells.map((c) => unitTemplate(c.u, { lod: !!c.lod })); // builds the face rows before the atlas is uploaded
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'face'));
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'mat'));
  const bt = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bt);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BONE_TEX_W, 1, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.clearColor(0.085, 0.094, 0.11, 1);
  gl.enable(gl.SCISSOR_TEST);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  const T2 = GFX.toon, sc = keyRGB(T2.shadeHue), rc = keyRGB(T2.rim), ru = keyRGB(T2.rust);
  const stats = [];
  const row = new Float32Array(BONE_TEX_W * 4);
  cells.forEach((c, n) => {
    const T = tpls[n];
    const m = uploadMesh(gl, T.mb);
    const cx = (n % cols) * cw, cy = Math.floor(n / cols) * ch;
    gl.viewport(cx, gc.height - cy - ch, cw, ch);
    gl.scissor(cx, gc.height - cy - ch, cw, ch);
    gl.clearColor(0.085, 0.094, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const st = animState({ anim: {} }, 'a' + n);
    st.seed = c.seed ?? ((n * 0.37) % 1);
    const now = c.time ?? 3;
    const flags = { walking: !!c.walk, reduceMotion: false, physics: o.physics ?? 1 };
    if (c.walk) st.walk = c.walk;
    // warm the springs: a few frames of idle / walk motion
    for (let k = 0; k < 40; k++) {
      poseBones(T, st, { dead: false }, now - 0.7 + k * 0.0175, { x: c.walk ? Math.sin(yaw) * k * 0.035 : 0, y: 0, z: c.walk ? Math.cos(yaw) * k * 0.035 : 0, yaw: c.walk ? yaw : (c.yaw ?? 0.5) }, row, 0, flags);
    }
    const emo = c.emo || 'neutral';
    row.set([1, 1, 1, 0, 0.44, 0.63, 0.95, 1, 1.5, T.anime ? faceCol(emo, !!c.blink) / FACE_COLS : 0, 0, 0], NBONES * 12);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BONE_TEX_W, 1, gl.RGBA, gl.FLOAT, row);
    const zoom = c.zoom || 1, top = T.top * T.scale, hh = (ch / cw) * 0.5, H = (top + 0.25) / zoom / 1.0;
    const hw = H * 0.5 * (cw / ch), hhh = H * 0.5, ctr = [0, (c.focus ?? top * 0.5), 0];
    // ortho view-projection (column-major): x = dot(p - c, r) / hw, y = dot(p - c, up) / hhh, z = dot(p - c, f) / 20
    const VP = new Float32Array([r[0] / hw, up[0] / hhh, f[0] / 20, 0, r[1] / hw, up[1] / hhh, f[1] / 20, 0, r[2] / hw, up[2] / hhh, f[2] / 20, 0,
      -(r[0] * ctr[0] + r[1] * ctr[1] + r[2] * ctr[2]) / hw, -(up[0] * ctr[0] + up[1] * ctr[1] + up[2] * ctr[2]) / hhh, -(f[0] * ctr[0] + f[1] * ctr[1] + f[2] * ctr[2]) / 20, 1]);
    gl.useProgram(K.prog);
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniformMatrix4fv(U.uShadowVP, false, VP);
    gl.uniform3f(U.uLight, lv[0] / ll, lv[1] / ll, lv[2] / ll);
    gl.uniform2f(U.uSteps, GFX.light.steps[0], GFX.light.steps[1]);
    gl.uniform1f(U.uAo, GFX.light.ao);
    gl.uniform4f(U.uToon, T2.soft, T2.rimK, T2.hue, T2.outline);
    gl.uniform3f(U.uShadeHue, sc[0], sc[1], sc[2]); gl.uniform3f(U.uRimCol, rc[0], rc[1], rc[2]); gl.uniform3f(U.uRustCol, ru[0], ru[1], ru[2]);
    gl.uniform3f(U.uView, f[0], f[1], f[2]);
    gl.uniform1f(U.uPxM, hhh * 2 / ch);
    gl.uniform1i(U.uFace, 2); gl.uniform1i(U.uMatTex, 3); gl.uniform1i(U.uShadow, 1); gl.uniform1i(U.uBones, 0);
    gl.uniform3f(U.uShadowOn, 0, 1, 0);
    gl.uniform4f(U.uFogPlane, 0, 0, 0, 0); gl.uniform4f(U.uFog, 0, 0, 0, 0); gl.uniform2f(U.uFogRange, 0, 1);
    gl.uniform4f(U.uNight, 0, 0, 0, 0); gl.uniform1i(U.uNumLights, 0);
    gl.uniform1f(U.uBright, 1); gl.uniform1f(U.uMaxPix, GFX.maxPixel);
    gl.uniform1i(U.uBase, 0); gl.uniform1f(U.uXAlpha, 1); gl.uniform1f(U.uFlatMul, 0.8);
    gl.bindVertexArray(m.vao);
    gl.cullFace(gl.BACK); gl.uniform1i(U.uMode, 0);
    gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, 1);
    gl.cullFace(gl.FRONT); gl.uniform1i(U.uMode, 2);
    gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, 1);
    gl.cullFace(gl.BACK);
    stats.push({ label: c.label, tris: T.mb.i.length / 3, type: T.type, anime: T.anime });
  });
  const out = document.createElement('canvas');
  out.width = gc.width; out.height = gc.height;
  const g = out.getContext('2d');
  g.drawImage(gc, 0, 0);
  g.font = '12px monospace'; g.fillStyle = '#b8c0cc';
  cells.forEach((c, n) => {
    const cx = (n % cols) * cw, cy = Math.floor(n / cols) * ch;
    g.fillText(`${c.label}`.slice(0, 30), cx + 6, cy + ch - 18);
    g.fillText(`${stats[n].tris | 0} tris`, cx + 6, cy + ch - 5);
  });
  return { canvas: out, stats };
}
