// Procedural skeletal animation of 3D units (docs/specs/3d.md §2, stage 2): idle (breathing), walk along the path,
// attack (melee swing / shot / throw), hit (recoil), death (fall), cast. View only: battle events are read in
// scenes/battle.js handleEvent -> animEvent3d (co-op determinism: nothing here touches S.b).
//   animEvent3d(S, e)                   records actions / hits / deaths of units, spawns projectiles (gfx/fx3d.js)
//   animActive(V, now)                  -> true while some action / hit / fall / transient effect plays
//   aimOf(V, id, now)                   -> {x, z} the unit faces during its action, or null
//   poseBones(T, st, d, now, M, out, o, flags) writes 11 bone matrices (3x4 rows) of template T at model matrix M
//   modelMatrix(x, y, z, yaw, s)        -> 3x4 affine (row-major 12 floats)
import { GFX } from '../data/gfx.js';
import { BONE, PARENT } from './units3d.js';
import { NBONES } from './gl.js';
import { spawnFx } from './fx3d.js';

const A = GFX.anim;
const ACT_DUR = { swing: A.swing, shoot: A.shoot, cast: A.cast, throw: A.throw, use: A.use };
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));

function stOf(V, id) {
  let s = V.anim[id];
  if (!s) { s = V.anim[id] = { act: null, t0: -9, dur: 0, hitT0: -9, deathT0: -9, downT0: -9, walk: 0, lx: null, lz: null, aim: null, seed: (Object.keys(V.anim).length * 0.37) % 1 }; }
  return s;
}
const posOf = (S, u) => { const d = S.dispOf(u); return { x: d.x + 0.5, z: d.y + 0.5 }; };

/** Start an action of unit u (kind: swing | shoot | cast | throw | use) aimed at {x, z} (cells, centred). */
function act(S, V, u, kind, aim, delay = 0) {
  const s = stOf(V, u.id);
  s.act = kind; s.t0 = S.time + delay; s.dur = ACT_DUR[kind]; s.aim = aim;
}
/** World point of the unit's hand / chest (for projectiles). */
function handAt(S, V, u, up = 0.75) {
  const p = posOf(S, u), h = (V.hgt[u.id] ?? 0) + up * GFX.unit.scale * (u.boss ? GFX.unit.bossScale : 1);
  return [p.x, h, p.z];
}

