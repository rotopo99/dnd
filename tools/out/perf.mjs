// Frame-time profile per scene (docs/perf.md): headless Chromium on SwiftShader, so absolute numbers are slow —
// compare scenes and before/after runs relative to each other.
// Per scene: rAF deltas (wall frame time), time of the frame callback + a 1-px readback when it drew (CPU + GPU of the frame;
// "drawn" — only frames with WebGL draws: the cost of one 3D frame, stable on SwiftShader unlike wall time), WebGL draw calls (both 3D backends),
// renderer.info of Three.js (calls / triangles / geometries / textures / programs), visible meshes / materials,
// Canvas 2D call counts (fillText / measureText / drawImage), top self-time JS functions (CDP Profiler).
//   node tools/out/perf.mjs [--label before] [--hq] [--q low|medium|high] [--ms 4000] [--only menu,roam] [--top 12]
// -> tools/out/perf-<label>.json + a table on stdout. Exit 1 on console errors.
import fs from 'node:fs';
import path from 'node:path';
import { open, root } from './v3-harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LABEL = arg('--label', 'now'), MS = +arg('--ms', 4000), TOP = +arg('--top', 12), ONLY = arg('--only', '');
const HQ = process.argv.includes('--hq'), Q = arg('--q', '');

const init = `(() => {
  const P = window.__perf = { on: false, dt: [], cpu: [], gl: [], calls: [], tris: [], c2: [], last: 0, glN: 0, c2N: { fillText: 0, measureText: 0, drawImage: 0 }, scenes: new Set() };
  const G = WebGL2RenderingContext.prototype;
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
    const f = G[k]; if (f) G[k] = function (...a) { P.glN++; return f.apply(this, a); };
  }
  P.progN = 0; { const f = G.linkProgram; G.linkProgram = function (...a) { P.progN++; return f.apply(this, a); }; }
  const C = CanvasRenderingContext2D.prototype;
  for (const k of Object.keys(P.c2N)) { const f = C[k]; C[k] = function (...a) { P.c2N[k]++; return f.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!P.on) return cb(t);
    const r = window.__game?.gfx?.three?.renderer;
    if (r && !r.__perf) {
      r.__perf = true; r.info.autoReset = false;
      const o = r.render; r.render = function (s, c) { if (s?.isScene) P.scenes.add(s); return o.call(this, s, c); };
    }
    if (r) r.info.reset();
    P.glN = 0; for (const k in P.c2N) P.c2N[k] = 0;
    const t0 = performance.now(); cb(t);
    if (P.glN) { // GPU work inside the timing: a 1-pixel readback waits for the frame's commands
      try { const g = r?.getContext() || document.getElementById('gl')?.getContext('webgl2'); if (g) { g.bindFramebuffer(g.FRAMEBUFFER, null); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, P.px ||= new Uint8Array(4)); } } catch { /* lost */ }
    }
    const t1 = performance.now();
    if (P.last) P.dt.push(t - P.last);
    P.last = t; P.cpu.push(t1 - t0); P.gl.push(P.glN); P.c2.push({ ...P.c2N });
    if (r) { P.calls.push(r.info.render.calls); P.tris.push(r.info.render.triangles); }
  });
})()`;

const query = `?gfx=3d&engine=three${HQ ? '&hq=1' : ''}${Q ? `&quality=${Q}` : ''}`;
const T = await open({ query, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], init });
const { page, errors, wait, key } = T;
page.on('response', (r) => { if (r.status() >= 400) console.log(`  ${r.status()} ${r.url().replace(/^.*\/game\//, '')}`); });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
await wait(1500);

const seedRandom = `(() => { let r = 12345; Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647); })()`;
const HERO = { name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] };
const worldSave = async () => page.evaluate(async (H) => {
  const st = await import('/game/src/world/state.js');
  const s = st.newSave(H);
  s.flags['prologue-done'] = true; s.location = 'alpha-harmony'; s.visited = ['alpha-harmony'];
  localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
}, HERO);
const settleBattle = async () => {
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => { const S = window.__game.scene.S; return S ? { pt: S.playerTurn, banner: !!S.banner, q: S.queue?.length || 0 } : null; });
    if (!s) return;
    if (s.banner) await key('Enter');
    if (s.pt && !s.q && !s.banner) return;
    await wait(150);
  }
};

