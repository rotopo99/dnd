// Pixel-art sprites drawn from code. Palette and rules: docs/STYLE.md (owner: art-director).
//
// Sprite = array of strings; every char is a palette key (see PALETTE_KEYS), '.' = transparent.
// Rows shorter than the sprite width are padded with '.' on the right.
// Units face RIGHT by default (use opts.flip to face left).
// Unit sprites get a 1 px outline automatically (palette '0', or opts.tint) — do NOT draw it by hand.
// Tiles are drawn edge to edge and carry their own hand-drawn shading.
//
// API:
//   drawSprite(ctx, id | id[], x, y, scale = 3, opts)  — x, y = top-left corner of the 16x16 cell on screen.
//       Sprites are aligned bottom-center to the cell (tall/wide sprites overflow up/sideways).
//       id[] = layers composed bottom to top (hero = body + class overlay; tile = floor + object).
//       opts: { frame = 0, flip = false, tint = null (outline colour: palette key or '#hex'),
//               mono = null (fill every pixel with one colour — hit flash, team marker), alpha = 1 }
//   heroSpriteIds(raceId, classId) -> ['race-human', 'class-ranger']
//   enemySpriteIds(enemyId)        -> layer list for enemies.js / summons ids
//   tileSpriteIds(ch, col, row)    -> layer list for a map grid char ('#', '.', 'c', '~', 'D', 'P', 'E', 'A')
//   drawTeamMarker(ctx, team, x, y, scale) — ring under the feet: 'player' | 'enemy' | 'ally'
//   spriteFrames(id | id[])        -> number of animation frames (idle = 2 for units)
//   idleFrame(timeMs, phase = 0)   -> 0 | 1, ~2 Hz breathing; pass a per-unit phase to desync units
//   validateSprites()              -> array of error strings (used by tools/sprite-preview.html)

export const TILE = 16;

// 26 colours. Keys 0-9, a-p. Meaning of each colour — docs/STYLE.md.
export const PALETTE_KEYS = '0123456789abcdefghijklmnop';
export const PALETTE = [
  '#14141c', // 0 outline, deepest shadow
  '#262833', // 1 night, seams, black cloth
  '#3c3f4f', // 2 dark steel, floor base
  '#5b6175', // 3 steel
  '#8d95a8', // 4 light steel, highlights on metal
  '#dfe3e8', // 5 bone, white, UI text
  '#3b2519', // 6 dark leather, mortar, rust shadow
  '#6e3d22', // 7 rust, brick, fur
  '#a95f2c', // 8 light rust, wood, red hair
  '#d8a27a', // 9 skin
  '#f0b050', // a amber: proxy / Old God, gold, warning stripes
  '#f2d024', // b energy (ЭНР), flame core
  '#c42828', // c health (ЗДР), blood, enemy team, red eyes
  '#5e1818', // d dark red: ЗДР tile background, blood shadow
  '#f06a24', // e fire
  '#4fa0f0', // f morale (МРЛ), shields
  '#1f3563', // g deep blue: МРЛ tile background, tracksuit
  '#70d8f2', // h cyber cyan: visors, Cyberspace, player team
  '#1c4a5a', // i dark teal: tech tile background, hologram scanlines
  '#74c050', // j mutant green: plants, mutants, ally team
  '#2e5030', // k dark green: foliage shadow, mutant tile background
  '#4b5a2f', // l olive: military cloth (Artyom, Repa)
  '#8c8a5c', // m khaki: rags, sandbags, hoods
  '#e04fa8', // n cringe pink: Cringegons, cringe damage
  '#5c2a6c', // o dark purple: Cult of the Judge robes
  '#b9a39e', // p pale flesh: crawler, wounds
];

export const TEAM_COLORS = { player: 'h', enemy: 'c', ally: 'j' };

