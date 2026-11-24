// Creation step «Внешность»: the appearance editor. Live full-body 3D model with the same toon shaders as the battle
// (gfx/stage.js: WebGL2, spring bones, animations), tabs on the left (Основа / Тело / Лицо / Волосы / Одежда / Детали),
// presets, random, reset, undo / redo. Neutral interface (own drawing, not the race theme).
// createLookScene(hero {race, cls, path, name, ...}, back scene, onNext(game, hero + avatar)); result: hero.avatar (look v2),
// hero.look = main clothes colour (palette key; the 2D battle sprite wears it), hero.hide (slots hidden on the model), hero.race.
// Without WebGL2 the preview is a still frame of the old bust (ui/avatar3d.js).
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, text, fit, roundRect } from '../ui/draw.js';
import { hotspot } from '../ui/tooltip.js';
import { PALETTE_KEYS } from '../assets/sprites.js';
import { t } from '../data/text/index.js';
import { PLAYABLE_RACES } from '../data/index.js';
import { buildCreature, isAllowed } from '../rules/character.js';
import { starterKit } from '../world/data.js';
import { GFX } from '../data/gfx.js';
import {
  OPT, SKINS, skinsOf, HAIR_NAMED, EYE_NAMED, DETAILS, BODY, FACE_SLIDERS, OUTFITS, PRESETS, applyPreset, randomLook, migrateLook,
  constrainLook, lockedOf, customKey, kindOf,
} from '../ui/look-data.js';
import { defaultLook, buildAvatarMesh, renderAvatar, rngOf } from '../ui/avatar3d.js';
import { unitTemplate } from '../gfx/units3d.js';
import { animState, startAct } from '../gfx/anim.js';
import { getStage } from '../gfx/stage.js';
import { FACE_EMOS } from '../gfx/faces.js';
import { hasWebGL2 } from '../gfx/gl.js';

