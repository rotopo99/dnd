// World state helpers over the save object (world.md §8): new game, party members, creatures for battle,
// experience and levels, rewards (Effects), deeds/approval, discovery, travel and encounters.
import { buildCreature, isAllowed, mod, asiLevelsFor } from '../rules/character.js';
import { t } from '../data/text/index.js';
import { talentAllowed } from '../data/talents.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { gainXp as engineGainXp, levelForXp, xpForLevel, MAX_LEVEL } from '../rules/progression.js';
import { COMPANIONS, COMPANION_RULES as CR } from '../data/companions.js';
import { queueBark } from './barks.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, COMBAT_TALENT_LIMIT, TALENT_LEVELS } from '../data/talents.js';
import { RELATIONS } from '../data/factions.js';
import { isBattleItem } from '../rules/combat.js';
import { clearWithdrawal } from '../rules/aftermath.js';
import { applyBackstory, backstoryWorld } from './backstory.js';
import {
  LOCATIONS, ROUTES, REGIONS, START_LOCATION, START_DISCOVERED, ENCOUNTER_TABLES, ENCOUNTER_PER_DANGER, ENCOUNTER_MODS, gadgetFor, ITEMS,
  PLAY_DATA as GAME_DATA, resolveLocation, starterKit, FINALE_TERMINALS,
} from './data.js';
import { EXODUS } from '../data/world/exodus.js';
import { applyRep, repTier, normFaction, startingRep, factionName, tierAtLeast, meetFaction, startMet } from './reputation.js';
import { SKILL_RULES as SR } from '../data/world/skill-rules.js';
import { hasWorldFlag, worldFlagValues } from './checks.js';
import { normalizeInventory, battleKit, bagOf, eqInst, giveItem, dropItem } from './inventory.js';

export const MAX_PARTY = 3; // legacy default: companions besides the hero (real limit — squadMax(save) − 1)
export { levelForXp };

/** New save after the prologue. hero: { name, race, cls, path, origin, alignment, anyStat, talents }. */
export function newSave(hero) {
  const combat = hero.talents.filter((id) => TALENTS[id] && isCombatTalent(TALENTS[id]));
  const gadget = gadgetFor(hero.cls);
  // v3 gear: the hero's chosen kit (flexible creation) or the class starter kit; belt items go to the backpack
  const kit = starterKit(hero.cls, hero.path);
  const equipment = hero.equipment || (kit ? { weapon: kit.weapon, armor: kit.armor, offhand: null, mods: [] } : null);
  const items = { ...R.start.items };
  for (const id of hero.belt || kit?.belt || []) items[id] = (items[id] || 0) + 1;
  const save = {
    version: 1, seed: (Math.random() * 1e9) | 0, day: 1,
    hero: { ...hero, level: 1, xp: 0, activeCombat: combat.slice(0, COMBAT_TALENT_LIMIT(1)), gadget: gadget ? gadget.id : null,
      hp: null, mrl: null, judgeMarks: 0, credits: R.start.credits, items, equipment, uniqueTalent: false, pendingTalents: 0,
      asi: [], pendingAsi: [], levelNews: [] },
    party: [],
    location: START_LOCATION, prevLocation: null,
    discovered: [...START_DISCOVERED], visited: [],
    rep: startingRep(hero.race, hero.origin, true), met: startMet(hero.origin),
    quests: {}, terminals: {}, flags: {}, deeds: {}, npcs: {}, caches: [], battlesDone: [], events: [],
    journal: [], cyberspace: null, settings: { aiCompanions: false },
  };
  for (const l of Object.values(LOCATIONS)) if (l.terminal) save.terminals[l.terminal.id] = l.terminal.state;
  applyBackstory(save); // world-consequences.md ч.4: hero.bg — start rep/items/credits/flags/topics, drawback
  visit(save, START_LOCATION);
  normalizeInventory(save); // v7: hero.items → backpack grid + quick slots (world/inventory.js)
  return save;
}

/** t() with {name} style placeholders. */
export const tf = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

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

/**
 * Rest (data/world/rest.js): persisted ENR (`holder.enr`, null — full) and «за отдых» abilities: `recharge: 'short'|'long'`,
 * `usesPerRest` (default usesPerBattle) — the battle copy gets usesPerBattle = what is left until the rest (`holder.restUses`).
 */
function restoreRest(u, holder) {
  if (holder.enr != null) u.enr = Math.max(0, Math.min(u.maxEnr, holder.enr));
  const used = holder.restUses || {};
  u.abilities = u.abilities.map((a) => {
    if (!a.recharge) return a;
    const per = a.usesPerRest ?? a.usesPerBattle ?? 1;
    return { ...a, usesPerRest: per, usesPerBattle: Math.max(0, per - (used[a.id] || 0)) };
  });
}

/** Weapon range of the hero's class/path (for item requirements without building). */
function weaponRangeOf(data, cls, path) {
  const c = data.CLASSES[cls];
  const p = c?.paths?.find((x) => x.id === path);
  return (p?.weapon || c?.weapon)?.range || 1;
}

/**
 * Items with passives/world (locations.js ITEMS) work while in the inventory, like a gadget (no combat talent limit).
 * The engine takes one gadget: the class gadget and such items are merged into one pseudo-gadget.
 */
