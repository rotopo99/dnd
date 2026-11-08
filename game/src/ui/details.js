// Details panel: a tooltip spec (ui/tooltip.js format) drawn into a fixed rectangle with full word wrap and a scroll
// (ui/scroll.js) when the text is taller than the panel. Used by modal options with `detail` (talent picks, shop,
// loot) and the creation talent page. Also shared row layout for hover tooltips (specRows).
//   const d = createDetails();  updateDetails(d, rect, mouse) in update();  drawDetails(ctx, d, rect, spec, key) in render
import { C, FONT, FONT_B, LINE, text, wrap, panel } from './draw.js';
import { drawStatusIcon } from '../assets/status-icons.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from './scroll.js';

const PAD = 10;
const GAP_H = 6;

/** Wrapped rows of a spec for width w: { rows: [{text, color, font, indent} | {gap}], h } (h — content height). */
export function specRows(ctx, spec, w) {
  const iw = spec.glyph ? 40 : 0;
  const rows = [];
  if (spec.title) for (const s of wrap(ctx, spec.title, w - iw, FONT_B)) rows.push({ text: s, color: spec.titleColor || C.h, font: FONT_B, indent: iw });
  for (const l of spec.lines || []) {
    const o = typeof l === 'string' ? { text: l } : l;
    if (!o.text) { rows.push({ gap: true }); continue; }
    const ind = rows.length < 2 ? iw : 0;
    for (const s of wrap(ctx, String(o.text), w - ind, o.font || FONT)) rows.push({ text: s, color: C[o.color] || o.color || C['5'], font: o.font || FONT, indent: ind });
  }
  const h = Math.max(spec.glyph ? 46 : 0, rows.reduce((a, r) => a + (r.gap ? GAP_H : LINE), 0));
  return { rows, h };
}

/** Draw rows (and the glyph tile) with the top-left corner at x, y. */
export function drawRows(ctx, spec, rows, x, y) {
  if (spec.glyph) {
    panel(ctx, x - 2, y + 2, 34, 34, C['2'], spec.glyph.color || C['4']);
    if (spec.glyph.icon) drawStatusIcon(ctx, spec.glyph.icon, x - 1, y + 3, 32);
    else text(ctx, spec.glyph.ch, x + 15, y + 9, spec.glyph.color || C['5'], 'bold 20px monospace', 'center');
  }
  let yy = y;
  for (const r of rows) {
    if (r.gap) { yy += GAP_H; continue; }
    text(ctx, r.text, x + (r.indent || 0), yy, r.color, r.font);
    yy += LINE;
  }
}

export const createDetails = () => ({ ...createScroll(), key: null });

/** Wheel / slider over the panel. Returns true if the mouse is busy with the slider. */
export function updateDetails(d, r, m) {
  return updateScroll(d, r, d.contentH || 0, m, { step: 48 });
}

/** Panel with the full spec; key — identity of the shown thing (a change scrolls back to the top). */
export function drawDetails(ctx, d, r, spec, key = spec?.title) {
  panel(ctx, r.x, r.y, r.w, r.h, C['1'], C['3']);
  if (!spec) return;
  if (key !== d.key) { d.key = key; d.off = 0; }
  const w = r.w - 2 * PAD - SCROLLBAR_W - 2;
  const { rows, h } = specRows(ctx, spec, w);
  d.contentH = h + 2 * PAD;
  d.max = Math.max(0, h + 2 * PAD - r.h);
  d.off = Math.max(0, Math.min(d.max, d.off));
  beginClip(ctx, r);
  drawRows(ctx, spec, rows, r.x + PAD, r.y + PAD - d.off);
  endClip(ctx);
  drawScrollbar(ctx, d, r);
}
