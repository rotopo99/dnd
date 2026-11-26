// QA v56 #1: c13 «ПОВЕРНУТЬ РУЧКУ» hold-Space QTE passes with the keyboard. node tools/out/c13-hold.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)('playwright');
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/game/index.html?gfx=2d&cine=c13-schedule&flags=disp-live`);
const st = () => page.evaluate(() => { const s = window.__game?.scene; const R = s?.R; return s?.id !== 'cinema' ? { id: s?.id } : { mode: s.S.mode, phase: R.phase, key: R.key, done: R.done, choice: R.choice?.opts.map((o) => o.id), qte: R.qte?.kind, res: R.qte?.res, picks: R.picks }; });
let res = null;
for (let g = 0; g < 300; g++) {
  const s = await st();
  if (s.id && s.id !== 'cinema') break;
  if (s.done || s.mode === 'loading') { if (s.done) break; await page.waitForTimeout(300); continue; }
  if (s.phase === 'choice') { const i = s.choice.indexOf('turn'); await page.keyboard.press(`Digit${i + 1}`); await page.waitForTimeout(300); continue; }
  if (s.phase === 'qte' && s.qte === 'hold') { await page.keyboard.down('Space'); await page.waitForTimeout(3600); await page.keyboard.up('Space'); await page.waitForTimeout(500); res = (await st()).key; continue; }
  if (s.phase === 'qte') { await page.waitForTimeout(200); continue; }
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
}
const s = await st();
console.log('after hold key:', res, 'picks:', JSON.stringify(s.picks), 'errors:', errors.length);
await browser.close(); server.close();
process.exit(res && /turn-ok|end-diverted/.test(res) && !errors.length ? 0 : 1);