// ---------------------------------------------------------------------------
// Sprite definitions
// ---------------------------------------------------------------------------
// def: { w, h, frames: [rows, ...], outline: bool, bob: rows kept fixed at the bottom for the
//        auto idle frame (null = no auto frame) }

const unit = (rows, { w = 16, h = 16, bob = 4 } = {}) => ({ w, h, frames: [rows], outline: true, bob });
const layer = (rows, { w = 16, h = 16 } = {}) => ({ w, h, frames: [rows], outline: true, bob: null });
const tile = (...frames) => ({ w: 16, h: 16, frames, outline: false, bob: null });

// Hero rig (all race bodies follow it so class overlays line up):
//   head cols 5-9 rows 2-6 · torso cols 5-9 rows 7-10 · back hand (4,10) · front hand (10,10)
//   legs cols 5-6 and 8-9 rows 11-13 · boots row 14. Weapons live in cols 11-15.

const RACES = {
  human: [
    '',
    '',
    '.....6666',
    '....m66999',
    '....m69909',
    '....m69999',
    '.....mmmm',
    '...7lllllll',
    '...7llmll6l',
    '...7lll6mll',
    '....9666669',
    '.....22.22',
    '.....22.22',
    '.....22.22',
    '.....66.666',
  ],
  skeleton: [
    '',
    '',
    '.....5555',
    '....555555',
    '....555h5h',
    '....555555',
    '......5050',
    '....4777774',
    '....44c4c44',
    '....3444443',
    '....5232325',
    '.....43.43',
    '.....33.33',
    '.....43.43',
    '.....22.222',
  ],
  android: [
    '',
    '',
    '.....llll',
    '....llllll',
    '....ll1hhh',
    '....l11111',
    '......111',
    '....3lllll3',
    '....3llmll3',
    '....1llmll1',
    '....4l666l4',
    '.....ll.ll',
    '.....ll.ll',
    '.....11.11',
    '.....11.111',
  ],
  'mutant-beast': [
    '',
    '......7..7',
    '......8778',
    '.....877777',
    '.....77a7999',
    '.....7777905',
    '....88777',
    '...88777778',
    '...87799778',
    '...87799778',
    '...96777769',
    '...5.77.775',
    '.....77.77',
    '.....66.66',
    '....665.665',
  ],
  'mutant-plant': [
    '',
    '......j.a',
    '.....kjjaa',
    '....kjjjjj',
    '.....j0j0j',
    '.....jjjjj',
    '......kjk',
    '....k6jjj6k',
    '....k6jkj6k',
    '....kjjkjjk',
    '....j66666j',
    '.....66.66',
    '.....66.66',
    '.....66.66',
    '....k66.66k',
  ],
  tekhonok: [
    '.........a',
    '.........4',
    '.....77774',
    '....777777',
    '....776a6a',
    '....779666',
    '.....8778',
    '...88778878',
    '...87788778',
    '...878a7787',
    '....9877789',
    '.....22.22',
    '.....22.22',
    '.....66.66',
    '....666.666',
  ],
  cringegon: [
    '....n....n',
    '.....o..o',
    '.....nnnnn',
    '....nnnnnnn',
    '....n00n00n',
    '....n00n00n',
    '......non',
    '.....ooooo',
    '....noo5oon',
    '....nooooon',
    '....n22222n',
    '.....oo.oo',
    '.....oo.oo',
    '.....oo.oo',
    '.....nn.nnn',
  ],
  skrilet: [
    '',
    '......2',
    '.....2222',
    '.....22222',
    '.....2cccc',
    '.....22222',
    '......121',
    '....1222221',
    '....12c2c21',
    '....1222221',
    '....4122214',
    '.....21.12',
    '.....21.12',
    '.....21.12',
    '.....11.111',
  ],
};

