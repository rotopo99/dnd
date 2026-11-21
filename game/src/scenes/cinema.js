// Cinematic scene player (docs/specs/cinematics.md): letterbox, subtitles + voice blips (audio/vox.js), choices on a
// timer (silence when it runs out), QTE (tap / hold / mash / seq), checks, «X запомнит это», music by scene, pause
// (Esc: timer frozen, settings «Таймер выбора» / «QTE», skip with a confirmation), line skip (click / Space).
// Picture: Three.js view (three/cinema.js, loaded dynamically like three/engine.js) or the 2D «comic» fallback
// (portrait panels; a new shot = a new panel). Logic — world/cine.js; triggers — world/cine-hooks.js.
//   playCinematic(game, id, { onEnd(game, result), back, save, hero, debug, comic })
//   cineBefore(game, point, cont(game, result)) -> true when a scene plays first (cont runs after it)
//   cineInterrupt(game, scene) — main.js setScene: queued scenes (quest stages) and `loc:<id>` points on node scenes
//   cinePrefs() / setCinePrefs(p) — { timer: relaxed|normal|short|off, qte: normal|easy|skip } (localStorage, ?cinetimer= ?qte=)
import { CINEMATICS, CINE_RULES, TONES } from '../data/cinematics/index.js';
import { CINE_VIEW as CV, CINE_STAGES, CINE_GRADES, COMIC_FRAMES, COMIC_KEEP } from '../data/cine-play.js';
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { C, FONT, FONT_B, FONT_L, text, wrap, panel, button, hitButton } from '../ui/draw.js';
import { drawSpeaker, speakerSubject, crispScale } from '../ui/portrait-of.js';
import { drawPortrait } from '../assets/portraits.js';
import { playTrack, getMusicState } from '../audio/music.js';
import { play } from '../audio/sfx.js';
import { say, VOX_KINDS } from '../audio/vox.js';
import { gfxMode } from '../gfx/settings.js';
import { createCine, createCineEnv, cineTick, cineAdvance, cinePick, cineKey, cineHold, cineSkip } from '../world/cine.js';
import { cinesAt, takeCineQueue } from '../world/cine-hooks.js';
import { applyRep, factionName } from '../world/reputation.js';
import { addLoyalty, partyEntry } from '../world/companions.js';
import { addBond, finishDate } from '../world/romance.js';
import { members } from '../world/state.js';
import { checkInfo, checkChance, rollCheck, skillName } from '../world/checks.js';
import { saveGame } from '../save.js';

