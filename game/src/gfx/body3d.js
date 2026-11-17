// Smooth organic geometry of the anime characters (docs/specs/3d.md, anime pass): parametric surfaces with shared
// vertices and smooth normals, swept strands, the head (with the face-texture patch), hair styles.
//   resample(keys, n)                      Catmull-Rom resampling of loft rings
//   surfGrid(mb, S, nu, nv, rampAt, o)     grid of S(u, v) -> [x,y,z] with smooth normals (o: closed, center, bn, uv, mat, ao)
//   sweep(mb, pts, widthFn, thickFn, rampAt, o)   tapered elliptical tube along a path (strands, tails, belts)
//   headShape({F, face, y0, hh})           -> { S(a, t), out(a, t), y0, hh, ring(t) } head surface (a: angle, +z front; t: 0 chin .. 1 crown)
//   buildHead(mb, H, skinRamp, o)          head + face patch (atlas row) + ears + nose
//   buildHair(mb, H, style, grad, o)       -> pivots of the spring bones; styles of the avatar (look.hair)
import { FACE_PATCH, FACE_COLS, FACE_ROWS, faceRow } from './faces.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cr = (p0, p1, p2, p3, f) => 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
const lerpRamp = (r0, r1, f) => r0.map((c, i) => [lerp(c[0], r1[i][0], f), lerp(c[1], r1[i][1], f), lerp(c[2], r1[i][2], f)]);
export { lerpRamp, smooth };

/** Catmull-Rom resample of ring keys [{y, rx, rz, x, z, ao}] into n rings. */
export function resample(keys, n) {
  const K = keys.length, out = [];
  const g = (i, f) => keys[Math.max(0, Math.min(K - 1, i))][f] ?? 0;
  for (let j = 0; j < n; j++) {
    const s = (j / (n - 1)) * (K - 1), i = Math.min(K - 2, Math.floor(s)), f = s - i, r = {};
    for (const fld of ['y', 'rx', 'rz', 'x', 'z', 'ao']) r[fld] = cr(g(i - 1, fld), g(i, fld), g(i + 1, fld), g(i + 2, fld), f);
    r.rx = Math.max(0.002, r.rx); r.rz = Math.max(0.002, r.rz);
    out.push(r);
  }
  return out;
}

function windFix(mb, tris, a0) {
  // flips the triangles of the strip if their geometric normal disagrees with the vertex normal
  const va = mb.v, [a, b, c] = tris[0];
  const p = (i) => [va[i * 17], va[i * 17 + 1], va[i * 17 + 2]];
  const g = cross(sub(p(b), p(a)), sub(p(c), p(a)));
  const n = [va[a * 17 + 3], va[a * 17 + 4], va[a * 17 + 5]];
  return dot(g, n) < 0;
}

/** Grid mesh of the surface S(u, v) (u, v in 0..1). closed: u wraps (u = i / nu). */
export function surfGrid(mb, S, nu, nv, rampAt, o = {}) {
  const cols = o.closed ? nu : nu + 1, idx = [];
  const ctr = o.center || [0, 0, 0];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i < cols; i++) {
      const u = i / nu, du = 0.15 / nu, dv = 0.15 / nv;
      const p = S(u, v);
      const pu = sub(S(u + du, v), S(u - du, v)), pv = sub(S(u, Math.min(1, v + dv)), S(u, Math.max(0, v - dv)));
      let n = cross(pu, pv);
      const c = typeof ctr === 'function' ? ctr(p, u, v) : ctr;
      if (len(pu) < 1e-7 || len(n) < 1e-9) n = [0, v > 0.5 ? 1 : -1, 0]; else n = unit(n);
      if (!(len(pu) < 1e-7) && dot(n, sub(p, c)) < 0) n = mul(n, -1);
      if (o.flip) n = mul(n, -1);
      row.push(mb.vert(p, n, rampAt(u, v), { ao: o.ao ? o.ao(u, v) : 0, bn: o.bn ? o.bn(u, v, p) : undefined, uv: o.uv ? o.uv(u, v) : undefined, mat: o.mat, glow: o.glow }));
    }
    idx.push(row);
  }
  const quads = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < (o.closed ? nu : nu); i++) {
    const i1 = (i + 1) % cols;
    quads.push([idx[j][i], idx[j][i1], idx[j + 1][i1], idx[j + 1][i]]);
  }
  const flip = windFix(mb, [[quads[0][0], quads[0][1], quads[0][2]]]);
  for (const [a, b, c, d] of quads) { if (flip) mb.tri3(a, c, b).tri3(a, d, c); else mb.tri3(a, b, c).tri3(a, c, d); }
  return mb;
}

