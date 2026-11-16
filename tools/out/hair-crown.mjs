// Crown of short haircuts seen from above (gfx/body3d.js cap: no see-through seam). tools/out/hair-crown.png
import fs from 'node:fs';
import path from 'node:path';
import { open, root } from './v3-harness.mjs';
const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = await T.page.evaluate(async () => {
  const { renderSheet } = await import('/game/src/gfx/viewer.js');
  const H = (gender, hair, name) => ({ kind: 'hero', team: 'heroes', raceId: 'human', classId: 'ranger', armorType: 'light', name, id: name, offhand: null,
    avatar: { v: 1, race: 'human', gender, skin: 5, face: { w: 0, j: 0, h: 0 }, hair, hairColor: 'black', beard: 'none', eyes: 'blue', acc: [], cloth: null }, weapon: null });
  const cells = ['crop', 'afro', 'short', 'spiky'].map((h, i) => ({ label: h, u: H(i % 2 ? 'f' : 'm', h, h + i), zoom: 3.2, focus: 1.6 }));
  const s = renderSheet(cells, { cols: 4, cw: 260, ch: 260, yaw: 15, pitch: 70 });
  return s.canvas.toDataURL('image/png').split(',')[1];
});
fs.writeFileSync(path.join(root, 'tools/out/hair-crown.png'), Buffer.from(res, 'base64'));
console.log(T.errors.length ? T.errors : 'ok');
await T.close();
