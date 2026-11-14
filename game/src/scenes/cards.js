// Card match «Хлам и Кринж» (docs/specs/cards-casino.md §7): the table 1280×720 (centred on bigger screens), the player at the
// bottom (side 0), the rival at the top (side 1, AI rules/cards.js aiAction with 0.6–0.9 s pauses). Click or drag: a hand card →
// slot / board, an own creature → target; «choose» targets are picked by click (valid ones glow), RMB / Esc — cancel.
// Animations (≤ 0.5 s): flight into the slot, lunge and back, red / green numbers, pixel death, Shield bubble, Cringe rings,
// «Ваш ход» banner. Music: town (cyberspace for the AI Party / Tekhonki decks).
// startCardMatch(game, { rival, stake?, title?, back?, seed?, onEnd(game, won) → [{text, color}] })
//
// Layout deviation from the spec table (it overlaps the hand with the player hero): heroes and gadgets sit in the left
// column (rival 20,20 / gadgets 20,140; player gadgets 20,470 / hero 20,590, hero power 220,625), the hand fan is centred.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { C, FONT, FONT_B, FONT_L, FONT_XL, text, fit, panel, button, hitButton, clear, wrap } from '../ui/draw.js';
import { hotspot } from '../ui/tooltip.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar } from '../ui/scroll.js';
import { drawCard, drawBack, cardTip, SET_COLOR } from '../ui/card-view.js';
import { play } from '../audio/sfx.js';
import { playTrack, getMusicState } from '../audio/music.js';
import { createMatch, act, aiAction, canPlay, canAttack, canPower, attackTargets, chooseList, chooseCands, atkOf, costOf, cringeOn, sameRef } from '../rules/cards.js';
import { CARD_DATA, activeDeck, CARDS, CARD_HEROES, CARD_RULES } from '../world/cards.js';

const BW = 1280, BH = 720;
const SLOT = (s, i) => ({ x: 215 + i * 170, y: s === 0 ? 350 : 150, w: 150, h: 190 });
const HERO = (s) => (s === 0 ? { x: 20, y: 590, w: 190, h: 110 } : { x: 20, y: 20, w: 190, h: 110 });
const GADGET = (s, i) => ({ x: 20 + i * 96, y: s === 0 ? 470 : 140, w: 90, h: 110 });
const POWER = { x: 220, y: 625, w: 100, h: 60 };
const END = { x: 1100, y: 330, w: 150, h: 60 };
const LOG = { x: 1060, y: 20, w: 210, h: 290 };
const HAND_Y = 560, HW = 110, HH = 160;
const CYBER_SETS = new Set(['ai', 'tkh']);

export function startCardMatch(game, o) {
  const sc = createCardScene(game, o);
  game.setScene(sc);
  return sc;
}

