// Pinned unit card in battle (request of the human, 2026-11-07): RMB / Tab over a unit pins its full card in the
// top-left corner of the map; it stays when the mouse leaves, scrolls (scroll.js), statuses / abilities have hover
// tips (tooltip.js). × / Esc / RMB on the same unit — unpin; one pinned card (a new one replaces it).
// Content: portrait, name, faction / rank, HP / MRL / ENR, KB / speed, weapon, resistances, statuses with turns,
// abilities with descriptions, AI archetype / phase / intent. Works for own units and enemies.
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, LINE, text, wrap, fit, panel, inRect } from './draw.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from './scroll.js';
import { hotspot } from './tooltip.js';
import { resLineTip, statusTip, abilityTip, resTip } from './tips.js';
import { drawUnitPortrait } from './portrait-of.js';
import { unitView, isDeathAbility } from '../rules/combat.js';
import { intentOf } from '../rules/archetypes.js';
import { teamColor } from './battle-log.js';

const W = 330;

export const createPin = () => ({ id: null, scroll: createScroll(), rect: null, close: null, contentH: 0 });

/** Pin u (null or the pinned one again — unpin). */
export function pinUnit(S, u) {
  if (!u || S.pin.id === u.id) { S.pin.id = null; return; }
  S.pin.id = u.id;
  S.pin.scroll = createScroll();
}

/** Input of the pinned card; true — the mouse is taken (scene ignores it this step). */
export function updatePin(S, m, inp) {
  const P = S.pin;
  const u = P.id && S.b.byId[P.id];
  if (!u || u.dead || u.removed) { P.id = null; return false; }
  if (!P.rect) return false;
  if (m.clicked && P.close && inRect(P.close, m.x, m.y)) { P.id = null; return true; }
  if (m.rightClicked && inRect(P.rect, m.x, m.y)) { P.id = null; return true; }
  const view = viewRect(P.rect);
  if (updateScroll(P.scroll, view, P.contentH, m, { step: LINE * 3 })) return true;
  return !!((m.clicked || m.rightClicked) && inRect(P.rect, m.x, m.y));
}

const viewRect = (r) => ({ x: r.x + 4, y: r.y + 30, w: r.w - 8, h: r.h - 34 });

