// Card game «Хлам и Кринж» — match engine (docs/specs/cards-casino.md §2–3). Pure logic: no DOM, no data imports;
// data = { CARDS, CARD_RULES, CARD_HEROES } is passed in. Works in the browser and in Node (tools/test.mjs).
//
// State M = { data, rng, sides: [S, S], cur, first, turn, winner, ev: [events], uid }.
//   S = { i, name, hero, hp, maxHp, armor, deck: [ids, top = last], hand: [{uid, id}], field: [U|null × 5],
//         gadgets: [{uid, id, dur}], charge, chargeMax, burn, powerUsed, tax, taxNext, spells, castUsed, ai, tier, acts }
//   U = { uid, id, atk, hp, maxHp, kw, tags, shield, sick, attacked, buffs: [{atk, turns, kw}], st: {stun, poison, cringed, cringeAtk} }
// Refs (targets): { s, slot } — a creature, { s, hero: true } — a hero, { s, gadget: i } — a gadget.
// Actions: { type: 'play', idx, slot?, targets? } | { type: 'attack', from, target } | { type: 'power', targets? } | { type: 'end' }.
// Events (M.ev, for animations and the match log): turn, draw, overdraw, fatigue, play, summon, attack, dmg, heal, shieldPop,
//   death, destroy, buff, status, gadgetGone, discard, steal, roll, scry, gain, power, end.
//
// Decisions on holes of the spec:
// - the first player also draws at the start of turn 1; a creature's «Выход» without a legal target fizzles (the creature is
//   still played), a spell needs a target for every «choose»;
// - «Предсказатель» (scry) decides by itself: a card that costs more than next turn's charge + 1 is discarded;
// - stun / poison tick at the end of the owner's turn, «cringed» at the start of the owner's turn («до его хода»);
// - timed buffs (turns: N) expire at the end of a turn; armor lasts until the owner's next turn;
// - Cringe aura: sum of the opponent's auras (+1 for the hero «Кринж-Вождь» if any), capped by cringeAuraCap, never below ATK 1;
// - the AI may hit a Taunt it survives (chip damage) and always hits an empty-board hero — keeps AI vs AI games short.
import { createRng } from './rng.js';

const SLOT_EDGE = [0, 4, 1, 3, 2];
const SLOT_CENTER = [2, 1, 3, 0, 4];

const cardOf = (M, id) => M.data.CARDS[id];
const R = (M) => M.data.CARD_RULES;
export const other = (s) => 1 - s;
const push = (M, e) => { M.ev.push(e); return e; };

function shuffle(rng, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ------------------------------------------------------------------ creation
/**
 * New match. sides: [{ name, hero, deck: [ids], ai?: {aggro, risk}, tier? }] × 2; first: 0 | 1 | null (random).
 * Deals the opening hands and starts the first turn.
 */
export function createMatch(data, { seed = 1, sides, first = null }) {
  const rng = createRng(seed);
  const M = { data, rng, seed, sides: [], cur: 0, first: 0, turn: 0, winner: null, ev: [], uid: 1 };
  M.sides = sides.map((p, i) => {
    const H = data.CARD_HEROES[p.hero] || {};
    const hp = H.hp ?? data.CARD_RULES.heroHp;
    return { i, name: p.name || H.name || '?', hero: p.hero, hp, maxHp: hp, armor: 0, deck: shuffle(rng, [...p.deck]), hand: [],
      field: Array(data.CARD_RULES.fieldSlots).fill(null), gadgets: [], charge: 0, chargeMax: 0, burn: 0, powerUsed: false,
      tax: 0, taxNext: 0, spells: 0, castUsed: false, ai: p.ai || null, tier: p.tier || 0, acts: 0 };
  });
  M.first = first ?? (rng() < 0.5 ? 0 : 1);
  M.cur = M.first;
  const SH = data.CARD_RULES.startHand;
  for (const s of [M.first, other(M.first)]) {
    const S = M.sides[s];
    let n = s === M.first ? SH.first : SH.second;
    if (S.hero === 'h-pir') n++; // «Знает заранее»
    for (let k = 0; k < n; k++) draw(M, s, true);
    if (s !== M.first) addHand(M, s, 'tok_coin');
  }
  startTurn(M);
  return M;
}

function mkUnit(M, s, id) {
  const c = cardOf(M, id);
  const u = { uid: M.uid++, id, atk: c.atk || 0, hp: c.hp || 1, maxHp: c.hp || 1, kw: [...(c.kw || [])], tags: c.tags || [],
    shield: (c.kw || []).includes('shield'), sick: true, attacked: false, buffs: [], st: { stun: 0, poison: 0, cringed: 0, cringeAtk: 0 } };
  if (id === 'tok_scrap' && M.sides[s].hero === 'h-scv') { u.hp++; u.maxHp++; } // «Барахло»
  return u;
}

// ------------------------------------------------------------------ queries
export const unitAt = (M, ref) => (ref && ref.slot !== undefined ? M.sides[ref.s].field[ref.slot] : null);
export const units = (M, s) => M.sides[s].field.map((u, slot) => (u ? { s, slot, u } : null)).filter(Boolean);
export const kwOf = (u) => [...u.kw, ...u.buffs.filter((b) => b.kw).map((b) => b.kw)];
export const hasKw = (u, k) => (k === 'shield' ? u.shield : kwOf(u).includes(k));
const freeSlots = (M, s) => M.sides[s].field.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);

