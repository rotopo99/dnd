// QA v52 #2/#4: node battle threat preview + «Опасно» confirm; Sera's offers point to a closer quest. node tools/out/qa52-flow.mjs
import { open } from './v3-harness.mjs';
const T = await open({ w: 1280, h: 720 });
const { page, errors, wait, shot, scene } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  const s = st.newSave({ name: 'Q', race: 'human', cls: 'ranger', path: null, origin: 'technikums', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; s.hero.level = 2; s.location = 'garmoniya'; s.discovered.push('garmoniya');
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
});
await page.reload(); await wait(500);
await page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
await wait(500);
while ((await scene()).modals) { await page.keyboard.press('Escape'); await wait(150); }
await page.evaluate(async () => { const g = window.__game; g.visit = null; const m = await import('/game/src/scenes/location.js'); g.setScene(m.createLocationScene('garmoniya')); });
await wait(600);
while ((await scene()).modals) { await page.keyboard.press('Escape'); await wait(150); }
const acts = await page.evaluate(() => (window.__game.scene.S?.buttons || []).filter((b) => b.kind === 'act').map((b) => `${b.label} | ${b.sub}`));
const fight = acts.find((a) => a.includes('Рощёвые стражи'));
ok(fight && fight.includes('Опасно') && fight.includes('ур. 5'), `fight row: ${fight}`);
await shot('qa52-threat-list');
await page.evaluate(() => { const S = window.__game.scene.S; const b = S.buttons.find((x) => x.kind === 'act' && x.label.includes('Рощёвые стражи')); b.run(window.__game); });
await wait(300);
const md = await scene();
ok(md.modals > 0 && md.title.includes('Опасный бой'), `deadly confirm: ${JSON.stringify(md)}`);
await shot('qa52-threat-confirm');
ok(errors.length === 0, `console errors: ${errors.length}\n${errors.slice(0, 5).join('\n')}`);
await T.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
