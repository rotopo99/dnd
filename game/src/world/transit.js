// Fast travel between open hubs (data/world/transit.js). No DOM: which nodes are hubs, the rides from a hub
// (kind / days / price). The route and the sea fare come from the world map (findRoute / routeFare) as functions.
import { TRANSIT as T } from '../data/world/transit.js';
import { LOCATIONS, resolveLocation } from './data.js';

/** A hub with a carrier: kind 'hub', a big town (TRANSIT.hubTiers) or a harbor. */
export function isTransitHub(loc) {
  if (!loc || loc.alias) return false;
  return loc.kind === 'hub' || (loc.kind === 'town' && T.hubTiers.includes(loc.tier)) || (loc.services || []).includes('harbor');
}

/** Ride kind by the route: water → boat, tunnel → lift, long land → train, else rail trolley. */
export function rideKind(hops, days) {
  const kinds = new Set(hops.map((h) => h.r.kind));
  if (kinds.has('sea') || kinds.has('canoe') || kinds.has('lake')) return 'boat';
  if (kinds.has('tunnel')) return 'lift';
  return days >= T.trainFrom ? 'train' : 'rail';
}

/** Ride days for a walking route of `days`. */
export const rideDays = (days) => Math.max(1, Math.ceil(days * T.dayMul));

/**
 * Rides from `from` (a hub): visited hubs of the same region or ≤ neighborDays away, only when the ride saves days.
 * route(from, to) → hops [{ r, from, to }] | null; fare(r) → credits. → [{ to, name, kind, days, full, cost, hops }].
 */
export function transitOptions(save, from, route, fare = () => 0) {
  from = resolveLocation(from);
  const here = LOCATIONS[from];
  if (!isTransitHub(here)) return [];
  const out = [];
  for (const id of save.visited || []) {
    const to = resolveLocation(id);
    const l = LOCATIONS[to];
    if (to === from || !isTransitHub(l) || out.some((o) => o.to === to)) continue;
    const hops = route(from, to);
    if (!hops || !hops.length) continue;
    const full = hops.reduce((s, h) => s + (h.r.days || 1), 0);
    if (l.region !== here.region && full > T.neighborDays) continue;
    const days = rideDays(full);
    if (days >= full) continue;
    const cost = T.base + T.perDay * full + hops.reduce((s, h) => s + (fare(h.r) || 0), 0);
    out.push({ to, name: l.name, kind: rideKind(hops, full), days, full, cost, hops });
  }
  return out.sort((a, b) => a.full - b.full);
}