// Class overlays: what the hero holds / wears on top of the body (same 16x16 rig).
const CLASSES = {
  // Rebar sledge (Забивной, fighter)
  zabivnoy: [
    '',
    '',
    '...........3443',
    '...........3333',
    '.............8',
    '.............7',
    '............8',
    '............7',
    '...........8',
    '...........7',
    '...........8',
    '...........6',
  ],
  // Floating cyber orb (Техномант, wizard)
  technomant: [
    '',
    '',
    '',
    '..............5',
    '............h',
    '...........hhh',
    '..........hh5hh',
    '...........hhh',
    '............h',
    '...........f',
    '..........f',
  ],
  // Mutated green claw + bone spikes (Мутант, barbarian)
  mutant: [
    '',
    '',
    '',
    '',
    '',
    '...5',
    '..5',
    '...5',
    '..........jj',
    '..........jjj',
    '..........jkjj',
    '..........5.5.5',
  ],
  // Wrench + helper drone (Айтишник, artificer)
  itishnik: [
    '',
    '.4h4',
    '..2',
    '',
    '',
    '............4.4',
    '............444',
    '.............4',
    '............3',
    '...........3',
    '..........3',
  ],
  // Assault rifle (Рейнджер, ranger)
  ranger: [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '..........44',
    '........l3333444',
    '.......ll3.3',
    '..........2',
  ],
  // Energy riot shield (Арбитр, paladin)
  arbiter: [
    '',
    '',
    '',
    '',
    '',
    '...........ff',
    '...........fhf',
    '...........fhf',
    '...........f5f',
    '...........fhf',
    '...........fhf',
    '...........fhf',
    '...........ff',
  ],
  // Finka knife (Уголовник, rogue)
  ugolovnik: [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '..............5',
    '.............54',
    '............54',
    '...........4',
    '..........6',
  ],
  // Living staff: wood, leaves, cyber node (Эколог, druid)
  ecolog: [
    '..........j.j',
    '..........kjk',
    '...........h',
    '...........6',
    '...........6',
    '...........8',
    '...........6',
    '...........6',
    '...........6',
    '...........6',
    '...........6',
    '...........6',
    '...........6',
    '...........6',
  ],
  // Microphone + gold chain (Рэпер, bard)
  reper: [
    '',
    '',
    '',
    '',
    '',
    '...........44',
    '...........44',
    '......a.a..1',
    '.......a...1',
    '.......b...1',
  ],
  // Halo of the Old God + proxy lantern (СлавоТех, cleric)
  slavotech: [
    '......aaa',
    '.....a...a',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '...........2',
    '..........aba',
    '..........aaa',
  ],
  // Judge's cyber flame (КиберТех, warlock)
  cybertech: [
    '',
    '',
    '',
    '',
    '',
    '............h',
    '...........hh',
    '...........ohh',
    '..........oho',
    '...........oo',
  ],
};

