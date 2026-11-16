// Co-op world scenario (multiplayer.md stages 3–4): two contexts — co-op party → free node map, both walk →
// a guest's interaction (his window, his decision) → battle from an encounter (both play) → loot split (d20) →
// save with the «кооп» mark → the guest drops mid-battle (host AI plays his hero) → rejoin by a new code exchange.
// node tools/out/net-world.mjs  (screenshots tools/out/net-world-*.png, exit code 1 on failure / console errors)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { root } from './v3-harness.mjs';

const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/game/index.html`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errors = [];
const out = (n) => path.join(root, 'tools', 'out', `${n}.png`);
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok ' : '  FAIL'} ${what}`); if (!ok) failed++; };

async function player(tag, hero) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}\n${e.stack}`));
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(200);
  await page.evaluate((h) => { window.__net.setStun(''); window.__net.setHero(h); localStorage.setItem('dnd.fastEnemies', '1'); }, hero);
  return page;
}
const until = async (page, fn, arg, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(100); }
  return false;
};
async function connect(host, guest) {
  const offer = await host.evaluate(() => window.__net.createOffer());
  const answer = await guest.evaluate((c) => window.__net.acceptOffer(c), offer);
  await host.evaluate((c) => window.__net.acceptAnswer(c), answer);
}
const info = (page) => page.evaluate(() => window.__net.coop());
/** One step of a player's battle turn (attack in reach / step closer / end). */
const play = async (page) => page.evaluate(async () => {
  const S = window.__game.scene.S;
  if (!S || !S.playerTurn || !S.idle() || S.result || S.banner) return null;
  const C = await import('/game/src/rules/combat.js');
  const b = S.b, u = b.byId[S.heroId];
  const foes = b.units.filter((x) => x.team === 'enemies' && !x.dead && !x.removed);
  const legal = C.getLegalActions(b, u.id, { noMoves: true });
  const atk = legal.find((a) => a.type === 'attack' && a.target && b.byId[a.target]?.team === 'enemies');
  if (atk) { S.run({ k: 'act', a: atk }); return 'attack'; }
  if (b.turn.move > 0 && foes.length) {
    const dist = (x, y) => Math.min(...foes.map((f) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y))));
    const r = C.getReachable(b, u.id);
    let best = null, bd = dist(u.x, u.y);
    for (let i = 0; i < r.dist.length; i++) {
      if (!(r.dist[i] > 0)) continue;
      const x = i % b.grid.w, y = (i / b.grid.w) | 0, d = dist(x, y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) { S.run({ k: 'act', a: { type: 'move', to: best } }); return 'move'; }
  }
  S.run({ k: 'act', a: { type: 'endTurn' } });
  return 'end';
});
/** Close whatever windows are open (level-up «Дальше», loot «Забрать всё»): onCancel or the first enabled option. */
const closeModals = async (page) => {
  for (let k = 0; k < 8; k++) {
    const left = await page.evaluate(() => {
      const g = window.__game, m = g.modals.at(-1);
      if (!m) return 0;
      if (m.loot) { m.options[0].run(g); return 1; }
      if (typeof m.onCancel === 'function') { g.modals.pop(); m.onCancel(g); return 1; }
      const o = (m.options || []).find((x) => !x.disabled && !x.inert);
      if (!o.keep) g.modals.splice(g.modals.indexOf(m), 1);
      o.run?.(g);
      return 1;
    });
    if (!left) return;
    await page.waitForTimeout(200);
  }
};
const battleState = (page) => page.evaluate(() => window.__net.battle());
/** Host: a road encounter battle in the current node (scenes/world-battle.js), with forced loot. */
const startEncounter = (page) => page.evaluate(async () => {
  const g = window.__game;
  const WB = await import('/game/src/scenes/world-battle.js');
  const R = await import('/game/src/scenes/roam.js');
  const loc = g.save.location;
  WB.startWorldBattle(g, { enemies: g.data.ENCOUNTERS.standard1.enemies, title: 'Встреча', id: `t-enc-${Date.now()}`, noObjectives: true,
    extraLoot: { credits: 31, items: [{ id: 'bandage', n: 2 }, { id: 'medkit', n: 1 }] }, onWin: (g2) => g2.setScene(R.createNodeScene(loc)) });
  return g.scene.id;
});

try {
  const A = await player('host', { race: 'human', cls: 'zabivnoy', name: 'Хост' });
  const B = await player('guest', { race: 'human', cls: 'ranger', name: 'Гость' });
  await connect(A, B);
  check(await until(A, () => window.__net.session()?.guests() === 1) && await until(B, () => window.__net.session()?.status === 'connected'), 'connected');
  await B.evaluate(() => window.__net.ready(true));
  await until(A, () => window.__net.session().player(1)?.ready);

  // 1. co-op party → the free node map on both pages
  check(await A.evaluate(() => window.__net.startCoop(true)), 'host starts a new co-op party');
  const inRoam = await until(A, () => window.__game.scene.id === 'roam') && await until(B, () => window.__game.scene.id === 'roam');
  check(inRoam, 'both on the free node map');
  const ia = await info(A), ib = await info(B);
  check(ia.node === ib.node && ia.linked.some(([s, n]) => s === 1 && n === 'Гость'), `same node ${ia.node}, guest linked into the host party`);
  check(ib.hero?.name === 'Гость' && !(await B.evaluate(() => window.__game.save.party.length)), 'guest mirror: his own hero, no companions');

  // 2. both walk: host D, guest S — the host sees the guest move and vice versa
  const posOf = (inf, slot) => inf.pos.find((p) => p[0] === slot);
  await A.waitForTimeout(600);
  const g0 = posOf(await info(A), 1);
  await Promise.all([A.keyboard.down('KeyD'), B.keyboard.down('KeyA')]);
  await A.waitForTimeout(900);
  await Promise.all([A.keyboard.up('KeyD'), B.keyboard.up('KeyA')]);
  await A.waitForTimeout(700);
  const g1 = posOf(await info(A), 1), h1 = posOf(await info(B), 0);
  const ldA = await A.evaluate(() => { const l = window.__game.scene.leader(); return [l.x, l.y]; });
  const ldB = await B.evaluate(() => { const l = window.__game.scene.leader(); return [l.x, l.y]; });
  check(!!g1 && (!g0 || Math.hypot(g1[1] - g0[1], g1[2] - g0[2]) > 0.5) && Math.hypot(g1[1] - ldB[0], g1[2] - ldB[1]) < 1.5, `host sees the guest walk (${JSON.stringify(g0)} → ${JSON.stringify(g1)}, guest ${ldB.map((v) => v.toFixed(1))})`);
  check(!!h1 && Math.hypot(h1[1] - ldA[0], h1[2] - ldA[1]) < 1.5, `guest sees the host (${JSON.stringify(h1)} ~ ${ldA.map((v) => v.toFixed(1))})`);
  await A.screenshot({ path: out('net-world-roam-host') });
  await B.screenshot({ path: out('net-world-roam-guest') });

  // 3. guest's interaction: walk to an NPC → request → host opens the NPC window owned by the guest → guest closes it
  // walk to the nearest NPC (they wander — re-aim every 0.4 s), E next to him
  for (let k = 0; k < 40; k++) {
    const st = await B.evaluate(() => {
      const g = window.__game, sc = g.scene, ld = sc.leader();
      const d = (e) => Math.hypot(e.x - ld.cx, e.y - ld.cy);
      const e = sc.entities().filter((x) => x.kind === 'npc').sort((p, q) => d(p) - d(q))[0];
      if (!e) return 'none';
      window.__dbgTarget = `npc:${e.n.id} d=${d(e).toFixed(1)}`;
      if (d(e) <= 1.5) return 'near';
      sc.goTo(g, e);
      return 'walk';
    });
    if (st === 'near') { await B.keyboard.press('KeyE'); break; }
    if (st === 'none') break;
    await B.waitForTimeout(400);
  }
  const got = await until(B, () => window.__net.coop()?.modal?.owner === 1, null, 20000);
  check(got, `guest interaction → host window, decided by the guest (target ${await B.evaluate(() => window.__dbgTarget)})`);
  if (!got) console.log('debug', JSON.stringify(await B.evaluate(() => window.__game.toasts.map((x) => x.text))), JSON.stringify(await A.evaluate(() => [window.__game.modals.map((m) => m.title), window.__game.scene.entities().filter((e) => e.kind === 'npc').map((e) => [e.n.id, e.x.toFixed(1), e.y.toFixed(1)]), window.__game.scene.leader().cx])));
  if (got) {
    check(await A.evaluate(() => window.__game.modals.at(-1)?._owner === 1), 'host window marked as the guest\'s');
    await B.screenshot({ path: out('net-world-npc-guest') });
    await B.evaluate(() => { const m = window.__game.modals.find((x) => x.net); m.options.at(-1).run(window.__game); });
    check(await until(A, () => !window.__game.modals.some((m) => m._owner === 1)), 'guest choice applied on the host (window closed)');
  }

  // 4. battle from an encounter: both play their heroes
  check(await startEncounter(A) === 'battle', 'host: encounter battle');
  check(await until(B, () => !!window.__net.battle()), 'guest in the same battle');
  const heroIds = await B.evaluate(() => window.__game.scene.S.b.units.filter((u) => u.team === 'heroes').map((u) => u.id));
  check(heroIds.includes('hero') && heroIds.includes('hero2'), `heroes ${heroIds.join(',')}`);
  let ga = 0, ha = 0;
  const tb = Date.now();
  while (Date.now() - tb < 240000) {
    const [sa, sb] = await Promise.all([battleState(A), battleState(B)]);
    if (!sa || !sb || (sa.result && sb.result)) break;
    if (await play(A)) ha++;
    if (await play(B)) ga++;
    await A.waitForTimeout(100);
  }
  const fa = await battleState(A), fb = await battleState(B);
  check(fa?.winner === 'heroes' && fb?.winner === 'heroes', `battle won on both (${fa?.winner} / ${fb?.winner}, desyncs ${fa?.desyncs})`);
  check(ga > 0 && ha > 0, `both acted (${ha} / ${ga})`);
  const credits0 = (await info(B)).hero.credits;
  await A.keyboard.press('Enter'); await B.keyboard.press('Enter');

  // 5. loot split: every item — take / pass, d20 roll-off
  let items = 0;
  for (let k = 0; k < 6; k++) {
    const open = await until(B, () => !!window.__net.coop()?.modal?.loot, null, 8000);
    if (!open) break;
    if (!items) await B.screenshot({ path: out('net-world-loot-guest') });
    items++;
    await B.evaluate(() => { const m = window.__game.modals.find((x) => x.net); m.options[0].run(window.__game); });
    await A.waitForTimeout(150);
    await A.evaluate(() => { const m = window.__game.modals.at(-1); if (m?.loot) m.options[0].run(window.__game); });
    await A.waitForTimeout(300);
  }
  check(items >= 2, `loot split windows: ${items}`);
  const lootLines = await A.evaluate(() => window.__net.session().chat.filter((l) => /Раздел добычи:/.test(l.text)).map((l) => l.text));
  check(lootLines.length >= 2 && lootLines.some((l) => /d20/.test(l)), `roll-off results in chat:\n       ${lootLines.join('\n       ')}`);
  check(await until(A, () => window.__game.scene.id === 'roam') && await until(B, () => window.__game.scene.id === 'roam'), 'back on the node map');
  await closeModals(A);
  await B.waitForTimeout(1500);
  const credits1 = (await info(B)).hero.credits;
  check(credits1 - credits0 >= 15, `guest got his half of the credits (${credits0} → ${credits1})`);

  // 6. save: the host's slot with the co-op mark; the guest keeps a copy of his hero
  const saved = await A.evaluate(async () => {
    const SV = await import('/game/src/save.js');
    SV.saveToSlot(window.__game.save, 1);
    const sl = SV.listSlots().find((x) => x.slot === 1);
    const raw = JSON.parse(localStorage.getItem(SV.slotKey(1)));
    return { coop: sl.coop, guest: raw.coop?.players?.[0]?.name, credits: raw.coop?.players?.[0]?.hero?.credits };
  });
  check(saved.coop === 1 && saved.guest === 'Гость' && saved.credits === credits1, `host save marked «кооп» with the guest hero (${JSON.stringify(saved)})`);
  const copy = await B.evaluate(() => { const h = JSON.parse(localStorage.getItem('ruslania-net-hero') || 'null'); return h && { name: h.name, bag: !!h.bag, credits: h.credits }; });
  check(copy?.name === 'Гость' && copy.bag && copy.credits === credits1, `guest keeps his hero copy (${JSON.stringify(copy)})`);
  const guestSlots = await B.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ruslania-save')).length);
  check(guestSlots === 0, 'guest wrote no world save');

  // 7. second battle: the guest drops mid-battle → the host AI plays his hero to the end
  check(await startEncounter(A) === 'battle' && await until(B, () => !!window.__net.battle()), 'second battle');
  const t2 = Date.now();
  let dropped = false, hostActs = 0;
  while (Date.now() - t2 < 240000) {
    const sa = await battleState(A);
    if (!sa || sa.result) break;
    if (await play(A)) hostActs++;
    // a network drop on the guest side: the channel dies (the host sees onclose, the guest — failed); after the guest's
    // first action, or after two host actions when the guest's turn has not come (fast battles)
    if (!dropped) { if ((await play(B)) || hostActs >= 2) { await B.waitForTimeout(400); await B.evaluate(() => { const p = window.__net.session().pending; p.close(); p.onClose?.(); }); dropped = true; } }
    await A.waitForTimeout(100);
  }
  const f2 = await battleState(A);
  if (!dropped) console.log('debug guest', JSON.stringify(await B.evaluate(() => { const g = window.__game, S = g.scene.S; return { scene: g.scene.id, modals: g.modals.map((m) => m.title), pt: S?.playerTurn, banner: S?.banner, res: S?.result, turn: S?.b?.turn?.unitId, heroId: S?.heroId }; })));
  check(dropped && f2?.winner, `battle ended with the guest gone (${f2?.winner})`);
  check(await A.evaluate(() => window.__net.session().player(1)?.connected === false), 'host: guest disconnected, slot kept');
  await B.waitForTimeout(300);
  await B.keyboard.press('Escape');
  check(await until(B, () => window.__net.session().status === 'lost'), 'guest: connection lost');
  await A.keyboard.press('Enter');
  await A.waitForTimeout(600);
  await closeModals(A);
  check(await until(A, () => window.__game.scene.id === 'roam'), 'host back on the node map');
  await B.waitForTimeout(400);
  await B.screenshot({ path: out('net-world-lost-guest') });

  // 8. rejoin: F2 on both, new code exchange, the guest returns into the host's scene with his hero
  await A.evaluate(() => window.__net.coopMenu());
  await B.evaluate(() => window.__net.coopMenu());
  check(await B.evaluate(() => window.__net.view()) === 'join', 'guest: join view for the new code');
  await connect(A, B);
  check(await until(A, () => window.__net.session().player(1)?.connected) && await until(B, () => window.__net.session().status === 'connected'), 'reconnected');
  check(await B.evaluate(() => window.__net.session().slot) === 1, 'same slot');
  await A.evaluate(() => window.__net.backGame());
  const back = await until(B, () => window.__game.scene.id === 'roam') && await until(A, () => window.__game.scene.id === 'roam');
  check(back, 'guest back in the host scene');
  if (!back) console.log('debug', await B.evaluate(() => window.__game.scene.id), JSON.stringify(await info(B)), await A.evaluate(() => window.__game.scene.id));
  const ib2 = await info(B);
  check(ib2.hero?.name === 'Гость' && ib2.hero.credits === credits1, `same hero after the rejoin (${JSON.stringify(ib2.hero)})`);
  await B.waitForTimeout(800);
  await A.screenshot({ path: out('net-world-rejoin-host') });
  console.log('host', JSON.stringify((await info(A)).stats), '\nguest', JSON.stringify((await info(B)).stats));
} catch (e) {
  failed++;
  console.log('  FAIL exception', e.stack);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { failed++; console.log('console errors:\n' + errors.join('\n')); }
console.log(failed ? `\nFAILED: ${failed}` : '\nOK');
process.exit(failed ? 1 : 0);