export function drawPin(ctx, S) {
  const P = S.pin;
  const b = S.b;
  const u = P.id && b.byId[P.id];
  if (!u || u.dead || u.removed) { P.rect = null; return; }
  const L = S.L;
  const h = Math.min(L.area.h - 16, 460);
  const r = { x: L.area.x + 8, y: L.area.y + 8, w: W, h };
  P.rect = r;
  panel(ctx, r.x, r.y, r.w, r.h, C['0'], teamColor(u));
  text(ctx, t('pin.title'), r.x + 10, r.y + 7, C['4'], FONT_B);
  P.close = { x: r.x + r.w - 26, y: r.y + 4, w: 22, h: 22 };
  text(ctx, '×', P.close.x + 11, P.close.y + 1, C['5'], FONT_B, 'center');
  const view = viewRect(r);
  beginClip(ctx, view);
  const x = view.x + 6, w = view.w - 12 - SCROLLBAR_W;
  const top = view.y - P.scroll.off;
  let y = top;
  // hover tips only for the visible part of the content
  const hs = (hx, hy, hw, hh, tip) => { if (hy + hh > view.y && hy < view.y + view.h) hotspot(hx, Math.max(hy, view.y), hw, Math.min(hh, view.y + view.h - hy), tip); };
  const v = unitView(b, u);
  const d = S.dispOf(u);
  drawUnitPortrait(ctx, u, x, y, 1, { native: true, emotion: d.emoT > 0 && d.emo ? d.emo : 'neutral', hurtAt: d.hurtAt, hp: u.maxHp ? d.hp / u.maxHp : 1, mrl: u.maxMrl ? d.mrl / u.maxMrl : 1 });
  const tx = x + 56, tw = w - 56;
  text(ctx, fit(ctx, S.name(u.id), tw, FONT_B), tx, y, teamColor(u), FONT_B);
  const def = u.enemyId ? b.data.enemies[u.enemyId] || b.data.summons[u.enemyId] : null;
  const sub = [];
  if (def?.faction) sub.push(t(`faction.${def.faction}`));
  if (def?.rank) sub.push(t(`rank.${def.rank}`));
  if (!def && u.kind === 'hero') sub.push(b.data.classes[u.classId]?.name || '');
  sub.push(`${t('pin.level')} ${u.level || 1}`);
  text(ctx, fit(ctx, sub.filter(Boolean).join(' · '), tw), tx, y + 22, C['4']);
  y += 52;
  const line = (s, col = C['4'], font = FONT) => { for (const l of wrap(ctx, s, w)) { text(ctx, l, x, y, col, font); y += LINE; } };
  resLineTip(ctx, x, y, w, 'hp', d.hp, v.maxHp, t('res.hp'), v.shield); y += 22;
  if (v.maxMrl > 0) { resLineTip(ctx, x, y, w, 'mrl', d.mrl, v.maxMrl, t('res.mrl')); y += 22; }
  if (v.maxEnr > 0) { resLineTip(ctx, x, y, w, 'enr', v.enr, v.maxEnr, t('res.enr')); y += 22; }
  text(ctx, `${t('res.kb')} ${v.kb}  ${t('create.speed')} ${v.speed}${v.shield ? `  ${t('battle.shield')} ${v.shield}` : ''}`, x, y, C['5'], FONT_B);
  hs(x, y, 70, LINE, resTip('kb')); y += LINE;
  if (u.weapon) line(`${t('pin.weapon')}: ${u.weapon.name || ''} ${u.weapon.dice || ''} ${t(`dmg.${u.weapon.dmgType}`)}, ${t('battle.range')} ${u.weapon.range || 1}`);
  // AI: archetype, boss phase, intent
  if (u.arch) {
    line(`${t('arch.label')}: ${t(`arch.${u.arch}`)}${u.arch === 'boss' ? ` · ${t('pin.phase')} ${u.phase || 1}/3` : ''}`, C.a, FONT_B);
    const it = S.intents?.[u.id] || (u.team === 'enemies' ? intentOf(b, u) : null);
    if (it) line(`${t('intent.title')}: ${intentText(S, it)}`, C['5']);
  }
  // resistances
  const res = { resist: [], vuln: [], immune: [] };
  for (const [k, val] of Object.entries(u.resist || {})) if (res[val]) res[val].push(t(`dmg.${k}`));
  for (const k of ['resist', 'vuln', 'immune']) if (res[k].length) line(`${t(`pin.${k}`)}: ${res[k].join(', ')}`, k === 'vuln' ? C.c : C['4']);
  if (u.immuneStatus?.length) line(`${t('pin.immune')}: ${u.immuneStatus.map((id) => b.data.statuses[id]?.name || id).join(', ')}`);
  // statuses with duration
  y += 4;
  text(ctx, t('pin.statuses'), x, y, C['4'], FONT_B); y += LINE;
  if (!u.statuses.length) line(t('pin.none'), C['3']);
  for (const st of u.statuses) {
    const sd = b.data.statuses[st.id];
    const s = `${sd?.name || st.id}${st.turns != null ? ` (${st.turns})` : ''}`;
    text(ctx, fit(ctx, s, w), x, y, sd?.kind === 'buff' ? C.j : C.a);
    hs(x, y, w, LINE, () => statusTip(st.id, b.data.statuses));
    y += LINE;
  }
  // abilities with descriptions
  const abs = (u.abilities || []).filter((a) => !a.todo);
  y += 4;
  text(ctx, t('pin.abilities'), x, y, C['4'], FONT_B); y += LINE;
  if (!abs.length) line(t('pin.none'), C['3']);
  for (const a of abs) {
    const y0 = y;
    const meta = [a.cost ? `${a.cost} ${t('battle.cost')}` : '', a.usesPerBattle ? `${u.uses?.[a.id] || 0}/${a.usesPerBattle}` : '', isDeathAbility(a) ? '†' : ''].filter(Boolean).join(' · ');
    text(ctx, fit(ctx, a.name + (meta ? ` · ${meta}` : ''), w), x, y, C['5'], FONT_B); y += LINE;
    if (a.desc) for (const l of wrap(ctx, a.desc, w)) { text(ctx, l, x, y, C['4']); y += LINE; }
    hs(x, y0, w, y - y0, () => abilityTip(a));
    y += 2;
  }
  P.contentH = y - top + 6;
  endClip(ctx);
  drawScrollbar(ctx, P.scroll, view);
}

export function intentText(S, it) {
  const name = it.target ? S.name(it.target) : '';
  return t(`intent.${it.kind}`).replace('{name}', name).replace('{n}', it.dmg ?? '?');
}
