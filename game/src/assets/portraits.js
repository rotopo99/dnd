// Portraits v2 — 48x48 bust (head + shoulders), layered, generated procedurally from palette keys.
// Owner: art-director. Rules: docs/STYLE.md ("Портреты").
//
// Public API (re-exported by sprites.js):
//   drawPortrait(ctx, npc, x, y, scale = 3, opts)      npc: id from npcs.js or { id, race, faction }
//        old callers keep working: the box is 32*scale px (as v1). opts.native = true -> 48*scale px (crisp).
//   drawHeroPortrait(ctx, build, x, y, scale, opts)    build: { race, cls, look, name?, sex?:'f'|'m', style?, id? }
//   portraitLook(npc), buildPortrait(npc, opts) -> 48 strings, portraitCanvas(npc, opts)
// opts: emotion 'neutral'|'happy'|'angry'|'sad'|'scared'|'smug'|'surprised'|'cringe'; hp 0..1; mrl 0..1;
//       accessories ['glasses', '-cig' (minus = remove)]; frame (anim tick ~150 ms; default = clock);
//       blink:false (no blinking, for stills); flip; alpha.
import { PALETTE } from './sprites.js';
import { NPCS } from '../data/npcs.js';

export const PORTRAIT_SIZE = 48;
export const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'scared', 'smug', 'surprised', 'cringe'];
const N = 48;

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
const DARK = { 9: '8', 8: '7', 7: '6', 6: '1', p: '4', m: 'l', l: 'k', k: '1', 5: '4', 4: '3', 3: '2', 2: '1', 1: '0', j: 'k', n: 'o', o: '1', c: 'd', d: '0', a: '8', b: 'a', h: 'i', f: 'g', g: '1', i: '0', e: 'c', 0: '0' };
const LIGHT = { 6: '7', 7: '8', 8: '9', 9: 'p', 1: '2', 2: '3', 3: '4', 4: '5', m: '9', l: 'm', k: 'j', o: 'n', d: 'c', g: 'f', i: 'h', a: 'b', c: 'e' };
const sh = (c) => DARK[c] ?? c;
const li = (c) => LIGHT[c] ?? c;
const strHash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hv = (h, k) => { let x = (h ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x ^= x >>> 13; return x >>> 0; };
const pick = (h, k, arr) => arr[hv(h, k) % arr.length];
const chance = (h, k, p) => (hv(h, k) % 1000) < p * 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Raster {
  constructor() { this.g = Array.from({ length: N }, () => new Array(N).fill('.')); }
  px(x, y, c) { if (!c) return; x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) this.g[y][x] = c; }
  get(x, y) { return this.g[y]?.[x] ?? '.'; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  ell(cx, cy, rx, ry, c, pred) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx; const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!pred || pred(x, y))) this.px(x, y, c);
      }
    }
  }
  line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c); }
  tri(a, b, c, col) {
    const minX = Math.floor(Math.min(a[0], b[0], c[0])); const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1])); const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const e = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const d1 = e(a, b, x + 0.5, y + 0.5); const d2 = e(b, c, x + 0.5, y + 0.5); const d3 = e(c, a, x + 0.5, y + 0.5);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.px(x, y, col);
    }
  }
  // recolour `from` -> `to` where pred(x, y)
  swap(from, to, pred) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.g[y][x] === from && (!pred || pred(x, y))) this.g[y][x] = to; }
  // light from top-left: darken the right edge and the underside of a colour area
  rim(base, shade, w = 1, bottom = true) {
    for (let y = 0; y < N; y++) { let mx = -1; for (let x = 0; x < N; x++) if (this.g[y][x] === base) mx = x; for (let i = 0; i < w && mx - i >= 0; i++) if (this.g[y][mx - i] === base) this.g[y][mx - i] = shade; }
    if (bottom) for (let x = 0; x < N; x++) { let my = -1; for (let y = 0; y < N; y++) if (this.g[y][x] === base) my = y; if (my >= 0) this.g[my][x] = shade; }
  }
  rounded(c) { this.rect(0, 0, N, N, c); [4, 2, 1, 1].forEach((n, y) => { for (let x = 0; x < n; x++) { this.px(x, y, '.'); this.px(N - 1 - x, y, '.'); this.px(x, N - 1 - y, '.'); this.px(N - 1 - x, N - 1 - y, '.'); } }); }
}
const top = (y) => (x, yy) => yy <= y;

// ---------------------------------------------------------------------------
// data: factions, skin, emotions
// ---------------------------------------------------------------------------
const FACTION_LOOK = {
  technikums: { bg: 'i', cloth: 'l', accent: 'h', acc: ['goggles-up'], style: 'collar' },
  aiParty: { bg: 'd', cloth: '2', accent: 'c', acc: ['officer'], style: 'suit' },
  warprom: { bg: '2', cloth: 'l', accent: 'k', acc: ['helmet', 'medals'], style: 'armor' },
  tinBrotherhood: { bg: 'g', cloth: '3', accent: '4', acc: ['kabuto'], style: 'armor' },
  pirates: { bg: 'g', cloth: 'g', accent: 'a', acc: ['bandana'], style: 'sailor' },
  scavengers: { bg: '6', cloth: '7', accent: '8', acc: ['respirator'], style: 'poncho' },
  renegades: { bg: 'k', cloth: 'm', accent: 'c', acc: ['scarf', 'vosmiklinka'], style: 'vatnik' },
  mechanids: { bg: 'i', cloth: '3', accent: 'h', acc: ['antenna'], style: 'plain' },
  cringegons: { bg: 'o', cloth: 'o', accent: 'n', acc: [], style: 'robe' },
  tekhonki: { bg: '6', cloth: '7', accent: 'a', acc: [], style: 'poncho' },
  neutralVillages: { bg: 'k', cloth: 'm', accent: '8', acc: ['ushanka'], style: 'vatnik' },
  agrozone: { bg: 'k', cloth: 'l', accent: 'j', acc: ['headset', 'headlamp'], style: 'vatnik' },
  mutantsPlant: { bg: 'k', cloth: 'k', accent: 'j', acc: [], style: 'plain' },
  mutantsBeast: { bg: 'd', cloth: '6', accent: '8', acc: [], style: 'poncho' },
  cult: { bg: 'o', cloth: 'o', accent: 'h', acc: ['hood'], style: 'robe' },
  predlozhka: { bg: 'g', cloth: 'g', accent: 'h', acc: ['hood'], style: 'robe' },
  none: { bg: '2', cloth: '3', accent: '4', acc: [], style: 'plain' },
};
const SKINS = [{ b: '9', s: '8' }, { b: 'p', s: '4' }, { b: '8', s: '7' }, { b: '7', s: '6' }, { b: '6', s: '1' }, { b: 'm', s: 'l' }];
const SKIN_W = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5]; // index table for hash picks (fair skin more common)
const EYE_COLORS = ['6', 'f', 'j', '4', '8', 'h'];
const HAIR_COLORS = ['1', '6', '7', '8', '1', '6', 'a', '4'];
const HAIR_M = ['short', 'buzz', 'sidepart', 'spiky', 'curly', 'bald', 'short', 'afro', 'topknot', 'mohawk', 'sidepart'];
const HAIR_F = ['long', 'bob', 'ponytail', 'bun', 'curly', 'sidepart', 'long', 'short', 'bob'];

// h: eye openness (0 closed, 'arc' = happy ^ ^), lift/liftR: brow raise, ang/angR: inner end down(+)/up(-)
const EMO = {
  neutral: { h: 2, lift: 0, ang: 0, m: 'flat', dx: 0, dy: 0, tilt: 0 },
  happy: { h: 'arc', lift: 1, ang: 0, m: 'grin', blush: 'c', tilt: -1, dy: 0 },
  angry: { h: 2, lift: -1, ang: 2, m: 'snarl', dy: 1, tilt: 0, dx: 0 },
  sad: { h: 2, lift: 0, ang: -2, m: 'frown', tear: 1, dy: 1, tilt: 1, gaze: 0, down: 1 },
  scared: { h: 3, lift: 2, ang: -1, m: 'gasp', small: 1, sweat: 1, dx: -1, tilt: 0 },
  smug: { h: 1, lift: 0, liftR: 2, ang: 0, m: 'smirk', tilt: -1, gaze: 1, dy: 0 },
  surprised: { h: 3, lift: 3, ang: 0, m: 'o', small: 1, dy: -1, tilt: 0 },
  cringe: { h: 1, lift: 0, ang: -1, angR: 1, m: 'wave', blush: 'n', tilt: 1, squint: 1 },
};

// ---------------------------------------------------------------------------
// key NPCs (hand-tuned). fields: skin(0-5) face hair hc eyeC eyeShape thick nose age fem beard{style,c} scars[] tattoo implant
// acc[] (replaces faction headgear; [] = none) emo cloth bg style fur bark flower antennas visor screen hood hoodEyes mask
// ---------------------------------------------------------------------------
const B = (style, c) => ({ style, c });
const NPC_LOOK = {
  'victor-sundown': { age: 2, hair: 'short', hc: '6', beard: B('mustache', '6'), acc: ['guardcap'], emo: 'neutral', face: 'square' },
  nikola: { age: 2, skin: 1, hair: 'sidepart', hc: '7', beard: B('full', '7'), acc: ['goggles-up'], implant: 'jaw', emo: 'smug' },
  gans: { age: 1, face: 'square', hair: 'buzz', hc: '6', beard: B('stubble', '6'), acc: ['helmet-camo'], scars: ['cheek'], emo: 'angry' },
  sera: { fem: true, skin: 1, hair: 'ponytail', hc: '8', acc: ['goggles-up', 'headset'], eyeC: 'j', emo: 'smug' },
  paracetamol: { cloth: '5', acc: ['medband', 'plaster'], emo: 'happy' },
  amanda: { fem: true, age: 1, face: 'square', hair: 'bob', hc: '1', acc: ['headset'], scars: ['brow'], emo: 'neutral' },
  aynura: { hair: 'long', hc: 'h', visor: 'h', emo: 'sad', implant: 'port' },
  seer: { age: 3, skin: 5, face: 'long', hair: 'long', hc: '4', beard: B('long', '4'), acc: ['hood', 'cybereye'], cloth: 'm', eyeC: 'h', thick: 2, emo: 'smug', tattoo: 'tear' },
  lox: { age: 2, face: 'square', hair: 'short', hc: '1', cloth: '1', bg: 'd', style: 'suit', acc: ['earpiece', 'tie', 'shades'], scars: ['brow', 'cheek'], emo: 'neutral', beard: B('stubble', '1') },
  alik: { age: 1, hair: 'sidepart', hc: '1', beard: B('mustache', '1'), acc: ['shades', 'chain', 'cig'], cloth: 'g', style: 'track', emo: 'smug', skin: 2 },
  andrey: { age: 1, hair: 'short', hc: '7', beard: B('full', '6'), acc: ['goggles-up'], implant: 'temple', emo: 'neutral' },
  dymka: { acc: ['hood'], cloth: '1', visor: 'h', emo: 'smug' },
  telifon: { acc: ['headset'], visor: 'h', emo: 'neutral' },
  'putin-mark-2': { screen: 'c', emo: 'neutral' },
  'general-ai': { screen: 'c', emo: 'angry' },
  'private-nedolyot': { age: 0, hair: 'buzz', hc: '8', acc: ['helmet', 'medals'], emo: 'scared', thick: 1 },
  khan: { age: 3, face: 'square', hair: 'topknot', hc: '4', beard: B('long', '4'), acc: ['kabuto'], scars: ['brow'], emo: 'neutral', skin: 2 },
  ken: { age: 1, hair: 'topknot', hc: '1', acc: ['headband'], emo: 'smug', skin: 2 },
  sekiro: { acc: ['kabuto', 'scar-seam'], emo: 'neutral' },
  burevestnik: { age: 2, skin: 3, face: 'long', hair: 'long', hc: '1', beard: B('goatee', '1'), acc: ['tricorn', 'patch', 'earring', 'feather'], emo: 'smug', scars: ['cheek'] },
  'cyber-lovkach': { age: 0, skin: 1, hair: 'mohawk', hc: 'h', acc: ['shades', 'earbuds'], implant: 'temple', emo: 'smug' },
  'madam-stavka': { fem: true, age: 2, skin: 2, hair: 'long', hc: '1', acc: ['chain', 'earring', 'cig'], cloth: 'o', emo: 'smug', tattoo: 'tear' },
  'glava-musora': { age: 3, face: 'round', skin: 3, hair: 'bald', beard: B('full', '7'), acc: ['junkcrown', 'respirator-down'], scars: ['cheek', 'brow'], emo: 'angry', thick: 2 },
  sborshchik: { age: 1, acc: ['gp5', 'headlamp'], style: 'vatnik', hair: 'buzz', hc: '6', emo: 'neutral' },
  zver: { big: true, fur: '7', acc: [], scars: ['cheek'], emo: 'angry' },
  'zoya-klyk': { fem: true, fur: '8', acc: ['earring'], emo: 'smug' },
  'mutant-shaman': { bark: '7', flower: 'n', acc: [], emo: 'neutral', age: 3 },
  'aunt-loza': { fem: true, bark: '8', flower: 'a', acc: [], emo: 'happy' },
  'cringe-chief': { acc: ['crown'], emo: 'angry' },
  'cringe-jester': { acc: ['jester'], emo: 'happy' },
  'great-collector': { hood: 'o', hoodEyes: 'n', threeEyes: true, emo: 'smug' },
  diss: { acc: ['cap', 'chain', 'earbuds'], emo: 'smug' },
  'old-god': { screen: 'a', emo: 'neutral' },
  ankort: { age: 1, acc: ['goggles-h'], emo: 'smug' },
  aztun: { antennas: 3, age: 3, beard: B('long', '5'), acc: ['goggles'], emo: 'neutral' },
  rzhaven: { cloth: '8', acc: ['goggles'], age: 0, emo: 'happy' },
  tik: { acc: ['antenna'], visor: 'j', emo: 'surprised' },
  'shepherd-timokha': { style: 'vatnik', age: 2, skin: 2, hair: 'curly', hc: 'm', beard: B('full', 'm'), acc: ['ushanka', 'pipe'], emo: 'happy' },
  zarya: { fem: true, age: 1, skin: 1, hair: 'short', hc: '8', cloth: '5', acc: ['headset', 'scar-seam'], scars: ['cheek'], emo: 'sad' },
  marta: { fem: true, age: 1, skin: 2, hair: 'long', hc: '7', acc: ['scarf', 'headband'], scarf: 'c', scars: ['brow'], emo: 'angry' },
  'kuksius-first': { acc: ['scarf', 'crown'], scarf: '7', emo: 'smug' },
  yarosh: { age: 1, acc: ['scarf', 'hood'], scarf: 'l', cloth: 'l', hood: 'l', emo: 'neutral', beard: B('stubble', '1') },
  judge: { deity: true, emo: 'neutral' },
  'cyber-priest': { hood: '1', mask: true, emo: 'neutral' },
  'sister-pomekha': { fem: true, age: 1, hair: 'short', hc: '5', eyeC: 'h', acc: ['cybereye', 'scar-seam'], cloth: 'o', scars: ['brow'], emo: 'sad' },
  'predlozhka-1': { hood: 'g', screenFace: true, emo: 'neutral' },
  'keeper-of-history': { age: 3, skin: 1, face: 'long', hair: 'bald', hc: '5', beard: B('long', '5'), acc: ['glasses', 'hood'], emo: 'neutral' },
  vazgen: { age: 2, skin: 2, face: 'round', hair: 'bald', beard: B('full', '1'), acc: ['goggles-up', 'cig'], emo: 'smug' },
  galina: { style: 'vatnik', fem: true, age: 3, skin: 1, hair: 'bun', hc: '4', acc: ['kerchief', 'glasses'], cloth: 'm', emo: 'happy', thick: 1 },
  'scriptlet-zero': { emo: 'cringe' },
  'sk-bufer': { emo: 'neutral' },
  'pl-kvorum': { emo: 'smug' },
};

