// Battle 1 — spare-parts warehouse, technical sector. Teaches cover.
// 22x12. E order (row-major): r3 cultist, r5 cultist-gunner (behind crate), r8 cultist.
// QA v48 #1: the first fight of the game is a tutorial — softened copies of the base enemies (same ids:
// codex, barks and loot see 'cultist' / 'cultist-gunner'). Fanatics: less HP, no shock-baton discharge (electro
// surfaces + DoT); the gunner keeps one incendiary (teaches «Снять: Горение») but it hits softer.
// Win rate of a naive click-attack hero: node tools/sim/prologue.mjs --all
import { ENEMIES } from '../enemies.js';

const TUNE = { fanaticHp: 8, fanaticDice: '1d4', gunnerHp: 7, gunnerDice: '1d4', gunnerHit: -3, gunnerRange: 8, fireDice: '1d4' };

const fanatic = { ...ENEMIES.cultist, hp: TUNE.fanaticHp, weapon: { ...ENEMIES.cultist.weapon, dice: TUNE.fanaticDice }, abilities: [] };
const gunner = {
  ...ENEMIES['cultist-gunner'], hp: TUNE.gunnerHp,
  weapon: { ...ENEMIES['cultist-gunner'].weapon, dice: TUNE.gunnerDice, hit: TUNE.gunnerHit, range: TUNE.gunnerRange },
  abilities: ENEMIES['cultist-gunner'].abilities.map((a) => ({ ...a, effects: a.effects.map((e) => (e.op === 'damage' ? { ...e, dice: TUNE.fireDice } : e)) })),
};

export default {
  id: 'prologue-1',
  name: 'Склад запчастей',
  intro: 'b1_intro',
  grid: [
    '######################',
    '#.........#..........#',
    '#..c..cc..#...cc...c.#',
    '#..c...........c..E..#',
    '#.........###........#',
    '#P....c.....c....c.E.#',
    '#.........###........#',
    '#..c...........c.....#',
    '#..c..cc..#...cc..E..#',
    '#.........#.......c..#',
    '#.........#..........#',
    '######################',
  ],
  enemies: [fanatic, gunner, fanatic],
  allies: [],
  win: 'killAll',
  lose: 'heroDown',
};
