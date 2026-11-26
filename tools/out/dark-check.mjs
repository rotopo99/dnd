// Darkness check of battles (QA v48): night / storm / fog / rain in 3D (or ?gfx=2d), screenshots tools/out/dark-<tag>-*.png
// node tools/out/dark-check.mjs [--gfx 3d|2d] [--tag before]
import { open } from './v3-harness.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const gfx = opt('--gfx', '3d'), tag = opt('--tag', 'now');
const T = await open({ query: `?gfx=${gfx}`, args: gfx === '3d' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] });
const { page, errors, wait, shot, key } = T;
await wait(800);
await page.evaluate(async () => {
  Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const st = await import('/game/src/world/state.js');
  const g = window.__game;
  const s = st.newSave({ name: 'Тест', race: 'human', cls: 'ecolog', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  s.flags['prologue-done'] = true; g.save = s;
  const wb = await import('/game/src/scenes/world-battle.js');
  wb.startWorldBattle(g, { encounter: 'v3-pir-dock', biome: 'wasteland', onWin: () => {} });
});
await wait(1500);
for (let i = 0; i < 60; i++) { const b = await page.evaluate(() => !!window.__game.scene.S.banner); if (b) await key('Enter'); else break; await wait(100); }
await page.mouse.move(5, 300);
for (const [tod, weather] of [['day', 'clear'], ['night', 'clear'], ['night', 'fog'], ['day', 'storm'], ['dusk', 'rain']]) {
  await page.evaluate(({ tod, weather }) => { const S = window.__game.scene.S; S.b.map.tod = tod; S.b.map.weather = weather; S.b.map.dark = tod === 'night'; if (S.v3) S.v3.lastSig = ''; }, { tod, weather });
  await wait(1500);
  await shot(`dark-${tag}-${tod}-${weather}`);
}
console.log('errors', errors.length, errors.slice(0, 3));
await T.close();