// ---------------------------------------------------------------------------
// look resolution
// ---------------------------------------------------------------------------
const RACE_KIND = { human: 'human', skeleton: 'skeleton', android: 'android', 'mutant-beast': 'beast', 'mutant-plant': 'plant', tekhonok: 'tekhonok', cringegon: 'cringegon', skrilet: 'skrilet', ai: 'screen', deity: 'deity', unknown: 'hood', 'cyber-spirit': 'spirit' };
const MECH = new Set(['skeleton', 'android', 'skrilet', 'screen', 'spirit']);

export function portraitLook(npc, overrides = null) {
  const id = typeof npc === 'string' ? npc : npc.id;
  const base = typeof npc === 'string' ? NPCS[npc] ?? { id } : npc;
  const race = base.race ?? 'human';
  const kind = RACE_KIND[race] ?? 'human';
  const fl = FACTION_LOOK[base.faction] ?? FACTION_LOOK.none;
  const o = { ...(NPC_LOOK[id] ?? {}), ...(overrides ?? {}) };
  const h = strHash(id);
  const fem = o.fem ?? false;
  const skin = SKINS[o.skin ?? SKIN_W[hv(h, 1) % SKIN_W.length]];
  const age = o.age ?? [0, 1, 1, 2, 2, 3][hv(h, 2) % 6];
  const humanoid = ['human', 'android', 'skeleton'].includes(kind);
  let hc = o.hc ?? pick(h, 3, HAIR_COLORS);
  if (age === 3 && !o.hc) hc = pick(h, 4, ['4', '5', '4']);
  if (hc === skin.b) hc = '1';
  let hair = o.hair ?? (kind === 'human' ? pick(h, 5, fem ? HAIR_F : HAIR_M) : 'bald');
  if (age === 3 && !o.hair && hair === 'mohawk') hair = 'short';
  const beardC = (age === 3 ? '4' : hc);
  const beard = 'beard' in o ? o.beard : (kind === 'human' && !fem && chance(h, 6, 0.42) ? B(pick(h, 7, ['stubble', 'stubble', 'mustache', 'goatee', 'full']), beardC) : null);
  const scars = o.scars ?? (chance(h, 8, 0.22) ? [pick(h, 9, ['cheek', 'brow', 'lip'])] : []);
  const tattoo = o.tattoo ?? (chance(h, 10, 0.1) ? pick(h, 11, ['tribal', 'tear', 'circuit', 'brand']) : null);
  const implant = o.implant ?? (chance(h, 12, 0.08) ? pick(h, 13, ['temple', 'jaw', 'port']) : null);
  let acc = o.acc ? [...o.acc] : [...(humanoid ? fl.acc : [])];
  if (!o.acc && humanoid && kind === 'human') {
    if (chance(h, 14, 0.16)) acc.push(pick(h, 15, ['glasses', 'glasses', 'shades']));
    if (chance(h, 16, 0.09)) acc.push('cig');
    if (chance(h, 17, 0.07)) acc.push('earring');
    if (chance(h, 18, 0.05)) acc.push('plaster');
  }
  const L = {
    id, race, kind, faction: base.faction ?? 'none', h,
    bg: o.bg ?? fl.bg, cloth: o.cloth ?? fl.cloth, accent: fl.accent, style: o.style ?? fl.style,
    skin, face: o.face ?? pick(h, 19, ['oval', 'round', 'square', 'long', 'oval']),
    hair, hc, eyeC: o.eyeC ?? pick(h, 20, EYE_COLORS), eyeShape: o.eyeShape ?? pick(h, 21, ['round', 'narrow', 'wide', 'round']),
    thick: o.thick ?? 1 + (hv(h, 22) % 2), nose: o.nose ?? pick(h, 23, ['small', 'long', 'wide', 'button']),
    age, fem, beard, scars, tattoo, implant, acc,
    fur: o.fur ?? pick(h, 24, ['7', '8', '6', '4', 'm']), bark: o.bark ?? pick(h, 25, ['7', '8', '6']), flower: o.flower ?? pick(h, 26, ['n', 'a', 'f', 'c']),
    antennas: o.antennas ?? 1, visor: o.visor ?? pick(h, 27, ['h', 'h', 'c', 'j']), screen: o.screen ?? (kind === 'screen' ? 'c' : null),
    hood: o.hood ?? null, hoodEyes: o.hoodEyes, mask: !!o.mask, screenFace: !!o.screenFace, threeEyes: !!o.threeEyes, deity: !!o.deity || kind === 'deity',
    big: !!o.big, scarf: o.scarf ?? 'm', emo: o.emo ?? 'neutral', camo: acc.includes('helmet-camo'),
    hatC: o.hatC ?? null,
  };
  if (L.kind === 'hood' && !L.hood) L.hood = L.cloth;
  return L;
}

// hero (flexible creation) -> look
const CLASS_ACC = { zabivnoy: ['headband', 'scar-seam'], technomant: ['cybereye'], mutant: ['bone-spikes'], itishnik: ['glasses', 'headset'], ranger: ['cap'], arbiter: ['helmet'],
  ugolovnik: ['cig', 'bandana'], ecolog: ['flower'], reper: ['cap', 'chain', 'earring'], slavotech: ['halo'], cybertech: ['hood', 'cybereye'] };
const CLASS_CLOTH = { zabivnoy: '7', technomant: 'i', mutant: 'k', itishnik: 'l', ranger: 'l', arbiter: '3', ugolovnik: '1', ecolog: 'k', reper: 'g', slavotech: '8', cybertech: 'o' };
export function heroLook(build) {
  const race = build.race ?? 'human';
  const id = `hero:${build.id ?? build.name ?? race}:${build.cls ?? ''}`;
  const fem = build.fem ?? (build.sex === 'f' || build.gender === 'f' || build.gender === 'female');
  const style = build.style;
  const o = {
    fem, bg: 'i', cloth: build.look ?? CLASS_CLOTH[build.cls] ?? '3', acc: [...(CLASS_ACC[build.cls] ?? [])], emo: 'neutral', style: 'collar',
    age: build.age ?? 1, hatC: build.look ?? null,
  };
  if (style && typeof style === 'string' && ['short', 'buzz', 'long', 'bob', 'mohawk', 'topknot', 'spiky', 'curly', 'sidepart', 'ponytail', 'bun', 'afro', 'bald'].includes(style)) o.hair = style;
  if (build.cls === 'cybertech') o.hood = build.look ?? 'o';
  return portraitLook({ id, race, faction: 'none' }, o);
}

// ---------------------------------------------------------------------------
// animation / damage state
// ---------------------------------------------------------------------------
function stateOf(L, opts) {
  const tick = opts.frame != null ? opts.frame : Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) / 150);
  const hp = opts.hp == null ? 1 : clamp(opts.hp, 0, 1);
  const lvl = hp < 0.15 ? 3 : hp < 0.4 ? 2 : hp < 0.7 ? 1 : 0;
  const nervous = opts.mrl != null && opts.mrl < 0.3;
  const blink = opts.blink !== false && ((tick + (L.h % 24)) % 24 === 0);
  return { tick, lvl, nervous, blink, smoke: ((tick % 3) + 3) % 3, spark: tick & 1 };
}

// ---------------------------------------------------------------------------
// face parts
// ---------------------------------------------------------------------------
function browPix(r, x0, w, y, side, ang, c, thick) {
  for (let i = 0; i < w; i++) {
    const t = side < 0 ? i : w - 1 - i; // 0 outer .. w-1 inner
    const yy = y + Math.round(ang * (t / (w - 1) - 0.5) * 2);
    r.px(x0 + i, yy, c); if (thick > 1) r.px(x0 + i, yy + 1, c);
  }
}
function brows(r, S, y, xl = 16, xr = 27, w = 6, c) {
  const { E, L, st } = S;
  let lift = E.lift ?? 0; let angL = E.ang ?? 0; let angR = E.angR ?? E.ang ?? 0; let liftR = E.liftR ?? lift;
  if (st.nervous && S.emo === 'neutral') { lift = 1; liftR = 1; angL = -1; angR = -1; }
  if (st.lvl >= 2 && S.emo === 'neutral') { angL = -1; angR = -1; }
  const bc = c ?? (L.hair === 'bald' || L.kind !== 'human' ? sh(L.skin.b) : L.hc);
  browPix(r, xl, w, y - lift, -1, angL, bc, L.thick);
  browPix(r, xr, w, y - liftR, 1, angR, bc, L.thick);
}

// one human-style eye in a 5x3 box; bottom row = cy+1
function eye(r, S, x0, cy, side, o = {}) {
  const { E, L, st } = S;
  const white = o.white ?? '5'; const iris = o.iris ?? L.eyeC; const lid = o.lid ?? '0';
  let h = E.h; const gz = clamp((E.gaze ?? 0) + (st.nervous ? (st.tick & 1 ? 1 : -1) * side : 0), -1, 1);
  if (st.blink || o.closed) h = 0;
  if (o.swollen) h = 0;
  const outer = side < 0 ? x0 : x0 + 4; const inner = side < 0 ? x0 + 4 : x0;
  if (h === 0) { r.rect(x0, cy + 1, 5, 1, lid); return; }
  if (h === 'arc') { [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1]].forEach(([i, d]) => r.px(x0 + i, cy + d, lid)); return; }
  let hh = L.eyeShape === 'narrow' ? Math.max(1, h - 1) : h;
  if (L.age >= 2 && hh > 1 && E.h === 2) hh = 2;
  if (S.st.lvl >= 3) hh = Math.min(hh, 1);
  const tp = cy + 2 - hh;
  r.rect(x0, tp, 5, hh, white);
  r.rect(x0, tp - 1, 5, 1, lid);
  if (E.squint) { r.rect(x0, cy + 2, 5, 1, lid); }
  if (L.eyeShape === 'wide') r.px(outer + side, tp - 1, lid);
  if (L.fem) r.px(outer + side, tp - 1, lid), r.px(outer + side, tp - 2, lid);
  if (E.ang > 0) r.px(inner, tp, lid); else if (E.ang < 0 && E.h === 2) r.px(outer, tp, lid);
  const px = x0 + 2 + gz;
  if (E.small || st.nervous) { r.rect(px, tp, 1, hh, lid); }
  else { const ih = Math.min(hh, 2); r.rect(px - (gz > 0 ? 1 : 0), cy + 2 - ih, 2, ih, iris); r.px(px - (gz > 0 ? 0 : 0) + (gz >= 0 ? 0 : -1) + (gz >= 0 ? 1 : 1) - 1 + (gz >= 0 ? 0 : 1), cy + 1, lid); }
  if (L.age >= 2) r.rect(x0 + 1, cy + 2, 3, 1, o.bag ?? sh(L.skin.b));
}

