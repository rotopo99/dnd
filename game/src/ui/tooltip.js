// Hover tooltips («hyperlinks»): screens register hot rectangles while rendering, main.js draws the tooltip of the
// hovered one last (over the scene and modals) and clears the list every frame.
//   hotspot(x, y, w, h, tip) — tip: spec or () => spec; showTip(spec) — tip at the mouse right now
//   spec: { title, titleColor?, glyph?: { ch, color }, lines: [string | { text, color }], width? }
import { C, FONT, FONT_B, LINE, text, wrap, panel, inRect } from './draw.js';

let spots = [];
let forced = null;
let last = null; // the tip drawn in the last frame (tests: lastTip())
export const lastTip = () => last;

export function hotspot(x, y, w, h, tip) { if (tip) spots.push({ x, y, w, h, tip }); }
export function showTip(spec) { forced = spec; }
export function clearTips() { spots = []; forced = null; }

/** The spec under the mouse (last registered wins) or null. */
export function hoveredTip(m) {
  if (forced) return forced;
  if (!m?.inside) return null;
  for (let i = spots.length - 1; i >= 0; i--) if (inRect(spots[i], m.x, m.y)) return typeof spots[i].tip === 'function' ? spots[i].tip() : spots[i].tip;
  return null;
}

export function renderTips(game) {
  const m = game.input.mouse;
  const spec = hoveredTip(m);
  last = spec;
  clearTips();
  if (spec) drawTip(game, spec, m.x, m.y);
}

export function drawTip(game, spec, mx, my) {
  const { ctx } = game;
  const w = Math.min(spec.width || 380, game.width - 16);
  const iw = spec.glyph ? 40 : 0;
  const tw = w - 20;
  const rows = [];
  if (spec.title) for (const s of wrap(ctx, spec.title, tw - iw, FONT_B)) rows.push({ text: s, color: spec.titleColor || C.h, font: FONT_B, indent: iw });
  for (const l of spec.lines || []) {
    const o = typeof l === 'string' ? { text: l } : l;
    if (!o.text) { rows.push({ text: '', gap: true }); continue; }
    const ind = rows.length < 2 ? iw : 0;
    for (const s of wrap(ctx, o.text, tw - ind, FONT)) rows.push({ text: s, color: C[o.color] || o.color || C['5'], font: FONT, indent: ind });
  }
  const h = Math.max(spec.glyph ? 52 : 0, 12 + rows.reduce((a, r) => a + (r.gap ? 6 : LINE), 0));
  let x = mx + 18, y = my + 18;
  if (x + w > game.width - 4) x = Math.max(4, mx - w - 12);
  if (y + h > game.height - 4) y = Math.max(4, game.height - h - 4);
  panel(ctx, x, y, w, h, C['0'], C.h);
  if (spec.glyph) {
    panel(ctx, x + 8, y + 8, 34, 34, C['2'], spec.glyph.color || C['4']);
    text(ctx, spec.glyph.ch, x + 25, y + 15, spec.glyph.color || C['5'], 'bold 20px monospace', 'center');
  }
  let yy = y + 6;
  for (const r of rows) {
    if (r.gap) { yy += 6; continue; }
    text(ctx, r.text, x + 10 + (r.indent || 0), yy, r.color, r.font);
    yy += LINE;
  }
}
