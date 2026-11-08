// Подсказки «здесь пригодится X» (docs/specs/skills-v3.md, п. hintSkills). Данные без логики; владелец — game-designer.
// NODE_HINTS[nodeId] — навыки, видимые значком в узле сверх выводимых из node-skill-actions.js / тайников / входа (UI собирает
// объединение: hintSkillsOf(node) = NODE_HINTS ∪ навыки действий узла ∪ навыки тайников/entry). NPC_HINTS[npcId] — значки
// у NPC в узле и в диалоге: навыки, которыми можно решить его тему иначе (поле hintSkills у темы/реплики диалога — тот же формат).
// Максимум 3 значка; порядок — по важности.
export const NODE_HINTS = {
  'alpha-harmony': ['persuasion', 'perception'], 'harmony-workshop': ['tech', 'analysis'], 'harmony-reactor': ['tech', 'proxy'],
  'harmony-post': ['military', 'perception'], 'harmony-sector-d': ['persuasion', 'survival'], garmoniya: ['biology', 'proxy'],
  gidroponika: ['biology', 'tech'], 'tin-arena': ['athletics', 'intimidation'], dodze: ['meditation', 'endurance'], noch: ['stealth', 'perception'],
  kreml: ['military', 'deception'], sokralnya: ['religion', 'judge'], 'cc-temple': ['judge', 'religion'], 'pirates-m29': ['perception', 'deception'],
  'circuses-m40': ['acrobatics', 'persuasion'], 'dacha-babki': ['lockpicking', 'persuasion'], 'bunker-lisa': ['medicine', 'tech'],
  'lagoon-bar': ['deception', 'perception'], 'sea-monsters-m19': ['survival', 'athletics'],
};
export const NPC_HINTS = {
  nikola: ['tech', 'analysis'], gans: ['military', 'intimidation'], sera: ['medicine', 'biology'], paracetamol: ['medicine'], amanda: ['persuasion', 'deception'],
  'riot-boss': ['intimidation', 'persuasion'], 'seer': ['religion', 'proxy'], alik: ['hacking', 'deception'], 'old-lockpick': ['lockpicking'],
  'archivist-nine': ['hacking', 'judge'], 'colonel-shurup': ['military', 'persuasion'], 'quartermaster-krotova': ['military', 'tech'],
  'gunsmith-kalibr': ['tech', 'military'], khan: ['intimidation', 'athletics'], ken: ['persuasion', 'deception'], 'monk-tishina': ['meditation', 'religion'],
  'smith-okalina': ['tech', 'athletics'], burevestnik: ['survival', 'persuasion'], 'negotiator-whisper': ['persuasion', 'deception'],
  'glava-musora': ['intimidation', 'persuasion'], shchup: ['stealth', 'lockpicking'], 'old-voroshilo': ['survival', 'perception'], 'zoya-klyk': ['biology', 'survival'],
  'old-badger': ['survival', 'perception'], skinner: ['biology', 'survival'], 'bear-grunya': ['athletics', 'endurance'], 'mutant-shaman': ['proxy', 'biology'],
  'madam-stavka': ['deception', 'perception'], 'cyber-lovkach': ['hacking', 'tech'], 'brother-tyorka': ['religion', 'persuasion'],
};