const BASE_W = 1280, BASE_H = 720;
const S12 = '12px monospace', S13 = '13px monospace', S13B = 'bold 13px monospace', S14B = 'bold 14px monospace';
const HIDE_SLOTS = ['helm', 'armor', 'pads', 'pack', 'weapon', 'cloak'];
const TABS = [
  { id: 'base', name: 'Основа', tip: 'Пол, раса и сводка.' }, { id: 'body', name: 'Тело', tip: 'Рост, телосложение, кожа.' }, { id: 'face', name: 'Лицо', tip: 'Форма лица, глаза, брови, рот, нос.' },
  { id: 'hair', name: 'Волосы', tip: 'Причёска, цвет, кончики, борода.' }, { id: 'outfit', name: 'Одежда', tip: 'Комплект, цвета и видимость снаряжения.' }, { id: 'details', name: 'Детали', tip: 'Веснушки, шрамы, татуировки, макияж, аксессуары.' },
];
const EMO_RU = { neutral: 'Спокойно', happy: 'Радость', angry: 'Злость', sad: 'Грусть', scared: 'Страх', smug: 'Ухмылка', surprised: 'Удивление', cringe: 'Кринж' };
const ANIMS = [{ id: 'idle', name: 'Стойка' }, { id: 'walk', name: 'Ходьба' }, { id: 'attack', name: 'Удар' }, { id: 'emote', name: 'Эмоции' }];
const ALL_KEYS = [...PALETTE_KEYS];
const clone = (l) => ({ ...l, acc: [...(l.acc || [])], face: { ...l.face }, freckles: { ...l.freckles }, scar: { ...l.scar }, tattoo: { ...l.tattoo }, makeup: { ...l.makeup } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- small drawing helpers (neutral interface)
function rr(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function tabIcon(ctx, id, cx, cy, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.translate(cx, cy);
  const arc = (x, y, r, a = 0, b = 7) => { ctx.beginPath(); ctx.arc(x, y, r, a, b); };
  if (id === 'base') { arc(0, -6, 4.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-9, 10); ctx.quadraticCurveTo(0, -4, 9, 10); ctx.stroke(); }
  else if (id === 'body') { arc(0, -9, 3.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(8, -3); ctx.moveTo(0, -3); ctx.lineTo(0, 4); ctx.moveTo(0, 4); ctx.lineTo(-5, 12); ctx.moveTo(0, 4); ctx.lineTo(5, 12); ctx.stroke(); }
  else if (id === 'face') { arc(0, 0, 10); ctx.stroke(); arc(-4, -2, 1.4); ctx.fill(); arc(4, -2, 1.4); ctx.fill(); ctx.beginPath(); ctx.arc(0, 2, 5, 0.25, Math.PI - 0.25); ctx.stroke(); }
  else if (id === 'hair') { ctx.beginPath(); ctx.moveTo(-10, 8); ctx.quadraticCurveTo(-12, -12, 0, -11); ctx.quadraticCurveTo(12, -12, 10, 8); ctx.moveTo(-3, -10); ctx.quadraticCurveTo(-1, 0, -7, 6); ctx.moveTo(3, -10); ctx.quadraticCurveTo(2, -1, 6, 5); ctx.stroke(); }
  else if (id === 'outfit') { ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-11, -4); ctx.lineTo(-8, 0); ctx.lineTo(-6, -2); ctx.lineTo(-6, 11); ctx.lineTo(6, 11); ctx.lineTo(6, -2); ctx.lineTo(8, 0); ctx.lineTo(11, -4); ctx.lineTo(5, -10); ctx.quadraticCurveTo(0, -5, -5, -10); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(3, -3); ctx.lineTo(11, 0); ctx.lineTo(3, 3); ctx.lineTo(0, 11); ctx.lineTo(-3, 3); ctx.lineTo(-11, 0); ctx.lineTo(-3, -3); ctx.closePath(); ctx.stroke(); }
  ctx.restore();
}

export function createLookScene(hero, back, onNext, step = { n: 3, of: 4 }) {
  const rng = rngOf(`${hero.name}|${Math.random()}`);
  let race = hero.race;
  const flex = !!hero.stats; // the flexible build fixed the race-dependent numbers: the race can not change here
  const hasAv = hero.avatar && (hero.avatar.v === 1 || hero.avatar.v === 2);
  const initial = migrateLook(hasAv ? hero.avatar : defaultLook(race, 'x', (Math.random() * 1e6) | 0), race);
  if (!initial.cloth) initial.cloth = hero.look || null;
  const st = {
    look: constrainLook(clone({ ...initial, race })), hide: { ...(hero.hide || {}) }, tab: 'base', scroll: {}, time: 0, anim: 'idle', hist: { undo: [], redo: [] },
    cam: { yaw: 22, pitch: 12, zoom: 0.9, focus: 0.9, mode: 'full', tz: 0.9, tf: 0.9 }, drag: null, sliderDrag: null, popup: false, dirty: true, lastBuild: -9, T: null, blinkAt: 2, popTip: null,
    emoLabel: '', buildMs: 0, widgets: [], fixed: [], hover: null, baseUnit: null, flash: 0,
  };
  const reset0 = clone(st.look), hide0 = { ...st.hide }, race0 = race;
  let ox = 0, oy = 0, stage = null, V = { anim: {} }, prevDown = false;
  let lastGame = null, still = null;

  const rects = () => ({
    tabs: { x: ox + 24, y: oy + 72, w: 112 }, content: { x: ox + 148, y: oy + 72, w: 372, h: 528 }, view: { x: ox + 532, y: oy + 72, w: 724, h: 528 },
  });

  // ---------------------------------------------------------------- model
  function makeBase(game) {
    const D = game.data, kit = starterKit(hero.cls, hero.path);
    let u = null;
    try { u = buildCreature({ race, cls: hero.cls, path: hero.path, level: 1, name: hero.name, data: D, equipment: kit ? { weapon: kit.weapon, armor: kit.armor, offhand: null, mods: [] } : undefined }); } catch { u = null; }
    st.baseUnit = u || { kind: 'hero', team: 'heroes', raceId: race, classId: hero.cls, armorType: 'light', weapon: null, tags: [] };
    st.baseUnit.id = 'look-preview'; st.baseUnit.kind = 'hero'; st.baseUnit.team = 'heroes';
  }
  function rebuild(game) {
    if (!st.baseUnit) makeBase(game);
    const t0 = performance.now();
    st.look = clone(st.look); // heroLook3d memoises by object identity
    const u = Object.assign(Object.create(Object.getPrototypeOf(st.baseUnit)), st.baseUnit, { avatar: st.look, look: null, hide: Object.keys(st.hide).length ? st.hide : null, pinFace: true });
    const T = unitTemplate(u, { fresh: true });
    if (st.T && stage) stage.release(st.T);
    st.T = T; st.dirty = false; st.lastBuild = st.time; st.buildMs = performance.now() - t0;
    if (!stage) still = null;
  }

  // ---------------------------------------------------------------- history
  const snap = () => JSON.stringify({ look: st.look, hide: st.hide, race });
  function pushHist() { st.hist.undo.push(snap()); if (st.hist.undo.length > 80) st.hist.undo.shift(); st.hist.redo.length = 0; }
  function restore(s, game) { const o = JSON.parse(s); const rc = o.race !== race; race = o.race; st.look = o.look; st.hide = o.hide; if (rc) st.baseUnit = null; st.dirty = true; void game; }
  function undo(game) { if (!st.hist.undo.length) { play('miss'); return; } st.hist.redo.push(snap()); restore(st.hist.undo.pop(), game); play('uiClick'); }
  function redo(game) { if (!st.hist.redo.length) { play('miss'); return; } st.hist.undo.push(snap()); restore(st.hist.redo.pop(), game); play('uiClick'); }
  /** A change of the look: history first, then fn(look), constraints, rebuild on the next tick. */
  function change(fn, quiet) {
    if (!quiet) pushHist();
    fn(st.look); st.look.race = race; constrainLook(st.look); st.dirty = true;
  }
  const finish = () => {
    const L = clone(st.look);
    return { ...hero, race, look: L.cloth || null, avatar: L, hide: Object.keys(st.hide).length ? { ...st.hide } : undefined };
  };

  // ---------------------------------------------------------------- widgets
  // each: { k: 'chip'|'slider'|'swatch'|'toggle'|'head'|'note'|'btn', x, y, w, h, ... }; scrolled ones are rebuilt every frame
  function buildContent(game) {
    const R = rects().content, X0 = R.x + 16, IW = R.w - 44, W = [], L = st.look, lock = lockedOf(race);
    let y = R.y + 56 - (st.scroll[st.tab] || 0);
    const gender = L.gender, fem = gender === 'f';
    const head = (label, sub) => { W.push({ k: 'head', x: X0, y, w: IW, h: 22, label, sub }); y += 26; };
    const note = (s, col) => { W.push({ k: 'note', x: X0, y, w: IW, h: 18, label: s, col }); y += 20; };
    const chips = (items, cur, cols, onPick, o = {}) => {
      const gap = 6, w = (IW - gap * (cols - 1)) / cols, h = o.h || 30;
      items.forEach((it, i) => {
        const cx = X0 + (i % cols) * (w + gap), cy = y + Math.floor(i / cols) * (h + gap);
        W.push({ k: 'chip', x: cx, y: cy, w, h, label: it.name, selected: it.id === cur, disabled: !!(it.disabled || o.disabled), tip: it.tip ? { title: it.name, lines: [it.tip] } : o.tip, run: () => onPick(it.id), sub: it.sub });
      });
      y += Math.ceil(items.length / cols) * (h + gap) + 4;
    };
    const slider = (label, min, max, get, set, fmt, tip, dis) => {
      W.push({ k: 'slider', x: X0, y, w: IW, h: 40, label, min, max, get, set, fmt, disabled: !!dis, tip: tip ? { title: label, lines: [tip] } : null }); y += 46;
    };
    const swatches = (items, cur, size, cols, onPick, o = {}) => {
      const gap = 5; size = Math.min(size, Math.floor((IW - gap * (cols - 1)) / cols));
      items.forEach((it, i) => {
        const cx = X0 + (i % cols) * (size + gap), cy = y + Math.floor(i / cols) * (size + gap);
        W.push({ k: 'swatch', id: it.id, x: cx, y: cy, w: size, h: size, color: it.color, none: it.none, selected: it.id === cur, disabled: !!o.disabled, tip: { title: it.name, lines: it.lines || [] }, run: () => onPick(it.id) });
      });
      y += Math.ceil(items.length / cols) * (size + gap) + 4;
    };
    const toggle = (label, on, run, tip, dis) => { W.push({ k: 'toggle', x: X0, y, w: IW, h: 28, label, on, disabled: !!dis, run, tip: tip ? { title: label, lines: [tip] } : null }); y += 32; };
    const palItems = (none) => [...(none ? [{ id: null, none: true, name: none }] : []), ...ALL_KEYS.map((k) => ({ id: k, color: C[k], name: `Цвет ${k.toUpperCase()}` }))];
    const D = game.data;

    if (st.tab === 'base') {
      head('Пол');
      chips(OPT.gender, L.gender, 3, (id) => change((l) => { l.gender = id; }));
      head('Раса', flex ? 'задана в раскладке' : '');
      const cls = D.CLASSES[hero.cls];
      chips(PLAYABLE_RACES.map((id) => {
        const ok = isAllowed(id, cls), dis = id !== race && (flex || !ok);
        return { id, name: D.RACES[id].name, disabled: dis, tip: flex && id !== race ? 'Раса зафиксирована свободной раскладкой. Вернись «Назад», чтобы сменить.' : !ok ? `Класс «${cls.name}» этой расе недоступен.` : `Класс «${cls.name}» допустим. Облик подстроится под расу.` };
      }), race, 2, (id) => { if (id === race) return; pushHist(); race = id; st.baseUnit = null; change((l) => { l.race = id; l.skin = skinsOf(id)[0]; if (kindOf(id) !== 'human' && kindOf(id) !== 'tekhonok') l.hair = l.hair; }, true); });
      head('Сводка');
      const R2 = GFX.races[race] || {}, cm = Math.round(175 * (R2.h || 1) * (1 + 0.07 * L.height));
      const rows = [['Рост', `${cm} см`], ['Телосложение', OPT.build.find((b) => b.id === L.build).name], ['Кожа', (SKINS.find((s) => s.id === L.skin) || SKINS[0]).name],
        ['Волосы', OPT.hair.find((h) => h.id === L.hair).name], ['Комплект', OUTFITS.find((o) => o.id === L.outfit).name], ['Детали', DETAILS.filter((d) => L[d.id].on).map((d) => d.name.toLowerCase()).join(', ') || '—']];
      for (const [a, b] of rows) { W.push({ k: 'kv', x: X0, y, w: IW, h: 20, label: a, val: b }); y += 22; }
      y += 8; note('Пресеты, «Случайно» и «Сброс» — внизу.', C['3']);
    } else if (st.tab === 'body') {
      const h = BODY.height;
      slider(h.name, -1, 1, () => L.height, (v) => { L.height = v; }, (v) => `${Math.round(175 * ((GFX.races[race] || {}).h || 1) * (1 + 0.07 * v))} см`, h.tip);
      head('Телосложение');
      chips(OPT.build, L.build, 3, (id) => change((l) => { l.build = id; }));
      if (fem) {
        slider(BODY.bust.name, -1, 1, () => L.bust, (v) => { L.bust = v; }, null, BODY.bust.tip);
        slider(BODY.hips.name, -1, 1, () => L.hips, (v) => { L.hips = v; }, null, BODY.hips.tip);
      } else slider(BODY.shoulders.name, -1, 1, () => L.shoulders, (v) => { L.shoulders = v; }, null, BODY.shoulders.tip);
      head('Тон кожи', race !== 'human' ? 'по расе' : '');
      swatches(skinsOf(race).map((id) => { const s = SKINS.find((k) => k.id === id); return { id, color: C[s.r[1]], name: s.name }; }), L.skin, 34, 8, (id) => change((l) => { l.skin = id; }));
      const s = SKINS.find((k) => k.id === L.skin); note(s ? s.name : '', C['4']);
    } else if (st.tab === 'face') {
      FACE_SLIDERS.forEach((f) => slider(f.name, -1, 1, () => L.face[f.id] || 0, (v) => { L.face[f.id] = v; }, null, f.tip));
      head('Форма глаз'); chips(OPT.eyeShape, L.eyeShape, 3, (id) => change((l) => { l.eyeShape = id; }), { h: 28 });
      head('Цвет глаз', kindOf(race) === 'skeleton' ? 'не меняется' : '');
      const eyeDis = kindOf(race) === 'skeleton';
      swatches(EYE_NAMED.map((e) => ({ id: e.id, color: C[e.k], name: e.name })), L.eyes, 30, 8, (id) => change((l) => { l.eyes = id; }), { disabled: eyeDis });
      note('Свой цвет — любой из палитры:', C['4']);
      swatches(ALL_KEYS.map((k) => ({ id: `p:${k}`, color: C[k], name: `Свой: ${k.toUpperCase()}` })), L.eyes, 20, 13, (id) => change((l) => { l.eyes = id; }), { disabled: eyeDis });
      head('Брови'); chips(OPT.brows, L.brows, 3, (id) => change((l) => { l.brows = id; }), { h: 28, disabled: lock.includes('brows') });
      head('Рот'); chips(OPT.mouth, L.mouth, 4, (id) => change((l) => { l.mouth = id; }), { h: 28 });
      head('Нос'); chips(OPT.nose, L.nose, 3, (id) => change((l) => { l.nose = id; }), { h: 28 });
    } else if (st.tab === 'hair') {
      const hl = lock.includes('hair'), cl = lock.includes('hairColor');
      head('Причёска', hl ? 'задана расой' : '');
      chips(OPT.hair.map((h) => ({ ...h, disabled: fem && ['crop', 'mohawk'].includes(h.id) })), L.hair, 3, (id) => change((l) => { l.hair = id; }), { h: 28, disabled: hl });
      slider('Длина чёлки', 0, 1, () => L.fringe, (v) => { L.fringe = v; }, (v) => `${Math.round(v * 100)} %`, 'Длина прядей над лбом.', hl || ['bald', 'afro', 'mohawk', 'spiky'].includes(L.hair));
      head('Цвет волос', cl ? 'задан расой' : '');
      swatches(HAIR_NAMED.map((h) => ({ id: h.id, color: C[h.r[1]], name: h.name })), L.hairColor, 30, 8, (id) => change((l) => { l.hairColor = id; }), { disabled: cl || hl });
      note('Свой цвет — любой из палитры:', C['4']);
      swatches(ALL_KEYS.map((k) => ({ id: `p:${k}`, color: C[k], name: `Свой: ${k.toUpperCase()}` })), L.hairColor, 20, 13, (id) => change((l) => { l.hairColor = id; }), { disabled: cl || hl });
      head('Кончики', 'градиент');
      swatches([{ id: null, none: true, name: 'Без градиента' }, ...ALL_KEYS.map((k) => ({ id: k, color: C[k], name: `Кончики: ${k.toUpperCase()}` }))], L.hairTip, 20, 13, (id) => change((l) => { l.hairTip = id; }), { disabled: cl || hl });
      if (gender === 'm') { head('Борода', lock.includes('beard') ? 'задана расой' : ''); chips(OPT.beard, L.beard, 3, (id) => change((l) => { l.beard = id; }), { h: 28, disabled: lock.includes('beard') }); }
    } else if (st.tab === 'outfit') {
      head('Комплект');
      chips(OUTFITS.map((o) => ({ id: o.id, name: o.name, tip: o.tip })), L.outfit, 2, (id) => change((l) => { l.outfit = id; }), { h: 30 });
      head('Основной цвет'); swatches(palItems('Стандартный'), L.cloth, 28, 10, (id) => change((l) => { l.cloth = id; }));
      head('Акцент (кант, пуговицы)'); swatches(palItems('Золото'), L.accent, 28, 10, (id) => change((l) => { l.accent = id; }));
      head('Показывать на модели', 'как в игре');
      HIDE_SLOTS.forEach((k) => toggle(t(`gear.hide.${k}`), !st.hide[k], () => { pushHist(); if (st.hide[k]) delete st.hide[k]; else st.hide[k] = true; st.dirty = true; }, t('gear.hide.tip')));
    } else {
      head('Особенности лица');
      for (const d of DETAILS) {
        toggle(d.name, L[d.id].on, () => change((l) => { l[d.id] = { ...l[d.id], on: !l[d.id].on }; }), d.tip, d.id === 'makeup' && false);
        if (L[d.id].on) { swatches(ALL_KEYS.map((k) => ({ id: k, color: C[k], name: `${d.name}: ${k.toUpperCase()}` })), L[d.id].c, 18, 13, (id) => change((l) => { l[d.id] = { ...l[d.id], c: id }; }), {}); }
      }
      head('Аксессуары', 'один головной убор и одно лицо');
      const hats = ['hood', 'helmet', 'bandana'], faces = ['gasmask', 'respirator'];
      OPT.acc.forEach((a, i) => {
        const cx = X0 + (i % 2) * (IW / 2 + 3), cy = y + Math.floor(i / 2) * 32;
        W.push({ k: 'chip', x: cx, y: cy, w: IW / 2 - 3, h: 28, label: a.name, selected: L.acc.includes(a.id), font: S12, tip: null, run: () => change((l) => {
          const on = l.acc.includes(a.id); l.acc = on ? l.acc.filter((x) => x !== a.id) : [...l.acc, a.id];
          for (const set of [hats, faces]) if (!on && set.includes(a.id)) l.acc = l.acc.filter((x) => x === a.id || !set.includes(x));
        }) });
      });
      y += Math.ceil(OPT.acc.length / 2) * 32 + 4;
    }
    st.contentH = y - (R.y + 56 - (st.scroll[st.tab] || 0)) + 8;
    return W;
  }

  function buildFixed() {
    const { tabs, view } = rects(), F = [];
    TABS.forEach((tb, i) => F.push({ k: 'tab', id: tb.id, x: tabs.x, y: tabs.y + i * 58, w: tabs.w, h: 52, label: tb.name, selected: st.tab === tb.id, tip: { title: tb.name, lines: [tb.tip] }, run: () => { st.tab = tb.id; } }));
    const by = oy + 616, bx = ox + 148;
    F.push({ k: 'btn', x: bx, y: by, w: 100, h: 44, label: 'Случайно', tip: { title: 'Случайно', lines: ['Случайная внешность. Пол и раса остаются.'] }, run: (g) => { pushHist(); st.look = randomLook(race, st.look.gender, rng, { gender: st.look.gender }); if (rng() < 0.4) st.look.cloth = ALL_KEYS[Math.floor(rng() * ALL_KEYS.length)]; else st.look.cloth = null; st.dirty = true; st.flash = 1; void g; } });
    F.push({ k: 'btn', x: bx + 108, y: by, w: 84, h: 44, label: 'Сброс', tip: { title: 'Сброс', lines: ['Вернуть внешность, с которой ты открыл этот экран.'] }, run: () => { pushHist(); st.look = clone(reset0); st.hide = { ...hide0 }; if (race !== race0) { race = race0; st.baseUnit = null; } st.dirty = true; } });
    F.push({ k: 'btn', x: bx + 200, y: by, w: 100, h: 44, label: 'Пресеты', selected: st.popup, tip: { title: 'Пресеты', lines: ['6 готовых образов. Пол меняется, раса и класс остаются.'] }, run: () => { st.popup = !st.popup; } });
    F.push({ k: 'btn', x: bx + 308, y: by, w: 44, h: 44, label: '↶', disabled: !st.hist.undo.length, tip: { title: 'Отменить', lines: ['Ctrl+Z'] }, run: (g) => undo(g) });
    F.push({ k: 'btn', x: bx + 358, y: by, w: 44, h: 44, label: '↷', disabled: !st.hist.redo.length, tip: { title: 'Повторить', lines: ['Ctrl+Y или Ctrl+Shift+Z'] }, run: (g) => redo(g) });
    F.push({ k: 'btn', x: ox + 1256 - 330, y: by, w: 150, h: 44, label: 'Назад', run: (g) => g.setScene(back) });
    F.push({ k: 'btn', x: ox + 1256 - 172, y: by, w: 172, h: 44, label: 'Далее', key: 'Enter', primary: true, run: (g) => onNext(g, finish()) });
    // preview toolbar
    F.push({ k: 'chip', x: view.x + 12, y: view.y + 12, w: 112, h: 30, label: 'Лицо крупно', selected: st.cam.mode === 'face', over: true, run: () => setMode('face') });
    F.push({ k: 'chip', x: view.x + 130, y: view.y + 12, w: 112, h: 30, label: 'Во весь рост', selected: st.cam.mode === 'full', over: true, run: () => setMode('full') });
    ANIMS.forEach((a, i) => F.push({ k: 'chip', x: view.x + view.w - 12 - (ANIMS.length - i) * 84 + 4, y: view.y + 12, w: 78, h: 30, label: a.name, selected: st.anim === a.id, over: true, run: () => { st.anim = a.id; st.actAt = -9; } }));
    if (st.popup) {
      PRESETS.forEach((p, i) => F.push({ k: 'pre', x: bx + 200 - 64, y: by - 8 - (PRESETS.length - i) * 48, w: 300, h: 44, label: p.name, tip: { title: p.name, lines: [p.tip] }, run: (g) => { pushHist(); const L = applyPreset(st.look, p); if (L.cloth === null && st.look.cloth) L.cloth = null; st.look = L; st.dirty = true; st.flash = 1; st.popup = false; void g; } }));
    }
    return F;
  }
  function setMode(m) { st.cam.mode = m; if (m === 'face') { st.cam.tz = 3.2; st.cam.pitch = 6; } else { st.cam.tz = 0.9; st.cam.pitch = 12; } }

  // ---------------------------------------------------------------- scene
  function sliderValue(w, m) {
    let v = w.min + ((m.x - w.x) / w.w) * (w.max - w.min);
    v = Math.max(w.min, Math.min(w.max, Math.round(v * 20) / 20));
    if (w.min < 0 && Math.abs(v) < 0.06) v = 0;
    return v;
  }
  const self = {
    id: 'create-look',
    S: st,
    enter(game) {
      lastGame = game; this.resize(game); makeBase(game);
      const { view } = rects();
      stage = hasGL() ? getStage('editor', view.w, view.h) : null;
      rebuild(game);
    },
    resume(game) { this.resize(game); },
    resize(game) { ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)); oy = Math.max(0, Math.floor((game.height - BASE_H) / 2)); },
    update(game, dt) {
      lastGame = game; st.time += dt; st.flash = Math.max(0, st.flash - dt * 2.5);
      const inp = game.input, m = inp.mouse, R = rects();
      if (st.dirty && st.time - st.lastBuild > 0.07) rebuild(game);
      // keys
      const ctrl = inp.isDown('ControlLeft') || inp.isDown('ControlRight') || inp.isDown('MetaLeft') || inp.isDown('MetaRight');
      if (ctrl && inp.wasPressed('KeyZ')) { if (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight')) redo(game); else undo(game); }
      else if (ctrl && inp.wasPressed('KeyY')) redo(game);
      else if (inp.wasPressed('Enter')) { onNext(game, finish()); return; }
      else if (inp.wasPressed('Escape')) { if (st.popup) st.popup = false; else { game.setScene(back); return; } }
      // widgets
      const clip = { x: R.content.x, y: R.content.y + 52, w: R.content.w, h: R.content.h - 52 };
      st.widgets = buildContent(game);
      const maxScroll = Math.max(0, (st.contentH || 0) - clip.h + 52);
      const inClip = (w) => w.y + w.h > clip.y && w.y < clip.y + clip.h;
      st.fixed = buildFixed();
      const down = m.down, pressed = m.clicked || (down && !prevDown); prevDown = down;
      const inRect = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
      let hot = null;
      if (m.inside) {
        for (const w of st.fixed) if (inRect(w, m.x, m.y) && !w.disabled) { hot = w; }
        if (st.popup && hot?.k !== 'pre' && pressed && !(hot && hot.label === 'Пресеты')) { st.popup = false; hot = null; }
        if (!hot && inRect(clip, m.x, m.y)) for (const w of st.widgets) if (w.k !== 'head' && w.k !== 'note' && w.k !== 'kv' && inClip(w) && inRect(w, m.x, m.y)) { hot = w; }
      }
      if (hot !== st.hover && hot && !hot.disabled) play('uiHover');
      st.hover = hot;
      // wheel: zoom over the preview, scroll over the content
      if (m.wheel) {
        if (inRect(R.view, m.x, m.y)) { st.cam.tz = Math.max(0.7, Math.min(6, st.cam.tz * (m.wheel > 0 ? 0.88 : 1.14))); }
        else if (inRect(R.content, m.x, m.y)) st.scroll[st.tab] = Math.max(0, Math.min(maxScroll, (st.scroll[st.tab] || 0) + m.wheel * 54));
      }
      st.scroll[st.tab] = Math.max(0, Math.min(maxScroll, st.scroll[st.tab] || 0));
      // slider drag
      if (pressed && hot?.k === 'slider' && !hot.disabled) { pushHist(); st.sliderDrag = hot; }
      if (!down) st.sliderDrag = null;
      if (st.sliderDrag) { const w = st.sliderDrag, v = sliderValue(w, m); if (v !== w.get()) { w.set(v); st.look.race = race; constrainLook(st.look); st.dirty = true; } }
      else if (pressed && hot && hot.run && hot.k !== 'slider') { if (hot.disabled) play('miss'); else { play('uiClick'); hot.run(game); if (game.scene !== self) return; } }
      else if (pressed && m.inside && inRect(R.view, m.x, m.y) && !hot) st.drag = { x: m.x, y: m.y };
      if (!down) st.drag = null;
      if (st.drag) { st.cam.yaw -= (m.x - st.drag.x) * 0.5; st.cam.pitch = Math.max(-8, Math.min(40, st.cam.pitch + (m.y - st.drag.y) * 0.25)); st.drag = { x: m.x, y: m.y }; }
      // camera tween
      const T = st.T, k = Math.min(1, dt * 9);
      st.cam.zoom += (st.cam.tz - st.cam.zoom) * k;
      if (T) { const tf = st.cam.mode === 'face' ? (T.headY || T.top * 0.85) * T.scale + 0.035 : T.top * T.scale * 0.5 - 0.05; st.cam.focus += (tf - st.cam.focus) * k; if (!st.cam.init) { st.cam.focus = tf; st.cam.init = true; } }
      // animation script
      const stt = animState(V, 'p');
      if (st.anim === 'attack' && T && st.time - (st.actAt ?? -9) > 1.9) { st.actAt = st.time; startAct(V, 'p', T.ranged ? 'shoot' : 'swing', st.time); }
    },
    render(game) {
      const { ctx, width: W, height: H } = game, R = rects(), v = R.view, T = st.T;
      // backdrop of the screen
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C['1']); bg.addColorStop(1, C['0']);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      text(ctx, 'Внешность', ox + 24, oy + 20, C['5'], FONT_L);
      text(ctx, t('create.stepOf').replace('{n}', step.n).replace('{m}', step.of), ox + 24 + 190, oy + 28, C['3'], S12);
      text(ctx, `${hero.name} · ${game.data.RACES[race].name} · ${game.data.CLASSES[hero.cls].name}`, ox + 1256, oy + 28, C['4'], FONT, 'right');
      ctx.fillStyle = C['2']; ctx.fillRect(ox + 24, oy + 58, 1232, 1);
      // tabs
      for (const w of st.fixed) if (w.k === 'tab') {
        const hov = st.hover === w;
        rr(ctx, w.x, w.y, w.w, w.h, 8, w.selected ? C['2'] : hov ? C['1'] : null, w.selected ? C.h : hov ? C['3'] : C['2']);
        if (w.selected) { ctx.fillStyle = C.h; ctx.fillRect(w.x + 1, w.y + 10, 3, w.h - 20); }
        tabIcon(ctx, w.id, w.x + 28, w.y + w.h / 2, w.selected ? C.h : hov ? C['5'] : C['4']);
        text(ctx, w.label, w.x + 48, w.y + w.h / 2 - 8, w.selected ? C['5'] : C['4'], S13B);
        if (w.tip) hotspot(w.x, w.y, w.w, w.h, w.tip);
      }
      // hero card under the tabs
      {
        const cy = oy + 72 + TABS.length * 58 + 4;
        rr(ctx, ox + 24, cy, 112, 528 - TABS.length * 58 - 4, 8, C['1'], C['2']);
        text(ctx, fit(ctx, hero.name, 96, S14B), ox + 32, cy + 10, C['5'], S14B);
        text(ctx, fit(ctx, game.data.RACES[race].name, 96, S12), ox + 32, cy + 30, C['4'], S12);
        text(ctx, fit(ctx, game.data.CLASSES[hero.cls].name, 96, S12), ox + 32, cy + 46, C['4'], S12);
        ctx.fillStyle = C['2']; ctx.fillRect(ox + 32, cy + 68, 96, 1);
        const sw = skinsOf(race).includes(st.look.skin) ? SKINS.find((s) => s.id === st.look.skin) : null;
        if (sw) { text(ctx, 'Кожа · волосы', ox + 32, cy + 78, C['3'], S12); rr(ctx, ox + 32, cy + 98, 24, 24, 6, C[sw.r[1]], C['0']); rr(ctx, ox + 62, cy + 98, 24, 24, 6, C[hairRampKey(st.look)], C['0']); rr(ctx, ox + 92, cy + 98, 24, 24, 6, C[st.look.cloth || '3'], C['0']); }
      }
      // content panel
      const cr = R.content;
      rr(ctx, cr.x, cr.y, cr.w, cr.h, 10, C['1'], C['2']);
      const tb = TABS.find((x) => x.id === st.tab);
      text(ctx, tb.name, cr.x + 16, cr.y + 14, C['5'], FONT_L);
      ctx.fillStyle = C['2']; ctx.fillRect(cr.x + 16, cr.y + 46, cr.w - 32, 1);
      ctx.save(); ctx.beginPath(); ctx.rect(cr.x + 2, cr.y + 48, cr.w - 4, cr.h - 52); ctx.clip();
      const cy0 = cr.y + 48, cy1 = cr.y + cr.h - 4;
      for (const w of st.widgets) {
        if (w.y + w.h < cy0 || w.y > cy1) continue;
        drawWidget(ctx, w, st.hover === w, st.sliderDrag === w);
        if (w.tip && w.y >= cy0 - 6 && w.y + w.h <= cy1 + 6) hotspot(w.x, w.y, w.w, w.h, w.tip);
      }
      ctx.restore();
      // scrollbar
      const max = Math.max(0, (st.contentH || 0) - (cr.h - 52) + 52);
      if (max > 0) {
        const th = cr.h - 60, hh = Math.max(36, th * (cr.h - 52) / (cr.h - 52 + max)), yy = cr.y + 52 + ((th - hh) * (st.scroll[st.tab] || 0)) / max;
        rr(ctx, cr.x + cr.w - 10, cr.y + 52, 4, th, 2, C['0']); rr(ctx, cr.x + cr.w - 10, yy, 4, hh, 2, C['3']);
      }
      // preview
      this.drawPreview(game, v, T);
      // bottom bar
      for (const w of st.fixed) if (w.k === 'btn') {
        const hov = st.hover === w;
        rr(ctx, w.x, w.y, w.w, w.h, 8, w.primary ? (hov ? C.h : C.i) : w.selected ? C['3'] : hov ? C['3'] : C['1'], w.primary ? C.h : w.selected || hov ? C['4'] : C['3']);
        const col = w.disabled ? C['3'] : w.primary ? (hov ? C['0'] : C['5']) : C['5'];
        text(ctx, w.label, w.x + w.w / 2 + (w.key ? 8 : 0), w.y + w.h / 2 - 8, col, w.label.length === 1 ? 'bold 22px monospace' : S14B, 'center');
        if (w.key) text(ctx, w.key, w.x + 8, w.y + 4, w.primary ? C.a : C['3'], '11px monospace');
        if (w.tip) hotspot(w.x, w.y, w.w, w.h, w.tip);
      }
      text(ctx, 'ЛКМ + тянуть — вращать · колесо — масштаб · Ctrl+Z / Ctrl+Y — отмена / повтор · Enter — далее', ox + 148, oy + 676, C['3'], S12);
      if (st.popup) {
        const ps = st.fixed.filter((w) => w.k === 'pre');
        const top = ps[0].y - 10;
        rr(ctx, ps[0].x - 8, top, 316, ps.length * 48 + 12, 10, C['1'], C['4']);
        for (const w of ps) {
          const hov = st.hover === w; rr(ctx, w.x, w.y, w.w, w.h, 7, hov ? C['3'] : C['2'], hov ? C.h : C['3']);
          const p = PRESETS.find((q) => q.name === w.label);
          text(ctx, w.label, w.x + 12, w.y + 6, C['5'], S14B); text(ctx, fit(ctx, p.tip, 276, S12), w.x + 12, w.y + 24, C['4'], S12);
          hotspot(w.x, w.y, w.w, w.h, w.tip);
        }
      }
      void H;
    },
    drawPreview(game, v, T) {
      const { ctx } = game;
      ctx.save(); roundRect(ctx, v.x + 0.5, v.y + 0.5, v.w - 1, v.h - 1, 12); ctx.clip();
      // backdrop: soft studio — vertical gradient, key light from the upper left, vignette
      const g = ctx.createLinearGradient(0, v.y, 0, v.y + v.h); g.addColorStop(0, '#2c2f3d'); g.addColorStop(0.62, C['1']); g.addColorStop(1, '#1b1c26');
      ctx.fillStyle = g; ctx.fillRect(v.x, v.y, v.w, v.h);
      const key = ctx.createRadialGradient(v.x + v.w * 0.34, v.y + v.h * 0.22, 10, v.x + v.w * 0.34, v.y + v.h * 0.22, v.w * 0.7);
      key.addColorStop(0, 'rgba(223,227,232,0.16)'); key.addColorStop(1, 'rgba(223,227,232,0)');
      ctx.fillStyle = key; ctx.fillRect(v.x, v.y, v.w, v.h);
      // wall panel lines (depth)
      ctx.strokeStyle = 'rgba(141,149,168,0.06)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { const xx = v.x + (v.w * i) / 6; ctx.beginPath(); ctx.moveTo(xx, v.y); ctx.lineTo(xx, v.y + v.h * 0.7); ctx.stroke(); }
      let proj = null;
      if (T && stage) {
        const c = st.cam, now = st.time, A = st.anim;
        const emoI = Math.floor(now / 1.4) % FACE_EMOS.length, emo = A === 'emote' ? FACE_EMOS[emoI] : 'neutral';
        st.emoLabel = A === 'emote' ? EMO_RU[emo] : '';
        const blink = (now % 4.2) < 0.14;
        const stt = animState(V, 'p');
        if (A === 'walk') stt.walk += 1 / 60 * 1.45;
        proj = stage.draw(T, stt, { yaw: c.yaw, pitch: c.pitch, zoom: c.zoom, focus: c.focus, now, dt: 1 / 60, walk: A === 'walk' ? 1.45 : 0, emo, blink, physics: 1, reduceMotion: false, modelYaw: 0 });
      }
      // floor: turntable platform + soft contact shadow (drawn under the model: the GL layer is transparent)
      if (proj) {
        const sx = v.x + proj.sx, sy = v.y + proj.sy, ppm = proj.ppm, sp = Math.sin(proj.pitch);
        const rx = ppm * 0.78, ry = Math.max(4, rx * sp);
        ctx.save(); ctx.translate(sx, sy);
        const pf = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * 1.6); pf.addColorStop(0, 'rgba(60,63,79,0.9)'); pf.addColorStop(1, 'rgba(38,40,51,0)');
        ctx.save(); ctx.scale(1, Math.max(0.05, sp)); ctx.fillStyle = pf; ctx.beginPath(); ctx.arc(0, 0, rx * 1.6, 0, 7); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.ellipse(0, 3, rx, ry, 0, 0, 7); ctx.fillStyle = C['1']; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fillStyle = C['2']; ctx.fill(); ctx.strokeStyle = C['4']; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.86, ry * 0.86, 0, 0, 7); ctx.strokeStyle = C['3']; ctx.lineWidth = 1; ctx.stroke();
        for (let i = 0; i < 36; i++) { // ticks turn with the camera
          const a = (i / 36) * Math.PI * 2 - (st.cam.yaw * Math.PI) / 180, c1 = Math.cos(a), s1 = Math.sin(a), big = i % 9 === 0;
          ctx.strokeStyle = big ? C['5'] : C['3']; ctx.lineWidth = big ? 2 : 1;
          ctx.beginPath(); ctx.moveTo(c1 * rx * (big ? 0.9 : 0.94), s1 * ry * (big ? 0.9 : 0.94)); ctx.lineTo(c1 * rx * 0.99, s1 * ry * 0.99); ctx.stroke();
        }
        const sh = ctx.createRadialGradient(0, 0, 1, 0, 0, ppm * 0.5); sh.addColorStop(0, 'rgba(10,10,16,0.6)'); sh.addColorStop(1, 'rgba(10,10,16,0)');
        ctx.save(); ctx.scale(1, Math.max(0.08, sp)); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, ppm * 0.5, 0, 7); ctx.fill(); ctx.restore();
        ctx.restore();
        ctx.drawImage(stage.canvas, 0, 0, v.w, v.h, v.x, v.y, v.w, v.h);
      } else if (!stage) {
        // no WebGL2: a still frame of the old bust
        if (!still || still.key !== snap()) { still = { key: snap(), mesh: buildAvatarMesh(st.look) }; }
        renderAvatar(ctx, still.mesh, { x: v.x + (v.w - 560) / 2, y: v.y + 20, size: 560, yaw: 0.45, pitch: 0.06, zoom: 1.1 });
        text(ctx, 'Нет WebGL2: показан упрощённый кадр', v.x + v.w / 2, v.y + v.h - 50, C['3'], S12, 'center');
      }
      // vignette
      const vg = ctx.createRadialGradient(v.x + v.w / 2, v.y + v.h * 0.55, v.h * 0.35, v.x + v.w / 2, v.y + v.h * 0.55, v.w * 0.62);
      vg.addColorStop(0, 'rgba(20,20,28,0)'); vg.addColorStop(1, 'rgba(20,20,28,0.55)'); ctx.fillStyle = vg; ctx.fillRect(v.x, v.y, v.w, v.h);
      if (st.flash > 0) { ctx.fillStyle = `rgba(223,227,232,${st.flash * 0.18})`; ctx.fillRect(v.x, v.y, v.w, v.h); }
      // overlay controls
      for (const w of st.fixed) if (w.over) {
        const hov = st.hover === w;
        rr(ctx, w.x, w.y, w.w, w.h, 15, w.selected ? 'rgba(28,74,90,0.92)' : hov ? 'rgba(60,63,79,0.92)' : 'rgba(20,20,28,0.72)', w.selected ? C.h : hov ? C['4'] : C['3']);
        text(ctx, w.label, w.x + w.w / 2, w.y + 8, w.selected ? C['5'] : C['4'], S13B, 'center');
      }
      if (st.emoLabel) { const lw = 150; rr(ctx, v.x + v.w / 2 - lw / 2, v.y + v.h - 46, lw, 30, 15, 'rgba(20,20,28,0.78)', C['3']); text(ctx, st.emoLabel, v.x + v.w / 2, v.y + v.h - 38, C.h, S14B, 'center'); }
      ctx.restore();
      rr(ctx, v.x, v.y, v.w, v.h, 12, null, C['3']);
    },
  };
  const hairRampKey = (l) => { const ck = customKey(l.hairColor); return ck || (HAIR_NAMED.find((h) => h.id === l.hairColor) || HAIR_NAMED[1]).r[1]; };

  function drawWidget(ctx, w, hov, active) {
    const dim = w.disabled;
    if (w.k === 'head') {
      text(ctx, w.label, w.x, w.y + 2, C['5'], S14B);
      if (w.sub) text(ctx, w.sub, w.x + w.w, w.y + 4, C['3'], S12, 'right');
      ctx.fillStyle = C['2']; ctx.fillRect(w.x, w.y + 21, w.w, 1);
    } else if (w.k === 'note') text(ctx, fit(ctx, w.label, w.w, S12), w.x, w.y + 2, w.col || C['4'], S12);
    else if (w.k === 'kv') { text(ctx, w.label, w.x, w.y + 3, C['4'], S13); text(ctx, fit(ctx, w.val, w.w - 130, S13B), w.x + w.w, w.y + 3, C['5'], S13B, 'right'); }
    else if (w.k === 'chip') {
      rr(ctx, w.x, w.y, w.w, w.h, 7, w.selected ? C.i : hov && !dim ? C['3'] : C['2'], w.selected ? C.h : hov && !dim ? C['4'] : C['3']);
      text(ctx, fit(ctx, w.label, w.w - 8, w.font || S13), w.x + w.w / 2, w.y + w.h / 2 - 7, dim ? C['3'] : w.selected ? C['5'] : C['4'], w.font || S13, 'center');
    } else if (w.k === 'swatch') {
      const s = w.w;
      if (w.none) { rr(ctx, w.x, w.y, s, s, 5, C['2'], C['3']); ctx.strokeStyle = C.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x + 5, w.y + s - 5); ctx.lineTo(w.x + s - 5, w.y + 5); ctx.stroke(); }
      else rr(ctx, w.x, w.y, s, s, 5, w.color, C['0']);
      if (dim) { rr(ctx, w.x, w.y, s, s, 5, 'rgba(20,20,28,0.6)'); }
      if (w.selected) { rr(ctx, w.x - 2, w.y - 2, s + 4, s + 4, 7, null, C['5'], 2); }
      else if (hov && !dim) rr(ctx, w.x - 1, w.y - 1, s + 2, s + 2, 6, null, C['4'], 1);
    } else if (w.k === 'toggle') {
      text(ctx, w.label, w.x, w.y + 6, dim ? C['3'] : hov ? C['5'] : C['4'], S13);
      const tx = w.x + w.w - 42;
      rr(ctx, tx, w.y + 4, 40, 20, 10, w.on ? C.i : C['0'], w.on ? C.h : C['3']);
      ctx.fillStyle = w.on ? C.h : C['4']; ctx.beginPath(); ctx.arc(tx + (w.on ? 30 : 10), w.y + 14, 7, 0, 7); ctx.fill();
    } else if (w.k === 'slider') {
      const v = w.get(), f = (v - w.min) / (w.max - w.min), tx = w.x, ty = w.y + 28;
      text(ctx, w.label, w.x, w.y, dim ? C['3'] : C['4'], S13);
      const val = w.fmt ? w.fmt(v) : `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
      text(ctx, val, w.x + w.w, w.y, dim ? C['3'] : hov || active ? C.h : C['5'], S13B, 'right');
      rr(ctx, tx, ty - 3, w.w, 6, 3, C['0'], C['2']);
      const x0 = w.min < 0 ? tx + w.w / 2 : tx, x1 = tx + f * w.w;
      if (!dim) { ctx.fillStyle = C.h; ctx.fillRect(Math.min(x0, x1), ty - 2, Math.abs(x1 - x0), 4); }
      if (w.min < 0) { ctx.fillStyle = C['3']; ctx.fillRect(tx + w.w / 2 - 1, ty - 7, 2, 14); }
      ctx.beginPath(); ctx.arc(x1, ty, active ? 9 : hov ? 8.5 : 7.5, 0, 7); ctx.fillStyle = dim ? C['3'] : C['5']; ctx.fill(); ctx.strokeStyle = C['0']; ctx.lineWidth = 2; ctx.stroke();
      if (active && !dim) { ctx.beginPath(); ctx.arc(x1, ty, 13, 0, 7); ctx.strokeStyle = 'rgba(112,216,242,0.45)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }
  function hasGL() { return hasWebGL2(); }
  void lastGame; void FONT_B;
  return self;
}
