// Tooltip specs (ui/tooltip.js) for game terms: resources, statuses, abilities, talents, factions.
// Descriptions come from data: STATUSES[id].desc, ability.desc, TALENTS[id].desc; resource texts — data/text `tip.res.*`.
import { t } from '../data/text/index.js';
import { STATUSES } from '../data/effects.js';
import { SURFACES } from '../data/surfaces.js';
import { TALENTS, WORLD_FLAGS, isCombatTalent } from '../data/talents.js';
import { C, text, bar, resLine } from './draw.js';
import { hotspot } from './tooltip.js';
import { xpProgress } from '../rules/progression.js';

const RES_COL = { hp: 'c', mrl: 'f', enr: 'b', kb: '5', xp: 'a' };

/** ЗДР / МРЛ / ЭНР / КБ / опыт. */
export function resTip(res) {
  return { title: `${t(`res.${res}.full`)}`, titleColor: C[RES_COL[res]] || C.h, lines: [t(`tip.res.${res}`)] };
}

/**
 * Status by id (or a status object from battle data). extra (battle, Stage B): { turns, source, resist: 'R'|'V'|'I'|null }
 * → rounds left, source, tick numbers, removal ways and the bearer's resistance.
 */
export function statusTip(id, statuses = STATUSES, extra = null) {
  const s = statuses?.[id] || STATUSES[id];
  if (!s) return null;
  const lines = [{ text: t(s.kind === 'buff' ? 'tip.buff' : 'tip.debuff'), color: '4' }, s.desc || ''];
  const ticks = (Array.isArray(s.tick) ? s.tick : s.tick ? [s.tick] : []).filter((x) => x.dice);
  if (ticks.length) lines.push({ text: `${t('tip.tick')}: ${ticks.map((x) => `${x.dice}${x.dmgType ? ' ' + t(`dmg.${x.dmgType}`) : ''}${x.scale === 'tier' ? ' ×tier' : ''}`).join(', ')}`, color: 'b' });
  if (extra) {
    if ('turns' in extra) lines.push({ text: extra.turns == null ? t('tip.permanent') : `${t('tip.left')}: ${extra.turns} ${t('tip.rounds')}`, color: '5' });
    if (extra.source) lines.push({ text: `${t('tip.source')}: ${extra.source}`, color: '4' });
    if (extra.resist) lines.push({ text: t(extra.resist === 'I' ? 'tip.immune' : extra.resist === 'R' ? 'tip.resist' : 'tip.vuln'), color: extra.resist === 'V' ? 'c' : 'j' });
  }
  if (s.removal) lines.push({ text: `${t('tip.removal')}: ${s.removal}`, color: '4' });
  return { title: s.name, titleColor: s.kind === 'buff' ? C.j : C.a, glyph: s.icon ? { ch: '●', color: C[s.icon] } : undefined, lines };
}

/** Surface layer tip (battle tile hover). layer: { kind, turns, charged?, acidic?, proxied? }; step — enter preview. */
export function surfaceTip(layer, step = null, surfaces = SURFACES) {
  const d = surfaces[layer.kind];
  if (!d) return null;
  const flags = [layer.charged && t('tip.charged'), layer.acidic && t('tip.acidic'), layer.proxied && t('tip.proxied')].filter(Boolean);
  const lines = [{ text: t('tip.surface'), color: '4' }, d.desc];
  lines.push({ text: layer.turns == null ? t('tip.permanent') : `${t('tip.left')}: ${layer.turns} ${t('tip.rounds')}`, color: '5' });
  if (d.interacts && d.interacts !== '—') lines.push({ text: `${t('tip.interacts')}: ${d.interacts}`, color: 'b' });
  if (step) {
    const parts = [];
    if (step.dmg > 0) parts.push(`−${step.dmg} ${t(step.dmgType === 'cringe' ? 'res.mrl' : 'res.hp')}`);
    for (const id of step.statuses) parts.push(STATUSES[id]?.name || id);
    lines.push({ text: `${t('tip.step')}: ${parts.length ? parts.join(', ') : t('tip.harmless')}`, color: step.dmg > 0 ? 'c' : 'a' });
  }
  return { title: d.name + (flags.length ? ` (${flags.join(', ')})` : ''), titleColor: C[d.color], glyph: { ch: '▒', color: C[d.color] }, lines };
}

