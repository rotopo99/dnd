// Tooltip specs (ui/tooltip.js) for game terms: resources, statuses, abilities, talents, factions.
// Descriptions come from data: STATUSES[id].desc, ability.desc, TALENTS[id].desc; resource texts — data/text `tip.res.*`.
import { t } from '../data/text/index.js';
import { STATUSES } from '../data/effects.js';
import { TALENTS } from '../data/talents.js';
import { C, text, bar, resLine } from './draw.js';
import { hotspot } from './tooltip.js';
import { xpProgress } from '../rules/progression.js';

const RES_COL = { hp: 'c', mrl: 'f', enr: 'b', kb: '5', xp: 'a' };

/** ЗДР / МРЛ / ЭНР / КБ / опыт. */
export function resTip(res) {
  return { title: `${t(`res.${res}.full`)}`, titleColor: C[RES_COL[res]] || C.h, lines: [t(`tip.res.${res}`)] };
}

/** Status by id (or a status object from battle data). */
export function statusTip(id, statuses = STATUSES) {
  const s = statuses?.[id] || STATUSES[id];
  if (!s) return null;
  return { title: s.name, titleColor: s.kind === 'buff' ? C.j : C.a, lines: [{ text: t(s.kind === 'buff' ? 'tip.buff' : 'tip.debuff'), color: '4' }, s.desc || ''] };
}

/** Ability: action type, cost, range, area, uses; description. */
export function abilityTip(a) {
  if (!a) return null;
  const parts = [];
  if (a.action) parts.push(t(`act.${a.action}`));
  if (a.cost) parts.push(`${a.cost} ${t('battle.cost')}`);
  if (a.range != null) parts.push(a.range === 'weapon' ? `${t('battle.range')}: ${t('tip.weaponRange')}` : a.range ? `${t('battle.range')} ${a.range}` : t('battle.self'));
  if (a.area) parts.push(`${t('battle.area')}: ${t(`area.${a.area.shape}`)} ${a.area.size || 1}`);
  if (a.usesPerBattle) parts.push(`${t('tip.perBattle')} ${a.usesPerBattle}`);
  const lines = [];
  if (parts.length) lines.push({ text: parts.join(' · '), color: 'b' });
  if (a.desc) lines.push(a.desc);
  return { title: a.name, lines };
}

export function talentTip(id) {
  const x = TALENTS[id];
  return x ? { title: x.name, lines: [x.desc || ''] } : null;
}

/** Find a term (status / ability name) inside a log segment «…» and return its tip. */
export function termTip(str, statuses, abilities = []) {
  const name = String(str).replace(/[«»]/g, '').replace(/\s*\(\d+\)$/, '').trim();
  for (const s of Object.values(statuses || STATUSES)) if (s.name === name) return statusTip(s.id || name, statuses);
  const a = abilities.find((x) => x && x.name === name);
  return a ? abilityTip(a) : null;
}

/** XP to the next level: { text, k, left, max } for bars and sheets. */
export function xpInfo(xp, level) {
  const p = xpProgress(xp || 0, level);
  return { ...p, text: p.max ? t('tip.xpMax') : `${xp || 0} / ${p.to} · ${t('tip.xpLeft')} ${p.left}` };
}

/** XP line: label, bar, «x / next» (hover — what the bar means). Returns the y after the line. */
export function xpLine(ctx, x, y, w, xp, level, { h = 8, small = false } = {}) {
  const p = xpInfo(xp, level);
  const font = small ? '12px monospace' : '16px monospace';
  text(ctx, t('res.xp'), x, y, C.a, font);
  const lw = small ? 26 : 40, rw = Math.min(small ? 110 : 150, Math.floor(w * 0.4));
  bar(ctx, x + lw, y + (small ? 3 : 5), w - lw - rw - (rw ? 8 : 0), h, p.k, 1, 'xp');
  if (rw) text(ctx, p.max ? t('tip.xpMax') : `${xp || 0}/${p.to}`, x + w, y, C['4'], font, 'right');
  hotspot(x, y, w, small ? 14 : 18, () => ({ ...resTip('xp'), lines: [t('tip.res.xp'), { text: p.text, color: 'a' }] }));
  return y + (small ? 14 : 20);
}

/** draw.js resLine + hover description of the resource. */
export function resLineTip(ctx, x, y, w, res, value, max, label) {
  resLine(ctx, x, y, w, res, value, max, label);
  hotspot(x, y - 2, w, 20, resTip(res));
}

/** A word/term drawn with a hover tip (KB line etc.). Returns its width. */
export function termText(ctx, s, x, y, color, font, tip) {
  text(ctx, s, x, y, color, font);
  ctx.font = font;
  const w = ctx.measureText(s).width;
  hotspot(x, y, w, 18, tip);
  return w;
}
