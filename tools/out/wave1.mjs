// Content wave 1 in the browser (docs/specs/content-wave1.md): two quests by different paths (w1-filters — dilemma +
// delayed news; w1-cauldron — clues + accusation), the «Эфир» window, two lore finds («Находка»), codex «Тайны мира».
// node tools/out/wave1.mjs → tools/out/wave1-find.png, wave1-accuse.png, wave1-radio.png, wave1-secrets.png
import { open } from './v3-harness.mjs';
const T = await open({ w: 1280, h: 720 });
const { page, errors, wait, shot, key, scene } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const closeAll = async () => { for (let i = 0; i < 8 && (await scene()).modals; i++) { await key('Escape'); await wait(150); } };
const toLoc = (id) => page.evaluate(async (id) => {
  const g = window.__game; g.visit = null; g.save.location = id; g.save.visited = [...new Set([...(g.save.visited || []), id])];
  const L = await import('/game/src/scenes/location.js'); g.setScene(L.createLocationScene(id));
}, id);

// a fresh save at Аграра (Огород gives w1-filters)
await page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; s.location = 'agrara'; s.hero.credits = 500;
  (await import('/game/src/world/quests.js')).startQuest(s, 'w1-filters'); // queues the stage note (shown on the node)
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
});
await page.reload(); await wait(500);
await page.evaluate(async () => { Math.random = () => 0.99; const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
await wait(500);

// ---------------- quest 1: w1-filters → «villages» (talk to Свечка), the stage note → «Находка»
await page.evaluate(async () => {
  const g = window.__game, qs = await import('/game/src/world/quests.js');
  g.save.pendingTalentChoice = []; g.save.hero.pendingTalents = 0; g.save.hero.pendingAsi = []; g.save.hero.levelNews = [];
});
await wait(500);
let sc = await scene();
ok(sc.title.startsWith('Находка'), `find window on entry: ${JSON.stringify(sc)}`);
await shot('wave1-find');
await closeAll();
await page.evaluate(async () => {
  const g = window.__game, qs = await import('/game/src/world/quests.js');
  qs.onTalk(g.save, 'd-ogorod', g.data);
  qs.chooseOption(g.save, qs.slots(g.save, 'w1-filters')[0], 'villages', g.data);
  qs.onTalk(g.save, 'd-svechka', g.data);
  qs.onTalk(g.save, 'd-ogorod', g.data);
});
await toLoc('agrara'); await wait(700);
for (let i = 0; i < 4 && (await scene()).id !== 'dialogue'; i++) { await key('Escape'); await wait(200); }
ok((await scene()).id === 'dialogue', 'Огород: turn-in dialogue');
for (let i = 0; i < 10 && (await scene()).id === 'dialogue'; i++) { await key('Space'); await wait(150); }
await closeAll();
let st = await page.evaluate(() => ({ q: window.__game.save.quests['w1-filters'], cq: window.__game.save.flags['cq:w1-filters:villages'], dl: window.__game.save.delayed }));
ok(st.q.state === 'done' && !st.q.turnin && st.cq, `w1-filters done, outcome villages: ${JSON.stringify(st.q.outcome)}`);
ok(st.dl.some((d) => d.id === 'thirst'), 'delayed «thirst» queued');
const news = await page.evaluate(async () => {
  const ex = await import('/game/src/world/exodus.js'); const g = window.__game;
  const r = ex.passDays(g.save, 6); for (const x of r.out) g.toast(x.text, x.color);
  return { out: r.out.map((x) => x.text), flag: !!g.save.flags['dl:w1-filters:thirst'] };
});
ok(news.flag && news.out.some((x) => x.startsWith('Пришли новости')), 'delayed news after 6 days');

// ---------------- quest 2: w1-cauldron — clues (fx flags), accusation window with evidence, then «parus-proof»
await page.evaluate(async () => {
  const g = window.__game, qs = await import('/game/src/world/quests.js');
  qs.startQuest(g.save, 'w1-cauldron'); qs.onTalk(g.save, 'd-kambuz', g.data);
  for (const [i, f] of [[0, 'w1-clue-mold'], [1, 'w1-clue-key'], [2, 'w1-clue-log']]) {
    const s = qs.slots(g.save, 'w1-cauldron').find((x) => x.sub === i); g.save.flags[f] = true; qs.completeSlot(g.save, s, g.data);
  }
});
await toLoc('raytsentr'); await wait(700);
await closeAll();
const opened = await page.evaluate(() => {
  const L = window.__game.scene; const a = L.actions(window.__game).find((x) => x.label.includes('Кто посолил котёл'));
  if (a) a.run(window.__game); return !!a;
});
await wait(300);
sc = await scene();
ok(opened && sc.title === 'Кто посолил котёл', `accusation window: ${JSON.stringify(sc)}`);
const accuse = await page.evaluate(() => window.__game.modals.at(-1).options.map((o) => `${o.disabled ? '×' : '✓'} ${o.label}`));
ok(accuse.some((x) => x.startsWith('× Парус: плесень')) && accuse.some((x) => x.startsWith('✓ Якорь')), `suspects: ${accuse.join(' | ')}`);
await shot('wave1-accuse');
await key('Digit3'); await wait(200); // «Якорь: ключ…» — the other path: a false accusation
await closeAll();
await page.evaluate(async () => { const g = window.__game, qs = await import('/game/src/world/quests.js'); qs.onTalk(g.save, 'd-kambuz', g.data); });
await toLoc('raytsentr'); await wait(700);
for (let i = 0; i < 4 && (await scene()).id !== 'dialogue'; i++) { await key('Escape'); await wait(200); }
for (let i = 0; i < 10 && (await scene()).id === 'dialogue'; i++) { await key('Space'); await wait(150); }
await closeAll();
st = await page.evaluate(() => ({ q: window.__game.save.quests['w1-cauldron'], dl: window.__game.save.delayed }));
ok(st.q.state === 'done' && st.q.outcome === 'yakor' && st.dl.some((d) => d.id === 'second'), `w1-cauldron: outcome ${st.q.outcome}, delayed «second»`);

// ---------------- the «Эфир» window (V): news about the deeds
await key('KeyV'); await wait(300);
sc = await scene();
const radio = await page.evaluate(() => (window.__game.modals.at(-1)?.lines || []).map((l) => (typeof l === 'string' ? l : l.text)).join(' / '));
ok(sc.title.includes('Эфир'), `radio window: ${sc.title}`);
ok(/Свечка|Святость|котле|Якор|Райцентр/.test(radio), `news about the party: ${radio.slice(0, 160)}`);
await shot('wave1-radio');
await closeAll();

// ---------------- a node note (loc:) on entry → second find
const node = await page.evaluate(async () => (await import('/game/src/world/lore.js')).notesOfSecret('kringe-origin').find((n) => n.loc).loc);
await toLoc(node); await wait(800);
for (let i = 0; i < 4 && !(await scene()).title.startsWith('Находка') && (await scene()).modals; i++) { await key('Escape'); await wait(200); }
sc = await scene();
ok(sc.title.startsWith('Находка'), `node note at ${node}: ${JSON.stringify(sc)}`);
await closeAll();
const found = await page.evaluate(() => window.__game.save.codex.flags.filter((f) => f.startsWith('lore:')));
ok(found.length >= 2, `notes in the codex: ${found.join(', ')}`);

// ---------------- codex «Тайны мира»
await page.evaluate(async () => {
  const g = window.__game; const P = await import('/game/src/scenes/panels.js');
  g.setScene(P.createPanelsScene({ tab: 'codex', back: g.scene }));
  await new Promise((r) => setTimeout(r, 100));
});
await wait(300);
const tab = await page.evaluate(() => { const b = window.__game.scene.S.buttons.find((x) => x.kind === 'cxSec' && x.id === 'secrets'); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; });
await page.mouse.click(tab.x, tab.y); await wait(400);
ok(await page.evaluate(() => window.__game.scene.S.cx.section === 'secrets'), 'codex tab «Тайны мира»');
const rows = await page.evaluate(async () => (await import('/game/src/scenes/panel-codex.js')).codexEntries(window.__game.save, 'secrets').map((r) => r.label));
ok(rows.length >= 2 && rows.every((r) => /\d\/3$/.test(r)), `secrets: ${rows.join(' | ')}`);
await shot('wave1-secrets');

ok(errors.length === 0, `console errors: ${errors.length}\n${errors.slice(0, 5).join('\n')}`);
await T.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