function mouth(r, S, shape, my, lip, cx = 24) {
  const k = shape;
  const R = (x, y, w, h, c) => r.rect(cx + x, y, w, h, c);
  const P = (x, y, c) => r.px(cx + x, y, c);
  if (k === 'flat') R(-3, my, 7, 1, lip);
  else if (k === 'smile') { R(-2, my, 5, 1, lip); P(-3, my - 1, lip); P(3, my - 1, lip); }
  else if (k === 'grin') { R(-3, my - 1, 7, 1, lip); R(-3, my, 7, 1, '5'); R(-2, my + 1, 5, 1, '0'); P(-4, my - 2, lip); P(4, my - 2, lip); }
  else if (k === 'frown') { R(-2, my, 5, 1, lip); P(-3, my + 1, lip); P(3, my + 1, lip); }
  else if (k === 'snarl') { R(-3, my - 1, 7, 3, '0'); R(-3, my - 1, 7, 1, '5'); P(0, my - 1, '0'); [-2, 0, 2].forEach((x) => P(x, my + 1, '5')); P(-4, my + 1, lip); P(4, my + 1, lip); }
  else if (k === 'gasp') { R(-2, my - 1, 5, 3, '0'); R(-2, my - 1, 5, 1, '5'); P(-3, my, lip); P(3, my, lip); }
  else if (k === 'smirk') { R(-3, my, 6, 1, lip); P(3, my - 1, lip); P(4, my - 2, lip); P(-4, my + 1, lip); }
  else if (k === 'o') { R(-1, my - 1, 3, 3, '0'); P(-1, my - 1, lip); P(1, my - 1, lip); P(-1, my + 1, lip); P(1, my + 1, lip); }
  else if (k === 'wave') { R(-4, my - 1, 9, 3, '5'); R(-4, my - 1, 9, 1, lip); R(-4, my + 1, 9, 1, lip); [-2, 0, 2].forEach((x) => R(x, my, 1, 1, '0')); P(-5, my, lip); P(5, my, lip); }
  else if (k === 'nerv') { for (let i = -4; i <= 4; i++) P(i, my + (i & 1 ? 1 : 0), lip); }
  else if (k === 'bleed') { R(-3, my, 7, 1, lip); }
}
function mouthShape(S) { return S.st.nervous && S.emo === 'neutral' ? 'nerv' : (S.st.lvl >= 3 && S.emo === 'neutral' ? 'gasp' : S.st.lvl >= 2 && S.emo === 'neutral' ? 'frown' : S.E.m); }

// glyph eyes for machines (visors, sockets, screens): 5 wide
function glyph(r, S, cx, cy, side, c, size = 1) {
  const { E, st } = S;
  const emo = S.emo; const inn = -side;
  if (st.blink) { r.rect(cx - 2, cy + 1, 5, 1, c); return; }
  const jit = st.nervous ? (st.tick & 1 ? 1 : -1) : 0;
  cx += jit;
  const bar = (fn, th = 2) => { for (let d = -2; d <= 2; d++) { const y = cy + fn(d * inn); for (let t = 0; t < th; t++) r.px(cx + d, y + t, c); } };
  switch (emo) {
    case 'happy': [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]].forEach(([d, y]) => { r.px(cx + d, cy + y, c); r.px(cx + d, cy + y + 1, c); }); break;
    case 'angry': bar((t) => Math.round(t / 2) - 0); break;
    case 'sad': bar((t) => -Math.round(t / 2) + 1); break;
    case 'scared': r.rect(cx, cy, 1 + size - 1 + 1, 2, c); r.px(cx + jit, cy - 1, c); break;
    case 'smug': r.rect(cx - 2, cy + 1, 5, 1, c); r.rect(cx - 2, cy, 5, 1, '0'); break;
    case 'surprised': r.rect(cx - 2, cy - 1, 5, 5, c); r.rect(cx - 1, cy, 3, 3, '0'); r.px(cx, cy + 1, c); break;
    case 'cringe': r.line(cx + inn * -2, cy - 1, cx + inn * 1, cy, c); r.line(cx + inn * -2, cy + 2, cx + inn * 1, cy + 1, c); break;
    default: r.rect(cx - 2, cy, 5, 2, c); if (st.lvl >= 2 && (st.tick & 3) === 0) r.rect(cx - 2, cy, 5, 2, '0');
  }
}
// LED mouth line for machines
function ledMouth(r, S, cx, my, c, w = 4) {
  const m = S.E.m; const ST = S.st;
  const P = (x, y) => r.px(cx + x, y, c);
  const line = (a, b, y) => { for (let x = a; x <= b; x++) P(x, y); };
  if (m === 'grin' || m === 'smile') { line(-w + 1, w - 1, my + 1); P(-w, my); P(w, my); }
  else if (m === 'frown' || (ST.nervous && S.emo === 'neutral')) { line(-w + 1, w - 1, my); P(-w, my + 1); P(w, my + 1); }
  else if (m === 'snarl' || m === 'wave') { for (let x = -w; x <= w; x++) { P(x, my); if (x % 2 === 0) P(x, my + 1); } }
  else if (m === 'gasp' || m === 'o') { r.rect(cx - 1, my - 1, 3, 3, c); r.px(cx, my, '0'); }
  else if (m === 'smirk') { line(-w, w - 2, my + 1); P(w - 1, my); P(w, my - 1); }
  else line(-w, w, my);
}

