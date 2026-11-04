// World state helpers over the save object (world.md §8): new game, party members, creatures for battle,
// experience and levels, rewards (Effects), deeds/approval, discovery, travel and encounters.
import { buildCreature, isAllowed } from '../rules/character.js';
import { gainXp as engineGainXp, levelForXp } from '../rules/progression.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, COMBAT_TALENT_LIMIT } from '../data/talents.js';
import { RELATIONS } from '../data/factions.js';
import { GAME_DATA } from '../data/index.js';
import {
  LOCATIONS, ROUTES, REGIONS, START_LOCATION, START_DISCOVERED, ENCOUNTER_TABLES, ENCOUNTER_PER_DANGER, ENCOUNTER_MODS, gadgetFor, ITEMS,
} from './data.js';
import { applyRep, repTier, normFaction, startingRep, factionName, tierAtLeast } from './reputation.js';
import { hasWorldFlag, worldFlagValues } from './checks.js';

export const MAX_PARTY = 3; // companions besides the hero
export { levelForXp };

/** New save after the prologue. hero: { name, race, cls, path, origin, alignment, anyStat, talents }. */
export function newSave(hero) {
  const combat = hero.talents.filter((id) => TALENTS[id] && isCombatTalent(TALENTS[id]));
  const gadget = gadgetFor(hero.cls);
  const save = {
    version: 1, seed: (Math.random() * 1e9) | 0, day: 1,
    hero: { ...hero, level: 1, xp: 0, activeCombat: combat.slice(0, COMBAT_TALENT_LIMIT(1)), gadget: gadget ? gadget.id : null,
      hp: null, mrl: null, judgeMarks: 0, credits: 50, items: { medkit: 1 }, uniqueTalent: false, pendingTalents: 0 },
    party: [],
    location: START_LOCATION, prevLocation: null,
    discovered: [...START_DISCOVERED], visited: [],
    rep: startingRep(hero.race, hero.origin, true),
    quests: {}, terminals: {}, flags: {}, deeds: {}, npcs: {}, caches: [], battlesDone: [], events: [],
    journal: [], cyberspace: null, settings: { aiCompanions: false },
  };
  for (const l of Object.values(LOCATIONS)) if (l.terminal) save.terminals[l.terminal.id] = l.terminal.state;
  visit(save, START_LOCATION);
  return save;
}

export function journal(save, text) {
  save.journal.push({ day: save.day, text });
  if (save.journal.length > 200) save.journal.shift();
}

// ----------------------------------------------------------------------------- party & creatures
export const activeCompanions = (save) => save.party.filter((p) => p.state === 'active');

function safeTalents(ids) { return (ids || []).filter((id) => TALENTS[id]); }

function restore(u, hp, mrl) {
  if (hp != null) u.hp = Math.max(0, Math.min(u.maxHp, hp));
  if (mrl != null) u.mrl = Math.max(0, Math.min(u.maxMrl, mrl));
}

export function buildHero(save, data = GAME_DATA, { race } = {}) {
  const h = save.hero;
  const talents = safeTalents(h.talents);
  const activeCombat = safeTalents(h.activeCombat).filter((id) => talents.includes(id)).slice(0, COMBAT_TALENT_LIMIT(h.level));
  const spec = { race: race || h.race, cls: h.cls, path: h.path, level: h.level, name: h.name, data, id: 'hero', anyStat: h.anyStat || undefined };
  let u;
  try {
    u = buildCreature({ ...spec, talents, activeCombat, gadget: h.gadget || undefined });
  } catch {
    try { u = buildCreature({ ...spec, talents, activeCombat, gadget: h.gadget || undefined, race: h.race }); } catch { u = buildCreature({ ...spec, race: h.race }); }
  }
  // items with passives (locations.js ITEMS) — like a talent passive, without the combat talent limit
  const marks = h.judgeMarks || 0;
  if (marks) { u.maxMrl = Math.max(1, u.maxMrl - 2 * marks); u.mrl = Math.min(u.mrl, u.maxMrl); }
  restore(u, h.hp, h.mrl);
  return u;
}