const SCENES = {
  menu: async () => { await page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); window.__game.setScene(m.menuScene); }); },
  creator: async () => { await page.evaluate(async () => { const m = await import('/game/src/scenes/create.js'); window.__game.setScene(m.createCreateScene()); }); },
  prologue: async () => {
    await page.evaluate(async ([sr, H]) => {
      eval(sr);
      const [{ MAPS }, b] = await Promise.all([import('/game/src/data/index.js'), import('/game/src/scenes/battle.js')]);
      const g = window.__game; g.hero = H;
      g.setScene(b.createBattleScene({ hero: H, map: MAPS['prologue-1'], title: 'perf', onWin: () => {}, onExit: () => {} }));
    }, [seedRandom, HERO]);
    await settleBattle();
  },
  cinematic: async () => {
    await page.evaluate(async (H) => {
      const c = await import('/game/src/scenes/cinema.js');
      c.playCinematic(window.__game, 'c1-arrival', { save: { flags: {}, cine: {} }, hero: { ...H, avatar: null }, debug: true, onEnd: () => {} });
    }, HERO);
  },
  roam: async () => { await worldSave(); await page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game); }); },
  worldmap: async () => {
    await page.evaluate(async () => {
      const g = window.__game;
      if (!g.save) { const m = await import('/game/src/scenes/menu.js'); m.continueGame(g); }
      const w = await import('/game/src/scenes/world-map.js'); g.setScene(w.createWorldMapScene());
    });
  },
  roguelike: async () => {
    await page.evaluate(async (sr) => {
      eval(sr);
      const [R, M] = await Promise.all([import('/game/src/world/run.js'), import('/game/src/scenes/run-map.js')]);
      const run = R.newRun({ seed: 'PERF', party: [{ tpl: 't-zabivnoy', race: 'human' }, { tpl: 't-ranger', race: 'human' }, { tpl: 't-technomant', race: 'human' }, { tpl: 't-ecolog', race: 'human' }] });
      const node = run.graph.layers.flat().find((n) => n.type === 'fight' && n.enc) || run.graph.layers.flat().find((n) => n.enc);
      M.runFight(window.__game, run, node, node.enc, () => {});
    }, seedRandom);
    await settleBattle();
  },
};

const stats = (a) => {
  if (!a.length) return { avg: 0, p50: 0, p95: 0 };
  const s = [...a].sort((x, y) => x - y);
  return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) };
};
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0);

