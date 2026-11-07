// Flexible creation («Свободная раскладка», v3): point buy 27, skills 2 base + 2 extra, proficiencies within
// profPoints, optional phobias, clothes colour (sprite variant), backstory, starter kit with choices.
// Errors come from rules/build.js validateBuild; «Далее» is locked while there are errors.
// createBuildScene(hero {race, cls, path, name}, back scene, onNext(game, hero + build fields))
import { t } from '../data/text/index.js';
import { buildCreature, mod, STATS, pointBuyCost } from '../rules/character.js';
import { validateBuild, POINT_BUY_TOTAL, STAT_MIN, STAT_MAX, BASE_SKILLS, EXTRA_SKILLS, MAX_PHOBIAS } from '../rules/build.js';
import { defaultProficiencies, mergeProficiencies, proficiencyCost, profPoints, CREATION_MAX_TIER, ARMOR_ORDER } from '../rules/equipment.js';
import { PHOBIA_COMBAT_TRIGGERS, PHOBIA_WORLD_TRIGGERS } from '../rules/combat.js';
import { SKILLS } from '../data/talents.js';
import { SPECIALIZATIONS } from '../data/skills.js';
import { ITEMS, WEAPONS, ARMOR, starterKit } from '../world/data.js';
import { drawHeroPortrait } from '../assets/sprites.js';
import { heroBuild } from '../ui/portrait-of.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { itemStats, soonNote, weaponTypeName, armorTypeName, tierName } from '../ui/items-ui.js';

const BASE_W = 1280, BASE_H = 720;
const STORY_MAX = 240;
/** Clothes colours: palette keys (STYLE palette). null — class default. */
export const LOOK_COLORS = [null, 'c', 'a', 'j', 'b', 'n', 'f', 'e', '4', 'o'];
const SMALL = '12px monospace';

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

