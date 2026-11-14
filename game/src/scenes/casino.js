// Casino «Бар Лагуны» (docs/specs/cards-casino.md §6; pirates-m30, Мадам Ставка): dice, the one-armed bandit, roulette, cards on
// a stake, the tournament and the loan. Logic and limits — world/cards.js (only credits: no XP, reputation or items).
// openCasino(game, back) → scene id 'casino' (S: tab, bet, phase…).
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { C, FONT, FONT_B, FONT_L, FONT_XL, text, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { play } from '../audio/sfx.js';
import { playTrack, getMusicState } from '../audio/music.js';
import { saveGame } from '../save.js';
import { startQuest, allSlots, completeSlot } from '../world/quests.js';
import {
  CASINO, casinoState, tablesClosed, betBlock, casinoSettle, rollPair, rerollDie, houseRoll, canReroll, diceValue, dicePayout,
  spinReels, slotMult, SLOT_SYMBOLS, spinWheel, pocketName, pocketColor, roulettePayout, debtOwed, debtDue, takeLoan, repayLoan, rivalOf,
  cardSlots, cardsState,
} from '../world/cards.js';
import { startRivalMatch, startQuestMatch } from './card-hub.js';

const BW = 1280, BH = 720;
const TABS = ['dice', 'slots', 'roulette', 'cards', 'tour', 'debt'];
const GLYPH = { tushenka: '▤', gear: '⚙', radio: '♪', skull: '☠', cringe: '☺', judge: '◉' };
const GCOL = { tushenka: '8', gear: '4', radio: 'h', skull: '5', cringe: 'n', judge: 'a' };
const L = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function openCasino(game, back) {
  const sc = createCasinoScene(back);
  game.setScene(sc);
  return sc;
}

export function createCasinoScene(back) {
  const S = { tab: 'dice', bet: { dice: 10, slots: 5, roulette: 5, cards: 25 }, phase: 'idle', time: 0, buttons: [], hover: null, ox: 0, oy: 0,
    dice: null, reels: null, wheel: null, rbet: { kind: 'red' }, rnum: 17, msg: null, anim: null };
  let self, prevTrack = null;
  const gameKey = () => (S.tab === 'cards' ? 'cards' : S.tab);
  const lim = CASINO.limits;

  function result(game, bet, payout, msgKey) {
    casinoSettle(game.save, payout - bet);
    S.msg = { text: payout > bet ? L('casino.won', { n: payout - bet }) : payout === bet ? t('casino.push') : L('casino.lostBet', { n: bet }), color: payout > bet ? 'j' : payout === bet ? '5' : 'c', sub: msgKey };
    play(payout > bet ? 'victory' : 'miss');
    saveGame(game.save);
  }

  function start(game) {
    const sv = game.save;
    const g = gameKey();
    const bet = S.bet[g];
    const why = betBlock(sv, g, bet);
    if (why) { game.toast(t(why), 'c'); return; }
    S.msg = null;
    if (g === 'dice') { S.dice = { p: rollPair(), h: null, bet }; S.anim = { at: S.time, dur: 0.5 }; S.phase = canReroll(S.dice.p) ? 'reroll' : 'house'; play('uiClick'); }
    if (g === 'slots') { S.reels = { r: spinReels(), bet }; S.anim = { at: S.time, dur: 1.1 }; S.phase = 'spin'; play('uiClick'); }
    if (g === 'roulette') { S.wheel = { p: spinWheel(), bet, kind: { ...S.rbet, n: S.rbet.kind === 'num' ? S.rnum : S.rbet.n } }; S.anim = { at: S.time, dur: 1.3 }; S.phase = 'spin'; play('uiClick'); }
  }

  function houseTurn(game) {
    S.dice.h = houseRoll();
    S.anim = { at: S.time, dur: 0.5 };
    S.phase = 'houseAnim';
  }

  const tourQ = CASINO.quests.tournament;
  function tourInfo(sv) {
    const q = sv.quests[tourQ];
    const cs = casinoState(sv);
    if (!q) return { can: true };
    if (q.state === 'active') {
      const pay = allSlots(sv).find((s) => s.qid === tourQ && s.goal.kind === 'pay');
      const card = cardSlots(sv).find((s) => s.qid === tourQ);
      return { active: true, pay, card };
    }
    return { cooldown: (cs.tourDay ?? sv.day) + CASINO.tournament.cooldownDays - sv.day };
  }

  function layout(game) {
    const sv = game.save;
    S.ox = Math.max(0, Math.floor((game.width - BW) / 2)); S.oy = Math.max(0, Math.floor((game.height - BH) / 2));
    const b = [];
    TABS.forEach((id, i) => b.push({ kind: 'tab', id, label: t(`casino.tab.${id}`), key: String(i + 1), x: 24, y: 110 + i * 56, w: 220, h: 48, selected: S.tab === id }));
    b.push({ kind: 'leave', label: t('casino.leave'), key: 'Esc', x: 24, y: 110 + TABS.length * 56 + 12, w: 220, h: 44 });
    const closed = tablesClosed(sv);
    const g = gameKey();
    const busy = S.phase !== 'idle';
    if (['dice', 'slots', 'roulette', 'cards'].includes(S.tab)) {
      b.push({ kind: 'bet', d: -5, label: '−5', x: 300, y: 620, w: 60, h: 44, disabled: busy });
      b.push({ kind: 'bet', d: 5, label: '+5', x: 470, y: 620, w: 60, h: 44, disabled: busy });
      b.push({ kind: 'bet', d: 50, label: '+50', x: 536, y: 620, w: 64, h: 44, disabled: busy });
    }
    if (S.tab === 'dice') {
      if (S.phase === 'reroll' && S.time - S.anim.at > S.anim.dur) {
        b.push({ kind: 'reroll', i: 0, label: t('casino.reroll1'), x: 640, y: 560, w: 190, h: 44 });
        b.push({ kind: 'reroll', i: 1, label: t('casino.reroll2'), x: 840, y: 560, w: 190, h: 44 });
        b.push({ kind: 'keep', label: t('casino.keep'), x: 1040, y: 560, w: 190, h: 44 });
      } else b.push({ kind: 'go', label: L('casino.roll', { n: S.bet.dice }), key: 'Space', x: 640, y: 620, w: 300, h: 44, disabled: busy || !!closed });
    }
    if (S.tab === 'slots') b.push({ kind: 'go', label: L('casino.spin', { n: S.bet.slots }), key: 'Space', x: 640, y: 620, w: 300, h: 44, disabled: busy || !!closed });
    if (S.tab === 'roulette') {
      const kinds = [['red'], ['black'], ['even'], ['odd'], ['dozen', 1], ['dozen', 2], ['dozen', 3], ['num']];
      kinds.forEach(([k, n], i) => b.push({ kind: 'rk', rk: k, n, label: k === 'dozen' ? `${(n - 1) * 12 + 1}–${n * 12}` : k === 'num' ? L('casino.rnum', { n: pocketName(S.rnum) }) : t(`casino.r.${k}`),
        x: 300 + (i % 4) * 160, y: 470 + Math.floor(i / 4) * 52, w: 150, h: 44, selected: S.rbet.kind === k && (k !== 'dozen' || S.rbet.n === n), disabled: busy }));
      b.push({ kind: 'rn', d: -1, label: '◀', x: 950, y: 522, w: 44, h: 44, disabled: busy });
      b.push({ kind: 'rn', d: 1, label: '▶', x: 1000, y: 522, w: 44, h: 44, disabled: busy });
      b.push({ kind: 'go', label: L('casino.spinWheel', { n: S.bet.roulette }), key: 'Space', x: 640, y: 620, w: 300, h: 44, disabled: busy || !!closed });
    }
    if (S.tab === 'cards') {
      const here = ['old-lockpick', 'madam-stavka'].map(rivalOf).filter(Boolean);
      here.forEach((r, i) => {
        const why = betBlock(sv, 'cards', S.bet.cards);
        b.push({ kind: 'rival', npc: r.npc, label: L('casino.playVs', { name: NPCS[r.npc]?.name || r.npc }), sub: L('casino.tierSub', { n: r.tier, stake: S.bet.cards }),
          x: 300, y: 140 + i * 64, w: 420, h: 54, disabled: !!why, reason: why ? t(why) : null });
      });
    }
    if (S.tab === 'tour') {
      const ti = tourInfo(sv);
      if (ti.can) b.push({ kind: 'tourJoin', label: L('casino.tourJoin', { n: CASINO.tournament.entry }), x: 300, y: 260, w: 420, h: 50, disabled: !!closed || sv.hero.credits < CASINO.tournament.entry, reason: closed ? t(closed) : t('cards.noMoney') });
      else if (ti.pay) b.push({ kind: 'tourPay', label: L('casino.tourJoin', { n: CASINO.tournament.entry }), x: 300, y: 260, w: 420, h: 50, disabled: sv.hero.credits < CASINO.tournament.entry, reason: t('cards.noMoney') });
      else if (ti.card) b.push({ kind: 'tourRound', label: L('casino.tourRound', { name: NPCS[ti.card.goal.npc]?.name }), sub: ti.card.stage.text, x: 300, y: 260, w: 420, h: 54 });
    }
    if (S.tab === 'debt') {
      const cs = casinoState(sv);
      if (!cs.loan) [50, 100, 200].forEach((n, i) => b.push({ kind: 'loan', n, label: L('casino.loan', { n }), x: 300 + i * 150, y: 300, w: 140, h: 48 }));
      else b.push({ kind: 'repay', label: L('casino.repay', { n: debtOwed(sv) }), x: 300, y: 300, w: 260, h: 48, disabled: sv.hero.credits < debtOwed(sv), reason: t('cards.noMoney') });
    }
    S.buttons = b.map((x) => ({ ...x, x: x.x + S.ox, y: x.y + S.oy }));
  }

  function click(game, b) {
    const sv = game.save;
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'tab') { if (S.phase === 'idle') { S.tab = b.id; S.msg = null; } return; }
    if (b.kind === 'leave') { if (prevTrack) playTrack(prevTrack); game.resume(back); return; }
    if (b.kind === 'bet') { const g = gameKey(); S.bet[g] = Math.max(lim.minBet[g], Math.min(lim.maxBet[g], S.bet[g] + b.d)); return; }
    if (b.kind === 'go') return start(game);
    if (b.kind === 'reroll') { S.dice.p = rerollDie(S.dice.p, b.i); S.anim = { at: S.time, dur: 0.4 }; S.phase = 'house'; return; }
    if (b.kind === 'keep') { S.phase = 'house'; return; }
    if (b.kind === 'rk') { S.rbet = { kind: b.rk, n: b.n }; return; }
    if (b.kind === 'rn') { S.rnum = (S.rnum + b.d + 38) % 38; S.rbet = { kind: 'num' }; return; }
    if (b.kind === 'rival') return startRivalMatch(game, rivalOf(b.npc), { stake: S.bet.cards, casino: true, back: self });
    if (b.kind === 'tourJoin') {
      if (!sv.quests[tourQ]) game.toast(startQuest(sv, tourQ)[0].text, 'h');
      const pay = allSlots(sv).find((s) => s.qid === tourQ && s.goal.kind === 'pay');
      if (pay && sv.hero.credits >= pay.goal.credits) { sv.hero.credits -= pay.goal.credits; for (const x of completeSlot(sv, pay, game.data)) game.toast(x.text, x.color); }
      saveGame(sv);
      return;
    }
    if (b.kind === 'tourPay') { const pay = tourInfo(sv).pay; sv.hero.credits -= pay.goal.credits; for (const x of completeSlot(sv, pay, game.data)) game.toast(x.text, x.color); saveGame(sv); return; }
    if (b.kind === 'tourRound') return startQuestMatch(game, tourInfo(sv).card, self);
    if (b.kind === 'loan') { if (takeLoan(sv, b.n)) { game.toast(L('casino.loanGot', { n: b.n }), 'a'); saveGame(sv); } return; }
    if (b.kind === 'repay') { if (repayLoan(sv)) { game.toast(t('casino.debtClosed'), 'j'); saveGame(sv); } }
  }

  function drawDie(ctx, x, y, v, s = 70, col = C['5']) {
    panel(ctx, x, y, s, s, C['1'], col);
    const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[v] || [];
    ctx.fillStyle = col;
    for (const [i, j] of P) ctx.fillRect(x + s * (0.2 + i * 0.3) - 5, y + s * (0.2 + j * 0.3) - 5, 10, 10);
  }

  self = {
    id: 'casino',
    S,
    enter(game) { prevTrack = getMusicState().track; playTrack('town'); casinoState(game.save); layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      // phases with animations
      const animDone = !S.anim || S.time - S.anim.at >= S.anim.dur;
      if (animDone) {
        if (S.tab === 'dice' && S.phase === 'house') houseTurn(game);
        else if (S.phase === 'houseAnim') { const d = S.dice; result(game, d.bet, dicePayout(d.bet, d.p, d.h)); S.phase = 'idle'; }
        else if (S.phase === 'spin' && S.tab === 'slots') { const r = S.reels; result(game, r.bet, r.bet * slotMult(r.r)); S.phase = 'idle'; }
        else if (S.phase === 'spin' && S.tab === 'roulette') { const w = S.wheel; result(game, w.bet, roulettePayout(w.bet, w.kind, w.p)); S.phase = 'idle'; }
      }
      layout(game);
      S.hover = hitButton(S.buttons, inp.mouse);
      if (inp.mouse.clicked && S.hover) return click(game, S.hover);
      if (S.phase !== 'idle') return;
      if (inp.wasPressed('Escape')) return click(game, S.buttons.find((b) => b.kind === 'leave'));
      if (inp.wasPressed('Space')) { const g = S.buttons.find((b) => b.kind === 'go'); if (g) click(game, g); }
      for (let i = 0; i < TABS.length; i++) if (inp.wasPressed(`Digit${i + 1}`)) { S.tab = TABS[i]; S.msg = null; }
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const sv = game.save;
      clear(ctx, W, H);
      ctx.save(); ctx.translate(S.ox, S.oy);
      const cs = casinoState(sv);
      text(ctx, CASINO.name, 24, 20, C.a, FONT_L);
      text(ctx, `${t('cards.credits')}: ${sv.hero.credits}   ${t('casino.today')}: ${cs.net >= 0 ? '+' : ''}${cs.net}   ${L('casino.limits', { loss: lim.dailyNetLoss, win: lim.dailyNetWin })}`, 24, 56, C['5'], FONT);
      if (cs.loan) text(ctx, L('casino.debtLine', { n: debtOwed(sv), day: debtDue(sv) - sv.day }), 24, 78, cs.overdue ? C.c : C.a, FONT);
      panel(ctx, 270, 100, 986, 600, C['1'], C['3']);
      const closed = tablesClosed(sv);
      if (closed && ['dice', 'slots', 'roulette', 'cards'].includes(S.tab)) text(ctx, t(closed), 760, 110, C.c, FONT_B, 'center');
      const k = S.anim ? Math.min(1, (S.time - S.anim.at) / S.anim.dur) : 1;
      if (S.tab === 'dice') {
        text(ctx, t('casino.diceRules'), 300, 140, C['4'], FONT);
        text(ctx, t('casino.you'), 300, 200, C.h, FONT_B); text(ctx, t('casino.house'), 300, 340, C.c, FONT_B);
        const d = S.dice;
        if (d) {
          const p = S.phase === 'reroll' || S.phase === 'house' ? (k < 1 ? rollPair() : d.p) : d.p;
          drawDie(ctx, 300, 225, p[0], 70, C.h); drawDie(ctx, 390, 225, p[1], 70, C.h);
          text(ctx, `= ${diceValue(d.p)}${d.p[0] === d.p[1] ? ` (${t('casino.double')})` : ''}`, 480, 248, C.h, FONT_L);
          if (d.h) { const h = S.phase === 'houseAnim' && k < 1 ? rollPair() : d.h; drawDie(ctx, 300, 365, h[0], 70, C.c); drawDie(ctx, 390, 365, h[1], 70, C.c); if (S.phase !== 'houseAnim') text(ctx, `= ${diceValue(d.h)}`, 480, 388, C.c, FONT_L); }
          if (S.phase === 'reroll' && k >= 1) text(ctx, t('casino.rerollQ'), 640, 530, C.a, FONT);
        }
      }
      if (S.tab === 'slots') {
        text(ctx, t('casino.slotsRules'), 300, 140, C['4'], FONT);
        const r = S.reels;
        for (let i = 0; i < 3; i++) {
          const el = S.anim ? S.time - S.anim.at : 9;
          const sym = r ? (S.phase === 'spin' && el < 0.5 + i * 0.3 ? SLOT_SYMBOLS[Math.floor(S.time * 20 + i * 3) % SLOT_SYMBOLS.length] : r.r[i]) : SLOT_SYMBOLS[i];
          panel(ctx, 420 + i * 150, 220, 130, 170, C['0'], C.a);
          text(ctx, GLYPH[sym], 485 + i * 150, 250, C[GCOL[sym]], 'bold 64px monospace', 'center');
          text(ctx, fit(ctx, CASINO.slots.names[sym], 120, FONT), 485 + i * 150, 350, C['5'], FONT, 'center');
        }
        Object.entries(CASINO.slots.triple).forEach(([s, m], i) => text(ctx, `${GLYPH[s]}×3 = ×${m}`, 920 + (i % 2) * 150, 220 + Math.floor(i / 2) * 26, C[GCOL[s]], FONT));
        text(ctx, `${GLYPH.cringe}×2 = ×${CASINO.slots.any.twoCringe}   ${GLYPH.tushenka}×2 = ×${CASINO.slots.any.twoTushenka}`, 920, 310, C['4'], FONT);
      }
      if (S.tab === 'roulette') {
        text(ctx, t('casino.rouletteRules'), 300, 140, C['4'], FONT);
        const w = S.wheel;
        const shown = w ? (S.phase === 'spin' && k < 1 ? Math.floor(S.time * 25) % 38 : w.p) : null;
        ctx.beginPath(); ctx.arc(760, 300, 110, 0, Math.PI * 2); ctx.fillStyle = C['0']; ctx.fill(); ctx.strokeStyle = C.a; ctx.lineWidth = 4; ctx.stroke(); ctx.lineWidth = 1;
        for (let i = 0; i < 38; i++) { const a = i / 38 * Math.PI * 2 + (S.phase === 'spin' ? S.time * 4 * (1 - k) : 0); ctx.fillStyle = C[pocketColor(i) === 'red' ? 'c' : pocketColor(i) === 'green' ? 'j' : '2']; ctx.fillRect(760 + Math.cos(a) * 95 - 5, 300 + Math.sin(a) * 95 - 5, 10, 10); }
        if (shown != null) text(ctx, pocketName(shown) + (shown === 37 ? ' ☺' : ''), 760, 280, C[pocketColor(shown) === 'red' ? 'c' : pocketColor(shown) === 'green' ? 'j' : '5'], FONT_XL, 'center');
      }
      if (S.tab === 'cards') text(ctx, t('casino.cardsRules'), 300, 300, C['4'], FONT);
      if (S.tab === 'tour') {
        const ti = tourInfo(sv);
        text(ctx, L('casino.tourRules', { n: CASINO.tournament.entry, prize: CASINO.tournament.prize.credits }), 300, 140, C['4'], FONT);
        text(ctx, CASINO.tournament.field.map((n) => NPCS[n]?.name || n).join(' → '), 300, 170, C.a, FONT_B);
        if (ti.cooldown > 0) text(ctx, L('casino.tourCooldown', { n: ti.cooldown }), 300, 270, C['4'], FONT);
      }
      if (S.tab === 'debt') {
        text(ctx, L('casino.debtRules', { max: CASINO.debt.maxLoan, days: CASINO.debt.dueDays }), 300, 140, C['4'], FONT);
        if (cs.loan) text(ctx, L('casino.debtLine', { n: debtOwed(sv), day: debtDue(sv) - sv.day }), 300, 250, cs.overdue ? C.c : C.a, FONT_B);
        if (cs.overdue) text(ctx, t('casino.overdue'), 300, 380, C.c, FONT);
      }
      if (['dice', 'slots', 'roulette', 'cards'].includes(S.tab)) {
        const g = gameKey();
        text(ctx, `${S.bet[g]}`, 415, 632, C.a, FONT_L, 'center');
        text(ctx, L('casino.betRange', { min: lim.minBet[g], max: lim.maxBet[g] }), 300, 596, C['4'], '12px monospace');
      }
      if (S.msg && S.phase === 'idle') { panel(ctx, 640, 440, 400, 50, C['0'], C[S.msg.color]); text(ctx, S.msg.text, 840, 454, C[S.msg.color], FONT_L, 'center'); }
      ctx.restore();
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
  return self;
}

export { cardsState };
