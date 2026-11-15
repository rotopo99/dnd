// Hand-made maps in the browser (docs/specs/level-design.md): three key nodes open as hand-made free maps in 3D (whole-map
// shots tools/out/hm-<loc>.png), a note goes to the codex, a lever opens its door, the barricade trigger starts the battle
// on the authored cut of the same map (heights kept, hm-battle.png), the Lis-9 boss arena (hm-arena.png).
// node tools/out/handmade.mjs [--2d] — exit code 1 on failures or console errors.
import { open } from './v3-harness.mjs';

const d2 = process.argv.includes('--2d');
const T = await open(d2 ? {} : { query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sfx = d2 ? '-2d' : '';

const enter = async (loc) => {
  await page.evaluate(async (loc) => {
    const st = await import('/game/src/world/state.js');
    const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    s.flags['prologue-done'] = true; s.location = loc; s.visited = [...new Set([...(s.visited || []), loc])];
    for (const f of Object.keys(s.rep)) s.rep[f] = Math.max(s.rep[f], 10);
    localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
  }, loc);
  await page.reload(); await wait(400);
  await page.evaluate(async () => { Math.random = () => 0.5; const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
  await wait(900);
  for (let i = 0; i < 6 && (await page.evaluate(() => window.__game.modals.length)); i++) { await key('Escape'); await wait(150); }
  await page.mouse.move(640, 650);
  await wait(400);
};
const overview = () => page.evaluate(() => {
  const S = window.__game.scene.S, V = S.r3?.v3;
  S.wxForce = { tod: 'day', weather: 'clear' };
  if (V) { V.cam.zoomIdx = 0; V.cam.zoom = V.cam.zooms[0]; V.cam.cx = 20; V.cam.cz = 15; S.r3.follow3 = false; V.lastSig = ''; } else S.zoom = 0;
});

for (const loc of ['alpha-harmony', 'raytsentr', 'dacha-babki']) {
  await enter(loc);
  const s = await page.evaluate(() => { const sc = window.__game.scene; return { id: sc.id, hand: sc.map?.hand, v3: !!sc.S.r3?.v3, elev: !!sc.map?.elev }; });
  ok(s.id === 'roam' && s.hand && s.elev && (d2 || s.v3), `${loc}: hand-made free map ${JSON.stringify(s)}`);
  await overview(); await wait(700);
  await shot(`hm-${loc}${sfx}`);
}

// note → codex, lever → door (alpha-harmony)
await enter('alpha-harmony');
const r = await page.evaluate(() => {
  const g = window.__game, sc = g.scene, S = sc.S;
  const note = S.objs.find((o) => o.id === 'n-ah-water'), lever = S.objs.find((o) => o.id === 'hm-ah-lever'), gate = S.objs.find((o) => o.id === 'hm-ah-gate');
  sc.interact(g, { kind: 'obj', o: note, x: note.x, y: note.y });
  const title = g.modals.at(-1)?.title; g.modals.length = 0;
  const before = sc.grid.tiles[gate.y * sc.grid.w + gate.x];
  sc.interact(g, { kind: 'obj', o: lever, x: lever.x, y: lever.y });
  return { title, codex: g.save.codex.flags.includes('note:n-ah-water'), before, after: sc.grid.tiles[gate.y * sc.grid.w + gate.x], open: gate.opened };
});
ok(r.title && r.codex, `note opens and goes to the codex: ${JSON.stringify(r)}`);
ok(r.before !== 0 && r.after === 0 && r.open, 'lever opens the deck gate (walkable)');
// barricade trigger → battle on the authored cut
await page.evaluate(() => {
  const g = window.__game, S = g.scene.S, ld = S.party[0];
  S.path = []; ld.step = null; ld.x = ld.cx = 20; ld.y = ld.cy = 15;
  g.scene.goCell(g, 20, 13);
});
await wait(1500);
const b = await page.evaluate(() => { const g = window.__game, S = g.scene.S; return { id: g.scene.id, map: S?.b?.map?.id, elev: !!S?.b?.grid?.elev, region: S?.b?.map?.roam?.region, foes: S?.b?.units?.filter((u) => u.team === 'enemies').length }; });
ok(b.id === 'battle' && b.map === 'roam-alpha-harmony' && b.elev && b.region?.x === 8 && b.region?.y === 4, `barricade → battle on the cut: ${JSON.stringify(b)}`);
await wait(600);
await shot(`hm-battle${sfx}`);
// Lis-9 arena
await page.evaluate(async () => {
  const g = window.__game; const wb = await import('/game/src/scenes/world-battle.js');
  g.save.location = 'dungeons-m15'; g.save.roam = null;
  wb.startWorldBattle(g, { encounter: 'v3-boss-lis-9', onWin: () => {} });
});
await wait(1500);
for (let i = 0; i < 3 && (await page.evaluate(() => window.__game.modals.length)); i++) { await key('Escape'); await wait(150); }
const a = await page.evaluate(() => { const g = window.__game, S = g.scene.S; const boss = S?.b?.units?.find((u) => u.enemyId?.startsWith('boss-lis-9')); return { id: g.scene.id, tpl: S?.b?.map?.template, boss: boss ? [boss.x, boss.y] : null }; });
ok(a.id === 'battle' && a.tpl === 'hand:hm-arena-lis9' && a.boss?.[0] === 11 && a.boss?.[1] === 6, `Lis-9 arena: ${JSON.stringify(a)}`);
await wait(500);
await shot(`hm-arena${sfx}`);

ok(!errors.length, `console errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await T.close();
console.log(fails ? `handmade: ${fails} failed` : 'handmade: all ok');
process.exit(fails || errors.length ? 1 : 0);
