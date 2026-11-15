// Close-ups of heroes / companions for art review (tools/out/models-close.png). node tools/out/models-close.mjs [front|side]
import fs from 'node:fs';
import path from 'node:path';
import { open, root } from './v3-harness.mjs';
const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const yaw = Number(process.argv[2] === 'side' ? 90 : 15);
const res = await T.page.evaluate(async (yaw) => {
  const { renderSheet } = await import('/game/src/gfx/viewer.js');
  const MEL = ['knife', 'sword', 'hammer'];
  const H = (race, cls, gender, armor, wt, name, look = {}) => ({ kind: 'hero', team: 'heroes', raceId: race, classId: cls, armorType: armor, name, id: name, offhand: null,
    avatar: { v: 1, race, gender, skin: 1, face: { w: 0, j: 0, h: 0 }, hair: gender === 'f' ? 'long' : 'short', hairColor: 'brown', beard: 'none', eyes: 'blue', acc: [], cloth: null, ...look },
    weapon: wt ? { type: wt, melee: MEL.includes(wt), range: MEL.includes(wt) ? 1 : 6 } : null });
  const cells = [
    { label: 'f cloth arbiter', u: H('human', 'arbiter', 'f', 'cloth', 'sword', 'f1', { hair: 'long', hairColor: 'blond', eyes: 'blue', skin: 0 }), zoom: 2.6, focus: 1.1 },
    { label: 'm cloth arbiter', u: H('human', 'arbiter', 'm', 'cloth', 'sword', 'm1', { hair: 'fringe', hairColor: 'black', skin: 2 }), zoom: 2.6, focus: 1.1 },
    { label: 'f light', u: H('human', 'ranger', 'f', 'light', 'pistol', 'f2', { hair: 'tail', hairColor: 'brown', eyes: 'amber', skin: 1 }), zoom: 2.6, focus: 1.1 },
    { label: 'f medium', u: H('human', 'cybertech', 'f', 'medium', 'laser', 'f3', { hair: 'short', hairColor: 'pink', eyes: 'cyan', skin: 3 }), zoom: 2.6, focus: 1.1 },
  ];
  const s = renderSheet(cells, { cols: 4, cw: 330, ch: 420, yaw, pitch: 10 });
  return s.canvas.toDataURL('image/png').split(',')[1];
}, yaw);
fs.writeFileSync(path.join(root, 'tools/out/models-close.png'), Buffer.from(res, 'base64'));
console.log(T.errors.length ? T.errors : 'ok');
await T.close();
