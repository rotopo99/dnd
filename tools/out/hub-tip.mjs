// One-time hub hint «Меню узла» (ui/hub-tip.js): enter a hub roam scene on a fresh save -> tools/out/hub-tip.png;
// re-entering does not show it again. node tools/out/hub-tip.mjs
import { open } from './v3-harness.mjs';
const T = await open({ query: '?gfx=2d' });
const { page, errors, wait, shot } = T;
await wait(800);
const enter = () => page.evaluate(async () => {
  const g = window.__game, st = await import('/game/src/world/state.js'), r = await import('/game/src/scenes/roam.js');
  if (!g.save) { const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] }); s.flags['prologue-done'] = true; g.save = s; }
  g.save.location = 'alpha-harmony';
  g.setScene(r.createRoamScene('alpha-harmony'));
});
await enter(); await wait(1200);
const a = await page.evaluate(() => ({ tip: !!window.__game.scene.S?.hubTip, flag: !!window.__game.save.flags['tip-hub-menu'] }));
await shot('hub-tip');
await enter(); await wait(800);
const b = await page.evaluate(() => !!window.__game.scene.S?.hubTip);
console.log('first', a, 'again', b, 'errors', errors.length, errors.slice(0, 3));
await T.close();
