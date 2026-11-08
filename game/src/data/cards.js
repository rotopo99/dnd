// Карточная игра «Хлам и Кринж» + казино. Спека: docs/specs/cards-casino.md.
// Данные без логики. Движок читает fx как { on, op, to, ... } (словарь — в спеке §2.4).
// Набор: 7 фракционных (13 карт) + нейтральный (20) = 111 карт; токены не считаются.
// Ключевые слова (kw): taunt «Заслон», rush «Рывок», shield «Щит», poison «Яд», cringe: N «Кринж-аура N».

export const CARD_RULES = {
  deckSize: 20, maxCopies: 2, maxCopiesLegendary: 1,
  heroHp: 25, handMax: 7, fieldSlots: 5,
  startHand: { first: 3, second: 4 }, // второй игрок получает «Запасную батарейку» (tok_coin)
  chargeStart: 1, chargePerTurn: 1, chargeMax: 8,
  heroPowerCost: 2, burnout: 'N-е добирание из пустой колоды — N урона герою (1, 2, 3…)',
  cringeAuraCap: 3, // суммарная аура Кринжа не опускает АТК ниже 1 и не сильнее −3
  turnSeconds: 60,
};

// Редкость: вес выпадения из пака / цена у торговца (кредиты)
export const RARITY = {
  common:    { name: 'Обычная',     w: 70, buy: 20,  sell: 5 },
  rare:      { name: 'Редкая',      w: 22, buy: 60,  sell: 15 },
  epic:      { name: 'Эпическая',   w: 7,  buy: 150, sell: 40 },
  legendary: { name: 'Легенда',     w: 1,  buy: null, sell: 100 }, // не продаётся, только награды/боссы
};

export const CARD_SETS = {
  neu: { name: 'Нейтральные', faction: null },
  ai:  { name: 'АИ Партия', faction: 'aiParty', hero: 'h-ai' },
  tin: { name: 'Жестяное братство', faction: 'tinBrotherhood', hero: 'h-tin' },
  pir: { name: 'Пираты', faction: 'pirates', hero: 'h-pir' },
  scv: { name: 'Мусорщики', faction: 'scavengers', hero: 'h-scv' },
  mut: { name: 'Мутанты', faction: 'mutantsBeast', hero: 'h-mut' }, // Ж и Р вместе
  tkh: { name: 'Техоньки', faction: 'tekhonki', hero: 'h-tkh' },
  crg: { name: 'Кринжгоны', faction: 'cringegons', hero: 'h-crg' },
};

// Цели: self, choose-enemy (персонаж), choose-enemy-creature, choose-ally-creature, choose-any-creature,
// enemy-hero, self-hero, all-enemy-creatures, all-ally-creatures, all-creatures, random-enemy-creature,
// random-ally-creature, adjacent-allies. Ops: см. спеку.
const cr = (id, name, set, cost, atk, hp, rarity, kw, fx, text, extra = {}) =>
  ({ id, name, set, type: 'creature', cost, atk, hp, rarity, kw, fx, text, ...extra });
const sp = (id, name, set, cost, rarity, fx, text) =>
  ({ id, name, set, type: 'spell', cost, rarity, fx, text });
const gd = (id, name, set, cost, dur, rarity, fx, text) =>
  ({ id, name, set, type: 'gadget', cost, dur, rarity, fx, text });
const tk = (id, name, c) => ({ id, name, set: 'tok', token: true, rarity: 'common', kw: [], fx: [], ...c });
const P = (op, to, o = {}) => ({ on: 'play', op, to, ...o });
const D = (op, to, o = {}) => ({ on: 'death', op, to, ...o });

