// Расы «Руслании Лайт». Контракт схемы — docs/specs/core-rules.md.
// Канон: docs/canon/rules/races.md, rules/talents.md (расовые таланты),
// lore/history.md, lore/timeline.md, lore/faction-stances.md.
//
// Принцип баланса: у каждой расы примерно одинаковый «бюджет» —
// около +1 к модификатору основной характеристики (≈ 7 ЗДР на 1-м уровне).
// Сильный канонический плюс всегда оплачен канонической слабостью.
// Фиксированные бонусы характеристик разведены по разным статам, чтобы у каждой
// группы классов была «своя» раса, а у человека бонус шёл в любую (any).
//
// Нестандартные поля (сверх схемы): castStat у расовых способностей
// (по какой характеристике считаются атака и СЛ), soulless, todo.

export const RACES = {
  human: {
    id: 'human', name: 'Человек', icon: 'race_human', tags: ['organic'],
    playable: true,
    statBonus: { any: 1 },
    hpBonus: 0, mrlBonus: 2, enrBonus: 0, speed: 6,
    resist: { toxin: 'vuln' },
    immuneStatus: [],
    passives: [],
    abilities: [],
    canon: 'rules/races.md',
    lore: 'Самая распространённая раса, пережившая ЭВК. Канон: «Адаптивность» (+1 к любой характеристике) и «Устойчивость к стрессу» (+2 МРЛ); платят слабостью к токсинам. В АИ Партии люди — низший класс, в Жестяном братстве — равные.',
  },

  skeleton: {
    id: 'skeleton', name: 'Скелет-робот', icon: 'race_skeleton', tags: ['mechanical'],
    playable: true,
    statBonus: { dex: 1 },
    hpBonus: 2, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { electric: 'resist', toxin: 'resist', cyber: 'vuln' },
    immuneStatus: ['fear'],
    passives: [
      { id: 'mech-regen', name: 'Механическая регенерация', desc: 'После боя восстанавливает 1d4 ЗДР.', op: { regen: { dice: '1d4', resource: 'hp', every: 'battleEnd' } } },
    ],
    abilities: [],
    canon: 'rules/races.md',
    lore: 'Киборги из человеческих останков и механики, появились после ЭВК. Канон: стойкость к электричеству, «Съёмный модуль» (+1 ЛВК), «Холодный расчёт» (не паникует). Слабость — взлом и кибератаки (магия Судьи); лечение «только для органики» на них не действует, прокси бьёт по ним ×1.5. Равны людям в Жестяном братстве, добыча для мусорщиков.',
  },

  android: {
    id: 'android', name: 'Андроид (синт)', icon: 'race_synth', tags: ['mechanical'],
    playable: true,
    statBonus: { int: 2 },
    hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { toxin: 'immune', electric: 'vuln' },
    immuneStatus: ['hallucination'],
    passives: [],
    abilities: [
      {
        id: 'weakness-analysis', name: 'Анализ уязвимостей',
        level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
        range: 20, target: 'enemy', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: 'int',
        effects: [{ op: 'mark', id: 'marked', turns: 3, value: 2 }],
        desc: 'Искусственный разум находит слабое место: 3 хода атаки по цели наносят +2 урона.',
        canon: 'rules/races.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Уцелевшие ИИ в искусственных телах; элита АИ Партии, изгои в Жестяном братстве. Канон: +2 ИНТ, неподвержены ядам, «Искусственный разум» (поиск слабостей), «Анти-взлом» (нельзя взломать дистанционно — иммунитет к галлюцинациям). Слабость — электричество. Канон: андроиды не могут использовать магию — это ограничение задаётся в allowedRaces магических классов.',
  },

  'mutant-beast': {
    id: 'mutant-beast', name: 'Мутант-зверь', icon: 'race_mutant', tags: ['organic'],
    playable: true,
    statBonus: { str: 1 },
    hpBonus: 0, mrlBonus: -2, enrBonus: 0, speed: 6,
    resist: { toxin: 'resist' },
    immuneStatus: [],
    passives: [],
    abilities: [
      {
        id: 'beast-regen', name: 'Звериная регенерация',
        level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
        range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: 'con',
        effects: [{ op: 'status', id: 'regen', turns: 2 }],
        desc: 'Раны затягиваются на глазах: регенерация 1d4 ЗДР в ход, 2 хода.',
        canon: 'rules/races.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Подвид мутантов животного происхождения (2006, вирус «Химера»). Ближе к Жестяному братству, но в территориальном конфликте с ним; союзники мутантов-растений и Отступников. Канон: «невероятная сила», регенерация, стойкость к радиации/токсинам. Платят предрассудками: −2 МРЛ (вместо −2 ХАР, которая в каноне только социальная).',
  },

  'mutant-plant': {
    id: 'mutant-plant', name: 'Мутант-растение', icon: 'race_mutant', tags: ['organic'],
    playable: true,
    statBonus: { con: 1 },
    hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 5,
    resist: { fire: 'vuln' },
    immuneStatus: [],
    passives: [
      { id: 'bark-skin', name: 'Кора', desc: 'Толстая кожа-кора: +1 КБ.', op: { kb: 1 } },
      { id: 'photosynthesis', name: 'Фотосинтез', desc: 'Восстанавливает 1 ЗДР в начале каждого своего хода.', op: { regen: { dice: '1d1', resource: 'hp', every: 'turn' } } },
    ],
    abilities: [],
    canon: 'rules/races.md',
    lore: 'Подвид мутантов растительного происхождения (2006). Ближе к АИ Партии, но граница с ней — очаг конфликта из-за ксенофобии АИ; союзники мутантов-зверей, дружат с Отступниками. Канон: мутация «толстая кожа» и «Фотосинтез». Платят медлительностью (скорость 5) и тем, что горят (уязвимость к огню).',
  },

  tekhonok: {
    id: 'tekhonok', name: 'Техонёк', icon: null, tags: ['hybrid'],
    playable: false, // не играбельна по лору: NPC-раса (см. docs/GDD.md)
    statBonus: { wil: 1 },
    hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { proxy: 'resist', cyber: 'vuln' },
    immuneStatus: [],
    passives: [],
    abilities: [
      {
        id: 'techno-trance', name: 'Техношаманский транс',
        level: 1, path: null, cost: 0, action: 'action', trigger: null,
        range: 1, target: 'tile', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: 'wil',
        effects: [{ op: 'summon', unit: 'drone', turns: 3 }],
        desc: 'Ритуалом «оживляет» механизм: рядом появляется дрон на 3 хода, потом он ломается.',
        canon: 'rules/talents.md',
      },
      {
        id: 'ritual-strike', name: 'Ритуальное оружие',
        level: 1, path: null, cost: 0, action: 'action', trigger: null,
        range: 1, target: 'enemy', area: null, roll: 'attack', save: null, onSave: 'none',
        usesPerBattle: 2, castStat: null,
        effects: [{ op: 'weapon', extraDice: '1d6', extraType: 'proxy' }],
        desc: 'Удар оружием с прокси-зарядом: +1d6 прокси (машинам ×1.5, живым ×0.5, без критов).',
        canon: 'rules/races.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Дикари-шаманы Старого бога, «полу биологического полу механического происхождения» (faction-stances) — поэтому hybrid. Канон: прокси-магия, ритуальное оружие, «Техношаманский ритуал», стойкость к прокси. Слабость — магия (здесь: магия Судьи, кибер): культ и механиды — их враги.',
  },

  cringegon: {
    id: 'cringegon', name: 'Кринжгон-отступник', icon: null, tags: ['organic'],
    playable: false, // не играбельна по лору: NPC-раса (см. docs/GDD.md)
    statBonus: { cha: 1 },
    hpBonus: 0, mrlBonus: 4, enrBonus: 0, speed: 6,
    resist: { cringe: 'resist', psychic: 'resist', proxy: 'immune' },
    immuneStatus: [],
    passives: [
      { id: 'fragile-body', name: 'Хрупкое тело', desc: 'Менее устойчивы к физическому урону: −1 КБ.', op: { kb: -1 } },
    ],
    abilities: [
      {
        id: 'cringe-lunge', name: 'Кринж-выпад',
        level: 1, path: null, cost: 0, action: 'action', trigger: null,
        range: 6, target: 'enemy', area: null, roll: 'save', save: 'wil', onSave: 'half',
        usesPerBattle: 2, castStat: 'cha',
        effects: [
          { op: 'damage', dice: '1d6', dmgType: 'cringe', bonus: 'castMod' },
          { op: 'status', id: 'cringed', turns: 3 },
        ],
        desc: 'Неловкая фраза, от которой стынет кровь: 1d6 + ХАР кринж-урона по МРЛ и кринж-эффект на 3 хода (спас ТВД — половина урона).',
        canon: 'rules/races.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Пришельцы, оружие которых — кринж; фракция кринжгонов враждебна всем. Играбельный — отступник, порвавший со своими (как у людей есть изгои ЖБ). Канон: кринж-атаки, «Кринж-эффект» (−1d4 к инициативе), устойчивость к кринжу/пси, талант «Иммунитет к прокси». Слабость — −1 к защите.',
  },

  skrilet: {
    id: 'skrilet', name: 'Перепрограммированный скрилет', icon: null, tags: ['hybrid'],
    playable: false, // не играбельна по лору: NPC-раса (см. docs/GDD.md)
    statBonus: { dex: 1 },
    hpBonus: -4, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { cyber: 'vuln' },
    immuneStatus: ['fear'],
    soulless: true,
    todo: 'Канон «Отсутствие души»: не исцеляется магическими способами и не воскрешается. Нужен флаг для heal (например, only: "souled" или noMagicHeal). Пока действует только сюжетно (душа не уходит в Киберспейс).',
    passives: [
      { id: 'cyber-plating', name: 'Кибернетическая броня', desc: 'Гибрид металла и плоти: +1 КБ.', op: { kb: 1 } },
    ],
    abilities: [
      {
        id: 'skrilet-invisibility', name: 'Невидимость',
        level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
        range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: null,
        effects: [{ op: 'status', id: 'invisible', turns: 2 }],
        desc: 'Становится невидимым на 2 хода. Атака снимает невидимость.',
        canon: 'rules/races.md',
      },
      {
        id: 'deadly-strike', name: 'Смертельный удар',
        level: 1, path: null, cost: 0, action: 'action', trigger: null,
        range: 1, target: 'enemy', area: null, roll: 'attack', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: null,
        effects: [{ op: 'weapon', extraDice: '2d6' }],
        desc: 'Удар по программе убийцы: +2d6 урона. Лучше всего — из невидимости (атака с преимуществом).',
        canon: 'rules/races.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Бездушный убийца, созданный Судьёй из поглощённых душ; канон: «Программируемая лояльность» — их можно перепрограммировать. Канон: +2 к защите (в Лайт +1), невидимость, смертельный удар, лишены эмоций (не знают страха). Платят хрупкостью (−4 ЗДР), уязвимостью к кибер-магии Судьи и отсутствием души.',
  },

  'cyber-spirit': {
    id: 'cyber-spirit', name: 'Дух Киберспейса', icon: null, tags: ['digital'],
    playable: false,
    statBonus: {},
    hpBonus: 0, mrlBonus: 0, enrBonus: 0, speed: 6,
    resist: { cyber: 'resist', toxin: 'immune', proxy: 'vuln' },
    immuneStatus: ['poison', 'bleed'],
    passives: [],
    abilities: [
      {
        id: 'digital-shield', name: 'Цифровой щит',
        level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
        range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: null,
        effects: [{ op: 'shield', dice: '1d6', turns: 2 }],
        desc: 'Энергетический щит поглощает 1d6 урона.',
        canon: 'rules/races.md',
      },
      {
        id: 'cyber-deception', name: 'Кибер-обман',
        level: 1, path: null, cost: 0, action: 'bonus', trigger: null,
        range: 1, target: 'tile', area: null, roll: 'auto', save: null, onSave: 'none',
        usesPerBattle: 1, castStat: null,
        effects: [{ op: 'summon', unit: 'hologram', turns: 1 }],
        desc: 'Создаёт ложную цель на 1 ход.',
        canon: 'rules/talents.md',
      },
    ],
    canon: 'rules/races.md',
    lore: 'Не раса при создании, а состояние: душа умершего попадает в Киберспейс (lore/history.md). Канон: стойкость к кибератакам, уязвимость к магии (здесь — прокси), цифровой щит, ложные цели. Для эпизода в Киберспейсе.',
  },
};
