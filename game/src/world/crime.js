// Theft, attacks on NPCs and wanted levels (docs/specs/world-consequences.md, part 2). Logic without DOM.
// Data — data/world/crime.js (CRIME_RULES, GUARDS, ATTACK_RULES, WANTED, CRIME_RUMORS, CRIME_TOASTS).
// State: save.wanted[faction] = { heat 0..5, since: day of the last crime / cooling step, bounty };
//        save.npcs[id].dead / theftDay; save.heirs[qid] = npc (quests passed to an heir); save.crimeRumors [{ text, until }].
// UI — scenes/location.js (buttons «Украсть» / «Напасть», bribe, entry check), world-map.js (bounty hunters), shop prices.
import { CRIME_RULES, GUARDS, GUARD_ELITE, GUARD_FALLBACK, ATTACK_RULES, WANTED, CRIME_RUMORS, CRIME_TOASTS } from '../data/world/crime.js';
import { NPCS } from '../data/npcs.js';
import { RELATIONS } from '../data/factions.js';
import { QUESTS, LOCATIONS, ENCOUNTERS, ITEMS, npcRepFaction, resolveLocation } from './data.js';
import { applyRep, normFaction, factionName, FACTION_IDS } from './reputation.js';
import { journal, tf, repToasts, grant, locFaction } from './state.js';
import { VENDORS, vendorStock, EXCLUSIVES } from './vendors.js';
import { rollDice } from '../rules/dice.js';

const TH = CRIME_RULES.theft;
const W = WANTED;
const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------- NPC: faction, role, protection
export function npcFaction(npc) {
  const f = npc ? normFaction(npcRepFaction(npc)) : null;
  return f && FACTION_IDS.includes(f) ? f : null;
}
const GUARD_RE = /охран|страж|караул|патрул|комендант|капитан|каратель|часов/i;
const OFFICIAL_RE = /комендант|начальник|капитан|интендант|клерк|заместитель|староста|администратор|глава|лидер|решала|фиксер/i;
/** Role for attention / heat: boss | key | guard | trader | civilian. */
export function npcRole(npc) {
  const r = npc?.role || '';
  if (/^лидер/i.test(r)) return 'boss';
  if (npc?.key) return 'key';
  if (GUARD_RE.test(r)) return 'guard';
  if ((npc?.services || []).includes('trade') || VENDORS[npc?.id]) return 'trader';
  return 'civilian';
}
export const isOfficial = (npc) => OFFICIAL_RE.test(npc?.role || '') || npcRole(npc) === 'guard';

/** Is the NPC needed by an active key quest (giver, talk goal or turn-in)? */
function plotNeeds(save, npcId) {
  for (const [qid, st] of Object.entries(save.quests || {})) {
    const q = QUESTS[qid];
    if (!q?.key) continue;
    if (st.turnin && q.giver === npcId) return true;
    if (st.state !== 'active') continue;
    if (q.giver === npcId) return true;
    const stage = q.stages.find((x) => x.id === st.stage);
    const goals = stage ? [stage.goal, ...(stage.goal.goals || []), ...(stage.goal.options || []).map((o) => o.goal)] : [];
    if (goals.some((g) => g?.npc === npcId)) return true;
  }
  return false;
}

/** Why the NPC cannot be attacked (null — can). Story protection, companions. */
export function attackBlock(save, npcId) {
  const npc = NPCS[npcId];
  if (!npc) return '—';
  if (save.party?.some((p) => p.npc === npcId && p.state !== 'left')) return tf('crime.companion');
  const P = ATTACK_RULES.protected;
  if (P.ids.includes(npcId) || (P.keyActiveQuest && plotNeeds(save, npcId))) return fill(P.reason, { name: npc.name });
  return null;
}

// ---------------------------------------------------------------- wanted
export const wantedOf = (save, f) => save?.wanted?.[f] || { heat: 0, since: 0, bounty: 0 };
export const heatOf = (save, f) => (f ? wantedOf(save, f).heat || 0 : 0);
export const wantedLevel = (heat) => W.levels[Math.max(0, Math.min(W.max, heat | 0))];
export const bountyFor = (save, heat) => (heat >= W.bounty.fromHeat ? Math.round(W.bounty.base * heat * Math.max(1, (save.hero.level || 1) / 2)) : 0);
export const wantedPriceMult = (save, f) => (f ? wantedLevel(heatOf(save, f)).fx.priceMult || 1 : 1);
/** A service of this faction closed by the wanted level (training, recruit, trade, rest). */
export function serviceBlocked(save, f, svc) {
  const s = wantedLevel(heatOf(save, f)).fx.services;
  return s === 'all' ? true : Array.isArray(s) && s.includes(svc);
}
/** Highest heat over all factions: { f, heat }. */
export function topHeat(save) {
  let best = { f: null, heat: 0 };
  for (const [f, w] of Object.entries(save?.wanted || {})) if ((w?.heat || 0) > best.heat) best = { f, heat: w.heat };
  return best;
}