export function buildCompanion(save, p, data = GAME_DATA) {
  const n = NPCS[p.npc];
  if (!n) return null;
  const race = data.RACES[n.race] ? n.race : 'human';
  const cls = data.CLASSES[n.cls] ? n.cls : 'zabivnoy';
  const path = data.CLASSES[cls].paths.some((x) => x.id === n.path) ? n.path : undefined;
  const talents = safeTalents(p.talents);
  let u;
  try {
    if (!isAllowed(race, data.CLASSES[cls])) throw new Error('race');
    u = buildCreature({ race, cls, path, level: save.hero.level, name: n.name, data, id: `c-${n.id}`, talents, activeCombat: talents.filter((id) => isCombatTalent(TALENTS[id])).slice(0, COMBAT_TALENT_LIMIT(save.hero.level)) });
  } catch {
    u = buildCreature({ race: 'human', cls, path, level: save.hero.level, name: n.name, data, id: `c-${n.id}` });
  }
  restore(u, p.hp, p.mrl);
  if (save.settings.aiCompanions) u.control = 'ai';
  return u;
}

/** Member descriptors for checks and the party screen: { key, isHero, name, unit, items? }. */
export function members(save, data = GAME_DATA, { includeDown = false } = {}) {
  const hero = buildHero(save, data);
  const out = [{ key: 'hero', isHero: true, name: save.hero.name, unit: hero, items: save.hero.items }];
  for (const p of activeCompanions(save)) {
    if (!includeDown && p.hp === 0) continue;
    const u = buildCompanion(save, p, data);
    if (u) out.push({ key: p.npc, isHero: false, name: NPCS[p.npc].name, unit: u, p });
  }
  return out;
}

/** Creatures for a battle: hero + active companions with HP left. */
export function partyUnits(save, data = GAME_DATA) {
  const list = [buildHero(save, data)];
  for (const p of activeCompanions(save)) {
    if (p.hp === 0) continue;
    const u = buildCompanion(save, p, data);
    if (u) list.push(u);
  }
  return list;
}

export function canRecruit(save, npcId) {
  const n = NPCS[npcId];
  if (!n || !n.recruitable) return 'no';
  if (save.party.some((p) => p.npc === npcId && p.state !== 'left')) return 'already';
  const f = normFaction(n.faction);
  if (f && save.rep[f] != null && repTier(save.rep[f]) === 'hostile') return 'hostile';
  return null;
}

export function recruit(save, npcId) {
  const n = NPCS[npcId];
  const old = save.party.find((p) => p.npc === npcId);
  const state = activeCompanions(save).length < MAX_PARTY ? 'active' : 'waiting';
  if (old) Object.assign(old, { state, approval: Math.max(old.approval, -40) });
  else save.party.push({ npc: npcId, state, hp: null, mrl: null, approval: 0, talents: safeTalents(n.companion?.talents), warned: false, ultimatum: false });
  save.npcs[npcId] = { ...(save.npcs[npcId] || {}), met: true, recruited: true };
  journal(save, `${n.name}: в партии.`);
  return state;
}

// ----------------------------------------------------------------------------- requirements & effects
const hasItem = (save, item) => (save.hero.items[item] || 0) > 0;

/** Requires (quests.js / locations.js): flag | notFlag | rep | worldFlag | alignment | item | credits | quest. */
export function requiresOk(save, req, data = GAME_DATA) {
  if (!req) return true;
  if (req.flag && !save.flags[req.flag]) return false;
  if (req.notFlag && save.flags[req.notFlag]) return false;
  if (req.rep && !tierAtLeast(repTier(save.rep[normFaction(req.rep.faction)]), req.rep.min)) return false;
  if (req.worldFlag && !hasWorldFlag(members(save, data), req.worldFlag)) return false;
  if (req.alignment && save.hero.alignment !== req.alignment) return false;
  if (req.item && !hasItem(save, req.item)) return false;
  if (req.credits && save.hero.credits < req.credits) return false;
  if (req.quest && !(save.quests[req.quest.id || req.quest]?.stage === req.stage || save.quests[req.quest.id || req.quest]?.state === req.quest.state)) return false;
  return true;
}

