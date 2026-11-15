// Vertex buffers for the 3D renderer (docs/specs/3d.md §1): mesh builder (quads, boxes, bevelled boxes, cylinders,
// wedges) with palette ramps and baked AO, GPU upload, dynamic overlay batch (translucent highlight quads).
//   rampRGB(keys[3])               -> [[r,g,b] x3] (0..1) from palette keys
//   new MeshBuilder()              .quad(p0..p3, ramp, {ao:[4], glow, inside}) .tri .box .bevelBox .cyl .wedge
//   uploadMesh(gl, mb)             -> { vao, count, bufs } (null when empty; + bone attribute 6 after mb.setBone);  freeMesh
//   uploadInstanced(gl, mesh, slot, data) -> per-instance attributes (particles: loc 2..4, 12 floats) on a dynamic buffer
//   new OverlayBuilder()           .quad(p0..p3, rgba) .rect(x0, z0, x1, z1, y, rgba) .frame(...) .ring .poly(pts, y, rgba) .line
//   uploadOverlay(gl, ob, slot)    -> reuses one dynamic buffer per slot
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';
import { VERT } from './gl.js';

const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const keyRGB = (k) => hexRGB(PALETTE[PALETTE_KEYS.indexOf(k)] ?? PALETTE[0]);
export const rampRGB = (keys) => keys.map((k) => (typeof k === 'string' && k[0] === '#' ? hexRGB(k) : keyRGB(k)));
/** 'rgba(r,g,b,a)' / '#rrggbb' -> [r,g,b,a] 0..1 (2D highlight colours reused in 3D). */
const cssCache = new Map();
export function cssRGBA(s) {
  let c = cssCache.get(s);
  if (c) return c;
  if (s[0] === '#') c = [...hexRGB(s), 1];
  else { const m = s.match(/[\d.]+/g).map(Number); c = [m[0] / 255, m[1] / 255, m[2] / 255, m[3] ?? 1]; }
  cssCache.set(s, c);
  return c;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshBuilder {
  constructor() { this.v = []; this.i = []; this.n = 0; this.b = null; this.x = null; this.bone = 0; this.bone2 = 0; this.wfn = null; this.mat = 0; }
  /** Skinned meshes (gfx/units3d.js): every vertex added from now on belongs to bone k (b = [bone, bone2, weight] per
   *  vertex, x = [u, v, material kind] per vertex; weight blends towards bone2). */
  setBone(k) {
    if (!this.b) { this.b = new Array(this.n * 3).fill(0); this.x = new Array(this.n * 3).fill(0); }
    const h = this.hooks && this.hooks[k]; // per-bone weight hooks (joints, bust, hem): {b2, fn}
    this.bone = k; this.bone2 = h ? h.b2 : k; this.wfn = h ? h.fn : null; return this;
  }
  /** Two-bone skin: weight fn(p) -> 0..1 of bone b2 (joints, spring bones). */
  setSkin(b1, b2, fn) { this.setBone(b1); this.bone2 = b2; this.wfn = fn; return this; }
  /** Material kind of the next vertices (shader pattern: 1 cloth 2 leather 3 metal 4 rust 6 hair 9 face). */
  setMat(m) { this.mat = m; return this; }
  _skinPush(p, o, k) {
    if (!this.b) return;
    if (o.bn) this.b.push(o.bn[0], o.bn[1], o.bn[2]); // explicit [bone, bone2, weight]
    else {
      let w = o.w !== undefined ? (Array.isArray(o.w) ? o.w[k] : o.w) : 0, b2 = this.bone2;
      if (o.w === undefined && this.wfn) { const r = this.wfn(p); if (Array.isArray(r)) { b2 = r[0]; w = r[1]; } else w = r; }
      this.b.push(this.bone, w > 0.001 ? b2 : this.bone, w > 0.001 ? w : 0);
    }
    const uv = o.uv ? o.uv[k] : null;
    this.x.push(uv ? uv[0] : 0, uv ? uv[1] : 0, o.mat ?? this.mat);
  }
  /** One shared vertex with an explicit (smooth) normal and its own ramp; returns the index. */
  vert(p, nrm, ramp, o = {}) {
    const [S, B, L] = ramp;
    this.v.push(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], S[0], S[1], S[2], B[0], B[1], B[2], L[0], L[1], L[2], o.ao || 0, o.glow ? 1 : 0);
    this._skinPush(p, o.uv ? { ...o, uv: [o.uv] } : o, 0);
    return this.n++;
  }
  tri3(a, b, c) { this.i.push(a, b, c); return this; }
  get empty() { return this.n === 0; }
  _poly(pts, ramp, o = {}) {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (o.inside) {
      const c = [0, 0, 0];
      for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
      const d = sub(c, o.inside);
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) { pts = [...pts].reverse(); n = [-n[0], -n[1], -n[2]]; if (o.ao) o = { ...o, ao: [...o.ao].reverse() }; if (o.uv) o = { ...o, uv: [...o.uv].reverse() }; }
    }
    const base = this.n, [S, B, L] = ramp, g = o.glow ? 1 : 0;
    pts.forEach((p, k) => {
      this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], S[0], S[1], S[2], B[0], B[1], B[2], L[0], L[1], L[2], o.ao ? o.ao[k] : 0, g);
      this._skinPush(p, o, k);
    });
    for (let k = 1; k < pts.length - 1; k++) this.i.push(base, base + k, base + k + 1);
    this.n += pts.length;
    return this;
  }
  quad(p0, p1, p2, p3, ramp, o) { return this._poly([p0, p1, p2, p3], ramp, o); }
  tri(p0, p1, p2, ramp, o) { return this._poly([p0, p1, p2], ramp, o); }
  /** Axis-aligned box; o.ao — AO of the bottom ring of side faces (contact shadow), o.noBottom (default true). */
  box(x0, y0, z0, x1, y1, z1, ramp, o = {}) {
    const inside = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], g = o.glow, ab = o.ao ?? 0.6;
    const side = { inside, glow: g, ao: [ab, ab, 0, 0] };
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], o.top || ramp, { inside, glow: g });
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], ramp, side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], ramp, side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], ramp, side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], ramp, side);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], ramp, { inside, glow: g });
    return this;
  }
  /** Box with a chamfered top edge (walls, blocks): vertical sides to y1 - b, slanted ring, inset top. */
  bevelBox(x0, y0, z0, x1, y1, z1, b, ramp, o = {}) {
    const yb = y1 - b, ins = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], ab = o.ao ?? 0.6;
    const X0 = x0 + b, X1 = x1 - b, Z0 = z0 + b, Z1 = z1 - b;
    const side = { inside: ins, ao: [ab, ab, 0, 0] }, top = o.top || ramp;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yb, z1], [x0, yb, z1], ramp, side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, yb, z0], [x1, yb, z0], ramp, side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, yb, z0], [x1, yb, z1], ramp, side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, yb, z1], [x0, yb, z0], ramp, side);
    this.quad([x0, yb, z1], [x1, yb, z1], [X1, y1, Z1], [X0, y1, Z1], top, { inside: ins });
    this.quad([x1, yb, z0], [x0, yb, z0], [X0, y1, Z0], [X1, y1, Z0], top, { inside: ins });
    this.quad([x1, yb, z1], [x1, yb, z0], [X1, y1, Z0], [X1, y1, Z1], top, { inside: ins });
    this.quad([x0, yb, z0], [x0, yb, z1], [X0, y1, Z1], [X0, y1, Z0], top, { inside: ins });
    this.quad([X0, y1, Z0], [X0, y1, Z1], [X1, y1, Z1], [X1, y1, Z0], top, { inside: ins });
    return this;
  }
  /** Vertical cylinder (axis 'y') or horizontal along 'x' / 'z'; r1 — top radius (cones); caps on. */
  cyl(cx, cy, cz, len, r, ramp, o = {}) {
    const seg = o.seg || 8, r1 = o.r1 ?? r, axis = o.axis || 'y', cap = o.cap || ramp;
    const P = (a, t, rr) => {
      const u = Math.cos(a) * rr, w = Math.sin(a) * rr;
      if (axis === 'y') return [cx + u, cy + t, cz + w];
      if (axis === 'x') return [cx + t, cy + u, cz + w];
      return [cx + u, cy + w, cz + t];
    };
    const mid = axis === 'y' ? [cx, cy + len / 2, cz] : axis === 'x' ? [cx + len / 2, cy, cz] : [cx, cy, cz + len / 2];
    const ab = o.ao ?? (axis === 'y' ? 0.5 : 0);
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2 + (o.rot || 0), a1 = ((k + 1) / seg) * Math.PI * 2 + (o.rot || 0);
      this.quad(P(a0, 0, r), P(a1, 0, r), P(a1, len, r1), P(a0, len, r1), ramp, { inside: mid, ao: [ab, ab, 0, 0], glow: o.glow });
    }
    const ring = (t, rr) => Array.from({ length: seg }, (_, k) => P((k / seg) * Math.PI * 2 + (o.rot || 0), t, rr));
    if (r1 > 0.001) this._poly(ring(len, r1), cap, { inside: mid, glow: o.glow });
    if (o.bottom || axis !== 'y') this._poly(ring(0, r), cap, { inside: mid, glow: o.glow });
    return this;
  }
  /** Wedge (tent / ramp): rectangle base x0..x1 × z0..z1, ridge along x at height y1 over z = (z0+z1)/2. */
  wedge(x0, y0, z0, x1, y1, z1, ramp, o = {}) {
    const zm = (z0 + z1) / 2, ins = [(x0 + x1) / 2, y0 + (y1 - y0) / 3, zm], ab = o.ao ?? 0.5;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm], ramp, { inside: ins, ao: [ab, ab, 0, 0] });
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, zm], [x1, y1, zm], ramp, { inside: ins, ao: [ab, ab, 0, 0] });
    this.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, zm], ramp, { inside: ins });
    this.tri([x1, y0, z1], [x1, y0, z0], [x1, y1, zm], ramp, { inside: ins });
    return this;
  }
  /** Append another builder translated by (dx, dy, dz). */
  add(mb, dx = 0, dy = 0, dz = 0) {
    const base = this.n;
    for (let k = 0; k < mb.v.length; k += VERT) {
      this.v.push(mb.v[k] + dx, mb.v[k + 1] + dy, mb.v[k + 2] + dz);
      for (let j = 3; j < VERT; j++) this.v.push(mb.v[k + j]);
    }
    for (const i of mb.i) this.i.push(i + base);
    if (this.b) for (let k = 0; k < mb.n; k++) {
      if (mb.b) this.b.push(mb.b[k * 3], mb.b[k * 3 + 1], mb.b[k * 3 + 2]); else this.b.push(this.bone, this.bone, 0);
      if (mb.x) this.x.push(mb.x[k * 3], mb.x[k * 3 + 1], mb.x[k * 3 + 2]); else this.x.push(0, 0, 0);
    }
    this.n += mb.n;
    return this;
  }
}

