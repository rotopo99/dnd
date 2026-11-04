// Modal windows (stack in game.modals) and toasts (game.toasts). While a modal is open the scene gets no update().
// Modal spec: { title, lines: [string | { text, color }], options: [{ label, sub?, disabled?, reason?, keep?, run?(game) }],
//               build?(game) -> spec (re-evaluated every frame: live shops), width?, onCancel?(game) }
// Clicking an option closes the modal first (unless keep) and then calls run — so run may open the next modal.
// Keys: 1–9 pick options, Esc — cancel (onCancel or close), Enter/Space — the only enabled option.
import { C, FONT, FONT_B, FONT_L, LINE, text, wrap, panel, button, hitButton, fit } from './draw.js';
import { play } from '../audio/sfx.js';
import { t } from '../data/text/index.js';

const OPT_H = 44;
const GAP = 8;

function specOf(game, m) {
  return m.build ? { ...m, ...m.build(game) } : m;
}

function layout(game, spec) {
  const W = game.width, H = game.height;
  const w = Math.min(spec.width || 720, W - 64);
  const textW = w - 48;
  const lines = [];
  for (const l of spec.lines || []) {
    const obj = typeof l === 'string' ? { text: l } : l;
    for (const s of wrap(game.ctx, obj.text, textW, obj.font || FONT)) lines.push({ text: s, color: obj.color, font: obj.font });
    if (obj.gap) lines.push({ text: '' });
  }
  const opts = spec.options || [];
  const cols = opts.length > 6 ? 2 : 1;
  const rows = Math.ceil(opts.length / cols);
  const maxLines = Math.floor((H - 160 - rows * (OPT_H + GAP)) / LINE);
  const shown = lines.slice(0, Math.max(3, maxLines));
  const h = 72 + shown.length * LINE + 16 + rows * (OPT_H + GAP);
  const x = Math.floor((W - w) / 2), y = Math.max(16, Math.floor((H - h) / 2));
  const ow = cols === 2 ? Math.floor((w - 48 - GAP) / 2) : w - 48;
  const buttons = opts.map((o, i) => ({
    ...o, label: o.label, x: x + 24 + (i % cols) * (ow + GAP), y: y + 72 + shown.length * LINE + 16 + Math.floor(i / cols) * (OPT_H + GAP),
    w: ow, h: OPT_H, key: i < 9 ? String(i + 1) : '', font: FONT_B, idx: i,
  }));
  return { x, y, w, h, lines: shown, buttons };
}

export function updateModal(game) {
  const m = game.modals[game.modals.length - 1];
  const spec = specOf(game, m);
  const L = layout(game, spec);
  m._layout = L;
  const inp = game.input;
  const hb = hitButton(L.buttons, inp.mouse);
  m._hover = hb;
  let pick = null;
  if (inp.mouse.clicked && hb && !hb.disabled) pick = hb;
  for (let i = 1; i <= 9 && !pick; i++) if (inp.wasPressed(`Digit${i}`) || inp.wasPressed(`Numpad${i}`)) {
    const b = L.buttons[i - 1];
    if (b && !b.disabled) pick = b;
  }
  if (!pick && (inp.wasPressed('Enter') || inp.wasPressed('Space'))) {
    const en = L.buttons.filter((b) => !b.disabled);
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
  const opt = spec.options[pick.idx];
  if (!opt.keep) game.modals.splice(game.modals.indexOf(m), 1);
  opt.run?.(game);
}

export function renderModal(game) {
  const { ctx } = game;
  ctx.fillStyle = 'rgba(20,20,28,0.72)';
  ctx.fillRect(0, 0, game.width, game.height);
  const m = game.modals[game.modals.length - 1];
  const spec = specOf(game, m);
  const L = m._layout || layout(game, spec);
  panel(ctx, L.x, L.y, L.w, L.h, C['1'], spec.border ? C[spec.border] : C.h);
  text(ctx, fit(ctx, spec.title || '', L.w - 48, FONT_L), L.x + 24, L.y + 22, spec.titleColor ? C[spec.titleColor] : C.h, FONT_L);
  L.lines.forEach((l, i) => text(ctx, l.text, L.x + 24, L.y + 72 + i * LINE, l.color ? (C[l.color] || l.color) : C['5'], l.font || FONT));
  for (const b of L.buttons) button(ctx, b, m._hover === b);
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
  const start = Math.max(0, ts.length - 6);
  for (let i = start, row = 0; i < ts.length; i++, row++) {
    const to = ts[i];
    ctx.font = FONT_B;
    const w = Math.min(game.width - 40, ctx.measureText(to.text).width + 32);
    const x = game.width - w - 16;
    const y = 64 + row * 40;
    ctx.globalAlpha = to.t > 2.6 ? Math.max(0, (3.2 - to.t) / 0.6) : 1;
    panel(ctx, x, y, w, 32, C['0'], C[to.color] || C.h);
    text(ctx, fit(ctx, to.text, w - 24, FONT_B), x + w / 2, y + 8, C[to.color] || C.h, FONT_B, 'center');
    ctx.globalAlpha = 1;
  }
}

/** Convenience: simple message with one button. */
export function message(game, title, lines, then, label = t('battle.continue')) {
  game.openModal({ title, lines, options: [{ label, run: then }] });
}