function topFunctions(profile) {
  const { nodes, samples, timeDeltas } = profile;
  const self = new Map(), byId = new Map(nodes.map((n) => [n.id, n]));
  for (let i = 0; i < samples.length; i++) {
    const n = byId.get(samples[i]); if (!n) continue;
    const f = n.callFrame, file = (f.url || '').replace(/^.*\/game\//, '').replace(/^.*\/vendor\//, 'vendor/');
    const k = `${f.functionName || '(anon)'} ${file ? `${file}:${f.lineNumber + 1}` : ''}`.trim();
    self.set(k, (self.get(k) || 0) + (timeDeltas[i] || 0) / 1000);
  }
  const tot = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => ({ fn: k, ms: +v.toFixed(1), pct: +((100 * v) / tot).toFixed(1) }));
  // inclusive time of game functions (src/…): which of our systems the samples are under
  const parent = new Map();
  for (const n of nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map();
  for (let i = 0; i < samples.length; i++) {
    const seen = new Set();
    for (let id = samples[i]; id !== undefined; id = parent.get(id)) {
      const f = byId.get(id)?.callFrame; if (!f || !/\/src\//.test(f.url)) continue;
      const k = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/game\//, '')}:${f.lineNumber + 1}`;
      if (seen.has(k)) continue; seen.add(k);
      incl.set(k, (incl.get(k) || 0) + (timeDeltas[i] || 0) / 1000);
    }
  }
  return { self: fmt(self), incl: fmt(incl) };
}

const out = { label: LABEL, query, ms: MS, scenes: {} };
for (const [name, enter] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  await enter();
  await wait(name === "menu" || name === "creator" ? 2000 : 7000); // GLB loads, shader compiles, first frames
  await page.evaluate(() => { const P = window.__perf; P.on = true; P.last = 0; for (const k of ['dt', 'cpu', 'gl', 'calls', 'tris', 'c2']) P[k] = []; P.scenes.clear(); P.progN = 0; });
  await cdp.send('Profiler.start');
  await wait(MS);
  // heavy scenes on SwiftShader: at least 6 frames, 3D scenes — 9 drawn frames (up to 45 s more; compare p50:
  // SwiftShader compiles pipeline variants lazily, single frames can take seconds)
  await page.waitForFunction(() => { const P = window.__perf; return P.dt.length >= 6 && (P.gl.every((x) => !x) || P.gl.filter((x) => x > 0).length >= 9); }, null, { timeout: 45000, polling: 250 }).catch(() => {});
  const { profile } = await cdp.send('Profiler.stop');
  const r = await page.evaluate(() => {
    const P = window.__perf; P.on = false;
    const g = window.__game, r3 = g.gfx?.three?.renderer;
    const mats = new Set(); let meshes = 0, skinned = 0, outlines = 0;
    for (const s of P.scenes) s.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      meshes++; if (o.isSkinnedMesh) skinned++;
      for (const m of [].concat(o.material)) { mats.add(m); if (m.side === 1 && m.userData?.hull !== false && /hull|outline/i.test(m.name || m.type)) outlines++; }
    });
    const c2 = P.c2.reduce((a, c) => { for (const k in c) a[k] = (a[k] || 0) + c[k]; return a; }, {});
    for (const k in c2) c2[k] = +(c2[k] / Math.max(1, P.c2.length)).toFixed(0);
    return {
      scene: g.scene?.id, frames: P.dt.length, dt: P.dt, cpu: P.cpu, gl: P.gl, calls: P.calls, tris: P.tris, c2,
      mem: r3 ? { geometries: r3.info.memory.geometries, textures: r3.info.memory.textures, programs: r3.info.programs?.length || 0 } : null,
      meshes, skinned, materials: mats.size, scale: g.gfx?.three?.scale, quality: g.gfx?.three?.quality || null,
      canvas: `${g.canvas.width}x${g.canvas.height}`, links: P.progN,
    };
  });
  const res = {
    scene: r.scene, frames: r.frames, frame: stats(r.dt), js: stats(r.cpu), drawn: stats(r.cpu.filter((x, i) => r.gl[i] > 0)), drawnN: r.gl.filter((x) => x > 0).length, glCalls: avg(r.gl), threeCalls: avg(r.calls), tris: avg(r.tris),
    c2: r.c2, mem: r.mem, meshes: r.meshes, skinned: r.skinned, materials: r.materials, scale: r.scale, quality: r.quality, links: r.links, top: topFunctions(profile),
  };
  out.scenes[name] = res;
  await page.screenshot({ path: path.join(root, 'tools', 'out', `perf-${LABEL}-${name}.png`), timeout: 90000 }).catch((e) => console.log('  (no screenshot)', e.message.split('\n')[0]));
  console.log(`${name.padEnd(10)} ${String(res.scene).padEnd(9)} frame avg ${res.frame.avg} p95 ${res.frame.p95} ms | cpu+gpu ${res.js.avg} | drawn ${res.drawnN} p50 ${res.drawn.p50} avg ${res.drawn.avg} | gl ${res.glCalls} three ${res.threeCalls} tris ${res.tris} | links ${res.links} | meshes ${res.meshes} skinned ${res.skinned} mats ${res.materials} | 2d ${JSON.stringify(res.c2)}`);
  for (const f of res.top.self) console.log(`    self ${String(f.pct).padStart(5)}% ${String(f.ms).padStart(7)} ms  ${f.fn}`);
  for (const f of res.top.incl) console.log(`    incl ${String(f.pct).padStart(5)}% ${String(f.ms).padStart(7)} ms  ${f.fn}`);
}
fs.writeFileSync(path.join(root, 'tools', 'out', `perf-${LABEL}.json`), JSON.stringify(out, null, 1));
console.log(`errors ${errors.length}`, errors.slice(0, 3));
await T.close();
process.exit(errors.length ? 1 : 0);
