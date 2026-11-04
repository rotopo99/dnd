// World data access point: re-exports the designer's / writer's data (game/src/data/world/*, gadgets.js, skills.js,
// text/npc-dialogue.js, text/party-events.js) plus small helpers the UI needs. The rest of the world code
// imports only from here.
import { NPCS } from '../data/npcs.js';
import { ENCOUNTERS } from '../data/enemies.js';
import { NPC_DIALOGUE } from '../data/text/npc-dialogue.js';
import { PARTY_EVENTS_TEXT } from '../data/text/party-events.js';
import { PROLOGUE } from '../data/text/prologue.js';
import { LOCATIONS, ITEMS } from '../data/world/locations.js';

export { REGIONS, FUTURE_REGIONS } from '../data/world/regions.js';
export {
  LOCATIONS, START_LOCATION, START_DISCOVERED, DEFAULT_RESPAWN, TERMINAL_ACTIONS, FINALE_TERMINALS, SERVICE_PRICES, ITEMS,
} from '../data/world/locations.js';
export { ROUTES, ENCOUNTER_TABLES, ENCOUNTER_PER_DANGER, ENCOUNTER_MODS, AMBUSH, FIELD_CAMP } from '../data/world/travel.js';
export { QUESTS, DEED_TAGS } from '../data/world/quests.js';
export { EVENTS } from '../data/world/events.js';
export { ORIGINS, originAllowed } from '../data/world/origins.js';
export { GADGETS, gadgetFor } from '../data/gadgets.js';
export { SPECIALIZATIONS } from '../data/skills.js';
export { NPC_DIALOGUE, PARTY_EVENTS_TEXT };

/** Base enemy id: balance variants look like 'cleaner^2.2'. */
export const baseId = (id) => String(id || '').split('^')[0];

/** Default trade stock: every priced, non-key item. */
export const SHOP_STOCK = Object.values(ITEMS).filter((i) => i.price > 0 && !i.key && !i.contraband && !i.passives).map((i) => i.id);

/** NPC ids standing on a location (locations.js `npcs` wins over npcs.js `location`). */
export function npcsAt(locId) {
  const loc = LOCATIONS[locId];
  return (loc?.npcs || []).filter((id) => NPCS[id]);
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
