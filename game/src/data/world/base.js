// База игрока: бункер Лиса (под дачей Галины). Спека: docs/specs/world-consequences.md, часть 3. Данные без логики.
// save.base = { built: true, mods: { [moduleId]: level }, power: n, hp: n, log: [] }.
// Материалы — id предметов из ITEMS; движок списывает из рюкзаков/схрона, кредиты — из hero.credits.

export const BASE_LOCATION = 'bunker-lisa'; // существующий узел; после открытия получает kind: 'base' (хаб, отдых, схрон)

// Открытие — раньше по сюжету (человек, п. 14). Дача Галины (dacha-babki) — регион Нейтральных селений, уровень 1.
export const BASE_UNLOCK = {
  // 1) Дача и люк — с самого начала: квест sq-galina-hatch выдаётся на 1 ур. при первом входе в dacha-babki (без требований)
  hatchQuest: 'sq-galina-hatch',
  // 2) База открывается при сдаче sq-galina-hatch (любой исход): флаг base-open. Тост «Бункер Лиса теперь ваш»
  openOn: { quest: 'sq-galina-hatch', stage: 'back', flag: 'base-open' },
  // 3) «Лис» (ИИ бункера) включается квестом ch3-kalostok (online): флаг lis-online → открывает 2-й уровень модулей и оборону
  lisOn: { quest: 'ch3-kalostok', stage: 'online', flag: 'lis-online' },
  // 4) Если sq-galina-hatch не взят до ур. 3 — Галина сама зовёт (ивент входа в Нейтральные селения, один раз)
  fallbackInvite: { level: 3, event: 'galina-invite' },
  firstGift: { items: [{ id: 'medkit', n: 2 }, { id: 'rations', n: 3 }], credits: 0, text: 'Галина: «Только ноги вытирай. И не открывай ту дверь с надписью “Лис”. Ну открой, чего уж».' },
  freeModules: ['stash'], // схрон работает сразу
};

