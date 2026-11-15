// Canvas atlases of the 3D units (docs/specs/3d.md, anime pass): faces and materials. No files: everything is drawn here.
//   faceRow(look, {f})             -> row of the face atlas (one row per unique face: race / gender / skin / eyes / brows / beard)
//   faceCol(emo, blink)            -> column of the expression (8 emotions x open / blink)
//   FACE_UV(row)                   -> {u0, u1, v0, v1} of the expression 0 of a row (the shader adds the column offset)
//   faceAtlas / matAtlas           -> { canvas, dirty } ; gpuAtlas(gl, X, which) uploads (+ mips) when dirty
// Faces: big eyes (iris gradient, two highlights, lashes), brows, nose stroke, mouth, blush; emotions change eyes / brows /
// mouth, the blink is the second column of each emotion. Palette colours only (shading comes from the toon shader).
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';

export const FACE_CELL = 64, FACE_COLS = 16, FACE_ROWS = 24;
export const FACE_EMOS = ['neutral', 'happy', 'angry', 'sad', 'scared', 'smug', 'surprised', 'cringe'];
export const faceCol = (emo, blink) => Math.max(0, FACE_EMOS.indexOf(emo)) * 2 + (blink ? 1 : 0);
// patch of the face on the head: horizontal half angle (rad) and vertical range of the head profile (0 chin .. 1 crown)
export const FACE_PATCH = { half: 1.0, t0: 0.03, t1: 0.86 };
const hex = (k) => PALETTE[PALETTE_KEYS.indexOf(k)] || '#d8a27a';
const SKIN = [['8', '9', 'p'], ['7', '8', '9'], ['6', '7', '8'], ['1', '6', '7'], ['1', '6', '6'], ['3', 'p', '5']];
const EYE = { brown: '8', blue: 'f', green: 'j', grey: '4', amber: 'a', red: 'c', cyan: 'h' };
const HAIRC = { black: '1', brown: '6', ginger: '7', blond: '8', grey: '3', white: '4', green: 'k', pink: 'o', cyan: 'i' };
export const skinKeys = (i) => SKIN[(i | 0) % 6] || SKIN[1];

const rows = new Map();
let nextRow = 0;
export const faceAtlas = { canvas: null, dirty: null, w: FACE_CELL * FACE_COLS, h: FACE_CELL * FACE_ROWS, rows };
const matCanvas = { canvas: null, dirty: true };
export const matAtlas = matCanvas;

function ensureCanvas() {
  if (faceAtlas.canvas || !globalThis.document) return faceAtlas.canvas;
  const c = document.createElement('canvas');
  c.width = faceAtlas.w; c.height = faceAtlas.h;
  faceAtlas.canvas = c;
  return c;
}

/** Row of the face for a look (race, gender, skin ...); draws all 16 expression cells once. */
export function faceRow(look, o = {}) {
  const l = look || {};
  const key = [l.race, l.gender, l.skin, l.eyes, l.hairColor, l.beard, (l.acc || []).join('+'), l.face?.w, l.face?.h, o.skin || '', o.eyes || ''].join('|');
  let r = rows.get(key);
  if (r !== undefined) return r;
  r = nextRow++ % FACE_ROWS;
  rows.set(key, r);
  if (nextRow > FACE_ROWS) for (const [k, v] of rows) if (v === r && k !== key) rows.delete(k); // recycled row
  const cv = ensureCanvas();
  if (cv) {
    const g = cv.getContext('2d');
    for (let col = 0; col < FACE_COLS; col++) drawFace(g, col * FACE_CELL, r * FACE_CELL, l, FACE_EMOS[col >> 1], col & 1, o);
    faceAtlas.dirty = faceAtlas.dirty ? [Math.min(faceAtlas.dirty[0], r), Math.max(faceAtlas.dirty[1], r)] : [r, r];
  }
  return r;
}
/** UV rectangle of expression 0 of a row. */
export const faceUV = (row) => ({ u0: 0, u1: 1 / FACE_COLS, v0: row / FACE_ROWS, v1: (row + 1) / FACE_ROWS });

