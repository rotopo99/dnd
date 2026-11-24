// balance-finale.md §2: boss phases in the real battle scene (3D): Cyber-Priest at the gate — phase 2 (choir) and 3 (fire, node),
// then the Great Collector phase 2/3; checks the phase log lines, spawned units, the prop and no console errors.
// Screenshots: tools/out/boss-phase-*.png. node tools/out/boss-phases.mjs
import { open } from './v3-harness.mjs';

const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const start = (enc) => page.evaluate(async (enc) => {
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: enc, onWin: () => {}, onLose: () => {} });
}, enc);
const until = async (fn, arg, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; };
for (const [enc, boss, tags] of [['enc-cyber-priest-strong', 'boss-cyber-priest-prime', ['choir', 'copy-node']], ['v4-boss-collector', 'boss-great-collector', ['exhibit', 'catalog']]]) {
  await start(enc);
  await until(() => !!window.__game.scene.S?.b);
  for (let i = 0; i < 20 && await page.evaluate(() => !!window.__game.scene.S.banner); i++) { await key('Enter'); await wait(200); }
  // heroes on AI, the boss drops below 66% → phase 2 on the next action
  const step = (pct) => page.evaluate(({ boss, pct }) => {
    const b = window.__game.scene.S.b;
    for (const u of b.units) if (u.team === 'heroes') { u.control = 'ai'; u.maxHp = u.hp = 9999; }
    const B = b.units.find((u) => String(u.enemyId).startsWith(boss));
    B.hp = Math.floor(B.maxHp * pct); b.trigCheck = true;
  }, { boss, pct });
  await step(0.6);
  ok(await until((t) => window.__game.scene.S.b.units.some((u) => u.trigTag === t), tags[0], 20000), `${enc}: phase 2 spawned ${tags[0]}`);
  await wait(800); await shot(`boss-phase-${boss}-2`);
  await step(0.3);
  ok(await until((t) => window.__game.scene.S.b.units.some((u) => u.trigTag === t), tags[1], 20000), `${enc}: phase 3 prop ${tags[1]}`);
  await wait(800); await shot(`boss-phase-${boss}-3`);
  const lg = await page.evaluate(() => window.__game.scene.S.b.log.filter((e) => e.type === 'triggerLog' && e.phase).map((e) => e.bark));
  ok(lg.length >= 2, `${enc}: phase log + barks ${JSON.stringify(lg)}`);
}
ok(!errors.length, `console errors: ${errors.join(' | ') || 'none'}`);
await T.close();
process.exit(fails ? 1 : 0);
