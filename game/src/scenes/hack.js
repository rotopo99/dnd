// Mini-game «Взлом» (docs/specs/cyberspace-v2.md §4): a scene over the caller (id 'hack'), logic — world/hack.js.
// openHack(game, { tier, title, member, adv, turnsBonus, back, onDone(game, { ok, battle, loot, trace }) }):
// click a neighbour node → action buttons (Пройти / Взломать with the chance / Отмычка ICE / Обойти) + «Откат»;
// the result panel → «Дальше» → game.resume(back) → onDone. Cache loot is granted by the caller.
import { t } from '../data/text/index.js';
import { tf } from '../world/state.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, text, panel, button, hitButton, clear, bar, fit } from '../ui/draw.js';
import { makeHack, hackOptions, hackAct, neighbours } from '../world/hack.js';
import { checkInfo, checkChance, rollCheck } from '../world/checks.js';
import { HACK_RULES } from '../data/world/cyberspace.js';
import { hotspot } from '../ui/tooltip.js';
import { dropItem } from '../world/inventory.js';

const KIND_COL = { entry: 'h', open: '4', ice: 'f', trap: 'c', cache: 'a', core: 'n' };

export function openHack(game, o) {
  const save = game.save;
  const h = makeHack(o.tier || 1, { turnsBonus: o.turnsBonus || 0, trapsVisible: !!o.trapsVisible, trace: o.trace || 0 });
  if (o.dc) h.dc = o.dc; // real-world hacks: HACK_EFFECTS.dc
  const S = { h, sel: null, buttons: [], hover: null, time: 0, pos: [], result: null };
  const hasPick = () => (save.hero.items?.['cs-ice-pick'] || 0) > 0;
  const best = (skills) => skills.map((s) => checkInfo(o.member, s, o.adv || null)).sort((a, b) => checkChance(b, h.dc) - checkChance(a, h.dc))[0];
  const roll = (skills, dc) => { const info = best(skills); return rollCheck(o.member, info, dc); };

  function layout(g) {
    const W = g.width, H = g.height;
    const cols = Math.max(...h.nodes.map((n) => n.col)) + 1;
    const x0 = 160, x1 = W - 160, ymid = 150 + (H - 420) / 2;
    S.pos = h.nodes.map((n) => ({ x: x0 + (x1 - x0) * n.col / (cols - 1), y: ymid + (n.row - (n.rows - 1) / 2) * 120 }));
    S.buttons = [];
    if (h.done) { S.buttons.push({ id: 'done', label: t('hack.continue'), x: W / 2 - 120, y: H - 110, w: 240, h: 48 }); return; }
    const by = H - 120;
    const opts = S.sel != null ? hackOptions(h, S.sel, { hasPick: hasPick() }) : [];
    let x = W / 2 - (opts.length + 1) * 130;
    for (const op of opts) {
      const sub = op.act === 'hack' ? tf('hack.chance', { n: Math.round(checkChance(best(HACK_RULES.nodeKinds.ice.check), h.dc) * 100) }) : tf('hack.cost', { t: op.cost, tr: op.trace });
      S.buttons.push({ id: op.act, label: t(`hack.act.${op.act}`), sub, x, y: by, w: 240, h: 56, key: String(S.buttons.length + 1) });
      x += 260;
    }
    S.buttons.push({ id: 'rollback', label: t('hack.act.rollback'), sub: `×${h.rollback}`, x, y: by, w: 240, h: 56, disabled: h.rollback <= 0 || !h.prev.length });
  }

  function act(g, id) {
    if (id === 'done') { g.resume(o.back); o.onDone?.(g, { ok: h.done === 'win', battle: h.battle, loot: h.loot, trace: h.trace, usedPick: h.usedPick || 0 }); return; }
    const r = hackAct(h, id, S.sel, { roll, hasPick: hasPick() });
    if (!r.ok) return;
    if (id === 'pick') dropItem(save, 'cs-ice-pick', 1);
    const last = h.log[h.log.length - 1]?.key || '';
    play(h.done === 'win' ? 'buff' : h.done ? 'debuff' : /Fail|trap|locked/.test(last) ? 'miss' : 'uiClick');
    S.sel = null;
    layout(g);
  }

  const scene = {
    id: 'hack',
    get S() { return S; },
    enter(g) { layout(g); },
    resume(g) { layout(g); },
    resize(g) { layout(g); },
    update(g, dt) {
      S.time += dt;
      const m = g.input.mouse;
      S.hover = hitButton(S.buttons, m);
      if (m.clicked) {
        if (S.hover && !S.hover.disabled) return act(g, S.hover.id);
        if (!h.done) {
          const i = S.pos.findIndex((p) => Math.hypot(p.x - m.x, p.y - m.y) < 30);
          if (i >= 0 && neighbours(h).includes(i)) { S.sel = i; play('uiClick'); layout(g); }
        }
      }
      for (let k = 0; k < 9; k++) if (g.input.wasPressed(`Digit${k + 1}`) && S.buttons[k] && !S.buttons[k].disabled) return act(g, S.buttons[k].id);
      if (h.done && g.input.wasPressed('Enter')) act(g, 'done');
    },
    render(g) {
      const { ctx, width: W, height: H } = g;
      clear(ctx, W, H);
      ctx.fillStyle = C.i;
      for (let y = Math.floor(S.time * 20) % 6; y < H; y += 6) ctx.fillRect(0, y, W, 1);
      text(ctx, fit(ctx, `${t('hack.title')}: ${o.title || ''}`, W - 80, FONT_L), W / 2, 30, C.h, FONT_L, 'center');
      text(ctx, `${t('hack.turns')}: ${h.turns}/${h.maxTurns}`, 40, 96, C['5'], FONT_B);
      text(ctx, t('hack.trace'), W - 360, 96, C.n, FONT_B);
      bar(ctx, W - 240, 100, 200, 10, Math.min(h.trace, h.cap), h.cap, 'mrl');
      text(ctx, `${h.trace}/${h.cap}`, W - 40, 96, C.n, FONT_B, 'right');
      // edges
      ctx.lineWidth = 3;
      for (const [a, b] of h.edges) {
        const hot = (a === h.at || b === h.at);
        ctx.strokeStyle = hot ? C.h : C['3'];
        ctx.beginPath(); ctx.moveTo(S.pos[a].x, S.pos[a].y); ctx.lineTo(S.pos[b].x, S.pos[b].y); ctx.stroke();
      }
      const nb = new Set(neighbours(h));
      h.nodes.forEach((n, i) => {
        const p = S.pos[i];
        const kind = n.kind === 'trap' && n.hidden ? 'open' : n.kind;
        const col = n.locked ? C['3'] : n.broken ? C.j : C[KIND_COL[kind]];
        ctx.fillStyle = i === h.at ? C.i : C['1'];
        ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = i === S.sel ? 5 : nb.has(i) ? 3 : 2;
        ctx.strokeStyle = i === S.sel ? C['5'] : col; ctx.stroke();
        const glyph = { entry: '▶', open: '·', ice: n.broken ? '◇' : '◆', trap: '!', cache: '$', core: '◎' }[kind];
        text(ctx, glyph, p.x, p.y - 10, col, FONT_L, 'center');
        if (i === h.at) text(ctx, '●', p.x, p.y + 28, C.h, FONT_B, 'center');
        hotspot(p.x - 26, p.y - 26, 52, 52, { title: t(`hack.kind.${kind}`), lines: [HACK_RULES.nodeKinds[kind]?.desc || ''].filter(Boolean) });
      });
      // log
      const log = h.log.slice(-4);
      log.forEach((l, k) => text(ctx, tf(l.key, { item: g.data.ITEMS?.[l.item]?.name || l.item, total: l.total }), 40, H - 250 + k * 22, C['4'], FONT));
      if (!h.done && S.sel == null) text(ctx, t('hack.pick'), W / 2, H - 160, C['4'], FONT, 'center');
      if (h.done) {
        const win = h.done === 'win';
        panel(ctx, W / 2 - 260, H - 220, 520, 90, C['0'], win ? C.j : C.c);
        text(ctx, win ? t('hack.win') : h.battle ? t('hack.failBattle') : t('hack.fail'), W / 2, H - 196, win ? C.j : C.c, FONT_L, 'center');
      }
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
  game.setScene(scene);
  return scene;
}
