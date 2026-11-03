// Dialogue scene: window with the speaker name and lines, typewriter text.
// createDialogueScene({ title?, lines: [{ who, text }], hero?: { race, cls }, onDone(game) })
// Click / Space / Enter — next line (first press finishes the typewriter). Esc — skip the whole dialogue.
import { t } from '../data/text/index.js';
import { speaker } from '../data/text/prologue.js';
import { drawSprite, heroSpriteIds, enemySpriteIds, idleFrame } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, wrap, panel, clear } from '../ui/draw.js';

const CPS = 70; // characters per second

// NPCs that have a sprite in sprites.js
const PORTRAITS = {
  gans: enemySpriteIds('npc-gans'),
  acolyte: enemySpriteIds('acolyte'),
  cultist: enemySpriteIds('cultist'),
  gunner: enemySpriteIds('cultist-gunner'),
  skrilet: enemySpriteIds('skrilet'),
  paracetamol: heroSpriteIds('skeleton'),
};
const NAME_COLORS = { radio: C.a, speaker: C.a, acolyte: C.n, cultist: C.c, gunner: C.c, skrilet: C.c, gans: C.j };

/** Normalise story values: string -> narrator line, array -> as is. */
export function toLines(v) {
  if (!v) return [];
  if (typeof v === 'string') return [{ who: 'narrator', text: v }];
  return v;
}

export function createDialogueScene({ title = '', lines, hero = null, onDone }) {
  let i = 0;
  let shown = 0;
  let time = 0;
  let done = false;
  const finish = (game) => {
    if (done) return;
    done = true;
    onDone(game);
  };
  return {
    id: 'dialogue',
    title,
    enter() {
      i = 0; shown = 0; time = 0; done = false;
      if (!lines.length) lines = [{ who: 'narrator', text: '…' }];
    },
    update(game, dt) {
      time += dt;
      if (done) return;
      const cur = lines[i];
      shown = Math.min(cur.text.length, shown + CPS * dt);
      const inp = game.input;
      if (inp.wasPressed('Escape')) { play('uiClick'); finish(game); return; }
      if (inp.mouse.clicked || inp.wasPressed('Space') || inp.wasPressed('Enter')) {
        if (shown < cur.text.length) { shown = cur.text.length; return; }
        play('uiClick');
        i++;
        shown = 0;
        if (i >= lines.length) finish(game);
      }
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      if (done) return;
      const cur = lines[i];
      // scene title
      if (title) text(ctx, title, W / 2, 48, C['4'], FONT_L, 'center');
      // stage: hero on the left, speaker on the right
      const stageY = Math.floor(H / 2) - 120;
      ctx.fillStyle = C['1'];
      ctx.fillRect(0, stageY + 150, W, 2);
      if (hero) drawSprite(ctx, heroSpriteIds(hero.race, hero.cls), Math.floor(W / 2) - 300, stageY, 9, { frame: idleFrame(time * 1000) });
      const portrait = PORTRAITS[cur.who];
      if (portrait) drawSprite(ctx, portrait, Math.floor(W / 2) + 156, stageY, 9, { frame: idleFrame(time * 1000, 0.5), flip: true });
      // window
      const w = Math.min(1100, W - 64);
      const h = 196;
      const x = Math.floor((W - w) / 2);
      const y = H - h - 40;
      panel(ctx, x, y, w, h, C['1'], C['3']);
      const name = speaker(cur.who);
      if (name) {
        ctx.font = FONT_B;
        const nw = ctx.measureText(name).width + 24;
        panel(ctx, x + 16, y - 16, nw, 32, C['2'], NAME_COLORS[cur.who] || C.h);
        text(ctx, name, x + 28, y - 7, NAME_COLORS[cur.who] || C.h, FONT_B);
      }
      const all = wrap(ctx, cur.text, w - 48, FONT);
      let left = Math.floor(shown);
      const col = cur.who === 'narrator' ? C['4'] : C['5'];
      for (let k = 0; k < all.length && left > 0; k++) {
        const l = all[k];
        text(ctx, l.slice(0, left), x + 24, y + 28 + k * LINE * 1.2, col, FONT);
        left -= l.length + 1;
      }
      text(ctx, `${i + 1}/${lines.length}`, x + w - 16, y + h - 28, C['3'], FONT, 'right');
      if (shown >= cur.text.length && Math.floor(time * 2) % 2 === 0) text(ctx, '▼', x + w / 2, y + h - 28, C.h, FONT, 'center');
      text(ctx, `${t('dlg.next')} · ${t('dlg.skip')}`, x + 24, y + h - 28, C['3']);
    },
  };
}
