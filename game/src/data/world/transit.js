// Fast travel between open hubs (human request 2026-11-08 «долгое перемещение по карте»): a paid ride — rail trolley /
// train / boat / lift — between hubs of one region or neighbouring hubs. Instant, fewer days than walking, no road
// encounters (the carrier's own guards). Logic — world/transit.js, window — scenes/world-map.js openTransit.
export const TRANSIT = {
  dayMul: 0.4, // days of the ride = max(1, ceil(walking days × dayMul)); only rides that save days are offered
  base: 10, perDay: 8, // credits: base + perDay × walking days (+ the sea fare of the route)
  neighborDays: 6, // a hub of another region counts as a neighbour when the walking route is ≤ N days
  trainFrom: 3, // walking days from which a land ride is a train (shorter — a rail trolley)
  hubTiers: ['city', 'capital'], // towns of these tiers are hubs too (and every node with a harbor)
};
