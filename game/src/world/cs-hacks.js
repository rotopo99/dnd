// Real-world hacks from the Cyberspace Relay (docs/specs/cyberspace-v2.md §5): state of active effects only.
// No world imports — read by crime.js / shop.js / location.js without import cycles. Applying hacks — world/cyber.js.
// save.cs.hacks[`<effect>:<target>`] = last day the effect works; save.cs.cool[...] = first day it can be used again.

export const hackKey = (eff, target) => `${eff}:${target}`;

/** The effect `eff` (door | turrets | cameras | prices | wanted) works on node `target` today. */
export function hackActive(save, eff, target) {
  const until = save?.cs?.hacks?.[hackKey(eff, target)];
  return Number.isFinite(until) && (save.day || 1) <= until;
}
