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
const KEY_FONT = '12px monospace';
const MIN_PX = 11;
const sized = (font, px) => font.replace(/\d+px/, `${px}px`);
const pxOf = (font) => Number(/(\d+)px/.exec(font)?.[1]) || 16;
/**
 * Auto-fit a label into width (and up to maxLines lines): the font shrinks down to 11 px, then the label wraps,
 * then it is cut with an ellipsis. → { lines, font, px, cut } (cut — the full text needs a tooltip).
 */
export function fitLabel(ctx, s, width, font = FONT_B, maxLines = 1, minPx = MIN_PX) {
  s = String(s ?? '');
  for (let px = pxOf(font); px >= minPx; px--) {
    const f = sized(font, px);
    ctx.font = f;
    if (ctx.measureText(s).width <= width) return { lines: [s], font: f, px, cut: false };
    if (maxLines > 1 && px <= pxOf(font) - 2) {
      const ls = wrap(ctx, s, width, f);
      if (ls.length <= maxLines && ls.every((l) => ctx.measureText(l).width <= width)) return { lines: ls, font: f, px, cut: false };
    }
  }
  const f = sized(font, minPx);
  if (maxLines > 1) {
    const ls = wrap(ctx, s, width, f).slice(0, maxLines);
    ls[maxLines - 1] = fit(ctx, ls[maxLines - 1] + (wrap(ctx, s, width, f).length > maxLines ? '…' : ''), width, f);
    return { lines: ls, font: f, px: minPx, cut: true };
  }
  return { lines: [fit(ctx, s, width, f)], font: f, px: minPx, cut: true };
}
/** Natural width of a button for a label (padding and the hotkey included). */
export function buttonWidth(ctx, label, font = FONT_B, key = '') {
  ctx.font = font;
  const lw = ctx.measureText(String(label ?? '')).width;
  ctx.font = KEY_FONT;
  return Math.ceil(lw + 16 + (key ? (ctx.measureText(key).width + 6) * 2 : 0));
}
/**
 * Place buttons of natural width into up to `rows` rows inside [x, x + w] (right-aligned by default).
 * items: [{ label, key?, minW? }] → [{ x, y, w, h, row }] in the same order; rows share the height h.
 */
export function flowButtons(ctx, items, { x, y, w, h, gap = 4, rows = 2, font = FONT_B, minW = 48, align = 'right' }) {
  const nat = items.map((b) => Math.max(b.minW || minW, buttonWidth(ctx, b.label, font, b.key)));
  const sum = (a) => a.reduce((t, v) => t + v, 0) + gap * Math.max(0, a.length - 1);
  let split = [items.map((_, i) => i)];
  if (sum(nat) > w && rows > 1 && items.length > 1) {
    // two rows: the split with the smallest wider row
    let best = null;
    for (let k = 1; k < items.length; k++) {
      const m = Math.max(sum(nat.slice(0, k)), sum(nat.slice(k)));
      if (!best || m < best.m) best = { k, m };
    }
    split = [items.map((_, i) => i).slice(0, best.k), items.map((_, i) => i).slice(best.k)];
  }
  const rh = split.length > 1 ? Math.floor((h - gap) / 2) : h;
  const out = [];
  split.forEach((idx, r) => {
    const ws = idx.map((i) => nat[i]);
    const total = sum(ws);
    if (total > w) { const k = (w - gap * (ws.length - 1)) / (total - gap * (ws.length - 1)); for (let i = 0; i < ws.length; i++) ws[i] = Math.floor(ws[i] * k); }
    let cx = align === 'right' ? x + w - sum(ws) : x;
    idx.forEach((i, j) => { out[i] = { x: cx, y: y + r * (rh + gap), w: ws[j], h: rh, row: r }; cx += ws[j] + gap; });
  });
  return out;
}

