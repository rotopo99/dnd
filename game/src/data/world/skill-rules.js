// Numbers of the skill usefulness mechanics (docs/specs/skills.md §5, needs N1–N7). Owner of balance — game-designer /
// balance-tester; the world code reads only these constants. Created by the programmer from the spec table.
export const SKILL_RULES = {
  // N1: CHA prices (best CHA modifier in the party), haggling and junk selling once per shop per day
  trade: {
    buyPerMod: 0.03, buyMax: 0.15, sellPerMod: 0.03, sellMax: 0.15,
    haggle: { skill: 'persuasion', dc: 13, discount: 0.1 },
    junk: { skill: 'deception', dc: 14, sellRate: 1 }, // fail — the shop is closed for the day
    // N7 Military: the weapon quality is shown in shops if a member has the skill (specialisation or related)
    appraise: { skill: 'military' },
  },
  // N2: recruitment
  recruit: {
    repPerMod: 5, // the hostile threshold for recruitment is lowered by 5 per hero CHA modifier point
    hireCha: 14, hireTier: 'friendly', // paid hire of mercenaries (NPC service 'recruit' without companion data)
    hirePricePerLevel: 60, hireDiscountPerMod: 0.05,
  },
  // N3: talks instead of a fight (road and node skirmishes with people and robots)
  parley: {
    skills: ['persuasion', 'intimidation', 'deception'], baseDc: 12, maxDc: 17, xpShare: 0.5, failInit: 2,
    // who does not listen: factions, enemy tags, id / name patterns (beasts, undead, cringegons)
    deafFactions: ['cringegons', 'mutantsBeast', 'mutantsPlant'],
    deafTags: ['digital'],
    deafPattern: 'fauna|beast|wolf|rat|dog|cringe|crg-|dead|ghost|zomb|spore|swarm|plague|mutz-|mutr-|зверь|волк|крыс|пёс|мертв|призрак|упыр|кринж|рой|тварь|чудищ',
  },
  // N5: caches with several skills — the check window offers each skill and the best roll
  // N6: battle tricks — a bonus action once per battle per skill per unit, d20 + skill vs dc + enemy level / 2
  tricks: {
    dc: 12,
    analysis: { status: 'marked', value: 2, turns: 3 },
    hacking: { status: 'stun', turns: 1, onlyTag: 'mechanical' },
    tech: { shield: 10 }, // + to a mech shield of an ally
    medicine: {}, // stabilise a downed ally without a medkit (adjacent)
    athletics: { push: 2 }, // adjacent enemy
    stealth: { status: 'stealth', turns: 1, round: 1 }, // first round only: the next attack with advantage
    biology: {}, // reveal resistances / immunities of a target
  },
  preBattle: { military: { dc: 12, init: 1 } }, // N6 Military: +1 initiative of the party (best member, before the battle)
  // N7: economy
  economy: {
    disassemble: { skill: 'tech', dcBase: 10, item: 'servo-parts', n: 1, bonusFromTier: 3 }, // tier ≥ 3 → +1 part
    medkit: { skill: 'medicine', dc: 13, mult: 1.5 },
    camp: { skill: 'survival', dc: 13, item: 'tushenka', n: 1 }, // success: rations and no encounter roll
    samples: { skill: 'biology', dc: 13, credits: [20, 60], factions: ['mutantsBeast', 'mutantsPlant'], tags: ['hybrid'] },
    crates: { skill: 'athletics', dc: 13, credits: '2d6', mult: 5, kinds: ['town', 'hub', 'camp', 'dungeon'] },
  },
};