/** Tapered elliptical tube along pts (path of strands); widthFn(s) / thickFn(s) full sizes; o: seg, side(s, p, T), bn(s), mat, tip. */
export function sweep(mb, pts, widthFn, thickFn, rampAt, o = {}) {
  const n = pts.length, seg = o.seg || 5, rows = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), T = unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let W = o.side ? o.side(s, pts[i], T) : cross(T, [0, 1, 0]);
    W = sub(W, mul(T, dot(W, T)));
    if (len(W) < 1e-5) W = sub([1, 0, 0], mul(T, T[0]));
    W = unit(W);
    const N = unit(cross(T, W)), w = Math.max(0.0008, widthFn(s)) / 2, th = Math.max(0.0008, thickFn(s)) / 2;
    const row = [], rr = rampAt(s), bn = o.bn ? o.bn(s) : undefined;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const p = add(pts[i], add(mul(W, ca * w), mul(N, sa * th)));
      const nm = unit(add(mul(W, ca * th), mul(N, sa * w)));
      row.push(mb.vert(p, nm, rr, { bn, mat: o.mat, ao: o.ao ? o.ao(s) : 0 }));
    }
    rows.push(row);
  }
  const quads = [];
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < seg; k++) { const k1 = (k + 1) % seg; quads.push([rows[i][k], rows[i][k1], rows[i + 1][k1], rows[i + 1][k]]); }
  const flip = windFix(mb, [[quads[0][0], quads[0][1], quads[0][2]]]);
  for (const [a, b, c, d] of quads) { if (flip) mb.tri3(a, c, b).tri3(a, d, c); else mb.tri3(a, b, c).tri3(a, c, d); }
  return mb;
}

// ---------------------------------------------------------------- head
const HEAD_KEYS = [
  { t: 0, rx: 0.012, rz: 0.022, z: 0.07 }, { t: 0.04, rx: 0.03, rz: 0.046, z: 0.062 }, { t: 0.12, rx: 0.056, rz: 0.07, z: 0.036 },
  { t: 0.26, rx: 0.08, rz: 0.09, z: 0.014 }, { t: 0.42, rx: 0.092, rz: 0.099, z: 0.004 }, { t: 0.6, rx: 0.097, rz: 0.1, z: 0 },
  { t: 0.78, rx: 0.092, rz: 0.098, z: -0.004 }, { t: 0.9, rx: 0.072, rz: 0.084, z: -0.006 }, { t: 0.97, rx: 0.042, rz: 0.052, z: -0.006 }, { t: 1, rx: 0.003, rz: 0.004, z: -0.006 },
];
export function headShape({ F = false, face = {}, y0, hh = 0.215, cx = 0 }) {
  const fw = 1 + 0.05 * (face.w || 0), fj = 1 + 0.06 * (face.j || 0), H = hh * (1 + 0.035 * (face.h || 0));
  const ring = (t) => {
    t = Math.max(0, Math.min(1, t));
    let j = 0;
    while (j < HEAD_KEYS.length - 2 && t > HEAD_KEYS[j + 1].t) j++;
    const f = (t - HEAD_KEYS[j].t) / (HEAD_KEYS[j + 1].t - HEAD_KEYS[j].t), g = (i, k) => HEAD_KEYS[Math.max(0, Math.min(HEAD_KEYS.length - 1, i))][k];
    const r = {};
    for (const k of ['rx', 'rz', 'z']) r[k] = cr(g(j - 1, k), g(j, k), g(j + 1, k), g(j + 2, k), f);
    const jaw = t < 0.34 ? lerp(fj * (F ? 0.93 : 1), 1, smooth(0, 0.34, t)) : 1;
    r.rx *= fw * jaw; if (F && t < 0.3) r.z += 0.002;
    // chin (t < 0.16): pointed + jutting (>0) or soft + short (<0); cheekbones (t 0.2..0.5): wider and a bit forward
    const cn = face.c || 0, ck = face.k || 0, cb = t < 0.16 ? 1 - t / 0.16 : 0, ch = Math.sin(Math.PI * smooth(0.16, 0.56, t)) * (t > 0.16 && t < 0.56 ? 1 : 0);
    r.rx *= 1 - 0.16 * cn * cb + 0.075 * ck * ch; r.z += 0.016 * cn * cb + 0.006 * ck * ch;
    return r;
  };
  const S = (a, t) => { const r = ring(t); return [cx + Math.cos(a) * r.rx, y0 + t * H, r.z + Math.sin(a) * r.rz]; };
  const out = (a, t) => { const r = ring(t); return unit([Math.cos(a) / r.rx, smooth(0.74, 1, t) * 16, Math.sin(a) / r.rz]); };
  return { S, out, ring, y0, hh: H, cx };
}

