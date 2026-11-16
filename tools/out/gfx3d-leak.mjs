// GPU resource lifecycle (QA v34 P1): 30 quick 3D battles and 30 roam entries, each followed by an exit to the menu.
// Live WebGL objects (create* - delete*) must stay flat (±5) once the shared mesh cache is warm (GFX.meshIdle).
// node tools/out/gfx3d-leak.mjs   -> exit 1 on growth or console errors
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
const battle = () => page.evaluate(async () => { const m = await import('/game/src/scenes/menu.js'); m.startQuickBattle(window.__game); });
const roam = () => page.evaluate(async () => {
  const st = await import('/game/src/world/state.js');
  if (!localStorage.getItem('ruslania-save-v1')) {
    const s = st.newSave({ name: 'Den', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
    s.flags['prologue-done'] = true; s.location = 'alpha-harmony'; s.visited = ['alpha-harmony'];
    localStorage.setItem('ruslania-save-v1', JSON.stringify(s));
  }
  const m = await import('/game/src/scenes/menu.js'); m.continueGame(window.__game);
});
let fail = 0;
const diff = (a, b) => Object.keys(a).filter((k) => Math.abs(a[k] - b[k]) > 5);
for (const [name, enter, ms] of [['battle', battle, 500], ['roam', roam, 900]]) {
  let warm = null, drew = 0;
  for (let i = 1; i <= 30; i++) {
    await enter(); await wait(ms);
    drew += await page.evaluate(() => (window.__game.scene.S?.v3 || window.__game.scene.S?.r3?.v3 || window.__game.scene.r3?.v3 || window.__game.gfx.live.size ? 1 : 0));
    await toMenu(); await wait(150);
    if (i === 10) warm = await snap();
  }
  const end = await snap(), bad = diff(warm, end);
  console.log(`${bad.length ? 'FAIL' : 'ok'} ${name}: after 10 ${JSON.stringify(warm)} after 30 ${JSON.stringify(end)} (3D drawn in ${drew}/30)`);
  if (bad.length || drew < 25) fail++;
}
const live = await page.evaluate(() => window.__game.gfx.live.size);
console.log(`${live ? 'FAIL' : 'ok'} no live 3D states in the menu (${live})`);
if (live) fail++;
console.log(`errors ${errors.length}`, errors.slice(0, 3));
await T.close();
process.exit(fail || errors.length ? 1 : 0);
