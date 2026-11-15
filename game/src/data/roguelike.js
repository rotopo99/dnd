// Roguelike mode «Забег» (docs/specs/roguelike.md). Data only, no logic. Ids of encounters/events/vendors/items/talents are
// real game ids (checked by tools: see spec §«Проверка»); relics and meta unlocks are invented for this mode (vendored «invented»).

export const RUN = {
  seed: { kind: 'string', len: 6 },          // run seed; node graph, rewards, shops: rng(seed + ':' + part)
  actsCount: 3,
  partyMin: 1, partyMax: 4,
  startCredits: 60,
  startRevives: 0,                            // permadeath; revives only by relic / meta
  hpCarry: 1,                                 // HP/MRL carry over between fights
  restHeal: 0.4,                              // rest node: heal share of max HP/MRL
  restOptions: ['heal', 'train', 'remove-status'],
  rewardChoices: 3,                           // pick 1 of 3
  rewardReroll: 1,                            // rerolls per run (relic can add)
  eliteRewardChoices: 3,                      // elite: choices are rare+; plus a relic offer
  bossHeal: 1,                                // full heal after act boss
  killMemory: 0,                              // memory points: see META
  shopPriceMul: 0.25,
  rescue: { skill: 'medicine', dc: 10 },      // canon «при смерти», as in D&D: after a won fight the standing allies try to save the downed one
                                              // (best medicine check); failure or a dead body = permadeath                         // run shops: world price × this (run credits are scarce: 15–25 per fight)
};

// Party level by layer inside an act: lvl[0] at layer 0 → lvl[1] at the boss layer, linear, rounded down.
export const ACTS = [
  { id: 'act1', name: 'Окраины', layers: 8, lvl: [3, 5], tier: 2, bossScale: 1.0, eliteScale: 0.8, fightScale: 1.0,
    biomes: ['wasteland', 'ruins-city', 'swamp', 'port', 'factory'],
    fight: ['v3-pir-raid', 'v3-wp-corridor', 'v3-mech-plague', 'v3-scv-skeleton-hunt', 'v3-cult-plague', 'v3-mutz-hunt',
      'v3-band-foxes', 'v3-band-panthers', 'v3-fauna-mine', 'v3-lis-bunker', 'v3-wolf-pack', 'v3-ai-lox', 'v3-tin-arena',
      'v3-ren-hatab', 'v3-crg-concert', 'v3-tek-storm', 'v3-agro-harvest', 'v3-fauna-chimera', 'v3-lis-vault', 'v3-wolf-hunt',
      'v4-mutz-patrol'],
    elite: ['v3-pir-flagship', 'v3-ai-commissar', 'v3-mech-hive', 'v3-tek-golem', 'v3-mutz-alpha', 'v3-band-bisons',
      'v3-cult-temple', 'v3-scv-kings-yard', 'enc-sputnik-raid'],
    boss: ['v3-boss-bazaar', 'v3-boss-ice-ring', 'v3-boss-sputnik', 'v3-boss-lis-1'] },
  { id: 'act2', name: 'Пустоши и Зоны', layers: 9, lvl: [6, 9], tier: 3, bossScale: 1.5, eliteScale: 1.0, fightScale: 1.0,
    biomes: ['wasteland', 'mutant-forest', 'factory', 'bunker-interior', 'swamp'],
    fight: ['v4-scv-patrol', 'v4-mutr-patrol', 'v4-agro-patrol', 'v4-scv-host', 'v4-agro-host', 'v4-mutr-host', 'v4-tek-patrol',
      'v4-mech-patrol', 'v4-tek-host', 'v4-mech-host', 'x-cult-scavengers-2', 'x-cult-agrozone-2', 'x-cult-mutantsPlant-2',
      'x-cult-tekhonki-2'],
    elite: ['v4-mutz-elite', 'v4-scv-elite', 'v4-agro-elite', 'v4-mutr-elite', 'v4-tek-elite', 'v4-mech-elite', 'v4-mon-hill'],
    boss: ['v3-boss-great-mech', 'v3-boss-plague-seed', 'v3-boss-vibe-burner', 'v3-boss-armory'] },
  { id: 'act3', name: 'Сердце Руслании', layers: 9, lvl: [10, 13], tier: 4, bossScale: 1.0, eliteScale: 1.0, fightScale: 1.0,
    biomes: ['ruins-city', 'factory', 'snow', 'bunker-interior', 'cyberspace'],
    fight: ['v4-ren-patrol', 'v4-wild-patrol', 'v4-ren-host', 'v4-wp-patrol', 'v4-crg-patrol', 'v4-wild-host', 'v4-wp-host',
      'v4-crg-host', 'x-cult-renegades-2', 'x-cult-wilds-2', 'x-cult-warprom-2', 'x-cult-cringegons-2', 'v4-mon-lake'],
    elite: ['v4-ren-elite', 'v4-wild-elite', 'v4-wp-elite', 'v4-crg-elite'],
    boss: ['v4-boss-lis-9', 'v4-boss-wolf-0', 'v4-boss-crg-chief', 'v4-boss-collector'] },
];