export function animEvent3d(S, e) {
  const V = S.v3;
  if (!V) return;
  const b = S.b, now = S.time;
  const Au = e.actor ? b.byId[e.actor] : null, Tu = e.target ? b.byId[e.target] : null;
  const L = A.launch;
  const tileAim = (x, y) => ({ x: x + 0.5, z: y + 0.5 });
  const fly = (from, to, speed) => Math.max(0.12, Math.hypot(to[0] - from[0], to[2] - from[2]) / speed);
  switch (e.type) {
    case 'attack': case 'burst': {
      if (!Au || !Tu) break;
      const melee = e.type === 'attack' ? !!e.melee : false;
      act(S, V, Au, melee ? 'swing' : 'shoot', posOf(S, Tu));
      if (melee) { V.impact[Tu.id] = now + A.swing * 0.5; if (e.hit !== false) spawnFx(V, { kind: 'spark', t0: now + A.swing * 0.5, at: handAt(S, V, Tu, 0.6) }); break; }
      const from = handAt(S, V, Au, 0.62), to = handAt(S, V, Tu, 0.6), n = e.type === 'burst' ? Math.min(4, e.shots || 3) : 1;
      for (let k = 0; k < n; k++) {
        const t0 = now + L.shoot + k * 0.13, dur = fly(from, to, A.boltSpeed);
        spawnFx(V, { kind: 'flash', t0, at: from });
        spawnFx(V, { kind: 'bolt', t0, dur, from, to: e.hit === false && k === 0 ? [to[0] + 0.4, to[1] + 0.3, to[2] - 0.3] : to });
        if (e.hit !== false) spawnFx(V, { kind: 'spark', t0: t0 + dur, at: to });
        V.impact[Tu.id] = now + L.shoot + dur;
      }
      break;
    }
    case 'throw': {
      if (!Au) break;
      const aim = tileAim(e.x ?? Tu?.x ?? Au.x, e.y ?? Tu?.y ?? Au.y);
      act(S, V, Au, 'throw', aim);
      const from = handAt(S, V, Au, 0.9), to = [aim.x, (V.world?.floor[(e.y ?? 0) * V.world.w + (e.x ?? 0)] ?? 0) + 0.2, aim.z];
      const dur = fly(from, to, A.throwSpeed);
      spawnFx(V, { kind: 'arc', t0: now + L.throw, dur, from, to });
      if (Tu) V.impact[Tu.id] = now + L.throw + dur;
      spawnFx(V, { kind: 'puff', t0: now + L.throw + dur, at: to, color: GFX.fx.color.debris });
      break;
    }
    case 'weaponArea': case 'smash': {
      if (!Au) break;
      const melee = e.type === 'smash' || !Au.weapon || !!Au.weapon.melee || (Au.weapon.range || 1) <= 1;
      act(S, V, Au, melee ? 'swing' : 'shoot', tileAim(e.x, e.y));
      const fl = V.world?.floor[e.y * V.world.w + e.x] ?? 0;
      spawnFx(V, { kind: 'ring', t0: now + (melee ? A.swing * 0.5 : L.shoot), at: [e.x + 0.5, fl, e.y + 0.5], r: e.size || 1, color: GFX.fx.color.spark });
      break;
    }
    case 'ability': {
      if (!Au) break;
      const tgt = e.target ? b.byId[e.target] : null;
      const aim = tgt ? posOf(S, tgt) : e.tile ? tileAim(e.tile.x, e.tile.y) : null;
      act(S, V, Au, 'cast', aim);
      const fl = V.world?.floor[Au.y * V.world.w + Au.x] ?? 0, p = posOf(S, Au);
      const ally = tgt && tgt.team === Au.team;
      const color = ally ? GFX.fx.color.heal : GFX.fx.color.cast;
      spawnFx(V, { kind: 'ring', t0: now + 0.1, at: [p.x, fl, p.z], r: 0.6, color });
      if (aim && (tgt !== Au)) {
        const from = handAt(S, V, Au, 0.85), to = tgt ? handAt(S, V, tgt, 0.6) : [aim.x, (V.world?.floor[e.tile.y * V.world.w + e.tile.x] ?? 0) + 0.3, aim.z];
        const dur = fly(from, to, A.castSpeed);
        spawnFx(V, { kind: 'orb', t0: now + L.cast, dur, from, to, color });
        spawnFx(V, { kind: 'ring', t0: now + L.cast + dur, at: [to[0], to[1] - 0.28, to[2]], r: 0.8, color });
        if (tgt) V.impact[tgt.id] = now + L.cast + dur;
      }
      break;
    }
    case 'useItem': case 'trapPlaced': if (Au) act(S, V, Au, 'use', null); break;
    case 'damage': {
      if (!Tu || !(e.amount > 0)) break;
      const s = stOf(V, Tu.id), at = V.impact[Tu.id];
      s.hitT0 = at && at > now - 0.05 && at < now + 1.5 ? at : now;
      s.hitFrom = Au && Au !== Tu ? posOf(S, Au) : null;
      break;
    }
    case 'down': if (Tu) { const s = stOf(V, Tu.id), at = V.impact[Tu.id]; s.downT0 = at && at > now ? at : now; } break;
    case 'death': case 'broken': if (Tu) { const s = stOf(V, Tu.id), at = V.impact[Tu.id]; s.deathT0 = at && at > now && at < now + 1.5 ? at : now; } break;
    case 'objectBreak': {
      const fl = V.world?.floor[e.y * V.world.w + e.x] ?? 0;
      spawnFx(V, { kind: 'puff', t0: now, at: [e.x + 0.5, fl + 0.3, e.y + 0.5], color: GFX.fx.color.debris });
      break;
    }
    case 'surfaceCreate': {
      const d = b.data.surfaces?.[e.kind], fl = V.world?.floor[e.y * V.world.w + e.x] ?? 0;
      if (d) spawnFx(V, { kind: 'ring', t0: now, at: [e.x + 0.5, fl, e.y + 0.5], r: (e.size || 0) + 0.7, color: d.color });
      break;
    }
    case 'summon': {
      const fl = V.world?.floor[e.y * V.world.w + e.x] ?? 0;
      spawnFx(V, { kind: 'ring', t0: now, at: [e.x + 0.5, fl, e.y + 0.5], r: 0.7, color: GFX.fx.color.cast });
      break;
    }
    default:
  }
}