// ---------------------------------------------------------------------------
// hair, facial hair, ears
// ---------------------------------------------------------------------------
function hairBack(r, L) {
  const c = L.hc;
  switch (L.hair) {
    case 'long': r.ell(24, 25, 13.5, 17, c, (x, y) => y >= 10 && y <= 44); r.rect(11, 28, 26, 14, c); break;
    case 'bob': r.ell(24, 23, 13.5, 12.5, c, (x, y) => y <= 34); break;
    case 'afro': r.ell(24, 14, 15, 12, c); break;
    case 'ponytail': r.line(33, 11, 38, 17, c); r.line(34, 11, 39, 18, c); r.ell(38.5, 22, 2.5, 5, c); r.px(36, 12, '4'); break;
    case 'curly': r.ell(24, 17, 13.5, 11, c, top(26)); break;
    default: break;
  }
}
function hairTop(r, L) {
  const c = L.hc; const dk = sh(c); const lt = li(c);
  const cap = (cy, ry, lim) => r.ell(24, cy, 11.6, ry, c, top(lim));
  switch (L.hair) {
    case 'bald': r.px(19, 11, li(L.skin.b)); r.px(20, 10, li(L.skin.b)); break;
    case 'buzz': cap(15, 8, 12); r.rect(13, 13, 2, 3, c); r.rect(33, 13, 2, 3, c); [[17, 11], [22, 10], [28, 11], [31, 13]].forEach(([x, y]) => r.px(x, y, dk)); break;
    case 'short': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 5, c); r.rect(32, 13, 3, 5, c); r.rect(17, 13, 14, 1, c); [[18, 9], [21, 8], [25, 9]].forEach(([x, y]) => r.px(x, y, lt)); r.rect(32, 10, 2, 4, dk); break;
    case 'sidepart': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 5, c); r.rect(32, 13, 3, 5, c); r.rect(14, 13, 12, 2, c); r.line(20, 7, 18, 13, dk); r.rect(32, 10, 2, 4, dk); r.px(16, 10, lt); r.px(24, 9, lt); break;
    case 'spiky': cap(15, 7, 12); for (let i = 0; i < 6; i++) { const x = 15 + i * 3.6; r.tri([x - 2, 12], [x + 2, 12], [x + (i - 2.5) * 0.8, 3 + (i % 2) * 2], c); } r.rect(13, 13, 2, 3, c); r.rect(33, 13, 2, 3, c); break;
    case 'curly': for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; r.ell(24 + Math.cos(a) * 10.5, 14 + Math.sin(a) * 8, 3.2, 3.2, c); } r.ell(24, 11, 9, 4, c); r.px(17, 8, lt); r.px(24, 5, lt); break;
    case 'mohawk': r.rect(22, 3, 5, 11, c); r.rect(23, 2, 3, 1, c); r.px(22, 4, lt); r.px(24, 6, lt); for (let y = 9; y < 14; y++) { r.px(14 + (y & 1), y, dk); r.px(33 - (y & 1), y, dk); } r.rect(21, 11, 7, 2, c); break;
    case 'topknot': cap(14.5, 8, 13); r.rect(13, 13, 3, 3, c); r.rect(32, 13, 3, 3, c); r.ell(24, 5.5, 3, 3, c); r.rect(22, 8, 5, 1, 'c'); r.px(23, 4, lt); break;
    case 'ponytail': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 4, c); r.rect(32, 13, 3, 4, c); r.rect(17, 13, 14, 1, c); r.px(35, 12, 'c'); r.px(18, 9, lt); break;
    case 'bun': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 4, c); r.rect(32, 13, 3, 4, c); r.ell(24, 4.5, 4, 3.5, c); r.px(22, 4, lt); r.rect(21, 8, 7, 1, dk); break;
    case 'afro': r.ell(24, 11, 13, 9, c, top(14)); r.rect(12, 12, 3, 8, c); r.rect(33, 12, 3, 8, c); r.px(18, 5, lt); r.px(26, 4, lt); break;
    case 'long': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 20, c); r.rect(32, 13, 3, 20, c); r.line(24, 7, 18, 13, dk); r.rect(14, 13, 8, 2, c); r.px(17, 10, lt); r.rect(34, 20, 1, 12, dk); break;
    case 'bob': cap(14.5, 8.5, 13); r.rect(13, 13, 3, 14, c); r.rect(32, 13, 3, 14, c); r.rect(14, 13, 20, 2, c); r.rect(34, 18, 1, 8, dk); r.px(18, 10, lt); break;
    default: cap(14.5, 8.5, 13);
  }
}
function facialHair(r, L, E, myy) {
  const b = L.beard; if (!b) return;
  const c = b.c; const dk = sh(c);
  const stub = () => { for (let y = 25; y <= 33; y++) for (let x = 15; x <= 33; x++) { const sk = r.get(x, y); if ((sk === L.skin.b || sk === L.skin.s) && ((x + y * 2) % 3 === 0) && (y >= 27 || Math.abs(x - 24) >= 6)) r.px(x, y, dk); } };
  const must = () => { r.rect(19, myy - 3, 11, 2, c); r.px(18, myy - 2, c); r.px(30, myy - 2, c); r.rect(21, myy - 1, 7, 1, dk); };
  switch (b.style) {
    case 'stubble': stub(); break;
    case 'mustache': must(); break;
    case 'goatee': must(); r.ell(24, myy + 3, 3, 3.5, c); r.px(23, myy + 1, '.'); break;
    case 'full': r.ell(24, 29, 10.2, 5.5, c, (x, y) => y >= 25); r.rect(14, 22, 2, 5, c); r.rect(33, 22, 2, 5, c); r.rect(23, 33, 3, 1, dk); r.rect(15, 26, 18, 1, dk); break;
    case 'long': r.ell(24, 29, 10.2, 5.5, c, (x, y) => y >= 25); r.rect(14, 22, 2, 6, c); r.rect(33, 22, 2, 6, c); r.ell(24, 38, 7.5, 8, c, (x, y) => y >= 32); r.line(24, 36, 24, 45, dk); r.line(20, 36, 19, 43, dk); r.line(28, 36, 29, 43, dk); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// heads
// ---------------------------------------------------------------------------
const FACE_DIM = { oval: [10, 12], round: [11, 11], long: [9.2, 13], square: [10.2, 11.5] };
function noseDraw(r, L, y0 = 21) {
  const s = sh(L.skin.b); const d = sh(s);
  switch (L.nose) {
    case 'long': r.rect(25, y0 - 1, 1, 5, s); r.rect(23, y0 + 4, 4, 1, s); r.px(23, y0 + 4, d); r.px(26, y0 + 4, d); break;
    case 'wide': r.rect(22, y0 + 2, 6, 2, s); r.px(22, y0 + 3, d); r.px(27, y0 + 3, d); r.px(25, y0, s); r.px(25, y0 + 1, s); break;
    case 'button': r.rect(23, y0 + 2, 3, 2, s); r.px(24, y0 + 3, d); r.px(23, y0 + 2, li(L.skin.b)); break;
    default: r.rect(24, y0, 1, 3, s); r.rect(23, y0 + 3, 3, 1, s); r.px(23, y0 + 3, d);
  }
}

function headHuman(r, S) {
  const { L, E, st } = S; const sk = L.skin.b; const ss = L.skin.s;
  const [W, H] = FACE_DIM[L.face] ?? FACE_DIM.oval;
  hairBack(r, L);
  r.ell(13.5, 21, 1.6, 2.6, sk); r.ell(34.5, 21, 1.6, 2.6, sk); r.px(13, 21, ss); r.px(35, 21, ss);
  if (L.face === 'square') { r.ell(24, 19, W, H - 2, sk); r.rect(24 - W + 0.5, 19, W * 2 - 1, 13, sk); [[14, 32], [15, 33], [33, 32], [32, 33], [14, 31], [34, 31]].forEach(([x, y]) => r.px(x, y, '.')); r.rect(17, 33, 14, 1, '.'); r.rect(17, 32, 14, 1, sk); }
  else r.ell(24, 21, W, H, sk);
  r.rim(sk, ss, 2);
  // cheek shade / blush
  r.rect(14, 24, 2, 4, ss);
  if (E.blush) { r.rect(16, 24, 3, 1, E.blush); r.rect(29, 24, 3, 1, E.blush); }
  if (st.nervous) { r.rect(16, 24, 3, 1, 'p'); r.rect(29, 24, 3, 1, 'p'); }
  hairTop(r, L);
  S.preEyes?.(r);
  eye(r, S, 17, 19, -1, { swollen: S.swollen === -1 }); eye(r, S, 27, 19, 1, { swollen: S.swollen === 1 });
  noseDraw(r, L);
  const lip = L.beard ? sh(L.beard.c) : L.fem ? (sk === '6' ? 'd' : 'c') : sh(ss);
  mouth(r, S, mouthShape(S), 29, lip);
  facialHair(r, L, E, 29);
  if (L.beard && ['full', 'long'].includes(L.beard.style)) mouth(r, S, mouthShape(S), 29, '0');
  // age
  if (L.age >= 2) { r.rect(19, 12, 10, 1, ss); r.px(16, 18, ss); r.px(32, 18, ss); r.px(16, 20, ss); r.px(32, 20, ss); r.px(20, 25, ss); r.px(20, 26, ss); r.px(28, 25, ss); r.px(28, 26, ss); }
  if (L.age >= 3) { r.rect(21, 11, 6, 1, ss); r.px(18, 22, ss); r.px(30, 22, ss); r.rect(19, 15, 2, 1, ss); }
  brows(r, S, 16, 16, 27, 6);
}
function headSkeleton(r, S) {
  const { L, E } = S; const c = L.visor;
  r.ell(24, 17, 10.6, 11.4, '5'); r.rect(14, 20, 20, 6, '5'); r.rect(15, 26, 18, 1, '5'); // cranium + cheekbones
  r.rect(18, 27, 12, 1, '5');
  r.rect(13, 19, 2, 5, '4'); r.rect(33, 19, 2, 5, '4'); // temple plates
  r.rim('5', '4', 2, false);
  r.rect(16, 15, 7, 7, '0'); r.rect(26, 15, 7, 7, '0'); r.ell(19.5, 18.5, 3.5, 3.6, '0'); r.ell(29.5, 18.5, 3.5, 3.6, '0');
  r.tri([22, 23], [26, 23], [24, 26], '0');
  r.rect(15, 9, 5, 3, '3'); r.px(16, 10, '4'); r.px(19, 10, '4'); r.line(20, 12, 22, 14, 'h'); // forehead plate + wire
  r.line(34, 14, 36, 20, 'c'); r.line(36, 20, 35, 30, 'c');
  const jy = ['gasp', 'o', 'snarl', 'grin'].includes(E.m) ? 2 : 0;
  r.rect(17, 28 + jy, 14, 5, '4'); r.rect(17, 28 + jy, 14, 1, '5'); r.rect(18, 32 + jy, 12, 1, '3');
  for (let x = 18; x <= 30; x += 2) r.px(x, 29 + jy, '0');
  if (jy) r.rect(19, 28, 10, 2, '0'), [19, 21, 23, 25, 27].forEach((x) => r.px(x, 28, '5'));
  if (E.m === 'smile' || E.m === 'grin') { r.px(17, 27, '0'); r.px(31, 27, '0'); }
  if (E.m === 'frown') { r.px(17, 30, '0'); r.px(31, 30, '0'); }
  S.preEyes?.(r);
  if (S.swollen !== -1) glyph(r, S, 20, 17, -1, c); if (S.swollen !== 1) glyph(r, S, 29, 17, 1, c);
  if (S.st.lvl >= 3) { r.rect(26, 15, 7, 7, '0'); r.px(27 + S.st.spark * 3, 16 + S.st.spark, c); }
  r.line(20, 14, 18, 12, '3'); r.line(28, 14, 30, 12, '3'); r.rect(19, 13, 3, 1, '3');
  if (E.m === 'angry' || S.emo === 'angry') r.rect(15, 14, 4, 1, '3');
}
function headAndroid(r, S) {
  const { L, E } = S; const c = L.visor;
  hairBack(r, { ...L, hair: L.hair === 'bald' ? 'x' : L.hair });
  r.ell(13.5, 21, 2.2, 3.2, '3'); r.ell(34.5, 21, 2.2, 3.2, '3'); r.px(13, 21, 'h'); r.px(35, 21, 'h');
  r.ell(24, 21, 10, 12, '4'); r.rim('4', '3', 2);
  r.rect(24, 9, 1, 4, '3'); r.line(14, 15, 14, 22, '3'); r.line(33, 15, 33, 22, '3'); r.rect(18, 8, 4, 1, '5'); // seams + gloss
  r.rect(15, 15, 18, 8, '1'); r.rect(16, 14, 16, 1, '1'); r.rect(16, 23, 16, 1, '1'); r.rect(15, 15, 18, 1, '2');
  S.preEyes?.(r);
  if (S.swollen !== -1) glyph(r, S, 20, 17, -1, c); else r.rect(17, 16, 6, 5, '0');
  if (S.swollen !== 1) glyph(r, S, 28, 17, 1, c); else r.rect(25, 16, 6, 5, '0');
  r.rect(19, 28, 11, 3, '2'); r.rect(19, 28, 11, 1, '3'); r.rect(23, 25, 3, 1, '3'); r.px(24, 26, '3');
  ledMouth(r, S, 24, 29, S.st.lvl >= 3 ? '0' : c, 4);
  if (L.hair !== 'bald' && L.hair !== 'x') hairTop(r, L); else r.rect(15, 10, 18, 1, '3');
}
function ear(r, side, state, fur, inner) {
  // side -1 = left; tip positions for the left ear, mirrored for the right
  const T = { up: [12, 2], perk: [12, 0], flat: [4, 10], droop: [8, 19], back: [6, 13], twitch: [13, 3] }[state];
  const m = (x) => (side < 0 ? x : 47 - x);
  [[14, 14], [15, 13], [16, 12], [17, 11], [18, 11]].forEach(([x, y]) => r.line(m(x), y, m(T[0]), T[1], fur));
  r.line(m(16), 12, m(T[0] + 0.5 * (16 - T[0])), T[1] + 0.6 * (12 - T[1]) + 1, inner);
  r.px(m(T[0]), T[1], sh(fur));
}
function headBeast(r, S) {
  const { L, E } = S; const fur = L.fur; const big = L.big ? 1 : 0; const dk = sh(fur);
  const es = { neutral: 'up', happy: 'perk', angry: 'flat', sad: 'droop', scared: 'back', smug: 'up', surprised: 'perk', cringe: 'twitch' }[S.emo];
  ear(r, -1, es, fur, '8'); ear(r, 1, S.emo === 'smug' ? 'droop' : es, fur, '8');
  r.ell(24, 21, 11 + big, 11 + big, fur); if (big) r.ell(24, 34, 14, 6, fur, (x, y) => y >= 30);
  r.ell(24, 33, 10, 4, dk, (x, y) => y >= 31);
  r.rim(fur, dk, 2, false);
  for (let i = 0; i < 10; i++) { const x = 15 + ((i * 7) % 19); const y = 12 + ((i * 5) % 9); r.px(x, y, dk); r.px(x + 1, y + 1, li(fur)); }
  const mz = L.skin.b === '6' ? '9' : 'p'; const muz = ['7', '6'].includes(fur) ? '8' : '9';
  r.ell(24, 27, 7, 5.5, muz, (x, y) => y >= 23); r.rim(muz, sh(muz), 1, true);
  r.rect(23, 23, 3, 2, '0'); r.px(23, 23, '4');
  if (!['gasp', 'o', 'snarl'].includes(E.m)) r.line(24, 25, 24, 27, '0');
  S.preEyes?.(r);
  eye(r, S, 15, 19, -1, { white: 'b', iris: 'a', swollen: S.swollen === -1 }); eye(r, S, 28, 19, 1, { white: 'b', iris: 'a', swollen: S.swollen === 1 });
  r.rect(15, 16, 6, 1, dk); r.rect(27, 16, 6, 1, dk); // brow ridge
  mouth(r, S, mouthShape(S), 30, '0');
  if (E.m !== 'smile' && E.m !== 'grin') { r.px(21, 31, '5'); r.px(27, 31, '5'); } else { r.px(21, 29, '5'); r.px(27, 29, '5'); }
  brows(r, S, 14, 16, 27, 5, dk);
  if (L.fem) r.rect(11, 17, 2, 12, '6'), r.rect(35, 17, 2, 12, '6');
}
function leaves(r, S, fc) {
  const w = S.st.lvl; const emo = S.emo;
  const droop = ['sad', 'scared', 'cringe'].includes(emo) || w >= 2 ? 3 : emo === 'happy' || emo === 'surprised' ? -2 : 0;
  const lc = (i) => (w >= 3 ? (i % 2 ? '6' : 'm') : w >= 1 && i % 3 === 0 ? 'm' : i % 2 ? 'k' : 'j');
  const L = [[12, 9, 4, 2], [18, 6, 3, 3], [24, 5, 3, 3.5], [30, 6, 3, 3], [36, 9, 4, 2]];
  L.forEach(([x, y, rx, ry], i) => { const dy = i === 2 ? droop * 0.4 : droop * (1 + Math.abs(i - 2) * 0.35) / 1.6; r.ell(x, y + dy, rx, ry, lc(i)); r.px(x - 1, y + dy - 1, li(lc(i))); });
  const closed = ['sad', 'scared'].includes(emo) || w >= 3;
  const fx = 35; const fy = 6 + droop * 0.5;
  if (closed) { r.ell(fx, fy + 1, 1.8, 2.5, w >= 3 ? '6' : fc); r.px(fx, fy + 2, w >= 3 ? 'm' : 'j'); }
  else { r.ell(fx, fy, 3, 3, fc); r.px(fx, fy, 'b'); r.px(fx - 2, fy - 2, li(fc)); r.px(fx + 2, fy + 2, sh(fc)); }
}
function headPlant(r, S) {
  const { L, E } = S; const bk = L.bark; const dk = sh(bk);
  leaves(r, S, L.flower);
  r.ell(13, 21, 1.5, 2.5, bk); r.ell(35, 21, 1.5, 2.5, bk);
  r.ell(24, 21, 10.5, 12, bk); r.rim(bk, dk, 2);
  for (let i = 0; i < 9; i++) { const x = 16 + ((i * 5) % 16); const y = 12 + ((i * 7) % 18); r.line(x, y, x, y + 2, dk); }
  r.ell(18, 13, 4, 2, 'j', top(14)); r.ell(30, 12, 3, 1.5, 'k'); r.px(17, 12, 'j'); r.px(20, 14, 'k'); // moss
  r.rect(15, 28, 4, 2, 'k'); r.px(28, 31, 'j');
  r.ell(19.5, 19, 3.6, 3.2, '0'); r.ell(29.5, 19, 3.6, 3.2, '0'); r.rect(16, 16, 5, 1, dk); r.rect(27, 16, 5, 1, dk);
  S.preEyes?.(r);
  const gc = L.visor === 'c' ? 'a' : 'j';
  if (S.swollen !== -1) glyph(r, S, 20, 18, -1, gc); else r.rect(17, 17, 6, 4, '0');
  if (S.swollen !== 1) glyph(r, S, 29, 18, 1, gc); else r.rect(26, 17, 6, 4, '0');
  r.rect(23, 22, 3, 3, dk); r.px(24, 24, '0');
  mouth(r, S, mouthShape(S), 29, '0'); r.rect(17, 25, 1, 1, '0');
  brows(r, S, 14, 16, 27, 6, 'k');
  if (L.beard) { r.line(20, 33, 19, 41, 'k'); r.line(24, 34, 24, 43, 'j'); r.line(28, 33, 29, 41, 'k'); }
  if (L.fem) { r.rect(11, 15, 2, 14, 'k'); r.rect(35, 15, 2, 14, 'k'); r.px(11, 29, 'j'); r.px(36, 29, 'j'); }
}
function headTekhonok(r, S) {
  const { L, E } = S;
  const n = L.antennas;
  [[34, 11, 38, 1], [14, 11, 10, 2], [24, 8, 24, 0]].slice(0, n).forEach(([a, b, c, d], i) => {
    const sag = ['sad', 'scared'].includes(S.emo) ? 3 : S.emo === 'happy' ? -1 : 0;
    r.line(a, b, c, d + sag, '4'); r.ell(c, d + sag, 1.2, 1.2, 'a'); });
  r.ell(24, 21, 13, 14, '7'); r.rim('7', '6', 2); r.rect(10, 17, 3, 12, '8'); [[16, 9], [30, 10], [12, 14], [36, 22]].forEach(([x, y]) => r.px(x, y, '8'));
  r.ell(24, 22, 8.5, 9.5, '9'); r.rim('9', '8', 2);
  r.rect(16, 28, 17, 6, '6'); r.px(19, 31, '8'); r.px(28, 32, '8');
  S.preEyes?.(r);
  // goggles with expressive pupils
  r.rect(13, 16, 22, 7, '1'); r.ell(19.5, 19.5, 5, 3.8, '3'); r.ell(28.5, 19.5, 5, 3.8, '3');
  const lens = L.acc.includes('goggles-h') ? 'h' : 'a';
  r.ell(19.5, 19.5, 4, 3, lens); r.ell(28.5, 19.5, 4, 3, lens);
  r.rect(22, 18, 4, 2, '1');
  const gz = clamp(S.E.gaze ?? 0, -1, 1);
  [[19.5, -1], [28.5, 1]].forEach(([cx, sd]) => {
    const e = S.emo; const ph = S.st.blink ? 1 : e === 'surprised' || e === 'scared' ? 1 : 2;
    r.rect(cx - 1 + gz, 18 + (e === 'smug' ? 1 : 0), 2, ph + (S.st.blink ? 0 : 0), '0');
    if (e === 'angry') r.line(cx - 4 * -sd * -1, 16, cx + 4 * -sd * -1, 18, '1');
    if (e === 'happy') { r.rect(cx - 3, 20, 7, 2, '3'); }
    r.px(cx - 2, 17, '5');
  });
  mouth(r, S, mouthShape(S), 30, '0', 24);
  brows(r, S, 14, 15, 28, 5, '1');
  if (L.beard) r.rect(15, 33, 18, 4, L.beard.c);
}
function headCringegon(r, S) {
  const { L, E } = S; const emo = S.emo;
  const sag = ['sad', 'scared'].includes(emo) ? 3 : emo === 'happy' || emo === 'surprised' ? -1 : emo === 'angry' ? 1 : 0;
  r.line(16, 10, 11, 2 + sag, 'o'); r.line(32, 10, 37, 2 + sag, 'o'); r.ell(11, 2 + sag, 1.5, 1.5, 'n'); r.ell(37, 2 + sag, 1.5, 1.5, 'n');
  r.ell(24, 20, 11, 12.5, 'n'); r.rim('n', 'o', 2);
  r.px(15, 25, 'o'); r.px(33, 26, 'o'); r.px(18, 12, 'o'); r.px(30, 11, 'o'); r.px(20, 28, 'o');
  S.preEyes?.(r);
  const eyeAt = (cx, side) => {
    r.ell(cx, 19, 4.3, 5.4, '0'); r.px(cx - 2, 16, '5'); r.px(cx - 1, 16, '5'); r.px(cx - 2, 17, '5');
    const inn = -side; const blink = S.st.blink;
    if (blink || emo === 'happy') r.ell(cx, 19, 5, 6, 'n', (x, y) => y <= 19 - (blink ? -1 : 1) + (blink ? 0 : 0) && y < 21);
    if (emo === 'happy') r.line(cx - 4, 20, cx + 4, 20, '0'), r.line(cx - 4, 21, cx - 3, 20, '0'), r.line(cx + 3, 20, cx + 4, 21, '0');
    if (emo === 'angry') r.tri([cx - 5, 12], [cx + 5, 12], [cx + inn * 5, 18], 'n');
    if (emo === 'sad') r.tri([cx - 5, 12], [cx + 5, 12], [cx - inn * 5, 18], 'n');
    if (emo === 'smug') r.rect(cx - 5, 12, 11, 7, 'n');
    if (emo === 'scared') { r.px(cx + 1, 21, '5'); r.px(cx, 22, '5'); }
    if (emo === 'cringe') { r.line(cx - 4, 15, cx + 3, 19, 'n'); r.line(cx - 4, 23, cx + 3, 19, 'n'); r.px(cx + 3, 19, '0'); }
    if (S.swollen === side) r.ell(cx, 19, 5, 5.5, 'o');
  };
  eyeAt(18.5, -1); eyeAt(29.5, 1);
  r.px(23, 24, 'o'); r.px(25, 24, 'o');
  const m = mouthShape(S);
  if (m === 'grin' || m === 'smile') { r.rect(21, 29, 7, 1, 'o'); r.px(20, 28, 'o'); r.px(28, 28, 'o'); r.rect(22, 30, 5, 1, '0'); }
  else mouth(r, S, m, 30, 'o');
  const bc = 'o';
  r.rect(15, 14 - (E.lift ?? 0), 0, 0, bc);
}
function headSkrilet(r, S) {
  const { L, E } = S;
  r.rect(23, 3, 3, 6, '2'); r.rect(24, 3, 1, 6, '1');
  r.ell(24, 20, 11, 12.5, '2'); r.rim('2', '1', 2); r.rect(14, 18, 2, 10, '1'); r.rect(32, 18, 2, 10, '1');
  r.rect(15, 9, 18, 1, '3'); r.px(17, 11, '3'); r.px(30, 10, '3');
  r.rect(14, 15, 20, 6, '0');
  S.preEyes?.(r);
  const emo = S.emo;
  const c = S.st.lvl >= 3 && S.st.spark ? 'd' : 'c';
  if (S.swollen !== -1) glyph(r, S, 20, 17, -1, c); if (S.swollen !== 1) glyph(r, S, 28, 17, 1, c);
  r.rect(18, 26, 12, 7, '1'); r.rect(18, 26, 12, 1, '3'); for (let x = 19; x < 30; x += 2) r.rect(x, 28, 1, 4, '0');
  if (['angry', 'snarl'].includes(emo) || E.m === 'snarl') r.rect(19, 29, 10, 1, 'c');
  if (E.m === 'grin' || E.m === 'smirk') r.rect(19, 27, 10, 1, 'd');
  r.rect(22, 22, 4, 2, '1');
}
function headScreen(r, S) {
  const { L } = S; const c = L.screen ?? 'c'; const bgc = c === 'a' ? '6' : 'd';
  r.rect(10, 7, 29, 24, '2'); r.rect(10, 7, 29, 1, '3'); r.rect(11, 8, 27, 22, '1'); r.rect(11, 8, 27, 22, '0'); r.rect(11, 8, 27, 22, bgc);
  for (let y = 9; y < 30; y += 2) r.rect(11, y, 27, 1, sh(bgc));
  r.rect(10, 7, 1, 24, '3'); r.px(37, 29, c);
  S.preEyes?.(r);
  const jig = S.st.spark && S.st.lvl >= 2 ? 1 : 0;
  if (c === 'a') {
    r.ell(24.5, 18, 7.5, 6.5, 'a'); r.ell(24.5, 18, 5, 4, bgc);
    const emo = S.emo; r.ell(24.5, 18, 2.5, 2.5, 'a'); r.px(24, 17, 'b'); r.px(25, 17, 'b');
    if (emo === 'angry') r.tri([16, 11], [33, 11], [24.5, 18], bgc), r.line(16, 12, 24, 17, 'a'), r.line(33, 12, 25, 17, 'a');
    if (emo === 'smug' || emo === 'sad') r.rect(16, 11, 18, 5, bgc), r.rect(16, 16, 18, 1, 'a');
    if (emo === 'happy') r.rect(16, 19, 18, 6, bgc), r.line(17, 19, 32, 19, 'a');
    ledMouth(r, S, 24, 27, 'a', 7);
  } else {
    glyph(r, S, 18 + jig, 16, -1, c); glyph(r, S, 31 - jig, 16, 1, c);
    glyph(r, { ...S, E: { ...S.E } }, 18 + jig, 16, -1, c);
    r.rect(15, 11 - (S.E.lift ?? 0) / 2, 7, 1, sh(c)); r.rect(27, 11 - (S.E.lift ?? 0) / 2, 7, 1, sh(c));
    ledMouth(r, S, 24, 25, c, 8);
  }
  if (L.id === 'putin-mark-2') r.rect(11, 8, 27, 22, bgc), r.rect(14, 16, 21, 3, c), r.rect(14, 22, 21, 1, c), r.rect(14, 12, 12, 1, c);
  r.rect(21, 31, 7, 5, '3'); r.rect(15, 36, 19, 3, '2'); r.rect(15, 36, 19, 1, '4');
}
function headSpirit(r, S) {
  const { L } = S; const c = 'h'; const t = S.st.tick;
  r.ell(24, 21, 11.5, 13, 'i'); r.ell(24, 21, 9.5, 11, '0');
  r.ell(24, 21, 11.5, 13, 'h', (x, y) => { const dx = Math.abs(x + 0.5 - 24); const dy = (y + 0.5 - 21) / 13; return dx * dx / (11.5 * 11.5) + dy * dy >= 0.74; });
  for (let y = 11; y < 33; y += 3) r.rect(14, y, 20, 1, 'i');
  const g = (t % 7 === 0) ? 1 : 0;
  glyph(r, S, 20 + g, 19, -1, c); glyph(r, S, 28 - g, 19, 1, c);
  ledMouth(r, S, 24, 28, c, 4);
  [[16, 10], [32, 30], [18, 34], [30, 12]].forEach(([x, y], i) => { if (((t + i) & 3) < 2) r.px(x, y, i % 2 ? 'n' : 'h'); });
  r.rect(15, 24 + (t & 1), 5, 1, 'h'); r.rect(30, 16 + ((t >> 1) & 1), 4, 1, 'i');
}
function headHood(r, S) {
  const { L } = S; const hc = L.hood ?? L.cloth;
  r.ell(24, 21, 14, 17, hc); r.rim(hc, sh(hc), 3, false);
  r.ell(24, 22, 10, 12, '0');
  if (L.mask) { r.ell(24, 22, 8.5, 11, '4'); r.rim('4', '3', 2); r.rect(17, 18, 5, 2, 'h'); r.rect(27, 18, 5, 2, 'h'); r.line(28, 12, 30, 28, 'o'); r.rect(19, 28, 11, 1, '3'); r.rect(21, 24, 7, 1, '3'); }
  else if (L.screenFace) { r.rect(16, 15, 17, 14, 'i'); r.rect(16, 15, 17, 1, 'h'); r.rect(18, 19, 13, 1, 'h'); r.rect(18, 22, 9, 1, 'h'); r.rect(18, 25, 11, 1, 'h'); glyph(r, S, 21, 17, -1, 'h'); glyph(r, S, 28, 17, 1, 'h'); }
  else {
    const ec = L.hoodEyes ?? (L.accent ?? 'h');
    glyph(r, S, 20, 20, -1, ec); glyph(r, S, 28, 20, 1, ec);
    if (L.threeEyes) glyph(r, S, 24, 14, 1, ec);
    if (!L.hoodEyes) ledMouth(r, S, 24, 29, sh(ec), 3);
  }
}
function headDeity(r, S) {
  const t = S.st.tick;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + (t & 1) * 0.1; r.line(24 + Math.cos(a) * 16, 22 + Math.sin(a) * 16, 24 + Math.cos(a) * 21, 22 + Math.sin(a) * 21, 'h'); }
  r.ell(24, 22, 15, 10, 'h'); r.ell(24, 22, 14, 9, '0'); r.ell(24, 22, 6, 6, 'h'); r.ell(24, 22, 3.8, 3.8, 'o'); r.px(24, 22, '0'); r.px(23, 21, '5'); r.px(24, 22, '0');
  const e = S.emo;
  if (e === 'angry') { r.tri([9, 12], [39, 12], [24, 22], '0'); r.line(10, 13, 23, 20, 'h'); r.line(38, 13, 25, 20, 'h'); }
  if (e === 'smug' || e === 'sad') { r.rect(9, 12, 31, 8, '0'); r.rect(10, 20, 29, 1, 'h'); }
  if (e === 'surprised') r.ell(24, 22, 9, 9, 'h'), r.ell(24, 22, 7.5, 7.5, '0'), r.ell(24, 22, 4, 4, 'h'), r.ell(24, 22, 2.5, 2.5, 'o');
  if (S.st.blink) r.rect(9, 12, 31, 10, '0'), r.rect(10, 22, 29, 1, 'h');
  [11, 15, 19, 24, 29, 33, 37].forEach((x, i) => r.rect(x, 5 - (i % 2), 1, 4 + (i % 2), 'h'));
}
const HEADS = { human: headHuman, skeleton: headSkeleton, android: headAndroid, beast: headBeast, plant: headPlant, tekhonok: headTekhonok, cringegon: headCringegon, skrilet: headSkrilet, screen: headScreen, spirit: headSpirit, hood: headHood, deity: headDeity };

// ---------------------------------------------------------------------------
// accessories (drawn on the head layer, after the face)
// ---------------------------------------------------------------------------
function accessories(r, S) {
  const { L, st } = S; const my = 29;
  const has = (k) => L.acc.includes(k);
  const hatC = L.hatC ?? null;
  const hum = L.kind === 'human';
  // under-hat / face gear
  if (has('glasses')) { r.rect(16, 17, 7, 5, '1'); r.rect(26, 17, 7, 5, '1'); r.rect(17, 18, 5, 3, '.'); r.rect(27, 18, 5, 3, '.'); r.rect(23, 18, 3, 1, '1'); r.line(16, 18, 13, 19, '1'); r.line(33, 18, 36, 19, '1'); r.px(17, 18, '4'); r.px(27, 18, '4'); redrawEyes(r, S); r.px(17, 18, '4'); r.px(27, 18, '4'); }
  if (has('shades')) { r.rect(15, 17, 8, 4, '1'); r.rect(26, 17, 8, 4, '1'); r.rect(23, 17, 3, 1, '1'); r.line(15, 18, 12, 19, '1'); r.line(34, 18, 37, 19, '1'); r.px(16, 18, '4'); r.px(17, 17, '4'); r.px(27, 18, '4'); r.px(28, 17, '4'); }
  if (has('goggles') || has('goggles-h')) { const c = has('goggles-h') ? 'h' : 'a'; r.rect(13, 17, 22, 2, '1'); r.rect(15, 16, 8, 6, '2'); r.rect(26, 16, 8, 6, '2'); r.rect(16, 17, 6, 4, c); r.rect(27, 17, 6, 4, c); r.px(17, 17, '5'); r.px(28, 17, '5'); r.rect(23, 18, 3, 2, '1'); r.px(21, 20, sh(c)); r.px(32, 20, sh(c)); }
  if (has('goggles-up')) { r.rect(13, 9, 22, 2, '1'); r.rect(15, 7, 7, 5, '2'); r.rect(26, 7, 7, 5, '2'); r.rect(16, 8, 5, 3, L.accent === 'h' ? 'h' : 'a'); r.rect(27, 8, 5, 3, L.accent === 'h' ? 'h' : 'a'); r.px(16, 8, '5'); r.px(27, 8, '5'); }
  if (has('patch')) { r.rect(25, 16, 8, 6, '1'); r.px(26, 17, '3'); r.line(13, 9, 36, 14, '1'); r.line(13, 10, 36, 15, '1'); r.line(24, 12, 25, 16, '1'); }
  if (has('cybereye')) { const cx = 29; r.rect(25, 15, 8, 8, '3'); r.rect(26, 16, 6, 6, '1'); r.rect(27, 17, 4, 4, L.eyeC === 'h' ? 'h' : 'c'); r.px(28, 17, '5'); r.rect(25, 15, 8, 1, '4'); r.line(33, 20, 36, 24, 'h'); r.px(36, 25, 'h'); if (st.blink) r.rect(26, 16, 6, 6, '3'); }
  if (has('respirator') || has('respirator-down')) { const dn = has('respirator-down'); const y = dn ? 33 : 25; r.rect(17, y, 14, 7, '2'); r.rect(17, y, 14, 1, '3'); r.ell(19.5, y + 4, 2.7, 2.7, '3'); r.ell(28.5, y + 4, 2.7, 2.7, '3'); r.px(19, y + 4, '1'); r.px(29, y + 4, '1'); r.rect(22, y + 3, 5, 3, '1'); r.line(17, y + 1, 13, y - 6, '1'); r.line(31, y + 1, 35, y - 6, '1'); }
  if (has('scarf')) { const c = L.scarf; r.rect(15, 26, 18, 8, c); r.rect(15, 26, 18, 1, sh(c)); r.rect(15, 33, 18, 1, sh(c)); r.line(17, 28, 29, 31, sh(c)); r.rect(31, 33, 3, 7, c); r.px(32, 36, sh(c)); }
  if (has('plaster')) { r.rect(28, 23, 6, 4, '5'); r.rect(28, 23, 6, 1, '4'); r.rect(30, 23, 2, 4, 'p'); }
  if (has('scar-seam')) { r.line(31, 12, 33, 22, 'p'); [[30, 14], [32, 14], [30, 17], [32, 17], [31, 20], [33, 20]].forEach(([x, y]) => r.px(x, y, '0')); }
  if (has('earring')) { r.px(13, 24, 'a'); r.px(12, 25, 'a'); r.px(13, 26, 'a'); r.px(13, 25, 'b'); }
  if (has('earpiece')) { r.px(13, 21, 'h'); r.line(13, 22, 15, 31, '1'); }
  if (has('earbuds')) { r.ell(13, 22, 2, 2.5, '1'); r.px(13, 21, 'h'); r.line(13, 24, 16, 33, '5'); }
  // cigarette / pipe (+ smoke)
  const smokeFrame = (x, y) => { const f = S.st.smoke; const off = [[0, 0, 1, -3, 0, -6], [1, -1, 0, -4, 1, -7], [0, -2, 1, -5, 0, -8]][f]; r.px(x + off[0], y + off[1], '4'); r.px(x + off[2], y + off[3] - 1, '3'); r.px(x + off[4], y + off[5] - 2, '2'); r.px(x + 1 - off[0], y + off[1] - 2, '3'); };
  if (has('cig')) { r.rect(27, my + 1, 7, 1, '5'); r.px(33, my + 1, 'e'); r.px(34, my + 1, 'b'); r.px(27, my + 1, 'a'); smokeFrame(34, my - 1); }
  if (has('pipe')) { r.line(26, my + 1, 31, my + 3, '6'); r.ell(33, my + 3, 2.5, 2.5, '7'); r.px(33, my + 1, '0'); r.px(32, my + 2, '8'); smokeFrame(33, my - 1); }
  if (has('bandage')) { r.rect(13, 10, 22, 4, '5'); r.line(14, 14, 20, 10, '4'); r.line(22, 14, 28, 10, '4'); r.px(27, 12, 'c'); r.px(28, 12, 'c'); r.px(28, 13, 'd'); }
  if (has('headset')) { r.ell(24, 17, 12.5, 11, '2', (x, y) => y <= 9 && y >= 8); r.rect(11, 18, 3, 7, '2'); r.rect(10, 19, 2, 5, '3'); r.line(12, 25, 17, 31, '2'); r.px(18, 31, 'h'); r.rect(14, 8, 20, 1, '2'); r.rect(12, 11, 2, 7, '2'); }
  if (has('chain')) { r.line(15, 37, 24, 44, 'a'); r.line(33, 37, 24, 44, 'a'); r.rect(23, 44, 3, 3, 'b'); r.px(24, 45, 'a'); r.px(20, 41, 'b'); r.px(28, 41, 'b'); }
  // headgear
  const helmet = (c, camo) => { r.ell(24, 12, 12.5, 9, c, top(15)); r.rect(11, 14, 26, 3, sh(c)); r.rect(11, 14, 26, 1, li(c)); r.px(24, 10, 'a'); r.px(23, 11, 'a'); r.px(25, 11, 'a'); if (camo) [[16, 8], [20, 11], [29, 9], [32, 12], [25, 7], [18, 13]].forEach(([x, y], i) => r.rect(x, y, 2, 1, i % 2 ? 'k' : 'm')); r.line(12, 17, 15, 30, '1'); r.line(36, 17, 33, 30, '1'); };
  if (has('helmet')) helmet(hatC ?? 'l', false);
  if (has('helmet-camo')) helmet('l', true);
  if (has('guardcap')) { r.ell(24, 11, 11.5, 6, 'l', top(13)); r.rect(12, 12, 24, 3, 'k'); r.rect(23, 10, 3, 3, 'a'); r.rect(14, 15, 20, 1, '1'); }
  if (has('officer')) { r.rect(12, 9, 24, 5, 'd'); r.ell(24, 9, 12, 4, 'd', top(9)); r.rect(12, 12, 24, 2, '1'); r.rect(22, 9, 4, 4, 'a'); r.px(23, 10, 'c'); r.rect(14, 14, 20, 1, '0'); r.rect(12, 9, 24, 1, 'c'); }
  if (has('kabuto')) { r.ell(24, 11, 13, 10, '3', top(15)); r.rect(11, 15, 26, 2, '4'); r.rect(10, 16, 3, 10, '3'); r.rect(35, 16, 3, 10, '3'); r.line(24, 2, 24, 9, '4'); r.rect(22, 11, 4, 1, 'a'); r.line(15, 8, 9, 1, 'a'); r.line(33, 8, 39, 1, 'a'); r.px(24, 12, 'a'); [14, 18, 30, 34].forEach((x) => r.px(x, 12, '5')); }
  if (has('bandana')) { const c = hatC ?? 'c'; r.ell(24, 12, 12, 7, c, top(15)); r.rect(12, 13, 24, 3, sh(c)); [[17, 9], [22, 8], [29, 10], [20, 12], [26, 13]].forEach(([x, y]) => r.px(x, y, '5')); r.line(35, 14, 40, 17, c); r.line(35, 15, 39, 20, sh(c)); }
  if (has('tricorn')) { r.ell(24, 8, 14, 5, '1', top(10)); r.rect(7, 9, 34, 3, '1'); r.rect(7, 9, 34, 1, 'a'); r.px(6, 8, '1'); r.px(41, 8, '1'); r.rect(12, 5, 24, 2, '1'); r.rect(23, 5, 3, 3, 'a'); }
  if (has('feather')) { r.line(36, 9, 40, 1, 'f'); r.line(37, 9, 42, 3, 'h'); r.line(35, 9, 38, 0, '5'); r.px(40, 1, 'h'); r.px(42, 3, '5'); r.px(38, 0, 'f'); }
  if (has('ushanka')) { r.ell(24, 11, 13, 8, '7', top(14)); r.rect(11, 9, 26, 3, '8'); r.rect(10, 13, 4, 13, '7'); r.rect(34, 13, 4, 13, '7'); r.rect(10, 24, 4, 2, '8'); r.rect(34, 24, 4, 2, '8'); [[16, 6], [22, 5], [30, 7], [26, 10], [18, 11]].forEach(([x, y]) => r.px(x, y, '8')); r.px(24, 10, 'a'); r.px(23, 11, 'a'); r.px(25, 11, 'a'); }
  if (has('kerchief')) { r.ell(24, 12, 12, 7, '7', top(15)); r.rect(12, 14, 24, 2, '6'); [[16, 9], [22, 8], [28, 10], [20, 12]].forEach(([x, y]) => r.px(x, y, 'a')); r.line(24, 16, 24, 19, '6'); r.rect(23, 16, 3, 3, '7'); }
  if (has('medband')) { r.rect(12, 9, 24, 3, 'c'); r.rect(23, 8, 3, 5, '5'); r.rect(22, 9, 5, 3, '5'); }
  if (has('headband')) { r.rect(13, 11, 22, 2, 'c'); r.line(34, 12, 40, 15, 'c'); r.line(34, 13, 39, 18, 'd'); }
  if (has('cap')) { const c = hatC ?? '1'; r.ell(24, 11, 12, 6, c, top(13)); r.rect(12, 12, 24, 3, c); r.rect(8, 14, 16, 2, sh(c)); r.rect(12, 12, 24, 1, li(c)); r.px(24, 8, 'a'); }
  if (has('crown')) { r.rect(13, 6, 22, 4, 'a'); r.rect(13, 9, 22, 1, '8'); [13, 18, 23, 28, 33].forEach((x, i) => r.tri([x, 6], [x + 3, 6], [x + 1, 1 + (i % 2)], 'a')); r.px(24, 7, 'c'); r.px(18, 8, 'f'); r.px(30, 8, 'h'); r.px(24, 3, 'b'); }
  if (has('junkcrown')) { r.rect(12, 7, 24, 4, '3'); r.rect(12, 7, 24, 1, '4'); [[12, 2], [16, 4], [20, 1], [25, 3], [30, 0], [34, 4]].forEach(([x, y], i) => r.rect(x, y, 2, 7 - y + 1, i % 2 ? 'a' : '4')); r.px(21, 9, 'c'); r.px(28, 9, 'a'); r.px(16, 9, '7'); r.line(18, 7, 26, 3, 'c'); r.rect(14, 5, 3, 3, '8'); }
  if (has('jester')) { r.line(14, 10, 5, 4, 'n'); r.line(15, 11, 6, 6, 'n'); r.line(34, 10, 43, 4, 'o'); r.line(33, 11, 42, 6, 'o'); r.line(24, 8, 24, 0, 'n'); r.ell(5, 4, 1.5, 1.5, 'b'); r.ell(43, 4, 1.5, 1.5, 'b'); r.ell(24, 0, 1.5, 1.5, 'b'); r.rect(14, 9, 20, 2, 'n'); r.rect(14, 10, 20, 1, 'o'); }
  if (has('antenna')) { r.line(31, 9, 35, 2, '4'); r.ell(35, 2, 1.5, 1.5, L.visor ?? 'h'); r.px(34, 1, '5'); }
  if (has('halo')) { r.ell(24, 4, 11, 3, 'a'); r.ell(24, 4, 9, 1.6, '.'); r.px(15, 3, 'b'); r.px(24, 1, 'b'); r.px(33, 3, 'b'); }
  if (has('flower')) { r.ell(35, 11, 2.5, 2.5, 'n'); r.px(35, 11, 'b'); r.px(37, 14, 'j'); r.px(36, 13, 'j'); }
  if (has('bone-spikes')) { [[16, 9], [24, 6], [32, 9]].forEach(([x, y]) => r.tri([x - 2, y + 3], [x + 2, y + 3], [x, y - 3], '5')); }
  if (has('vosmiklinka')) { const c = hatC ?? 'm'; r.ell(24, 11, 12.5, 6.5, c, top(14)); for (let i = 0; i < 4; i++) r.line(24, 5, 14 + i * 7, 14, sh(c)); r.rect(10, 13, 15, 2, sh(c)); r.px(24, 5, sh(c)); }
  if (has('gp5')) { r.ell(24, 22, 11, 12, '2', (x, y) => y >= 15 && (y >= 24 || x < 22 || x > 26) && (y >= 23 || x < 15 || x > 33)); r.ell(19.5, 19.5, 4.2, 3.6, '1'); r.ell(28.5, 19.5, 4.2, 3.6, '1'); r.ell(19.5, 19.5, 3, 2.5, '4'); r.ell(28.5, 19.5, 3, 2.5, '4'); r.px(18, 18, '5'); r.px(27, 18, '5'); r.rect(20, 26, 9, 8, '3'); r.rect(22, 33, 5, 5, '2'); r.line(23, 38, 20, 46, '2'); r.line(25, 38, 28, 46, '2'); r.rect(21, 28, 7, 1, '2'); r.rect(21, 30, 7, 1, '2'); r.line(13, 18, 12, 10, '1'); r.line(35, 18, 36, 10, '1'); }
  if (has('headlamp')) { r.rect(13, 8, 22, 2, '1'); r.rect(21, 5, 7, 5, '3'); r.rect(22, 6, 5, 3, 'b'); r.px(22, 6, '5'); r.px(24, 3, 'b'); r.px(20, 4, 'e'); r.px(28, 4, 'e'); }
  if (has('medals')) { r.rect(32, 40, 2, 3, 'c'); r.rect(32, 43, 2, 2, 'a'); r.rect(35, 40, 2, 3, 'f'); r.rect(35, 43, 2, 2, 'b'); r.px(14, 42, 'a'); r.px(15, 42, 'c'); r.px(14, 43, 'a'); }
  if (has('hood')) {
    const hc = L.hood ?? hatC ?? L.cloth;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = (x + 0.5 - 24) / 14; const dy = (y + 0.5 - 20) / 16; const d1 = dx * dx + dy * dy; const ex = (x + 0.5 - 24) / 10.6; const ey = (y + 0.5 - 22.5) / 12; if (d1 <= 1 && ex * ex + ey * ey > 1 && y < 34) r.px(x, y, (x > 33 ? sh(hc) : hc)); }
    r.ell(24, 22.5, 10.6, 12, '.', (x, y) => false);
    for (let x = 14; x <= 34; x++) { const dy = Math.sqrt(Math.max(0, 1 - ((x + 0.5 - 24) / 10.6) ** 2)) * 12; r.px(x, Math.round(22.5 - dy), '0'); }
  }
}
function redrawEyes(r, S) { // glasses: lenses show the eyes
  const { L } = S; const save = S.E; eye(r, S, 17, 19, -1); eye(r, S, 27, 19, 1);
  r.rect(16, 17, 1, 5, '1'); r.rect(22, 17, 1, 5, '1'); r.rect(26, 17, 1, 5, '1'); r.rect(32, 17, 1, 5, '1'); r.rect(17, 17, 5, 1, '1'); r.rect(27, 17, 5, 1, '1'); r.rect(17, 21, 5, 1, '1'); r.rect(27, 21, 5, 1, '1');
}