/**
 * Apply Effects / Outcome: { xp, credits, rep, deeds, flags, items:[{item,n}], removeItems, talent, recruit, terminal,
 * hp:-N, mrl:-N (each member), text }. Returns toast lines [{ text, color }]. talentChoice is handled by the UI.
 */
export function grant(save, r = {}, data = GAME_DATA, { keyChoice = false } = {}) {
  const out = [];
  if (!r) return out;
  if (r.credits) { save.hero.credits = Math.max(0, save.hero.credits + r.credits); out.push({ text: `${r.credits > 0 ? '+' : ''}${r.credits} кредов`, color: 'b' }); }
  for (const it of r.items || []) { save.hero.items[it.item] = (save.hero.items[it.item] || 0) + (it.n || 1); out.push({ text: `+ ${itemName(it.item)}${it.n > 1 ? ` ×${it.n}` : ''}`, color: 'a' }); }
  for (const it of r.removeItems || []) save.hero.items[it.item] = Math.max(0, (save.hero.items[it.item] || 0) - (it.n || 1));
  for (const f of r.flags || []) save.flags[f] = true;
  if (r.flag) save.flags[r.flag] = true;
  if (r.terminal) save.terminals[r.terminal.id] = r.terminal.state;
  if (r.rep) for (const [f, d] of Object.entries(r.rep)) out.push(...repToasts(applyRep(save, f, repDelta(save, d, data))));
  if (r.talent && TALENTS[r.talent] && !save.hero.talents.includes(r.talent)) out.push(...learnTalent(save, r.talent));
  if (r.recruit && NPCS[r.recruit] && canRecruit(save, r.recruit) !== 'already') { recruit(save, r.recruit); out.push({ text: `${NPCS[r.recruit].name}: в партии`, color: 'j' }); }
  if (r.hp || r.mrl) damageParty(save, r.hp || 0, r.mrl || 0, data);
  if (r.xp) out.push(...gainXp(save, r.xp, data));
  for (const d of r.deeds || []) out.push(...deed(save, d, keyChoice));
  out.push(...companionRepCheck(save));
  return out;
}

const itemName = (id) => ITEMS[id]?.name || id;

export function learnTalent(save, id) {
  const tl = TALENTS[id];
  save.hero.talents.push(id);
  if (isCombatTalent(tl) && save.hero.activeCombat.length < COMBAT_TALENT_LIMIT(save.hero.level)) save.hero.activeCombat.push(id);
  journal(save, `Новый талант: ${tl.name}`);
  return [{ text: `Новый талант: ${tl.name}`, color: 'a' }];
}

function damageParty(save, dhp, dmrl, data) {
  for (const m of members(save, data)) {
    const e = m.isHero ? save.hero : m.p;
    e.hp = Math.max(1, m.unit.hp + dhp);
    e.mrl = Math.max(0, m.unit.mrl + dmrl);
  }
}

function repDelta(save, d, data) {
  const ms = members(save, data);
  let mult = 1;
  if (d > 0) for (const v of worldFlagValues(ms, 'rep-mult')) mult *= v || 1;
  if (d < 0 && hasWorldFlag(ms, 'blame-shift')) mult *= 0.5;
  return Math.trunc(d * mult);
}

/** Reputation change toast: «Отступники +10 · АИ Партия −5». */
export function repToasts(changes) {
  if (!changes.length) return [];
  const text = changes.map((c) => `${factionName(c.faction)} ${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)}`).join(' · ');
  return [{ text, color: changes[0].delta > 0 ? 'j' : 'c' }];
}

export function gainXp(save, xp, data = GAME_DATA) {
  const out = [];
  if (!xp) return out;
  const r = engineGainXp(save.hero, xp, data);
  save.hero.xp = r.xp;
  out.push({ text: `+${xp} опыта`, color: 'h' });
  if (r.leveledUp) {
    save.hero.level = r.level;
    save.hero.hp = null; save.hero.mrl = null; // level-up: full resources
    save.hero.pendingTalents = (save.hero.pendingTalents || 0) + r.talentPicks;
    out.push({ text: `Новый уровень: ${r.level}`, color: 'a' });
    journal(save, `Уровень ${r.level}.`);
  }
  return out;
}