export function button(ctx, b, hover) {
  const fill = b.selected ? C.i : hover && !b.disabled ? C['3'] : C['2'];
  const border = b.selected ? C.h : hover && !b.disabled ? C['4'] : C['3'];
  panel(ctx, b.x, b.y, b.w, b.h, fill, border);
  const col = b.disabled ? C['3'] : C['5'];
  const font = b.font || FONT_B;
  // the hotkey sits in the top-left corner: the label is centred in the space right of it
  ctx.font = KEY_FONT;
  const kw = b.key ? ctx.measureText(b.key).width + 6 : 0;
  const left = b.x + 6 + kw, right = b.x + b.w - 6;
  const cx = (left + right) / 2, aw = right - left;
  let cut = false;
  if (b.sub) {
    const L = fitLabel(ctx, b.label, aw, font, 1);
    const S = fitLabel(ctx, b.sub, aw, FONT, 1, 13); // descriptions stay readable: cut (full text in the tip) below 13 px
    const gapY = Math.max(0, (b.h - L.px - S.px - 4) / 2);
    text(ctx, L.lines[0], cx, b.y + gapY, col, L.font, 'center');
    text(ctx, S.lines[0], cx, b.y + gapY + L.px + 4, b.disabled ? C['3'] : b.subColor || C['4'], S.font, 'center');
    cut = L.cut || S.cut;
  } else {
    const L = fitLabel(ctx, b.label, aw, font, b.h >= 30 ? 2 : 1);
    const lh = L.px + 2, top = b.y + (b.h - lh * L.lines.length) / 2 + 1;
    L.lines.forEach((l, i) => text(ctx, l, cx, top + i * lh, col, L.font, 'center'));
    cut = L.cut;
  }
  if (b.key) text(ctx, b.key, b.x + 5, b.y + 3, b.disabled ? C['3'] : C.a, KEY_FONT);
  if (cut && !b.tip && !b.detail) tipHook?.(b.x, b.y, b.w, b.h, { title: b.label, lines: b.sub ? [b.sub] : [] });
}
let tipHook = null;
/** ui/tooltip.js registers its hotspot here (no import cycle): cut button labels get their full text as a tip. */
export function setButtonTipHook(fn) { tipHook = fn; }

/** Resource bar with a 1 px frame of colour 0. */
export function bar(ctx, x, y, w, h, value, max, res, tmp = 0) {
  const c = RES_COLORS[res];
  ctx.fillStyle = C['0'];
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = c.empty;
  ctx.fillRect(x, y, w, h);
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fw = Math.round(w * k);
  ctx.fillStyle = c.fill;
  ctx.fillRect(x, y, fw, h);
  if (tmp > 0 && max > 0) tmpSegment(ctx, x, y, w, h, fw, tmp / max);
}

/** Temporary HP segment (colour TMP_COLOR): right after the HP fill; if it does not fit — from the right edge back. */
export const TMP_COLOR = C.h;
function tmpSegment(ctx, x, y, w, h, fw, k) {
  const sw = Math.max(2, Math.min(w, Math.round(w * k)));
  const sx = fw + sw <= w ? x + fw : x + w - sw;
  ctx.fillStyle = TMP_COLOR;
  ctx.fillRect(sx, y, sw, h);
  if (h >= 4) { ctx.fillStyle = C['5']; ctx.fillRect(sx, y, sw, 1); }
  if (sx > x) { ctx.fillStyle = C['0']; ctx.fillRect(sx - 1, y, 1, h); }
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
export function resLine(ctx, x, y, w, res, value, max, label, tmp = 0) {
  const iconName = res === 'hp' ? 'res_hp' : res === 'mrl' ? 'res_morale' : 'res_energy';
  if (!drawIcon(ctx, iconName, x, y, 16)) text(ctx, label[0], x + 4, y, RES_COLORS[res].fill, FONT_B);
  text(ctx, label, x + 22, y, C['4']);
  const bx = x + 64;
  const tail = tmp > 0 ? `+${tmp}` : '';
  ctx.font = FONT;
  const tw = tail ? Math.ceil(ctx.measureText(tail).width) + 4 : 0;
  const bw = w - 64 - 72 - tw;
  bar(ctx, bx, y + 3, bw, 10, value, max, res, tmp);
  const num = `${Math.max(0, value)}/${max}`;
  text(ctx, num, x + w - tw, y, C['5'], FONT, 'right');
  if (tail) text(ctx, tail, x + w, y, TMP_COLOR, FONT_B, 'right');
}

/** Fill the whole screen with the background colour 0. */
export function clear(ctx, w, h) {
  ctx.fillStyle = C['0'];
  ctx.fillRect(0, 0, w, h);
}
