// Card game «Хлам и Кринж» and the casino — world side (docs/specs/cards-casino.md §4–6). No DOM: collection and decks in
// the save, rivals, rewards, card vendors, battle loot, casino games (dice / slots / roulette), limits, debt, quest hooks.
// save.cards = { owned: {id: n}, decks: [{name, hero, ids}], active, wins: {npc: n}, heroes: [ids],
//   vendor: {npc: {period, ids}}, casino: {day, net, loan: {amount, day} | null, overdue, tourDay} }
import { CARDS, CARD_IDS, CARD_RULES, CARD_HEROES, CARD_SETS, CARD_RIVALS, STARTER_DECK, RARITY, CASINO, CARD_ECONOMY, cardsBySet } from '../data/cards.js';
import { startQuest, allSlots, completeSlot } from './quests.js';
import { applyRep, normFaction } from './reputation.js';
import { journal } from './state.js';
import { t } from '../data/text/index.js';

export const CARD_DATA = { CARDS, CARD_RULES, CARD_HEROES };
const day = (save) => save.day || 0;

/** Lazy normalisation of save.cards (old saves get the starter collection). */
export function cardsState(save) {
  if (!save.cards || typeof save.cards !== 'object') save.cards = {};
  const c = save.cards;
  if (!c.owned) {
    c.owned = {};
    for (const id of STARTER_DECK) c.owned[id] = (c.owned[id] || 0) + 1;
  }
  if (!Array.isArray(c.decks) || !c.decks.length) c.decks = [{ name: t('cards.starterDeck'), hero: 'h-wanderer', ids: [...STARTER_DECK] }];
  if (!(c.active >= 0 && c.active < c.decks.length)) c.active = 0;
  c.wins ||= {};
  c.heroes ||= ['h-wanderer'];
  c.vendor ||= {};
  c.casino ||= { day: day(save), net: 0, loan: null, overdue: false, tourDay: null };
  return c;
}

export const rivalOf = (npcId) => CARD_RIVALS.find((r) => r.npc === npcId) || null;
export const activeDeck = (save) => { const c = cardsState(save); return c.decks[c.active]; };
const setOfHero = (hero) => CARD_HEROES[hero]?.set || 'neu';
export const ownedCount = (save, id) => cardsState(save).owned[id] || 0;
export const copiesMax = (id) => (CARDS[id]?.rarity === 'legendary' ? CARD_RULES.maxCopiesLegendary : CARD_RULES.maxCopies);
export const deckSets = (hero) => ['neu', setOfHero(hero)];

/** Can card id go into a deck of this hero? (own faction + neutral only, no tokens) */
export const cardAllowed = (hero, id) => !!CARDS[id] && !CARDS[id].token && deckSets(hero).includes(CARDS[id].set);

/** Problems of a deck: [] — ready. Strings are keys of data/text/cards.js. */
export function deckErrors(save, deck) {
  const out = [];
  if (deck.ids.length !== CARD_RULES.deckSize) out.push('cards.err.size');
  const n = {};
  for (const id of deck.ids) n[id] = (n[id] || 0) + 1;
  for (const [id, k] of Object.entries(n)) {
    if (!cardAllowed(deck.hero, id)) { out.push('cards.err.set'); break; }
    if (k > copiesMax(id)) { out.push('cards.err.copies'); break; }
    if (k > ownedCount(save, id)) { out.push('cards.err.owned'); break; }
  }
  return out;
}

/** Add a card to a deck → null or an error key. */
export function deckAdd(save, deck, id) {
  if (deck.ids.length >= CARD_RULES.deckSize) return 'cards.err.size';
  if (!cardAllowed(deck.hero, id)) return 'cards.err.set';
  const k = deck.ids.filter((x) => x === id).length;
  if (k >= copiesMax(id)) return 'cards.err.copies';
  if (k >= ownedCount(save, id)) return 'cards.err.owned';
  deck.ids.push(id);
  return null;
}
export function deckRemove(deck, id) { const i = deck.ids.indexOf(id); if (i >= 0) deck.ids.splice(i, 1); }

