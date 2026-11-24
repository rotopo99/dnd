// GLB enemies in a Three.js battle (Blender pass 6, data/hero-models.js HERO_MODELS.enemy): cultists / pirates / brutes
// on the hero rig, robo-wolves and drones on own armatures. Per group: enemies drawn by GLB, attack clip by the model
// (attack_* / bite / shoot), hit, death; close-up screenshots tools/out/three-enemies-<group>-*.png; exit 1 on errors.
// node tools/out/three-enemies.mjs [--night]
import { open } from './v3-harness.mjs';

const night = process.argv.includes('--night');
const T = await open({ query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await wait(800);
const GROUPS = {
  humans: { foes: ['cultist', 'cultist-gunner', 'crg-heckler', 'pir-deckhand', 'mutz-alpha'], act: ['attack_melee', 'attack_shoot', 'attack_2h', 'shoot_2h'] },
  wolves: { foes: ['wolf-1-grey', 'wolf-3-fang', 'wolf-2-driver', 'wolf-1-grey'], act: ['bite'] },
  drones: { foes: ['lis-drone', 'drone', 'ai-kill-drone-l15'], act: ['shoot'] },
};
for (const [g, G] of Object.entries(GROUPS)) {
  await page.evaluate(async ({ foes, night }) => {
    Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const st = await import('/game/src/world/state.js');
    const game = window.__game;
    const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    s.flags['prologue-done'] = true;
    game.save = s;
    const wb = await import('/game/src/scenes/world-battle.js');
    wb.startWorldBattle(game, { enemies: foes, biome: 'wasteland', ...(night ? { hour: 23 } : {}), onWin: () => {} });
  }, { foes: G.foes, night });
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const S = window.__game.scene.S; for (const u of S?.b?.units || []) if (u.team === 'heroes') { u.hp = 999; u.maxHp = 999; } return { pt: S?.playerTurn, banner: !!S?.banner, q: S?.queue?.length || 0 }; });
    if (s.banner) await key('Enter');
    if (s.pt && !s.q) break;
    await wait(100);
  }
  // bring the foes next to the hero (fog of war hides far ones)
  await page.evaluate(() => {
    const S = window.__game.scene.S, b = S.b, h = b.units.find((u) => u.team === 'heroes' && !u.dead), W = S.v3.world;
    const free = (x, y) => x >= 0 && y >= 0 && x < b.grid.w && y < b.grid.h && W.obst[y * b.grid.w + x] === 0 && W.kind[y * b.grid.w + x] === 'floor' && !b.units.some((u) => !u.dead && u.x === x && u.y === y);
    const cells = [];
    for (let r = 2; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cells.push([h.x + dx, h.y + dy]);
    for (const u of b.units.filter((x) => x.kind === 'enemy' && !x.dead)) {
      const c = cells.find(([x, y]) => free(x, y));
      if (!c) continue;
      u.x = c[0]; u.y = c[1];
      const d = S.dispOf(u); d.x = u.x; d.y = u.y; if (d.path) d.path.length = 0;
      u.fogHidden = false;
    }
  });
  await page.evaluate(async () => { const { GFX } = await import('/game/src/data/gfx.js'); GFX.camera.closer = 2.2; const c = window.__game.scene.S.v3.cam; c.zoomIdx = 2; c.zoomSet = false; });
  await wait(3500);
  const info = await page.evaluate(async () => {
    const S = window.__game.scene.S, T = S.v3?.T, m = await import('/game/src/gfx/scene3d.js');
    const foes = S.b.units.filter((u) => u.kind === 'enemy' && !u.dead);
    const glb = foes.filter((u) => T.party.get(u.id)?.C).map((u) => `${u.enemyId}:${T.party.get(u.id).key}`);
    const f = foes.find((u) => T.party.get(u.id)?.C);
    const dbg = foes.map((u) => `${u.enemyId} k=${T.party.get(u.id)?.k?.toFixed(3)} h=${((T.party.get(u.id)?.k || 0) * (T.party.get(u.id)?.C?.height || 0)).toFixed(2)}`);
    return { dbg, glb, n: foes.length, p: f ? m.unitScreen(S, f, S.dispOf(f)) : null, id: f?.id };
  });
  console.log(g, JSON.stringify(info.glb), info.dbg.join(' | '));
  ok(info.glb.length === info.n, `${g}: ${info.glb.length}/${info.n} enemies on GLB`);
  await shot(`three-enemies-${g}-1-battle`);
  const clipOf = (id) => page.evaluate((id) => window.__game.scene.S.v3.T.party.get(id)?.cur || null, id);
  const close = info.p ? { x: Math.max(0, Math.min(940 - 420, info.p.x - 210)), y: Math.max(0, Math.min(720 - 360, info.p.y - 120)), width: 420, height: 360 } : null;
  if (close) await shot(`three-enemies-${g}-2-close`, close);
  if (!info.id) continue;
  await page.evaluate(async (id) => {
    const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S, u = S.b.byId[id], h = S.b.units.find((x) => x.team === 'heroes' && !x.dead);
    a.animEvent3d(S, { type: 'attack', actor: u.id, target: h.id, melee: false, hit: true });
  }, info.id);
  const seen1 = [];
  for (let i = 0; i < 8; i++) { await wait(60); seen1.push(await clipOf(info.id)); }
  const c1 = seen1.find((c) => G.act.includes(c)) || seen1.join(',');
  ok(G.act.includes(c1), `${g}: attack -> ${c1}`);
  if (close) await shot(`three-enemies-${g}-3-attack`, close);
  await wait(1500);
  await page.evaluate(async (id) => { const a = await import('/game/src/gfx/anim.js'); a.animEvent3d(window.__game.scene.S, { type: 'damage', target: id, amount: 1 }); }, info.id);
  await wait(200);
  const c2 = await clipOf(info.id);
  ok(c2 === 'hit', `${g}: damage -> ${c2}`);
  await wait(1200);
  await page.evaluate(async (id) => {
    const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S;
    S.b.byId[id].dead = true; S.b.byId[id].hp = 0; S.dispOf(S.b.byId[id]).fade = 1;
    a.animEvent3d(S, { type: 'death', target: id });
  }, info.id);
  await wait(500);
  const c3 = await clipOf(info.id);
  ok(c3 === 'death', `${g}: death -> ${c3}`);
  if (close) await shot(`three-enemies-${g}-4-death`, close);
}
ok(!errors.length, `console errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log(e);
await T.close();
process.exit(fails ? 1 : 0);
