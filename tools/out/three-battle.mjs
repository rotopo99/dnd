// Three.js battle (docs/specs/threejs-migration.md, stage 1): ?gfx=3d + SwiftShader, engine from --engine three|old
// (default three). Battle in a biome, hero turn, hover / click picking (Raycaster), rotate, zoom, surfaces + a shot in
// flight, night. Screenshots tools/out/three-<engine>-*.png; exit code 1 on failures or console errors.
// node tools/out/three-battle.mjs [--engine three|old] [--biome wasteland]
import { open } from './v3-harness.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const engine = opt('--engine', 'three'), biome = opt('--biome', 'wasteland');
const T = await open({ query: `?gfx=3d&engine=${engine}`, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const pre = `three-${engine}`;

await page.waitForFunction(() => window.__game?.gfx && (window.__game.gfx.three || window.__game.gfx.threeFailed || true), null, { timeout: 10000 });
await wait(800);
await page.evaluate(async (biome) => {
  // seeded random: the same map / units for both engines (before / after comparison)
  Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: 'v3-pir-dock', biome, onWin: () => {} });
}, biome);
await wait(900);
const heroTurn = async () => {
  for (let i = 0; i < 300; i++) {
    const s = await page.evaluate(() => { const S = window.__game.scene.S; return { pt: S.playerTurn, banner: !!S.banner, res: S.result, q: S.queue?.length || 0 }; });
    if (s.res) return false;
    if (s.banner) await key('Enter');
    if (s.pt && !s.q) return true;
    await wait(100);
  }
  return false;
};
const settle = async (ms = 4000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await page.evaluate(() => { const c = window.__game.scene.S.v3?.cam; return !c || (c.tw >= 1 && !c.moving); })) return;
    await wait(50);
  }
};
ok(await heroTurn(), 'hero turn');
const st = await page.evaluate(() => { const S = window.__game.scene.S; return { v3: !!S.v3, engine: S.v3?.engine, w: S.b.grid.w, h: S.b.grid.h }; });
ok(st.v3 && (st.engine || 'old') === engine, `3D on, engine ${st.engine || 'old'} (${st.w}x${st.h})`);
await page.mouse.move(5, 300);
await settle(); await wait(400);
await shot(`${pre}-1-field`);
const cellPt = (x, y) => page.evaluate(async ({ x, y }) => {
  const m = await import('/game/src/gfx/scene3d.js');
  const S = window.__game.scene.S, p = m.cellScreen(S, x, y);
  return { x: p.x + S.L.cell / 2, y: p.y + S.L.cell / 2 };
}, { x, y });
// picking: hover every 3rd floor cell — the engine pick (Three: Raycaster) must agree with the analytic camera ray
// (gfx/camera.js pickCell over the pick tops) — a tall obstacle in front may legitimately win
const pk = await page.evaluate(async () => {
  const m = await import('/game/src/gfx/scene3d.js'), c = await import('/game/src/gfx/camera.js');
  const S = window.__game.scene.S, b = S.b; let n = 0, hit = 0, own = 0;
  for (let y = 1; y < b.grid.h - 1; y += 3) for (let x = 1; x < b.grid.w - 1; x += 3) {
    if (S.v3.world.obst[y * b.grid.w + x] > 0) continue;
    const p = m.cellScreen(S, x, y), px = p.x + S.L.cell / 2, py = p.y + S.L.cell / 2, q = m.pickBattle(S, px, py);
    const a = c.pickCell(S.v3.cam, px, py, b.grid.w, b.grid.h, m.topAt(S.v3));
    n++; if (q && (q.unit || (a && q.x === a.x && q.y === a.y))) hit++;
    if (q && q.x === x && q.y === y) own++;
  }
  return { n, hit, own };
});
ok(pk.n > 5 && pk.hit / pk.n > 0.95 && pk.own / pk.n > 0.7, `pick floor cells: agrees with the camera ray ${pk.hit}/${pk.n}, own cell ${pk.own}/${pk.n}`);
// unit pick: a foe body
const up = await page.evaluate(async () => {
  const m = await import('/game/src/gfx/scene3d.js');
  const S = window.__game.scene.S, b = S.b, foe = b.units.find((u) => u.team !== 'heroes' && !u.dead);
  const p = m.unitScreen(S, foe, S.dispOf(foe));
  const q = m.pickBattle(S, p.x + S.L.cell / 2, p.y + 25);
  return { id: foe.id, q };
});
ok(up.q?.unit === up.id, `pick unit body ${up.id} -> ${JSON.stringify(up.q)}`);
// hover + click a free cell next to the hero: the hero walks
const mv = await page.evaluate(() => {
  const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [2, 0], [0, 2]]) {
    const x = h.x + dx, y = h.y + dy;
    if (S.v3.world.obst[y * b.grid.w + x] === 0 && !b.units.some((u) => !u.dead && u.x === x && u.y === y) && S.v3.world.kind[y * b.grid.w + x] === 'floor') return { x, y, hx: h.x, hy: h.y };
  }
  return null;
});
if (mv) {
  const p = await cellPt(mv.x, mv.y);
  await page.mouse.move(p.x, p.y); await wait(300);
  await shot(`${pre}-2-hover`);
  await page.mouse.click(p.x, p.y); await wait(1800);
  const h = await page.evaluate(() => { const S = window.__game.scene.S, h = S.b.byId[S.heroId]; return { x: h.x, y: h.y, fx: h.fx, fy: h.fy }; });
  ok(h.x !== mv.hx || h.y !== mv.hy || h.fx != null, `click moves the hero (${mv.hx},${mv.hy}) -> (${h.x},${h.y})`);
}
// rotate + zoom
await key(']'); await settle(); await wait(300);
await shot(`${pre}-3-rot`);
await page.mouse.move(640, 360); await page.mouse.wheel(0, -100); await settle(); await wait(400);
await shot(`${pre}-4-zoom`);
// surfaces + a shot in flight
await page.evaluate(async () => {
  const S = window.__game.scene.S, b = S.b, an = await import('/game/src/gfx/anim.js'), sf = await import('/game/src/rules/surfaces.js');
  const g = await import('/game/src/rules/grid.js');
  const h = b.byId[S.heroId], foe = b.units.find((u) => u.team !== 'heroes' && !u.dead);
  const kinds = ['fire', 'electric', 'water', 'acid', 'toxgas'];
  let k = 0;
  for (let r = 1; r <= 3 && k < kinds.length; r++) for (let dx = -r; dx <= r && k < kinds.length; dx += 2) {
    const x = h.x + dx, y = h.y + r;
    if (!g.inBounds(b.grid, x, y) || !g.isPassable(b.grid, x, y)) continue;
    if (sf.createSurface(b, kinds[k], [{ x, y }], null, { noIgnite: true }).length) k++;
  }
  an.animEvent3d(S, { type: 'attack', unitId: h.id, targetId: foe.id, ranged: true });
});
await wait(250);
await shot(`${pre}-5-fx`);
// night
await page.evaluate(() => { const S = window.__game.scene.S; S.b.map.tod = 'night'; S.b.map.dark = true; if (S.v3) S.v3.lastSig = ''; });
await wait(600);
await shot(`${pre}-6-night`);
const stats = await page.evaluate(() => window.__game.scene.S.v3?.stats);
console.log('stats', JSON.stringify(stats));
const ms = await page.evaluate(() => new Promise((res) => {
  const S = window.__game.scene.S; let k = 0; const t0 = performance.now();
  const step = () => { if (S.v3) S.v3.lastSig = ''; if (++k >= 30) res((performance.now() - t0) / 30); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}));
console.log(`frame ~${ms.toFixed(1)} ms (SwiftShader, reference only)`);
ok(!errors.length, `console errors: ${errors.length}${errors.length ? '\n' + errors.join('\n') : ''}`);
await T.close();
process.exit(fails ? 1 : 0);