export function animActive(V, now) {
  for (const id in V.anim) {
    const s = V.anim[id];
    if (s.act && now < s.t0 + s.dur + 0.05) return true;
    if (now < s.hitT0 + A.hit || now < s.deathT0 + A.death || now < s.downT0 + A.death) return true;
  }
  return false;
}
export function aimOf(V, id, now) {
  const s = V.anim[id];
  if (!s) return null;
  if (s.act && s.aim && now < s.t0 + s.dur + 0.3) return s.aim;
  return null;
}

// ---------------------------------------------------------------- matrices (3x4 affine, row-major)
const R = new Float32Array(NBONES * 3), OFF = new Float32Array(3);
let KICK = 0; // impulse of the current action / hit for the spring bones
export function modelMatrix(x, y, z, yaw, s, lie = 0, roll = 0, out = new Float32Array(12)) {
  // M = T * Ry(yaw) * Rx(lie) * Rz(roll) * S
  const c = Math.cos(yaw), si = Math.sin(yaw), cl = Math.cos(lie), sl = Math.sin(lie), cr = Math.cos(roll), sr = Math.sin(roll);
  // Rx*Rz
  const m = [cr, -sr, 0, cl * sr, cl * cr, -sl, sl * sr, sl * cr, cl];
  // Ry * m
  const r = [c * m[0] + si * m[6], c * m[1] + si * m[7], c * m[2] + si * m[8], m[3], m[4], m[5], -si * m[0] + c * m[6], -si * m[1] + c * m[7], -si * m[2] + c * m[8]];
  out[0] = r[0] * s; out[1] = r[1] * s; out[2] = r[2] * s; out[3] = x;
  out[4] = r[3] * s; out[5] = r[4] * s; out[6] = r[5] * s; out[7] = y;
  out[8] = r[6] * s; out[9] = r[7] * s; out[10] = r[8] * s; out[11] = z;
  return out;
}
function mul(a, ao, b, bo, out, oo) {
  for (let i = 0; i < 3; i++) {
    const a0 = a[ao + i * 4], a1 = a[ao + i * 4 + 1], a2 = a[ao + i * 4 + 2], a3 = a[ao + i * 4 + 3];
    for (let j = 0; j < 4; j++) out[oo + i * 4 + j] = a0 * b[bo + j] + a1 * b[bo + 4 + j] + a2 * b[bo + 8 + j] + (j === 3 ? a3 : 0);
  }
}
const LOC = new Float32Array(12), TMP = new Float32Array(12 * NBONES);
/** Local bone transform: T(p + off) * Ry * Rx * Rz * T(-p). */
function local(px, py, pz, rx, ry, rz, ox, oy, oz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // Rx*Rz
  const m00 = cz, m01 = -sz, m02 = 0, m10 = cx * sz, m11 = cx * cz, m12 = -sx, m20 = sx * sz, m21 = sx * cz, m22 = cx;
  // Ry * (Rx*Rz)
  const r00 = cy * m00 + sy * m20, r01 = cy * m01 + sy * m21, r02 = cy * m02 + sy * m22;
  const r10 = m10, r11 = m11, r12 = m12;
  const r20 = -sy * m00 + cy * m20, r21 = -sy * m01 + cy * m21, r22 = -sy * m02 + cy * m22;
  LOC[0] = r00; LOC[1] = r01; LOC[2] = r02; LOC[3] = px + ox - (r00 * px + r01 * py + r02 * pz);
  LOC[4] = r10; LOC[5] = r11; LOC[6] = r12; LOC[7] = py + oy - (r10 * px + r11 * py + r12 * pz);
  LOC[8] = r20; LOC[9] = r21; LOC[10] = r22; LOC[11] = pz + oz - (r20 * px + r21 * py + r22 * pz);
  return LOC;
}