/** A deed tag (world.md §4): approval of companions with matching likes/dislikes; departures. */
export function deed(save, tag, key) {
  const out = [];
  save.deeds[tag] = (save.deeds[tag] || 0) + 1;
  for (const p of save.party) {
    if (p.state === 'left') continue;
    const n = NPCS[p.npc];
    const likes = n.companion?.likes || n.likes || [];
    const dislikes = n.companion?.dislikes || n.dislikes || [];
    const d = likes.includes(tag) ? (key ? 15 : 5) : dislikes.includes(tag) ? (key ? -15 : -5) : 0;
    if (!d) continue;
    p.approval = Math.max(-100, Math.min(100, p.approval + d));
    out.push({ text: `${n.name}: ${d > 0 ? 'одобряет' : 'не одобряет'} (${d > 0 ? '+' : ''}${d})`, color: d > 0 ? 'j' : 'c' });
    if (p.approval <= -70) out.push(leave(save, p, 'approval'));
    else if (p.approval <= -50 && !p.warned) { p.warned = true; out.push({ text: `${n.name}: «Ещё раз — и я ухожу».`, color: 'a' }); }
    const teaches = n.companion?.teaches || (n.companion?.talents || [])[0];
    if (p.approval >= 50 && !p.taught && teaches && TALENTS[teaches]) {
      p.taught = true;
      if (!save.hero.talents.includes(teaches)) out.push(...learnTalent(save, teaches));
    }
  }
  return out;
}

function leave(save, p, why) {
  const n = NPCS[p.npc];
  p.state = 'left';
  journal(save, `${n.name} уходит (${why === 'approval' ? 'не согласен с твоими поступками' : 'конфликт с фракцией'}).`);
  return { text: `${n.name} уходит из партии`, color: 'c' };
}

/** Hero became an ally of an enemy of the companion's faction → ultimatum, the next such step → leaves. */
export function companionRepCheck(save) {
  const out = [];
  for (const p of save.party) {
    if (p.state === 'left') continue;
    const f = normFaction(NPCS[p.npc]?.faction);
    if (!f || !RELATIONS[f]) continue;
    const enemyAllies = Object.keys(RELATIONS[f]).filter((g) => RELATIONS[f][g] === 'enemy' && repTier(save.rep[g]) === 'ally').length;
    if (enemyAllies > (p.enemyAllies || 0)) {
      if (p.ultimatum) out.push(leave(save, p, 'faction'));
      else { p.ultimatum = true; out.push({ text: `${NPCS[p.npc].name}: ультиматум — ты дружишь с нашими врагами`, color: 'a' }); }
    }
    p.enemyAllies = enemyAllies;
  }
  return out;
}

/** After a rest: companions whose faction is hostile to the hero leave (world.md §4). */
export function restDepartures(save) {
  const out = [];
  for (const p of save.party) {
    if (p.state === 'left') continue;
    const f = normFaction(NPCS[p.npc]?.faction);
    if (f && save.rep[f] != null && save.rep[f] <= -50) out.push(leave(save, p, 'faction'));
  }
  return out;
}

/** Rest: frac 1 — full ЗДР/МРЛ; 0.5 — field camp. Companions in Cyberspace are skipped. */
export function restParty(save, data = GAME_DATA, frac = 1) {
  const h = save.hero;
  if (frac >= 1) {
    h.hp = null; h.mrl = null;
    for (const p of save.party) if (p.state !== 'cyberspace' && p.state !== 'left') { p.hp = null; p.mrl = null; }
    return;
  }
  const hu = buildHero(save, data);
  h.hp = Math.min(hu.maxHp, hu.hp + Math.ceil(hu.maxHp * frac));
  h.mrl = Math.min(hu.maxMrl, hu.mrl + Math.ceil(hu.maxMrl * frac));
  for (const p of activeCompanions(save)) {
    const u = buildCompanion(save, p, data);
    if (!u || p.hp === 0) continue;
    p.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * frac));
    p.mrl = Math.min(u.maxMrl, u.mrl + Math.ceil(u.maxMrl * frac));
  }
}

