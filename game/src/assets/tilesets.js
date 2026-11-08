// Battlefield tilesets: 9 biomes x 7 tile kinds, 16x16 px (render x3 = 48 px cell, no smoothing).
// Owner: art-director. Rules and palette: docs/STYLE.md ("Поля сражений"). Layouts: docs/specs/battlefields.md.
//
// Tiles are generated deterministically from the biome table below into string maps (same format as
// sprites.js: every char = palette key, '.' = transparent), then painted to a cached canvas.
//
// API:
//   BIOME_IDS, TILE_KINDS, VARIANTS (variants per kind), BIOME_META (label, mood, region hints)
//   tileGrid(biome, kind, variant)   -> string[16]  (the string map)
//   tileSprite(biome, kind, variant = 0, scale = 1) -> canvas (cached). kind:
//       floor(4) wall(2) half(2) full(2) debris(3) water(2) decal(4)
//     half/full/debris/water/decal are drawn over the biome floor, so they can be blitted alone.
//   drawTile(ctx, biome, kind, variant, x, y, scale = 3)
//   validateTilesets() -> string[] of errors
// Also exports Pic (tiny pixel canvas helper) and canvasOfGrid, shared with props.js.
import { PALETTE, PALETTE_KEYS } from './sprites.js';

export const T = 16;
export const BIOME_IDS = ['wasteland', 'swamp', 'snow', 'ruins-city', 'bunker-interior', 'factory', 'port', 'mutant-forest', 'cyberspace'];
export const TILE_KINDS = ['floor', 'wall', 'half', 'full', 'debris', 'water', 'decal'];
export const VARIANTS = { floor: 4, wall: 2, half: 2, full: 2, debris: 3, water: 2, decal: 4 };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16; return (h >>> 0) / 4294967296;
  };
}

export class Pic {
  constructor(w, h, fill = '.') { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill(fill)); }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.g[y][x] : '.'; }
  p(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
  r(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); return this; }
  l(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return this;
  }
  e(cx, cy, rx, ry, c) { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1) this.p(cx + i, cy + j, c); return this; }
  // bevelled box: light on top/left, dark on bottom/right (light comes from top-left)
  box(x, y, w, h, b, l = b, d = b) { this.r(x, y, w, h, b); this.r(x, y, w, 1, l); this.r(x, y, 1, h, l); this.r(x, y + h - 1, w, 1, d); this.r(x + w - 1, y, 1, h, d); return this; }
  stamp(o, ox = 0, oy = 0) { for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.g[y][x] !== '.') this.p(ox + x, oy + y, o.g[y][x]); return this; }
  outline(c = '0') {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.g[y][x] !== '.') continue;
      if (this.get(x - 1, y) !== '.' || this.get(x + 1, y) !== '.' || this.get(x, y - 1) !== '.' || this.get(x, y + 1) !== '.') add.push([x, y]);
    }
    for (const [x, y] of add) this.g[y][x] = c;
    return this;
  }
  padded(n = 1) { const o = new Pic(this.w + 2 * n, this.h + 2 * n); o.stamp(this, n, n); return o; }
  rows() { return this.g.map((r) => r.join('')); }
}

const scatter = (P, R, c, n, w = 1, h = 1) => { for (let i = 0; i < n; i++) P.r((R() * (P.w - w + 1)) | 0, (R() * (P.h - h + 1)) | 0, w, h, c); };
const ri = (R, a, b) => a + ((R() * (b - a + 1)) | 0);

let ctxPalette = null;
const rgb = () => ctxPalette ?? (ctxPalette = PALETTE.map((h) => h));
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
export function canvasOfGrid(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const k = PALETTE_KEYS.indexOf(rows[y][x]);
    if (k >= 0) { ctx.fillStyle = rgb()[k]; ctx.fillRect(x, y, 1, 1); }
  }
  return cv;
}

