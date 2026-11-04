// World data access point: re-exports the designer's / writer's data (game/src/data/world/*, gadgets.js, skills.js,
// text/npc-dialogue.js, text/party-events.js) plus small helpers the UI needs. The rest of the world code
// imports only from here.
import { NPCS } from '../data/npcs.js';
import { ENCOUNTERS as ENCOUNTERS_V1 } from '../data/enemies.js';
import { ENEMIES_V3, ENCOUNTERS_V3 } from '../data/enemies-v3.js';
import { QUESTS as QUESTS_V1 } from '../data/world/quests.js';
import { QUESTS_V3 } from '../data/world/quests-v3.js';
import { NPC_DIALOGUE } from '../data/text/npc-dialogue.js';
import { PARTY_EVENTS_TEXT } from '../data/text/party-events.js';
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
export { EVENTS } from '../data/world/events.js';
export { ORIGINS, originAllowed } from '../data/world/origins.js';
export { GADGETS, gadgetFor } from '../data/gadgets.js';
export { SPECIALIZATIONS } from '../data/skills.js';
export { NPC_DIALOGUE, PARTY_EVENTS_TEXT };

/**
 * Temporary quest battles of quests-v3.js ('enc-*', list ENC_TODO there) → the closest v3 encounter (enemies-v3.js),
 * until the designer adds them under their own ids. An id already present in ENCOUNTERS_V3 wins.
 */
export const ENC_FALLBACK = {
  'enc-sputnik-raid': 'v3-cult-call', 'enc-cringe-base': 'v3-crg-concert', 'enc-vibe-burner': 'v3-boss-vibe-burner',
  'enc-ice-ring': 'v3-boss-ice-ring', 'enc-brigands': 'v3-band-foxes', 'enc-harmony-fall': 'v3-cult-temple',
  'enc-arsenal-cult': 'v3-cult-plague', 'enc-kiberspeys-door': 'v3-cult-temple', 'enc-judge': 'v3-cult-temple',
  'enc-lis-drones': 'v3-mech-shop', 'enc-dawn-bodies': 'v3-mech-hive', 'enc-lox-clone': 'v3-ai-lox',
  'enc-arena-final': 'v3-tin-arena', 'enc-great-mech': 'v3-boss-great-mech', 'enc-plague-seed': 'v3-boss-plague-seed',
  'enc-plague-machines': 'v3-mech-plague', 'enc-warprom-patrol': 'v3-wp-corridor', 'enc-clone-vats': 'v3-ai-commissar',
  'enc-border-clash': 'v3-mutz-hunt', 'enc-sokralnya-guard': 'v3-cult-call', 'enc-saboteurs': 'v3-ai-lox',
  'enc-beast-pit': 'v3-mutz-pack', 'enc-proxy-storm': 'v3-tek-storm', 'enc-lake-monster': 'v3-mon-lake',
  'enc-sea-monster': 'v3-mon-sea', 'enc-hill-monster': 'v3-mon-hills', 'enc-dungeon': 'v3-fauna-mine',
};
/** All battles: v1.0 (enemies.js) + v3 (enemies-v3.js) + fallbacks for quest ids. */
export const ENCOUNTERS = { ...ENCOUNTERS_V1, ...ENCOUNTERS_V3 };
for (const [id, to] of Object.entries(ENC_FALLBACK)) if (!ENCOUNTERS[id] && ENCOUNTERS[to]) ENCOUNTERS[id] = { ...ENCOUNTERS[to], id, aliasOf: to };
/** All quests: v1.0 (quests.js) + v3 (quests-v3.js, story by the writer). */
export const QUESTS = { ...QUESTS_V1, ...QUESTS_V3 };

/** Same place (aliases of v1.0 ids count as their target). */
export const sameLocation = (a, b) => !!a && !!b && resolveLocation(a) === resolveLocation(b);

/** Base enemy id: balance variants look like 'cleaner^2.2'. */
export const baseId = (id) => String(id || '').split('^')[0];

/**
 * One item catalogue for the world and battles: v3 gear (data/items/*) + v1.0 world items (locations.js ITEMS).
 * Same id in both (medkit, calmers, grenade) → one record: world fields (use, passives, price) over the v3 battle fields.
 */
export const ITEMS = { ...WEAPONS, ...ARMOR, ...MODS, ...CONSUMABLES };
for (const [id, it] of Object.entries(WORLD_ITEMS)) ITEMS[id] = { ...(ITEMS[id] || {}), ...it };
export { WEAPONS, ARMOR, MODS, CONSUMABLES, SHOPS, STARTER_KITS, WORLD_ITEMS };

/** Rules data for the engine with the item catalogue (buildCreature equipment, combat useItem). */
export const PLAY_DATA = { ...GAME_DATA, ENEMIES: { ...GAME_DATA.ENEMIES, ...ENEMIES_V3 }, ENCOUNTERS, ITEMS };

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
  return out;
}

/**
 * NPC ids standing on a location: locations.js `npcs` (wins over npcs.js `location`) + v3 NPCs whose home `burg` /
 * `location` resolves here + NPCs with a `burg` here that an active quest waits for (talk goal at this burg).
 */
export function npcsAt(locId, save = null) {
  const id = resolveLocation(locId);
  const loc = LOCATIONS[id];
  const out = (loc?.npcs || []).filter((n) => NPCS[n]);
  const wanted = wantedAt(save, id);
  for (const n of Object.values(NPCS)) {
    if (n.cameo || out.includes(n.id) || !n.burg || resolveLocation(n.burg) !== id) continue;
    if (resolveLocation(n.location) === id || wanted.has(n.id)) out.push(n.id);
  }
  return out;
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
