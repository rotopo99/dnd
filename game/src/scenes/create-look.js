// Creation step «Внешность»: 3D avatar of the hero (ui/avatar3d.js) with mouse rotation, gender, race-aware options.
// createLookScene(hero {race, cls, path, name, look?}, back scene, onNext(game, hero + avatar)); result: hero.avatar (look object).
// hero.look = clothes colour (palette key), DERIVED from the avatar on «Далее» (the 2D battle sprite wears the same colour).
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, text, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { LOOK_OPTIONS, defaultLook, buildAvatarMesh, renderAvatar } from '../ui/avatar3d.js';

const BASE_W = 1280, BASE_H = 720;
const SMALL = '12px monospace';
// clothes colour (palette keys; null = standard); hero.look is derived from the avatar: the 2D battle sprite wears the same colour
export const LOOK_COLORS = [null, 'c', 'a', 'j', 'b', 'n', 'f', 'e', '4', 'o', 'l', 'g'];
const ROWS = [['skin', 'Тон кожи'], ['hair', 'Причёска'], ['hairColor', 'Цвет волос'], ['beard', 'Борода'], ['eyes', 'Цвет глаз']];
const KIND_LOCK = { skeleton: ['skin', 'hair', 'hairColor', 'beard'], android: ['skin', 'hair', 'hairColor', 'beard'], 'mutant-beast': ['skin', 'beard'], 'mutant-plant': ['skin', 'hairColor', 'beard'], cringegon: ['skin'] };

