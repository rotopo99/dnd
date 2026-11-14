// Tab «Карты» of the panels (K): the collection (filters: set / cost / rarity, «×n» owned) on the left, the deck editor on the right
// (deck and hero choice, «n/20», cost curve, list — click removes, «Автосбор», «Новая колода», «Сделать активной»).
// Click a collection card — add it to the edited deck (own faction + neutral only). docs/specs/cards-casino.md §4.
// layoutCards / clickCards / updateCards / renderCards(game, S) — state S.cd. Does not use the inventory grid.
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, text, fit, panel } from '../ui/draw.js';
import { hotspot } from '../ui/tooltip.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar } from '../ui/scroll.js';
import { drawCard, cardTip, SET_COLOR } from '../ui/card-view.js';
import { saveGame } from '../save.js';
import {
  cardsState, cardAllowed, deckAdd, deckRemove, deckErrors, autoBuild, heroesOwned, CARDS, CARD_IDS, CARD_SETS, CARD_HEROES, CARD_RULES,
} from '../world/cards.js';

const SETS = ['all', ...Object.keys(CARD_SETS)];
const COSTS = ['all', 1, 2, 3, 4, 5, 6];
const RARS = ['all', 'common', 'rare', 'epic', 'legendary'];
const CW = 100, CH = 140, GAP = 8, COLS = 7;
const GRID = { x: 24, y: 140, w: COLS * (CW + GAP) + 12, h: 560 };
const RIGHT = { x: 880, y: 66, w: 376, h: 634 };
const LIST = { x: 888, y: 360, w: 360, h: 332 };

const st = (S) => (S.cd ||= { set: 'all', cost: 'all', rar: 'all', di: null, gs: createScroll(), ls: createScroll() });
const L = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function shown(save, cd) {
  const c = cardsState(save);
  return CARD_IDS.filter((id) => (c.owned[id] || 0) > 0).filter((id) => {
    const k = CARDS[id];
    if (cd.set !== 'all' && k.set !== cd.set) return false;
    if (cd.cost !== 'all' && (cd.cost === 6 ? k.cost < 6 : k.cost !== cd.cost)) return false;
    if (cd.rar !== 'all' && k.rarity !== cd.rar) return false;
    return true;
  }).sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name));
}
const deckOf = (save, cd) => { const c = cardsState(save); if (!(Number.isInteger(cd.di) && cd.di >= 0 && cd.di < c.decks.length)) cd.di = c.active; return c.decks[cd.di]; };
const groups = (deck) => { const m = new Map(); for (const id of deck.ids) m.set(id, (m.get(id) || 0) + 1); return [...m].sort((a, b) => CARDS[a[0]].cost - CARDS[b[0]].cost); };