// Node graph: layers × lanes (3–4 lanes), each node links to 1–2 nodes of the next layer (no crossing). Weights by layer role.
export const GRAPH = {
  lanes: [3, 4], linksMax: 2, startLayerFights: 1,
  // weights of node type for ordinary layers; forced layers below override
  weights: { fight: 46, event: 18, shop: 9, rest: 10, treasure: 7, elite: 10 },
  // elite not before layer 2; shop/rest not on layer 0; at most 2 elites per path section of 3 layers
  eliteMinLayer: 2, shopMinLayer: 1,
  forced: { first: 'fight', preBoss: 'rest', boss: 'boss', treasureAt: 'middle' },
  // guaranteed per act: ≥1 shop, ≥1 elite on any path, ≥1 rest in the last 2 layers before the boss
  guarantee: { shop: 1, elite: 1, restBeforeBoss: 1 },
};

export const NODE_TYPES = {
  fight:    { name: 'Бой', rewards: 'normal', credits: [12, 20], arena: 'biome' },
  elite:    { name: 'Элита', rewards: 'rare', credits: [25, 40], arena: 'biome', danger: 1.0, relicChance: 0.35 },
  event:    { name: 'Событие', pool: 'events', fightChance: 0.2 },
  shop:     { name: 'Лавка', vendors: ['nikola', 'gans', 'galina', 'paracetamol', 'pip-junior', 'bosun-sukhar'], archetypes: ['gunsmith', 'bladesmith', 'armorer', 'medic', 'techmod', 'chemist', 'hunter', 'fence'], stock: [7, 9], reroll: 15 },
  rest:     { name: 'Привал', options: ['heal', 'train', 'remove-status'], trainXp: 1 },
  treasure: { name: 'Сокровище', pick: 'treasure', trapChance: 0.25, trapDc: [11, 13], skills: ['lockpicking', 'perception'] },
  boss:     { name: 'Босс акта', rewards: 'boss', credits: [60, 80], relicChoices: 3 },
};

// Hero templates for fast creation: class + race + starter kit (starterKit(cls) from world/data.js); level from ACTS[0].lvl[0].
export const TEMPLATES = [
  { id: 't-zabivnoy',  cls: 'zabivnoy',  races: ['human', 'mutant-beast', 'skeleton'], role: 'tank',    unlocked: true },
  { id: 't-ranger',    cls: 'ranger',    races: ['human', 'mutant-beast'],             role: 'ranged',  unlocked: true },
  { id: 't-technomant',cls: 'technomant',races: ['skeleton', 'human'],                 role: 'caster',  unlocked: true },
  { id: 't-ecolog',    cls: 'ecolog',    races: ['human', 'mutant-plant'],             role: 'support', unlocked: true },
  { id: 't-reper',     cls: 'reper',     races: ['human', 'android'],                  role: 'control', unlocked: false },
  { id: 't-arbiter',   cls: 'arbiter',   races: ['human', 'android'],                  role: 'frontline', unlocked: false },
  { id: 't-ugolovnik', cls: 'ugolovnik', races: ['human', 'mutant-beast'],             role: 'striker', unlocked: false },
  { id: 't-itishnik',  cls: 'itishnik',  races: ['human', 'android'],                  role: 'control', unlocked: false },
  { id: 't-mutant',    cls: 'mutant',    races: ['mutant-beast', 'mutant-plant'],      role: 'tank',    unlocked: false },
  { id: 't-slavotech', cls: 'slavotech', races: ['human', 'skeleton'],                 role: 'caster',  unlocked: false },
  { id: 't-cybertech', cls: 'cybertech', races: ['human', 'skeleton'],                 role: 'caster',  unlocked: false },
];
export const START_KIT = { credits: 0, consumables: [['bandage', 2], ['ration', 1]], quickSlots: 3 };

