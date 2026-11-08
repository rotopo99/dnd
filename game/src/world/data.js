// World data access point: re-exports the designer's / writer's data (game/src/data/world/*, gadgets.js, skills.js,
// text/npc-dialogue.js, text/party-events.js) plus small helpers the UI needs. The rest of the world code
// imports only from here.
import { NPCS } from '../data/npcs.js';
import { QUESTS as QUESTS_V1 } from '../data/world/quests.js';
import { QUESTS_V3 } from '../data/world/quests-v3.js';
import { QUESTS_NPC } from '../data/world/quests-npc.js';
import { QUESTS_DENSITY } from '../data/world/density-quests.js';
import { PERSONAL_QUESTS } from '../data/companions.js';
import { LOCATION_LORE } from '../data/world/locations-lore.js';
import { NPC_DIALOGUE } from '../data/text/npc-dialogue.js';
import { PARTY_EVENTS_TEXT } from '../data/text/party-events.js';
import { QUEST_TURNIN } from '../data/text/quest-turnin.js';
import { QUEST_TURNIN_CYBER } from '../data/text/quest-turnin-cyber.js';
import { QUESTS_CYBER } from '../data/world/quests-cyber.js';
import { AUTOABLE_QUESTS } from '../data/world/expeditions.js';
import { CONSEQUENCES } from '../data/world/consequences.js';
import { PROLOGUE } from '../data/text/prologue.js';
import { LOCATIONS, ITEMS as WORLD_ITEMS, resolveLocation } from '../data/world/locations.js';
import { GAME_DATA } from '../data/index.js';
import { WEAPONS } from '../data/items/weapons.js';
import { ARMOR } from '../data/items/armor.js';
import { MODS } from '../data/items/mods.js';
import { CONSUMABLES } from '../data/items/consumables.js';
import { SHOPS, STARTER_KITS } from '../data/items/shops.js';

export { REGIONS, FUTURE_REGIONS } from '../data/world/regions.js';
export {
  LOCATIONS, START_LOCATION, START_DISCOVERED, DEFAULT_RESPAWN, TERMINAL_ACTIONS, FINALE_TERMINALS, SERVICE_PRICES,
  MAP_SPACE, MAP_NODES, HUB_STATES, ALIASES, TIER_NAMES, resolveLocation,
} from '../data/world/locations.js';
export { ROUTES, ENCOUNTER_TABLES, ENCOUNTER_PER_DANGER, ENCOUNTER_MODS, AMBUSH, FIELD_CAMP, FARE } from '../data/world/travel.js';
export { DEED_TAGS } from '../data/world/quests.js';
import { EVENTS as EVENTS_BASE } from '../data/world/events.js';
import { EVENTS_DENSITY } from '../data/world/density-events.js';
/** Events: party events + world density (density-events.js — texts are plain strings, storyText passes them through). */
export const EVENTS = { ...EVENTS_BASE, ...EVENTS_DENSITY };
export { ORIGINS, originAllowed } from '../data/world/origins.js';
export { GADGETS, gadgetFor } from '../data/gadgets.js';
export { SPECIALIZATIONS } from '../data/skills.js';
export { SKILL_RULES } from '../data/world/skill-rules.js';
export { LOCATION_LORE };
export { QUEST_TURNIN };
export { NPC_DIALOGUE, PARTY_EVENTS_TEXT };

/** All battles: v1.0 (enemies.js) + v3 (enemies-v3.js), merged in data/index.js. */
export const ENCOUNTERS = GAME_DATA.ENCOUNTERS;
/** All quests: v1.0 (quests.js) + v3 (quests-v3.js, story by the writer) + v4 NPC quests (quests-npc.js, giver = NPC.quest). */
const QUESTS_D = Object.fromEntries(QUESTS_DENSITY.map((q) => [q.id, q]));
/**
 * companions-scenes.md: personal quests (data/companions.js PERSONAL_QUESTS) in the quest schema. giver = the companion;
 * stages run in order, `loyaltyMin` → stage gate requires { loyalty: { npc, min } } (state.js requiresOk); rewards.loyalty /
 * unlockAltPath → q.personal (quests.js reward → world/companions.js personalQuestDone).
 */
