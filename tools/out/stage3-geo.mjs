// Metric combat stage 3 (metric-combat.md): surfaces as circles in metres, a bridge collapse with a fall.
// node tools/out/stage3-geo.mjs [--2d]   Screenshots: tools/out/stage3-*-{2d,3d}.png. Exit code 1 on failures.
import { open } from './v3-harness.mjs';
const two = process.argv.includes('--2d');
const T = two ? await open({ query: '?gfx=2d' }) : await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
const sfx = two ? '2d' : '3d';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const start = (o) => page.evaluate(async (o) => {
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  g.save = s;
  const D = await import('/game/src/data/index.js');
  D.MAPS['qa-bridge'] = { id: 'qa-bridge', name: 'Мост', biome: 'port', win: 'killAll', lose: 'allDown', enemies: [], allies: [],
    grid: ['##############', '#......P.....#', '#.....E.......#', '#WWWWW===WWWWW#', '#WWWWW===WWWWW#', '#WWWWW===WWWWW#', '#............#', '#............#', '##############'] };
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, o.map ? { map: o.map, enemies: ['cultist'], onWin: () => {} } : { encounter: 'v3-pir-dock', onWin: () => {} });
}, o);
const heroTurn = async () => {
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const S = window.__game.scene.S; return { pt: S.playerTurn, banner: !!S.banner, res: S.result, q: S.queue?.length || 0 }; });
    if (s.res) return false;
    if (s.banner) await key('Enter');
    if (s.pt && !s.q) return true;
    await wait(150);
  }
  return false;
};
await start({});
await wait(800);
ok(await heroTurn(), 'hero turn');
const info = await page.evaluate(async () => {
  const sf = await import('/game/src/rules/surfaces.js');
  const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
  const e = b.units.find((u) => u.team === 'enemies' && !u.dead);
  const mid = { px: (h.px + e.px) / 2, py: (h.py + e.py) / 2 };
  sf.spillAt(b, 'oil', { px: e.px, py: e.py }, 0, null, { r: 1.6 });
  sf.spillAt(b, 'water', { px: mid.px, py: mid.py - 3 }, 0, null, { r: 2.2 });
  sf.spillAt(b, 'electric', { px: mid.px + 0.4, py: mid.py - 3 }, 0, null, {});
  sf.spillAt(b, 'acid', { px: mid.px - 3, py: mid.py + 2.5 }, 0, null, { r: 1.4 });
  sf.spillAt(b, 'fire', { px: mid.px + 2.5, py: mid.py + 2.5 }, 0, null, { r: 1.9 });
  sf.spillAt(b, 'ice', { px: h.px + 2, py: h.py - 2 }, 0, null, { r: 1.1 });
  sf.spillAt(b, 'smoke', { px: mid.px + 3.5, py: mid.py - 3.5 }, 0, null, { r: 1.8 });
  S.dirty = true;
  let shaped = 0, cells = 0;
  for (const c of b.surfaces.values()) { cells++; if (c.floor?.shape || c.gas?.shape) shaped++; }
  return { metric: b.metric, shaped, cells, oiled: e.statuses.some((s) => s.id === 'oiled') };
});
ok(info.metric >= 3 && info.shaped > 5, `circle surfaces: ${JSON.stringify(info)}`);
await wait(500);
await shot(`stage3-surfaces-${sfx}`);
// bridge
await page.evaluate(() => { window.__game.scene.S.result = null; });
await start({ map: 'qa-bridge' });
await wait(900);
ok(await heroTurn(), 'bridge battle: hero turn');
const pre = await page.evaluate(() => { const b = window.__game.scene.S.b; return { bridges: (b.bridges || []).length, hero: [b.byId[window.__game.scene.S.heroId].x, b.byId[window.__game.scene.S.heroId].y] }; });
ok(pre.bridges === 1, `bridge found: ${JSON.stringify(pre)}`);
await shot(`stage3-bridge-before-${sfx}`);
const post = await page.evaluate(async () => {
  const tr = await import('/game/src/rules/terrain.js');
  const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
  const cb = await import('/game/src/rules/combat.js');
  cb.placeUnitAt(b, h, 7, 4);
  const hp0 = h.hp;
  tr.collapseBridge(b, b.bridges[0], null);
  S.dirty = true;
  return { down: b.bridges[0].down, hp0, hp: h.hp, at: [h.x, h.y], fall: b.log.some((e) => e.type === 'fall' && e.bridge) };
});
ok(post.down && post.fall && post.hp >= 1, `collapse: ${JSON.stringify(post)}`);
await wait(900);
await shot(`stage3-bridge-after-${sfx}`);
ok(!errors.length, `console errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await T.close?.();
console.log(fails ? `stage3-geo: ${fails} FAIL` : 'stage3-geo: all ok');
process.exit(fails ? 1 : 0);
