// Wave 5 balance: the five enc-w5-* battles, party of 3-4 at the quest level, best gear of the tier a player has by then.
// Usage: node tools/sim/wave5.mjs [--n 30] [--seed 1] [--tier 0 (0 = auto by level)] [--lvl +0 (offset)] [--only crown] [--cls a,b] [--bycls]
import { GAME_DATA } from '../../game/src/data/index.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { ENEMIES_V3 } from '../../game/src/data/enemies-v3.js';
import { WEAPONS } from '../../game/src/data/items/weapons.js';
import { ARMOR } from '../../game/src/data/items/armor.js';
import { STARTER_KITS } from '../../game/src/data/items/shops.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { createBattle } from '../../game/src/rules/combat.js';
import { playTurn } from '../../game/src/rules/ai.js';
import { gearScore } from '../../game/src/world/best-gear.js';
import { createRng } from '../../game/src/rules/rng.js';
import { battleXp } from '../../game/src/rules/progression.js';
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--n', 30), SEED = +opt('--seed', 1), TIER = +opt('--tier', 0), OFF = +opt('--lvl', 0);
for (const [k, v] of Object.entries(ENEMIES_V3)) if (!GAME_DATA.ENEMIES[k]) GAME_DATA.ENEMIES[k] = v;
const races = Object.values(GAME_DATA.RACES).filter((r) => r.playable);
const tierFor = (l) => TIER || (l <= 9 ? 2 : l <= 11 ? 3 : 4);
const cache = {};
function bestGear(cid, path, race, level) {
  const T = tierFor(level); const key = `${cid}:${path}:${race.id}:${T}`; if (cache[key]) return cache[key];
  const cls = CLASSES[cid]; const k = STARTER_KITS[`${cid}:${path}`] || STARTER_KITS[cid];
  const mk = (eq) => { try { return buildCreature({ race, cls, level, path, data: GAME_DATA, equipment: eq }); } catch { return null; } };
  const wl = Object.values(WEAPONS).filter((w) => (w.tier || 1) <= T && !w.unique), al = Object.values(ARMOR).filter((a) => (a.tier || 1) <= T && !a.unique);
  let eq = { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] }; let bs = gearScore(mk(eq));
  for (const w of wl) { const e = { ...eq, weapon: w.id }; const u = mk(e); if (u && gearScore(u) > bs) { bs = gearScore(u); eq = e; } }
  for (const a of al) { const e = { ...eq, armor: a.id }; const u = mk(e); if (u && gearScore(u) > bs) { bs = gearScore(u); eq = e; } }
  return (cache[key] = { equipment: eq, inventory: { medkit: 2 } });
}
const mkHero = (cid, path, level, rng) => { const cls = CLASSES[cid]; const race = rng.pick(races.filter((r) => isAllowed(r, cls))); const g = bestGear(cid, path, race, level);
  return buildCreature({ race, cls, level, path, data: GAME_DATA, equipment: g.equipment, inventory: g.inventory, asi: 'auto' }); };
const mkParty = (cid, level, size, rng) => { const cls = CLASSES[cid]; const out = [mkHero(cid, rng.pick(cls.paths).id, level, rng)];
  while (out.length < size) { const c = rng.pick(CLASS_ORDER.filter((x) => x !== cid)); out.push(mkHero(c, rng.pick(CLASSES[c].paths).id, level, rng)); } return out; };
const pc = (x) => `${(100 * x).toFixed(0)}%`;
const ONLY = opt('--only', null); const CLS = opt('--cls', null)?.split(',') || CLASS_ORDER; const ids = Object.keys(GAME_DATA.ENCOUNTERS).filter((k) => k.startsWith('enc-w5-') && (!ONLY || k.includes(ONLY)));
console.log(`n/class ${N}, seed ${SEED}, tier ${TIER || 'auto'}, lvl offset ${OFF}`);
console.log('enc'.padEnd(18) + 'lvl tier size  win  minCls  rounds  xp');
const ALLC = {}; // --bycls: per-class win rate over all wave-5 battles and sizes
for (const id of ids) { const en = GAME_DATA.ENCOUNTERS[id]; const lvl = en.level + OFF;
  for (const size of [3, 4]) { let w = 0, t = 0, rs = 0; const byC = {};
    for (const cid of CLS) { let cw = 0; for (let i = 0; i < N; i++) { const rng = createRng(SEED * 7919 + i * 131 + CLASS_ORDER.indexOf(cid));
      const heroes = mkParty(cid, lvl, size, rng);
      const b = createBattle({ heroes, enemies: en.enemies, data: GAME_DATA, seed: rng.int(1, 1e9), log: false });
      for (const u of b.units) u.control = 'ai';
      let g = 0; while (!b.winner && b.turn && b.round <= 30 && g++ < 6000) playTurn(b);
      t++; rs += Math.min(b.round, 30); if (b.winner === 'heroes') { w++; cw++; } } byC[cid] = cw / N; (ALLC[cid] ||= []).push(cw / N); }
    const worst = Object.entries(byC).sort((a, b) => a[1] - b[1])[0];
    console.log(id.padEnd(18) + `${String(lvl).padStart(3)} ${String(tierFor(lvl)).padStart(4)} ${String(size).padStart(4)} ${pc(w / t).padStart(5)} ${(worst[0] + ' ' + pc(worst[1])).padStart(14)} ${(rs / t).toFixed(1).padStart(5)} ${String(battleXp(en.enemies, GAME_DATA)).padStart(6)}`); } }
if (args.includes('--bycls')) console.log('by class: ' + CLS.map((c) => `${c} ${pc(ALLC[c].reduce((a, b) => a + b, 0) / ALLC[c].length)}`).join(', '));