function heatToast(save, f, w) {
  const key = w.heat > 0 ? `heat${w.heat}` : 'cleared';
  return { text: fill(CRIME_TOASTS[key], { faction: factionName(f), bounty: w.bounty }), color: w.heat >= 3 ? 'c' : w.heat > 0 ? 'a' : 'j' };
}

/** Raise the faction's wanted level. Spread to allies at ≥ 3, companions of the faction leave at 5. → toasts. */
export function addHeat(save, f, n, { spread = true } = {}) {
  if (!f || !(n > 0)) return [];
  save.wanted = save.wanted || {};
  const w = (save.wanted[f] = { heat: 0, since: save.day, bounty: 0, ...save.wanted[f] });
  const was = w.heat;
  w.heat = Math.min(W.max, w.heat + n);
  w.since = save.day;
  w.bounty = bountyFor(save, w.heat);
  const out = [];
  if (w.heat === was) return out;
  const tst = heatToast(save, f, w);
  out.push(tst);
  journal(save, tst.text);
  if (was < W.bounty.fromHeat && w.heat >= W.bounty.fromHeat) addRumor(save, 'bounty', { faction: factionName(f), bounty: w.bounty });
  if (spread && was < W.spread.fromHeat && w.heat >= W.spread.fromHeat) {
    for (const g of FACTION_IDS) if (g !== f && W.spread.to.includes(RELATIONS[f]?.[g])) out.push(...addHeat(save, g, W.spread.amount, { spread: false }));
  }
  if (w.heat >= W.max) {
    for (const p of save.party || []) {
      if (p.state === 'left' || npcFaction(NPCS[p.npc]) !== f) continue;
      p.state = 'left';
      out.push({ text: tf('wanted.left', { name: NPCS[p.npc]?.name || p.npc }), color: 'c' });
    }
  }
  return out;
}

/** Lower the wanted level by n (bribe, amnesty). → toasts. */
export function dropHeat(save, f, n) {
  const w = save.wanted?.[f];
  if (!w || !w.heat) return [];
  w.heat = Math.max(0, w.heat - n);
  w.since = save.day;
  w.bounty = bountyFor(save, w.heat);
  return [heatToast(save, f, w)];
}

/** Cooling: −1 level per `decay.everyDays` days (slower at ≥ slowAbove) while the party is outside the faction's nodes. */
export function wantedTick(save, locId) {
  const out = [];
  const here = locId ? locFaction(resolveLocation(locId)) : null;
  for (const [f, w] of Object.entries(save.wanted || {})) {
    if (!w?.heat) continue;
    if (w.since == null) w.since = save.day;
    if (here === f) { w.since = save.day; continue; } // inside the faction's nodes the heat does not cool
    let period = W.decay.everyDays * (w.heat >= W.decay.slowAbove ? W.decay.slowMult : 1);
    while (w.heat > 0 && save.day - w.since >= period) {
      w.heat--; w.since += period; w.bounty = bountyFor(save, w.heat);
      out.push({ text: tf('wanted.decay', { faction: factionName(f), level: wantedLevel(w.heat).name }), color: 'j' });
      period = W.decay.everyDays * (w.heat >= W.decay.slowAbove ? W.decay.slowMult : 1);
    }
  }
  return out;
}

/** Bribe an official: { price, dc, why } (why — the reason it is impossible). */
export function bribeInfo(save, f) {
  const heat = heatOf(save, f);
  const B = W.clear.bribe;
  const price = Math.max(B.pricePerHeat, Math.round(B.pricePerHeat * heat * (B.perLevelMult ? (save.hero.level || 1) / 2 : 1)));
  const dc = B.checks.dc + B.checks.bonusHeat * Math.max(0, heat - 1);
  let why = null;
  if (heat >= W.max) why = tf('wanted.bribeMax');
  else if ((save.hero.talents || []).includes('clean-hands')) why = tf('wanted.bribeNo');
  else if (save.hero.credits < price) why = tf('loc.noMoney');
  return { heat, price, dc, why, skills: B.checks.skill.split('|') };
}
/** Pay the bribe and apply the check result: success −1 (−2 when beaten by 5+), failure +1. → toasts. */
export function applyBribe(save, f, ok, margin = 0) {
  const b = bribeInfo(save, f);
  save.hero.credits = Math.max(0, save.hero.credits - b.price);
  const out = [{ text: tf('fx.credits', { n: `−${b.price}` }), color: 'b' }];
  if (ok) {
    const n = Math.min(W.clear.bribe.maxDrop, margin >= 5 ? 2 : 1);
    out.push({ text: tf('wanted.bribeOk', { n }), color: 'j' }, ...dropHeat(save, f, n));
  } else out.push({ text: tf('wanted.bribeFail'), color: 'c' }, ...addHeat(save, f, 1));
  return out;
}