// Enemies and summons (16x16 unless stated).
const MOBS = {
  cultist: [
    '',
    '......ooo',
    '.....ooooo',
    '....ooo111',
    '....oo1c1c',
    '....ooo111',
    '.....oooo',
    '....ooohooo',
    '....ooohooo',
    '....ooohooo',
    '....9ooooo9',
    '....ooooooo',
    '....oo1o1oo',
    '...oooooooo',
    '....66..66',
  ],
  'cultist-gunner': [
    '',
    '......ooo',
    '.....ooooo',
    '....ooo111',
    '....oo1hhh',
    '....ooo111',
    '.....oooo',
    '....ooocooo',
    '....oooc1oo',
    '....ooohooo',
    '....9ooooo9',
    '....ooooooo',
    '....oo1o1oo',
    '...oooooooo',
    '....66..66',
  ],
  scavenger: [
    '',
    '',
    '.....3333',
    '....334443',
    '....22a2a2',
    '....222221',
    '......212',
    '....7887887',
    '....m88mm8m',
    '....mmm6mmm',
    '....9666669',
    '.....l3.3l',
    '.....33.33',
    '.....33.33',
    '.....66.666',
  ],
  crawler: [
    '',
    '',
    '',
    '',
    '..........ppp',
    '.....ppp.ppppp',
    '...pppppppp0p0p',
    '..ppdpppdpppppp',
    '.pp.ppppp.pd5d5',
    '.p..pp.pp..pp5',
    'pp..p...pp..p',
    'p...p....p..p',
    'p..p.....p...p',
    '5..5.....5...5',
    '',
  ],
  'cringe-jester': [
    '..n.....o',
    '...nn.oo',
    '....nonon',
    '....nnnnnnn',
    '....n00n00n',
    '....n00n00n',
    '.....nn5nn',
    '....bonbonb',
    '...noonnoon',
    '...nnooonno',
    '...n.oonnoon',
    '.....oo.nn',
    '.....oo.nn',
    '.....nn.oo',
    '....bnn.oob',
  ],
  drone: [
    '',
    '',
    '',
    '..444.....444',
    '...2.......2',
    '...23333333',
    '...3444444432',
    '....3h33c33',
    '.....33333',
    '......1.1',
    '',
    '',
    '',
    '',
    '',
  ],
  turret: [
    '',
    '',
    '',
    '',
    '......3333',
    '.....3444444444',
    '.....33c3333333',
    '.....33333',
    '.......22',
    '.......22',
    '......2..2',
    '.....2....2',
    '....2......2',
    '...33......33',
  ],
  'beast-wolf': [
    '',
    '',
    '',
    '',
    '...........4.4',
    '..........4444',
    '.3.......44c44',
    '..33....4444444',
    '...3333333435',
    '...34343433',
    '...333333333',
    '...3.3...3.3',
    '...3.3...3.3',
    '..22.22.22.22',
  ],
  'cyber-demon': [
    'h.........h',
    '.h.......h',
    '..hggggg.h',
    '...ggggggg',
    '...gg5gg5g',
    '...ggggggg',
    '....gccc',
    '..fgggggggf',
    '.fhggfhfgghf',
    '.f.ggfhfgg.f',
    '.h.gggggg..h',
    '...gg...gg',
    '...gg...gg',
    '...ff...ff',
    '..hh...hh',
  ],
  'gang-thug': [
    '',
    '',
    '.....1111',
    '....111111',
    '.....99909',
    '.....99999',
    '......999',
    '....ggggggg',
    '....g5ggg5g',
    '....g5ggg5g',
    '....9ggggg9',
    '.....g5.g5',
    '.....g5.g5',
    '.....g5.g5',
    '.....55.555',
  ],
  biomass: [
    '',
    '',
    '',
    '',
    '',
    '......jjj',
    '....jjjjjjj',
    '...jj0jjj0jj',
    '..jjj5jjj5jjj',
    '..jjjjjkjjjjj',
    '.jjkjjjjjjkjjj',
    '.jjjjkddkjjjjj',
    'jjkjjjjjjjjkjjj',
    'kkkkkkkkkkkkkkk',
  ],
  spirit: [
    '',
    '',
    '......hhhh',
    '.....hhhhhh',
    '.....h5hh5h',
    '.....hhhhhh',
    '....hhhfhhhh',
    '...h.hhhhhh.h',
    '.....hfhhfh',
    '.....hhhhhh',
    '......hfhh',
    '.......hhf',
    '........hf',
    '.........f',
  ],
  hologram: [
    '',
    '',
    '.....hhhh',
    '....iiiiii',
    '....hhhhhh',
    '....iiiiii',
    '.....hhhh',
    '...iiiiiiii',
    '...hhhhhhhh',
    '...iiiiiiii',
    '....hhhhhhh',
    '.....ii.ii',
    '.....hh.hh',
    '.....ii.ii',
    '.....hh.hhh',
  ],
};