function gadgetWithItems(save, data) {
  const h = save.hero;
  const base = h.gadget ? data.GADGETS?.[h.gadget] : null;
  const range = weaponRangeOf(data, h.cls, h.path);
  const items = Object.entries(h.items || {}).filter(([id, n]) => n > 0 && ITEMS[id] && (ITEMS[id].passives || ITEMS[id].world))
    .map(([id]) => ITEMS[id]).filter((it) => !it.req?.weapon || (it.req.weapon === 'ranged' ? range > 1 : range <= 1));
  const bgWorld = backstoryWorld(h); // world-consequences.md ч.4: backstory skill bonuses ride on the merged gadget
  if (bgWorld.length) items.push({ name: bgWorld[0].name, world: bgWorld });
  if (!items.length) return { data, gadget: h.gadget || undefined };
  const id = `${h.gadget || 'none'}+items`;
  const merged = {
    id, name: base?.name || items[0].name, desc: base?.desc || '',
    passives: [...(base?.passives || []), ...items.flatMap((it) => it.passives || [])],
    abilities: [...(base?.abilities || [])],
    world: [...(base?.world || []), ...items.flatMap((it) => (it.world || []).map((w) => ({ ...w })))],
  };
  return { data: { ...data, GADGETS: { ...(data.GADGETS || {}), [id]: merged } }, gadget: id };
}

/** Battle-usable items of a backpack { id: n } (consumables, grenades, traps) → unit.inventory. */
export function battleInventory(items) {
  const out = {};
  for (const [id, n] of Object.entries(items || {})) if (n > 0 && isBattleItem(ITEMS[id])) out[id] = n;
  return out;
}

export function buildHero(save, data = GAME_DATA, { race } = {}) {
  const h = save.hero;
  const G = gadgetWithItems(save, data);
  const talents = safeTalents(h.talents);
  const activeCombat = safeTalents(h.activeCombat).filter((id) => talents.includes(id)).slice(0, COMBAT_TALENT_LIMIT(h.level));
  const spec = { race: race || h.race, cls: h.cls, path: h.path, level: h.level, name: h.name, data: G.data, id: 'hero', anyStat: h.anyStat || undefined,
    stats: h.stats || undefined, skills: h.skills || undefined, proficiencies: h.proficiencies || undefined, phobia: h.phobia || undefined,
    asi: Array.isArray(h.asi) && h.asi.length ? h.asi : undefined };
  // v7: battle items — quick slots (unit.inventory) and the rest of the bag (unit.backpack, «Порыться»)
  const gear = { equipment: h.equipment || undefined, ...(h.bag ? battleKit(h) : { inventory: battleInventory(h.items) }) };
  let u;
  try {
    u = buildCreature({ ...spec, ...gear, talents, activeCombat, gadget: G.gadget });
  } catch {
    try { u = buildCreature({ ...spec, talents, activeCombat, gadget: G.gadget, race: h.race, inventory: gear.inventory, backpack: gear.backpack, quickSlots: gear.quickSlots }); } catch { u = buildCreature({ ...spec, data, race: h.race }); }
  }
  const marks = h.judgeMarks || 0;
  if (marks) { u.maxMrl = Math.max(1, u.maxMrl - R.cyberspace.mrlPerMark * marks); u.mrl = Math.min(u.mrl, u.maxMrl); }
  restore(u, h.hp, h.mrl);
  restoreRest(u, h);
  u.look = h.look || null; u.avatar = h.avatar || null;
  if (h.withdrawal) u.withdrawal = { ...h.withdrawal };
  return u;
}

export function buildCompanion(save, p, data = GAME_DATA) {
  const n = NPCS[p.npc];
  if (!n) return null;
  const race = data.RACES[n.race] ? n.race : 'human';
  const cls = data.CLASSES[n.cls] ? n.cls : 'zabivnoy';
  // companions-scenes.md: own path after the personal quest (p.path), own level (p.level; old saves — the hero's), own ASI (p.asi)
  const want = p.path || n.path;
  const path = data.CLASSES[cls].paths.some((x) => x.id === want) ? want : data.CLASSES[cls].paths.some((x) => x.id === n.path) ? n.path : undefined;
  const level = Math.max(1, Math.min(MAX_LEVEL, p.level || save.hero.level));
  const asi = Array.isArray(p.asi) ? p.asi : 'auto';
  const talents = safeTalents(p.talents);
  const equipment = p.equipment || companionKit(n, data) || undefined;
  const kit = battleKit(p);
  let u;
  try {
    if (!isAllowed(race, data.CLASSES[cls])) throw new Error('race');
    // companions: ASI automatically by the class main stat (levels-20.md)
    u = buildCreature({ race, cls, path, level, name: n.name, data, id: `c-${n.id}`, equipment, ...kit, talents, asi, activeCombat: activeOf(p, talents, level) });
  } catch {
    try { u = buildCreature({ race: 'human', cls, path, level, name: n.name, data, id: `c-${n.id}`, equipment, asi }); } catch { u = buildCreature({ race: 'human', cls, path, level, name: n.name, data, id: `c-${n.id}` }); }
  }
  restore(u, p.hp, p.mrl);
  restoreRest(u, p);
  if (save.settings.aiCompanions) u.control = 'ai';
  return u;
}