// Rewards after a fight: 4 kinds, pick 1 of 3. Weights per kind; item/mod/weapon/armor tiers by act tier; rarity by node type.
export const REWARDS = {
  kinds: { talent: 24, item: 34, mod: 20, card: 10, credits: 12 },
  rarity: { fight: { common: 70, rare: 28, epic: 2 }, elite: { common: 20, rare: 60, epic: 20 }, boss: { common: 0, rare: 40, epic: 60 } },
  talents: ['death-rhythm', 'breath-control', 'blade-dance', 'weapon-tuning', 'bone-armor', 'steadfast', 'iron-will', 'quick-start',
    'weakness-analyst', 'leadership', 'inspiration', 'second-wind', 'healing-path', 'calm-aura'], // filtered by talentAllowed(member)
  consumables: ['medkit', 'army-medkit', 'adrenaline-stim', 'forsazh-stim', 'bear-blood', 'grenade', 'frag-grenade', 'molotov',
    'emp-grenade', 'smoke-grenade', 'flashbang', 'calmers', 'repair-kit', 'party-cell'],
  mods: ['loupe-sight', 'extended-mag', 'serrated-edge', 'shock-winding', 'scrap-plates', 'ceramic-insert', 'thermal-edge',
    'shock-edge', 'ap-mag', 'incendiary-mag', 'kevlar-sheet', 'reactive-plate', 'quiet-soles', 'sprint-spikes', 'focus-lens'],
  weapons: ['power-sword', 'fire-axe', 'nagan-revolver', 'pump-shotgun', 'rusty-ak', 'shock-rifle', 'av15', 'sniper-rifle',
    'tin-katana', 'laser-pistol', 'arc-thrower', 'monofil-katana', 'laser-rifle', 'plasma-pistol'],
  armor: ['tire-vest', 'concealed-vest', 'go-autocamo', 'mutant-hide', 'captain-coat', 'riot-gear', 'tin-oyoroi', 'cleaner-carapace'],
  // item tier cap by act tier is ACTS[i].tier (items.tier ≤ cap; boss reward may be cap+1)
  credits: { fight: [15, 25], elite: [30, 45], boss: [70, 90] },
};

// Relics: run-long passives, found at elite (35 %) / boss (choice of 3) / meta-unlocks. Invented for the mode.
export const RELICS = [
  { id: 'r-spare-battery', name: 'Запасной аккумулятор', rarity: 'common', fx: { enr: 2 } },
  { id: 'r-lucky-tin', name: 'Счастливая жестянка', rarity: 'common', fx: { critRange: 1 } },
  { id: 'r-rubber-boots', name: 'Резиновые сапоги', rarity: 'common', fx: { speed: 1 } },
  { id: 'r-pocket-cache', name: 'Заначка', rarity: 'common', fx: { startCredits: 40 } },
  { id: 'r-thick-skin', name: 'Толстая шкура', rarity: 'rare', fx: { hpPct: 0.1 } },
  { id: 'r-calm-tape', name: 'Кассета «Спокойствие»', rarity: 'rare', fx: { mrlPct: 0.15 } },
  { id: 'r-vet-ration', name: 'Паёк ветерана', rarity: 'rare', fx: { restHeal: 0.2 } },
  { id: 'r-memory-shard', name: 'Осколок Памяти', rarity: 'rare', fx: { memoryMul: 1.25 } },
  { id: 'r-judge-coin', name: 'Монета Судьи', rarity: 'rare', fx: { rewardReroll: 1, rerollCostFree: true } },
  { id: 'r-reboot-chip', name: 'Чип перезагрузки', rarity: 'epic', fx: { reviveOnce: true } },
  { id: 'r-cringe-ward', name: 'Оберег от кринжа', rarity: 'epic', fx: { cringeResist: 0.5 } },
  { id: 'r-old-bayan', name: 'Старый баян', rarity: 'epic', fx: { firstTurnAp: 1 } },
];

// Events: existing density events (docs: world/density-events.js) reused as run events; check scenes via check-scenes autoScene.
export const EVENT_POOL = ['de-nightwatch', 'de-sectord-queue', 'de-garmoniya-fig', 'de-gidro-drip', 'de-vonyuchka-feast',
  'de-svyatost-vote', 'de-kalostok-pie', 'de-agrara-scarecrow', 'de-slavotech-forge', 'de-dodze-fall', 'de-svalka-auction',
  'de-zavod-shaman', 'de-betonka-silence', 'de-raytsentr-bet', 'de-shtab-leak', 'de-kreml-parade', 'de-pl-queue',
  'de-carwash-box', 'de-gornilo-joke', 'de-sokralnya-candles', 'de-nadezhda-party', 'de-archive-whisper', 'de-caves-lock',
  'de-necropolis-dig'];
export const EVENT_RULES = {
  noRepeatInRun: true, rewardsToRunInventory: true,
  // event rewards: xp is ignored (levels are fixed by layer), credits ×0.5, items kept, rep ignored
  creditsMul: 0.5, ignore: ['xp', 'rep', 'flags', 'days'],
};

