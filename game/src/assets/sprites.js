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

import { NPCS } from '../data/npcs.js';

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
  // Gans: ex-civil-defence soldier, no augments, auto-camo (olive/khaki spots), helmet, backpack.
  'npc-gans': [
    '',
    '',
    '.....llll',
    '....lklmll',
    '....l99909',
    '....l99999',
    '.....mkmm',
    '...6lmlkllm',
    '...6mllmkll',
    '...6lklllml',
    '....9666669',
    '.....lm.kl',
    '.....ml.lm',
    '.....lk.ml',
    '.....66.666',
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

const MARKER_ENEMY = [
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
  '.555........555',
  '.555........555',
  '..555555555555',
];

// ===========================================================================
// v2: world enemies, party NPCs
// ===========================================================================
// Replace given rows of a base map: withRows(base, { 4: '....', 5: '....' }).
const withRows = (base, rows) => base.map((r, i) => (i in rows ? rows[i] : r));
// Recolour a map: recolor(rows, { 5: '4', 4: '3' }).
const recolor = (rows, map) => rows.map((r) => [...r].map((ch) => map[ch] ?? ch).join(''));

const V2_MOBS = {
  rioter: [
    '', '',
    '.....6666',
    '....669999',
    '....669909',
    '....6ccccc',
    '.....999',
    '....7777777',
    '....7m77m7c',
    '....77m777c',
    '....9666669',
    '.....33.33',
    '.....33.33',
    '.....33.33',
    '.....66.666',
  ],
  cleaner: [
    '', '',
    '.....5555',
    '....555555',
    '....55cccc',
    '....544444',
    '.....333',
    '....4555554',
    '....4545454',
    '....3454543',
    '....5333335',
    '.....54.45',
    '.....44.44',
    '.....54.45',
    '.....33.333',
  ],
  rebel: [
    '',
    '.....7777',
    '....877778',
    '....799999',
    '....799909',
    '....799999',
    '.....mmmm',
    '....mmmmmmm',
    '....mm6mmmm',
    '....mmm6mmm',
    '....9666669',
    '.....ll.ll',
    '.....ll.ll',
    '.....66.66',
    '.....66.666',
  ],
  pirate: [
    '', '',
    '.....cccc',
    '....ccc999',
    '...cc99909',
    '.....99966',
    '......666',
    '....5555555',
    '....ggggggg',
    '....5555555',
    '....9111119',
    '.....11.11',
    '.....11.11',
    '.....66.66',
    '.....66.666',
  ],
  'materialized-soul': [
    '',
    '.....hhhh',
    '....hhhhhh',
    '....hh0h0h',
    '....hhhhhh',
    '.....hhoh',
    '...hhhhhhhh',
    '..hhhhohhhhh',
    '..h.hhhohh.h',
    '....hhhhhh',
    '....hfhhfh',
    '.....hhhf',
    '......hf',
    '.......f',
  ],
  scriptlet: [
    '', '',
    '...hh......hh',
    '..h..........h',
    '..h....55....h',
    '.h....5005....h',
    '..h...5005...h',
    '..h....55....h',
    '...hh......hh',
    '......f..f',
    '.....f....f',
  ],
  'npc-party-victor': [
    '', '',
    '.....mmmm',
    '....mmmmmm',
    '....mm9909',
    '....m95555',
    '.....5554',
    '...43mm5mm34',
    '....3m6mmm3',
    '....mmm6mmm',
    '....9666669',
    '.....77.77',
    '.....77.77',
    '.....66.66',
    '.....66.666',
  ],
  'npc-party-artyom': [
    '', '',
    '.....lkll',
    '....lllkll',
    '....kl9909',
    '....llklkl',
    '.....lkll',
    '...6lklllkl',
    '...6llklkll',
    '...6klllkll',
    '....1666661',
    '.....lk.kl',
    '.....kl.lk',
    '.....ll.ll',
    '.....66.666',
  ],
};
V2_MOBS['cleaner-captain'] = withRows(V2_MOBS.cleaner, { 1: '......cc', 7: '....c55555c', 8: '....c54545c' });
V2_MOBS['cleaner-5'] = withRows(recolor(V2_MOBS.cleaner, { 5: '3', 4: '2', 3: '1' }), { 4: '....3ccccc', 7: '....c33333c', 9: '....1c3c3c1' });
V2_MOBS['rebel-veteran'] = withRows(V2_MOBS.rebel, { 1: '.....3333b', 2: '....33333b', 3: '....399999', 7: '....lllllll', 8: '....l6l6l6l', 9: '....lllllll' });
V2_MOBS['rebel-gunner'] = withRows(V2_MOBS.rebel, { 1: '', 2: '.....6666', 3: '....669999', 5: '....6mmmmm' });
V2_MOBS['cultist-3'] = withRows(MOBS.cultist, { 3: '....ooo444', 4: '....oo4c4c', 5: '....ooo444', 7: '....ooo3ooo', 8: '....oo434oo' });
V2_MOBS['cringe-warrior'] = withRows(RACES.cringegon, { 7: '....3ooooo3', 8: '...33o333o33', 9: '....no333on', 10: '....n22222n' });
V2_MOBS['scavenger-hunter'] = withRows(MOBS.scavenger, { 2: '.....mmmm', 3: '....mmmmmm', 4: '....mm2a2a', 5: '....mm2221', 7: '....m887887' });
V2_MOBS['scavenger-gunner'] = withRows(MOBS.scavenger, { 7: '....8778778', 8: '....m7mmm7m' });
V2_MOBS['pirate-gunner'] = withRows(V2_MOBS.pirate, { 1: '.....1111', 2: '...a111111a', 3: '....169999', 4: '....699909' });
V2_MOBS['pirate-hacker'] = withRows(V2_MOBS.pirate, { 4: '...cc9hhhh', 8: '....ghgggg', 9: '....5555h55' });

const V2_LAYERS = {
  'shock-rifle': ['', '', '', '', '', '', '', '', '..............h', '........44444hh', '.......33.3', '..........3'],
  'shock-cleaver': ['', '', '', '', '.............h', '............h5', '............h5', '............h5', '............h5', '............h5', '...........1', '...........1'],
  pitchfork: ['.........5.5.5', '.........5.5.5', '.........44444', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8', '...........8'],
  'sawed-off': ['', '', '', '', '', '', '', '', '', '.........883333', '.........8'],
  'shock-baton': ['', '', '', '', '', '', '...............5', '..............h', '.............h', '............3', '...........1', '..........1'],
  'cringe-club': ['', '', '', '', '............5', '...........nnn', '..........5nnn5', '...........nnn', '............6', '...........6', '...........6'],
  nailgun: ['', '', '', '', '', '', '', '', '...........aaa', '..........aa334', '..........2'],
  harpoon: ['', '', '', '', '', '', '', '..............5', '.........3344445', '.........32...5'],
  saber: ['', '', '', '', '..............5', '..............5', '.............5', '.............5', '............5', '...........a', '..........a8'],
  carbine: ['', '', '', '', '', '', '', '', '', '........88333344', '.........2'],
  'energy-pistol': ['', '', '', '', '', '', '', '', '...........33', '...........3hh', '...........2'],
  'heavy-hammer': ['', '..........34443', '..........33333', '..........32223', '............6', '............6', '............6', '...........6', '...........6', '...........6', '...........6'],
  sniper: ['', '', '', '', '', '', '', '', '..........111', '.......l33333334', '.........2'],
};

// Final boss, 16x24: black robes with purple trim, metal mask, cable halo, terminal-staff.
const CYBER_PRIEST = [
  '.....hhhhh',
  '....h11111h.222',
  '....1144441.2h2',
  '....114h4h1.2h2',
  '....1145o41.222',
  '....1144441..3',
  '.....11411...3',
  '...o1111111o.3',
  '...1o11h11o1.3',
  '...11hhhhh11.3',
  '...111h0h111.3',
  '...1o1hhh1o193',
  '..91o11h11o1.3',
  '...1o11111o1.3',
  '...1o11111o1.3',
  '..11o11111o113',
  '..11o11111o113',
  '..11o11111o113',
  '.111o11111o1113',
  '.111o11111o1113',
  '.111o11111o1113',
  '.o1o1o1o1o1o1o3',
  '...66....66',
  '',
];

// Cringe beacon (object): antenna tower that pulses pink.
const BEACON_A = [
  '', '',
  '.......n',
  '......n5n',
  '.......n',
  '.......3',
  '......343',
  '.......3',
  '......3.3',
  '......343',
  '.....3...3',
  '.....34443',
  '....3.....3',
  '...222222222',
  '...2n2n2n2n2',
  '...222222222',
];
const BEACON_B = withRows(BEACON_A, { 0: '...n.......n', 1: '....n.....n', 2: '..n....n....n', 3: '..n...n5n...n', 4: '...n...n...n', 14: '...2a2a2a2a2' });

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

for (const [id, rows] of Object.entries(V2_MOBS)) SPRITES[`mob-${id}`] = unit(rows);
for (const [id, rows] of Object.entries(V2_LAYERS)) SPRITES[`layer-${id}`] = layer(rows);
SPRITES['mob-materialized-soul'].bob = 0;
SPRITES['mob-scriptlet'].bob = 0;
SPRITES['mob-cyber-priest'] = unit(CYBER_PRIEST, { h: 24, bob: 3 });
SPRITES['mob-cringe-beacon'] = { w: 16, h: 16, frames: [BEACON_A, BEACON_B], outline: true, bob: null };

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
// Enemy ring: thicker + dark outline, red on the steel floor is low-contrast otherwise.
SPRITES['ui-marker-enemy'] = { w: 16, h: 16, frames: [MARKER_ENEMY], outline: true, bob: null };

export const RACE_IDS = Object.keys(RACES);
export const CLASS_IDS = Object.keys(CLASSES);
export const ENEMY_IDS = ['cultist', 'cultist-gunner', 'skrilet', 'acolyte', 'scavenger', 'junk-mech', 'crawler', 'cringe-jester'];
export const NPC_IDS = ['npc-gans', 'npc-party-victor', 'npc-party-artyom'];
export const WORLD_ENEMY_IDS = ['rioter', 'cleaner', 'cleaner-captain', 'cleaner-5', 'rebel', 'rebel-gunner', 'rebel-veteran',
  'cultist-3', 'materialized-soul', 'scriptlet', 'cyber-priest', 'cringe-beacon', 'cringe-warrior', 'scavenger-gunner',
  'scavenger-hunter', 'pirate', 'pirate-gunner', 'pirate-hacker'];
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
    'cultist-gunner': ['mob-cultist-gunner', 'layer-cult-rifle'], scavenger: ['mob-scavenger', 'layer-pipe'],
    'npc-gans': ['mob-npc-gans', 'class-ranger'],
    rioter: ['mob-rioter', 'layer-pipe'],
    cleaner: ['mob-cleaner', 'layer-shock-rifle'],
    'cleaner-captain': ['mob-cleaner-captain', 'layer-shock-cleaver'],
    'cleaner-5': ['mob-cleaner-5', 'layer-shock-rifle'],
    rebel: ['mob-rebel', 'layer-pitchfork'],
    'rebel-gunner': ['mob-rebel-gunner', 'layer-sawed-off'],
    'rebel-veteran': ['mob-rebel-veteran', 'class-ranger'],
    'cultist-3': ['mob-cultist-3', 'layer-shock-baton'],
    'cringe-warrior': ['mob-cringe-warrior', 'layer-cringe-club'],
    'scavenger-gunner': ['mob-scavenger-gunner', 'layer-nailgun'],
    'scavenger-hunter': ['mob-scavenger-hunter', 'layer-harpoon'],
    pirate: ['mob-pirate', 'layer-saber'],
    'pirate-gunner': ['mob-pirate-gunner', 'layer-carbine'],
    'pirate-hacker': ['mob-pirate-hacker', 'layer-energy-pistol'],
    'npc-party-victor': ['mob-npc-party-victor', 'layer-heavy-hammer'],
    'npc-party-artyom': ['mob-npc-party-artyom', 'layer-sniper'] };
  if (extra[enemyId]) return extra[enemyId];
  const id = `mob-${enemyId}`;
  if (SPRITES[id]) return [id];
  // Level variants ('cultist-5', 'junk-mech-5') reuse the base look.
  const base = String(enemyId).replace(/-\d+$/, '');
  if (base !== enemyId) return enemySpriteIds(base);
  return ['mob-cultist'];
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

function getEntry(id, f, flip, tint, mono) {
  const key = `${Array.isArray(id) ? id.join('+') : id}|${f}|${flip ? 1 : 0}|${tint ?? ''}|${mono ?? ''}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = build(id, f, flip, tint, mono, layersOf(id)[0].outline);
    cache.set(key, entry);
  }
  return entry;
}

// Top-left blit: the canvas has a 1 px padding for the outline.
function blit(ctx, entry, x, y, scale, alpha) {
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(entry.canvas, x - scale, y - scale, entry.canvas.width * scale, entry.canvas.height * scale);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}

export function drawSprite(ctx, id, x, y, scale = 3, opts = {}) {
  const { frame = 0, flip = false, tint = null, mono = null, alpha = 1 } = opts;
  const frames = spriteFrames(id);
  const f = ((frame % frames) + frames) % frames;
  const entry = getEntry(id, f, flip, tint, mono);
  const dx = x + Math.floor((TILE - entry.w) / 2) * scale;
  const dy = y + (TILE - entry.h) * scale;
  blit(ctx, entry, dx, dy, scale, alpha);
}

export function drawTeamMarker(ctx, team, x, y, scale = 3) {
  drawSprite(ctx, team === 'enemy' ? 'ui-marker-enemy' : 'ui-marker', x, y, scale, { mono: TEAM_COLORS[team] ?? team });
}

// ===========================================================================
// v2: portraits 32x32 (dialogue) — generated from race + faction + per-NPC traits
// ===========================================================================
// Portraits are built once into ordinary string maps (SPRITES['portrait-<id>']) by a tiny raster
// helper, so they obey the same palette rules as hand-drawn sprites.

const P = 32;
class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => new Array(w).fill('.')); }
  px(x, y, c) { if (!c) return; x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  // filled ellipse; pred(x, y) can clip (e.g. only the top half)
  ell(cx, cy, rx, ry, c, pred) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx; const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!pred || pred(x, y))) this.px(x, y, c);
      }
    }
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  // recolour pixels of colour `from` inside a box
  swap(x, y, w, h, from, to) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.g[j]?.[i] === from) this.g[j][i] = to; }
  rounded(c) { // icon-style rounded tile
    this.rect(0, 0, this.w, this.h, c);
    const r = this.w >= 32 ? [3, 1, 1] : [2, 1];
    r.forEach((n, y) => { for (let x = 0; x < n; x++) { this.px(x, y, '.'); this.px(this.w - 1 - x, y, '.'); this.px(x, this.h - 1 - y, '.'); this.px(this.w - 1 - x, this.h - 1 - y, '.'); } });
  }
  rows() { return this.g.map((r) => r.join('')); }
}

// Faction look: background tile, clothing, clothing accent, default headgear.
const FACTION_LOOK = {
  technikums: { bg: 'i', cloth: 'l', accent: 'h', hat: 'goggles' },
  aiParty: { bg: 'd', cloth: '2', accent: 'c', hat: 'officer' },
  warprom: { bg: '2', cloth: 'l', accent: 'k', hat: 'helmet' },
  tinBrotherhood: { bg: 'g', cloth: '3', accent: '4', hat: 'kabuto' },
  pirates: { bg: 'g', cloth: '1', accent: 'a', hat: 'bandana' },
  scavengers: { bg: '6', cloth: '7', accent: '8', hat: 'respirator' },
  renegades: { bg: 'k', cloth: 'm', accent: 'c', hat: 'scarf' },
  mechanids: { bg: 'i', cloth: '3', accent: 'h', hat: 'antenna' },
  cringegons: { bg: 'o', cloth: 'o', accent: 'n', hat: null },
  tekhonki: { bg: '6', cloth: '7', accent: 'a', hat: null },
  neutralVillages: { bg: 'k', cloth: 'm', accent: '8', hat: 'ushanka' },
  agrozone: { bg: 'k', cloth: 'l', accent: 'j', hat: 'headset' },
  mutantsPlant: { bg: 'k', cloth: 'k', accent: 'j', hat: null },
  mutantsBeast: { bg: 'd', cloth: '6', accent: '8', hat: null },
  cult: { bg: 'o', cloth: 'o', accent: 'h', hat: 'hood' },
  predlozhka: { bg: 'g', cloth: 'g', accent: 'h', hat: 'hood' },
  none: { bg: '2', cloth: '3', accent: '4', hat: null },
};

// Per-NPC traits. Anything missing is derived from race/faction/hash.
// hair: short|long|bald|mohawk|topknot · eyes: shades|goggles|patch|glow|empty|glasses · extras: chain|scar|earpiece|tie|beard-long
const NPC_LOOK = {
  'victor-sundown': { hat: 'guardcap', mustache: '6', hair: 'short', hairColor: '6' },
  nikola: { hat: 'goggles', beard: '7', hairColor: '7' },
  gans: { hat: 'helmet', camo: true, hairColor: '6' },
  sera: { fem: true, hair: 'long', hairColor: '8', hat: 'goggles' },
  paracetamol: { hat: 'medband', cloth: '5' },
  amanda: { fem: true, hair: 'long', hairColor: '1', hat: 'headset' },
  aynura: { fem: true, hair: 'long', hairColor: 'h', hat: null },
  seer: { hair: 'long', hairColor: '4', beard: '4', extras: ['beard-long'], hat: 'hood', cloth: 'm', eyes: 'glow' },
  lox: { hair: 'short', hairColor: '1', cloth: '1', extras: ['tie', 'earpiece', 'scar'], hat: null, bg: 'd' },
  alik: { hair: 'short', hairColor: '1', mustache: '1', extras: ['chain'], eyes: 'shades', cloth: 'g' },
  andrey: { hair: 'short', hairColor: '7', beard: '6', hat: 'goggles' },
  dymka: { hat: 'hood', cloth: '1' },
  telifon: { hat: 'headset' },
  'putin-mark-2': { screen: 'c', hat: 'officer' },
  'general-ai': { screen: 'c', hat: 'helmet' },
  'private-nedolyot': { hat: 'helmet', hairColor: '8' },
  khan: { hat: 'kabuto', beard: '1', mustache: '1' },
  ken: { hair: 'topknot', hairColor: '1', hat: 'headband' },
  sekiro: { hat: 'kabuto' },
  burevestnik: { hat: 'tricorn', beard: '1', eyes: 'patch' },
  'cyber-lovkach': { hair: 'mohawk', hairColor: 'h', eyes: 'shades', hat: null },
  'madam-stavka': { fem: true, hair: 'long', hairColor: '1', extras: ['chain'], hat: null, cloth: 'o' },
  'glava-musora': { hat: 'junkcrown', beard: '7', hairColor: '7' },
  sborshchik: { hat: 'respirator', eyes: 'goggles' },
  zver: { extras: ['scar'], big: true },
  'zoya-klyk': { fem: true, fur: '8' },
  'mutant-shaman': { flower: 'n', extras: ['beard-long'] },
  'aunt-loza': { fem: true, flower: 'a' },
  'cringe-chief': { hat: 'crown' },
  'cringe-jester': { hat: 'jester' },
  'great-collector': { hood: 'o', hoodEyes: 'n', threeEyes: true },
  diss: { hat: 'cap', extras: ['chain'] },
  'old-god': { screen: 'a' },
  ankort: { eyes: 'goggles-h' },
  aztun: { antennas: 3, beard: '5' },
  rzhaven: { cloth: '8' },
  tik: { hat: 'antenna', visor: 'j' },
  'shepherd-timokha': { hat: 'ushanka', beard: 'm', hairColor: 'm' },
  zarya: { fem: true, hair: 'short', hairColor: '8', cloth: '5', extras: ['scar'], hat: null },
  marta: { fem: true, hair: 'long', hairColor: '7', hat: 'scarf', scarf: 'c' },
  'kuksius-first': { hat: 'scarf', scarf: '7' },
  yarosh: { hat: 'scarf', scarf: 'l', hood: 'l', hoodEyes: null },
  judge: { deity: true },
  'cyber-priest': { hood: '1', mask: true },
  'sister-pomekha': { fem: true, hair: 'short', hairColor: '5', eyes: 'glow', extras: ['scar'], hat: null, cloth: 'o' },
  'predlozhka-1': { hood: 'g', screenFace: true },
  'keeper-of-history': { hat: 'hood', beard: '5', extras: ['beard-long'], eyes: 'glasses', hairColor: '5' },
  vazgen: { hair: 'bald', beard: '1', hat: 'goggles' },
};

const strHash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function drawEyes(r, style, y = 14) {
  switch (style) {
    case 'shades': r.rect(11, y - 1, 10, 3, '1'); r.px(12, y - 1, '4'); r.px(18, y - 1, '4'); break;
    case 'goggles': case 'goggles-h': {
      const c = style === 'goggles-h' ? 'h' : 'a';
      r.rect(10, y - 1, 12, 3, '1'); r.rect(11, y - 1, 4, 2, c); r.rect(17, y - 1, 4, 2, c); break;
    }
    case 'patch': r.rect(12, y - 1, 3, 3, '1'); r.line(10, y - 4, 22, y + 1, '1'); r.px(18, y, '5'); r.px(19, y, '0'); break;
    case 'glow': r.rect(12, y, 2, 1, 'h'); r.rect(18, y, 2, 1, 'h'); break;
    case 'empty': r.rect(12, y, 2, 1, '5'); r.rect(18, y, 2, 1, '5'); break;
    case 'glasses': r.rect(11, y - 1, 4, 3, '4'); r.rect(17, y - 1, 4, 3, '4'); r.px(12, y, '0'); r.px(19, y, '0'); r.rect(15, y, 2, 1, '4'); break;
    default: r.px(12, y, '5'); r.px(13, y, '0'); r.px(18, y, '0'); r.px(19, y, '5');
  }
}

function drawHeadgear(r, hat, look) {
  const top = (y) => (x, yy) => yy <= y;
  switch (hat) {
    case 'helmet': r.ell(16, 10, 7.5, 5.5, look.camo ? 'l' : 'l', top(10)); r.rect(8, 10, 16, 1, 'k');
      if (look.camo) { r.px(12, 7, 'k'); r.px(18, 6, 'm'); r.px(20, 9, 'k'); r.px(14, 9, 'm'); } break;
    case 'guardcap': r.ell(16, 9, 7, 3.5, 'l', top(9)); r.rect(9, 9, 14, 2, 'k'); r.rect(15, 8, 2, 1, 'a'); r.rect(11, 11, 10, 1, '1'); break;
    case 'officer': r.ell(16, 8, 7.5, 3.5, 'd', top(8)); r.rect(9, 8, 15, 2, '1'); r.rect(15, 7, 2, 2, '4'); r.rect(11, 10, 10, 1, '0'); break;
    case 'kabuto': r.ell(16, 10, 8, 6, '3', top(10)); r.rect(8, 10, 2, 6, '3'); r.rect(22, 10, 2, 6, '3'); r.rect(9, 10, 14, 1, '4');
      r.line(12, 5, 9, 1, 'a'); r.line(20, 5, 23, 1, 'a'); break;
    case 'bandana': r.ell(16, 10, 7, 4.5, 'c', top(10)); r.px(23, 11, 'c'); r.px(24, 12, 'c'); r.px(24, 13, 'c'); r.px(13, 8, '5'); r.px(18, 7, '5'); break;
    case 'tricorn': r.ell(16, 8, 6, 3.5, '1', top(8)); r.rect(7, 8, 18, 2, '1'); r.rect(7, 8, 18, 1, 'a'); r.px(6, 7, '1'); r.px(25, 7, '1'); break;
    case 'ushanka': r.ell(16, 9, 8, 5, '7', top(10)); r.rect(8, 8, 16, 2, '8'); r.rect(7, 10, 3, 8, '7'); r.rect(22, 10, 3, 8, '7'); break;
    case 'goggles': r.rect(9, 9, 14, 2, '1'); r.rect(11, 8, 4, 3, look.accent ?? 'h'); r.rect(17, 8, 4, 3, look.accent ?? 'h'); break;
    case 'headset': r.ell(16, 9, 8, 6, '2', (x, y) => y <= 6); r.rect(8, 11, 2, 5, '2'); r.rect(22, 11, 2, 5, '2'); r.rect(7, 12, 2, 3, '3');
      r.line(23, 16, 20, 19, '2'); r.px(19, 19, 'h'); break;
    case 'respirator': r.rect(11, 17, 10, 5, '2'); r.ell(16, 19.5, 2.5, 2.5, '3'); r.px(16, 19, '1'); r.px(10, 16, '1'); r.px(21, 16, '1'); break;
    case 'scarf': r.rect(10, 17, 12, 5, look.scarf ?? 'm'); r.rect(10, 17, 12, 1, '6'); break;
    case 'antenna': r.line(21, 7, 24, 1, '4'); r.px(24, 1, look.visor ?? 'h'); break;
    case 'medband': r.rect(9, 9, 14, 2, 'c'); r.rect(15, 8, 2, 4, '5'); r.rect(14, 9, 4, 2, '5'); break;
    case 'headband': r.rect(9, 10, 14, 1, 'c'); r.px(23, 11, 'c'); r.px(24, 12, 'c'); break;
    case 'junkcrown': r.rect(10, 6, 12, 3, 'a'); [10, 13, 16, 19, 21].forEach((x, i) => r.rect(x, 3 + (i % 2), 1, 3, i % 2 ? '3' : 'a')); r.px(15, 7, 'c'); break;
    case 'crown': r.rect(10, 4, 12, 2, 'a'); [10, 13, 16, 19, 21].forEach((x) => r.rect(x, 2, 1, 2, 'a')); r.px(16, 4, 'b'); break;
    case 'jester': r.line(10, 6, 5, 2, 'n'); r.line(22, 6, 27, 2, 'o'); r.line(16, 4, 16, 0, 'n'); r.px(5, 2, 'b'); r.px(27, 2, 'b'); r.px(16, 0, 'b'); break;
    case 'cap': r.ell(16, 8, 7, 3.5, '1', top(8)); r.rect(9, 8, 14, 2, '1'); r.rect(5, 9, 5, 1, '1'); break;
    default: break;
  }
}

function hairBack(r, style, c) {
  if (style === 'long') { r.rect(8, 10, 3, 14, c); r.rect(21, 10, 3, 14, c); }
}
function hairTop(r, style, c) {
  switch (style) {
    case 'bald': r.px(13, 8, '5'); break;
    case 'mohawk': r.rect(15, 3, 3, 8, c); break;
    case 'topknot': r.ell(16, 9, 6.5, 3.5, c, (x, y) => y <= 9); r.ell(16, 4.5, 2, 2, c); break;
    default: r.ell(16, 9.5, 7, 4.5, c, (x, y) => y <= 10); r.px(9, 11, c); r.px(22, 11, c);
  }
}

function headHuman(r, L) {
  const skin = '9';
  hairBack(r, L.hair, L.hairColor);
  r.ell(16, 14.5, 6, 7.5, skin);
  r.rect(21, 12, 1, 8, '8'); r.px(9, 14, '8'); r.px(22, 14, '8'); // shade + ears
  hairTop(r, L.hair, L.hairColor);
  r.rect(11, 12, 3, 1, L.hair === 'bald' ? '8' : '6'); r.rect(18, 12, 3, 1, L.hair === 'bald' ? '8' : '6');
  drawEyes(r, L.eyes);
  r.px(16, 16, '8'); r.px(16, 17, '8');
  if (L.beard) { r.ell(16, 19, 6, 4, L.beard, (x, y) => y >= 17); if (L.extras.includes('beard-long')) r.ell(16, 23, 4, 4, L.beard); r.rect(15, 19, 3, 1, '6'); }
  else r.rect(15, 19, 3, 1, L.fem ? 'c' : '7');
  if (L.mustache) r.rect(13, 18, 7, 1, L.mustache);
  if (L.extras.includes('scar')) r.line(19, 11, 21, 17, 'p');
}
function headSkeleton(r, L) {
  r.ell(16, 13.5, 6.5, 7, '5');
  r.rect(21, 11, 1, 7, '4');
  r.rect(11, 12, 4, 3, '0'); r.rect(18, 12, 4, 3, '0');
  r.px(12, 13, 'h'); r.px(19, 13, 'h');
  r.rect(15, 16, 2, 2, '0');
  r.rect(12, 19, 9, 3, '4');
  for (let x = 12; x <= 20; x++) r.px(x, 19, x % 2 ? '5' : '0');
  r.rect(13, 22, 7, 2, '3');
}
function headAndroid(r, L) {
  hairBack(r, L.hair, L.hairColor);
  r.ell(16, 14.5, 6, 7.5, '4');
  r.rect(20, 10, 2, 11, '3');
  if (L.hair && L.hair !== 'bald' && L.hairColor) hairTop(r, L.hair, L.hairColor); else r.rect(10, 9, 13, 1, '3');
  r.rect(10, 12, 13, 4, '1'); r.rect(11, 13, 11, 2, L.visor ?? 'h');
  r.rect(13, 19, 7, 1, '2'); r.rect(13, 20, 7, 1, '3');
}
function headBeast(r, L) {
  const fur = L.fur ?? '7';
  r.ell(16, 15, L.big ? 8 : 7, 7.5, fur);
  r.line(10, 9, 8, 3, fur); r.line(11, 9, 9, 4, fur); r.px(9, 5, '8');
  r.line(22, 9, 24, 3, fur); r.line(21, 9, 23, 4, fur); r.px(23, 5, '8');
  r.rect(8, 13, 2, 7, '6'); r.rect(23, 13, 2, 7, '6');
  r.ell(16, 19, 4.5, 3, '8');
  r.rect(15, 16, 3, 2, '0');
  r.px(12, 13, 'a'); r.px(13, 13, '0'); r.px(19, 13, '0'); r.px(20, 13, 'a');
  r.rect(14, 21, 5, 1, '0'); r.px(14, 22, '5'); r.px(18, 22, '5');
  if (L.fem) { r.rect(22, 16, 2, 8, '8'); }
  if (L.extras.includes('scar')) r.line(11, 10, 14, 17, 'p');
}
function headPlant(r, L) {
  r.ell(16, 14.5, 6.5, 7.5, 'j');
  r.rect(21, 11, 1, 9, 'k');
  r.ell(11, 7, 3, 2, 'k'); r.ell(16, 5.5, 2.5, 3, 'j'); r.ell(21, 7, 3, 2, 'k'); r.px(16, 4, 'k');
  const fc = L.flower ?? 'a';
  r.ell(21, 5, 2, 2, fc); r.px(21, 5, 'b');
  if (L.fem) { r.ell(11, 6, 1.5, 1.5, fc); r.px(11, 6, 'b'); r.rect(8, 11, 2, 11, 'k'); r.rect(22, 11, 2, 11, 'k'); }
  r.rect(12, 13, 2, 2, '0'); r.rect(18, 13, 2, 2, '0'); r.px(12, 13, '5'); r.px(18, 13, '5');
  r.rect(14, 19, 4, 1, 'k');
  if (L.extras.includes('beard-long')) { r.line(13, 21, 12, 25, 'k'); r.line(16, 22, 16, 26, 'k'); r.line(19, 21, 20, 25, 'k'); }
}
function headTekhonok(r, L) {
  r.ell(16, 14, 8, 9, '7');
  r.px(11, 8, '8'); r.px(20, 9, '8'); r.px(10, 17, '8'); r.px(22, 15, '8');
  r.ell(16, 15, 5, 5.5, '9');
  r.rect(11, 17, 11, 5, '6'); r.px(13, 19, '8'); r.px(18, 20, '8');
  drawEyes(r, L.eyes ?? 'goggles');
  const n = L.antennas ?? 1;
  [[22, 6, 24, 0], [10, 6, 8, 1], [16, 5, 16, 0]].slice(0, n).forEach(([a, b, c, d]) => { r.line(a, b, c, d, '4'); r.px(c, d, 'a'); });
  if (L.beard) r.rect(12, 21, 9, 3, L.beard);
}
function headCringegon(r, L) {
  r.line(12, 7, 9, 2, 'o'); r.line(20, 7, 23, 2, 'o'); r.px(9, 1, 'n'); r.px(23, 1, 'n');
  r.ell(16, 13.5, 8, 8, 'n');
  r.rect(22, 9, 1, 9, 'o');
  r.ell(12.5, 14, 2.5, 3, '0'); r.ell(19.5, 14, 2.5, 3, '0'); r.px(12, 12, '5'); r.px(19, 12, '5');
  r.rect(15, 19, 3, 1, 'o');
}
function headSkrilet(r) {
  r.rect(15, 3, 2, 4, '2');
  r.ell(16, 14.5, 6.5, 7.5, '2');
  r.rect(20, 10, 2, 11, '1');
  r.rect(10, 12, 13, 3, 'c'); r.rect(10, 12, 13, 1, 'd');
  r.rect(13, 19, 7, 2, '1');
}
function headScreen(r, c) { // bodiless AI: monitor face
  const bgc = c === 'a' ? '6' : 'd';
  r.rect(8, 5, 17, 16, '2'); r.rect(8, 5, 17, 1, '3'); r.rect(9, 6, 15, 14, bgc);
  for (let y = 7; y < 20; y += 2) r.rect(9, y, 15, 1, '1');
  if (c === 'a') { r.ell(16, 12.5, 4, 4, 'a'); r.ell(16, 12.5, 2, 2, bgc); r.px(16, 12, 'b'); r.rect(12, 17, 9, 1, 'a'); }
  else { r.rect(11, 10, 4, 3, c); r.rect(18, 10, 4, 3, c); r.rect(12, 16, 9, 1, c); }
  r.rect(14, 21, 5, 3, '3');
}
function headHood(r, L) {
  r.ell(16, 14, 8.5, 10, L.hood);
  r.ell(16, 16, 5, 6, '0');
  if (L.mask) { r.ell(16, 15.5, 4.5, 5.5, '4'); r.rect(13, 14, 2, 1, 'h'); r.rect(18, 14, 2, 1, 'h'); r.line(17, 11, 19, 19, 'o'); r.rect(14, 19, 5, 1, '3'); }
  else if (L.screenFace) { r.rect(12, 12, 9, 7, 'i'); r.rect(13, 13, 7, 1, 'h'); r.rect(13, 15, 5, 1, 'h'); r.rect(13, 17, 6, 1, 'h'); }
  else if (L.hoodEyes) { r.px(13, 15, L.hoodEyes); r.px(19, 15, L.hoodEyes); if (L.threeEyes) r.px(16, 12, L.hoodEyes); }
  else { drawEyes(r, L.eyes, 15); }
}
function judge(r) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; r.line(16 + Math.cos(a) * 11, 15 + Math.sin(a) * 11, 16 + Math.cos(a) * 14, 15 + Math.sin(a) * 14, 'h'); }
  r.ell(16, 15, 10, 6, 'h'); r.ell(16, 15, 9, 5, '0'); r.ell(16, 15, 4, 4, 'h'); r.ell(16, 15, 2.5, 2.5, 'o'); r.px(16, 15, '0'); r.px(15, 14, '5');
  [10, 13, 16, 19, 22].forEach((x, i) => r.rect(x, 4 - (i % 2), 1, 4 + (i % 2), 'h'));
}

const RACE_HEADS = { human: headHuman, skeleton: headSkeleton, android: headAndroid, 'mutant-beast': headBeast, 'mutant-plant': headPlant, tekhonok: headTekhonok, cringegon: headCringegon, skrilet: headSkrilet };

export function portraitLook(npc) {
  const id = typeof npc === 'string' ? npc : npc.id;
  const base = typeof npc === 'string' ? NPCS[npc] ?? { id } : npc;
  const fl = FACTION_LOOK[base.faction] ?? FACTION_LOOK.none;
  const o = NPC_LOOK[id] ?? {};
  const h = strHash(id);
  const race = base.race ?? 'human';
  const humanoid = ['human', 'android', 'skeleton'].includes(race);
  const fem = o.fem ?? false;
  return {
    id, race, faction: base.faction ?? 'none',
    bg: o.bg ?? fl.bg, cloth: o.cloth ?? fl.cloth, accent: fl.accent,
    hat: 'hat' in o ? o.hat : humanoid ? fl.hat : null,
    hair: o.hair ?? (race !== 'human' && !o.hairColor ? 'bald' : fem ? 'long' : ['short', 'short', 'bald', 'long'][h % 4]),
    hairColor: o.hairColor ?? (race === 'human' ? ['6', '7', '8', '1', '4', 'm'][(h >>> 3) % 6] : null),
    beard: o.beard ?? (!fem && race === 'human' && (h >>> 7) % 3 === 0 ? ['6', '1', '4'][(h >>> 9) % 3] : null),
    mustache: o.mustache ?? null,
    eyes: o.eyes ?? null,
    extras: o.extras ?? [],
    ...o,
    fem, extras: o.extras ?? [],
  };
}

export function buildPortrait(npc) {
  const L = portraitLook(npc);
  const r = new Raster(P, P);
  r.rounded(L.bg);
  if (L.deity) { judge(r); return r.rows(); }
  // shoulders
  r.ell(16, 32, 13, 7.5, L.cloth);
  if (L.camo) { [[8, 28], [12, 26], [20, 27], [24, 29], [15, 30], [18, 25]].forEach(([x, y], i) => r.rect(x, y, 2, 1, i % 2 ? 'k' : 'm')); }
  r.rect(13, 21, 6, 4, L.race === 'human' ? '8' : L.race === 'skeleton' ? '3' : L.race === 'mutant-plant' ? 'k' : L.race === 'cringegon' ? 'o' : '2');
  r.ell(16, 26, 5, 2, L.accent, (x, y) => y >= 25);
  if (L.extras.includes('tie')) { r.rect(14, 24, 4, 2, '5'); r.rect(15, 25, 2, 6, 'c'); }
  if (L.extras.includes('chain')) { r.line(11, 25, 16, 29, 'a'); r.line(21, 25, 16, 29, 'a'); r.px(16, 30, 'b'); }
  if (L.hat === 'hood' || L.hood) r.ell(16, 14, 9, 10.5, L.hood ?? L.cloth); // hood back
  const head = RACE_HEADS[L.race];
  if (L.screen || L.race === 'ai') headScreen(r, L.screen ?? 'c');
  else if (L.hood && (L.mask || L.screenFace || L.hoodEyes !== undefined || !head)) headHood(r, L);
  else if (head) head(r, L);
  else headHood(r, { ...L, hood: L.cloth, hoodEyes: L.accent });
  if (L.hat === 'hood') { r.ell(16, 8.5, 8, 4, L.cloth, (x, y) => y <= 9); }
  if (L.hat && L.hat !== 'hood') drawHeadgear(r, L.hat, L);
  if (L.extras.includes('earpiece')) { r.px(9, 15, 'h'); r.line(9, 16, 11, 19, '1'); }
  return r.rows();
}

export function portraitSpriteId(npc) {
  const id = typeof npc === 'string' ? npc : npc.id;
  const sid = `portrait-${id}`;
  if (!SPRITES[sid]) SPRITES[sid] = { w: P, h: P, frames: [buildPortrait(npc)], outline: false, bob: null };
  return sid;
}

// npc: id from npcs.js (NPCS) or any object { id, race, faction } — unknown NPCs still get a portrait.
export function drawPortrait(ctx, npc, x, y, scale = 3, opts = {}) {
  blit(ctx, getEntry(portraitSpriteId(npc), 0, !!opts.flip, null, null), x, y, scale, opts.alpha ?? 1);
}

// ===========================================================================
// v2: world-map icons 16x16 — flat light symbol on a dark rounded tile (same as game/assets/icons)
// ===========================================================================
function icon(bg, fg, draw) {
  const r = new Raster(16, 16);
  if (bg) r.rounded(bg);
  draw(r, fg);
  return r.rows();
}
const MAP_ICONS = {
  // node kinds (locations.js `kind`)
  hub: icon('i', 'h', (r, c) => { r.rect(3, 11, 10, 2, c); r.ell(8, 9, 4, 4, c, (x, y) => y <= 9); r.rect(7, 3, 2, 3, c); r.px(6, 3, c); r.px(9, 3, c); r.rect(5, 13, 1, 1, c); r.rect(10, 13, 1, 1, c); r.rect(7, 8, 2, 2, 'i'); }),
  town: icon('2', '4', (r, c) => { r.rect(3, 7, 10, 6, c); [3, 6, 9, 12].forEach((x) => r.rect(x, 5, 1, 2, c)); r.rect(3, 4, 2, 3, c); r.rect(11, 4, 2, 3, c); r.rect(7, 9, 2, 4, '2'); }),
  camp: icon('6', 'e', (r, c) => { r.line(3, 13, 12, 10, '8'); r.line(3, 10, 12, 13, '8'); r.ell(8, 8, 3, 4.5, c); r.ell(8, 9, 1.5, 2.5, 'b'); }),
  wild: icon('k', 'j', (r, c) => { r.rect(7, 6, 2, 8, '6'); r.line(8, 8, 4, 4, '6'); r.line(8, 7, 12, 3, '6'); r.line(3, 13, 12, 13, c); [3, 5, 10, 12].forEach((x) => r.rect(x, 11, 1, 2, c)); }),
  dungeon: icon('1', '4', (r, c) => { r.ell(8, 7, 5.5, 4.5, c, (x, y) => y <= 7); r.rect(3, 7, 11, 7, c); r.ell(8, 7.5, 4, 3.5, '0', (x, y) => y <= 7); r.rect(4, 7, 8, 7, '0'); [[5, 9, 6], [6, 11, 4], [7, 13, 2]].forEach(([x, y, w]) => r.rect(x, y, w, 1, '3')); }),
  boss: icon('d', '5', (r, c) => { r.ell(8, 7, 4.5, 4.5, c); r.rect(5, 10, 6, 3, c); r.rect(5, 6, 2, 2, 'd'); r.rect(9, 6, 2, 2, 'd'); r.px(8, 9, 'd'); r.px(6, 12, 'd'); r.px(8, 12, 'd'); r.px(10, 12, 'd'); }),
  // terminals of Cyberspace: state ritual | dead | ours
  'terminal-ritual': icon('o', 'h', (r, c) => { r.rect(3, 3, 10, 8, c); r.rect(4, 4, 8, 6, '0'); r.ell(8, 7, 2.5, 1.5, 'c'); r.px(8, 7, '0'); r.rect(7, 11, 2, 2, c); r.rect(5, 13, 6, 1, c); }),
  'terminal-dead': icon('2', '3', (r, c) => { r.rect(3, 3, 10, 8, c); r.rect(4, 4, 8, 6, '1'); r.line(5, 4, 8, 7, '3'); r.line(8, 7, 7, 9, '3'); r.line(8, 7, 11, 6, '3'); r.rect(7, 11, 2, 2, c); r.rect(5, 13, 6, 1, c); }),
  'terminal-ours': icon('i', 'h', (r, c) => { r.rect(3, 3, 10, 8, c); r.rect(4, 4, 8, 6, '0'); r.line(5, 7, 7, 9, 'j'); r.line(7, 9, 10, 5, 'j'); r.rect(7, 11, 2, 2, c); r.rect(5, 13, 6, 1, c); }),
  beacon: icon('1', 'n', (r, c) => { r.line(8, 6, 5, 13, '4'); r.line(8, 6, 11, 13, '4'); r.rect(6, 10, 5, 1, '4'); r.ell(8, 4.5, 1.5, 1.5, c); r.line(4, 2, 3, 5, c); r.line(12, 2, 13, 5, c); }),
  trader: icon('6', 'a', (r, c) => { r.ell(8, 9.5, 4.5, 4, c); r.rect(6, 3, 4, 3, c); r.rect(7, 5, 2, 1, '6'); r.rect(7, 8, 2, 4, '6'); r.rect(6, 8, 4, 1, '6'); r.rect(6, 11, 4, 1, '6'); }),
  danger: icon('d', 'b', (r, c) => { for (let y = 3; y <= 12; y++) { const w = Math.floor((y - 3) * 0.6); r.rect(8 - w - 1, y, (w + 1) * 2, 1, c); } r.rect(7, 6, 2, 4, 'd'); r.rect(7, 11, 2, 1, 'd'); }),
  fog: icon('1', '3', (r, c) => { r.ell(6, 9, 3.5, 3, c); r.ell(10, 8, 4, 3.5, c); r.rect(3, 10, 11, 2, c); r.rect(7, 5, 3, 1, '4'); r.px(10, 6, '4'); r.rect(8, 7, 2, 1, '4'); r.px(8, 8, '4'); r.px(8, 10, '4'); }),
  // regions
  'region-harmony': icon('g', 'h', (r, c) => { r.ell(8, 11, 6, 2.5, c, (x, y) => y >= 10); r.rect(2, 10, 12, 1, c); r.rect(6, 4, 4, 6, c); r.rect(7, 2, 2, 2, c); r.px(7, 6, 'g'); r.px(8, 8, 'g'); r.line(5, 13, 4, 14, '4'); r.line(11, 13, 12, 14, '4'); }),
  'region-villages': icon('k', 'a', (r, c) => { r.line(3, 8, 8, 3, c); r.line(8, 3, 13, 8, c); r.line(4, 8, 8, 4, c); r.line(8, 4, 12, 8, c); r.rect(4, 8, 8, 5, '8'); r.rect(7, 10, 2, 3, '6'); r.rect(5, 9, 1, 1, 'b'); }),
  'region-agrozone': icon('6', 'b', (r, c) => { r.rect(7, 4, 2, 10, 'j'); [4, 6, 8, 10].forEach((y) => { r.rect(5, y, 2, 2, c); r.rect(9, y, 2, 2, c); }); r.rect(7, 2, 2, 2, c); }),
  'region-corruption': icon('1', 'n', (r, c) => { r.rect(2, 7, 3, 7, 'o'); r.rect(5, 3, 3, 11, c); r.rect(8, 5, 3, 9, 'o'); r.rect(11, 8, 3, 6, c); [[6, 5], [6, 8], [9, 7], [12, 10], [3, 9]].forEach(([x, y]) => r.px(x, y, 'a')); }),
  region: icon('2', '4', (r, c) => { r.rect(4, 3, 1, 11, c); r.rect(5, 3, 7, 5, c); r.rect(6, 4, 2, 1, '2'); }),
  // party marker: cyan pin with dark outline, no tile
  party: (() => { const r = new Raster(16, 16); r.ell(8, 6, 4.5, 4.5, 'h'); for (let y = 9; y <= 14; y++) { const w = Math.max(0, Math.floor((14 - y) * 0.7)); r.rect(8 - w, y, w * 2 || 1, 1, 'h'); } r.ell(8, 6, 2, 2, '5'); return r.rows(); })(),
};
const MAP_ALIASES = { burg: 'town', terminal: 'terminal-ritual', ritual: 'terminal-ritual', dead: 'terminal-dead', ours: 'terminal-ours',
  merchant: 'trader', unknown: 'fog', harmony: 'region-harmony', villages: 'region-villages', agrozone: 'region-agrozone', corruption: 'region-corruption' };

for (const [id, rows] of Object.entries(MAP_ICONS)) SPRITES[`map-${id}`] = { w: 16, h: 16, frames: [rows], outline: id === 'party', bob: null };
export const MAP_ICON_IDS = Object.keys(MAP_ICONS);

// id: node kind ('hub' | 'town'/'burg' | 'camp' | 'wild' | 'dungeon' | 'boss'), terminal state
// ('terminal-ritual' | 'terminal-dead' | 'terminal-ours', or just 'ritual' | 'dead' | 'ours'), 'beacon', 'trader', 'danger',
// 'fog', 'party', region ('region-harmony' | 'region-villages' | 'region-agrozone' | 'region-corruption' | regions.js id).
// Unknown region ids get the generic flag 'region'. x, y — top-left, size 16*scale.
export function drawMapIcon(ctx, id, x, y, scale = 3, opts = {}) {
  let key = String(id).replace(/^map-/, '');
  key = MAP_ALIASES[key] ?? key;
  if (!MAP_ICONS[key]) key = key.startsWith('region-') ? 'region' : 'fog';
  blit(ctx, getEntry(`map-${key}`, 0, false, null, opts.mono ?? null), x, y, scale, opts.alpha ?? 1);
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