// ---------------------------------------------------------------- poses
const set = (b, x, y, z) => { R[b * 3] += x; R[b * 3 + 1] += y; R[b * 3 + 2] += z; };
/** Pose channels of the frame into R (rotations x/y/z per bone) and OFF (pelvis offset). Returns root {lie, roll, sink}. */
function pose(T, st, d, now, flags) {
  R.fill(0); OFF.fill(0); KICK = 0;
  const type = T.type, still = flags.reduceMotion, amp = still ? A.reduce : 1, mechK = type === 'mech' ? 0.6 : 1;
  const tw = Math.PI * 2;
  const root = { lie: 0, roll: 0, sink: 0 };
  // idle: breathing / hovering
  const br = still ? 0 : Math.sin(tw * A.breathHz * now + st.seed * tw);
  OFF[1] += br * A.breath;
  set(BONE.torso, br * 0.02, 0, 0);
  set(BONE.uaL, 0, 0, 0.07 + br * 0.015); set(BONE.uaR, 0, 0, -0.07 - br * 0.015);
  if (type === 'drone' || type === 'spirit') {
    const hb = still ? 0 : Math.sin(tw * A.bobHz * now + st.seed * 5);
    if (T.hover || type === 'spirit') OFF[1] += hb * 0.04;
    if (type === 'drone' && T.hover && !still) { set(BONE.faL, 0, now * 3, 0); set(BONE.faR, 0, -now * 3, 0); } // rotors (0.5 rev/s)
    if (type === 'spirit') { set(BONE.thL, 0.15 + hb * 0.1, 0, 0); set(BONE.thR, 0.15 - hb * 0.1, 0, 0); }
  }
  if (T.anime && !flags.walking && st.iw > 0.01) idlePose(T, st, st.iw, now, tw, still);
  // walk
  if (flags.walking && type !== 'drone') {
    const ph = st.walk * tw / A.walkStride, sw = Math.sin(ph) * A.walkSwing * mechK;
    if (type === 'beast') {
      set(BONE.uaL, -sw, 0, 0); set(BONE.uaR, sw, 0, 0); set(BONE.thL, sw, 0, 0); set(BONE.thR, -sw, 0, 0);
      set(BONE.faL, Math.max(0, Math.cos(ph)) * 0.5, 0, 0); set(BONE.faR, Math.max(0, -Math.cos(ph)) * 0.5, 0, 0);
      OFF[1] += Math.abs(Math.sin(ph)) * A.walkBob;
    } else if (type === 'spirit') {
      set(BONE.torso, 0.12, 0, 0); set(BONE.thL, 0.35, 0, 0); set(BONE.thR, 0.35, 0, 0);
    } else {
      set(BONE.thL, -sw, 0, 0); set(BONE.thR, sw, 0, 0);
      set(BONE.shL, Math.max(0, -Math.cos(ph)) * 0.7 * mechK, 0, 0); set(BONE.shR, Math.max(0, Math.cos(ph)) * 0.7 * mechK, 0, 0);
      set(BONE.uaL, sw * 0.7, 0, 0); set(BONE.uaR, -sw * 0.7, 0, 0);
      set(BONE.faL, -0.25, 0, 0); set(BONE.faR, -0.25, 0, 0);
      OFF[1] += Math.abs(Math.cos(ph)) * A.walkBob * (type === 'mech' ? 1.6 : 1);
      set(BONE.torso, 0.06, T.anime ? -sw * 0.32 : 0, T.anime ? Math.cos(ph) * 0.035 : 0); // arms-legs counter-twist and a hip roll
      if (T.anime) { set(BONE.pelvis, 0, sw * 0.2, 0); set(BONE.head, 0, sw * 0.12, -Math.cos(ph) * 0.03); OFF[0] += Math.cos(ph) * 0.012; }
    }
  } else if (flags.walking && type === 'drone') set(BONE.pelvis, 0.15, 0, 0);
  // action
  if (st.act && now >= st.t0 && now < st.t0 + st.dur) {
    const k = (now - st.t0) / st.dur;
    if (type === 'beast') {
      const lunge = bump(k, 0.25, 0.75);
      set(BONE.pelvis, 0.12 * smooth(k / 0.3) * (1 - smooth((k - 0.6) / 0.4)), 0, 0);
      set(BONE.torso, 0.15 * lunge, 0, 0); set(BONE.head, st.act === 'cast' ? -0.5 * bump(k, 0.1, 0.9) : 0.35 * lunge, 0, 0);
      set(BONE.uaL, -0.6 * lunge, 0, 0); set(BONE.uaR, -0.6 * lunge, 0, 0);
      OFF[2] += A.lunge * 1.4 * lunge * amp;
    } else if (type === 'drone') {
      const rc = bump(k, 0.4, 0.75);
      OFF[2] -= 0.08 * rc * amp; set(BONE.pelvis, -0.12 * rc, 0, 0);
      set(BONE.uaL, -0.2 * bump(k, 0, 1), 0, 0); set(BONE.uaR, -0.2 * bump(k, 0, 1), 0, 0);
    } else {
      const ub = st.act;
      if (ub === 'swing' || ub === 'throw') {
        const up = ub === 'throw' ? 2.6 : 2.4;
        const raise = smooth(k / 0.4), strike = smooth((k - 0.4) / 0.18), back = smooth((k - 0.65) / 0.35);
        const arm = raise * (1 - strike) * -up + strike * (1 - back) * -0.4;
        set(BONE.uaR, ub === 'throw' ? arm + 0.6 * bump(k, 0, 0.3) : arm, 0, -0.2 * raise * (1 - back));
        set(BONE.faR, -0.7 * raise * (1 - strike) - 0.2 * strike * (1 - back), 0, 0);
        set(BONE.torso, -0.08 * raise * (1 - strike) + 0.14 * bump(k, 0.4, 0.8), 0.32 * raise * (1 - strike) - 0.28 * strike * (1 - back), 0);
        set(BONE.uaL, -0.4 * raise * (1 - back), 0, 0.15);
        OFF[2] += A.lunge * bump(k, 0.35, 0.85) * amp * mechK;
        if (T.anime) { OFF[1] -= 0.05 * bump(k, 0.3, 0.75) * amp; set(BONE.pelvis, 0, 0.2 * strike * (1 - back), 0); set(BONE.head, 0.08 * raise * (1 - strike), 0, 0); set(BONE.thR, 0.25 * strike * (1 - back), 0, 0); set(BONE.shR, -0.3 * strike * (1 - back), 0, 0); }
        KICK = bump(k, 0.4, 0.8);
      } else if (ub === 'shoot') {
        const aimK = smooth(k / 0.22) * (1 - smooth((k - 0.75) / 0.25)), rec = bump(k, 0.46, 0.68);
        set(BONE.uaR, -1.45 * aimK - 0.25 * rec, 0, 0.12 * aimK); set(BONE.faR, -0.08 * aimK, 0, 0);
        set(BONE.uaL, -1.15 * aimK, 0, -0.45 * aimK); set(BONE.faL, -0.5 * aimK, 0, 0);
        set(BONE.torso, -A.recoil * rec * amp, 0.1 * aimK, 0); set(BONE.head, -0.06 * rec, 0, 0);
        OFF[2] -= 0.03 * rec * amp; KICK = rec;
      } else if (ub === 'cast') {
        const up = smooth(k / 0.45) * (1 - smooth((k - 0.8) / 0.2)), push = bump(k, 0.45, 0.85);
        set(BONE.uaL, -2.1 * up + 0.6 * push, 0, 0.35 * up); set(BONE.uaR, -2.1 * up + 0.6 * push, 0, -0.35 * up);
        set(BONE.faL, -0.3 * up, 0, 0); set(BONE.faR, -0.3 * up, 0, 0);
        set(BONE.torso, -0.12 * up + 0.18 * push, 0, 0); set(BONE.head, -0.15 * up, 0, 0);
        if (type === 'spirit') OFF[1] += 0.08 * up;
      } else if (ub === 'use') {
        const u2 = bump(k, 0, 1);
        set(BONE.uaR, -0.6 * u2, 0, 0); set(BONE.faR, -1.3 * u2, 0, 0); set(BONE.uaL, -0.5 * u2, 0, 0); set(BONE.faL, -1.2 * u2, 0, 0);
        set(BONE.head, 0.25 * u2, 0, 0);
      }
    }
  }
  // hit: recoil away from the attacker
  const kh = (now - st.hitT0) / A.hit;
  if (kh >= 0 && kh < 1) {
    const h = Math.sin(kh * Math.PI) * (1 - kh * 0.3) * amp;
    set(BONE.torso, -A.hitTilt * h * mechK, 0, 0); set(BONE.head, -0.25 * h, 0, 0);
    set(BONE.uaL, 0.35 * h, 0, 0.2 * h); set(BONE.uaR, 0.35 * h, 0, -0.2 * h);
    OFF[2] -= A.hitPush * h; OFF[1] -= 0.02 * h; KICK = Math.max(KICK, h * 1.4);
  }
  // death / downed: fall backwards (beasts and drones — on the side)
  const fallT = d.dead ? st.deathT0 : d.down ? st.downT0 : null;
  if (fallT != null) {
    const kd = still ? 1 : smooth((now - fallT) / A.death);
    if (type === 'spirit') { root.sink = 0.5 * kd; set(BONE.torso, 0.3 * kd, 0, 0); }
    else if (type === 'beast' || type === 'drone') { root.roll = (Math.PI / 2) * kd; if (T.hover) OFF[1] -= 0.6 * kd; }
    else {
      root.lie = -(Math.PI / 2) * kd * (type === 'mech' ? 0.9 : 1);
      set(BONE.uaL, -0.4 * kd, 0, 0.9 * kd); set(BONE.uaR, -0.4 * kd, 0, -0.9 * kd); set(BONE.head, -0.3 * kd, 0, 0);
      set(BONE.thL, -0.2 * kd, 0, 0.1 * kd); set(BONE.shL, 0.3 * kd, 0, 0);
    }
  }
  return root;
}

