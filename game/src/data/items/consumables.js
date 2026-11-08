// Расходники v3. Спека — docs/specs/items.md («Расходники»).
// Канон: медицина и опиаты — extra/specialties.md (Медицина: не опиатные → лёгкие → средние → любые опиаты, «сопротивление ломке»);
// ЭНР «запитывает устройства» — rules/core-rules.md; «Адреналин: +1 доп. действие, −1 на след. ходу» — rules/spellcasting.md;
// «Аптечка из мусора», «Антидот», «Оружейный алхимик» — rules/talents.md.
//
// Поля:
//   id, name, cat: 'consumable', kind: 'medicine' | 'opiate' | 'sedative' | 'stim' | 'energy' | 'grenade' | 'trap' | 'tool' | 'food'
//   battle — способность (схема core-rules), которую даёт предмет на поясе; тратит 1 штуку
//   field  — эффект вне боя: { heal: { dice, bonus?, resource } } (совместимо с world/locations.js ITEMS.use)
//   opiate — ступень опиата 1 лёгкий · 2 средний · 3 сильный; withdrawal — ломка после боя (см. спеку)
//   stack — сколько штук в одном слоте пояса; tier, price, factions
// id `medkit`, `calmers`, `grenade` совпадают с world/locations.js ITEMS — это те же предметы, здесь добавлен боевой эффект.

const ability = (o) => ({
  level: 1, path: null, cost: 0, action: 'action', trigger: null,
  range: 0, target: 'self', area: null, roll: 'auto', save: null, onSave: 'none',
  usesPerBattle: null, effects: [], desc: '', canon: null,
  ...o,
});

// Схема движка (combat.js useItem / isBattleItem): предмет сам «способность» — поля action, range, target, area, roll,
// save, onSave, effects, dc, castStat лежат прямо на предмете; ловушка — trap: { effects, save, onSave, area, dc }.
// Построитель c() раскладывает `battle` на предмет; у ловушек (battle.trap === true) эффекты уходят в `trap`.
// СЛ не задаётся: движок берёт 8 + владение + mod(ЛВК) бросающего.
const BATTLE_KEYS = ['action', 'range', 'target', 'area', 'roll', 'save', 'onSave', 'effects', 'castStat', 'needs', 'canon', 'zone', 'surface'];
// surface: { kind, size, turns } — поверхность в центре броска (data/surfaces.js, спека statuses-surfaces §6.1).
const c = (o) => {
  const it = { cat: 'consumable', slot: 'consumable', battle: null, field: null, opiate: 0, withdrawal: null, stack: 3, tier: 1, price: 0, factions: [], desc: '', ...o };
  const b = it.battle;
  if (b) {
    for (const k of BATTLE_KEYS) if (b[k] !== undefined && b[k] !== null) it[k] = b[k];
    if (b.trap) {
      it.trap = { effects: b.effects, save: b.save, onSave: b.onSave, area: b.area };
      it.effects = [];
    }
  }
  return it;
};

// Гранаты: дальность броска 8 клеток.
const grenade = (o) => ability({ range: 8, target: 'tile', roll: 'save', save: 'dex', onSave: 'half', ...o });

