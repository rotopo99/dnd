// World state helpers over the save object (world.md §8): new game, party members, creatures for battle,
// experience and levels, rewards, deeds/approval, discovery, travel and encounters, terminals.
import { buildCreature, isAllowed } from '../rules/character.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, COMBAT_TALENT_LIMIT } from '../data/talents.js';
import { RELATIONS } from '../data/factions.js';
import { LOCATIONS, ROUTES, REGIONS } from './data.js';
import { applyRep, repTier, normFaction, startingRep, factionName } from './reputation.js';
import { hasWorldFlag } from './checks.js';

export const LEVEL_XP = [0, 300, 900, 2700, 6500];
export const MAX_PARTY = 3; // companions besides the hero
export const START_LOCATION = 'harmony-reactor';

export function levelFor(xp) {
  let l = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1;
  return l;
}

/** New save after character creation. hero: { name, race, cls, path, origin, alignment, anyStat, talents }. */
export function newSave(hero) {
  const combat = hero.talents.filter((id) => TALENTS[id] && isCombatTalent(TALENTS[id]));
  const save = {
    version: 1, seed: (Math.random() * 1e9) | 0, day: 1,
    hero: { ...hero, level: 1, xp: 0, activeCombat: combat.slice(0, COMBAT_TALENT_LIMIT(1)), hp: null, mrl: null,
      judgeMarks: 0, credits: 50, items: { medkit: 1 }, uniqueTalent: false, pendingTalents: 0 },
    party: [],
    location: START_LOCATION,
    discovered: [], visited: [],
    rep: startingRep(hero.race, hero.origin),
    quests: {}, terminals: {}, flags: {}, deeds: {}, npcs: {}, caches: [], battlesDone: [],
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

/** Member descriptors used by checks / party screen. */
export function members(save, data, { includeDown = false } = {}) {
  const out = [];
  const hero = buildHero(save, data);
  out.push({ key: 'hero', isHero: true, name: save.hero.name, race: save.hero.race, cls: save.hero.cls, level: save.hero.level,
    talents: save.hero.talents, stats: hero.stats, unit: hero });
  for (const p of activeCompanions(save)) {
    const u = buildCompanion(save, p, data);
    if (!u) continue;
    if (!includeDown && p.hp === 0) continue;
    const n = NPCS[p.npc];
    out.push({ key: p.npc, isHero: false, name: n.name, race: n.race, cls: n.cls, level: save.hero.level, talents: p.talents || [], stats: u.stats, unit: u });
  }
  return out;
}

function applyTalentFallback(u, ids) {
  if (u.talents) return; // engine supports talents itself
  for (const id of ids || []) {
    const t = TALENTS[id];
    if (!t) continue;
    for (const a of t.abilities || []) if (!u.abilities.some((x) => x.id === a.id)) u.abilities.push(a);
  }
}

function restore(u, hp, mrl) {
  if (hp != null) u.hp = Math.max(0, Math.min(u.maxHp, hp));
  if (mrl != null) u.mrl = Math.max(0, Math.min(u.maxMrl, mrl));
}

export function buildHero(save, data, { race } = {}) {
  const h = save.hero;
  let u;
  try {
    u = buildCreature({ race: race || h.race, cls: h.cls, path: h.path, level: h.level, name: h.name, data, id: 'hero',
      anyStat: h.anyStat || undefined, talents: h.activeCombat, gadget: h.cls });
  } catch {
    u = buildCreature({ race: h.race, cls: h.cls, path: h.path, level: h.level, name: h.name, data, id: 'hero', anyStat: h.anyStat || undefined });
  }
  applyTalentFallback(u, h.activeCombat);
  const marks = h.judgeMarks || 0;
  if (marks) { u.maxMrl = Math.max(1, u.maxMrl - 2 * marks); u.mrl = Math.min(u.mrl, u.maxMrl); }
  restore(u, h.hp, h.mrl);
  return u;
}

export function buildCompanion(save, p, data) {
  const n = NPCS[p.npc];
  if (!n) return null;
  const race = data.RACES[n.race] ? n.race : 'human';
  const cls = data.CLASSES[n.cls] ? n.cls : 'zabivnoy';
  const path = data.CLASSES[cls].paths.some((x) => x.id === n.path) ? n.path : undefined;
  let u;
  try {
    if (!isAllowed(race, data.CLASSES[cls])) throw new Error('race');
    u = buildCreature({ race, cls, path, level: save.hero.level, name: n.name, data, id: `c-${n.id}`, talents: p.talents || [] });
  } catch {
    u = buildCreature({ race: 'human', cls, path, level: save.hero.level, name: n.name, data, id: `c-${n.id}` });
  }
  applyTalentFallback(u, p.talents);
  restore(u, p.hp, p.mrl);
  if (save.settings.aiCompanions) u.control = 'ai';
  return u;
}

/** Creatures for a battle: hero + active companions with HP left. */
export function partyUnits(save, data) {
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
  else save.party.push({ npc: npcId, state, hp: null, mrl: null, approval: 0, talents: n.companion?.talents || [], warned: false, ultimatum: false });
  save.npcs[npcId] = { ...(save.npcs[npcId] || {}), met: true, recruited: true };
  journal(save, `${n.name}: в партии.`);
  return state;
}

// ----------------------------------------------------------------------------- rewards, deeds, approval
/** Apply rewards; returns toast lines [{ text, color }]. */
export function grant(save, r = {}, data) {
  const out = [];
  if (r.credits) { save.hero.credits = Math.max(0, save.hero.credits + r.credits); out.push({ text: `${r.credits > 0 ? '+' : ''}${r.credits} кредов`, color: 'b' }); }
  if (r.items) for (const [k, n] of Object.entries(r.items)) save.hero.items[k] = (save.hero.items[k] || 0) + n;
  if (r.flags) for (const f of r.flags) save.flags[f] = true;
  if (r.rep) for (const [f, d] of Object.entries(r.rep)) out.push(...repToasts(applyRep(save, f, repDelta(save, d))));
  if (r.xp) out.push(...gainXp(save, r.xp, data));
  if (r.deeds) for (const d of r.deeds) out.push(...deed(save, d, r.keyChoice));
  out.push(...companionRepCheck(save));
  return out;
}

function repDelta(save, d) {
  let mult = 1;
  for (const id of save.hero.talents) for (const w of TALENTS[id]?.world || []) {
    if (w.worldFlag === 'rep-mult' && d > 0) mult *= w.value || 1;
    if (w.worldFlag === 'blame-shift' && d < 0) mult *= 0.5;
  }
  return Math.trunc(d * mult);
}

/** Reputation change toast: «Отступники +10 · АИ Партия −5». */
export function repToasts(changes) {
  if (!changes.length) return [];
  const text = changes.map((c) => `${factionName(c.faction)} ${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)}`).join(' · ');
  return [{ text, color: changes[0].delta > 0 ? 'j' : 'c' }];
}

export function gainXp(save, xp, data) {
  const out = [];
  if (!xp) return out;
  const before = save.hero.level;
  save.hero.xp += xp;
  out.push({ text: `+${xp} опыта`, color: 'h' });
  const lvl = Math.min(5, levelFor(save.hero.xp));
  if (lvl > before) {
    save.hero.level = lvl;
    save.hero.hp = null; save.hero.mrl = null; // level-up: full resources
    for (let l = before + 1; l <= lvl; l++) if (l === 2 || l === 4) save.hero.pendingTalents = (save.hero.pendingTalents || 0) + 1;
    out.push({ text: `Новый уровень: ${lvl}`, color: 'a' });
    journal(save, `Уровень ${lvl}.`);
  }
  void data;
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
    if (p.approval >= 50 && !p.taught && n.companion?.teaches) {
      p.taught = true;
      if (!save.hero.talents.includes(n.companion.teaches)) save.hero.talents.push(n.companion.teaches);
      out.push({ text: `${n.name} учит таланту «${TALENTS[n.companion.teaches]?.name || n.companion.teaches}»`, color: 'a' });
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

/** Faction conflicts: hero ally of an enemy of the companion's faction → ultimatum, then leaves. */
export function companionRepCheck(save) {
  const out = [];
  for (const p of save.party) {
    if (p.state === 'left') continue;
    const f = normFaction(NPCS[p.npc]?.faction);
    if (!f || !RELATIONS[f]) continue;
    const enemyAlly = Object.keys(RELATIONS[f]).some((g) => RELATIONS[f][g] === 'enemy' && repTier(save.rep[g]) === 'ally');
    if (enemyAlly && !p.ultimatum) { p.ultimatum = true; out.push({ text: `${NPCS[p.npc].name}: ультиматум — ты дружишь с нашими врагами.`, color: 'a' }); }
    else if (!enemyAlly) p.ultimatum = false;
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
export function restParty(save, data, frac = 1) {
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

/** A route is drawn when both ends are discovered (hidden routes appear with their hidden node). */
export function isKnownRoute(save, r) {
  return save.discovered.includes(r.from) && save.discovered.includes(r.to);
}

/** Visit a node: mark visited, discover non-hidden neighbours. */
export function visit(save, id) {
  if (save.location && save.location !== id) save.prevLocation = save.location;
  save.location = id;
  if (!save.visited.includes(id)) save.visited.push(id);
  if (!save.discovered.includes(id)) save.discovered.push(id);
  for (const r of routesFrom(id)) {
    const o = otherEnd(r, id);
    if (r.hidden || LOCATIONS[o]?.hidden) continue;
    if (!save.discovered.includes(o)) save.discovered.push(o);
  }
}

export function discover(save, id) {
  if (!save.discovered.includes(id)) save.discovered.push(id);
}

export const regionOf = (locId) => REGIONS[LOCATIONS[locId]?.region];
export const locFaction = (locId) => {
  const l = LOCATIONS[locId];
  return l?.faction !== undefined ? l.faction : regionOf(locId)?.faction || null;
};

/** Encounter threshold for a day on route r (world.md §2): d20 ≤ 3 × danger + mod. */
export function encounterThreshold(save, r, data) {
  const danger = r.danger ?? regionOf(r.to)?.danger ?? 0;
  if (danger <= 0) return { danger, mod: 0, need: 0 };
  let mod = 0;
  const ms = members(save, data);
  let safe = 0;
  for (const m of ms) for (const id of m.talents || []) for (const w of TALENTS[id]?.world || []) if (w.worldFlag === 'safe-route') safe += w.value || 1;
  mod -= safe;
  const pir = repTier(save.rep.pirates);
  if (pir === 'friendly') mod -= 1;
  if (pir === 'ally') mod -= 2;
  return { danger, mod, need: Math.max(1, 3 * danger + mod) };
}

/** Weighted pick from a region's encounters. Battles with friendly factions turn into trade/rumor. */
export function pickEncounter(save, regionId, rng = Math.random) {
  const reg = REGIONS[regionId];
  const list = reg?.encounters || [];
  if (!list.length) return null;
  const total = list.reduce((s, e) => s + e.w, 0);
  let x = rng() * total;
  let e = list[list.length - 1];
  for (const it of list) { x -= it.w; if (x < 0) { e = it; break; } }
  if (e.kind === 'battle' && e.faction && ['friendly', 'ally'].includes(repTier(save.rep[e.faction]))) return { kind: 'trader', friendly: e.faction };
  return e;
}

/** Enemies for a battle scaled to party size and hero level. */
export function scaleEnemies(base, partySize, level, data) {
  const list = [...base];
  const extra = Math.max(0, partySize - 1);
  for (let i = 0; i < extra; i++) list.push(base[i % base.length]);
  return list.map((id) => (level >= 4 && !id.endsWith('-5') && data.ENEMIES[`${id}-5`] ? `${id}-5` : id));
}

export function hasFlagInParty(save, data, flag) {
  return hasWorldFlag(members(save, data), flag);
}
