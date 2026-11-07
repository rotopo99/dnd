// Codex / bestiary tab of the panels scene (docs/specs/vendors-bestiary.md, part 2). Sections — CODEX_SECTIONS:
// list on the left (scroll.js), the card on the right (details.js); enemy records open by level (world/codex.js).
// Used by scenes/panels.js: layoutCodex / clickCodex / updateCodex / renderCodex; codexEntries — tests.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { STATUSES } from '../data/effects.js';
import { SURFACES } from '../data/surfaces.js';
import { ENEMIES } from '../data/index.js';
import { LOOT_TABLES } from '../data/items/loot.js';
import { CODEX_SECTIONS, CODEX_LEVELS, CODEX_UNKNOWN, CODEX_HINT_LOCKED, FACTION_LORE, ENEMY_LORE, TERM_GROUPS } from '../data/text/codex.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { LOCATIONS, ITEMS, locationLore } from '../world/data.js';
import { FACTION_IDS, factionName, repTier, isMet } from '../world/reputation.js';
import { locFaction } from '../world/state.js';
import { VENDORS } from '../world/vendors.js';
import { codexOf, codexLevel, enemyKey, enemyName, enemyFinds, factionFinds, KNOWN_KILLS } from '../world/codex.js';
import { enemySubject } from '../ui/portrait-of.js';
import { drawPortrait } from '../assets/sprites.js';
import { abilityTip } from '../ui/tips.js';
import { C, FONT, FONT_B, LINE, text, fit, panel } from '../ui/draw.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from '../ui/scroll.js';
import { createDetails, updateDetails, drawDetails } from '../ui/details.js';

export const SECTIONS = Object.keys(CODEX_SECTIONS);
const ROW = 24;
const RES = ['hp', 'mrl', 'enr', 'kb'];

const enemyFaction = (key) => enemySubject(key)?.faction || 'none';

/** Rows of a section: [{ head } | { id, label, open, color? }]. */
export function codexEntries(save, section) {
  const out = [];
  if (section === 'enemies') {
    const c = codexOf(save);
    const keys = [...new Set([...Object.keys(ENEMY_LORE), ...Object.keys(c.seen)])].filter((k) => ENEMIES[k]);
    const groups = new Map();
    for (const k of keys) { const f = enemyFaction(k); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(k); }
    for (const [f, ks] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      out.push({ head: f === 'none' ? t('codex.foes') : factionName(f) });
      for (const k of ks) {
        const lv = codexLevel(save, k);
        out.push({ id: k, open: lv > 0, label: lv > 0 ? enemyName(k) : CODEX_UNKNOWN, color: lv >= 3 ? C.j : lv === 2 ? C.h : lv ? C['5'] : C['3'] });
      }
    }
  } else if (section === 'factions') {
    for (const f of FACTION_IDS) out.push({ id: f, open: isMet(save, f), label: isMet(save, f) ? factionName(f) : CODEX_UNKNOWN });
  } else if (section === 'places') {
    for (const id of save.visited || []) if (LOCATIONS[id]) out.push({ id, open: true, label: LOCATIONS[id].name });
  } else if (section === 'people') {
    for (const id of Object.keys(save.npcs || {})) if (NPCS[id] && save.npcs[id]?.met) out.push({ id, open: true, label: NPCS[id].name });
  } else if (section === 'terms') {
    const terms = codexOf(save).terms;
    out.push({ head: TERM_GROUPS.resource });
    for (const r of RES) out.push({ id: `res:${r}`, open: true, label: t(`res.${r}.full`) });
    out.push({ head: TERM_GROUPS.status });
    for (const [id, s] of Object.entries(STATUSES)) { const o = !!terms[`status:${id}`]; out.push({ id: `status:${id}`, open: o, label: o ? s.name : CODEX_UNKNOWN }); }
    out.push({ head: TERM_GROUPS.surface });
    for (const [id, s] of Object.entries(SURFACES)) { const o = !!terms[`surface:${id}`]; out.push({ id: `surface:${id}`, open: o, label: o ? s.name : CODEX_UNKNOWN }); }
  }
  return out;
}