/** Cringe aura that hits side s (from the opponent's board). */
export function cringeOn(M, s) {
  const o = other(s);
  let n = 0;
  for (const { u } of units(M, o)) n += cardOf(M, u.id).cringe || 0;
  if (n > 0 && M.sides[o].hero === 'h-crg') n++;
  return Math.min(n, R(M).cringeAuraCap);
}

/** Current attack of the creature in (s, slot): base + buffs + neighbour auras + hero passives − Cringe. */
export function atkOf(M, s, slot) {
  const S = M.sides[s];
  const u = S.field[slot];
  if (!u) return 0;
  let a = u.atk;
  for (const b of u.buffs) a += b.atk || 0;
  for (const d of [-1, 1]) {
    const n = S.field[slot + d];
    if (n) for (const f of cardOf(M, n.id).fx || []) if (f.on === 'aura' && f.op === 'buff' && f.to === 'adjacent-allies') a += f.atk || 0;
  }
  if (S.hero === 'h-tin' && u.shield) a++;
  if (S.hero === 'h-mut' && hasKw(u, 'poison')) a++;
  if (!cardOf(M, u.id).immuneCringe) { const c = cringeOn(M, s); if (c && a > 1) a = Math.max(1, a - c); }
  if (u.st.cringed > 0) a += u.st.cringeAtk;
  return Math.max(0, a);
}

/** Cost of a card for side s now (tax, hero passives). */
export function costOf(M, s, id) {
  const S = M.sides[s];
  const c = cardOf(M, id);
  let n = (c.cost || 0) + S.tax;
  if (c.type === 'gadget' && S.hero === 'h-ai') n--;
  if (c.type === 'spell' && S.hero === 'h-tkh' && S.spells === 0) n--;
  return Math.max(0, n);
}

/** The «choose» targets a card / hero power needs, in order: [{ to, where }]. */
export function chooseList(fx) {
  const out = [];
  const add = (to, where) => { if (to?.startsWith('choose') && !out.some((x) => x.to === to)) out.push({ to, where }); };
  for (const f of fx || []) {
    if (f.on && f.on !== 'play') continue;
    add(f.to, f.op === 'destroy' ? f.where : null);
    if (f.vs) add(f.vs, null);
  }
  return out;
}
const playFx = (c) => (c.fx || []).filter((f) => !f.on || f.on === 'play');

function whereOk(M, s, slot, where) {
  if (!where) return true;
  const u = M.sides[s].field[slot];
  const c = cardOf(M, u.id);
  if (where.atkMax !== undefined && atkOf(M, s, slot) > where.atkMax) return false;
  if (where.costMax !== undefined && (c.cost || 0) > where.costMax) return false;
  if (where.tag && !u.tags.includes(where.tag)) return false;
  if (where.kw && !hasKw(u, where.kw)) return false;
  return true;
}

/** Legal refs for a «choose» kind for side s (srcUid — the creature being played is never its own target). */
export function chooseCands(M, s, to, where = null, srcUid = 0) {
  const o = other(s);
  const cr = (side) => units(M, side).filter((x) => x.u.uid !== srcUid && whereOk(M, x.s, x.slot, where)).map(({ s: ss, slot }) => ({ s: ss, slot }));
  const hero = (side) => ({ s: side, hero: true });
  switch (to) {
    case 'choose-enemy': return [...cr(o), hero(o)];
    case 'choose-enemy-creature': return cr(o);
    case 'choose-ally-creature': return cr(s);
    case 'choose-ally': return [...cr(s), hero(s)];
    case 'choose-any': return [...cr(s), ...cr(o), hero(s), hero(o)];
    case 'choose-any-creature': return [...cr(s), ...cr(o)];
    case 'choose-enemy-gadget': return M.sides[o].gadgets.map((g, i) => ({ s: o, gadget: i }));
    default: return [];
  }
}

