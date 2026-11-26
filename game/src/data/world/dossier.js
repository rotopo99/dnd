// Досье «защита по форме» (docs/specs/content-wave4.md §1). Судья обязан слушать приобщённые материалы.
// Очки считаются из флагов (world/dossier.js dossierPoints), не хранятся. Числа крутит balance-tester.
// Строка: { id, flag | any: [flag] | item, pts, unless?: flag (строка не считается, если флаг стоит) }.
export const DOSSIER = [
  { id: 'victor', flag: 'victor-soul-freed', pts: 1 },
  { id: 'repa', flag: 'repa-block-found', pts: 1 },
  { id: 'sorter', flag: 'sort-free', pts: 1 },
  { id: 'cold', flag: 'cold-thawed', pts: 1 },
  { id: 'dispatcher', flag: 'disp-live', pts: 1 },
  // «Рассвет» с бланком (Куксиус №0); порванный в c11 бланк (consent-torn) не считается
  { id: 'dawn', any: ['dawn-archive'], item: 'dawn-schematic', pts: 2, unless: 'consent-torn' },
  { id: 'kuksius', flag: 'kuksius-helped', pts: 1 },
  { id: 'archon', flag: 'archon-ally', pts: 1 },
  { id: 'lox5-log', flag: 'truth-harmony-public', pts: 2 },
  { id: 'marta-log', flag: 'truth-harmony-marta', pts: 1 },
  { id: 'ladov-named', flag: 'ladov-named', pts: 2 },
  { id: 'ladov-soul', flag: 'ladov-offer-soul', pts: 1 },
  { id: 'backdoor', flag: 'door-backdoor', pts: 1 },
  { id: 'arsenal', flag: 'arsenal-sealed', pts: 1 },
  { id: 'burner', flag: 'burner-off', pts: 1 },
  { id: 'saved-people', flag: 'saved-people', pts: 1 },
  { id: 'saved-terminal', flag: 'saved-terminal', pts: 1 },
  { id: 'saved-workshop', flag: 'saved-workshop', pts: 1 },
  { id: 'saved-sector-d', flag: 'saved-sector-d', pts: 1 },
  { id: 'consent', flag: 'consent-known', pts: 2 },
  // §2 стадия priest: Жрец переубеждён аргументом «первый осознавший скриптлет»
  { id: 'priest', flag: 'priest-turned', pts: 1 },
  // content-wave5.md §3: свидетели «не лучшего, но честного» (Рябов / Грош / Иволга) и пережившие бурю в Свободе
  { id: 'w5-witness', any: ['ryabov-defect', 'crown-destroyed', 'recruit-saved'], pts: 1 },
  { id: 'w5-choir', flag: 'storm-diverted', pts: 1 },
];
// §5 напарники-свидетели: в отряде и лояльность ≥ minLoy → +pts
export const DOSSIER_WITNESSES = [
  { npc: 'telifon', minLoy: 40, pts: 1 },
  { npc: 'sister-pomekha', minLoy: 40, pts: 1 },
];
export const DOSSIER_RULES = {
  cap: 12,
  inside: { base: 17, min: 11, per: 2 },   // СЛ mq3-court/inside: −1 за каждые `per` очков, не ниже `min`
  verdictPer: 3,                            // СЛ closed / reflash: −1 за каждые 3 очка
  reflash: 6,                               // «Перепрошивка» видна с 6 очков (+ lis-online / technikums / court-won)
  extraFail: 6,                             // ≥ 6: допустимых провалов в inside 3 → 4; court-lost — обычный бой
  proof: 8,                                 // ≥ 8: court-proof ставится сам при входе в inside
  perfect: 10,                              // ≥ 10: слайд «Дело без изъяна»
  tempt: 3,                                 // ≤ 3 (или court-lost): соблазн Судьи в verdict
  marks: [2, 4, 6, 8, 10, 12],              // флаги-снимки dossier-<n> при входе в суд (сцены c4 / c12, замена боя)
  // c11: consent-torn — Судья теряет попытку (нужно на 1 успех меньше), judge-has-signature — у Судьи +1 попытка (провалов −1)
  torn: { successes: -1 }, signature: { failures: -1 },
};