/** Entry consequence of the wanted level at a faction node: null | 'check' (heat 2) | 'guards' (heat ≥ 3). */
export function entryThreat(save, f) {
  const fx = wantedLevel(heatOf(save, f)).fx;
  if (fx.guardsAttack) return 'guards';
  if (fx.entryCheck) return 'check';
  return null;
}
export const entryCheckOf = (save, f) => wantedLevel(heatOf(save, f)).fx.entryCheck || null;

/** Guard enemies of a faction for the current heat: encounter id + enemy list (guardCountByHeat). */
export function guardEnemies(save, f, extraHeat = 0) {
  const heat = Math.min(W.max, heatOf(save, f) + extraHeat);
  const A = CRIME_RULES.alarmFight;
  const encId = (heat >= A.eliteFrom && GUARD_ELITE[f]) || GUARDS[f] || GUARD_FALLBACK;
  const base = ENCOUNTERS[encId]?.enemies || ENCOUNTERS[GUARD_FALLBACK]?.enemies || ['scavenger'];
  const n = A.guardCountByHeat[Math.max(0, Math.min(A.guardCountByHeat.length - 1, heat))];
  const enemies = Array.from({ length: n }, (_, i) => base[i % base.length]);
  return { encounter: encId, enemies };
}

/** Bounty hunters on the road (heat ≥ 3 somewhere): encounter entry for runEncounter or null. */
export function hunterEncounter(save, rng = Math.random) {
  const hot = Object.entries(save.wanted || {}).filter(([, w]) => wantedLevel(w?.heat || 0).fx.hunters);
  if (!hot.length || rng() >= W.bounty.hunterAmbushChance) return null;
  const [f] = hot.sort((a, b) => b[1].heat - a[1].heat)[0];
  const g = guardEnemies(save, f);
  return { kind: 'battle', encounter: g.encounter, faction: f, hunters: true };
}
/** Bonus to the road encounter threshold while hunters are out. */
export const hunterBonus = (save) => (Object.values(save.wanted || {}).some((w) => wantedLevel(w?.heat || 0).fx.hunters) ? W.bounty.hunterEncounterBonus : 0);

// ---------------------------------------------------------------- rumors
export function addRumor(save, kind, vars = {}) {
  const list = CRIME_RUMORS[kind];
  if (!list?.length) return;
  save.crimeRumors = [...(save.crimeRumors || []).filter((r) => r.until >= save.day), { text: fill(pick(list), vars), until: save.day + ATTACK_RULES.onDeath.rumorDays }].slice(-12);
}
export const crimeRumors = (save) => (save.crimeRumors || []).filter((r) => r.until >= save.day).map((r) => r.text);

// ---------------------------------------------------------------- theft
export const theftCap = (save) => TH.capPerLevel * (save.hero.level || 1);
export const theftTried = (save, npcId) => save.npcs?.[npcId]?.theftDay === save.day;

/** Places where this NPC can be robbed: shop (has a shelf, open), pocket, crowd (hubs / towns). */
export function theftPlaces(save, npc, loc) {
  const out = [];
  if (VENDORS[npc.id] && !save.npcs?.[npc.id]?.shopClosed) out.push('shop');
  out.push('pocket');
  if (['hub', 'town'].includes(loc?.kind)) out.push('crowd');
  return out;
}

/** DC = base + attention of the role + place + noise of a big party. */
export function theftDc(save, npc, place) {
  const comp = (save.party || []).filter((p) => p.state === 'active').length;
  return TH.baseDc + (TH.alert[npcRole(npc)] ?? 0) + (TH.place[place] ?? 0) + TH.partyPenalty * Math.max(0, comp - 2);
}

const creditsRoll = (save, role, rng) => {
  const expr = TH.capCredits[role] || TH.capCredits.key || '1d6*L';
  const [dice, k] = expr.split('*');
  return Math.max(1, rollDice(rng, dice) * (k === 'L' ? save.hero.level || 1 : Number(k) || 1));
};