/** Can side s play hand card idx now? → { ok, why: 'charge'|'slot'|'target'|'gadgets'|'turn' } */
export function canPlay(M, s, idx) {
  if (M.winner !== null || M.cur !== s) return { ok: false, why: 'turn' };
  const S = M.sides[s];
  const h = S.hand[idx];
  if (!h) return { ok: false, why: 'turn' };
  const c = cardOf(M, h.id);
  if (costOf(M, s, h.id) > S.charge) return { ok: false, why: 'charge' };
  if (c.type === 'creature' && !freeSlots(M, s).length) return { ok: false, why: 'slot' };
  if (c.type === 'gadget' && S.gadgets.length >= 2) return { ok: false, why: 'gadgets' };
  if (c.type === 'spell' && chooseList(c.fx).some((ch) => !chooseCands(M, s, ch.to, ch.where).length)) return { ok: false, why: 'target' };
  return { ok: true };
}

/** Ready to attack? (on board, not attacked, not stunned, ATK > 0, not «sick» unless Rush). */
export function canAttack(M, s, slot) {
  const u = M.sides[s].field[slot];
  if (!u || M.winner !== null || M.cur !== s) return false;
  return !u.attacked && u.st.stun <= 0 && atkOf(M, s, slot) > 0 && (!u.sick || hasKw(u, 'rush'));
}

/** Legal attack targets of (s, slot): Taunt creatures if any, else creatures + hero (not for a Rush creature on its first turn). */
export function attackTargets(M, s, slot) {
  const u = M.sides[s].field[slot];
  if (!u) return [];
  const o = other(s);
  const all = units(M, o);
  const taunts = all.filter((x) => hasKw(x.u, 'taunt'));
  if (taunts.length) return taunts.map(({ s: ss, slot: sl }) => ({ s: ss, slot: sl }));
  const out = all.map(({ s: ss, slot: sl }) => ({ s: ss, slot: sl }));
  if (!u.sick) out.push({ s: o, hero: true });
  return out;
}

export function canPower(M, s) {
  const S = M.sides[s];
  const H = M.data.CARD_HEROES[S.hero];
  if (!H || M.winner !== null || M.cur !== s || S.powerUsed || S.charge < R(M).heroPowerCost) return false;
  return chooseList(H.power.fx).every((ch) => chooseCands(M, s, ch.to, ch.where).length > 0);
}

// ------------------------------------------------------------------ primitive changes
function addHand(M, s, id) {
  const S = M.sides[s];
  if (S.hand.length >= R(M).handMax) { push(M, { t: 'overdraw', s, id }); return null; }
  const h = { uid: M.uid++, id };
  S.hand.push(h);
  return h;
}

function draw(M, s, quiet = false) {
  const S = M.sides[s];
  if (!S.deck.length) {
    S.burn++;
    push(M, { t: 'fatigue', s, n: S.burn });
    damageHero(M, s, S.burn);
    return;
  }
  const id = S.deck.pop();
  if (addHand(M, s, id) && !quiet) push(M, { t: 'draw', s, id });
}

function damageHero(M, s, n) {
  const S = M.sides[s];
  if (n <= 0) return;
  const absorbed = Math.min(S.armor, n);
  S.armor -= absorbed;
  S.hp -= n - absorbed;
  push(M, { t: 'dmg', ref: { s, hero: true }, n: n - absorbed, armor: absorbed });
}

function healRef(M, ref, n) {
  if (ref.hero) {
    const S = M.sides[ref.s];
    const v = Math.min(n, S.maxHp - S.hp);
    S.hp += v;
    if (v > 0) push(M, { t: 'heal', ref, n: v });
    return;
  }
  const u = unitAt(M, ref);
  if (!u || u.hp <= 0) return;
  const v = Math.min(n, u.maxHp - u.hp);
  u.hp += v;
  if (v > 0) push(M, { t: 'heal', ref, n: v });
}

/** Damage a creature: Shield eats the whole hit; poison kills on any damage. */
function damageUnit(M, ref, n, poison = false) {
  const u = unitAt(M, ref);
  if (!u || n <= 0 || u.hp <= 0) return 0;
  if (u.shield) { u.shield = false; push(M, { t: 'shieldPop', ref: { ...ref } }); return 0; }
  u.hp -= n;
  if (poison) u.hp = Math.min(u.hp, 0);
  push(M, { t: 'dmg', ref: { ...ref }, n, poison: poison || undefined });
  return n;
}

function damageRef(M, ref, n, poison = false) {
  if (ref.hero) damageHero(M, ref.s, n);
  else damageUnit(M, ref, n, poison);
}

function summon(M, s, id, n, prefer = 2, fill = false) {
  const free = freeSlots(M, s).sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer));
  const k = fill ? Math.min(n, free.length) : Math.min(n, free.length);
  for (let i = 0; i < k; i++) {
    const slot = free[i];
    M.sides[s].field[slot] = mkUnit(M, s, id);
    push(M, { t: 'summon', s, slot, id });
  }
}

