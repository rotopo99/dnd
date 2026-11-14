// «Хлам и Кринж» in the world (docs/specs/cards-casino.md §4–6): NPC buttons (world/npc-actions.js adds them), the match start
// with a stake, rewards, quest card goals, card vendors (singles / pack / sell spare copies), the casino entry (Мадам Ставка).
// cardActs(game, npc, acts) → acts with { id: 'cards:play' | 'cards:quest:<k>' | 'cards:shop' | 'cards:casino' } added;
// doCardAct(game, npc, id) — runs one; startRivalMatch(game, rival, {stake, quest, casino, back, done}).
import { t } from '../data/text/index.js';
import { saveGame } from '../save.js';
import { members, tf } from '../world/state.js';
import { repTier, normFaction, tierAtLeast } from '../world/reputation.js';
import { npcRepFaction, QUESTS } from '../world/data.js';
import { openCheck } from '../ui/checks-ui.js';
import { cardTip } from '../ui/card-view.js';
import { startCardMatch } from './cards.js';
import {
  rivalOf, rivalBlock, settleMatch, cardSlots, cardSlotResult, cardVendor, vendorStock, buyPrice, buyCard, buyPack, spareCopies, sellCard, sellPrice,
  cardsState, casinoSettle, CARDS, CASINO, CARD_ECONOMY, CARD_HEROES,
} from '../world/cards.js';

const L = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const toastAll = (game, list) => { for (const x of list) game.toast(x.text, x.color); };
const tierOfNpc = (game, npc) => { const f = normFaction(npcRepFaction(npc)); return f && f !== 'none' ? repTier(game.save.rep[f] ?? 0) : 'neutral'; };
const permitKey = (npc) => `cards-permit:${npc}`;

/** Add the card buttons of an NPC. */
export function cardActs(game, npc, acts) {
  const sv = game.save;
  const rival = rivalOf(npc.id);
  if (rival) {
    const why = rivalBlock(sv, rival);
    acts.push({ id: 'cards:play', label: L('cards.playBtn', { n: rival.stake }), disabled: !!why, reason: why ? t(why) : null });
  }
  cardSlots(sv, npc.id).filter((s) => !s.goal.tournament).forEach((s, k) => acts.push({ id: `cards:quest:${k}`, label: L('cards.questBtn', { name: QUESTS[s.qid]?.name || s.qid }) }));
  if (cardVendor(npc.id)) acts.push({ id: 'cards:shop', label: t('cards.shopBtn') });
  if (npc.id === CASINO.owner) {
    const ok = tierAtLeast(repTier(sv.rep.pirates ?? 0), 'neutral');
    acts.push({ id: 'cards:casino', label: t('casino.enter'), disabled: !ok, reason: ok ? null : t('casino.repNeed') });
  }
  return acts;
}

export function doCardAct(game, npc, id) {
  const sv = game.save;
  const back = game.scene;
  if (id === 'cards:play') {
    const rival = rivalOf(npc.id);
    // hostile factions refuse: Deception / Persuasion DC 13 once
    if (tierOfNpc(game, npc) === 'hostile' && !sv.flags[permitKey(npc.id)]) {
      return openCheck(game, { title: npc.name, lines: [t('cards.refuse')], skills: ['deception', 'persuasion'], dc: 13, members: members(sv, game.data), cancel: true,
        onDone: (g, ok) => { if (ok) { sv.flags[permitKey(npc.id)] = true; startRivalMatch(g, rival, { back }); } else g.toast(t('cards.refused'), 'c'); } });
    }
    return startRivalMatch(game, rival, { back });
  }
  if (id.startsWith('cards:quest:')) {
    const slot = cardSlots(sv, npc.id).filter((s) => !s.goal.tournament)[+id.split(':')[2]];
    if (slot) return startQuestMatch(game, slot, back);
    return;
  }
  if (id === 'cards:shop') return openCardShop(game, npc);
  if (id === 'cards:casino') return import('./casino.js').then((m) => m.openCasino(game, back));
}

/** Lines of settleMatch → toasts/result lines. */
function settleLines(r) {
  const out = r.lines.map((l) => ({ text: L(l.key, l), color: l.color }));
  for (const id of r.cards) out.push({ text: L('cards.gotCard', { name: CARDS[id]?.name }), color: 'a' });
  return out;
}

/**
 * Start a match with a rival. o: { stake, quest (slot), casino (book through the casino ledger), back, done(game, won) }.
 */