const shade = (h, k) => { // k > 0 towards white, k < 0 towards black
  const n = parseInt(h.slice(1), 16), t = k < 0 ? 0 : 255, a = Math.abs(k);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - a) + t * a);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function drawFace(g, X, Y, look, emo, blink, o) {
  const S = FACE_CELL, F = look.gender === 'f', M = look.gender === 'm';
  const sk = skinKeys(look.skin), skin = hex(sk[1]), skinD = hex(sk[0]);
  const eyeKey = EYE[look.eyes] || '8', hairKey = HAIRC[look.hairColor] || '6';
  const robot = look.race === 'android' || look.race === 'skeleton';
  g.save();
  g.beginPath(); g.rect(X, Y, S, S); g.clip();
  g.fillStyle = skin; g.fillRect(X, Y, S, S);
  const E = {
    neutral: { open: 1, brow: 0, mouth: 'flat' }, happy: { open: 0.35, brow: 0.05, mouth: 'smile', arc: true }, angry: { open: 0.75, brow: -1, mouth: 'grit' },
    sad: { open: 0.8, brow: 1, mouth: 'frown' }, scared: { open: 1.25, brow: 0.8, mouth: 'gasp' }, smug: { open: 0.62, brow: -0.4, mouth: 'smirk' },
    surprised: { open: 1.3, brow: 0.9, mouth: 'o' }, cringe: { open: 0.7, brow: 0.6, mouth: 'wavy' },
  }[emo] || { open: 1, brow: 0, mouth: 'flat' };
  const ex = 15.2, ey = 27.5 + (F ? 1 : 0), ew = F ? 9.4 : 8.4, eh = (F ? 12.5 : 10.5) * (look.face?.h > 0.3 ? 1.05 : 1);
  const lash = hex(robot ? '0' : '0');
  // blush
  const bl = F || emo === 'happy' || emo === 'cringe' || emo === 'smug' ? (emo === 'cringe' ? 0.5 : 0.3) : 0;
  if (bl && !robot) for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(X + 32 + s * 19, Y + 38, 0, X + 32 + s * 19, Y + 38, 8);
    gr.addColorStop(0, `rgba(224,79,168,${bl})`); gr.addColorStop(1, 'rgba(224,79,168,0)');
    g.fillStyle = gr; g.fillRect(X + 32 + s * 19 - 9, Y + 29, 18, 18);
  }
  // eyes
  for (const s of [-1, 1]) {
    const cx = X + 32 + s * ex, cy = Y + ey;
    const open = blink ? 0.05 : E.open * (emo === 'smug' && s > 0 ? 0.8 : 1);
    const ocy = cy;
    if (look.acc?.includes('eyepatch') && s > 0) {
      g.fillStyle = hex('0'); g.beginPath(); g.ellipse(cx, cy, ew * 0.95, eh * 0.62, 0, 0, 7); g.fill();
      g.strokeStyle = hex('0'); g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - ew, cy - 3); g.lineTo(X + 32 - 31, Y + cy - Y - 10); g.stroke();
      g.beginPath(); g.moveTo(cx + ew, cy - 3); g.lineTo(X + 63, cy - 9); g.stroke();
      continue;
    }
    if (E.arc || open < 0.2) { // happy ^ ^ / closed: a thick lash arc
      g.strokeStyle = lash; g.lineWidth = blink ? 2.2 : 2.6; g.lineCap = 'round';
      g.beginPath();
      if (E.arc && !blink) g.arc(cx, cy + 2, ew * 0.85, Math.PI * 1.12, Math.PI * 1.88);
      else { g.moveTo(cx - ew * 0.9, cy + 1.5); g.quadraticCurveTo(cx, cy + 4.5, cx + ew * 0.9, cy + 1.5); }
      g.stroke();
      if (F) { g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx + s * ew * 0.85, cy + 1); g.lineTo(cx + s * (ew + 2.6), cy - 2); g.stroke(); }
      continue;
    }
    const h = eh * open;
    g.save();
    g.beginPath(); g.ellipse(cx, ocy, ew, h * 0.5 + 0.5, 0, 0, 7); g.clip();
    g.fillStyle = robot ? hex('0') : '#f4f4f6'; g.fillRect(cx - ew - 1, ocy - h, ew * 2 + 2, h * 2 + 2);
    // iris: vertical gradient dark -> light, with a darker rim
    const ir = Math.min(ew * 0.9, h * 0.52) + (F ? 0.8 : 0), ix = cx + s * -0.6, iy = ocy + 0.6;
    const gr = g.createLinearGradient(0, iy - ir, 0, iy + ir);
    const ec = hex(eyeKey);
    gr.addColorStop(0, shade(ec, -0.55)); gr.addColorStop(0.55, ec); gr.addColorStop(1, shade(ec, 0.45));
    g.fillStyle = gr; g.beginPath(); g.ellipse(ix, iy, ir * 0.92, ir * 1.04, 0, 0, 7); g.fill();
    g.strokeStyle = shade(ec, -0.7); g.lineWidth = 0.9; g.stroke();
    g.fillStyle = robot ? hex('h') : hex('0'); g.beginPath(); g.ellipse(ix, iy, ir * 0.42, ir * 0.5, 0, 0, 7); g.fill();
    if (emo === 'scared') { g.fillStyle = hex('0'); g.beginPath(); g.ellipse(ix, iy, ir * 0.3, ir * 0.3, 0, 0, 7); g.fill(); }
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(ix - ir * 0.38, iy - ir * 0.42, ir * 0.3, ir * 0.32, 0, 0, 7); g.fill();
    g.globalAlpha = 0.85; g.beginPath(); g.ellipse(ix + ir * 0.42, iy + ir * 0.45, ir * 0.14, ir * 0.14, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    // lid shadow (top)
    const ls = g.createLinearGradient(0, ocy - h * 0.5, 0, ocy - h * 0.1);
    ls.addColorStop(0, 'rgba(20,20,28,0.45)'); ls.addColorStop(1, 'rgba(20,20,28,0)');
    g.fillStyle = ls; g.fillRect(cx - ew - 1, ocy - h, ew * 2 + 2, h);
    g.restore();
    // upper lash line (thick) + outer wing; angry / sad tilt the lid
    const tilt = E.brow < 0 ? -1 : 0, drop = E.brow > 0.5 && emo === 'sad' ? 1 : 0;
    g.strokeStyle = lash; g.lineCap = 'round'; g.lineWidth = F ? 2.5 : 2.1;
    g.beginPath();
    g.moveTo(cx - s * ew * 0.95, ocy - h * 0.15 + drop * 1.2);
    g.quadraticCurveTo(cx, ocy - h * 0.62 - (E.brow < 0 ? -1 : 0), cx + s * ew * 0.95, ocy - h * 0.1 + tilt * 2);
    g.stroke();
    if (F) { g.lineWidth = 1.7; g.beginPath(); g.moveTo(cx + s * ew * 0.9, ocy - h * 0.1 + tilt * 2); g.lineTo(cx + s * (ew + 2.8), ocy - h * 0.38 + tilt * 2); g.stroke(); }
    if (F && !M) { g.lineWidth = 0.9; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(cx - ew * 0.7, ocy + h * 0.46); g.quadraticCurveTo(cx, ocy + h * 0.62, cx + ew * 0.7, ocy + h * 0.46); g.stroke(); g.globalAlpha = 1; }
    if (look.acc?.includes('cyberEye') && s > 0) {
      g.fillStyle = hex('h'); g.beginPath(); g.ellipse(cx, ocy, ew * 0.75, h * 0.4, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx - 1.5, ocy - 1.5, 1.6, 1.6, 0, 0, 7); g.fill();
    }
    if (look.acc?.includes('scarEye') && s < 0) {
      g.strokeStyle = hex('d'); g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - 5, cy - 13); g.lineTo(cx + 4, cy + 13); g.stroke();
      g.strokeStyle = hex('p'); g.lineWidth = 0.6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx - 4 + k * 3 - 2, cy - 5 + k * 6); g.lineTo(cx - 4 + k * 3 + 3, cy - 4 + k * 6); g.stroke(); }
    }
  }
  // brows
  if (!robot) {
    g.strokeStyle = hex(hairKey === '3' || hairKey === '4' ? '3' : hairKey); g.lineCap = 'round'; g.lineWidth = M ? 2.6 : 1.7;
    for (const s of [-1, 1]) {
      const cx = X + 32 + s * ex, by = Y + ey - eh * 0.5 - (F ? 4.2 : 3.6) - E.brow * 1.2 * (blink ? 0 : 1) * 0 - (emo === 'surprised' || emo === 'scared' ? 2.5 : 0);
      const inner = by + (E.brow < 0 ? 2.2 : E.brow > 0.5 ? -2.4 : 0) + (emo === 'cringe' ? -1.2 : 0), outer = by + (E.brow < 0 ? -1 : E.brow > 0.5 ? 1.5 : -0.4);
      g.beginPath(); g.moveTo(cx - s * ew * 0.95, inner); g.quadraticCurveTo(cx, Math.min(inner, outer) - 1.4, cx + s * ew * 1.05, outer); g.stroke();
    }
  }
  // nose: short stroke + soft shadow
  g.strokeStyle = skinD; g.lineWidth = 1.3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X + 31.2, Y + 38.5); g.lineTo(X + 32.8, Y + 41.2); g.lineTo(X + 34.2, Y + 40.8); g.stroke();
  // mouth
  const my = Y + 49.5, mx = X + 32, mc = hex(robot ? '0' : F ? 'c' : 'd');
  g.strokeStyle = shade(hex(sk[0]), -0.35); g.fillStyle = mc; g.lineWidth = 1.6;
  switch (E.mouth) {
    case 'smile': g.beginPath(); g.moveTo(mx - 6, my - 1); g.quadraticCurveTo(mx, my + 5.5, mx + 6, my - 1); g.stroke(); g.fillStyle = hex('d'); g.beginPath(); g.moveTo(mx - 5, my - 0.4); g.quadraticCurveTo(mx, my + 5, mx + 5, my - 0.4); g.fill(); g.fillStyle = '#f4f4f6'; g.fillRect(mx - 3.4, my, 6.8, 1.4); break;
    case 'frown': g.beginPath(); g.moveTo(mx - 4.5, my + 2); g.quadraticCurveTo(mx, my - 2, mx + 4.5, my + 2); g.stroke(); break;
    case 'gasp': g.beginPath(); g.ellipse(mx, my + 1, 3, 4, 0, 0, 7); g.fillStyle = hex('d'); g.fill(); g.stroke(); break;
    case 'o': g.beginPath(); g.ellipse(mx, my + 1, 2.8, 3.4, 0, 0, 7); g.fillStyle = hex('d'); g.fill(); g.stroke(); break;
    case 'smirk': g.beginPath(); g.moveTo(mx - 4.5, my + 0.5); g.quadraticCurveTo(mx + 1, my + 1.5, mx + 6, my - 2); g.stroke(); break;
    case 'grit': g.fillStyle = '#f4f4f6'; g.fillRect(mx - 5, my - 1.5, 10, 4); g.strokeRect(mx - 5, my - 1.5, 10, 4); g.lineWidth = 0.7; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(mx - 5 + k * 2.5, my - 1.5); g.lineTo(mx - 5 + k * 2.5, my + 2.5); g.stroke(); } break;
    case 'wavy': g.beginPath(); g.moveTo(mx - 6, my); g.bezierCurveTo(mx - 3, my - 3, mx - 1, my + 3, mx + 1, my); g.bezierCurveTo(mx + 3, my - 3, mx + 5, my + 3, mx + 7, my); g.stroke(); break;
    default: g.beginPath(); g.moveTo(mx - 3.8, my + 0.5); g.quadraticCurveTo(mx, my + (F ? 2.2 : 1.2), mx + 3.8, my + 0.5); g.stroke(); if (F) { g.fillStyle = 'rgba(196,40,40,0.55)'; g.fillRect(mx - 2.8, my + 0.6, 5.6, 1.1); }
  }
  // beard
  const bc = hex(hairKey === '3' || hairKey === '4' ? hairKey : hairKey);
  g.fillStyle = bc;
  if (look.beard === 'stubble') { g.globalAlpha = 0.4; g.beginPath(); g.ellipse(X + 32, Y + 52, 21, 12, 0, 0, Math.PI); g.fill(); g.globalAlpha = 1; }
  if (look.beard === 'mustache' || look.beard === 'full' || look.beard === 'goatee') { g.beginPath(); g.moveTo(mx - 9, my - 3); g.quadraticCurveTo(mx, my - 8, mx + 9, my - 3); g.quadraticCurveTo(mx, my - 3, mx - 9, my - 3); g.fill(); }
  if (look.beard === 'goatee') { g.beginPath(); g.ellipse(mx, my + 8, 5, 6, 0, 0, 7); g.fill(); }
  if (look.beard === 'full') { g.beginPath(); g.moveTo(X + 8, Y + 38); g.quadraticCurveTo(X + 10, Y + 66, X + 32, Y + 66); g.quadraticCurveTo(X + 54, Y + 66, X + 56, Y + 38); g.lineTo(X + 50, Y + 46); g.quadraticCurveTo(X + 32, Y + 41, X + 14, Y + 46); g.fill(); g.fillStyle = mc; g.globalAlpha = 0.9; g.fillRect(mx - 4, my - 1, 8, 2.4); g.globalAlpha = 1; }
  if (look.acc?.includes('scarCheek')) { g.strokeStyle = hex('d'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X + 44, Y + 33); g.lineTo(X + 52, Y + 44); g.stroke(); }
  if (look.acc?.includes('jawImp')) { g.fillStyle = hex('3'); g.fillRect(X + 40, Y + 50, 11, 6); g.fillStyle = hex('h'); g.fillRect(X + 44, Y + 52, 3, 2); }
  g.restore();
}

