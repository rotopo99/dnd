// Records game/dance.html to frames (and a video if ffmpeg is present): node tools/dance-record.mjs [outDir] [fps] [seconds]
// Needs a static server on :8000 at the repo root (python3 -m http.server 8000).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const outDir = process.argv[2] || 'tools/out/dance', fps = Number(process.argv[3] || 30);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8000/game/dance.html?t=0');
await page.waitForFunction(() => window.__dance);
const loop = await page.evaluate(() => window.__dance.loop);
const secs = Number(process.argv[4] || loop), n = Math.round(secs * fps);
for (let i = 0; i < n; i++) {
  const png = await page.evaluate((t) => { window.__dance.renderAt(t); return document.getElementById('stage').toDataURL('image/png').split(',')[1]; }, i / fps);
  fs.writeFileSync(path.join(outDir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
}
await browser.close();
console.log(errors.length ? errors : `ok: ${n} frames`);
try {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(outDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(outDir, 'dance.mp4')]);
  console.log(path.join(outDir, 'dance.mp4'));
} catch { /* no ffmpeg: frames only */ }
