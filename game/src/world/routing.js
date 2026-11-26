// Route finding and reachability without DOM (world-map.js re-exports findRoute / routeFare).
// QA v52 #2/#3: the quest recommendation checks that a quest's places can be reached now (known route,
// level-gated region, days incl. working the passage), and a new game never soft-locks out of travel:
// a paid boat can always be «worked off» for days instead of credits (FARE.workPerDay).
import { LOCATIONS, REGIONS, FARE, resolveLocation } from './data.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { repTier, tierAtLeast } from './reputation.js';
import { routesFrom, otherEnd, isKnownRoute } from './state.js';
import { closedLoc } from './consequences.js';

/** Sea / canoe fare (travel.js FARE): pirates friendly −50%, ally — free. */
export function routeFare(save, r) {
  if (!r.fare) return 0;
  const tier = repTier(save.rep.pirates);
  const k = tierAtLeast(tier, 'ally') ? FARE.allyMult : tierAtLeast(tier, 'friendly') ? FARE.friendlyMult : 1;
  return Math.round(r.fare * k);
}

/** Extra days to work off a fare on the boat instead of paying (0 for a free hop). */
export const workDays = (fare) => (fare > 0 ? Math.max(1, Math.ceil(fare / FARE.workPerDay)) : 0);

/** Shortest path by days over known routes. Returns [{ r, from, to }] or null. */
export function findRoute(save, from, to, pflags) {
  from = resolveLocation(from); to = resolveLocation(to);
  const dist = { [from]: 0 }, prev = {};
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const cur = open.shift();
    if (cur === to) break;
    for (const r of routesFrom(cur)) {
      if (!isKnownRoute(save, r, pflags)) continue;
      const o = otherEnd(r, cur);
      if (closedLoc(save, o)) continue; // world-consequences.md: access.close
      const d = dist[cur] + r.days + 0.01;
      if (dist[o] == null || d < dist[o]) { dist[o] = d; prev[o] = { r, from: cur }; open.push(o); }
    }
  }
  if (dist[to] == null) return null;
  const out = [];
  for (let c = to; c !== from; c = prev[c].from) out.unshift({ r: prev[c].r, from: prev[c].from, to: c });
  return out;
}

/** A trip's cost: { days, fare, work } (work — extra days to work off the whole fare). */
export function tripCost(save, hops) {
  const fare = hops.reduce((s, h) => s + routeFare(save, h.r), 0);
  return { days: hops.reduce((s, h) => s + h.r.days, 0), fare, work: hops.reduce((s, h) => s + workDays(routeFare(save, h.r)), 0) };
}

/** Top map node of a location (a district → its city). */
const topOf = (id) => LOCATIONS[id]?.parent || id;

/**
 * Discovered places reachable from `from` now: [{ id, days, fare, paid }] — paid: affordable with `credits`
 * (else the fare is worked off: days + work). Districts of the start city are skipped.
 */
export function reachable(save, from = save.location, credits = save.hero.credits) {
  const home = topOf(resolveLocation(from)), out = [];
  for (const id of save.discovered) {
    if (id === from || topOf(id) === home || LOCATIONS[id]?.aliasOf) continue;
    const hops = findRoute(save, from, id);
    if (!hops) continue;
    const c = tripCost(save, hops);
    const paid = c.fare <= credits;
    out.push({ id, days: c.days + (paid ? 0 : c.work), fare: paid ? c.fare : 0, paid });
  }
  return out;
}

/**
 * Can the party reach this place for a quest now: the region's level is within hero level + overLevel and a route
 * (the place itself may still be in fog — quests reveal their targets) takes ≤ maxDays incl. working off the fare.
 */
export function placeReachable(save, raw) {
  const id = resolveLocation(raw), l = LOCATIONS[id];
  if (!l) return false;
  const Q = R.questRecommend, lvl = save.hero?.level || 1;
  const reg = REGIONS[l.region];
  if (reg?.levels && reg.levels[0] > lvl + Q.overLevel) return false;
  if (topOf(id) === topOf(resolveLocation(save.location))) return true;
  const ids = [id, topOf(id)];
  const sv = { ...save, discovered: [...new Set([...save.discovered, ...ids])] };
  const hops = findRoute(sv, save.location, id);
  if (!hops) return false;
  const c = tripCost(save, hops);
  return c.days + (c.fare > save.hero.credits ? c.work : 0) <= Q.maxDays;
}

/** Is the stage's goal doable by place: `all` — at least min sub-goals reachable; choice — any option; else its location. */
function goalReachable(save, g) {
  if (!g) return true;
  if (g.kind === 'all') {
    const subs = g.goals || [];
    const need = g.min ?? subs.length;
    return subs.filter((x) => goalReachable(save, x)).length >= need;
  }
  if (g.kind === 'choice') return !(g.options || []).length || g.options.some((o) => goalReachable(save, o.goal));
  return g.location ? placeReachable(save, g.location) : true;
}

/** QA v52 #2: every stage of a not-yet-taken quest can be done from here (by place, level gate and travel). */
export function questReachable(save, q) {
  return (q.stages || []).every((s) => goalReachable(save, s.goal));
}