/** Active combat talents of a member entry: its own loadout (p.activeCombat) or the first combat talents; ≤ the level limit. */
function activeOf(e, talents, level) {
  const own = Array.isArray(e.activeCombat) ? e.activeCombat : talents.filter((id) => isCombatTalent(TALENTS[id]));
  return own.filter((id) => talents.includes(id) && isCombatTalent(TALENTS[id])).slice(0, COMBAT_TALENT_LIMIT(level));
}

/** Starter equipment of a companion by class / path (shops.js STARTER_KITS): { weapon, armor, offhand, mods } or null. */
export function companionKit(n, data = GAME_DATA) {
  const cls = data.CLASSES[n?.cls] ? n.cls : 'zabivnoy';
  const k = starterKit(cls, n?.path);
  return k ? { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] } : null;
}

/** Equipment holder of a party member key ('hero' or NPC id): the object whose `.equipment` is the gear. */
export function gearHolder(save, key) {
  if (key === 'hero') return save.hero;
  const p = save.party.find((x) => x.npc === key && x.state !== 'left');
  if (p && !p.equipment) p.equipment = companionKit(NPCS[p.npc]);
  return p || null;
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

/** CHA modifier of the hero (N2 recruitment). */
export const heroChaMod = (save, data = GAME_DATA) => mod(buildHero(save, data).stats?.cha ?? 10);

/**
 * Squad size (with the hero): COMPANION_RULES.squad.base + perChaMod × positive CHA mod of the hero + 'squad-size'
 * world flags of the hero's talents. → { max, base, cha, lead }.
 */
export function squadInfo(save, data = GAME_DATA) {
  const u = buildHero(save, data);
  const Q = CR.squad || { base: 4, perChaMod: 1 };
  const cha = Math.max(0, mod(u.stats?.cha ?? 10)) * Q.perChaMod;
  const lead = (u.worldFlags || []).filter((f) => f.id === 'squad-size').reduce((a, f) => a + (Number(f.value) || 1), 0);
  return { max: Q.base + cha + lead, base: Q.base, cha, lead };
}
export const squadMax = (save, data = GAME_DATA) => squadInfo(save, data).max;
/** Free companion places in the squad (0 — full). */
export const squadFree = (save, data = GAME_DATA) => Math.max(0, squadMax(save, data) - 1 - activeCompanions(save).length);

/** N2: the hostile threshold for recruitment is lowered by SR.recruit.repPerMod per hero CHA modifier point. */
export function canRecruit(save, npcId, data = GAME_DATA) {
  const n = NPCS[npcId];
  if (!n || !n.recruitable) return 'no';
  if (save.party.some((p) => p.npc === npcId && p.state !== 'left')) return 'already';
  const f = normFaction(n.faction);
  const bonus = SR.recruit.repPerMod * Math.max(0, heroChaMod(save, data));
  if (f && save.rep[f] != null && repTier(save.rep[f] + bonus) === 'hostile') return 'hostile';
  return null;
}

/**
 * N2: paid hire of a mercenary (NPC with service 'recruit' but no companion data). { price, why } — why: null | 'already' |
 * 'cha' (hero CHA below SR.recruit.hireCha) | 'rep' (faction tier below SR.recruit.hireTier) | 'money'. tier — rep tier of
 * the NPC's faction (or of the node's faction for faction-less mercenaries).
 */
export function hireInfo(save, npcId, tier, data = GAME_DATA) {
  const n = NPCS[npcId];
  const H = SR.recruit;
  const cha = buildHero(save, data).stats?.cha ?? 10;
  const price = Math.round(H.hirePricePerLevel * save.hero.level * (1 - H.hireDiscountPerMod * Math.max(0, mod(cha))));
  let why = null;
  if (!n || n.recruitable || !(n.services || []).includes('recruit')) why = 'no';
  else if (save.party.some((p) => p.npc === npcId && p.state !== 'left')) why = 'already';
  else if (cha < H.hireCha) why = 'cha';
  else if (tier && !tierAtLeast(tier, H.hireTier)) why = 'rep';
  else if (save.hero.credits < price) why = 'money';
  return { price, why };
}

export function recruit(save, npcId) {
  const n = NPCS[npcId];
  const old = save.party.find((p) => p.npc === npcId);
  const state = squadFree(save) > 0 ? 'active' : 'waiting';
  // companions-scenes.md: a returning companion starts cold (returnLoyalty), a new one — at loyalty.start; own XP from the hero's level
  if (old) Object.assign(old, { state, approval: old.state === 'left' ? CR.loyalty.returnLoyalty : Math.max(old.approval, CR.loyalty.returnLoyalty), warned: false, waitDay: save.day });
  else save.party.push({ npc: npcId, state, hp: null, mrl: null, approval: COMPANIONS[npcId]?.loyalty?.start || 0, level: save.hero.level, xp: xpForLevel(save.hero.level), waitDay: save.day, talents: safeTalents(n.companion?.talents), warned: false, ultimatum: false, equipment: companionKit(n), bag: null });
  bagOf(save.party.find((p) => p.npc === npcId));
  if (state === 'waiting') save.party.find((p) => p.npc === npcId).waitAt = save.location; // reserve waits where hired
  ensureCompanionXp(save, save.party.find((p) => p.npc === npcId)); // unspent level-ups up to the join level (picked like the hero's)
  save.npcs[npcId] = { ...(save.npcs[npcId] || {}), met: true, recruited: true };
  journal(save, tf('fx.joined', { name: n.name }));
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
  if (req.quest) {
    const q = save.quests[req.quest.id || req.quest];
    if (!q) return false;
    if (req.stage && q.stage !== req.stage) return false;
    if (req.quest.state && q.state !== req.quest.state) return false;
  }
  // third-exodus.md §2: avgLevel (party mean level), terminalsOff (FINALE_TERMINALS not 'ritual'), visitedRegions (a node of each),
  // flags (all set), any: [Requires] (one of), not: Requires
  if (req.avgLevel && partyAvgLevel(save) < req.avgLevel) return false;
  if (req.terminalsOff && FINALE_TERMINALS.filter((id) => save.terminals[id] && save.terminals[id] !== 'ritual').length < req.terminalsOff) return false;
  if (req.visitedRegions && !req.visitedRegions.every((r) => (save.visited || []).some((id) => LOCATIONS[id]?.region === r))) return false;
  if (req.flags && !req.flags.every((f) => save.flags[f])) return false;
  if (req.any && !req.any.some((r) => requiresOk(save, r, data))) return false;
  // companions-scenes.md: { loyalty: { npc, min } } — the companion is in the party (not left) with approval ≥ min
  if (req.loyalty) {
    const p = save.party.find((x) => x.npc === req.loyalty.npc && x.state !== 'left');
    if (!p || (p.approval || 0) < req.loyalty.min) return false;
  }
  if (req.not && requiresOk(save, req.not, data)) return false;
  return true;
}

/** Mean level of the active party (companions without their own level follow the hero). */
export function partyAvgLevel(save) {
  const lv = [save.hero.level || 1, ...activeCompanions(save).map((p) => p.level || save.hero.level || 1)];
  return lv.reduce((s, x) => s + x, 0) / lv.length;
}

/**
 * Apply Effects / Outcome: { xp, credits, rep, deeds, flags, items:[{item,n}], removeItems, talent, recruit, terminal,
 * hp:-N, mrl:-N (each member), text }. Returns toast lines [{ text, color }]. talentChoice is handled by the UI.
 */
export function grant(save, r = {}, data = GAME_DATA, { keyChoice = false } = {}) {
  const out = [];
  if (!r) return out;
  if (r.credits) { save.hero.credits = Math.max(0, save.hero.credits + r.credits); out.push({ text: tf('fx.credits', { n: `${r.credits > 0 ? '+' : ''}${r.credits}` }), color: 'b' }); }
  for (const it of r.items || []) { giveItem(save, it.item, it.n || 1, it.q); out.push({ text: `+ ${itemName(it.item)}${it.n > 1 ? ` ×${it.n}` : ''}`, color: 'a' }); }
  for (const it of r.removeItems || []) dropItem(save, it.item, it.n || 1);
  // vendors-bestiary.md: a new `cx-*` flag opens a codex find
  if ([...(r.flags || []), r.flag].some((f) => typeof f === 'string' && f.startsWith('cx-') && !save.flags[f])) out.push({ text: t('codex.newFind'), color: 'f' });
  for (const f of r.flags || []) save.flags[f] = true;
  if (r.flag) save.flags[r.flag] = true;
  if (r.terminal) save.terminals[r.terminal.id] = r.terminal.state;
  if (r.rep) for (const [f, d] of Object.entries(r.rep)) out.push(...repToasts(applyRep(save, f, repDelta(save, d, data))));
  if (r.talent && TALENTS[r.talent] && !save.hero.talents.includes(r.talent)) out.push(...learnTalent(save, r.talent, data));
  if (r.recruit && NPCS[r.recruit] && canRecruit(save, r.recruit) !== 'already') { recruit(save, r.recruit); out.push({ text: tf('fx.joined', { name: NPCS[r.recruit].name }), color: 'j' }); }
  if (r.hp || r.mrl) damageParty(save, r.hp || 0, r.mrl || 0, data);
  if (r.xp) out.push(...gainXp(save, r.xp, data));
  for (const d of r.deeds || []) out.push(...deed(save, d, keyChoice));
  out.push(...companionRepCheck(save));
  return out;
}

const itemName = (id) => ITEMS[id]?.name || id;

/** Party member entry by key: save.hero for 'hero', else the (not left) party entry or null. */
export function memberEntry(save, key = 'hero') {
  if (key === 'hero') return save.hero;
  return save.party.find((p) => p.npc === key && p.state !== 'left') || null;
}

/** Battle creature of a member key (hero or companion). */
export function memberUnit(save, key = 'hero', data = GAME_DATA) {
  if (key === 'hero') return buildHero(save, data);
  const p = memberEntry(save, key);
  return p ? buildCompanion(save, p, data) : null;
}

/** talentAllowed context of a member: its race / class / stats / level / weapon (companions — from their own build). */
export function talentCtx(save, key, u) {
  const h = save.hero;
  if (key === 'hero') return { race: h.race, cls: h.cls, origin: h.origin, alignment: h.alignment, stats: u.stats, level: h.level, weaponRange: u.weapon?.range || 1, tags: u.tags };
  const n = NPCS[key] || {};
  return { race: u.raceId || n.race, cls: u.classId || n.cls, origin: n.origin, alignment: n.alignment, stats: u.stats, level: u.level, weaponRange: u.weapon?.range || 1, tags: u.tags };
}

/** Can a member (hero by default) take this world-given talent: race, alignment, tags, weapon, stats, level (jobs/origins are not checked). */
export function talentOk(save, id, data = GAME_DATA, key = 'hero') {
  const tl = TALENTS[id];
  if (!tl) return false;
  const u = memberUnit(save, key, data);
  if (!u) return false;
  const req = { ...(tl.req || {}) };
  delete req.jobs; delete req.origins; // alignment is still checked: good heroes get no evil talents and vice versa
  return talentAllowed({ ...tl, req }, talentCtx(save, key, u));
}

/** Learn a talent (quest reward, trainer, companion, Cyberspace, level pick). opts.key — the member (hero by default). Returns toasts. */
export function learnTalent(save, id, data = GAME_DATA, { force = false, key = 'hero' } = {}) {
  const tl = TALENTS[id];
  const e = memberEntry(save, key);
  if (!tl || !e) return [];
  e.talents = e.talents || [];
  if (e.talents.includes(id)) return [];
  if (!force && !talentOk(save, id, data, key)) return [{ text: tf('fx.talentNotAllowed', { name: tl.name }), color: 'c' }];
  const before = key === 'hero' ? null : buildCompanion(save, e, data);
  if (key !== 'hero' && !Array.isArray(e.activeCombat)) e.activeCombat = activeOf(e, safeTalents(e.talents), e.level || 1);
  e.talents.push(id);
  if (isCombatTalent(tl) && e.activeCombat.length < COMBAT_TALENT_LIMIT(e.level || 1)) e.activeCombat.push(id);
  if (key !== 'hero') {
    rebuildKeep(save, e, before, data);
    const text = `${NPCS[key]?.name || key}: ${tf('fx.talent', { name: tl.name })}`;
    journal(save, text);
    return [{ text, color: 'a' }];
  }
  journal(save, tf('fx.talent', { name: tl.name }));
  return [{ text: tf('fx.talent', { name: tl.name }), color: 'a' }];
}

/** Level talent pick of a member (pendingTalents − 1). → toasts. */
export function chooseMemberTalent(save, key, id, data = GAME_DATA) {
  const e = memberEntry(save, key);
  if (!e || !(e.pendingTalents > 0) || !TALENTS[id]) return [];
  const out = learnTalent(save, id, data, { force: true, key });
  if (out.length) e.pendingTalents--;
  return out;
}

/** Unspent level-ups of a member: { asi: [levels], talents: n, any }. */
export function memberPending(save, key) {
  const e = memberEntry(save, key);
  const asi = [...(e?.pendingAsi || [])].sort((a, b) => a - b);
  const talents = Math.max(0, e?.pendingTalents || 0);
  return { asi, talents, any: asi.length > 0 || talents > 0 };
}

/** Toggle a combat talent of a member between active and «в рюкзаке». → 'on' | 'off' | 'limit' | null. */
export function toggleActiveTalent(save, key, id, data = GAME_DATA) {
  const e = memberEntry(save, key);
  if (!e || !(e.talents || []).includes(id) || !TALENTS[id] || !isCombatTalent(TALENTS[id])) return null;
  const before = key === 'hero' ? null : buildCompanion(save, e, data);
  if (!Array.isArray(e.activeCombat)) e.activeCombat = activeOf(e, safeTalents(e.talents), e.level || 1);
  const a = e.activeCombat;
  const i = a.indexOf(id);
  let r;
  if (i >= 0) { a.splice(i, 1); r = 'off'; }
  else if (a.length < COMBAT_TALENT_LIMIT(e.level || 1)) { a.push(id); r = 'on'; }
  else return 'limit';
  if (before) rebuildKeep(save, e, before, data);
  return r;
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
  for (const p of save.party) ensureCompanionXp(save, p);
  const r = engineGainXp(save.hero, xp, data);
  save.hero.xp = r.xp;
  out.push({ text: tf('fx.xp', { n: xp }), color: 'h' });
  if (r.leveledUp) {
    // keepDamage (rules/progression.js rebuildHero): new max − damage taken, at least 1
    // companions level on their own XP (shareXp below)
    const h0 = buildHero(save, data);
    save.hero.level = r.level;
    save.hero.hp = null; save.hero.mrl = null;
    keepDamage(save.hero, h0, buildHero(save, data));
    save.hero.pendingTalents = (save.hero.pendingTalents || 0) + r.talentPicks;
    // levels-20.md: ASI choices wait for the player; levelNews — levels not yet shown in the level-up window
    save.hero.pendingAsi = [...(save.hero.pendingAsi || []), ...r.asiLevels];
    save.hero.levelNews = [...(save.hero.levelNews || []), ...r.levels];
    out.push({ text: tf('fx.level', { n: r.level }), color: 'a' });
    journal(save, tf('fx.level', { n: r.level }));
  }
  out.push(...shareXp(save, xp, data));
  return out;
}

// keepDamage (rules/progression.js rebuildHero): new max − damage taken, at least 1
function keepDamage(entry, oldU, newU) {
  if (!oldU || !newU) return;
  entry.hp = Math.max(1, newU.maxHp - Math.max(0, oldU.maxHp - oldU.hp));
  entry.mrl = Math.max(1, newU.maxMrl - Math.max(0, oldU.maxMrl - oldU.mrl));
}

/**
 * Companion level fields (companions-scenes.md + party talents): old saves / new entries get own XP and level
 * from the hero, activeCombat, asi[], pendingAsi, pendingTalents. Migration (p.tv !== 1): XP above the level
 * becomes levels; ASI and talent levels ≤ the level that were never chosen by the player (auto ASI of the
 * old rule included) become unspent level-ups — the player picks them like the hero's.
 */
export function ensureCompanionXp(save, p, data = GAME_DATA) {
  if (!p) return p;
  if (!Number.isFinite(p.level) || p.level < 1) p.level = Math.max(1, Math.min(MAX_LEVEL, save.hero.level || 1));
  if (!Number.isFinite(p.xp)) p.xp = xpForLevel(p.level);
  if (p.tv === 1) return p;
  const cls = data.CLASSES[NPCS[p.npc]?.cls];
  const cap = Math.max(p.level, Math.min(MAX_LEVEL, (save.hero.level || 1) + CR.xp.levelCapOverHero));
  const lv = Math.min(cap, Math.max(p.level, levelForXp(p.xp)));
  for (let L = p.level + 1; L <= lv; L++) p.levelNews = [...(p.levelNews || []), L];
  p.level = lv;
  p.talents = safeTalents(p.talents);
  p.asi = (Array.isArray(p.asi) ? p.asi : []).filter((e) => e && Number.isInteger(e.level) && !e.auto);
  const asiLv = cls ? asiLevelsFor(cls) : [];
  p.pendingAsi = [...new Set([...(p.pendingAsi || []), ...asiLv.filter((L) => L <= p.level && !p.asi.some((e) => e.level === L))])].sort((a, b) => a - b);
  const tl = data.TALENT_LEVELS || TALENT_LEVELS;
  p.pendingTalents = Math.max(0, p.pendingTalents || 0) + tl.filter((L) => L <= p.level).length;
  if (!Array.isArray(p.activeCombat)) p.activeCombat = activeOf(p, p.talents, p.level);
  p.asiNotes = [];
  p.tv = 1;
  return p;
}

/** XP share of a companion: active ×activeShare, waiting / in Cyberspace ×waitingShare, left 0; behind the hero ×catchUpMul. */
export function companionXpShare(save, p) {
  const X = CR.xp;
  if (!p || p.state === 'left') return X.leftShare;
  const base = p.state === 'active' ? X.activeShare : X.waitingShare;
  return base * ((p.level || 1) < save.hero.level ? X.catchUpMul : 1);
}

/** Give companions their share of a hero reward; level ≤ hero level + levelCapOverHero. → toasts. */
export function shareXp(save, xp, data = GAME_DATA) {
  const out = [];
  const cap = Math.min(MAX_LEVEL, save.hero.level + CR.xp.levelCapOverHero);
  for (const p of save.party) {
    ensureCompanionXp(save, p);
    const gain = Math.round(xp * companionXpShare(save, p));
    if (gain <= 0) continue;
    const maxXp = cap >= MAX_LEVEL ? Infinity : xpForLevel(cap + 1) - 1;
    p.xp = Math.max(p.xp, Math.min(p.xp + gain, maxXp));
    const lv = Math.min(cap, levelForXp(p.xp));
    if (lv > p.level) out.push(...companionLevelUp(save, p, lv, data));
  }
  return out;
}

/** Rebuild a companion after a change and keep the damage taken. */
function rebuildKeep(save, p, before, data) {
  const hp = p.hp, mrl = p.mrl;
  p.hp = null; p.mrl = null;
  const after = buildCompanion(save, p, data);
  p.hp = hp; p.mrl = mrl;
  if (hp === 0) return; // down / in Cyberspace stays so
  if (hp != null || mrl != null) keepDamage(p, before, after);
}

/**
 * A companion reaches level `to` (like the hero): HP/MRL keep the damage, p.levelNews (level-up windows,
 * scenes/levelup.js), talent levels → p.pendingTalents, ASI levels → p.pendingAsi (the player picks).
 */
export function companionLevelUp(save, p, to, data = GAME_DATA) {
  const n = NPCS[p.npc];
  const cls = data.CLASSES[n?.cls];
  if (!cls) { p.level = to; return []; }
  ensureCompanionXp(save, p, data);
  const before = buildCompanion(save, p, data);
  if (!Array.isArray(p.asi)) p.asi = [];
  const from = p.level;
  if (to <= from) return [];
  p.level = to;
  const asiLv = asiLevelsFor(cls);
  const tl = data.TALENT_LEVELS || TALENT_LEVELS;
  for (let L = from + 1; L <= to; L++) {
    p.levelNews = [...(p.levelNews || []), L];
    if (tl.includes(L)) p.pendingTalents = (p.pendingTalents || 0) + 1;
    if (asiLv.includes(L) && !p.asi.some((e) => e.level === L) && !(p.pendingAsi || []).includes(L)) p.pendingAsi = [...(p.pendingAsi || []), L];
  }
  rebuildKeep(save, p, before, data);
  if (p.state === 'active') queueBark('levelUp', p.npc);
  return [{ text: tf('comp.levelTitle', { name: n.name, n: to }), color: 'a' }];
}

/** Companion ASI choice: { stats } | { talent }. Keeps the damage. → toasts. */
export function chooseCompanionAsi(save, npcId, level, choice, data = GAME_DATA) {
  const p = save.party.find((x) => x.npc === npcId);
  const i = (p?.pendingAsi || []).indexOf(level);
  if (i < 0) return [];
  const before = buildCompanion(save, p, data);
  p.pendingAsi.splice(i, 1);
  p.asi = [...(p.asi || []).filter((e) => e.level !== level), choice.talent ? { level, talent: choice.talent } : { level, stats: { ...choice.stats } }];
  rebuildKeep(save, p, before, data);
  if (choice.talent) return learnTalent(save, choice.talent, data, { force: true, key: npcId });
  const name = NPCS[npcId]?.name || npcId;
  return [{ text: `${name}: ${Object.entries(choice.stats).map(([k, v]) => `${t(`stat.${k}`)} +${v}`).join(', ')}`, color: 'a' }];
}


/**
 * Apply the hero's ASI choice for a pending level: { stats: { str: 2 } | { str: 1, dex: 1 } } or { talent: id }.
 * Returns toasts. HP/MRL keep the damage taken (like a level-up).
 */
export function chooseAsi(save, level, choice, data = GAME_DATA) {
  const h = save.hero;
  const pend = h.pendingAsi || [];
  const i = pend.indexOf(level);
  if (i < 0) return [];
  const before = buildHero(save, data);
  pend.splice(i, 1);
  h.asi = [...(h.asi || []).filter((e) => e.level !== level), choice.talent ? { level, talent: choice.talent } : { level, stats: { ...choice.stats } }];
  const out = [];
  if (choice.talent) out.push(...learnTalent(save, choice.talent, data, { force: true }));
  const after = buildHero(save, data);
  h.hp = Math.max(1, after.maxHp - Math.max(0, before.maxHp - before.hp));
  h.mrl = Math.max(1, after.maxMrl - Math.max(0, before.maxMrl - before.mrl));
  if (choice.stats) out.push({ text: `${t('lvl.asi')}: ${Object.entries(choice.stats).map(([k, v]) => `${t(`stat.${k}`)} +${v}`).join(', ')}`, color: 'a' });
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
    const A = R.approval;
    const step = key ? A.keyDeed : A.deed;
    // companions-scenes.md: personal deed weights (COMPANIONS[id].loyalty.deeds) add to the shared likes/dislikes
    const d = (likes.includes(tag) ? step : dislikes.includes(tag) ? -step : 0) + (COMPANIONS[p.npc]?.loyalty?.deeds?.[tag] || 0);
    if (!d) continue;
    out.push({ text: tf(d > 0 ? 'fx.approves' : 'fx.disapproves', { name: n.name, n: `${d > 0 ? '+' : ''}${d}` }), color: d > 0 ? 'j' : 'c' });
    if (p.state === 'active') queueBark(d > 0 ? 'likeDeed' : 'dislikeDeed', p.npc);
    out.push(...adjustApproval(save, p, d, { quiet: true }));
    if (p.state === 'left') continue;
    const teaches = n.companion?.teaches || (n.companion?.talents || [])[0];
    if (p.approval >= A.teach && !p.taught && teaches && TALENTS[teaches]) {
      p.taught = true;
      out.push(...learnTalent(save, teaches));
    }
  }
  return out;
}