// ---------------------------------------------------------------------------
// Biome table. Keys are palette chars. o = {base, dk (darker), lt (lighter), ex (accent)}
// ---------------------------------------------------------------------------
export const BIOME_META = {
  wasteland: { label: 'Пустошь', mood: 'сухая глина, ржавые скалы, мусор', regions: ['tinBrotherhood', 'scavengers', 'renegades', 'warprom'] },
  swamp: { label: 'Болото', mood: 'тёмная жижа, камыш, мёртвые деревья', regions: ['neutralVillages (низины)', 'wilds'] },
  snow: { label: 'Снег', mood: 'сизый наст, следы, ледяные глыбы', regions: ['wilds (север)'] },
  'ruins-city': { label: 'Город-руины', mood: 'асфальт с разметкой, кирпич, арматура', regions: ['neutralVillages', 'renegades', 'cringegons'] },
  'bunker-interior': { label: 'Бункер', mood: 'плиты, лампы-полосы, переборки', regions: ['aiParty', 'mechanids', 'harmony'] },
  factory: { label: 'Завод', mood: 'бетон, масло, жёлтые полосы, станки', regions: ['warprom', 'agrozone (цеха)', 'tinBrotherhood'] },
  port: { label: 'Порт', mood: 'доски причала, вода, контейнеры', regions: ['pirates'] },
  'mutant-forest': { label: 'Лес мутантов', mood: 'олива, корни, споры, кислота', regions: ['mutantsBeast', 'mutantsPlant', 'wilds', 'agrozone'] },
  cyberspace: { label: 'Киберспейс', mood: 'тёмная сетка, циан, глитч', regions: ['tekhonki', 'cult', 'harmony'] },
};

const BIO = {
  wasteland: { floor: 'dirt', o: { base: 'm', dk: '7', lt: '9', ex: '4' }, wall: 'rock', wc: { top: '8', face: '7', dark: '6', hi: '9' },
    half: 'sandbags', full: 'rustblock', debris: ['7', '8', '4', '6'], water: ['6', '7', '8'], decals: ['cracks', 'marks'] },
  swamp: { floor: 'mud', o: { base: 'k', dk: '1', lt: 'l', ex: 'j' }, wall: 'trees', wc: { base: 'k', lt: 'l', dk: '1', trunk: '6', hi: 'j' },
    half: 'logs', full: 'deadtree', debris: ['6', '7', 'l', 'k'], water: ['1', 'k', 'j'], decals: ['moss', 'cracks'] },
  snow: { floor: 'snow', o: { base: '4', dk: '3', lt: '5', ex: 'h' }, wall: 'rock', wc: { top: '5', face: '3', dark: '2', hi: '4' },
    half: 'snowmound', full: 'icerock', debris: ['5', '4', '3', '2'], water: ['3', '4', 'h'], decals: ['tracks', 'tracks'] },
  'ruins-city': { floor: 'asphalt', o: { base: '2', dk: '1', lt: '3', ex: 'a' }, wall: 'brick', wc: { cap: '3', capHi: '4', brick: '7', mortar: '6', hi: '8' },
    half: 'lowbrick', full: 'pillar', debris: ['7', '6', '3', '8'], water: ['1', 'g', 'f'], decals: ['marks', 'cracks'] },
  'bunker-interior': { floor: 'plates', o: { base: '2', dk: '1', lt: '3', ex: 'h' }, wall: 'slab', wc: { top: '4', face: '3', dark: '2', lamp: 'h', seam: '1' },
    half: 'console', full: 'locker', debris: ['3', '4', '2', 'a'], water: ['1', 'i', 'h'], decals: ['marks', 'glitch'] },
  factory: { floor: 'concrete', o: { base: '3', dk: '2', lt: '4', ex: 'a' }, wall: 'corrug', wc: { top: '3', topHi: '4', face: '7', hi: '8', dark: '6' },
    half: 'drums', full: 'machine', debris: ['4', '7', '8', 'a'], water: ['0', '1', 'o'], decals: ['marks', 'cracks'] },
  port: { floor: 'planks', o: { base: '7', dk: '6', lt: '8', ex: '4' }, wall: 'corrug', wc: { top: '3', topHi: '4', face: 'g', hi: 'f', dark: '1' },
    half: 'crates', full: 'container', debris: ['8', '6', '4', '7'], water: ['g', 'f', 'h'], decals: ['marks', 'tracks'] },
  'mutant-forest': { floor: 'forest', o: { base: 'l', dk: 'k', lt: 'j', ex: 'n' }, wall: 'trees', wc: { base: 'k', lt: 'j', dk: '0', trunk: '7', hi: 'l' },
    half: 'bush', full: 'bigtree', debris: ['7', '8', 'k', 'n'], water: ['k', 'j', 'b'], decals: ['moss', 'cracks'] },
  cyberspace: { floor: 'grid', o: { base: '0', dk: '1', lt: 'i', ex: 'h' }, wall: 'data', wc: { face: '0', panel: 'i', glow: 'h', hi: 'n', dark: '1' },
    half: 'datablock', full: 'monolith', debris: ['h', 'n', 'o', 'i'], water: ['0', 'o', 'n'], decals: ['glitch', 'glitch'] },
};

