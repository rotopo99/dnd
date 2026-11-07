// Modal windows (stack in game.modals) and toasts (game.toasts). While a modal is open the scene gets no update().
// Modal spec: { title, lines: [string | { text, color }], options: [{ label, sub?, disabled?, reason?, keep?, run?(game), tip?, detail?, inert? }],
//               tip — hover tooltip (ui/tooltip.js spec or () => spec)
//               detail — same spec format (or () => spec): if any option has one, the modal gets a details panel on the
//                 right (ui/details.js: full wrapped text, scroll) showing the hovered / last hovered option; no tip then
//               inert — an info row (loot item): shows its detail, cannot be picked
//               build?(game) -> spec (re-evaluated every frame: live shops), width?, onCancel?(game) }
// Clicking an option closes the modal first (unless keep) and then calls run — so run may open the next modal.
// Keys: 1–9 pick options, Esc — cancel (onCancel or close), Enter/Space — the only enabled option.
import { C, FONT, FONT_B, FONT_L, LINE, text, wrap, panel, button, hitButton, fit } from './draw.js';
import { play } from '../audio/sfx.js';
import { t } from '../data/text/index.js';
import { hotspot } from './tooltip.js';
import { createDetails, updateDetails, drawDetails } from './details.js';

const DETAIL_W = 400;
const DETAIL_MIN_H = 300;

const OPT_H = 44;
const GAP = 8;

function specOf(game, m) {
  return m.build ? { ...m, ...m.build(game) } : m;
}

function layout(game, spec, m = {}) {
  const W = game.width, H = game.height;
  const all0 = spec.options || [];
  const hasDetail = all0.some((o) => o.detail);
  const w = Math.min((spec.width || 720) + (hasDetail ? DETAIL_W + 16 : 0), W - 64);
  const textW = w - 48;
  const dw = hasDetail ? Math.min(DETAIL_W, Math.floor((w - 48) * 0.45)) : 0;
  const optW = w - 48 - (hasDetail ? dw + 16 : 0);
  const lines = [];
  for (const l of spec.lines || []) {
    const obj = typeof l === 'string' ? { text: l } : l;
    for (const s of wrap(game.ctx, obj.text, textW, obj.font || FONT)) lines.push({ text: s, color: obj.color, font: obj.font });
    if (obj.gap) lines.push({ text: '' });
  }
  const all = all0;
  const cols = all.length > 6 ? 2 : 1;
  // long lists (v3 shops): pages of options with ◀ ▶ (the last option — usually «Закрыть» — stays on every page)
  const fitRows = Math.max(2, Math.floor((H - 200 - 3 * LINE) / (OPT_H + GAP)));
  let opts = all.map((o, i) => ({ ...o, idx: i }));
  let nav = null;
  if (Math.ceil(all.length / cols) > fitRows) {
    const per = (fitRows - 1) * cols - 1;
    const body = opts.slice(0, -1), tail = opts.at(-1);
    const pages = Math.ceil(body.length / per);
    m._page = Math.max(0, Math.min(pages - 1, m._page || 0));
    opts = [...body.slice(m._page * per, m._page * per + per), tail];
    nav = { page: m._page, pages };
  }
  const rows = Math.ceil(opts.length / cols) + (nav ? 1 : 0);
  const optH = Math.max(rows * (OPT_H + GAP), hasDetail ? Math.min(DETAIL_MIN_H, H - 200) + GAP : 0);
  const maxLines = Math.floor((H - 160 - optH) / LINE);
  const shown = lines.slice(0, Math.max(3, maxLines));
  const h = 72 + shown.length * LINE + 16 + optH;
  const x = Math.floor((W - w) / 2), y = Math.max(16, Math.floor((H - h) / 2));
  const ow = cols === 2 ? Math.floor((optW - GAP) / 2) : optW;
  let k = 0;
  const buttons = opts.map((o, i) => ({
    ...o, label: o.label, x: x + 24 + (i % cols) * (ow + GAP), y: y + 72 + shown.length * LINE + 16 + Math.floor(i / cols) * (OPT_H + GAP),
    w: ow, h: OPT_H, key: !o.inert && k < 9 ? String(++k) : '', font: FONT_B,
  }));
  const detail = hasDetail ? { x: x + w - 24 - dw, y: y + 72 + shown.length * LINE + 16, w: dw, h: optH - GAP } : null;
  if (nav) {
    const ny = y + 72 + shown.length * LINE + 16 + (rows - 1) * (OPT_H + GAP);
    buttons.push({ label: '◀', nav: -1, x: x + 24, y: ny, w: 90, h: OPT_H, font: FONT_B, key: '', disabled: nav.page === 0 });
    buttons.push({ label: `${nav.page + 1} / ${nav.pages}`, nav: 0, x: x + 122, y: ny, w: 120, h: OPT_H, font: FONT_B, key: '', disabled: true });
    buttons.push({ label: '▶', nav: 1, x: x + 250, y: ny, w: 90, h: OPT_H, font: FONT_B, key: '', disabled: nav.page >= nav.pages - 1 });
  }
  return { x, y, w, h, lines: shown, buttons, detail };
}

