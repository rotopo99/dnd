// Bark bubble (companions-scenes.md): a companion's line with a portrait for COMPANION_RULES.barks.durationSec.
// main.js calls updateBarks every step and renderBark after the scene; state lives on the game object (game.barks / game.bark).
import { COMPANION_RULES } from '../data/companions.js';
import { takeBarks, pickBark, createBarkState } from '../world/barks.js';
import { activeCompanions } from '../world/state.js';
import { NPCS } from '../data/npcs.js';
import { C, FONT, FONT_B, text, wrap, panel } from './draw.js';
import { drawSpeaker } from './portrait-of.js';
import { genderize, heroGender } from '../world/romance.js';

export function updateBarks(game, dt) {
  if (game.bark) { game.bark.t += dt; if (game.bark.t >= COMPANION_RULES.barks.durationSec) game.bark = null; }
  const reqs = takeBarks();
  if (!reqs.length || !game.save) return;
  game.barks = game.barks || createBarkState();
  const cands = activeCompanions(game.save).filter((p) => p.hp !== 0 && NPCS[p.npc]).map((p) => ({ npc: p.npc, name: NPCS[p.npc].name }));
  for (const r of reqs) {
    const b = pickBark(game.barks, game.time, r.situation, cands, { scene: game.scene, npc: r.npc, dialogue: game.scene?.id === 'dialogue' });
    if (b) { game.bark = { ...b, text: genderize(b.text, heroGender(game.save)), t: 0 }; break; }
  }
}

export function renderBark(game) {
  const b = game.bark;
  if (!b) return;
  const { ctx } = game;
  const w = 460, pad = 10, pic = 64;
  ctx.font = FONT;
  const lines = wrap(ctx, `«${b.text}»`, w - pic - pad * 3, FONT).slice(0, 3);
  const h = Math.max(pic + pad * 2, 30 + lines.length * 20 + pad);
  const x = 16, y = game.height - h - 170; // bottom left, above the bottom bars of map / location
  const T = COMPANION_RULES.barks.durationSec;
  ctx.globalAlpha = b.t < 0.2 ? b.t / 0.2 : b.t > T - 0.5 ? Math.max(0, (T - b.t) / 0.5) : 1;
  panel(ctx, x, y, w, h, C['0'], C.h);
  if (!drawSpeaker(ctx, b.npc, x + pad, y + pad, 2)) panel(ctx, x + pad, y + pad, pic, pic, C['2'], C['3']);
  text(ctx, b.name, x + pic + pad * 2, y + pad, C.h, FONT_B);
  lines.forEach((l, i) => text(ctx, l, x + pic + pad * 2, y + pad + 22 + i * 20, C['5'], FONT));
  ctx.globalAlpha = 1;
}
