// Context menu (docs/specs/controls-divinity.md §1–2): RMB click on a map target -> a list of actions at the cursor.
// One menu at a time, kept on game.ctxMenu; main.js draws it over the scene (renderContextMenu), the scene feeds the
// input first (updateContextMenu -> true: the step's mouse / Esc is taken). Closes on Esc, LMB outside, RMB elsewhere
// (the scene opens a new one), a modal, a scene change.
//   openContextMenu(game, {x, y, title?, items: [{id, label, disabled?, reason?, key?, sub?}], onPick(game, id)})
//   closeContextMenu(game), contextMenuOpen(game), menuRect(game) (tests / hover guard)
import { C, FONT, FONT_B, text, panel, inRect } from './draw.js';
import { hotspot } from './tooltip.js';
import { chrome, themeTitleColor } from './theme.js';
import { play } from '../audio/sfx.js';

const ROW = 28, HEAD = 28, PAD = 8, MIN_W = 180, MAX_W = 360;

export function openContextMenu(game, { x, y, title = '', items, onPick, target = null }) {
  if (!items || !items.length) return null;
  const M = { x, y, title, items, onPick, target, scene: game.scene, hover: -1, rect: null };
  layout(game, M);
  game.ctxMenu = M;
  play('uiClick');
  return M;
}
export const closeContextMenu = (game) => { game.ctxMenu = null; };
export const contextMenuOpen = (game) => !!game.ctxMenu && game.ctxMenu.scene === game.scene && !game.modals.length;
export const menuRect = (game) => game.ctxMenu?.rect || null;

function layout(game, M) {
  const ctx = game.ctx;
  let w = MIN_W;
  if (ctx?.measureText) {
    ctx.font = FONT_B; w = Math.max(w, ctx.measureText(M.title).width + PAD * 2);
    ctx.font = FONT; for (const it of M.items) w = Math.max(w, ctx.measureText(it.label).width + PAD * 2 + 20);
  }
  w = Math.min(MAX_W, Math.ceil(w));
  const h = (M.title ? HEAD : 4) + M.items.length * ROW + 4;
  // at the cursor, pushed inside the screen
  const x = Math.max(4, Math.min(game.width - w - 4, M.x + 2)), y = Math.max(4, Math.min(game.height - h - 4, M.y + 2));
  M.rect = { x, y, w, h };
  M.rows = M.items.map((it, i) => ({ x: x + 2, y: y + (M.title ? HEAD : 4) + i * ROW, w: w - 4, h: ROW }));
}

/** → true when the menu took the input this step. */
export function updateContextMenu(game) {
  const M = game.ctxMenu;
  if (!M) return false;
  if (M.scene !== game.scene || game.modals.length) { game.ctxMenu = null; return false; }
  const inp = game.input, m = inp.mouse;
  if (inp.wasPressed('Escape')) { game.ctxMenu = null; return true; }
  M.hover = M.rows.findIndex((r) => inRect(r, m.x, m.y));
  const inside = inRect(M.rect, m.x, m.y);
  if (m.clicked) {
    if (!inside) { game.ctxMenu = null; return true; }
    const it = M.items[M.hover];
    if (!it) return true;
    if (it.disabled) { play('error'); return true; }
    game.ctxMenu = null;
    play('uiClick');
    M.onPick?.(game, it.id, it);
    return true;
  }
  if (m.rightClicked) {
    if (inside) return true;
    game.ctxMenu = null; return false; // the scene opens a new menu at the new place
  }
  return false;
}

export function renderContextMenu(game) {
  if (!contextMenuOpen(game)) return;
  const M = game.ctxMenu, { ctx } = game, R = M.rect;
  panel(ctx, R.x, R.y, R.w, R.h, C['1'], chrome());
  if (M.title) text(ctx, M.title, R.x + PAD, R.y + 6, themeTitleColor(), FONT_B);
  M.items.forEach((it, i) => {
    const r = M.rows[i];
    if (i === M.hover && !it.disabled) { ctx.fillStyle = C['3']; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (it.icon) text(ctx, it.icon, r.x + 6, r.y + 6, it.disabled ? C['4'] : C.a, FONT);
    text(ctx, it.label, r.x + PAD + (it.icon ? 16 : 0), r.y + 6, it.disabled ? C['4'] : i === M.hover ? C.h : C['5'], FONT);
    if (it.disabled && it.reason) hotspot(r.x, r.y, r.w, r.h, { title: it.label, lines: [{ text: it.reason, color: 'c' }] });
    else if (it.sub) hotspot(r.x, r.y, r.w, r.h, { title: it.label, lines: [it.sub] });
    else hotspot(r.x, r.y, r.w, r.h, () => null); // the scene's tooltips under the menu stay hidden
  });
  hotspot(R.x, R.y, R.w, M.title ? HEAD : 4, () => null);
}
