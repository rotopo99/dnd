// Combat rework numbers (docs/specs/combat-rework.md): cover, destructible objects, heights, pushes,
// AI archetypes + bindings, boss phases, summoners, pace of enemy turns, arenas by biome.
// The rules engine reads this as data.COMBAT (normalizeData -> data.combat); without it objects are static
// cover (old behaviour) and the new push/height damage is off. Strings — data/text (`obj.*`, `arch.*`, `intent.*`).

export const COMBAT = {
  // §3.1: KB bonus by cover level [none, rubble, half, full]; full cover vs melee «around the corner»
  cover: { kb: [0, 1, 2, 5], fullMelee: 2, flankHit: 1, holdKb: 1, holdArch: ['sniper'] },
  // §3.2: hp = base + perL × battle level; armor = KB of the object vs a deliberate attack
  objects: {
    crate: { cover: 'half', hp: [10, 2], armor: 8, leaves: 'rubble', junk: 0.2 },
    concrete: { cover: 'full', hp: [25, 5], armor: 12, leaves: 'rubble' },
    machine: { cover: 'half', hp: [15, 3.75], armor: 10, leaves: 'rubble', fireLeaves: 'smoke' },
    wall: { cover: 'full', hp: [15, 4.25], armor: 10, leaves: 'floor' },
    generator: { cover: 'half', hp: [10, 2.25], armor: 10, leaves: 'rubble', surface: { kind: 'electric', r: 1, turns: 2 } },
    barrel: { cover: 'half', hp: [5, 0.75], armor: 6 }, // spill — surfaces.js destroyBarrel (oil / toxgas)
  },
  junkItem: 'servo-parts', // «хлам» from broken crates (objects.crate.junk chance)
  // area hits damage objects by this share of the rolled damage (hit roll is not needed)
  areaObjectMul: 1,
  // §3.3 heights
  elev: { hitPer: 1, hitMax: 2, rangePer: 1, fallDie: '1d6', acroDc: 10 },
  // §3.4 pushes: blocked step = die × tier blunt (target and object; a unit — half each)
  push: { die: '1d4', heavyKb: 18 },
  // §4 archetype numbers
  arch: {
    assault: { lastStand: 0.25, lastStandDmg: 2 },
    sniper: { elevScore: 3, coverScore: 2, threatRange: 2, prio: 1.3 },
    support: { healBelow: 0.5, healMul: 1.6, keepAway: 3 },
    controller: { ctrlMul: 1.35, controlled: ['stun', 'root', 'frozen'] },
    coward: { fleeBelow: 0.4, woundedBelow: 0.5, woundedMul: 1.6, xpMul: 0.5, share: 0.25 },
    berserk: { rageBelow: 0.5, rageHit: 2, rageKb: -2, allyDeathDmg: 1, surfaceMul: 0.2 },
    // balance (sim v3 elite, 2026-11-07): spec numbers (every 2, half cap at once) cost −40..−60 pp win → softened
    summoner: { every: 3, initial: 1, xpBonus: 0.25, caps: [[5, 2], [15, 3], [20, 4]], hpK: 0.35, turns: 99, fallback: 'skrilet' },
    // spec: p2 +2 hit, p3 ×1.25 dmg, +1 action every 2 rounds — softened (sim: −25 pp on boss fights)
    boss: { phases: [0.66, 0.33], p2Hit: 0, p3DmgMul: 1.1, p3ExtraEvery: 3, p2Summon: 0 },
  },
  // §4 bindings: exact base ids (variant suffix `^…` and level `-lN` stripped) or prefixes ending with '*'.
  // Spec ids absent in enemies*.js (skipped): pir-boarder, cult-skr-*, v3-boss-*.
  bindings: {
    assault: ['gang-thug', 'wp-stormtrooper', 'ai-laser-trooper', 'mutz-tusker', 'crawler', 'crawler-5'],
    sniper: ['pirate-gunner', 'wp-bolterman', 'scv-gunner', 'rebel-gunner', 'cultist-gunner', 'cultist-gunner-5', 'ren-fighter'],
    support: ['nv-watchman', 'cult-plague-bearer', 'pir-quartermaster', 'tin-blade-master', 'npc-party-*'],
    controller: ['tek-ritualist', 'cringe-jester', 'cringe-jester-5', 'mech-assimilator', 'crg-bayanist', 'acolyte-5'],
    coward: ['scavenger-5', 'scavenger-hunter', 'pirate-hacker', 'scv-*'],
    berserk: ['mutz-alpha', 'mutr-strangler', 'wild-*', 'beast-wolf', 'cult-executioner', 'cleaner-5'],
    summoner: ['cyber-demon', 'skrilet-5', 'mech-hive-node', 'crg-collector-agent', 'tek-golem', 'mutr-treant'],
    boss: ['cyber-priest', 'boss-tin-renegade', 'cult-judge-hand', 'boss-*', '*-cmd-l*'],
  },
  // never cowards even if the faction rule says so (junk-mech «не берёт»)
  notCoward: ['junk-mech', 'junk-mech-5'],
  // 25% of grunts of these factions are cowards (deterministic by unit id)
  cowardFactions: ['scavengers', 'pirates'],
  // fallback by the old profile / template role
  aiFallback: { melee: 'assault', ranged: 'sniper', caster: 'controller', support: 'support' },
  // minion per summoner id (else its own summon ability unit, else arch.summoner.fallback)
  minions: { 'cyber-demon': 'skrilet', 'tek-golem': 'skrilet', 'mutr-treant': 'skrilet', 'crg-collector-agent': 'skrilet', 'skrilet-5': 'skrilet' },
  // §6 (stage 2) optional objectives (rules/objectives.js). reward: xp — share of the battle XP, loot — extra loot rolls,
  // credits — share of the dropped credits (min creditsMin), rep — with the rescue / binding faction. dc: [base, perL].
  objectives: {
    rescue: { rounds: 4, cost: 'bonus', reward: { xp: 0.25, loot: 1, rep: 1 }, failRep: -1 },
    terminal: { skills: ['tech', 'hacking'], dc: [11, 0.5], need: 2, cost: 'action', reward: { xp: 0.15, loot: 1 } },
    hold: { rounds: 3, radius: 1, reward: { xp: 0.2, loot: 1 } },
    assassinate: { fleeRound: 4, reward: { xp: 0.2, loot: 1, credits: 0.25 } },
    nofire: { cargo: [2, 4], reward: { loot: 1, credits: 0.25 } },
    speed: { rounds: { normal: 4, elite: 6, boss: 8 }, eliteFrom: 5, reward: { credits: 0.25, loot: 1 } },
    flawless: { reward: { xp: 0.15 } },
    creditsMin: 10,
  },
  // §6.2 chests on the arena: open = action next to it, best of skills vs dc; trapped (chance) — a failed check fires
  // the trap (dice × tier, dmgType) at the opener. count: chance of the 1st and the 2nd chest in a world battle.
  chest: { count: [0.45, 0.15], skills: ['lockpicking', 'tech'], dc: [10, 0.5], trap: { chance: 0.2, dice: '1d6', dmgType: 'fire' }, loot: 1 },
  // §6.2 retreat through exit tiles 'D' on the heroes' side (an action standing on it); whole party out: XP × xpMul of the
  // kills so far, no loot, the battle stays undone, +days. Boss arenas: exits open from boss phase `bossPhase`.
  retreat: { xpMul: 0.25, days: 1, bossPhase: 2, exits: 2 },
};

