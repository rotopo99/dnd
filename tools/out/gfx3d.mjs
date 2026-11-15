// 3D battlefield (docs/specs/3d.md, stage 1): WebGL2 through SwiftShader, battles in 3 biomes (+ night), camera
// rotation and zoom, click on a cell moves the hero (camera ray picking), 3D / 2D toggle, context loss -> 2D fallback,
// frame time as a reference; stage 2: surfaces + shot / cast / swing animations in 3 biomes (gfx3d-anim-*.png), «Снизить
// эффекты» / shadow quality. Screenshots: tools/out/gfx3d-*.png. Exit code 1 on failures or console errors.
// node tools/out/gfx3d.mjs [--biomes wasteland,snow,factory]
import { open } from './v3-harness.mjs';

const argv = process.argv.slice(2);
const biomes = (argv[argv.indexOf('--biomes') + 1] && argv.includes('--biomes') ? argv[argv.indexOf('--biomes') + 1] : 'wasteland,snow,factory').split(',');
const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const startBattle = (biome) => page.evaluate(async (biome) => {
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true;
  g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: 'v3-pir-dock', biome, onWin: () => {} });
}, biome);
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
/** Screen point of a cell centre through the 3D camera. */
const cellPt = (x, y) => page.evaluate(async ({ x, y }) => {
  const m = await import('/game/src/gfx/scene3d.js');
  const S = window.__game.scene.S, p = m.cellScreen(S, x, y);
  return { x: p.x + S.L.cell / 2, y: p.y + S.L.cell / 2 };
}, { x, y });
/** Average frame time over n forced redraws (camera nudged every frame). */
const frameMs = (n = 60) => page.evaluate((n) => new Promise((res) => {
  const S = window.__game.scene.S; let k = 0; const t0 = performance.now();
  const step = () => { if (S.v3) S.v3.lastSig = ''; if (++k >= n) res((performance.now() - t0) / n); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

for (const [bi, biome] of biomes.entries()) {
  await startBattle(biome);
  await wait(900);
  ok(await heroTurn(), `${biome}: hero turn`);
  const st = await page.evaluate(() => {
    const S = window.__game.scene.S, gl = document.getElementById('gl');
    return { v3: !!S.v3, chunks: S.v3?.chunks.size || 0, vis: getComputedStyle(gl).visibility, biome: S.b.map.biome, w: S.b.grid.w, h: S.b.grid.h };
  });
  ok(st.v3 && st.chunks > 0 && st.vis === 'visible', `${biome}: 3D on (biome ${st.biome}, ${st.w}x${st.h}, ${st.chunks} chunks, gl ${st.vis})`);
  await page.mouse.move(5, 300);
  await wait(200);
  await shot(`gfx3d-${bi + 1}-${biome}`);
  if (bi === 0) { await page.evaluate(() => { window.__game.scene.S.v3.cam.zoomIdx = 2; }); await wait(700); }
  // stage 2: surfaces around the hero + a shot / a cast / a melee swing in flight (view-only events)
  const fx = await page.evaluate(async () => {
    const S = window.__game.scene.S, b = S.b, an = await import('/game/src/gfx/anim.js'), sf = await import('/game/src/rules/surfaces.js');
    const g = await import('/game/src/rules/grid.js');
    b.map.tod = 'day';
    const h = b.byId[S.heroId], foe = b.units.filter((u) => u.team !== 'heroes' && !u.dead).sort((p, q) => Math.hypot(p.x - h.x, p.y - h.y) - Math.hypot(q.x - h.x, q.y - h.y))[0];
    const kinds = ['fire', 'electric', 'water', 'ice', 'acid', 'toxgas', 'smoke', 'oil'];
    const occ = new Set(b.units.map((u) => `${u.x},${u.y}`));
    let k = 0;
    for (let r = 1; r <= 4 && k < kinds.length; r++) for (let dy = -r; dy <= r && k < kinds.length; dy += 2) for (let dx = -r; dx <= r && k < kinds.length; dx += 2) {
      const x = h.x + dx, y = h.y + dy;
      if (!g.inBounds(b.grid, x, y) || !g.isPassable(b.grid, x, y) || occ.has(`${x},${y}`) || b.surfaces?.get(`${x},${y}`)) continue;
      if (sf.createSurface(b, kinds[k], [{ x, y }], null, { noIgnite: true }).length) k++;
    }
    an.animEvent3d(S, { type: 'attack', actor: h.id, target: foe.id, melee: false, hit: true });
    an.animEvent3d(S, { type: 'damage', actor: h.id, target: foe.id, amount: 3 });
    an.animEvent3d(S, { type: 'ability', actor: foe.id, target: h.id, name: 'x' });
    const T = (await import('/game/src/gfx/units3d.js')).unitTemplate(foe);
    return { placed: k, foe: foe.enemyId, type: T.type, active: an.animActive(S.v3, S.time) };
  });
  ok(fx.placed >= 5 && fx.active, `${biome}: ${fx.placed} surfaces, foe ${fx.foe} (${fx.type}), animation active`);
  await wait(380);
  const stx = await page.evaluate(() => ({ ...window.__game.scene.S.v3.stats }));
  ok(stx.particles > 10 && stx.groups >= 1 && stx.shadow > 0, `${biome}: stats ${JSON.stringify(stx)}`);
  await shot(`gfx3d-anim-${biome}`);
  if (bi === 0) { await page.evaluate(() => { window.__game.scene.S.v3.cam.zoomIdx = 1; }); await wait(1500); }
  if (bi === 0) {
    // click on a reachable cell -> the hero walks there
    const tgt = await page.evaluate(() => {
      const S = window.__game.scene.S, b = S.b, h = b.byId[S.heroId];
      const list = (S.reach?.list || []).filter((i) => S.reach.dist[i] > 1);
      const i = list[Math.floor(list.length / 2)];
      return i == null ? null : { x: i % b.grid.w, y: (i / b.grid.w) | 0, hx: h.x, hy: h.y };
    });
    ok(!!tgt, `reachable cell ${tgt ? `${tgt.x},${tgt.y}` : '-'}`);
    if (tgt) {
      const p = await cellPt(tgt.x, tgt.y);
      await page.mouse.move(p.x, p.y); await wait(250);
      const hov = await page.evaluate(() => window.__game.scene.S.hover.cell);
      ok(hov && hov.x === tgt.x && hov.y === tgt.y, `hover pick ${JSON.stringify(hov)} = ${tgt.x},${tgt.y}`);
      await shot('gfx3d-hover-path');
      await page.mouse.click(p.x, p.y);
      await wait(1500);
      const pos = await page.evaluate(() => { const S = window.__game.scene.S, h = S.b.byId[S.heroId]; return { x: h.x, y: h.y }; });
      ok(pos.x === tgt.x && pos.y === tgt.y, `hero walked to ${pos.x},${pos.y}`);
    }
    // rotate the camera: ] and the on-screen button
    const yaw0 = await page.evaluate(() => window.__game.scene.S.v3.cam.yawTo);
    await key('BracketRight'); await wait(450);
    const yaw1 = await page.evaluate(() => window.__game.scene.S.v3.cam.yaw);
    ok(Math.abs(yaw1 - yaw0 - 90) < 0.01, `rotate ] : yaw ${yaw0} -> ${yaw1}`);
    await shot('gfx3d-rotated');
    const btn = await page.evaluate(async () => { const m = await import('/game/src/gfx/scene3d.js'); const S = window.__game.scene.S; return m.camButtons(S, window.__game).find((b) => b.id === 'rotL'); });
    await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2); await wait(450);
    const yaw2 = await page.evaluate(() => window.__game.scene.S.v3.cam.yaw);
    ok(Math.abs(yaw2 - yaw0) < 0.01, `rotate button ⟲ : yaw ${yaw2}`);
    // picking still lands on the right cell after a turn
    await key('BracketLeft'); await wait(450);
    const hc = await page.evaluate(() => { const S = window.__game.scene.S, h = S.b.byId[S.heroId]; return { x: h.x, y: h.y }; });
    const pp = await cellPt(hc.x, hc.y);
    await page.mouse.move(pp.x, pp.y + 6); await wait(200);
    const hov2 = await page.evaluate(() => window.__game.scene.S.hover.cell);
    ok(hov2 && hov2.x === hc.x && hov2.y === hc.y, `pick after rotation ${JSON.stringify(hov2)} = ${hc.x},${hc.y}`);
    await key('BracketRight'); await wait(450);
    // zoom with the wheel over the map
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -120); await wait(500);
    const z = await page.evaluate(() => window.__game.scene.S.v3.cam.zoomIdx);
    ok(z === 2, `wheel zoom -> level ${z}`);
    await shot('gfx3d-zoom');
    await page.mouse.wheel(0, 120); await wait(400);
    // frame time (SwiftShader: CPU rasteriser — a reference only, target 16 ms on a real GPU)
    const ms = await frameMs(90);
    console.log(`info frame ${ms.toFixed(1)} ms (~${(1000 / ms).toFixed(0)} fps, SwiftShader, forced redraw)`);
    // night tint with light holes around the heroes
    await page.evaluate(() => { window.__game.scene.S.b.map.tod = 'night'; });
    await wait(300);
    await shot('gfx3d-night');
    await page.evaluate(() => { window.__game.scene.S.b.map.tod = 'day'; });
    // «Снизить эффекты» + «Снизить движение»: no shadows, no particles, simple heads; then shadows «низкие»
    const red = await page.evaluate(async () => {
      const m = await import('/game/src/gfx/settings.js'), S = window.__game.scene.S;
      m.setGfxPref('reduceFx', true); m.setGfxPref('reduceMotion', true); S.v3.lastSig = '';
      await new Promise((r) => setTimeout(r, 400));
      const a = { ...S.v3.stats };
      m.setGfxPref('reduceFx', false); m.setGfxPref('reduceMotion', false); m.setGfxPref('shadows', 'low'); S.v3.lastSig = '';
      await new Promise((r) => setTimeout(r, 400));
      const c = { ...S.v3.stats };
      m.setGfxPref('shadows', 'high');
      return { a, c };
    });
    ok(red.a.shadow === 0 && red.c.shadow === 512, `reduce effects: shadow ${red.a.shadow}, particles ${red.a.particles}; low shadows ${red.c.shadow}`);
    // 3D -> 2D -> 3D with the top bar button
    const g = await page.evaluate(async () => { const m = await import('/game/src/gfx/scene3d.js'); return m.camButtons(window.__game.scene.S, window.__game).find((b) => b.id === 'gfx'); });
    await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2); await wait(300);
    const v2 = await page.evaluate(() => ({ v3: !!window.__game.scene.S.v3, vis: getComputedStyle(document.getElementById('gl')).visibility }));
    ok(!v2.v3 && v2.vis === 'hidden', `toggle -> 2D (gl ${v2.vis})`);
    await shot('gfx3d-2d');
    await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2); await wait(300);
    ok(await page.evaluate(() => !!window.__game.scene.S.v3), 'toggle -> 3D');
  }
}

// settings window from the main menu
await page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); window.__game.setScene(m.menuScene); });
await wait(200);
await key('KeyO'); await wait(200);
const md = await page.evaluate(() => window.__game.modals.at(-1)?.title || '');
ok(md === 'Настройки', `settings modal «${md}»`);
await shot('gfx3d-settings');
await key('Escape');

// context loss without restore -> 2D within 2 s + toast
await startBattle(biomes[0]);
await wait(900);
await heroTurn();
await page.evaluate(() => { document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(); });
await wait(2600);
const lost = await page.evaluate(() => ({ v3: !!window.__game.scene.S.v3, toast: window.__game.toasts.map((x) => x.text).join(' | ') }));
ok(!lost.v3 && /3D недоступно/.test(lost.toast), `context lost -> 2D (${lost.toast})`);

const errs = errors.filter((e) => !/WebGL context was lost|GPU stall|CONTEXT_LOST/i.test(e));
ok(!errs.length, `console errors: ${errs.length}${errs.length ? `\n  ${errs.join('\n  ')}` : ''}`);
await T.close();
console.log(fails ? `FAILED: ${fails}` : 'gfx3d: all ok');
process.exit(fails ? 1 : 0);