const M0 = new Float32Array(12);
// ---------------------------------------------------------------- idle stances (anime humanoids): weight on one leg, class pose
const READY = new Set(['ranger', 'technomant', 'cybertech', 'reper', 'ecolog', 'ugolovnik', 'slavotech', 'itishnik']);
function idlePose(T, st, iw, now, tw, still) {
  const side = st.seed > 0.5 ? 1 : -1, W = side > 0 ? BONE.thL : BONE.thR, Fr = side > 0 ? BONE.thR : BONE.thL, Fs = side > 0 ? BONE.shR : BONE.shL;
  const sw = still ? 0 : Math.sin(tw * 0.13 * now + st.seed * 9) * 0.5;
  OFF[0] += side * 0.016 * iw; OFF[1] -= 0.012 * iw;
  set(W, 0, 0, -side * 0.03 * iw); set(Fr, -0.13 * iw, 0, side * 0.05 * iw); set(Fs, 0.24 * iw, 0, 0);
  set(BONE.torso, 0.015 * iw, 0, -side * 0.05 * iw + sw * 0.01); set(BONE.head, 0.02 * iw, side * 0.06 * iw + sw * 0.03, side * 0.05 * iw);
  const fem = T.fem, cls = T.idle;
  if (T.ranged || (T.hero && READY.has(cls))) { // weapon low-ready: both hands on it
    set(BONE.uaR, -0.62 * iw, 0, 0.05 * iw); set(BONE.faR, -0.55 * iw, 0, 0); set(BONE.uaL, -0.75 * iw, 0, -0.42 * iw); set(BONE.faL, -0.8 * iw, 0, 0);
    set(BONE.torso, 0, 0.1 * iw, 0);
  } else if (T.hero && (cls === 'zabivnoy' || cls === 'mutant')) { // brawler: wide stance, weapon hand up, guard hand forward
    set(BONE.thL, 0, 0, 0.09 * iw); set(BONE.thR, 0, 0, -0.09 * iw); OFF[1] -= 0.03 * iw;
    set(BONE.uaR, -0.35 * iw, 0, -0.18 * iw); set(BONE.faR, -1.0 * iw, 0, 0); set(BONE.uaL, -0.45 * iw, 0, 0.2 * iw); set(BONE.faL, -0.7 * iw, 0, 0);
    set(BONE.torso, 0.04 * iw, -0.16 * iw, 0);
  } else { // casual: one hand on the hip, the other loose (women: chin hand)
    set(BONE.uaR, 0.05 * iw, 0, -0.5 * iw); set(BONE.faR, -0.9 * iw, 0, 0); set(BONE.uaL, 0.08 * iw, 0, 0.12 * iw); set(BONE.faL, -0.25 * iw, 0, 0);
    if (fem) set(BONE.head, 0, 0, 0.04 * iw);
  }
}

