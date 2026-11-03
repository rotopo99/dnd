// Фирменные примочки классов — по одной на класс (решение человека 2026-11-03).
// Спека: docs/specs/talents.md, раздел «Классовые примочки». Операции — docs/specs/core-rules.md.
// Схема как у таланта: passives / abilities / world, плюс class. Выдаётся при создании, всегда активна,
// НЕ занимает лимит боевых талантов. Сила боевой части — как у одного боевого таланта (≈ +3–5 п.п.), «раз за бой».
// world — флаги из WORLD_FLAGS (game/src/data/talents.js).
// Все записи — вне канона, не противоречат: «можно добавить свои… владение каким-либо оружием и т. п.» (rules/talents.md).

const ab = (o) => ({
  level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
  range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
  usesPerBattle: 1, effects: [], desc: '', canon: null,
  ...o,
});

const G = (o) => ({ passives: [], abilities: [], world: [], canon: 'вне канона, не противоречит: rules/talents.md («можно добавить свои»)', ...o });

const LIST = [
  G({ id: 'rebar', class: 'zabivnoy', name: 'Арматура с изолентой',
    abilities: [ab({ id: 'gadget-rebar', name: 'Арматурой по хребту', action: 'action', range: 1, target: 'enemy', roll: 'attack',
      effects: [{ op: 'weapon', extraDice: '1d6' }, { op: 'push', tiles: 1 }],
      desc: 'Удар оружием +1d6; при попадании цель отлетает на 1 клетку. Раз за бой.' })],
    world: [{ worldFlag: 'break-door' }],
    desc: 'Главный аргумент Забивного. Выбивает двери, завалы и зубы.' }),
  G({ id: 'deck-bracelet', class: 'technomant', name: 'Самопальный дека-браслет',
    abilities: [ab({ id: 'gadget-deck', name: 'Подзарядка от деки', target: 'self',
      effects: [{ op: 'heal', value: 3, resource: 'enr' }],
      desc: 'Бонусным действием +3 ЭНР. Раз за бой.' })],
    world: [{ worldFlag: 'terminal-scan' }],
    desc: 'Браслет из клавиатуры и батареек: видит терминалы издали.' }),
  G({ id: 'chimera-jar', class: 'mutant', name: 'Банка с «Химерой»',
    abilities: [ab({ id: 'gadget-chimera', name: 'Глоток «Химеры»', target: 'self',
      effects: [{ op: 'buff', stat: 'dmg', value: 2, turns: 3 }],
      desc: 'Мутаген бурлит: +2 к урону на 3 хода. Раз за бой.' })],
    world: [{ worldFlag: 'mutate-on-rest' }],
    canon: 'вне канона, не противоречит: вирус «Химера» мутирует живые организмы (lore/timeline.md)',
    desc: 'Мутанту виднее, что внутри. Остальным лучше не открывать.' }),
  G({ id: 'junk-multitool', class: 'itishnik', name: 'Мультитул из хлама',
    abilities: [ab({ id: 'gadget-multitool', name: 'Заплатка', range: 1, target: 'ally',
      effects: [{ op: 'shield', dice: '1d6', bonus: 2, turns: 2 }],
      desc: 'Приваривает лист жести союзнику: щит 1d6 + 2 на 2 хода. Раз за бой.' })],
    world: [{ worldFlag: 'multitool' }],
    desc: 'Ключ, паяльник, открывашка и ложка в одном.' }),
  G({ id: 'cyber-cat', class: 'ranger', name: 'Кибер-кошка',
    abilities: [ab({ id: 'gadget-cyber-cat', name: 'Кошка указала', range: 20, target: 'enemy',
      effects: [{ op: 'mark', id: 'marked', turns: 2, value: 2 }],
      desc: 'Дрон-кошка садится на цель: 2 хода атаки по ней +2 урона. Раз за бой.' })],
    world: [{ worldFlag: 'scout-node' }],
    canon: 'rules/talents.md: гаджет «Кибер-кошка» — маленький дрон-разведчик',
    desc: 'Хрупкий, но полезный дрон-разведчик.' }),
  G({ id: 'arbiter-badge', class: 'arbiter', name: 'Жетон Арбитра',
    abilities: [ab({ id: 'gadget-badge', name: 'Именем закона', range: 5, target: 'enemy', roll: 'save', save: 'wil', castStat: 'wil',
      effects: [{ op: 'status', id: 'taunt', turns: 1 }],
      desc: 'Предъявляет жетон: цель обязана атаковать Арбитра 1 ход (спас ТВД). Раз за бой.' })],
    world: [{ worldFlag: 'badge-entry' }],
    canon: 'вне канона, не противоречит: Арбитры защищают слабых (rules/classes.md); жетон — не символ Судьи (canon/README, п. 12)',
    desc: 'Чей это закон — вопрос открытый. Но жетон блестит убедительно.' }),
  G({ id: 'jammer-pick', class: 'ugolovnik', name: 'Отмычка-глушилка',
    abilities: [ab({ id: 'gadget-jammer', name: 'Глушилка', range: 5, target: 'enemy', roll: 'save', save: 'int', castStat: 'int',
      effects: [{ op: 'status', id: 'silence', turns: 1 }],
      desc: 'Глушит электронику цели: немота на 1 ход (спас ИНТ). Раз за бой.' })],
    world: [{ worldFlag: 'silent-pick' }],
    desc: 'Открывает замки и закрывает рты.' }),
  G({ id: 'herbarium', class: 'ecolog', name: 'Гербарий',
    abilities: [ab({ id: 'gadget-herbarium', name: 'Лист подорожника', action: 'action', range: 1, target: 'ally',
      effects: [{ op: 'cleanse', count: 1, kind: 'debuff' }, { op: 'heal', dice: '1d4', bonus: 1, resource: 'hp' }],
      desc: 'Снять 1 негативный эффект и 1d4 + 1 ЗДР союзнику рядом. Раз за бой.' })],
    world: [{ worldFlag: 'herb-medkit' }, { check: 'biology', bonus: 2 }],
    desc: 'Альбом засушенных мутантских трав. Половина лечит.' }),
  G({ id: 'microphone', class: 'reper', name: 'Микрофон',
    abilities: [ab({ id: 'gadget-mic', name: 'Припев', target: 'ally', area: { shape: 'radius', size: 3 },
      effects: [{ op: 'heal', dice: '1d4', resource: 'mrl' }],
      desc: 'Союзники в радиусе 3: 1d4 МРЛ. Раз за бой.' })],
    world: [{ worldFlag: 'gig' }],
    desc: 'Кричащий микрофон с наклейкой «Голос Пустошей» (краденой).' }),
  G({ id: 'old-god-ward', class: 'slavotech', name: 'Оберег Старого бога',
    passives: [{ op: { resist: { cyber: 'resist' } } }],
    world: [{ worldFlag: 'storm-ward' }],
    canon: 'вне канона, не противоречит: техоньки — враги культа (lore/timeline.md), прокси-бури (lore/timeline.md)',
    desc: 'Ритуальный амулет из платы и проволоки: сопротивление киберу (магии Судьи), защита партии от прокси-бурь.' }),
  G({ id: 'judge-flash', class: 'cybertech', name: 'Флешка с кодом Судьи',
    abilities: [ab({ id: 'gadget-judge-flash', name: 'Строка приговора', range: 6, target: 'enemy', roll: 'save', save: 'wil', onSave: 'half', castStat: 'int',
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'cyber' }],
      desc: 'Бонусным действием: 1d8 кибер (спас ТВД — половина). Раз за бой.' })],
    world: [{ worldFlag: 'judge-code' }],
    canon: 'вне канона, не противоречит: КиберТех — договор с Судьёй (rules/classes.md); ритуальные терминалы (lore/timeline.md)',
    desc: 'Кусок кода Судьи. Открывает терминалы культа, но культ замечает.' }),
];

for (const g of LIST) {
  g.passives = g.passives.map((p, i) => ({ id: `gadget-${g.id}${i ? '-' + i : ''}`, name: g.name, desc: g.desc, ...p }));
  for (const a of g.abilities) a.gadget = g.id;
}

export const GADGETS = Object.fromEntries(LIST.map((g) => [g.id, g]));

/** Примочка класса по id класса. */
export const GADGET_BY_CLASS = Object.fromEntries(LIST.map((g) => [g.class, g.id]));
export const gadgetFor = (clsId) => GADGETS[GADGET_BY_CLASS[clsId]] || null;
