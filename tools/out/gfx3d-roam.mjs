// 3D stage 3 (docs/specs/3d.md): free node map in 3D (hub, ruins), night with point lights, rain, snow, fog, view cones,
// click-walk through the 3D picking, camera follow + drag pan + Home, wheel zoom, «Снизить эффекты» drops the weather
// particles, a battle on the node map in 3D (+ pan / «к активному юниту»). Screens: tools/out/gfx3d-roam-*.png.
// node tools/out/gfx3d-roam.mjs — exit code 1 on failures or console errors.
import { open } from './v3-harness.mjs';

// --engine three|old (default: the settings default, three): screenshots get a -<engine> suffix when given
const argv = process.argv.slice(2), engine = argv.includes('--engine') ? argv[argv.indexOf('--engine') + 1] : '';
const T = await open({ query: `?gfx=3d${engine ? `&engine=${engine}` : ''}`, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, key } = T;
const shot = (name) => T.shot(engine ? `${name}-${engine}` : name);
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const enter = async (loc) => {
  await page.evaluate(async (loc) => {
    const st = await import('/game/src/world/state.js');
    const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    s.flags['prologue-done'] = true; s.location = loc; s.visited = [...new Set([...(s.visited || []), loc])];
    for (const f of Object.keys(s.rep)) s.rep[f] = Math.max(s.rep[f], 10);
    localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
  }, loc);
  await page.reload(); await wait(400);
  await page.evaluate(async () => { Math.random = () => 0.5; const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
  await wait(900);
  for (let i = 0; i < 6 && (await page.evaluate(() => window.__game.modals.length)); i++) { await key('Escape'); await wait(150); }
  await page.mouse.move(640, 600);
  await wait(600);
};
const st = () => page.evaluate(() => {
  const S = window.__game.scene.S, V = S?.r3?.v3;
  return { id: window.__game.scene.id, v3: !!V, stats: V?.stats || null, lead: S?.party?.[0] ? [S.party[0].cx, S.party[0].cy] : null,
    cam: V ? { cx: V.cam.cx, cz: V.cam.cz, px: V.cam.px, pz: V.cam.pz, zoom: V.cam.zoomIdx } : null, vis: getComputedStyle(document.getElementById(V?.engine === 'three' ? 'gl3' : 'gl')).visibility };
});
const force = (wx) => page.evaluate((wx) => { const S = window.__game.scene.S; S.wxForce = wx; if (S.r3?.v3) S.r3.v3.lastSig = ''; }, wx);

// 1. hub in 3D
await enter('alpha-harmony');
let s = await st();
ok(s.id === 'roam' && s.v3 && s.vis === 'visible', `hub → roam in 3D (gl ${s.vis})`);
ok(s.stats && s.stats.units >= 2 && s.stats.chunks > 0 && s.stats.chunks <= s.stats.chunksAll, `stats ${JSON.stringify(s.stats)}`);
await force({ tod: 'day', weather: 'clear' }); await wait(300);
await shot('gfx3d-roam-hub');
// 2. click-walk through the 3D picking
const tgt = await page.evaluate(async () => {
  const sc = window.__game.scene, S = sc.S, g = sc.grid, ld = S.party[0];
  const { roamScreen } = await import('/game/src/gfx/roam3d.js');
  for (let r = 3; r < 8; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    const x = ld.cx + dx, y = ld.cy + dy;
    if (x > 0 && y > 0 && x < g.w && y < g.h && g.tiles[y * g.w + x] === 0 && !sc.entities().some((e) => Math.round(e.x) === x && Math.round(e.y) === y)) {
      const p = roamScreen(S.r3, x, y);
      if (p.x > 60 && p.x < 1220 && p.y > 120 && p.y < 640) return { x, y, px: p.x, py: p.y };
    }
  }
  return null;
});
ok(!!tgt, `target cell ${JSON.stringify(tgt)}`);
if (tgt) {
  await page.mouse.move(tgt.px, tgt.py); await wait(200);
  const hov = await page.evaluate(() => window.__game.scene.S.hoverCell);
  ok(hov && hov.x === tgt.x && hov.y === tgt.y, `3D hover ${JSON.stringify(hov)}`);
  await page.mouse.click(tgt.px, tgt.py);
  await wait(2500);
  s = await st();
  ok(s.lead[0] === tgt.x && s.lead[1] === tgt.y, `walked to ${s.lead}`);
  ok(Math.hypot(s.cam.cx - (tgt.x + 0.5), s.cam.cz - (tgt.y + 0.5)) < 1.5, `camera follows the hero (${s.cam.cx.toFixed(1)}, ${s.cam.cz.toFixed(1)})`);
}
// 3. drag pan (middle button) + Home back; corners reachable
await page.mouse.move(640, 400); await page.mouse.down({ button: 'middle' });
await page.mouse.move(400, 250, { steps: 6 }); await wait(150);
await page.mouse.up({ button: 'middle' }); await wait(200);
s = await st();
ok(Math.hypot(s.cam.px, s.cam.pz) > 2, `middle drag pans (${s.cam.px.toFixed(1)}, ${s.cam.pz.toFixed(1)})`);
const corner = await page.evaluate(async () => {
  const c = await import('/game/src/gfx/camera.js'); const V = window.__game.scene.S.r3.v3;
  c.centerCamera(V.cam, 0, 0); const a = [V.cam.bx + V.cam.px, V.cam.bz + V.cam.pz];
  c.centerCamera(V.cam, V.cam.mapW, V.cam.mapH); const b = [V.cam.bx + V.cam.px, V.cam.bz + V.cam.pz];
  c.centerCamera(V.cam, -50, 99); const d = [V.cam.bx + V.cam.px, V.cam.bz + V.cam.pz];
  return { a, b, d, w: V.cam.mapW, h: V.cam.mapH };
});
ok(corner.a[0] === 0 && corner.a[1] === 0 && corner.b[0] === corner.w && corner.b[1] === corner.h && corner.d[0] === 0 && corner.d[1] === corner.h, `corners reachable, pan clamped ${JSON.stringify(corner)}`);
await key('Home'); await wait(400);
s = await st();
ok(!s.cam.px && !s.cam.pz, 'Home: camera back to the hero');
// 4. wheel zoom
await page.mouse.move(640, 400);
await page.mouse.wheel(0, 120); await wait(400);
const z = (await st()).cam.zoom;
await page.mouse.wheel(0, -120); await wait(400);
ok(z === 1 && (await st()).cam.zoom === 2, `wheel zoom 2 → ${z} → back`);
// 5. night with point lights, cones visible
await force({ tod: 'night', weather: 'clear' });
await page.keyboard.down('AltLeft'); await wait(400);
s = await st();
ok(s.stats.lights >= 1 && s.stats.lights <= 8, `night lights ${s.stats.lights}`);
await shot('gfx3d-roam-night');
await page.keyboard.up('AltLeft');
// 6. rain / snow / fog particles; «Снизить эффекты» drops them
for (const w of ['rain', 'snow', 'fog']) {
  await force({ tod: 'day', weather: w }); await wait(400);
  s = await st();
  ok(s.stats.weather && s.stats.particles > 5, `${w}: ${s.stats.particles} particles`);
  if (w !== 'fog') await shot(`gfx3d-roam-${w}`);
}
const red = await page.evaluate(async () => {
  const m = await import('/game/src/gfx/settings.js'), S = window.__game.scene.S;
  m.setGfxPref('reduceFx', true); S.r3.v3.lastSig = '';
  // slow SwiftShader frames: wait for a frame drawn with the new prefs
  for (let t = 0; t < 40 && (S.r3.v3.stats.post || S.r3.v3.stats.particles); t++) { S.r3.v3.lastSig = ''; await new Promise((r) => setTimeout(r, 100)); }
  const a = { ...S.r3.v3.stats };
  m.setGfxPref('reduceFx', false);
  return a;
});
ok(!red.weather && red.particles === 0, `reduce effects: no weather particles (${red.particles})`);
await force(null);
// 7. frame time reference (SwiftShader)
const ms = await page.evaluate((n) => new Promise((res) => {
  const S = window.__game.scene.S; let k = 0; const t0 = performance.now();
  const step = () => { if (S.r3?.v3) S.r3.v3.lastSig = ''; if (++k >= n) res((performance.now() - t0) / n); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), 60);
console.log(`info roam frame ${ms.toFixed(1)} ms (SwiftShader, forced redraw)`);
// 8. ruins in 3D
await enter('vooruzhenie');
s = await st();
ok(s.id === 'roam' && s.v3, 'ruins → roam in 3D');
await force({ tod: 'day', weather: 'clear' }); await wait(300);
await shot('gfx3d-roam-ruins');
// 9. 2D toggle on the roam and back
const tg = await page.evaluate(() => window.__game.scene.S.buttons.find((b) => b.id === 'gfx'));
ok(!!tg, 'roam has the 2D/3D button');
if (tg) {
  await page.mouse.click(tg.x + tg.w / 2, tg.y + tg.h / 2); await wait(400);
  ok(!(await st()).v3 && (await st()).vis === 'hidden', 'roam toggle → 2D');
  const tg2 = await page.evaluate(() => window.__game.scene.S.buttons.find((b) => b.id === 'gfx'));
  await page.mouse.click(tg2.x + tg2.w / 2, tg2.y + tg2.h / 2); await wait(400);
  ok((await st()).v3, 'roam toggle → 3D');
}
// 10. battle on the node map in 3D: raid hunters → battle; arrows pan, Home centres the active unit
await force({ tod: 'night', weather: 'rain' }); // the node battle takes the node's weather
await page.evaluate(() => { const sc = window.__game.scene; sc.spawnRaid(window.__game, ['scavenger', 'scavenger'], 'Мародёры'); });
for (let i = 0; i < 60; i++) { if ((await page.evaluate(() => window.__game.scene.id)) === 'battle') break; await wait(250); }
const bid = await page.evaluate(() => window.__game.scene.id);
ok(bid === 'battle', `raid → battle (${bid})`);
if (bid === 'battle') {
  await wait(800);
  for (let i = 0; i < 8; i++) { const b = await page.evaluate(() => !!window.__game.scene.S.banner); if (!b) break; await key('Enter'); await wait(200); }
  const b3 = await page.evaluate(() => { const m = window.__game.scene.S.b.map; return { v3: !!window.__game.scene.S.v3, id: m.id, tod: m.tod, weather: m.weather }; });
  ok(b3.v3 && b3.id.startsWith('roam-'), `node battle in 3D (${b3.id})`);
  ok(b3.tod === 'night' && b3.weather === 'rain', `node battle keeps the node weather (${b3.tod}, ${b3.weather})`);
  await page.mouse.move(640, 300);
  await page.keyboard.down('ArrowLeft');
  for (let t = 0; t < 30; t++) { await wait(100); if (t >= 3 && (await page.evaluate(() => { const c = window.__game.scene.S.v3.cam; return Math.hypot(c.px, c.pz) > 0.5; }))) break; }
  await page.keyboard.up('ArrowLeft');
  const pan = await page.evaluate(() => { const c = window.__game.scene.S.v3.cam; return Math.hypot(c.px, c.pz); });
  ok(pan > 0.5, `arrows pan the battle camera (${pan.toFixed(2)})`);
  await shot('gfx3d-roam-battle');
  await key('Home');
  for (let t = 0; t < 60; t++) { if (await page.evaluate(() => { const V = window.__game.scene.S.v3; return V.focusPt && Math.hypot(V.cam.cx - V.focusPt.x, V.cam.cz - V.focusPt.z) < 0.6; })) break; await wait(100); }
  const foc = await page.evaluate(() => { const S = window.__game.scene.S, V = S.v3; return V.focusPt ? Math.hypot(V.cam.cx - V.focusPt.x, V.cam.cz - V.focusPt.z) : -1; });
  ok(foc >= 0 && foc < 0.6, `Home: battle camera on the active unit (${foc.toFixed(2)})`);
}

const errs = errors.filter((e) => !/WebGL context was lost|GPU stall|CONTEXT_LOST/i.test(e));
ok(!errs.length, `console errors: ${errs.length}${errs.length ? `\n  ${errs.join('\n  ')}` : ''}`);
await T.close();
console.log(fails ? `FAILED: ${fails}` : 'gfx3d-roam: all ok');
process.exit(fails ? 1 : 0);