const RW = { resist: 'codex.resist', vuln: 'codex.vuln', immune: 'codex.immune' };
const lootWord = (p) => t(p >= WORLD_RULES.codex.lootOften ? 'codex.lootOften' : p >= WORLD_RULES.codex.lootSome ? 'codex.lootSome' : 'codex.lootRare');

/** Card spec (ui/tooltip.js format) of an entry. */
export function codexCard(save, section, id) {
  const lock = { text: CODEX_HINT_LOCKED, color: '3' };
  if (section === 'enemies') {
    const lv = codexLevel(save, id);
    if (!lv) return { title: CODEX_UNKNOWN, lines: [lock] };
    const d = ENEMIES[id];
    const f = enemyFaction(id);
    const lines = [{ text: `${f !== 'none' ? factionName(f) : t('codex.foes')} · ${t('codex.kills')}: ${codexOf(save).kills[id] || 0}`, color: '4' }];
    if (ENEMY_LORE[id]?.lore || d.desc) lines.push(ENEMY_LORE[id]?.lore || d.desc);
    lines.push({ text: '' });
    if (lv >= 2) {
      lines.push({ text: `${t('res.hp')} ${d.hp} · ${t('res.kb')} ${d.kb} · ${t('res.mrl')} ${d.mrl}${d.level ? ` · ${t('world.level')} ${d.level}` : ''}`, color: 'h' });
      const ab = (d.abilities || []).filter((a) => a && a.name);
      if (ab.length) {
        lines.push({ text: t('codex.abilities'), color: 'a', font: FONT_B });
        for (const a of ab) { const tp = abilityTip(a); lines.push(`• ${a.name}${a.desc ? ` — ${a.desc}` : ''}`); if (tp?.lines?.[0]?.color === 'b') lines.push({ text: `  ${tp.lines[0].text}`, color: '4' }); }
      }
    } else lines.push(lock);
    lines.push({ text: '' });
    if (lv >= 3) {
      const res = d.resist || {};
      for (const kind of ['resist', 'vuln', 'immune']) {
        const ts = Object.keys(res).filter((k) => res[k] === kind).map((k) => t(`dmg.${k}`));
        if (ts.length) lines.push({ text: `${t(RW[kind])}: ${ts.join(', ')}`, color: kind === 'vuln' ? 'c' : 'j' });
      }
      if ((d.immuneStatus || []).length) lines.push({ text: `${t('codex.immune')}: ${d.immuneStatus.map((s) => STATUSES[s]?.name || s).join(', ')}`, color: 'j' });
      if ((d.tags || []).length) lines.push({ text: `${t('codex.tags')}: ${d.tags.join(', ')}`, color: '4' });
      const tb = d.loot && LOOT_TABLES[d.loot];
      if (tb) {
        const pool = (tb.entries || []).filter((e) => e.w > 0 && ITEMS[e.item]);
        const tot = pool.reduce((s, e) => s + e.w, 0) || 1;
        lines.push({ text: `${t('codex.loot')}: ${pool.map((e) => `${ITEMS[e.item].name} (${lootWord((e.w / tot) * (tb.rolls || 1))})`).join(', ')}`, color: 'b' });
      }
      if (d.xp) lines.push({ text: `${t('codex.xp')}: ${d.xp}`, color: 'a' });
    } else if (lv === 2) lines.push({ text: `${CODEX_LEVELS.known} (${codexOf(save).kills[id] || 0}/${KNOWN_KILLS})`, color: '3' });
    const finds = enemyFinds(save, id);
    if (finds.length) { lines.push({ text: '' }, { text: t('codex.finds'), color: 'f', font: FONT_B }); for (const x of finds) lines.push(x.text); }
    return { title: enemyName(id), lines };
  }
  if (section === 'factions') {
    if (!isMet(save, id)) return { title: CODEX_UNKNOWN, lines: [lock] };
    const lines = [FACTION_LORE[id] || '', { text: '' }, { text: `${t('codex.relation')}: ${t(`tier.${repTier(save.rep?.[id])}`)}`, color: 'h' }];
    const places = (save.visited || []).filter((l) => locFaction(l) === id).map((l) => LOCATIONS[l]?.name).filter(Boolean);
    if (places.length) lines.push({ text: `${t('codex.places')}: ${places.join(', ')}`, color: '5' });
    const foes = Object.keys(codexOf(save).seen).filter((k) => enemyFaction(k) === id).map(enemyName);
    if (foes.length) lines.push({ text: `${t('codex.foes')}: ${foes.join(', ')}`, color: 'c' });
    const tr = Object.keys(VENDORS).filter((n) => NPCS[n] && NPCS[n].faction === id && save.npcs?.[n]?.met).map((n) => NPCS[n].name);
    if (tr.length) lines.push({ text: `${t('codex.traders')}: ${tr.join(', ')}`, color: 'b' });
    const finds = factionFinds(save, id);
    if (finds.length) { lines.push({ text: '' }, { text: t('codex.finds'), color: 'f', font: FONT_B }); for (const x of finds) lines.push(x.text); }
    return { title: factionName(id), lines };
  }
  if (section === 'places') {
    const L = LOCATIONS[id], lore = locationLore(id);
    const lines = [{ text: L?.region ? factionName(locFaction(id)) : '', color: '4' }, lore?.desc || L?.desc || ''];
    for (const s of lore?.spots || []) lines.push({ text: `• ${s.name}${s.desc ? ` — ${s.desc}` : ''}`, color: '5' });
    return { title: L?.name || id, lines };
  }
  if (section === 'people') {
    const n = NPCS[id];
    return { title: n.name, lines: [{ text: `${n.faction !== 'none' ? factionName(n.faction) : ''}`, color: '4' },
      ...(n.role ? [{ text: `${t('codex.role')}: ${n.role}`, color: '5' }] : []), ...(n.character ? [`${t('codex.character')}: ${n.character}`] : []),
      ...(n.bark ? [{ text: `«${n.bark}»`, color: 'a' }] : [])] };
  }
  const [kind, tid] = String(id).split(':');
  if (kind === 'res') return { title: t(`res.${tid}.full`), lines: [t(`tip.res.${tid}`)] };
  const terms = codexOf(save).terms;
  if (!terms[id]) return { title: CODEX_UNKNOWN, lines: [lock] };
  if (kind === 'status') { const s = STATUSES[tid]; return { title: s.name, lines: [{ text: t(s.kind === 'buff' ? 'tip.buff' : 'tip.debuff'), color: '4' }, s.desc || '', ...(s.removal ? [{ text: `${t('tip.removal')}: ${s.removal}`, color: '4' }] : [])] }; }
  const s = SURFACES[tid];
  return { title: s.name, titleColor: C[s.color], lines: [s.desc || '', ...(s.interacts && s.interacts !== '—' ? [{ text: `${t('codex.interacts')}: ${s.interacts}`, color: 'b' }] : [])] };
}

