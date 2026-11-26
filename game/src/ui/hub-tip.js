// One-time hub hint (QA v48): the first time the party walks a hub / town node, a non-blocking radio line about
// «Меню узла» (Tab), in the style of the battle tutorial (ui/battle-tutorial.js). Shown once per save (flag).
//   createHubTip(sv, loc)      -> T | null (sets the save flag: the hint is not repeated, even if left early)
//   tickHubTip(T, dt)          fade in / hold / fade out
//   doneHubTip(T)              the player pressed Tab / opened the menu: fade out now
//   drawHubTip(ctx, T, W, H)   panel above the help line and the nav buttons
import { C, FONT, FONT_B, LINE, text, wrap, panel } from './draw.js';
import { t } from '../data/text/index.js';

const FLAG = 'tip-hub-menu';
const HOLD = 12; // s on screen (or until Tab)
const KINDS = ['hub', 'town'];

export function createHubTip(sv, loc) {
  if (!sv?.flags || sv.flags[FLAG] || !KINDS.includes(loc?.kind)) return null;
  sv.flags[FLAG] = true;
  return { t: 0, hold: HOLD };
}

export function tickHubTip(T, dt) {
  if (!T) return null;
  T.t += dt;
  return T.t < T.hold ? T : null;
}

export function doneHubTip(T) {
  if (T && T.hold - T.t > 0.5) T.hold = T.t + 0.5;
}

export function drawHubTip(ctx, T, W, H) {
  if (!T) return;
  const w = Math.min(W - 40, 620), x = Math.floor((W - w) / 2);
  const lines = wrap(ctx, t('roam.tipHub'), w - 24, FONT).slice(0, 3);
  const h = 14 + LINE + lines.length * LINE;
  const y = H - 66 - h; // above the help line and the nav buttons
  const k = Math.min(1, T.t * 4, (T.hold - T.t) * 2);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  panel(ctx, x, y, w, h, C['0'], C.h);
  text(ctx, t('roam.tipHubWho'), x + 12, y + 6, C.h, FONT_B);
  lines.forEach((s, i) => text(ctx, s, x + 12, y + 6 + LINE + i * LINE, C['5'], FONT));
  ctx.restore();
}