const LIST = [
  // ---------- Жетоны (вне коллекции) ----------
  tk('tok_scrap', 'Хлам', { type: 'creature', cost: 0, atk: 1, hp: 1, text: '' }),
  tk('tok_spore', 'Спора', { type: 'creature', cost: 0, atk: 1, hp: 1, text: '' }),
  tk('tok_sprout', 'Росток', { type: 'creature', cost: 0, atk: 1, hp: 1, text: '' }),
  tk('tok_fetish', 'Фетиш из проводов', { type: 'creature', cost: 0, atk: 0, hp: 2, kw: ['taunt'], text: 'Заслон.' }),
  tk('tok_ace', 'Туз в рукаве', { type: 'spell', cost: 0, fx: [P('gain', 'self-hero', { n: 1 })], text: 'Получи 1 заряд до конца хода.' }),
  tk('tok_coin', 'Запасная батарейка', { type: 'spell', cost: 0, fx: [P('gain', 'self-hero', { n: 1 })], text: 'Получи 1 заряд до конца хода.' }),

  // ---------- АИ Партия ----------
  cr('ai_clerk', 'Делопроизводитель', 'ai', 1, 1, 2, 'common', [], [], 'Вынужден стоять в очереди сам.'),
  cr('ai_stenog', 'Стенографистка', 'ai', 2, 1, 3, 'common', [], [D('draw', 'self-hero', { n: 1 })], 'Финал: возьми карту.'),
  cr('ai_drone', 'Дрон-наблюдатель', 'ai', 2, 2, 1, 'common', [], [P('damage', 'choose-enemy-creature', { n: 1 })], 'Выход: 1 урон существу.', { tags: ['mech'] }),
  cr('ai_guard', 'Андроид-охранник', 'ai', 3, 2, 4, 'common', ['taunt'], [], 'Заслон.', { tags: ['mech'] }),
  cr('ai_inspector', 'Инспектор', 'ai', 3, 2, 3, 'rare', [], [P('status', 'choose-enemy-creature', { id: 'stun', turns: 1 })], 'Выход: оглуши вражеское существо на 1 ход.'),
  cr('ai_bureaucrat', 'Бюрократ', 'ai', 4, 3, 4, 'rare', [], [P('tax', 'enemy-hero', { n: 1, turns: 1 })], 'Выход: карты противника стоят на 1 больше в его след. ход.'),
  cr('ai_agitator', 'Пропагандист', 'ai', 4, 2, 4, 'epic', [], [{ on: 'aura', op: 'buff', to: 'adjacent-allies', atk: 1 }], 'Соседние союзные существа получают +1 АТК.'),
  cr('ai_tank', 'Бронеходчик', 'ai', 5, 4, 5, 'rare', ['shield'], [], 'Щит.', { tags: ['mech'] }),
  sp('ai_decree', 'Указ о ликвидации', 'ai', 2, 'common', [P('damage', 'choose-enemy-creature', { n: 3 })], '3 урона существу.'),
  sp('ai_audit', 'Плановая проверка', 'ai', 3, 'rare', [P('draw', 'self-hero', { n: 2 }), P('discard', 'enemy-hero', { n: 1 })], 'Возьми 2 карты. Противник сбрасывает случайную карту.'),
  sp('ai_purge', 'Чистка рядов', 'ai', 6, 'epic', [P('destroy', 'all-creatures', { where: { atkMax: 3 } })], 'Уничтожь все существа с АТК 3 или меньше.'),
  gd('ai_terminal', 'Терминал Партии', 'ai', 2, 4, 'common', [{ on: 'turn-end', op: 'buff', to: 'random-ally-creature', atk: 1, hp: 1 }], 'Конец хода: случайное союзное существо +1/+1. 4 заряда.'),
  cr('ai_putin', 'Путин Марк 2', 'ai', 8, 6, 8, 'legendary', ['taunt', 'shield'], [P('buff', 'all-ally-creatures', { atk: 1, hp: 1 })], 'Заслон, Щит. Выход: союзные существа +1/+1.', { tags: ['mech'] }),

  // ---------- Жестяное братство ----------
  cr('tin_novice', 'Послушник', 'tin', 1, 1, 2, 'common', [], [], 'Метёт двор уже третий год.'),
  cr('tin_ronin', 'Скелет-ронин', 'tin', 2, 2, 1, 'common', ['rush'], [], 'Рывок.', { tags: ['skeleton'] }),
  cr('tin_duelist', 'Дуэлянт', 'tin', 3, 2, 3, 'common', ['shield'], [], 'Щит.'),
  cr('tin_archer', 'Лучник-аналоговщик', 'tin', 3, 3, 2, 'common', [], [P('damage', 'choose-enemy', { n: 1 })], 'Выход: 1 урон любому врагу.'),
  cr('tin_monk', 'Монах Тишина', 'tin', 3, 2, 4, 'rare', ['taunt'], [], 'Заслон.', { tags: ['skeleton'] }),
  cr('tin_smith', 'Кузнец Окалина', 'tin', 4, 2, 4, 'rare', [], [P('buff', 'choose-ally-creature', { atk: 2, hp: 2 })], 'Выход: союзное существо +2/+2.'),
  cr('tin_samurai', 'Жестяной самурай', 'tin', 4, 3, 5, 'common', [], [], 'Честь тяжелее брони.'),
  cr('tin_nail', 'Бешеный Гвоздь', 'tin', 5, 6, 3, 'epic', ['rush'], [], 'Рывок.'),
  sp('tin_kata', 'Ката', 'tin', 1, 'common', [P('buff', 'choose-ally-creature', { atk: 2, turns: 1 })], 'Союзное существо +2 АТК до конца хода.'),
  sp('tin_duel', 'Честный бой', 'tin', 2, 'rare', [P('duel', 'choose-ally-creature', { vs: 'choose-enemy-creature' })], 'Твоё и вражеское существо бьют друг друга на значение АТК.'),
  sp('tin_rain', 'Дождь стали', 'tin', 4, 'epic', [P('damage', 'all-enemy-creatures', { n: 2 })], '2 урона всем вражеским существам.'),
  gd('tin_dojo', 'Додзе', 'tin', 2, 3, 'common', [{ on: 'turn-start', op: 'buff', to: 'random-ally-creature', atk: 1 }], 'Начало хода: случайное союзное существо +1 АТК. 3 заряда.'),
  cr('tin_khan', 'Верховный самурай Хан', 'tin', 7, 6, 6, 'legendary', ['taunt'], [P('shield', 'all-ally-creatures')], 'Заслон. Выход: все союзные существа получают Щит.'),

  // ---------- Пираты ----------
  cr('pir_rat', 'Портовая крыса', 'pir', 1, 1, 1, 'common', ['rush'], [], 'Рывок.'),
  cr('pir_barrel', 'Бочка с ромом', 'pir', 2, 0, 3, 'common', ['taunt'], [D('heal', 'self-hero', { n: 3 })], 'Заслон. Финал: лечи героя на 3.'),
  cr('pir_yunga', 'Юнга-карманник', 'pir', 2, 1, 2, 'common', [], [P('draw', 'self-hero', { n: 1 })], 'Выход: возьми карту.'),
  cr('pir_kontra', 'Контрабандист', 'pir', 3, 2, 3, 'common', [], [P('gain', 'self-hero', { n: 1 })], 'Выход: +1 заряд до конца хода.'),
  cr('pir_sharper', 'Шулер', 'pir', 3, 2, 2, 'rare', [], [P('give', 'self-hero', { card: 'tok_ace' })], 'Выход: получи «Туз в рукаве».'),
  cr('pir_bosun', 'Боцман', 'pir', 4, 3, 5, 'common', ['taunt'], [], 'Заслон.'),
  cr('pir_gunner', 'Канонир', 'pir', 4, 4, 3, 'rare', [], [P('damage', 'choose-enemy-creature', { n: 2 })], 'Выход: 2 урона существу.'),
  cr('pir_boarder', 'Абордажник', 'pir', 5, 5, 4, 'rare', ['rush'], [], 'Рывок.'),
  sp('pir_bet', 'Ставка', 'pir', 2, 'common', [P('draw', 'self-hero', { n: 2 }), P('damage', 'self-hero', { n: 2 })], 'Возьми 2 карты. Получи 2 урона.'),
  sp('pir_boarding', 'Абордаж', 'pir', 4, 'rare', [P('destroy', 'choose-enemy-creature', { where: { atkMax: 3 } })], 'Уничтожь вражеское существо с АТК 3 или меньше.'),
  sp('pir_storm', 'Шторм', 'pir', 5, 'epic', [P('damage', 'all-creatures', { n: 3 })], '3 урона ВСЕМ существам.'),
  gd('pir_cannon', 'Судовая пушка', 'pir', 3, 3, 'common', [{ on: 'turn-end', op: 'damage', to: 'random-enemy-creature', n: 2 }], 'Конец хода: 2 урона случайному вражескому существу. 3 заряда.'),
  cr('pir_stavka', 'Мадам Ставка', 'pir', 6, 4, 6, 'legendary', [], [P('roll', 'self', { die: 6, low: [{ op: 'damage', to: 'enemy-hero', n: 4 }], high: [{ op: 'draw', to: 'self-hero', n: 2 }, { op: 'heal', to: 'self-hero', n: 4 }] })], 'Выход: брось d6. 1–3: 4 урона герою врага. 4–6: возьми 2 карты и лечи героя на 4.'),

  // ---------- Мусорщики ----------
  cr('scv_rat', 'Крыса-мусорщица', 'scv', 1, 1, 1, 'common', [], [D('summon', 'self', { card: 'tok_scrap', n: 1 })], 'Финал: призови Хлам.'),
  cr('scv_hoarder', 'Барахольщик', 'scv', 2, 1, 3, 'common', [], [D('draw', 'self-hero', { n: 1 })], 'Финал: возьми карту.'),
  cr('scv_digger', 'Копатель', 'scv', 3, 2, 2, 'common', [], [P('summon', 'self', { card: 'tok_scrap', n: 1 })], 'Выход: призови Хлам.'),
  cr('scv_raider', 'Мародёр', 'scv', 3, 3, 2, 'common', ['rush'], [], 'Рывок.'),
  cr('scv_pile', 'Мусорная куча', 'scv', 4, 0, 6, 'rare', ['taunt'], [D('summon', 'self', { card: 'tok_scrap', n: 2 })], 'Заслон. Финал: призови 2 Хлама.'),
  cr('scv_welder', 'Сварщик с кислотой', 'scv', 4, 3, 3, 'rare', ['poison'], [], 'Яд.'),
  cr('scv_hunter', 'Охотник на скелетов', 'scv', 5, 4, 4, 'rare', [], [P('damage', 'choose-enemy-creature', { n: 3, vsTag: { skeleton: 6 } })], 'Выход: 3 урона существу (6, если это скелет).'),
  cr('scv_golem', 'Свалочный голем', 'scv', 6, 5, 7, 'epic', [], [], 'Собран из того, что не взяли даже мусорщики.', { tags: ['mech'] }),
  sp('scv_junk', 'Метнуть хлам', 'scv', 1, 'common', [P('damage', 'choose-enemy-creature', { n: 2 })], '2 урона существу.'),
  sp('scv_salvage', 'Утилизация', 'scv', 2, 'rare', [P('destroy', 'choose-ally-creature'), P('draw', 'self-hero', { n: 2 })], 'Уничтожь своё существо. Возьми 2 карты.'),
  sp('scv_slide', 'Оползень мусора', 'scv', 4, 'epic', [P('summon', 'self', { card: 'tok_scrap', n: 3 })], 'Призови 3 Хлама.'),
  gd('scv_press', 'Мусорный пресс', 'scv', 3, 2, 'rare', [{ on: 'turn-end', op: 'destroy', to: 'weakest-enemy-creature' }], 'Конец хода: уничтожь самое слабое (по ЗДР) вражеское существо. 2 заряда.'),
  cr('scv_king', 'Король свалок', 'scv', 7, 5, 7, 'legendary', [], [P('summon', 'self', { card: 'tok_scrap', n: 4, fill: true })], 'Выход: призови Хлам во все свободные слоты (до 4).'),

  // ---------- Мутанты ----------
  cr('mut_sprout', 'Дикий росток', 'mut', 1, 1, 1, 'common', [], [{ on: 'turn-end', op: 'buff', to: 'self', hp: 1 }], 'Конец хода: +0/+1.'),
  cr('mut_wolf', 'Мутант-волк', 'mut', 2, 3, 1, 'common', ['rush'], [], 'Рывок.'),
  cr('mut_toad', 'Ядовитая жаба', 'mut', 2, 1, 3, 'common', ['poison'], [], 'Яд.'),
  cr('mut_cap', 'Шляпка', 'mut', 3, 2, 3, 'common', [], [D('summon', 'self', { card: 'tok_spore', n: 2 })], 'Финал: призови 2 Споры.'),
  cr('mut_loza', 'Тётя Лоза', 'mut', 4, 2, 6, 'rare', ['taunt'], [{ on: 'turn-end', op: 'heal', to: 'all-ally-creatures', n: 1 }], 'Заслон. Конец хода: союзные существа лечатся на 1.'),
  cr('mut_skinner', 'Шкурник', 'mut', 4, 4, 3, 'common', ['rush'], [], 'Рывок.'),
  cr('mut_grunya', 'Медведица Груня', 'mut', 5, 5, 5, 'rare', [], [P('buff', 'adjacent-allies', { hp: 2 })], 'Выход: соседние союзники +0/+2.'),
  cr('mut_chimera', 'Химера', 'mut', 6, 5, 6, 'epic', ['poison'], [], 'Яд.'),
  sp('mut_bloom', 'Цветение', 'mut', 2, 'common', [P('heal', 'all-ally-creatures', { n: 3 })], 'Союзные существа лечатся на 3.'),
  sp('mut_howl', 'Вой стаи', 'mut', 3, 'rare', [P('buff', 'all-ally-creatures', { atk: 1, turns: 1, kw: 'rush' })], 'Союзные существа: +1 АТК и Рывок до конца хода.'),
  sp('mut_spores', 'Споровое облако', 'mut', 3, 'epic', [P('status', 'all-enemy-creatures', { id: 'poison', turns: 3 })], 'Враги отравлены: 1 урон в конце их хода, 3 хода.'),
  gd('mut_greenhouse', 'Теплица', 'mut', 2, 3, 'common', [{ on: 'turn-start', op: 'summon', to: 'self', card: 'tok_sprout', n: 1 }], 'Начало хода: призови Росток. 3 заряда.'),
  cr('mut_zver', 'Зверь', 'mut', 7, 6, 7, 'legendary', ['rush'], [], 'Рывок. Зверь не говорит. Зверь решает.'),

  // ---------- Техоньки ----------
  cr('tkh_fetish', 'Фетиш из проводов', 'tkh', 1, 0, 3, 'common', ['taunt'], [], 'Заслон.'),
  cr('tkh_shaman', 'Юный шаман', 'tkh', 2, 1, 3, 'common', [], [P('gain', 'self-hero', { n: 1 })], 'Выход: +1 заряд до конца хода.'),
  cr('tkh_proxy', 'Прокси-призрак', 'tkh', 3, 2, 3, 'common', [], [P('damage', 'choose-enemy-creature', { n: 2, vsTag: { mech: 4 } })], 'Выход: 2 урона существу (4 механизму).'),
  cr('tkh_drummer', 'Барабанщик ритуала', 'tkh', 3, 2, 4, 'common', [], [P('draw', 'self-hero', { n: 1, if: { allyCreaturesMin: 3 } })], 'Выход: если у тебя 3+ существ, возьми карту.'),
  cr('tkh_totem', 'Тотем старого бога', 'tkh', 4, 0, 6, 'rare', ['taunt'], [{ on: 'turn-end', op: 'heal', to: 'all-ally-creatures', n: 1 }], 'Заслон. Конец хода: союзные существа лечатся на 1.'),
  cr('tkh_rzhaven', 'Ржавень', 'tkh', 4, 3, 5, 'rare', [], [D('destroy', 'random-enemy-creature', { where: { tag: 'mech' } })], 'Финал: уничтожь случайный вражеский механизм.'),
  cr('tkh_iskra', 'Ритуальщица Искра', 'tkh', 4, 3, 3, 'rare', [], [P('damage', 'all-enemy-creatures', { n: 1 })], 'Выход: 1 урон всем вражеским существам.'),
  cr('tkh_idol', 'Кибер-идол', 'tkh', 6, 5, 5, 'epic', ['shield'], [], 'Щит.', { tags: ['mech'] }),
  sp('tkh_rust', 'Молитва ржавчине', 'tkh', 1, 'common', [P('destroy', 'choose-enemy-gadget')], 'Уничтожь вражеский Гаджет.'),
  sp('tkh_overload', 'Перегрузка', 'tkh', 2, 'rare', [P('status', 'choose-enemy-creature', { id: 'stun', turns: 2 })], 'Оглуши существо на 2 хода.'),
  sp('tkh_storm', 'Прокси-буря', 'tkh', 4, 'epic', [P('damage', 'all-enemy-creatures', { n: 2, vsTag: { mech: 4 } })], '2 урона всем вражеским существам (4 механизмам).'),
  gd('tkh_altar', 'Алтарь Прокси', 'tkh', 2, 3, 'rare', [{ on: 'cast', op: 'draw', to: 'self-hero', n: 1, oncePerTurn: true }], 'Первое заклинание за ход: возьми карту. 3 заряда.'),
  cr('tkh_aztun', 'Шаман Азтун', 'tkh', 6, 4, 6, 'legendary', [], [P('summon', 'self', { card: 'tok_fetish', n: 2 })], 'Выход: призови 2 Фетиша.'),

  // ---------- Кринжгоны ----------
  cr('crg_giggle', 'Хихикающий кринжгон', 'crg', 2, 1, 2, 'common', [], [{ on: 'aura', op: 'cringe', n: 1 }], 'Кринж-аура 1.', { cringe: 1 }),
  cr('crg_mime', 'Кринж-мим', 'crg', 2, 2, 1, 'common', [], [P('status', 'choose-enemy-creature', { id: 'cringed', turns: 1 })], 'Выход: существо врага −2 АТК до его хода.'),
  cr('crg_diss', 'Дисс', 'crg', 3, 3, 3, 'rare', [], [P('discard', 'enemy-hero', { n: 1 })], 'Выход: противник сбрасывает случайную карту.'),
  cr('crg_beacon', 'Кринж-маяк', 'crg', 3, 0, 5, 'rare', ['taunt'], [{ on: 'aura', op: 'cringe', n: 1 }], 'Заслон. Кринж-аура 1.', { cringe: 1 }),
  cr('crg_scribe', 'Кринж-сценарист', 'crg', 4, 3, 3, 'common', [], [P('drain', 'enemy-hero', { n: 2 })], 'Выход: 2 урона герою врага, лечи своего на 2.'),
  cr('crg_knight', 'Рыцарь неловкости', 'crg', 4, 4, 3, 'common', ['shield'], [], 'Щит.'),
  cr('crg_collector', 'Мелкий собиратель', 'crg', 5, 4, 5, 'rare', [], [P('steal', 'enemy-hero', { what: 'hand', n: 1 })], 'Выход: забери случайную карту из руки врага.'),
  cr('crg_horror', 'Пепельный ужас', 'crg', 6, 5, 6, 'epic', [], [{ on: 'aura', op: 'cringe', n: 1 }], 'Кринж-аура 1.', { cringe: 1 }),
  sp('crg_joke', 'Неловкая шутка', 'crg', 1, 'common', [P('status', 'choose-enemy-creature', { id: 'cringed', turns: 1, atk: -3 }), P('damage', 'choose-enemy-creature', { n: 1 })], 'Существо врага −3 АТК до его хода, 1 урон.'),
  sp('crg_roast', 'Прожарка', 'crg', 2, 'common', [P('damage', 'enemy-hero', { n: 2 }), P('draw', 'self-hero', { n: 1 })], '2 урона герою врага. Возьми карту.'),
  sp('crg_wave', 'Волна кринжа', 'crg', 5, 'epic', [P('status', 'all-enemy-creatures', { id: 'cringed', turns: 2, atk: -3 }), P('damage', 'all-enemy-creatures', { n: 2 })], 'Враги −3 АТК на 2 хода и 2 урона.'),
  gd('crg_projector', 'Кринж-проектор', 'crg', 3, 3, 'rare', [{ on: 'turn-end', op: 'damage', to: 'enemy-hero', n: 1 }], 'Конец хода: 1 урон герою врага. 3 заряда.'),
  cr('crg_chief', 'Кринж-Вождь', 'crg', 8, 7, 7, 'legendary', [], [{ on: 'aura', op: 'cringe', n: 2 }, P('damage', 'enemy-hero', { n: 3 })], 'Кринж-аура 2. Выход: 3 урона герою врага.', { cringe: 2 }),

  // ---------- Нейтральные ----------
  cr('neu_beggar', 'Нищий с радио', 'neu', 1, 1, 1, 'common', [], [], 'Радио ловит только «Голос Пустошей».'),
  cr('neu_refugee', 'Беженец Гармонии', 'neu', 1, 1, 2, 'common', [], [D('heal', 'self-hero', { n: 2 })], 'Финал: лечи героя на 2.'),
  cr('neu_scav', 'Бродячий мусорщик', 'neu', 2, 2, 2, 'common', [], [], ''),
  cr('neu_rustdroid', 'Ржавый дроид', 'neu', 2, 1, 1, 'common', ['poison'], [], 'Яд.', { tags: ['mech'] }),
  cr('neu_seer', 'Предсказатель', 'neu', 2, 1, 3, 'common', [], [P('scry', 'self-hero', { n: 1 })], 'Выход: посмотри верхнюю карту, можешь сбросить её.'),
  cr('neu_caravan', 'Караванщик', 'neu', 3, 2, 2, 'common', [], [P('draw', 'self-hero', { n: 1 })], 'Выход: возьми карту.'),
  cr('neu_militia', 'Ополченец селений', 'neu', 3, 2, 4, 'common', ['taunt'], [], 'Заслон.'),
  cr('neu_mechanid', 'Механид-разведчик', 'neu', 3, 3, 2, 'common', ['rush'], [], 'Рывок.', { tags: ['mech'] }),
  cr('neu_cultist', 'Культист Судьи', 'neu', 3, 3, 2, 'common', [], [D('draw', 'self-hero', { n: 1 })], 'Финал: возьми карту (душа ушла в Киберспейс).'),
  cr('neu_rebel', 'Восставший раб', 'neu', 4, 4, 3, 'common', ['rush'], [], 'Рывок.'),
  cr('neu_ghost', 'Дух Киберспейса', 'neu', 4, 3, 3, 'rare', ['shield'], [], 'Щит.'),
  cr('neu_parasite', 'Паразит Судьи', 'neu', 4, 3, 3, 'rare', [], [P('destroy', 'choose-enemy-creature', { where: { costMax: 2 } })], 'Выход: уничтожь вражеское существо со стоимостью 2 или меньше.'),
  cr('neu_skrilet', 'Скрилет', 'neu', 5, 5, 4, 'rare', [], [], 'Бездушен: не замечает Кринж-ауру.', { immuneCringe: true }),
  cr('neu_warprom', 'Танк Военпрома', 'neu', 6, 5, 7, 'epic', [], [], 'Очень много брони, мало смысла.', { tags: ['mech'] }),
  sp('neu_medkit', 'Аптечка', 'neu', 1, 'common', [P('heal', 'choose-any', { n: 4 })], 'Лечи 4 любому персонажу.'),
  sp('neu_grenade', 'Самодельная граната', 'neu', 2, 'common', [P('damage', 'choose-enemy-creature', { n: 3 })], '3 урона существу.'),
  sp('neu_radio', 'Голос Пустошей', 'neu', 2, 'common', [P('draw', 'self-hero', { n: 2 })], 'Возьми 2 карты.'),
  sp('neu_sabotage', 'Диверсия', 'neu', 3, 'rare', [P('destroy', 'choose-enemy-creature', { where: { kw: 'taunt' } })], 'Уничтожь вражеское существо с Заслоном.'),
  gd('neu_generator', 'Генератор Лиса', 'neu', 2, 3, 'rare', [{ on: 'turn-start', op: 'gain', to: 'self-hero', n: 1 }], 'Начало хода: +1 заряд на этот ход. 3 заряда.'),
  cr('neu_judge', 'Судья', 'neu', 10, 8, 8, 'legendary', [], [P('devour', 'all-other-creatures', { atkPer: 1, hpPer: 1 })], 'Выход: уничтожь все остальные существа; получи +1/+1 за каждое.'),
];