/** «Создаёт: Огонь R1, 4 р.» / «Накладывает: Горение, Шок» lines of an ability or item. */
export function surfaceLines(a) {
  const out = [];
  const specs = [a.surface, ...(a.effects || []).filter((e) => e.op === 'surface')].filter(Boolean);
  if (specs.length) {
    out.push({ text: `${t('tip.creates')}: ${specs.map((sp) => `${SURFACES[sp.kind]?.name || sp.kind}${sp.size ? ` ${t('tip.radius')}${sp.size}` : ''}${sp.turns ? `, ${sp.turns} ${t('tip.rounds')}` : ''}`).join('; ')}`, color: 'e' });
  }
  const st = [...new Set((a.effects || []).filter((e) => e.op === 'status').map((e) => STATUSES[e.id]?.name || e.id))];
  if (st.length) out.push({ text: `${t('tip.applies')}: ${st.join(', ')}`, color: 'a' });
  return out;
}

/** Ability: action type, cost, range, area, uses; description. */
export function abilityTip(a) {
  if (!a) return null;
  const parts = [];
  if (a.action) parts.push(t(`act.${a.action}`));
  if (a.cost) parts.push(`${a.cost} ${t('battle.cost')}`);
  if (a.range != null) parts.push(a.range === 'weapon' ? `${t('battle.range')}: ${t('tip.weaponRange')}` : a.range ? `${t('battle.range')} ${a.range}` : t('battle.self'));
  if (a.area) parts.push(`${t('battle.area')}: ${t(`area.${a.area.shape}`)} ${a.area.size || 1}`);
  if (a.recharge) parts.push(`${a.usesPerRest ?? a.usesPerBattle ?? 1} ${t(a.recharge === 'long' ? 'rest.perLong' : 'rest.perShort')}`);
  else if (a.usesPerBattle) parts.push(`${t('tip.perBattle')} ${a.usesPerBattle}`);
  const lines = [];
  if (parts.length) lines.push({ text: parts.join(' · '), color: 'b' });
  if (a.desc) lines.push(a.desc);
  lines.push(...surfaceLines(a));
  return { title: a.name, lines };
}

/** Talent card: kind, description, abilities in numbers (ЭНР, range, area, uses), world checks and flags, requirements. */
export function talentTip(id) {
  const x = typeof id === 'object' ? id : TALENTS[id];
  if (!x) return null;
  const combat = isCombatTalent(x);
  const lines = [{ text: `${combat ? t('talent.combat') : t('talent.world')} · ${String(x.canon || '').startsWith('вне канона') ? t('talent.new') : t('talent.canon')}`, color: combat ? 'a' : 'j' }];
  if (x.desc) lines.push(x.desc);
  for (const a of x.abilities || []) {
    const at = abilityTip(a);
    lines.push({ text: '' }, { text: `${t('talent.ability')}: ${a.name}`, color: 'h' }, ...at.lines.filter((l) => l !== x.desc));
  }
  const fx = [];
  for (const w of x.world || []) {
    if (w.check) fx.push(`${t(`skill.${w.check}`)} ${w.adv ? t('battle.advantage').toLowerCase() : `+${w.bonus || 0}`}`);
    else if (w.worldFlag && WORLD_FLAGS[w.worldFlag]) fx.push(WORLD_FLAGS[w.worldFlag].replace(/value/g, w.value != null ? (w.value < 1 ? `${Math.round(w.value * 100)}%` : w.value) : '').replace(/\s+/g, ' ').trim());
  }
  if (fx.length) lines.push({ text: '' }, { text: `${t('talent.worldFx')}: ${fx.join('; ')}`, color: 'j' });
  const r = x.req || {};
  const req = [];
  for (const [k, v] of Object.entries(r.stats || {})) req.push(`${t(`stat.${k}`)} ${v}`);
  if (r.level) req.push(`${t('world.level')} ${r.level}`);
  if (r.weapon) req.push(t(`talent.weapon.${r.weapon}`));
  if (req.length) lines.push({ text: `${t('tip.req')}: ${req.join(', ')}`, color: '4' });
  return { title: x.name, titleColor: combat ? C.a : C.h, lines };
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
