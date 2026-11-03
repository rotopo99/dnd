// Battle 1 — spare-parts warehouse, technical sector. Teaches cover.
// 22x12. E order (row-major): r3 cultist, r5 cultist-gunner (behind crate), r8 cultist.
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
  enemies: ['cultist', 'cultist-gunner', 'cultist'],
  allies: [],
  win: 'killAll',
  lose: 'heroDown',
};