export const CARDS = Object.fromEntries(LIST.map((c) => [c.id, c]));
export const CARD_IDS = LIST.filter((c) => !c.token).map((c) => c.id);
export const cardsBySet = (set) => LIST.filter((c) => c.set === set && !c.token);

// Герои-лидеры: пассивка всегда; сила героя — раз за ход за heroPowerCost.
export const CARD_HEROES = {
  'h-wanderer': { name: 'Странник', set: 'neu', hp: 25, passive: 'Нет.', power: { name: 'Перевязка', fx: [{ op: 'heal', to: 'self-hero', n: 2 }], text: 'Лечи героя на 2.' } },
  'h-ai': { name: 'Генерал ИИ', set: 'ai', npc: 'general-ai', hp: 25, passive: 'Бюрократия: твои Гаджеты стоят на 1 дешевле.', power: { name: 'Директива', fx: [{ op: 'buff', to: 'choose-ally-creature', atk: 1, turns: 1 }], text: 'Союзное существо +1 АТК до конца хода.' } },
  'h-tin': { name: 'Хан', set: 'tin', npc: 'khan', hp: 25, passive: 'Кодекс: существа с Щитом получают +1 АТК.', power: { name: 'Стойка', fx: [{ op: 'armor', to: 'self-hero', n: 2 }], text: 'Герой получает 2 брони (до своего следующего хода).' } },
  'h-pir': { name: 'Капитан Буревестник', set: 'pir', npc: 'burevestnik', hp: 25, passive: 'Знает заранее: в стартовой руке на 1 карту больше.', power: { name: 'Контрабанда', fx: [{ op: 'draw', to: 'self-hero', n: 1 }, { op: 'damage', to: 'self-hero', n: 1 }], text: 'Возьми карту, получи 1 урон.' } },
  'h-scv': { name: 'Король свалок', set: 'scv', npc: 'glava-musora', hp: 25, passive: 'Барахло: Хлам получает +1 ЗДР.', power: { name: 'Разобрать', fx: [{ op: 'summon', to: 'self', card: 'tok_scrap', n: 1 }], text: 'Призови Хлам.' } },
  'h-mut': { name: 'Зверь', set: 'mut', npc: 'zver', hp: 25, passive: 'Стая: существа с Ядом получают +1 АТК.', power: { name: 'Регенерация', fx: [{ op: 'heal', to: 'choose-ally', n: 2 }], text: 'Лечи союзного персонажа на 2.' } },
  'h-tkh': { name: 'Шаман Азтун', set: 'tkh', npc: 'aztun', hp: 25, passive: 'Прокси: первое заклинание каждого хода стоит на 1 дешевле.', power: { name: 'Прокси-искра', fx: [{ op: 'damage', to: 'choose-enemy-creature', n: 1, vsTag: { mech: 2 } }], text: '1 урон существу (2 механизму).' } },
  'h-crg': { name: 'Кринж-Вождь', set: 'crg', npc: 'cringe-chief', hp: 25, passive: 'Неловкость: Кринж-аура сильнее на 1 (суммарно до −3).', power: { name: 'Неловкая пауза', fx: [{ op: 'status', to: 'choose-enemy-creature', id: 'cringed', turns: 1, atk: -1 }], text: 'Существо врага −1 АТК до его хода.' } },
};