// ---------------------------------------------------------------------------
// floors
// ---------------------------------------------------------------------------
const FLOORS = {
  dirt(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base); scatter(P, R, o.dk, 14 + v * 2); scatter(P, R, o.lt, 8);
    scatter(P, R, o.ex, 2, 2, 1);
    if (v === 2) { P.l(2, 4, 7, 7, o.dk).l(7, 7, 6, 12, o.dk).l(7, 7, 12, 8, o.dk); }
    if (v === 3) { P.e(10, 10, 3, 2, o.dk); P.e(9, 9, 2, 1, o.base); }
  },
  mud(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base); scatter(P, R, o.dk, 14); scatter(P, R, 'i', 3, 2, 1);
    for (let i = 0; i < 3; i++) { const x = ri(R, 1, 14), y = ri(R, 2, 13); P.r(x, y, 1, 2, o.ex).p(x + 1, y + 1, o.lt); }
    if (v === 2) { P.e(8, 8, 5, 3, '6'); P.e(7, 7, 3, 1, o.base); }
    if (v === 3) for (const x of [3, 8, 12]) P.l(x, 13, x + (R() < 0.5 ? -1 : 1), 6, o.lt);
  },
  snow(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base);
    for (let i = 0; i < 3; i++) { const x = ri(R, 3, 12), y = ri(R, 3, 12); P.e(x, y + 1, 3, 1, o.dk); P.e(x, y, 3, 1, o.lt); }
    scatter(P, R, o.lt, 8); scatter(P, R, o.dk, 5);
    if (v === 2) for (let i = 0; i < 4; i++) { P.r(4 + i * 3, 3 + (i % 2) * 4, 2, 1, o.dk); }
    if (v === 3) { P.l(2, 12, 12, 4, o.lt); scatter(P, R, o.ex, 3); }
  },
  asphalt(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base); scatter(P, R, o.dk, 16); scatter(P, R, o.lt, 10);
    if (v === 1) { P.l(1, 2, 6, 6, o.dk).l(6, 6, 5, 12, o.dk).l(6, 6, 14, 8, o.dk); }
    if (v === 2) { P.r(7, 0, 2, 6, o.ex).r(7, 9, 2, 6, o.ex); P.r(7, 6, 2, 3, o.dk); }
    if (v === 3) { for (const [x, y] of [[3, 4], [9, 9], [6, 11]]) { P.r(x + 1, y + 1, 3, 2, '6'); P.r(x, y, 3, 2, '7'); P.p(x, y, '8'); } }
  },
  plates(P, v, R, o) {
    P.box(0, 0, 16, 16, o.base, o.lt, o.dk);
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) P.p(x, y, '4');
    if (v === 1) P.r(1, 8, 14, 1, o.dk).r(1, 9, 14, 1, o.lt);
    if (v === 2) { scatter(P, R, o.dk, 10); P.l(3, 12, 9, 5, o.lt); }
    if (v === 3) { P.r(3, 3, 10, 10, o.dk); for (let y = 3; y < 13; y += 2) P.r(3, y, 10, 1, '0'); P.r(3, 3, 1, 10, '3'); P.r(12, 3, 1, 10, '3'); }
    if (v === 0) scatter(P, R, o.dk, 5);
    if (v !== 3 && R() < 0.5) P.r(4, 7, 8, 2, o.ex).r(4, 7, 8, 1, '5'); // lamp strip
  },
  concrete(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base); P.r(0, 15, 16, 1, o.dk); P.r(15, 0, 1, 16, o.dk); P.r(0, 0, 16, 1, o.lt); P.r(0, 0, 1, 16, o.lt);
    scatter(P, R, o.dk, 10); scatter(P, R, o.lt, 6);
    if (v === 1) { P.e(8, 8, 4, 3, '1'); P.e(7, 7, 2, 1, '0'); }
    if (v === 2) { P.r(0, 8, 16, 1, o.dk); P.r(0, 9, 16, 1, o.lt); }
    if (v === 3) for (let i = 0; i < 16; i++) { const on = ((i >> 1) % 2) === 0; for (let y = 12; y < 15; y++) if (((i + y) >> 1) % 2 === 0) P.p(i, y, on ? o.ex : '1'); }
  },
  planks(P, v, R, o) {
    for (let k = 0; k < 4; k++) {
      const y = k * 4, off = ri(R, 4, 11);
      P.r(0, y, 16, 3, o.base); P.r(0, y, 16, 1, o.lt); P.r(0, y + 3, 16, 1, o.dk); P.r(off, y, 1, 4, o.dk);
      P.p(off - 3, y + 1, o.ex); P.p(off + 3, y + 1, o.ex);
      if (R() < 0.6) P.r(ri(R, 0, 12), y + 1, 3, 1, o.dk);
    }
    if (v === 1) scatter(P, R, o.lt, 8);
    if (v === 2) { P.r(5, 4, 5, 3, '0'); P.r(5, 4, 5, 1, o.dk); P.r(6, 5, 3, 1, 'g'); }
    if (v === 3) { P.r(8, 8, 2, 2, o.dk); P.p(8, 8, '6'); P.e(3, 3, 1, 1, o.dk); }
  },
  forest(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base); scatter(P, R, o.dk, 18, 2, 1); scatter(P, R, o.lt, 9);
    if (v === 2) { P.l(0, 9, 5, 7, '7').l(5, 7, 10, 9, '7').l(10, 9, 15, 7, '7').l(5, 7, 6, 3, '6'); }
    if (v === 3) { P.r(5, 5, 1, 1, o.ex); P.r(10, 9, 1, 1, o.ex); P.r(8, 12, 1, 1, o.ex); P.e(9, 6, 2, 1, o.lt); }
  },
  grid(P, v, R, o) {
    P.r(0, 0, 16, 16, o.base);
    P.r(0, 0, 16, 1, o.dk).r(0, 0, 1, 16, o.dk).r(0, 8, 16, 1, o.dk).r(8, 0, 1, 16, o.dk);
    P.p(0, 0, o.lt).p(8, 8, o.lt).p(0, 8, o.lt).p(8, 0, o.lt);
    if (v === 1) { P.l(0, 8, 7, 8, o.ex).l(7, 8, 7, 2, o.ex).p(7, 2, '5'); }
    if (v === 2) { for (let i = 0; i < 4; i++) P.r(ri(R, 1, 12), ri(R, 1, 14), ri(R, 2, 3), 1, R() < 0.5 ? 'n' : 'o'); }
    if (v === 3) { P.r(2, 2, 5, 5, o.dk); P.r(9, 9, 5, 5, o.dk); P.p(4, 4, o.lt); P.p(11, 11, o.lt); }
  },
};