function setupAttribs(gl, layout, stride) {
  let off = 0;
  layout.forEach((size, loc) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); off += size; });
}

export function uploadMesh(gl, mb) {
  if (!mb || mb.empty) return null;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.v), gl.STATIC_DRAW);
  setupAttribs(gl, [3, 3, 3, 3, 3, 2], VERT);
  const bufs = [vb];
  if (mb.b) { // bone index per vertex (location 6)
    const bb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.b), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 12, 0);
    bufs.push(bb);
    const xb = gl.createBuffer(); // uv + material kind per vertex (location 7)
    gl.bindBuffer(gl.ARRAY_BUFFER, xb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.x), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 12, 0);
    bufs.push(xb);
  }
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mb.i), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  bufs.push(ib);
  return { vao, count: mb.i.length, bufs };
}
export function freeMesh(gl, m) {
  if (!m) return;
  gl.deleteVertexArray(m.vao);
  for (const b of m.bufs) gl.deleteBuffer(b);
}

// ---------------------------------------------------------------- overlay (translucent, rebuilt every frame)
export class OverlayBuilder {
  constructor() { this.v = []; }
  clear() { this.v.length = 0; return this; }
  quad(p0, p1, p2, p3, c) {
    for (const p of [p0, p1, p2, p0, p2, p3]) this.v.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]);
    return this;
  }
  /** Horizontal rectangle at height y. */
  rect(x0, z0, x1, z1, y, c) { return this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], c); }
  /** Horizontal frame (border of width w inside the rectangle). */
  frame(x0, z0, x1, z1, y, w, c) {
    this.rect(x0, z0, x1, z0 + w, y, c).rect(x0, z1 - w, x1, z1, y, c);
    return this.rect(x0, z0 + w, x0 + w, z1 - w, y, c).rect(x1 - w, z0 + w, x1, z1 - w, y, c);
  }
  /** Flat ring (annulus) around (cx, cz). */
  ring(cx, cz, y, r0, r1, c, seg = 20) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (a, r) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      this.quad(P(a0, r0), P(a0, r1), P(a1, r1), P(a1, r0), c);
    }
    return this;
  }
  /** Horizontal polygon [[x, z], ...] at height y (fan from the first point — convex / star-shaped from it, e.g. view cones). */
  poly(pts, y, c) {
    for (let k = 1; k + 1 < pts.length; k++) for (const p of [pts[0], pts[k], pts[k + 1]]) this.v.push(p[0], y, p[1], c[0], c[1], c[2], c[3]);
    return this;
  }
  /** Horizontal line segment of width w. */
  line(x0, z0, x1, z1, y, w, c) {
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = (-(z1 - z0) / l) * w / 2, nz = ((x1 - x0) / l) * w / 2;
    return this.quad([x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [x0 + nx, y, z0 + nz], c);
  }
  get count() { return this.v.length / 7; }
}
const slots = new WeakMap();
export function uploadOverlay(gl, ob, slot = 0) {
  let S = slots.get(gl);
  if (!S) { S = []; slots.set(gl, S); }
  let s = S[slot];
  if (!s) {
    s = { vao: gl.createVertexArray(), vb: gl.createBuffer(), cap: 0 };
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.vb);
    setupAttribs(gl, [3, 4], 7);
    gl.bindVertexArray(null);
    S[slot] = s;
  }
  const data = new Float32Array(ob.v);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.vb);
  if (data.length > s.cap) { s.cap = data.length * 2; gl.bufferData(gl.ARRAY_BUFFER, s.cap * 4, gl.DYNAMIC_DRAW); }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  return { vao: s.vao, count: ob.count };
}
/** Forget dynamic buffers (context restored). */
export const resetOverlays = (gl) => slots.delete(gl);

