// Level-up windows (docs/specs/levels-20.md): what the new levels gave (hero + companions), ASI choice
// (+2 / +1+1 / talent instead), talent pick, character sheet of abilities. All built on game.openModal.
import { t } from '../data/text/index.js';
import { xpInfo, abilityTip, talentTip } from '../ui/tips.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, talentsForSlot } from '../data/talents.js';
import { STATS, ASI_STAT_MAX } from '../rules/character.js';
import { levelGains } from '../rules/progression.js';
import { buildHero, buildCompanion, chooseAsi, chooseCompanionAsi, learnTalent, tf } from '../world/state.js';
import { COMPANION_RULES as CR } from '../data/companions.js';
import { hashSeed, createRng } from '../rules/rng.js';
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
      for (const note of p.asiNotes || []) lines.push({ text: note, color: 'b' });
      if ((p.asiNotes || []).length) lines.push({ text: tf('comp.autoAsiWhy', { n: CR.loyalty.trustsChoicesAt }), color: '4' });
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

/** Companion talent offers for an ASI level: COMPANION_RULES.levelup.talentOffers random ones + the favourite (talents[1]). */
export function companionTalentOffers(sv, p, u, level) {
  const n = NPCS[p.npc];
  const ctx = { race: n.race, cls: n.cls, stats: u.stats, level: u.level, weaponRange: u.weapon?.range || 1, tags: u.tags };
  const own = new Set([...(p.talents || []), ...(u.talents || []).map((x) => x.id || x)]);
  const seen = new Set();
  const pool = ['race', 'job', 'stat'].flatMap((slot) => talentsForSlot(slot, ctx)).filter((x) => !own.has(x.id) && !seen.has(x.id) && seen.add(x.id));
  const rng = createRng(hashSeed(`${p.npc}:${level}`));
  const pick = [];
  while (pick.length < CR.levelup.talentOffers && pool.length) pick.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const fav = n.companion?.talents?.[1];
  if (fav && TALENTS[fav] && !own.has(fav) && !pick.some((x) => x.id === fav)) pick.push({ ...TALENTS[fav], id: fav, fav: true });
  return pick;
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
  const talentOpt = p
    ? { label: t('lvl.talent'), run: (g) => g.openModal({ title: t('lvl.talent'), width: 980, onCancel: back,
      options: companionTalentOffers(sv, p, u, level).map((x) => ({ label: `${x.name}${x.fav ? ` · ${t('comp.talentFav')}` : ''}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`,
        sub: x.desc, detail: talentTip(x.id), run: (g2) => apply(g2, { talent: x.id }) })) }) }
    : { label: t('lvl.talent'), run: (g) => openTalentPick(g, (g2, id) => apply(g2, { talent: id }), back) };
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

/** Talents the hero can take on a level: race / job / stat lists, not owned yet. */
export function talentPool(sv, u) {
  const ctx = { race: sv.hero.race, cls: sv.hero.cls, origin: sv.hero.origin, alignment: sv.hero.alignment, stats: u.stats, level: sv.hero.level, weaponRange: u.weapon?.range || 1, tags: u.tags };
  const seen = new Set();
  return ['race', 'job', 'stat'].flatMap((slot) => talentsForSlot(slot, ctx)).filter((x) => !sv.hero.talents.includes(x.id) && !seen.has(x.id) && seen.add(x.id));
}

/** Talent pick window. onPick(game, id); without onPick the talent is learned as a level talent (pendingTalents). */
export function openTalentPick(game, onPick, onCancel) {
  const sv = game.save;
  const pool = talentPool(sv, buildHero(sv, game.data));
  game.openModal({
    title: t('talent.pending'), width: 980,
    lines: [{ text: t('talent.pickLevel'), color: 'a' }],
    options: pool.map((x) => ({ label: `${x.name}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`, sub: x.desc, detail: talentTip(x.id), run: (g) => {
      if (onPick) return onPick(g, x.id);
      sv.hero.pendingTalents--;
      for (const m of learnTalent(sv, x.id, g.data, { force: true })) g.toast(m.text, m.color);
      saveGame(sv);
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