export function personalQuest(pq) {
  const name = NPCS[pq.npc]?.name || pq.npc;
  const stages = pq.stages.map((s, i) => {
    const st = { id: s.id, text: s.text, goal: { ...s.goal }, ...(pq.stages[i + 1] ? { next: pq.stages[i + 1].id } : {}) };
    if (s.loyaltyMin != null) {
      st.requires = { loyalty: { npc: pq.npc, min: s.loyaltyMin } };
      st.gate = { text: 'comp.gateLoyalty', vars: { name, n: s.loyaltyMin } };
    }
    return st;
  });
  const { loyalty, unlockAltPath, ...rewards } = pq.rewards || {};
  return { id: pq.id, name: pq.name, giver: pq.npc, summary: stages[0]?.text || '', personal: { npc: pq.npc, loyalty, altPath: !!unlockAltPath }, stages, rewards };
}
export const QUESTS_PERSONAL = Object.fromEntries(Object.values(PERSONAL_QUESTS).map((q) => [q.id, personalQuest(q)]));
export const QUESTS = { ...QUESTS_V1, ...QUESTS_V3, ...QUESTS_NPC, ...QUESTS_D, ...QUESTS_PERSONAL, ...QUESTS_CYBER };
// cyberspace-v2.md: turn-in lines of the cyber quests; expeditions.md: mini quests a reserve companion can close (autoable)
Object.assign(QUEST_TURNIN, QUEST_TURNIN_CYBER);
for (const id of Object.keys(AUTOABLE_QUESTS)) if (QUESTS[id]) QUESTS[id].autoable = true;
export const isNpcQuest = (id) => !!QUESTS_NPC[id] || !!QUESTS_D[id];

/** Lore of a node (locations-lore.js): { desc, spots, rumor, problem } or null. */
export const locationLore = (id) => LOCATION_LORE[resolveLocation(id)] || null;

/** Rumors of all lore entries: [{ loc, text }] (shared rumor pool: taverns, road rumors). */
export const LORE_RUMORS = Object.entries(LOCATION_LORE).filter(([, l]) => l.rumor).map(([loc, l]) => ({ loc, text: l.rumor }));

/** Same place (aliases of v1.0 ids count as their target). */
export const sameLocation = (a, b) => !!a && !!b && resolveLocation(a) === resolveLocation(b);

/** Base enemy id: balance variants look like 'cleaner^2.2'. */
export const baseId = (id) => String(id || '').split('^')[0];

/** One item catalogue (v3 gear + v1.0 world items), merged in data/index.js. */
export const ITEMS = GAME_DATA.ITEMS;
export { WEAPONS, ARMOR, MODS, CONSUMABLES, SHOPS, STARTER_KITS, WORLD_ITEMS };

/** Rules data for the engine with the item catalogue (buildCreature equipment, combat useItem). */
export const PLAY_DATA = GAME_DATA;

/** Starter kit of a class / path (shops.js STARTER_KITS, key 'cls:path' wins). Unknown items are dropped. */
export function starterKit(cls, path) {
  const k = STARTER_KITS[`${cls}:${path}`] || STARTER_KITS[cls];
  if (!k) return null;
  return { ...k, weapon: ITEMS[k.weapon] ? k.weapon : null, armor: ITEMS[k.armor] ? k.armor : null, belt: (k.belt || []).filter((id) => ITEMS[id]) };
}

/** Shop stock of a faction (shops.js SHOPS): stock + friendly / ally lines by reputation tier. null — no shop. */
export function factionStock(faction, tier) {
  const s = faction && SHOPS[faction];
  if (!s) return null;
  const rank = { hostile: 0, suspicious: 1, neutral: 2, friendly: 3, ally: 4 }[tier] ?? 2;
  return [...(s.stock || []), ...(rank >= 3 ? s.friendly || [] : []), ...(rank >= 4 ? s.ally || [] : [])].filter((id) => ITEMS[id]);
}

/** Default trade stock: every priced, non-key v1.0 item. */
export const SHOP_STOCK = Object.values(WORLD_ITEMS).filter((i) => i.price > 0 && !i.key && !i.contraband && !i.passives).map((i) => i.id);

/** NPCs a quest waits for at a location now (talk goals of active stages, incl. 'all' subgoals and option goals). */
function wantedAt(save, id) {
  const out = new Set();
  for (const [qid, st] of Object.entries(save?.quests || {})) {
    if (st?.state !== 'active') continue;
    const stage = QUESTS[qid]?.stages.find((x) => x.id === st.stage);
    const goals = stage ? [stage.goal, ...(stage.goal.goals || []), ...(stage.goal.options || []).map((o) => o.goal)] : [];
    for (const g of goals) if (g?.kind === 'talk' && g.npc && sameLocation(g.location, id)) out.add(g.npc);
  }
  // quest turn-in (data/text/quest-turnin.js): the NPC waiting for the reward stands at its burg too
  for (const [qid, st] of Object.entries(save?.quests || {})) {
    const n = st?.turnin && QUEST_TURNIN[qid]?.npc;
    if (n && sameLocation(NPCS[n]?.burg, id)) out.add(n);
  }
  return out;
}

/** NPC id → node whose explicit `npcs` list has it (that node wins over npcs.js `location`). */
const LISTED_AT = new Map();
for (const l of Object.values(LOCATIONS)) for (const n of l.npcs || []) if (!LISTED_AT.has(n)) LISTED_AT.set(n, l.id);

/**
 * NPC ids standing on a location: the node's explicit `npcs` list merged with npcs.js NPCs whose `location` resolves
 * here, NPCs whose home `burg` is here and whose `location` is not a node (unless another node lists them), and NPCs
 * with a `burg` here that an active quest waits for (talk goal at this burg).
 */
