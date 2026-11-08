// Romance scenes (docs/specs/romance.md): dates, crisis, jealousy, farewell, breakup — a full-screen dialogue with
// choices over ROMANCE nodes (data/romance.js: { w, t } lines, { q: [opt] } choices with Δ bond, check, flag).
// Logic — world/romance.js. Music: 'romance' / 'tragic' while the scene runs, the previous track afterwards.
//   createRomanceScene({ title, nodes, npc, music, fade, fadeText, onDone(game, res) }) → scene (id 'romance');
//     res = { sum, flags, picks } (Δ bond of the choices, rf flags, chosen options).
//   playRomanceScene(game, spec, back) — switch, then back (resume) and the queued romance events.
//   openPrivateTalk(game, { where: 'camp'|'base', back, done }) — «Поговорить наедине»: flirt, date, crisis, breakup.
//   romanceInterrupt(game, scene) — main.js setScene: queued farewell / breakup / jealousy on a calm scene.
import { t } from '../data/text/index.js';
import { ROMANCE, ROMANCE_RULES as RR } from '../data/romance.js';
import { NPCS } from '../data/npcs.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, wrap, panel, button, hitButton, clear } from '../ui/draw.js';
import { drawSpeaker } from '../ui/portrait-of.js';
import { playTrack, getMusicState } from '../audio/music.js';
import { play } from '../audio/sfx.js';
import { members } from '../world/state.js';
import { checkInfo, rollCheck, skillName } from '../world/checks.js';
import { personalDone } from '../world/companions.js';
import { saveGame } from '../save.js';
import {
  genderize, heroGender, romanceEntry, peekRomance, talkCandidates, canTalk, flirt, flirtDc, flirtAdv, dateStatus, crisisStatus,
  finishDate, finishCrisis, breakUp, partnerOf, conflictPending, resolveConflict, takeRomanceEvent, hasRomanceEvent, mourning, stageFor,
} from '../world/romance.js';

