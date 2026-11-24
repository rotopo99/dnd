// Prologue battle win rate for a naive player (QA v48 #1).
// Usage: node tools/sim/prologue.mjs [--b 1] [--n 300] [--cls zabivnoy] [--race human] [--policy naive|ai] [--all]
//  naive: the hero only attacks (nearest foe in reach), otherwise walks to the nearest foe; no abilities, items, cover.
//  q:     naive, but uses the first ability (key Q) on a foe whenever it can.
//  ai:    the hero is driven by the engine AI (rules/ai.js) — an upper-ish bound.
//  --all: every playable class (first path, first allowed race), naive and naive+Q policies.
import { GAME_DATA, MAPS, PLAYABLE_RACES } from '../../game/src/data/index.js';
import { CLASS_ORDER, CLASSES } from '../../game/src/data/classes/index.js';
import { RACES } from '../../game/src/data/races.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { createBattle, getLegalActions, perform, endTurn, currentUnit, isStanding } from '../../game/src/rules/combat.js';
import { playTurn } from '../../game/src/rules/ai.js';
import { gadgetFor } from '../../game/src/data/gadgets.js';
import { starterKit } from '../../game/src/world/data.js';
import { RULES } from '../../game/src/data/combat.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--n', 300));
const B = opt('--b', '1');
const POLICY = opt('--policy', 'naive');
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function hero(race, cls) {
  const path = CLASSES[cls].paths[0].id;
  const kit = starterKit(cls, path);
  const inventory = {};
  for (const id of kit?.belt || []) inventory[id] = (inventory[id] || 0) + 1;
  return buildCreature({ race, cls, path, data: GAME_DATA, id: 'hero', name: 'T', gadget: gadgetFor(cls)?.id, inventory });
}

function naiveTurn(b, id, useQ = false) {
  for (let i = 0; i < 12 && !b.winner && b.turn?.unitId === id; i++) {
    const u = b.byId[id];
    const acts = getLegalActions(b, id);
    const foes = b.units.filter((x) => x.team === 'enemies' && isStanding(x));
    const q = useQ && u.abilities.find((a) => a.action !== 'reaction');
    const qa = q ? acts.filter((a) => a.type === 'ability' && a.ability === q.id && (a.target ? b.byId[a.target].team === 'enemies' : a.tile)) : [];
    if (qa.length) { if (!perform(b, qa[0]).ok) break; continue; }
    const atk = acts.filter((a) => a.type === 'attack' && a.target).sort((p, q) => dist(u, b.byId[p.target]) - dist(u, b.byId[q.target]));
    if (atk.length) { if (!perform(b, atk[0]).ok) break; continue; }
    const moves = acts.filter((a) => a.type === 'move');
    if (!moves.length || !foes.length) break;
    const near = (p) => Math.min(...foes.map((f) => dist(p, f)));
    const cur = near(u);
    moves.sort((p, q) => near(p.to) - near(q.to));
    if (near(moves[0].to) >= cur) break;
    if (!perform(b, moves[0]).ok) break;
  }
  if (!b.winner && b.turn?.unitId === id) endTurn(b);
}

function run(race, cls, policy) {
  let w = 0, rounds = 0, hpLeft = 0;
  for (let s = 1; s <= N; s++) {
    const h = hero(race, cls);
    const b = createBattle({ map: MAPS[`prologue-${B}`], heroes: [h], data: GAME_DATA, seed: s * 7919, log: false, metric: RULES.metric });
    for (const u of b.units) u.control = 'ai';
    let guard = 0;
    while (!b.winner && b.turn && b.round <= 30 && guard++ < 4000) {
      const cu = currentUnit(b);
      if (cu && cu.id === 'hero' && policy !== 'ai') naiveTurn(b, cu.id, policy === 'q'); else playTurn(b);
    }
    if (b.winner === 'heroes') { w++; hpLeft += b.byId.hero.hp / b.byId.hero.maxHp; }
    rounds += b.round;
  }
  return { win: w / N, rounds: rounds / N, hpLeft: w ? hpLeft / w : 0 };
}

const pc = (x) => `${(100 * x).toFixed(0)}%`;
if (args.includes('--all')) {
  for (const cls of CLASS_ORDER) {
    const race = PLAYABLE_RACES.find((r) => isAllowed(RACES[r], CLASSES[cls]));
    const r = run(race, cls, 'naive'), rq = run(race, cls, 'q');
    console.log(`${cls.padEnd(12)} ${race.padEnd(14)} win ${pc(r.win).padStart(4)}  rounds ${r.rounds.toFixed(1)}  hp left ${pc(r.hpLeft)}  | naive+Q win ${pc(rq.win).padStart(4)}`);
  }
} else {
  const cls = opt('--cls', 'zabivnoy'), race = opt('--race', PLAYABLE_RACES[0]);
  const r = run(race, cls, POLICY);
  console.log(`b${B} ${race}/${cls} ${POLICY}: win ${pc(r.win)} rounds ${r.rounds.toFixed(1)} hp left ${pc(r.hpLeft)} (n=${N})`);
}
