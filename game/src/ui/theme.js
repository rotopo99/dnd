// UI themes (docs/STYLE.md «Темы интерфейса»): one theme = accent colours + procedural panel texture + frame + corner
// ornaments + button style + heading style. Chosen by the hero: faction origin overrides race; the main menu is neutral.
// Everything is drawn from the STYLE palette. Whole boxes (texture + frame + ornaments) are rendered ONCE into an offscreen
// canvas and cached by (theme, size, colours) — a frame costs one drawImage per panel.
// Legibility rule: a texture never LIGHTENS a surface (tints keep the luminance of the base colour, specks are darker or
// equal), so text contrast stays what it was on the plain tile; light details live only on the 1-4 px frame.
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';

const PAL = Object.fromEntries([...PALETTE_KEYS].map((k, i) => [k, PALETTE[i]]));
const SURFACE = new Set([PAL['0'], PAL['1'], PAL['2']]); // fills that receive the theme (others keep their meaning)
const EDGE_DEFAULT = PAL['3']; // the neutral panel border → the theme edge colour

// ---------------------------------------------------------------- colour maths (WCAG)
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const toHex = (a) => `#${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
export const lum = (s) => { const [r, g, b] = hex(s); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** base shifted towards the hue of `tint` by k, keeping the luminance of base (never brighter). */
export function hueShift(base, tint, k) {
  const L = lum(base), T = lum(tint) || 1e-4;
  const tl = hex(tint).map(lin), bl = hex(base).map(lin);
  let m = bl.map((b, i) => b + (Math.min(1, tl[i] * (L / T)) - b) * k);
  const L2 = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  if (L2 > L) m = m.map((v) => v * (L / L2));
  return toHex(m.map(unlin));
}
const darker = (s, f) => toHex(hex(s).map((v) => v * f));

// ---------------------------------------------------------------- the themes
// accent: [edge (frame), title (heading text; falls back to 5 if the contrast < 4.5), glow (hover / selection)]
// tex: texture kind; frame: frame kind; orn: corner glyph; shape: round | chamfer; btn: bevel | flat | stitch | plate; head: underline | plate | double
export const THEMES = {
  steel:    { id: 'steel',    accent: ['3', 'h', 'h'], tint: '2', k: 0.0,  sel: 'i', tex: 'brushed', frame: 'bolts',  orn: 'screw',   shape: 'round',   btn: 'bevel', head: 'underline' },
  concrete: { id: 'concrete', accent: ['4', 'a', 'a'], tint: '3', k: 0.35, sel: '6', tex: 'concrete', frame: 'rivets', orn: 'cross',   shape: 'round',   btn: 'bevel', head: 'plate' },
  bone:     { id: 'bone',     accent: ['p', '5', 'p'], tint: '6', k: 0.30, sel: '6', tex: 'bone',    frame: 'bones',  orn: 'skull',   shape: 'round',   btn: 'plate', head: 'double' },
  plastic:  { id: 'plastic',  accent: ['h', 'h', 'f'], tint: 'i', k: 0.55, sel: 'i', tex: 'plastic', frame: 'seams',  orn: 'led',     shape: 'round',   btn: 'flat',  head: 'underline' },
  hide:     { id: 'hide',     accent: ['8', '9', 'a'], tint: '7', k: 0.50, sel: '6', tex: 'weave',   frame: 'stitch', orn: 'patch',   shape: 'round',   btn: 'stitch', head: 'double' },
  bark:     { id: 'bark',     accent: ['j', 'j', 'a'], tint: 'k', k: 0.60, sel: 'k', tex: 'grain',   frame: 'vines',  orn: 'leaf',    shape: 'round',   btn: 'stitch', head: 'underline' },
  rust:     { id: 'rust',     accent: ['8', 'a', 'e'], tint: '7', k: 0.65, sel: 'd', tex: 'rust',    frame: 'rivets', orn: 'gear',    shape: 'chamfer', btn: 'bevel', head: 'plate' },
  neon:     { id: 'neon',     accent: ['n', '5', 'h'], tint: 'o', k: 0.35, sel: 'o', tex: 'grid',    frame: 'glitch', orn: 'diamond', shape: 'chamfer', btn: 'flat',  head: 'double' },
  cult:     { id: 'cult',     accent: ['o', 'p', 'c'], tint: 'o', k: 0.65, sel: 'o', tex: 'mottle',  frame: 'glitch', orn: 'eye',     shape: 'round',   btn: 'plate', head: 'plate' },
  cable:    { id: 'cable',    accent: ['c', '5', 'b'], tint: 'd', k: 0.40, sel: 'd', tex: 'wires',   frame: 'cables', orn: 'plug',    shape: 'chamfer', btn: 'flat',  head: 'underline' },
};
export const THEME_IDS = Object.keys(THEMES);

/** Race → theme (the playable races of data/races.js). */
export const RACE_THEME = {
  human: 'concrete', skeleton: 'bone', android: 'plastic', 'mutant-beast': 'hide', 'mutant-plant': 'bark',
  tekhonok: 'rust', cringegon: 'neon', skrilet: 'cable', 'cyber-spirit': 'neon',
};
/** Faction origin (data/world/origins.js) → theme; overrides the race. */
export const ORIGIN_THEME = {
  aiParty: 'concrete', aiSlave: 'cable', tinBrotherhood: 'rust', pirates: 'rust', scavengers: 'rust', cult: 'cult',
  renegades: 'hide', neutralVillages: 'bark', technikums: 'plastic', mutantsBeast: 'hide', mutantsPlant: 'bark', warprom: 'concrete',
};
export const themeIdFor = (hero) => (hero && (ORIGIN_THEME[hero.origin] || RACE_THEME[hero.race])) || 'steel';

// ---------------------------------------------------------------- state: current theme + preference
const KEY = 'dnd.theme';
let prefs = null;
export function themePrefs() {
  if (prefs) return prefs;
  prefs = { mode: 'auto', id: 'steel' };
  try { Object.assign(prefs, JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}')); } catch { /* private mode */ }
  if (!THEMES[prefs.id]) prefs.id = 'steel';
  return prefs;
}
export function setThemePref(mode, id) {
  const p = themePrefs();
  p.mode = mode; if (id && THEMES[id]) p.id = id;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
let current = THEMES.steel;
export const getTheme = () => current;
export function setTheme(id) { current = THEMES[id] || THEMES.steel; return current; }
/** Per frame (main.js): auto — by the hero, manual — the chosen one; no hero (menu, creation) — neutral steel. */
export function syncTheme(game) {
  const p = themePrefs();
  const id = p.mode === 'manual' ? p.id : themeIdFor(game?.save?.hero);
  if (id !== current.id) current = THEMES[id];
}
/** Chrome colour (window frames of modal/tooltip). */
export const chrome = () => PAL[current.accent[0] === '3' ? 'h' : current.accent[0]];

// ---------------------------------------------------------------- derived colours (cached per theme)
const derived = new Map();
function dv(th) {
  let d = derived.get(th.id);
  if (d) return d;
  const surf = {};
  for (const f of SURFACE) surf[f] = th.k ? hueShift(f, PAL[th.tint], th.k) : f;
  const tex = {}; // texture colours per surface: dark speck, deep speck, hue speck (luminance <= the base)
  for (const f of SURFACE) {
    const s = surf[f];
    tex[f] = { dk: darker(s, 0.72), deep: darker(s, 0.5), hue: hueShift(s, PAL[th.tint], Math.min(1, th.k + 0.35)) };
  }
  const title = contrast(PAL[th.accent[1]], PAL['1']) >= 4.5 ? PAL[th.accent[1]] : PAL['5'];
  d = { surf, tex, title, edge: PAL[th.accent[0]], glow: PAL[th.accent[2]], sel: PAL[th.sel], a1: PAL[th.accent[1]] };
  derived.set(th.id, d);
  return d;
}
export const themeTitleColor = (th = current) => dv(th).title;
export const themeSurface = (fill, th = current) => dv(th).surf[fill] || fill;

/** Worst-case contrast of the main text colours against the theme's surfaces (tests, docs). */
export function themeContrast(th) {
  const d = dv(th), out = { text: 99, sub: 99, title: contrast(d.title, d.surf[PAL['1']]) };
  for (const f of SURFACE) {
    for (const bg of [d.surf[f], d.tex[f].dk, d.tex[f].deep, d.tex[f].hue]) {
      out.text = Math.min(out.text, contrast(PAL['5'], bg));
      if (f === PAL['1']) out.sub = Math.min(out.sub, contrast(PAL['4'], bg));
    }
  }
  return out;
}

// ---------------------------------------------------------------- procedural textures (64x64 seamless tiles, cached)
const TILE = 64;
const mkCanvas = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const seedOf = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function paintTile(g, th, surf, T) {
  const r = rng(seedOf(th.id + surf));
  g.fillStyle = surf; g.fillRect(0, 0, TILE, TILE);
  const wrap = (fn) => { for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) fn(dx, dy); };
  const px = (c, x, y, w = 1, h = 1, a = 1) => { g.globalAlpha = a; g.fillStyle = c; wrap((dx, dy) => g.fillRect(x + dx, y + dy, w, h)); g.globalAlpha = 1; };
  switch (th.tex) {
    case 'brushed': // horizontal brushed steel
      for (let i = 0; i < 70; i++) px(r() < 0.6 ? T.dk : T.hue, (r() * TILE) | 0, (r() * TILE) | 0, 6 + ((r() * 16) | 0), 1, 0.5);
      break;
    case 'concrete': // speckles + a hairline crack + a seam every tile
      for (let i = 0; i < 90; i++) px(r() < 0.7 ? T.dk : T.deep, (r() * TILE) | 0, (r() * TILE) | 0, 1, 1, 0.7);
      for (let i = 0; i < 40; i++) px(T.hue, (r() * TILE) | 0, (r() * TILE) | 0, 2, 2, 0.35);
      { let x = (r() * TILE) | 0, y = (r() * 20) | 0; for (let i = 0; i < 22; i++) { px(T.deep, x, y, 1, 1, 0.8); y++; x += r() < 0.5 ? 0 : r() < 0.5 ? -1 : 1; } }
      px(T.deep, 0, 0, TILE, 1, 0.6);
      break;
    case 'bone': // porous ivory-dark blotches and small pits
      for (let i = 0; i < 26; i++) { const x = (r() * TILE) | 0, y = (r() * TILE) | 0; px(T.hue, x, y, 3 + ((r() * 3) | 0), 2, 0.5); px(T.dk, x + 1, y + 2, 2, 1, 0.8); }
      for (let i = 0; i < 40; i++) px(T.deep, (r() * TILE) | 0, (r() * TILE) | 0, 1, 1, 0.7);
      break;
    case 'plastic': // glossy diagonal sheen bands + vent dots
      for (let i = -TILE; i < TILE; i += 16) { g.globalAlpha = 0.5; g.fillStyle = T.hue; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 6, 0); g.lineTo(i + 6 + TILE, TILE); g.lineTo(i + TILE, TILE); g.fill(); }
      g.globalAlpha = 1;
      for (let y = 8; y < TILE; y += 16) for (let x = 8; x < TILE; x += 16) px(T.deep, x, y, 2, 2, 0.6);
      break;
    case 'weave': // cloth: crossing threads
      for (let y = 0; y < TILE; y += 2) px(T.dk, 0, y, TILE, 1, 0.55);
      for (let x = 0; x < TILE; x += 2) px(T.hue, x, 0, 1, TILE, 0.45);
      for (let i = 0; i < 14; i++) px(T.deep, (r() * TILE) | 0, (r() * TILE) | 0, 3, 1, 0.6);
      break;
    case 'grain': // wood: vertical grain with knots
      for (let x = 0; x < TILE; x += 4 + ((r() * 3) | 0)) px(r() < 0.5 ? T.dk : T.hue, x, 0, 1, TILE, 0.6);
      for (let i = 0; i < 3; i++) { const x = (r() * TILE) | 0, y = (r() * TILE) | 0; px(T.deep, x, y, 3, 4, 0.7); px(T.hue, x + 1, y + 1, 1, 2, 0.7); }
      break;
    case 'rust': // rust blotches + streaks
      for (let i = 0; i < 18; i++) { const x = (r() * TILE) | 0, y = (r() * TILE) | 0; px(T.hue, x, y, 3 + ((r() * 8) | 0), 2 + ((r() * 4) | 0), 0.65); }
      for (let i = 0; i < 14; i++) px(T.deep, (r() * TILE) | 0, (r() * TILE) | 0, 1, 6 + ((r() * 14) | 0), 0.55);
      for (let i = 0; i < 50; i++) px(T.dk, (r() * TILE) | 0, (r() * TILE) | 0, 1, 1, 0.9);
      break;
    case 'grid': // neon grid: dark cells, hue lines
      for (let i = 0; i < TILE; i += 16) { px(T.hue, i, 0, 1, TILE, 0.7); px(T.hue, 0, i, TILE, 1, 0.7); }
      for (let i = 8; i < TILE; i += 16) { px(T.dk, i, 0, 1, TILE, 0.5); px(T.dk, 0, i, TILE, 1, 0.5); }
      break;
    case 'mottle': // cult: smoky mottling + faint ring sigils
      for (let i = 0; i < 22; i++) px(r() < 0.5 ? T.hue : T.dk, (r() * TILE) | 0, (r() * TILE) | 0, 4 + ((r() * 8) | 0), 3 + ((r() * 5) | 0), 0.5);
      g.strokeStyle = T.deep; g.globalAlpha = 0.6; g.lineWidth = 1; g.beginPath(); g.arc(32, 32, 10, 0, 7); g.stroke(); g.globalAlpha = 1;
      break;
    case 'wires': // cable: diagonal wire bundles
      for (let k = 0; k < 4; k++) {
        const off = k * 16;
        for (let i = 0; i < TILE; i++) { px(k % 2 ? T.deep : T.hue, (i + off) % TILE, i, 1, 1, 0.7); px(T.dk, (i + off + 2) % TILE, i, 1, 1, 0.5); }
      }
      break;
    default:
  }
}
const tiles = new Map();
function pattern(ctx, th, surf) {
  const key = `${th.id}|${surf}`;
  let p = tiles.get(key);
  if (!p) {
    const c = mkCanvas(TILE, TILE), g = c.getContext('2d');
    paintTile(g, th, dv(th).surf[surf], dv(th).tex[surf]);
    p = ctx.createPattern(c, 'repeat');
    tiles.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- pixel ornaments (corner glyphs): x = title colour, o = glow colour, e = edge
const GLYPHS = {
  screw:   ['.ee.', 'eooe', 'eooe', '.ee.'],
  cross:   ['..x..', '..x..', 'xxoxx', '..x..', '..x..'],
  skull:   ['.xxx.', 'x.x.x', 'xxxxx', '.xxx.', '.x.x.'],
  led:     ['xxx', 'xox', 'xxx'],
  patch:   ['x...x', '.x.x.', '..o..', '.x.x.', 'x...x'],
  leaf:    ['..xxx', '.xxxx', 'xxxx.', 'xxx..', 'x....'],
  gear:    ['x.x.x', '.xxx.', 'xxoxx', '.xxx.', 'x.x.x'],
  diamond: ['..x..', '.xxx.', 'xxoxx', '.xxx.', '..x..'],
  eye:     ['.xxx.', 'xxoxx', '.xxx.'],
  plug:    ['x.x', 'xxx', '.e.', '.e.'],
};
function glyph(g, name, x, y, flip, d) {
  const rows = GLYPHS[name], col = { x: d.a1, o: d.glow, e: d.edge };
  const h = rows.length, w = rows[0].length;
  // 1 px dark outline for legibility on any texture
  g.fillStyle = PAL['0'];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rows[j][i] !== '.') {
    const gx = flip ? x - i : x + i, gy = flip ? y - j : y + j;
    g.fillRect(gx - 1, gy, 3, 1); g.fillRect(gx, gy - 1, 1, 3);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = rows[j][i];
    if (c === '.') continue;
    g.fillStyle = col[c];
    g.fillRect(flip ? x - i : x + i, flip ? y - j : y + j, 1, 1);
  }
}

// ---------------------------------------------------------------- box shape
function shapePath(g, w, h, th, kind) {
  const x = 0.5, y = 0.5, W = w - 1, H = h - 1;
  g.beginPath();
  if (th.shape === 'chamfer') {
    const c = kind === 'btn' ? 3 : 5;
    g.moveTo(x + c, y); g.lineTo(x + W - c, y); g.lineTo(x + W, y + c); g.lineTo(x + W, y + H - c);
    g.lineTo(x + W - c, y + H); g.lineTo(x + c, y + H); g.lineTo(x, y + H - c); g.lineTo(x, y + c);
    g.closePath();
  } else {
    const r = kind === 'btn' ? 4 : 6;
    g.moveTo(x + r, y); g.arcTo(x + W, y, x + W, y + H, r); g.arcTo(x + W, y + H, x, y + H, r);
    g.arcTo(x, y + H, x, y, r); g.arcTo(x, y, x + W, y, r); g.closePath();
  }
}

// ---------------------------------------------------------------- frames (kept within ~4 px of the edge)
function drawFrame(g, w, h, th, d, big) {
  const e = d.edge, hi = (a) => { g.globalAlpha = a; g.fillStyle = PAL['5']; };
  const inset = 3;
  switch (th.frame) {
    case 'bolts': case 'rivets': {
      // inner double line + rivets in the corners (and along the long edges of big panels)
      g.globalAlpha = 0.5; g.strokeStyle = PAL['0']; g.strokeRect(inset + 0.5, inset + 0.5, w - 2 * inset - 1, h - 2 * inset - 1); g.globalAlpha = 1;
      const pts = big ? [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]] : [];
      if (big) for (let x = 48; x < w - 24; x += 48) { pts.push([x, 4], [x, h - 5]); }
      for (const [x, y] of pts) {
        g.fillStyle = PAL['0']; g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = th.frame === 'rivets' ? d.edge : PAL['4']; g.fillRect(x - 1, y - 1, 2, 2);
        hi(0.8); g.fillRect(x - 1, y - 1, 1, 1);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'seams': { // moulded plastic: a recessed inner line with a highlight
      g.globalAlpha = 0.55; g.strokeStyle = PAL['0']; g.strokeRect(inset + 0.5, inset + 0.5, w - 2 * inset - 1, h - 2 * inset - 1);
      g.globalAlpha = 0.25; g.strokeStyle = PAL['5']; g.strokeRect(inset + 1.5, inset + 1.5, w - 2 * inset - 3, h - 2 * inset - 3);
      g.globalAlpha = 1;
      break;
    }
    case 'stitch': { // dashed stitches
      g.fillStyle = d.a1; g.globalAlpha = 0.85;
      for (let x = 7; x < w - 9; x += 6) { g.fillRect(x, inset + 1, 3, 1); g.fillRect(x, h - inset - 2, 3, 1); }
      for (let y = 7; y < h - 9; y += 6) { g.fillRect(inset + 1, y, 1, 3); g.fillRect(w - inset - 2, y, 1, 3); }
      g.globalAlpha = 1;
      break;
    }
    case 'bones': { if (!big) break; // knuckle beads in the corners + a bone bar over the top edge of wide panels
      for (const [x, y] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]]) {
        g.fillStyle = PAL['0']; g.fillRect(x - 3, y - 3, 7, 7);
        g.fillStyle = PAL['5']; g.fillRect(x - 2, y - 2, 5, 5); g.fillStyle = PAL['p']; g.fillRect(x - 2, y + 1, 5, 2);
      }
      {
        const bw = Math.min(64, w - 40), bx = ((w - bw) / 2) | 0;
        g.fillStyle = PAL['0']; g.fillRect(bx - 1, 0, bw + 2, 5);
        g.fillStyle = PAL['5']; g.fillRect(bx, 0, bw, 3); g.fillStyle = PAL['p']; g.fillRect(bx, 3, bw, 1);
        g.fillStyle = PAL['5']; g.fillRect(bx - 3, 0, 4, 5); g.fillRect(bx + bw - 1, 0, 4, 5);
      }
      break;
    }
    case 'vines': { if (!big) break; // a vine creeping along two edges
      g.fillStyle = d.edge;
      for (let x = 10, i = 0; x < w - 10; x += 2, i++) { g.fillRect(x, 1 + ((Math.sin(i * 0.45) + 1) * 1.2 | 0), 2, 1); }
      for (let y = 10, i = 0; y < h - 10; y += 2, i++) { g.fillRect(w - 3 - ((Math.sin(i * 0.45) + 1) * 1.2 | 0), y, 1, 2); }
      g.fillStyle = PAL['k'];
      for (let x = 18; x < w - 18; x += 26) g.fillRect(x, 4, 3, 2);
      g.fillStyle = d.a1; for (let x = 18; x < w - 18; x += 26) g.fillRect(x + 1, 4, 1, 1);
      break;
    }
    case 'glitch': { // bracket corners + shifted slice, static (no flicker)
      const L = Math.min(14, (w / 4) | 0);
      g.fillStyle = d.edge;
      for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]]) {
        g.fillRect(sx > 0 ? cx : cx - L, cy, L + 1, 1); g.fillRect(cx, sy > 0 ? cy : cy - L, 1, L + 1);
      }
      if (!big) break;
      g.fillStyle = d.glow; g.globalAlpha = 0.9;
      g.fillRect(4, 3, 8, 1); g.fillRect(w - 13, h - 4, 8, 1);
      g.fillStyle = PAL['n']; g.fillRect(w - 20, 2, 5, 1); g.fillRect(8, h - 3, 5, 1);
      g.globalAlpha = 1;
      break;
    }
    case 'cables': { if (!big) break; // a sagging cable along the bottom edge with a plug at the left
      g.fillStyle = PAL['0']; for (let x = 8; x < w - 8; x++) g.fillRect(x, h - 5 + Math.round(Math.sin(x / 9) * 1.2), 1, 3);
      g.fillStyle = d.edge; for (let x = 8; x < w - 8; x++) g.fillRect(x, h - 4 + Math.round(Math.sin(x / 9) * 1.2), 1, 1);
      g.fillStyle = d.glow; for (let x = 20; x < w - 8; x += 40) g.fillRect(x, h - 4 + Math.round(Math.sin(x / 9) * 1.2), 3, 1);
      g.fillStyle = PAL['0']; g.fillRect(3, h - 7, 6, 5); g.fillStyle = PAL['4']; g.fillRect(4, h - 6, 4, 3);
      break;
    }
    default:
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- box painting + cache
function paintBox(g, w, h, th, o) {
  const d = dv(th), btn = o.kind === 'btn';
  const surface = SURFACE.has(o.fill);
  const fill = o.fill === PAL['3'] || o.fill === PAL.i ? o.fill : (d.surf[o.fill] || o.fill);
  shapePath(g, w, h, th, o.kind);
  g.fillStyle = o.sel ? d.sel : fill; g.fill();
  g.save(); g.clip();
  if (surface) { g.globalAlpha = btn ? 0.8 : 1; g.fillStyle = pattern(g, th, o.fill); g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  // depth: darkening towards the lower edge (never lightens the text area)
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20,20,28,0)'); grad.addColorStop(1, 'rgba(20,20,28,0.28)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const big = w >= 200 && h >= 90;
  if (!btn && w >= 28 && h >= 28) drawFrame(g, w, h, th, d, big);
  if (btn && !o.disabled) {
    // bevel: light top-left edge, dark bottom-right edge (1-2 px, away from the text)
    if (th.btn === 'bevel' || th.btn === 'plate') {
      g.fillStyle = PAL['5']; g.globalAlpha = o.hover ? 0.35 : 0.2; g.fillRect(1, 1, w - 2, 1); g.fillRect(1, 1, 1, h - 2);
      g.fillStyle = PAL['0']; g.globalAlpha = 0.55; g.fillRect(1, h - 2, w - 2, 1); g.fillRect(w - 2, 1, 1, h - 2);
    }
    if (th.btn === 'stitch' && w >= 40 && h >= 20) { g.globalAlpha = 0.7; g.fillStyle = d.a1; for (let x = 6; x < w - 8; x += 5) { g.fillRect(x, 3, 2, 1); g.fillRect(x, h - 4, 2, 1); } }
    if (th.btn === 'plate' && w >= 32) { g.globalAlpha = 0.9; g.fillStyle = d.edge; g.fillRect(3, 3, 2, 2); g.fillRect(w - 5, 3, 2, 2); g.fillRect(3, h - 5, 2, 2); g.fillRect(w - 5, h - 5, 2, 2); }
    g.globalAlpha = 1;
    if (o.hover || o.sel) { g.fillStyle = d.glow; g.fillRect(4, h - 3, w - 8, 2); } // glow bar
  }
  g.restore();
  // ornaments in two opposite corners of big panels (small ones stay clean: text sits close to the edge)
  if (!btn && big) { // top-right and bottom-left: titles, icons and text start at the left / top
    glyph(g, th.orn, w - 14, 9, false, d);
    glyph(g, th.orn, 13, h - 10, true, d);
  }
  shapePath(g, w, h, th, o.kind);
  g.strokeStyle = o.border === EDGE_DEFAULT || !o.border ? d.edge : o.border;
  if (btn && (o.hover || o.sel) && !o.disabled) g.strokeStyle = d.glow;
  g.lineWidth = 1; g.stroke();
}

const cache = new Map();
let cachePx = 0;
const CACHE_PX = 14e6;
/**
 * Draw a themed box. o: { fill, border, kind: 'panel'|'btn', hover?, sel?, disabled? }. → false if not themed
 * (not a surface fill, tiny, or no DOM): the caller draws the plain version.
 */
export function drawThemedBox(ctx, x, y, w, h, o) {
  if (typeof document === 'undefined' || w < 12 || h < 12) return false;
  if (!(SURFACE.has(o.fill) || (o.kind === 'btn' && (o.fill === PAL['3'] || o.fill === PAL.i)))) return false;
  const th = current;
  const key = `${th.id}|${o.kind}|${o.hover ? 1 : 0}${o.sel ? 1 : 0}${o.disabled ? 1 : 0}|${w}|${h}|${o.fill}|${o.border}`;
  let c = cache.get(key);
  if (!c) {
    if (w * h > 3e6) { ctx.save(); ctx.translate(x, y); paintBox(ctx, w, h, th, o); ctx.restore(); return true; }
    if (cachePx > CACHE_PX) { cache.clear(); cachePx = 0; }
    c = mkCanvas(w, h);
    paintBox(c.getContext('2d'), w, h, th, o);
    cache.set(key, c); cachePx += w * h;
  }
  ctx.drawImage(c, x, y);
  return true;
}

/** Heading decoration (call BEFORE the text): underline / plate / double rule under a title of width tw. */
export function drawHeading(ctx, x, y, w, tw, h = 24) {
  const th = current, d = dv(th);
  const ex = x + Math.min(w, Math.max(tw + 16, 120));
  ctx.save();
  if (th.head === 'plate') {
    ctx.fillStyle = PAL['0']; ctx.globalAlpha = 0.55; ctx.fillRect(x - 10, y - 4, ex - x + 14, h + 8);
    ctx.globalAlpha = 1; ctx.fillStyle = d.edge; ctx.fillRect(x - 10, y - 4, 3, h + 8);
  } else {
    ctx.fillStyle = d.edge; ctx.fillRect(x, y + h + 6, ex - x, 2);
    if (th.head === 'double') { ctx.fillStyle = d.glow; ctx.fillRect(x, y + h + 10, Math.round((ex - x) * 0.45), 1); }
    else { ctx.fillStyle = d.glow; ctx.fillRect(x, y + h + 6, 18, 2); }
  }
  ctx.restore();
}