/** Head surface + face patch + ears + nose. skinR — ramp [S, B, L]; o: {look, F, lod, bot}. */
export function buildHead(mb, Hd, skinR, o) {
  const Q = o.lod ? 0.65 : 1, TAU = Math.PI * 2;
  surfGrid(mb, (u, v) => Hd.S(TAU * u, v), Math.round(26 * Q), Math.round(14 * Q), () => skinR, { closed: true, center: (p) => [Hd.cx, p[1], -0.005] });
  // face patch: slightly in front of the surface, uv in the atlas cell of the row (expression 0; the shader adds the column)
  const row = faceRow(o.look, { skin: o.skinTag, pin: o.pin }), { half, t0, t1 } = FACE_PATCH;
  const pat = (u, v) => { const a = Math.PI / 2 - half * (2 * u - 1), t = t1 - v * (t1 - t0); return add(Hd.S(a, t), mul(Hd.out(a, t), 0.0028)); };
  surfGrid(mb, pat, Math.round(14 * Q), Math.round(14 * Q), () => skinR, {
    center: (p) => [Hd.cx, p[1], -0.005], mat: 9,
    uv: (u, v) => [(0.012 + 0.976 * u) / FACE_COLS, (row + 0.012 + 0.976 * v) / FACE_ROWS],
  });
  const { y0, hh } = Hd;
  // nose bump (profile read) and ears
  const nt = 0.35, nr = Hd.ring(nt);
  mb.setBone(mb.bone);
  if (false) { const nc = [Hd.cx, y0 + nt * hh + 0.004, nr.z + nr.rz * 0.985]; surfGrid(mb, (u, v) => { const a = TAU * u, th = Math.PI * v; return [nc[0] + Math.cos(a) * Math.sin(th) * 0.0055, nc[1] - Math.cos(th) * 0.008, nc[2] + Math.sin(a) * Math.sin(th) * 0.006]; }, 6, 3, () => skinR, { closed: true, center: nc }); }
  const et = 0.44, er = Hd.ring(et), ex = er.rx * 0.97;
  for (const s of [-1, 1]) {
    const big = o.ears ? 2.2 : 1;
    surfGrid(mb, (u, v) => { const a = TAU * u, th = Math.PI * v; return [Hd.cx + s * (ex + 0.002 + Math.sin(th) * Math.cos(a) * 0.008 * big), y0 + et * hh + (Math.cos(th) * 0.026 + (o.ears ? Math.max(0, -Math.cos(th)) * 0.03 * 0 : 0)) * big, er.z + Math.sin(a) * Math.sin(th) * 0.015]; }, 6, 5, () => skinR, { closed: true, center: [Hd.cx + s * ex * 0.9, y0 + et * hh, er.z] });
  }
}

// ---------------------------------------------------------------- hair
/** Hair gradient: root ramp -> tip ramp (both [S, B, L]) from the 3 palette colours. */
export const hairGrad = (R) => ({ root: [R[0], R[0], R[1]], tip: [R[1], R[2], R[2]], base: R });