// ---------------------------------------------------------------- instanced particles (gfx/fx3d.js)
const islots = new WeakMap();
/** Mesh (static, pos+normal from a MeshBuilder) + dynamic per-instance buffer: iPos(4) iCol(4) iShape(4). */
export function uploadInstanced(gl, mb, data, slot = 0) {
  let S = islots.get(gl);
  if (!S) { S = []; islots.set(gl, S); }
  let s = S[slot];
  if (!s) {
    const m = uploadMesh(gl, mb);
    s = { vao: m.vao, count: m.count, ib: gl.createBuffer(), cap: 0 };
    gl.bindVertexArray(s.vao);
    // the static mesh enabled 0..5; particles read pos (0) + normal (1) only
    for (const k of [2, 3, 4, 5]) gl.disableVertexAttribArray(k);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.ib);
    for (const [loc, off] of [[2, 0], [3, 4], [4, 8]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 48, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    S[slot] = s;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, s.ib);
  if (data.length > s.cap) { s.cap = Math.max(1200, data.length * 2); gl.bufferData(gl.ARRAY_BUFFER, s.cap * 4, gl.DYNAMIC_DRAW); }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  return { vao: s.vao, count: s.count, n: data.length / 12 };
}
export const resetInstanced = (gl) => islots.delete(gl);