// ---------------------------------------------------------------------------
// walls (full 16x16, own bevel; top cap = upper part)
// ---------------------------------------------------------------------------
const WALLS = {
  rock(P, v, R, c) {
    P.r(0, 0, 16, 16, c.face); P.r(0, 0, 16, 6, c.top);
    for (let x = 0; x < 16; x++) { const d = ri(R, 5, 8); P.r(x, 5, 1, d - 4, c.top); P.r(x, d, 1, 1, c.dark); }
    P.r(0, 0, 16, 1, c.hi); scatter(P, R, c.dark, 12); scatter(P, R, c.hi, 6);
    P.l(3 + v * 5, 8, 5 + v * 5, 14, c.dark); P.r(0, 15, 16, 1, c.dark);
  },
  brick(P, v, R, c) {
    P.r(0, 0, 16, 16, c.mortar);
    for (let y = 5; y < 16; y += 3) { const off = ((y / 3) | 0) % 2 ? 4 : 0; for (let x = -4 + off; x < 16; x += 8) { P.r(x, y, 7, 2, c.brick); P.r(x, y, 7, 1, R() < 0.3 ? c.hi : c.brick); } }
    P.r(0, 0, 16, 5, c.cap); P.r(0, 0, 16, 1, c.capHi); P.r(0, 4, 16, 1, '2'); scatter(P, R, '2', 4);
    if (v === 1) { P.r(6, 7, 4, 4, '1'); P.r(7, 7, 2, 1, '0'); P.l(2, 6, 3, 15, '3'); }
  },
  slab(P, v, R, c) {
    P.r(0, 0, 16, 16, c.face); P.r(0, 0, 16, 5, c.top); P.r(0, 5, 16, 1, c.dark); P.r(0, 0, 16, 1, '5');
    P.r(0, 15, 16, 1, c.dark); P.r(7, 6, 1, 9, c.seam); P.r(8, 6, 1, 9, '4');
    for (const [x, y] of [[1, 7], [14, 7], [1, 13], [14, 13]]) P.p(x, y, '4');
    if (v === 1) { P.r(3, 9, 3, 1, c.lamp); P.r(10, 9, 3, 1, '1'); } else { P.r(10, 9, 3, 1, c.lamp); }
  },
  corrug(P, v, R, c) {
    P.r(0, 0, 16, 16, c.face); for (let x = v; x < 16; x += 2) P.r(x, 6, 1, 10, c.hi);
    for (let x = 1 - v; x < 16; x += 4) P.r(x, 6, 1, 10, c.dark);
    P.r(0, 0, 16, 6, c.top); P.r(0, 0, 16, 1, c.topHi); P.r(0, 5, 16, 1, '2'); P.r(0, 15, 16, 1, c.dark);
    if (v === 1) { scatter(P, R, '7', 6); P.r(10, 8, 4, 3, '6'); }
  },
  trees(P, v, R, c) {
    P.r(0, 0, 16, 16, c.dk); P.r(5 + v, 9, 3, 7, c.trunk); P.r(5 + v, 9, 1, 7, '8'); P.r(11 - v, 11, 2, 5, c.trunk);
    for (const [x, y, r] of [[4, 4, 4], [11, 5, 4], [8, 8, 3], [2, 9, 2], [14, 9, 2]]) { P.e(x, y, r, r - 1, c.base); P.e(x - 1, y - 1, r - 1, Math.max(1, r - 2), c.lt); }
    scatter(P, R, c.hi, 5); P.r(0, 15, 16, 1, '0');
  },
  data(P, v, R, c) {
    P.r(0, 0, 16, 16, c.face); P.r(1, 1, 14, 14, c.dark); P.r(2, 2, 12, 12, c.face);
    P.r(0, 0, 16, 1, c.glow); P.r(0, 15, 16, 1, c.panel);
    for (let y = 4; y < 14; y += 3) P.r(3, y, 3 + ((y * 7 + v * 5) % 7), 1, c.panel);
    P.p(12, 4, c.hi).p(11, 4, c.hi).p(13, 9, c.glow).p(4, 12, 'o'); if (v === 1) { P.r(9, 7, 4, 4, c.dark); P.r(9, 7, 4, 1, c.hi); }
  },
};

