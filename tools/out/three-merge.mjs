// Body merge check (docs/perf.md pass 3, three/character.js mergeBodies): heroes / NPCs / mechanical bodies / enemies assembled
// and toon-shaded twice — HERO_MODELS.mergeBodies off (one draw per sub-mesh) and on (atlas + per-vertex slot) — with faces,
// shape keys, tints and spring bones; per group: draw calls off / on, pixel difference; side-by-side PNG
// tools/out/three-merge-<group>.png (top: off, bottom: on). Exit 1 on console errors or a visible difference.
// node tools/out/three-merge.mjs [--only heroes,npcs,mech,enemies] [--clip walk] [--far 3]
import fs from 'node:fs';
import path from 'node:path';
import { open, root } from './v3-harness.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('--only')?.split(',') || ['heroes', 'npcs', 'mech', 'enemies'];
const clip = arg('--clip') || 'idle';
const far = +(arg('--far') || 1); // camera distance x this (mip levels of the atlas)
const W = 1500, H = 520;
const T = await open({ w: W, h: H, query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait } = T;
await wait(600);
let fails = 0;
for (const group of only) {
  const r = await page.evaluate(async ({ group, clip, W, H, far }) => {
    const THREE = await import('three');
    const C = await import('/game/src/three/character.js');
    const A = await import('/game/src/ui/avatar3d.js');
    const { HERO_MODELS: HM } = await import('/game/src/data/hero-models.js');
    const hero = (race, sex, seed, o) => ({ raceId: race, name: seed, avatar: { ...A.defaultLook(race, sex, seed), ...o } });
    const G = {
      heroes: () => [
        C.heroSpec(hero('human', 'f', 'h1', { hair: 'long', hairColor: 'pink', outfit: 'scout', cloth: 'f', bust: 0.3 })),
        C.heroSpec(hero('human', 'm', 'h2', { hair: 'mohawk', outfit: 'warden', cloth: 'd' })),
        C.heroSpec(hero('human', 'f', 'h3', { hair: 'bun', outfit: 'technician', cloth: '6' })),
        C.heroSpec(hero('human', 'm', 'h4', { hair: 'afro', outfit: 'pirate', cloth: 'k' })),
        C.heroSpec(hero('mutant-plant', 'f', 'h5', { hair: 'tail', outfit: 'cultist' })),
        C.heroSpec(hero('tekhonok', 'm', 'h6', { hair: 'spiky', outfit: 'bulwark', build: 'sturdy' })),
        C.heroSpec(hero('human', 'f', 'h7', { hair: 'dreads', outfit: 'renegade', cloth: 'i' })),
      ],
      npcs: () => [C.npcSpec('lox'), C.npcSpec('arbitrazh'), C.npcSpec('ladov'), C.npcSpec('cyberpriest'),
        C.npcSpec('trader', { cloth: 'g', coat: '8', pants: '2', skin: '9', hair: '7' }), C.npcSpec('settler', { cloth: 'm', coat: '7', pants: 'l', skin: '8', hair: '1' }),
        C.npcSpec('guard', { cloth: '2', coat: 'l', pants: '6', skin: '7', hair: '5' })],
      mech: () => [
        C.heroSpec(hero('skeleton', 'f', 's36', { skin: 16, eyes: 'red', hair: 'bald', outfit: 'scout' })),
        C.heroSpec(hero('skeleton', 'm', 's87', { skin: 15, eyes: 'red', hair: 'bald', outfit: 'cultist' })),
        C.heroSpec(hero('android', 'f', 's63', { skin: 14, eyes: 'cyan', hair: 'bald', outfit: 'technician' })),
        C.heroSpec(hero('android', 'm', 's97', { skin: 13, eyes: 'violet', hair: 'bald', outfit: 'warden' })),
        C.enemySpec('android', {}), C.enemySpec('android', { mul: '4' }),
      ],
      enemies: () => [C.enemySpec('cultist', { cloth: 'd' }), C.enemySpec('pirate', { cloth: '7', coat: 'c', pants: '1', skin: '9' }),
        C.enemySpec('brute', { skin: 'j', cloth: 'm' }), C.enemySpec('wolf', { mul: '4' }), C.enemySpec('drone', { mul: 'l' }),
        C.enemySpec('walker', {}), C.enemySpec('fox', {})],
    };
    const specs = G[group]();
    document.querySelectorAll('canvas').forEach((c) => (c.style.visibility = 'hidden'));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99';
    document.body.appendChild(cv);
    const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); rd.setSize(W, H, false); rd.setClearColor(0x5b6175);
    rd.outputColorSpace = THREE.SRGBColorSpace; rd.shadowMap.enabled = true;
    const shots = [], calls = [];
    for (const merge of [false, true]) {
      HM.mergeBodies = merge;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x7080a0, 1.6));
      const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(2, 4, 3); dl.castShadow = true; sc.add(dl);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.MeshLambertMaterial({ color: 0x8a8f9a })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; sc.add(fl);
      const cs = [];
      const n = specs.length;
      for (let i = 0; i < n; i++) {
        const s = specs[i], c = await C.assembleCharacter(s);
        const EM = s.enemy && HM.enemy.models[s.enemy], ET = s.enemy && HM.enemy.tint[s.enemy];
        C.toonify(c, { tint: s.tint, outline: true, ...(EM && { glow: HM.enemy.glow, glowK: HM.enemy.glowK, mulRe: ET?.mulRe, mulK: ET?.mulK, faceSkin: EM.faceSkin ? HM.enemy.faceRef : null }) });
        C.setBodyShape(c, s.shape);
        if (c.faces.length) C.setFace(c, i % 2 ? 'happy' : 'neutral', i % 2 ? { happy: 0.8 } : {}, i === 2 ? 1 : 0);
        c.root.position.x = (i - (n - 1) / 2) * (group === 'enemies' ? 1.9 : 1.35);
        c.root.rotation.y = 0.35;
        sc.add(c.root);
        const cl = c.inst.clips.has(clip) ? clip : [...c.inst.clips.keys()].find((k) => /idle|move|walk/.test(k));
        c.inst.play(cl); c.inst.update(0.4); c.root.updateMatrixWorld(true);
        for (let k = 0; k < 20; k++) { c.inst.update(1 / 30); c.root.updateMatrixWorld(true); C.stepSprings(c, 1 / 30, 1); }
        cs.push(c);
      }
      const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50); cam.position.set(0, 1.1, (group === 'enemies' ? 9.5 : 7.5) * far); cam.lookAt(0, 0.9, 0);
      for (let k = 0; k < 2; k++) { rd.render(sc, cam); await new Promise((r) => setTimeout(r, 100)); }
      // body draw calls without the shadow pass: render once more with shadows off
      rd.shadowMap.autoUpdate = false; rd.info.reset(); rd.info.autoReset = false; rd.render(sc, cam); calls.push(rd.info.render.calls); rd.info.autoReset = true; rd.shadowMap.autoUpdate = true;
      rd.render(sc, cam);
      shots.push(cv.toDataURL('image/png'));
      for (const c of cs) { sc.remove(c.root); C.disposeCharacter(c); }
    }
    HM.mergeBodies = true;
    // difference + side-by-side
    const img = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
    const [a, b] = await Promise.all(shots.map(img));
    const o = document.createElement('canvas'); o.width = W; o.height = H * 2;
    const g = o.getContext('2d'); g.drawImage(a, 0, 0); g.drawImage(b, 0, H);
    const da = g.getImageData(0, 0, W, H).data, db = g.getImageData(0, H, W, H).data;
    let sum = 0, big = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      sum += d; if (d > 24) big++; if (d > max) max = d;
    }
    rd.dispose(); cv.remove();
    return { calls, mean: sum / (W * H), big: big / (W * H), max, png: o.toDataURL('image/png'), specs: specs.map((s) => s.base) };
  }, { group, clip, W, H, far });
  const file = path.join(root, 'tools', 'out', `three-merge-${group}${far !== 1 ? '-far' : ''}.png`);
  fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
  const bad = r.big > 0.002;
  if (bad) fails++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${group}: draw calls ${r.calls[0]} -> ${r.calls[1]}, mean diff ${r.mean.toFixed(3)}, px > 24: ${(r.big * 100).toFixed(3)} %, max ${r.max} (${r.specs.join(' ')})`);
}
console.log('errors', errors.length, errors.slice(0, 3));
await T.close();
process.exit(errors.length || fails ? 1 : 0);
