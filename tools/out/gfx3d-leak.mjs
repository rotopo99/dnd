// GPU resource lifecycle (QA v34 P1, v39 #2): quick 3D battles (fixed human ranger -> GLB hero, fixed encounter, seeded
// Math.random) and roam entries, each followed by an exit to the menu. Warm-up WARM iterations (> GFX.meshIdle model
// variants cached), then live WebGL objects (create* - delete*) are sampled every iteration; the minimum of the first
// and of the last window must match (±5), and no GLB party state may survive an exit.
// node tools/out/gfx3d-leak.mjs [--n 40]   -> exit 1 on growth or console errors
import { open } from './v3-harness.mjs';
const init = `(() => {
  const P = WebGL2RenderingContext.prototype; window.__gl = {};
  for (const k of ['Texture', 'Buffer', 'Framebuffer', 'VertexArray']) {
    const c = P['create' + k], d = P['delete' + k]; window.__gl[k] = 0;
    P['create' + k] = function (...a) { window.__gl[k]++; return c.apply(this, a); };
    P['delete' + k] = function (...a) { if (a[0]) window.__gl[k]--; return d.apply(this, a); };
  }
})()`;
const T = await open({ query: '?gfx=3d', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], init });
const { page, errors, wait } = T;
const snap = () => page.evaluate(() => ({ ...window.__gl }));
const toMenu = () => page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); window.__game.setScene(m.menuScene); });
const battle = () => page.evaluate(async () => {
  let r = 12345; Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647); // same map / rolls every iteration
  const m = await import('/game/src/scenes/menu.js');
  m.startQuickBattle(window.__game, { race: 'human', cls: 'ranger', path: null, name: 'Den' });
});
const roam = () => page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  if (!localStorage.getItem('ruslania-save-v1')) {
    const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    s.flags['prologue-done'] = true; s.location = 'alpha-harmony'; s.visited = ['alpha-harmony'];
    localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
  }
  const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game);
});
const argN = process.argv.indexOf('--n'), N = argN > 0 ? +process.argv[argN + 1] : 40, WARM = 20, WIN = 8;
let fail = 0;
const diff = (a, b) => Object.keys(a).filter((k) => b[k] - a[k] > 5);
const minOf = (list) => Object.fromEntries(Object.keys(list[0]).map((k) => [k, Math.min(...list.map((s) => s[k]))]));
for (const [name, enter, ms] of [['battle', battle, 500], ['roam', roam, 900]]) {
  const samples = []; let drew = 0, partyLeft = 0;
  for (let i = 1; i <= WARM + N; i++) {
    await enter(); await wait(ms);
    await page.waitForFunction(() => window.__game.gfx.live.size > 0, null, { timeout: 4000 }).catch(() => {}); // slow software frames
    drew += await page.evaluate(() => (window.__game.scene.S?.v3 || window.__game.scene.S?.r3?.v3 || window.__game.scene.r3?.v3 || window.__game.gfx.live.size ? 1 : 0));
    const T3 = () => window.__game.scene.S?.v3?.T || window.__game.scene.r3?.v3?.T;
    const keepT = await page.evaluate((f) => { const T = eval(f)(); window.__lastT = T || null; return !!T; }, T3.toString());
    // the old 3D state is freed at the end of the next rendered frame (SwiftShader frames can take > 150 ms):
    // sample only after it is gone, otherwise the counts include the battle still on the GPU (QA v39 #2 noise)
    await toMenu(); await page.waitForFunction(() => window.__game.gfx.live.size === 0, null, { timeout: 5000 }).catch(() => {}); await wait(100);
    if (keepT) partyLeft += await page.evaluate(() => window.__lastT?.party?.size || 0);
    if (i > WARM) samples.push(await snap());
  }
  const a = minOf(samples.slice(0, WIN)), b = minOf(samples.slice(-WIN)), bad = diff(a, b);
  console.log(`${bad.length ? 'FAIL' : 'ok'} ${name}: min first ${WIN} ${JSON.stringify(a)} min last ${WIN} ${JSON.stringify(b)} (3D drawn in ${drew}/${WARM + N}, party left after exit ${partyLeft})`);
  if (bad.length || drew < (WARM + N) * 0.8 || partyLeft) fail++;
}
const live = await page.evaluate(() => window.__game.gfx.live.size);
console.log(`${live ? 'FAIL' : 'ok'} no live 3D states in the menu (${live})`);
if (live) fail++;
console.log(`errors ${errors.length}`, errors.slice(0, 3));
await T.close();
process.exit(fail || errors.length ? 1 : 0);
