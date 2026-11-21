// Cinematics scenario (docs/specs/cinematics.md): c1 and c4 with choices on Three.js (SwiftShader), the comic fallback.
// node tools/out/cinema.mjs [--only 3d|comic]   -> tools/out/cinema-*.png, exit 1 on console errors.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tools', 'out');
const set = (() => { const i = process.argv.indexOf('--set'); return i > 0 ? process.argv[i + 1] : 'base'; })(); // base (c1, c4) | wave2 (c7, c8)
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const { chromium } = createRequire(import.meta.url)('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/game/index.html`;
const errors = [];
// 3D on SwiftShader; the comic runs in a plain browser (headless SwiftShader stops serving screenshots after input + audio)
let browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const st = (page) => page.evaluate(() => {
  const s = window.__game?.scene;
  if (s?.id !== 'cinema') return { id: s?.id, toasts: window.__game?.toasts?.map((x) => x.text) };
  const R = s.R;
  return { id: 'cinema', mode: s.S.mode, phase: R.phase, key: R.key, done: R.done, line: !!R.line, choice: R.choice?.opts.map((o) => o.id), qte: R.qte?.kind, qkeys: R.qte?.keys, qidx: R.qte?.idx, res: R.qte?.res, result: R.result, picks: R.picks, ctr: R.ctr };
});
async function until(page, fn, ms = 30000) {
  const t0 = Date.now();
  for (;;) { const s = await st(page); if (fn(s)) return s; if (Date.now() - t0 > ms) return s; await page.waitForTimeout(150); }
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `cinema-${name}.png`) });

/** Advance lines until a choice / QTE / end; pick via `pick(state)` (digit) or let the timer run; QTE via `qte(state)`. */
async function play(page, tag, { pick, qte, shots = [] }) {
  let n = 0, taken = new Set();
  for (let guard = 0; guard < 400; guard++) {
    const s = await st(page);
    if (s.id !== 'cinema' || s.done) return s;
    if (s.mode === 'loading') { await page.waitForTimeout(300); continue; }
    if (shots.includes(s.key) && !taken.has(s.key) && s.line) { taken.add(s.key); await page.waitForTimeout(400); await shot(page, `${tag}-${s.key}`); }
    if (s.phase === 'choice') {
      if (!taken.has(`choice-${s.key}`)) { taken.add(`choice-${s.key}`); await page.waitForTimeout(700); await shot(page, `${tag}-choice-${s.key}`); }
      const d = pick?.(s);
      if (d) { await page.keyboard.press(`Digit${d}`); await page.waitForTimeout(300); } else await page.waitForTimeout(500);
      continue;
    }
    if (s.phase === 'qte') {
      if (!taken.has(`qte-${s.key}`)) { taken.add(`qte-${s.key}`); await shot(page, `${tag}-qte-${s.key}`); }
      if (qte?.(s) === 'ok') { const k = `Key${s.qte === 'seq' ? s.qkeys[s.qidx || 0] : s.qkeys?.[0] || 'E'}`; await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); }
      else await page.waitForTimeout(200);
      continue;
    }
    await page.keyboard.press('Space');
    n++;
    await page.waitForTimeout(250);
  }
  return st(page);
}

async function run(tag, query, o) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag} exception: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${tag} HTTP ${r.status()}: ${r.url()}`));
  await page.goto(`${base}?${query}`);
  const s0 = await until(page, (s) => s.id === 'cinema' && s.mode !== 'loading', 40000);
  console.log(tag, 'mode', s0.mode);
  await page.waitForTimeout(1500);
  await shot(page, `${tag}-start`);
  const end = await play(page, tag, o);
  console.log(tag, 'end', JSON.stringify({ key: end.key, result: end.result, picks: end.picks, ctr: end.ctr, toasts: end.toasts }));
  await page.close();
  return end;
}

if (set === 'wave2') {
  if (only !== 'comic') {
    await run('c7-3d', 'gfx=3d&cine=c7-ha-reel', { pick: () => 2, qte: () => 'ok', shots: ['open', 'play', 'c-watch', 'ok', 'outro'] });
    await run('c8-3d', 'gfx=3d&cine=c8-ladov-name', { pick: () => 1, qte: () => 'ok', shots: ['open', 'ladov', 'say', 'choir', 'react'] });
  }
  if (only !== '3d') {
    await browser.close();
    browser = await chromium.launch();
    await run('c7-comic', 'gfx=3d&comic=1&cine=c7-ha-reel', { pick: () => null, qte: () => 'fail', shots: ['open', 'play', 'c-wait', 'fail', 'outro'] });
    await run('c8-comic', 'gfx=3d&comic=1&cine=c8-ladov-name', { pick: () => 3, qte: () => 'fail', shots: ['open', 'turn', 'c-trade', 'trade-end'] });
  }
} else {
if (only !== 'comic') {
  await run('c1-3d', 'gfx=3d&cine=c1-arrival', { pick: () => 1, qte: () => 'ok', shots: ['gate', 'g-hands', 'alarm', 'sting'] });
  await run('c4-3d', 'gfx=3d&cine=c4-court&flags=victor-soul-freed,truth-lox5,cine-c2-impressed', { pick: (s) => (s.key === 'plea' ? 2 : 2), qte: () => 'ok', shots: ['open', 'souls', 'w-victor', 'w-lox', 'w-courier', 'won'] });
}
if (only !== '3d') {
  await browser.close();
  browser = await chromium.launch();
  await run('c1-comic', 'gfx=2d&cine=c1-arrival', { pick: () => null, qte: () => 'fail', shots: ['gate', 'g-silent', 'slide-fail', 'sting'] });
  await run('c4-comic', 'gfx=3d&comic=1&cine=c4-court', { pick: (s) => (s.key === 'plea' ? 3 : 1), qte: () => 'fail', shots: ['open', 'p-number', 'closing', 'lost'] });
}
}
await browser.close();
server.close();
if (errors.length) { console.log(`ОШИБКИ (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`); process.exit(1); }
console.log('OK: ошибок консоли нет');
