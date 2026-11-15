// Robo-wolves of the Warprom «Wolf» project (data/enemies-v3.js wolf-*, tags mechanical / hybrid): a metal quadruped with
// piston joints, a sensor-visor head and a role kit, so that it reads as a combat robot and not as a beast:
//   runner (wolf-1)   steel jaws, plain chassis            driver (wolf-2, ranged) twin needle turret on the back
//   fang (wolf-3)     olive armour plates, blade fangs, carbine     howler (wolf-4)  mast antenna + dish + horn
//   matyorny (wolf-5) heavy plates + belt-fed gun          alpha (boss-wolf-0) bigger, crest blades, red core
// Same 11-bone layout as the beast (gfx/units3d.js beast()), rigid skinning, no new palette colours.
import { loft, limb, beam, tube } from './gear3d.js';
import { ramp } from './models.js';
import { rampRGB } from './mesh.js';

const glowR = (k) => rampRGB([k, k, k]);

/** Which role kit a unit gets: 'driver' | 'fang' | 'howler' | 'heavy' | 'alpha' | 'runner'. */
export function roboRole(base, tags, def) {
  if (/boss-wolf/.test(base)) return 'alpha';
  if (/wolf-5/.test(base)) return 'heavy';
  if (/wolf-4|howler/.test(base)) return 'howler';
  if (/wolf-3|fang/.test(base) || tags.includes('hybrid')) return 'fang';
  if (/wolf-2|driver/.test(base) || (def?.ai === 'ranged' && (def.weapon?.range || 1) > 2)) return 'driver';
  return 'runner';
}

