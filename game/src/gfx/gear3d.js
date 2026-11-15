// Geometry helpers and gear of the 3D units (gfx/units3d.js): smooth lofted profiles (rings -> rounded limbs / torso /
// domes), tilted beams and tubes, weapons by type, off-hand items. Everything is built into a MeshBuilder with the bone
// already set by the caller (weapons: forearm bone of the right arm; shield: forearm bone of the left arm).
//   loft(mb, rings, ramp, {seg, rot, capTop, capBot, glow})   rings [{y, rx, rz, x, z, ao}] bottom -> top
//   limb(mb, x, z, yTop, yBot, rTop, rBot, ramp, {seg, bulge, ao})   rounded tapered limb segment
//   beam(mb, a, b, w, t, ramp, o)      rectangular prism between two points (blades, stocks, handles)
//   tube(mb, a, b, r0, r1, ramp, o)    round tube between two points (barrels, poles)
//   weaponKind(u)                      -> model id of the unit's weapon ('knife', 'sword', 'pistol', 'rifle', 'laser', ...)
//   weapon(mb, hx, hy, kind, big)      builds it around the right hand point (hx, hy)
//   offhand(mb, kind, x, wy, ey, s)    shield / side weapon / tool on the left forearm
import { rampRGB } from './mesh.js';
import { ramp } from './models.js';

const glowR = (k) => rampRGB([k, k, k]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function loft(mb, rings, rp, o = {}) {
  if (o.ramps || o.flat) return loftFlat(mb, rings, rp, o);
  const seg = o.seg || 8, rot = o.rot || 0, zax = o.axis === 'z'; // axis 'z': ring.y is the z position, ring.cy the height
  const P = (r, k) => {
    const a = (k / seg) * Math.PI * 2 + rot, u = Math.cos(a) * r.rx, v = Math.sin(a) * (r.rz ?? r.rx);
    return zax ? [(r.x || 0) + u, (r.cy || 0) + v, r.y] : [(r.x || 0) + u, r.y, (r.z || 0) + v];
  };
  const C = (r) => (zax ? [r.x || 0, r.cy || 0, r.y] : [r.x || 0, r.y, r.z || 0]);
  const n = rings.length, idx = [];
  // smooth normals: cross(around, along), oriented away from the ring centre; degenerate rings (tips) point along the axis
  for (let i = 0; i < n; i++) {
    const r = rings[i], c = C(r), row = [], rr = r.ramp || rp;
    const pi = rings[Math.max(0, i - 1)], ni = rings[Math.min(n - 1, i + 1)];
    for (let k = 0; k < seg; k++) {
      const p = P(r, k), ta = sub(P(r, k + 1), P(r, k - 1)), tl = sub(P(ni, k), P(pi, k));
      let nm = cross(ta, tl), l = Math.hypot(nm[0], nm[1], nm[2]);
      const out = sub(p, c);
      if (l < 1e-7 || Math.hypot(ta[0], ta[1], ta[2]) < 1e-5) nm = unit(sub(c, C(i === 0 ? rings[1] : rings[i - 1])));
      else { nm = mul(nm, 1 / l); if (nm[0] * out[0] + nm[1] * out[1] + nm[2] * out[2] < 0) nm = mul(nm, -1); }
      row.push(mb.vert(p, nm, rr, { ao: r.ao ?? 0, glow: o.glow }));
    }
    idx.push(row);
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg, a = idx[i][k], b = idx[i][k1], c = idx[i + 1][k1], d = idx[i + 1][k];
    // winding: geometric normal must agree with the vertex normals
    const va = mb.v, o0 = a * 17, ob = b * 17, od = d * 17;
    const e1 = [va[ob] - va[o0], va[ob + 1] - va[o0 + 1], va[ob + 2] - va[o0 + 2]], e2 = [va[od] - va[o0], va[od + 1] - va[o0 + 1], va[od + 2] - va[o0 + 2]];
    const g = cross(e1, e2), vn = [va[o0 + 3], va[o0 + 4], va[o0 + 5]];
    if (g[0] * vn[0] + g[1] * vn[1] + g[2] * vn[2] >= 0) mb.tri3(a, b, c).tri3(a, c, d); else mb.tri3(a, c, b).tri3(a, d, c);
  }
  if (o.capTop !== false && rings[n - 1].rx > 0.004) mb._poly(Array.from({ length: seg }, (_, k) => P(rings[n - 1], k)), o.cap || rp, { inside: C(rings[n - 2] || rings[n - 1]), glow: o.glow });
  if (o.capBot) mb._poly(Array.from({ length: seg }, (_, k) => P(rings[0], k)), o.cap || rp, { inside: C(rings[1] || rings[0]), glow: o.glow });
  return mb;
}

export function loftFlat(mb, rings, rp, o = {}) {
  const seg = o.seg || 8, rot = o.rot || 0, zax = o.axis === 'z';
  const P = (r, k) => {
    const a = (k / seg) * Math.PI * 2 + rot, u = Math.cos(a) * r.rx, v = Math.sin(a) * (r.rz ?? r.rx);
    return zax ? [(r.x || 0) + u, (r.cy || 0) + v, r.y] : [(r.x || 0) + u, r.y, (r.z || 0) + v];
  };
  const C = (r) => (zax ? [r.x || 0, r.cy || 0, r.y] : [r.x || 0, r.y, r.z || 0]);
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1], ca = C(A), cb = C(B), ins = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
    const a0 = A.ao ?? 0, a1 = B.ao ?? 0;
    for (let k = 0; k < seg; k++) mb.quad(P(A, k), P(A, k + 1), P(B, k + 1), P(B, k), o.ramps ? o.ramps[(i + k) % o.ramps.length] : rp, { inside: ins, ao: [a0, a0, a1, a1], glow: o.glow });
  }
  const ring = (r) => Array.from({ length: seg }, (_, k) => P(r, k));
  const n = rings.length;
  if (o.capTop !== false && rings[n - 1].rx > 0.004) mb._poly(ring(rings[n - 1]), o.cap || rp, { inside: C(rings[n - 2] || rings[n - 1]), glow: o.glow });
  if (o.capBot) mb._poly(ring(rings[0]), o.cap || rp, { inside: C(rings[1] || rings[0]), glow: o.glow });
  return mb;
}

