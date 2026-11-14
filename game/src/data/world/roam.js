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
  // этап 2 (§2.2): stealth. Cones of guards: fov degrees, range by day / night (N — night), rays every rayStep degrees
  stealth: {
    fov: 90, rangeDay: 8, rangeNight: 5, rayStep: 5, coneNear: 15, // cones are computed only for guards ≤ coneNear tiles away
    sneak: 2, // tiles per second while sneaking (C)
    gain: { walk: 40, run: 80, sneak: 15 }, decay: 20, // notice meter per second in a cone / outside
    rollEvery: 5, rollDc: 12, rollMul: 0.5, // a Stealth roll every N s in a cone; success — the gain ×rollMul for the next N s
    wantedHeat: 2, // the node's faction heat from which guards look at the party everywhere, not only in restricted zones
    permitRep: 30, // reputation with the node's faction that lets the party into restricted zones
    alarmTime: 15, // seconds after the alarm to leave the node or pay the fine; then the guards fight
    alarmHeat: 1, // heat of the alarm (crime.js addHeat)
    theftBehind: -2, // theft DC from behind / from the side (outside the NPC's cone)
    sentries: { hub: 2, city: 4, village: 1, port: 1, camp: 0, ruins: 0, bunker: 0 }, // generated posts of the node's faction
    turn: [3, 6], // a post turns to its next facing every N s
    restrictBlocks: ['barracks', 'warehouse', 'lab'], // generated blocks that are restricted zones
  },
  // этап 2 (§2.1): battle on the node map
  battle: {
    cut: [24, 13], // cut area (spec 24×16; 13 rows keep the ×2 tile scale and the hint line at 1280×720)
    seeRange: 10, // a hostile with a clear line of sight this close starts the battle
    foeGap: 5, // foes without a place on the map appear this far from the leader (toward the nearest exit)
    chase: 3.5, // hostiles walk toward the party, tiles per second
    repath: 0.5, // seconds between path updates of a hostile
  },
  // этап 2: a raid on entering a node (danger ≥ minDanger, not hubs): raiders come from an exit and hunt the party
  raid: { chance: 0.12, minDanger: 2, kinds: ['town', 'camp', 'dungeon'] },
};

/** Map size by type, [w, h]. */
export const ROAM_SIZE = { camp: [28, 22], city: [48, 36], default: [40, 30] };

/**
 * Recipes: blocks — [id, min, max] from data/maps/roam/blocks.js; exits — gaps in the border (D); fill '#' — rooms carved
 * in rock and joined by corridors (bunker), '.' — open ground with a border; decor — scattered chars [char, n].
 */
export const ROAM_TYPES = {
  hub: { blocks: [['plaza', 1, 1], ['barracks', 1, 1], ['shop', 2, 2], ['house', 3, 4], ['house2', 1, 2], ['workshop', 1, 1]], exits: 3, decor: [['c', 6], ['m', 3]] },
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