function destroyRef(M, ref) {
  if (ref.gadget !== undefined) {
    const g = M.sides[ref.s].gadgets[ref.gadget];
    if (g) { M.sides[ref.s].gadgets.splice(ref.gadget, 1); push(M, { t: 'gadgetGone', s: ref.s, id: g.id }); }
    return;
  }
  const u = unitAt(M, ref);
  if (!u || u.hp <= 0) return;
  u.hp = 0;
  u.destroyed = true;
  push(M, { t: 'destroy', ref: { ...ref } });
}

/** Remove the dead, fire «Финал» effects; repeat while somebody dies. Then check the end of the match. */
function cleanup(M) {
  for (let guard = 0; guard < 20; guard++) {
    const dead = [];
    for (const s of [M.cur, other(M.cur)]) M.sides[s].field.forEach((u, slot) => { if (u && u.hp <= 0) dead.push({ s, slot, u }); });
    if (!dead.length) break;
    for (const d of dead) { M.sides[d.s].field[d.slot] = null; push(M, { t: 'death', s: d.s, slot: d.slot, id: d.u.id }); }
    for (const d of dead) {
      const fx = (cardOf(M, d.u.id).fx || []).filter((f) => f.on === 'death');
      for (const f of fx) runFx(M, d.s, f, { slot: d.slot, srcUid: d.u.uid, dead: true });
    }
  }
  checkEnd(M);
}

function checkEnd(M) {
  if (M.winner !== null) return;
  const a = M.sides[0].hp <= 0, b = M.sides[1].hp <= 0;
  if (!a && !b) return;
  M.winner = a && b ? other(M.first) : a ? 1 : 0; // a draw is impossible: the second player wins a mutual 0
  push(M, { t: 'end', winner: M.winner });
}

// ------------------------------------------------------------------ effects
/** Refs for a non-choose `to` (ctx: { slot — source slot, srcUid, targets map, dead }). */
function refsFor(M, s, f, ctx) {
  const o = other(s);
  const cr = (side) => units(M, side).map(({ s: ss, slot }) => ({ s: ss, slot }));
  const where = f.op === 'destroy' ? f.where : null;
  const W = (list) => (where ? list.filter((r) => whereOk(M, r.s, r.slot, where)) : list);
  switch (f.to) {
    case 'self': return ctx.slot !== undefined && !ctx.dead && M.sides[s].field[ctx.slot]?.uid === ctx.srcUid ? [{ s, slot: ctx.slot }] : [];
    case 'self-hero': return [{ s, hero: true }];
    case 'enemy-hero': return [{ s: o, hero: true }];
    case 'all-enemy-creatures': return W(cr(o));
    case 'all-ally-creatures': return W(cr(s));
    case 'all-creatures': return W([...cr(s), ...cr(o)]);
    case 'all-other-creatures': return W([...cr(s), ...cr(o)]).filter((r) => M.sides[r.s].field[r.slot].uid !== ctx.srcUid);
    case 'adjacent-allies': return ctx.slot === undefined ? [] : [ctx.slot - 1, ctx.slot + 1].filter((i) => M.sides[s].field[i]).map((slot) => ({ s, slot }));
    case 'random-enemy-creature': { const l = W(cr(o)); return l.length ? [M.rng.pick(l)] : []; }
    case 'random-ally-creature': { const l = W(cr(s)); return l.length ? [M.rng.pick(l)] : []; }
    case 'weakest-enemy-creature': {
      const l = W(cr(o));
      if (!l.length) return [];
      const min = Math.min(...l.map((r) => unitAt(M, r).hp));
      return [l.find((r) => unitAt(M, r).hp === min)];
    }
    default:
      if (f.to?.startsWith('choose')) { const r = ctx.targets?.[f.to]; return r ? [r] : []; }
      return [];
  }
}

