// Flexible creation («Свободная раскладка», v3): point buy 27, skills 2 base + 2 extra, proficiencies within
// profPoints (scrollable slider list: every armour / weapon / damage type), optional phobias (+PHOBIA_STAT_POINTS
// to the point buy each), backstory, starter kit with choices.
// Errors come from rules/build.js validateBuild; «Далее» is locked while there are errors.
// createBuildScene(hero {race, cls, path, name}, back scene, onNext(game, hero + build fields))
import { t } from '../data/text/index.js';
import { buildCreature, mod, STATS, pointBuyCost } from '../rules/character.js';
import { validateBuild, POINT_BUY_TOTAL, STAT_MIN, STAT_MAX, BASE_SKILLS, EXTRA_SKILLS, MAX_PHOBIAS, PHOBIA_STAT_POINTS, pointBuyTotal, canDropPhobia } from '../rules/build.js';
import { defaultProficiencies, proficiencyCost, profPoints, ARMOR_ORDER, DMG_TYPES, baseTier, ownWeaponType, creationMaxTier, tierCost,
  WEAPON_TIER_HIT, DMG_TYPE_TIER_DMG, HEAVY_MASTERY_KB, LIGHT_MASTERY_BONUS_ACTIONS, MECH_MIN_TIER } from '../rules/equipment.js';
import { WEAPON_TYPES } from '../data/items/weapons.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from '../ui/scroll.js';
import { PHOBIA_COMBAT_TRIGGERS, PHOBIA_WORLD_TRIGGERS } from '../rules/combat.js';
import { SKILLS } from '../data/talents.js';
import { SPECIALIZATIONS } from '../data/skills.js';
import { ITEMS, WEAPONS, ARMOR, starterKit } from '../world/data.js';
import { drawHeroPic } from '../ui/portrait-of.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { itemStats, soonNote, weaponTypeName, armorTypeName, tierName, itemTip } from '../ui/items-ui.js';
import { hotspot } from '../ui/tooltip.js';

import { openBackstoryPick, backstoryLabel } from '../ui/backstory-ui.js';
const BASE_W = 1280, BASE_H = 720;
const STORY_MAX = 240;
/** Clothes colours: palette keys (STYLE palette). null — class default. */
const SMALL = '12px monospace';
const TINY = '10px monospace';
/** Proficiency slider list: view (relative to ox/oy), row / group heights, tick spacing; tiers 1..4 always drawn. */
const PL = { x: 24, y: 440, w: 400, h: 264, row: 24, head: 20, tick0: 168, tickW: 58 };
const TOP_TIER = 4;
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/** Full proficiency list for the slider screen: groups + rows { k, id, name }. */
export function profListRows() {
  const rows = [];
  const group = (k, ids, name) => { rows.push({ head: true, k }); for (const id of ids) rows.push({ k, id, name: name(id) }); };
  group('armor', ARMOR_ORDER, armorTypeName);
  group('weaponTypes', Object.keys(WEAPON_TYPES), weaponTypeName);
  group('dmgTypes', DMG_TYPES, (d) => t(`dmg.${d}`));
  return rows;
}

/** What a proficiency tier gives (one line). */
export function tierEffect(k, id, tier) {
  if (k === 'weaponTypes') return fmt(t(`prof.eff.weaponTypes.${tier}`), { n: WEAPON_TIER_HIT[tier] });
  if (k === 'dmgTypes') return fmt(t(`prof.eff.dmgTypes.${tier}`), { n: DMG_TYPE_TIER_DMG[tier] });
  if (id === 'mech' && tier < MECH_MIN_TIER) return t('prof.eff.armor.1');
  if (tier === 4) return fmt(t(`prof.eff.armor.4.${id}`), { n: id === 'light' ? LIGHT_MASTERY_BONUS_ACTIONS : HEAVY_MASTERY_KB });
  return t(id === 'mech' && tier === 3 ? 'prof.eff.armor.mech3' : `prof.eff.armor.${tier}`);
}

