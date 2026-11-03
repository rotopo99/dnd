// Battle 3 — Harmony Reactor (prologue boss). Reactor core = solid wall block, blocks line of sight:
// the acolyte stands behind it, the hero has to flank. Gans (A) is pinned by a cultist at the west wall.
// 22x12. E order (row-major): r1 acolyte, r4 cultist (next to Gans), r5 cultist.
// allies: Gans (npc-gans) — Hans from canon (docs/canon/lore/history.md).
// display name — PROLOGUE.b3_ally_name. Needs an NPC id from the director (e.g. 'npc-gans').
export default {
  id: 'prologue-3',
  name: 'Реактор Гармонии',
  intro: 'b3_intro',
  grid: [
    '######################',
    '#.......c..E..c......#',
    '#..~.............~...#',
    '#.c................c.#',
    '#..E.....######......#',
    '#.A...c..######..E...#',
    '#........######......#',
    '#..~..............~..#',
    '#.c....c......c....c.#',
    '#....................#',
    '#.........P..........#',
    '######################',
  ],
  enemies: ['acolyte', 'cultist', 'cultist'],
  allies: ['npc-gans'],
  win: 'killAll',
  lose: 'heroDown',
};