/** Rounded limb (muscle bulge at `bulge` of the length from the top), rx = rz unless o.rz. */
export function limb(mb, x, z, yTop, yBot, rTop, rBot, rp, o = {}) {
  const L = yTop - yBot, b = o.bulge ?? 0.3, k = o.k ?? 1.12, rz = o.rz ?? 1;
  const rings = [
    { y: yBot, rx: rBot, rz: rBot * rz, x, z, ao: o.ao ?? 0.35 },
    { y: yBot + L * (1 - b) * 0.55, rx: (rBot + rTop) / 2 * k, rz: (rBot + rTop) / 2 * k * rz, x, z, ao: 0.1 },
    { y: yTop - L * b, rx: rTop * k, rz: rTop * k * rz, x, z, ao: 0 },
    { y: yTop, rx: rTop * 0.92, rz: rTop * 0.92 * rz, x, z, ao: 0.15 },
  ];
  return loft(mb, rings, rp, { seg: o.seg || 7, rot: Math.PI / (o.seg || 7), capTop: o.capTop ?? false, capBot: o.capBot ?? false });
}

/** Rectangular prism from a to b, width w (sideways), thickness t. */
export function beam(mb, a, b, w, t, rp, o = {}) {
  const d = unit(sub(b, a)), up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const s = mul(unit(cross(d, up)), w / 2), u = mul(unit(cross(s, d)), t / 2);
  const c = (p, i, j) => add(add(p, mul(s, i)), mul(u, j));
  const ins = mul(add(a, b), 0.5), g = o.glow;
  const A = [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)], B = [c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)];
  for (let k = 0; k < 4; k++) mb.quad(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k], rp, { inside: ins, glow: g, ao: [o.ao ?? 0, o.ao ?? 0, 0, 0] });
  mb.quad(...A, rp, { inside: ins, glow: g });
  mb.quad(...B, rp, { inside: ins, glow: g });
  return mb;
}
/** Round tube from a to b (tapered r0 -> r1). */
export function tube(mb, a, b, r0, r1, rp, o = {}) {
  const seg = o.seg || 6, d = unit(sub(b, a)), up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const s = unit(cross(d, up)), u = unit(cross(s, d)), ins = mul(add(a, b), 0.5);
  const R = (p, r, k) => { const q = (k / seg) * Math.PI * 2; return add(p, add(mul(s, Math.cos(q) * r), mul(u, Math.sin(q) * r))); };
  const NR = (k) => { const q = (k / seg) * Math.PI * 2; return add(mul(s, Math.cos(q)), mul(u, Math.sin(q))); };
  const slope = (r0 - r1) / (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1);
  const A = [], B = [];
  for (let k = 0; k < seg; k++) {
    const nm = unit(add(NR(k), mul(d, slope)));
    A.push(mb.vert(R(a, r0, k), nm, rp, { ao: o.ao ?? 0, glow: o.glow }));
    B.push(mb.vert(R(b, r1, k), nm, rp, { glow: o.glow }));
  }
  for (let k = 0; k < seg; k++) { const k1 = (k + 1) % seg; mb.tri3(A[k], A[k1], B[k1]).tri3(A[k], B[k1], B[k]); }
  // winding check against the outward normal (once): flip the whole side if inverted
  const n0 = mb.i.length - seg * 6, va = mb.v, o0 = A[0] * 17, o1 = A[1] * 17, o2 = B[1] * 17;
  const g = cross([va[o1] - va[o0], va[o1 + 1] - va[o0 + 1], va[o1 + 2] - va[o0 + 2]], [va[o2] - va[o0], va[o2 + 1] - va[o0 + 1], va[o2 + 2] - va[o0 + 2]]);
  if (g[0] * va[o0 + 3] + g[1] * va[o0 + 4] + g[2] * va[o0 + 5] < 0) for (let k = n0; k < mb.i.length; k += 3) { const t = mb.i[k + 1]; mb.i[k + 1] = mb.i[k + 2]; mb.i[k + 2] = t; }
  if (o.caps !== false) {
    mb._poly(Array.from({ length: seg }, (_, k) => R(b, r1, k)), rp, { inside: ins, glow: o.glow });
    mb._poly(Array.from({ length: seg }, (_, k) => R(a, r0, k)), rp, { inside: ins, glow: o.glow });
  }
  return mb;
}

