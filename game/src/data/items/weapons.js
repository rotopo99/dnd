// Оружие v3. Спека — docs/specs/items.md. Канон — docs/canon/rules/core-rules.md (правила 2, 7, 8).
// Боевые эффекты — только операции и статусы из docs/specs/core-rules.md.
// Поля сверх схемы core-rules (нужна поддержка движка) перечислены в спеке, раздел «Нужно от движка», и помечены `needs`.
//
// Поля оружия:
//   id, name, cat: 'weapon', wtype (см. WEAPON_TYPES), group: 'melee' | 'ranged' | 'special'
//   dice, dmgType, stat, range (клетки; 1 = ближний бой), hit (точность самого оружия)
//   rof — скорострельность (выстрелов в очереди), recoil — отдача (+к СЛ каждого следующего выстрела). rof 1 — без очереди.
//   hands: 1 | 2, weight: 1 лёгкое · 2 обычное · 3 громоздкое
//   noise: 0 бесшумное · 1 тихое · 2 обычное · 3 громкое
//   req: { str?, dex?, int?, cha? } — минимальные значения характеристик; ниже — помеха на атаку
//   props: { ap?, reach?, thrown?, arc?, area?, enr?, overheat?, vs?, extra?, charges?, stigma? }
//   onHit / onCrit — операции при попадании / крите (статусы, push)
//   grants — способности, которые даёт оружие, пока экипировано (схема способности core-rules)
//   slots — слоты модов (см. mods.js)
//   tier — 1..5, уровень мира, где встречается; price — базовая цена в кредах
//   factions — у кого продаётся и с кого падает; unique — реликт (один на мир)

const ability = (o) => ({
  level: 1, path: null, cost: 0, action: 'action', trigger: null,
  range: 1, target: 'enemy', area: null, roll: 'attack', save: null, onSave: 'none',
  usesPerBattle: null, effects: [], desc: '', canon: null,
  ...o,
});

// Типы оружия канона (core-rules.md, правило 2). Владение — по типу, 4 ступени.
// Ключи = `type` движка (game/src/rules/equipment.js WEAPON_TYPES). В данных ниже поле `wtype` — то же, в нашей записи;
// построитель w() переводит его в `type` через TYPE_KEY.
const TYPE_KEY = { saber: 'sabre', twohanded: 'twoHanded', assault: 'auto', throwing: 'throw' };
export const WEAPON_TYPES = {
  // ближний бой
  sabre: { name: 'Сабли', group: 'melee' },
  polearm: { name: 'Древковое', group: 'melee' },
  fist: { name: 'Кулачное', group: 'melee' },
  knife: { name: 'Ножи', group: 'melee' },
  sword: { name: 'Мечи', group: 'melee' },
  axe: { name: 'Топоры', group: 'melee' },
  hammer: { name: 'Молоты', group: 'melee' },
  katana: { name: 'Катаны', group: 'melee' },
  bastard: { name: 'Полуторное', group: 'melee' },
  twoHanded: { name: 'Двуручное', group: 'melee' },
  // дальний бой
  pistol: { name: 'Пистолеты', group: 'ranged' },
  smg: { name: 'ПП', group: 'ranged' },
  rifle: { name: 'Винтовки', group: 'ranged' },
  auto: { name: 'Автоматы', group: 'ranged' },
  mg: { name: 'Пулемёты', group: 'ranged' },
  launcher: { name: 'Гранатомёты', group: 'ranged' },
  crossbow: { name: 'Арбалеты', group: 'ranged' },
  bow: { name: 'Луки', group: 'ranged' },
  throw: { name: 'Метание', group: 'ranged' },
  bolter: { name: 'Болтерное', group: 'ranged' },
  // особое (канон: «плазменное, лазерное, мельта, энерго и т. п.»; остальное — вне канона, не противоречит)
  plasma: { name: 'Плазменное', group: 'special' },
  laser: { name: 'Лазерное', group: 'special' },
  melta: { name: 'Мельта', group: 'special' },
  energy: { name: 'Энерго', group: 'special' },
  proxy: { name: 'Прокси-оружие', group: 'special' },
  cyberblade: { name: 'Кибер-клинки', group: 'special' },
  cringe: { name: 'Кринж-инструменты', group: 'special' },
};

// Стартовое владение классов (ступени канона: 1 нет навыка — помеха, 2 умеет, 3 владеет, 4 мастерство).
// t3 — ступень 3 на 1-м уровне (тип стартового оружия + профильные), t2 — ступень 2. Всё остальное — ступень 1.
// Предложение дизайнера; утверждает и кодирует программист движка (game/src/rules/*).
export const CLASS_PROFICIENCY = {
  zabivnoy: { t3: ['hammer', 'twohanded', 'rifle'], t2: ['saber', 'polearm', 'fist', 'knife', 'sword', 'axe', 'bastard', 'katana', 'pistol', 'smg', 'assault', 'mg', 'launcher'] },
  technomant: { t3: ['pistol', 'energy'], t2: ['knife', 'smg', 'laser', 'plasma', 'proxy', 'throwing'] },
  mutant: { t3: ['sword', 'axe', 'fist'], t2: ['hammer', 'twohanded', 'polearm', 'knife', 'throwing', 'pistol'] },
  itishnik: { t3: ['pistol', 'smg'], t2: ['knife', 'laser', 'energy', 'launcher', 'throwing', 'assault'] },
  ranger: { t3: ['rifle', 'bow'], t2: ['crossbow', 'knife', 'saber', 'axe', 'pistol', 'assault', 'throwing'] },
  arbiter: { t3: ['sword', 'bastard'], t2: ['hammer', 'polearm', 'twohanded', 'pistol', 'bolter', 'energy'] },
  ugolovnik: { t3: ['knife', 'pistol'], t2: ['saber', 'fist', 'smg', 'throwing', 'crossbow'] },
  ecolog: { t3: ['saber', 'bow'], t2: ['knife', 'polearm', 'throwing', 'crossbow'] },
  reper: { t3: ['cringe'], t2: ['fist', 'knife', 'pistol', 'throwing'] },
  slavotech: { t3: ['hammer', 'proxy'], t2: ['polearm', 'twohanded', 'pistol', 'crossbow', 'energy'] },
  cybertech: { t3: ['knife', 'cyberblade'], t2: ['saber', 'sword', 'pistol', 'energy'] },
};

