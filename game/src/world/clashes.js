// Skirmishes on the world map (docs/specs/skirmishes.md): two sides fight at a node or on a route; the party may join a
// side, go against all, sneak past or wait and finish the survivors. Logic only (no DOM); numbers — data/world/skirmishes.js.
// Called as `openClash` from scenes/clash.js; spawn / life — `clashTick` from exodus.passDays.
// State: save.clashes = [{ id, tpl, loc | route: [a, b], region, born, ttl, seed, power: {a, b}, sides: {a: {ids}, b: {ids}} }].
import {
  TEMPLATES, ROSTERS, ROLE_TIER, HI_SUFFIX, UNIT_POWER, BUDGET, POWER_SPLITS, SPAWN, CHOICES, REP, CARD, bandOf, pairsFromMatrix,
} from '../data/world/skirmishes.js';
import { REGIONS } from '../data/world/regions.js';
import { EXODUS } from '../data/world/exodus.js';
import { LOCATIONS, ROUTES, PLAY_DATA } from './data.js';
import { ENEMIES } from '../data/index.js';
import { activeCompanions, journal, tf, isKnownRoute, partySize } from './state.js';
import { applyRep, factionName, repTier, tierAtLeast } from './reputation.js';
import { simulateBattle } from '../rules/simulate.js';
import { makeWorldMap } from './arena.js';

const MAX_SIDE = 8; // units per side (canvas / turn time)
const ROAD_KINDS = new Set(['road', 'trail', 'wild']);

/** All templates: hand-made + faction pairs of the enmity matrix (only rosters that exist). */
export const CLASH_TEMPLATES = [...TEMPLATES, ...pairsFromMatrix(Object.keys(REGIONS))].filter((x) => ROSTERS[x.a.r] && ROSTERS[x.b.r]);
const BY_ID = Object.fromEntries(CLASH_TEMPLATES.map((x) => [x.id, x]));
export const clashTpl = (id) => BY_ID[id] || null;

const mark = (save) => save?.exodus?.mark || 0;
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function weighted(rng, list, w) {
  const total = list.reduce((s, x) => s + w(x), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of list) { r -= w(x); if (r < 0) return x; }
  return list[list.length - 1];
}

/** Average level of the party (hero + active companions). */
export function partyLevel(save) {
  const ls = [save.hero?.level || 1, ...activeCompanions(save).map((p) => p.level || save.hero?.level || 1)];
  return Math.round(ls.reduce((s, x) => s + x, 0) / ls.length);
}
/** L = clamp(party level, region levels). */
export function clashLevel(save, region) {
  const lv = REGIONS[region]?.levels || [1, 20];
  return Math.max(lv[0], Math.min(lv[1], partyLevel(save) + (SPAWN.levelPad || 0)));
}

/** Enemy id of a roster for a role (g/s/e/m) at level L; falls back to lower level suffixes / the low roster. */
export function enemyFor(rosterId, role, L) {
  const R0 = ROSTERS[rosterId];
  if (!R0) return null;
  const band = bandOf(L);
  const tier = ROLE_TIER[band][role] ?? ROLE_TIER[band].g;
  if (typeof tier === 'number') return R0.t[Math.min(tier, R0.t.length - 1)];
  const sufs = ['l20', 'l16', 'l12', 'l8'];
  for (const suf of sufs.slice(sufs.indexOf(HI_SUFFIX(L)))) {
    for (const tr of [tier, 'vet']) { const id = `${R0.hi}-${tr}-${suf}`; if (ENEMIES[id]) return id; }
  }
  return R0.t[Math.min(ROLE_TIER[2][role] ?? 1, R0.t.length - 1)];
}

/**
 * Side units: the mix repeated, then cut / filled with rank-and-file up to budget ±0.5.
 * → { ids, roles, sum } (sum — UNIT_POWER total).
 */
export function buildSide(side, L, budget) {
  const ids = [], roles = [];
  let sum = 0;
  const mix = side.mix || 'gsse';
  for (let i = 0; sum < budget - 0.5 && ids.length < MAX_SIDE; i++) {
    const role = mix[i % mix.length];
    const id = enemyFor(side.r, role, L);
    if (!id || !ENEMIES[id]) { if (i > MAX_SIDE * 3) break; continue; }
    ids.push(id); roles.push(role); sum += UNIT_POWER[role] || 1;
  }
  while (ids.length > 1 && sum > budget + 0.5) { sum -= UNIT_POWER[roles.pop()] || 1; ids.pop(); }
  if (!ids.length) { const id = enemyFor(side.r, 'g', L); if (id && ENEMIES[id]) { ids.push(id); roles.push('g'); sum = 1; } }
  return { ids, roles, sum };
}