export function layoutCards(game, S, b) {
  const cd = st(S);
  const sv = game.save;
  const c = cardsState(sv);
  const deck = deckOf(sv, cd);
  const ox = S.ox, oy = S.oy;
  SETS.forEach((s, i) => b.push({ kind: 'cf', f: 'set', v: s, label: s === 'all' ? t('cards.all') : CARD_SETS[s].name, x: ox + 24 + i * 94, y: oy + 66, w: 90, h: 30, font: '12px monospace', selected: cd.set === s }));
  COSTS.forEach((v, i) => b.push({ kind: 'cf', f: 'cost', v, label: v === 'all' ? `⚡ ${t('cards.all')}` : v === 6 ? '6+' : String(v), x: ox + 24 + i * 52, y: oy + 102, w: 48, h: 30, font: '12px monospace', selected: cd.cost === v }));
  RARS.forEach((v, i) => b.push({ kind: 'cf', f: 'rar', v, label: v === 'all' ? t('cards.all') : t(`cards.rar.${v}`), x: ox + 400 + i * 94, y: oy + 102, w: 90, h: 30, font: '12px monospace', selected: cd.rar === v }));
  // grid cards (hidden buttons)
  const ids = shown(sv, cd);
  ids.forEach((id, i) => {
    const x = GRID.x + (i % COLS) * (CW + GAP), y = GRID.y + Math.floor(i / COLS) * (CH + GAP) - cd.gs.off;
    if (y + CH < GRID.y || y > GRID.y + GRID.h) return;
    b.push({ kind: 'cadd', id, x: ox + x, y: oy + Math.max(y, GRID.y), w: CW, h: Math.min(y + CH, GRID.y + GRID.h) - Math.max(y, GRID.y), hidden: true, tip: () => cardTip(CARDS[id], [{ text: cardAllowed(deck.hero, id) ? t('cards.clickAdd') : t('cards.err.set'), color: cardAllowed(deck.hero, id) ? 'j' : 'c' }]) });
  });
  // right column
  const R = { x: ox + RIGHT.x, y: oy + RIGHT.y };
  b.push({ kind: 'cdeck', d: -1, label: '◀', x: R.x + 8, y: R.y + 8, w: 36, h: 32 });
  b.push({ kind: 'cdeck', d: 1, label: '▶', x: R.x + RIGHT.w - 44, y: R.y + 8, w: 36, h: 32 });
  b.push({ kind: 'chero', d: 1, label: `${t('cards.heroLbl')}: ${CARD_HEROES[deck.hero]?.name}`, x: R.x + 8, y: R.y + 46, w: RIGHT.w - 16, h: 30, font: FONT,
    tip: () => ({ title: CARD_HEROES[deck.hero]?.name, lines: [`${t('cards.passive')}: ${CARD_HEROES[deck.hero]?.passive}`, `${t('cards.power')}: ${CARD_HEROES[deck.hero]?.power.name} — ${CARD_HEROES[deck.hero]?.power.text}`, { text: t('cards.heroCycle'), color: '4' }] }) });
  b.push({ kind: 'cauto', label: t('cards.auto'), x: R.x + 8, y: R.y + 84, w: 116, h: 32, font: FONT });
  b.push({ kind: 'cnew', label: t('cards.newDeck'), x: R.x + 130, y: R.y + 84, w: 116, h: 32, font: FONT });
  b.push({ kind: 'cactive', label: c.active === cd.di ? t('cards.isActive') : t('cards.makeActive'), x: R.x + 252, y: R.y + 84, w: 116, h: 32, font: FONT, selected: c.active === cd.di });
  b.push({ kind: 'cclear', label: t('cards.clear'), x: R.x + 8, y: R.y + 122, w: 116, h: 28, font: '12px monospace' });
  groups(deck).forEach(([id], i) => {
    const y = LIST.y + i * 24 - cd.ls.off;
    if (y + 22 < LIST.y || y > LIST.y + LIST.h - 4) return;
    b.push({ kind: 'crem', id, x: ox + LIST.x, y: oy + y, w: LIST.w - 12, h: 22, hidden: true, tip: () => cardTip(CARDS[id], [{ text: t('cards.clickRemove'), color: '4' }]) });
  });
}

export function clickCards(game, S, b) {
  if (!b.kind?.startsWith('c') || b.kind === 'card') return false;
  const cd = st(S);
  const sv = game.save;
  const c = cardsState(sv);
  const deck = deckOf(sv, cd);
  if (b.kind === 'cf') { cd[b.f] = b.v; cd.gs.off = 0; return true; }
  if (b.kind === 'cadd') { const e = deckAdd(sv, deck, b.id); if (e) game.toast(t(e), 'c'); else saveGame(sv); return true; }
  if (b.kind === 'crem') { deckRemove(deck, b.id); saveGame(sv); return true; }
  if (b.kind === 'cdeck') { cd.di = (cd.di + b.d + c.decks.length) % c.decks.length; cd.ls.off = 0; return true; }
  if (b.kind === 'chero') {
    const hs = heroesOwned(sv);
    deck.hero = hs[(hs.indexOf(deck.hero) + 1) % hs.length];
    deck.ids = deck.ids.filter((id) => cardAllowed(deck.hero, id));
    saveGame(sv);
    return true;
  }
  if (b.kind === 'cauto') { autoBuild(sv, deck); saveGame(sv); return true; }
  if (b.kind === 'cnew') { c.decks.push({ name: L('cards.deckN', { n: c.decks.length + 1 }), hero: 'h-wanderer', ids: [] }); cd.di = c.decks.length - 1; saveGame(sv); return true; }
  if (b.kind === 'cactive') {
    if (deckErrors(sv, deck).length) { game.toast(t(deckErrors(sv, deck)[0]), 'c'); return true; }
    c.active = cd.di; saveGame(sv); game.toast(t('cards.activeSet'), 'j'); return true;
  }
  if (b.kind === 'cclear') { deck.ids = []; saveGame(sv); return true; }
  return false;
}

/** Wheel / sliders of the grid and the deck list. → true if a slider is busy. */
export function updateCards(game, S) {
  const cd = st(S);
  const sv = game.save;
  const m = game.input.mouse;
  const n = shown(sv, cd).length;
  const o1 = cd.gs.off, o2 = cd.ls.off;
  const used = updateScroll(cd.gs, { x: S.ox + GRID.x, y: S.oy + GRID.y, w: GRID.w, h: GRID.h }, Math.ceil(n / COLS) * (CH + GAP), m, { step: CH + GAP })
    || updateScroll(cd.ls, { x: S.ox + LIST.x, y: S.oy + LIST.y, w: LIST.w, h: LIST.h }, groups(deckOf(sv, cd)).length * 24 + 4, m, { step: 48 });
  if (o1 !== cd.gs.off || o2 !== cd.ls.off) S.relayout = true;
  return used;
}