/**
 * Change a companion's approval (loyalty) by d: clamp, warning at warn, departure at leave. quiet — no «лояльность ±N» toast.
 * → toasts. Used by deeds and by world/companions.js events (quests, battles, rests, waiting).
 */
export function adjustApproval(save, p, d, { quiet = false } = {}) {
  const out = [];
  if (!p || p.state === 'left' || !d) return out;
  const A = R.approval;
  const n = NPCS[p.npc];
  p.approval = Math.max(A.min, Math.min(A.max, (p.approval || 0) + d));
  if (!quiet) out.push({ text: tf('comp.loyaltyDelta', { name: n.name, n: `${d > 0 ? '+' : ''}${d}` }), color: d > 0 ? 'j' : 'c' });
  if (p.approval <= A.leave) out.push(...leave(save, p, 'approval'));
  else if (p.approval <= A.warn && !p.warned) { p.warned = true; out.push({ text: tf('fx.warn', { name: n.name }), color: 'a' }); }
  return out;
}

function leave(save, p, why) {
  const n = NPCS[p.npc];
  p.state = 'left';
  journal(save, tf(why === 'approval' ? 'fx.leftApproval' : 'fx.leftFaction', { name: n.name }));
  // companions-scenes.md: the leave line (COMPANIONS[id].leave.line); the companion is back at its own node (npcHome)
  const line = COMPANIONS[p.npc]?.leave?.line;
  if (line) journal(save, tf('comp.leaveLine', { name: n.name, line }));
  const out = [{ text: tf('fx.leaves', { name: n.name }), color: 'c' }];
  if (line) out.push({ text: tf('comp.leaveLine', { name: n.name, line }), color: '5' });
  return out;
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
      if (p.ultimatum) out.push(...leave(save, p, 'faction'));
      else { p.ultimatum = true; out.push({ text: tf('fx.ultimatum', { name: NPCS[p.npc].name }), color: 'a' }); }
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
    if (f && save.rep[f] != null && save.rep[f] <= -50) out.push(...leave(save, p, 'faction'));
  }
  return out;
}

