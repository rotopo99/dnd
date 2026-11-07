// Check scene screen (docs/specs/companions-scenes.md, part 2): prologue, 2–4 approaches (skill / item / companion),
// d20 roll animation (CHECK_SCENE_RULES.anim: tumble → settle → modifiers left to right → «N против СЛ M» → outcome word;
// crit — flash, crit fail — shake; advantage / disadvantage — two dice, the unused one dim), outcome text and fx.
// Click / Enter / Space skips to the result (the roll is made before the animation, skipping changes nothing).
// fx are applied once at the roll and the result is kept in save.memo[memoKey] until «Дальше»: a reload shows the same result.
// Logic — world/check-run.js. Opened as a scene over the caller; returns with game.resume(back).
import { t } from '../data/text/index.js';
import { CHECK_SCENE_RULES as CS } from '../data/world/check-scenes.js';
import { approachStates, rollApproach, outcomeOf, applyFx, skillName } from '../world/check-run.js';
import { tf } from '../world/state.js';
import { queueBark } from '../world/barks.js';
import { NPCS } from '../data/npcs.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, FONT_XL, text, wrap, panel, button, hitButton, clear, fit } from '../ui/draw.js';

const A = CS.anim;
const sign = (n) => (n >= 0 ? `+${n}` : `−${-n}`);
const STATS = ['str', 'dex', 'con', 'int', 'wil', 'cha'];
const partLabel = (l) => (STATS.includes(l) ? t(`stat.${l}`) : t(`cs.mod.${l}`) !== `cs.mod.${l}` ? t(`cs.mod.${l}`) : l);
const face = (k, i) => 1 + (((k + 1) * 2654435761 + i * 40503) >>> 0) % 20;

/**
 * openCheckScene(game, { title, scene, dc, members, group?, memoKey?, xpBase?, stageText?, cancel?, onDone(game, ok, res), onCancel? })
 * scene — CHECK_SCENES entry or autoScene; dc — base DC (approach dcMod on top).
 */
