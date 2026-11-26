// AI choice diagnostics: what the AI-driven hero spends its turns on (solo road fights at level 2 or wave-5 parties).
// Usage: node tools/sim/ai-diag.mjs [--cls slavotech] [--mode road|w5] [--n 40] [--path id] [--v (log fight 1)]
// Prints per class: action mix (attack / ability ids / items / moves) and "wasted" support (heal on full HP, shield/buff
// with no foe within 8), plus win rate.
import { GAME_DATA } from '../../game/src/data/index.js';
import { CLASS_ORDER, CLASSES } from '../../game/src/data/classes/index.js';
import { ENEMIES_V3 } from '../../game/src/data/enemies-v3.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { createBattle, perform, endTurn, isStanding } from '../../game/src/rules/combat.js';
import { chooseAction, evalAction } from '../../game/src/rules/ai.js';
import { gadgetFor } from '../../game/src/data/gadgets.js';
import { starterKit, encounterEnemies } from '../../game/src/world/data.js';
import { RULES } from '../../game/src/data/combat.js';
import { createRng } from '../../game/src/rules/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--n', 40), MODE = opt('--mode', 'road'), CLS = opt('--cls', CLASS_ORDER.join(',')).split(',');
for (const [k, v] of Object.entries(ENEMIES_V3)) if (!GAME_DATA.ENEMIES[k]) GAME_DATA.ENEMIES[k] = v;
const races = Object.values(GAME_DATA.RACES).filter((r) => r.playable);
const ARENA = { id: 'arena', name: 'Arena', grid: [
  '########################', '#......................#', '#.P..c........c..E.....#', '#......................#',
  '#...........cc....E....#', '#......................#', '#.P....c.........E.....#', '#......................#',
  '#...........cc....E....#', '#......................#', '#.......c..............#', '########################'],
  enemies: [], allies: [], win: 'killAll', lose: 'heroDown' };

function hero(cid, level, rng, id) {
  const cls = CLASSES[cid]; const race = rng.pick(races.filter((r) => isAllowed(r, cls)));
  const path = id === 'hero' && opt('--path', null) ? opt('--path', null) : MODE === 'road' ? cls.paths[0].id : rng.pick(cls.paths).id;
  const kit = starterKit(cid, path); const inventory = {};
  for (const it of kit?.belt || []) inventory[it] = (inventory[it] || 0) + 1;
  return buildCreature({ race, cls, path, level, data: GAME_DATA, id, name: id, gadget: gadgetFor(cid)?.id, inventory, asi: 'auto' });
}

const enemyNear = (b, t) => b.units.some((e) => isStanding(e) && e.team !== t.team && Math.max(Math.abs(e.x - t.x), Math.abs(e.y - t.y)) <= 8);
for (const cid of CLS) {
  const mix = {}; let takenR = 0, taken = 0, takenAll = 0, wins = 0, turns = 0, waste = 0, rounds = 0, downR = 0, downs = 0, dealt = 0;
  const fights = MODE === 'road' ? ['w-road-crawlers', 'w-road-pirates'] : Object.keys(GAME_DATA.ENCOUNTERS).filter((k) => k.startsWith('enc-w5-'));
  for (const fid of fights) for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 131 + 7);
    let b;
    if (MODE === 'road') b = createBattle({ map: ARENA, heroes: [hero(cid, 2, rng, 'hero')], enemies: encounterEnemies(fid, 1), data: GAME_DATA, seed: s * 7919, log: false, metric: RULES.metric });
    else {
      const en = GAME_DATA.ENCOUNTERS[fid]; const hs = [hero(cid, en.level, rng, 'hero')];
      while (hs.length < 3) hs.push(hero(rng.pick(CLASS_ORDER.filter((x) => x !== cid)), en.level, rng, 'h' + hs.length));
      b = createBattle({ heroes: hs, enemies: en.enemies, data: GAME_DATA, seed: rng.int(1, 1e9), log: false, onEvent: (e, b) => { if (e.type === 'damage' && e.resource === 'hp' && e.target && e.target[0] === 'h') { takenAll += e.amount; if (e.target === 'hero') { taken += e.amount; const a = b.byId[e.actor]; if (a && a.weapon && a.weapon.range > 1) takenR += e.amount; } } } });
    }
    for (const u of b.units) u.control = 'ai';
    let g = 0;
    while (!b.winner && b.turn && b.round <= 30 && g++ < 8000) {
      const id = b.turn.unitId; const me = b.byId[id].id === 'hero';
      const foeHp = () => b.units.reduce((a, e) => a + (e.team !== 'heroes' ? Math.max(0, e.hp) + Math.max(0, e.mrl || 0) : 0), 0);
      const h0 = me ? foeHp() : 0;
      if (me) turns++;
      for (let i = 0; i < 16; i++) {
        if (b.winner || !b.turn || b.turn.unitId !== id) break;
        const act = chooseAction(b, id);
        if (!act || act.type === 'endTurn') break;
        if (me) {
          const k = act.type === 'ability' ? act.ability : act.type === 'useItem' ? 'item:' + act.item : act.type;
          mix[k] = (mix[k] || 0) + 1;
          const a = act.type === 'ability' && b.byId.hero.abilities.find((x) => x.id === act.ability);
          const t = act.target && b.byId[act.target];
          if (a && t && t.team === 'heroes' && (a.effects || []).some((e) => ['heal', 'shield', 'buff'].includes(e.op))) {
            if (!enemyNear(b, t) || (a.effects.every((e) => e.op === 'heal') && t.hp >= t.maxHp)) waste++;
          }
          if (args.includes('--v') && s === 1) console.log(`r${b.round} ${k} -> ${act.target || ''} v=${evalAction(b, b.byId.hero, act).toFixed(1)} near ${Math.min(...b.units.filter((e) => e.team !== 'heroes' && isStanding(e)).map((e) => Math.max(Math.abs(e.x - b.byId.hero.x), Math.abs(e.y - b.byId.hero.y))))} hp ${b.byId.hero.hp}/${b.byId.hero.maxHp} enr ${b.byId.hero.enr}`);
        }
        if (!perform(b, act).ok) break;
      }
      if (me) dealt += Math.max(0, h0 - foeHp());
      if (!b.winner && b.turn && b.turn.unitId === id) endTurn(b);
      if (b.byId.hero.down || b.byId.hero.dead) { if (!b.heroDownR) { b.heroDownR = b.round; downs++; downR += b.round; } }
    }
    rounds += b.round;
    if (b.winner === 'heroes') wins++;
  }
  const tot = fights.length * N;
  console.log(`${cid.padEnd(11)} win ${(100 * wins / tot).toFixed(0)}%  rounds ${(rounds / tot).toFixed(1)}  turns ${(turns / tot).toFixed(1)}  down ${(100 * downs / tot).toFixed(0)}% @r${(downR / Math.max(1, downs)).toFixed(1)}  dealt/turn ${(dealt / Math.max(1, turns)).toFixed(1)}  dmgShare ${(100 * taken / Math.max(1, takenAll)).toFixed(0)}% (ranged ${(100 * takenR / Math.max(1, taken)).toFixed(0)}%)  waste ${waste}  ` +
    Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tot).toFixed(1)}`).join(', '));
}
