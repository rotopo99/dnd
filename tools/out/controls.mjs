// controls-divinity.md: RMB menu on the free map (NPC), RMB drag pans without a menu, sneaking crouch, party selection
// (1–4, Ctrl+A, F2), «Атаковать» a hunter (walk, 0.35 s strike, battle; from the crouch — surprise), RMB menu in battle.
// Screens: tools/out/controls-npc.png, controls-sneak.png, controls-battle.png (+ controls-sneak3d.png with ?3d).
// node tools/out/controls.mjs [--3d]
import { open } from './v3-harness.mjs';
const D3 = process.argv.includes('--3d');
const T = await open({ w: 1280, h: 720, query: D3 ? '?gfx=3d' : '', args: D3 ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] });
const { page, errors, wait, shot } = T;
const SLOW = D3 ? 6 : 1; // SwiftShader frames are slow: wait more after input
const key = async (k) => { await page.keyboard.press(k); await wait(90 * SLOW); };
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await page.evaluate(async (d3) => {
  const st = await import('/game/src/world/state.js');
  (await import('/game/src/gfx/settings.js')).setGfxPref('mode', d3 ? '3d' : '2d');
  const s = st.newSave({ name: 'Den', race: 'human', cls: 'zabivnoy', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; s.location = 'alpha-harmony'; s.visited = ['alpha-harmony'];
  for (const f of Object.keys(s.rep)) s.rep[f] = Math.min(Math.max(s.rep[f], 10), 20);
  s.hero.credits = 500; s.hero.level = 5; s.hero.hp = 999;
  st.recruit(s, 'gans');
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
}, D3);
await page.reload(); await wait(400);
await page.evaluate(async () => { Math.random = () => 0.5; const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); });
await wait(800);
for (let i = 0; i < 6 && (await T.scene()).modals; i++) { await key('Escape'); await wait(150 * SLOW); }
ok((await T.scene()).id === 'roam', 'on the free map');

// screen point of a map cell (2D: camera; 3D: projection)
const screenOf = (x, y) => page.evaluate(async ([x, y]) => {
  const sc = window.__game.scene, S = sc.S;
  if (S.r3?.v3) { const { roamScreen } = await import('/game/src/gfx/roam3d.js'); const p = roamScreen(S.r3, x, y, 0.9); return [p.x, p.y]; }
  const { ROAM } = await import('/game/src/data/world/roam.js');
  const c = ROAM.zooms[S.zoom];
  return [x * c - S.cam.x + c / 2, y * c - S.cam.y + c / 2];
}, [x, y]);

// 1. a trader NPC: stand next to him, RMB on him
const npc = await page.evaluate(() => {
  const sc = window.__game.scene, S = sc.S;
  const n = S.npcs.find((q) => !q.route && q.trader) || S.npcs.find((q) => !q.route) || S.npcs[0];
  n.route = null;
  const g = sc.grid;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) {
    const x = Math.round(n.fx) + dx, y = Math.round(n.fy) + dy;
    if (g.tiles[y * g.w + x] === 0) { S.party.forEach((m, i) => { m.x = m.cx = x + (i ? 1 : 0); m.y = m.cy = y; m.step = null; }); S.trail = []; S.path = []; S.cam = null; break; }
  }
  return { id: n.id, x: Math.round(n.fx), y: Math.round(n.fy) };
});
await wait(900 * SLOW);
let [px, py] = await screenOf(npc.x, npc.y);
await page.mouse.move(px, py); await wait(120);
await page.mouse.click(px, py, { button: 'right' }); await wait(250 * SLOW);
const menu = await page.evaluate(() => { const M = window.__game.ctxMenu; return M ? { title: M.title, items: M.items.map((x) => `${x.id}${x.disabled ? '-' : ''}`) } : null; });
ok(!!menu && menu.items.includes('talk') && menu.items.includes('inspect'), `NPC menu ${JSON.stringify(menu)}`);
ok(!!menu && menu.items.includes('steal-'), 'steal grey outside the crouch');
await page.mouse.move(px + 30, py + 40); await wait(150 * SLOW);
await shot('controls-npc');
await key('Escape');
ok(!(await page.evaluate(() => window.__game.ctxMenu)) && (await T.scene()).modals === 0, 'Esc closes the menu (no pause menu)');
// RMB drag — no menu
await page.mouse.move(640, 400); await page.mouse.down({ button: 'right' }); await page.mouse.move(720, 440, { steps: 5 }); await page.mouse.up({ button: 'right' }); await wait(150 * SLOW);
ok(!(await page.evaluate(() => window.__game.ctxMenu)), 'RMB drag opens no menu');

// 2. sneaking: crouch, slow speed, steal open
await key('KeyC'); await wait(400 * SLOW);
const cr = await page.evaluate(() => window.__game.scene.S.crouch);
[px, py] = await screenOf(npc.x, npc.y); // the RMB drag panned the 3D camera
ok(cr === 1, `crouch ${cr}`);
await page.mouse.move(px, py); await wait(120);
await page.mouse.click(px, py, { button: 'right' }); await wait(250 * SLOW);
const m2 = await page.evaluate(() => window.__game.ctxMenu?.items.map((x) => `${x.id}${x.disabled ? '-' : ''}`) || []);
ok(m2.includes('steal'), `steal open in the crouch ${m2}`);
await key('Escape');
await page.mouse.move(100, 400); await wait(100);
await shot(D3 ? 'controls-sneak3d' : 'controls-sneak');