// ---------------------------------------------------------------------------
// damage
// ---------------------------------------------------------------------------
function preDamage(r, S) { // below the eyes: bruises around them
  const { L, st } = S; if (MECH.has(L.kind) || st.lvl < 2) return;
  const side = L.h & 1 ? -1 : 1; const cx = side < 0 ? 19.5 : 29.5;
  const bc = L.kind === 'beast' ? '6' : 'o';
  if (L.kind === 'human' || L.kind === 'beast' || L.kind === 'tekhonok') {
    if (st.lvl === 2) r.ell(cx, 20, 4, 3.2, bc, (x, y) => y >= 17);
    else { r.ell(19.5, 20, 4, 3.4, bc); r.ell(29.5, 20, 4, 3.4, bc, (x, y) => (y >= 18)); S.swollen = side; }
  }
  if (L.kind === 'cringegon' && st.lvl >= 3) S.swollen = side;
}
function damage(r, S) {
  const { L, st } = S; const lvl = st.lvl; if (!lvl) return;
  const side = L.h & 1 ? -1 : 1;
  const my = 29;
  if (MECH.has(L.kind)) {
    if (L.kind === 'screen' || L.kind === 'spirit') { if (lvl >= 1) for (let i = 0; i < 4 * lvl; i++) r.px(12 + (hv(L.h, 40 + i) % 24), 9 + (hv(L.h, 60 + i) % 20), i % 2 ? 'n' : 'h'); if (lvl >= 2) { r.line(15, 10, 20, 17, '0'); r.line(20, 17, 18, 26, '0'); } return; }
    r.px(30, 12, li(L.kind === 'skeleton' ? '5' : '4')); r.px(31, 13, '3'); r.px(16, 26, '3'); r.px(15, 25, '0');
    if (lvl >= 1) { r.line(20, 26, 20, 30, '1'); r.px(20, 31, '0'); }
    if (lvl >= 2) {
      r.line(28, 9, 26, 14, '0'); r.line(26, 14, 29, 18, '0'); r.line(29, 18, 27, 23, '0'); r.line(29, 18, 31, 17, '0');
      const sp = S.st.spark ? [[31, 10], [25, 16], [30, 22]] : [[32, 12], [24, 13], [28, 20]];
      sp.forEach(([x, y], i) => r.px(x, y, i % 2 ? 'b' : 'e'));
      r.line(26, 22, 26, 28, '1');
    }
    if (lvl >= 3) {
      r.line(18, 9, 20, 14, '0'); r.line(20, 14, 17, 20, '0'); r.rect(26, 10, 4, 4, '2'); r.px(27, 11, 'c'); r.px(28, 12, 'h');
      r.line(30, 33, 33, 40, 'c'); r.line(32, 33, 36, 39, 'b'); r.line(28, 33, 29, 41, 'h');
      [[22, 4], [24, 2], [26, 0]].forEach(([x, y], i) => r.px(x + ((S.st.tick + i) & 1), y - ((S.st.tick >> 1) % 2), '4'));
    }
    return;
  }
  const blood = 'c'; const dk = 'd';
  if (L.kind === 'plant') {
    if (lvl >= 1) { r.px(30, 25, 'm'); r.px(18, 26, 'm'); r.px(31, 26, 'm'); }
    if (lvl >= 2) { r.line(28, 12, 25, 17, '0'); r.line(25, 17, 28, 22, '0'); r.line(28, 22, 28, 30, 'a'); r.px(28, 31, 'b'); r.px(18, 30, 'a'); r.px(18, 31, 'a'); }
    if (lvl >= 3) { r.line(16, 14, 19, 22, '0'); r.line(31, 22, 33, 30, '0'); r.rect(12, 28, 4, 1, 'a'); }
    return;
  }
  // organic faces
  if (lvl >= 1) {
    const bx = side < 0 ? 15 : 28;
    r.px(bx + 1, 22, 'o'); r.px(bx + 2, 22, 'o'); r.px(bx + 2, 23, 'o'); r.px(bx + 3, 23, 'o'); r.px(bx + 3, 24, 'o');
    r.line(side < 0 ? 29 : 17, 13, side < 0 ? 31 : 19, 15, dk); r.px(side < 0 ? 30 : 18, 14, blood);
    r.px(24, 26, 'p'); r.px(26, 31, dk);
  }
  if (lvl >= 2) {
    r.line(24, 24, 24, 26, blood); r.px(23, 25, blood); r.rect(24, 26, 2, 3, dk);
    const cx = side < 0 ? 19 : 29;
    r.line(cx - 2, 14, cx + 1, 16, blood); r.line(cx - 2, 15, cx - 2, 20, blood); r.px(cx - 2, 21, dk);
    r.px(26, my, blood); r.px(26, my + 1, blood); r.px(26, my + 2, dk);
    r.line(side < 0 ? 29 : 17, 13, side < 0 ? 31 : 19, 17, blood);
  }
  if (lvl >= 3) {
    r.rect(23, 24, 3, 5, blood); r.rect(22, 29, 5, 1, blood); r.line(24, 30, 24, 34, blood); r.px(24, 35, dk); r.px(25, 34, dk);
    r.ell(side < 0 ? 29 : 19, 25, 2, 2, 'o'); r.ell(24, 33, 3, 1.5, 'o'); r.ell(20, 12, 3, 1.5, 'o', top(12));
    r.line(side < 0 ? 18 : 30, 10, side < 0 ? 17 : 31, 18, blood); r.line(side < 0 ? 19 : 29, 12, side < 0 ? 18 : 30, 17, dk);
    r.px(side < 0 ? 34 : 14, 27, blood);
  }
}
function bodyDamage(r, S) {
  const { L, st } = S; if (st.lvl < 2) return;
  const c = MECH.has(L.kind) ? '1' : sh(L.skin.b);
  const blood = MECH.has(L.kind) ? '1' : 'c';
  const tear = (sx) => { const m = (x) => (sx < 0 ? x : 47 - x); r.tri([m(5), 43], [m(14), 38], [m(15), 48], '.'); r.tri([m(5), 43], [m(10), 48], [m(15), 48], c); r.px(m(11), 44, blood); r.px(m(12), 45, blood); r.px(m(11), 46, 'd'); [[7, 43], [9, 41], [12, 40], [14, 39]].forEach(([x, y]) => r.px(m(x), y, sh(L.cloth))); };
  tear(-1); if (st.lvl >= 3) tear(1);
  r.line(21, 38, 20, 42, blood); r.px(20, 43, 'd'); r.rect(26, 40, 2, 2, blood);
}

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
function body(r, S) {
  const { L } = S; const cl = L.cloth; const cs = sh(cl);
  if (L.deity || L.kind === 'spirit') {
    if (L.kind === 'spirit') for (let y = 36; y < 48; y++) for (let x = 12; x < 36; x++) if ((x + y) % 3 === 0 && Math.abs(x - 24) < 12 - (y - 36) * 0.8) r.px(x, y, ((x * 3 + y) % 2) ? 'i' : 'h');
    return;
  }
  const neck = L.kind === 'human' || L.kind === 'tekhonok' || L.kind === 'beast' ? L.skin.s : L.kind === 'skeleton' ? '3' : L.kind === 'plant' ? 'k' : L.kind === 'cringegon' ? 'o' : '2';
  if (L.kind === 'screen') return; // stand drawn by head
  if (L.kind === 'hood') { r.ell(24, 52, 22, 14, cl, (x, y) => y >= 37); r.rim(cl, cs, 3, false); return; }
  r.rect(19, 28, 11, 12, neck);
  if (L.kind === 'skeleton') for (let y = 30; y < 38; y += 2) r.rect(20, y, 9, 1, '2');
  if (L.kind === 'android') { r.line(21, 30, 21, 38, 'h'); r.line(27, 30, 27, 38, 'i'); }
  r.ell(24, 53, 23, 16, cl, (x, y) => y >= 37); r.ell(24, 40, 12, 4, cl, (x, y) => y >= 37 && y < 40); r.rim(cl, cs, 3, false);
  [[8, 42], [11, 45], [34, 44], [38, 46], [20, 46]].forEach(([x, y]) => r.px(x, y, cs));
  const acc = L.accent;
  if (L.style === 'vatnik' || L.style === 'sailor' || L.style === 'track') {
    if (L.style === 'vatnik') { for (let y = 38; y < 48; y += 3) r.rect(4, y, 40, 1, cs); for (let x = 8; x < 44; x += 6) r.rect(x, 38, 1, 10, cs); }
    if (L.style === 'sailor') for (let y = 38; y < 48; y += 3) r.rect(2, y, 44, 1, '5');
    if (L.style === 'track') { r.rect(5, 40, 2, 8, '5'); r.rect(41, 40, 2, 8, '5'); r.rect(19, 36, 10, 2, '5'); }
  }
  const v = (w, d, c) => r.tri([24 - w, 37], [24 + w, 37], [24, 37 + d], c);
  switch (L.style) {
    case 'collar': v(4, 6, neck); r.tri([17, 36], [23, 37], [24, 44], acc); r.tri([31, 36], [25, 37], [24, 44], sh(acc)); r.line(24, 38, 24, 47, cs); break;
    case 'suit': r.rect(17, 31, 15, 7, '1'); r.rect(17, 31, 15, 1, acc); r.rect(17, 37, 15, 1, acc); r.rect(23, 33, 3, 3, 'a'); r.rect(4, 41, 9, 3, '1'); r.rect(4, 41, 9, 1, 'a'); r.rect(35, 41, 9, 3, '1'); r.rect(35, 41, 9, 1, 'a'); r.line(24, 38, 24, 47, '0'); break;
    case 'armor': v(5, 5, neck); r.ell(9, 43, 8, 5, cl, (x, y) => y >= 38); r.ell(39, 43, 8, 5, cs, (x, y) => y >= 38); r.rect(2, 41, 14, 1, li(cl)); [[6, 43], [12, 43], [36, 43], [42, 43]].forEach(([x, y]) => r.px(x, y, 'a')); r.rect(17, 36, 15, 3, cs); r.rect(17, 36, 15, 1, acc); break;
    case 'poncho': v(5, 7, neck); r.line(19, 37, 24, 44, acc); r.line(29, 37, 24, 44, acc); for (let i = 0; i < 6; i++) { r.px(19 + i, 37 + i, 'e'); r.px(29 - i, 37 + i, 'e'); } r.px(10, 47, '.'); r.px(36, 47, '.'); [[12, 46], [30, 45]].forEach(([x, y]) => r.rect(x, y, 3, 2, acc)); r.line(12, 46, 14, 47, '0'); break;
    case 'robe': r.tri([17, 37], [31, 37], [24, 47], '0'); r.line(17, 37, 24, 47, acc); r.line(31, 37, 24, 47, acc); r.rect(15, 37, 3, 11, cs); r.rect(31, 37, 3, 11, cs); r.px(24, 38, acc); break;
    case 'vatnik': v(5, 5, neck); r.rect(17, 36, 15, 3, cs); r.line(24, 38, 24, 47, '0'); r.px(24, 41, 'a'); r.px(24, 44, 'a'); r.rect(8, 44, 5, 1, 'b'); r.rect(36, 44, 5, 1, 'b'); break;
    case 'sailor': v(5, 5, neck); r.rect(17, 36, 15, 1, '5'); break;
    case 'track': v(4, 4, neck); r.rect(18, 36, 13, 1, '1'); break;
    default: v(5, 5, neck); r.line(19, 37, 24, 42, cs); r.line(29, 37, 24, 42, cs);
  }
  if (L.acc.includes('tie')) { r.tri([21, 37], [27, 37], [24, 42], '5'); r.rect(23, 38, 3, 2, 'c'); r.rect(23, 40, 3, 7, 'c'); r.px(24, 42, 'd'); }
  bodyDamage(r, S);
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------
function tattooMark(r, L) {
  switch (L.tattoo) {
    case 'tribal': r.line(29, 22, 32, 27, 'g'); r.line(30, 22, 33, 26, 'g'); r.px(28, 21, 'g'); break;
    case 'tear': r.px(30, 24, 'f'); r.px(30, 25, 'g'); break;
    case 'circuit': r.line(15, 22, 18, 22, 'h'); r.line(18, 22, 18, 26, 'h'); r.px(18, 27, 'h'); r.px(15, 21, 'h'); break;
    case 'brand': r.rect(23, 11, 3, 1, 'c'); r.px(24, 12, 'c'); break;
    default: break;
  }
  if (L.scars.includes('cheek')) { r.line(30, 22, 33, 28, 'p'); r.px(31, 24, '0'); }
  if (L.scars.includes('brow')) { r.line(17, 13, 19, 18, 'p'); r.px(18, 15, 'c'); }
  if (L.scars.includes('lip')) { r.line(21, 27, 21, 31, 'p'); }
  if (L.implant === 'temple') { r.rect(32, 12, 3, 7, '3'); r.px(33, 13, 'h'); r.px(33, 16, 'c'); r.line(32, 19, 33, 25, '1'); }
  if (L.implant === 'jaw') { r.rect(25, 28, 9, 6, '4'); r.rect(25, 28, 9, 1, '5'); r.line(25, 28, 25, 33, '3'); r.px(31, 31, 'h'); }
  if (L.implant === 'port') { r.rect(32, 26, 3, 3, '2'); r.px(33, 27, 'h'); }
}

function composeRaster(L, opts) {
  const st = stateOf(L, opts);
  const emoName = EMOTIONS.includes(opts.emotion) ? opts.emotion : EMOTIONS.includes(L.emo) ? L.emo : 'neutral';
  const E = EMO[emoName];
  const S = { L, E, emo: emoName, st, swollen: 0 };
  S.preEyes = (rr) => preDamage(rr, S);
  const out = new Raster();
  out.rounded(L.bg);
  const Bd = new Raster(); body(Bd, S);
  const H = new Raster();
  if (L.kind === 'human' && L.acc.includes('hood')) { H.ell(24, 22, 15, 18, L.hood ?? L.cloth, (x, y) => y <= 40); }
  HEADS[L.kind](H, S);
  if (L.kind === 'human' || L.kind === 'tekhonok' || L.kind === 'beast' || L.kind === 'cringegon') tattooMark(H, L); else if (L.implant && MECH.has(L.kind)) { /* mech implants are the build */ }
  damage(H, S);
  if (S.emo === 'sad' || S.emo === 'scared' || S.emo === 'cringe') { /* tears/sweat */ }
  if (E.tear && !MECH.has(L.kind) && L.kind !== 'plant') { H.px(19, 22, 'h'); H.px(19, 23, 'h'); H.px(20, 25, 'h'); }
  if ((E.sweat || st.nervous) && !MECH.has(L.kind)) { H.px(34, 12 + (st.tick & 1), 'h'); H.px(34, 13 + (st.tick & 1), '5'); H.px(32, 9, 'h'); if (st.nervous) { H.px(15, 12 + (st.tick & 1), 'h'); H.px(15, 13 + (st.tick & 1), '5'); } }
  if (st.nervous && MECH.has(L.kind)) for (let i = 0; i < 5; i++) H.px(14 + (hv(L.h + st.tick, 90 + i) % 20), 12 + (hv(L.h + st.tick, 70 + i) % 20), 'n');
  accessories(H, S);
  // pose: head layer shifted/sheared over the neck
  const dx = (E.dx ?? 0) + ((L.h >> 5) % 3) - 1 > 1 ? 1 : (E.dx ?? 0) + ((L.h >> 5) % 3) - 1 < -1 ? -1 : (E.dx ?? 0) + ((L.h >> 5) % 3) - 1;
  let dy = E.dy ?? 0; let tilt = E.tilt ?? 0;
  if (st.lvl >= 2) { dy = Math.max(dy, 1); tilt = tilt || 1; }
  if (['deity', 'screen', 'spirit'].includes(L.kind)) { tilt = 0; }
  const pose = (opts.pose != null) ? opts.pose : null; if (pose) tilt = pose;
  // body first
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = Bd.g[y][x]; if (c !== '.') out.g[y][x] = c; }
  for (let y = 0; y < N; y++) {
    const sx = dx + Math.round((tilt * (34 - y)) / 16);
    for (let x = 0; x < N; x++) { const c = H.g[y][x]; if (c !== '.') out.px(x + sx, y + dy, c); }
  }
  // wound vignette: faint red tint at the corners when badly hurt
  if (st.lvl >= 3) [[1, 4], [2, 3], [46, 4], [45, 3], [1, 43], [46, 43]].forEach(([x, y]) => { if (out.g[y][x] === L.bg) out.g[y][x] = 'd'; });
  return out;
}