export function renderCards(game, S) {
  const { ctx } = game;
  const cd = st(S);
  const sv = game.save;
  const c = cardsState(sv);
  const deck = deckOf(sv, cd);
  const ox = S.ox, oy = S.oy;
  // grid
  const gv = { x: ox + GRID.x, y: oy + GRID.y, w: GRID.w, h: GRID.h };
  const ids = shown(sv, cd);
  beginClip(ctx, gv);
  const inDeck = new Map(groups(deck));
  ids.forEach((id, i) => {
    const x = gv.x + (i % COLS) * (CW + GAP), y = gv.y + Math.floor(i / COLS) * (CH + GAP) - cd.gs.off;
    if (y + CH < gv.y || y > gv.y + gv.h) return;
    const k = CARDS[id];
    drawCard(ctx, k, x, y, CW, CH, { small: true, faded: !cardAllowed(deck.hero, id), count: c.owned[id] });
    if (inDeck.get(id)) text(ctx, `${inDeck.get(id)}`, x + 6, y + CH - 44, C.h, FONT_B);
  });
  if (!ids.length) text(ctx, t('cards.emptyFilter'), gv.x + 20, gv.y + 20, C['4'], FONT);
  endClip(ctx);
  drawScrollbar(ctx, cd.gs, gv);
  // right panel
  const R = { x: ox + RIGHT.x, y: oy + RIGHT.y };
  panel(ctx, R.x, R.y, RIGHT.w, RIGHT.h, C['1'], C['3']);
  text(ctx, fit(ctx, `${deck.name}${c.active === cd.di ? ' ★' : ''}`, RIGHT.w - 100, FONT_B), R.x + RIGHT.w / 2, R.y + 15, C.a, FONT_B, 'center');
  const errs = deckErrors(sv, deck);
  text(ctx, `${deck.ids.length}/${CARD_RULES.deckSize}`, R.x + 140, R.y + 128, deck.ids.length === CARD_RULES.deckSize ? C.j : C.c, FONT_B);
  text(ctx, fit(ctx, errs.length ? t(errs[0]) : t('cards.deckOk'), 150, '12px monospace'), R.x + 210, R.y + 131, errs.length ? C.c : C.j, '12px monospace');
  // cost curve 0..7+
  const curve = Array(8).fill(0);
  for (const id of deck.ids) curve[Math.min(7, CARDS[id].cost)]++;
  const mx = Math.max(4, ...curve);
  for (let i = 0; i < 8; i++) {
    const h = Math.round((curve[i] / mx) * 90);
    ctx.fillStyle = C.f; ctx.fillRect(R.x + 24 + i * 42, R.y + 252 - h, 30, h);
    text(ctx, i === 7 ? '7+' : String(i), R.x + 39 + i * 42, R.y + 256, C['4'], '12px monospace', 'center');
    if (curve[i]) text(ctx, String(curve[i]), R.x + 39 + i * 42, R.y + 236 - h, C['5'], '12px monospace', 'center');
  }
  text(ctx, t('cards.curve'), R.x + 8, R.y + 150, C['4'], '12px monospace');
  // list
  const lv = { x: ox + LIST.x, y: oy + LIST.y, w: LIST.w, h: LIST.h };
  beginClip(ctx, lv);
  groups(deck).forEach(([id, n], i) => {
    const y = lv.y + i * 24 - cd.ls.off;
    const k = CARDS[id];
    panel(ctx, lv.x, y, lv.w - 12, 22, C['2'], C[SET_COLOR[k.set]]);
    text(ctx, String(k.cost), lv.x + 12, y + 3, C.b, FONT_B, 'center');
    text(ctx, fit(ctx, k.name, lv.w - 80, FONT), lv.x + 28, y + 3, C['5'], FONT);
    text(ctx, `×${n}`, lv.x + lv.w - 20, y + 3, C.a, FONT, 'right');
  });
  endClip(ctx);
  drawScrollbar(ctx, cd.ls, lv);
  const all = Object.values(c.owned).reduce((a, x) => a + x, 0);
  text(ctx, L('cards.collection', { n: all, k: Object.keys(c.owned).filter((id) => c.owned[id] > 0).length, total: CARD_IDS.length }), R.x + 8, R.y + 274, C['4'], '12px monospace');
  hotspot(R.x + 8, R.y + 150, RIGHT.w - 16, 120, { title: t('cards.curve'), lines: [t('cards.curveHint')] });
  for (const b of S.buttons) if (b.tip && b.kind?.startsWith('c')) hotspot(b.x, b.y, b.w, b.h, b.tip);
}
