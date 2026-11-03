// Специализации классов для проверок навыков вне боя. Спека: docs/specs/world.md, п. 5 (таблица вне канона,
// не противоречит rules/classes.md). Канон правила: rules/core-rules.md, правило 1 — вне специализации с помехой,
// по специализации с преимуществом. Создано программистом по таблице спеки; владелец данных — game-designer.
//
// spec    — специализация: преимущество + бонус владения;
// related — смежные навыки: обычный бросок + бонус владения;
// остальные навыки — помеха, без бонуса владения.

export const SPECIALIZATIONS = {
  zabivnoy:   { spec: ['athletics', 'intimidation', 'military'], related: ['endurance', 'survival', 'perception'] },
  technomant: { spec: ['tech', 'hacking', 'analysis'],           related: ['judge', 'religion', 'medicine'] },
  mutant:     { spec: ['athletics', 'survival', 'endurance'],    related: ['intimidation', 'biology', 'perception'] },
  itishnik:   { spec: ['tech', 'lockpicking', 'analysis'],       related: ['hacking', 'medicine', 'military'] },
  ranger:     { spec: ['survival', 'perception', 'stealth'],     related: ['athletics', 'biology', 'military'] },
  arbiter:    { spec: ['persuasion', 'intimidation', 'religion'], related: ['medicine', 'military', 'endurance'] },
  ugolovnik:  { spec: ['stealth', 'lockpicking', 'deception'],   related: ['hacking', 'acrobatics', 'perception'] },
  ecolog:     { spec: ['biology', 'survival', 'medicine'],       related: ['proxy', 'meditation', 'perception'] },
  reper:      { spec: ['persuasion', 'deception', 'intimidation'], related: ['acrobatics', 'analysis', 'meditation'] },
  slavotech:  { spec: ['proxy', 'medicine', 'meditation'],       related: ['religion', 'tech', 'biology'] },
  cybertech:  { spec: ['judge', 'hacking', 'religion'],          related: ['analysis', 'meditation', 'deception'] },
};

/** Сложность проверок (world.md, п. 5). */
export const DC = { easy: 10, medium: 13, hard: 16, veryHard: 19 };