// ---------------------------------------------------------------- spring bones (hair, cape, hem, bust, butt): lagging 2nd-order springs
// per bone: [omega, zeta, gain forward (rad per m/s), gain sideways, gain vertical, kind]; kind 'b' — body (settings «Физика тела»)
const SPR = [];
SPR[BONE.hair1] = [9, 0.5, 0.08, 0.06, 0.1, ''];
SPR[BONE.hair2] = [12, 0.45, 0.1, 0.08, 0.12, ''];
SPR[BONE.hair3] = [15, 0.4, 0.12, 0.1, 0.14, ''];
SPR[BONE.sideL] = [11, 0.45, 0.08, 0.1, 0.08, ''];
SPR[BONE.sideR] = [11, 0.45, 0.08, 0.1, 0.08, ''];
SPR[BONE.cloak1] = [8, 0.55, 0.13, 0.08, 0.05, ''];
SPR[BONE.cloak2] = [11, 0.45, 0.2, 0.12, 0.08, ''];
SPR[BONE.skirt] = [10, 0.5, 0.1, 0.08, 0.05, ''];
SPR[BONE.bustL] = [17, 0.22, 0, 0.03, 0.2, 'b'];
SPR[BONE.bustR] = [17, 0.22, 0, 0.03, 0.2, 'b'];
SPR[BONE.buttL] = [15, 0.28, 0.02, 0.05, 0.16, 'b'];
SPR[BONE.buttR] = [15, 0.28, 0.02, 0.05, 0.16, 'b'];
const LIM = 0.55;
function springs(T, st, pos, now, flags) {
  if (!T.anime) return;
  const prev = st.spT;
  st.spT = now;
  const sp = st.sp || (st.sp = new Float32Array(NBONES * 4));
  if (prev == null || now <= prev) { st.spX = pos.x; st.spZ = pos.z; st.spY = OFF[1]; st.spYaw = pos.yaw; return; }
  const dt = Math.min(0.05, now - prev);
  let vx = (pos.x - st.spX) / dt, vz = (pos.z - st.spZ) / dt, vy = (OFF[1] - st.spY) / dt, wy = angDelta(st.spYaw, pos.yaw) / dt;
  st.spX = pos.x; st.spZ = pos.z; st.spY = OFF[1]; st.spYaw = pos.yaw;
  const cl = (v, m) => (v > m ? m : v < -m ? -m : v);
  vx = cl(vx, 6); vz = cl(vz, 6); vy = cl(vy, 1.5); wy = cl(wy, 12);
  const c = Math.cos(pos.yaw), s = Math.sin(pos.yaw);
  const vf = vx * s + vz * c, vs = vx * c - vz * s;
  const k = Math.min(1, dt * 14);
  st.df = (st.df || 0) + (vf - (st.df || 0)) * k; st.ds = (st.ds || 0) + (vs - (st.ds || 0)) * k; st.dy = (st.dy || 0) + (vy - (st.dy || 0)) * k; st.dw = (st.dw || 0) + (wy - (st.dw || 0)) * k;
  const phys = flags.physics ?? 1, calm = flags.reduceMotion ? 0.35 : 1, tw = Math.PI * 2;
  const steps = Math.ceil(dt / 0.016);
  for (let b = 11; b < NBONES; b++) {
    const P = SPR[b];
    if (!P) continue;
    const body = P[5] === 'b', amp = (body ? phys : 1) * calm;
    const o = b * 4;
    if (amp <= 0) { sp[o] = sp[o + 1] = sp[o + 2] = sp[o + 3] = 0; continue; }
    const side = b % 2 ? 1 : -1;
    const tx = amp * (P[2] * st.df + P[4] * st.dy * (body ? 1 : -0.4) + KICK * (body ? 0.12 : 0.3)) + (body ? 0 : 0.02 * Math.sin(tw * 0.22 * now + b));
    const tz = amp * (-P[3] * st.ds + (body ? 0 : -st.dw * 0.025 * side * 0)) + (body ? 0.0 : 0.025 * Math.sin(tw * 0.17 * now + b * 1.7));
    const w0 = P[0], z2 = 2 * P[1] * w0, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      sp[o + 2] += (w0 * w0 * (tx - sp[o]) - z2 * sp[o + 2]) * h; sp[o] += sp[o + 2] * h;
      sp[o + 3] += (w0 * w0 * (tz - sp[o + 1]) - z2 * sp[o + 3]) * h; sp[o + 1] += sp[o + 3] * h;
    }
    sp[o] = cl(sp[o], LIM); sp[o + 1] = cl(sp[o + 1], LIM);
    R[b * 3] += sp[o]; R[b * 3 + 2] += sp[o + 1];
  }
}
const angDelta = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/**
 * Bone matrices of one instance into out[o .. o + 12 * NBONES): world = model(x, y, z, yaw, scale, root lie/roll) * chain.
 * d — display state + {dead, down}; flags — {walking, reduceMotion, physics}.
 */