/** What the attempt would bring: shelf item (price ≤ cap) for shop, else credits. { item?, q?, credits?, value }. */
export function theftLoot(save, npc, place, rng = Math.random) {
  const cap = theftCap(save);
  if (place === 'shop') {
    const vs = vendorStock(npc.id, save.day, 'neutral', save);
    const rows = (vs?.rows || []).filter((r) => !r.locked && ITEMS[r.id] && ITEMS[r.id].price > 0 && Math.round(ITEMS[r.id].price * r.mult) <= cap);
    if (rows.length) { const r = pick(rows, rng); return { item: r.id, q: r.q, value: Math.round(ITEMS[r.id].price * r.mult) }; }
  }
  const role = npcRole(npc) === 'boss' ? 'key' : npcRole(npc);
  const credits = Math.min(cap, creditsRoll(save, role, rng));
  return { credits, value: credits };
}

/** Failure row by the gap (DC − total). */
export const failureOf = (gap) => CRIME_RULES.failure.find((f) => gap >= f.gap[0] && gap <= f.gap[1]) || CRIME_RULES.failure.at(-1);
export const fineFor = (value) => Math.max(CRIME_RULES.fine.min, Math.round((value || 0) * CRIME_RULES.fine.mult));

/**
 * Resolve a theft roll. success → loot (nat 20 doubles) + XP; failure → rep and heat by the gap table, a rumor.
 * → { ok, fail?: failure row, ask: [return|fine|fight|run], toasts }.
 */
export function resolveTheft(save, npc, loot, { ok, gap = 4, natural = 0, place = 'pocket' }) {
  save.npcs[npc.id] = { ...(save.npcs[npc.id] || {}), theftDay: save.day };
  const f = npcFaction(npc);
  const locName = LOCATIONS[save.location]?.name || '';
  if (ok) {
    const k = natural === 20 && TH.crit20 === 'double' ? 2 : 1;
    const r = { xp: TH.xp };
    if (loot.item) r.items = [{ item: loot.item, n: k }];
    else r.credits = (loot.credits || 0) * k;
    const out = grant(save, r);
    out.unshift({ text: fill(CRIME_TOASTS.stolen, { item: loot.item ? ITEMS[loot.item]?.name : tf('crime.credits', { n: r.credits }) }), color: 'j' });
    if (place === 'shop' || npcRole(npc) === 'trader') addRumor(save, 'theft', { loc: locName });
    return { ok: true, ask: [], toasts: out };
  }
  const row = failureOf(gap);
  const out = [{ text: row.id === 'noticed' ? row.text : fill(CRIME_TOASTS.caught), color: 'c' }];
  if (f && row.fx.rep) out.push(...repToasts(applyRep(save, f, row.fx.rep)));
  if (f && row.fx.heat) out.push(...addHeat(save, f, row.fx.heat));
  addRumor(save, 'theft', { loc: locName });
  journal(save, `${npc.name}: ${row.text}`);
  return { ok: false, fail: row, ask: row.ask.split('|'), toasts: out };
}

/** Pay a fine; without money the best backpack item is confiscated. → toasts. */
export function payFine(save, n) {
  if (save.hero.credits >= n) { save.hero.credits -= n; return [{ text: fill(CRIME_TOASTS.fine, { n }), color: 'b' }]; }
  const eq = new Set(Object.values(save.hero.equipment || {}).flat());
  const best = Object.entries(save.hero.items || {}).filter(([id, c]) => c > 0 && ITEMS[id] && !ITEMS[id].key && !eq.has(id)).sort((a, b) => (ITEMS[b[0]].price || 0) - (ITEMS[a[0]].price || 0))[0];
  const out = [];
  if (save.hero.credits > 0) { out.push({ text: fill(CRIME_TOASTS.fine, { n: save.hero.credits }), color: 'b' }); save.hero.credits = 0; }
  if (best) { save.hero.items[best[0]] -= 1; out.push({ text: tf('crime.fineConfiscate', { item: ITEMS[best[0]].name }), color: 'c' }); }
  return out;
}

// ---------------------------------------------------------------- attack and death
/** Line of the attack confirmation about the consequences. */
export function attackHeatText(save, npc) {
  const f = npcFaction(npc);
  if (!f) return tf('crime.heatNone');
  const g = W.gain[killGainKey(npc)] || 1;
  return tf('crime.heatLevel', { faction: factionName(f), level: wantedLevel(heatOf(save, f) + g).name });
}
const killGainKey = (npc) => ({ trader: 'killTrader', guard: 'killGuard', key: 'killKey', boss: 'killKey' }[npcRole(npc)] || 'killCivilian');
const attackGainKey = (npc) => (npcRole(npc) === 'guard' ? 'attackGuard' : 'attackCivilian');

