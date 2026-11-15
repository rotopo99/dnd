// Co-op scenario (multiplayer.md §8): one browser, two contexts (host / guest) + a third with another version.
// Codes are carried between pages by the script (window.__net hooks). Checks: connect ≤ 20 s, lobby, chat, ready,
// version reject, co-op training battle to the end, guest buttons off on a foreign turn, desync → fullState.
// node tools/out/net.mjs  (screenshots tools/out/net-*.png, exit code 1 on failure / console errors)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { root } from './v3-harness.mjs';

const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/game/index.html`;
const { chromium } = createRequire(import.meta.url)('playwright');
// loopback: no STUN; plain host candidates instead of mDNS names
const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errors = [];
const out = (n) => path.join(root, 'tools', 'out', `${n}.png`);
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok ' : '  FAIL'} ${what}`); if (!ok) failed++; };

async function player(tag, hero) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); else if (m.text().startsWith('enabled')) console.log(tag, m.text()); });
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
/** Exchange codes: host invite → guest answer → host connects. */
async function connect(host, guest) {
  const offer = await host.evaluate(() => window.__net.createOffer());
  const answer = await guest.evaluate((c) => window.__net.acceptOffer(c), offer);
  await host.evaluate((c) => window.__net.acceptAnswer(c), answer);
  return { offer, answer };
}

try {
  const A = await player('host', { race: 'human', cls: 'zabivnoy', name: 'Хост' });
  const B = await player('guest', { race: 'human', cls: 'ranger', name: 'Гость' });

  // 1. connect
  const t0 = Date.now();
  const { offer, answer } = await connect(A, B);
  check(offer.startsWith('RSL1.') && answer.startsWith('RSL1.'), `codes RSL1. (${offer.length} / ${answer.length} chars)`);
  const okA = await until(A, () => window.__net.session()?.guests() === 1 && window.__net.view() === 'lobby');
  const okB = await until(B, () => window.__net.session()?.status === 'connected' && window.__net.view() === 'lobby');
  check(okA && okB, `connected on both pages in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // 2. chat + ready
  await B.evaluate(() => window.__net.chat('привет из гостевой'));
  await A.evaluate(() => window.__net.chat('здорово, ходим по очереди'));
  const chatOk = await until(B, () => window.__net.session().chat.some((l) => l.text === 'здорово, ходим по очереди'))
    && await until(A, () => window.__net.session().chat.some((l) => l.text === 'привет из гостевой' && l.name === 'Гость'));
  check(chatOk, 'chat both ways');
  await B.evaluate(() => window.__net.ready(true));
  check(await until(A, () => window.__net.session().player(1)?.ready), 'guest ready on host');

  // 3. version mismatch: a third player with another version is rejected, the lobby stays at 2
  const X = await player('old', { race: 'human', cls: 'ranger', name: 'Старый' });
  await X.evaluate(() => window.__net.setVersion('0.0-old'));
  await connect(A, X);
  const rej = await until(X, () => /Версии игры отличаются/.test(window.__net.error()));
  check(rej, `version reject: «${await X.evaluate(() => window.__net.error())}»`);
  check(await A.evaluate(() => window.__net.session().players.length === 2), 'lobby not filled by the rejected guest');
  await X.context().close();
  await A.evaluate(() => window.__net.toLobby());
  await A.waitForTimeout(500);
  await A.screenshot({ path: out('net-lobby-host') });
  await B.screenshot({ path: out('net-lobby-guest') });

  // 4. co-op training battle
  check(await A.evaluate(() => window.__net.startTraining()), 'host starts the training battle');
  const inA = await until(A, () => !!window.__net.battle());
  const inB = await until(B, () => !!window.__net.battle());
  check(inA && inB, 'both in the co-op battle');
  // a player's turn: attack an enemy in reach, else step towards the nearest enemy, else end the turn
  const play = async (page) => page.evaluate(async () => {
    const sc = window.__game.scene;
    const S = sc.S;
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
  let corrupted = false, shotForeign = false, foreignOk = true, guestActs = 0, hostActs = 0;
  const tb = Date.now();
  while (Date.now() - tb < 240000) {
    const [sa, sb] = await Promise.all([A.evaluate(() => window.__net.battle()), B.evaluate(() => window.__net.battle())]);
    if (!sa || !sb) break;
    if (sa.result && sb.result) break;
    if ((await play(A))) hostActs++;
    if ((await play(B))) guestActs++;
    // guest during the host hero's turn: all action buttons are off, top bar names the player
    if (sb.cur === 'hero' && !sb.mineTurn) {
      const off = await B.evaluate(() => { const bad = window.__game.scene.S.buttons.filter((x) => !x.disabled).map((x) => x.id); if (bad.length) console.log('enabled', bad.join()); return !bad.length; });
      foreignOk = foreignOk && off;
      if (!shotForeign && off) { await B.waitForTimeout(150); await B.screenshot({ path: out('net-battle-guest') }); shotForeign = true; }
    }
    if (!corrupted && sa.seq > 30) {
      corrupted = await B.evaluate(() => window.__net.corrupt());
      await A.screenshot({ path: out('net-battle-host') });
    }
    await A.waitForTimeout(120);
  }
  const fa = await A.evaluate(() => window.__net.battle());
  const fb = await B.evaluate(() => window.__net.battle());
  console.log('host', JSON.stringify(fa), '\nguest', JSON.stringify(fb), `\nacts host ${hostActs} guest ${guestActs}`);
  check(!!fa?.winner && fa.winner === fb?.winner, `battle to the end: ${fa?.winner} / ${fb?.winner}`);
  check(guestActs > 0 && hostActs > 0, 'both players acted');
  check(foreignOk && shotForeign, 'guest buttons disabled on the host turn');
  check(corrupted && fb.resyncs >= 1 && fa.desyncs >= 1, `corrupted guest restored by fullState (desyncs ${fa.desyncs}, resyncs ${fb.resyncs})`);
  check(fa.desyncs === fb.resyncs && fa.desyncs <= 1, 'no other desync');
  check(fa.seq === fb.seq, `same command count ${fa.seq} / ${fb.seq}`);
  await B.screenshot({ path: out('net-battle-end') });
  // result → back to the lobby
  await A.keyboard.press('Enter'); await B.keyboard.press('Enter');
  check(await until(A, () => window.__game.scene.id === 'net') && await until(B, () => window.__game.scene.id === 'net'), 'back to the lobby');
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