// ---------------------------------------------------------------- scene part
function rects(S) {
  const ox = S.ox, oy = S.oy;
  return { list: { x: ox + 24, y: oy + 108, w: 380, h: 720 - 132 }, head: { x: ox + 420, y: oy + 108, w: 836, h: 72 }, card: { x: ox + 420, y: oy + 188, w: 836, h: 720 - 212 } };
}

export function layoutCodex(game, S, b) {
  S.cx ||= { section: 'enemies', sel: null, list: createScroll(), det: createDetails() };
  SECTIONS.forEach((id, i) => b.push({ kind: 'cxSec', id, label: CODEX_SECTIONS[id], x: S.ox + 24 + i * 166, y: S.oy + 64, w: 160, h: 32, font: FONT, selected: S.cx.section === id }));
}

export function clickCodex(game, S, b) {
  if (b.kind !== 'cxSec') return false;
  S.cx.section = b.id; S.cx.sel = null; S.cx.list.off = 0;
  return true;
}

/** Wheel / slider of the list and the card, click on a list row. → true if the mouse is busy. */
export function updateCodex(game, S) {
  const m = game.input.mouse;
  const R = rects(S);
  const rows = codexEntries(game.save, S.cx.section);
  const used = updateScroll(S.cx.list, R.list, rows.length * ROW + 8, m) || updateDetails(S.cx.det, R.card, m);
  if (!used && m.clicked && m.x >= R.list.x && m.x < R.list.x + R.list.w - SCROLLBAR_W && m.y >= R.list.y && m.y < R.list.y + R.list.h) {
    const r = rows[Math.floor((m.y - R.list.y - 4 + S.cx.list.off) / ROW)];
    if (r && !r.head) S.cx.sel = r.id;
  }
  return used;
}

