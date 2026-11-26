// Naive-player win rate for every class: prologue battles 1-3 and the first world fights (docs/BALANCE-casters-start.md).
// Usage: node tools/sim/casters-start.mjs [--n 100] [--b 1,2,3|world|all] [--policy naive,q,ai] [--cls a,b] [--fix name,...]
//  naive: hero only click-attacks (nearest foe in reach) / walks toward the nearest foe (same as tools/sim/prologue.mjs).
//  q:     naive + the first non-reaction ability on a foe when legal (the real Q key).
//  dmg:   naive + the first OFFENSIVE ability (what a player who read the skill list would use).   ai: the hero is driven by rules/ai.js.
//  world: solo hero level 2 (350 XP after the prologue) vs scaled w-* encounters, open arena (party size scaling as in game).
//  --fix: candidate patches from FIXES below (applied in memory, game data untouched).
import { GAME_DATA, MAPS, PLAYABLE_RACES } from '../../game/src/data/index.js';
import { CLASS_ORDER, CLASSES } from '../../game/src/data/classes/index.js';
import { RACES } from '../../game/src/data/races.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { createBattle, getLegalActions, perform, endTurn, currentUnit, isStanding } from '../../game/src/rules/combat.js';
import { playTurn } from '../../game/src/rules/ai.js';
import { gadgetFor } from '../../game/src/data/gadgets.js';
import { starterKit, encounterEnemies } from '../../game/src/world/data.js';
import { RULES } from '../../game/src/data/combat.js';
import { FIXES } from './casters-fixes.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--n', 100));
const BS = opt('--b', '1,2,3,world').split(',');
const POLS = opt('--policy', 'naive,q,ai').split(',');
const CLS = opt('--cls', CLASS_ORDER.join(',')).split(',');
for (const f of (opt('--fix', '') || '').split(',').filter(Boolean)) FIXES[f]({ CLASSES: GAME_DATA.CLASSES, GAME_DATA, MAPS });
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const ARENA = { id: 'arena', name: 'Arena', grid: [
  '########################', '#......................#', '#.P..c........c..E.....#', '#......................#',
  '#...........cc....E....#', '#......................#', '#.P....c.........E.....#', '#......................#',
  '#...........cc....E....#', '#......................#', '#.......c..............#', '########################'],
  enemies: [], allies: [], win: 'killAll', lose: 'heroDown' };

function hero(race, cls, level = 1) {
  const path = CLASSES[cls].paths[0].id;
  const kit = starterKit(cls, path);
  const inventory = {};
  for (const id of kit?.belt || []) inventory[id] = (inventory[id] || 0) + 1;
  return buildCreature({ race, cls, path, level, data: GAME_DATA, id: 'hero', name: 'T', gadget: gadgetFor(cls)?.id, inventory });
}

function naiveTurn(b, id, useQ) {
  for (let i = 0; i < 12 && !b.winner && b.turn?.unitId === id; i++) {
    const u = b.byId[id];
    const acts = getLegalActions(b, id);
    const foes = b.units.filter((x) => x.team === 'enemies' && isStanding(x));
    const offensive = (a) => ['enemy', 'tile'].includes(a.target) && (a.effects || []).some((e) => ['damage', 'weapon', 'drain'].includes(e.op));
    const q = useQ && (useQ === 'turret' ? u.abilities.find((a) => a.id === 'deploy-turret') : useQ === 'dmg' ? u.abilities.find((a) => a.action !== 'reaction' && offensive(a)) : u.abilities.find((a) => a.action !== 'reaction'));
    const qa = q ? acts.filter((a) => a.type === 'ability' && a.ability === q.id && (a.target ? b.byId[a.target].team === 'enemies' : a.tile)) : [];
    if (qa.length && !qa[0].target) qa.sort((p, q2) => Math.min(...foes.map((f) => dist(p.tile, f))) - Math.min(...foes.map((f) => dist(q2.tile, f))));
    if (qa.length) { if (!perform(b, qa[0]).ok) break; continue; }
    const atk = acts.filter((a) => a.type === 'attack' && a.target).sort((p, q2) => dist(u, b.byId[p.target]) - dist(u, b.byId[q2.target]));
    if (atk.length) { if (!perform(b, atk[0]).ok) break; continue; }
    const moves = acts.filter((a) => a.type === 'move');
    if (!moves.length || !foes.length) break;
    const near = (p) => Math.min(...foes.map((f) => dist(p, f)));
    moves.sort((p, q2) => near(p.to) - near(q2.to));
    if (near(moves[0].to) >= near(u)) break;
    if (!perform(b, moves[0]).ok) break;
  }
  if (!b.winner && b.turn?.unitId === id) endTurn(b);
}

function run(race, cls, policy, bid) {
  let w = 0, rounds = 0, hpLeft = 0, firstQ = 0;
  for (let s = 1; s <= N; s++) {
    const world = bid.startsWith('w-');
    const h = hero(race, cls, world ? 2 : 1);
    const heroes = [h];
    let map = MAPS[`prologue-${bid}`], enemies;
    if (world) { map = ARENA; enemies = encounterEnemies(bid, 1); }
    const b = createBattle({ map, heroes, enemies, data: GAME_DATA, seed: s * 7919, log: false, metric: RULES.metric });
    for (const u of b.units) u.control = 'ai';
    let guard = 0;
    while (!b.winner && b.turn && b.round <= 30 && guard++ < 4000) {
      const cu = currentUnit(b);
      if (cu && cu.id === 'hero' && policy !== 'ai') naiveTurn(b, cu.id, policy === 'q' ? true : policy === 'dmg' ? 'dmg' : policy === 'turret' ? 'turret' : false); else playTurn(b);
    }
    if (b.winner === 'heroes') { w++; hpLeft += b.byId.hero.hp / b.byId.hero.maxHp; }
    rounds += b.round;
  }
  return { win: w / N, rounds: rounds / N, hpLeft: w ? hpLeft / w : 0 };
}

const pc = (x) => `${(100 * x).toFixed(0)}%`.padStart(4);
const fights = BS.flatMap((x) => (x === 'world' ? ['w-road-crawlers', 'w-road-pirates', 'w-villages-jesters'] : [x]));
console.log(`n=${N} fix=${opt('--fix', '-')}  columns: ${POLS.join(' / ')}`);
console.log('class'.padEnd(11) + fights.map((f) => f.replace('w-', '').padStart(15)).join(''));
for (const cls of CLS) {
  const race = PLAYABLE_RACES.find((r) => isAllowed(RACES[r], CLASSES[cls]));
  const cells = fights.map((f) => POLS.map((p) => pc(run(race, cls, p, f).win)).join('/').padStart(15));
  console.log(cls.padEnd(11) + cells.join(''));
}
