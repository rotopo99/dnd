// Card drawing for «Хлам и Кринж» (scenes/cards.js, scenes/panel-cards.js, card shop): frame by rarity, cost (circle, top-left),
// ATK (bottom-left), HP (bottom-right), keyword icons, set sigil instead of art; cardTip(card) — the full text for ui/tooltip.js.
import { C, FONT, FONT_B, text, fit, wrap, panel } from './draw.js';
import { t } from '../data/text/index.js';
import { CARDS, CARD_SETS, RARITY } from '../data/cards.js';

export const SET_COLOR = { neu: '4', ai: 'f', tin: '5', pir: 'e', scv: '8', mut: 'j', tkh: 'a', crg: 'n', tok: '3' };
export const RARITY_COLOR = { common: '3', rare: 'f', epic: 'n', legendary: 'a' };
const SIGIL = { neu: '◇', ai: '▲', tin: '⚔', pir: '☠', scv: '⚙', mut: '❦', tkh: '✶', crg: '☺', tok: '·' };
export const KW_ICON = { taunt: '▣', rush: '»', shield: '◯', poison: '☣', cringe: '☺' };

/** Keywords of a card (with Cringe aura as 'cringe'). */
export const cardKws = (c) => [...(c.kw || []), ...(c.cringe ? ['cringe'] : [])];

const circle = (ctx, x, y, r, fill, border = C['0']) => {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = border; ctx.stroke(); ctx.lineWidth = 1;
};

/**
 * Draw a card face. o: { atk, hp, maxHp, cost (shown cost), shield, faded, glow (palette key), small (hand / grid: no rules text),
 *   status: {stun, poison, cringed}, sick, count }
 */
export function drawCard(ctx, c, x, y, w, h, o = {}) {
  if (!c) return;
  x = Math.round(x); y = Math.round(y);
  const set = SET_COLOR[c.set] || '4';
  ctx.save();
  if (o.faded) ctx.globalAlpha = 0.45;
  if (o.glow) { ctx.fillStyle = C[o.glow]; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); }
  panel(ctx, x, y, w, h, C['1'], C[RARITY_COLOR[c.rarity] || '3']);
  ctx.strokeStyle = C[RARITY_COLOR[c.rarity] || '3'];
  ctx.lineWidth = c.rarity === 'legendary' ? 3 : 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.lineWidth = 1;
  // art: the set sigil on a tinted plate
  const artH = Math.round(h * (o.small ? 0.42 : 0.36));
  ctx.fillStyle = C['2']; ctx.fillRect(x + 6, y + 24, w - 12, artH);
  ctx.fillStyle = C[set]; ctx.globalAlpha *= 0.25; ctx.fillRect(x + 6, y + 24, w - 12, artH); ctx.globalAlpha = o.faded ? 0.45 : 1;
  const big = Math.min(w, artH) * 0.6 | 0;
  text(ctx, SIGIL[c.set] || '?', x + w / 2, y + 24 + (artH - big) / 2, C[set], `bold ${big}px monospace`, 'center');
  // name
  const nf = w < 130 ? '11px monospace' : 'bold 13px monospace';
  text(ctx, fit(ctx, c.name, w - 30, nf), x + 26, y + 6, C['5'], nf);
  // type / keywords line
  const kws = cardKws(c);
  let ky = y + 26 + artH + 2;
  if (kws.length) text(ctx, kws.map((k) => KW_ICON[k]).join(' '), x + 8, ky, C.a, '13px monospace');
  if (c.type !== 'creature') text(ctx, t(`cards.type.${c.type}`) + (c.type === 'gadget' ? ` ${o.dur ?? c.dur}` : ''), x + w - 6, ky, C['4'], '11px monospace', 'right');
  if (!o.small && c.text) {
    const tf = '11px monospace';
    const lines = wrap(ctx, c.text, w - 14, tf).slice(0, Math.floor((h - (ky - y) - 46) / 13));
    lines.forEach((l, i) => text(ctx, l, x + 7, ky + 16 + i * 13, C['5'], tf));
  }
  // cost
  circle(ctx, x + 12, y + 12, 11, C.g, C.f);
  const cost = o.cost ?? c.cost;
  text(ctx, String(cost), x + 12, y + 4, cost > c.cost ? C.c : cost < c.cost ? C.j : C['5'], FONT_B, 'center');
  if (c.type === 'creature') {
    const atk = o.atk ?? c.atk, hp = o.hp ?? c.hp;
    circle(ctx, x + 13, y + h - 13, 12, C['6'], C.a);
    text(ctx, String(atk), x + 13, y + h - 21, atk > c.atk ? C.j : atk < c.atk ? C.c : C['5'], FONT_B, 'center');
    circle(ctx, x + w - 13, y + h - 13, 12, C.d, C.c);
    text(ctx, String(hp), x + w - 13, y + h - 21, hp < (o.maxHp ?? c.hp) ? C.c : hp > c.hp ? C.j : C['5'], FONT_B, 'center');
  }
  if (o.status) {
    const st = [o.status.stun > 0 ? 'z' : '', o.status.poison > 0 ? '☣' : '', o.status.cringed > 0 ? '☹' : ''].join('');
    if (st) text(ctx, st, x + w / 2, y + h - 20, C.n, FONT_B, 'center');
  }
  if (o.shield) { ctx.strokeStyle = C.f; ctx.lineWidth = 3; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); ctx.lineWidth = 1; }
  if (o.count != null) { panel(ctx, x + w - 34, y + 24, 30, 20, C['0'], C['3']); text(ctx, `×${o.count}`, x + w - 19, y + 26, C.a, '12px monospace', 'center'); }
  ctx.restore();
}

/** Card back (enemy hand). */
export function drawBack(ctx, x, y, w, h) {
  panel(ctx, x, y, w, h, C.o, C['3']);
  ctx.strokeStyle = C.n; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  text(ctx, '☺', x + w / 2, y + h / 2 - 9, C.n, FONT_B, 'center');
}

/** Tooltip spec with the full card text: stats, keywords explained, set, rarity. */
export function cardTip(c, extra = []) {
  if (!c) return null;
  const lines = [];
  const typ = t(`cards.type.${c.type}`);
  lines.push({ text: `${typ} · ${t('cards.cost')} ${c.cost}${c.type === 'creature' ? ` · ${c.atk}/${c.hp}` : ''}${c.type === 'gadget' ? ` · ${t('cards.dur')} ${c.dur}` : ''}`, color: 'a' });
  if (c.text) lines.push(c.text);
  for (const k of cardKws(c)) lines.push({ text: `${KW_ICON[k]} ${t(`cards.kw.${k}`)}: ${t(`cards.kwd.${k}`)}${k === 'cringe' ? ` (${c.cringe})` : ''}`, color: '4' });
  if (c.immuneCringe) lines.push({ text: t('cards.immuneCringe'), color: '4' });
  if (c.tags?.length) lines.push({ text: `${t('cards.tags')}: ${c.tags.map((x) => t(`cards.tag.${x}`)).join(', ')}`, color: '4' });
  if (!c.token) lines.push({ text: `${CARD_SETS[c.set]?.name || c.set} · ${RARITY[c.rarity]?.name || ''}`, color: RARITY_COLOR[c.rarity] || '4' });
  lines.push(...extra);
  return { title: c.name, titleColor: C[SET_COLOR[c.set]] || C.h, lines, width: 340 };
}

export const cardById = (id) => CARDS[id];
export { FONT };
