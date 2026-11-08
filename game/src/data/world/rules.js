// Numbers of the world UI rules (world.md §2–§6, talents.md). Owner of balance — game-designer / balance-tester;
// the world code reads only these constants (no magic numbers in scenes).
export const WORLD_RULES = {
  start: { credits: 50, items: { medkit: 1, ration: 2 }, prologueXp: 350 },
  gate: { sneakDc: 14, talkSkills: ['persuasion', 'deception'], talkDc: 13, toll: 20, parleyDc: 14 },
  prices: { hostile: 1.5, suspicious: 1.25, neutral: 1, friendly: 0.9, ally: 0.8, sell: 0.5 },
  rumorPrice: 10,
  gig: { skill: 'persuasion', dc: 13, credits: 20, rep: 3 },
  bribePerLevel: 20, // flag 'bribe': a social check can be replaced by a bribe
  socialSkills: ['persuasion', 'deception', 'intimidation'],
  approval: { deed: 5, keyDeed: 15, warn: -50, leave: -70, teach: 50, min: -100, max: 100 },
  killRep: { perKill: -2, maxPerBattle: -10 },
  codex: { knownKills: 5, lootOften: 0.3, lootSome: 0.1 }, // vendors-bestiary.md part 2: «Изучен» after N wins; loot chance words
  hiddenSearch: { skill: 'perception' },
  hiddenRouteFlags: ['hidden-routes', 'squeeze'],
  goalRetries: 1, // a goal without onFail may be retried once, then it is closed as failed
  questFailRep: -5,
  loot: { dice: '1d6', mult: 5 }, // scrap-loot / battle-loot: extra credits per flag
  cyberspace: { baseDc: 13, nodes: 3, needed: 2, maxMarks: 3, mrlPerMark: 2, returnFrac: 0.5, robFrac: 0.1, uniqueMax: 5,
    skills: ['meditation', 'judge', 'hacking', 'religion'], encounter: 'w-cyberspace' },
  finale: { encounter: 'w-cc-finale', minParty: 3 },
  talentFallbackCredits: 100, // quest talentChoice with nothing allowed for the hero → credits instead
  blackMarket: ['rare-parts', 'lockpick-set', 'grenade', 'servo-parts'],
};