// Mob weapons (separate layers so the outline wraps body + weapon together).
const SICKLE = [
  '',
  '',
  '',
  '',
  '',
  '',
  '.............55',
  '..............45',
  '...............5',
  '...........6..5',
  '...........6',
  '...........6',
];
const CULT_RIFLE = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '...........c',
  '........3333444',
  '.......22.2',
  '..........2',
];
const PIPE = [
  '',
  '',
  '',
  '',
  '............5',
  '............4',
  '............3',
  '...........34',
  '...........3',
  '...........3',
  '...........3',
  '...........6',
];

// Skrilet assassin: race body + wrist blades.
const SKRILET_BLADES = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '.............5',
  '............5',
  '...........5',
  '..4.......4',
  '.5',
];

// Junk mech, 16x20 — hulking rusted walker (docs/canon/art/mob-junk-mech.jpg).
const JUNK_MECH = [
  '......4..4',
  '......3..3',
  '.....877778',
  '.....7cc777',
  '.....877776',
  '.88888777788888',
  '8777788777787778',
  '8767877777787678',
  '8777876666787778',
  '8767877877787678',
  '87778.7777.87778',
  '.777..6776..8777',
  '.676..7..7..7776',
  '.555..7..7..8778',
  '.5.5.877.778.5.5',
  '.....776.677.5.5',
  '.....67...76',
  '.....77...77',
  '.....67...76',
  '....8777.7778',
];

// Acolyte of the Judge, 16x24 — prologue boss.
const ACOLYTE = [
  '.......h....ccc',
  '.....h.h.h..c0c',
  '.....hhhhh..ccc',
  '....ooooooo..2',
  '....oo11111..2',
  '....oo1c1c1..2',
  '....oo11111..2',
  '.....ooooo...2',
  '...ooooooooo.2',
  '...o5ohhho5o.2',
  '...oohc0choo.2',
  '...ooohhhooo92',
  '..9oooooooooo2',
  '...ooooooooo.2',
  '...ooooooooo.2',
  '..ooooooooooo2',
  '..ooo1ooo1ooo2',
  '..ooooooooooo2',
  '.ooooo1o1oooo2',
  '.oooooooooooo2',
  '.oooooooooooo2',
  '.o1o1o1o1o1o12',
  '...66....66',
  '',
];

