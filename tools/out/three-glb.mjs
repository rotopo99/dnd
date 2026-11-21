// GLB groundwork (docs/specs/threejs-migration.md §6): three/models.js loads a Blender GLB (cache), clones two instances
// (own skeletons), plays clips through the mixer, binds a hair part by bone names. Exit code 1 on failures / console errors.
// node tools/out/three-glb.mjs
import { open } from './v3-harness.mjs';

const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const r = await page.evaluate(async () => {
  const M = await import('/game/src/three/models.js');
  const url = '/game/assets/models/hero_f_field.glb';
  const [a, b] = await Promise.all([M.instanceGLB(url), M.instanceGLB(url)]);
  const same = (await M.loadGLB(url)) === (await M.loadGLB(url));
  let bonesA = null, bonesB = null, meshes = 0;
  a.root.traverse((o) => { if (o.isSkinnedMesh) { meshes++; bonesA ||= o.skeleton.bones[0]; } });
  b.root.traverse((o) => { if (o.isSkinnedMesh) bonesB ||= o.skeleton.bones[0]; });
  a.play('idle'); a.update(0.1); a.play('walk'); a.update(0.5);
  const hair = await M.loadGLB('/game/assets/models/hair_bob_f.glb');
  const added = a.attach(hair);
  const bound = added.every((o) => o.skeleton.bones.some((x) => { let p = x; while (p.parent) p = p.parent; return p === a.root; }));
  const out = { clips: [...a.clips.keys()], cur: a.current(), meshes, own: bonesA !== bonesB, same, hair: added.length, bound };
  a.dispose(); b.dispose(); M.clearModelCache();
  return out;
});
console.log(JSON.stringify(r));
ok(r.clips.includes('idle') && r.clips.includes('walk'), `clips ${r.clips.join(' ')}`);
ok(r.cur === 'walk', `mixer cross-fade -> ${r.cur}`);
ok(r.same && r.own && r.meshes > 0, `cache shared, instances own skeletons (${r.meshes} skinned meshes)`);
ok(r.hair > 0 && r.bound, `hair part bound to the instance skeleton (${r.hair})`);
ok(!errors.length, `console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
await T.close();
process.exit(fails ? 1 : 0);
