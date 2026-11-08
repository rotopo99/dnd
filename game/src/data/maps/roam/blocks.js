// Building blocks of generated node maps (free-roam.md §1.1, world/roam-gen.js). Battle chars (rules/grid.js):
//   # wall · . floor · , rubble · c crate · C concrete · x flimsy wall · m shelf/machine · w water
// Roam-only chars (floor for the battle parser, drawn by scenes/roam.js): = planks · " field
// Markers → objects (the cell becomes floor or the object blocks it):
//   S stall (trader stands on `s` behind it) · B bed · K crate/stash · H workbench · T terminal · F campfire · O well
//   n spot where an NPC stands
// Every block keeps its floor connected to an opening on its edge (tools/test.mjs checks all nodes).

export const BLOCKS = {
  house: [
    '########',
    '#B...m.#',
    '#......#',
    '#n...K.#',
    '#......#',
    '###..###',
  ],
  house2: [
    '##########',
    '#B..#...K#',
    '#...#....#',
    '#........#',
    '#n.....m.#',
    '#........#',
    '####..####',
  ],
  shop: [
    '##########',
    '#m..s...m#',
    '#..cSc...#',
    '#........#',
    '#n.....H.#',
    '#........#',
    '####..####',
  ],
  stallOut: [
    '.s...s.',
    'cSc.cSc',
    '.......',
  ],
  plaza: [
    '.............',
    '..s.......s..',
    '.cSc.....cSc.',
    '.............',
    '......O......',
    '...n.....n...',
    '.............',
    '......n......',
  ],
  well: [
    '.......',
    '..n....',
    '...O...',
    '....n..',
    '.......',
  ],
  field: [
    '""""""""',
    '""""""""',
    '""""n"""',
    '""""""""',
  ],
  barracks: [
    '############',
    '#B.B.B.B.B.#',
    '#..........#',
    '#n...n...K.#',
    '#..........#',
    '####....####',
  ],
  workshop: [
    '#########',
    '#H..m..K#',
    '#.......#',
    '#n...c..#',
    '###...###',
  ],
  warehouse: [
    '##########',
    '#K.c.cc.m#',
    '#..c.....#',
    '#.....c..#',
    '#m.c...K.#',
    '#........#',
    '###....###',
  ],
  tent: [
    '.###.',
    '#B.n#',
    '#...#',
    '##.##',
  ],
  fire: [
    '.......',
    '..n....',
    '...F...',
    '....n..',
    '.......',
  ],
  ruin: [
    '#,##.###',
    '#.,...,#',
    ',..K...,',
    '#..,..##',
    '#,.....#',
    '##.,#,##',
  ],
  ruin2: [
    '##,#####,#',
    '#....,...#',
    '...m..K...',
    '#.,.....,#',
    '#..T..n..#',
    '###,..####',
  ],
  // bunker rooms: carved into rock, corridors join their centres
  airlock: [
    '##########',
    '#m......m#',
    '..........',
    '#n......K#',
    '##########',
  ],
  room: [
    '#########',
    '#m.....K#',
    '#.......#',
    '#...n...#',
    '#B......#',
    '#########',
  ],
  lab: [
    '###########',
    '#T..m.m..H#',
    '#.........#',
    '#n.......K#',
    '###########',
  ],
  dorm: [
    '#########',
    '#B.B.B.B#',
    '#.......#',
    '#n.....K#',
    '#########',
  ],
};