// --- Tiles -----------------------------------------------------------------
const FLOOR_A = [
  '3333333333333332',
  '3222222222222221',
  '3242222222222421',
  '3222222222222221',
  '3222222222222221',
  '3222212222222221',
  '3222221222222221',
  '3222222222222221',
  '3222222222221221',
  '3222222222222121',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3242222222222421',
  '3222222222222221',
  '2111111111111111',
];
const FLOOR_RUST = [
  '3333333333333332',
  '3222222222222221',
  '3272222222222781',
  '3262222222222671',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3222222222222221',
  '3222222222226221',
  '3222222222267621',
  '3272222222678721',
  '3262222226777761',
  '2111111111111111',
];
const FLOOR_SPLIT = [
  '3333333333333332',
  '3222222222222221',
  '3242222222222421',
  '3222222222222221',
  '3222222222222221',
  '3242222222222421',
  '3222222222222221',
  '2111111111111111',
  '3333333333333332',
  '3222222222222221',
  '3242222222222421',
  '3222222222222221',
  '3222222212222221',
  '3242222221222421',
  '3222222222222221',
  '2111111111111111',
];
const FLOOR_GRATE = [
  '3333333333333332',
  '3222222222222221',
  '3213131313131321',
  '3211111111111121',
  '3213131313131321',
  '3211111111111121',
  '3213131313131321',
  '3211111111111121',
  '3213131313131321',
  '3211111111111121',
  '3213131313131321',
  '3211111111111121',
  '3213131313131321',
  '3222222222222221',
  '3222222222222221',
  '2111111111111111',
];
const WALL = [
  '4444444444444444',
  '4333333333333333',
  '4333332333333333',
  '4333333233333343',
  '3333333333333333',
  '1111111111111111',
  '7786777876777786',
  '7776777776777776',
  '6666666666666666',
  '6877776787776777',
  '6777776777776777',
  '6666666666666666',
  '7776777876777776',
  '7776777776777d76',
  '6666666666666666',
  '1111111111111111',
];
const WALL_PIPE = [
  '4444444444444444',
  '4333333333333333',
  '4333333333323333',
  '4333333333333333',
  '3333333333333333',
  '1111111111111111',
  '7786777436777786',
  '7776777436777776',
  '6666666436666666',
  '6877776436776777',
  '6777776437777777',
  '6666666436666666',
  '7776777d43777776',
  '7776777dd7777776',
  '6666666666666666',
  '1111111111111111',
];
const CRATE = [
  '',
  '',
  '..000000000000',
  '..088888888880',
  '..088888888880',
  '..066666666660',
  '..037777777730',
  '..037777777730',
  '..036666666630',
  '..037777aa7730',
  '..03777a777730',
  '..036666666630',
  '..037777777730',
  '..037777777730',
  '..000000000000',
  '...1111111111',
];
const BARRICADE = [
  '',
  '',
  '.....0.....0',
  '....080...080',
  '....070...070',
  '...0000000000',
  '..0mmm0mmm0mmm0',
  '..0666066606660',
  '0000000000000000',
  '0mmmm0mmmm0mmmm0',
  '0mmmm0mmmm0mmmm0',
  '0666606666066660',
  '0000000000000000',
  '.111111111111111',
];
const FIRE_A = [
  '',
  '',
  '',
  '',
  '.......e',
  '......ee....e',
  '......eb...ee',
  '..e..ebe...ebe',
  '..ee.ebbe.ebbe',
  '.ebe.ebbe.ebbe.e',
  '.ebbeebbbeebbbee',
  '.cebbbbbbbbbbbec',
  '.ccebbbbbbbbbecc',
  '..cceeeeeeeeecc',
  '...cccccccccc',
  '',
];
const FIRE_B = [
  '',
  '',
  '',
  '',
  '............e',
  '....e.......ee',
  '...ee..e...ebe',
  '...ebe.ee..ebe',
  '..eebe.ebe.ebbe',
  '.eebbe.ebbeebbe',
  '.ebbbbeebbbbbbe',
  '.cebbbbbbbbbbbec',
  '.ccebbbbbbbbbecc',
  '..cceeeeeeeeecc',
  '...cccccccccc',
  '',
];
const SCORCH = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '..1111111111111',
  '.111111111111111',
  '.111111111111111',
  '..111111111111',
  '',
];
const DOOR = [
  '4444444444444444',
  '4333333333333333',
  '4333333333333333',
  '4333333333333343',
  '3333333333333333',
  '6666666666666666',
  '663a0a0jj0a0a366',
  '6632222112222366',
  '6632222112222366',
  '66322j2112j22366',
  '6632jj2112jj2366',
  '66322j2112j22366',
  '6632222112222366',
  '6632222112222366',
  '6632222112222366',
  '1111111111111111',
];
const MARKER = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '...5555555555',
  '..55........55',
  '...5555555555',
];

export const SPRITES = {};
for (const [id, rows] of Object.entries(RACES)) SPRITES[`race-${id}`] = unit(rows);
for (const [id, rows] of Object.entries(CLASSES)) SPRITES[`class-${id}`] = layer(rows);
for (const [id, rows] of Object.entries(MOBS)) SPRITES[`mob-${id}`] = unit(rows);
SPRITES['mob-drone'].bob = 0; // hovers: whole sprite bobs
SPRITES['mob-spirit'].bob = 0;
SPRITES['mob-turret'].bob = null; // static gun
SPRITES['mob-biomass'].bob = 2;
SPRITES['mob-crawler'].bob = 3;
SPRITES['mob-beast-wolf'].bob = 3;
SPRITES['layer-skrilet-blades'] = layer(SKRILET_BLADES);
SPRITES['layer-sickle'] = layer(SICKLE);
SPRITES['layer-cult-rifle'] = layer(CULT_RIFLE);
SPRITES['layer-pipe'] = layer(PIPE);
SPRITES['mob-junk-mech'] = unit(JUNK_MECH, { h: 20, bob: 6 });
SPRITES['mob-acolyte'] = unit(ACOLYTE, { h: 24, bob: 3 });