/** Templates for a region and place kind ('road' | 'node'); Exodus mark ≥ 2 — cult ×2, ≥ 4 — only cult in cult regions. */
export function templatesFor(save, region, kind) {
  let list = CLASH_TEMPLATES.filter((x) => x.where.includes(region) && (x.kind === 'both' || x.kind === kind));
  const m = mark(save);
  if (m >= 4 && EXODUS.encounter.regions.includes(region)) { const c = list.filter((x) => x.cult); if (c.length) list = c; }
  return list.map((x) => ({ tpl: x, w: x.w * (m >= 2 && x.cult ? SPAWN.exodusCultMul : 1) }));
}

/** A new clash object (not stored). place: { loc } | { route: [a, b] }. */
export function makeClash(save, { tpl, region, place = {}, rng = Math.random }) {
  const L = clashLevel(save, region);
  const E = BUDGET[Math.min(6, Math.max(1, partySize(save)))] || BUDGET[1];
  const split = tpl.even ? POWER_SPLITS.find((x) => x.id === 'even') : weighted(rng, POWER_SPLITS, (x) => x.w);
  const a = buildSide(tpl.a, L, E * split.a), b = buildSide(tpl.b, L, E * split.b);
  const pw = (s) => Math.round((s.sum / E) * 100) / 100; // share of the party's «1.0E»
  const life = SPAWN.lifeDays;
  return {
    id: `cl-${save.day}-${Math.floor(rng() * 1e6)}`, tpl: tpl.id, region, ...place, born: save.day,
    ttl: life[0] + Math.floor(rng() * (life[1] - life[0] + 1)), seed: Math.floor(rng() * 1e9) + 1,
    power: { a: pw(a), b: pw(b) }, sides: { a: { ids: a.ids }, b: { ids: b.ids } },
  };
}

/** Side info for cards / rewards: { name, faction, ids, units (words) }. */
export function clashSide(c, k) {
  const tpl = clashTpl(c.tpl);
  const side = tpl?.[k] || {};
  const R0 = ROSTERS[side.r] || {};
  const faction = R0.faction || null;
  const ids = c.sides?.[k]?.ids || [];
  const count = {};
  for (const id of ids) { const n = ENEMIES[id]?.name || id; count[n] = (count[n] || 0) + 1; }
  const units = Object.entries(count).map(([n, k2]) => (k2 > 1 ? `${n} ×${k2}` : n)).join(', ');
  return { name: side.name || (faction ? factionName(faction) : side.r), faction, ids, units };
}
export const clashName = (c) => clashTpl(c.tpl)?.name || tf('skirm.vs', { a: clashSide(c, 'a').name, b: clashSide(c, 'b').name });
export function powerWord(p) {
  for (const [lim, w] of CARD.powerWords) if (p <= lim) return w;
  return CARD.powerWords.at(-1)[1];
}
export const daysLeft = (save, c) => Math.max(0, c.born + c.ttl - save.day);

/** Active clash at a node / on the route between a and b. */
export const clashAt = (save, loc) => (save.clashes || []).find((c) => c.loc === loc) || null;
export const clashOnRoute = (save, a, b) => (save.clashes || []).find((c) => c.route && ((c.route[0] === a && c.route[1] === b) || (c.route[0] === b && c.route[1] === a))) || null;
export function removeClash(save, id) { save.clashes = (save.clashes || []).filter((c) => c.id !== id); }

