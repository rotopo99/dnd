// Free node map (docs/specs/free-roam.md, этап 1): numbers and node-type recipes for world/roam-gen.js.
// Blocks themselves — data/maps/roam/blocks.js. Node kinds wild | sea | boss | terminal stay menu nodes (types: null).

export const ROAM = {
  enabled: true, // FREE_ROAM: entering a node with a map opens the free map (false — the old menu everywhere)
  cell: 32, // px per tile on screen
  zooms: [24, 32, 40], // wheel steps
  walk: 4, run: 6, // tiles per second
  coopNpcReach: 4, // multiplayer: a guest's NPC request is valid within this distance (NPCs move independently per client)
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
    // Posts of the node's faction — only where something is guarded (restricted zones: barracks / warehouses / labs / a
    // city's inner ring; then a stall with a trader = «лавка с ценностями»), never just by the exits. Count = byType +
    // factions[fac]; quiet factions (villages, scavengers, mutants…) keep at most quietMax (a watchman at a valuable place).
    guards: {
      byType: { city: 2, bunker: 2, hub: 1, port: 1, village: 0, ruins: 0, camp: 0 },
      factions: { warprom: 1, aiParty: 1, tinBrotherhood: 1, cult: 1, mechanids: 1 },
      quiet: ['neutralVillages', 'scavengers', 'agrozone', 'mutantsPlant', 'mutantsBeast', 'cringegons', 'tekhonki'],
      quietMax: 1,
      stallGuards: ['hub', 'port', 'city'], // node types where a trader's stall may get a watchman
      patrol: { r: 4, points: 3, speed: 0.8 }, // route of 2–3 free cells ≤ r tiles from the guarded place; tiles per second
      bark: { r: 3, every: 25, show: 3.5 }, // a line when the party comes within r tiles; per-post cooldown, seconds on screen
      doze: 0.5, // share of posts that doze at night (no cone until the party is ≤ wake tiles away)
      wake: 2,
    },
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
  // controls-divinity.md: RMB «Атаковать» on the map — walk to reach (melee attackReach tiles, else the weapon range), the
  // attack animation (dur s, lunge tiles forward and back), then the battle: firstStrike initiative for the attacker's side;
  // from sneaking + from behind — surprise: the target side loses the first turn (enemyInit surprise).
  attack: { reach: 1.5, dur: 0.35, lunge: 0.3, firstStrike: 1, surprise: -20 },
  // sneaking pose (C): sprite height ×(1 − squash), shifted down px, step rhythm ×rhythm, transition s
  crouch: { squash: 0.2, down: 2, rhythm: 0.6, blend: 0.2 },
  // party control: chain (followers on the leader's trail) / free (only the selected walk); max selection hotkeys 1–4
  group: { keys: 4, spread: [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]], boxMin: 8 },
  // этап 2: a raid on entering a node (danger ≥ minDanger, not hubs): raiders come from an exit and hunt the party
  raid: { chance: 0.12, minDanger: 2, kinds: ['town', 'camp', 'dungeon'] },
  // interactive objects highlight (outline by kind + icon over the object; ui/roam-highlight.js). Colours — palette keys
  // (STYLE.md): trade — b, quest — a, loot — h, exit — j, skill — n, the rest — light steel. modes — settings order
  // (gfx prefs `highlight`, default the first). alpha: weak (far), strong (in reach / hovered / Alt), dim (opened crate).
  // pulse: brightness of weak outlines, hz ≤ 1 (off with «Снизить движение»). nearR — «только рядом» radius, tiles.
  highlight: {
    modes: ['always', 'near', 'alt'],
    colors: { trade: 'b', quest: 'a', loot: 'h', exit: 'j', skill: 'n', rest: '4', craft: '4', tech: 'h', transit: 'f', npc: '4', lore: 'f', mech: 'a' }, // lore / mech — notes, levers & doors (level-design.md)
    alpha: { weak: 0.4, strong: 0.95, dim: 0.14, npc: 0.22, iconWeak: 0.7 },
    pulse: { hz: 0.5, amp: 0.35 },
    nearR: 5,
    icon: 14, // px of the icon glyph (plate +4)
  },
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