const chainBn = (c, s) => (s < 0.2 ? [c[0], c[0], 0] : s < 0.5 ? [c[0], c[1], (s - 0.2) / 0.3] : s < 0.8 ? [c[1], c[2], (s - 0.5) / 0.3] : [c[2], c[2], 0]);
const sideBn = (c, s) => (s < 0.3 ? [c, c, 0] : [c, c, 0]);
const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

/**
 * Hair of a style. grad: hairGrad; o: {F, lod, seed, bones: {chain:[11,12,13], sideL, sideR}, hat (hood / helmet: no hair)}.
 * Returns the spring pivots {c1, c2, c3, sL, sR} for the bones. The caller has set the head bone.
 */
export function buildHair(mb, Hd, style, grad, o = {}) {
  const Q = o.lod ? 0.6 : 1, TAU = Math.PI * 2, R = rng((o.seed || 1) * 7 + 3), F = o.F, B = o.bones, FK = 0.45 + 1.1 * (o.fringe ?? 0.5); // FK: length of the fringe locks
  const { y0, hh } = Hd;
  const pv = { c1: [0, y0 + 0.6 * hh, -0.085], c2: [0, y0 + 0.12 * hh, -0.095], c3: [0, y0 - 0.2 * hh, -0.1], sL: [0.085, y0 + 0.55 * hh, 0.02], sR: [-0.085, y0 + 0.55 * hh, 0.02] };
  if (style === 'bald' || o.hat === 'full') return pv;
  mb.setMat(6);
  const rampAt = (s) => lerpRamp(grad.root, grad.tip, s);
  const outH = (a, t) => { const v = Hd.out(a, t); return v; };
  // the head normal turns sideways at the crown (rx -> 0): the cap's offset there would leave a see-through hole
  // («шов» on short cuts) — near the top it blends to straight up, the last ring closes into one point
  const capDir = (a, t) => { const k = smooth(0.88, 1, t); return k <= 0 ? outH(a, t) : unit(add(mul(outH(a, t), 1 - k), [0, k, 0])); };
  // cap: from the hairline up; tb(a) — hairline height by angle
  const tbf = (front, side, back) => (a) => { const f = Math.cos(a - Math.PI / 2); return f > 0 ? lerp(side, front, Math.pow(f, 1.3)) : lerp(side, back, Math.pow(-f, 0.8)); };
  const cap = (tb, th, nu = 24) => surfGrid(mb, (u, v) => { const a = TAU * u, t0 = tb(a), t = t0 + v * (1 - t0); return add(t >= 1 ? [Hd.cx, Hd.S(a, 1)[1], Hd.ring(1).z] : Hd.S(a, t), mul(capDir(a, t), th * (0.6 + 0.4 * Math.sin(Math.min(1, 0.25 + v) * Math.PI * 0.5)) + 0.007 + 0.006 * Math.sin(v * Math.PI))); }, Math.round(nu * Q), Math.round(6 * Q), (u, v) => lerpRamp(grad.root, grad.tip, 0.15 + 0.2 * v), { closed: true, center: (p) => [0, p[1], -0.005] });
  // a lock: wedge with a lens section (full in the middle, a point at the tip), a soft bend, a random twist; follows the skull,
  // then hangs (ext) with a sway along the tangent and a flick of the tip. width = full width of the root.
  const strand = (a, t0, t1, ext, width, p = {}) => {
    const pts = [], N1 = p.n1 || 3, off0 = p.off0 ?? 0.012, off1 = p.off1 ?? 0.022;
    const oh = unit([Math.cos(a), 0, Math.sin(a)]), tg = [-Math.sin(a), 0, Math.cos(a)], sway = p.sway ?? (R() - 0.5) * 0.07, tw = p.twist ?? (R() - 0.5) * 1.3;
    for (let j = 0; j <= N1; j++) { const f = j / N1, t = lerp(t0, t1, f); pts.push(add(add(Hd.S(a, t), mul(outH(a, t), lerp(off0, off1, f) + (ext > 0 ? 0 : 0.014 * f * f))), mul(tg, sway * 0.5 * f))); }
    const last = pts[pts.length - 1], N2 = ext > 0 ? Math.max(2, Math.min(4, Math.ceil((ext * Q) / 0.09))) : 0;
    for (let k = 1; k <= N2; k++) {
      const f = k / N2;
      pts.push(add(add(last, [0, -ext * f, 0]), add(add(mul(oh, (p.flare ?? 0.02) * Math.sin(f * 1.6) - (p.curl || 0) * f * f + (p.flick || 0.012) * f * f * f), mul(tg, sway * (0.5 + f))), mul(p.drift || [0, 0, 0], f))));
    }
    const wf = (s) => width * (0.8 + 0.4 * Math.sin(Math.min(1, s * 1.5) * Math.PI * 0.5)) * (1 - 0.96 * Math.pow(s, p.taper || 1.6)), tf = (s) => width * (p.flat ?? 0.7) * (1 - 0.7 * s);
    const bn = p.bn || (p.chain ? (s) => chainBn(p.chain, s) : null);
    sweep(mb, pts, wf, tf, (s) => lerpRamp(grad.root, grad.tip, 0.05 + 0.95 * Math.pow(s, 0.9) * (p.gradK ?? 1)), { seg: p.seg || 4, bn: bn || undefined, mat: 6, side: (s, pp, T) => { const W0 = cross(T, oh), c = Math.cos(tw * s), si = Math.sin(tw * s); return add(mul(W0, c), mul(cross(T, W0), si)); } });
  };
  const chain = B ? [B.c1, B.c2, B.c3] : null;
  const sideB = (s) => (a) => (st) => [s, s, 0];
  const frontLocks = (n, spread, tLen, side, over = 0) => { // fringe over the forehead: 7-11 locks of different length, parted, pointed
    if (over && o.lod) return;
    n = o.lod ? Math.min(n, 5) : Math.max(n, over ? 4 : 7);
    const part = (side || (R() < 0.5 ? -1 : 1)) * 0.12;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1), a = Math.PI / 2 + (f - 0.5) * spread + (over ? 0.5 * spread / n * (R() - 0.2) : 0);
      const L = tLen * FK * (0.55 + 0.45 * Math.sin(f * Math.PI)) * (0.7 + 0.6 * R()) + (over ? 0.04 * R() : 0);
      strand(a, 0.985 - 0.05 * Math.abs(f - 0.5), 0.76 - L + (f - 0.5) * part, 0, 0.036 + 0.014 * R() + over * 0.5, { off0: 0.018 + over, off1: 0.03 + over * 1.4, n1: 3, taper: 1.15, gradK: over ? 0.85 : 1, sway: (f - 0.5) * 0.03 + (R() - 0.5) * 0.02 });
    }
  };
  // outer layer: second, thicker row of clumps between the first strands (volume, a layered cut)
  const layer = (a0, a1, n, t0, t1, ext, width, p = {}) => {
    if (o.lod) return;
    for (let i = 0; i < n; i++) {
      const ang = lerp(a0, a1, (i + 0.5) / n) + 0.06 * (R() - 0.5);
      if (p.skip && p.skip(ang)) continue;
      strand(ang, t0, t1, ext * (0.82 + 0.3 * R()), width * (0.9 + 0.25 * R()), { off0: 0.03, off1: 0.044, n1: 4, taper: 2, flare: 0.04, chain, gradK: 0.8, curl: p.curl || 0, seg: 5 });
    }
  };
  switch (style) {
    case 'crop':
      cap(tbf(0.82, 0.62, 0.5), 0.011);
      frontLocks(7, 1.5, 0.06, 0);
      for (let i = 0; i < 9 && !o.lod; i++) { const a = -0.3 + (i / 8) * (Math.PI + 0.6) + Math.PI; strand(a, 0.84, 0.5, 0, 0.04, { off0: 0.014, off1: 0.022, taper: 1.3 }); }
      break;
    case 'spiky':
      cap(tbf(0.8, 0.58, 0.48), 0.014);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + 0.3, t = 0.86 + 0.1 * R(), L = 0.07 + 0.05 * R();
        const base = add(Hd.S(a, t), mul(outH(a, t), 0.012)), dir = unit(add(mul(outH(a, t), 1), [0, 0.9, 0]));
        sweep(mb, [base, add(base, mul(dir, L * 0.5)), add(base, mul(dir, L))], (s) => 0.03 * (1 - s * 0.95), (s) => 0.03 * (1 - s * 0.95), (s) => lerpRamp(grad.root, grad.tip, s), { seg: 4, mat: 6, side: () => [Math.cos(a + 1.57), 0, Math.sin(a + 1.57)] });
      }
      break;
    case 'mohawk':
      cap(tbf(0.9, 0.8, 0.78), 0.006, 18);
      for (let i = 0; i < 9; i++) { // fin along the midline, front to back
        const f = i / 8, ang = Math.PI / 2 - f * Math.PI, t = 0.97 - 0.16 * Math.sin(f * Math.PI) * 0 - 0.28 * Math.max(0, f - 0.7);
        const base = Hd.S(ang, f < 0.5 ? 0.97 - f * 0.12 : 0.9 - (f - 0.5) * 0.5), h = 0.07 + 0.05 * Math.sin(f * Math.PI);
        const up = unit(add(outH(ang, 0.95), [0, 1.2, 0]));
        const p0 = base, p1 = add(base, mul(up, h * 0.55)), p2 = add(base, add(mul(up, h), [0, 0, -0.02 * (f - 0.5)]));
        sweep(mb, [p0, p1, p2], (s) => 0.03 * (1 - s * 0.9), () => 0.036, (s) => lerpRamp(grad.root, grad.tip, s), { seg: 4, mat: 6, side: () => [0, 0, 1] });
      }
      break;
    case 'dreads':
      cap(tbf(0.84, 0.6, 0.45), 0.012);
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * TAU + 0.2, front = Math.cos(a - Math.PI / 2) > 0.55;
        if (front) continue;
        const left = Math.cos(a) > 0.5 ? B?.sL : Math.cos(a) < -0.5 ? B?.sR : null;
        strand(a, 0.82 - 0.1 * R(), 0.3, 0.26 + 0.14 * R(), 0.028, { off0: 0.014, off1: 0.03, n1: 3, taper: 3, flat: 0.95, flare: 0.015, bn: left ? ((s) => [left, left, 0]) : chain ? ((s) => chainBn(chain, s)) : undefined, seg: 5 });
      }
      frontLocks(4, 1.4, 0.1);
      break;
    case 'afro': {
      const A = resample([
        { y: y0 + hh * 0.62, rx: 0.12, rz: 0.118, z: -0.014 }, { y: y0 + hh * 0.78, rx: 0.146, rz: 0.142, z: -0.016 }, { y: y0 + hh * 1.0, rx: 0.15, rz: 0.146, z: -0.014 },
        { y: y0 + hh * 1.2, rx: 0.12, rz: 0.12, z: -0.012 }, { y: y0 + hh * 1.32, rx: 0.07, rz: 0.07, z: -0.01 }, { y: y0 + hh * 1.37, rx: 0.025, rz: 0.025, z: -0.01 }, { y: y0 + hh * 1.38, rx: 0, rz: 0, z: -0.01 },
      ], 24);
      surfGrid(mb, (u, v) => { const q = v * 23, i = Math.min(22, Math.floor(q)), f = q - i, a = TAU * u; return [Math.cos(a) * Math.max(0, lerp(A[i].rx, A[i + 1].rx, f)), lerp(A[i].y, A[i + 1].y, f), lerp(A[i].z, A[i + 1].z, f) + Math.sin(a) * Math.max(0, lerp(A[i].rz, A[i + 1].rz, f))]; }, Math.round(16 * Q), Math.round(10 * Q), (u, v) => lerpRamp(grad.root, grad.tip, 0.2 + 0.5 * v), { closed: true, center: (p) => [0, p[1], -0.014] });
      // plug under the apex: the rings converge into one point there and the rasterizer may leave a see-through pixel
      const pc = [0, y0 + hh * 1.33, -0.01];
      surfGrid(mb, (u, v) => { const a = TAU * u, th = Math.PI * v * 0.5; return [Math.cos(a) * Math.sin(th) * 0.045, pc[1] + Math.cos(th) * 0.008, pc[2] + Math.sin(a) * Math.sin(th) * 0.045]; }, 8, 3, () => lerpRamp(grad.root, grad.tip, 0.7), { closed: true, center: [0, pc[1] - 0.02, pc[2]] });
      break;
    }
    case 'bun':
      cap(tbf(0.84, 0.62, 0.45), 0.014);
      surfGrid(mb, (u, v) => { const a = TAU * u, th = Math.PI * (0.05 + 0.9 * v); return [Math.cos(a) * Math.sin(th) * 0.052, y0 + hh * 1.0 + 0.045 - Math.cos(th) * 0.05, -0.06 + Math.sin(a) * Math.sin(th) * 0.05]; }, Math.round(10 * Q), Math.round(7 * Q), (u, v) => lerpRamp(grad.root, grad.tip, 0.3 + 0.4 * v), { closed: true, center: [0, y0 + hh * 1.0 + 0.045, -0.06] });
      frontLocks(5, 1.5, 0.12);
      for (const s of [-1, 1]) strand(Math.PI / 2 - s * 1.35, 0.78, 0.4, 0.1, 0.03, { off0: 0.014, off1: 0.024, bn: B ? (() => [s > 0 ? B.sR : B.sL, s > 0 ? B.sR : B.sL, 0]) : undefined });
      pv.c1 = [0, y0 + hh * 1.0, -0.06]; pv.c2 = pv.c1; pv.c3 = pv.c1;
      break;
    case 'tail': {
      cap(tbf(0.84, 0.6, 0.46), 0.014);
      const tie = [0, y0 + hh * 0.86, -0.1];
      for (let k = 0; k < 4; k++) { // ponytail: bundle of 4 strands in an arc back and down
        const off = (k - 1.5) * 0.016;
        const pts = [add(tie, [off * 0.3, 0.01, 0.015])];
        for (let j = 1; j <= 8; j++) { const f = j / 8; pts.push(add(tie, [off * (1 + f * 1.2), -0.02 - 0.46 * f * f - 0.06 * f, -0.045 - 0.12 * Math.sin(f * 1.9) - 0.03 * f])); }
        sweep(mb, pts, (s) => 0.05 * (1 - 0.8 * Math.pow(s, 1.5)), (s) => 0.04 * (1 - 0.7 * s), (s) => lerpRamp(grad.root, grad.tip, 0.15 + 0.85 * s), { seg: 5, mat: 6, bn: chain ? ((s) => chainBn(chain, s)) : undefined, side: () => [1, 0, 0] });
      }
      sweep(mb, [add(tie, [-0.02, 0.012, 0.01]), add(tie, [0.0, 0.016, 0.018]), add(tie, [0.02, 0.012, 0.01])], () => 0.016, () => 0.016, () => [[0.1, 0.1, 0.12], [0.77, 0.16, 0.16], [0.9, 0.3, 0.3]], { seg: 4, mat: 0 });
      frontLocks(5, 1.4, 0.12);
      pv.c1 = add(tie, [0, 0, 0]); pv.c2 = add(tie, [0, -0.14, -0.1]); pv.c3 = add(tie, [0, -0.28, -0.12]);
      for (const s of [-1, 1]) strand(Math.PI / 2 - s * 1.3, 0.8, 0.42, 0.12, 0.028, { off0: 0.014, off1: 0.02, bn: B ? (() => [s > 0 ? B.sR : B.sL, s > 0 ? B.sR : B.sL, 0]) : undefined });
      frontLocks(4, 1.3, 0.12, 0, 0.012);
      break;
    }
    case 'fringe': {
      cap(tbf(0.86, 0.5, 0.36), 0.013);
      const side = R() < 0.5 ? -1 : 1; // asymmetric swept bangs
      for (let i = 0; i < 7; i++) {
        const f = i / 6, a = Math.PI / 2 + side * (0.9 - f * 1.9), t0 = 0.99 - 0.02 * f;
        strand(a, t0, 0.66 - 0.16 * (FK - 1) - 0.12 * Math.sin(f * 3) - (side * (f - 0.5) > 0 ? 0.1 : 0), 0.0, 0.04 + 0.01 * R(), { off0: 0.016, off1: 0.03, n1: 5, taper: 1.2, gradK: 1 });
      }
      if (F) { for (let i = 0; i < 11; i++) { const a = -0.4 + (i / 10) * (Math.PI + 0.8) * 1 + Math.PI; strand(a, 0.7, 0.3, 0.1, 0.04, { off0: 0.014, off1: 0.028, bn: chain ? ((s) => chainBn(chain, s)) : undefined }); } }
      else for (const s of [-1, 1]) strand(Math.PI / 2 - s * 1.3, 0.66, 0.4, 0.02, 0.03, { off0: 0.014, off1: 0.02 });
      break;
    }
    case 'long': {
      cap(tbf(0.86, 0.5, 0.3), 0.014);
      for (let i = 0; i < 13; i++) { // back curtain down to the shoulder blades
        const ang = -0.45 + (i / 12) * (Math.PI + 0.9);
        const back = Math.sin(ang);
        if (back > 0.55) continue;
        strand(ang + Math.PI * 0, 0.8, 0.28, 0.42 + 0.06 * R() - 0.08 * Math.abs(Math.cos(ang)), 0.052, { off0: 0.016, off1: 0.03, n1: 4, taper: 2.2, flare: 0.035, chain, seg: 5 });
      }
      for (const s of [-1, 1]) { // long locks in front of the shoulders
        const bs = s > 0 ? B?.sR : B?.sL;
        strand(Math.PI / 2 - s * 1.2, 0.8, 0.45, 0.32, 0.045, { off0: 0.016, off1: 0.026, n1: 3, taper: 2, flare: 0.03, bn: bs ? ((t) => [bs, bs, 0]) : undefined });
      }
      frontLocks(5, 1.5, 0.1);
      frontLocks(4, 1.3, 0.12, 0, 0.012);
      layer(-0.45, Math.PI + 0.45, 8, 0.74, 0.28, 0.36, 0.056, { skip: (a) => Math.sin(a) > 0.55 });
      break;
    }
    default: { // 'short' (men: crop with a fringe; women: bob)
      if (F) {
        cap(tbf(0.86, 0.5, 0.3), 0.014);
        for (let i = 0; i < 12; i++) {
          const ang = -0.5 + (i / 11) * (Math.PI + 1.0);
          if (Math.sin(ang) > 0.5) continue;
          strand(ang, 0.78, 0.2, 0.06, 0.05, { off0: 0.016, off1: 0.034, n1: 4, taper: 2, flare: 0.03, curl: 0.035, chain, seg: 5 });
        }
        for (const s of [-1, 1]) { const bs = s > 0 ? B?.sR : B?.sL; strand(Math.PI / 2 - s * 1.25, 0.8, 0.22, 0.04, 0.045, { off0: 0.016, off1: 0.03, curl: 0.03, bn: bs ? (() => [bs, bs, 0]) : undefined }); }
        frontLocks(6, 1.55, 0.13);
        frontLocks(4, 1.4, 0.14, 0, 0.012);
        layer(-0.5, Math.PI + 0.5, 8, 0.72, 0.2, 0.08, 0.056, { curl: 0.04, skip: (a) => Math.sin(a) > 0.5 });
      } else {
        cap(tbf(0.84, 0.56, 0.4), 0.014);
        frontLocks(5, 1.3, 0.1);
        for (const s of [-1, 1]) strand(Math.PI / 2 - s * 1.35, 0.7, 0.4, 0, 0.034, { off0: 0.012, off1: 0.018 });
      }
    }
  }
  if (!o.lod && ['short', 'fringe', 'tail', 'long', 'bun', 'crop'].includes(style) && R() < 0.34) { // ahoge: a lone curved antenna on the crown
    const b0 = add(Hd.S(Math.PI / 2 + 0.2, 0.98), mul(outH(Math.PI / 2 + 0.2, 0.98), 0.012));
    sweep(mb, [b0, add(b0, [0.004, 0.035, 0.012]), add(b0, [0.018, 0.068, 0.028]), add(b0, [0.044, 0.082, 0.04])], (s) => 0.022 * (1 - 0.95 * s), (s) => 0.016 * (1 - 0.8 * s), (s) => lerpRamp(grad.root, grad.tip, s), { seg: 4, mat: 6, side: () => [0, 0, 1] });
  }
  mb.setMat(0);
  return pv;
}
