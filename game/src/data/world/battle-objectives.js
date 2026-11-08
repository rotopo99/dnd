// Optional battle objectives of world battles (combat-rework.md §6.1, stage 2). Numbers of each objective — data/combat.js
// COMBAT.objectives; here: which battle gets which objective. Read by scenes/world-battle.js (objectiveFor).
//  - bindings: encounter id -> objective id or { id, rep? } (rep — faction that thanks for a rescue).
//  - random: other non-boss world battles get a random objective with `chance`; pool by arena biome (data/combat.js BIOMES).
export const BATTLE_OBJECTIVES = {
  bindings: {
    // rescue a captive
    'w-harmony-riot': 'rescue',
    'w-road-scavengers': 'rescue',
    'v3-pir-raid': 'rescue',
    'v3-ai-commissar': 'rescue',
    'v3-scv-skeleton-hunt': 'rescue',
    'v3-crg-wedding': { id: 'rescue', rep: 'neutralVillages' },
    'v3-cult-call': 'rescue',
    'enc-brigands': 'rescue',
    'v4-scv-host': 'rescue',
    // hack a terminal
    'w-villages-terminal': 'terminal',
    'w-agro-terminal': 'terminal',
    'w-cc-terminal': 'terminal',
    'v3-mech-hive': 'terminal',
    'v3-tek-shrine': 'terminal',
    'enc-clone-vats': 'terminal',
    'enc-lis-drones': 'terminal',
    'v3-lis-vault': 'terminal',
    'v4-tek-elite': 'terminal',
    'v4-mech-host': 'terminal',
    // hold a point N rounds
    'w-villages-beacon': 'hold',
    'v3-tin-trial': 'hold',
    'v3-ren-hatab': 'hold',
    'v3-nv-militia': 'hold',
    'enc-border-clash': 'hold',
    'v4-ren-host': 'hold',
    'v4-wp-host': 'hold',
    // kill the target before it flees
    'w-harmony-cult-cell': 'assassinate',
    'v3-scv-kings-yard': 'assassinate',
    'v3-agro-chief': 'assassinate',
    'v3-band-foxes': 'assassinate',
    'v3-ren-ambush': 'assassinate',
    'enc-saboteurs': 'assassinate',
    'v4-scv-elite': 'assassinate',
    'v4-crg-elite': 'assassinate',
    // do not let the cargo burn / break
    'w-agro-burning-field': 'nofire',
    'w-agro-checkpoint': 'nofire',
    'v3-agro-harvest': 'nofire',
    'v3-pir-dock': 'nofire',
    'v3-mech-shop': 'nofire',
    'enc-arsenal-cult': 'nofire',
    'v4-agro-host': 'nofire',
    // fast / clean wins
    'v3-tin-arena': 'flawless',
    'w-cc-duel': 'flawless',
    'v3-wp-patrol': 'speed',
    'v4-mutz-patrol': 'speed',
  },
  random: {
    chance: 0.25,
    pool: {
      wasteland: ['rescue', 'assassinate', 'speed', 'hold', 'flawless'],
      village: ['rescue', 'nofire', 'hold', 'speed'],
      agro: ['nofire', 'rescue', 'speed'],
      cyber: ['terminal', 'hold', 'speed'],
      port: ['nofire', 'rescue', 'assassinate'],
      mutant: ['rescue', 'flawless', 'speed'],
    },
  },
};