const CPS = 70;
const tf = (k, v = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const nameOf = (id) => ROMANCE[id]?.name || NPCS[id]?.name || id;
const toastAll = (g, list) => { for (const x of list || []) g.toast(x.text, x.color); };

/** The hero's check with mourning (−1 to Charisma checks). → { ok, total, dc }. */
export function heroRoll(game, skill, dc, adv = false) {
  const m = members(game.save, game.data)[0];
  const info = checkInfo(m, skill, adv ? t('rom.bond') : undefined);
  const r = rollCheck(m, info, dc);
  const pen = mourning(game.save);
  const total = r.total + pen;
  const ok = pen ? r.natural !== 1 && (r.natural === 20 || total >= dc) : r.success;
  return { ok, total, dc, skill };
}

export function createRomanceScene({ title = '', nodes = [], npc = null, music = null, fade = false, fadeText = '', onDone }) {
  const S = { i: 0, shown: 0, time: 0, extra: [], choice: null, buttons: [], hover: null, fadeT: -1, done: false, sum: 0, flags: [], picks: [], last: npc };
  let g8 = 'x';
  const G = (s) => genderize(s, g8);
  // current item: an inserted reply line first, then nodes[i]
  const cur = () => S.extra[0] || nodes[S.i] || null;
  const finish = (game) => {
    if (S.done) return;
    if (fade && S.fadeT < 0) { S.fadeT = 0; return; }
    S.done = true;
    onDone?.(game, { sum: S.sum, flags: S.flags, picks: S.picks });
  };
  const advance = (game) => {
    if (S.extra.length) S.extra.shift(); else S.i++;
    S.shown = 0;
    if (!cur()) finish(game);
  };
  const pick = (game, o) => {
    play('uiClick');
    let d = o.d ?? 0, r = o.r, note = null;
    if (o.chk) {
      const roll = heroRoll(game, o.chk.skill, o.chk.dc);
      note = tf('rom.chkNote', { skill: skillName(o.chk.skill), total: roll.total, dc: o.chk.dc, res: roll.ok ? t('rom.chkOk') : t('rom.chkFail') });
      if (!roll.ok) { d = o.chk.fail?.d ?? 0; r = o.chk.fail?.r || null; }
    }
    S.sum += d; S.picks.push({ ...o, d });
    if (o.rf) S.flags.push(o.rf);
    S.extra.push({ w: 'hero', t: o.t, note });
    if (r) S.extra.push({ w: r.w, t: r.t });
    S.i++; S.shown = 0;
    if (!cur()) finish(game);
  };
  const scene = {
    id: 'romance', S,
    enter(game) {
      g8 = heroGender(game.save);
      S.i = 0; S.extra = []; S.shown = 0; S.done = false; S.fadeT = -1;
      if (!nodes.length) nodes = [{ w: 'narr', t: '…' }];
      if (music) playTrack(music);
    },
    update(game, dt) {
      S.time += dt;
      if (S.done) return;
      const inp = game.input;
      if (S.fadeT >= 0) { S.fadeT += dt; if (S.fadeT > 2.2 || ((inp.mouse.clicked || inp.wasPressed('Enter')) && S.fadeT > 0.6)) finish(game); return; }
      const c = cur();
      if (!c) { finish(game); return; }
      if (c.q) {
        S.hover = hitButton(S.buttons, inp.mouse);
        for (let k = 0; k < c.q.length; k++) if (inp.wasPressed(`Digit${k + 1}`)) return pick(game, c.q[k]);
        if (inp.mouse.clicked && S.hover) return pick(game, c.q[S.hover.idx]);
        return;
      }
      const s = G(c.t);
      S.shown = Math.min(s.length, S.shown + CPS * dt);
      if (inp.mouse.clicked || inp.wasPressed('Space') || inp.wasPressed('Enter')) {
        if (S.shown < s.length) { S.shown = s.length; return; }
        play('uiClick');
        advance(game);
      }
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      const tragic = music === RR.music.farewell;
      // warm / cold haze
      const grd = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, Math.max(W, H) * 0.6);
      grd.addColorStop(0, tragic ? 'rgba(60,70,110,0.35)' : 'rgba(150,70,90,0.30)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      if (title) text(ctx, title, W / 2, 40, tragic ? C['4'] : C.f, FONT_L, 'center');
      const c = cur();
      if (c && !c.q && c.w && c.w !== 'hero' && c.w !== 'narr' && NPCS[c.w]) S.last = c.w;
      const floor = Math.floor(H / 2) + 40, sc = 4, ps = 48 * sc;
      const heroTalk = c?.w === 'hero' || !!c?.q;
      ctx.fillStyle = C['1']; ctx.fillRect(0, floor, W, 2);
      ctx.globalAlpha = heroTalk ? 1 : 0.55;
      drawSpeaker(ctx, 'hero', Math.floor(W / 2) - 300 - ps / 2 + 60, floor - ps, sc, { native: true }, { hero: game.save?.hero });
      ctx.globalAlpha = heroTalk || c?.w === 'narr' ? 0.55 : 1;
      if (S.last) drawSpeaker(ctx, S.last, Math.floor(W / 2) + 120, floor - ps, sc, { native: true, flip: true, emotion: tragic ? 'sad' : 'happy' }, {});
      ctx.globalAlpha = 1;
      // window
      const w = Math.min(1100, W - 64), x = Math.floor((W - w) / 2);
      S.buttons = [];
      if (c?.q) {
        const h = 40 + c.q.length * 52, y = H - h - 40;
        panel(ctx, x, y, w, h, C['1'], C.f);
        text(ctx, t('rom.choose'), x + 24, y + 12, C['4'], FONT);
        c.q.forEach((o, k) => {
          const b = { idx: k, x: x + 16, y: y + 36 + k * 52, w: w - 32, h: 44, label: G(o.t), key: String(k + 1), font: FONT_B,
            sub: o.chk ? tf('rom.flirtSub', { skill: skillName(o.chk.skill), dc: o.chk.dc }) : undefined };
          S.buttons.push(b);
          button(ctx, b, S.hover === b);
        });
      } else if (c) {
        const h = 176, y = H - h - 40;
        panel(ctx, x, y, w, h, C['1'], C['3']);
        const nm = c.w === 'hero' ? game.save?.hero?.name : c.w === 'narr' ? '' : nameOf(c.w);
        if (nm) {
          ctx.font = FONT_B;
          const nw = ctx.measureText(nm).width + 24;
          panel(ctx, x + 16, y - 16, nw, 32, C['2'], c.w === 'hero' ? C.h : C.f);
          text(ctx, nm, x + 28, y - 7, c.w === 'hero' ? C.h : C.f, FONT_B);
        }
        let yy = y + 26;
        if (c.note) { text(ctx, c.note, x + 24, yy, C.a, '12px monospace'); yy += 18; }
        const s = G(c.t);
        let left = Math.floor(S.shown);
        for (const [k, l] of wrap(ctx, s, w - 48, FONT).entries()) {
          if (left <= 0) break;
          text(ctx, l.slice(0, left), x + 24, yy + k * LINE * 1.2, c.w === 'narr' ? C['4'] : C['5'], c.w === 'narr' ? 'italic 16px monospace' : FONT);
          left -= l.length + 1;
        }
        if (S.shown >= s.length && Math.floor(S.time * 2) % 2 === 0) text(ctx, '▼', x + w / 2, y + h - 28, C.f, FONT, 'center');
        text(ctx, t('dlg.next'), x + 24, y + h - 28, C['3']);
      }
      if (S.fadeT >= 0) {
        ctx.fillStyle = `rgba(10,10,16,${Math.min(1, S.fadeT / 0.9)})`;
        ctx.fillRect(0, 0, W, H);
        if (fadeText && S.fadeT > 0.9) { ctx.globalAlpha = Math.min(1, (S.fadeT - 0.9) / 0.5); text(ctx, fadeText, W / 2, H / 2 - 12, C['4'], FONT_L, 'center'); ctx.globalAlpha = 1; }
      }
    },
  };
  return scene;
}

/** Switch to a romance scene; afterwards restore the track, run spec.after(game, res), then queued events, then back. */
export function playRomanceScene(game, spec, back = game.scene) {
  const prev = getMusicState().track;
  const sc = createRomanceScene({ ...spec, onDone: (g, res) => {
    const out = spec.onDone?.(g, res);
    toastAll(g, out);
    if (g.save) saveGame(g.save);
    if (hasRomanceEvent(g.save)) return runRomanceEvent(g, takeRomanceEvent(g.save), back, prev);
    if (prev && spec.music) playTrack(prev);
    if (back) g.resume(back);
    spec.after?.(g, res);
  } });
  game.setScene(sc);
}

/** Farewell / breakup scene of a queued event. */
function runRomanceEvent(game, ev, back, prevTrack = getMusicState().track) {
  const R = ROMANCE[ev.npc];
  if (!R) { if (back) game.resume(back); return; }
  const farewell = ev.kind === 'farewell';
  const spec = { title: nameOf(ev.npc), npc: ev.npc, nodes: (farewell ? R.farewell : R.breakup) || [], music: farewell ? RR.music.farewell : RR.music.breakup, fade: farewell };
  const sc = createRomanceScene({ ...spec, onDone: (g) => {
    if (g.save) saveGame(g.save);
    if (hasRomanceEvent(g.save)) return runRomanceEvent(g, takeRomanceEvent(g.save), back, prevTrack);
    if (prevTrack) playTrack(prevTrack);
    if (back) g.resume(back);
  } });
  game.setScene(sc);
}

const CALM = new Set(['location', 'worldmap', 'roam', 'base']);
/** main.js setScene hook: on a calm scene with no modal — queued farewell / breakup, else a pending jealousy scene. */
export function romanceInterrupt(game, scene) {
  const sv = game.save;
  if (!sv?.romance || !CALM.has(scene?.id) || game.modals.length) return;
  if (hasRomanceEvent(sv)) return runRomanceEvent(game, takeRomanceEvent(sv), scene);
  const c = conflictPending(sv);
  if (c) playRomanceScene(game, { title: `${t('rom.conflict')}: ${c.scene.title}`, npc: c.a, nodes: c.scene.nodes, music: RR.music.date,
    onDone: (g, res) => resolveConflict(g.save, c, res) }, scene);
}

// ----------------------------------------------------------------------------- «Поговорить наедине»
export function openPrivateTalk(game, o = {}) {
  const where = o.where || 'camp';
  const list = talkCandidates(game.save, where);
  if (!list.length) { game.toast(t('rom.nobody'), '4'); return; }
  if (list.length === 1) return openTalkWith(game, list[0], o);
  game.openModal({ title: t('rom.talk'), lines: [{ text: t('rom.talkWho'), color: '4' }], width: 640,
    options: [...list.map((id) => {
      const e = peekRomance(game.save, id);
      return { label: `${partnerOf(game.save) === id ? '♥ ' : ''}${nameOf(id)}`, sub: e ? `${t('rom.bond')} ${e.bond} · ${stageFor(e).name}` : stageFor({ bond: 0, dates: [] }).name,
        run: (g) => openTalkWith(g, id, o) };
    }), { label: t('rom.leave'), run: (g) => o.done?.(g) }], onCancel: (g) => o.done?.(g) });
}

export function openTalkWith(game, id, o = {}) {
  const sv = game.save, R = ROMANCE[id], where = o.where || 'camp';
  const e = romanceEntry(sv, id);
  const back = o.back || game.scene;
  const again = (g) => openTalkWith(g, id, o);
  const can = canTalk(sv, id);
  const lines = [{ text: `${partnerOf(sv) === id ? '♥ ' : ''}${t('rom.bond')}: ${e.bond}/${RR.max} · ${t('rom.stage')}: ${stageFor(e).name}`, color: 'f' },
    { text: R.blurb, color: '4' }, { text: tf('rom.topics', { list: (R.taste?.flirtTopics || []).join(' · ') }), color: '4' }];
  if (mourning(sv)) lines.push({ text: t('rom.mourning'), color: 'c' });
  const why = can.why === 'today' ? t('rom.talkDone') : can.why === 'loyalty' ? tf('rom.talkLoyalty', { n: RR.gates.talk.loyaltyMin }) : null;
  const opts = (R.flirt || []).map((f, idx) => ({
    label: genderize(f.t, heroGender(sv)), sub: `${tf('rom.flirtSub', { skill: skillName(f.skill), dc: flirtDc(sv, id) })}${flirtAdv(id, f) ? ' · ▲' : ''}`,
    disabled: !can.ok, reason: why,
    run: (g) => {
      const r = flirt(g.save, id, idx, (skill, dc, adv) => heroRoll(g, skill, dc, adv).ok);
      if (!r) return;
      g.toast(r.ok ? t('rom.flirtOk') : t('rom.flirtFail'), r.ok ? 'f' : '4');
      playRomanceScene(g, { title: tf('rom.talkTitle', { name: nameOf(id) }), npc: id, nodes: [{ w: 'hero', t: f.t }, r.reply],
        onDone: () => r.toasts, after: (g2) => again(g2) }, back);
    },
  }));
  const ds = dateStatus(sv, id, where);
  if (ds.date && !['closed', 'done', 'taken'].includes(ds.why)) {
    const reason = ds.why === 'bond' ? tf('rom.why.bond', { n: ds.gate.bond }) : ds.why === 'loyalty' ? tf('rom.why.loyalty', { n: ds.gate.loyaltyMin })
      : ds.why === 'days' ? tf('rom.why.days', { n: ds.wait }) : ds.why === 'place' ? tf('rom.why.place', { place: t(`rom.place.${ds.date.where}`) })
        : ds.why ? t(`rom.why.${ds.why}`).replace('{name}', nameOf(id)) : null;
    opts.push({ label: tf('rom.date', { name: ds.date.name }), sub: tf('rom.dateN', { n: ds.n }), disabled: !ds.ok, reason,
      run: (g) => playRomanceScene(g, { title: ds.date.name, npc: id, nodes: ds.date.nodes, music: RR.music.date, fade: true, fadeText: t('rom.morning'),
        onDone: (g2, res) => finishDate(g2.save, id, res), after: (g2) => o.done?.(g2) }, back) });
  }
  if (crisisStatus(sv, id, personalDone(sv, id)).ok) {
    opts.push({ label: t('rom.crisis'), sub: t('rom.crisisSub'),
      run: (g) => playRomanceScene(g, { title: R.crisis.trigger ? t('rom.crisis') : '', npc: id, nodes: R.crisis.nodes, music: RR.music.date,
        onDone: (g2, res) => finishCrisis(g2.save, id, res), after: (g2) => o.done?.(g2) }, back) });
  }
  if (partnerOf(sv) === id || (e.dates.length && !e.broken && !e.lost)) {
    opts.push({ label: t('rom.breakup'), run: (g) => g.openModal({ title: tf('rom.breakupSure', { name: nameOf(id) }), lines: [{ text: t('rom.breakupWarn'), color: 'c' }],
      options: [{ label: t('rom.breakupYes'), run: (g2) => {
        toastAll(g2, breakUp(g2.save, id, 'talk'));
        saveGame(g2.save);
        const ev = takeRomanceEvent(g2.save);
        if (ev) runRomanceEvent(g2, ev, back);
        o.done?.(g2);
      } }, { label: t('rom.no'), run: (g2) => again(g2) }] }) });
  }
  opts.push({ label: t('rom.leave'), run: (g) => o.done?.(g) });
  game.openModal({ title: tf('rom.talkTitle', { name: nameOf(id) }), lines, options: opts, width: 760, onCancel: (g) => o.done?.(g) });
}
