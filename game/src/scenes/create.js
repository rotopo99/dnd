// Character creation: race (playable only), class (isAllowed by race), path, name. Live sprite preview,
// final ЗДР/МРЛ/ЭНР/КБ and starting abilities come from buildCreature (stats = class/path `recommended`,
// human `any` bonus — engine default).
import { t } from '../data/text/index.js';
import { buildCreature, isAllowed, mod, STATS } from '../rules/character.js';
import { PLAYABLE_RACES, CLASS_ORDER } from '../data/index.js';
import { drawSprite, heroSpriteIds, idleFrame } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear, drawIcon } from '../ui/draw.js';
import { menuScene } from './menu.js';
import { startPrologue } from './prologue.js';
import { createTalentsScene } from './create-talents.js';

const BASE_W = 1280, BASE_H = 720;
const NAME_MAX = 16;

function raceTraits(r, statuses) {
  const good = [], bad = [];
  const sb = r.statBonus || {};
  for (const k in sb) {
    if (k === 'any') good.push(`+${sb.any} ${t('create.anyStat')}`);
    else (sb[k] > 0 ? good : bad).push(`${sb[k] > 0 ? '+' : ''}${sb[k]} ${t(`stat.${k}`)}`);
  }
  const res = (v, key) => { if (v) (v > 0 ? good : bad).push(`${v > 0 ? '+' : ''}${v} ${t(key)}`); };
  res(r.hpBonus, 'res.hp'); res(r.mrlBonus, 'res.mrl'); res(r.enrBonus, 'res.enr');
  if (r.speed > 6) good.push(`${t('create.speed')} ${r.speed}`);
  if (r.speed < 6) bad.push(`${t('create.speed')} ${r.speed}`);
  for (const [type, v] of Object.entries(r.resist || {})) {
    (v === 'vuln' ? bad : good).push(`${t(`create.${v}`)}: ${t(`dmg.${type}`)}`);
  }
  if (r.immuneStatus?.length) good.push(`${t('create.immuneStatus')}: ${r.immuneStatus.map((s) => statuses[s]?.name || s).join(', ').toLowerCase()}`);
  for (const p of r.passives || []) ((p.op && p.op.kb < 0) ? bad : good).push(`${p.name} — ${p.desc}`);
  for (const a of r.abilities || []) good.push(`${a.name} — ${a.desc}`);
  return { good, bad };
}