// Ascension 1–10: each level is cumulative. Level 0 = base. Fields are multipliers/flags read by run generator.
export const ASCENSIONS = [
  { lvl: 0,  name: 'Новичок',                 note: 'Базовая сложность' },
  { lvl: 1,  name: 'Враги крепче',            foeHp: 0.10 },
  { lvl: 2,  name: 'Больше элит',             eliteWeight: 1.5 },
  { lvl: 3,  name: 'Скупые лавки',            shopPrice: 1.25 },
  { lvl: 4,  name: 'Раненые герои',           carryHpMax: 0.9 },        // carry-over cap of HP at fight start after rest
  { lvl: 5,  name: 'Враги точнее',            foeAtk: 1, foeKb: 1 },
  { lvl: 6,  name: 'Лишний враг в элите',     eliteExtraFoe: 1 },
  { lvl: 7,  name: 'Бедные награды',          rewardChoices: 2, credits: 0.8 },
  { lvl: 8,  name: 'Привал короче',           restHeal: -0.15 },
  { lvl: 9,  name: 'Враги на старте активны', foeFirstTurn: true, bossScale: 1.1 },
  { lvl: 10, name: 'Настоящий Судья',         finalBossPhase: true, noReroll: true },
];

// Balance targets (balance-tester tunes the numbers above; sim: tools/ + 200 seeds, bot picks greedily)
export const BALANCE = {
  winrate: { a0: [0.15, 0.25], a3: [0.08, 0.15], a6: [0.03, 0.08], a10: [0.005, 0.02] }, // novice-quality play, party of 3
  perFight: { fight: { lossPerHero: 0.04 }, elite: { lossPerHero: 0.12 }, boss: { lossPerHero: 0.25 } },
  actClearRate: { act1: 0.75, act2: 0.5, act3: 0.3 },       // share of runs reaching the end of act on A0
  runMinutes: [35, 55],
  soloModifier: 0.0, partySizeFoes: { 1: -3, 2: -2, 3: -2, 4: 0 },  // foes count shift vs encounter definition (min 2)
};

// Meta-progression between runs. «Память киберспейса»: a dead hero becomes a spirit; the run's memory carries experience over.
export const META = {
  memoryPerNode: { fight: 1, elite: 3, boss: 8, event: 1 },
  memoryPerAct: 10, memoryOnVictory: 40, deathBonusPerHero: 2,   // dead hero = spirit: +2 each (even on a lost run)
  unlocks: [
    { id: 'u-reper', kind: 'template', ref: 't-reper', cost: 30 },
    { id: 'u-arbiter', kind: 'template', ref: 't-arbiter', cost: 30 },
    { id: 'u-ugolovnik', kind: 'template', ref: 't-ugolovnik', cost: 40 },
    { id: 'u-itishnik', kind: 'template', ref: 't-itishnik', cost: 40 },
    { id: 'u-mutant', kind: 'template', ref: 't-mutant', cost: 50 },
    { id: 'u-slavotech', kind: 'template', ref: 't-slavotech', cost: 70 },
    { id: 'u-cybertech', kind: 'template', ref: 't-cybertech', cost: 90 },
    { id: 'u-android', kind: 'race', ref: 'android', cost: 40 },
    { id: 'u-plant', kind: 'race', ref: 'mutant-plant', cost: 40 },
    { id: 'k-medic', kind: 'startKit', add: [['medkit', 1]], cost: 20 },
    { id: 'k-grenadier', kind: 'startKit', add: [['grenade', 2]], cost: 25 },
    { id: 'k-cash', kind: 'startKit', credits: 40, cost: 25 },
    { id: 'k-talent', kind: 'startKit', extraTalentChoice: 1, cost: 60 },
    { id: 'rel-lucky-tin', kind: 'relicPool', ref: 'r-lucky-tin', cost: 15 },
    { id: 'rel-reboot-chip', kind: 'relicPool', ref: 'r-reboot-chip', cost: 80 },
    { id: 'rel-old-bayan', kind: 'relicPool', ref: 'r-old-bayan', cost: 60 },
    { id: 'asc-next', kind: 'ascension', rule: 'win run at ascension N unlocks N+1', cost: 0 },
  ],
  // spirit passed between runs: one «Дух» slot; a dead hero of a run may be saved as spirit (costs 10 memory) and next run
  // gives its owner +1 free talent reward and an item-memory (the last weapon id). One spirit at a time.
  spirit: { saveCost: 10, bonus: { freeTalentReward: 1, carryWeapon: true }, slots: 1 },
};

export const RUN_COOP = { partySlots: 4, hostLeads: true, guestOwnsHero: true, reconnectGraceSec: 60 };
