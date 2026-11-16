// STALE (QA v34): hangs in the tail (T.prologue() no longer matches the prologue flow); rest / ambush are covered by other scripts. Kept for reference.
import { boot12, toLoc } from './qa12-lib.mjs';
const T = await boot12(); const { page, wait, shot, key, errors, G } = T;
await page.evaluate(async () => {
  const g = window.__game, s = g.save; const c = await import('/game/src/world/crime.js'); const I = await import('/game/src/world/inventory.js');
  s.location = 'svalka'; c.addHeat(s, 'scavengers', 6); I.giveItem(s, 'ration', 4); s.hero.hp = 5;
});
await toLoc(T); await wait(500);
await page.evaluate(() => { window.__game.modals.length = 0; Math.random = () => 0.0001; });
const b = await page.evaluate(() => { const b = window.__game.scene.S.buttons.find(b => b.label === 'Привал'); return b && { x: b.x + b.w/2, y: b.y + b.h/2 }; });
console.log('btn', JSON.stringify(b));
await page.mouse.click(b.x, b.y); await wait(300);
console.log('modal', await G('g.modals.at(-1)?.title'));
await key('2'); await wait(500);
for (let i = 0; i < 14; i++) {
  const st = await G('JSON.stringify({sc:g.scene.id, m:g.modals.at(-1)?.title, n:g.modals.length, opts:g.modals.at(-1)?.options?.map(o=>o.label)})');
  console.log(i, st);
  if (JSON.parse(st).sc === 'battle') break;
  if (JSON.parse(st).n === 0) break;
  await key('Enter'); await wait(500);
}
await shot('qa12-12-rest-ambush');
console.log('state', await G('JSON.stringify({day:g.save.day, hp:g.save.hero.hp, rest:g.save.rest, sc:g.scene.id})'));
Math.random = Math.random;
console.log('prologue-style finish', await T.prologue(), await G('g.scene.id + " " + g.save.location + " day=" + g.save.day + " hp=" + g.save.hero.hp'));
console.log('errors', errors); await T.close();