const LIST = [
  // ---------------------------------------------------------------- Медицина (не опиатная)
  c({ id: 'bandage', name: 'Бинт и зелёнка', kind: 'medicine', stack: 5,
    battle: ability({ id: 'use-bandage', name: 'Перевязка', action: 'bonus', range: 1, target: 'ally',
      effects: [{ op: 'heal', dice: '1d4', resource: 'hp' }, { op: 'cleanse', count: 1, kind: 'debuff' }],
      desc: '1d4 ЗДР и снимает 1 дебафф (канон: «останавливает кровотечение, лечит ожог»).', needs: 'cleanse ids: только bleed/burn/poison' }),
    field: { heal: { dice: '1d4', bonus: 1, resource: 'hp' } },
    tier: 1, price: 8, factions: ['neutralVillages', 'scavengers', 'agrozone'], desc: '«Аптечка из мусора» в заводской упаковке.', canon: 'extra/specialties.md' }),
  c({ id: 'medkit', name: 'Аптечка', kind: 'medicine',
    battle: ability({ id: 'use-medkit', name: 'Аптечка', range: 1, target: 'ally',
      effects: [{ op: 'heal', dice: '2d4', bonus: 2, resource: 'hp' }], desc: '2d4+2 ЗДР.' }),
    field: { heal: { dice: '2d4', bonus: 2, resource: 'hp' } },
    tier: 1, price: 25, factions: ['neutralVillages', 'pirates', 'renegades', 'warprom', 'agrozone'], desc: 'Стандарт выживания.' }),
  c({ id: 'army-medkit', name: 'Армейская аптечка', kind: 'medicine', stack: 2,
    battle: ability({ id: 'use-army-medkit', name: 'Армейская аптечка', range: 1, target: 'ally',
      effects: [{ op: 'stabilize' }, { op: 'heal', dice: '3d4', bonus: 3, resource: 'hp' }], desc: 'Поднимает из «Без сознания», 3d4+3 ЗДР.' }),
    field: { heal: { dice: '3d4', bonus: 3, resource: 'hp' } },
    tier: 3, price: 70, factions: ['warprom', 'aiParty'], desc: 'Списано по акту. Акт тоже списан.' }),
  c({ id: 'analgin', name: 'Анальгин из довоенной аптеки', kind: 'medicine', stack: 5,
    battle: ability({ id: 'use-analgin', name: 'Анальгин', action: 'bonus', effects: [{ op: 'shield', dice: '1d6' }], desc: '1d6 врем. ЗДР: боль глуше.' }),
    tier: 1, price: 15, factions: ['neutralVillages', 'scavengers'], desc: 'Срок годности — 2009. Работает на честном слове.' }),
  c({ id: 'repair-kit', name: 'Ремкомплект', kind: 'medicine', stack: 3,
    battle: ability({ id: 'use-repair-kit', name: 'Ремонт', range: 1, target: 'ally',
      effects: [{ op: 'heal', dice: '2d6', resource: 'hp', only: 'mechanical' }], desc: '2d6 ЗДР скелету, андроиду, дрону (только mechanical).' }),
    field: { heal: { dice: '2d6', resource: 'hp', only: 'mechanical' } },
    tier: 1, price: 30, factions: ['mechanids', 'tekhonki', 'scavengers'], desc: 'Изолента, болты, смазка. Базовый ремонт канона.', canon: 'rules/spells.md' }),
  c({ id: 'antidote', name: 'Антидот садовника Шипа', kind: 'medicine',
    battle: ability({ id: 'use-antidote', name: 'Антидот', action: 'bonus', range: 1, target: 'ally',
      effects: [{ op: 'cleanse', count: 2, kind: 'debuff' }, { op: 'heal', dice: '1d4', resource: 'hp' }], desc: 'Снимает 2 дебаффа, 1d4 ЗДР.' }),
    tier: 2, price: 35, factions: ['mutantsPlant', 'agrozone'], desc: '«Яд и лекарство растут на одном кусте».', canon: 'rules/talents.md' }),

  // ---------------------------------------------------------------- Опиаты (ломка — после боя, см. спеку)
  c({ id: 'codeine-syrup', name: 'Кодеиновая микстура', kind: 'opiate', opiate: 1, withdrawal: { mrl: '1d4' },
    battle: ability({ id: 'use-codeine', name: 'Микстура', action: 'bonus', effects: [{ op: 'heal', dice: '2d6', resource: 'hp' }], desc: '2d6 ЗДР. Ломка: −1d4 МРЛ после боя.' }),
    tier: 2, price: 40, factions: ['pirates', 'scavengers'], desc: 'Лёгкий опиат. Пиратская «от кашля».', canon: 'extra/specialties.md' }),
  c({ id: 'tishina-syringe', name: 'Шприц-тюбик «Тишина»', kind: 'opiate', opiate: 2, withdrawal: { mrl: '2d4' }, stack: 2,
    battle: ability({ id: 'use-tishina', name: 'Тишина в вене', action: 'bonus',
      effects: [{ op: 'heal', dice: '3d6', resource: 'hp' }, { op: 'status', id: 'fortified', turns: 2 }],
      desc: '3d6 ЗДР и «стойка» на 2 хода. Ломка: −2d4 МРЛ после боя.' }),
    tier: 3, price: 90, factions: ['warprom', 'pirates'], desc: 'Средний опиат из армейских аптечек.', canon: 'extra/specialties.md' }),
  c({ id: 'black-morphine', name: 'Чёрный морфий', kind: 'opiate', opiate: 3, withdrawal: { mrl: '3d4', nextBattle: { status: 'slow', turns: 1 } }, stack: 1,
    battle: ability({ id: 'use-black-morphine', name: 'Чёрный морфий', range: 1, target: 'ally',
      effects: [{ op: 'stabilize' }, { op: 'heal', dice: '4d6', resource: 'hp' }, { op: 'status', id: 'berserk', turns: 2 }],
      desc: 'Встаёт даже мёртвый-почти: 4d6 ЗДР и берсерк. Ломка: −3d4 МРЛ и замедление в начале следующего боя.' }),
    tier: 4, price: 180, factions: ['pirates', 'cult'], desc: 'Сильный опиат. Мусорщики зовут его «воскресенье».', canon: 'extra/specialties.md' }),

  // ---------------------------------------------------------------- Успокоительное (МРЛ)
  c({ id: 'valerian', name: 'Настойка валерьянки', kind: 'sedative', stack: 5,
    battle: ability({ id: 'use-valerian', name: 'Валерьянка', action: 'bonus', effects: [{ op: 'heal', dice: '1d4', bonus: 1, resource: 'mrl' }], desc: '1d4+1 МРЛ.' }),
    field: { heal: { dice: '1d4', bonus: 1, resource: 'mrl' } },
    tier: 1, price: 10, factions: ['neutralVillages', 'mutantsPlant'], desc: 'Бабушкина. Пахнет котами.' }),
  c({ id: 'calmers', name: 'Успокоительное', kind: 'sedative',
    battle: ability({ id: 'use-calmers', name: 'Успокоительное', action: 'bonus', range: 1, target: 'ally',
      effects: [{ op: 'heal', dice: '2d4', bonus: 2, resource: 'mrl' }], desc: '2d4+2 МРЛ.' }),
    field: { heal: { dice: '2d4', bonus: 2, resource: 'mrl' } },
    tier: 1, price: 25, factions: ['neutralVillages', 'agrozone', 'aiParty'], desc: 'Психологическая поддержка в таблетке.' }),
  c({ id: 'party-phenazepam', name: 'Феназепам Партии', kind: 'sedative', stack: 2,
    battle: ability({ id: 'use-phenazepam', name: 'Феназепам', effects: [{ op: 'heal', dice: '3d6', resource: 'mrl' }, { op: 'cleanse', count: 1, kind: 'debuff' }, { op: 'status', id: 'slow', turns: 1 }],
      desc: '3d6 МРЛ, снимает 1 дебафф, но замедление на 1 ход.' }),
    tier: 3, price: 70, factions: ['aiParty'], desc: '«Кто не счастлив — к окошку номер семь».' }),
  c({ id: 'anti-cringe-earplugs', name: 'Беруши «Не слышу кринж»', kind: 'sedative', stack: 2,
    battle: ability({ id: 'use-earplugs', name: 'Беруши', action: 'bonus', effects: [{ op: 'cleanse', count: 1, kind: 'debuff' }],
      desc: '3 хода: сопротивление кринжу. Снимает кринж-эффект.', needs: 'resistBuff: временное resist к cringe (op buff stat resist)' }),
    tier: 2, price: 35, factions: ['neutralVillages'], desc: 'Предложка выдаёт их часовым у маяков.' }),

  // ---------------------------------------------------------------- Стимы
  c({ id: 'adrenaline-stim', name: 'Адреналиновый стим', kind: 'stim', stack: 1,
    battle: ability({ id: 'use-adrenaline', name: 'Адреналин', action: 'bonus', effects: [{ op: 'extraAction', kind: 'action' }],
      desc: '+1 действие сейчас; в следующий ход — без действия (канон).', canon: 'rules/spellcasting.md', nextTurnPenalty: 1 }),
    tier: 3, price: 120, factions: ['warprom', 'renegades', 'pirates'], desc: 'Сердце потом обидится.' }),
  c({ id: 'forsazh-stim', name: 'Стим «Форсаж»', kind: 'stim', stack: 2,
    battle: ability({ id: 'use-forsazh', name: 'Форсаж', action: 'bonus', effects: [{ op: 'status', id: 'haste', turns: 3 }], desc: 'Ускорение на 3 хода.' }),
    tier: 2, price: 70, factions: ['pirates', 'scavengers'], desc: 'Глаза как у совы, ноги как у зайца.' }),
  c({ id: 'otlichnik-nootrop', name: 'Ноотроп «Отличник»', kind: 'stim', stack: 2,
    battle: ability({ id: 'use-otlichnik', name: 'Отличник', action: 'bonus', effects: [{ op: 'buff', stat: 'hit', value: 2, turns: 3 }], desc: '+2 к атаке на 3 хода.' }),
    tier: 2, price: 60, factions: ['aiParty', 'tekhonki'], desc: 'Для экзаменов в техникум. Помогает и в перестрелке.' }),
  c({ id: 'bear-blood', name: 'Медвежья кровь', kind: 'stim', stack: 1,
    battle: ability({ id: 'use-bear-blood', name: 'Медвежья кровь', action: 'bonus', effects: [{ op: 'status', id: 'regen', turns: 3 }, { op: 'status', id: 'berserk', turns: 2 }],
      desc: 'Регенерация 3 хода и берсерк 2 хода.' }),
    tier: 3, price: 110, factions: ['mutantsBeast'], desc: 'Медведица Груня знает, чья. Не спрашивай.' }),

  // ---------------------------------------------------------------- Энергия (ЭНР)
  c({ id: 'krona-battery', name: 'Батарейка «Крона»', kind: 'energy', stack: 5,
    battle: ability({ id: 'use-krona', name: 'Крона', action: 'bonus', effects: [{ op: 'heal', dice: '1d4', bonus: 1, resource: 'enr' }], desc: '1d4+1 ЭНР.' }),
    tier: 1, price: 20, factions: ['scavengers', 'tekhonki', 'neutralVillages'], desc: 'Лизни — проверь. Канон: ЭНР запитывает устройства.' }),
  c({ id: 'party-cell', name: 'Энергоячейка Партии', kind: 'energy',
    battle: ability({ id: 'use-party-cell', name: 'Энергоячейка', action: 'bonus', effects: [{ op: 'heal', dice: '2d4', bonus: 2, resource: 'enr' }], desc: '2d4+2 ЭНР.' }),
    tier: 3, price: 60, factions: ['aiParty', 'pirates'], desc: 'С серийным номером. Пираты номера стирают.' }),
  c({ id: 'drone-reactor', name: 'Мини-реактор из дрона', kind: 'energy', stack: 1,
    battle: ability({ id: 'use-drone-reactor', name: 'Мини-реактор', action: 'bonus',
      effects: [{ op: 'heal', dice: '4d4', resource: 'enr' }, { op: 'damage', dice: '1d4', dmgType: 'electric' }], desc: '4d4 ЭНР, но 1d4 электро себе: протекает.' }),
    tier: 4, price: 140, factions: ['mechanids', 'tekhonki'], desc: 'Вынут из дрона Партии. Тёплый.' }),
  c({ id: 'bodry-ilyich', name: 'Энергетик «Бодрый Ильич»', kind: 'energy', stack: 3,
    battle: ability({ id: 'use-ilyich', name: 'Бодрый Ильич', action: 'bonus', effects: [{ op: 'heal', dice: '1d4', resource: 'enr' }, { op: 'buff', stat: 'init', value: 2, turns: 3 }],
      desc: '1d4 ЭНР и +2 инициативы.' }),
    tier: 1, price: 15, factions: ['neutralVillages', 'pirates', 'renegades'], desc: '«Вечно живой — вечно бодрый».' }),

  // ---------------------------------------------------------------- Гранаты
  c({ id: 'grenade', name: 'Самодельная граната', kind: 'grenade',
    battle: grenade({ id: 'use-grenade', name: 'Граната', area: { shape: 'radius', size: 1 }, effects: [{ op: 'damage', dice: '2d6', dmgType: 'fire' }, { op: 'status', id: 'burn', turns: 2 }], surface: { kind: 'fire', size: 0, turns: 2 },
      desc: '2d6 огня, радиус 1 (спас ЛВК — половина).' }),
    tier: 1, price: 40, factions: ['renegades', 'scavengers', 'pirates'], desc: '«Оружейный алхимик» в действии.' }),
  c({ id: 'molotov', name: 'Бутылка с горючим', kind: 'grenade', stack: 3,
    battle: grenade({ id: 'use-molotov', name: 'Коктейль', area: { shape: 'radius', size: 1 },
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'fire' }, { op: 'status', id: 'burn', turns: 2 }], surface: { kind: 'fire', size: 1, turns: 4 },
      desc: '1d6 огня и горение 2 хода, радиус 1. Оставляет огонь на 4 раунда; масло вспыхивает пожаром.' }),
    tier: 1, price: 15, factions: ['renegades', 'agrozone', 'neutralVillages'], desc: 'Классика восстаний.' }),
  c({ id: 'frag-grenade', name: 'Осколочная РГД-кустарь', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-frag', name: 'Осколочная', area: { shape: 'radius', size: 2 },
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'pierce' }, { op: 'status', id: 'bleed', turns: 1 }], desc: '2d6 колющего и кровотечение, радиус 2.' }),
    tier: 2, price: 60, factions: ['warprom', 'renegades'], desc: 'Гвозди внутри — из гвоздомёта.' }),
  c({ id: 'emp-grenade', name: 'ЭМ-граната', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-emp', name: 'ЭМ-импульс', save: 'con', area: { shape: 'radius', size: 2 },
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'electric', only: 'mechanical' }, { op: 'status', id: 'stun', turns: 1, only: 'mechanical' },
        { op: 'status', id: 'glitch', turns: 2, only: ['mechanical', 'digital'] }, { op: 'status', id: 'shocked', turns: 1 }], surface: { kind: 'electric', size: 1, turns: 2 },
      desc: 'Только по машинам: 2d6 электро и оглушение, радиус 2 (спас ТЕЛ).' }),
    tier: 3, price: 90, factions: ['tekhonki', 'tinBrotherhood', 'renegades'], desc: 'Любимое средство против Чистильщиков.' }),
  c({ id: 'cringe-grenade', name: 'Кринж-граната «Тост за молодых»', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-cringe-grenade', name: 'Тост за молодых', save: 'wil', area: { shape: 'radius', size: 2 },
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'cringe' }, { op: 'status', id: 'cringed', turns: 2 }, { op: 'status', id: 'panic', turns: 2, mrlBelow: 0.25 }],
      surface: { kind: 'cringe', size: 2, turns: 4 },
      desc: 'Из гранаты звучит тост дяди на свадьбе: 2d6 кринжа и кринж-эффект, радиус 2 (спас ТВД).' }),
    tier: 2, price: 70, factions: ['cringegons', 'pirates'], desc: 'Трофей с кринжгонов. Пираты перепродают.' }),
  c({ id: 'smoke-grenade', name: 'Дымовая шашка', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-smoke', name: 'Дым', save: 'con', onSave: 'none', area: { shape: 'radius', size: 2 },
      effects: [{ op: 'status', id: 'blind', turns: 1 }], desc: 'Враги в радиусе 2 ослеплены на 1 ход; облако 2 хода блокирует линию видимости.',
      surface: { kind: 'smoke', size: 2, turns: 4 } }),
    tier: 1, price: 30, factions: ['renegades', 'warprom', 'pirates'], desc: 'Уйти по-английски, по-русски.' }),
  c({ id: 'flashbang', name: 'Светошумовая', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-flashbang', name: 'Светошумовая', save: 'con', onSave: 'none', area: { shape: 'radius', size: 2 },
      effects: [{ op: 'status', id: 'blind', turns: 1 }, { op: 'status', id: 'dazed', turns: 1 }], surface: { kind: 'smoke', size: 0, turns: 1 }, desc: 'Ослепление и дизбаланс на 1 ход, радиус 2 (спас ТЕЛ).' }),
    tier: 3, price: 50, factions: ['aiParty', 'warprom'], desc: 'Партия разгоняет митинги.' }),
  c({ id: 'proxy-can', name: 'Прокси-банка техоньков', kind: 'grenade', stack: 2,
    battle: grenade({ id: 'use-proxy-can', name: 'Прокси-банка', area: { shape: 'radius', size: 1 },
      effects: [{ op: 'damage', dice: '2d8', dmgType: 'proxy' }, { op: 'status', id: 'overload', turns: 3 }], surface: { kind: 'proxy', size: 2, turns: 5 },
      desc: '2d8 прокси, радиус 1 (по машинам ×1.5, по живым ×0.5), перегрузка; прокси-поле радиус 2 на 5 раундов.' }),
    tier: 2, price: 80, factions: ['tekhonki'], desc: 'Банка из-под шпрот с кусочком прокси-бури.' }),

  // ---------------------------------------------------------------- Ловушки (ставятся на клетку, срабатывают при входе врага)
  c({ id: 'bear-trap', name: 'Капкан', kind: 'trap', stack: 2,
    battle: ability({ id: 'use-bear-trap', name: 'Поставить капкан', range: 1, target: 'tile', trap: true,
      effects: [{ op: 'damage', dice: '1d6', dmgType: 'pierce' }, { op: 'status', id: 'root', turns: 2 }, { op: 'status', id: 'bleed', turns: 3 },
        { op: 'surface', kind: 'blood', size: 0, turns: 6, per: 'target' }],
      desc: 'На соседнюю клетку. Враг, вошедший в неё: 1d6 колющего и обездвиживание на 2 хода.' }),
    tier: 1, price: 25, factions: ['mutantsBeast', 'neutralVillages', 'scavengers'], desc: 'На медведя. На мутанта тоже.' }),
  c({ id: 'tripwire', name: 'Растяжка', kind: 'trap', stack: 2,
    battle: ability({ id: 'use-tripwire', name: 'Поставить растяжку', range: 1, target: 'tile', trap: true, area: { shape: 'radius', size: 1 },
      roll: 'save', save: 'dex', onSave: 'half', dc: 'byLevel',
      effects: [{ op: 'damage', dice: '2d6', dmgType: 'pierce' }, { op: 'surface', kind: 'fire', size: 0, turns: 2, per: 'target', ifSurface: 'oil' }], desc: 'Срабатывает при входе: 2d6 колющего в радиусе 1 (спас ЛВК — половина).' }),
    tier: 2, price: 45, factions: ['renegades'], desc: 'Тихоня Ярош: «Тут мины. И тут».' }),
  c({ id: 'shock-mat', name: 'Шоковый коврик', kind: 'trap', stack: 2,
    battle: ability({ id: 'use-shock-mat', name: 'Постелить коврик', range: 1, target: 'tile', trap: true, roll: 'save', save: 'con', onSave: 'half', dc: 'byLevel',
      effects: [{ op: 'damage', dice: '1d8', dmgType: 'electric' }, { op: 'status', id: 'stun', turns: 1 }, { op: 'status', id: 'shocked', turns: 1 },
        { op: 'surface', kind: 'electric', size: 0, turns: 2, per: 'target' }],
      desc: 'Срабатывает при входе: 1d8 электро и оглушение (спас ТЕЛ — половина, без оглушения).' }),
    tier: 3, price: 70, factions: ['mechanids', 'tekhonki'], desc: '«Добро пожаловать» — написано на коврике.' }),
  c({ id: 'scrap-magnet', name: 'Магнит-ловушка мусорщиков', kind: 'trap', stack: 1,
    battle: ability({ id: 'use-scrap-magnet', name: 'Магнит', range: 6, target: 'enemy', roll: 'save', save: 'str',
      effects: [{ op: 'status', id: 'prone', turns: 1, only: 'mechanical' }, { op: 'status', id: 'disarm', turns: 1, only: 'mechanical' }],
      desc: 'Только по металлу: лежит и разоружён на 1 ход (спас СИЛ). Канон: «подцепят магнитом… и будут трясти с него лут».',
      canon: 'rules/core-rules.md' }),
    tier: 2, price: 80, factions: ['scavengers'], desc: 'Скелеты, бегите.' }),

  // ---------------------------------------------------------------- Инструменты
  c({ id: 'folded-drone', name: 'Свёрнутый дрон', kind: 'tool', stack: 1,
    battle: ability({ id: 'use-folded-drone', name: 'Запуск дрона', action: 'bonus', range: 1, target: 'tile', effects: [{ op: 'summon', unit: 'drone', turns: 3 }], desc: 'Боевой дрон на 3 хода.' }),
    tier: 3, price: 150, factions: ['mechanids', 'aiParty', 'tekhonki'], desc: 'Разворачивается со звуком «бзынь».' }),
  c({ id: 'holo-decoy', name: 'Голо-приманка', kind: 'tool', stack: 2,
    battle: ability({ id: 'use-holo-decoy', name: 'Приманка', action: 'bonus', range: 1, target: 'tile', effects: [{ op: 'summon', unit: 'hologram', turns: 2 }], desc: 'Голограмма на 2 хода.' }),
    tier: 2, price: 60, factions: ['pirates'], desc: 'Фальшивый сигнал Кибер-Ловкача в кармане.' }),
  c({ id: 'portable-barricade', name: 'Складной щит ОМОНа', kind: 'tool', stack: 1,
    battle: ability({ id: 'use-barricade', name: 'Щит', action: 'bonus', effects: [{ op: 'shield', value: 8 }], desc: '8 врем. ЗДР.' }),
    tier: 2, price: 55, factions: ['aiParty', 'warprom'], desc: 'С надписью «ПОЛИЦИЯ ПАРТИИ».' }),

  // ---------------------------------------------------------------- Еда (вне боя)
  // provision: N — рационов для длинного отдыха (data/world/rest.js)
  c({ id: 'tushenka', name: 'Тушёнка', kind: 'food', stack: 5, provision: 1, field: { heal: { dice: '1d6', resource: 'hp' } },
    tier: 1, price: 5, factions: ['pirates', 'neutralVillages', 'scavengers'], desc: 'Валюта Боцмана Сухаря.' }),
  c({ id: 'pelmeni', name: 'Пельмени трактирщика', kind: 'food', stack: 5, field: { heal: { dice: '1d6', resource: 'mrl' } },
    tier: 1, price: 8, factions: ['neutralVillages'], desc: '«Слухи без пельменей не усваиваются».' }),
  c({ id: 'ration', name: 'Сухпаёк', kind: 'food', stack: 6, provision: 1, size: [1, 1],
    tier: 1, price: 6, factions: ['neutralVillages', 'scavengers', 'warprom', 'renegades'], desc: 'Рацион на одного на ночь. Галеты, сахар, бульонный кубик неизвестного происхождения.' }),
  c({ id: 'army-ration', name: 'Армейский рацион', kind: 'food', stack: 3, provision: 2, size: [1, 2],
    tier: 2, price: 14, factions: ['warprom', 'aiParty'], desc: 'ИРП Варпрома: хватает на двоих. Срок годности — «до победы».' }),
  c({ id: 'mutant-stew', name: 'Мутантская похлёбка', kind: 'food', stack: 4, provision: 1, field: { heal: { dice: '1d4', resource: 'hp' } },
    tier: 1, price: 3, factions: ['mutantsPlant', 'mutantsBeast', 'scavengers'], desc: 'Рацион на ночь. Что-то в ней плавает и смотрит в ответ.' }),
];

export const CONSUMABLES = Object.fromEntries(LIST.map((it) => [it.id, it]));