// Колоды: 'id' или 'id:2' через пробел. По 20 карт; не более 2 копий (легенда — 1).
const deck = (s) => s.split(/\s+/).flatMap((t) => { const [id, n = 1] = t.split(':'); return Array(+n).fill(id); });

export const STARTER_DECK = deck('neu_beggar:2 neu_refugee:2 neu_scav:2 neu_rustdroid:2 neu_seer:2 neu_caravan:2 neu_militia:2 neu_mechanid neu_cultist neu_rebel:2 neu_medkit:1 neu_grenade:1');
// длина 20 проверяется в tools (см. спеку §7)

// 12 соперников: узел — npcHome(id). stake — ставка в кредитах; reward — карты за победу (первая победа).
// ai — профиль ИИ: aggro 0..1 (охота за лицом), risk 0..1 (готовность к невыгодному размену).
export const CARD_RIVALS = [
  { npc: 'rc-tuz', node: 'raytsentr', hero: 'h-pir', stake: 15, tier: 1, ai: { aggro: 0.3, risk: 0.2 }, reward: ['pir_rat'],
    deck: deck('pir_rat:2 pir_yunga:2 pir_barrel:2 pir_kontra:2 pir_bosun:2 pir_bet:2 pir_cannon pir_sharper neu_scav:2 neu_medkit:2 neu_grenade neu_caravan') },
  { npc: 'old-lockpick', node: 'pirates-m30', hero: 'h-wanderer', stake: 25, tier: 1, ai: { aggro: 0.2, risk: 0.3 }, reward: ['neu_seer'],
    deck: deck('neu_beggar:2 neu_scav:2 neu_rustdroid:2 neu_seer:2 neu_caravan:2 neu_militia:2 neu_mechanid:2 neu_grenade:2 neu_radio:2 neu_cultist:2') },
  { npc: 'rat-toma', node: 'svalka', hero: 'h-scv', stake: 30, tier: 2, ai: { aggro: 0.4, risk: 0.3 }, reward: ['scv_digger'],
    deck: deck('scv_rat:2 scv_hoarder:2 scv_digger:2 scv_raider:2 scv_pile:2 scv_junk:2 scv_welder:2 scv_hunter neu_scav:2 neu_rustdroid:2 neu_medkit') },
  { npc: 'shchup', node: 'svalka', hero: 'h-scv', stake: 40, tier: 2, ai: { aggro: 0.7, risk: 0.5 }, reward: ['scv_raider'],
    deck: deck('scv_rat:2 scv_raider:2 scv_digger:2 scv_junk:2 scv_welder:2 scv_hunter:2 scv_slide scv_salvage neu_mechanid:2 neu_rebel:2 neu_grenade:2') },
  { npc: 'duel-master', node: 'cc-duel-club', hero: 'h-ai', stake: 50, tier: 2, ai: { aggro: 0.5, risk: 0.4 }, reward: ['ai_inspector'],
    deck: deck('ai_clerk:2 ai_stenog:2 ai_drone:2 ai_guard:2 ai_inspector:2 ai_decree:2 ai_terminal:2 ai_tank neu_militia:2 neu_grenade:2 neu_medkit') },
  { npc: 'boomerang', node: 'putinlyandiya', hero: 'h-ai', stake: 60, tier: 3, ai: { aggro: 0.4, risk: 0.5 }, reward: ['ai_audit'],
    deck: deck('ai_drone:2 ai_stenog:2 ai_bureaucrat:2 ai_agitator ai_guard:2 ai_audit:2 ai_decree:2 ai_terminal ai_tank:2 neu_caravan:2 neu_radio:2') },
  { npc: 'colonel-shurup', node: 'kreml', hero: 'h-ai', stake: 80, tier: 3, ai: { aggro: 0.8, risk: 0.5 }, reward: ['neu_warprom'],
    deck: deck('ai_drone:2 ai_guard:2 ai_tank:2 ai_agitator ai_bureaucrat:2 ai_decree:2 ai_purge ai_terminal:2 neu_warprom:2 neu_rebel:2 neu_grenade:2') },
  { npc: 'sekiro', node: 'velikaya-arena', hero: 'h-tin', stake: 100, tier: 4, ai: { aggro: 0.6, risk: 0.6 }, reward: ['tin_nail'],
    deck: deck('tin_ronin:2 tin_duelist:2 tin_archer:2 tin_monk:2 tin_smith:2 tin_samurai:2 tin_nail tin_kata:2 tin_duel:2 tin_rain tin_dojo:2') },
  { npc: 'aunt-loza', node: 'garmoniya', hero: 'h-mut', stake: 120, tier: 4, ai: { aggro: 0.4, risk: 0.4 }, reward: ['mut_loza'],
    deck: deck('mut_sprout:2 mut_wolf:2 mut_toad:2 mut_cap:2 mut_loza:2 mut_grunya:2 mut_chimera mut_bloom:2 mut_howl:2 mut_spores mut_greenhouse:2') },
  { npc: 'ritualist-iskra', node: 'stanok', hero: 'h-tkh', stake: 150, tier: 5, ai: { aggro: 0.5, risk: 0.5 }, reward: ['tkh_iskra'],
    deck: deck('tkh_fetish:2 tkh_shaman:2 tkh_proxy:2 tkh_drummer:2 tkh_totem:2 tkh_rzhaven:2 tkh_iskra:2 tkh_idol tkh_overload:2 tkh_storm:2 tkh_altar') },
  { npc: 'cringe-jester', node: 'pepelnoe-gornilo', hero: 'h-crg', stake: 200, tier: 5, ai: { aggro: 0.6, risk: 0.7 }, reward: ['crg_wave'],
    deck: deck('crg_giggle:2 crg_mime:2 crg_diss:2 crg_beacon:2 crg_scribe:2 crg_knight:2 crg_collector crg_horror crg_joke:2 crg_roast:2 crg_wave crg_projector') },
  { npc: 'madam-stavka', node: 'pirates-m30', hero: 'h-pir', stake: 250, tier: 5, ai: { aggro: 0.6, risk: 0.8 }, reward: ['pir_stavka'], boss: true,
    deck: deck('pir_rat:2 pir_barrel:2 pir_sharper:2 pir_gunner:2 pir_boarder:2 pir_bet:2 pir_boarding:2 pir_storm pir_cannon:2 pir_stavka neu_radio:2') },
];