// ---------------------------------------------------------------- weapons
const MELEE = { knife: 'knife', fist: 'fist', sword: 'sword', sabre: 'sabre', katana: 'katana', bastard: 'sword', cyberblade: 'cyberblade', polearm: 'polearm', hammer: 'hammer', axe: 'axe', twoHanded: 'hammer' };
const RANGED = { pistol: 'pistol', smg: 'smg', rifle: 'rifle', auto: 'rifle', mg: 'mg', bolter: 'mg', crossbow: 'crossbow', bow: 'bow', launcher: 'launcher', laser: 'laser', plasma: 'laser', energy: 'laser', melta: 'melta', proxy: 'wand', cringe: 'wand', throw: 'grenade' };
/** Model id of the weapon of unit u (type of the item, else a guess by the name / dice / range); null — unarmed. */
export function weaponKind(u, melee) {
  const w = u.weapon;
  if (!w || u.noAttack) return null;
  const k = (melee ? MELEE : RANGED)[w.type];
  if (k) return k;
  const n = String(w.name || '').toLowerCase();
  if (melee) return /нож|кинжал|штык|стилет/.test(n) ? 'knife' : /меч|тесак|сабл|клинок|серп|коса|лезв/.test(n) ? 'sword' : /топор|секир/.test(n) ? 'axe' : /молот|кувалд|кулак/.test(n) ? 'hammer' : /багор|копь|вил|пик/.test(n) ? 'polearm' : 'club';
  return /пистолет|револьвер/.test(n) ? 'pistol' : /дроб|обрез|винтов|ружь|снайп/.test(n) ? 'rifle' : /лазер|плазм|разряд|энерг|луч/.test(n) ? 'laser' : /лук|арбал/.test(n) ? 'crossbow' : 'rifle';
}

