// QA v34 P4 fixes: settings camera hint only in 3D; a save with a forbidden race / class pair -> repair window
// (pick an allowed class -> the game starts); M on the free map -> world map (alarm -> toast with the reason).
// node tools/out/qa34-fixes.mjs  -> exit 1 on a failed check / console errors
import { open } from './v3-harness.mjs';
const T = await open();
const { page, errors, wait, key, scene } = T;
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const g = (fn, a) => page.evaluate(fn, a);
// 1. settings hint in 2D
await g(async () => { const m = await import('/game/src/ui/settings-ui.js'); m.openSettings(window.__game); });
await wait(200);
const lines = await g(() => { const m = window.__game.modals.at(-1); const b = m.build ? m.build() : m; return (b.lines || []).map((l) => (typeof l === 'string' ? l : l.text)); });
ok(!lines.some((l) => /\[ \/ \]/.test(l)), `settings in 2D: no 3D camera hint (${JSON.stringify(lines)})`);
await key('Escape'); await wait(150);
// 2. forbidden pair save
await g(async () => {
  const st = await import('/game/src/world/state.js');
  const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; s.location = 'alpha-harmony'; s.visited = ['alpha-harmony'];
  s.hero.race = 'android'; s.hero.cls = 'mutant';
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
  const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game);
});
await wait(300);
const fx = await g(() => { const m = window.__game.modals.at(-1); return m ? { title: m.title, n: m.options.length, labels: m.options.map((o) => o.label) } : null; });
ok(fx && /недопустимый/.test(fx.title) && fx.n >= 2, `repair window: ${JSON.stringify(fx)}`);
await g(() => { const G = window.__game, m = G.modals.at(-1), o = m.options.find((x) => x.label === G.data.CLASSES.ranger.name); G.closeModal(); o.run(G); });
for (let i = 0; i < 30 && (await scene()).id !== 'roam'; i++) await wait(200);
ok((await scene()).id === 'roam', `fixed save starts (scene ${(await scene()).id})`);
ok(await g(() => JSON.parse(localStorage.getItem('ruslania-save-v1')).hero.cls === 'ranger'), 'slot repaired');
// 3. M on the free map
await g(() => { window.__game.modals.length = 0; });
await g(() => { window.__game.scene.raiseAlarm(window.__game); });
await wait(100);
await key('KeyM'); await wait(300);
ok((await scene()).id === 'roam' && (await g(() => window.__game.toasts.some((x) => /Тревога: на карту/.test(x.text)))), 'M under alarm: toast with the reason');
await g(() => { const sc = window.__game.scene; sc.S.alarm = null; window.__game.modals.length = 0; });
await key('KeyM');
for (let i = 0; i < 20 && (await scene()).id !== 'worldmap'; i++) await wait(150);
ok((await scene()).id === 'worldmap', `M -> world map (${(await scene()).id})`);
console.log(`errors ${errors.length}`, errors.slice(0, 3));
await T.close();
process.exit(fail || errors.length ? 1 : 0);