export function poseBones(T, st, d, now, pos, out, o, flags) {
  if (st.iw == null) st.iw = 1;
  const busy = !!(st.act && now >= st.t0 && now < st.t0 + st.dur + 0.15) || d.dead || d.down;
  st.iw += ((busy || flags.walking ? 0 : 1) - st.iw) * 0.12;
  const root = pose(T, st, d, now, flags);
  springs(T, st, pos, now, flags);
  let y = pos.y - root.sink;
  if (root.lie) y += 0.12 * Math.abs(Math.sin(root.lie)) * T.scale; // back thickness: stays above the floor
  if (root.roll) y += 0.1 * Math.abs(Math.sin(root.roll)) * T.scale;
  modelMatrix(pos.x, y, pos.z, pos.yaw, T.scale, root.lie, root.roll, M0);
  const pv = T.pivots;
  for (let b = 0; b < NBONES; b++) {
    const off = b === 0 ? OFF : null;
    const L = local(pv[b * 3], pv[b * 3 + 1], pv[b * 3 + 2], R[b * 3], R[b * 3 + 1], R[b * 3 + 2], off ? off[0] : 0, off ? off[1] : 0, off ? off[2] : 0);
    const p = PARENT[b];
    if (p < 0) mul(M0, 0, L, 0, TMP, b * 12);
    else mul(TMP, p * 12, L, 0, TMP, b * 12);
  }
  for (let k = 0; k < 12 * NBONES; k++) out[o + k] = TMP[k];
}

/** Walk phase: distance travelled by the display position (call once per frame). */
export function trackWalk(V, id, x, z) {
  const s = stOf(V, id);
  if (s.lx != null) s.walk += Math.hypot(x - s.lx, z - s.lz);
  s.lx = x; s.lz = z;
  return s;
}
export const animState = stOf;