// Модули. levels[i] — цена и эффект уровня i+1. cost: { credits, items:[{id,n}], days }, power — потребление (генератор даёт 2 / 4 / 6)
export const BASE_MODULES = {
  stash: { name: 'Схрон', glyph: '▦', needs: [], desc: 'Склад с замком: схрон инвентаря (общий с хабами) доступен прямо на базе, без поездок.',
    levels: [
      { cost: { credits: 0, items: [], days: 0 }, power: 0, fx: { stashRows: 0, note: 'схрон 10×12 как в хабах, доступен на базе всегда' } },
      { cost: { credits: 150, items: [{ id: 'servo-parts', n: 2 }], days: 1 }, power: 0, fx: { stashRows: 4, note: '+4 ряда схрона (10×16)' } },
      { cost: { credits: 400, items: [{ id: 'servo-parts', n: 4 }, { id: 'repair-kit', n: 1 }], days: 2 }, power: 1, fx: { stashRows: 8, vaultSlots: 4, note: '+8 рядов; 4 слота «сейфа» — предметы не пропадают при плохом событии' } },
    ] },
  workbench: { name: 'Верстак модов', glyph: '⚒', needs: ['generator'], desc: 'Установка и снятие модов без проверок и без шанса поломки; разбор предметов с бонусом.',
    levels: [
      { cost: { credits: 200, items: [{ id: 'servo-parts', n: 3 }, { id: 'electrical-tape', n: 2 }], days: 1 }, power: 1, fx: { modInstall: 'noCheck', note: 'моды ставятся без проверки, провал 25% не бросается' } },
      { cost: { credits: 450, items: [{ id: 'servo-parts', n: 5 }, { id: 'repair-kit', n: 2 }], days: 2 }, power: 1, fx: { disassembleBonus: 1, repair: true, note: 'разбор: +1 деталь; ремонт предметов за 20% цены' } },
      { cost: { credits: 900, items: [{ id: 'rare-parts', n: 2 }, { id: 'repair-kit', n: 3 }], days: 3 }, power: 2, fx: { qualityUp: { skill: 'tech', dc: 15, from: 'junk|working', to: '+1', perItemOnce: true }, note: 'улучшение качества: хлам→рабочее, рабочее→мастеровое (Технологии СЛ 15, раз на предмет)' } },
    ] },
  medbay: { name: 'Медотсек', glyph: '✚', needs: ['generator'], desc: 'Койки и аптечка: отдых на базе лечит полностью и снимает статусы.',
    levels: [
      { cost: { credits: 180, items: [{ id: 'bandage', n: 5 }, { id: 'medkit', n: 1 }], days: 1 }, power: 1, fx: { restHeal: 1.0, cleanse: 'bleed|burn', note: 'отдых на базе — 100% ЗДР/МРЛ, снимает кровотечение и ожог' } },
      { cost: { credits: 400, items: [{ id: 'medkit', n: 3 }, { id: 'analgin', n: 3 }], days: 2 }, power: 1, fx: { withdrawalClear: true, revive: 'ally-down-heals', note: 'снимает ломку и радиацию; упавшие после боя встают с 50%' } },
      { cost: { credits: 800, items: [{ id: 'medkit', n: 5 }, { id: 'rare-parts', n: 1 }], days: 3 }, power: 2, fx: { reviveSoul: true, freeMedkitPerRest: 1, note: 'возвращение души на базе (без терминала киберспейса); каждый отдых +1 аптечка' } },
    ] },
  radio: { name: 'Радиоузел', glyph: '📻', needs: ['generator'], desc: 'Рация большой мощности: сдача квестов с `radio` и `return` из любой точки карты (mode `radio` у всех); слухи; вызов торговцев.',
    levels: [
      { cost: { credits: 250, items: [{ id: 'spare-cell', n: 2 }, { id: 'electrical-tape', n: 2 }], days: 1 }, power: 1, fx: { turninRadio: 'all-return-quests', note: 'квесты с turnin: return можно сдать по рации, NPC достижим (награда сразу, реплика по итогу в журнале)' } },
      { cost: { credits: 500, items: [{ id: 'krona-battery', n: 2 }, { id: 'spare-cell', n: 2 }], days: 2 }, power: 1, fx: { rumorPerDay: 1, vendorCall: 3, note: 'раз в день — слух; 3 «заказа» торговцу в неделю: купленное придёт в схрон через 2 дня (+10% цены)' } },
      { cost: { credits: 1000, items: [{ id: 'proxy-can', n: 2 }, { id: 'rare-parts', n: 2 }], days: 3 }, power: 2, fx: { mapReveal: 'узлы с флагами квестов', warning: 'за 1 день предупреждение о нападении на базу', note: 'на карте метки открытых квестов; предупреждение об атаке' } },
    ] },
  quarters: { name: 'Комнаты напарников', glyph: '☗', needs: [], desc: 'Койка и тумбочка каждому напарнику: лояльность растёт, отдых на базе уютнее.',
    levels: [
      { cost: { credits: 120, items: [{ id: 'rations', n: 3 }], days: 1 }, power: 0, fx: { rooms: 2, restLoyalty: 1, note: '2 комнаты; напарник в комнате: +1 лояльность за ночь на базе' } },
      { cost: { credits: 300, items: [{ id: 'servo-parts', n: 2 }, { id: 'calmers', n: 2 }], days: 2 }, power: 1, fx: { rooms: 4, restLoyalty: 2, personalHint: true, note: '4 комнаты; +2 лояльности за ночь; у личного квеста — подсказка прямо в комнате' } },
      { cost: { credits: 600, items: [{ id: 'rations', n: 6 }, { id: 'calmers', n: 4 }], days: 3 }, power: 1, fx: { rooms: 6, restLoyalty: 2, restMrl: 1, warnPrevent: true, note: '6 комнат; отдых на базе — МРЛ 100% и снятие «warn» одобрения 1 раз в 7 дней' } },
    ] },
  generator: { name: 'Генератор', glyph: '⚡', needs: [], desc: 'Питание модулей. Без него верстак, медотсек и рация не работают. Топливо: батареи.',
    levels: [
      { cost: { credits: 220, items: [{ id: 'servo-parts', n: 3 }, { id: 'krona-battery', n: 1 }], days: 1 }, power: 0, fx: { supply: 2, fuel: { item: 'krona-battery', perDays: 10 }, note: 'питание 2; расход 1 батарея в 10 дней базы' } },
      { cost: { credits: 500, items: [{ id: 'krona-battery', n: 3 }, { id: 'repair-kit', n: 1 }], days: 2 }, power: 0, fx: { supply: 4, fuel: { item: 'krona-battery', perDays: 15 }, note: 'питание 4; расход 1 батарея в 15 дней' } },
      { cost: { credits: 1000, items: [{ id: 'spare-cell', n: 4 }, { id: 'rare-parts', n: 2 }], days: 3 }, power: 0, fx: { supply: 6, fuel: { item: 'spare-cell', perDays: 25 }, needsFlag: 'lis-online', note: 'питание 6; расход 1 запасная ячейка в 25 дней; лампы «Лиса» работают (нужен флаг lis-online)' } },
    ] },
  defense: { name: 'Оборона', glyph: '⛨', needs: [], desc: 'Баррикады и турели «Лиса»: бой защиты с бонусом, потери при набеге меньше.',
    levels: [
      { cost: { credits: 200, items: [{ id: 'servo-parts', n: 2 }, { id: 'repair-kit', n: 1 }], days: 1 }, power: 0, fx: { defense: 2, note: 'оборона 2: в бою обороны союзники +1 КБ первые 2 раунда' } },
      { cost: { credits: 450, items: [{ id: 'servo-parts', n: 4 }, { id: 'krona-battery', n: 1 }], days: 2 }, power: 1, fx: { defense: 4, turrets: 1, note: 'оборона 4; 1 турель «Лиса» в бою: 1d6+2 в 1-й раунд' } },
      { cost: { credits: 900, items: [{ id: 'rare-parts', n: 2 }, { id: 'proxy-can', n: 1 }], days: 3 }, power: 2, fx: { defense: 6, turrets: 2, needsFlag: 'lis-online', note: 'оборона 6; 2 турели; Лис руководит огнём (нужен ИИ «Лис»)' } },
    ] },
};