// ---------------------------------------------------------------------------
// covers: painted on a transparent 16x16 layer, outlined, shadowed, laid over the floor
// half = low (bottom ~8 rows), full = tall (rows ~2..15)
// ---------------------------------------------------------------------------
const COVERS = {
  sandbags(P, v) { for (let k = 0; k < 2; k++) for (let i = 0; i < 3 - k + (v ? 0 : 0); i++) { const x = 1 + i * 5 + k * 2; P.e(x + 2, 12 - k * 4, 3, 2, 'm'); P.e(x + 1, 11 - k * 4, 2, 1, '9'); P.l(x, 12 - k * 4, x + 4, 12 - k * 4, '6'); } },
  logs(P, v) { for (let k = 0; k < 2; k++) { const y = 8 + k * 4; P.box(1, y, 14, 4, '7', '8', '6'); P.e(14, y + 2, 1, 2, '8'); P.p(14, y + 2, '6'); } if (v) P.r(3, 5, 4, 3, 'j'); },
  snowmound(P, v) { P.e(8, 11, 7, 4, '4'); P.e(7, 10, 6, 3, '5'); P.e(11, 11, 3, 2, '5'); if (v) { P.r(6, 6, 3, 4, '3'); P.p(6, 6, '5'); } P.r(2, 14, 12, 1, '3'); },
  lowbrick(P, v) { P.box(1, 8, 14, 7, '7', '8', '6'); for (let y = 10; y < 15; y += 2) P.r(2, y, 12, 1, '6'); P.r(1, 8, 14, 2, '3'); P.r(1, 8, 14, 1, '4'); if (v) P.r(9, 4, 5, 4, '7').r(9, 4, 5, 1, '8'); },
  console(P, v) { P.box(1, 7, 14, 8, '3', '4', '2'); P.r(3, 9, 5, 3, '1'); P.r(4, 10, 3, 1, 'h'); P.p(10, 10, 'c').p(12, 10, 'j').p(10, 12, 'b'); if (v) P.r(1, 4, 14, 3, '2').r(1, 4, 14, 1, '3'); },
  drums(P, v) { for (let i = 0; i < 2; i++) { const x = 1 + i * 7; P.box(x, 6 + (v && i ? 2 : 0), 6, 9 - (v && i ? 2 : 0), i ? '8' : '7', '8', '6'); P.r(x, 9, 6, 1, 'a'); P.r(x, 12, 6, 1, '6'); } },
  crates(P, v) { P.box(1, 7, 8, 8, '8', 'a', '6'); P.l(2, 8, 7, 13, '6'); P.l(7, 8, 2, 13, '6'); P.box(9, 10, 6, 5, '7', '8', '6'); if (v) P.box(3, 2, 6, 5, '8', 'a', '6'); },
  bush(P, v) { for (const [x, y, r] of [[4, 11, 4], [10, 10, 5], [8, 12, 3]]) { P.e(x, y, r, 3, 'k'); P.e(x - 1, y - 1, r - 1, 2, 'j'); } if (v) { P.p(7, 8, 'n'); P.p(12, 9, 'n'); } scatter(P, () => 0.3, 'l', 0); },
  datablock(P, v) { P.box(2, 7, 12, 8, 'i', 'h', '1'); P.r(4, 9, 8, 1, 'h'); P.r(4, 12, 5, 1, 'h'); P.p(11, 12, 'n'); if (v) { P.r(5, 3, 5, 4, 'o'); P.r(5, 3, 5, 1, 'n'); } },
  rustblock(P, v) { P.box(1, 3, 14, 12, '7', '8', '6'); for (let x = 3; x < 14; x += 3) P.r(x, 4, 1, 10, '6'); P.r(2, 4, 12, 1, '8'); scatter(P, () => 0.5, '8', 0); P.r(5, 9, 3, 2, '6'); P.r(10, 6, 2, 3, '3'); if (v) P.r(0, 1, 10, 3, '3').r(0, 1, 10, 1, '4'); },
  deadtree(P, v) { P.r(6, 5, 4, 10, '6'); P.r(6, 5, 1, 10, '7'); P.l(7, 6, 2, 1, '6').l(8, 7, 14, 2, '6').l(8, 4, 8, 0, '6'); P.l(2, 1, 1, 3, '6'); P.l(14, 2, 15, 4, '6'); P.r(4, 14, 8, 1, '1'); if (v) P.e(4, 8, 2, 1, 'k'); },
  icerock(P, v) { P.r(3, 3, 10, 12, '3'); P.r(4, 2, 8, 2, '4'); P.r(1, 7, 14, 8, '3'); P.r(2, 6, 12, 2, '4'); P.r(3, 3, 5, 5, 'h'); P.r(3, 3, 5, 1, '5'); P.l(9, 5, 11, 13, '2'); P.r(1, 14, 14, 1, '2'); if (v) P.r(10, 8, 3, 3, '5'); },
  pillar(P, v) { P.box(3, 2, 10, 13, '3', '4', '2'); P.r(3, 2, 10, 2, '4'); P.l(4, 6, 8, 10, '2'); P.l(8, 10, 7, 14, '2'); for (const x of [5, 8, 11]) P.l(x, 2, x + (x % 2 ? 1 : -1), 0, '7'); if (v) P.r(9, 8, 3, 5, '7'); },
  locker(P, v) { P.box(2, 2, 12, 13, '3', '4', '2'); P.r(2, 2, 12, 2, 'a'); P.r(5, 2, 2, 2, '1'); P.r(9, 2, 2, 2, '1'); P.r(7, 4, 1, 11, '1'); P.p(6, 9, '5'); P.p(9, 9, '5'); if (v) P.r(4, 5, 2, 2, 'h'); },
  machine(P, v) { P.box(1, 3, 14, 12, '2', '3', '1'); P.r(1, 3, 14, 3, 'a'); for (let x = 1; x < 15; x += 4) P.r(x, 3, 2, 3, '1'); P.r(3, 8, 6, 4, '1'); P.r(4, 9, 4, 2, v ? 'c' : 'h'); P.e(12, 10, 2, 2, '4'); P.p(12, 10, '1'); },
  container(P, v) { const f = v ? 'c' : 'f', d = v ? 'd' : 'g'; P.box(0, 3, 16, 12, f, '5', d); for (let x = 2; x < 15; x += 2) P.r(x, 5, 1, 9, d); P.r(0, 3, 16, 1, '4'); P.r(0, 14, 16, 1, '1'); },
  bigtree(P, v) { P.r(6, 9, 4, 6, '7'); P.r(6, 9, 1, 6, '8'); for (const [x, y, r] of [[5, 6, 5], [11, 5, 4], [8, 3, 4]]) { P.e(x, y, r, r - 1, 'k'); P.e(x - 1, y - 1, r - 1, Math.max(1, r - 2), 'j'); } P.p(10, 8, 'n'); if (v) P.p(4, 5, 'n'); },
  monolith(P, v) { P.box(4, 1, 8, 14, '0', 'o', '1'); P.r(5, 2, 6, 1, 'h'); P.r(5, 5, 6, 1, 'o'); P.r(5, 8, 3, 1, 'n'); P.r(5, 11, 6, 1, 'h'); P.p(10, 8, 'h'); if (v) P.r(2, 4, 2, 6, 'o').r(12, 6, 2, 5, 'i'); },
};