// ---------------------------------------------------------------- material atlas: 5 tileable patterns 64 x 64 stacked
// R luminance / G mask (rust spots) / B gloss streaks. kinds: 1 cloth weave, 2 leather grain, 3 brushed metal, 4 rust, 5 knit
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, per, s) { // tileable value noise, `per` lattice cells across 64 px
  const fx = (x / 64) * per, fy = (y / 64) * per, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix % per, iy % per, s), b = hash((ix + 1) % per, iy % per, s), c = hash(ix % per, (iy + 1) % per, s), d = hash((ix + 1) % per, (iy + 1) % per, s);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
export function buildMatAtlas() {
  if (matCanvas.canvas || !globalThis.document) return matCanvas.canvas;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 320;
  const g = c.getContext('2d'), im = g.createImageData(64, 320);
  const put = (k, x, y, r, gg, b) => { const i = ((k * 64 + y) * 64 + x) * 4; im.data[i] = r * 255; im.data[i + 1] = gg * 255; im.data[i + 2] = b * 255; im.data[i + 3] = 255; };
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    // 1 weave: alternating 4 px strips with a thread texture
    const hz = ((x >> 2) + (y >> 2)) & 1, th = hz ? (x % 4) / 4 : (y % 4) / 4;
    put(0, x, y, 0.55 + 0.3 * (hz ? 1 : 0.4) * (0.6 + 0.4 * Math.sin(th * 3.14)) * 0.8 + (vnoise(x, y, 16, 1) - 0.5) * 0.25, 0, 0);
    // 2 leather: cells
    const n1 = vnoise(x, y, 8, 2), n2 = vnoise(x, y, 16, 3);
    put(1, x, y, 0.45 + 0.4 * n1 * 0.7 + 0.3 * n2 * 0.5 + (Math.abs(n1 - 0.5) < 0.04 ? -0.25 : 0), 0, 0);
    // 3 brushed metal: streaks along x
    const st = vnoise(x * 0.25, y, 32, 4), st2 = vnoise(x * 0.5, y * 1, 64, 5);
    put(2, x, y, 0.5 + (st - 0.5) * 0.7 + (st2 - 0.5) * 0.3, 0, st > 0.75 ? 1 : st2 > 0.85 ? 0.6 : 0);
    // 4 rust: blotches (mask) + speckle
    const rn = vnoise(x, y, 4, 6) * 0.6 + vnoise(x, y, 8, 7) * 0.3 + vnoise(x, y, 16, 8) * 0.1;
    put(3, x, y, 0.45 + (vnoise(x, y, 16, 9) - 0.5) * 0.7, rn > 0.56 ? Math.min(1, (rn - 0.56) * 6) : 0, 0);
    // 5 knit: diagonal ribs
    const rb = (x + y) % 6 < 3 ? 1 : 0.55;
    put(4, x, y, 0.45 + 0.35 * rb + (vnoise(x, y, 16, 10) - 0.5) * 0.2, 0, 0);
  }
  g.putImageData(im, 0, 0);
  matCanvas.canvas = c;
  return c;
}

/** GPU texture of an atlas ('face' | 'mat'): created once, re-uploaded (rows only for faces) when dirty; mipmapped. */
export function gpuAtlas(gl, X, which) {
  const face = which === 'face', A = face ? faceAtlas : matCanvas;
  const cv = face ? ensureCanvas() : buildMatAtlas();
  const key = `atlas_${which}`;
  let t = X[key];
  if (!t || t.gen !== X.gen) {
    t = X[key] = { tex: gl.createTexture(), gen: X.gen, w: 0 };
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    const w = cv?.width || 1, h = cv?.height || 1;
    if (cv) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([216, 162, 122, 255]));
    t.w = w; t.h = h;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = face ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (cv) gl.generateMipmap(gl.TEXTURE_2D);
    A.dirty = null;
    return t.tex;
  }
  if (face && A.dirty && cv) {
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    A.dirty = null;
  }
  return t.tex;
}
