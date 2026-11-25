// GLB enemies in a Three.js battle (Blender pass 6, data/hero-models.js HERO_MODELS.enemy): cultists / pirates / brutes
// on the hero rig, robo-wolves and drones on own armatures. Per group: enemies drawn by GLB, attack clip by the model
// (attack_* / bite / shoot), hit, death; close-up screenshots tools/out/three-enemies-<group>-*.png; exit 1 on errors.
// Pass 7 groups android / walker / fox (+ mech ability clips), mutz: HP bar anchor over the model top.
// node tools/out/three-enemies.mjs [--night] [--only g1,g2]
import { open } from './v3-harness.mjs';

const night = process.argv.includes('--night');
const T = await open({ query: '?gfx=3d&engine=three', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, errors, wait, shot, key } = T;
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await wait(800);
const GROUPS = {
  humans: { foes: ['cultist', 'cultist-gunner', 'crg-heckler', 'pir-deckhand', 'mutz-alpha'], act: ['attack_melee', 'attack_shoot', 'attack_2h', 'shoot_2h'] },
  wolves: { foes: ['wolf-1-grey', 'wolf-4-howler', 'wolf-2-driver', 'wolf-1-grey'], act: ['bite'] },
  drones: { foes: ['lis-drone', 'drone', 'ai-kill-drone-l15'], act: ['shoot'] },
  // pass 7: Warprom androids (+ wolf-3 cyborg), «Кузнечик» walkers (+ wolf-5, commanders), «Лис» robo-foxes
  android: { foes: ['wp-vanguard-l14', 'wp-stormtrooper', 'wp-bolterman', 'wolf-3-fang', 'wp-vet-l12'], act: ['attack_melee', 'attack_shoot', 'attack_2h', 'shoot_2h'], model: 'android' },
  walker: { foes: ['wp-kuznechik', 'wolf-5-matyorny', 'wp-cmd-l8'], act: ['shoot'], model: 'walker', abil: { 'wp-stomp': 'stomp', 'wp-rockets': 'rockets' } },
  fox: { foes: ['boss-lis-9-tail', 'lis-sentry', 'lis-sentry'], act: ['bite'], model: 'fox' },
  // HP bar over the model top: beast mutants drawn by the brute model
  mutz: { foes: ['mutz-alpha', 'mutz-tusker'], act: ['attack_melee', 'attack_shoot', 'attack_2h', 'shoot_2h'], model: 'brute' },
};
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const [g, G] of Object.entries(GROUPS)) {
  if (only && !only.includes(g)) continue;
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
    // HP bar anchor (unitScreen) vs the projected model top: the bar must not sit inside the model
    const tops = foes.filter((u) => T.party.get(u.id)?.C).map((u) => {
      const R = T.party.get(u.id), V = S.v3, at = m.unitScreen(S, u, S.dispOf(u));
      return { id: u.enemyId, bar: at.y, top: V.glbTop?.[u.id] ?? null, h: R.C.height * R.k };
    });
    const dbg = foes.map((u) => `${u.enemyId} k=${T.party.get(u.id)?.k?.toFixed(3)} h=${((T.party.get(u.id)?.k || 0) * (T.party.get(u.id)?.C?.height || 0)).toFixed(2)}`);
    return { tops, dbg, glb, n: foes.length, p: f ? m.unitScreen(S, f, S.dispOf(f)) : null, id: f?.id };
  });
  console.log(g, JSON.stringify(info.glb), info.dbg.join(' | '));
  ok(info.glb.length === info.n, `${g}: ${info.glb.length}/${info.n} enemies on GLB`);
  if (G.model) ok(info.glb.every((s) => s.includes(`enemy|${G.model}|`)), `${g}: model ${G.model}`);
  ok(info.tops.every((t) => t.top != null && t.top >= t.h - 1e-3), `${g}: bar anchor over the model top ${info.tops.map((t) => `${t.id}=${t.top?.toFixed(2)}/${t.h.toFixed(2)}`).join(' ')}`);
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
  // poll until the clip shows (SwiftShader frames take up to ~1.5 s here)
  for (let i = 0; i < 40 && !seen1.some((c) => G.act.includes(c)); i++) { await wait(60); seen1.push(await clipOf(info.id)); }
  const c1 = seen1.find((c) => G.act.includes(c)) || seen1.join(',');
  ok(G.act.includes(c1), `${g}: attack -> ${c1}`);
  if (close) await shot(`three-enemies-${g}-3-attack`, close);
  await wait(1500);
  for (const [ab, clip] of Object.entries(G.abil || {})) { // mech abilities -> own clips
    await page.evaluate(async ({ id, ab }) => {
      const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S, u = S.b.byId[id], h = S.b.units.find((x) => x.team === 'heroes' && !x.dead);
      a.animEvent3d(S, { type: 'ability', actor: u.id, ability: ab, tile: { x: h.x, y: h.y } });
    }, { id: info.id, ab });
    const seen = [];
    for (let i = 0; i < 40 && !seen.includes(clip); i++) { await wait(60); seen.push(await clipOf(info.id)); }
    ok(seen.includes(clip), `${g}: ${ab} -> ${seen.find((c) => c === clip) || seen.join(',')}`);
    if (close) await shot(`three-enemies-${g}-3-${clip}`, close);
    await wait(1500);
  }
  await page.evaluate(async (id) => { const a = await import('/game/src/gfx/anim.js'); a.animEvent3d(window.__game.scene.S, { type: 'damage', target: id, amount: 1 }); }, info.id);
  const seen2 = [];
  for (let i = 0; i < 24 && !seen2.includes('hit'); i++) { await wait(60); seen2.push(await clipOf(info.id)); } // slow SwiftShader frames
  const c2 = seen2.includes('hit') ? 'hit' : seen2.join(',');
  ok(c2 === 'hit', `${g}: damage -> ${c2}`);
  await wait(1200);
  await page.evaluate(async (id) => {
    const a = await import('/game/src/gfx/anim.js'), S = window.__game.scene.S;
    S.b.byId[id].dead = true; S.b.byId[id].hp = 0; S.dispOf(S.b.byId[id]).fade = 1;
    a.animEvent3d(S, { type: 'death', target: id });
  }, info.id);
  let c3 = null;
  for (let i = 0; i < 40 && c3 !== 'death'; i++) { await wait(60); c3 = await clipOf(info.id); }
  ok(c3 === 'death', `${g}: death -> ${c3}`);
  if (close) await shot(`three-enemies-${g}-4-death`, close);
}
ok(!errors.length, `console errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log(e);
await T.close();
process.exit(fails ? 1 : 0);