export function startRivalMatch(game, rival, o = {}) {
  const sv = game.save;
  const stake = o.stake ?? rival.stake;
  const why = stake > 0 ? rivalBlock(sv, rival, stake) : rivalBlock(sv, rival, 0);
  if (why) { game.toast(t(why), 'c'); return; }
  startCardMatch(game, {
    rival, back: o.back || game.scene,
    onEnd: (g, won) => {
      let lines;
      if (o.casino) {
        const r = settleMatch(sv, rival, won, { stake: 0, quest: true });
        casinoSettle(sv, won ? stake : -stake);
        lines = [{ text: won ? L('cards.wonStake', { n: stake }) : L('cards.lost', { n: stake }), color: won ? 'a' : 'c' }, ...settleLines({ ...r, lines: r.lines.filter((l) => l.key !== 'cards.lost') })];
      } else lines = settleLines(settleMatch(sv, rival, won, { stake, quest: o.quest }));
      if (o.quest) lines.push(...cardSlotResult(sv, o.quest, won, g.data));
      saveGame(sv);
      o.done?.(g, won);
      toastAll(g, lines.slice(0, 3));
      return lines;
    },
  });
}

/** A quest card goal (stake from the goal; tournament rounds — no stake). */
export function startQuestMatch(game, slot, back) {
  const rival = rivalOf(slot.goal.npc);
  if (!rival) return;
  return startRivalMatch(game, rival, { stake: slot.goal.stake ?? rival.stake, quest: slot, back });
}

// ---------------------------------------------------------------- card vendor
export function openCardShop(game, npc) {
  const sv = game.save;
  const v = cardVendor(npc.id);
  game.openModal({
    title: L('cards.shopTitle', { name: npc.name }), width: 760,
    build: () => {
      const ids = vendorStock(sv, npc.id);
      return {
        lines: [{ text: `${t('cards.credits')}: ${sv.hero.credits} · ${t('cards.shopHint')}`, color: 'a' }],
        options: [
          ...ids.map((id) => {
            const p = buyPrice(id);
            return { label: `${CARDS[id].name}`, sub: `${t(`cards.type.${CARDS[id].type}`)} · ${p} ${t('cards.cr')} · ${t('cards.owned')} ${cardsState(sv).owned[id] || 0}`, keep: true,
              disabled: sv.hero.credits < p, reason: t('cards.noMoney'), detail: cardTip(CARDS[id]),
              run: (g) => { if (buyCard(sv, id)) { g.toast(L('cards.gotCard', { name: CARDS[id].name }), 'a'); saveGame(sv); } } };
          }),
          ...(v.pack ? [{ label: L('cards.packBtn', { n: CARD_ECONOMY.packPrice }), sub: t('cards.packSub'), keep: true, disabled: sv.hero.credits < CARD_ECONOMY.packPrice, reason: t('cards.noMoney'),
            run: (g) => { const got = buyPack(sv, npc.id); if (got) { saveGame(sv); g.openModal({ title: t('cards.packTitle'), lines: got.map((id) => ({ text: `${CARDS[id].name} · ${t(`cards.rar.${CARDS[id].rarity}`)}`, color: CARDS[id].rarity === 'common' ? '5' : 'a' })), options: [{ label: t('cards.ok'), run: () => {} }] }); } } }] : []),
          { label: t('cards.sellBtn'), sub: t('cards.sellSub'), run: (g) => openSell(g) },
          { label: t('cards.close'), run: () => {} },
        ],
      };
    },
  });
}

function openSell(game) {
  const sv = game.save;
  game.openModal({
    title: t('cards.sellTitle'), width: 720,
    build: () => {
      const spare = Object.keys(cardsState(sv).owned).filter((id) => spareCopies(sv, id) > 0).sort((a, b) => sellPrice(b) - sellPrice(a));
      return {
        lines: [{ text: `${t('cards.credits')}: ${sv.hero.credits} · ${t('cards.sellHint')}`, color: 'a' }, ...(spare.length ? [] : [{ text: t('cards.sellNone'), color: '4' }])],
        options: [
          ...spare.slice(0, 8).map((id) => ({ label: CARDS[id].name, sub: `+${sellPrice(id)} ${t('cards.cr')} · ${t('cards.spare')} ${spareCopies(sv, id)}`, keep: true, detail: cardTip(CARDS[id]),
            run: () => { if (sellCard(sv, id)) saveGame(sv); } })),
          { label: t('cards.close'), run: () => {} },
        ],
      };
    },
  });
}

export { CARD_HEROES, tf };