export function openCheckScene(game, o) {
  const back = game.scene;
  const save = game.save;
  const S = { phase: 'pick', t: 0, btns: [], res: null, memo: null, skipped: false };
  const states = approachStates(save, o.members, o.scene, o.dc);
  const memo = save && o.memoKey ? save.memo?.[o.memoKey] : null;
  if (memo) {
    // the roll was already made (reload before «Дальше»): the same result, fx not applied again
    S.memo = memo.scene ? memo : { scene: true, success: memo.success, outcome: memo.success ? 'success' : 'fail', text: (memo.lines || []).map((l) => l.text), fx: [], rolls: [] };
    S.phase = 'result'; S.t = 1e9; S.skipped = true; S.fromMemo = true; S.toasted = true;
  }

  const finish = (g) => {
    const m = S.memo;
    if (save && o.memoKey) delete save.memo[o.memoKey];
    g.resume(back);
    o.onDone?.(g, m.success, m);
    if (save) saveGame(save);
    if (m.zero) import('./exodus-zero.js').then((x) => x.startExodusZero(g));
  };
  const cancel = (g) => { g.resume(back); o.onCancel?.(g); };

  const roll = (g, st) => {
    if (!st.ok) return;
    if (st.ap.item && st.ap.consume) save.hero.items[st.ap.item] = Math.max(0, (save.hero.items[st.ap.item] || 0) - 1);
    const r = rollApproach(st, { group: !!o.group, ms: o.members });
    const out = outcomeOf(o.scene, r.outcome, { name: st.member?.name || '', stage: o.stageText || '' });
    const fx = applyFx(save, out.fx, { xpBase: o.xpBase || 0, data: g.data });
    S.memo = {
      scene: true, success: r.success, outcome: r.outcome, text: out.text, fx: fx.toasts, zero: fx.zero, dc: r.dc, okN: r.okN, group: !!o.group,
      approach: st.ap.label, say: st.ap.companion && st.ap.say ? { npc: st.ap.companion, text: st.ap.say } : null,
      rolls: r.rolls.map((x) => ({ name: x.member.name, natural: x.natural, dice: x.dice, mode: x.mode, total: x.total, success: x.success,
        parts: x.parts.map((p) => ({ label: partLabel(p.label), value: p.value })) })),
    };
    if (save && o.memoKey) { save.memo = save.memo || {}; save.memo[o.memoKey] = S.memo; }
    if (save) saveGame(save);
    S.phase = 'roll'; S.t = 0; S.toasted = false;
    play('uiClick');
  };

  // timeline (ms) of the roll animation
  const tl = () => {
    const m = S.memo;
    const nParts = m.group ? m.rolls.length : (m.rolls[0]?.parts.length || 0);
    const settle = A.tumbleMs + A.settleMs;
    const mods = settle + A.modsRevealMs;
    const total = mods + nParts * A.modsStepMs;
    const word = total + A.totalHoldMs / 2;
    return { settle, mods, total, word };
  };
  const toResult = (g) => {
    S.phase = 'result';
    if (!S.toasted) {
      S.toasted = true;
      for (const x of S.memo.fx || []) g.toast(x.text, x.color);
      play(S.memo.success ? 'buff' : 'miss');
      queueBark(S.memo.success ? 'checkSuccess' : 'checkFail'); // after the reveal: a bark must not spoil the roll
    }
  };

  const layout = (g) => {
    const W = Math.min(1040, g.width - 64), H = Math.min(680, g.height - 48);
    const x = Math.round((g.width - W) / 2), y = Math.round((g.height - H) / 2);
    return { x, y, W, H };
  };

  const self = {
    id: 'check-scene',
    S,
    enter() {},
    update(g, dt) {
      const inp = g.input;
      const m = inp.mouse;
      S.t += dt * 1000;
      if (S.phase === 'pick') {
        const b = m.clicked ? hitButton(S.btns, m) : null;
        if (b && !b.disabled) return b.run(g);
        for (let i = 1; i <= S.btns.length; i++) if (inp.wasPressed(`Digit${i}`) || inp.wasPressed(`Numpad${i}`)) { const bb = S.btns[i - 1]; if (bb && !bb.disabled) return bb.run(g); }
        if (inp.wasPressed('Escape') && o.cancel !== false) return cancel(g);
        return;
      }
      if (S.phase === 'roll') {
        if (m.clicked || inp.wasPressed('Enter') || inp.wasPressed('Space') || inp.wasPressed('Escape')) { S.skipped = true; S.t = 1e9; return toResult(g); }
        if (S.t >= tl().word) toResult(g);
        return;
      }
      // result
      const b = m.clicked ? hitButton(S.btns, m) : null;
      if ((b && !b.disabled) || inp.wasPressed('Enter') || inp.wasPressed('Space')) return finish(g);
    },
    render(g) {
      const { ctx } = g;
      clear(ctx, g.width, g.height);
      const L = layout(g);
      const fl = S.memo && S.phase !== 'pick' ? tl() : null;
      // crit fail — shake
      let sx = 0;
      if (fl && S.memo.outcome === 'critFail' && !S.skipped && S.t >= fl.word && S.t < fl.word + 400) sx = Math.round(Math.sin(S.t / 18) * A.shakeOnCritFail);
      ctx.save();
      ctx.translate(sx, 0);
      panel(ctx, L.x, L.y, L.W, L.H, C['1'], C['3']);
      let y = L.y + 16;
      text(ctx, fit(ctx, o.title || '', L.W - 32, FONT_L), L.x + L.W / 2, y, C.a, FONT_L, 'center');
      y += 40;
      for (const line of o.scene.prolog || []) for (const l of wrap(ctx, line, L.W - 48, FONT)) { text(ctx, l, L.x + 24, y, C['5'], FONT); y += 20; }
      y += 10;
      S.btns = [];
      if (S.phase === 'pick') {
        text(ctx, `${t('cs.pick')} · ${t('battle.dc')} ${o.dc}${o.group ? ` · ${t('cs.group')}` : ''}`, L.x + 24, y, C.a, FONT_B);
        y += 28;
        states.forEach((st, i) => {
          const tags = [st.skill ? skillName(st.skill) : '', st.member ? `${st.member.name} ${t('cs.roller')}` : '', `${t('cs.chance')} ${Math.round(st.chance * 100)}%`,
            `${t('battle.dc')} ${st.dc}`, st.bonus ? sign(st.bonus) : '', st.adv ? t('cs.adv') : '', st.ap.consume ? t('cs.consume') : ''].filter(Boolean).join(' · ');
          const sub = st.ok ? `${tags}${st.ap.hint ? ` — ${st.ap.hint}` : ''}` : st.why;
          const b = { x: L.x + 24, y, w: L.W - 48, h: 56, label: st.ap.label, sub, disabled: !st.ok, key: String(i + 1), run: (g2) => roll(g2, st) };
          S.btns.push(b);
          y += 64;
        });
        if (o.cancel !== false) S.btns.push({ x: L.x + L.W - 184, y: L.y + L.H - 52, w: 160, h: 36, label: t('check.cancel'), run: cancel });
      } else this.drawRoll(g, L, y, fl);
      const hover = hitButton(S.btns, g.input.mouse);
      for (const b of S.btns) button(ctx, b, b === hover);
      ctx.restore();
      // crit success — flash
      if (fl && S.memo.outcome === 'critSuccess' && !S.skipped && S.t >= fl.word && S.t < fl.word + A.critFlashMs) {
        ctx.globalAlpha = 0.5 * (1 - (S.t - fl.word) / A.critFlashMs);
        ctx.fillStyle = C['5'];
        ctx.fillRect(0, 0, g.width, g.height);
        ctx.globalAlpha = 1;
      }
    },
    drawRoll(g, L, y0, fl) {
      const { ctx } = g;
      const m = S.memo;
      const tms = S.t;
      const cx = L.x + L.W / 2;
      let y = y0;
      if (m.approach) { text(ctx, fit(ctx, m.approach, L.W - 48, FONT_B), cx, y, C.h, FONT_B, 'center'); y += 24; }
      if (m.say) { text(ctx, fit(ctx, `${NPCS[m.say.npc]?.name || m.say.npc}: «${m.say.text}»`, L.W - 48), cx, y, C['4'], FONT, 'center'); y += 22; }
      const settled = tms >= A.tumbleMs;
      const frame = Math.floor(tms / (1000 / A.tumbleFps));
      const col = (ok) => C[CS.colors[ok ? 'success' : 'fail']] || (ok ? C.j : C.c);
      if (m.group) {
        // group: a small die per member with the name and total
        const n = m.rolls.length, r = 30, step = Math.min(150, (L.W - 80) / Math.max(1, n));
        m.rolls.forEach((x, i) => {
          const dx = cx - ((n - 1) * step) / 2 + i * step, dy = y + 50;
          const v = settled ? x.natural : face(frame, i);
          drawDie(ctx, dx, dy, r, v, settled && tms >= fl.mods + i * A.modsStepMs ? col(x.success) : C.h, 1, FONT_L);
          text(ctx, fit(ctx, x.name, step - 8), dx, dy + r + 8, C['5'], FONT, 'center');
          if (tms >= fl.mods + i * A.modsStepMs) text(ctx, `= ${x.total}`, dx, dy + r + 28, col(x.success), FONT_B, 'center');
        });
        y += 150;
        if (tms >= fl.total) { text(ctx, tf('cs.groupResult', { ok: m.okN, n }), cx, y, C['5'], FONT_B, 'center'); }
        y += 30;
      } else if (m.rolls.length) {
        const x = m.rolls[0];
        const two = (x.dice || []).length > 1;
        const r = 56, dy = y + 66;
        const dice = two ? x.dice : [x.natural];
        const used = dice.indexOf(x.natural);
        dice.forEach((v, i) => {
          const dx = two ? cx + (i ? 80 : -80) : cx;
          const val = settled ? v : face(frame, i);
          const dim = settled && two && i !== used ? 0.3 : 1;
          const c = tms >= fl.word ? col(m.success) : C.h;
          drawDie(ctx, dx, dy, r * (settled || tms > A.tumbleMs - 120 ? 1 : 0.92 + 0.08 * Math.sin(tms / 40 + i)), val, c, dim, FONT_XL, settled ? 0 : tms / 90 + i);
        });
        if (two && settled) text(ctx, x.mode === 'adv' ? t('check.adv') : x.mode === 'dis' ? t('check.dis') : '', cx, dy + r + 6, C['4'], FONT, 'center');
        y = dy + r + 30;
        // modifiers left to right
        if (tms >= fl.settle) {
          const segs = [{ s: `d20 [${x.natural}]`, c: C['5'] }];
          x.parts.forEach((p, i) => { if (tms >= fl.mods + i * A.modsStepMs) segs.push({ s: `${sign(p.value)} ${p.label}`, c: p.value >= 0 ? C.j : C.c }); });
          ctx.font = FONT_B;
          const gap = 18;
          const wsum = segs.reduce((s, sg) => s + ctx.measureText(sg.s).width, 0) + gap * (segs.length - 1);
          let sx = cx - Math.min(wsum, L.W - 48) / 2;
          for (const sg of segs) { text(ctx, sg.s, sx, y, sg.c, FONT_B); sx += ctx.measureText(sg.s).width + gap; }
        }
        y += 30;
        if (tms >= fl.total) text(ctx, tf('cs.vs', { n: x.total, dc: m.dc }), cx, y, C['5'], FONT_L, 'center');
        y += 36;
      } else y += 40;
      if (S.phase === 'roll') { text(ctx, t('cs.skip'), cx, L.y + L.H - 30, C['3'], FONT, 'center'); return; }
      // result: outcome word, text, consequences
      text(ctx, t(`cs.${m.outcome}`), cx, y, col(m.success), FONT_XL, 'center');
      y += 60;
      for (const line of m.text || []) for (const l of wrap(ctx, line, L.W - 64, FONT)) { text(ctx, l, cx, y, C['5'], FONT, 'center'); y += 20; }
      y += 6;
      if (S.fromMemo) { text(ctx, t('cs.memo'), cx, y, C['4'], FONT, 'center'); y += 20; }
      const fxs = (m.fx || []).map((f) => f.text).join(' · ');
      if (fxs) for (const l of wrap(ctx, fxs, L.W - 64, FONT_B)) { text(ctx, l, cx, y, C.a, FONT_B, 'center'); y += 20; }
      S.btns.push({ x: cx - 100, y: L.y + L.H - 56, w: 200, h: 40, label: t('battle.continue'), run: finish });
    },
  };
  game.setScene(self);
  return self;
}

/** A d20: hexagon with the inner triangle, value in the middle; spin — rotation angle while tumbling. */
function drawDie(ctx, x, y, r, value, color, alpha = 1, font = FONT_XL, spin = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(spin ? Math.sin(spin) * 0.5 : 0);
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 3; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = C['2']; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
  // inner triangle facets
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * 0.62, pts[0][1] * 0.62 + r * 0.25); ctx.lineTo(pts[2][0] * 0.62, pts[2][1] * 0.62 + r * 0.05); ctx.lineTo(pts[4][0] * 0.62, pts[4][1] * 0.62 + r * 0.05); ctx.closePath();
  ctx.lineWidth = 1; ctx.strokeStyle = C['3']; ctx.stroke();
  ctx.rotate(spin ? -Math.sin(spin) * 0.5 : 0);
  const px = Number((/(\d+)px/.exec(font) || [0, 24])[1]);
  text(ctx, String(value), 0, -Math.round(px / 2) - 1, color, font, 'center');
  ctx.restore();
}
