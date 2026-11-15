// Roguelike «Забег» — reward screen (docs/specs/roguelike.md §4): three cards, pick one (click / 1–3), one reroll per run,
// «Пропустить». Also the relic choice (boss: 1 of 3, elite: an offer of 1). Logic — world/run.js.
import { t } from '../data/text/index.js';
import { RELICS } from '../data/roguelike.js';
import { TALENTS } from '../data/talents.js';
import { C, FONT, FONT_B, FONT_L, text, textBlock, button, hitButton, clear, panel } from '../ui/draw.js';
import { itemStats } from '../ui/items-ui.js';
import { play } from '../audio/sfx.js';
import { takeReward, skipReward, rerollReward, takeRelic, saveRun } from '../world/run.js';
import { CARDS } from '../data/cards.js';

const RAR_COLOR = { common: '4', rare: 'b', epic: 'h' };

/** Card view of a reward / relic: { title, kind, sub, desc, rarity }. */
export function cardView(game, c) {
  const D = game.data;
  if (c.kind === 'relic') { const r = RELICS.find((x) => x.id === c.id); return { kind: t('run.kind.relic'), title: r?.name || c.id, rarity: r?.rarity || 'rare', desc: relicDesc(r) }; }
  if (c.kind === 'talent') { const tl = TALENTS[c.id]; return { kind: t('run.kind.talent'), title: tl?.name || c.id, rarity: c.rarity, desc: tl?.desc || '' }; }
  if (c.kind === 'item' || c.kind === 'mod') {
    const it = D.ITEMS[c.id];
    return { kind: t(`run.kind.${c.kind}`), title: `${it?.name || c.id}${c.n > 1 ? ` ×${c.n}` : ''}`, rarity: c.rarity, desc: [itemStats(it), it?.desc || ''].filter(Boolean).join(' · ') };
  }
  if (c.kind === 'card') return { kind: t('run.kind.card'), title: t('run.pack'), rarity: c.rarity, desc: (c.cards || []).map((id) => CARDS[id]?.name || id).join(', ') };
  return { kind: t('run.kind.credits'), title: `+${c.credits} ${t('run.credits')}`, rarity: c.rarity, desc: '' };
}
const relicDesc = (r) => (r ? Object.entries(r.fx).map(([k, v]) => `${k}: ${v === true ? '✓' : v}`).join(', ') : '');

/**
 * openRunReward(game, run, { offer? | relics?: [id], title?, optional?: true, onDone(game) }) — a scene over the map.
 */
export function openRunReward(game, run, o) {
  const back = game.scene;
  const S = { offer: o.offer || null, relics: o.relics || null, buttons: [], hover: null };
  const done = (g) => { saveRun(run); o.onDone ? o.onDone(g, back) : g.resume(back); };

  function cards() { return S.relics ? S.relics.map((id) => ({ kind: 'relic', id })) : S.offer.cards; }
  function layout(g) {
    const W = g.width, H = g.height;
    const list = cards();
    const cw = 300, ch = 300, gap = 24;
    const x0 = Math.floor((W - (list.length * cw + (list.length - 1) * gap)) / 2), y0 = Math.floor(H / 2) - 170;
    const B = list.map((c, i) => ({ id: 'card', i, c, x: x0 + i * (cw + gap), y: y0, w: cw, h: ch, label: '', key: String(i + 1) }));
    const by = y0 + ch + 30;
    if (S.offer) B.push({ id: 'reroll', x: W / 2 - 230, y: by, w: 220, h: 44, label: `${t('run.reroll')} (${run.rerolls})`, key: 'R', disabled: run.rerolls <= 0 });
    B.push({ id: 'skip', x: W / 2 + (S.offer ? 10 : -110), y: by, w: 220, h: 44, label: t('run.skip'), key: 'Esc' });
    S.buttons = B;
  }
  function pick(g, i) {
    const c = cards()[i];
    if (!c) return;
    if (S.relics) takeRelic(run, c.id);
    else {
      takeReward(run, S.offer, c);
      const view = cardView(g, c);
      g.toast(`${view.kind}: ${view.title}`, 'j');
    }
    done(g);
  }
  const scene = {
    id: 'run-reward',
    S,
    enter(g) { layout(g); },
    resize(g) { layout(g); },
    update(g) {
      layout(g);
      const inp = g.input, m = inp.mouse;
      const h = hitButton(S.buttons, m);
      if (h !== S.hover && h) play('uiHover');
      S.hover = h;
      let act = m.clicked && h && !h.disabled ? h : null;
      for (let i = 1; i <= 3; i++) if (inp.wasPressed(`Digit${i}`)) act = { id: 'card', i: i - 1 };
      if (inp.wasPressed('KeyR') && S.offer && run.rerolls > 0) act = { id: 'reroll' };
      if (inp.wasPressed('Escape')) act = { id: 'skip' };
      if (!act) return;
      play('uiClick');
      if (act.id === 'card') pick(g, act.i);
      else if (act.id === 'reroll') { const o2 = rerollReward(run, S.offer); if (o2) S.offer = o2; }
      else if (act.id === 'skip') { if (S.offer) skipReward(run); done(g); }
    },
    render(g) {
      const { ctx, width: W } = g;
      clear(ctx, W, g.height);
      const hero = S.offer && run.party.find((x) => x.id === S.offer.hero);
      const title = o.title || (S.relics ? t('run.relicPick') : t('run.reward'));
      text(ctx, title, W / 2, 60, C.h, FONT_L, 'center');
      if (hero) text(ctx, `${t('run.rewardFor')}: ${hero.name} (${g.data.CLASSES[hero.cls]?.name || hero.cls})`, W / 2, 100, C['4'], FONT_B, 'center');
      text(ctx, `${t('run.credits')}: ${run.credits}`, W / 2, 124, C.a, FONT, 'center');
      for (const b of S.buttons) {
        if (b.id !== 'card') { button(ctx, b, S.hover === b); continue; }
        const v = cardView(g, b.c);
        const col = C[RAR_COLOR[v.rarity] || '4'];
        panel(ctx, b.x, b.y, b.w, b.h, S.hover === b ? C['2'] : C['1'], S.hover === b ? C.h : col);
        text(ctx, b.key, b.x + 10, b.y + 8, C.a, FONT_B);
        text(ctx, v.kind, b.x + b.w / 2, b.y + 14, col, FONT_B, 'center');
        textBlock(ctx, v.title, b.x + 16, b.y + 48, b.w - 32, C['5'], FONT_L, 28, 3);
        text(ctx, t(`run.rar.${v.rarity}`), b.x + b.w / 2, b.y + 140, col, FONT, 'center');
        textBlock(ctx, v.desc, b.x + 16, b.y + 168, b.w - 32, C['4'], FONT, 20, 6);
      }
    },
  };
  game.setScene(scene);
  return scene;
}