const K = (k) => ramp(k);
export function weapon(mb, hx, hy, kind, big = 1) {
  if (!kind) return;
  const m = K('4'), dk = K('2'), wd = K('7'), gr = K('1'), grip = (a = 0.07) => beam(mb, [hx, hy - 0.03, -a], [hx, hy + 0.02, a], 0.04, 0.045, wd, { ao: 0 });
  const S = (y, z) => [hx, hy + y, z];
  switch (kind) {
    case 'knife': grip(0.05); beam(mb, S(0.0, 0.05), S(0.1, 0.22), 0.035, 0.012, K('5')); beam(mb, S(-0.01, 0.04), S(0.02, 0.07), 0.07, 0.02, dk); break;
    case 'sword': case 'sabre': case 'katana': case 'cyberblade': {
      const L = (kind === 'katana' ? 0.62 : 0.52) * big, glow = kind === 'cyberblade';
      grip(0.08); beam(mb, S(0, 0.1), S(0.01, 0.13), 0.14, 0.03, K('6'));
      beam(mb, S(0.0, 0.13), S(0.14 * big, 0.13 + L * 0.55), 0.05, 0.014, glow ? glowR('h') : K('5'), { glow });
      beam(mb, S(0.14 * big, 0.13 + L * 0.55), S(0.17 * big + (kind === 'sword' ? 0 : 0.04), 0.13 + L), 0.045, 0.012, glow ? glowR('h') : K('5'), { glow });
      break;
    }
    case 'axe': beam(mb, S(-0.1, -0.1), S(0.2, 0.42), 0.035, 0.035, wd); mb.wedge(hx - 0.01, hy + 0.12, 0.34, hx + 0.01, hy + 0.3, 0.5, m, { ao: 0 }); beam(mb, S(0.16, 0.36), S(0.3, 0.46), 0.03, 0.15, m); break;
    case 'hammer': case 'club':
      beam(mb, S(-0.1, -0.1), S(0.25 * big, 0.45 * big), 0.045, 0.045, wd);
      if (kind === 'hammer') mb.bevelBox(hx - 0.075, hy + 0.2 * big, 0.38 * big, hx + 0.075, hy + 0.36 * big, 0.56 * big, 0.03, m, { ao: 0 });
      else tube(mb, S(0.1, 0.2), S(0.27, 0.5), 0.045, 0.07, wd, { seg: 6 });
      break;
    case 'polearm': beam(mb, S(-0.2, -0.3), S(0.5, 0.75), 0.03, 0.03, wd); mb.wedge(hx - 0.03, hy + 0.46, 0.7, hx + 0.03, hy + 0.66, 0.84, m, { ao: 0 }); break;
    case 'fist': mb.bevelBox(hx - 0.06, hy - 0.04, 0.0, hx + 0.06, hy + 0.04, 0.09, 0.02, dk, { ao: 0 }); break;
    case 'pistol': beam(mb, S(-0.05, -0.02), S(-0.02, 0.01), 0.04, 0.05, gr); beam(mb, S(0.0, -0.03), S(0.0, 0.2), 0.05, 0.05, dk); tube(mb, S(0.015, 0.2), S(0.015, 0.27), 0.015, 0.015, m, { seg: 5 }); break;
    case 'smg': beam(mb, S(-0.05, 0), S(-0.02, 0.03), 0.045, 0.05, gr); beam(mb, S(0.0, -0.08), S(0.0, 0.3), 0.06, 0.07, dk); beam(mb, S(-0.14, 0.12), S(-0.04, 0.13), 0.04, 0.05, gr); tube(mb, S(0.02, 0.3), S(0.02, 0.4), 0.017, 0.017, m, { seg: 5 }); break;
    case 'rifle': case 'mg':
      beam(mb, S(-0.0, -0.22), S(-0.02, -0.02), 0.05, 0.06, wd); beam(mb, S(0.02, -0.02), S(0.03, 0.34), 0.06, 0.075, dk);
      tube(mb, S(0.035, 0.34), S(0.035, kind === 'mg' ? 0.62 : 0.55), 0.02, 0.02, m, { seg: 5 }); beam(mb, S(-0.1, 0.1), S(-0.02, 0.12), 0.04, 0.05, gr); beam(mb, S(0.08, 0.1), S(0.08, 0.26), 0.02, 0.03, m);
      if (kind === 'mg') { beam(mb, S(0.0, 0.14), S(0.0, 0.24), 0.11, 0.08, K('3')); tube(mb, S(0.0, 0.5), S(-0.12, 0.62), 0.012, 0.012, m, { seg: 4 }); }
      break;
    case 'crossbow': beam(mb, S(0.02, -0.06), S(0.02, 0.36), 0.04, 0.05, wd); beam(mb, S(0.03, 0.3), S(0.03, 0.34), 0.5, 0.02, m); break;
    case 'bow': beam(mb, S(0.0, 0.02), S(0.28, 0.06), 0.025, 0.025, wd); beam(mb, S(0.0, 0.02), S(-0.28, 0.06), 0.025, 0.025, wd); beam(mb, S(0.28, 0.06), S(-0.28, 0.06), 0.006, 0.006, K('5')); break;
    case 'launcher': tube(mb, S(0.1, -0.22), S(0.1, 0.5), 0.07, 0.085, dk, { seg: 7 }); beam(mb, S(0.0, -0.02), S(0.05, 0.0), 0.04, 0.06, gr); break;
    case 'laser': case 'melta':
      beam(mb, S(-0.0, -0.15), S(0.01, 0.02), 0.05, 0.065, K('3')); beam(mb, S(0.02, 0.0), S(0.03, 0.3), 0.07, 0.085, K('4'));
      beam(mb, S(0.04, 0.04), S(0.04, 0.26), 0.02, 0.09, glowR(kind === 'melta' ? 'e' : 'h'), { glow: true });
      tube(mb, S(0.035, 0.3), S(0.035, 0.46), 0.03, kind === 'melta' ? 0.04 : 0.02, dk, { seg: 6 }); break;
    case 'wand': beam(mb, S(-0.02, -0.08), S(0.05, 0.22), 0.025, 0.025, wd); mb.box(hx - 0.04, hy + 0.05, 0.22, hx + 0.04, hy + 0.13, 0.3, glowR('n'), { glow: true, ao: 0 }); break;
    case 'grenade': mb.cyl(hx, hy - 0.02, 0.02, 0.09, 0.05, K('j'), { seg: 6, ao: 0 }); break;
    default: break;
  }
}

