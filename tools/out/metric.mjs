// Metric combat stage 1 (docs/specs/metric-combat.md): hover path line + pill, click to walk to a point, budget in
// metres; 3D: cut-away / see-through / X-ray. Stage 2: cone aim at the cursor point (preview = engine targets), line of
// fire to an enemy. Usage: node tools/out/metric.mjs [3d]
// Screenshots: tools/out/metric-<mode>-1-path.png, -2-walked.png, -3-xray.png (3D), -4-cone.png, -5-los.png. Exit 1 on failures / console errors.
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
ok(st.metric >= 1 && st.px != null, `metric battle, hero at ${st.px},${st.py} m`);
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
    return !!k && !k.unit && k.fx != null && Math.hypot(k.fx * 1.5 - px, k.fz * 1.5 - py) < 0.1;
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
  ok(Math.hypot(after.px - goal.px, after.py - goal.py) < 0.1 || after.unit !== after.id, `hero at ${after.px},${after.py} (goal ${goal.px},${goal.py}), budget ${(after.move * 1.5).toFixed(2)} m`);
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
// ---- stage 2: cone aim + line of fire
if (await page.evaluate(() => (window.__game.scene.S.b.metric || 0) >= 2 && window.__game.scene.S.playerTurn)) {
  const aim = await page.evaluate(() => {
    const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
    const a = { id: 't-cone', name: 'Конус', action: 'action', cost: 0, range: 3, target: 'tile', area: { shape: 'cone', size: 3 }, roll: 'save', save: 'dex', onSave: 'half', effects: [{ op: 'damage', dice: '1d4', dmgType: 'fire' }] };
    if (!h.abilities.some((x) => x.id === a.id)) h.abilities.push(a);
    const foes = b.units.filter((u) => u.team !== h.team && !u.dead && !u.removed).sort((p, q) => Math.hypot(p.px - h.px, p.py - h.py) - Math.hypot(q.px - h.px, q.py - h.py));
    const e = foes[0];
    // bring the foe 2 cells from the hero (a free floor cell) so the cone has a target
    const g = b.grid, free = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && !g.tiles[y * g.w + x] && !b.occ[y * g.w + x];
    const sx = Math.sign(e.x - h.x), sy = Math.sign(e.y - h.y);
    for (const [dx, dy] of [[2 * sx, 2 * sy], [2 * sx, 0], [0, 2 * sy], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [1, 2]]) {
      const x = h.x + dx, y = h.y + dy;
      if (!free(x, y)) continue;
      b.occ[e.y * g.w + e.x] = 0; e.x = x; e.y = y; e.px = (x + 0.5) * 1.5; e.py = (y + 0.5) * 1.5; b.occ[y * g.w + x] = b.units.indexOf(e) + 1; b.occVersion++;
      const dd = S.dispOf(e); dd.x = x; dd.y = y;
      break;
    }
    const d = Math.hypot(e.px - h.px, e.py - h.py) || 1;
    S.dirty = true;
    return { px: h.px + ((e.px - h.px) / d) * 3, py: h.py + ((e.py - h.py) / d) * 3, foe: e.id };
  });
  await wait(100);
  await page.evaluate(() => { const S = window.__game.scene.S, h = S.b.byId[S.heroId]; S.sel = { kind: 'ability', a: h.abilities.find((x) => x.id === 't-cone') }; S.dirty = true; });
  await wait(150);
  await settle();
  const pc = await screenOf(aim.px, aim.py);
  await page.mouse.move(pc.x, pc.y); await wait(300);
  const cone = await page.evaluate(async () => {
    const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId], C = await import('/game/src/rules/combat.js');
    const tc = S.targetAt(S.hover.cell), A = S.aim;
    if (!tc || !A || !A.area) return { tc: !!tc, area: A && A.area && A.area.k };
    const spec = { x: tc.tile.x, y: tc.tile.y, px: tc.tile.px, py: tc.tile.py };
    const eng = C.abilityTargets(b, h, S.sel.a, spec).map((u) => u.id).sort();
    const pv = S.areaPreview(S.sel.a, tc).units.map((u) => u.id).sort();
    return { area: A.area.k, deg: Math.round(A.area.half * 360 / Math.PI), len: A.area.len, eng, pv, px: tc.tile.px != null };
  });
  ok(cone.area === 'cone' && cone.deg === 90 && cone.len === 4.5 && cone.px, `cone preview in metres: ${JSON.stringify(cone)}`);
  ok(JSON.stringify(cone.eng) === JSON.stringify(cone.pv), 'cone preview units = engine targets');
  await shot(`metric-${tag}-4-cone`);
  await page.evaluate(() => { const S = window.__game.scene.S; S.sel = { kind: 'attack' }; S.dirty = true; });
  await wait(150);
  const fp = await page.evaluate((id) => { const u = window.__game.scene.S.b.byId[id]; return { px: u.px, py: u.py }; }, aim.foe);
  const pe = await screenOf(fp.px, fp.py);
  await page.mouse.move(pe.x, pe.y - 4); await wait(300);
  const ray = await page.evaluate(() => { const S = window.__game.scene.S; return S.aim && S.aim.ray ? { key: S.aim.ray.key, ring: !!S.aim.ring } : { ring: !!(S.aim && S.aim.ring), hover: S.hover.cell }; });
  ok(ray.ring, `attack range circle: ${JSON.stringify(ray)}`);
  await shot(`metric-${tag}-5-los`);
  await page.evaluate(() => { const S = window.__game.scene.S; S.sel = null; S.dirty = true; });
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
