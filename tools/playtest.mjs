// Плейтест: поднимает статический сервер, открывает игру в headless Chromium,
// жмёт клавиши по сценарию, снимает скриншоты, собирает ошибки консоли.
// Использование: node tools/playtest.mjs [--keys "ArrowRight*10,Space"] [--wait 1000]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tools', 'out');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const keys = arg('--keys', '');
const wait = Number(arg('--wait', 1000));

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright не найден: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/game/index.html`;

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 460 } });
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`exception: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));

await page.goto(url);
await page.waitForTimeout(wait);
await page.screenshot({ path: path.join(outDir, '0-start.png') });

let shot = 1;
for (const step of keys.split(',').map((s) => s.trim()).filter(Boolean)) {
  const [key, times = '1'] = step.split('*');
  for (let i = 0; i < Number(times); i++) {
    await page.keyboard.down(key);
    await page.waitForTimeout(50);
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `${shot++}-${key}.png`) });
}

await browser.close();
server.close();

console.log(`Скриншоты: ${path.relative(root, outDir)}/ (${shot} шт.)`);
if (errors.length) {
  console.log(`ОШИБКИ (${errors.length}):\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('OK: ошибок консоли нет');