export function createCardScene(game, o) {
  const sv = game.save;
  const deck = activeDeck(sv);
  const rival = o.rival;
  const rname = NPCS[rival.npc]?.name || rival.name || '?';
  const seed = o.seed ?? ((Math.random() * 2 ** 31) | 0);
  const M = createMatch(CARD_DATA, { seed, sides: [
    { name: sv.hero.name, hero: deck.hero, deck: deck.ids },
    { name: rname, hero: rival.hero, deck: rival.deck, ai: rival.ai, tier: rival.tier }] });
  const back = o.back || game.scene;
  const prevTrack = getMusicState().track;
  const S = { M, rname, ox: 0, oy: 0, evi: 0, time: 0, busy: 0, aiAt: 1.2, timer: CARD_RULES.turnSeconds, sel: null, pend: null, drag: null,
    nums: [], parts: [], rings: [], anim: {}, flash: {}, banner: null, log: [], ls: createScroll(), result: null, buttons: [], hover: null };
  let self;

  const L = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const who = (s) => (s === 0 ? t('cards.you') : rname);
  const cname = (id) => CARDS[id]?.name || id;
  const log = (s, color = '5') => { S.log.push({ text: s, color }); if (S.log.length > 120) S.log.shift(); };
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const refRect = (ref) => (ref.hero ? HERO(ref.s) : ref.gadget !== undefined ? GADGET(ref.s, ref.gadget) : SLOT(ref.s, ref.slot));
  const refKey = (ref) => (ref.hero ? `h${ref.s}` : `${ref.s}:${ref.slot}`);
  const uidAt = (ref) => (ref.hero ? `h${ref.s}` : M.sides[ref.s].field[ref.slot]?.uid);

  // ---------------------------------------------------------------- events → log / animations / sounds
  function absorb() {
    let k = 0;
    for (; S.evi < M.ev.length; S.evi++) onEvent(M.ev[S.evi], S.time + 0.06 * k++);
    S.busy = Math.max(S.busy, S.time + Math.min(0.5, 0.06 * k) + 0.35);
  }
  function num(ref, n, color, at) { const c = center(refRect(ref)); S.nums.push({ x: c.x + (Math.random() * 20 - 10), y: c.y - 10, s: n, color, at }); }
  function onEvent(e, at) {
    switch (e.t) {
      case 'turn':
        S.banner = { text: e.s === 0 ? t('cards.yourTurn') : L('cards.theirTurn', { name: rname }), at, dur: 0.8 };
        S.timer = CARD_RULES.turnSeconds; S.sel = null; S.pend = null;
        if (e.s === 1) S.aiAt = at + 1.0;
        play(e.s === 0 ? 'turnStart' : 'enemyTurn');
        log(L('cards.log.turn', { who: who(e.s), n: Math.ceil(e.turn / 2) }), 'a');
        break;
      case 'play': {
        log(L('cards.log.play', { who: who(e.s), card: cname(e.id) }), e.s === 0 ? 'h' : 'c');
        if (e.type === 'creature') {
          const u = M.sides[e.s].field[e.slot];
          const from = e.s === 0 ? { x: 640 - HW / 2, y: HAND_Y } : { x: 640 - HW / 2, y: -150 };
          if (u) S.anim[u.uid] = { kind: 'enter', at, dur: 0.35, from };
          play('summon');
        } else { S.banner = { text: cname(e.id), at, dur: 0.6, small: true, color: SET_COLOR[CARDS[e.id]?.set] }; play(e.type === 'spell' ? 'buff' : 'uiClick'); }
        break;
      }
      case 'summon': { const u = M.sides[e.s].field[e.slot]; if (u && !S.anim[u.uid]) S.anim[u.uid] = { kind: 'enter', at, dur: 0.3, from: { x: SLOT(e.s, e.slot).x, y: SLOT(e.s, e.slot).y - 40 } }; break; }
      case 'attack': {
        const u = M.sides[e.from.s].field[e.from.slot];
        const to = center(refRect(e.target)), fr = center(SLOT(e.from.s, e.from.slot));
        S.anim[u ? u.uid : `x${at}`] = { kind: 'lunge', at, dur: 0.4, dx: (to.x - fr.x) * 0.6, dy: (to.y - fr.y) * 0.6 };
        log(L('cards.log.attack', { a: cname(e.id), b: e.target.hero ? who(e.target.s) : cname(e.tid) }));
        setTimeout(() => play('hit'), 150);
        break;
      }
      case 'dmg':
        if (e.n > 0) { num(e.ref, `−${e.n}`, 'c', at + 0.15); S.flash[uidAt(e.ref) ?? refKey(e.ref)] = { at: at + 0.15, color: 'c' }; }
        if (e.armor) num(e.ref, `⛨${e.armor}`, '4', at + 0.15);
        if (e.ref.hero && e.n > 0) log(L('cards.log.heroDmg', { who: who(e.ref.s), n: e.n }), 'c');
        break;
      case 'heal': num(e.ref, `+${e.n}`, 'j', at); S.flash[uidAt(e.ref) ?? refKey(e.ref)] = { at, color: 'j' }; play('heal'); break;
      case 'shieldPop': { const c = center(refRect(e.ref)); S.rings.push({ x: c.x, y: c.y, at: at + 0.15, color: 'f', dur: 0.4, r0: 60 }); play('shieldBlock'); break; }
      case 'death': {
        const r = SLOT(e.s, e.slot);
        const col = C[SET_COLOR[CARDS[e.id]?.set] || '4'];
        for (let i = 0; i < 46; i++) S.parts.push({ x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120 - 20, at: at + 0.2, life: 0.5, color: i % 3 ? col : C['5'] });
        log(L('cards.log.death', { card: cname(e.id) }), '4');
        setTimeout(() => play('death'), 200);
        break;
      }
      case 'destroy': log(L('cards.log.destroy', { card: cname(e.id) }), 'n'); break;
      case 'fatigue': log(L('cards.log.fatigue', { who: who(e.s), n: e.n }), 'c'); break;
      case 'overdraw': log(L('cards.log.overdraw', { who: who(e.s), card: cname(e.id) }), '4'); break;
      case 'discard': log(L('cards.log.discard', { who: who(e.s), card: e.s === 0 ? cname(e.id) : t('cards.aCard') }), '4'); break;
      case 'steal': log(L('cards.log.steal', { who: who(e.s), card: e.s === 0 ? cname(e.id) : t('cards.aCard') }), 'n'); break;
      case 'roll': log(L('cards.log.roll', { n: e.n, die: e.die }), 'a'); S.banner = { text: `d${e.die}: ${e.n}`, at, dur: 0.7, small: true, color: 'a' }; break;
      case 'scry': if (e.s === 0) log(L(e.kept ? 'cards.log.scryKeep' : 'cards.log.scryDrop', { card: cname(e.id) }), '4'); break;
      case 'power': log(L('cards.log.power', { who: who(e.s), name: CARD_HEROES[e.hero]?.power.name }), e.s === 0 ? 'h' : 'c'); play('buff'); break;
      case 'gadgetGone': log(L('cards.log.gadgetGone', { card: cname(e.id) }), '4'); break;
      case 'status': if (e.id === 'cringed' || e.id === 'stun') play('debuff'); break;
      case 'end': finish(e.winner === 0, at); break;
      default: break;
    }
  }

  function finish(won, at) {
    if (S.result) return;
    S.banner = null;
    log(won ? t('cards.win') : t('cards.lose'), won ? 'j' : 'c');
    play(won ? 'victory' : 'defeat');
    S.result = { won, lines: o.onEnd?.(game, won) || [] };
    layout();
  }

  function doAct(a) {
    const ok = act(M, a);
    S.sel = null; S.pend = null;
    absorb();
    return ok;
  }

  // ---------------------------------------------------------------- player input helpers
  function handRects() {
    const n = M.sides[0].hand.length;
    const step = n > 1 ? Math.min(HW + 6, 640 / (n - 1)) : 0;
    const x0 = 640 - ((n - 1) * step + HW) / 2;
    return M.sides[0].hand.map((h, i) => ({ x: x0 + i * step, y: HAND_Y, w: HW, h: HH, i }));
  }
  const inR = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
  function handAt(p) { const rs = handRects(); for (let k = rs.length - 1; k >= 0; k--) if (inR(rs[k], p)) return rs[k].i; return -1; }
  function refAt(p) {
    for (const s of [0, 1]) {
      for (let i = 0; i < 5; i++) if (inR(SLOT(s, i), p)) return M.sides[s].field[i] ? { s, slot: i } : { s, slot: i, empty: true };
      if (inR(HERO(s), p)) return { s, hero: true };
      for (let i = 0; i < M.sides[s].gadgets.length; i++) if (inR(GADGET(s, i), p)) return { s, gadget: i };
    }
    return null;
  }

  /** Valid refs now (for highlights): targeting candidates, free slots of a selected creature, attack targets. */
  function validRefs() {
    if (S.pend) return S.pend.cands || [];
    const sel = S.sel || (S.drag?.moved ? S.drag : null);
    if (!sel) return [];
    if (sel.kind === 'hand') {
      const c = CARDS[M.sides[0].hand[sel.idx]?.id];
      if (c?.type === 'creature') return M.sides[0].field.map((u, i) => (u ? null : { s: 0, slot: i, empty: true })).filter(Boolean);
      return [];
    }
    if (sel.kind === 'unit') return attackTargets(M, 0, sel.slot);
    return [];
  }

  function beginPlay(idx, slot) {
    if (!canPlay(M, 0, idx).ok) { why(idx); return; }
    const c = CARDS[M.sides[0].hand[idx].id];
    S.pend = { kind: 'play', idx, slot, chooses: chooseList(c.fx), targets: [], card: c };
    S.sel = null;
    advance();
  }
  function beginPower() {
    if (!canPower(M, 0)) { game.toast(t('cards.powerNo'), 'c'); return; }
    S.pend = { kind: 'power', chooses: chooseList(CARD_HEROES[M.sides[0].hero].power.fx), targets: [] };
    S.sel = null;
    advance();
  }
  function advance() {
    const P = S.pend;
    while (P.targets.length < P.chooses.length) {
      const ch = P.chooses[P.targets.length];
      const cands = chooseCands(M, 0, ch.to, ch.where);
      if (!cands.length) { P.targets.push(null); continue; }
      P.cands = cands;
      P.prompt = t(`cards.to.${ch.to}`);
      return;
    }
    if (P.kind === 'play') doAct({ type: 'play', idx: P.idx, slot: P.slot, targets: P.targets });
    else doAct({ type: 'power', targets: P.targets });
  }
  function why(idx) {
    const r = canPlay(M, 0, idx);
    if (!r.ok && r.why !== 'turn') game.toast(t(`cards.why.${r.why}`), 'c');
  }

  function clickRef(ref) {
    if (S.pend) {
      if (ref && S.pend.cands.some((x) => sameRef(x, ref))) { S.pend.targets.push(ref); S.pend.cands = null; advance(); play('uiClick'); }
      return;
    }
    if (S.sel?.kind === 'hand') {
      if (ref && ref.s === 0 && ref.empty) return beginPlay(S.sel.idx, ref.slot);
      S.sel = null;
    }
    if (S.sel?.kind === 'unit') {
      if (ref && attackTargets(M, 0, S.sel.slot).some((x) => sameRef(x, ref))) return doAct({ type: 'attack', from: S.sel.slot, target: ref });
      S.sel = null;
    }
    if (ref && ref.s === 0 && ref.slot !== undefined && !ref.empty) {
      if (canAttack(M, 0, ref.slot)) { S.sel = { kind: 'unit', slot: ref.slot }; play('uiClick'); }
      else game.toast(t('cards.notReady'), '4');
    }
  }

  function surrender(g) {
    g.openModal({ title: t('cards.surrenderQ'), lines: [t('cards.surrenderHint')], options: [
      { label: t('cards.surrender'), run: () => { M.sides[0].hp = 0; M.winner = 1; M.ev.push({ t: 'end', winner: 1 }); absorb(); } },
      { label: t('cards.keepPlaying'), run: () => {} }] });
  }

  function leave(g) {
    if (prevTrack) playTrack(prevTrack);
    g.resume(back);
  }

  // ---------------------------------------------------------------- layout / buttons
  function layout() {
    S.ox = Math.max(0, Math.floor((game.width - BW) / 2)); S.oy = Math.max(0, Math.floor((game.height - BH) / 2));
    const b = [];
    const my = M.cur === 0 && M.winner === null;
    b.push({ id: 'power', ...POWER, label: t('cards.powerBtn'), sub: `⚡${CARD_RULES.heroPowerCost}`, disabled: !my || !canPower(M, 0), font: FONT_B,
      tip: () => { const H = CARD_HEROES[M.sides[0].hero]; return { title: `${H.power.name} (⚡${CARD_RULES.heroPowerCost})`, lines: [H.power.text, { text: t('cards.powerOnce'), color: '4' }] }; } });
    b.push({ id: 'end', ...END, label: t('cards.endTurn'), key: 'Space', disabled: !my });
    if (S.result) b.push({ id: 'leave', x: 540, y: 420, w: 200, h: 48, label: t('cards.leave'), key: 'Enter' });
    S.buttons = b.map((x) => ({ ...x, x: x.x + S.ox, y: x.y + S.oy }));
  }

  // ---------------------------------------------------------------- render helpers
  function unitOffset(u) {
    const a = S.anim[u.uid];
    if (!a) return { dx: 0, dy: 0, sc: 1 };
    const k = (S.time - a.at) / a.dur;
    if (k < 0) return a.kind === 'enter' ? { dx: 0, dy: 0, hide: true } : { dx: 0, dy: 0 };
    if (k >= 1) { delete S.anim[u.uid]; return { dx: 0, dy: 0 }; }
    if (a.kind === 'lunge') { const q = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; return { dx: a.dx * q, dy: a.dy * q }; }
    return { enter: a, k }; // enter: fly from a.from + small shake
  }

  function drawHero(ctx, s) {
    const Sd = M.sides[s];
    const H = CARD_HEROES[Sd.hero];
    const r = HERO(s);
    const fl = S.flash[`h${s}`];
    const flashing = fl && S.time >= fl.at && S.time - fl.at < 0.25;
    const valid = validRefs().some((x) => x.hero && x.s === s);
    panel(ctx, r.x, r.y, r.w, r.h, flashing ? C[fl.color === 'c' ? 'd' : 'k'] : C['1'], valid ? C.a : s === 0 ? C.h : C.c);
    text(ctx, fit(ctx, s === 0 ? Sd.name : rname, r.w - 16, FONT_B), r.x + 8, r.y + 6, s === 0 ? C.h : C.c, FONT_B);
    text(ctx, fit(ctx, H?.name || '', r.w - 16, '12px monospace'), r.x + 8, r.y + 26, C['4'], '12px monospace');
    text(ctx, `♥ ${Sd.hp}`, r.x + 8, r.y + 46, Sd.hp <= 10 ? C.c : C['5'], FONT_L);
    if (Sd.armor) text(ctx, `⛨${Sd.armor}`, r.x + 96, r.y + 52, C['4'], FONT_B);
    // charge pips
    for (let i = 0; i < CARD_RULES.chargeMax; i++) {
      const on = i < Sd.charge, has = i < Sd.chargeMax;
      ctx.fillStyle = on ? C.b : has ? C['3'] : C['2'];
      ctx.fillRect(r.x + 8 + i * 21, r.y + 84, 17, 14);
    }
    if (Sd.charge > Sd.chargeMax) text(ctx, `+${Sd.charge - Sd.chargeMax}`, r.x + 150, r.y + 52, C.b, FONT_B);
    text(ctx, `${Sd.charge}/${Sd.chargeMax}`, r.x + r.w - 6, r.y + 46, C.b, FONT_B, 'right');
    text(ctx, `▤${Sd.deck.length} ✋${Sd.hand.length}`, r.x + r.w - 6, r.y + 66, C['4'], '12px monospace', 'right');
    hotspot(r.x + S.ox, r.y + S.oy, r.w, r.h, () => ({ title: `${s === 0 ? Sd.name : rname} — ${H?.name}`, lines: [
      `${t('cards.hp')}: ${Sd.hp}/${Sd.maxHp}${Sd.armor ? ` · ⛨${Sd.armor}` : ''}`, `${t('cards.charge')}: ${Sd.charge}/${Sd.chargeMax}`,
      { text: `${t('cards.passive')}: ${H?.passive}`, color: 'a' }, { text: `${t('cards.power')}: ${H?.power.name} — ${H?.power.text}`, color: 'h' },
      `${t('cards.deck')}: ${Sd.deck.length} · ${t('cards.hand')}: ${Sd.hand.length}${Sd.burn ? ` · ${t('cards.burn')} ${Sd.burn}` : ''}`] }));
  }

  function drawUnit(ctx, s, slot, valid) {
    const u = M.sides[s].field[slot];
    const r = SLOT(s, slot);
    const off = unitOffset(u);
    if (off.hide) return;
    let x = r.x, y = r.y;
    if (off.enter) {
      const k = Math.min(1, off.k), e = 1 - (1 - k) ** 3;
      x = off.enter.from.x + (r.x - off.enter.from.x) * e; y = off.enter.from.y + (r.y - off.enter.from.y) * e;
      if (k > 0.75) x += Math.sin(S.time * 90) * 3;
    } else { x += off.dx; y += off.dy; }
    const ready = s === 0 && canAttack(M, 0, slot);
    const fl = S.flash[u.uid];
    const flashing = fl && S.time >= fl.at && S.time - fl.at < 0.25;
    const sel = S.sel?.kind === 'unit' && S.sel.slot === slot && s === 0;
    drawCard(ctx, CARDS[u.id], x, y, r.w, r.h, { atk: atkOf(M, s, slot), hp: u.hp, maxHp: u.maxHp, shield: u.shield, status: u.st,
      glow: flashing ? fl.color : sel ? 'h' : valid ? 'a' : ready ? 'j' : null });
    if (u.sick && s === 0 && !ready) text(ctx, 'z z', x + r.w - 10, y + 26, C['4'], '12px monospace', 'right');
    hotspot(r.x + S.ox, r.y + S.oy, r.w, r.h, () => cardTip(CARDS[u.id], [
      { text: `${t('cards.now')}: ${atkOf(M, s, slot)}/${u.hp}${u.shield ? ` · ◯ ${t('cards.kw.shield')}` : ''}`, color: 'h' },
      ...(u.st.stun > 0 ? [{ text: L('cards.st.stun', { n: u.st.stun }), color: 'n' }] : []),
      ...(u.st.poison > 0 ? [{ text: L('cards.st.poison', { n: u.st.poison }), color: 'n' }] : []),
      ...(u.st.cringed > 0 ? [{ text: L('cards.st.cringed', { n: u.st.cringeAtk }), color: 'n' }] : []),
      ...(cringeOn(M, s) && !CARDS[u.id].immuneCringe ? [{ text: L('cards.st.aura', { n: cringeOn(M, s) }), color: 'n' }] : []),
      ...(s === 0 && u.sick && !canAttack(M, 0, slot) ? [{ text: t('cards.sick'), color: '4' }] : [])]));
  }

  // ---------------------------------------------------------------- scene
  self = {
    id: 'cards',
    S,
    enter(g) { layout(); absorb(); playTrack(CYBER_SETS.has(CARD_HEROES[rival.hero]?.set) ? 'cyberspace' : 'town'); },
    resume() { layout(); },
    resize() { layout(); },
    update(g, dt) {
      S.time += dt;
      const inp = g.input;
      const m = inp.mouse;
      const p = { x: m.x - S.ox, y: m.y - S.oy };
      S.hover = hitButton(S.buttons, m);
      updateScroll(S.ls, { x: LOG.x + S.ox, y: LOG.y + 24 + S.oy, w: LOG.w, h: LOG.h - 28 }, S.log.length * 16 + 4, m, { follow: true, step: 32 });
      S.nums = S.nums.filter((n) => S.time - n.at < 0.9);
      S.rings = S.rings.filter((n) => S.time - n.at < n.dur);
      S.parts = S.parts.filter((q) => S.time - q.at < q.life);
      if (S.result) {
        layout();
        if ((m.clicked && S.hover?.id === 'leave') || inp.wasPressed('Enter') || inp.wasPressed('Space')) leave(g);
        return;
      }
      const my = M.cur === 0 && M.winner === null;
      if (my) {
        S.timer -= dt;
        if (S.timer <= 0) { log(t('cards.timeout'), 'c'); doAct({ type: 'end' }); }
      } else if (M.winner === null && S.time >= S.busy && S.time >= S.aiAt) {
        // AI: one action per pause (0.6–0.9 s), never longer than the turn limit
        const a = aiAction(M);
        doAct(a);
        S.aiAt = S.time + (a?.type === 'end' ? 0.2 : 0.6 + Math.random() * 0.3);
      }
      layout();
      if (inp.wasPressed('Escape') || m.rightClicked) {
        if (S.pend || S.sel || S.drag) { S.pend = null; S.sel = null; S.drag = null; }
        else if (inp.wasPressed('Escape')) surrender(g);
        return;
      }
      if (!my) { S.drag = null; return; }
      if (inp.wasPressed('Space')) { doAct({ type: 'end' }); return; }
      if (m.clicked) {
        if (S.hover) {
          if (S.hover.disabled) return;
          if (S.hover.id === 'end') { play('uiClick'); doAct({ type: 'end' }); return; }
          if (S.hover.id === 'power') { play('uiClick'); beginPower(); return; }
        }
        if (S.pend) { clickRef(refAt(p)); return; }
        const hi = handAt(p);
        if (hi >= 0) { S.drag = { kind: 'hand', idx: hi, x0: p.x, y0: p.y, moved: false }; return; }
        const ref = refAt(p);
        if (ref && ref.s === 0 && ref.slot !== undefined && !ref.empty && canAttack(M, 0, ref.slot) && !S.sel) { S.drag = { kind: 'unit', slot: ref.slot, x0: p.x, y0: p.y, moved: false }; return; }
        clickRef(ref);
        return;
      }
      if (S.drag && m.down && Math.hypot(p.x - S.drag.x0, p.y - S.drag.y0) > 12) S.drag.moved = true;
      if (S.drag && m.released) {
        const d = S.drag;
        S.drag = null;
        const ref = refAt(p);
        if (!d.moved) {
          if (d.kind === 'hand') {
            const c = CARDS[M.sides[0].hand[d.idx]?.id];
            if (!canPlay(M, 0, d.idx).ok) { why(d.idx); return; }
            if (c.type === 'creature') { S.sel = { kind: 'hand', idx: d.idx }; play('uiClick'); } else beginPlay(d.idx);
          } else { S.sel = { kind: 'unit', slot: d.slot }; play('uiClick'); }
          return;
        }
        if (d.kind === 'hand') {
          const c = CARDS[M.sides[0].hand[d.idx]?.id];
          if (c?.type === 'creature') { if (ref && ref.s === 0 && ref.empty) beginPlay(d.idx, ref.slot); }
          else if (p.y < HAND_Y - 10) beginPlay(d.idx);
        } else if (ref && attackTargets(M, 0, d.slot).some((x) => sameRef(x, ref))) doAct({ type: 'attack', from: d.slot, target: ref });
      }
    },
    render(g) {
      const { ctx, width: W, height: H } = g;
      clear(ctx, W, H);
      ctx.save();
      ctx.translate(S.ox, S.oy);
      // table
      panel(ctx, 205, 140, 845, 410, C['1'], C['2']);
      ctx.fillStyle = C['2']; ctx.fillRect(215, 344, 830, 2);
      // Cringe aura rings over the rival's field (it hits the player's creatures)
      const aura = cringeOn(M, 0);
      if (aura) for (let i = 0; i < 3; i++) {
        const k = ((S.time * 0.6 + i / 3) % 1);
        ctx.strokeStyle = C.n; ctx.globalAlpha = (1 - k) * 0.5; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(630, 245, 200 + k * 260, 40 + k * 70, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      // rival hand (backs)
      const eh = M.sides[1].hand.length;
      for (let i = 0; i < eh; i++) drawBack(ctx, 640 - eh * 22 + i * 44, 4, 40, 56);
      drawHero(ctx, 0); drawHero(ctx, 1);
      // gadgets
      for (const s of [0, 1]) {
        text(ctx, t('cards.gadgets'), 20, GADGET(s, 0).y - 16, C['4'], '12px monospace');
        M.sides[s].gadgets.forEach((gd, i) => {
          const r = GADGET(s, i);
          const valid = validRefs().some((x) => x.gadget === i && x.s === s);
          drawCard(ctx, CARDS[gd.id], r.x, r.y, r.w, r.h, { small: true, dur: gd.dur, glow: valid ? 'a' : null });
          hotspot(r.x + S.ox, r.y + S.oy, r.w, r.h, () => cardTip(CARDS[gd.id], [{ text: `${t('cards.dur')}: ${gd.dur}`, color: 'h' }]));
        });
      }
      // fields
      const valid = validRefs();
      for (const s of [1, 0]) for (let i = 0; i < 5; i++) {
        const r = SLOT(s, i);
        const v = valid.some((x) => x.s === s && x.slot === i);
        if (!M.sides[s].field[i]) { panel(ctx, r.x, r.y, r.w, r.h, C['0'], v ? C.a : C['2']); if (v) text(ctx, '+', r.x + r.w / 2, r.y + r.h / 2 - 16, C.a, FONT_XL, 'center'); }
      }
      for (const s of [1, 0]) for (let i = 0; i < 5; i++) if (M.sides[s].field[i]) drawUnit(ctx, s, i, valid.some((x) => x.s === s && x.slot === i));
      // hand
      const hr = handRects();
      const p = { x: g.input.mouse.x - S.ox, y: g.input.mouse.y - S.oy };
      const hov = S.drag?.moved ? -1 : handAt(p);
      hr.forEach((r) => {
        const h = M.sides[0].hand[r.i];
        const c = CARDS[h.id];
        if (S.drag?.moved && S.drag.kind === 'hand' && S.drag.idx === r.i) return;
        const ok = canPlay(M, 0, r.i).ok;
        const sel = (S.sel?.kind === 'hand' && S.sel.idx === r.i) || (S.pend?.kind === 'play' && S.pend.idx === r.i);
        drawCard(ctx, c, r.x, r.y - (sel ? 24 : 0), r.w, r.h, { small: true, cost: costOf(M, 0, h.id), glow: sel ? 'h' : ok && M.cur === 0 ? 'j' : null });
        hotspot(r.x + S.ox, r.y + S.oy, r.w, r.h, () => cardTip(c, ok ? [] : [{ text: t(`cards.why.${canPlay(M, 0, r.i).why}`), color: 'c' }]));
      });
      if (hov >= 0) { const r = hr.find((x) => x.i === hov); const h = M.sides[0].hand[hov]; drawCard(ctx, CARDS[h.id], Math.min(BW - 420, Math.max(220, r.x - 45)), HAND_Y - 300, 200, 290, { cost: costOf(M, 0, h.id) }); }
      // deck / counters
      text(ctx, `${t('cards.deck')}: ${M.sides[0].deck.length}`, 1130, 560, C['4'], FONT);
      // log
      panel(ctx, LOG.x, LOG.y, LOG.w, LOG.h, C['1'], C['3']);
      text(ctx, t('cards.log'), LOG.x + 8, LOG.y + 4, C.a, FONT_B);
      ctx.restore();
      const lv = { x: LOG.x + S.ox, y: LOG.y + 24 + S.oy, w: LOG.w, h: LOG.h - 28 };
      beginClip(ctx, lv);
      S.log.forEach((l, i) => text(ctx, fit(ctx, l.text, LOG.w - 20, '12px monospace'), lv.x + 6, lv.y + 2 + i * 16 - S.ls.off, C[l.color] || C['5'], '12px monospace'));
      endClip(ctx);
      drawScrollbar(ctx, S.ls, lv);
      hotspot(lv.x, lv.y, lv.w - 10, lv.h, () => { const i = Math.floor((g.input.mouse.y - lv.y + S.ls.off - 2) / 16); return S.log[i] ? { title: t('cards.log'), lines: [S.log[i].text] } : null; });
      // timer bar
      if (M.cur === 0 && M.winner === null) {
        const k = Math.max(0, S.timer / CARD_RULES.turnSeconds);
        ctx.fillStyle = C['2']; ctx.fillRect(END.x + S.ox, END.y - 12 + S.oy, END.w, 6);
        ctx.fillStyle = k < 0.25 ? C.c : C.b; ctx.fillRect(END.x + S.ox, END.y - 12 + S.oy, END.w * k, 6);
      }
      for (const b of S.buttons) { button(ctx, b, S.hover === b); if (b.tip) hotspot(b.x, b.y, b.w, b.h, b.tip); }
      ctx.save();
      ctx.translate(S.ox, S.oy);
      // targeting prompt
      if (S.pend?.prompt) { panel(ctx, 400, 548, 480, 26, C['0'], C.a); text(ctx, fit(ctx, `${S.pend.prompt} · ${t('cards.cancelHint')}`, 470, FONT), 640, 552, C.a, FONT, 'center'); }
      // drag ghost
      if (S.drag?.moved) {
        if (S.drag.kind === 'hand') { const h = M.sides[0].hand[S.drag.idx]; if (h) drawCard(ctx, CARDS[h.id], p.x - HW / 2, p.y - HH / 2, HW, HH, { small: true, cost: costOf(M, 0, h.id) }); }
        else { const c = center(SLOT(0, S.drag.slot)); ctx.strokeStyle = C.a; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.lineWidth = 1; }
      }
      // fx: rings, particles, numbers, banner
      for (const r of S.rings) { if (S.time < r.at) continue; const k = (S.time - r.at) / r.dur; ctx.strokeStyle = C[r.color]; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + k * 40, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      for (const q of S.parts) { if (S.time < q.at) continue; const k = S.time - q.at; ctx.fillStyle = q.color; ctx.globalAlpha = 1 - k / q.life; ctx.fillRect(q.x + q.vx * k, q.y + q.vy * k + 200 * k * k, 5, 5); }
      ctx.globalAlpha = 1;
      for (const n of S.nums) { if (S.time < n.at) continue; const k = (S.time - n.at) / 0.9; ctx.globalAlpha = 1 - k; text(ctx, n.s, n.x, n.y - k * 40, C[n.color], FONT_L, 'center'); }
      ctx.globalAlpha = 1;
      const bn = S.banner;
      if (bn && S.time >= bn.at && S.time - bn.at < bn.dur) {
        if (bn.small) { panel(ctx, 440, 300, 400, 44, C['0'], C[bn.color || 'a']); text(ctx, bn.text, 640, 310, C[bn.color || 'a'], FONT_L, 'center'); }
        else { ctx.fillStyle = 'rgba(20,20,28,0.8)'; ctx.fillRect(0, 290, BW, 100); text(ctx, bn.text, 640, 316, S.result ? (S.result.won ? C.j : C.c) : C.h, FONT_XL, 'center'); }
      }
      if (S.result) {
        panel(ctx, 400, 230, 480, 250, C['1'], S.result.won ? C.j : C.c);
        text(ctx, S.result.won ? t('cards.win') : t('cards.lose'), 640, 246, S.result.won ? C.j : C.c, FONT_L, 'center');
        S.result.lines.slice(0, 7).forEach((l, i) => text(ctx, fit(ctx, l.text, 450, FONT), 640, 290 + i * 18, C[l.color] || C['5'], FONT, 'center'));
      }
      ctx.restore();
      if (S.result) for (const b of S.buttons) if (b.id === 'leave') button(ctx, b, S.hover === b);
    },
  };
  return self;
}
