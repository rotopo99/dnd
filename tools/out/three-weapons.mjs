// Weapons in the hand of GLB heroes (three/weapons.js): battle with the hero's weapon swapped through the categories
// (blade / blunt / staff / pistol / rifle / hidden), close-up screenshots tools/out/three-weapons-<cat>.png, exit 1 on errors.
// node tools/out/three-weapons.mjs
import { open } from './v3-harness.mjs';

const T = await open({ query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await wait(800);
await page.evaluate(async () => {
  Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
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
await page.evaluate(async () => { const { GFX } = await import('/game/src/data/gfx.js'); GFX.camera.closer = 3.2; const c = window.__game.scene.S.v3.cam; c.zoomIdx = 2; c.zoomSet = false; });
await wait(2500);
const WEAPONS = [
  ['blade', { name: 'Тесак', type: 'sword', melee: true, range: 1 }],
  ['blunt', { name: 'Кувалда', type: 'hammer', melee: true, range: 1 }],
  ['staff', { name: 'Копьё', type: 'polearm', melee: true, range: 1 }],
  ['pistol', { name: 'Пистолет', type: 'pistol', range: 8 }],
  ['rifle', { name: 'Винтовка', type: 'rifle', range: 12 }],
  ['hidden', null],
];
for (const [cat, w] of WEAPONS) {
  const info = await page.evaluate(async ([cat, w]) => {
    const S = window.__game.scene.S, h = S.b.byId[S.heroId];
    if (w) { h.weapon = { ...w }; h.hide = { ...(h.hide || {}), weapon: false }; } else h.hide = { ...(h.hide || {}), weapon: true };
    await new Promise((r) => setTimeout(r, 2500));
    const m = await import('/game/src/gfx/scene3d.js'), R = S.v3.T.party.get(h.id);
    return { key: R?.wkey, parent: R?.W?.group.parent?.name, clip: R?.C?.inst.current(), p: m.unitScreen(S, h, S.dispOf(h)) };
  }, [cat, w]);
  console.log(cat, JSON.stringify(info));
  ok(cat === 'hidden' ? (info.key || '').split('|')[2] === '1' && info.parent === 'hips' : info.key?.startsWith(cat + '|') && info.parent === 'rightHand', `${cat}: ${info.key} on ${info.parent}`);
  if (cat === 'rifle' || cat === 'staff') ok(/_2h$/.test(info.clip || ''), `${cat}: two-handed clip ${info.clip}`);
  if (info.p) await shot(`three-weapons-${cat}`, { x: Math.max(0, info.p.x - 140), y: Math.max(0, info.p.y - 40), width: 280, height: 300 });
}
await shot('three-weapons-battle');
ok(!errors.length, `console errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await T.close();
process.exit(fails ? 1 : 0);
