// Фракции и их отношения. Источник: скриншот «Relations matrix» из наработок
// (редактор карты), сверено с docs/canon/lore/faction-stances.md.
//
// RELATIONS[a][b] — кем фракция b является для фракции a.
// Пример: RELATIONS.pirates.scavengers === 'vassal' → мусорщики — вассалы пиратов.

export const FACTIONS = {
  pirates: { name: 'Пираты' },
  warprom: { name: 'Военпром' },
  aiParty: { name: 'АИ Партия' },
  tinBrotherhood: { name: 'Жестяное братство' },
  renegades: { name: 'Отступники' },
  mechanids: { name: 'Механиды' },
  cringegons: { name: 'Кринжгоны' },
  scavengers: { name: 'Мусорщики' },
  tekhonki: { name: 'Техоньки' },
  neutralVillages: { name: 'Нейтральные селения' },
  agrozone: { name: 'Агрозона' },
  mutantsPlant: { name: 'Мутанты-Р' },
  cult: { name: 'Культ' },
  mutantsBeast: { name: 'Мутанты-Ж' },
};

export const STANCES = {
  ally: { name: 'Союзник', score: 3 },
  friendly: { name: 'Дружба', score: 2 },
  neutral: { name: 'Нейтралитет', score: 0 },
  unknown: { name: 'Не знакомы', score: 0 },
  suspicion: { name: 'Подозрение', score: -1 },
  rival: { name: 'Соперник', score: -2 },
  enemy: { name: 'Враг', score: -3 },
  vassal: { name: 'Вассал', score: 2 },
  suzerain: { name: 'Сюзерен', score: 2 },
};

const ORDER = Object.keys(FACTIONS);

// Строки в порядке ORDER, как в исходной матрице. '-' — диагональ.
const MATRIX = {
  pirates:         '- suspicion suspicion neutral friendly suspicion suspicion vassal suspicion friendly suspicion unknown neutral unknown',
  warprom:         'suspicion - suzerain enemy enemy unknown suspicion neutral unknown rival rival suspicion unknown unknown',
  aiParty:         'suspicion vassal - enemy enemy neutral suspicion neutral unknown rival vassal suspicion unknown unknown',
  tinBrotherhood:  'neutral enemy enemy - friendly suspicion unknown suspicion neutral friendly enemy unknown suspicion suspicion',
  renegades:       'friendly enemy enemy friendly - unknown suspicion neutral unknown unknown enemy friendly suspicion friendly',
  mechanids:       'suspicion unknown neutral suspicion unknown - unknown suspicion suspicion neutral suspicion unknown friendly neutral',
  cringegons:      'suspicion suspicion suspicion unknown suspicion unknown - unknown enemy unknown suspicion suspicion neutral unknown',
  scavengers:      'suzerain neutral neutral suspicion neutral suspicion unknown - rival friendly unknown unknown neutral neutral',
  tekhonki:        'suspicion unknown unknown neutral unknown suspicion enemy rival - friendly unknown unknown enemy rival',
  neutralVillages: 'friendly rival rival friendly unknown neutral unknown friendly friendly - suspicion neutral suspicion neutral',
  agrozone:        'suspicion rival suzerain enemy enemy suspicion suspicion unknown unknown suspicion - suspicion suspicion suspicion',
  mutantsPlant:    'unknown suspicion suspicion unknown friendly unknown suspicion unknown unknown neutral suspicion - suspicion ally',
  cult:            'neutral unknown unknown suspicion suspicion friendly neutral neutral enemy suspicion suspicion suspicion - suspicion',
  mutantsBeast:    'unknown unknown unknown suspicion friendly neutral unknown neutral rival neutral suspicion ally suspicion -',
};

export const RELATIONS = Object.fromEntries(
  ORDER.map((a) => {
    const row = MATRIX[a].split(' ');
    return [a, Object.fromEntries(ORDER.map((b, i) => [b, row[i]]).filter(([b]) => b !== a))];
  }),
);

export const stance = (a, b) => (a === b ? 'self' : RELATIONS[a][b]);