/** «Автосбор»: owned allowed cards by the curve (cost 1–3 ×12, 4–5 ×6, 6+ ×2), the rest — the best of what is left. */
export function autoBuild(save, deck) {
  const pool = [];
  for (const [id, n] of Object.entries(cardsState(save).owned)) if (cardAllowed(deck.hero, id)) for (let k = 0; k < Math.min(n, copiesMax(id)); k++) pool.push(id);
  const val = (id) => { const c = CARDS[id]; return (c.atk || 0) + (c.hp || 0) + (c.fx?.length || 0) * 2 + ({ common: 0, rare: 1, epic: 2, legendary: 3 }[c.rarity] || 0) - (c.cost || 0); };
  pool.sort((a, b) => val(b) - val(a));
  const band = (id) => { const c = CARDS[id].cost || 0; return c <= 3 ? 0 : c <= 5 ? 1 : 2; };
  const want = [12, 6, 2];
  const ids = [];
  const used = pool.map(() => false);
  for (const b of [0, 1, 2]) pool.forEach((id, i) => { if (!used[i] && band(id) === b && want[b] > 0 && ids.length < CARD_RULES.deckSize) { ids.push(id); want[b]--; used[i] = true; } });
  pool.forEach((id, i) => { if (!used[i] && ids.length < CARD_RULES.deckSize) ids.push(id); });
  deck.ids = ids.sort((a, b) => (CARDS[a].cost || 0) - (CARDS[b].cost || 0));
  return deck;
}

/** Heroes a deck can use: Странник + heroes of beaten rivals. */
export const heroesOwned = (save) => cardsState(save).heroes.filter((h) => CARD_HEROES[h]);

export function giveCard(save, id, n = 1) {
  const c = cardsState(save);
  if (!CARDS[id] || CARDS[id].token) return;
  c.owned[id] = (c.owned[id] || 0) + n;
}

// ------------------------------------------------------------------ packs, rewards, loot
const weighted = (rng, list) => {
  const tot = list.reduce((t, id) => t + RARITY[CARDS[id].rarity].w, 0);
  let r = rng() * tot;
  for (const id of list) { r -= RARITY[CARDS[id].rarity].w; if (r <= 0) return id; }
  return list[list.length - 1];
};
/** A pack: CARD_ECONOMY.packSize cards of the sets (no legends), at least one rare or better. */
export function rollPack(rng, sets) {
  const pool = sets.flatMap((s) => cardsBySet(s)).filter((c) => c.rarity !== 'legendary').map((c) => c.id);
  const out = [];
  for (let i = 0; i < CARD_ECONOMY.packSize; i++) out.push(weighted(rng, pool));
  if (!out.some((id) => CARDS[id].rarity !== 'common')) {
    const rares = pool.filter((id) => CARDS[id].rarity !== 'common');
    out[out.length - 1] = weighted(rng, rares);
  }
  return out;
}

/** Can the hero sit down with this rival? → null or a reason key. */
export function rivalBlock(save, rival, stake = rival.stake) {
  if ((save.hero.credits || 0) < stake) return 'cards.noMoney';
  if (deckErrors(save, activeDeck(save)).length) return 'cards.deckBad';
  return null;
}

/**
 * Settle a finished match: stake paid / lost, first win → `reward`, later wins → 25% pack of the rival's set; the rival's
 * hero becomes available. quest — a quest card slot (no stake payout: the quest is the prize). → [{text, color}] (cards: ids got)
 */
export function settleMatch(save, rival, won, { stake = rival.stake, rng = Math.random, quest = null } = {}) {
  const c = cardsState(save);
  const out = { lines: [], cards: [] };
  if (!won) {
    save.hero.credits = Math.max(0, (save.hero.credits || 0) - stake);
    out.lines.push({ key: 'cards.lost', n: stake, color: 'c' });
    return out;
  }
  if (!quest) { save.hero.credits = (save.hero.credits || 0) + stake; out.lines.push({ key: 'cards.wonStake', n: stake, color: 'a' }); }
  const first = !c.wins[rival.npc];
  c.wins[rival.npc] = (c.wins[rival.npc] || 0) + 1;
  if (!c.heroes.includes(rival.hero)) { c.heroes.push(rival.hero); out.lines.push({ key: 'cards.heroGot', name: CARD_HEROES[rival.hero]?.name, color: 'h' }); }
  if (first) out.cards.push(...rival.reward);
  else if (rng() < CARD_ECONOMY.winPack.chance) out.cards.push(...rollPack(rng, [setOfHero(rival.hero)]));
  for (const id of out.cards) giveCard(save, id);
  return out;
}

