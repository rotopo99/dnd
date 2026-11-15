// Map editor smoke (docs/specs/level-design.md §7.3 B): game/editor.html opens a hand-made map, paints floor / height,
// places a note, the checker reacts, the JS module text round-trips. Screen: tools/out/editor.png. node tools/out/editor.mjs
import { open } from './v3-harness.mjs';
const T = await open({ w: 1600, h: 900 });
const { page, errors, wait, shot } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await page.goto(T.url.replace('index.html', 'editor.html'));
await wait(800);
const r0 = await page.evaluate(() => { const ed = window.__editor; return { id: ed.E.def.id, errs: ed.validate().errors.length }; });
ok(r0.id === 'hm-alpha-harmony' && r0.errs === 0, `opens the first map, checker ok: ${JSON.stringify(r0)}`);
const r1 = await page.evaluate(() => {
  const ed = window.__editor, E = ed.E;
  E.tool = 'floor'; E.brush = '#'; ed.apply(20, 27, false, false); // wall the spawn
  const bad = ed.validate().errors.join('|');
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
  const undone = E.def.ascii.floor[27][20];
  E.tool = 'elev'; E.level = 3; ed.apply(2, 27, false, false);
  E.tool = 'obj'; E.otype = 'note'; ed.apply(3, 26, false, false);
  const note = E.def.objects.at(-1);
  const txt = ed.moduleText();
  const back = JSON.parse(txt.replace(/^[\s\S]*?export default\s*/, '').replace(/;\s*$/, ''));
  return { bad, undone, elev: E.def.ascii.elev[27][2], note: note.type, round: back.objects.length === E.def.objects.length && back.ascii.floor.length === 30 };
});
ok(/spawn/.test(r1.bad), `walled spawn → checker error: ${r1.bad.slice(0, 80)}`);
ok(r1.undone === '.', 'Ctrl+Z undoes');
ok(r1.elev === '3' && r1.note === 'note' && r1.round, `height brush, note placed, module text round-trips: ${JSON.stringify(r1)}`);
await page.mouse.click(700, 400); await wait(200);
await shot('editor');
ok(!errors.length, `console errors: ${errors.length} ${errors.slice(0, 2).join(' | ')}`);
await T.close();
process.exit(fails || errors.length ? 1 : 0);