/** Weapon / armour choices of the starter kit: the kit item + same-tier alternatives the class handles well. */
export function kitOptions(cls, pathId, prof) {
  const kit = starterKit(cls, pathId) || { weapon: null, armor: null, belt: [] };
  const kw = ITEMS[kit.weapon], ka = ITEMS[kit.armor];
  const wAlt = Object.values(WEAPONS).filter((w) => w.id !== kit.weapon && !w.unique && w.tier === 1 && (prof.weaponTypes[w.type] ?? 2) >= 3
    && (!kw || (w.range > 1) === (kw.range > 1)) && (w.price || 0) <= Math.max(60, (kw?.price || 0) * 1.5)).slice(0, 2);
  const aAlt = Object.values(ARMOR).filter((a) => a.id !== kit.armor && !a.unique && !a.natural && a.tier === 1 && (prof.armor[a.type] ?? 1) >= 3
    && (a.price || 0) <= Math.max(60, (ka?.price || 0) * 1.5)).slice(0, 2);
  return { kit, weapons: [kit.weapon, ...wAlt.map((w) => w.id)].filter(Boolean), armor: [kit.armor, ...aAlt.map((a) => a.id)].filter(Boolean) };
}

export function createBuildScene(hero, back, onNext, step = { n: 2, of: 4 }) {
  const st = {
    stats: Object.fromEntries(STATS.map((k) => [k, STAT_MIN])), base: [], extra: [], chosen: { weaponTypes: {}, dmgTypes: {}, armor: {} },
    phobia: [], look: null, story: '', bg: hero.bg || null, focus: null, weapon: null, armor: null, time: 0,
    profScroll: createScroll(), profDrag: null, profMsg: null, profRows: profListRows(),
  };
  let buttons = [], hover = null, ox = 0, oy = 0, errors = [], built = null, opts = null, defaults = null;
  let self, ownType = null;

  function init(game) {
    const cls = game.data.CLASSES[hero.cls];
    const pathDef = cls.paths.find((p) => p.id === hero.path) || {};
    // start from the recommended array when it is a legal 27-point buy, else all 8
    const rec = pathDef.recommended || cls.recommended || {};
    if (STATS.every((k) => rec[k] >= STAT_MIN && rec[k] <= STAT_MAX) && pointBuyCost(rec) === POINT_BUY_TOTAL) st.stats = { ...rec };
    // skills: class specialisation as a hint (the player may change them)
    const spec = SPECIALIZATIONS[hero.cls]?.spec || [];
    st.base = spec.slice(0, BASE_SKILLS);
    st.extra = (SPECIALIZATIONS[hero.cls]?.related || []).slice(0, EXTRA_SKILLS);
    defaults = defaultProficiencies(cls, pathDef);
    ownType = ownWeaponType(cls, pathDef);
    opts = kitOptions(hero.cls, hero.path, defaults);
    st.weapon = opts.weapons[0] || null;
    st.armor = opts.armor[0] || null;
  }

  const tierOf = (k, id) => st.chosen[k][id] ?? baseTier(defaults, k, id);
  const pointsTotal = () => pointBuyTotal(st.phobia.length);
  const view = () => ({ x: ox + PL.x, y: oy + PL.y, w: PL.w, h: PL.h });
  const tickX = (tier) => ox + PL.x + PL.tick0 + (tier - 1) * PL.tickW;
  const profContentH = () => st.profRows.reduce((h, r) => h + (r.head ? PL.head : PL.row), 0);
  /** Set one proficiency to `want`, clamped by the class floor, the creation cap and the point budget. */
  function setTier(game, r, want) {
    const floor = baseTier(defaults, r.k, r.id), max = creationMaxTier(r.k, r.id, ownType), cur = tierOf(r.k, r.id);
    const budget = profPoints(1), others = profSpent() - tierCost(defaults, r.k, r.id, cur);
    let v = Math.max(floor, Math.min(max, want)), msg = null;
    if (want < floor) msg = fmt(t('create.profFloor'), { name: r.name });
    else if (want > max) msg = fmt(t('create.profMastery'), { name: r.name });
    const target = v;
    while (v > floor && others + tierCost(defaults, r.k, r.id, v) > budget) v--;
    if (v < target) msg = fmt(t('create.profNoPoints'), { name: r.name, need: tierCost(defaults, r.k, r.id, target) - tierCost(defaults, r.k, r.id, cur), left: budget - profSpent() });
    if (msg) st.profMsg = { text: msg, until: st.time + 3 };
    else st.profMsg = null;
    if (v === cur) { if (msg && !st.profDrag?.warned) { play('miss'); if (st.profDrag) st.profDrag.warned = true; } return; }
    if (v <= floor) delete st.chosen[r.k][r.id]; else st.chosen[r.k][r.id] = v;
    play('uiClick');
    revalidate(game);
    layout(game);
  }
  const nearestTier = (x) => Math.max(1, Math.min(TOP_TIER, Math.round((x - tickX(1)) / PL.tickW) + 1));
  const profSpent = () => proficiencyCost(defaults, st.chosen);

  function buildSpec() {
    const prof = Object.fromEntries(Object.entries(st.chosen).filter(([, v]) => Object.keys(v).length));
    return {
      race: hero.race, cls: hero.cls, path: hero.path, level: 1, stats: { ...st.stats },
      skills: { base: [...st.base], extra: [...st.extra] },
      proficiencies: Object.keys(prof).length ? prof : undefined,
      phobia: st.phobia.length ? st.phobia.map((trigger) => ({ trigger })) : undefined,
      equipment: { weapon: st.weapon, armor: st.armor, offhand: null, mods: [] },
    };
  }

  function revalidate(game) {
    const b = buildSpec();
    errors = validateBuild(b, game.data);
    st.errors = errors;
    try { built = buildCreature({ ...b, data: game.data, id: 'preview', name: hero.name }); } catch { /* keep the last preview */ }
  }

  function layout(game) {
    ox = Math.max(0, Math.floor((game.width - BASE_W) / 2));
    oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    buttons = [];
    // A: stats
    STATS.forEach((k, i) => {
      const y = oy + 100 + i * 38;
      buttons.push({ kind: 'stat-', id: k, label: '−', x: ox + 180, y, w: 32, h: 32, disabled: st.stats[k] <= STAT_MIN });
      buttons.push({ kind: 'stat+', id: k, label: '+', x: ox + 262, y, w: 32, h: 32, disabled: st.stats[k] >= STAT_MAX || costIf(k, 1) > pointsTotal() });
    });
    // A: proficiencies — one 'prof' button per visible slider row (b.ticks: x of tiers 1..4, for clicks / tests)
    const v = view();
    let cy = v.y - st.profScroll.off;
    for (const r of st.profRows) {
      const h = r.head ? PL.head : PL.row;
      r.y = cy;
      if (!r.head && cy + h / 2 > v.y && cy + h / 2 < v.y + v.h) {
        const y0 = Math.max(v.y, cy), y1 = Math.min(v.y + v.h, cy + h);
        buttons.push({ kind: 'prof', id: r, label: '', x: v.x, y: y0, w: v.w - SCROLLBAR_W - 4, h: y1 - y0, rowY: cy,
          ticks: [1, 2, 3, 4].map(tickX), tier: tierOf(r.k, r.id) });
      }
      cy += h;
    }
    // B: skills (2 columns)
    Object.keys(SKILLS).forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const mark = st.base.includes(id) ? 'base' : st.extra.includes(id) ? 'extra' : null;
      buttons.push({ kind: 'skill', id, mark, label: SKILLS[id].name, x: ox + 444 + col * 200, y: oy + 100 + row * 28, w: 194, h: 26, font: SMALL, selected: !!mark });
    });
    // B: phobias (3 columns)
    [...PHOBIA_COMBAT_TRIGGERS, ...PHOBIA_WORLD_TRIGGERS].forEach((id, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const on = st.phobia.includes(id);
      buttons.push({ kind: 'phobia', id, label: t(`phobia.${id}`), x: ox + 444 + col * 133, y: oy + 422 + row * 26, w: 129, h: 24, font: SMALL, selected: on,
        disabled: !on && st.phobia.length >= MAX_PHOBIAS });
    });
    buttons.push({ kind: 'story', id: 'story', label: '', x: ox + 444, y: oy + 610, w: 396, h: 96 });
    // world-consequences.md ч.4: one backstory next to the free text
    buttons.push({ kind: 'bg', id: 'bg', label: fit(game.ctx, backstoryLabel(st.bg), 260, SMALL), x: ox + 568, y: oy + 581, w: 272, h: 26, font: SMALL, selected: !!st.bg });
    // C: look, kit
    opts.weapons.forEach((id, i) => buttons.push({ kind: 'weapon', id, label: ITEMS[id].name, sub: itemStats(ITEMS[id]), font: SMALL, x: ox + 860, y: oy + 284 + i * 44, w: 396, h: 40, selected: st.weapon === id }));
    const ay = oy + 284 + opts.weapons.length * 44 + 24;
    opts.armor.forEach((id, i) => buttons.push({ kind: 'armor', id, label: ITEMS[id].name, sub: itemStats(ITEMS[id]), font: SMALL, x: ox + 860, y: ay + i * 44, w: 396, h: 40, selected: st.armor === id }));
    S.armorY = ay;
    buttons.push({ kind: 'back', id: 'back', label: t('create.back'), x: ox + 860, y: oy + 664, w: 190, h: 44 });
    buttons.push({ kind: 'next', id: 'next', label: t('create.next'), key: 'Enter', x: ox + 1066, y: oy + 664, w: 190, h: 44, disabled: errors.length > 0 });
    st.buttons = buttons;
  }
  const S = { armorY: 0 };
  const costIf = (k, d) => pointBuyCost({ ...st.stats, [k]: st.stats[k] + d });

  function choose(game, b) {
    if (b.disabled) { play('miss'); return; }
    if (b.kind === 'prof') {
      const m = game.input.mouse;
      if (m.x < tickX(1) - PL.tickW / 2) return; // the name column: hover only
      st.profDrag = { r: b.id, warned: false };
      setTier(game, b.id, nearestTier(m.x));
      return;
    }
    if (b.kind === 'phobia' && st.phobia.includes(b.id) && !canDropPhobia(st.stats, st.phobia.length)) {
      play('miss');
      game.toast(fmt(t('create.phobiaFree'), { n: PHOBIA_STAT_POINTS }), 'c');
      return;
    }
    play('uiClick');
    st.focus = b.kind === 'story' ? 'story' : null;
    if (b.kind === 'bg') { openBackstoryPick(game, { race: hero.race, current: st.bg, onPick: (g, id) => { st.bg = id; layout(g); } }); return; }
    if (b.kind === 'stat-') st.stats[b.id]--;
    else if (b.kind === 'stat+') st.stats[b.id]++;
    else if (b.kind === 'skill') {
      // cycle: — → base (+2) → extra (+1) → —
      const id = b.id;
      if (st.base.includes(id)) { st.base = st.base.filter((x) => x !== id); if (st.extra.length < EXTRA_SKILLS) st.extra.push(id); }
      else if (st.extra.includes(id)) st.extra = st.extra.filter((x) => x !== id);
      else if (st.base.length < BASE_SKILLS) st.base.push(id);
      else if (st.extra.length < EXTRA_SKILLS) st.extra.push(id);
      else game.toast(t('create.skillsFull'), 'c');
    } else if (b.kind === 'phobia') st.phobia = st.phobia.includes(b.id) ? st.phobia.filter((x) => x !== b.id) : [...st.phobia, b.id];
    else if (b.kind === 'weapon') st.weapon = b.id;
    else if (b.kind === 'armor') st.armor = b.id;
    else if (b.kind === 'back') { game.setScene(back); return; }
    else if (b.kind === 'next') { next(game); return; }
    revalidate(game);
    layout(game);
  }

  function next(game) {
    revalidate(game);
    if (errors.length) { play('miss'); game.toast(errors[0].msg, 'c'); layout(game); return; }
    const b = buildSpec();
    onNext(game, {
      ...hero, stats: b.stats, skills: b.skills, proficiencies: b.proficiencies || null, phobia: b.phobia || null,
      equipment: b.equipment, belt: opts.kit.belt || [], look: st.look, backstory: st.story.trim(), bg: st.bg, flex: true,
    });
  }

  // ---------------------------------------------------------------- render
  function drawStats(ctx) {
    const spent = pointBuyCost(st.stats), total = pointsTotal(), bonus = total - POINT_BUY_TOTAL;
    text(ctx, t('create.pointBuy'), ox + 24, oy + 72, C['4'], FONT_B);
    const pts = `${t('create.points')}: ${total - spent} / ${POINT_BUY_TOTAL}${bonus ? ` + ${bonus} (${t('create.pointsPhobia')})` : ''}`;
    text(ctx, pts, ox + 424, oy + 72, spent === total ? C.j : spent > total ? C.c : C.a, FONT_B, 'right');
    STATS.forEach((k, i) => {
      const y = oy + 100 + i * 38;
      const final = built?.stats?.[k] ?? st.stats[k];
      text(ctx, t(`stat.${k}`), ox + 24, y + 8, C['5'], FONT_B);
      text(ctx, t(`statName.${k}`), ox + 66, y + 10, C['4'], SMALL);
      text(ctx, String(st.stats[k]), ox + 237, y + 7, C.h, FONT_B, 'center');
      const m = mod(final);
      text(ctx, `→ ${final} (${m >= 0 ? '+' : ''}${m})`, ox + 304, y + 8, m > 0 ? C.j : m < 0 ? C.c : C['4']);
    });
    text(ctx, t('create.pointBuyHint'), ox + 24, oy + 368, C['3'], SMALL);
    drawProfs(ctx);
  }

  function drawProfs(ctx) {
    const budget = profPoints(1), spentP = profSpent(), v = view();
    text(ctx, t('create.profs'), ox + 24, oy + 392, C['4'], FONT_B);
    text(ctx, `${t('create.points')}: ${budget - spentP} / ${budget}`, ox + 424, oy + 392, spentP > budget ? C.c : spentP === budget ? C.j : C.a, FONT_B, 'right');
    // hint line: limit message > hovered tick > usage hint
    let hint = t('create.profHint'), hc = C['3'];
    if (st.profMsg && st.time < st.profMsg.until) { hint = st.profMsg.text; hc = C.c; }
    else if (hover?.kind === 'prof' && hover.hoverTier) {
      const r = hover.id, tr = hover.hoverTier;
      hint = `${r.name} → ${tierName(tr)}: ${tierEffect(r.k, r.id, tr)}`; hc = C['5'];
    }
    text(ctx, fit(ctx, hint, v.w, SMALL), v.x, oy + 410, hc, SMALL);
    for (let tr = 1; tr <= TOP_TIER; tr++) text(ctx, tierName(tr), tickX(tr), oy + 428, C['4'], TINY, 'center');
    beginClip(ctx, v);
    for (const r of st.profRows) {
      if (r.y + PL.row < v.y || r.y > v.y + v.h) continue;
      if (r.head) { text(ctx, t(`create.profGroup.${r.k}`), v.x, r.y + 5, C.a, SMALL); continue; }
      const cur = tierOf(r.k, r.id), floor = baseTier(defaults, r.k, r.id), max = creationMaxTier(r.k, r.id, ownType);
      const cyy = r.y + PL.row / 2, isHover = hover?.kind === 'prof' && hover.id === r;
      if (isHover) { ctx.fillStyle = C['1']; ctx.fillRect(v.x, r.y + 1, v.w - SCROLLBAR_W - 4, PL.row - 2); }
      text(ctx, fit(ctx, r.name, PL.tick0 - 22, SMALL), v.x + 4, r.y + 6, cur > floor ? C.h : C['5'], SMALL);
      ctx.fillStyle = C['3'];
      ctx.fillRect(tickX(1), cyy - 1, tickX(max) - tickX(1), 2);
      ctx.fillStyle = cur > floor ? C.j : C['4'];
      ctx.fillRect(tickX(1), cyy - 2, tickX(cur) - tickX(1), 4);
      for (let tr = 1; tr <= TOP_TIER; tr++) {
        const x = tickX(tr);
        if (tr > max) { text(ctx, '×', x, r.y + 5, C['2'], SMALL, 'center'); continue; }
        ctx.fillStyle = tr <= cur ? (tr <= floor ? C['4'] : C.j) : C['2'];
        const s = tr === cur ? 6 : 4;
        ctx.fillRect(x - s, cyy - s, s * 2, s * 2);
        if (isHover && hover.hoverTier === tr) { ctx.strokeStyle = C.h; ctx.lineWidth = 1; ctx.strokeRect(x - 7.5, cyy - 7.5, 15, 15); }
      }
      // price of the next step (the slider's own cost is in the tooltip)
      const nextCost = cur < max ? tierCost(defaults, r.k, r.id, cur + 1) - tierCost(defaults, r.k, r.id, cur) : 0;
      text(ctx, cur < max ? `+${nextCost}` : t('create.profMax'), v.x + v.w - SCROLLBAR_W - 6, r.y + 6, cur < max && nextCost > budget - spentP ? C.c : C['4'], SMALL, 'right');
    }
    endClip(ctx);
    drawScrollbar(ctx, st.profScroll, v);
    for (const b of buttons) {
      if (b.kind !== 'prof') continue;
      const r = b.id;
      hotspot(b.x, b.y, b.w, b.h, () => {
        const floor = baseTier(defaults, r.k, r.id), max = creationMaxTier(r.k, r.id, ownType), cur = tierOf(r.k, r.id);
        const lines = [];
        for (let tr = 1; tr <= TOP_TIER; tr++) {
          const c = tierCost(defaults, r.k, r.id, tr);
          const price = tr > max ? t('create.profMax') : tr <= floor ? t('create.profFree') : `${t('create.profCost')} ${c}`;
          lines.push({ text: `${tr === cur ? '▶ ' : '  '}${tr} ${tierName(tr)}: ${tierEffect(r.k, r.id, tr)} · ${price}`, color: tr === cur ? 'h' : tr > max ? '3' : '5' });
        }
        return { title: `${t(`create.profGroup.${r.k}`)}: ${r.name}`, lines };
      });
    }
  }

  function drawMiddle(ctx) {
    text(ctx, t('create.skills'), ox + 444, oy + 72, C['4'], FONT_B);
    text(ctx, `${st.base.length}/${BASE_SKILLS} + ${st.extra.length}/${EXTRA_SKILLS}`, ox + 840, oy + 72, st.base.length === BASE_SKILLS && st.extra.length === EXTRA_SKILLS ? C.j : C.a, FONT_B, 'right');
    text(ctx, `${t('create.phobias')} (${st.phobia.length}/${MAX_PHOBIAS})`, ox + 444, oy + 396, C['4'], FONT_B);
    text(ctx, `${fmt(t('create.phobiaBonus'), { n: PHOBIA_STAT_POINTS })}; ${t('create.phobiaHint')}`, ox + 840, oy + 399, C['3'], SMALL, 'right');
    text(ctx, t('create.backstory'), ox + 444, oy + 586, C['4'], FONT_B);
  }

  function drawRight(ctx) {
    const x = ox + 860, y = oy + 64;
    panel(ctx, x, y, 396, 120, C['1'], C['3']);
    drawHeroPic(ctx, { race: hero.race, name: hero.name, avatar: hero.avatar, look: st.look }, x + 10, y + 12, 2, { native: true }); // the look the editor starts from (QA v48 #9)
    text(ctx, fit(ctx, hero.name, 270, FONT_B), x + 120, y + 10, C.h, FONT_B);
    if (built) {
      text(ctx, `${t('res.hp')} ${built.maxHp} · ${t('res.mrl')} ${built.maxMrl} · ${t('res.enr')} ${built.maxEnr}`, x + 120, y + 34, C['5'], SMALL);
      text(ctx, `${t('res.kb')} ${built.kb} · ${t('create.speed')} ${built.speed} · ${t('item.hit')} ${built.weapon ? `+${built.hitBonus ?? 0}` : '—'}`, x + 120, y + 52, C['5'], SMALL);
      text(ctx, fit(ctx, `${t('create.weapon')}: ${built.weapon?.name || '—'} (${t('prof.tier')} ${built.weaponTier})`, 270, SMALL), x + 120, y + 70, C['4'], SMALL);
      text(ctx, fit(ctx, `${t('create.armor')}: ${ITEMS[st.armor]?.name || '—'} (${t('prof.tier')} ${built.armorTier})`, 270, SMALL), x + 120, y + 88, built.armorPenalty ? C.c : C['4'], SMALL);
    }
    text(ctx, t('create.kit'), x, oy + 262, C['4'], FONT_B);
    const kitBelt = (opts.kit.belt || []).map((id) => ITEMS[id]?.name || id).join(', ');
    text(ctx, fit(ctx, `${t('create.belt')}: ${kitBelt || '—'}`, 396, SMALL), x, S.armorY - 18, C['4'], SMALL);
    if (kitBelt) hotspot(x, S.armorY - 18, 396, 16, () => ({ title: t('create.belt'), lines: (opts.kit.belt || []).filter((id) => ITEMS[id]).flatMap((id) => [{ text: ITEMS[id].name, color: 'h' }, itemStats(ITEMS[id])]) }));
    // errors
    const ey = S.armorY + opts.armor.length * 44 + 6;
    const lines = errors.length ? errors.slice(0, 4).map((e) => `• ${e.msg}`) : [t('create.buildOk')];
    textBlock(ctx, lines.join('\n'), x, ey, 396, errors.length ? C.c : C.j, SMALL, 16, Math.max(1, Math.floor((oy + 658 - ey) / 16)));
  }

  self = {
    id: 'create-build',
    S: st,
    enter(game) { if (!opts) init(game); revalidate(game); layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      st.time += dt;
      const inp = game.input, m = inp.mouse;
      // proficiency list: wheel / scrollbar, slider drag
      const off0 = st.profScroll.off;
      const sbUsed = updateScroll(st.profScroll, view(), profContentH(), m, { step: PL.row * 2 });
      if (st.profScroll.off !== off0) layout(game);
      if (st.profDrag) {
        if (!m.down && !m.clicked) st.profDrag = null;
        else if (!m.clicked) setTier(game, st.profDrag.r, nearestTier(m.x));
      }
      const h = sbUsed ? null : hitButton(buttons, m);
      if (h?.kind === 'prof') h.hoverTier = m.x >= tickX(1) - PL.tickW / 2 ? nearestTier(m.x) : null;
      if (h !== hover && h && !h.disabled && h.kind !== 'prof') play('uiHover');
      hover = h;
      if (m.clicked && !sbUsed) {
        if (h) { choose(game, h); if (game.scene !== self) return; } else st.focus = null;
      }
      if (st.focus === 'story') {
        for (const ch of inp.typed()) if (st.story.length < STORY_MAX && /[\p{L}\p{N}\p{P} ]/u.test(ch)) st.story += ch;
        if (inp.wasPressed('Backspace')) st.story = st.story.slice(0, -1);
        if (inp.wasPressed('Escape')) st.focus = null;
        return;
      }
      if (inp.wasPressed('Enter')) next(game);
      else if (inp.wasPressed('Escape')) game.setScene(back);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      text(ctx, t('create.flexTitle'), ox + 24, oy + 20, C.h, FONT_L);
      text(ctx, t('create.stepOf').replace('{n}', step.n).replace('{m}', step.of), ox + 24 + ctx.measureText(t('create.flexTitle')).width + 16, oy + 28, C['3'], FONT);
      text(ctx, `${hero.name} · ${game.data.RACES[hero.race].name} · ${game.data.CLASSES[hero.cls].name}`, ox + 1256, oy + 28, C['4'], FONT, 'right');
      drawStats(ctx);
      drawMiddle(ctx);
      for (const b of buttons) {
        if (b.kind === 'story') {
          panel(ctx, b.x, b.y, b.w, b.h, C['0'], st.focus === 'story' ? C.h : hover === b ? C['4'] : C['3']);
          const caret = st.focus === 'story' && Math.floor(st.time * 2) % 2 === 0 ? '_' : '';
          if (st.story || caret) textBlock(ctx, st.story + caret, b.x + 8, b.y + 6, b.w - 16, C['5'], SMALL, 16, 5);
          else text(ctx, t('create.backstoryHint'), b.x + 8, b.y + 6, C['3'], SMALL);
          continue;
        }
        if (b.kind === 'prof') continue; // drawn by drawProfs
        if (b.kind === 'skill') {
          button(ctx, { ...b, label: `${b.mark === 'base' ? '+2 ' : b.mark === 'extra' ? '+1 ' : ''}${b.label}` }, hover === b);
          continue;
        }
        if (b.kind === 'weapon' || b.kind === 'armor') {
          panel(ctx, b.x, b.y, b.w, b.h, b.selected ? C.i : hover === b ? C['3'] : C['2'], b.selected ? C.h : C['3']);
          const it = ITEMS[b.id];
          text(ctx, fit(ctx, it.name, b.w - 16, FONT_B), b.x + 8, b.y + 3, C['5'], FONT_B);
          const soon = soonNote(it);
          text(ctx, fit(ctx, `${b.sub}${soon ? ` · ${soon}` : ''}`, b.w - 16, SMALL), b.x + 8, b.y + 23, soon ? C.a : C['4'], SMALL);
          hotspot(b.x, b.y, b.w, b.h, () => itemTip(it, { u: built || undefined, tier: !!built })); // full card on hover
          continue;
        }
        button(ctx, b, hover === b);
      }
      drawRight(ctx);
      if (hover?.kind === 'skill') {
        const sk = SKILLS[hover.id];
        text(ctx, `${sk.name}: ${t(`stat.${sk.stat}`)} · ${t('create.skillHint')}`, ox + 444, oy + 384, C['3'], SMALL);
      }
      void LINE;
    },
  };
  return self;
}