export function buildPortrait(npc, opts = {}) {
  const L = typeof npc === 'object' && npc && npc.kind && npc.skin ? npc : portraitLook(npc);
  const o = { ...opts };
  if (o.accessories?.length) {
    const add = o.accessories.filter((a) => !a.startsWith('-'));
    const del = new Set(o.accessories.filter((a) => a.startsWith('-')).map((a) => a.slice(1)));
    L.acc = [...L.acc.filter((a) => !del.has(a)), ...add.filter((a) => !L.acc.includes(a))];
  }
  return composeRaster(L, o).g.map((row) => row.join(''));
}

// ---------------------------------------------------------------------------
// canvas cache + draw
// ---------------------------------------------------------------------------
const cache = new Map();
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toCanvas(rows, flip) {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const c = canvas.getContext('2d'); const img = c.createImageData(N, N);
  const KEYS = '0123456789abcdefghijklmnop';
  rows.forEach((row, y) => { for (let x = 0; x < N; x++) { const ch = row[x]; if (!ch || ch === '.') continue; const [R, G, Bb] = hexRgb(PALETTE[KEYS.indexOf(ch)]); const i = (y * N + (flip ? N - 1 - x : x)) * 4; img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = Bb; img.data[i + 3] = 255; } });
  c.putImageData(img, 0, 0); return canvas;
}
function cachedCanvas(lookOrNpc, opts, keyId) {
  const L = typeof lookOrNpc === 'object' && lookOrNpc.kind && lookOrNpc.skin ? lookOrNpc : portraitLook(lookOrNpc);
  const st = stateOf(L, opts);
  const key = [keyId ?? L.id, opts.emotion ?? '', st.lvl, st.nervous ? 1 : 0, st.blink ? 1 : 0, (L.acc.includes('cig') || L.acc.includes('pipe') || (opts.accessories ?? []).some((a) => a === 'cig' || a === 'pipe')) ? st.smoke : '', st.lvl >= 2 || st.nervous || MECH.has(L.kind) || L.kind === 'tekhonok' || L.kind === 'cringegon' || L.kind === 'deity' ? st.tick & 7 : '', (opts.accessories ?? []).join(','), opts.pose ?? '', opts.flip ? 1 : 0].join('|');
  let c = cache.get(key);
  if (!c) { c = toCanvas(buildPortrait(L, opts), !!opts.flip); if (cache.size > 800) cache.clear(); cache.set(key, c); }
  return c;
}
export function portraitCanvas(npc, opts = {}) { return cachedCanvas(npc, opts); }