SPRITES['tile-floor'] = tile(FLOOR_A);
SPRITES['tile-floor-rust'] = tile(FLOOR_RUST);
SPRITES['tile-floor-split'] = tile(FLOOR_SPLIT);
SPRITES['tile-floor-grate'] = tile(FLOOR_GRATE);
SPRITES['tile-wall'] = tile(WALL);
SPRITES['tile-wall-pipe'] = tile(WALL_PIPE);
SPRITES['tile-door'] = tile(DOOR);
SPRITES['obj-crate'] = tile(CRATE);
SPRITES['obj-barricade'] = tile(BARRICADE);
SPRITES['obj-scorch'] = tile(SCORCH);
SPRITES['obj-fire'] = tile(FIRE_A, FIRE_B);
SPRITES['ui-marker'] = tile(MARKER);

export const RACE_IDS = Object.keys(RACES);
export const CLASS_IDS = Object.keys(CLASSES);
export const ENEMY_IDS = ['cultist', 'cultist-gunner', 'skrilet', 'acolyte', 'scavenger', 'junk-mech', 'crawler', 'cringe-jester'];
export const SUMMON_IDS = ['drone', 'turret', 'beast-wolf', 'cyber-demon', 'gang-thug', 'biomass', 'spirit', 'hologram'];

// ---------------------------------------------------------------------------
// Id helpers
// ---------------------------------------------------------------------------
export function heroSpriteIds(raceId, classId) {
  const ids = [SPRITES[`race-${raceId}`] ? `race-${raceId}` : 'race-human'];
  if (classId && SPRITES[`class-${classId}`]) ids.push(`class-${classId}`);
  return ids;
}

export function enemySpriteIds(enemyId) {
  const extra = { skrilet: ['race-skrilet', 'layer-skrilet-blades'], cultist: ['mob-cultist', 'layer-sickle'],
    'cultist-gunner': ['mob-cultist-gunner', 'layer-cult-rifle'], scavenger: ['mob-scavenger', 'layer-pipe'] };
  if (extra[enemyId]) return extra[enemyId];
  const id = `mob-${enemyId}`;
  return SPRITES[id] ? [id] : ['mob-cultist'];
}

const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
};

// Map grid char -> layers. col/row pick a stable variation so the floor does not look tiled.
export function tileSpriteIds(ch, col = 0, row = 0) {
  const r = hash2(col, row);
  const floor = r < 66 ? 'tile-floor' : r < 80 ? 'tile-floor-split' : r < 91 ? 'tile-floor-rust' : 'tile-floor-grate';
  switch (ch) {
    case '#': return [r < 80 ? 'tile-wall' : 'tile-wall-pipe'];
    case 'c': return [floor, r % 2 ? 'obj-crate' : 'obj-barricade'];
    case '~': return [floor, 'obj-scorch', 'obj-fire'];
    case 'D': return ['tile-door'];
    default: return [floor]; // '.', 'P', 'E', 'A'
  }
}

// ---------------------------------------------------------------------------
// Rendering with offscreen cache
// ---------------------------------------------------------------------------
const cache = new Map();

