// Long robes / coats vs boots (backlog: boot tip under a robe): GLB robe models walking (side view, springs stepped),
// two phases each -> tools/out/three-robe[-tag].png. node tools/out/three-robe.mjs [tag] [clip]
import { open } from './v3-harness.mjs';
const tag = process.argv[2] || 'now', clip = process.argv[3] || 'walk';
const T = await open({ w: 1500, h: 560, query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot } = T;
await wait(600);
await page.evaluate(async (clip) => {
  const THREE = await import('three');
  const C = await import('/game/src/three/character.js');
  document.querySelectorAll('canvas').forEach((c) => (c.style.visibility = 'hidden'));
  const cv = document.createElement('canvas'); cv.width = 1500; cv.height = 560; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99';
  document.body.appendChild(cv);
  const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); rd.setSize(1500, 560, false); rd.setClearColor(0x5b6175);
  rd.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x7080a0, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(2, 4, 3); sc.add(dl);
  const specs = ['cyberpriest', 'arbitrazh'].map((n) => C.npcSpec(n)).concat([C.enemySpec('cultist')]);
  const cs = [];
  let x = -2.8;
  for (const s of specs) for (const ph of [0.05, 0.2, 0.35]) {
    const c = await C.assembleCharacter(s);
    C.toonify(c, { tint: s.tint, outline: true });
    c.root.position.x = x; x += 0.7; c.root.rotation.y = Math.PI / 2; sc.add(c.root);
    c.inst.play(clip); cs.push({ c, ph });
  }
  for (const { c, ph } of cs) {
    const len = c.inst.clips.get(clip)?.duration || 1;
    for (let t = 0, end = len * (2 + ph); t < end; t += 1 / 30) { c.inst.update(1 / 30); c.root.updateMatrixWorld(true); C.stepSprings(c, 1 / 30, 1); }
  }
  const cam = new THREE.PerspectiveCamera(30, 1500 / 560, 0.1, 50); cam.position.set(0, 0.35, 5.2); cam.lookAt(0, 0.35, 0);
  for (let i = 0; i < 2; i++) { rd.render(sc, cam); await new Promise((r) => setTimeout(r, 120)); }
}, clip);
await shot(`three-robe-${tag}`);
console.log('errors', errors.length, errors.slice(0, 3));
await T.close();