function blitBox(ctx, canvas, x, y, size, alpha) {
  const ps = ctx.imageSmoothingEnabled; const pa = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false; ctx.globalAlpha = pa * alpha;
  ctx.drawImage(canvas, x, y, size, size);
  ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps;
}
// Back-compat: v1 portraits were 32 px; the box stays 32*scale so existing layouts do not move.
// opts.native: true -> 48*scale (pixel-perfect at integer scales).
export function drawPortrait(ctx, npc, x, y, scale = 3, opts = {}) {
  const c = cachedCanvas(npc, opts);
  blitBox(ctx, c, x, y, (opts.native ? N : 32) * scale, opts.alpha ?? 1);
}
export function drawHeroPortrait(ctx, build, x, y, scale = 3, opts = {}) {
  const L = heroLook(build);
  const c = cachedCanvas(L, opts, `${L.id}|${build.look ?? ''}|${build.sex ?? ''}|${build.style ?? ''}`);
  blitBox(ctx, c, x, y, (opts.native ? N : 32) * scale, opts.alpha ?? 1);
}
export function validatePortraits(ids = Object.keys(NPCS)) {
  const errors = []; const keys = '.0123456789abcdefghijklmnop';
  for (const id of ids) for (const emotion of EMOTIONS) for (const hp of [1, 0.5, 0.3, 0.1]) {
    const rows = buildPortrait(id, { emotion, hp, mrl: hp < 0.2 ? 0.1 : 1, frame: 3 });
    if (rows.length !== N || rows.some((row) => row.length !== N || [...row].some((ch) => !keys.includes(ch)))) errors.push(`portrait ${id}/${emotion}/${hp}: bad map`);
  }
  return errors;
}
