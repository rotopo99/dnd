// Roguelike «Забег» — run summary (docs/specs/roguelike.md «UI»): result, path by acts, the fallen, memory earned
// (recorded into meta once), ascension unlocked; «Сохранить духом» for a fallen hero (one spirit slot).
import { t } from '../data/text/index.js';
import { ACTS, NODE_TYPES, META } from '../data/roguelike.js';
import { C, FONT, FONT_B, FONT_XL, text, button, hitButton, clear } from '../ui/draw.js';
import { play } from '../audio/sfx.js';
import { loadMeta, recordRun, saveSpirit } from '../world/meta.js';

export function createRunEndScene(run) {
  const S = { run, rec: null, meta: null, buttons: [], hover: null, spirit: null };
  function layout(game) {
    const W = game.width, H = game.height;
    const B = [];
    if (run.deaths.length && !S.spirit) {
      run.deaths.slice(0, 4).forEach((d, i) => B.push({ id: 'spirit', d, x: 40 + i * 230, y: H - 150, w: 220, h: 48,
        label: `${t('run.saveSpirit')}: ${d.name}`, sub: `${META.spirit.saveCost} ${t('run.memGot')}`, disabled: S.meta.memory < META.spirit.saveCost }));
    }
    B.push({ id: 'again', x: W / 2 - 230, y: H - 80, w: 220, h: 48, label: t('run.again'), key: 'Enter', selected: true });
    B.push({ id: 'menu', x: W / 2 + 10, y: H - 80, w: 220, h: 48, label: t('run.toMenu'), key: 'Esc' });
    S.buttons = B;
  }
  return {
    id: 'run-end',
    S,
    enter(game) {
      S.meta = loadMeta();
      if (!run.recorded) { S.rec = recordRun(S.meta, run); run.recorded = true; }
      layout(game);
    },
    resize(game) { layout(game); },
    update(game) {
      const inp = game.input, m = inp.mouse;
      const h = hitButton(S.buttons, m);
      if (h !== S.hover && h) play('uiHover');
      S.hover = h;
      let act = m.clicked && h && !h.disabled ? h : null;
      if (inp.wasPressed('Enter')) act = { id: 'again' };
      if (inp.wasPressed('Escape')) act = { id: 'menu' };
      if (!act) return;
      play('uiClick');
      if (act.id === 'spirit') { if (saveSpirit(S.meta, act.d) === true) { S.spirit = act.d.name; game.toast(`${t('run.spiritSaved')}: ${act.d.name}`, 'j'); } layout(game); }
      else if (act.id === 'again') import('./run-start.js').then((mm) => game.setScene(mm.createRunStartScene()));
      else import('./menu.js').then((mm) => game.setScene(mm.menuScene));
    },
    render(game) {
      const { ctx, width: W } = game;
      clear(ctx, W, game.height);
      const win = run.status === 'win';
      text(ctx, win ? t('run.win') : t('run.loss'), W / 2, 40, win ? C.j : C.c, FONT_XL, 'center');
      text(ctx, `${t('run.seed')} ${run.seed} · ${t('run.asc')} ${run.asc} · ${t('run.act')} ${run.act + 1}: ${ACTS[run.act].name}`, W / 2, 110, C['4'], FONT_B, 'center');
      let y = 160;
      text(ctx, t('run.path'), 40, y, C.h, FONT_B); y += 26;
      for (let a = 0; a <= run.act; a++) {
        const steps = run.log.filter((l) => l.k === 'node' && l.act === a).map((l) => NODE_TYPES[l.type]?.name || l.type);
        text(ctx, `${ACTS[a].name}: ${steps.join(' → ') || '—'}`, 40, y, C['5'], FONT); y += 22;
      }
      y += 12;
      text(ctx, t('run.deaths'), 40, y, C.h, FONT_B); y += 26;
      text(ctx, run.deaths.length ? run.deaths.map((d) => `${d.name} (${t('run.act')} ${d.act + 1})`).join(', ') : t('run.noDeaths'), 40, y, C['5'], FONT); y += 34;
      if (S.rec) {
        const mm = S.rec.mem;
        text(ctx, `${t('run.memGot')}: +${S.rec.gained} (${mm.base} + ${mm.deaths}${mm.mul !== 1 ? ` × ${mm.mul}` : ''}) · ${t('run.memory')}: ${S.meta.memory}`, 40, y, C.j, FONT_B); y += 26;
        if (S.rec.ascUnlocked) { text(ctx, `${t('run.ascOpen')}: ${S.rec.ascUnlocked}`, 40, y, C.a, FONT_B); y += 26; }
      }
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
}