const w = (o) => ({
  cat: 'weapon', hit: 0, rof: 1, recoil: 0, hands: 1, weight: 1, noise: 1,
  req: {}, props: {}, onHit: [], onCrit: [], grants: [], slots: [], tier: 1, price: 0,
  factions: [], unique: false, quality: 'working', desc: '', canon: 'rules/core-rules.md',
  group: null,
  ...o,
});

const MELEE_SLOTS = ['edge', 'grip'];
const GUN_SLOTS = ['optic', 'muzzle', 'mag'];
const ENERGY_SLOTS = ['optic', 'core'];

const LIST = [
  // ================================================================ Ближний бой
  // --- Сабли
  w({ id: 'boarding-saber', name: 'Абордажная сабля', wtype: 'saber', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1,
    slots: MELEE_SLOTS, tier: 1, price: 60, factions: ['pirates'], desc: 'Пиратская классика: лёгкая, злая, пахнет солью.' }),
  w({ id: 'spring-shashka', name: 'Шашка из рессоры', wtype: 'saber', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1,
    onCrit: [{ op: 'status', id: 'bleed', turns: 2 }], slots: MELEE_SLOTS, tier: 2, price: 90, factions: ['neutralVillages', 'renegades'],
    desc: 'Выкована из рессоры грузовика. Крит — кровотечение на 2 хода.' }),
  w({ id: 'sickle', name: 'Серп', wtype: 'saber', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, noise: 0,
    slots: MELEE_SLOTS, tier: 1, price: 15, factions: ['agrozone', 'mutantsPlant', 'neutralVillages'], desc: 'Стартовое оружие Эколога. Жнёт и колосья, и наглецов.' }),

  // --- Древковое
  w({ id: 'pitchfork', name: 'Вилы', wtype: 'polearm', dice: '1d8', dmgType: 'pierce', stat: 'str', range: 1, hands: 2, weight: 2,
    props: { reach: true }, tier: 1, price: 15, factions: ['agrozone', 'renegades', 'neutralVillages'],
    desc: 'Оружие восстания Агрозоны. Достаёт через клетку.', needs: 'reach' }),
  w({ id: 'boat-hook', name: 'Багор', wtype: 'polearm', dice: '1d8', dmgType: 'pierce', stat: 'str', range: 1, hands: 2, weight: 2,
    props: { reach: true }, onCrit: [{ op: 'status', id: 'prone', turns: 1 }], tier: 1, price: 30, factions: ['pirates'],
    desc: 'Цепляет и роняет: крит — цель лежит.', needs: 'reach' }),
  w({ id: 'rebar-spear', name: 'Копьё из арматуры', wtype: 'polearm', dice: '1d8', dmgType: 'pierce', stat: 'str', range: 1, hands: 2, weight: 2,
    props: { reach: true, thrown: 4 }, tier: 1, price: 35, factions: ['renegades', 'scavengers'],
    desc: 'Как у Куксиуса на знамёнах, только хуже. Можно метнуть на 4 клетки.', needs: 'reach, thrown' }),
  w({ id: 'sign-halberd', name: 'Алебарда из дорожного знака', wtype: 'polearm', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, hands: 2, weight: 3,
    props: { reach: true }, req: { str: 13 }, slots: MELEE_SLOTS, tier: 2, price: 80, factions: ['scavengers', 'tinBrotherhood'],
    desc: 'Знак «Уступи дорогу» на трубе. Враги уступают.', needs: 'reach' }),

  // --- Кулачное
  w({ id: 'brass-knuckles', name: 'Кастет', wtype: 'fist', dice: '1d4', dmgType: 'blunt', stat: 'str', range: 1, noise: 0,
    tier: 1, price: 10, factions: ['scavengers', 'pirates', 'neutralVillages'], desc: 'Не отнимешь — он на пальцах.' }),
  w({ id: 'shock-glove', name: 'Шоковая перчатка', wtype: 'fist', dice: '1d6', dmgType: 'electric', stat: 'str', range: 1,
    onCrit: [{ op: 'status', id: 'stun', turns: 1 }], slots: ['core'], tier: 2, price: 140, factions: ['aiParty', 'agrozone'],
    desc: 'Перчатка надзирателя Агрозоны. Крит — оглушение.' }),
  w({ id: 'hydro-fist', name: 'Гидрокулак', wtype: 'fist', dice: '1d10', dmgType: 'blunt', stat: 'str', range: 1, weight: 3, noise: 2,
    req: { str: 14 }, props: { ap: 1 }, tier: 3, price: 220, factions: ['mechanids', 'scavengers'],
    desc: 'Снят с меха свалок. Бьёт сквозь броню (бронебойность 1).', needs: 'ap' }),

  // --- Ножи
  w({ id: 'finka', name: 'Финка', wtype: 'knife', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 1, noise: 0,
    props: { thrown: 4 }, slots: MELEE_SLOTS, tier: 1, price: 25, factions: ['pirates', 'scavengers', 'neutralVillages'],
    desc: 'Стартовое оружие Уголовника. Наборная ручка, ни одной честной зарубки.', needs: 'thrown' }),
  w({ id: 'shiv', name: 'Заточка', wtype: 'knife', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 1, noise: 0, quality: 'junk',
    onCrit: [{ op: 'status', id: 'bleed', turns: 2 }], tier: 1, price: 5, factions: ['scavengers'], desc: 'Ложка, у которой была тяжёлая жизнь.' }),
  w({ id: 'bayonet', name: 'Штык-нож', wtype: 'knife', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 1, noise: 0,
    slots: MELEE_SLOTS, tier: 1, price: 30, factions: ['warprom', 'renegades'], desc: 'Уставной. Пилка на обухе — для консервов.' }),
  w({ id: 'ritual-blade', name: 'Ритуальный клинок', wtype: 'knife', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1, noise: 0,
    slots: MELEE_SLOTS, tier: 1, price: 40, factions: ['cult'], desc: 'Стартовое оружие КиберТеха. На лезвии — QR-код молитвы.' }),

  // --- Мечи
  w({ id: 'machete', name: 'Мачете', wtype: 'sword', dice: '1d6', dmgType: 'slash', stat: 'dex', range: 1,
    slots: MELEE_SLOTS, tier: 1, price: 20, factions: ['mutantsBeast', 'neutralVillages', 'scavengers'], desc: 'Для зарослей мутантов-Р. И для мутантов-Р.' }),
  w({ id: 'heavy-cleaver', name: 'Тяжёлый тесак', wtype: 'sword', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, weight: 2,
    req: { str: 13 }, slots: MELEE_SLOTS, tier: 1, price: 50, factions: ['mutantsBeast', 'scavengers'], desc: 'Стартовое оружие Мутанта. Мясницкий, честный.' }),
  w({ id: 'power-sword', name: 'Силовой меч', wtype: 'sword', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, weight: 2,
    slots: ['edge', 'core'], tier: 2, price: 300, factions: ['warprom'], desc: 'Стартовое оружие Арбитра. Гудит, когда рядом неправда.' }),

  // --- Топоры
  w({ id: 'hatchet', name: 'Топорик', wtype: 'axe', dice: '1d6', dmgType: 'slash', stat: 'str', range: 1,
    props: { thrown: 4 }, slots: MELEE_SLOTS, tier: 1, price: 15, factions: ['neutralVillages', 'mutantsBeast'], desc: 'Колет дрова, летит в лоб.', needs: 'thrown' }),
  w({ id: 'fire-axe', name: 'Пожарный топор', wtype: 'axe', dice: '1d8', dmgType: 'slash', stat: 'str', range: 1, weight: 2,
    props: { ap: 1 }, slots: MELEE_SLOTS, tier: 2, price: 45, factions: ['neutralVillages', 'scavengers'],
    desc: 'Красный, со щита «При пожаре». Рубит двери и пластины (бронебойность 1).', needs: 'ap' }),

  // --- Молоты
  w({ id: 'armatura', name: 'Арматура', wtype: 'hammer', dice: '1d8', dmgType: 'blunt', stat: 'str', range: 1, weight: 2,
    tier: 1, price: 5, factions: ['scavengers', 'renegades', 'neutralVillages'], desc: 'Стартовое оружие Забивного. Аргумент последней инстанции.' }),
  w({ id: 'blessed-wrench', name: 'Освящённый гаечный ключ', wtype: 'hammer', dice: '1d10', dmgType: 'blunt', stat: 'str', range: 1, weight: 2,
    slots: MELEE_SLOTS, tier: 1, price: 60, factions: ['tekhonki'], desc: 'Стартовое оружие СлавоТеха. Ключ на 32, молитва на 14.' }),
  w({ id: 'shock-baton', name: 'Шоковая дубинка', wtype: 'hammer', dice: '1d6', dmgType: 'blunt', stat: 'str', range: 1,
    grants: [ability({ id: 'item-shock-baton', name: 'Разряд дубинки', usesPerBattle: 1, range: 'weapon',
      effects: [{ op: 'weapon', extraDice: '1d4', extraType: 'electric' }], desc: 'Удар с разрядом: +1d4 электро.' })],
    slots: ['core'], tier: 1, price: 70, factions: ['cult', 'aiParty', 'agrozone'], desc: 'Любимая игрушка культистов и надзирателей.' }),
  w({ id: 'tin-warhammer', name: 'Боевой молот Братства', wtype: 'hammer', dice: '1d8', dmgType: 'blunt', stat: 'str', range: 1, weight: 2, noise: 2,
    onCrit: [{ op: 'status', id: 'stun', turns: 1 }], slots: MELEE_SLOTS, tier: 3, price: 160, factions: ['tinBrotherhood'],
    desc: 'Школа Секиро: «три удара, четвёртый — подпись». Крит — оглушение.' }),

  // --- Катаны
  w({ id: 'rail-katana', name: 'Катана из рельса', wtype: 'katana', dice: '1d8', dmgType: 'slash', stat: 'str', range: 1, weight: 2, quality: 'junk',
    tier: 1, price: 40, factions: ['scavengers', 'tinBrotherhood'], desc: 'Подделка под катаны Братства. Братство обижается.' }),
  w({ id: 'tin-katana', name: 'Катана Жестяного братства', wtype: 'katana', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1,
    onCrit: [{ op: 'status', id: 'bleed', turns: 2 }], slots: MELEE_SLOTS, tier: 3, price: 240, factions: ['tinBrotherhood'],
    desc: 'Аналоговая сталь, ни одного чипа. «Электроника врёт, железо — никогда».' }),
  w({ id: 'monofil-katana', name: 'Мономолекулярная катана', wtype: 'katana', dice: '1d8', dmgType: 'slash', stat: 'dex', range: 1,
    props: { ap: 2 }, slots: MELEE_SLOTS, tier: 4, price: 650, factions: ['aiParty', 'pirates'],
    desc: 'Довоенная разработка Партии, у пиратов — краденая. Режет броню как масло (бронебойность 2).', needs: 'ap' }),

  // --- Полуторное
  w({ id: 'spring-bastard', name: 'Полуторный меч из листовой рессоры', wtype: 'bastard', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, weight: 2,
    slots: MELEE_SLOTS, tier: 2, price: 120, factions: ['tinBrotherhood', 'renegades'], desc: 'Хват на полторы руки, удар на две.' }),
  w({ id: 'watch-bastard', name: 'Полуторник «Вахта»', wtype: 'bastard', dice: '1d10', dmgType: 'slash', stat: 'str', range: 1, weight: 2, hit: 1,
    slots: MELEE_SLOTS, tier: 3, price: 220, factions: ['warprom'], desc: 'Наградной клинок караула Военпрома. «По стандарту».' }),

  // --- Двуручное
  w({ id: 'sledgehammer', name: 'Кувалда', wtype: 'twohanded', dice: '2d6', dmgType: 'blunt', stat: 'str', range: 1, hands: 2, weight: 3, noise: 2,
    req: { str: 13 }, onCrit: [{ op: 'status', id: 'prone', turns: 1 }], tier: 1, price: 50, factions: ['scavengers', 'neutralVillages', 'renegades'],
    desc: 'Крит — цель на земле.' }),
  w({ id: 'lumber-greataxe', name: 'Секира лесоруба', wtype: 'twohanded', dice: '1d12', dmgType: 'slash', stat: 'str', range: 1, hands: 2, weight: 3,
    req: { str: 13 }, slots: MELEE_SLOTS, tier: 2, price: 90, factions: ['mutantsBeast', 'neutralVillages'], desc: 'Рубили Лесянку. Лесянка отомстила.' }),
  w({ id: 'sleeper-blade', name: 'Шпалорез', wtype: 'twohanded', dice: '2d6', dmgType: 'slash', stat: 'str', range: 1, hands: 2, weight: 3, noise: 2,
    req: { str: 15 }, props: { ap: 1 }, slots: MELEE_SLOTS, tier: 4, price: 260, factions: ['tinBrotherhood', 'scavengers'],
    desc: 'Слишком большой, чтобы быть мечом. Кусок рельса с заточкой. Бронебойность 1.', needs: 'ap' }),
  w({ id: 'chainsaw-glaive', name: 'Бензопила-глефа', wtype: 'twohanded', dice: '1d12', dmgType: 'slash', stat: 'str', range: 1, hands: 2, weight: 3, noise: 3,
    req: { str: 14 }, props: { reach: true }, onHit: [{ op: 'status', id: 'bleed', turns: 1 }], tier: 4, price: 340, factions: ['scavengers', 'mechanids'],
    desc: 'Пила «Дружба» на древке. Всё, что задело, кровит. Очень громкая.', needs: 'reach, onHit' }),

  // ================================================================ Дальний бой
  // --- Пистолеты
  w({ id: 'samopal-pistol', name: 'Самопальный пистолет', wtype: 'pistol', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 8, noise: 2,
    slots: ['muzzle'], tier: 1, price: 20, factions: ['scavengers', 'neutralVillages'], desc: 'Стартовое оружие Техноманта. Стреляет. Обычно вперёд.' }),
  w({ id: 'makarych', name: 'Пистолет «Макарыч»', wtype: 'pistol', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 10, noise: 2,
    slots: GUN_SLOTS, tier: 1, price: 70, factions: ['warprom', 'renegades', 'pirates'], desc: 'Довоенный, надёжный, скучный. Как бухгалтер.' }),
  w({ id: 'nagan-revolver', name: 'Револьвер «Наган-кустарь»', wtype: 'pistol', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 10, noise: 3,
    slots: ['optic'], tier: 2, price: 110, factions: ['neutralVillages', 'tinBrotherhood'], desc: 'Аналоговый, без единой микросхемы. Братство одобряет.' }),
  w({ id: 'sawed-off', name: 'Обрез', wtype: 'pistol', dice: '2d4', dmgType: 'pierce', stat: 'dex', range: 5, noise: 3, rof: 2, recoil: 3,
    tier: 1, price: 50, factions: ['renegades', 'scavengers', 'agrozone'], desc: 'Два ствола — очередь из двух выстрелов с отдачей 3.', needs: 'burst' }),
  w({ id: 'nailgun', name: 'Гвоздомёт', wtype: 'pistol', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 8, noise: 1,
    slots: ['mag'], tier: 1, price: 45, factions: ['scavengers', 'mechanids', 'tekhonki'], desc: 'Стартовое оружие Айтишника. Строительный, тихий, обидный.' }),
  w({ id: 'bolt-pistol', name: 'Болт-пистолет', wtype: 'bolter', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 8, noise: 3, weight: 2,
    req: { str: 12 }, props: { extra: { dice: '1d4', dmgType: 'fire' } }, tier: 4, price: 550, factions: ['warprom'],
    desc: 'Реактивный болт взрывается в цели: +1d4 огня.', needs: 'extra' }),

  // --- ПП
  w({ id: 'pipe-smg', name: 'ПП из водопроводных труб', wtype: 'smg', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 6, noise: 2, quality: 'junk',
    rof: 3, recoil: 3, slots: ['mag'], tier: 1, price: 60, factions: ['scavengers'], desc: 'Очередь 3, отдача 3. Сантехник одобрил бы.', needs: 'burst' }),
  w({ id: 'kedrach', name: 'ПП «Кедрач»', wtype: 'smg', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 8, noise: 2,
    rof: 3, recoil: 2, slots: GUN_SLOTS, tier: 2, price: 180, factions: ['warprom', 'pirates', 'renegades'], desc: 'Компактный, злой. Очередь 3, отдача 2.', needs: 'burst' }),
  w({ id: 'tishina-smg', name: 'ПП «Тишина»', wtype: 'smg', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 8, noise: 0,
    rof: 2, recoil: 1, slots: ['optic', 'mag'], tier: 3, price: 340, factions: ['renegades', 'pirates'],
    desc: 'Интегрированный глушитель. Любимец диверсантов Хатаб-Сити.', needs: 'burst, noise' }),

  // --- Винтовки
  w({ id: 'hunting-carbine', name: 'Охотничий карабин', wtype: 'rifle', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 16, hands: 2, weight: 2, noise: 2,
    slots: GUN_SLOTS, tier: 1, price: 90, factions: ['neutralVillages', 'mutantsBeast'], desc: 'Стартовое оружие Рейнджера.' }),
  w({ id: 'pump-shotgun', name: 'Помповое ружьё', wtype: 'rifle', dice: '2d4', dmgType: 'pierce', stat: 'dex', range: 6, hands: 2, weight: 2, noise: 3,
    onHit: [{ op: 'push', tiles: 1 }], slots: ['muzzle', 'mag'], tier: 2, price: 120, factions: ['neutralVillages', 'pirates', 'agrozone'],
    desc: 'Попадание отталкивает на 1 клетку.', needs: 'onHit' }),
  w({ id: 'mosin', name: 'Трёхлинейка', wtype: 'rifle', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 18, hands: 2, weight: 2, noise: 3,
    props: { ap: 1 }, slots: ['optic', 'muzzle'], tier: 2, price: 150, factions: ['tinBrotherhood', 'renegades'],
    desc: 'Сто лет, ни одного сбоя. Бронебойность 1.', needs: 'ap' }),
  w({ id: 'sniper-rifle', name: 'Снайперская винтовка', wtype: 'rifle', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 20, hands: 2, weight: 2, noise: 3,
    grants: [ability({ id: 'item-aimed-shot', name: 'Прицельный выстрел', range: 'weapon', usesPerBattle: 2,
      effects: [{ op: 'weapon', hit: 2 }], desc: 'Выстрел с +2 к атаке.' })],
    slots: GUN_SLOTS, tier: 3, price: 350, factions: ['warprom', 'renegades'], desc: 'Путь Снайпера Пустошей начинается здесь.' }),
  w({ id: 'shock-rifle', name: 'Шоковая винтовка', wtype: 'rifle', dice: '1d8', dmgType: 'electric', stat: 'dex', range: 10, hands: 2, weight: 2, noise: 1,
    slots: ['optic', 'core'], tier: 2, price: 260, factions: ['aiParty', 'agrozone'], desc: 'Табельное оружие Чистильщиков.' }),

  // --- Автоматы
  w({ id: 'rusty-ak', name: 'Автомат «Ржавый Калаш»', wtype: 'assault', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 12, hands: 2, weight: 2, noise: 3,
    rof: 3, recoil: 3, slots: GUN_SLOTS, tier: 2, price: 160, factions: ['renegades', 'scavengers', 'pirates', 'neutralVillages'],
    desc: 'Закопан в 2004-м, выкопан в 2014-м, стреляет до сих пор. Очередь 3, отдача 3.', needs: 'burst' }),
  w({ id: 'av15', name: 'Автомат Военпрома АВ-15', wtype: 'assault', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 13, hands: 2, weight: 2, noise: 3,
    rof: 3, recoil: 2, slots: GUN_SLOTS, tier: 3, price: 300, factions: ['warprom'], desc: 'Серийный, по стандарту. Очередь 3, отдача 2.', needs: 'burst' }),
  w({ id: 'ukaz-rifle', name: 'Штурмовая винтовка «Указ»', wtype: 'assault', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 13, hands: 2, weight: 2, noise: 2, hit: 1,
    rof: 2, recoil: 2, slots: GUN_SLOTS, tier: 4, price: 450, factions: ['aiParty'], desc: 'Буллпап Партии. На прикладе выбит указ № 1.', needs: 'burst' }),

  // --- Пулемёты
  w({ id: 'conveyor-mg', name: 'Пулемёт из ленты конвейера', wtype: 'mg', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 10, hands: 2, weight: 3, noise: 3,
    rof: 4, recoil: 3, req: { str: 14 }, slots: ['mag'], tier: 3, price: 260, factions: ['scavengers', 'mechanids'],
    desc: 'Очередь 4, отдача 3. Тяжёлый: при СИЛ < 14 — помеха.', needs: 'burst' }),
  w({ id: 'kosilshik', name: 'Пулемёт «Косильщик»', wtype: 'mg', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 14, hands: 2, weight: 3, noise: 3,
    rof: 5, recoil: 2, req: { str: 15 }, slots: GUN_SLOTS, tier: 5, price: 650, factions: ['warprom'],
    desc: 'Тяжёлое оружие Военпрома. Очередь 5, отдача 2.', needs: 'burst' }),

  // --- Гранатомёты (с траекторией)
  w({ id: 'potato-cannon', name: 'Картофелемёт', wtype: 'launcher', dice: '1d8', dmgType: 'blunt', stat: 'dex', range: 8, hands: 2, weight: 2, noise: 2,
    props: { arc: true }, onCrit: [{ op: 'status', id: 'prone', turns: 1 }], tier: 1, price: 40, factions: ['agrozone', 'neutralVillages'],
    desc: 'Навесом через укрытие. Боеприпас — урожай Агрозоны. Кринжово, но больно.', needs: 'arc' }),
  w({ id: 'rpg-tube', name: 'Труба-гранатомёт', wtype: 'launcher', dice: '2d6', dmgType: 'fire', stat: 'dex', range: 12, hands: 2, weight: 3, noise: 3,
    props: { arc: true, area: { shape: 'radius', size: 1 }, charges: 2 }, tier: 3, price: 500, factions: ['warprom', 'renegades'],
    desc: '2 выстрела за бой. Взрыв радиусом 1 (спас ЛВК — половина).', needs: 'arc, area, charges' }),
  w({ id: 'drum-launcher', name: 'Барабанный гранатомёт', wtype: 'launcher', dice: '2d4', dmgType: 'fire', stat: 'dex', range: 10, hands: 2, weight: 3, noise: 3,
    props: { arc: true, area: { shape: 'radius', size: 1 }, charges: 4 }, tier: 4, price: 700, factions: ['warprom', 'pirates'],
    desc: '4 выстрела за бой, радиус 1.', needs: 'arc, area, charges' }),

  // --- Арбалеты
  w({ id: 'spring-crossbow', name: 'Арбалет на рессоре', wtype: 'crossbow', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 12, hands: 2, weight: 2, noise: 0,
    slots: ['optic'], tier: 2, price: 90, factions: ['tinBrotherhood', 'neutralVillages'], desc: 'Бесшумный. Без электроники — Братство довольно.' }),
  w({ id: 'rebar-crossbow', name: 'Арматурный самострел', wtype: 'crossbow', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 10, hands: 2, weight: 2, noise: 0,
    props: { ap: 1 }, tier: 1, price: 70, factions: ['scavengers', 'renegades'], desc: 'Болт — обрезок арматуры. Бронебойность 1.', needs: 'ap' }),

  // --- Луки
  w({ id: 'ski-bow', name: 'Блочный лук из лыж', wtype: 'bow', dice: '1d8', dmgType: 'pierce', stat: 'dex', range: 14, hands: 2, weight: 1, noise: 0,
    tier: 1, price: 80, factions: ['mutantsBeast', 'neutralVillages'], desc: 'Блоки — от велосипеда, тетива — трос.' }),
  w({ id: 'thorn-bow', name: 'Живой лук-шиполист', wtype: 'bow', dice: '1d6', dmgType: 'pierce', stat: 'dex', range: 12, hands: 2, weight: 1, noise: 0,
    onHit: [{ op: 'status', id: 'poison', turns: 1 }], tier: 3, price: 180, factions: ['mutantsPlant'],
    desc: 'Растёт у мутантов-Р. Стрелы-шипы отравляют на 1 ход. Поливать.', needs: 'onHit' }),

  // --- Метание
  w({ id: 'throwing-knives', name: 'Связка метательных ножей', wtype: 'throwing', dice: '1d4', dmgType: 'pierce', stat: 'dex', range: 5, noise: 0,
    tier: 1, price: 25, factions: ['pirates', 'neutralVillages'], desc: 'Цирковая техника. Подобрать после боя.' }),
  w({ id: 'saw-stars', name: 'Звёздочки из пильных дисков', wtype: 'throwing', dice: '1d4', dmgType: 'slash', stat: 'dex', range: 6, noise: 0,
    onCrit: [{ op: 'status', id: 'bleed', turns: 2 }], tier: 2, price: 35, factions: ['tinBrotherhood', 'scavengers'], desc: 'Крит — кровотечение.' }),
  w({ id: 'wire-bolas', name: 'Болас из провода', wtype: 'throwing', dice: '1d4', dmgType: 'blunt', stat: 'dex', range: 5, noise: 0,
    grants: [ability({ id: 'item-bolas', name: 'Опутать', range: 5, roll: 'save', save: 'dex', usesPerBattle: 1,
      effects: [{ op: 'status', id: 'root', turns: 1 }], desc: 'Обездвиживание на 1 ход (спас ЛВК).' })],
    tier: 1, price: 30, factions: ['scavengers', 'mutantsBeast'], desc: 'Медный провод с гайками на концах.' }),

  // --- Болтерное
  w({ id: 'kremlin-bolter', name: 'Болтер «Молот Кремля»', wtype: 'bolter', dice: '1d10', dmgType: 'pierce', stat: 'dex', range: 10, hands: 2, weight: 3, noise: 3,
    rof: 2, recoil: 3, req: { str: 14 }, props: { extra: { dice: '1d4', dmgType: 'fire' } }, slots: ['optic', 'mag'], tier: 5, price: 950, factions: ['warprom'],
    desc: 'Реактивные болты: +1d4 огня с каждого попадания. Очередь 2, отдача 3.', needs: 'burst, extra' }),

  // ================================================================ Особое
  // --- Плазма (перегрев: натуральная 1 — 1d6 огня стрелку)
  w({ id: 'plasma-pistol', name: 'Плазменный пистолет', wtype: 'plasma', group: 'special', dice: '1d10', dmgType: 'energy', stat: 'dex', range: 8, noise: 2,
    props: { enr: 1, overheat: '1d6' }, onCrit: [{ op: 'status', id: 'burn', turns: 2 }], slots: ENERGY_SLOTS, tier: 4, price: 700, factions: ['aiParty'],
    desc: '1 ЭНР за выстрел. Крит — горение. Натуральная 1 — перегрев, 1d6 огня в руку.', needs: 'enr, overheat' }),
  w({ id: 'plasma-rifle', name: 'Плазменная винтовка', wtype: 'plasma', group: 'special', dice: '2d6', dmgType: 'energy', stat: 'dex', range: 12, hands: 2, weight: 2, noise: 2,
    props: { enr: 2, overheat: '2d6' }, onCrit: [{ op: 'status', id: 'burn', turns: 2 }], slots: ENERGY_SLOTS, tier: 5, price: 1200, factions: ['aiParty'],
    desc: '2 ЭНР за выстрел. Перегрев — 2d6 огня стрелку.', needs: 'enr, overheat' }),
  // --- Лазер
  w({ id: 'laser-pistol', name: 'Лазерный пистолет «Луч»', wtype: 'laser', group: 'special', dice: '1d6', dmgType: 'energy', stat: 'dex', range: 12, noise: 0, hit: 1,
    props: { enr: 1 }, slots: ENERGY_SLOTS, tier: 3, price: 320, factions: ['aiParty', 'pirates'], desc: 'Бесшумный, точный (+1). 1 ЭНР за выстрел.', needs: 'enr' }),
  w({ id: 'laser-rifle', name: 'Лазерная винтовка', wtype: 'laser', group: 'special', dice: '1d8', dmgType: 'energy', stat: 'dex', range: 16, hands: 2, weight: 2, noise: 0, hit: 1,
    rof: 2, recoil: 1, props: { enr: 1 }, slots: ENERGY_SLOTS, tier: 4, price: 620, factions: ['aiParty'], desc: 'Очередь 2 с отдачей 1. 1 ЭНР за очередь.', needs: 'enr, burst' }),
  // --- Мельта
  w({ id: 'melta-cutter', name: 'Мельта-резак', wtype: 'melta', group: 'special', dice: '2d8', dmgType: 'fire', stat: 'dex', range: 3, hands: 2, weight: 3, noise: 2,
    req: { str: 12 }, props: { ap: 3, enr: 3 }, tier: 5, price: 1100, factions: ['mechanids', 'warprom'],
    desc: 'Промышленный резак механидов. 3 клетки, бронебойность 3, 3 ЭНР. Против мехов — лучший друг.', needs: 'ap, enr' }),
  // --- Энерго
  w({ id: 'energy-pistol', name: 'Энергопистолет', wtype: 'energy', group: 'special', dice: '1d6', dmgType: 'energy', stat: 'dex', range: 8, noise: 1,
    slots: ENERGY_SLOTS, tier: 2, price: 200, factions: ['pirates', 'aiParty'], desc: 'Краденый у Партии, перепрошит пиратами. Сам подзаряжается.' }),
  w({ id: 'arc-thrower', name: 'Дуговой разрядник', wtype: 'energy', group: 'special', dice: '1d8', dmgType: 'electric', stat: 'int', range: 5, hands: 2, weight: 2, noise: 2,
    props: { enr: 1, area: { shape: 'line', size: 5 } }, tier: 3, price: 420, factions: ['tekhonki', 'mechanids'],
    desc: 'Молния по линии 5 клеток (спас ЛВК — половина). Стреляет ИНТ. 1 ЭНР.', needs: 'enr, area' }),
  // --- Прокси-оружие техоньков (кустарщина; прокси: ×1.5 по механическим, ×0.5 по живым, не критует)
  w({ id: 'proxy-sling', name: 'Прокси-праща', wtype: 'proxy', group: 'special', dice: '1d8', dmgType: 'proxy', stat: 'int', range: 8, noise: 1,
    tier: 1, price: 90, factions: ['tekhonki'], desc: 'Камень, обмотанный проводом с «молитвой». Для машин — смерть, для людей — синяк.' }),
  w({ id: 'proxy-wrench', name: 'Прокси-ключ с катушкой', wtype: 'proxy', group: 'special', dice: '1d10', dmgType: 'proxy', stat: 'str', range: 1, weight: 2,
    slots: ['core'], tier: 2, price: 160, factions: ['tekhonki'], desc: 'Освящённый ключ, но с катушкой. Откручивает роботам души.' }),
  w({ id: 'coil-staff', name: 'Посох-катушка', wtype: 'proxy', group: 'special', dice: '2d6', dmgType: 'proxy', stat: 'int', range: 6, hands: 2, weight: 2, noise: 2,
    props: { enr: 1 }, slots: ['core'], tier: 4, price: 480, factions: ['tekhonki'], desc: 'Жезл ритуальщицы Искры. «Почему взрывается — не спрашивай».', needs: 'enr' }),
  // --- Кибер-клинки Судьи (стигма: братство и техоньки узнают оружие культа)
  w({ id: 'cyber-blade', name: 'Кибер-клинок', wtype: 'cyberblade', group: 'special', dice: '1d6', dmgType: 'cyber', stat: 'dex', range: 1, noise: 0,
    props: { stigma: { tinBrotherhood: -5, tekhonki: -5 } }, slots: ['edge'], tier: 2, price: 280, factions: ['cult'],
    desc: 'Клинок скрилета. Шепчет. Братство и техоньки косятся (−5 к репутации, пока на виду).', needs: 'stigma' }),
  w({ id: 'verdict-scythe', name: 'Коса приговора', wtype: 'cyberblade', group: 'special', dice: '2d6', dmgType: 'cyber', stat: 'str', range: 1, hands: 2, weight: 2, noise: 0,
    props: { reach: true, stigma: { tinBrotherhood: -10, tekhonki: -10 } },
    grants: [ability({ id: 'item-soul-reap', name: 'Жатва души', range: 'weapon', usesPerBattle: 1,
      effects: [{ op: 'drain', dice: '1d8', dmgType: 'cyber', to: 'hp', ratio: 0.5 }], desc: '1d8 кибер, лечит на половину нанесённого.' })],
    tier: 5, price: 900, factions: ['cult'], desc: 'Оружие палачей Судьи.', needs: 'reach, stigma' }),
  // --- Кринж-инструменты (урон по МРЛ)
  w({ id: 'mic-cord', name: 'Микрофон на шнуре', wtype: 'cringe', group: 'special', dice: '1d6', dmgType: 'blunt', stat: 'dex', range: 1,
    tier: 1, price: 30, factions: ['neutralVillages', 'cringegons'], desc: 'Стартовое оружие Рэпера. Раскрутил — и в лоб.' }),
  w({ id: 'spoons', name: 'Ложки-гремелки', wtype: 'cringe', group: 'special', dice: '1d4', dmgType: 'cringe', stat: 'cha', range: 4, noise: 3,
    tier: 1, price: 15, factions: ['neutralVillages', 'cringegons'], desc: 'Народный инструмент. Народ против.' }),
  w({ id: 'megaphone', name: 'Матюгальник', wtype: 'cringe', group: 'special', dice: '1d6', dmgType: 'cringe', stat: 'cha', range: 6, noise: 3,
    grants: [ability({ id: 'item-announcement', name: 'Объявление', range: 0, target: 'tile', area: { shape: 'cone', size: 3 },
      roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'cringe' }], desc: 'Конус 3: 1d6 кринжа (спас ТВД — половина).' })],
    tier: 2, price: 120, factions: ['aiParty', 'cringegons'], desc: '«Граждане! Норма счастья перевыполнена!»' }),
  w({ id: 'battle-bayan', name: 'Боевой баян', wtype: 'cringe', group: 'special', dice: '1d8', dmgType: 'cringe', stat: 'cha', range: 5, hands: 2, weight: 2, noise: 3,
    grants: [ability({ id: 'item-bayan-wave', name: 'Свадебный медляк', range: 0, target: 'tile', area: { shape: 'radius', size: 2 },
      roll: 'save', save: 'wil', onSave: 'half', usesPerBattle: 1,
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'cringe' }, { op: 'status', id: 'cringed', turns: 2 }],
      desc: 'Радиус 2: 1d8 кринжа и кринж-эффект на 2 хода (спас ТВД — половина, без эффекта).' })],
    tier: 3, price: 260, factions: ['cringegons', 'neutralVillages'], desc: 'Меха из кожи, совесть из мехов.' }),
  w({ id: 'boombox', name: 'Бумбокс на плече', wtype: 'cringe', group: 'special', dice: '1d6', dmgType: 'cringe', stat: 'cha', range: 8, hands: 2, weight: 2, noise: 3,
    props: { enr: 1 },
    grants: [ability({ id: 'item-boombox-hype', name: 'Качаем!', action: 'bonus', range: 0, target: 'ally', area: { shape: 'radius', size: 3 },
      roll: 'auto', usesPerBattle: 1, effects: [{ op: 'status', id: 'inspired', turns: 2 }], desc: 'Союзники в радиусе 3: вдохновение.' })],
    tier: 3, price: 300, factions: ['pirates', 'cringegons'], desc: 'Питается от ЭНР и от зависти соседей.', needs: 'enr' }),
  w({ id: 'electro-balalaika', name: 'Электробалалайка', wtype: 'cringe', group: 'special', dice: '1d8', dmgType: 'cringe', stat: 'cha', range: 6, noise: 3,
    onCrit: [{ op: 'status', id: 'cringed', turns: 2 }], slots: ['core'], tier: 4, price: 380, factions: ['tekhonki', 'cringegons'],
    desc: 'Три струны, сто децибел. Крит — кринж-эффект.' }),

  // ================================================================ Реликты (по лору, по одному на мир)
  w({ id: 'kuksius-spear', name: 'Копьё Куксиуса Первого', wtype: 'polearm', dice: '1d10', dmgType: 'pierce', stat: 'str', range: 1, hands: 2, weight: 2, hit: 1,
    quality: 'relic', unique: true, props: { reach: true },
    grants: [ability({ id: 'item-one-flag', name: 'Один флаг', action: 'bonus', range: 0, target: 'ally', area: { shape: 'radius', size: 4 },
      roll: 'auto', usesPerBattle: 1, effects: [{ op: 'buff', stat: 'hit', value: 1, turns: 3 }, { op: 'status', id: 'inspired', turns: 1 }],
      desc: 'Союзники в радиусе 4: +1 к атаке на 3 хода и вдохновение.' })],
    slots: MELEE_SLOTS, tier: 4, price: 0, factions: ['renegades'],
    desc: '«Один флаг. Много народов. Одно копьё». Пропало из Хатаб-Сити. Отступники отдадут за него что угодно.',
    canon: 'lore/faction-stances.md', needs: 'reach' }),
  w({ id: 'judge-gavel', name: 'Молоток Судьи', wtype: 'hammer', dice: '1d8', dmgType: 'cyber', stat: 'str', range: 1,
    quality: 'relic', unique: true, props: { stigma: { tinBrotherhood: -15, tekhonki: -15 } },
    grants: [ability({ id: 'item-gavel-verdict', name: 'Встать, суд идёт', range: 6, roll: 'save', save: 'wil', usesPerBattle: 1,
      effects: [{ op: 'status', id: 'stun', turns: 1 }], desc: 'Оглушение на 1 ход (спас ТВД).' })],
    tier: 5, price: 0, factions: ['cult'], desc: 'Трофей с Кибер-Жреца. Каждый удар — приговор. Каждый приговор — его.', needs: 'stigma' }),
  w({ id: 'great-mech-fist', name: 'Кулак Великого Меха', wtype: 'fist', dice: '2d6', dmgType: 'blunt', stat: 'str', range: 1, weight: 3, noise: 3,
    quality: 'relic', unique: true, req: { str: 16 }, props: { ap: 2 }, onCrit: [{ op: 'push', tiles: 2 }],
    tier: 5, price: 0, factions: [], desc: 'Оторван у Великого Меха. Бронебойность 2, крит — отбрасывает на 2.', needs: 'ap' }),
  w({ id: 'ice-ring-gloves', name: 'Перчатки Ледяного ринга', wtype: 'fist', dice: '1d8', dmgType: 'blunt', stat: 'str', range: 1, noise: 0,
    quality: 'relic', unique: true, onHit: [{ op: 'status', id: 'slow', turns: 1 }],
    tier: 4, price: 0, factions: [], desc: 'Пояс чемпиона забыли, перчатки — нет. Каждое попадание замедляет.', needs: 'onHit' }),
  w({ id: 'sputnik-laser', name: 'Лазер со Спутника', wtype: 'laser', group: 'special', dice: '2d6', dmgType: 'energy', stat: 'dex', range: 20, hands: 2, weight: 3, noise: 0, hit: 1,
    quality: 'relic', unique: true, props: { enr: 2 }, slots: ['optic'],
    tier: 5, price: 0, factions: [], desc: 'Снят с упавшего спутника. Луч видно из Кремля.', needs: 'enr' }),
  w({ id: 'babka-ladle', name: 'Половник Бабки', wtype: 'hammer', dice: '1d6', dmgType: 'blunt', stat: 'str', range: 1,
    quality: 'relic', unique: true,
    grants: [ability({ id: 'item-babka-soup', name: 'Поешь, худой какой', action: 'bonus', range: 1, target: 'ally', roll: 'auto', usesPerBattle: 2,
      effects: [{ op: 'heal', dice: '1d6', bonus: 1, resource: 'hp' }, { op: 'heal', dice: '1d4', resource: 'mrl' }],
      desc: 'Союзник рядом: 1d6+1 ЗДР и 1d4 МРЛ.' })],
    tier: 2, price: 0, factions: [], desc: 'С Дачи Бабки. Бьёт по лбу и кормит — в любом порядке.' }),
  w({ id: 'anvil-katana', name: 'Катана «Наковальня»', wtype: 'katana', dice: '1d10', dmgType: 'slash', stat: 'dex', range: 1, hit: 1,
    quality: 'relic', unique: true, onCrit: [{ op: 'status', id: 'bleed', turns: 3 }], slots: MELEE_SLOTS,
    tier: 5, price: 0, factions: ['tinBrotherhood'], desc: 'Первый клинок Братства, кованный без единого станка. «Под сталью должна быть сталь».' }),
];

export const WEAPONS = Object.fromEntries(LIST.map((it) => [it.id, { ...it, group: it.group || WEAPON_TYPES[it.wtype].group }]));
