// Wave 5 balance: the five enc-w5-* battles, party of 3-4 at the quest level, best gear of the tier a player has by then.
// Usage: node tools/sim/wave5.mjs [--n 30] [--seed 1] [--tier 0 (0 = auto by level)] [--lvl +0 (offset)] [--only crown] [--cls a,b] [--bycls]
//   [--map arena|roam (roam = the real battle: cut of the quest node's free map, party on random cells, foes ROAM.battle.foeGap
//   tiles toward the nearest exit, as scenes/roam.js provider.cut)] [--chain 1 (fights in a row, HP / ENR / medkits carried; a
//   down hero gets 1 HP, as world-battle writeBack)] [--rest short|none (between chained fights; default short)] [--sizes 3,4]
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
import { roamMapFor } from '../../game/src/world/roam.js';
import { roamBattleMap } from '../../game/src/world/roam-battle.js';
import { ROAM } from '../../game/src/data/world/roam.js';
import { REST } from '../../game/src/data/world/rest.js';
import { parseMap, blocksMove, T_WATER, T_HAZARD } from '../../game/src/rules/grid.js';
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REST_MODE = opt('--rest', 'short'); // between chained fights: breather + a short rest (REST.short.max = 2 covers 3 fights) | none
const MAP = opt('--map', 'arena'), CHAIN = +opt('--chain', 1), SIZES = opt('--sizes', '3,4').split(',').map(Number);
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
// --map roam: the node map of the encounter's first place, as the free-map provider builds it (scenes/roam.js cut)
function roamMap(locId, size, nFoes, rng) {
  const m = roamMapFor(locId); if (!m) return null; const g = parseMap({ grid: m.grid });
  const ok = (x, y) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && !blocksMove(g.tiles[y * g.w + x]) && g.tiles[y * g.w + x] !== T_WATER && g.tiles[y * g.w + x] !== T_HAZARD;
  let ld; for (let i = 0; i < 500 && !ld; i++) { const x = rng.int(1, g.w - 2), y = rng.int(1, g.h - 2); if (ok(x, y)) ld = [x, y]; }
  const party = ROAM.group.spread.slice(0, size).map(([dx, dy]) => [ld[0] + dx, ld[1] + dy]);
  const ex = m.objects.filter((x) => x.type === 'exit').map((x) => [x.x, x.y]).sort((a, b) => Math.hypot(a[0] - ld[0], a[1] - ld[1]) - Math.hypot(b[0] - ld[0], b[1] - ld[1]))[0];
  const dir = ex ? Math.atan2(ex[1] - ld[1], ex[0] - ld[0]) : 0;
  const f = [Math.round(ld[0] + Math.cos(dir) * ROAM.battle.foeGap), Math.round(ld[1] + Math.sin(dir) * ROAM.battle.foeGap)];
  const def = roamBattleMap(m, m.objects, { party, foes: Array(nFoes).fill(f), id: locId, name: locId });
  const P = def.starts.P, E = def.starts.E; const rows = def.grid.map((r) => r.split(''));
  P.forEach(([x, y]) => { rows[y][x] = 'P'; }); E.forEach(([x, y]) => { rows[y][x] = 'E'; });
  return { ...def, grid: rows.map((r) => r.join('')) };
}
// world/rest.js afterBattle breather (1 free hit die, +L ENR) + shortRest (hit dice while the wound is worth a die, ENR)
function shortRest(u, rng) {
  const die = REST.hitDie[Math.max(0, Math.min(4, CLASSES[u.classId]?.hpPerLevel ?? 2))] || 8, cm = Math.floor(((u.stats?.con ?? 10) - 10) / 2);
  const heal = () => Math.max(REST.hitDieMin, rng.int(1, die) + cm);
  u.hdUsed ||= 0; if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + heal());
  while (u.level - u.hdUsed > 0 && u.hp < u.maxHp && (u.maxHp - u.hp >= Math.ceil(die / 2) || u.hp < u.maxHp / 2)) { u.hp = Math.min(u.maxHp, u.hp + heal()); u.hdUsed++; }
  if (u.maxEnr > 0) u.enr = Math.min(u.maxEnr, u.enr + u.level + Math.max(Math.ceil(u.maxEnr * REST.short.enrFrac), u.level * REST.short.enrPerLevel));
}
const pc = (x) => `${(100 * x).toFixed(0)}%`;
const ONLY = opt('--only', null); const CLS = opt('--cls', null)?.split(',') || CLASS_ORDER; const ids = Object.keys(GAME_DATA.ENCOUNTERS).filter((k) => k.startsWith('enc-w5-') && (!ONLY || k.includes(ONLY)));
console.log(`n/class ${N}, seed ${SEED}, tier ${TIER || 'auto'}, lvl offset ${OFF}, map ${MAP}, chain ${CHAIN}, rest ${CHAIN > 1 ? REST_MODE : '-'}`);
console.log('enc'.padEnd(18) + 'lvl tier size  win  minCls  rounds  xp');
const ALLC = {}; // --bycls: per-class win rate over all wave-5 battles and sizes
for (const id of ids) { const en = GAME_DATA.ENCOUNTERS[id]; const lvl = en.level + OFF;
  for (const size of SIZES) { let w = 0, t = 0, rs = 0, fights = 0; const byC = {};
    for (const cid of CLS) { let cw = 0; for (let i = 0; i < N; i++) { const rng = createRng(SEED * 7919 + i * 131 + CLASS_ORDER.indexOf(cid));
      let heroes = mkParty(cid, lvl, size, rng); let won = true;
      for (let c = 0; c < CHAIN && won; c++) {
        const map = MAP === 'roam' ? roamMap(en.places[0], size, en.enemies.length, rng) : undefined;
        const b = createBattle({ heroes, enemies: en.enemies, map, data: GAME_DATA, seed: rng.int(1, 1e9), log: false });
        for (const u of b.units) u.control = 'ai';
        let g = 0; while (!b.winner && b.turn && b.round <= 30 && g++ < 6000) playTurn(b);
        fights++; rs += Math.min(b.round, 30); won = b.winner === 'heroes';
        // carry-over (world-battle writeBack): the same unit objects keep hp / enr / items; a down hero stands up at 1 HP
        heroes = b.units.filter((u) => u.team === 'heroes' && u.kind === 'hero' && !u.dead).map((u) => ({ ...u, hp: u.down ? 1 : u.hp, down: false, statuses: [] }));
        if (won && c < CHAIN - 1 && REST_MODE === 'short') for (const u of heroes) shortRest(u, rng);
      }
      t++; if (won) { w++; cw++; } } byC[cid] = cw / N; (ALLC[cid] ||= []).push(cw / N); }
    const worst = Object.entries(byC).sort((a, b) => a[1] - b[1])[0];
    console.log(id.padEnd(18) + `${String(lvl).padStart(3)} ${String(tierFor(lvl)).padStart(4)} ${String(size).padStart(4)} ${pc(w / t).padStart(5)} ${(worst[0] + ' ' + pc(worst[1])).padStart(14)} ${(rs / fights).toFixed(1).padStart(5)} ${String(battleXp(en.enemies, GAME_DATA)).padStart(6)}`); } }
if (args.includes('--bycls')) console.log('by class: ' + CLS.map((c) => `${c} ${pc(ALLC[c].reduce((a, b) => a + b, 0) / ALLC[c].length)}`).join(', '));
