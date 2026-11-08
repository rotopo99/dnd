// Free node map (docs/specs/free-roam.md, этап 1): numbers and node-type recipes for world/roam-gen.js.
// Blocks themselves — data/maps/roam/blocks.js. Node kinds wild | sea | boss | terminal stay menu nodes (types: null).

export const ROAM = {
  enabled: true, // FREE_ROAM: entering a node with a map opens the free map (false — the old menu everywhere)
  cell: 32, // px per tile on screen
  zooms: [24, 32, 40], // wheel steps
  walk: 4, run: 6, // tiles per second
  slowMul: 0.6, // rubble / heights slow the step
  interact: 1.5, // interaction radius, tiles
  chainGap: 1, // party follows the leader's trail, one tile apart
  chainTeleport: 6, // a follower further than this jumps to its place
  npcSpeed: 1, // tiles per second on a route
  npcPause: [3, 8], // seconds at each route point
  npcWander: 0.5, // share of non-trader NPCs that walk a route
  npcFarTick: 0.5, // NPCs off screen update every N seconds
  camLerp: 8, // camera follow speed (1/s)
  saveTick: 1, // seconds between writes of save.roam (in memory; the disk save happens on the usual persist)
  genTries: 5, // generation attempts until the map is connected
  // generated crates: credits dice and a chance of a ration (the node's own caches go to crates first)
  stash: { credits: '2d6', mult: 3, itemChance: 0.35, items: ['ration', 'tushenka'] },
  skillSpots: 4, // skills-v3.md: open skill actions shown as points on the map (next to NPCs when possible); the rest — «Навыки» button
};

/** Map size by type, [w, h]. */
export const ROAM_SIZE = { camp: [28, 22], city: [48, 36], default: [40, 30] };

/**
 * Recipes: blocks — [id, min, max] from data/maps/roam/blocks.js; exits — gaps in the border (D); fill '#' — rooms carved
 * in rock and joined by corridors (bunker), '.' — open ground with a border; decor — scattered chars [char, n].
 */
export const ROAM_TYPES = {
  hub: { blocks: [['plaza', 1, 1], ['house', 3, 4], ['house2', 1, 2], ['shop', 2, 2], ['barracks', 1, 1], ['workshop', 1, 1]], exits: 3, decor: [['c', 6], ['m', 3]] },
  village: { blocks: [['well', 1, 1], ['house', 4, 5], ['house2', 2, 3], ['shop', 1, 1], ['field', 1, 2]], exits: 2, decor: [['c', 4]] },
  ruins: { blocks: [['ruin', 4, 5], ['ruin2', 1, 2], ['warehouse', 1, 1]], exits: 2, decor: [[',', 60], ['c', 6], ['x', 6]] },
  bunker: { fill: '#', blocks: [['airlock', 1, 1], ['room', 2, 3], ['lab', 1, 1], ['dorm', 1, 1]], exits: 1, decor: [['m', 2]] },
  camp: { blocks: [['fire', 1, 1], ['tent', 3, 5], ['stallOut', 1, 1]], exits: 1, decor: [['c', 3]], size: 'camp' },
  port: { blocks: [['shop', 1, 1], ['warehouse', 2, 2], ['house', 2, 3], ['stallOut', 1, 1]], exits: 1, water: 7, pier: true, decor: [['c', 6]] },
  city: { blocks: [['plaza', 1, 1], ['house', 3, 4], ['house2', 2, 3], ['shop', 2, 3], ['barracks', 2, 2], ['warehouse', 1, 1], ['workshop', 1, 1]], exits: 1, fence: true, decor: [['c', 6]], size: 'city' },
};

/** Node → recipe id (null — menu node). Ports by `harbor`/`port`, faction cities by tier, bunkers by name. */
export function roamTypeOf(loc) {
  if (!loc) return null;
  const k = loc.kind;
  if (k === 'hub') return 'hub';
  if (k === 'dungeon') return /бункер|коридор|цех|лаборат|шахт|bunker/i.test(`${loc.name} ${loc.id}`) ? 'bunker' : 'ruins';
  if (k === 'camp') return (loc.services || []).includes('harbor') || loc.port ? 'port' : 'camp';
  if (k === 'town') {
    if (loc.port || (loc.services || []).includes('harbor')) return 'port';
    if (loc.tier === 'capital' || loc.tier === 'city') return 'city';
    return 'village';
  }
  return null;
}