const toRgb = (c) => {
  const hex = c[0] === '#' ? c : PALETTE[PALETTE_KEYS.indexOf(c)] ?? PALETTE[0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function layersOf(id) {
  const ids = Array.isArray(id) ? id : [id];
  return ids.map((i) => {
    const def = SPRITES[i];
    if (!def) throw new Error(`Unknown sprite: ${i}`);
    return def;
  });
}

export function spriteFrames(id) {
  const defs = layersOf(id);
  const explicit = Math.max(...defs.map((d) => d.frames.length));
  return explicit > 1 ? explicit : defs[0].bob != null ? 2 : 1;
}

export function idleFrame(timeMs, phase = 0) {
  return Math.floor(timeMs / 450 + phase) & 1;
}

// Builds a w x h grid of palette keys (or null) for the composed layers.
function compose(defs, frame) {
  const w = Math.max(...defs.map((d) => d.w));
  const h = Math.max(...defs.map((d) => d.h));
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const d of defs) {
    const rows = d.frames[frame % d.frames.length];
    const ox = Math.floor((w - d.w) / 2);
    const oy = h - d.h;
    for (let y = 0; y < d.h; y++) {
      const row = rows[y] ?? '';
      for (let x = 0; x < d.w; x++) {
        const ch = row[x];
        if (ch && ch !== '.') grid[oy + y][ox + x] = ch;
      }
    }
  }
  // Auto idle: frame 1 shifts everything above the fixed bottom rows down by 1 px.
  const bob = defs[0].bob;
  if (bob != null && frame % 2 === 1 && defs.every((d) => d.frames.length === 1)) {
    const top = h - bob;
    for (let y = top - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const v = grid[y][x];
        if (v != null || y + 1 < top) grid[y + 1][x] = v;
        if (y === 0) grid[0][x] = null;
      }
    }
  }
  return { grid, w, h };
}

function build(id, frame, flip, tint, mono, outline) {
  const defs = layersOf(id);
  const { grid, w, h } = compose(defs, frame);
  const cw = w + 2;
  const ch = h + 2;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const c = canvas.getContext('2d');
  const img = c.createImageData(cw, ch);
  const put = (x, y, rgb) => {
    const px = flip ? cw - 1 - x : x;
    const i = (y * cw + px) * 4;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  };
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] != null;
  if (outline) {
    const oc = toRgb(tint ?? '0');
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) put(x + 1, y + 1, oc);
      }
    }
  }
  const monoRgb = mono ? toRgb(mono) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] != null) put(x + 1, y + 1, monoRgb ?? toRgb(grid[y][x]));
    }
  }
  c.putImageData(img, 0, 0);
  return { canvas, w, h };
}

export function drawSprite(ctx, id, x, y, scale = 3, opts = {}) {
  const { frame = 0, flip = false, tint = null, mono = null, alpha = 1 } = opts;
  const defs = layersOf(id);
  const frames = spriteFrames(id);
  const f = ((frame % frames) + frames) % frames;
  const outline = defs[0].outline;
  const key = `${Array.isArray(id) ? id.join('+') : id}|${f}|${flip ? 1 : 0}|${tint ?? ''}|${mono ?? ''}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = build(id, f, flip, tint, mono, outline);
    cache.set(key, entry);
  }
  const { canvas, w, h } = entry;
  const dx = x + (Math.floor((TILE - w) / 2) - 1) * scale;
  const dy = y + (TILE - h - 1) * scale;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(canvas, dx, dy, canvas.width * scale, canvas.height * scale);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}

export function drawTeamMarker(ctx, team, x, y, scale = 3) {
  drawSprite(ctx, 'ui-marker', x, y, scale, { mono: TEAM_COLORS[team] ?? team });
}

export function validateSprites() {
  const errors = [];
  for (const [id, d] of Object.entries(SPRITES)) {
    d.frames.forEach((rows, fi) => {
      if (rows.length > d.h) errors.push(`${id}[${fi}]: ${rows.length} rows > h ${d.h}`);
      rows.forEach((row, y) => {
        if (row.length > d.w) errors.push(`${id}[${fi}] row ${y}: length ${row.length} > w ${d.w}`);
        for (const ch of row) {
          if (ch !== '.' && !PALETTE_KEYS.includes(ch)) errors.push(`${id}[${fi}] row ${y}: bad char '${ch}'`);
        }
      });
    });
  }
  return errors;
}
