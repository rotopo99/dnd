// Character creation, page 2 (talents.md «Слоты при создании»): origin (faction slot), alignment, 4 talents —
// race / job / faction / alignment via talentsForSlot + talentAllowed, at most COMBAT_TALENT_LIMIT(1) combat ones,
// the class gadget (shown), the human «+1 to any stat» choice.
import { t } from '../data/text/index.js';
import { TALENTS, CREATION_SLOTS, COMBAT_TALENT_LIMIT, talentsForSlot, isCombatTalent } from '../data/talents.js';
import { buildCreature, STATS } from '../rules/character.js';
import { ORIGINS, originAllowed, gadgetFor } from '../world/data.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear } from '../ui/draw.js';

const BASE_W = 1280, BASE_H = 720;
const SLOT_ROWS = 8;

/** createTalentsScene(hero {race, cls, path, name}, back scene, onStart(game, fullHero)) */
export function createTalentsScene(hero, back, onStart) {
  const st = {
    origin: null, alignment: 'good', anyStat: null, picks: {}, focus: null, time: 0, pages: {}, lists: {},
  };
  let buttons = [];
  let hover = null;
  let ox = 0, oy = 0;
  let self;

  const origins = () => Object.values(ORIGINS).filter((o) => originAllowed(o.id, hero.race));
  const built = (game) => buildCreature({ race: hero.race, cls: hero.cls, path: hero.path, data: game.data, anyStat: st.anyStat || undefined });
  function ctx(game) {
    const u = built(game);
    return { race: hero.race, cls: hero.cls, origin: st.origin, alignment: st.alignment, stats: u.stats, level: 1, weaponRange: u.weapon?.range || 1, tags: u.tags };
  }
  const list = (game, slot) => st.lists[slot] || talentsForSlot(slot, ctx(game));
  const combatCount = (except) => CREATION_SLOTS.filter((s) => s !== except && st.picks[s] && isCombatTalent(TALENTS[st.picks[s]])).length;

  function validate(game) {
    if (!st.origin || !originAllowed(st.origin, hero.race)) st.origin = origins()[0]?.id || null;
    const c = ctx(game);
    for (const slot of CREATION_SLOTS) st.lists[slot] = talentsForSlot(slot, c); // cached until the next change
    for (const slot of CREATION_SLOTS) {
      const l = list(game, slot);
      if (!l.some((x) => x.id === st.picks[slot])) {
        const pick = l.find((x) => !isCombatTalent(x)) || l.find(() => combatCount(slot) < COMBAT_TALENT_LIMIT(1));
        st.picks[slot] = pick ? pick.id : null;
      }
    }
  }

  function layout(game) {
    ox = Math.max(0, Math.floor((game.width - BASE_W) / 2));
    oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    validate(game);
    buttons = [];
    origins().forEach((o, i) => buttons.push({ kind: 'origin', id: o.id, label: o.name, x: ox + 24, y: oy + 100 + i * 40, w: 260, h: 36, font: FONT, selected: st.origin === o.id }));
    const ay = oy + 100 + 11 * 40 + 24;
    ['good', 'evil'].forEach((a, i) => buttons.push({ kind: 'align', id: a, label: t(`create.align.${a}`), x: ox + 24 + i * 134, y: ay, w: 126, h: 36, selected: st.alignment === a }));
    if (game.data.RACES[hero.race]?.statBonus?.any) {
      STATS.forEach((k, i) => buttons.push({ kind: 'any', id: k, label: t(`stat.${k}`), x: ox + 24 + i * 37, y: ay + 74, w: 35, h: 30, font: '12px monospace', selected: (st.anyStat || null) === k }));
      buttons.push({ kind: 'any', id: null, label: t('create.anyDefault'), x: ox + 24, y: ay + 108, w: 260, h: 26, font: '12px monospace', selected: !st.anyStat });
    }
    CREATION_SLOTS.forEach((slot, si) => {
      const x = ox + 300 + (si % 2) * 306, y = oy + 100 + Math.floor(si / 2) * 290;
      const all = list(game, slot);
      const pages = Math.max(1, Math.ceil(all.length / SLOT_ROWS));
      const page = Math.min(st.pages[slot] || 0, pages - 1);
      if (pages > 1) {
        buttons.push({ kind: 'spage', slot, dir: -1, label: '‹', x: x + 232, y: y - 4, w: 30, h: 24, font: FONT_B, disabled: page === 0 });
        buttons.push({ kind: 'spage', slot, dir: 1, label: '›', x: x + 266, y: y - 4, w: 30, h: 24, font: FONT_B, disabled: page >= pages - 1 });
      }
      all.slice(page * SLOT_ROWS, page * SLOT_ROWS + SLOT_ROWS).forEach((tl, i) => {
        const combat = isCombatTalent(tl);
        const blocked = combat && st.picks[slot] !== tl.id && combatCount(slot) >= COMBAT_TALENT_LIMIT(1);
        buttons.push({ kind: 'talent', slot, id: tl.id, label: tl.name, combat, x, y: y + 28 + i * 30, w: 296, h: 28, font: FONT, selected: st.picks[slot] === tl.id, disabled: blocked,
          reason: blocked ? t('create.combatLimit') : null });
      });
    });
    buttons.push({ kind: 'back', label: t('create.back'), x: ox + 924, y: oy + 652, w: 160, h: 48 });
    buttons.push({ kind: 'start', label: t('create.start'), x: ox + 1096, y: oy + 652, w: 160, h: 48, disabled: CREATION_SLOTS.some((s) => !st.picks[s] && list(game, s).length) });
  }

  function click(game, b) {
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); play('miss'); return; }
    play('uiClick');
    if (b.kind === 'origin') { st.origin = b.id; st.focus = { kind: 'origin', id: b.id }; }
    else if (b.kind === 'align') st.alignment = b.id;
    else if (b.kind === 'any') st.anyStat = b.id;
    else if (b.kind === 'talent') { st.picks[b.slot] = b.id; st.focus = { kind: 'talent', id: b.id }; }
    else if (b.kind === 'spage') st.pages[b.slot] = (st.pages[b.slot] || 0) + b.dir;
    else if (b.kind === 'back') { game.resume(back); return; }
    else if (b.kind === 'start') return start(game);
    layout(game);
  }

  function start(game) {
    if (buttons.find((b) => b.kind === 'start')?.disabled) { game.toast(t('create.pickAll'), 'c'); return; }
    const talents = CREATION_SLOTS.map((s) => st.picks[s]).filter(Boolean);
    onStart(game, { ...hero, origin: st.origin, alignment: st.alignment, anyStat: st.anyStat, talents });
  }

  function drawDetails(game) {
    const { ctx: c } = game;
    const x = ox + 924, y = oy + 100, w = 332;
    panel(c, x - 8, y - 8, w + 16, 536, C['1'], C['3']);
    let yy = y;
    const f = st.focus || (hover && (hover.kind === 'talent' || hover.kind === 'origin') ? { kind: hover.kind, id: hover.id } : null);
    const focus = hover && (hover.kind === 'talent' || hover.kind === 'origin') ? { kind: hover.kind, id: hover.id } : f;
    if (focus?.kind === 'talent') {
      const tl = TALENTS[focus.id];
      text(c, fit(c, tl.name, w, FONT_B), x, yy, C.h, FONT_B); yy += 24;
      text(c, `${isCombatTalent(tl) ? t('talent.combat') : t('talent.world')} · ${String(tl.canon || '').startsWith('вне канона') ? t('talent.new') : t('talent.canon')}`, x, yy, isCombatTalent(tl) ? C.a : C.j); yy += LINE + 4;
      yy = textBlock(c, tl.desc || '', x, yy, w, C['5'], FONT, LINE, 8) + 8;
    } else if (focus?.kind === 'origin' || st.origin) {
      const o = ORIGINS[focus?.id || st.origin];
      text(c, fit(c, o.name, w, FONT_B), x, yy, C.h, FONT_B); yy += 24;
      yy = textBlock(c, o.desc || '', x, yy, w, C['5'], FONT, LINE, 6) + 8;
    }
    const g = gadgetFor(hero.cls);
    if (g) {
      yy = Math.max(yy, y + 240);
      text(c, `${t('create.gadget')}: ${g.name}`, x, yy, C.b, FONT_B); yy += 24;
      yy = textBlock(c, g.desc || '', x, yy, w, C['4'], FONT, LINE, 3);
      for (const a of g.abilities || []) yy = textBlock(c, `${a.name}: ${a.desc}`, x, yy + 4, w, C['5'], FONT, LINE, 4);
    }
    text(c, `${t('talent.combat')}: ${combatCount(null)}/${COMBAT_TALENT_LIMIT(1)}`, x, y + 500, C.a, FONT_B);
  }

  self = {
    id: 'create-talents',
    enter(game) { layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      st.time += dt;
      const m = game.input.mouse;
      const h = hitButton(buttons, m);
      if (h !== hover && h && !h.disabled) play('uiHover');
      hover = h;
      if (m.clicked && h) click(game, h);
      else if (game.input.wasPressed('Enter')) start(game);
      else if (game.input.wasPressed('Escape')) game.resume(back);
    },
    render(game) {
      const { ctx: c, width: W, height: H } = game;
      clear(c, W, H);
      text(c, t('create.page2'), ox + 24, oy + 20, C.h, FONT_L);
      text(c, `${hero.name} · ${game.data.RACES[hero.race].name} · ${game.data.CLASSES[hero.cls].name}`, ox + 1256, oy + 28, C['4'], FONT, 'right');
      text(c, t('create.origin'), ox + 24, oy + 72, C['4'], FONT_B);
      const ay = oy + 100 + 11 * 40 + 24;
      text(c, t('create.alignment'), ox + 24, ay - 22, C['4'], FONT_B);
      if (game.data.RACES[hero.race]?.statBonus?.any) text(c, t('create.anyStatPick'), ox + 24, ay + 50, C['4'], FONT_B);
      CREATION_SLOTS.forEach((slot, si) => {
        const x = ox + 300 + (si % 2) * 306, y = oy + 100 + Math.floor(si / 2) * 290;
        text(c, t(`create.slot.${slot}`), x, y, C['4'], FONT_B);
        if (!list(game, slot).length) text(c, t('create.noTalents'), x, y + 32, C['3']);
      });
      for (const b of buttons) {
        button(c, b, hover === b);
        if (b.kind === 'talent') text(c, b.combat ? t('talent.tagCombat') : t('talent.tagWorld'), b.x + b.w - 8, b.y + 7, b.combat ? C.a : C.j, '12px monospace', 'right');
      }
      drawDetails(game);
    },
  };
  return self;
}