function runFx(M, s, f, ctx) {
  const S = M.sides[s];
  const o = other(s);
  if (f.if?.allyCreaturesMin && units(M, s).length < f.if.allyCreaturesMin) return;
  const op = f.op;
  if (op === 'summon') return summon(M, s, f.card, f.fill ? Math.min(f.n || 1, freeSlots(M, s).length) : f.n || 1, ctx.slot ?? 2, f.fill);
  if (op === 'draw') { for (let k = 0; k < (f.n || 1); k++) draw(M, f.to === 'enemy-hero' ? o : s); return; }
  if (op === 'gain') { S.charge += f.n || 1; push(M, { t: 'gain', s, n: f.n || 1 }); return; }
  if (op === 'give') { if (addHand(M, s, f.card)) push(M, { t: 'draw', s, id: f.card }); return; }
  if (op === 'tax') { M.sides[f.to === 'self-hero' ? s : o].taxNext += f.n || 1; push(M, { t: 'status', ref: { s: o, hero: true }, id: 'tax' }); return; }
  if (op === 'discard') {
    const t = f.to === 'self-hero' ? s : o;
    for (let k = 0; k < (f.n || 1) && M.sides[t].hand.length; k++) {
      const i = Math.floor(M.rng() * M.sides[t].hand.length);
      const [h] = M.sides[t].hand.splice(i, 1);
      push(M, { t: 'discard', s: t, id: h.id });
    }
    return;
  }
  if (op === 'steal') {
    for (let k = 0; k < (f.n || 1) && M.sides[o].hand.length; k++) {
      const i = Math.floor(M.rng() * M.sides[o].hand.length);
      const [h] = M.sides[o].hand.splice(i, 1);
      push(M, { t: 'steal', s, id: h.id });
      addHand(M, s, h.id);
    }
    return;
  }
  if (op === 'scry') {
    const id = S.deck[S.deck.length - 1];
    if (!id) return;
    const keep = (cardOf(M, id).cost || 0) <= Math.min(R(M).chargeMax, S.chargeMax + 1) + 1;
    if (!keep) S.deck.pop();
    push(M, { t: 'scry', s, id, kept: keep });
    return;
  }
  if (op === 'roll') {
    const n = M.rng.int(1, f.die || 6);
    push(M, { t: 'roll', s, n, die: f.die || 6 });
    for (const g of n <= (f.die || 6) / 2 ? f.low || [] : f.high || []) runFx(M, s, g, ctx);
    return;
  }
  if (op === 'drain') { damageHero(M, o, f.n || 1); healRef(M, { s, hero: true }, f.n || 1); return; }
  if (op === 'armor') { S.armor += f.n || 1; push(M, { t: 'status', ref: { s, hero: true }, id: 'armor', n: f.n }); return; }
  if (op === 'duel') {
    const a = refsFor(M, s, f, ctx)[0];
    const e = ctx.targets?.[f.vs];
    if (!a || !e || !unitAt(M, a) || !unitAt(M, e)) return;
    const da = atkOf(M, a.s, a.slot), de = atkOf(M, e.s, e.slot);
    const pa = hasKw(unitAt(M, a), 'poison'), pe = hasKw(unitAt(M, e), 'poison');
    damageUnit(M, e, da, pa);
    damageUnit(M, a, de, pe);
    return;
  }
  if (op === 'devour') {
    const victims = refsFor(M, s, { ...f, to: 'all-other-creatures' }, ctx);
    for (const r of victims) destroyRef(M, r);
    const self = M.sides[s].field[ctx.slot];
    if (self && self.uid === ctx.srcUid) {
      self.atk += victims.length * (f.atkPer || 1);
      self.hp += victims.length * (f.hpPer || 1);
      self.maxHp += victims.length * (f.hpPer || 1);
      if (victims.length) push(M, { t: 'buff', ref: { s, slot: ctx.slot } });
    }
    return;
  }
  if (op === 'cringe') return; // a passive aura (cringeOn)
  const refs = refsFor(M, s, f, ctx);
  for (const r of refs) {
    if (op === 'damage') {
      const u = unitAt(M, r);
      let n = f.n || 1;
      if (u && f.vsTag) for (const [tag, v] of Object.entries(f.vsTag)) if (u.tags.includes(tag)) n = v;
      damageRef(M, r, n);
    } else if (op === 'heal') healRef(M, r, f.n || 1);
    else if (op === 'destroy') destroyRef(M, r);
    else if (r.hero) continue;
    else {
      const u = unitAt(M, r);
      if (!u || u.hp <= 0) continue;
      if (op === 'shield') { u.shield = true; push(M, { t: 'buff', ref: r }); }
      else if (op === 'buff') {
        if (f.hp) { u.hp += f.hp; u.maxHp += f.hp; }
        if (f.turns) u.buffs.push({ atk: f.atk || 0, turns: f.turns, kw: f.kw || null });
        else { u.atk += f.atk || 0; if (f.kw) u.kw.push(f.kw); }
        push(M, { t: 'buff', ref: r });
      } else if (op === 'status') {
        if (f.id === 'stun') u.st.stun = Math.max(u.st.stun, f.turns || 1);
        else if (f.id === 'poison') u.st.poison = Math.max(u.st.poison, f.turns || 1);
        else if (f.id === 'cringed') { u.st.cringed = Math.max(u.st.cringed, f.turns || 1); u.st.cringeAtk = Math.min(u.st.cringeAtk, f.atk ?? -2); }
        push(M, { t: 'status', ref: r, id: f.id });
      }
    }
  }
}

