// Metric combat stage 1 (docs/specs/metric-combat.md): hover path line + pill, click to walk to a point, budget in
// metres; 3D: cut-away / see-through / X-ray. Usage: node tools/out/metric.mjs [--gfx 3d]
// Screenshots: tools/out/metric-<mode>-1-path.png, -2-walked.png, -3-xray.png (3D). Exit 1 on failures / console errors.
import { open } from './v3-harness.mjs';
const g3 = process.argv.includes('3d');
const T = await open(g3 ? { query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
const { page, errors, wait, shot, key } = T;
const tag = g3 ? '3d' : '2d';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: 'v3-pir-dock', biome: 'cyber', onWin: () => {} });
});
await wait(800);
const heroTurn = async () => {
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => { const S = window.__game.scene.S; return { pt: S.playerTurn, banner: !!S.banner, res: S.result, q: S.queue?.length || 0 }; });
    if (s.res) return false;
    if (s.banner) await key('Enter');
    if (s.pt && !s.q) return true;
    await wait(100);
  }
  return false;
};
ok(await heroTurn(), 'hero turn');
const st = await page.evaluate(() => { const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId]; return { metric: b.metric, px: h.px, py: h.py, x: h.x, y: h.y, move: b.turn.move }; });
ok(st.metric === 1 && st.px != null, `metric battle, hero at ${st.px},${st.py} m`);
// screen point of a floor point in metres (2D: canvas; 3D: camera projection)
const screenOf = (px, py) => page.evaluate(async ({ px, py }) => {
  const S = window.__game.scene.S, L = S.L;
  if (S.v3?.world) {
    const { project } = await import('/game/src/gfx/camera.js');
    const X = px / 1.5, Z = py / 1.5, W = S.v3.world, i = Math.floor(Z) * W.w + Math.floor(X);
    const p = project(S.v3.cam, X, W.floor[i] || 0, Z);
    return { x: p.x, y: p.y };
  }
  return { x: L.mapX + (px / 1.5) * L.cell, y: L.mapY + (py / 1.5) * L.cell };
}, { px, py });
// a free target ~4-6 m away, reachable within the budget
const settle = async () => { for (let i = 0; i < 50; i++) { if (!(await page.evaluate(() => !!window.__game.scene.S.v3?.cam.moving))) break; await wait(100); } };
await settle();
// 3D: only points the cursor can see (the pick under their screen point returns them, not a crate in front)
const goal = await page.evaluate(async () => {
  const M = await import('/game/src/rules/metric.js');
  const { project } = await import('/game/src/gfx/camera.js');
  const { pickBattle } = await import('/game/src/gfx/scene3d.js');
  const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId], V = S.v3;
  const seen = (px, py) => {
    if (!V?.world) return true;
    const X = px / 1.5, Z = py / 1.5, i = Math.floor(Z) * V.world.w + Math.floor(X), p = project(V.cam, X, V.world.floor[i] || 0, Z);
    const k = pickBattle(S, p.x, p.y);
    return !!k && k.fx != null && Math.hypot(k.fx * 1.5 - px, k.fz * 1.5 - py) < 0.1;
  };
  const have = M.budgetM(b);
  for (const r of [5, 4, 6, 3, 2]) for (let a = 0; a < 16; a++) {
    const px = h.px + Math.cos(a * Math.PI / 8) * r + 0.13, py = h.py + Math.sin(a * Math.PI / 8) * r + 0.07;
    const np = M.navPath(b, h, px, py, { snap: 0 });
    if (np && np.cost <= have && np.len > 1.5 && seen(np.to.px, np.to.py)) return { px: np.to.px, py: np.to.py, cost: np.cost, have };
  }
  return null;
});
ok(!!goal, `goal ${goal && `${goal.px},${goal.py} cost ${goal.cost} of ${goal.have}`}`);
if (goal) {
  await settle();
  const p = await screenOf(goal.px, goal.py);
  await page.mouse.move(p.x, p.y); await wait(250);
  const hp = await page.evaluate(() => { const h = window.__game.scene.S.hoverPath; return h && { ok: h.ok, len: h.len, cost: h.cost, n: h.pts.length }; });
  ok(hp && hp.ok === 'move', `hover path: ${JSON.stringify(hp)}`);
  await shot(`metric-${tag}-1-path`);
  await page.mouse.click(p.x, p.y);
  await wait(60);
  console.log('    after click:', JSON.stringify(await page.evaluate(() => { const S = window.__game.scene.S; return { msg: S.message?.text, q: S.queue.length, hp: S.hoverPath && { ok: S.hoverPath.ok, to: S.hoverPath.to } }; })));
  for (let i = 0; i < 40; i++) { const q = await page.evaluate(() => window.__game.scene.S.queue.length + Object.values(window.__game.scene.S.disp).filter((d) => d.path.length).length); if (!q) break; await wait(100); }
  const after = await page.evaluate(() => { const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId]; return { px: h.px, py: h.py, move: b.turn?.move, unit: b.turn?.unitId, id: h.id }; });
  ok(Math.hypot(after.px - goal.px, after.py - goal.py) < 0.05 || after.unit !== after.id, `hero at ${after.px},${after.py} (goal ${goal.px},${goal.py}), budget ${(after.move * 1.5).toFixed(2)} m`);
  if (after.unit === after.id) ok(Math.abs(after.move * 1.5 - (goal.have - hp.cost)) < 0.03 || after.move === 0, 'budget spent by metres');
  // far point -> red / amber line
  const far = await page.evaluate(() => { const S = window.__game.scene.S, b = S.b; return { px: (b.grid.w - 2.5) * 1.5, py: (b.grid.h - 2.5) * 1.5 }; });
  await settle();
  const pf = await screenOf(far.px, far.py);
  await page.mouse.move(pf.x, pf.y); await wait(250);
  const hf = await page.evaluate(() => window.__game.scene.S.hoverPath?.ok);
  ok(hf === 'dash' || hf === 'no' || hf === undefined, `far point: ${hf}`);
  await shot(`metric-${tag}-2-walked`);
}
if (g3) {
  const k = await page.evaluate(() => window.__game.scene.S.v3?.cutK);
  ok(k > 0, `cut-away active: ${k}`);
  await page.keyboard.down('KeyX'); await wait(300);
  await shot(`metric-${tag}-3-xray`);
  await page.keyboard.up('KeyX');
}
ok(!errors.length, `console errors: ${errors.length}${errors.length ? `\n${errors.join('\n')}` : ''}`);
await T.close();
process.exit(fails ? 1 : 0);