// ---------------------------------------------------------------------------
// decals and debris (over the floor)
// ---------------------------------------------------------------------------
const DECALS = {
  blood(P, R) { const x = ri(R, 5, 10), y = ri(R, 5, 10); P.e(x, y, 3, 2, 'd'); P.e(x - 1, y, 1, 1, 'c'); P.p(x + 4, y + 2, 'd'); P.p(x - 4, y - 1, 'd'); P.p(x + 2, y - 3, 'd'); },
  scorch(P, R, bio) { const dark = ['1', '0'].includes(bio.o.base) || bio.o.base === 'k'; const a = dark ? '0' : '1', b = dark ? 'o' : '0'; P.e(8, 8, 5, 3, a); P.e(8, 8, 3, 2, b); scatter(P, R, a, 4); },
  tracks(P, R) { for (let i = 0; i < 5; i++) { const x = 2 + i * 3, y = 4 + (i % 2) * 5; P.r(x, y, 2, 1, '3'); P.p(x + 1, y + 1, '2'); } },
  cracks(P, R, bio) { const c = bio.o.dk; P.l(1, 3, 6, 6, c).l(6, 6, 9, 11, c).l(6, 6, 13, 5, c).l(9, 11, 14, 14, c); P.p(7, 7, bio.o.lt); },
  marks(P, R, bio) { P.r(2, 7, 12, 2, bio.o.ex); for (let x = 3; x < 14; x += 4) P.r(x, 7, 2, 2, bio.o.dk); scatter(P, R, bio.o.dk, 4); },
  moss(P, R) { for (let i = 0; i < 3; i++) { const x = ri(R, 3, 12), y = ri(R, 3, 12); P.e(x, y, 2, 1, 'k'); P.e(x, y - 1, 1, 1, 'j'); } },
  glitch(P, R) { for (let i = 0; i < 6; i++) P.r(ri(R, 0, 12), ri(R, 0, 15), ri(R, 2, 4), 1, ['n', 'h', 'o', '5'][i % 4]); P.r(2, 8, 12, 1, 'o'); },
};