/** Effects of a trigger (`on`) for side s: creatures (each with its own slot) and gadgets (dur − 1 per firing). */
function trigger(M, s, on) {
  const S = M.sides[s];
  S.field.forEach((u, slot) => {
    if (!u || u.hp <= 0) return;
    for (const f of cardOf(M, u.id).fx || []) if (f.on === on) runFx(M, s, f, { slot, srcUid: u.uid });
  });
  for (const g of [...S.gadgets]) {
    const fx = (cardOf(M, g.id).fx || []).filter((f) => f.on === on);
    if (!fx.length) continue;
    if (on === 'cast' && fx.some((f) => f.oncePerTurn) && S.castUsed) continue;
    if (on === 'cast') S.castUsed = true;
    for (const f of fx) runFx(M, s, f, {});
    g.dur--;
    push(M, { t: 'gadget', s, id: g.id, dur: g.dur });
    if (g.dur <= 0) { S.gadgets.splice(S.gadgets.indexOf(g), 1); push(M, { t: 'gadgetGone', s, id: g.id }); }
  }
}

// ------------------------------------------------------------------ turns
function startTurn(M) {
  const s = M.cur;
  const S = M.sides[s];
  M.turn++;
  S.chargeMax = Math.min(R(M).chargeMax, S.chargeMax + R(M).chargePerTurn);
  S.charge = S.chargeMax;
  S.armor = 0;
  S.tax = S.taxNext; S.taxNext = 0;
  S.powerUsed = false; S.spells = 0; S.castUsed = false; S.acts = 0;
  for (const u of S.field) if (u) {
    u.sick = false; u.attacked = false;
    if (u.st.cringed > 0 && --u.st.cringed <= 0) u.st.cringeAtk = 0;
  }
  push(M, { t: 'turn', s, turn: M.turn });
  draw(M, s);
  trigger(M, s, 'turn-start');
  cleanup(M);
}

function endTurnInner(M) {
  const s = M.cur;
  const S = M.sides[s];
  trigger(M, s, 'turn-end');
  S.field.forEach((u, slot) => {
    if (!u) return;
    if (u.st.stun > 0) u.st.stun--;
    if (u.st.poison > 0) { u.st.poison--; damageUnit(M, { s, slot }, 1); }
  });
  for (const side of M.sides) for (const u of side.field) if (u) u.buffs = u.buffs.filter((b) => --b.turns > 0);
  S.tax = 0;
  cleanup(M);
  if (M.winner !== null) return;
  M.cur = other(s);
  startTurn(M);
}

// ------------------------------------------------------------------ actions
/** Apply an action of the current side. → true if legal and done. */
export function act(M, a) {
  if (M.winner !== null || !a) return false;
  const s = M.cur;
  const S = M.sides[s];
  S.acts++;
  if (a.type === 'end') { endTurnInner(M); return true; }
  if (a.type === 'play') {
    if (!canPlay(M, s, a.idx).ok) return false;
    const h = S.hand[a.idx];
    const c = cardOf(M, h.id);
    const chooses = chooseList(c.fx);
    const targets = {};
    for (let i = 0; i < chooses.length; i++) {
      const t = a.targets?.[i];
      const cands = chooseCands(M, s, chooses[i].to, chooses[i].where);
      if (t && cands.some((x) => sameRef(x, t))) targets[chooses[i].to] = t;
      else if (c.type === 'spell') return false; // spells need every target
    }
    let slot = a.slot;
    if (c.type === 'creature') {
      const free = freeSlots(M, s);
      if (slot === undefined || !free.includes(slot)) slot = (hasKwCard(c, 'taunt') ? SLOT_CENTER : SLOT_EDGE).find((i) => free.includes(i));
    }
    S.charge -= costOf(M, s, h.id);
    S.hand.splice(a.idx, 1);
    push(M, { t: 'play', s, id: h.id, slot, type: c.type });
    if (c.type === 'creature') {
      const u = mkUnit(M, s, h.id);
      S.field[slot] = u;
      for (const f of playFx(c)) runFx(M, s, f, { slot, srcUid: u.uid, targets });
    } else if (c.type === 'gadget') {
      S.gadgets.push({ uid: M.uid++, id: h.id, dur: c.dur || 1 });
    } else {
      for (const f of playFx(c)) runFx(M, s, f, { targets });
      S.spells++;
      trigger(M, s, 'cast');
    }
    cleanup(M);
    return true;
  }
  if (a.type === 'attack') {
    if (!canAttack(M, s, a.from)) return false;
    if (!attackTargets(M, s, a.from).some((x) => sameRef(x, a.target))) return false;
    const u = S.field[a.from];
    u.attacked = true;
    const from = { s, slot: a.from };
    push(M, { t: 'attack', from, target: { ...a.target } });
    const da = atkOf(M, s, a.from);
    if (a.target.hero) damageHero(M, a.target.s, da);
    else {
      const d = unitAt(M, a.target);
      const dd = atkOf(M, a.target.s, a.target.slot);
      const pa = hasKw(u, 'poison'), pd = hasKw(d, 'poison');
      damageUnit(M, a.target, da, pa);
      damageUnit(M, from, dd, pd);
    }
    cleanup(M);
    return true;
  }
  if (a.type === 'power') {
    if (!canPower(M, s)) return false;
    const H = M.data.CARD_HEROES[S.hero];
    const chooses = chooseList(H.power.fx);
    const targets = {};
    for (let i = 0; i < chooses.length; i++) {
      const t = a.targets?.[i];
      if (!t || !chooseCands(M, s, chooses[i].to, chooses[i].where).some((x) => sameRef(x, t))) return false;
      targets[chooses[i].to] = t;
    }
    S.charge -= R(M).heroPowerCost;
    S.powerUsed = true;
    push(M, { t: 'power', s, hero: S.hero });
    for (const f of H.power.fx) runFx(M, s, f, { targets });
    cleanup(M);
    return true;
  }
  return false;
}

