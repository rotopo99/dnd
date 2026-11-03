// Reputation −100…+100 per faction (14 from factions.js + minor 'technikums'). Spec: docs/specs/world.md §3.
import { FACTIONS, RELATIONS } from '../data/factions.js';
import { ORIGINS } from '../data/talents.js';
import { FACTION_ALIAS } from './data.js';

export const MINOR_FACTIONS = { technikums: { name: 'Техникумы' } };
export const FACTION_IDS = [...Object.keys(FACTIONS), ...Object.keys(MINOR_FACTIONS)];
export const factionName = (id) => FACTIONS[id]?.name || MINOR_FACTIONS[id]?.name || id;
export const normFaction = (id) => FACTION_ALIAS[id] || id;

const K = { ally: 0.5, vassal: 0.5, suzerain: 0.5, friendly: 0.25, neutral: 0, unknown: 0, suspicion: -0.1, rival: -0.25, enemy: -0.5 };

export const TIERS = ['hostile', 'suspicious', 'neutral', 'friendly', 'ally'];
/** 'hostile' | 'suspicious' | 'neutral' | 'friendly' | 'ally' */
export function repTier(v = 0) {
  if (v <= -50) return 'hostile';
  if (v <= -15) return 'suspicious';
  if (v < 15) return 'neutral';
  if (v < 50) return 'friendly';
  return 'ally';
}
export const TIER_MIN = { hostile: -100, suspicious: -49, neutral: -14, friendly: 15, ally: 50 };

const clamp = (v) => Math.max(-100, Math.min(100, v));

/**
 * Change reputation of `faction` by delta and spread one step through the matrix (RELATIONS[G][F] → k).
 * Minor factions do not spread. Returns [{ faction, delta }] of all non-zero changes (first — the source).
 */
export function applyRep(save, faction, delta) {
  faction = normFaction(faction);
  const out = [];
  if (!delta || !FACTION_IDS.includes(faction)) return out;
  const add = (f, d) => {
    if (!d) return;
    const before = save.rep[f] || 0;
    save.rep[f] = clamp(before + d);
    if (save.rep[f] !== before) out.push({ faction: f, delta: save.rep[f] - before });
  };
  add(faction, delta);
  if (FACTIONS[faction]) {
    for (const g of Object.keys(FACTIONS)) {
      if (g === faction) continue;
      const k = K[RELATIONS[g][faction]] || 0;
      add(g, Math.trunc(delta * k));
    }
  }
  return out;
}

// race base (world.md §3)
const RACE_BASE = {
  human: { aiParty: -15, agrozone: -5, tinBrotherhood: 5, mechanids: -20 },
  skeleton: { scavengers: -35, tinBrotherhood: 5, mechanids: 10 },
  android: { aiParty: 20, warprom: 15, agrozone: 10, mechanids: 15, tinBrotherhood: -20, renegades: -10 },
  'mutant-beast': { aiParty: -50, warprom: -35, agrozone: -35, mutantsBeast: 30, mutantsPlant: 15, tinBrotherhood: -10, renegades: 10, mechanids: -20 },
  'mutant-plant': { aiParty: -50, warprom: -35, agrozone: -25, mutantsPlant: 30, mutantsBeast: 15, renegades: 10, mechanids: -20 },
};

/** Starting reputation: all-race base + race base + origin (+rep with spread). */
export function startingRep(race, origin) {
  const save = { rep: {} };
  for (const f of FACTION_IDS) save.rep[f] = 0;
  save.rep.cringegons = -60;
  save.rep.cult = -20;
  for (const [f, v] of Object.entries(RACE_BASE[race] || {})) save.rep[f] = v;
  const o = ORIGINS[origin];
  if (o) {
    if (o.startRep) for (const [f, v] of Object.entries(o.startRep)) save.rep[f] = v; // e.g. «раб АИ Партии»
    if (o.rep) applyRep(save, o.faction, o.rep);
  }
  return save.rep;
}

/** Prologue result (world.md §3): technikums +30, cult −30, pirates +5. */
export function applyPrologueRep(save) {
  return [...applyRep(save, 'technikums', 30), ...applyRep(save, 'cult', -30), ...applyRep(save, 'pirates', 5)];
}