// Кастомизация (косметика и мелочи): выбор игрока, один раз за пункт, цена в кредитах
export const BASE_CUSTOM = [
  { id: 'poster-cringe', name: 'Плакат «Кринж — сила»', cost: 30, fx: { mrl: 'партия +1 МРЛ в начале боя на базе (бой обороны)' } },
  { id: 'poster-ai', name: 'Плакат Партии', cost: 30, fx: { rep: { aiParty: 1 }, everyDays: 14, note: 'раз в 14 дней: +1 репутация АИ при визите' } },
  { id: 'garden', name: 'Грядки Галины', cost: 80, fx: { food: 'раз в 5 дней +1 рацион в схрон', item: 'ration', everyDays: 5 } },
  { id: 'vinyl', name: 'Патефон и пластинки', cost: 60, fx: { restLoyalty: 1 } },
  { id: 'trophy-wall', name: 'Стена трофеев', cost: 100, fx: { note: 'показывает убитых боссов; +1 к Запугиванию на базе', check: 'intimidation', bonus: 1 } },
  { id: 'lis-voice', name: 'Голос «Лиса»', cost: 0, needsFlag: 'lis-online', fx: { choices: ['Бодрый диктор', 'Усталый сержант', 'Заботливая бабушка'], note: 'озвучка фраз базы' } },
];

