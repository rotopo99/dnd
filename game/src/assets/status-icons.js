// Pixel icons for statuses, surfaces, temp HP, cover, height and enemy intents (STYLE.md «Иконки интерфейса»).
// Glyph = 12x12 string map in palette keys ('.' = transparent, short rows are padded). Silhouette carries the meaning
// (colour-blind safe); colour only reinforces it. statusIcon(id) -> 16x16 canvas: glyph on a dark plate with a frame
// (buff = green frame, debuff = red frame, neutral/surface = glyph colour). { bare: true } -> 14x14 glyph with a black
// outline (for the small overhead pips). Ids: status id | 'surface:<id>' | 'tmp' | 'cover-half' | 'cover-full' |
// 'height' | 'intent:<melee|ranged|zone|heal|buff|flee|summon>'.
import { PALETTE, PALETTE_KEYS } from './sprites.js';
import { STATUSES } from '../data/effects.js';

const G = 12;
const SLASH = ['..........c.', '.........c..', '........c...', '.......c....', '......c.....', '.....c......', '....c.......', '...c........', '..c.........', '.c..........', 'c...........', '............'];
const SLASH_B = SLASH.map((r) => r.replace(/c/g, '0'));

const puddle = (c, d, extra = []) => [
  '............', '............', '............', '....dddd....', '..dddccccdd.', '.ddcccccccdd', '.dccccccccdd', '.ddcccccccd.', '..ddccccdd..', '...dddddd...', '............', '............',
].map((r, i) => (extra[i] ? extra[i] : r).replace(/c/g, c).replace(/d/g, d));
const cloud = (c, d) => [
  '............', '....cccc....', '...cccccc...', '.cccccccccc.', 'ccccccccccc.', 'ccccccccccd.'.replace(/\./g, '.'), 'cccccccccccd', '.ddddddddd..', '............', '............', '............', '............',
].map((r) => r.replace(/c/g, c).replace(/d/g, d));