// ---------- Казино ----------
export const CASINO = {
  node: 'pirates-m30',          // Бар Лагуны (lagoon-bar → pirates-m30; в узле уже есть nsa-dec-casino «игорный зал»)
  owner: 'madam-stavka',
  name: 'Игорный зал «Бар Лагуны»',
  limits: { dailyNetLoss: 300, maxBet: { cards: 250, dice: 100, slots: 50, roulette: 100 }, minBet: { cards: 10, dice: 10, slots: 5, roulette: 5 }, dailyNetWin: 500, bannedAfterWin: 'выигрыш за день > dailyNetWin — Мадам закрывает столы до утра (мухлёж по-честному)' },
  slots: { // 3 барабана, одинаковые ленты (12 позиций), RTP ≈ 93.6%
    reel: { tushenka: 4, gear: 3, radio: 2, skull: 1, cringe: 1, judge: 1 },
    names: { tushenka: 'Тушёнка', gear: 'Шестерёнка', radio: 'Радио', skull: 'Скелет-череп', cringe: 'Кринж-маска', judge: 'Глаз Судьи' },
    triple: { tushenka: 6, gear: 10, radio: 20, skull: 40, cringe: 80, judge: 200 },
    any: { twoCringe: 3, twoTushenka: 1 }, // иначе 0
  },
  dice: { // «Кости Пустоши»: 2d6 против дома, RTP ≈ 95%
    payout: 2, doubleBonus: 1, tieWinner: 'house', rerollOne: 'раз за раунд; игрок решает сам, дом — если сумма < 7',
  },
  roulette: { pockets: 38, special: ['0', '00 «Кринж»'], pay: { straight: 35, redBlack: 1, evenOdd: 1, dozen: 2 }, rtp: 36 / 38 },
  debt: { lender: 'madam-stavka', maxLoan: 200, interestPer3Days: 0.2, dueDays: 9, overdue: { rep: { pirates: -3 }, collectorBattle: 'w-road-pirates', blocksTables: true } },
  quests: { debt: 'q-casino-debt', tournament: 'q-casino-tournament' }, // ids под будущую запись quests-npc.js
  tournament: { entry: 100, rounds: 3, field: ['rc-tuz', 'old-lockpick', 'madam-stavka'], prize: { credits: 500, card: 'pir_stavka', rep: { pirates: 5 } }, cooldownDays: 14 },
};

// Продавцы карт и награды — таблицы дропа (подробности и числа — в спеке)
export const CARD_ECONOMY = {
  packSize: 5, packPrice: 80, packGuarantee: 'минимум 1 редкая или выше',
  vendors: [
    { npc: 'trader-dublon', node: 'pirates-m30', stock: ['pir', 'neu'], pack: true },
    { npc: 'rc-tuz', node: 'raytsentr', stock: ['pir', 'neu'], pack: false },
    { npc: 'sborshchik', node: 'svalka', stock: ['scv', 'neu'], pack: true },
    { npc: 'archivist-nine', node: 'putinlyandiya', stock: ['ai', 'neu'], pack: true },
  ],
  winPack: { chance: 0.25, from: 'set соперника' },
  lootChance: { common: 0.04, boss: 0.25 }, // карта из лута боя: id набора по фракции врага
  bossCards: { legendary: 'один раз за убийство босса фракции' },
};