export const sameRef = (a, b) => !!a && !!b && a.s === b.s && !!a.hero === !!b.hero && a.slot === b.slot && a.gadget === b.gadget;
const hasKwCard = (c, k) => (c.kw || []).includes(k);

// ------------------------------------------------------------------ AI (spec §3)
/** Cheap deep copy for look-ahead: own rng copy, no events. */
export function cloneMatch(M) {
  const rng = createRng(1);
  rng.setState(M.rng.getState());
  const cu = (u) => (u ? { ...u, kw: [...u.kw], buffs: u.buffs.map((b) => ({ ...b })), st: { ...u.st } } : null);
  return { ...M, rng, ev: [], sides: M.sides.map((S) => ({ ...S, deck: [...S.deck], hand: S.hand.map((h) => ({ ...h })), field: S.field.map(cu), gadgets: S.gadgets.map((g) => ({ ...g })) })) };
}

function score(M0, M1, s, prof, playedUid = 0) {
  const o = other(s);
  if (M1.winner === s) return 1000;
  if (M1.winner === o) return -1000;
  let v = 0;
  const after = (side) => new Map(M1.sides[side].field.filter(Boolean).map((u) => [u.uid, u]));
  const ea = after(o), oa = after(s);
  for (const u of M0.sides[o].field) {
    if (!u) continue;
    const c = cardOf(M0, u.id);
    const n = ea.get(u.uid);
    if (!n) v += (c.cost || 0) + 2;
    else v += 0.3 * Math.max(0, u.hp - n.hp) + (u.shield && !n.shield ? 1 : 0) - 0.3 * Math.max(0, n.hp - u.hp);
  }
  for (const u of M0.sides[s].field) {
    if (!u || u.uid === playedUid) continue;
    const n = oa.get(u.uid);
    if (!n) v -= (cardOf(M0, u.id).cost || 0) + 1;
    else v += 0.4 * (n.maxHp - u.maxHp + n.atk - u.atk) + 0.2 * Math.max(0, n.hp - u.hp) + 0.4 * n.buffs.length;
  }
  const eh = M0.sides[o].hp - M1.sides[o].hp;
  if (eh > 0) v += prof.aggro > 0.6 ? eh : 0.3 * eh; else v += eh; // healing the enemy hero is bad
  const mh = M1.sides[s].hp - M0.sides[s].hp;
  if (mh > 0) v += M0.sides[s].hp < 10 ? mh : 0.1 * mh;
  else if (mh < 0) v += mh * (M0.sides[s].hp < 12 ? 1.5 : 0.4);
  v += 0.6 * (M1.sides[s].hand.length - M0.sides[s].hand.length + 1); // drawn cards (the played card left the hand)
  v += 0.6 * (M0.sides[o].hand.length - M1.sides[o].hand.length);
  return v;
}

/** Candidate target lists for a set of chooses (cartesian, capped). */
function targetCombos(M, s, chooses, srcUid) {
  let combos = [[]];
  for (const ch of chooses) {
    const cands = chooseCands(M, s, ch.to, ch.where, srcUid);
    if (!cands.length) { combos = combos.map((c) => [...c, null]); continue; }
    const next = [];
    for (const c of combos) for (const t of cands) next.push([...c, t]);
    combos = next.slice(0, 40);
  }
  return combos;
}

function bestPlays(M, s, prof) {
  const S = M.sides[s];
  const out = [];
  S.hand.forEach((h, idx) => {
    if (!canPlay(M, s, idx).ok) return;
    const c = cardOf(M, h.id);
    const free = freeSlots(M, s);
    const slot = c.type === 'creature' ? (hasKwCard(c, 'taunt') ? SLOT_CENTER : SLOT_EDGE).find((i) => free.includes(i)) : undefined;
    const chooses = chooseList(c.fx);
    let best = null;
    for (const targets of targetCombos(M, s, chooses, -1)) {
      if (c.type === 'spell' && targets.some((t) => !t)) continue;
      const M1 = cloneMatch(M);
      const a = { type: 'play', idx, slot, targets };
      if (!act(M1, a)) continue;
      const played = c.type === 'creature' ? M1.sides[s].field[slot]?.uid : 0;
      const v = (c.cost || 0) + score(M, M1, s, prof, played);
      if (!best || v > best.v) best = { a, v };
    }
    if (best && best.v > 0) out.push(best);
  });
  return out.sort((x, y) => y.v - x.v);
}