export function updateModal(game) {
  const m = game.modals[game.modals.length - 1];
  const spec = specOf(game, m);
  const L = layout(game, spec, m);
  m._layout = L;
  m._spec = spec; // render reuses it (one build per frame)
  const inp = game.input;
  const hb = hitButton(L.buttons, inp.mouse);
  m._hover = hb;
  let busy = false;
  if (L.detail) {
    // details panel: the hovered option with a detail, else the last one shown, else the first
    if (hb?.detail) m._detailIdx = hb.idx;
    if (!spec.options[m._detailIdx]?.detail) m._detailIdx = spec.options.findIndex((o) => o.detail);
    const d = spec.options[m._detailIdx]?.detail;
    m._detail = typeof d === 'function' ? d() : d;
    m._dsc ||= createDetails();
    busy = updateDetails(m._dsc, L.detail, inp.mouse);
  }
  const pickable = (b) => b && !b.disabled && !b.inert;
  let pick = null;
  if (inp.mouse.clicked && !busy && pickable(hb)) pick = hb;
  for (let i = 1; i <= 9 && !pick; i++) if (inp.wasPressed(`Digit${i}`) || inp.wasPressed(`Numpad${i}`)) {
    const b = L.buttons.filter((x) => !x.nav && !x.inert)[i - 1];
    if (pickable(b)) pick = b;
  }
  if (!pick && (inp.wasPressed('Enter') || inp.wasPressed('Space'))) {
    const en = L.buttons.filter((b) => pickable(b) && !b.nav);
    if (en.length === 1) pick = en[0];
  }
  if (!pick && inp.wasPressed('Escape') && spec.onCancel !== false) {
    play('uiClick');
    game.modals.pop();
    if (typeof spec.onCancel === 'function') spec.onCancel(game);
    return;
  }
  if (!pick) return;
  play('uiClick');
  if (pick.nav) { m._page = (m._page || 0) + pick.nav; return; }
  const opt = spec.options[pick.idx];
  if (!opt.keep) game.modals.splice(game.modals.indexOf(m), 1);
  opt.run?.(game);
}

export function renderModal(game) {
  const { ctx } = game;
  ctx.fillStyle = 'rgba(20,20,28,0.72)';
  ctx.fillRect(0, 0, game.width, game.height);
  const m = game.modals[game.modals.length - 1];
  const spec = m._spec || specOf(game, m);
  const L = m._layout || layout(game, spec, m);
  panel(ctx, L.x, L.y, L.w, L.h, C['1'], spec.border ? C[spec.border] : C.h);
  text(ctx, fit(ctx, spec.title || '', L.w - 48, FONT_L), L.x + 24, L.y + 22, spec.titleColor ? C[spec.titleColor] : C.h, FONT_L);
  L.lines.forEach((l, i) => text(ctx, l.text, L.x + 24, L.y + 72 + i * LINE, l.color ? (C[l.color] || l.color) : C['5'], l.font || FONT));
  for (const b of L.buttons) {
    button(ctx, { ...b, selected: b.selected || (L.detail && b.inert && b.idx === m._detailIdx) }, m._hover === b && !b.inert);
    if (b.tip && !(L.detail && b.detail)) hotspot(b.x, b.y, b.w, b.h, b.tip);
  }
  if (L.detail) drawDetails(ctx, m._dsc ||= createDetails(), L.detail, m._detail, m._detailIdx);
}

// ----------------------------------------------------------------------------- toasts
export function updateToasts(game, dt) {
  const ts = game.toasts;
  let n = 0;
  for (let i = 0; i < ts.length; i++) {
    ts[i].t += dt;
    if (ts[i].t < 3.2) ts[n++] = ts[i];
  }
  ts.length = n;
}

export function renderToasts(game) {
  const { ctx } = game;
  const ts = game.toasts;
  // anchor: a scene may say where toasts do not cover its headers (battle — under the top bar over the map);
  // default — bottom centre above the bottom bars, stacking upwards
  const a = game.scene?.toastAnchor?.(game) || { x: game.width / 2, y: game.height - 132, dir: -1 };
  for (let i = 0; i < ts.length; i++) {
    const to = ts[i];
    const label = to.n > 1 ? `${to.text} ×${to.n}` : to.text;
    ctx.font = FONT_B;
    const w = Math.min(game.width - 40, ctx.measureText(label).width + 32);
    const x = Math.round(a.x - w / 2);
    const y = a.y + a.dir * (ts.length - 1 - i) * 40;
    ctx.globalAlpha = to.t > 2.6 ? Math.max(0, (3.2 - to.t) / 0.6) : 1;
    panel(ctx, x, y, w, 32, C['0'], C[to.color] || C.h);
    text(ctx, fit(ctx, label, w - 24, FONT_B), x + w / 2, y + 8, C[to.color] || C.h, FONT_B, 'center');
    ctx.globalAlpha = 1;
  }
}

/** Convenience: simple message with one button. */
export function message(game, title, lines, then, label = t('battle.continue')) {
  game.openModal({ title, lines, options: [{ label, run: then }] });
}
