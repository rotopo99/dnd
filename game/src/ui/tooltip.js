// Hover tooltips («hyperlinks»): screens register hot rectangles while rendering, main.js draws the tooltip of the
// hovered one last (over the scene and modals) and clears the list every frame.
//   hotspot(x, y, w, h, tip) — tip: spec or () => spec; showTip(spec) — tip at the mouse right now
//   spec (full text, word-wrapped, height grows; too tall — wider; see ui/details.js specRows): { title, titleColor?, glyph?: { ch, color }, lines: [string | { text, color }], width? }
import { C, panel, inRect } from './draw.js';
import { specRows, drawRows } from './details.js';

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
  // full text, never cut: wrap to the width; taller than the screen — widen until it fits (or the screen is full)
  const maxW = Math.max(120, game.width - 16);
  let w = Math.min(spec.width || 380, maxW);
  let lay = specRows(ctx, spec, w - 20);
  while (lay.h + 12 > game.height - 8 && w < maxW) {
    w = Math.min(maxW, w + 120);
    lay = specRows(ctx, spec, w - 20);
  }
  const h = lay.h + 12;
  let x = mx + 18, y = my + 18;
  if (x + w > game.width - 4) x = Math.max(4, mx - w - 12);
  if (x + w > game.width - 4) x = Math.max(4, game.width - w - 4);
  if (y + h > game.height - 4) y = Math.max(4, game.height - h - 4);
  panel(ctx, x, y, w, h, C['0'], C.h);
  drawRows(ctx, spec, lay.rows, x + 10, y + 6);
}
