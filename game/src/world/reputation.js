// Reputation helpers for the UI over data/world/origins.js (world.md §3): tiers, names, spread with change list.
import { FACTIONS } from '../data/factions.js';
import { t } from '../data/text/index.js';
import { EXTRA_FACTIONS } from '../data/npcs.js';
import { REP_FACTIONS, REP_TIERS, repTier as tierOf, spreadRep, startingRep as start, PROLOGUE_REP, ORIGINS } from '../data/world/origins.js';
import { FACTION_ALIAS } from './data.js';

export const FACTION_IDS = REP_FACTIONS;
export const TIERS = ['hostile', 'suspicious', 'neutral', 'friendly', 'ally'];
export const TIER_NAMES = Object.fromEntries(REP_TIERS.map((x) => [x.id, x.name]));
export const TIER_MIN = Object.fromEntries(REP_TIERS.map((x) => [x.id, x.min]));
export const normFaction = (id) => FACTION_ALIAS[id] || id;
export const factionName = (id) => FACTIONS[id]?.name || (t(`faction.${id}`) !== `faction.${id}` ? t(`faction.${id}`) : null) || EXTRA_FACTIONS[id]?.name || id;
export const repTier = (v) => tierOf(v ?? 0);
export const tierAtLeast = (tier, min) => TIERS.indexOf(tier) >= TIERS.indexOf(min);

/** Change reputation (with one-step spread). Returns [{ faction, delta }] — the source first. */
export function applyRep(save, faction, delta) {
  faction = normFaction(faction);
  if (!delta || !FACTION_IDS.includes(faction)) return [];
  const before = { ...save.rep };
  spreadRep(save.rep, faction, delta);
  const out = [];
  for (const f of FACTION_IDS) {
    const d = (save.rep[f] || 0) - (before[f] || 0);
    if (d) out.push({ faction: f, delta: d });
  }
  out.sort((a, b) => (a.faction === faction ? -1 : b.faction === faction ? 1 : 0));
  return out;
}

/** Starting reputation after the prologue (race → origin → override → prologue result). */
export const startingRep = (race, origin, prologue = true) => start(race, origin, { prologue });
export { PROLOGUE_REP };

/**
 * Factions the player has met (save.met): visiting a node of the faction, talking to its NPC or fighting it.
 * Until then the reputation screen shows «???». Old saves without `met` — see save.js normalizeSave.
 */
export function meetFaction(save, faction) {
  const f = normFaction(faction);
  if (!f || !FACTION_IDS.includes(f)) return false;
  if (!Array.isArray(save.met)) save.met = [];
  if (save.met.includes(f)) return false;
  save.met.push(f);
  return true;
}
export const isMet = (save, faction) => !Array.isArray(save?.met) || save.met.includes(normFaction(faction));
/** Factions known from the start: met in the prologue + the origin faction. */
export const startMet = (origin) => [...new Set([...Object.keys(PROLOGUE_REP), ORIGINS[origin]?.faction].filter((f) => f && FACTION_IDS.includes(f)))];