/** Off-hand item on the left forearm (bone faL): shield / side weapon / tool; x of the forearm axis, wy wrist, ey elbow. */
export function offhand(mb, kind, x, wy, ey, s = 1) {
  const m = K('3'), md = K('6');
  if (kind === 'shield') {
    loft(mb, [{ y: wy - 0.02, rx: 0.07, rz: 0.04, x: x + 0.09, z: 0.04 }, { y: (wy + ey) / 2, rx: 0.13, rz: 0.07, x: x + 0.1, z: 0.02, ao: 0 }, { y: ey + 0.08, rx: 0.12, rz: 0.07, x: x + 0.09, z: 0.02 }], md, { seg: 8, capTop: true, capBot: true });
    mb.box(x + 0.15, (wy + ey) / 2 - 0.04, -0.035, x + 0.2, (wy + ey) / 2 + 0.04, 0.035, m, { ao: 0 });
  } else if (kind === 'side') {
    beam(mb, [x, wy - 0.02, 0.03], [x, wy + 0.1, 0.2], 0.03, 0.012, K('5'));
  } else if (kind === 'tool') {
    mb.bevelBox(x + 0.05, wy + 0.03, -0.07, x + 0.11, ey - 0.02, 0.07, 0.015, m, { ao: 0 });
    mb.box(x + 0.11, wy + 0.08, -0.04, x + 0.125, wy + 0.16, 0.04, glowR('h'), { glow: true, ao: 0 });
  }
}