export function renderCodex(game, S) {
  const { ctx } = game;
  const sv = game.save;
  const R = rects(S);
  const rows = codexEntries(sv, S.cx.section);
  if (S.cx.sel == null || !rows.some((r) => r.id === S.cx.sel)) S.cx.sel = rows.find((r) => !r.head && r.open)?.id ?? null;
  panel(ctx, R.list.x, R.list.y, R.list.w, R.list.h, C['1'], C['3']);
  beginClip(ctx, R.list);
  if (!rows.length) text(ctx, t('codex.empty'), R.list.x + 12, R.list.y + 10, C['3'], FONT);
  rows.forEach((r, i) => {
    const y = R.list.y + 4 + i * ROW - S.cx.list.off;
    if (y < R.list.y - ROW || y > R.list.y + R.list.h) return;
    if (r.head) { text(ctx, fit(ctx, r.head, R.list.w - 30, FONT_B), R.list.x + 10, y + 3, C['4'], FONT_B); return; }
    if (r.id === S.cx.sel) { ctx.fillStyle = C['2']; ctx.fillRect(R.list.x + 4, y, R.list.w - SCROLLBAR_W - 10, ROW - 2); }
    text(ctx, fit(ctx, r.label, R.list.w - 50, FONT), R.list.x + 24, y + 3, r.color || (r.open ? C['5'] : C['3']), FONT);
  });
  endClip(ctx);
  drawScrollbar(ctx, S.cx.list, R.list);
  // header: portrait / silhouette and the record level bar (enemies)
  panel(ctx, R.head.x, R.head.y, R.head.w, R.head.h, C['1'], C['3']);
  const sel = S.cx.sel;
  if (S.cx.section === 'enemies' && sel) {
    const lv = codexLevel(sv, sel);
    panel(ctx, R.head.x + 10, R.head.y + 10, 52, 52, C['0'], C['2']);
    if (lv) drawPortrait(ctx, enemySubject(sel), R.head.x + 12, R.head.y + 12, 1, { native: true });
    else { ctx.fillStyle = C['3']; ctx.beginPath(); ctx.arc(R.head.x + 36, R.head.y + 28, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(R.head.x + 24, R.head.y + 40, 24, 18); }
    const names = Object.values(CODEX_LEVELS).map((s) => s.split(':')[0]);
    let x = R.head.x + 80;
    text(ctx, t('codex.level'), x, R.head.y + 12, C['4'], FONT);
    names.forEach((nm, i) => {
      const on = lv > i;
      const s = `${i ? '→ ' : ''}${nm}`;
      text(ctx, s, x, R.head.y + 38, on ? (i === 2 ? C.j : C.h) : C['3'], FONT_B);
      ctx.font = FONT_B; x += ctx.measureText(s).width + 12;
    });
  } else if (sel) {
    const sub = S.cx.section === 'people' && NPCS[sel] ? NPCS[sel] : null;
    if (sub) { panel(ctx, R.head.x + 10, R.head.y + 10, 52, 52, C['0'], C['2']); drawPortrait(ctx, sel, R.head.x + 12, R.head.y + 12, 1, { native: true }); }
    text(ctx, fit(ctx, CODEX_SECTIONS[S.cx.section], 600, FONT_B), R.head.x + (sub ? 80 : 14), R.head.y + 26, C['4'], FONT_B);
  }
  drawDetails(ctx, S.cx.det, R.card, sel ? codexCard(sv, S.cx.section, sel) : { title: CODEX_SECTIONS[S.cx.section], lines: [t('codex.empty')] }, `${S.cx.section}:${sel}`);
}

export { enemyKey };