function lethal(M, s) {
  const o = other(s);
  if (units(M, o).some((x) => hasKw(x.u, 'taunt'))) return null;
  const ready = M.sides[s].field.map((u, slot) => slot).filter((slot) => canAttack(M, s, slot) && !M.sides[s].field[slot].sick);
  const sum = ready.reduce((t, slot) => t + atkOf(M, s, slot), 0);
  if (!ready.length || sum < M.sides[o].hp + M.sides[o].armor) return null;
  return { type: 'attack', from: ready[0], target: { s: o, hero: true } };
}

/** Board power (sum of ATK + HP) of side s ≥ the opponent's — a cautious AI goes face only when ahead. */
function ahead(M, s) {
  const pw = (side) => units(M, side).reduce((t, x) => t + atkOf(M, side, x.slot) + x.u.hp, 0);
  return pw(s) >= pw(other(s));
}

function chooseAttack(M, s, prof) {
  const o = other(s);
  for (let slot = 0; slot < M.sides[s].field.length; slot++) {
    if (!canAttack(M, s, slot)) continue;
    const u = M.sides[s].field[slot];
    const my = atkOf(M, s, slot), myCost = cardOf(M, u.id).cost || 0;
    const targets = attackTargets(M, s, slot);
    let good = null, trade = null, chip = null;
    for (const t of targets) {
      if (t.hero) continue;
      const d = unitAt(M, t);
      const dc = cardOf(M, d.id).cost || 0;
      const dAtk = atkOf(M, t.s, t.slot);
      const kills = !d.shield && (my >= d.hp || hasKw(u, 'poison'));
      const survives = u.shield || dAtk === 0 || (dAtk < u.hp && !hasKw(d, 'poison'));
      if (kills && survives) { if (!good || dc > good.c) good = { t, c: dc }; }
      else if (kills && dc >= myCost && prof.risk >= 0.5) { if (!trade || dc > trade.c) trade = { t, c: dc }; }
      else if (survives && hasKw(d, 'taunt')) { if (!chip || d.hp < chip.hp) chip = { t, hp: d.hp }; }
    }
    const hero = targets.find((t) => t.hero);
    const pick = good?.t || trade?.t || (hero && (prof.aggro >= 0.5 || ahead(M, s)) ? hero : null) || chip?.t;
    if (pick) return { type: 'attack', from: slot, target: pick };
  }
  return null;
}

function powerAction(M, s, prof) {
  if (!canPower(M, s)) return null;
  const H = M.data.CARD_HEROES[M.sides[s].hero];
  let best = null;
  for (const targets of targetCombos(M, s, chooseList(H.power.fx), 0)) {
    if (targets.some((t) => !t)) continue;
    const M1 = cloneMatch(M);
    const a = { type: 'power', targets };
    if (!act(M1, a)) continue;
    const v = score(M, M1, s, prof) + (H.power.fx.some((f) => f.op === 'summon' || f.op === 'armor' || f.op === 'draw') ? 1.5 : 0);
    if (!best || v > best.v) best = { a, v };
  }
  return best && best.v > 0.5 ? best.a : null;
}

/** Next AI action for the current side (spec §3): lethal → best play → attacks → hero power → end. */
export function aiAction(M, prof = null) {
  const s = M.cur;
  const S = M.sides[s];
  const P = prof || S.ai || { aggro: 0.5, risk: 0.5 };
  if (M.winner !== null) return null;
  if (S.acts > 40) return { type: 'end' }; // safety
  const l = lethal(M, s);
  if (l) return l;
  const plays = bestPlays(M, s, P);
  if (plays.length) {
    const miss = Math.max(0, 0.15 - 0.03 * (S.tier || 0));
    return (plays.length > 1 && M.rng() < miss ? plays[1] : plays[0]).a;
  }
  const at = chooseAttack(M, s, P);
  if (at) return at;
  const pw = powerAction(M, s, P);
  if (pw) return pw;
  return { type: 'end' };
}

/** Play the match to the end by the AI on both sides. → { winner, turns } (turns — half-turns; maxTurns — safety). */
export function autoPlay(M, maxTurns = 200) {
  let steps = 0;
  while (M.winner === null && M.turn <= maxTurns && steps++ < 20000) {
    act(M, aiAction(M));
    if (M.ev.length > 500) M.ev.length = 0;
  }
  return { winner: M.winner, turns: M.turn };
}