export function createLookScene(hero, back, onNext) {
  const st = { look: defaultLook(hero.race, 'x', (Math.random() * 1e6) | 0), yaw: 0.45, pitch: 0.06, drag: null, slider: null, time: 0, auto: true };
  st.look.cloth = hero.look || hero.avatar?.cloth || null;
  let mesh = buildAvatarMesh(st.look);
  let buttons = [], hover = null, ox = 0, oy = 0;
  const locked = (k) => (KIND_LOCK[hero.race] || []).includes(k);
  const rebuild = () => { mesh = buildAvatarMesh(st.look); };
  st.rebuild = rebuild; // for tests
  const idx = (k) => Math.max(0, LOOK_OPTIONS[k].findIndex((o) => o.id === st.look[k]));

  function layout(game) {
    ox = Math.max(0, Math.floor((game.width - BASE_W) / 2));
    oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    buttons = [];
    LOOK_OPTIONS.gender.forEach((g, i) => buttons.push({ kind: 'gender', id: g.id, label: g.name, font: SMALL, x: ox + 24 + i * 160, y: oy + 604, w: 154, h: 34, selected: st.look.gender === g.id }));
    ROWS.forEach(([k], i) => {
      const y = oy + 84 + i * 40, off = locked(k);
      buttons.push({ kind: 'opt-', id: k, label: '◀', x: ox + 780, y, w: 36, h: 32, disabled: off });
      buttons.push({ kind: 'opt+', id: k, label: '▶', x: ox + 1220, y, w: 36, h: 32, disabled: off });
    });
    LOOK_COLORS.forEach((k, i) => buttons.push({ kind: 'cloth', id: k, label: '', x: ox + 24 + i * 40, y: oy + 672, w: 34, h: 30, selected: (st.look.cloth || null) === k }));
    LOOK_OPTIONS.face.forEach((f, i) => buttons.push({ kind: 'slider', id: f.id, label: f.name, x: ox + 780, y: oy + 304 + i * 36, w: 476, h: 30 }));
    LOOK_OPTIONS.acc.forEach((a, i) => buttons.push({ kind: 'acc', id: a.id, label: a.name, font: SMALL, x: ox + 540 + (i % 2) * 358, y: oy + 440 + Math.floor(i / 2) * 32, w: 352, h: 28, selected: st.look.acc.includes(a.id) }));
    buttons.push({ kind: 'random', id: 'random', label: 'Случайно', x: ox + 540, y: oy + 664, w: 190, h: 44 });
    buttons.push({ kind: 'back', id: 'back', label: 'Назад', x: ox + 860, y: oy + 664, w: 190, h: 44 });
    buttons.push({ kind: 'next', id: 'next', label: 'Далее', key: 'Enter', x: ox + 1066, y: oy + 664, w: 190, h: 44 });
    st.buttons = buttons;
  }

  function choose(game, b) {
    if (b.disabled) { play('miss'); return; }
    play('uiClick');
    const L = st.look;
    if (b.kind === 'cloth') L.cloth = b.id;
    else if (b.kind === 'gender') { L.gender = b.id; if (b.id === 'f' && ['crop', 'mohawk'].includes(L.hair)) L.hair = 'long'; }
    else if (b.kind === 'opt-' || b.kind === 'opt+') { const o = LOOK_OPTIONS[b.id], d = b.kind === 'opt+' ? 1 : -1; L[b.id] = o[(idx(b.id) + d + o.length) % o.length].id; }
    else if (b.kind === 'acc') {
      const on = L.acc.includes(b.id);
      L.acc = on ? L.acc.filter((x) => x !== b.id) : [...L.acc, b.id];
      // one headgear at a time; one face cover at a time
      const hats = ['hood', 'helmet', 'bandana'], faces = ['gasmask', 'respirator'];
      for (const set of [hats, faces]) if (!on && set.includes(b.id)) L.acc = L.acc.filter((x) => x === b.id || !set.includes(x));
    } else if (b.kind === 'random') { const c = L.cloth; st.look = { ...defaultLook(hero.race, L.gender, (Math.random() * 1e6) | 0), cloth: c }; }
    else if (b.kind === 'back') { game.setScene(back); return; }
    else if (b.kind === 'next') { onNext(game, finish()); return; }
    rebuild(); layout(game);
  }

  const finish = () => ({ ...hero, look: st.look.cloth || null, avatar: { ...st.look, acc: [...st.look.acc], face: { ...st.look.face } } });
  const optName = (k) => LOOK_OPTIONS[k][idx(k)]?.name || '—';
  const self = {
    id: 'create-look',
    S: st,
    enter(game) { layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      st.time += dt;
      const inp = game.input, m = inp.mouse;
      const h = hitButton(buttons, m);
      if (h !== hover && h && !h.disabled) play('uiHover');
      hover = h;
      const pv = { x: ox + 24, y: oy + 72, w: 480, h: 512 };
      const inPv = m.x >= pv.x && m.x < pv.x + pv.w && m.y >= pv.y && m.y < pv.y + pv.h;
      if (m.down && !st.drag && !st.slider) {
        if (h?.kind === 'slider') st.slider = h.id;
        else if (inPv) st.drag = { x: m.x, y: m.y };
      }
      if (!m.down) { st.drag = null; st.slider = null; }
      if (st.drag) {
        st.yaw += (m.x - st.drag.x) * 0.013; st.pitch = Math.max(-0.5, Math.min(0.5, st.pitch + (m.y - st.drag.y) * 0.006));
        st.drag = { x: m.x, y: m.y }; st.auto = false;
      } else if (st.auto) st.yaw += dt * 0.5;
      if (st.slider) {
        const b = buttons.find((x) => x.kind === 'slider' && x.id === st.slider);
        const v = Math.round(((m.x - b.x - 6) / (b.w - 12) * 2 - 1) * 20) / 20;
        const nv = Math.max(-1, Math.min(1, v));
        if (nv !== st.look.face[st.slider]) { st.look.face[st.slider] = nv; rebuild(); }
      } else if (m.clicked && h && h.kind !== 'slider') { choose(game, h); if (game.scene !== self) return; }
      if (inp.wasPressed('Enter')) onNext(game, finish());
      else if (inp.wasPressed('Escape')) game.setScene(back);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      text(ctx, 'Внешность', ox + 24, oy + 20, C.h, FONT_L);
      text(ctx, `${hero.name} · ${game.data.RACES[hero.race].name} · ${game.data.CLASSES[hero.cls].name}`, ox + 1256, oy + 28, C['4'], FONT, 'right');
      panel(ctx, ox + 24, oy + 72, 480, 512, C['1'], C['3']);
      ctx.save(); ctx.beginPath(); ctx.rect(ox + 26, oy + 74, 476, 508); ctx.clip();
      ctx.fillStyle = C['2']; ctx.fillRect(ox + 26, oy + 500, 476, 82);
      renderAvatar(ctx, mesh, { x: ox + 24, y: oy + 72, size: 480, yaw: st.yaw, pitch: st.pitch, zoom: 1.12 });
      ctx.restore();
      text(ctx, 'Тяни мышью — вращать', ox + 264, oy + 562, C['3'], SMALL, 'center');
      text(ctx, 'Пол', ox + 24, oy + 584, C['4'], SMALL);
      text(ctx, 'Цвет одежды (× — стандартный)', ox + 24, oy + 650, C['4'], SMALL);
      ROWS.forEach(([k, label], i) => {
        const y = oy + 84 + i * 40, off = locked(k);
        text(ctx, label, ox + 540, y + 8, off ? C['3'] : C['5'], FONT_B);
        panel(ctx, ox + 820, y, 396, 32, C['0'], C['3']);
        const nm = k === 'skin' && off ? 'по расе' : off ? '—' : optName(k);
        text(ctx, fit(ctx, nm, 380, FONT), ox + 1018, y + 7, off ? C['3'] : C.h, FONT, 'center');
      });
      text(ctx, 'Форма лица', ox + 540, oy + 280, C['4'], FONT_B);
      for (const b of buttons) {
        if (b.kind === 'slider') {
          text(ctx, b.label, ox + 540, b.y + 8, C['5'], FONT);
          panel(ctx, b.x, b.y, b.w, b.h, C['0'], hover === b || st.slider === b.id ? C['5'] : C['3']);
          const v = st.look.face[b.id];
          ctx.fillStyle = C['3']; ctx.fillRect(b.x + b.w / 2 - 1, b.y + 6, 2, b.h - 12);
          const kx = b.x + 6 + ((v + 1) / 2) * (b.w - 12);
          ctx.fillStyle = C.h; ctx.fillRect(Math.round(kx - 4), b.y + 4, 8, b.h - 8);
        } else if (b.kind === 'cloth') {
          panel(ctx, b.x, b.y, b.w, b.h, b.id ? C[b.id] : C['2'], b.selected ? C.h : hover === b ? C['5'] : C['3']);
          if (!b.id) text(ctx, '×', b.x + b.w / 2, b.y + 7, C['5'], FONT_B, 'center');
          if (b.selected) { ctx.strokeStyle = C.h; ctx.lineWidth = 2; ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); }
        } else if (b.kind === 'acc') button(ctx, { ...b, label: `${b.selected ? '■' : '□'} ${b.label}` }, hover === b);
        else button(ctx, b, hover === b);
      }
      text(ctx, 'Детали (шрамы, импланты, головные уборы)', ox + 540, oy + 414, C['4'], FONT_B);
      void H;
    },
  };
  return self;
}