// ----------------------------------------------------------------------------- map: discovery and travel
export const routesFrom = (id) => ROUTES.filter((r) => r.from === id || r.to === id);
export const otherEnd = (r, id) => (r.from === id ? r.to : r.from);

/** Route is usable: both ends discovered, hidden ones need their reveal flag (or hidden-routes / squeeze), requires ok. */
export function isKnownRoute(save, r) {
  if (!save.discovered.includes(r.from) || !save.discovered.includes(r.to)) return false;
  if (r.hidden && !(r.reveal && save.flags[r.reveal]) && !save.flags[`route:${r.from}:${r.to}`]) return false;
  if (r.requires && !requiresOk(save, r.requires)) return false;
  return true;
}

/** Visit a node: mark visited, discover non-hidden neighbours (and hidden ones whose reveal flag is set). */
export function visit(save, id) {
  if (save.location && save.location !== id) save.prevLocation = save.location;
  save.location = id;
  if (!save.visited.includes(id)) save.visited.push(id);
  discover(save, id);
  for (const r of routesFrom(id)) {
    const o = otherEnd(r, id);
    const l = LOCATIONS[o];
    const revealed = (r.reveal && save.flags[r.reveal]) || (l?.hidden?.reveal || []).some((f) => save.flags[f]);
    if ((r.hidden || l?.hidden) && !revealed) continue;
    if (r.hidden) save.flags[`route:${r.from}:${r.to}`] = true;
    discover(save, o);
  }
}

export function discover(save, id) {
  if (LOCATIONS[id] && !save.discovered.includes(id)) save.discovered.push(id);
}

export const regionOf = (locId) => REGIONS[LOCATIONS[locId]?.region];
/** Faction whose reputation gates a location: entry.faction, else the region's faction. */
export const locFaction = (locId) => {
  const l = LOCATIONS[locId];
  return l?.entry?.faction || regionOf(locId)?.faction || null;
};

/** Encounter threshold for a day on route r (world.md §2): d20 ≤ 3 × danger + mod (≥ 1 when danger > 0). */
export function encounterThreshold(save, r, data = GAME_DATA) {
  const danger = r.danger ?? regionOf(r.to)?.danger ?? 0;
  if (danger <= 0) return { danger, mod: 0, need: 0 };
  const ms = members(save, data);
  let mod = 0;
  const safe = worldFlagValues(ms, 'safe-route');
  mod -= (ENCOUNTER_MODS.safeRouteBestTwo ? safe.slice(0, 2) : safe).reduce((s, v) => s + (v || 1), 0);
  mod += ENCOUNTER_MODS.pirates[repTier(save.rep.pirates)] || 0;
  return { danger, mod, need: Math.max(1, ENCOUNTER_PER_DANGER * danger + mod) };
}

/** Weighted pick from a region's encounter table (raceWeight for party races). Friendly faction battles → trader. */
export function pickEncounter(save, regionId, rng = Math.random) {
  const list = (ENCOUNTER_TABLES[regionId] || []).filter((e) => e.kind !== 'npc' || NPCS[e.npc]);
  if (!list.length) return null;
  const races = new Set([save.hero.race, ...activeCompanions(save).map((p) => NPCS[p.npc]?.race)]);
  const w = (e) => e.w * Object.entries(e.raceWeight || {}).reduce((m, [race, k]) => (races.has(race) ? m * k : m), 1);
  const total = list.reduce((s, e) => s + w(e), 0);
  let x = rng() * total;
  let e = list[list.length - 1];
  for (const it of list) { x -= w(it); if (x < 0) { e = it; break; } }
  if (e.kind === 'battle' && e.faction && tierAtLeast(repTier(save.rep[e.faction]), 'friendly')) return { kind: 'trader', friendly: e.faction, stock: null };
  return e;
}

export const hasFlagInParty = (save, data, flag) => hasWorldFlag(members(save, data), flag);
export const partySize = (save) => 1 + activeCompanions(save).filter((p) => p.hp !== 0).length;
export { levelForXp as levelFor };
