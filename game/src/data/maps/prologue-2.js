// Battle 2 — burning service corridors near Nikola's workshop.
// Narrow 1-tile corridors, fire '~' after the blast (each has a detour), skrilet ambush from the lower maze.
// 24x13. E order (row-major): r2 cultist (right room), r8 skrilet (lower pocket, starts invisible — via its ability).
export default {
  id: 'prologue-2',
  name: 'Сервисные коридоры',
  intro: 'b2_intro',
  grid: [
    '########################',
    '#.....#..~.....~.#.....#',
    '#..P..#.~~..c....#..E..#',
    '#.....#.....~....#.c...#',
    '###.######.###.#####.###',
    '#.....~...........~....#',
    '#.###.###.#####.####.#.#',
    '#.#...#.....~.....#..#.#',
    '#.#.c.#..####.#E..#.~#.#',
    '#...~.#..#....#...#....#',
    '###.###..#.~..#.c.####.#',
    '#.........#......~.....#',
    '########################',
  ],
  enemies: ['cultist', 'skrilet'],
  allies: [],
  win: 'killAll',
  lose: 'heroDown',
};