function debrisPaint(P, v, R, bio) {
  const pal = bio.debris;
  const bits = v === 2 ? 9 : v === 1 ? 7 : 5;
  for (let i = 0; i < bits; i++) {
    const x = ri(R, 1, 13), y = ri(R, 2, 13), c = pal[i % pal.length];
    if (R() < 0.35) P.l(x, y, x + ri(R, 2, 4), y + ri(R, -1, 1), c); else { P.r(x, y, 2, 2, c); P.p(x, y, pal[(i + 1) % pal.length]); P.p(x + 2, y + 2, '1'); }
  }
  if (v === 2) { P.r(6, 6, 5, 3, pal[0]).r(6, 6, 5, 1, pal[1]).r(6, 8, 5, 1, pal[3]); }
}

function waterPaint(P, v, R, bio) {
  const [deep, mid, hi] = bio.water;
  if (v === 0) { P.e(8, 8, 6, 4, deep); P.e(8, 8, 5, 3, mid); P.e(7, 7, 3, 1, mid); P.r(5, 7, 3, 1, hi); P.r(9, 10, 2, 1, hi); }
  else {
    P.r(0, 0, 16, 16, mid); P.r(0, 0, 16, 1, deep); P.r(0, 15, 16, 1, deep); P.r(0, 0, 1, 16, deep); P.r(15, 0, 1, 16, deep);
    scatter(P, R, deep, 8, 2, 1);
    for (let i = 0; i < 4; i++) P.r(ri(R, 2, 11), 3 + i * 3, ri(R, 2, 4), 1, hi);
  }
}