// §5 pace of enemy turns (battle.js)
export const PACE = { aiStep: 0.30, turnGap: 0.15, moveStep: 0.08, walk: 12, fastMul: 2, skipMul: 30, storageKey: 'dnd.fastEnemies' };

// §7 arenas by biome: ranges [min, max] of objects; elev — hills (3×3 h1) / platforms (2×2 h2 + h1 ring)
export const BIOMES = {
  wasteland: { crate: [5, 7], concrete: [1, 2], barrel: [0, 1], hills: [0, 1], puddles: [0, 1] },
  village: { crate: [4, 6], wall: [2, 3], machine: [1, 2], barrel: [1, 2], hills: [0, 1], puddles: [0, 2] },
  agro: { crate: [3, 5], barrel: [2, 3], generator: [0, 1], hills: [1, 2], fire: [4, 8], gas: [0, 1] },
  cyber: { concrete: [3, 4], machine: [3, 4], generator: [1, 2], platforms: [1, 2] },
  port: { crate: [4, 6], barrel: [2, 3], hills: [1, 1], puddles: [2, 3] },
  mutant: { concrete: [2, 3], crate: [2, 3], hills: [0, 1], acid: [1, 2] },
  // region id -> biome; hazard fallback when a region is unknown
  regionBiome: {
    neutralVillages: 'village', tinBrotherhood: 'wasteland', mutantsBeast: 'mutant', scavengers: 'wasteland', tekhonki: 'cyber',
    mechanids: 'cyber', pirates: 'port', agrozone: 'agro', mutantsPlant: 'mutant', cult: 'cyber', renegades: 'wasteland',
    aiParty: 'cyber', warprom: 'wasteland', cringegons: 'village', wilds: 'mutant', harmony: 'cyber',
  },
  hazardBiome: { fire: 'agro', proxyStorm: 'cyber', cringe: 'village' },
};

/** Biome of a battle place: explicit > region > faction > hazard > wasteland. */
export function biomeOf({ biome, region, faction, hazard } = {}) {
  if (biome && BIOMES[biome]) return biome;
  return BIOMES.regionBiome[region] || BIOMES.regionBiome[faction] || BIOMES.hazardBiome[hazard] || 'wasteland';
}
