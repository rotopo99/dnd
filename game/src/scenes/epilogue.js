// «Эпилог» (docs/specs/world-consequences.md §1): slides of EPILOGUE chosen by flags (world/consequences.js
// epilogueSlides — intro and outro always, ≤ 12 by prio, shown by order). Click / Enter / Space — next, Esc — skip.
// The last slide is «Дальше — вы». Opened after the finale (location.js pendingEpilogue), from the journal and at the
// Exodus zero (exodus-zero.js). openEpilogue(game, { save?, extra?: [{ title, text }], onDone(game) }).
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, FONT_XL, text, textBlock, clear } from '../ui/draw.js';
import { epilogueSlides } from '../world/consequences.js';
import { tf } from '../world/state.js';
import { play } from '../audio/sfx.js';

const ART = new Map();
function artOf(src) {
  if (!src) return null;
  if (!ART.has(src)) { const img = new Image(); img.src = new URL(`../../assets/${src}`, import.meta.url).href; ART.set(src, img); }
  const img = ART.get(src);
  return img.complete && img.naturalWidth ? img : null;
}

export function createEpilogueScene({ save, extra = [], onDone }) {
  const list = epilogueSlides(save);
  // extra slides (e.g. the Exodus zero) go right after the intro
  const slides = [list[0], ...extra, ...list.slice(1)].filter(Boolean);
  const S = { i: 0, t: 0 };
  const done = (game) => { S.over = true; onDone?.(game); };
  const next = (game) => {
    play('uiClick');
    if (S.i >= slides.length - 1) return done(game);
    S.i++; S.t = 0;
  };
  return {
    id: 'epilogue', S, slides,
    enter() { S.t = 0; },
    update(game, dt) {
      if (S.over) return;
      S.t += dt;
      const inp = game.input;
      if (inp.wasPressed('Escape')) return done(game);
      if (inp.mouse.clicked || inp.wasPressed('Enter') || inp.wasPressed('Space')) next(game);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      const s = slides[S.i];
      if (!s) return;
      const a = Math.min(1, S.t / 0.6);
      ctx.globalAlpha = a;
      const img = artOf(s.art);
      const top = img ? Math.round(H * 0.08) : Math.round(H * 0.28);
      if (img) {
        const h = Math.round(H * 0.42), w = Math.round((img.naturalWidth / img.naturalHeight) * h);
        ctx.drawImage(img, Math.round((W - w) / 2), top, w, h);
      }
      const ty = img ? top + Math.round(H * 0.46) : top;
      text(ctx, t('epi.title').toUpperCase(), W / 2, ty - 40, C['4'], FONT_B, 'center');
      text(ctx, s.title, W / 2, ty, S.i === slides.length - 1 ? C.a : C.h, FONT_XL, 'center');
      const bw = Math.min(900, W - 120);
      textBlock(ctx, s.text, Math.round((W - bw) / 2), ty + 80, bw, C['5'], FONT, 26, 8);
      ctx.globalAlpha = 1;
      text(ctx, tf('epi.count', { i: S.i + 1, n: slides.length }), W - 40, H - 40, C['3'], FONT, 'right');
      text(ctx, S.i === slides.length - 1 ? t('epi.last') : t('epi.next'), W / 2, H - 60, C['4'], FONT, 'center');
    },
  };
}

/** Switch to the epilogue scene; onDone(game) — where to go after the last slide / Esc. */
export function openEpilogue(game, { save = game.save, extra = [], onDone } = {}) {
  game.setScene(createEpilogueScene({ save, extra, onDone }));
}