export function roboWolf(o, BONE, role) {
  const { mb, P, lod, base } = o;
  const big = role === 'alpha' ? 1.18 : role === 'heavy' ? 1.1 : 1;
  const rS = ramp('3'), rD = ramp('2'), rK = ramp('1'), rC = ramp('4'), rW = ramp('5');
  const rP = role === 'runner' || role === 'driver' || role === 'howler' ? ramp('3') : ramp('l'); // armour plates: olive (warprom) on fighters
  const rHead = ramp('3');
  const eye = glowR('c'), lamp = glowR('h');
  const y = 0.42 * big, L = 0.32 * big, cy0 = y + 0.05;
  P(BONE.pelvis, 0, y, -0.15); P(BONE.torso, 0, y, 0.0); P(BONE.head, 0, y + 0.12, L + 0.04);
  P(BONE.uaL, 0.13, y - 0.04, L * 0.7); P(BONE.faL, 0.13, y * 0.5, L * 0.7); P(BONE.uaR, -0.13, y - 0.04, L * 0.7); P(BONE.faR, -0.13, y * 0.5, L * 0.7);
  P(BONE.thL, 0.13, y - 0.04, -L); P(BONE.shL, 0.13, y * 0.5, -L); P(BONE.thR, -0.13, y - 0.04, -L); P(BONE.shR, -0.13, y * 0.5, -L);
  const seg = lod ? 6 : 8;

  // ---- rear chassis: haunch block, exhaust, cable tail
  mb.setBone(BONE.pelvis);
  loft(mb, [{ y: -L - 0.17, rx: 0.1, rz: 0.1, cy: cy0 - 0.02, ao: 0.3 }, { y: -L - 0.03, rx: 0.17, rz: 0.15, cy: cy0 }, { y: 0.02, rx: 0.15, rz: 0.14, cy: cy0 + 0.01, ao: 0.1 }], rS, { seg, axis: 'z', capBot: true });
  loft(mb, [{ y: -L - 0.1, rx: 0.07, rz: 0.04, cy: cy0 + 0.13 }, { y: -L + 0.12, rx: 0.14, rz: 0.04, cy: cy0 + 0.14 }], rP, { seg, axis: 'z', capBot: true, capTop: true }); // rump plate
  mb.cyl(0, cy0 - 0.01, -L - 0.215, 0.05, 0.045, rK, { axis: 'z', seg: 7, r1: 0.05 }); // exhaust ring
  mb.cyl(0, cy0 - 0.01, -L - 0.2, 0.012, 0.03, glowR('e'), { axis: 'z', seg: 6, glow: true });
  if (!lod) {
    for (let k = 0; k < 4; k++) { const z = -L - 0.2 - k * 0.09; tube(mb, [0, cy0 + 0.0 - k * 0.012, z], [0, cy0 - 0.012 - k * 0.012, z - 0.085], 0.024 - k * 0.003, 0.02 - k * 0.003, k % 2 ? rD : rK, { seg: 5 }); }
    mb.cyl(0, cy0 - 0.06, -L - 0.62, 0.05, 0.018, lamp, { axis: 'z', seg: 4, r1: 0, glow: true });
  }

  // ---- torso: three armour segments over a dark core (reads as plates and joints, not as a ball)
  mb.setBone(BONE.torso);
  loft(mb, [{ y: -0.02, rx: 0.1, rz: 0.1, cy: cy0, ao: 0.2 }, { y: L + 0.04, rx: 0.1, rz: 0.1, cy: cy0 + 0.02 }], rK, { seg: 6, axis: 'z', capBot: true });
  const plates = [[-0.01, 0.12, 0.16], [0.13, 0.27 * big, 0.185], [0.27 * big + 0.015, L + 0.06, 0.2]];
  plates.forEach(([a, b, r], i) => {
    const pl = i === 1 || role === 'fang' || role === 'heavy' || role === 'alpha' ? rP : rS;
    loft(mb, [{ y: a, rx: r * 0.9, rz: r * 0.85, cy: cy0 + 0.02, ao: 0.25 }, { y: (a + b) / 2, rx: r, rz: r * 0.95, cy: cy0 + 0.035 }, { y: b, rx: r * 0.9, rz: r * 0.85, cy: cy0 + 0.02, ao: 0.1 }], pl, { seg, axis: 'z', capBot: true, capTop: true });
  });
  mb.cyl(-0.05, cy0 + 0.0, 0.03, 0.1, 0.03, rD, { axis: 'x', seg: 6 }); // flank hatch
  if (!lod) { // dorsal spine blades + side vents
    for (let k = 0; k < 4; k++) mb.cyl(0, cy0 + 0.16, 0.02 + k * 0.1, 0.07 - k * 0.006, 0.026, rD, { seg: 4, r1: 0.004, ao: 0 });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) mb.box(s * 0.185 - (s > 0 ? 0 : 0.012), cy0 - 0.02, 0.04 + k * 0.1, s * 0.185 + (s > 0 ? 0.012 : 0), cy0 + 0.04, 0.07 + k * 0.1, rK, { ao: 0 });
  }
  // collar ring + status lamp
  loft(mb, [{ y: L + 0.0, rx: 0.15, rz: 0.15, cy: cy0 + 0.04 }, { y: L + 0.075, rx: 0.14, rz: 0.14, cy: cy0 + 0.05 }], rK, { seg, axis: 'z', capTop: true, capBot: true });
  mb.cyl(0.0, cy0 + 0.2, 0.0, 0.018, 0.03, role === 'alpha' ? eye : lamp, { seg: 6, glow: true, bottom: true });

  // ---- role kit on the back
  if (role === 'driver') { // twin needle turret: swivel base, armoured body, two barrels, ammo drum
    mb.cyl(0, cy0 + 0.17, -0.02, 0.06, 0.125, rK, { seg: 10, bottom: true });
    loft(mb, [{ y: cy0 + 0.23, rx: 0.11, rz: 0.12, ao: 0.3 }, { y: cy0 + 0.31, rx: 0.125, rz: 0.14 }, { y: cy0 + 0.37, rx: 0.08, rz: 0.1 }, { y: cy0 + 0.395, rx: 0.03, rz: 0.04 }].map((r) => ({ ...r, z: -0.02, rx: r.rx * 1.2, rz: r.rz * 1.2 })), rS, { seg: 10 });
    for (const s of [-1, 1]) {
      tube(mb, [s * 0.045, cy0 + 0.32, 0.05], [s * 0.045, cy0 + 0.32, 0.5], 0.022, 0.016, rD, { seg: 6 });
      tube(mb, [s * 0.045, cy0 + 0.32, 0.48], [s * 0.045, cy0 + 0.32, 0.58], 0.012, 0.012, rC, { seg: 5 });
      mb.cyl(s * 0.045, cy0 + 0.32, 0.585, 0.012, 0.008, glowR('e'), { axis: 'z', seg: 4, glow: true });
      if (!lod) loft(mb, [{ y: 0.18, rx: 0.04, rz: 0.04, x: s * 0.09, cy: cy0 + 0.25 }, { y: 0.24, rx: 0.05, rz: 0.05, x: s * 0.09, cy: cy0 + 0.25 }, { y: 0.3, rx: 0.04, rz: 0.04, x: s * 0.09, cy: cy0 + 0.25 }], rK, { seg: 7, axis: 'z', capBot: true, capTop: true }); // magazines
    }
    mb.cyl(0, cy0 + 0.4, 0.04, 0.05, 0.018, lamp, { axis: 'z', seg: 5, glow: true }); // sight
  } else if (role === 'howler') { // mast antenna, dish, horn, whips
    tube(mb, [0.06, cy0 + 0.14, -0.04], [0.06, cy0 + 0.5, -0.06], 0.02, 0.012, rD, { seg: 6 });
    mb.cyl(0.06, cy0 + 0.5, -0.06, 0.03, 0.012, lamp, { seg: 5, glow: true, bottom: true });
    loft(mb, [{ y: cy0 + 0.3, rx: 0.005, rz: 0.005, x: -0.05, z: 0.0 }, { y: cy0 + 0.34, rx: 0.13, rz: 0.13, x: -0.05, z: 0.0 }, { y: cy0 + 0.37, rx: 0.15, rz: 0.15, x: -0.05, z: 0.0 }], rC, { seg: 9, capTop: false }); // dish
    tube(mb, [-0.05, cy0 + 0.14, 0.0], [-0.05, cy0 + 0.32, 0.0], 0.018, 0.014, rD, { seg: 5 });
    mb.cyl(-0.05, cy0 + 0.35, 0.0, 0.02, 0.016, glowR('c'), { seg: 5, glow: true, bottom: true });
    mb.cyl(0, cy0 + 0.1, 0.2, 0.17, 0.05, rD, { axis: 'z', seg: 8, r1: 0.095, bottom: true }); // loud-speaker horn
    for (const s of [-1, 1]) tube(mb, [s * 0.12, cy0 + 0.1, -0.1], [s * 0.2, cy0 + 0.46, -0.2], 0.008, 0.004, rC, { seg: 4 });
  } else if (role === 'fang' || role === 'heavy' || role === 'alpha') { // side armour plates + shoulder gun
    for (const s of [-1, 1]) loft(mb, [{ y: 0.02, rx: 0.03, rz: 0.1, x: s * 0.185, cy: cy0 + 0.02, ao: 0.3 }, { y: L * 0.5, rx: 0.048, rz: 0.14, x: s * 0.19, cy: cy0 + 0.04 }, { y: L * 0.95, rx: 0.03, rz: 0.1, x: s * 0.185, cy: cy0 + 0.02 }], rP, { seg: 7, axis: 'z', capBot: true, capTop: true });
    if (role !== 'alpha') {
      const heavy = role === 'heavy', zr = heavy ? 0.52 : 0.4;
      loft(mb, [{ y: -0.06, rx: 0.05, rz: 0.045, cy: cy0 + 0.2, ao: 0.3 }, { y: 0.2, rx: 0.06, rz: 0.06, cy: cy0 + 0.205 }, { y: 0.26, rx: 0.05, rz: 0.05, cy: cy0 + 0.2 }], rD, { seg: 7, axis: 'z', capBot: true, capTop: true }); // receiver
      tube(mb, [0, cy0 + 0.2, 0.25], [0, cy0 + 0.2, L + zr], heavy ? 0.026 : 0.018, 0.016, rK, { seg: 6 });
      tube(mb, [0, cy0 + 0.2, L + zr - 0.05], [0, cy0 + 0.2, L + zr + 0.07], 0.024, 0.024, rC, { seg: 6 }); // muzzle brake
      mb.cyl(0, cy0 + 0.1, 0.02, 0.06, 0.03, rD, { seg: 6, bottom: true }); // mount
      if (heavy) loft(mb, [{ y: -0.05, rx: 0.07, rz: 0.07, x: 0.11, cy: cy0 + 0.14 }, { y: 0.0, rx: 0.1, rz: 0.1, x: 0.11, cy: cy0 + 0.14 }, { y: 0.14, rx: 0.1, rz: 0.1, x: 0.11, cy: cy0 + 0.14 }, { y: 0.19, rx: 0.07, rz: 0.07, x: 0.11, cy: cy0 + 0.14 }], rP, { seg: 8, axis: 'z', capBot: true, capTop: true }); // ammo drum
    } else { // crest of blades + red core
      for (let k = 0; k < 5; k++) mb.cyl(0, cy0 + 0.17 + (k % 2) * 0.02, -0.12 + k * 0.1, 0.16 - k * 0.012, 0.03, rK, { seg: 4, r1: 0.004, ao: 0 });
      mb.cyl(0, cy0 + 0.14, 0.08, 0.02, 0.07, eye, { seg: 8, glow: true, bottom: true });
    }
  }

  // ---- head: sensor muzzle, visor bar, sensor fins, lower jaw with fangs
  mb.setBone(BONE.head);
  const hy = y + 0.14;
  loft(mb, [{ y: L + 0.02, rx: 0.1, rz: 0.1, cy: hy }, { y: L + 0.16, rx: 0.135, rz: 0.12, cy: hy + 0.005 }, { y: L + 0.28, rx: 0.085, rz: 0.075, cy: hy - 0.025 }, { y: L + 0.4, rx: 0.05, rz: 0.04, cy: hy - 0.05 }], rHead, { seg: 8, axis: 'z', capTop: true });
  mb.bevelBox(-0.105, hy + 0.025, L + 0.08, 0.105, hy + 0.1, L + 0.24, 0.02, rK, { ao: 0 }); // visor housing
  mb.box(-0.09, hy + 0.045, L + 0.08, 0.09, hy + 0.08, L + 0.245, eye, { glow: true, ao: 0 }); // glowing visor bar
  if (!lod) mb.cyl(0, hy + 0.0, L + 0.38, 0.05, 0.016, role === 'alpha' ? eye : lamp, { axis: 'z', seg: 5, glow: true }); // nose sensor
  for (const s of [-1, 1]) {
    beam(mb, [s * 0.075, hy + 0.1, L + 0.04], [s * 0.115, hy + 0.27 * (role === 'howler' ? 1.3 : 1), L - 0.03], 0.04, 0.012, rD); // sensor fin
    if (!lod) mb.box(s * 0.115 - 0.012, hy + 0.265, L - 0.045, s * 0.115 + 0.012, hy + 0.285, L - 0.02, lamp, { glow: true, ao: 0 });
  }
  const fang = role === 'fang' || role === 'alpha' ? 1.7 : 1;
  loft(mb, [{ y: L + 0.06, rx: 0.075, rz: 0.03, cy: hy - 0.1 }, { y: L + 0.25, rx: 0.065, rz: 0.028, cy: hy - 0.1 }, { y: L + 0.38, rx: 0.03, rz: 0.02, cy: hy - 0.09 }], rD, { seg: 6, axis: 'z', capTop: true, capBot: true }); // lower jaw
  for (const s of [-1, 1]) for (const [z, h] of [[L + 0.3, 0.07], [L + 0.37, 0.05]]) mb.cyl(s * 0.04, hy - 0.085, z, h * fang, 0.014, rW, { seg: 3, r1: 0, ao: 0 }); // blade fangs
  if (!lod) for (const s of [-1, 1]) mb.cyl(s * 0.035, hy - 0.04, L + 0.33, 0.05 * fang, 0.011, rW, { seg: 3, r1: 0, ao: 0, bottom: true }); // upper fangs

  // ---- legs: armoured thigh + piston, knee joint, slim shin, steel paw with claws
  for (const [ua, fa, x, z, hind] of [[BONE.uaL, BONE.faL, 0.14, L * 0.7, 0], [BONE.uaR, BONE.faR, -0.14, L * 0.7, 0], [BONE.thL, BONE.shL, 0.14, -L, 1], [BONE.thR, BONE.shR, -0.14, -L, 1]]) {
    const s = x > 0 ? 1 : -1;
    mb.setBone(ua);
    mb.cyl(x + s * 0.03, y + 0.0, z, 0.075, 0.062, rK, { axis: 'x', seg: 8, rot: 0.4 }); // hip joint
    limb(mb, x, z, y + 0.03, y * 0.5, hind ? 0.088 : 0.074, 0.05, rS, { seg: 7, bulge: 0.4 });
    if (!lod) tube(mb, [x + s * 0.06, y - 0.02, z + (hind ? -0.045 : 0.045)], [x + s * 0.045, y * 0.5 + 0.02, z + (hind ? 0.05 : -0.03)], 0.012, 0.012, rC, { seg: 5 }); // piston rod
    if (!lod) tube(mb, [x + s * 0.062, y - 0.02, z + (hind ? -0.047 : 0.047)], [x + s * 0.055, y * 0.5 + 0.12, z + (hind ? -0.012 : 0.012)], 0.02, 0.018, rD, { seg: 5 }); // piston sleeve
    mb.setBone(fa);
    mb.cyl(x - s * 0.05, y * 0.5 + 0.0, z + (hind ? 0.0 : 0), 0.1, 0.045, rK, { axis: 'x', seg: 8, rot: 0.4 }); // knee
    limb(mb, x, z + (hind ? 0.03 : 0), y * 0.5 + 0.01, 0.05, 0.05, 0.034, rD, { seg: 6, ao: 0.3 });
    if (!lod) tube(mb, [x + s * 0.045, y * 0.5 - 0.01, z + (hind ? 0.065 : -0.015)], [x + s * 0.04, 0.07, z + (hind ? 0.07 : 0.045)], 0.009, 0.009, rC, { seg: 4 });
    loft(mb, [{ y: z - 0.03, rx: 0.04, rz: 0.012, x, cy: 0.012, ao: 0.4 }, { y: z + 0.03, rx: 0.05, rz: 0.032, x, cy: 0.03 }, { y: z + 0.1, rx: 0.036, rz: 0.018, x, cy: 0.016 }], rK, { seg: 6, axis: 'z', capBot: true, capTop: true }); // paw pad
    if (!lod) for (const q of [-1, 0, 1]) mb.cyl(x + q * 0.026, 0.012, z + 0.1, 0.045, 0.011, rW, { axis: 'z', seg: 3, r1: 0, ao: 0 });
  }
  return y + (role === 'howler' ? 0.62 : role === 'driver' ? 0.52 : 0.34);
}