const RAW = {
  // ---- statuses
  // Cyberspace spirit: bust in profile, lower half dissolves into falling pixels, two pink glitch slices (n), eye = dark pit + dot.
  spirit: ['....hhhh....', '...hhhhhh...', '..hhhhhhhh..', '..h05hhhhh..', '..hhhhhhhhh.', '...hhhhhh.nn', 'nn.hhhhhh...', '.hhhhhhhhhh.', '..h.hh.h.hh.', '...h..h...h.', '..h....h....', '............'],
  stun: ['.....bb.....', '.....bb.....', '....bbbb....', 'bbbbbbbbbbbb', '.bbbbbbbbbb.', '..bbbbbbbb..', '...bbbbbb...', '...bbbbbb...', '..bbbb.bbb..', '..bbb..bbb..', '.bbb....bbb.', '.bb......bb.'],
  bleed: ['.....cc.....', '....cccc....', '....cccc....', '...cccccc...', '..ccccccc...', '..cc5cccccc.', '.ccc5ccccccc'.slice(0, 12), '.cccccccccc.', '.ccc0000ccc.', '..cc0000cc..', '...cccccc...', '............'],
  poison: ['...jjjjjj...', '..jjjjjjjj..', '.jjjjjjjjjj.', '.jj00jj00jj.', '.jj00jj00jj.', '.jjjjjjjjjj.', '..jjjjjjjj..', '...jj00jj...', '...jjjjjj...', '...j.j.j.j..', '...j.j.j.j..', '............'],
  burn: ['.....e......', '.....ee.....', '....eee.e...', '...eeeeee...', '...eebbee.e.', '..eebbbbeee.', '..eebbbbbee.', '..eebbbbbee.', '..eebbbbbee.', '...eebbbee..', '....eeeee...', '............'],
  fear: ['...pppppp...', '..pppppppp..', '.pppppppppp.', '.pp00pp00pp.', '.pp00pp00pp.', '.pppppppppp.', '.ppp0000ppp.', '.ppp0000ppp.', '.pppppppppp.', '.pppppppppp.', '.pp.pppp.pp.', '............'],
  slow: ['.5555555555.', '..4aaaaaa4..', '...4aaaa4...', '....4aa4....', '.....44.....', '.....44.....', '....4aa4....', '...4aaaa4...', '..4aaaaaa4..', '.4aaaaaaaa4.', '.5555555555.', '............'],
  blind: ['............', '............', '....5555....', '..55555555..', '.5555005555.', '555500005555', '.5555005555.', '..55555555..', '....5555....', '............', '............', '............'],
  root: ['....jj......', '...jjjj.....', '....88......', '....88......', '....88......', '...8888.....', '..88.88.8...', '.88..88..88.', '8....88...8.', '.....88.....', '....8.8.....', '............'],
  silence: ['............', '.....55.....', '....555.....', '5555555.....', '5555555.....', '5555555.....', '5555555.....', '....555.....', '.....55.....', '............', '............', '............'],
  disarm: ['.........55.', '........555.', '.......555..', '......555...', '.....555....', '..8.555.....', '...855......', '....88......', '...8.88.....', '..88........', '............', '............'],
  curse: ['...oooooo...', '..oo....oo..', '.oo.nnnn.oo.', 'oo.nnnnnn.oo', 'o..nn00nn..o', 'o..nn00nn..o', 'oo.nnnnnn.oo', '.oo.nnnn.oo.', '..oo....oo..', '...oooooo...', '............', '............'],
  prone: ['............', '............', '............', '............', '.55.........', '5555........', '5555555555..', '.55555555555', '..5.5....5.5', '............', '............', '............'],
  invisible: ['....hhhh....', '...h....h...', '...h....h...', '...h....h...', '....hhhh....', '..h.h..h.h..', '.h........h.', '.h........h.', '.h........h.', '.hhhhhhhhhh.', '............', '............'],
  stealth: ['....mmmm....', '...mmmmmm...', '..mmmmmmmm..', '..mm0000mm..', '.mm0a00a0mm.', '.mm000000mm.', '.mmm0000mmm.', 'mmmmmmmmmmmm', 'mmmmmmmmmmmm', '.mmmmmmmmmm.', '............', '............'],
  cringed: ['...nnnnnn...', '..nnnnnnnn..', '.nnnnnnnnnnf', '.nn0nnnn0nnf', '.nn0nnnn0nff', '.nnnnnnnnnf.', '.nn0nn0nn0n.', '.nnn0nn0nnn.', '..nnnnnnnn..', '...nnnnnn...', '............', '............'],
  corrosion: ['....8888....', '.8..8778..8.', '..88877888..', '.8887..7888.', '8877....7788', '887..00..788', '8877....7788', '.8887..7888.', '..88877888..', '.8..8778..8.', '....8888....', '............'],
  hallucination: ['...hhhhhh...', '..hnnnnnnh..', '.hn......nh.', '.hn.hhhh.nh.', '.hn.hnnh.nh.', '.hn.h..h.nh.', '.hn.hh.h.nh.', '.hn....h.nh.', '..hn..hnh...', '...hhhhh....', '............', '............'],
  dazed: ['444444444444', '4333333333.4', '4333333333.4', '.4333300333.', '.43333003334', '..433003334.', '..4330033.4.', '...43003.4..', '....4300.4..', '.....430.4..', '......44....', '............'],
  regen: ['..jjj..jjj..', '.jjjjjjjjjj.', 'jjjjjjjjjjjj', 'jjjj5jjjjjjj', 'jjj555jjjjjj', 'jjjj5jjjjjjj', '.jjjjjjjjjj.', '..jjjjjjjj..', '...jjjjjj...', '....jjjj....', '.....jj.....', '............'],
  inspired: ['....bbbb....', '...bbbbbb...', '..bbb55bbb..', '..bb5bbbbb..', '..bbbbbbbb..', '...bbbbbb...', '....bbbb....', '....4444....', '....4444....', '.....44.....', '............', '............'],
  blessed: ['..aaaaaaaa..', '.a........a.', '..aaaaaaaa..', '............', '....9999....', '...999999...', '...999999...', '....9999....', '..aaaaaaaa..', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '............'],
  haste: ['.h..h.......', '.hh..hh.....', '..hh..hh....', '...hh..hh...', '....hh..hh..', '.....hh..hh.', '....hh..hh..', '...hh..hh...', '..hh..hh....', '.hh..hh.....', '.h..h.......', '............'],
  berserk: ['............', '.cc.cc.cc...', 'cccccccccc..', 'cccccccccc.c', 'cccccccccccc', 'cccccccccc.c', '.cccccccccc.', '..ccccccc...', '..cccccc....', '..dddddd....', '..dddddd....', '............'],
  taunt: ['.cccccccccc.', 'cccc5555cccc', 'cccc5555cccc', 'cccc5555cccc', 'cccccccccccc', 'ccccc55ccccc', 'ccccc55ccccc', '.cccccccccc.', '...cc.......', '..cc........', '.c..........', '............'],
  marked: ['.....cc.....', '..cccccccc..', '.cc..cc..cc.', '.c...cc...c.', 'cc........cc', 'cccc....cccc', 'cc........cc', '.c...cc...c.', '.cc..cc..cc.', '..cccccccc..', '.....cc.....', '............'],
  fortified: ['ffffffffffff', 'fhhhhffhhhhf', 'fhhhhffhhhhf', 'fhhhhffhhhhf', 'ffffffffffff', 'fhhhhffhhhhf', '.fhhhffhhhf.', '..fhhffhhf..', '...fhffhf...', '....ffff....', '.....ff.....', '............'],
  wet: ['.....ff.....', '....ffff....', '....ffff....', '...ffffff...', '..fffffff...', '..fh5ffffff.', '.ffh5fffffff'.slice(0, 12), '.ffffffffff.', '..ffffffff..', '...ffffff...', '.hh..hh..hh.', '..hh..hh..hh'.slice(0, 12)],
  oiled: ['..8888......', '..8..8888...', '..8..8..8.8.', '.88888888888'.slice(0, 12), '.8888888888.', '.8888558888.', '.8888558888.', '.8888888888.', '.8888888888.', '.7777777777.', '..66666666..', '............'],
  shocked: ['......hhhh..', '.....hhhh...', '....hhhh....', '...hhhh.....', '..hhhhhhhh..', '.hhhhhhhh...', '......hhh...', '.....hhh....', '.....hh.....', '....hh......', '....h.......', '............'],
  chilled: ['.....hh.....', '..h..hh..h..', '...h.hh.h...', '....hhhh....', 'hhhhhhhhhhhh', 'hhhhhhhhhhhh', '....hhhh....', '...h.hh.h...', '..h..hh..h..', '.....hh.....', '............', '............'],
  frozen: ['....5555....', '...555hh5...', '..5555hhh5..', '.55555hhhh5.', '5hhhhhhhhhh5', '5hhhhhhhh555', '.5hhhhhh55..', '..5hhhh55...', '...5hh55....', '....5555....', '............', '............'],
  acid: ['....4444....', '.....44.....', '.....44.....', '....4jj4....', '...4jjjj4...', '..4jj5jjj4..', '.4jjjj5jjj4.', '.4jjjjjjjj4.', '.4jjjjjjjj4.', '..44444444..', '............', '............'],
  irradiated: ['....bbbb....', '..bbbbbbbb..', '.bbbb00bbbb.', '.bbb0000bbb.', 'bbbb0bb0bbbb', 'bbb0bbbb0bbb', 'bbbbbbbbbbbb', '.bbbb00bbbb.', '.bbbb00bbbb.', '..bbbbbbbb..', '....bbbb....', '............'],
  panic: ['...nnnnnn...', '..nnnnnnnn..', '.nnnnnnnnnn.', '.nn5nnnn5nn.', '.nn0nnnn0nn.', '.nnnnnnnnnn.', '.nnn0000nnn.', '.nnn0000nnn.', '..nn0000nn..', '...nnnnnn...', '.n........n.', '............'],
  glitch: ['hhhh........', 'hhhhnnnn....', '....nnnn....', '....nnnnhhhh', '........hhhh', 'hhhh........', 'hhhhnnnn....', '....nnnn....', '....nnnnhhhh', '........hhhh', 'hhhh........', '............'],
  overload: ['.....aa.....', '.a...aa...a.', '..a.aaaa.a..', '...aaaaaa...', '.aaaabbaaaa.', 'aaaabbbbaaaa', '.aaaabbaaaa.', '...aaaaaa...', '..a.aaaa.a..', '.a...aa...a.', '.....aa.....', '............'],
  choking: ['....pppp....', '....pppp....', '....pppp....', '..ppp..ppp..', '.pppp..pppp.', 'ppppp..ppppp', 'ppppp..ppppp', 'ppppp..ppppp', '.ppppp.pppp.', '..pppp..ppp.', '............', '............'],
  scent: ['..c...c...c.', '.c...c...c..', '..c...c...c.', '.c...c...c..', '..c...c...c.', '............', '....cccc....', '...cccccc...', '...cccccc...', '....cccc....', '............', '............'],
  slick: ['............', '....88......', '...bbbb.....', '..bbbbbb....', '..bbbbbb....', '...bbbb.....', '.bb.bb.bb...', 'bbb.bb.bbb..', 'bb..bb..bb..', 'b...bb...b..', '............', '............'],
  // ---- surfaces
  'surface:fire': null, // = burn
  'surface:electric': null, // = shocked
  'surface:water': ['............', '............', '..ffff..ffff', '.fhhhfffhhhf', 'ffffffffffff', '.ffhhffffff.', '..ffffhhff..', '............', '.hh..hh..hh.', '..hh..hh..hh', '............', '............'],
  'surface:oil': puddle('6', '0').map((r) => r.replace(/6/g, '8').replace(/0/g, '6')),
  'surface:acid': puddle('j', 'k', [null, null, null, null, '..kkjjjjkk..', '.kkj5jjjjkk.', '.kjjjj5jjjkk', '.kkjjjjj5jk.', null]),
  'surface:toxgas': cloud('j', 'k'),
  'surface:ice': null, // = frozen
  'surface:blood': puddle('c', 'd'),
  'surface:cringe': puddle('n', 'o', [null, null, null, null, '..oonnnnoo..', '.on0nnnn0no.', '.onnnnnnnno.', '.onn0000nno.', '..oonnnnoo..']),
  'surface:proxy': ['.....aa.....', '....aaaa....', '...aa00aa...', '..aa0aa0aa..', '.aaa0aa0aaa.', 'aaaa0aa0aaaa', '.aaa0aa0aaa.', '..aaa00aaa..', '...aaaaaa...', '....aaaa....', '.....aa.....', '............'],
  'surface:smoke': cloud('4', '3'),
  'surface:steam': cloud('5', '4').map((r, i) => (i === 8 ? '.4..4..4..4.' : i === 9 ? '..4..4..4..4' : r)),
  // ---- other
  tmp: ['............', '.hhhh..hhhh.', 'hh..hhhh..hh', 'h....hh....h', 'h.........hh', 'h.........h.', '.h.......h..', '..h.....h...', '...h...h....', '....h.h.....', '.....h......', '............'],
  'cover-half': ['............', '............', '............', 'mmmmmmmmmmmm', 'm4444444444m', 'm4444444444m', 'mmmmmmmmmmmm', '.mmmmmmmmmm.', '............', '............', '............', '............'],
  'cover-full': ['mmmmmmmmmmmm', 'm4444444444m', 'm4444444444m', 'mmmmmmmmmmmm', 'm4444444444m', 'm4444444444m', 'mmmmmmmmmmmm', 'm4444444444m', 'm4444444444m', 'mmmmmmmmmmmm', '............', '............'],
  height: ['........bb..', '........bb..', '......bbbb..', '......bbbb..', '....bbbbbb..', '....bbbbbb..', '..bbbbbbbb..', '..bbbbbbbb..', 'bbbbbbbbbb..', 'bbbbbbbbbb..', '............', '............'],
  'intent:melee': ['..........55', '.........555', '........555.', '.......555..', '..8..555....', '...8555.....', '....88......', '...8.88.....', '..88........', '............', '............', '............'],
  'intent:ranged': ['.....cc.....', '.....cc.....', '..cccccccc..', '.cc..cc..cc.', '.c...cc...c.', 'cccc.cc.cccc', '.c...cc...c.', '.cc..cc..cc.', '..cccccccc..', '.....cc.....', '.....cc.....', '............'],
  'intent:zone': ['.....nn.....', '..n..nn..n..', '...n.nn.n...', '.....nn.....', 'nnnn.nn.nnnn', 'nnnn.nn.nnnn', '.....nn.....', '...n.nn.n...', '..n..nn..n..', '.....nn.....', '............', '............'],
  'intent:heal': ['....jjjj....', '....jjjj....', '....jjjj....', 'jjjjjjjjjjjj', 'jjjjjjjjjjjj', 'jjjjjjjjjjjj', '....jjjj....', '....jjjj....', '....jjjj....', '............', '............', '............'],
  'intent:buff': ['.....jj.....', '....jjjj....', '...jjjjjj...', '..jjjjjjjj..', '.jjjjjjjjjj.', '....jjjj....', '....jjjj....', '....jjjj....', '....jjjj....', '............', '............', '............'],
  'intent:flee': ['....5.......', '...55.......', '..555.......', '.55555555555', '..555.....55', '...55.....55', '....5.....55', '..........55', '..........55', '.....55555..'.slice(0, 12), '............', '............'],
  'intent:summon': ['....ffff....', '..ff....ff..', '.f..f55f..f.', 'f...f55f...f', 'f.ff5555ff.f', 'f...f55f...f', '.f..f55f..f.', '..ff....ff..', '....ffff....', '............', '............', '............'],
};
RAW['surface:fire'] = RAW.burn;
RAW['surface:electric'] = RAW.shocked;
RAW['surface:ice'] = RAW.frozen;