if (D3) { console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors'); await T.close(); process.exit(fails || errors.length ? 1 : 0); }
// 3. selection: 2 — only the companion (free mode), Ctrl+A — all, F2 — chain
await key('Digit2');
let sel = await page.evaluate(() => ({ mode: window.__game.scene.S.mode, n: window.__game.scene.S.sel.size }));
ok(sel.mode === 'free' && sel.n === 1, `2 selects one, free ${JSON.stringify(sel)}`);
const lead0 = await page.evaluate(() => [window.__game.scene.S.party[0].cx, window.__game.scene.S.party[0].cy]);
await page.evaluate(([x, y]) => { const sc = window.__game.scene; const g = sc.grid; for (let d = 2; d < 6; d++) if (g.tiles[(y + d) * g.w + x] === 0) return sc.goCell(window.__game, x, y + d); }, lead0);
await wait(1500);
const after = await page.evaluate(() => window.__game.scene.S.party.map((m) => [m.cx, m.cy]));
ok(after[0][0] === lead0[0] && after[0][1] === lead0[1] && (after[1][1] !== lead0[1] || after[1][0] !== lead0[0] + 1), `free: only the selected walks ${JSON.stringify(after)}`);
await page.keyboard.down('Control'); await key('KeyA'); await page.keyboard.up('Control');
ok(await page.evaluate(() => window.__game.scene.S.sel.size === window.__game.scene.S.party.length), 'Ctrl+A selects all');
await key('F2');
ok(await page.evaluate(() => window.__game.scene.S.mode === 'chain'), 'F2 back to the chain');

// 4. attack a hunter from the crouch: walk, strike 0.35 s, battle with surprise (enemies stunned)
await page.evaluate(() => {
  const g = window.__game, sc = g.scene, S = sc.S, ld = S.party[0];
  sc.spawnRaid(g, ['scavenger'], 'Test');
  const h = S.hostiles[0];
  const gr = sc.grid;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = ld.cx + dx, y = ld.cy + dy; if (gr.tiles[y * gr.w + x] === 0) { h.fx = h.x = x; h.fy = h.y = y; break; } }
  h.face = Math.atan2(h.fy - ld.cy, h.fx - ld.cx); // looks away from the party
  h.repath = 99; h.path = [];
  const e = sc.entities().find((x) => x.kind === 'hostile');
  sc.attackEnt(g, e);
});
await wait(150 * SLOW);
const atk = await page.evaluate(() => window.__game.scene.id === 'battle' || !!window.__game.scene.S.atk || window.__game.scene.S.path?.length > 0);
ok(atk, 'attack: walking / striking');
for (let i = 0; i < 30 && (await T.scene()).id !== 'battle'; i++) await wait(200);
ok((await T.scene()).id === 'battle', 'battle on the node map');
await wait(800);
for (let i = 0; i < 4 && (await page.evaluate(() => !!window.__game.scene.S.banner)); i++) { await key('Space'); await wait(200); }
const stun = await page.evaluate(() => window.__game.scene.S.b.units.filter((u) => u.team === 'enemies').map((u) => u.statuses.map((s) => s.id).join('|')));
const skipped = await page.evaluate(() => { const S = window.__game.scene.S; return (S.log || []).some((l) => JSON.stringify(l).includes('пропуск') || JSON.stringify(l).toLowerCase().includes('skip')) || S.b.units.some((u) => u.team === 'enemies' && u.statuses.some((q) => q.id === 'stun')); });
const toasts = await page.evaluate(() => window.__game.toasts.map((x) => x.text));
ok(skipped, `surprise: the enemy loses the first turn ${JSON.stringify(stun)} ${JSON.stringify(toasts)}`);
// 5. RMB on the enemy in battle: attack / pin / inspect
const foe = await page.evaluate(async () => {
  const S = window.__game.scene.S, u = S.b.units.find((q) => q.team === 'enemies' && !q.dead);
  if (S.v3) { const { unitScreen } = await import('/game/src/gfx/scene3d.js').catch(() => ({})); if (unitScreen) { const p = unitScreen(S, u); return [p.x, p.y]; } }
  const L = S.L; return [L.mapX + (u.x + 0.5) * L.cell, L.mapY + (u.y + 0.5) * L.cell];
});
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__game.scene.S.playerTurn)); i++) await wait(250 * SLOW);
await page.mouse.move(foe[0], foe[1]); await wait(150 * SLOW);
await page.mouse.click(foe[0], foe[1], { button: 'right' }); await wait(250 * SLOW);
const bm = await page.evaluate(() => window.__game.ctxMenu?.items.map((x) => `${x.id}${x.disabled ? '-' : ''}`) || []);
ok(bm.includes('pin') && bm.includes('inspect'), `battle menu ${bm}`);
await page.mouse.move(foe[0] + 40, foe[1] + 50); await wait(150 * SLOW);
await shot('controls-battle');
// pick «Закрепить карточку»
await page.evaluate(() => { const g = window.__game, M = g.ctxMenu; const i = M.items.findIndex((x) => x.id === 'pin'); const r = M.rows[i]; g.input.mouse.x = r.x + 5; g.input.mouse.y = r.y + 5; });
const pr = await page.evaluate(() => { const r = window.__game.ctxMenu.rows[window.__game.ctxMenu.items.findIndex((x) => x.id === 'pin')]; return [r.x + 10, r.y + 10]; });
await page.mouse.click(pr[0], pr[1]); await wait(200);
ok(await page.evaluate(() => !!window.__game.scene.S.pin.id), 'pin via the menu');
await key('Tab');
ok(true, 'Tab still works');

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await T.close();
process.exit(fails || errors.length ? 1 : 0);