// ---------------------------------------------------------------------------
// public
// ---------------------------------------------------------------------------
function floorPic(biome, variant) {
  const bio = BIO[biome], P = new Pic(T, T);
  FLOORS[bio.floor](P, variant, seeded(`${biome}:floor:${variant}`), bio.o);
  return P;
}

export function tileGrid(biome, kind = 'floor', variant = 0) {
  const bio = BIO[biome];
  if (!bio) throw new Error(`Unknown biome: ${biome}`);
  if (!VARIANTS[kind]) throw new Error(`Unknown tile kind: ${kind}`);
  const v = ((variant % VARIANTS[kind]) + VARIANTS[kind]) % VARIANTS[kind];
  const R = seeded(`${biome}:${kind}:${v}`);
  if (kind === 'floor') return floorPic(biome, v).rows();
  if (kind === 'wall') { const P = new Pic(T, T); WALLS[bio.wall](P, v, R, bio.wc); P.r(0, 15, 16, 1, '0'); return P.rows(); }
  const P = floorPic(biome, v === 0 ? 0 : 1);
  if (kind === 'half' || kind === 'full') {
    const L = new Pic(T, T);
    COVERS[kind === 'half' ? bio.half : bio.full](L, v);
    const sh = new Pic(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (L.g[y][x] !== '.') sh.p(x + 1, y + 1, '1');
    P.stamp(sh); L.outline('0'); P.stamp(L);
    return P.rows();
  }
  if (kind === 'debris') debrisPaint(P, v, R, bio);
  else if (kind === 'water') waterPaint(P, v, R, bio);
  else if (kind === 'decal') {
    const name = v === 0 ? 'blood' : v === 1 ? 'scorch' : bio.decals[v - 2];
    DECALS[name](P, R, bio);
  }
  return P.rows();
}

const cache = new Map();
export function tileSprite(biome, kind = 'floor', variant = 0, scale = 1) {
  const key = `${biome}|${kind}|${variant}|${scale}`;
  let c = cache.get(key);
  if (!c) {
    const base = canvasOfGrid(tileGrid(biome, kind, variant));
    if (scale === 1) c = base;
    else { c = makeCanvas(T * scale, T * scale); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(base, 0, 0, T * scale, T * scale); }
    cache.set(key, c);
  }
  return c;
}

export function drawTile(ctx, biome, kind, variant, x, y, scale = 3) {
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileSprite(biome, kind, variant), x, y, T * scale, T * scale);
  ctx.imageSmoothingEnabled = prev;
}

export function validateTilesets() {
  const errs = [];
  for (const b of BIOME_IDS) for (const k of TILE_KINDS) for (let v = 0; v < VARIANTS[k]; v++) {
    try {
      const g = tileGrid(b, k, v);
      if (g.length !== T || g.some((r) => r.length !== T)) errs.push(`${b}/${k}/${v}: size`);
      for (const r of g) for (const ch of r) if (ch !== '.' && PALETTE_KEYS.indexOf(ch) < 0) errs.push(`${b}/${k}/${v}: bad char ${ch}`);
      if (k !== 'decal' && k !== 'debris' && g.some((r) => r.includes('.'))) errs.push(`${b}/${k}/${v}: transparent pixel`);
    } catch (e) { errs.push(`${b}/${k}/${v}: ${e.message}`); }
  }
  return [...new Set(errs)];
}