const tf = (k, v = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const WORLD = { applyRep, factionName, addLoyalty, partyEntry, addBond, finishDate, members, checkInfo, checkChance, rollCheck, skillName, NPCS };
const TIMERS = ['relaxed', 'normal', 'short', 'off'];
const QTES = ['normal', 'easy', 'skip'];
const PREF_KEY = 'dnd.cine';
const ACTOR_COLORS = [C.a, C.f, C.n, C.j, C.e, C.p, C['9']];
const TONE_COLORS = { kind: C.j, hard: C.c, smart: C.h, funny: C.a, silent: C['4'] };

export function cinePrefs() {
  let p = {};
  try { p = JSON.parse(globalThis.localStorage?.getItem(PREF_KEY) || '{}') || {}; } catch { p = {}; }
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    if (TIMERS.includes(q.get('cinetimer'))) p.timer = q.get('cinetimer');
    if (QTES.includes(q.get('qte'))) p.qte = q.get('qte');
  } catch { /* no location (node) */ }
  return { timer: TIMERS.includes(p.timer) ? p.timer : 'normal', qte: QTES.includes(p.qte) ? p.qte : 'normal' };
}
export function setCinePrefs(p) {
  try { globalThis.localStorage?.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

// ------------------------------------------------------------------------------------------------ hooks

export function playCinematic(game, id, o = {}) {
  const def = CINEMATICS[id];
  if (!def) { o.onEnd ? o.onEnd(game, null) : o.back && game.resume(o.back); return null; }
  const sc = createCinemaScene(def, o);
  game.setScene(sc);
  return sc;
}

/** Scenes waiting at a game point play first (one after another), then cont(game, lastResult). */
export function cineBefore(game, point, cont) {
  const ids = cinesAt(game.save, point);
  if (!ids.length || game.coop) return false;
  const run = (g, i, res) => {
    if (i >= ids.length) return cont(g, res);
    playCinematic(g, ids[i], { onEnd: (g2, r) => { if (g2.save) saveGame(g2.save); run(g2, i + 1, r); } });
  };
  run(game, 0, null);
  return true;
}

/** main.js setScene: on a node / map scene — queued scenes first, then the node's `loc:<id>` point. */
export function cineInterrupt(game, scene) {
  const sv = game.save;
  if (!sv || game.coop || game.modals.length || game.scene !== scene || !['location', 'roam', 'worldmap'].includes(scene?.id)) return;
  const id = takeCineQueue(sv) || (scene.locId && cinesAt(sv, `loc:${scene.locId}`)[0]);
  if (!id) return;
  playCinematic(game, id, { onEnd: (g) => { saveGame(sv); g.resume(scene); cineInterrupt(g, scene); } });
}

// ------------------------------------------------------------------------------------------------ scene

export function createCinemaScene(def, o = {}) {
  const S = {
    R: null, mode: 'loading', view: null, loadT: 0, prevTrack: null, last: 0, panels: [], fades: [], rems: [], glitch: 0, shake: 0,
    trFade: 0, buttons: [], hover: null, menu: null, flash: null, skipOk: false, finished: false, names: {}, colors: {},
  };
  let G = null;
  const cast = def.cast || {};
  Object.keys(cast).forEach((w, i) => { S.colors[w] = w === 'hero' ? C.h : ACTOR_COLORS[i % ACTOR_COLORS.length]; });

  const nameOf = (w) => (w === 'hero' ? G?.heroObj?.name || t('create.defaultName') : cast[w]?.name || NPCS[w]?.name || w);

  const voice = (l) => {
    const v = cast[l.w]?.voice;
    if (!v || l.w === 'narr') return;
    const o2 = { gender: v.gender, race: v.race, pitch: v.pitch };
    if (l.vox === 'choir') CV.choirOffsetsMs.forEach((ms, i) => setTimeout(() => say('hm', { ...o2, pitch: (v.pitch || 110) * CV.choirPitch[i % CV.choirPitch.length] }), ms));
    else say(VOX_KINDS.includes(l.vox) ? l.vox : 'hm', o2);
  };

  const fx = (f) => {
    if (f.k === 'sfx') play(f.id);
    else if (f.k === 'music') playTrack(f.id, { fade: (f.fade || 1.5) * 1000 });
    else if (f.k === 'shake') { S.shake = Math.max(S.shake, f.amp || 0.1); S.view?.shake(f.amp || 0.1); }
    else if (f.k === 'fade') S.fades.push({ color: f.from || f.to || 'black', dir: f.from ? -1 : 1, d: f.d || 1, t: -(f.after || 0) });
    else if (f.k === 'glitch') S.glitch = f.d || 0.5;
    else if (f.k === 'vox') { const v = cast[f.who]?.voice; if (v) say(f.kind, { gender: v.gender, race: v.race, pitch: v.pitch }); }
  };

  const drain = (game) => {
    const R = S.R;
    for (const e of R.out.splice(0)) {
      if (e.k === 'line') voice(e.line);
      else if (e.k === 'fx') fx(e.fx);
      else if (e.k === 'shot') { if (e.tr === 'fade') S.trFade = CV.fadeSec * 2; pushPanel(e.shot); }
      else if (e.k === 'toast') game.toast(e.text, e.color || 'h');
      else if (e.k === 'rem') { S.rems.push({ text: e.text, t: 0 }); play('buff'); }
      else if (e.k === 'qte') { play(e.ok ? 'buff' : 'debuff'); S.flash = { ok: e.ok, t: 0 }; }
      else if (e.k === 'check') play(e.ok ? 'crit' : 'debuff');
      else if (e.k === 'picked') play('uiClick');
      else if (e.k === 'error') console.warn(e.text);
    }
  };

  const pushPanel = (shot) => {
    if (!shot) return;
    const R = S.R, who = [shot.a, shot.b].filter(Boolean);
    const list = who.length ? who : Object.keys(R.cast).filter((w) => R.cast[w].set).slice(0, 4);
    S.panels.push({ shot, who: list, emo: Object.fromEntries(list.map((w) => [w, R.cast[w]?.emo])), t: 0, n: R.shotN });
    if (S.panels.length > COMIC_KEEP) S.panels.shift();
  };

  const finish = (game) => {
    if (S.finished) return;
    S.finished = true;
    try { S.view?.dispose(); } catch (e) { console.warn('cinema dispose', e); }
    if (S.prevTrack && S.prevTrack !== def.music) playTrack(S.prevTrack);
    const res = S.R?.result ?? null;
    if (o.onEnd) o.onEnd(game, res);
    else if (o.back) game.resume(o.back);
  };

  const startView = (game) => {
    const E = game.gfx?.three;
    import('../three/cinema.js').then(({ createCinemaView }) => {
      if (S.finished) return;
      S.view = createCinemaView(E);
      return S.view.load(def, G.heroObj);
    }).catch((e) => { console.warn('cinema 3d', e); S.mode = 'comic'; });
  };

  const menuButtons = (game) => {
    const { width: W, height: H } = game, w = 420, x = Math.floor((W - w) / 2);
    let y = Math.floor(H / 2) - 110;
    const P = S.R.prefs, list = [];
    const add = (id, label, extra = {}) => { list.push({ id, label, x, y, w, h: 40, font: FONT_B, ...extra }); y += 50; };
    if (S.menu === 'confirm') {
      add('yes', t('cine.yes'), { key: 'Enter' }); add('no', t('cine.no'), { key: 'Esc' });
    } else {
      add('resume', t('cine.resume'), { key: 'Esc' });
      add('timer', `${t('cine.timer')}: ${t(`cine.timer.${P.timer}`)}`);
      add('qte', `${t('cine.qte')}: ${t(`cine.qte.${P.qte}`)}`);
      if (S.skipOk) add('skip', t('cine.skip'));
    }
    return list;
  };

  const menuAct = (game, id) => {
    const R = S.R;
    play('uiClick');
    if (id === 'resume' || id === 'no') { S.menu = id === 'no' ? 'main' : null; R.paused = !!S.menu; }
    else if (id === 'timer') { R.prefs.timer = TIMERS[(TIMERS.indexOf(R.prefs.timer) + 1) % TIMERS.length]; setCinePrefs(R.prefs); }
    else if (id === 'qte') { R.prefs.qte = QTES[(QTES.indexOf(R.prefs.qte) + 1) % QTES.length]; setCinePrefs(R.prefs); }
    else if (id === 'skip') S.menu = 'confirm';
    else if (id === 'yes') { S.menu = null; cineSkip(R); R.out.length = 0; S.R.done = true; }
  };

  const scene = {
    id: 'cinema', def, S,
    get R() { return S.R; },
    enter(game) {
      const save = o.save !== undefined ? o.save : game.save;
      G = { save, heroObj: o.hero || save?.hero || game.hero || null };
      S.prevTrack = getMusicState().track;
      S.skipOk = !!(o.debug || save?.flags?.[`cine-seen:${def.id}`] || !CINE_RULES.scene.skipAfterFirstView);
      const env = save?.hero ? createCineEnv(save, game.data, WORLD) : undefined;
      S.R = createCine(def, { save, env, prefs: cinePrefs(), resume: !o.debug });
      if (def.music) playTrack(def.music);
      const want3d = !o.comic && gfxMode() === '3d' && !game.gfx?.threeFailed;
      S.mode = want3d ? 'loading' : 'comic';
      if (want3d && game.gfx?.three) startView(game);
      S.last = performance.now();
      drain(game);
    },
    resume() { S.last = performance.now(); },
    update(game, dt) {
      const R = S.R, inp = game.input;
      if (S.finished) return;
      if (S.mode === 'loading') {
        S.loadT += dt;
        if (!S.view && game.gfx?.three && !S._started) { S._started = true; startView(game); }
        if (S.view?.ready) S.mode = '3d';
        else if (S.view?.failed || game.gfx?.threeFailed || S.loadT > CV.loadTimeoutSec || (!game.gfx?.three && S.loadT > CV.threeWaitSec) || (S.view && !game.gfx.three.ok() && S.loadT > 1)) S.mode = 'comic';
        if (S.mode === 'loading') return;
      }
      // pause menu
      if (inp.wasPressed('Escape')) { S.menu = S.menu === 'confirm' ? 'main' : S.menu ? null : 'main'; R.paused = !!S.menu; play('uiClick'); return; }
      if (S.menu) {
        S.buttons = menuButtons(game);
        S.hover = hitButton(S.buttons, inp.mouse);
        if (S.menu === 'confirm' && inp.wasPressed('Enter')) menuAct(game, 'yes');
        else if (inp.mouse.clicked && S.hover) menuAct(game, S.hover.id);
        if (R.done) finish(game);
        return;
      }
      // choice / QTE / lines
      if (R.phase === 'choice' && R.choice) {
        const n = R.choice.opts.length;
        S.hover = hitButton(S.buttons, inp.mouse);
        for (let k = 0; k <= n; k++) if (inp.wasPressed(`Digit${k + 1}`)) cinePick(R, k < n ? R.choice.opts[k].id : 'silence');
        if (inp.mouse.clicked && S.hover) cinePick(R, S.hover.id);
      } else if (R.phase === 'qte' && R.qte) {
        const q = R.qte;
        for (const L of new Set([...CV.qteKeys, ...q.keys])) if (inp.wasPressed(`Key${L}`)) cineKey(R, L);
        if (inp.mouse.clicked && (q.kind === 'tap' || q.kind === 'mash')) cineKey(R, q.keys[0]);
        cineHold(R, inp.isDown(`Key${q.keys[0]}`) || inp.mouse.down);
      } else if (inp.mouse.clicked || inp.wasPressed('Space') || inp.wasPressed('Enter')) cineAdvance(R);
      cineTick(R, dt);
      drain(game);
      for (const f of S.fades) f.t += dt;
      S.fades = S.fades.filter((f) => f.dir > 0 || f.t < f.d);
      for (const r of S.rems) r.t += dt;
      S.rems = S.rems.filter((r) => r.t < (CINE_RULES.remember.sec || CV.toastSec));
      for (const p of S.panels) p.t += dt;
      if (S.flash) { S.flash.t += dt; if (S.flash.t > 0.6) S.flash = null; }
      S.glitch = Math.max(0, S.glitch - dt); S.shake = Math.max(0, S.shake - dt * 0.4); S.trFade = Math.max(0, S.trFade - dt);
      if (R.done) finish(game);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const now = performance.now(), rdt = clamp((now - S.last) / 1000, 0, 0.1);
      S.last = now;
      const R = S.R, band = Math.min(H, Math.round(W / CV.letterbox)), bar = Math.floor((H - band) / 2);
      let drew3d = false;
      if (S.mode === '3d' && S.view && R) {
        try { drew3d = S.view.frame(R, R.paused || S.menu ? 0 : rdt, W, H); } catch (e) { console.warn('cinema frame', e); S.mode = 'comic'; }
      }
      if (drew3d) ctx.clearRect(0, 0, W, H);
      else { ctx.fillStyle = C['0']; ctx.fillRect(0, 0, W, H); }
      if (S.mode === 'loading' || !R) { text(ctx, t('cine.loading'), W / 2, H / 2 - 10, C['4'], FONT, 'center'); return; }
      if (!drew3d) drawComic(ctx, W, H, bar, band);
      drawOverlays(ctx, W, H, bar, band);
      // letterbox
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, bar + band, W, H - bar - band);
      text(ctx, def.title, 24, Math.max(8, bar / 2 - 12), C['3'], FONT_L);
      if (!drew3d) text(ctx, t('cine.comic'), W - 24, Math.max(8, bar / 2 - 8), C['3'], FONT, 'right');
      drawSubtitle(ctx, W, H, bar, band);
      S.buttons = [];
      if (R.phase === 'choice' && R.choice) drawChoice(ctx, W, H, bar, band);
      if (R.phase === 'qte' && R.qte) drawQte(ctx, W, H, bar, band);
      if (R.phase === 'check' && R.check) drawCheck(ctx, W, bar);
      drawRems(ctx, bar);
      if (!R.choice && !R.qte) text(ctx, t('cine.next'), W / 2, H - Math.max(18, bar / 2 + 8), C['3'], FONT, 'center');
      if (S.menu) drawMenu(ctx, game, W, H);
    },
  };

  // ---------------------------------------------------------------------------------------------- drawing

  function portraitOf(ctx, who, x, y, scale, opts) {
    const c = cast[who];
    if (!c) return;
    if (c.look === 'spirit') ctx.globalAlpha *= 0.6;
    if (who === 'hero' || c.k === 'hero') { if (!drawSpeaker(ctx, 'hero', x, y, scale, opts, { hero: G?.heroObj })) silhouette(ctx, who, x, y, scale); return; }
    const key = String(c.portrait || who).replace(/^npc-/, '');
    const sub = speakerSubject(key) || { id: key, race: c.voice?.race === 'android' ? 'android' : 'human', faction: 'none' };
    try { drawPortrait(ctx, sub, x, y, scale, opts); } catch { silhouette(ctx, who, x, y, scale); }
  }
  function silhouette(ctx, who, x, y, scale) {
    const s = 48 * scale;
    ctx.fillStyle = C['2']; ctx.fillRect(x + s * 0.25, y + s * 0.1, s * 0.5, s * 0.5); ctx.fillRect(x + s * 0.1, y + s * 0.6, s * 0.8, s * 0.4);
    text(ctx, nameOf(who).slice(0, 1), x + s / 2, y + s * 0.25, C['4'], FONT_L, 'center');
  }

  function drawComic(ctx, W, H, bar, band) {
    const st = CINE_STAGES[def.stage] || {};
    const g = ctx.createLinearGradient(0, bar, 0, bar + band);
    g.addColorStop(0, st.wall || C['1']); g.addColorStop(1, st.fog || C['0']);
    ctx.fillStyle = g; ctx.fillRect(0, bar, W, band);
    const R = S.R, pad = 18, top = bar + pad, ph = band - pad * 2 - 64;
    const ws = S.panels.map((p) => (COMIC_FRAMES[p.shot.frame] || COMIC_FRAMES.med).w);
    const sum = ws.reduce((a, b) => a + b, 0) || 1, avail = W - pad * (S.panels.length + 1);
    const k = Math.min(1, avail / (sum * W * 0.62)) * W * 0.62;
    let x = W - pad;
    for (let i = S.panels.length - 1; i >= 0; i--) {
      const p = S.panels[i], F = COMIC_FRAMES[p.shot.frame] || COMIC_FRAMES.med, pw = Math.floor(ws[i] * k);
      x -= pw;
      const cur = i === S.panels.length - 1, slide = cur ? clamp(p.t / 0.25, 0, 1) : 1;
      ctx.save();
      ctx.globalAlpha = (cur ? 1 : 0.55) * slide;
      ctx.translate(x + pw / 2 + (1 - slide) * 40, top + ph / 2);
      if (F.tilt) ctx.rotate((F.tilt * Math.PI) / 180);
      const px = -pw / 2, py = -ph / 2;
      ctx.fillStyle = st.floor || C['2']; ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py, pw, ph * 0.55);
      ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
      const who = p.who, n = Math.max(1, who.length);
      const sc = Math.max(1, Math.min(F.scale, crispScale(Math.min(ph * (p.shot.frame === 'high' ? 0.55 : 0.85), (pw / n) * 0.95))));
      const s = 48 * sc;
      who.forEach((w, j) => {
        const cx = px + (pw / n) * (j + 0.5) - s / 2, cy = p.shot.frame === 'low' ? py + ph - s + s * 0.08 : py + ph - s;
        const emo = cur ? R.cast[w]?.emo : p.emo[w];
        const dim = cur && R.speaking && R.speaking !== w && R.speaking !== 'narr' ? 0.75 : 1;
        ctx.globalAlpha *= dim;
        portraitOf(ctx, w, cx, cy, sc, { emotion: emo || 'neutral', flip: n > 1 && j === 1, native: true });
        ctx.globalAlpha /= dim;
      });
      ctx.restore();
      ctx.save(); ctx.globalAlpha = (cur ? 1 : 0.55) * slide;
      ctx.translate(x + pw / 2 + (1 - slide) * 40, top + ph / 2);
      if (F.tilt) ctx.rotate((F.tilt * Math.PI) / 180);
      ctx.strokeStyle = cur ? C['5'] : C['3']; ctx.lineWidth = 4; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
      x -= pad;
    }
  }

  function drawOverlays(ctx, W, H, bar, band) {
    const R = S.R;
    const gr = R.grade && CINE_GRADES[R.grade.id];
    if (gr) {
      const a = gr.flash ? Math.max(0, 1 - R.grade.t / (R.grade.d || 0.5)) : 1;
      if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = gr.color; ctx.fillRect(0, bar, W, band); ctx.globalAlpha = 1; }
    }
    if (S.glitch > 0) {
      for (let i = 0; i < 8; i++) {
        const y = bar + Math.random() * band, h = 4 + Math.random() * 18;
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(112,216,242,0.35)' : 'rgba(224,79,168,0.35)';
        ctx.fillRect((Math.random() - 0.5) * 60, y, W, h);
      }
    }
    if (S.R.tr === 'whip' && S.R.shotT < CV.whipSec) {
      const a = 1 - S.R.shotT / CV.whipSec;
      for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(20,20,28,${0.35 * a})`; ctx.fillRect(0, bar + (band / 10) * i, W, band / 20); }
    }
    let fa = S.trFade > 0 ? Math.min(1, S.trFade / CV.fadeSec) : 0, fcol = '#000';
    for (const f of S.fades) {
      if (f.t < 0) continue;
      const k = clamp(f.t / f.d, 0, 1), a = f.dir < 0 ? 1 - k : k;
      if (a > fa) { fa = a; fcol = f.color === 'white' ? '#fff' : '#000'; }
    }
    for (const f of S.fades) if (f.t < 0 && f.dir < 0) { fa = 1; fcol = f.color === 'white' ? '#fff' : '#000'; }
    if (fa > 0) { ctx.globalAlpha = fa; ctx.fillStyle = fcol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  function drawSubtitle(ctx, W, H, bar, band) {
    const R = S.R, l = R.line;
    if (!l) return;
    const w = Math.min(980, W - 120), y0 = bar + band - 74;
    const nm = l.w === 'narr' ? '' : `${nameOf(l.w)}: `;
    ctx.font = FONT_B;
    const nw = nm ? ctx.measureText(nm).width : 0;
    const lines = wrap(ctx, l.t, w - nw, l.w === 'narr' ? 'italic 18px monospace' : 'bold 18px monospace').slice(0, 3);
    const lh = 24, h = lines.length * lh + 14, x = Math.floor((W - w) / 2), y = y0 - (lines.length - 2) * lh;
    ctx.fillStyle = 'rgba(10,10,16,0.62)'; ctx.fillRect(x - 12, y - 8, w + 24, h);
    if (nm) text(ctx, nm, x, y, S.colors[l.w] || C.a, 'bold 18px monospace');
    lines.forEach((s, i) => text(ctx, s, x + nw, y + i * lh, l.w === 'narr' ? C['4'] : C['5'], l.w === 'narr' ? 'italic 18px monospace' : 'bold 18px monospace'));
  }

  function drawChoice(ctx, W, H, bar, band) {
    const R = S.R, c = R.choice, n = c.opts.length;
    const w = Math.min(520, W * 0.42), x = W - w - 28, bh = 44, gap = 8;
    const total = n + 1, hgt = total * (bh + gap);
    let y = bar + band - hgt - 8;
    const prompt = c.def.prompt || tf('cine.choose', { n: n + 1 });
    text(ctx, prompt, x, y - 44, C['5'], FONT_B);
    // timer bar
    const left = c.total == null ? 1 : clamp(1 - c.t / c.total, 0, 1);
    ctx.fillStyle = 'rgba(10,10,16,0.7)'; ctx.fillRect(x, y - 20, w, 8);
    ctx.fillStyle = c.total == null ? C['3'] : left < 0.3 ? C.c : C.a; ctx.fillRect(x, y - 20, w * left, 8);
    const locked = c.t < c.lock;
    const plates = [...c.opts.map((op) => ({ id: op.id, l: op.l, tone: op.tone })), { id: 'silence', l: c.def.silence.l, tone: 'silent' }];
    plates.forEach((op, k) => {
      const flash = op.id === 'silence' && c.expired && Math.floor(c.flash * 12) % 2 === 0;
      const b = { id: op.id, x, y, w, h: bh, label: op.l, key: String(k + 1), font: FONT, disabled: locked, selected: flash };
      ctx.save(); if (op.id === 'silence' && !c.expired) ctx.globalAlpha = 0.8;
      button(ctx, b, S.hover?.id === b.id);
      ctx.restore();
      const tn = TONES[op.tone];
      if (tn) { ctx.fillStyle = TONE_COLORS[op.tone] || C['4']; ctx.fillRect(x + w - 6, y + 4, 3, bh - 8); text(ctx, tn.label, x + w - 14, y + bh - 16, TONE_COLORS[op.tone] || C['4'], '11px monospace', 'right'); }
      S.buttons.push(b);
      y += bh + gap;
    });
  }

  function qteAnchor(W, H, bar, band) {
    const p = S.mode === '3d' ? S.view?.screen?.('hero', W, H) : null;
    const y0 = bar + 90, y1 = bar + band - 170;
    if (p) return { x: clamp(p.x + 120, 140, W - 140), y: clamp(p.y, y0, y1) };
    return { x: W / 2, y: bar + band * 0.42 };
  }

  function drawQte(ctx, W, H, bar, band) {
    const q = S.R.qte, { x, y } = qteAnchor(W, H, bar, band), r = 46;
    const left = clamp(1 - q.t / q.sec, 0, 1);
    text(ctx, q.def.label || '', x, y - r - 40, C['5'], FONT_L, 'center');
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,10,16,0.7)'; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = q.res === 'fail' ? C['3'] : C.h; ctx.beginPath(); ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
    ctx.fillStyle = q.res === 'ok' ? C.h : q.res === 'fail' ? C['2'] : C['1'];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C['5']; ctx.lineWidth = 2; ctx.stroke();
    let key = q.keys[0], sub = '';
    if (q.kind === 'seq') key = q.keys[Math.min(q.idx, q.keys.length - 1)];
    if (q.kind === 'hold') {
      ctx.strokeStyle = C.a; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(q.prog / q.need, 0, 1)); ctx.stroke();
      sub = tf('cine.qte.hold', { key: q.keys[0] });
    } else if (q.kind === 'mash') sub = tf('cine.qte.mash', { key: q.keys[0], n: q.n, need: q.need });
    else if (q.kind === 'tap') sub = tf('cine.qte.tap', { key: q.keys[0] });
    else sub = t('cine.qte.seq');
    text(ctx, key, x, y - 18, q.res === 'ok' ? C['0'] : C['5'], 'bold 34px monospace', 'center');
    if (q.res) text(ctx, t(q.res === 'ok' ? 'cine.qte.ok' : 'cine.qte.fail'), x, y + r + 16, q.res === 'ok' ? C.h : C['4'], FONT_B, 'center');
    else text(ctx, sub, x, y + r + 16, C['4'], FONT_B, 'center');
    if (q.kind === 'seq') {
      const sw = 34, sx = x - (q.keys.length * sw) / 2;
      q.keys.forEach((k2, i) => {
        panel(ctx, sx + i * sw + 2, y + r + 40, sw - 4, 30, i < q.idx ? C.i : i === q.idx ? C['3'] : C['1'], i === q.idx ? C.h : C['3']);
        text(ctx, k2, sx + i * sw + sw / 2, y + r + 46, i < q.idx ? C.h : C['5'], FONT_B, 'center');
      });
    }
    if (S.flash?.ok) { ctx.globalAlpha = 1 - S.flash.t / 0.6; ctx.strokeStyle = C.h; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 10 + S.flash.t * 120, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  function drawCheck(ctx, W, bar) {
    const c = S.R.check;
    const s = `${tf('cine.check', { skill: c.skill, total: c.total, dc: c.dc })} — ${t(c.ok ? 'cine.checkOk' : 'cine.checkFail')}`;
    ctx.font = FONT_B;
    const w = ctx.measureText(s).width + 40, x = (W - w) / 2, y = bar + 24;
    panel(ctx, x, y, w, 36, C['1'], c.ok ? C.j : C.c);
    text(ctx, s, W / 2, y + 10, c.ok ? C.j : C['4'], FONT_B, 'center');
  }

  function drawRems(ctx, bar) {
    let y = bar + 20;
    for (const r of S.rems) {
      const a = clamp(Math.min(r.t / 0.2, ((CINE_RULES.remember.sec || CV.toastSec) - r.t) / 0.4), 0, 1);
      ctx.globalAlpha = a;
      ctx.font = FONT_B;
      const w = ctx.measureText(r.text).width + 44;
      panel(ctx, 20, y, w, 34, 'rgba(20,20,28,0.85)', C.a);
      ctx.fillStyle = C.a; ctx.beginPath(); ctx.moveTo(34, y + 17); ctx.lineTo(40, y + 11); ctx.lineTo(46, y + 17); ctx.lineTo(40, y + 23); ctx.fill();
      text(ctx, r.text, 54, y + 9, C['5'], FONT_B);
      ctx.globalAlpha = 1;
      y += 42;
    }
  }

  function drawMenu(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(10,10,16,0.7)'; ctx.fillRect(0, 0, W, H);
    S.buttons = menuButtons(game);
    const b0 = S.buttons[0];
    text(ctx, S.menu === 'confirm' ? t('cine.skip') : t('cine.pause'), W / 2, b0.y - 70, C['5'], FONT_L, 'center');
    if (S.menu === 'confirm') text(ctx, t('cine.skipConfirm'), W / 2, b0.y - 34, C['4'], FONT, 'center');
    for (const b of S.buttons) button(ctx, b, S.hover?.id === b.id);
  }

  return scene;
}