// События нападения на базу. Проверка раз в 3 дня отсутствия героя на базе + триггеры.
export const BASE_ATTACKS = {
  checkEveryDays: 3, graceDays: 10, // первые 10 дней после открытия — тихо
  baseChance: 0.1,                  // на проверку, до модификаторов
  mods: { wantedHeat3: 0.15, wantedHeat4: 0.3, exodusMark: 0.05 /* за метку исхода */, radioWarning: 0, defensePer: -0.04, lisOnline: -0.05 },
  // Таблица событий; веса — относительные. Тип: что нападает, исход зависит от обороны: победа/частично/потеря
  events: [
    { id: 'scav-raid', w: 4, name: 'Налёт мусорщиков', faction: 'scavengers', encounter: 'v4-scv-patrol', text: 'Мусорщики унюхали дверь, которая не должна пахнуть.' },
    { id: 'cult-probe', w: 2, name: 'Культисты ищут Лиса', faction: 'cult', encounter: 'v4-cult-patrol', text: 'У шлюза трое в чёрном: «нам только поговорить с машиной».' },
    { id: 'crg-vibe', w: 2, name: 'Кринж-разведка', faction: 'cringegons', encounter: 'v4-crg-patrol', text: 'Над люком гудит кринж-маяк и мерзко подпевает.' },
    { id: 'hunters', w: 3, name: 'Охотники за головами', faction: 'wanted', encounter: 'by-wanted', text: 'За вами пришли с награды. Нашли, потому что вы сами оставили адрес.', onlyIf: 'wanted>=3' },
    { id: 'mech-plague', w: 1, name: 'Ржавчина в вентиляции', faction: 'mechanids', encounter: 'v4-mech-patrol', text: 'Из воздуховода сыплется красная пыль. Металл скрипит.' },
    { id: 'wild-beasts', w: 2, name: 'Звери под люком', faction: 'mutantsBeast', encounter: 'v4-mutz-patrol', text: 'Кто-то выкопал ход с нижнего яруса. Кто-то голодный.' },
  ],
  // Исход набега (если игрок не пришёл защищать, бросок обороны: d20 + defense против СЛ 10 + ур. региона)
  autoResolve: { dcBase: 10, win: { loss: 'нет' }, part: { loss: 'теряется 1 случайный модуль уровнем −1 (ремонт 50% цены)' }, fail: { loss: 'потеря: до 25% кредитов базы-схрона (кроме сейфа), модуль −1 уровень, Галина обижена' } },
  defend: { text: 'Если игрок на базе или приходит в течение 2 дней — бой обороны на карте бункера (map hatch-1) с бонусами defense и турелями; победа даёт XP как за бой и +10 лояльности напарникам в комнатах.', win: { rep: 1, xp: 'battle' }, lose: 'как fail авторазбора, плюс −5 лояльности' },
  // Числа движка (программист): окно защиты, порог «частично», потери, награды боя обороны
  defendDays: 2, partMargin: 5, lossCredits: 0.25, winRep: { neutralVillages: 1 }, winLoyalty: 10, loseLoyalty: -5,
  turretAlly: 'lis-5-turret', defenseMap: 'hatch-1',
  restNoMedbay: 0.5, // отдых на базе без медотсека — как привал (доля ЗДР/МРЛ)
  lisReaction: ['«Внимание, гражданин. Периметр нарушен».', '«Тревога. Предлагаю обороняться, а не обсуждать»', '«Я записал лица. Кого-то из них я видел. Они мне не понравились»'],
};

export const BASE_TEXT = {
  open: 'Бункер Лиса теперь ваш. Лампы мигают, из динамика кряхтит «Лис»: «Добро пожаловать, гражданин».',
  powerLack: 'Не хватает питания: поставьте или улучшите генератор.',
  upgradeDone: '{module} теперь уровня {n}.',
  attackWarn: 'По рации: к базе идёт группа ({name}). Сутки.',
  attackLost: 'Налёт: {module} разгромлен (−1 уровень).',
};