const SET_BY_FACTION = Object.fromEntries(Object.entries(CARD_SETS).filter(([, s]) => s.faction).map(([k, s]) => [s.faction, k]));
SET_BY_FACTION.mutantsPlant = 'mut';
/** Card from a won battle (spec §4): 4% / 25% boss, of the faction set (neutral otherwise). → id or null. */
export function battleCard(save, faction, boss, rng = Math.random) {
  if (rng() >= (boss ? CARD_ECONOMY.lootChance.boss : CARD_ECONOMY.lootChance.common)) return null;
  const set = SET_BY_FACTION[normFaction(faction)] || 'neu';
  const pool = cardsBySet(set).filter((c) => boss || c.rarity !== 'legendary').map((c) => c.id);
  const id = weighted(rng, pool);
  giveCard(save, id);
  return id;
}

// ------------------------------------------------------------------ vendors
export const cardVendor = (npcId) => CARD_ECONOMY.vendors.find((v) => v.npc === npcId) || null;
const PERIOD = 5;
/** The vendor's singles (6, refreshed every 5 days, deterministic by npc + period). */
export function vendorStock(save, npcId) {
  const v = cardVendor(npcId);
  if (!v) return [];
  const c = cardsState(save);
  const period = Math.floor(day(save) / PERIOD);
  const cur = c.vendor[npcId];
  if (cur && cur.period === period) return cur.ids;
  let h = period * 7919;
  for (const ch of npcId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  const pool = v.stock.flatMap((s) => cardsBySet(s)).filter((x) => x.rarity !== 'legendary').map((x) => x.id);
  const ids = [];
  for (let i = 0; i < 12 && ids.length < 6; i++) { const id = weighted(rng, pool); if (!ids.includes(id)) ids.push(id); }
  c.vendor[npcId] = { period, ids };
  return ids;
}
export const buyPrice = (id) => RARITY[CARDS[id]?.rarity]?.buy ?? null;
export const sellPrice = (id) => RARITY[CARDS[id]?.rarity]?.sell ?? 0;
/** Spare copies (owned − the most any deck uses) — only those can be sold. */
export function spareCopies(save, id) {
  const c = cardsState(save);
  const used = Math.max(0, ...c.decks.map((d) => d.ids.filter((x) => x === id).length));
  return Math.max(0, (c.owned[id] || 0) - used);
}
export function buyCard(save, id) {
  const p = buyPrice(id);
  if (p == null || save.hero.credits < p) return false;
  save.hero.credits -= p; giveCard(save, id); return true;
}
export function sellCard(save, id) {
  if (spareCopies(save, id) <= 0) return false;
  cardsState(save).owned[id]--; save.hero.credits += sellPrice(id); return true;
}
export function buyPack(save, npcId, rng = Math.random) {
  const v = cardVendor(npcId);
  if (!v?.pack || save.hero.credits < CARD_ECONOMY.packPrice) return null;
  save.hero.credits -= CARD_ECONOMY.packPrice;
  const ids = rollPack(rng, v.stock);
  for (const id of ids) giveCard(save, id);
  return ids;
}

// ------------------------------------------------------------------ casino
const L = CASINO.limits;
/** The casino ledger of today (resets on a new day; debt interest and overdue are checked here). */
export function casinoState(save) {
  const cs = cardsState(save).casino;
  if (cs.day !== day(save)) { cs.day = day(save); cs.net = 0; }
  syncDebt(save);
  syncTournament(save);
  return cs;
}

/** Why the tables are closed: null | key. */
export function tablesClosed(save) {
  const cs = casinoState(save);
  if (cs.overdue) return 'casino.closedDebt';
  if (cs.net <= -L.dailyNetLoss) return 'casino.closedLoss';
  if (cs.net > L.dailyNetWin) return 'casino.closedWin';
  return null;
}

/** Bet check for a game ('cards'|'dice'|'slots'|'roulette') → null | key. */
export function betBlock(save, game, bet) {
  const closed = tablesClosed(save);
  if (closed) return closed;
  if (!(bet >= L.minBet[game] && bet <= L.maxBet[game])) return 'casino.badBet';
  if ((save.hero.credits || 0) < bet) return 'cards.noMoney';
  return null;
}

/** Book a result: delta — net credits (+ won / − lost). */
export function casinoSettle(save, delta) {
  const cs = casinoState(save);
  save.hero.credits = Math.max(0, (save.hero.credits || 0) + delta);
  cs.net += delta;
}

const d6 = (rng) => 1 + Math.floor(rng() * 6);
const diceSum = (d) => d[0] + d[1] + (d[0] === d[1] ? CASINO.dice.doubleBonus : 0);
/** Dice: the player's roll (2d6). */
export const rollPair = (rng = Math.random) => [d6(rng), d6(rng)];
export const diceValue = diceSum;
export const canReroll = (d) => diceSum(d) < 8;
/** Reroll one die (index i) of the player. */
export function rerollDie(d, i, rng = Math.random) { const n = [...d]; n[i] = d6(rng); return n; }
/** The house: 2d6, rerolls its lower die when the sum < 7. → dice. */
export function houseRoll(rng = Math.random) {
  let h = rollPair(rng);
  if (diceSum(h) < 7) h = rerollDie(h, h[0] <= h[1] ? 0 : 1, rng);
  return h;
}
/** Payout (total returned) of a dice round: ×2 on a win, ties — the house. */
export const dicePayout = (bet, p, h) => (diceSum(p) > diceSum(h) ? bet * CASINO.dice.payout : 0);

const REEL = Object.entries(CASINO.slots.reel).flatMap(([k, n]) => Array(n).fill(k));
export const SLOT_SYMBOLS = Object.keys(CASINO.slots.reel);
export const spinReels = (rng = Math.random) => [0, 1, 2].map(() => REEL[Math.floor(rng() * REEL.length)]);
/** Multiplier of a spin (total returned = bet × mult). */
export function slotMult(r) {
  if (r[0] === r[1] && r[1] === r[2]) return CASINO.slots.triple[r[0]];
  const n = (k) => r.filter((x) => x === k).length;
  if (n('cringe') === 2) return CASINO.slots.any.twoCringe;
  if (n('tushenka') === 2) return CASINO.slots.any.twoTushenka;
  return 0;
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Roulette pocket: 0..36, 37 = «00 Кринж». */
export const spinWheel = (rng = Math.random) => Math.floor(rng() * CASINO.roulette.pockets);
export const pocketName = (p) => (p === 37 ? '00' : String(p));
export const pocketColor = (p) => (p === 0 || p === 37 ? 'green' : RED.has(p) ? 'red' : 'black');
/** bet kind: {kind: 'num', n} | {kind: 'red'|'black'|'even'|'odd'} | {kind: 'dozen', n: 1..3}. → total returned. */
export function roulettePayout(bet, kind, p) {
  const P = CASINO.roulette.pay;
  const num = p >= 1 && p <= 36;
  if (kind.kind === 'num') return p === kind.n ? bet * (P.straight + 1) : 0;
  if (!num) return 0;
  if (kind.kind === 'red' || kind.kind === 'black') return pocketColor(p) === kind.kind ? bet * (P.redBlack + 1) : 0;
  if (kind.kind === 'even' || kind.kind === 'odd') return (p % 2 === 0) === (kind.kind === 'even') ? bet * (P.evenOdd + 1) : 0;
  if (kind.kind === 'dozen') return Math.ceil(p / 12) === kind.n ? bet * (P.dozen + 1) : 0;
  return 0;
}

// ------------------------------------------------------------------ debt (spec §6)
const D = CASINO.debt;
/** What is owed now (interest +20% per full 3 days). */
export function debtOwed(save) {
  const loan = cardsState(save).casino.loan;
  if (!loan) return 0;
  return Math.round(loan.amount * (1 + D.interestPer3Days) ** Math.floor((day(save) - loan.day) / 3));
}
export const debtDue = (save) => { const l = cardsState(save).casino.loan; return l ? l.day + D.dueDays : null; };
export const loanRoom = (save) => (cardsState(save).casino.loan ? 0 : D.maxLoan);

export function takeLoan(save, amount) {
  const cs = cardsState(save).casino;
  if (cs.loan || amount <= 0 || amount > D.maxLoan) return false;
  cs.loan = { amount, day: day(save) };
  save.hero.credits = (save.hero.credits || 0) + amount;
  save.flags['casino-loan'] = true;
  const q = CASINO.quests.debt;
  if (!save.quests[q] || save.quests[q].state !== 'active') { delete save.quests[q]; startQuest(save, q); }
  return true;
}

/** Pay the debt with credits. */
export function repayLoan(save) {
  const owed = debtOwed(save);
  if (!owed || save.hero.credits < owed) return false;
  save.hero.credits -= owed;
  clearDebt(save);
  return true;
}

export function clearDebt(save) {
  const cs = cardsState(save).casino;
  cs.loan = null; cs.overdue = false;
  delete save.flags['casino-loan'];
  const q = save.quests[CASINO.quests.debt];
  if (q?.state === 'active') { q.state = 'done'; journal(save, t('casino.debtClosed')); }
}

/** Overdue: Pirates −3 once, tables closed; the debt quest done → the debt is written off. */
export function syncDebt(save) {
  const cs = cardsState(save).casino;
  if (!cs.loan) return;
  if (save.quests[CASINO.quests.debt]?.state === 'done') { cs.loan = null; cs.overdue = false; delete save.flags['casino-loan']; return; }
  if (!cs.overdue && day(save) > cs.loan.day + D.dueDays) {
    cs.overdue = true;
    for (const [f, v] of Object.entries(D.overdue.rep)) applyRep(save, f, v);
    save.flags['casino-collectors'] = true;
  }
}

// ------------------------------------------------------------------ quests: card goals { kind: 'card', npc, stake?, tournament? }
/** Active card slots of quests (for an NPC, or the tournament ones). */
export const cardSlots = (save, npcId = null) => allSlots(save).filter((s) => s.goal?.kind === 'card' && (!npcId || s.goal.npc === npcId));

/** Report a card match of a quest slot. won → completeSlot; tournament loss → the tournament fails. → toasts */
export function cardSlotResult(save, slot, won, data) {
  if (won) {
    const out = completeSlot(save, slot, data);
    const qs = save.quests[slot.qid];
    if (slot.qid === CASINO.quests.tournament && qs?.state === 'done') {
      giveCard(save, CASINO.tournament.prize.card);
      cardsState(save).casino.tourDay = day(save);
      out.push({ text: `+ ${CARDS[CASINO.tournament.prize.card].name}`, color: 'a' });
    }
    if (slot.qid === CASINO.quests.debt) syncDebt(save);
    return out;
  }
  if (slot.goal.tournament) {
    const qs = save.quests[slot.qid];
    qs.state = 'failed';
    cardsState(save).casino.tourDay = day(save);
    journal(save, t('casino.tourOut'));
    return [{ text: t('casino.tourOut'), color: 'c' }];
  }
  return [];
}

/** The tournament repeats every cooldownDays: a finished entry is cleared after the cooldown. */
export function syncTournament(save) {
  const id = CASINO.quests.tournament;
  const q = save.quests?.[id];
  const cs = cardsState(save).casino;
  if (q && q.state !== 'active' && cs.tourDay != null && day(save) >= cs.tourDay + CASINO.tournament.cooldownDays) delete save.quests[id];
}

export { CARDS, CARD_IDS, CARD_HEROES, CARD_SETS, CARD_RIVALS, CASINO, CARD_ECONOMY, RARITY, CARD_RULES };