/** Places where a marker may appear now: { region: { nodes: [loc], routes: [[a, b]] } }. */
function spawnPlaces(save) {
  const busy = new Set((save.clashes || []).map((c) => c.region));
  const out = {};
  const ok = (reg) => REGIONS[reg] && (REGIONS[reg].danger ?? 0) >= SPAWN.minDanger && !busy.has(reg);
  for (const id of save.discovered || []) {
    const l = LOCATIONS[id];
    if (!l || id === save.location || !ok(l.region) || (l.danger ?? REGIONS[l.region].danger) < SPAWN.minDanger) continue;
    (out[l.region] = out[l.region] || { nodes: [], routes: [] }).nodes.push(id);
  }
  for (const r of ROUTES) {
    if (!ROAD_KINDS.has(r.kind) || r.danger < SPAWN.minDanger || !ok(r.region) || !isKnownRoute(save, r)) continue;
    (out[r.region] = out[r.region] || { nodes: [], routes: [] }).routes.push([r.from, r.to]);
  }
  return out;
}

/** Try to spawn one marker. Returns the clash or null. */
export function spawnClash(save, rng = Math.random) {
  const places = spawnPlaces(save);
  const regs = Object.keys(places).filter((reg) => templatesFor(save, reg, 'node').length || templatesFor(save, reg, 'road').length);
  if (!regs.length) return null;
  const region = pick(rng, regs);
  const P = places[region];
  let kinds = rng() < SPAWN.nodeShare ? ['node', 'road'] : ['road', 'node'];
  for (const kind of kinds) {
    const spots = kind === 'node' ? P.nodes : P.routes;
    const tpls = templatesFor(save, region, kind);
    if (!spots.length || !tpls.length) continue;
    const tpl = weighted(rng, tpls, (x) => x.w).tpl;
    const spot = pick(rng, spots);
    const c = makeClash(save, { tpl, region, place: kind === 'node' ? { loc: spot } : { route: spot }, rng });
    if (!c.sides.a.ids.length || !c.sides.b.ids.length) return null;
    (save.clashes = save.clashes || []).push(c);
    return c;
  }
  return null;
}

/** A one-off «впереди бой» on the road (no marker): region templates of kind 'road'. */
export function roadClash(save, region, rng = Math.random) {
  const tpls = templatesFor(save, region, 'road');
  if (!tpls.length) return null;
  const c = makeClash(save, { tpl: weighted(rng, tpls, (x) => x.w).tpl, region, place: { road: true }, rng });
  return c.sides.a.ids.length && c.sides.b.ids.length ? c : null;
}

/** Where a clash is, for toasts / cards. */
export function clashWhere(c) {
  if (c.loc) return LOCATIONS[c.loc]?.name || c.loc;
  if (c.route) return `${LOCATIONS[c.route[0]]?.name || c.route[0]} — ${LOCATIONS[c.route[1]]?.name || c.route[1]}`;
  return REGIONS[c.region]?.name || '';
}

/** Auto-resolve on expiry: the stronger side wins (equal — a coin). Journal rumour, no reputation. */
export function expireClash(save, c, rng = Math.random) {
  const a = clashSide(c, 'a'), b = clashSide(c, 'b');
  const w = c.power.a === c.power.b ? (rng() < 0.5 ? a : b) : c.power.a > c.power.b ? a : b;
  const text = tf('skirm.rumor', { a: a.name, b: b.name, w: w.name });
  journal(save, text);
  removeClash(save, c.id);
  return { text, color: '4' };
}

/**
 * Days passed (exodus.passDays): expired markers resolve, then per day a spawn chance while < maxActive.
 * Returns toasts / log lines [{ text, color }].
 */
export function clashTick(save, days = 1, rng = Math.random) {
  const out = [];
  if (!Array.isArray(save.clashes)) save.clashes = [];
  for (const c of [...save.clashes]) if (save.day >= c.born + c.ttl) out.push(expireClash(save, c, rng));
  for (let d = 0; d < days; d++) {
    if (save.clashes.length >= SPAWN.maxActive || rng() >= SPAWN.perDayChance) continue;
    const c = spawnClash(save, rng);
    if (c) out.push({ text: tf('skirm.spawn', { where: clashWhere(c) }), color: 'c', clash: c.id });
  }
  return out;
}

/** Sneak DC: 10 + danger, max 17. */
export function sneakDc(danger) {
  const S = CHOICES.sneak;
  return Math.min(S.dcMax, S.dcBase + S.dcPerDanger * (danger || 0));
}
export const clashDanger = (c) => (c.loc ? LOCATIONS[c.loc]?.danger : null) ?? REGIONS[c.region]?.danger ?? 1;

