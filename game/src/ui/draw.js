// Shared immediate-mode UI drawing helpers: palette colours, text, wrapping, panels, buttons, bars, icons.
// Colours follow docs/STYLE.md (resource bars: fill = resource colour, empty = its tile colour, frame = 0).
import { PALETTE, PALETTE_KEYS } from '../assets/sprites.js';

/** Palette colour by key ('0'..'p'). */
export const C = Object.fromEntries([...PALETTE_KEYS].map((k, i) => [k, PALETTE[i]]));

export const FONT = '16px monospace';
export const FONT_B = 'bold 16px monospace';
export const FONT_L = 'bold 24px monospace';
export const FONT_XL = 'bold 48px monospace';
export const LINE = 20;

export const RES_COLORS = {
  hp: { fill: C.c, empty: C.d },
  mrl: { fill: C.f, empty: C.g },
  enr: { fill: C.b, empty: C['6'] },
  xp: { fill: C.a, empty: C['2'] },
};

export function text(ctx, s, x, y, color = C['5'], font = FONT, align = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(s, x, y);
}

const wrapCache = new Map();
/** Word-wrap a string to width (cached by font+width+text). Returns array of lines. */
export function wrap(ctx, s, width, font = FONT) {
  const key = `${font}|${width}|${s}`;
  let lines = wrapCache.get(key);
  if (lines) return lines;
  ctx.font = font;
  lines = [];
  for (const para of String(s).split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > width) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  if (wrapCache.size > 2000) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
}

/** Draw wrapped text, returns the y after the last line. maxLines cuts with an ellipsis. */
export function textBlock(ctx, s, x, y, width, color = C['5'], font = FONT, lh = LINE, maxLines = 99) {
  const lines = wrap(ctx, s, width, font);
  const n = Math.min(lines.length, maxLines);
  for (let i = 0; i < n; i++) {
    let l = lines[i];
    if (i === n - 1 && lines.length > n) l = l.replace(/.?.?.?$/, '…');
    text(ctx, l, x, y + i * lh, color, font);
  }
  return y + n * lh;
}

/** Cut text to fit width, adding an ellipsis. */
export function fit(ctx, s, width, font = FONT) {
  ctx.font = font;
  if (ctx.measureText(s).width <= width) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= width) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

export function roundRect(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dark rounded tile panel (STYLE: flat symbol on a dark rounded tile). */
export function panel(ctx, x, y, w, h, fill = C['1'], border = C['3']) {
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export const inRect = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Find the button under the mouse in a list of { x, y, w, h, disabled? }. */
export function hitButton(list, m) {
  if (!m.inside) return null;
  for (let i = list.length - 1; i >= 0; i--) if (inRect(list[i], m.x, m.y)) return list[i];
  return null;
}

/**
 * Button: { x, y, w, h, label, sub?, disabled?, selected?, key? }.
 * hover — highlight; colours: normal steel, selected cyan (player colour), disabled grey text.
 */
export function button(ctx, b, hover) {
  const fill = b.selected ? C.i : hover && !b.disabled ? C['3'] : C['2'];
  const border = b.selected ? C.h : hover && !b.disabled ? C['4'] : C['3'];
  panel(ctx, b.x, b.y, b.w, b.h, fill, border);
  const col = b.disabled ? C['3'] : C['5'];
  const font = b.font || FONT_B;
  if (b.sub) {
    text(ctx, fit(ctx, b.label, b.w - 12, font), b.x + b.w / 2, b.y + b.h / 2 - 19, col, font, 'center');
    text(ctx, fit(ctx, b.sub, b.w - 12), b.x + b.w / 2, b.y + b.h / 2 + 1, b.disabled ? C['3'] : b.subColor || C['4'], FONT, 'center');
  } else {
    text(ctx, fit(ctx, b.label, b.w - 12, font), b.x + b.w / 2, b.y + b.h / 2 - 9, col, font, 'center');
  }
  if (b.key) text(ctx, b.key, b.x + 5, b.y + 3, b.disabled ? C['3'] : C.a, '12px monospace');
}

/** Resource bar with a 1 px frame of colour 0. */
export function bar(ctx, x, y, w, h, value, max, res) {
  const c = RES_COLORS[res];
  ctx.fillStyle = C['0'];
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = c.empty;
  ctx.fillRect(x, y, w, h);
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  ctx.fillStyle = c.fill;
  ctx.fillRect(x, y, Math.round(w * k), h);
}

// ---------- PNG icons (game/assets/icons/*.png, 256x256) ----------
const icons = new Map();
const ICON_BASE = new URL('../../assets/icons/', import.meta.url);
export function icon(name) {
  if (!name) return null;
  let img = icons.get(name);
  if (!img) {
    img = new Image();
    img.src = new URL(`${name}.png`, ICON_BASE).href;
    icons.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Draw an icon scaled to size (smooth downscale — icons are 256 px). */
export function drawIcon(ctx, name, x, y, size) {
  const img = icon(name);
  if (!img) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x, y, size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Resource line: icon, bar, "value/max". */
export function resLine(ctx, x, y, w, res, value, max, label) {
  const iconName = res === 'hp' ? 'res_hp' : res === 'mrl' ? 'res_morale' : 'res_energy';
  if (!drawIcon(ctx, iconName, x, y, 16)) text(ctx, label[0], x + 4, y, RES_COLORS[res].fill, FONT_B);
  text(ctx, label, x + 22, y, C['4']);
  const bx = x + 64;
  const bw = w - 64 - 72;
  bar(ctx, bx, y + 3, bw, 10, value, max, res);
  text(ctx, `${Math.max(0, value)}/${max}`, x + w, y, C['5'], FONT, 'right');
}

/** Fill the whole screen with the background colour 0. */
export function clear(ctx, w, h) {
  ctx.fillStyle = C['0'];
  ctx.fillRect(0, 0, w, h);
}
