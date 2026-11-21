// GLB heroes in a Three.js battle (threejs-migration.md §6, stage 3): hero with an editor look (female, long pink hair,
// scout outfit) -> GLB character; close-up screenshot tools/out/three-heroes-*.png; exit 1 on console errors.
// node tools/out/three-heroes.mjs
import { open } from './v3-harness.mjs';

const T = await open({ query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await wait(800);
await page.evaluate(async () => {
  Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const st = await import('/game/src/world/state.js');
  const ld = await import('/game/src/ui/look-data.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  const L = ld.randomLook('human', 'f', Math.random);
  Object.assign(L, { gender: 'f', hair: 'long', hairColor: 'pink', outfit: 'scout', cloth: 'f', bust: 0.3 });
  s.hero.avatar = L;
  g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: 'v3-pir-dock', biome: 'wasteland', onWin: () => {} });
});
for (let i = 0; i < 200; i++) {
  const s = await page.evaluate(() => { const S = window.__game.scene.S; return { pt: S.playerTurn, banner: !!S.banner, q: S.queue?.length || 0 }; });
  if (s.banner) await key('Enter');
  if (s.pt && !s.q) break;
  await wait(100);
}
// close camera (test only): a third zoom level far beyond the game's, focus on the hero
await page.evaluate(async () => { const { GFX } = await import('/game/src/data/gfx.js'); GFX.camera.closer = 3.2; const c = window.__game.scene.S.v3.cam; c.zoomIdx = 2; c.zoomSet = false; });
await wait(3000);
const info = await page.evaluate(async () => {
  const S = window.__game.scene.S, T = S.v3?.T, m = await import('/game/src/gfx/scene3d.js');
  const h = S.b.units.find((u) => u.team === 'heroes');
  const R = T?.party.get(h.id), p = m.unitScreen(S, h, S.dispOf(h));
  return { glb: S.v3.stats?.glb, n: T?.party.size, ready: !!R?.C, clip: R?.C?.inst.current(), springs: R?.C?.springs.length, p, hx: h.x, hy: h.y };
});
console.log(JSON.stringify(info));
ok(info.ready && info.glb >= 1, 'hero drawn by a GLB character');
await shot('three-heroes-1-battle');
if (info.p) await shot('three-heroes-2-close', { x: Math.max(0, info.p.x - 160), y: Math.max(0, info.p.y - 60), width: 320, height: 320 });
// clips: a melee swing (gfx/anim.js event) -> attack_melee, a hit -> hit, a walk two cells away -> walk
const clipNow = () => page.evaluate(() => { const S = window.__game.scene.S, h = S.b.byId[S.heroId]; return S.v3.T.party.get(h.id)?.cur || null; });
await page.evaluate(async () => {
  const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S, h = S.b.byId[S.heroId], foe = S.b.units.find((u) => u.team !== 'heroes' && !u.dead);
  a.animEvent3d(S, { type: 'attack', actor: h.id, target: foe.id, melee: true, hit: true });
});
await wait(250);
const c1 = await clipNow();
ok(c1 === 'attack_melee', `swing -> ${c1}`);
await shot('three-heroes-3-swing', { x: Math.max(0, info.p.x - 160), y: Math.max(0, info.p.y - 60), width: 320, height: 320 });
await wait(1500);
await page.evaluate(async () => {
  const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S, h = S.b.byId[S.heroId];
  a.animEvent3d(S, { type: 'damage', target: h.id, amount: 1 });
});
await wait(200);
const c2 = await clipNow();
console.log('after damage event:', c2);
await wait(1500);
const mv = await page.evaluate(async () => {
  const m = await import('/game/src/gfx/scene3d.js');
  const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
  for (const [dx, dy] of [[2, 0], [0, 2], [1, 1], [1, 0], [0, 1]]) {
    const x = h.x + dx, y = h.y + dy;
    if (S.v3.world.obst[y * b.grid.w + x] === 0 && !b.units.some((u) => !u.dead && u.x === x && u.y === y) && S.v3.world.kind[y * b.grid.w + x] === 'floor') { const p = m.cellScreen(S, x, y); return { x: p.x + S.L.cell / 2, y: p.y + S.L.cell / 2 }; }
  }
  return null;
});
if (mv) {
  const h0 = await page.evaluate(() => { const h = window.__game.scene.S.b.byId[window.__game.scene.S.heroId]; return `${h.x},${h.y}`; });
  await page.mouse.click(mv.x, mv.y);
  let c3 = null;
  for (let i = 0; i < 20 && c3 !== 'walk' && c3 !== 'run'; i++) { await wait(100); c3 = await clipNow(); }
  const h1 = await page.evaluate(() => { const h = window.__game.scene.S.b.byId[window.__game.scene.S.heroId]; return `${h.x},${h.y}`; });
  console.log('hero', h0, '->', h1);
  ok(c3 === 'walk' || c3 === 'run', `walk -> ${c3}`);
  await wait(2500);
  const c4 = await clipNow();
  ok(c4 === 'idle', `stop -> ${c4}`);
}
ok(!errors.length, `console errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log(e);
await T.close();
process.exit(fails ? 1 : 0);
