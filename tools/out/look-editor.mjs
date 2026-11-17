// Appearance editor check: screenshots of every tab, 6 presets, camera modes, animations, undo/redo, race change.
// node tools/out/look-editor.mjs [--only=tabs|presets]  -> tools/out/look-*.png ; exit 1 on console errors / failed checks
import { open } from './v3-harness.mjs';
const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
await page.evaluate(async () => {
  const m = await import('/game/src/scenes/create-look.js');
  window.__sc = m.createLookScene({ race: 'human', cls: 'ranger', path: 'x', name: 'Тест' }, window.__game.scene, (g, full) => { window.__done = full; });
  window.__game.setScene(window.__sc);
});
await wait(900);
const S = () => page.evaluate(() => ({ id: window.__game.scene.id, ms: window.__sc.S.buildMs, tab: window.__sc.S.tab, gl: !!window.__sc.S.T }));
ok((await S()).id === 'create-look' && (await S()).gl, 'editor opens, template built');
const click = async (pred) => {
  const p = await page.evaluate(`(() => { const S = window.__sc.S; const b = [...S.fixed, ...S.widgets].find(${pred}); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; })()`);
  if (!p) return false;
  await page.mouse.click(p.x, p.y); await wait(600); return true;
};
if (only !== 'presets') {
  for (const tab of ['base', 'body', 'face', 'hair', 'outfit', 'details']) {
    ok(await click(`(b) => b.k === 'tab' && b.id === '${tab}'`), `tab ${tab}`);
    await page.mouse.move(700, 650); await wait(400);
    await shot(`look-tab-${tab}`);
  }
  await click(`(b) => b.k === 'tab' && b.id === 'body'`);
  await click(`(b) => b.k === 'chip' && b.label === 'Крепкий'`);
  const b1 = await page.evaluate(() => window.__sc.S.look.build); ok(b1 === 'sturdy', 'build chip');
  await page.keyboard.down('Control'); await wait(250); await page.keyboard.press('KeyZ'); await wait(400); await page.keyboard.up('Control'); await wait(300);
  ok((await page.evaluate(() => window.__sc.S.look.build)) === 'normal', 'Ctrl+Z undoes');
  await page.keyboard.down('Control'); await wait(250); await page.keyboard.press('KeyY'); await wait(400); await page.keyboard.up('Control'); await wait(300);
  ok((await page.evaluate(() => window.__sc.S.look.build)) === 'sturdy', 'Ctrl+Y redoes');
  await click(`(b) => b.k === 'chip' && b.label === 'Лицо крупно'`); await wait(900); await shot('look-face');
  for (const a of ['Ходьба', 'Удар', 'Эмоции']) { await click(`(b) => b.k === 'chip' && b.label === '${a}'`); await wait(700); await shot(`look-anim-${a}`); }
  await click(`(b) => b.k === 'chip' && b.label === 'Во весь рост'`);
}
if (only !== 'tabs') {
  for (let i = 0; i < 6; i++) {
    await click(`(b) => b.label === 'Пресеты'`);
    ok(await click(`(b) => b.k === 'pre' && b.label === ${JSON.stringify(await page.evaluate((i) => ['Ветеран пустошей', 'Кибер-лисица', 'Мародёр', 'Жрица Судьи', 'Техномант-ботан', 'Следопытка'][i], i))}`), `preset ${i}`);
    await page.mouse.move(700, 660); await wait(900); await shot(`look-preset-${i + 1}`);
  }
}
console.log('rebuild ms', (await S()).ms);
const done = await page.evaluate(() => { const S = window.__sc.S; return JSON.stringify(S.look).length; });
ok(done > 100, 'look serialisable');
ok(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
await T.close();
process.exit(fails ? 1 : 0);