/** Rest: frac 1 — full ЗДР/МРЛ; 0.5 — field camp. Companions in Cyberspace are skipped. */
export function restParty(save, data = GAME_DATA, frac = 1) {
  const h = save.hero;
  if (frac >= 1 && h.withdrawal) clearWithdrawal(h); // v3.1: a full rest ends opiate withdrawal
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
export const routesFrom = (raw) => { const id = resolveLocation(raw); return ROUTES.filter((r) => r.from === id || r.to === id); };
export const otherEnd = (r, id) => (r.from === resolveLocation(id) ? r.to : r.from);

/**
 * Route is usable: both ends discovered; a hidden route also needs its reveal flag, an opened-route flag
 * (`route:from:to`, set when the hidden node was found), a discovered hidden end node or a party flag
 * hidden-routes / squeeze (pass partyFlags: Set of world flags); requires ok.
 */
export function isKnownRoute(save, r, partyFlags = null) {
  if (!save.discovered.includes(r.from) || !save.discovered.includes(r.to)) return false;
  if (r.hidden) {
    const open = (r.reveal && save.flags[r.reveal]) || save.flags[routeFlag(r)]
      || [r.from, r.to].some((id) => LOCATIONS[id]?.hidden && save.discovered.includes(id))
      || (partyFlags && R.hiddenRouteFlags.some((f) => partyFlags.has(f)));
    if (!open) return false;
  }
  if (r.requires && !requiresOk(save, r.requires)) return false;
  return true;
}
export const routeFlag = (r) => `route:${r.from}:${r.to}`;

/** Party world flags as a Set (for isKnownRoute and similar per-frame checks). */
export function partyFlagSet(save, data = GAME_DATA) {
  const set = new Set();
  for (const m of members(save, data)) for (const w of m.unit.worldFlags || []) set.add(w.id);
  return set;
}

/** A hidden node was found (check, rumor, flag): discover it and open the hidden routes leading to it. */
export function openHidden(save, raw) {
  const id = resolveLocation(raw);
  discover(save, id);
  for (const r of routesFrom(id)) if (r.hidden) save.flags[routeFlag(r)] = true;
}

/** Visit a node: mark visited, discover non-hidden neighbours (and hidden ones whose reveal flag is set). */
export function visit(save, raw) {
  const id = resolveLocation(raw);
  if (save.location && save.location !== id) save.prevLocation = save.location;
  save.location = id;
  if (!save.visited.includes(id)) save.visited.push(id);
  meetFaction(save, locFaction(id));
  discover(save, id);
  for (const r of routesFrom(id)) {
    const o = otherEnd(r, id);
    const l = LOCATIONS[o];
    const revealed = (r.reveal && save.flags[r.reveal]) || (l?.hidden?.reveal || []).some((f) => save.flags[f]);
    if ((r.hidden || l?.hidden) && !revealed) continue;
    if (r.hidden) save.flags[routeFlag(r)] = true;
    discover(save, o);
  }
}

export function discover(save, raw) {
  const id = resolveLocation(raw);
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
  // third-exodus.md: mark 1+ — the cult's lands get busier (save.exodus.mark, the timer is off once stopped)
  const E = EXODUS.encounter, reg = LOCATIONS[resolveLocation(r.to)]?.region;
  if (save.exodus && (save.exodus.mark || 0) >= E.fromMark && !EXODUS.stopFlags.some((f) => save.flags[f]) && E.regions.includes(reg)) mod += E.mod;
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

/**
 * Gear stigma (v3.1 worldFlags id 'stigma' from the hero's weapon / armour, e.g. Корона из кубков: scavengers −20):
 * { faction: delta } added to how that faction sees the party (effectiveRep), the stored rep is untouched.
 */
export function stigmaRep(save, data = GAME_DATA) {
  const out = {};
  for (const w of buildHero(save, data).worldFlags || []) {
    if (w.id !== 'stigma') continue;
    for (const f of w.factions || []) { const k = normFaction(f); out[k] = (out[k] || 0) + (w.value || 0); }
  }
  return out;
}
export const effectiveRep = (save, f, data = GAME_DATA) => Math.max(-100, Math.min(100, (save.rep[normFaction(f)] ?? 0) + (stigmaRep(save, data)[normFaction(f)] || 0)));

export const hasFlagInParty = (save, data, flag) => hasWorldFlag(members(save, data), flag);
export const partySize = (save) => 1 + activeCompanions(save).filter((p) => p.hp !== 0).length;
export const partyMax = MAX_PARTY; // legacy; see squadMax
export { levelForXp as levelFor };