export function createBuildScene(hero, back, onNext) {
  const st = {
    stats: Object.fromEntries(STATS.map((k) => [k, STAT_MIN])), base: [], extra: [], chosen: { weaponTypes: {}, dmgTypes: {}, armor: {} },
    phobia: [], look: null, story: '', focus: null, weapon: null, armor: null, time: 0,
  };
  let buttons = [], hover = null, ox = 0, oy = 0, errors = [], built = null, opts = null, defaults = null;
  let self;

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
    opts = kitOptions(hero.cls, hero.path, defaults);
    st.weapon = opts.weapons[0] || null;
    st.armor = opts.armor[0] || null;
  }

  const profRows = (game) => {
    const kw = ITEMS[st.weapon];
    const cls = game.data.CLASSES[hero.cls];
    const rows = ARMOR_ORDER.map((a) => ({ k: 'armor', id: a, name: `${t('create.armor')}: ${armorTypeName(a)}` }));
    const wt = [...new Set([kw?.type, ...opts.weapons.map((id) => ITEMS[id]?.type)].filter(Boolean))].slice(0, 2);
    for (const w of wt) rows.push({ k: 'weaponTypes', id: w, name: `${t('create.weapon')}: ${weaponTypeName(w)}` });
    const dt = kw?.dmgType || cls.weapon?.dmgType;
    if (dt) rows.push({ k: 'dmgTypes', id: dt, name: `${t('prof.dmgType')}: ${t(`dmg.${dt}`)}` });
    return rows;
  };
  const tierOf = (k, id) => mergeProficiencies(defaults, st.chosen)[k][id] ?? (k === 'weaponTypes' ? 2 : 1);
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
      buttons.push({ kind: 'stat+', id: k, label: '+', x: ox + 262, y, w: 32, h: 32, disabled: st.stats[k] >= STAT_MAX || costIf(k, 1) > POINT_BUY_TOTAL });
    });
    // A: proficiencies
    profRows(game).forEach((r, i) => {
      const y = oy + 436 + i * 30;
      const v = tierOf(r.k, r.id), def = defaults[r.k][r.id] ?? (r.k === 'weaponTypes' ? 2 : 1);
      buttons.push({ kind: 'prof-', id: r, label: '−', x: ox + 262, y, w: 26, h: 26, font: SMALL, disabled: v <= def });
      buttons.push({ kind: 'prof+', id: r, label: '+', x: ox + 398, y, w: 26, h: 26, font: SMALL, disabled: v >= CREATION_MAX_TIER });
    });
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
    // C: look, kit
    LOOK_COLORS.forEach((k, i) => buttons.push({ kind: 'look', id: k, label: k ? '' : '×', x: ox + 860 + i * 38, y: oy + 220, w: 34, h: 30, selected: st.look === k }));
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
    play('uiClick');
    st.focus = b.kind === 'story' ? 'story' : null;
    if (b.kind === 'stat-') st.stats[b.id]--;
    else if (b.kind === 'stat+') st.stats[b.id]++;
    else if (b.kind === 'prof+' || b.kind === 'prof-') {
      const r = b.id;
      const v = tierOf(r.k, r.id) + (b.kind === 'prof+' ? 1 : -1);
      const def = defaults[r.k][r.id] ?? (r.k === 'weaponTypes' ? 2 : 1);
      if (v <= def) delete st.chosen[r.k][r.id]; else st.chosen[r.k][r.id] = v;
    } else if (b.kind === 'skill') {
      // cycle: — → base (+2) → extra (+1) → —
      const id = b.id;
      if (st.base.includes(id)) { st.base = st.base.filter((x) => x !== id); if (st.extra.length < EXTRA_SKILLS) st.extra.push(id); }
      else if (st.extra.includes(id)) st.extra = st.extra.filter((x) => x !== id);
      else if (st.base.length < BASE_SKILLS) st.base.push(id);
      else if (st.extra.length < EXTRA_SKILLS) st.extra.push(id);
      else game.toast(t('create.skillsFull'), 'c');
    } else if (b.kind === 'phobia') st.phobia = st.phobia.includes(b.id) ? st.phobia.filter((x) => x !== b.id) : [...st.phobia, b.id];
    else if (b.kind === 'look') st.look = b.id;
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
      equipment: b.equipment, belt: opts.kit.belt || [], look: st.look, backstory: st.story.trim(), flex: true,
    });
  }

  // ---------------------------------------------------------------- render
  function drawStats(ctx) {
    const spent = pointBuyCost(st.stats);
    text(ctx, t('create.pointBuy'), ox + 24, oy + 72, C['4'], FONT_B);
    text(ctx, `${t('create.points')}: ${POINT_BUY_TOTAL - spent} / ${POINT_BUY_TOTAL}`, ox + 424, oy + 72, spent === POINT_BUY_TOTAL ? C.j : spent > POINT_BUY_TOTAL ? C.c : C.a, FONT_B, 'right');
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
    // proficiencies
    const budget = profPoints(1), spentP = profSpent();
    text(ctx, t('create.profs'), ox + 24, oy + 408, C['4'], FONT_B);
    text(ctx, `${t('create.points')}: ${budget - spentP} / ${budget}`, ox + 424, oy + 408, spentP > budget ? C.c : spentP === budget ? C.j : C.a, FONT_B, 'right');
    // need the game for profRows: rows were laid out already, read from the buttons
    for (const b of buttons) {
      if (b.kind !== 'prof-') continue;
      const r = b.id;
      text(ctx, fit(ctx, r.name, 232, SMALL), ox + 24, b.y + 7, C['5'], SMALL);
      text(ctx, `${tierOf(r.k, r.id)} · ${tierName(tierOf(r.k, r.id))}`, ox + 345, b.y + 7, C.h, SMALL, 'center');
    }
  }

  function drawMiddle(ctx) {
    text(ctx, t('create.skills'), ox + 444, oy + 72, C['4'], FONT_B);
    text(ctx, `${st.base.length}/${BASE_SKILLS} + ${st.extra.length}/${EXTRA_SKILLS}`, ox + 840, oy + 72, st.base.length === BASE_SKILLS && st.extra.length === EXTRA_SKILLS ? C.j : C.a, FONT_B, 'right');
    text(ctx, `${t('create.phobias')} (${st.phobia.length}/${MAX_PHOBIAS})`, ox + 444, oy + 396, C['4'], FONT_B);
    text(ctx, t('create.phobiaHint'), ox + 840, oy + 399, C['3'], SMALL, 'right');
    text(ctx, t('create.backstory'), ox + 444, oy + 586, C['4'], FONT_B);
  }

  function drawRight(ctx) {
    const x = ox + 860, y = oy + 64;
    panel(ctx, x, y, 396, 120, C['1'], C['3']);
    drawHeroPortrait(ctx, heroBuild({ race: hero.race, cls: hero.cls, look: st.look }), x + 10, y + 12, 2, { native: true }); // portraits v2
    text(ctx, fit(ctx, hero.name, 270, FONT_B), x + 120, y + 10, C.h, FONT_B);
    if (built) {
      text(ctx, `${t('res.hp')} ${built.maxHp} · ${t('res.mrl')} ${built.maxMrl} · ${t('res.enr')} ${built.maxEnr}`, x + 120, y + 34, C['5'], SMALL);
      text(ctx, `${t('res.kb')} ${built.kb} · ${t('create.speed')} ${built.speed} · ${t('item.hit')} ${built.weapon ? `+${built.hitBonus ?? 0}` : '—'}`, x + 120, y + 52, C['5'], SMALL);
      text(ctx, fit(ctx, `${t('create.weapon')}: ${built.weapon?.name || '—'} (${t('prof.tier')} ${built.weaponTier})`, 270, SMALL), x + 120, y + 70, C['4'], SMALL);
      text(ctx, fit(ctx, `${t('create.armor')}: ${ITEMS[st.armor]?.name || '—'} (${t('prof.tier')} ${built.armorTier})`, 270, SMALL), x + 120, y + 88, built.armorPenalty ? C.c : C['4'], SMALL);
    }
    text(ctx, t('create.look'), x, oy + 196, C['4'], FONT_B);
    text(ctx, t('create.kit'), x, oy + 262, C['4'], FONT_B);
    const kitBelt = (opts.kit.belt || []).map((id) => ITEMS[id]?.name || id).join(', ');
    text(ctx, fit(ctx, `${t('create.belt')}: ${kitBelt || '—'}`, 396, SMALL), x, S.armorY - 18, C['4'], SMALL);
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
      const h = hitButton(buttons, m);
      if (h !== hover && h && !h.disabled) play('uiHover');
      hover = h;
      if (m.clicked) {
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
        if (b.kind === 'look') {
          panel(ctx, b.x, b.y, b.w, b.h, b.id ? C[b.id] : C['2'], b.selected ? C.h : hover === b ? C['5'] : C['3']);
          if (!b.id) text(ctx, '×', b.x + b.w / 2, b.y + 7, C['5'], FONT_B, 'center');
          if (b.selected) { ctx.strokeStyle = C.h; ctx.lineWidth = 2; ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); }
          continue;
        }
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
