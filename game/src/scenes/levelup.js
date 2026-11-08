// Level-up windows (docs/specs/levels-20.md): what the new levels gave (hero + companions), ASI choice
// (+2 / +1+1 / talent instead), talent pick, character sheet of abilities. All built on game.openModal.
import { t } from '../data/text/index.js';
import { xpInfo, abilityTip, talentTip } from '../ui/tips.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, talentsForSlot } from '../data/talents.js';
import { STATS, ASI_STAT_MAX } from '../rules/character.js';
import { levelGains } from '../rules/progression.js';
import { buildHero, buildCompanion, chooseAsi, chooseCompanionAsi, chooseMemberTalent, memberEntry, memberUnit, memberPending, talentCtx, tf } from '../world/state.js';
import { saveGame } from '../save.js';

const statName = (k) => t(`stat.${k}`);
const MAX_LINES = 12;
const cut = (s, n = 140) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const sign = (v) => (typeof v === 'number' && v >= 0 ? `+${v}` : String(v));

/** Short text of an upgrade: its desc, else «кости 2d10, ЭНР 3, …». */
export function upgradeText(g) {
  if (g.desc) return g.desc;
  const ch = g.changes || {};
  const parts = [];
  for (const [k, v] of Object.entries(ch)) {
    if (k === 'effect') continue;
    if (k === 'dice') parts.push(`${t('lvl.ch.dice')} ${v}`);
    else if (k === 'cost') parts.push(tf('lvl.cost', { n: v }));
    else if (k === 'usesPerBattle') parts.push(tf('lvl.uses', { n: v }));
    else if (k === 'area') parts.push(`${t('lvl.ch.area')} ${typeof v === 'number' ? v : v.size ?? ''}`);
    else if (k === 'bonus') parts.push(`${t('lvl.ch.bonus')} ${Array.isArray(v) ? v.filter((x) => typeof x === 'number').map(sign).join('') : sign(v)}`);
    else parts.push(`${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  return parts.join(', ');
}

/** Lines describing what class level L gives (cls object, path id). */
export function gainLines(cls, path, level) {
  const G = levelGains(cls, path, level);
  const out = [];
  const abil = (id) => (cls.abilities || []).find((a) => a.id === id);
  for (const a of G.abilities) out.push({ text: `${t('lvl.ability')}: ${a.name}${a.desc ? ` — ${cut(a.desc)}` : ''}`, color: 'a' });
  for (const p of G.passives) out.push({ text: `${t('lvl.passive')}: ${p.name || p.id}${p.desc ? ` — ${cut(p.desc)}` : ''}`, color: 'j' });
  for (const g of G.upgrades) out.push({ text: `${t('lvl.upgrade')}: ${abil(g.ability)?.name || g.ability} — ${cut(upgradeText(g))}`, color: 'h' });
  if (G.asi) out.push({ text: t('lvl.asi'), color: 'b' });
  return out;
}

/**
 * Show pending level-up news and ASI choices one after another. Returns true if a window was opened;
 * onDone(game) runs after the last one (also when nothing was pending: then returns false and does not call it).
 */
export function openLevelUp(game, onDone) {
  const sv = game.save;
  const h = sv.hero;
  const news = h.levelNews || [];
  if (news.length) {
    // a big jump is split into several windows of at most MAX_LINES lines (the modal does not scroll)
    const all = [...news].sort((a, b) => a - b);
    const cls = game.data.CLASSES[h.cls];
    const lines = [];
    const levels = [];
    for (const lv of all) {
      const gl = gainLines(cls, h.path, lv);
      const chunk = [...(all.length > 1 ? [{ text: tf('lvl.level', { n: lv }), color: '5' }] : []), ...(gl.length ? gl : [{ text: t('lvl.nothing'), color: '4' }])];
      if (levels.length && lines.length + chunk.length > MAX_LINES) break;
      levels.push(lv);
      lines.push(...chunk);
    }
    h.levelNews = all.filter((l) => !levels.includes(l));
    saveGame(sv);
    if (h.pendingTalents > 0) lines.push({ text: t('lvl.talentLine'), color: 'a' });
    game.openModal({
      title: tf('lvl.title', { n: levels[levels.length - 1] }), width: 980, lines,
      options: [{ label: t('lvl.ok'), run: (g) => { if (!openLevelUp(g, onDone)) onDone?.(g); } }],
      onCancel: (g) => { if (!openLevelUp(g, onDone)) onDone?.(g); },
    });
    return true;
  }
  const pend = h.pendingAsi || [];
  const next = (g) => { if (!openLevelUp(g, onDone)) onDone?.(g); };
  if (pend.length) { openAsi(game, Math.min(...pend), next); return true; }
  // companions-scenes.md: the queue of companion level-ups — news window per companion, then their ASI choices
  for (const p of sv.party) {
    if (p.state === 'left') continue;
    const n = NPCS[p.npc];
    const cls = n && game.data.CLASSES[n.cls];
    if (!cls) continue;
    if ((p.levelNews || []).length) {
      const lvls = [...p.levelNews].sort((a, b) => a - b);
      const lines = [];
      for (const lv of lvls) {
        const gl = gainLines(cls, p.path || n.path, lv).filter((x) => x.text !== t('lvl.asi'));
        lines.push(...(lvls.length > 1 ? [{ text: tf('lvl.level', { n: lv }), color: '5' }] : []), ...(gl.length ? gl : [{ text: t('lvl.nothing'), color: '4' }]));
      }
      if (p.pendingTalents > 0) lines.push({ text: t('comp.talentLine'), color: 'a' });
      p.levelNews = []; p.asiNotes = [];
      saveGame(sv);
      game.openModal({ title: tf('comp.levelTitle', { name: n.name, n: lvls[lvls.length - 1] }), width: 980, lines: lines.slice(0, MAX_LINES + 4),
        options: [{ label: t('lvl.ok'), run: next }], onCancel: next });
      return true;
    }
    if ((p.pendingAsi || []).length) { openAsi(game, Math.min(...p.pendingAsi), next, next, { npc: p.npc }); return true; }
  }
  return false;
}

/**
 * «Повысить уровень» of any member: pending ASI (lowest level first), then pending level talents, one window after
 * another. onDone(game) — when nothing is left or the player postponed a choice (Esc).
 */
export function openMemberLevelUp(game, key, onDone) {
  const sv = game.save;
  const pend = memberPending(sv, key);
  const next = (g) => openMemberLevelUp(g, key, onDone);
  if (pend.asi.length) return openAsi(game, pend.asi[0], next, (g) => onDone?.(g), key === 'hero' ? {} : { npc: key });
  if (pend.talents > 0) return openTalentPick(game, null, (g) => onDone?.(g), { key, onDone: next });
  onDone?.(game);
}

/** ASI choice for a pending level. Esc — later (stays pending). opts.npc — a companion's choice (companions-scenes.md). */
export function openAsi(game, level, onDone, onCancel = onDone, opts = {}) {
  const sv = game.save;
  const p = opts.npc ? sv.party.find((x) => x.npc === opts.npc) : null;
  const u = p ? buildCompanion(sv, p, game.data) : buildHero(sv, game.data);
  const apply = (g, choice) => {
    for (const m of (p ? chooseCompanionAsi(sv, p.npc, level, choice, g.data) : chooseAsi(sv, level, choice, g.data))) g.toast(m.text, m.color);
    saveGame(sv);
    onDone?.(g);
  };
  const statOpt = (k, n, run) => {
    const capped = u.stats[k] + n > ASI_STAT_MAX;
    return { label: `${statName(k)} ${u.stats[k]} → ${Math.min(ASI_STAT_MAX, u.stats[k] + n)}`, disabled: capped, reason: t('lvl.capped'), run };
  };
  const back = (g) => openAsi(g, level, onDone, onCancel, opts);
  // the same talent window for the hero and companions (panel of details, requirements by the member's own build)
  const talentOpt = { label: t('lvl.talent'), run: (g) => openTalentPick(g, (g2, id) => apply(g2, { talent: id }), back, { key: p ? p.npc : 'hero' }) };
  game.openModal({
    title: p ? tf('comp.asiTitle', { name: NPCS[p.npc].name, n: level }) : tf('lvl.asiTitle', { n: level }), width: 820,
    lines: [{ text: t('lvl.asiText'), color: '4' }],
    options: [
      { label: t('lvl.plus2'), run: (g) => g.openModal({ title: t('lvl.plus2'), options: STATS.map((k) => statOpt(k, 2, (g2) => apply(g2, { stats: { [k]: 2 } }))), onCancel: back }) },
      { label: t('lvl.plus11'), run: (g) => g.openModal({
        title: t('lvl.plus11First'), onCancel: back,
        options: STATS.map((k) => statOpt(k, 1, (g2) => g2.openModal({
          title: t('lvl.plus11Second'), onCancel: back,
          options: STATS.filter((k2) => k2 !== k).map((k2) => statOpt(k2, 1, (g3) => apply(g3, { stats: { [k]: 1, [k2]: 1 } }))),
        }))),
      }) },
      talentOpt,
      { label: t('lvl.later'), run: (g) => onCancel?.(g) },
    ],
    onCancel: (g) => onCancel?.(g),
  });
}

/** Talents a member (hero by default) can take on a level: race / job / stat lists by its race, class and stats, not owned yet. */
export function talentPool(sv, u, key = 'hero') {
  const ctx = talentCtx(sv, key, u);
  const own = new Set([...(memberEntry(sv, key)?.talents || []), ...(u.talents || []).map((x) => x.id || x)]);
  const seen = new Set();
  return ['race', 'job', 'stat'].flatMap((slot) => talentsForSlot(slot, ctx)).filter((x) => !own.has(x.id) && !seen.has(x.id) && seen.add(x.id));
}

/**
 * Talent pick window. onPick(game, id); without onPick the talent is learned as a level talent (pendingTalents) of
 * opts.key (hero by default), then opts.onDone(game).
 */
export function openTalentPick(game, onPick, onCancel, { key = 'hero', onDone } = {}) {
  const sv = game.save;
  const u = memberUnit(sv, key, game.data);
  if (!u) return onCancel?.(game);
  const pool = talentPool(sv, u, key);
  const name = key === 'hero' ? null : NPCS[key]?.name || key;
  game.openModal({
    title: name ? tf('comp.talentTitle', { name }) : t('talent.pending'), width: 980,
    lines: [{ text: t('talent.pickLevel'), color: 'a' }],
    options: pool.map((x) => ({ label: `${x.name}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`, sub: x.desc, detail: talentTip(x.id), run: (g) => {
      if (onPick) return onPick(g, x.id);
      for (const m of chooseMemberTalent(sv, key, x.id, g.data)) g.toast(m.text, m.color);
      saveGame(sv);
      onDone?.(g);
    } })),
    onCancel,
  });
}

/** Character sheet: stats and ASI in lines, abilities as paged options (sub = description), passives last. */
export function openSheet(game, u, name, xp = null) {
  const lines = [{ text: `${t('lvl.stats')}: ${STATS.map((k) => `${statName(k)} ${u.stats[k]}`).join('  ')}`, color: '5' }];
  if (xp != null) {
    // XP to the next level as a text bar
    const xi = xpInfo(xp, u.level);
    const n = 24, k = Math.round(xi.k * n);
    lines.push({ text: `${t('res.xp.full')}: ${'■'.repeat(k)}${'□'.repeat(n - k)} ${xi.text}`, color: 'a' });
  }
  if (u.asi && u.asi.length) lines.push({ text: `${t('lvl.asi')}: ${u.asi.map((e) => `${e.level}: ${e.talent ? TALENTS[e.talent]?.name || e.talent : Object.entries(e.stats || {}).map(([k, v]) => `${statName(k)} +${v}`).join(', ')}`).join(' · ')}`, color: 'b' });
  const passives = u.passives.filter((p) => p.name);
  if (passives.length) lines.push({ text: `${t('lvl.passive')}: ${passives.map((p) => p.name).join(', ')}`, color: 'j' });
  const options = u.abilities.map((a) => {
    const tags = [a.level ? `${t('world.level')} ${a.level}` : '', a.cost ? tf('lvl.cost', { n: a.cost }) : '', a.usesPerBattle ? tf('lvl.uses', { n: a.usesPerBattle }) : '',
      a.upgrades ? tf('lvl.upgraded', { n: a.upgrades.join(', ') }) : ''].filter(Boolean).join(' · ');
    return { label: `${a.upgrades ? '▲ ' : a.level === u.level ? '★ ' : ''}${a.name} (${tags})`, sub: a.desc || '', keep: true, tip: abilityTip(a) };
  });
  options.push({ label: t('lvl.ok') });
  game.openModal({ title: tf('lvl.sheetTitle', { name }), width: 1100, lines, options });
}
