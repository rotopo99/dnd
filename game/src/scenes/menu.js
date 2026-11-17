// Main menu: «Новая игра» (character creation -> prologue) and «Быстрый бой»
// (random hero vs ENCOUNTERS.standard1 on a generated arena — for QA and debugging).
import { t } from '../data/text/index.js';
import { isAllowed } from '../rules/character.js';
import { PLAYABLE_RACES, CLASS_ORDER } from '../data/index.js';
import { drawSprite, heroSpriteIds, enemySpriteIds, idleFrame } from '../assets/sprites.js';
import { play, stopAmbience } from '../audio/sfx.js';
import { C, FONT, FONT_XL, FONT_HB, text, button, hitButton, clear } from '../ui/draw.js';
import { createCreateScene } from './create.js';
import { createBattleScene } from './battle.js';
import { hasSave } from '../save.js';
import { continueLatest, openLoadMenu } from '../ui/save-ui.js';
import { openNetMenu } from './net-menu.js';
import { openSettings } from '../ui/settings-ui.js';

/** Load the most recent save (autosave or a manual slot) and go to its location / Cyberspace episode. */
export function continueGame(game) {
  if (!continueLatest(game)) { game.toast(t('menu.noSave'), 'c'); layout(game); }
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Random legal hero spec: playable race, allowed class, random path. */
export function randomHero(data) {
  const race = pick(PLAYABLE_RACES);
  const cls = pick(CLASS_ORDER.filter((c) => isAllowed(race, data.CLASSES[c])));
  const path = pick(data.CLASSES[cls].paths).id;
  return { race, cls, path, name: t('create.defaultName') };
}

export function startQuickBattle(game, hero = randomHero(game.data)) {
  game.hero = hero;
  const scene = createBattleScene({
    hero,
    enemies: game.data.ENCOUNTERS.standard1.enemies,
    title: `${t('battle.quickTitle')}: ${game.data.RACES[hero.race].name} · ${game.data.CLASSES[hero.cls].name}`,
    onWin: (g) => g.setScene(menuScene),
    onExit: (g) => g.setScene(menuScene),
  });
  game.setScene(scene);
}

let buttons = [];
let hover = null;
let time = 0;
const parade = [];

function layout(game) {
  const W = game.width, H = game.height;
  const w = 320, h = 52;
  const x = Math.floor((W - w) / 2);
  const y = Math.floor(H / 2) - 20;
  const gap = 10;
  buttons = [];
  let yy = y;
  if (hasSave()) {
    buttons.push({ id: 'continue', label: t('menu.continue'), x, y: yy, w, h, selected: true }); yy += h + gap;
    buttons.push({ id: 'load', label: t('save.load'), key: 'L', x, y: yy, w, h }); yy += h + gap;
  }
  buttons.push({ id: 'new', label: t('menu.newGame'), x, y: yy, w, h }); yy += h + gap;
  // roguelike.md: «Забег» shares the row with «Быстрый бой» (the column stays above the controls hint)
  const hw = Math.floor((w - gap) / 2);
  buttons.push({ id: 'quick', label: t('menu.quickBattle'), sub: t('menu.quickHint'), key: 'Q', x, y: yy, w: hw, h: 56 });
  buttons.push({ id: 'run', label: t('menu.run'), sub: t('menu.runHint'), key: 'R', x: x + hw + gap, y: yy, w: w - hw - gap, h: 56 }); yy += 56 + gap;
  buttons.push({ id: 'net', label: t('menu.net'), sub: t('menu.netHint'), key: 'M', x, y: yy, w, h: 56 });
  buttons.push({ id: 'settings', label: t('menu.settings'), key: 'O', x: W - 216, y: 16, w: 200, h: 40 }); // 3d.md: graphics
  for (const b of buttons) b.font = FONT_HB; // heading font on the main-menu buttons (STYLE «Шрифт»)
}

export const menuScene = {
  id: 'menu',
  enter(game) {
    time = 0;
    stopAmbience(2);
    layout(game);
    if (!parade.length) {
      for (const r of PLAYABLE_RACES) {
        const cls = pick(CLASS_ORDER.filter((c) => isAllowed(r, game.data.CLASSES[c])));
        parade.push(heroSpriteIds(r, cls));
      }
    }
  },
  resize(game) { layout(game); },
  update(game, dt) {
    time += dt;
    const m = game.input.mouse;
    const h = hitButton(buttons, m);
    if (h !== hover && h) play('uiHover');
    hover = h;
    let act = m.clicked && h ? h.id : null;
    if (game.input.wasPressed('Enter') || game.input.wasPressed('Space')) act = buttons[0].id;
    if (game.input.wasPressed('KeyN')) act = 'new';
    if (game.input.wasPressed('KeyQ')) act = 'quick';
    if (game.input.wasPressed('KeyM')) act = 'net';
    if (game.input.wasPressed('KeyL') && hasSave()) act = 'load';
    if (game.input.wasPressed('KeyO')) act = 'settings';
    if (game.input.wasPressed('KeyR')) act = 'run';
    if (!act) return;
    play('uiClick');
    if (act === 'continue') return continueGame(game);
    if (act === 'load') return openLoadMenu(game);
    if (act === 'net') return openNetMenu(game);
    if (act === 'settings') return openSettings(game);
    if (act === 'run') return import('./run-start.js').then((m) => game.setScene(m.createRunStartScene()));
    if (act === 'new') game.setScene(createCreateScene());
    else startQuickBattle(game);
  },
  render(game) {
    const { ctx, width: W, height: H } = game;
    clear(ctx, W, H);
    const tms = time * 1000;
    // heroes vs the cult
    const s = 4, cell = 64;
    const y0 = Math.floor(H / 2) - 210;
    const total = parade.length * cell + 3 * cell + 64;
    let x = Math.floor((W - total) / 2);
    parade.forEach((ids, i) => drawSprite(ctx, ids, x + i * cell, y0, s, { frame: idleFrame(tms, i * 0.3) }));
    x += parade.length * cell + 64;
    ['cultist', 'acolyte', 'cultist-gunner'].forEach((id, i) => drawSprite(ctx, enemySpriteIds(id), x + i * cell, y0, s, { frame: idleFrame(tms, i * 0.4 + 0.2), flip: true }));
    text(ctx, t('title'), W / 2, y0 + 100, C.h, FONT_XL, 'center');
    text(ctx, t('menu.tagline'), W / 2, y0 + 164, C['4'], FONT, 'center');
    for (const b of buttons) button(ctx, b, hover === b);
    text(ctx, t('menu.controls'), W / 2, H - 40, C['3'], FONT, 'center');
  },
};