/**
 * World changes of NPC places (world-consequences.md): quest consequences `npcs.appear/vanish/move` in the order of
 * save.cq, then deaths (save.npcs[id].dead). → Map npcId → { home: still at the usual place, extra: Set of nodes }.
 */
export function npcPlacement(save) {
  const m = new Map();
  const get = (n) => { if (!m.has(n)) m.set(n, { home: true, extra: new Set() }); return m.get(n); };
  for (const c of save?.cq || []) {
    const e = CONSEQUENCES[c.qid]?.[c.o];
    if (!e) continue;
    for (const a of e.npcs?.appear || []) get(a.npc).extra.add(resolveLocation(a.at));
    for (const n of e.npcs?.vanish || []) { const p = get(n); p.home = false; p.extra.clear(); }
    for (const a of e.npcs?.move || []) { const p = get(a.npc); p.home = false; p.extra = new Set([resolveLocation(a.to)]); }
  }
  for (const [n, st] of Object.entries(save?.npcs || {})) if (st?.dead) { const p = get(n); p.home = false; p.extra.clear(); }
  return m;
}

export function npcsAt(locId, save = null) {
  const id = resolveLocation(locId);
  const base = npcsAtBase(id, save);
  if (!save?.cq?.length && !save?.npcs) return base;
  const pl = npcPlacement(save);
  if (!pl.size) return base;
  const out = base.filter((n) => !pl.has(n) || pl.get(n).home);
  for (const [n, p] of pl) if (p.extra.has(id) && NPCS[n] && !out.includes(n)) out.push(n);
  return out;
}

function npcsAtBase(id, save) {
  const loc = LOCATIONS[id];
  const out = (loc?.npcs || []).filter((n) => NPCS[n]);
  const wanted = wantedAt(save, id);
  for (const n of Object.values(NPCS)) {
    if (n.cameo || out.includes(n.id)) continue;
    const listed = LISTED_AT.get(n.id);
    const here = resolveLocation(n.location) === id;
    const burgHere = !!n.burg && resolveLocation(n.burg) === id;
    if (here || (wanted.has(n.id) && burgHere)) { out.push(n.id); continue; }
    if (burgHere && !(listed && listed !== id) && !LOCATIONS[resolveLocation(n.location)]) out.push(n.id);
  }
  return out;
}

/** Node where an NPC can be found: explicit `npcs` list → `location` (if a node) → `burg` (if a node); null — nowhere. With save — world changes (moved / vanished / dead). */
export function npcHome(npcId, save = null) {
  const n = NPCS[npcId];
  if (!n) return null;
  const p = save ? npcPlacement(save).get(npcId) : null;
  if (p && !p.home) return [...p.extra][0] || null;
  if (LISTED_AT.has(npcId)) return LISTED_AT.get(npcId);
  for (const l of [n.location, n.burg]) { const r = resolveLocation(l); if (r && LOCATIONS[r]) return r; }
  return null;
}

/** Enemies of an encounter for a party of `size` (enemies.js: first ceil(n × s / 4), bosses first). */
export function encounterEnemies(encId, size, { reduce = 0 } = {}) {
  const enc = ENCOUNTERS[encId];
  if (!enc) return ['scavenger', 'scavenger'];
  let list = [...enc.enemies];
  if (reduce && enc.reduce) {
    for (const id of enc.reduce.slice(0, reduce)) {
      let i = -1;
      for (let k = list.length - 1; k > 0; k--) if (baseId(list[k]) === baseId(id)) { i = k; break; }
      if (i > 0) list.splice(i, 1);
    }
  }
  const n = Math.max(1, Math.ceil((list.length * Math.max(1, size)) / 4));
  return list.slice(0, n);
}
export const encounterName = (encId) => ENCOUNTERS[encId]?.name || encId;
export const encounterMap = (encId) => ENCOUNTERS[encId]?.map || null;

/** Text from story tables: party events, prologue. Arrays of { who, text } or a string. */
export function storyText(key) {
  return PARTY_EVENTS_TEXT[key] ?? PROLOGUE[key] ?? key;
}
export const speakerName = (who) => PARTY_EVENTS_TEXT[`who.${who}`] ?? PROLOGUE[`who.${who}`] ?? NPCS[who]?.name ?? '';

/** Greeting by reputation tier (+ topics are asked separately). */
export function npcGreeting(npc, tier) {
  const d = NPC_DIALOGUE[npc.id];
  const text = d?.greet?.[tier] ?? d?.greet?.neutral ?? npc.bark ?? '…';
  return { who: npc.id, name: npc.name, text };
}
export const npcTopics = (npc) => NPC_DIALOGUE[npc.id]?.topics || [];
export const npcRepFaction = (npc) => NPC_DIALOGUE[npc.id]?.repFaction || npc.faction;

/** Trainer keys → NPC ids (talents.js source.trainer may be a faction, an NPC role or a place). */
export const TRAINER_ALIAS = { 'duel-club': ['duel-master'], underground: ['alik'], radio: ['announcer-rovnya'] };
export const FACTION_ALIAS = { tekhnikumy: 'technikums' };