/**
 * Enemies of an attack on the NPC: the target (the faction's guard type stands in for him), up to maxHelpers
 * same-faction guards on the node, guards by heat (≥ guardsFromHeat). → { encounter, enemies, helpers: [npcId] }.
 */
export function attackSetup(save, npc, nodeNpcs = []) {
  const f = npcFaction(npc) || locFaction(save.location);
  const A = ATTACK_RULES.allies;
  const helpers = A.sameFactionNpcs ? nodeNpcs.filter((id) => id !== npc.id && NPCS[id] && npcFaction(NPCS[id]) === f && npcRole(NPCS[id]) === 'guard').slice(0, A.maxHelpers) : [];
  const g = guardEnemies(save, f);
  const base = ENCOUNTERS[g.encounter]?.enemies || g.enemies;
  const extra = heatOf(save, f) >= A.guardsFromHeat ? g.enemies.length : 0;
  const n = 1 + helpers.length + extra;
  return { encounter: g.encounter, faction: f, helpers, enemies: Array.from({ length: n }, (_, i) => base[i % base.length]) };
}

/** The attack happened but the NPC survived (retreat / loss). → toasts. */
export function attackFailed(save, npc) {
  const f = npcFaction(npc);
  const out = [];
  if (f) out.push(...repToasts(applyRep(save, f, CRIME_RULES.failure.at(-1).fx.rep)), ...addHeat(save, f, W.gain[attackGainKey(npc)] || 1));
  addRumor(save, 'attack', { loc: LOCATIONS[save.location]?.name || '', name: npc.name });
  return out;
}

/**
 * The NPC is killed: save.npcs[id].dead, his active quests fail (or pass to `heir`), not taken ones are locked (or pass),
 * the shop closes and half the shelf + exclusives + credits drop, heat by role, rep, a 7-day rumor.
 * → { toasts, loot: { credits, items: [{ id, n, q }] } }.
 */
export function killNpc(save, npcId, rng = Math.random) {
  const npc = NPCS[npcId];
  const out = [];
  save.npcs[npcId] = { ...(save.npcs[npcId] || {}), dead: true, deathDay: save.day };
  out.push({ text: tf('crime.killed', { name: npc.name }), color: 'c' });
  journal(save, tf('crime.killed', { name: npc.name }));
  // quests
  save.heirs = save.heirs || {};
  for (const q of Object.values(QUESTS)) {
    if ((save.heirs[q.id] || q.giver) !== npcId) continue;
    const st = save.quests[q.id];
    const heir = q.heir && NPCS[q.heir] && !save.npcs[q.heir]?.dead ? q.heir : null;
    if (heir) { save.heirs[q.id] = heir; if (st?.state === 'active') out.push({ text: tf('crime.questHeir', { name: q.name, npc: NPCS[heir].name }), color: 'a' }); continue; }
    if (st?.state === 'active') {
      st.state = 'failed';
      out.push({ text: tf('crime.questFailed', { name: q.name }), color: 'c' });
      journal(save, tf('crime.questFailed', { name: q.name }));
    }
  }
  // loot
  const loot = { credits: rollDice(rng, '2d6') * (save.hero.level || 1), items: [] };
  if (VENDORS[npcId]) {
    save.npcs[npcId].shopClosed = true;
    const vs = vendorStock(npcId, save.day, 'ally', save);
    const rows = [...(vs?.rows || [])].filter((r) => ITEMS[r.id]).sort(() => rng() - 0.5);
    for (const r of rows.slice(0, Math.ceil(rows.length / 2))) loot.items.push({ id: r.id, n: 1, q: r.q });
    for (const [id, owner] of EXCLUSIVES) if (owner === npcId && ITEMS[id] && !loot.items.some((x) => x.id === id)) loot.items.push({ id, n: 1, q: 'working' });
  }
  // rep, heat, rumor
  const f = npcFaction(npc);
  if (f) {
    out.push(...repToasts(applyRep(save, f, CRIME_RULES.failure.at(-1).fx.rep)));
    out.push(...addHeat(save, f, W.gain[killGainKey(npc)] || 1));
  }
  addRumor(save, 'kill', { name: npc.name, faction: f ? factionName(f) : '' });
  return { toasts: out, loot };
}