export function createCreateScene() {
  const st = { race: PLAYABLE_RACES[0], cls: null, path: null, name: '', focus: { kind: 'race', id: PLAYABLE_RACES[0] }, time: 0 };
  let buttons = [];
  let hover = null;
  let ox = 0, oy = 0;
  let built = null;

  function data(game) { return game.data; }
  function fixClass(game) {
    const D = data(game);
    if (!st.cls || !isAllowed(st.race, D.CLASSES[st.cls])) st.cls = CLASS_ORDER.find((c) => isAllowed(st.race, D.CLASSES[c]));
    const cls = D.CLASSES[st.cls];
    if (!cls.paths.some((p) => p.id === st.path)) st.path = cls.paths[0].id;
    built = buildCreature({ race: st.race, cls: st.cls, path: st.path, data: D, id: 'preview', name: st.name || t('create.defaultName') });
  }

  function layout(game) {
    const D = data(game);
    ox = Math.max(0, Math.floor((game.width - BASE_W) / 2));
    oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    buttons = [];
    PLAYABLE_RACES.forEach((id, i) => buttons.push({ kind: 'race', id, label: D.RACES[id].name, x: ox + 24, y: oy + 100 + i * 52, w: 220, h: 46, font: FONT_B }));
    CLASS_ORDER.forEach((id, i) => {
      const c = D.CLASSES[id];
      const ok = isAllowed(st.race, c);
      buttons.push({ kind: 'class', id, label: c.name, sub: ok ? t(`role.${c.role}`) : t('create.locked'), subColor: ok ? undefined : C.c, x: ox + 256, y: oy + 100 + i * 50, w: 220, h: 46, disabled: !ok });
    });
    D.CLASSES[st.cls].paths.forEach((p, i) => buttons.push({ kind: 'path', id: p.id, label: p.name, font: FONT, sub: t(`role.${p.role || D.CLASSES[st.cls].role}`), x: ox + 488, y: oy + 100 + i * 64, w: 270, h: 56 }));
    buttons.push({ kind: 'name', id: 'name', label: '', x: ox + 488, y: oy + 340, w: 270, h: 40 });
    buttons.push({ kind: 'back', id: 'back', label: t('create.back'), x: ox + 488, y: oy + 652, w: 128, h: 48 });
    buttons.push({ kind: 'start', id: 'start', label: t('create.next'), x: ox + 630, y: oy + 652, w: 128, h: 48 });
    for (const b of buttons) b.selected = (b.kind === 'race' && b.id === st.race) || (b.kind === 'class' && b.id === st.cls) || (b.kind === 'path' && b.id === st.path);
  }

  function choose(game, b) {
    if (b.disabled) { st.focus = { kind: b.kind, id: b.id }; play('miss'); return; }
    play('uiClick');
    if (b.kind === 'race') st.race = b.id;
    else if (b.kind === 'class') st.cls = b.id;
    else if (b.kind === 'path') st.path = b.id;
    else if (b.kind === 'back') { game.setScene(menuScene); return; }
    else if (b.kind === 'start') { begin(game); return; }
    if (b.kind !== 'name') st.focus = { kind: b.kind, id: b.id };
    fixClass(game);
    layout(game);
  }

  function begin(game) {
    const hero = { race: st.race, cls: st.cls, path: st.path, name: st.name.trim() || t('create.defaultName') };
    game.setScene(createTalentsScene(hero, self, (g, full) => { g.hero = full; startPrologue(g, full); }));
  }

  // ---------------------------------------------------------------- render parts
  function drawInfo(game) {
    const { ctx } = game;
    const D = data(game);
    const x = ox + 772, y = oy + 72, w = 484, h = 636;
    panel(ctx, x, y, w, h, C['1'], C['3']);
    // preview on a floor tile
    const px = x + 16, py = y + 16;
    panel(ctx, px, py, 112, 112, C['2'], C['3']);
    drawSprite(ctx, ['tile-floor'], px + 8, py + 8, 6);
    drawSprite(ctx, 'ui-marker', px + 8, py + 8, 6, { mono: 'h' });
    drawSprite(ctx, heroSpriteIds(st.race, st.cls), px + 8, py + 8, 6, { frame: idleFrame(st.time * 1000) });
    const race = D.RACES[st.race], cls = D.CLASSES[st.cls];
    const path = cls.paths.find((p) => p.id === st.path);
    const tx = px + 128, tw = w - 160;
    text(ctx, fit(ctx, st.name || t('create.defaultName'), tw, FONT_L), tx, py + 2, C.h, FONT_L);
    text(ctx, fit(ctx, race.name, tw), tx, py + 36, C['5']);
    text(ctx, fit(ctx, `${cls.name} (${t('create.analog')}: ${cls.analog})`, tw), tx, py + 56, C['5']);
    text(ctx, fit(ctx, path.name, tw), tx, py + 76, C['4']);
    // resources
    let yy = py + 128;
    const res = [['res_hp', t('res.hp'), built.maxHp, C.c], ['res_morale', t('res.mrl'), built.maxMrl, C.f], ['res_energy', t('res.enr'), built.maxEnr, C.b]];
    let xx = px;
    ctx.font = FONT_B;
    for (const [ic, label, v, col] of res) {
      drawIcon(ctx, ic, xx, yy, 24);
      const s = `${label} ${v}`;
      text(ctx, s, xx + 30, yy + 4, col, FONT_B);
      xx += 30 + ctx.measureText(s).width + 18;
    }
    const kb = `${t('res.kb')} ${built.kb}`;
    text(ctx, kb, xx, yy + 4, C['5'], FONT_B);
    yy += 36;
    text(ctx, t('create.stats'), px, yy, C['4']);
    text(ctx, `${t('create.speed')} ${built.speed}`, x + w - 16, yy, C['4'], FONT, 'right');
    yy += 22;
    const cw = Math.floor((w - 32) / STATS.length);
    STATS.forEach((k, i) => {
      const v = built.stats[k];
      const m = mod(v);
      const main = k === (cls.castStat || cls.weapon?.stat);
      panel(ctx, px + i * cw, yy, cw - 6, 44, main ? C.i : C['2'], main ? C.h : C['3']);
      text(ctx, t(`stat.${k}`), px + i * cw + (cw - 6) / 2, yy + 4, C['4'], '12px monospace', 'center');
      const cxm = px + i * cw + (cw - 6) / 2;
      text(ctx, String(v), cxm - 4, yy + 21, C['5'], FONT_B, 'right');
      text(ctx, `${m >= 0 ? '+' : ''}${m}`, cxm, yy + 24, m > 0 ? C.j : m < 0 ? C.c : C['4'], '12px monospace');
    });
    yy += 56;
    text(ctx, t('create.abilities'), px, yy, C['4']);
    yy += 22;
    const abil = built.abilities.slice(0, 6);
    for (const a of abil) {
      const meta = `${a.cost ? `${a.cost} ${t('res.enr')} · ` : ''}${t(`act.${a.action}`)}`;
      text(ctx, fit(ctx, a.name, w - 200), px, yy, C['5']);
      text(ctx, meta, x + w - 16, yy, a.cost ? C.b : C['4'], FONT, 'right');
      yy += LINE;
    }
    if (built.abilities.length > abil.length) { text(ctx, `+${built.abilities.length - abil.length}…`, px, yy, C['3']); yy += LINE; }
    yy += 6;
    ctx.fillStyle = C['2'];
    ctx.fillRect(px, yy, w - 32, 1);
    yy += 10;
    drawFocus(game, px, yy, w - 32, y + h - 12);
  }

  function drawFocus(game, x, y, w, maxY) {
    const { ctx } = game;
    const D = data(game);
    const f = st.focus;
    const left = () => Math.max(0, Math.floor((maxY - y) / LINE));
    if (f.kind === 'race') {
      const r = D.RACES[f.id];
      text(ctx, r.name, x, y, C.h, FONT_B); y += 24;
      const { good, bad } = raceTraits(r, D.STATUSES);
      if (good.length) { text(ctx, t('create.bonuses'), x, y, C.j, FONT_B); y += LINE; y = textBlock(ctx, good.map((s) => `• ${s}`).join('\n'), x, y, w, C['5'], FONT, LINE, Math.min(6, left())); }
      if (bad.length) { text(ctx, t('create.weaknesses'), x, y + 2, C.c, FONT_B); y += LINE + 2; y = textBlock(ctx, bad.map((s) => `• ${s}`).join('\n'), x, y, w, C['5'], FONT, LINE, Math.min(4, left())); }
      if (left() > 0) textBlock(ctx, r.lore, x, y + 4, w, C['4'], FONT, LINE, left());
    } else if (f.kind === 'class') {
      const c = D.CLASSES[f.id];
      text(ctx, `${c.name} · ${t('create.analog')}: ${c.analog}`, x, y, C.h, FONT_B); y += 24;
      if (!isAllowed(st.race, c)) { y = textBlock(ctx, `${t('create.notAllowed')} (${D.RACES[st.race].name})`, x, y, w, C.c, FONT_B); y += 4; }
      text(ctx, `${t('create.role')}: ${t(`role.${c.role}`)}${c.castStat ? ` · ${t(`stat.${c.castStat}`)}` : ''}`, x, y, C['5']); y += LINE;
      y = textBlock(ctx, `${t('create.weapon')}: ${c.weapon.name}, ${c.weapon.dice} ${t(`dmg.${c.weapon.dmgType}`)}${c.weapon.range > 1 ? `, ${t('battle.range')} ${c.weapon.range}` : ''}`, x, y, w, C['5'], FONT, LINE, 2);
      if (c.armor) y = textBlock(ctx, `${t('create.armor')}: ${c.armor.name}, +${c.armor.kb} ${t('res.kb')}`, x, y, w, C['5'], FONT, LINE, 2);
      y += 6;
      for (const p of c.paths) {
        if (left() < 2) break;
        text(ctx, p.name, x, y, C.a, FONT_B); y += LINE;
        if (p.desc) y = textBlock(ctx, p.desc, x, y, w, C['4'], FONT, LINE, Math.min(2, left()));
      }
    } else if (f.kind === 'path') {
      const c = D.CLASSES[st.cls];
      const p = c.paths.find((pp) => pp.id === f.id) || c.paths[0];
      text(ctx, p.name, x, y, C.h, FONT_B); y += 24;
      text(ctx, `${t('create.role')}: ${t(`role.${p.role || c.role}`)}`, x, y, C['5']); y += LINE;
      if (p.desc) y = textBlock(ctx, p.desc, x, y, w, C['4'], FONT, LINE, left());
      const own = built.abilities.filter((a) => a.path === p.id);
      for (const a of own) {
        if (left() < 2) break;
        y += 4;
        text(ctx, a.name, x, y, C.a, FONT_B); y += LINE;
        y = textBlock(ctx, a.desc, x, y, w, C['4'], FONT, LINE, Math.min(3, left()));
      }
    }
  }

  const self = {
    id: 'create',
    resume(game) { layout(game); },
    enter(game) { fixClass(game); layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      st.time += dt;
      const inp = game.input;
      const m = inp.mouse;
      const h = hitButton(buttons, m);
      if (h && h !== hover && (h.kind === 'race' || h.kind === 'class' || h.kind === 'path')) st.focus = { kind: h.kind, id: h.id };
      if (h !== hover && h && !h.disabled) play('uiHover');
      hover = h;
      if (m.clicked && h) {
        choose(game, h);
        if (game.scene !== self) return; // scene changed (start / back)
      }
      // name field: any typed character goes to the name
      for (const ch of inp.typed()) {
        if (st.name.length < NAME_MAX && /[\p{L}\p{N} \-']/u.test(ch) && !(ch === ' ' && !st.name)) st.name += ch;
      }
      if (inp.wasPressed('Backspace')) st.name = st.name.slice(0, -1);
      if (inp.typed().length || inp.wasPressed('Backspace')) built.name = st.name || t('create.defaultName');
      if (inp.wasPressed('Enter')) begin(game);
      else if (inp.wasPressed('Escape')) game.setScene(menuScene);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      text(ctx, t('create.title'), ox + 24, oy + 20, C.h, FONT_L);
      text(ctx, t('create.race'), ox + 24, oy + 72, C['4'], FONT_B);
      text(ctx, t('create.class'), ox + 256, oy + 72, C['4'], FONT_B);
      text(ctx, t('create.path'), ox + 488, oy + 72, C['4'], FONT_B);
      text(ctx, t('create.name'), ox + 488, oy + 314, C['4'], FONT_B);
      for (const b of buttons) {
        if (b.kind === 'name') {
          panel(ctx, b.x, b.y, b.w, b.h, C['0'], hover === b ? C.h : C['3']);
          const caret = Math.floor(st.time * 2) % 2 === 0 ? '_' : ' ';
          text(ctx, st.name ? st.name + caret : t('create.defaultName'), b.x + 12, b.y + 11, st.name ? C['5'] : C['3'], FONT_B);
          text(ctx, t('create.nameHint'), b.x, b.y + b.h + 6, C['3']);
          continue;
        }
        if (b.kind === 'race' || b.kind === 'class') {
          const hv = hover === b;
          const fill = b.selected ? C.i : hv && !b.disabled ? C['3'] : C['2'];
          panel(ctx, b.x, b.y, b.w, b.h, fill, b.selected ? C.h : hv ? C['4'] : C['3']);
          const ids = b.kind === 'race' ? heroSpriteIds(b.id, null) : heroSpriteIds(st.race, b.id);
          ctx.globalAlpha = b.disabled ? 0.35 : 1;
          drawSprite(ctx, ids, b.x + 6, b.y + (b.h - 32) / 2, 2, { frame: b.selected ? idleFrame(st.time * 1000) : 0 });
          ctx.globalAlpha = 1;
          const col = b.disabled ? C['3'] : C['5'];
          if (b.kind === 'race') text(ctx, fit(ctx, b.label, b.w - 52, FONT_B), b.x + 46, b.y + 15, col, FONT_B);
          else {
            text(ctx, fit(ctx, b.label, b.w - 52, FONT_B), b.x + 46, b.y + 5, col, FONT_B);
            text(ctx, b.sub, b.x + 46, b.y + 25, b.disabled ? C.c : C['4'], '12px monospace');
          }
          continue;
        }
        button(ctx, b, hover === b);
      }
      drawInfo(game);
    },
  };
  return self;
}
