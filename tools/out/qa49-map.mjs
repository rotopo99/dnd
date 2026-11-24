// QA v49 #14/#15/#19: travel confirm, quest goal marks, label layout on the world map. node tools/out/qa49-map.mjs
import { open } from './v3-harness.mjs';
const T = await open({ w: 1280, h: 720 });
const { page, errors, wait, shot, scene } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  const s = st.newSave({ name: 'Q', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; s.hero.credits = 50;
  s.quests['mq-exodus'] = { state: 'active', stage: 'go-city' };
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
});
await page.reload(); await wait(500);
await page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
await wait(500);
while ((await scene()).modals) { await page.keyboard.press('Escape'); await wait(150); }
await page.evaluate(async () => { const m = await import('/game/src/scenes/world-map.js'); window.__game.setScene(m.createWorldMapScene()); });
await wait(800);
const qt = await page.evaluate(async () => [...(await import('/game/src/world/quests.js')).questTargets(window.__game.save)]);
ok(qt.includes('cc-gate'), `quest targets: ${qt}`);
await shot('qa49-map');
// click a sea node: a confirm window, money untouched
const tgt = await page.evaluate(async () => {
  const D = await import('/game/src/world/data.js'); const st = await import('/game/src/world/state.js');
  const g = window.__game; const here = g.save.location;
  const m = await import('/game/src/scenes/world-map.js');
  const pf = st.partyFlagSet(g.save, g.data);
  const id = D.MAP_NODES.find((x) => g.save.discovered.includes(x) && x !== here && !D.LOCATIONS[x].parent && m.findRoute(g.save, here, x, pf)?.some((h) => h.r.fare)); const p = g.scene.S.pos(id); return { id, p, name: D.LOCATIONS[id].name };
});
const c0 = await page.evaluate(() => window.__game.save.hero.credits);
await page.evaluate((p) => { const S = window.__game.scene.S; S.cam.x += 0; }, null);
await page.mouse.click(tgt.p.x, tgt.p.y); await wait(300);
console.log(tgt);
const sc = await scene();
ok(sc.modals > 0 && sc.title.includes(tgt.name), `confirm: ${JSON.stringify(sc)}`);
ok(!(await page.evaluate(() => window.__game.scene.S.travel)) && (await page.evaluate(() => window.__game.save.hero.credits)) === c0, 'no travel / no payment before confirm');
await shot('qa49-confirm');
await page.keyboard.press('Digit1'); await wait(300);
ok(!!(await page.evaluate(() => window.__game.scene.S.travel)), 'travel after confirm');
ok(errors.length === 0, `console errors: ${errors.length}\n${errors.slice(0, 5).join('\n')}`);
await T.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