/**
 * «Подождать»: A (team 'enemies') vs B ('rivals') for CHOICES.wait.simRounds rounds, nobody shown.
 * → { winner: 'a' | 'b' | null, survivors: { a: [{ enemy, hpPct }], b: [...] }, dead: [ids] }.
 * Survivors keep at least hpFloorFrac of max HP.
 */
export function waitOutcome(c, data = PLAY_DATA) {
  const W = CHOICES.wait;
  const A = c.sides.a.ids, B = c.sides.b.ids;
  const map = makeWorldMap({ seed: c.seed, enemies: A.length, enemyIds: A, region: c.region, sides: 3, rivals: B.length, id: 'clash-sim' });
  const r = simulateBattle({ map, heroes: [], enemies: A, rivals: B, data, seed: c.seed, maxRounds: W.simRounds });
  const alive = { a: [], b: [] };
  for (const s of r.survivors) {
    const k = s.team === 'enemies' ? 'a' : s.team === 'rivals' ? 'b' : null;
    if (k && s.enemyId) alive[k].push({ enemy: s.enemyId, hpPct: Math.max(W.hpFloorFrac, Math.round((s.hp / Math.max(1, s.maxHp)) * 100) / 100) });
  }
  const dead = [];
  for (const [k, ids] of [['a', A], ['b', B]]) {
    const left = alive[k].map((x) => x.enemy);
    for (const id of ids) { const i = left.indexOf(id); if (i >= 0) left.splice(i, 1); else dead.push(id); }
  }
  const winner = r.winner === 'enemies' ? 'a' : r.winner === 'rivals' ? 'b' : null;
  return { winner, survivors: alive, dead };
}

/** Faction friendship of a side (friendly+): «помочь друзьям» hint and +friendlyTierBonus rep. */
export const sideFriendly = (save, side) => !!side.faction && tierAtLeast(repTier(save.rep?.[side.faction] ?? 0), 'friendly');

/**
 * Reputation after a won clash battle. choice: 'joinA' | 'joinB' | 'all' | 'wait'; winner — waited-out winner side key.
 * Returns applyRep changes (flattened).
 */
export function clashRep(save, c, choice, winner = null) {
  const ch = [];
  const add = (f, d) => { if (f && d) ch.push(...applyRep(save, f, d)); };
  const a = clashSide(c, 'a'), b = clashSide(c, 'b');
  if (choice === 'joinA' || choice === 'joinB') {
    const [ally, foe] = choice === 'joinA' ? [a, b] : [b, a];
    add(ally.faction, REP.join + (sideFriendly(save, ally) ? REP.friendlyTierBonus : 0));
    if (foe.faction !== ally.faction) add(foe.faction, REP.joinFoe);
  } else if (choice === 'all') {
    add(a.faction, REP.all);
    if (b.faction !== a.faction) add(b.faction, REP.all);
  } else if (choice === 'wait') {
    if (winner) add(clashSide(c, winner).faction, REP.waitKillWinner);
    else { add(a.faction, REP.waitKillWinner); if (b.faction !== a.faction) add(b.faction, REP.waitKillWinner); }
  }
  return ch;
}

/** save.js: keep valid clashes only (template, enemy ids, place). */
export function normClashes(arr) {
  if (!Array.isArray(arr)) return [];
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return arr.filter((c) => c && typeof c === 'object' && clashTpl(c.tpl) && REGIONS[c.region]
      && (c.loc ? LOCATIONS[c.loc] : Array.isArray(c.route) && c.route.length === 2 && c.route.every((id) => LOCATIONS[id])))
    .map((c) => ({
      id: String(c.id), tpl: c.tpl, region: c.region, ...(c.loc ? { loc: c.loc } : { route: [c.route[0], c.route[1]] }),
      born: num(c.born, 1), ttl: num(c.ttl, SPAWN.lifeDays[0]), seed: num(c.seed, 1),
      power: { a: num(c.power?.a, 0.8), b: num(c.power?.b, 0.8) },
      sides: { a: { ids: (c.sides?.a?.ids || []).filter((id) => ENEMIES[id]) }, b: { ids: (c.sides?.b?.ids || []).filter((id) => ENEMIES[id]) } },
    }))
    .filter((c) => c.sides.a.ids.length && c.sides.b.ids.length)
    .slice(0, SPAWN.maxActive);
}