// Slash overlays: «blocked» versions of base glyphs.
const SLASHED = new Set(['blind', 'silence', 'disarm']);

const rows = (id) => {
  const base = RAW[id];
  if (!base) return null;
  const out = base.map((r) => (r + '.'.repeat(G)).slice(0, G));
  while (out.length < G) out.push('.'.repeat(G));
  if (SLASHED.has(id)) {
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (SLASH[y][x] === 'c') {
        out[y] = out[y].slice(0, x) + 'c' + out[y].slice(x + 1);
      }
    }
  }
  return out;
};

export const ICON_IDS = Object.keys(RAW);
/** Kinds of statuses are looked up lazily from data to colour the frame. */
const kindOf = (id) => STATUSES[id]?.kind;

const cache = new Map();
const hexOf = (k) => PALETTE[PALETTE_KEYS.indexOf(k)] || PALETTE[0];

function mk(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

function frameColor(id) {
  if (id.startsWith('surface:')) return null;
  const k = kindOf(id);
  return k === 'buff' ? 'j' : k === 'debuff' ? 'c' : '4';
}

/** Icon canvas (cached). { bare: true } — 14x14 with a black outline, no plate. */
export function statusIcon(id, { bare = false } = {}) {
  const key = `${id}|${bare ? 'b' : 't'}`;
  if (cache.has(key)) return cache.get(key);
  let map = rows(id);
  if (!map) map = rows('intent:melee') && Array(G).fill('.'.repeat(G)); // unknown id: empty
  const known = !!RAW[id];
  const size = bare ? G + 2 : 16;
  const cv = mk(size, size);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const off = bare ? 1 : 2;
  if (!bare) {
    const fk = frameColor(id) || (known ? firstColor(map) : '4');
    ctx.fillStyle = hexOf('1'); ctx.fillRect(1, 0, 14, 16); ctx.fillRect(0, 1, 16, 14);
    ctx.fillStyle = hexOf(fk);
    ctx.fillRect(2, 0, 12, 1); ctx.fillRect(2, 15, 12, 1); ctx.fillRect(0, 2, 1, 12); ctx.fillRect(15, 2, 1, 12);
    ctx.fillRect(1, 1, 1, 1); ctx.fillRect(14, 1, 1, 1); ctx.fillRect(1, 14, 1, 1); ctx.fillRect(14, 14, 1, 1);
  } else {
    // outline
    ctx.fillStyle = hexOf('0');
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (map[y][x] === '.') continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) ctx.fillRect(x + off + dx, y + off + dy, 1, 1);
    }
  }
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const ch = map[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = hexOf(ch);
    ctx.fillRect(x + off, y + off, 1, 1);
  }
  cache.set(key, cv);
  return cv;
}

function firstColor(map) {
  for (const r of map) for (const ch of r) if (ch !== '.' && ch !== '0' && ch !== '1') return ch;
  return '4';
}

/** Draw an icon at integer pixel size (nearest neighbour). */
export function drawStatusIcon(ctx, id, x, y, size = 16, opts) {
  const cv = statusIcon(id, opts);
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, Math.round(x), Math.round(y), size, size);
  ctx.imageSmoothingEnabled = was;
}

/** Validation for tests: every glyph is ≤ 12x12 and uses palette keys only. */
export function validateStatusIcons() {
  const bad = [];
  for (const [id, m] of Object.entries(RAW)) {
    if (!m || m.length > G) { bad.push(`${id}: rows`); continue; }
    for (const r of m) {
      if (r.length > G) bad.push(`${id}: row too long (${r.length})`);
      for (const ch of r) if (ch !== '.' && !PALETTE_KEYS.includes(ch)) bad.push(`${id}: bad key ${ch}`);
    }
  }
  return bad;
}
