// Поручения резерву (docs/specs/expeditions.md, feedback 2026-11-07). Только данные.
// Резерв = напарник со state 'waiting' (world/companions.js idleHome). Экспедиция: `p.exp = { type, target, start, days, mode }`.

export const EXP_RULES = {
  maxActive: 2,                  // экспедиций одновременно
  minLoyalty: -19,               // ниже — «Остыл», отказывается (loyaltyBand)
  levelCapDelta: 3,              // нельзя посылать в регион, где min-уровень > ур. напарника + 3
  careful: { rewardMul: 0.6, riskDelta: -3, noDeath: true },   // осторожный режим
  risky:   { rewardMul: 1.4, riskDelta: +3, noDeath: false },  // рискованный
  normal:  { rewardMul: 1.0, riskDelta: 0,  noDeath: false },
  deathMinDanger: 4,             // смерть возможна только при danger региона ≥ 4 (и режим не careful)
  captiveRescueDays: 5,          // пленён: срок на спасение, потом исчезает (state 'lost'; вернуть — квест)
  woundedRestDays: 2,            // ранен: недоступен N дней, −hp при возвращении (hp × 0.5)
  baseOpenRequired: false,       // базу открывать необязательно: узел отправки = idleHome
  homeRule: 'idle-home-or-node', // отправить можно с узла idleHome, или с узла партии, где напарник ждёт (p.waitAt)
  xpShare: 0.5,                  // опыт напарника за успех = награда × COMPANION_RULES.xp.waitingShare
};

/** СЛ = base + 2 × danger региона + len (длительность). Бросок: d20 + мод. навыка напарника (checkInfo) + ⌊(ур. − уровень региона)/2⌋ + режим. */
export const EXP_DC = { base: 8, perDanger: 2, perDay: 0.5, minDanger: 0 };

/** Типы экспедиций. skills — любой из них (лучший). days — [мин, макс] по расстоянию до региона (1 хоп = +1). */
export const EXP_TYPES = {
  loot: {
    name: 'Лут в регионе', icon: 'loot', days: [2, 4], skills: ['survival', 'perception', 'stealth', 'athletics'],
    desc: 'Обыскать окрестности: оружие, детали, расходники из таблицы региона.',
    reward: { credits: [30, 80], rolls: 2, table: 'region-loot', perLevel: 8 },
    needs: { region: true },
  },
  trade: {
    name: 'Торговля', icon: 'trade', days: [3, 5], skills: ['persuasion', 'deception', 'analysis'],
    desc: 'Продать хлам в хабе региона: креды по спросу, +репутация, шанс редкого товара.',
    reward: { creditsMulOfCarried: 1.15, rep: 1, rare: 0.15 },
    needs: { region: true, carry: 'junk-or-items', hub: true },
  },
  scout: {
    name: 'Разведка узла', icon: 'scout', days: [2, 3], skills: ['perception', 'stealth', 'survival', 'analysis'],
    desc: 'Узнать про узел: слухи, скрытые маршруты/тайники, метки опасности на карте.',
    reward: { discover: 'node-or-route', rumors: 1, markDanger: true, xp: 30 },
    needs: { node: true },
  },
  quest: {
    name: 'Закрыть простое поручение', icon: 'quest', days: [2, 6], skills: [],
    desc: 'Закрыть мелкий density-квест (флаг autoable): одна проверка, без боёв и выборов. Награда — как у игрока, с множителем 0.8.',
    reward: { questRewardMul: 0.8 },
    needs: { quest: 'autoable', questActive: true },
  },
};

/**
 * Квесты с флагом autoable (программист добавляет `autoable: true` в density-quests.js / читает этот список).
 * Критерий: единственная цель-проверка (`check`), без боя, без выбора, без `exodus.ext`.
 * skills — навыки проверки (из самого квеста); dc — СЛ.
 */
export const AUTOABLE_QUESTS = {
  'dq-antenna':      { loc: 'alpha-harmony', skills: ['tech', 'athletics', 'acrobatics'], dc: 11 },
  'dq-gorshok':      { loc: 'garmoniya', skills: ['perception', 'biology', 'survival'], dc: 12 },
  'dq-kolokol':      { loc: 'peremoga', skills: ['tech', 'athletics'], dc: 13 },
  'dq-shesterni':    { loc: 'stanok', skills: ['analysis', 'tech', 'proxy'], dc: 14 },
  'dq-talisman':     { loc: 'zavod', skills: ['perception', 'proxy', 'survival'], dc: 13 },
  'dq-plata':        { loc: 'betonka', skills: ['analysis', 'perception', 'persuasion'], dc: 13 },
  'dq-karta':        { loc: 'raytsentr', skills: ['analysis', 'perception', 'persuasion'], dc: 13 },
  'dq-ucheniza':     { loc: 'dodze', skills: ['persuasion', 'survival', 'religion'], dc: 13 },
  'dq-shtamp':       { loc: 'selyshko', skills: ['analysis', 'perception', 'persuasion'], dc: 13 },
  'dq-klyuch-kazny': { loc: 'pirates-m30', skills: ['perception', 'survival', 'lockpicking'], dc: 12 },
  'dq-zhetony':      { loc: 'kreml', skills: ['perception', 'military'], dc: 14 },
  'dq-stranitsa':    { loc: 'baza-predlozhki', skills: ['analysis', 'perception', 'persuasion'], dc: 15 },
  'dq-tom':          { loc: 'libraries-m39', skills: ['analysis', 'perception', 'survival'], dc: 13 },
};

/**
 * Исходы: margin = бросок − СЛ. Строка выбирается по margin; nat 20 — на одну строку лучше, nat 1 — на одну хуже.
 * mul — множитель награды. loyalty — Δ одобрения. Смерть — только если danger ≥ deathMinDanger и режим не careful, иначе заменяется на captured/hurt.
 */
export const EXP_OUTCOMES = [
  { id: 'great',    minMargin: 8,   mul: 1.5, loyalty: +3, hp: 0,   state: null,       text: 'Блестяще: вернулся с лихвой, ещё и байку привёз.' },
  { id: 'success',  minMargin: 0,   mul: 1.0, loyalty: +2, hp: 0,   state: null,       text: 'Справился. Вернулся к сроку.' },
  { id: 'partial',  minMargin: -4,  mul: 0.5, loyalty: 0,  hp: 0,   state: null,       text: 'Частично: что-то нашёл, что-то потерял по дороге.' },
  { id: 'hurt',     minMargin: -9,  mul: 0,   loyalty: -3, hp: 0.5, state: 'wounded',  text: 'Ранен: вернулся хромая, без добычи. Нужно 2 дн. отдыха.' },
  { id: 'captured', minMargin: -14, mul: 0,   loyalty: -5, hp: 0,   state: 'captive',  text: 'Попал в плен. Срок спасения — 5 дней.' },
  { id: 'dead',     minMargin: -99, mul: 0,   loyalty: 0,  hp: 0,   state: 'dead',     text: 'Не вернулся. Находка: его вещи у дороги.' },
];

/** Базовая ставка плена/смерти по опасности региона (сверху применяется EXP_OUTCOMES выбором по margin). Смерть/плен — «опасные» исходы: danger < N → заменяются на hurt. */
export const EXP_DANGER_GATE = { captured: 2, dead: 4 };

/** Награды по региону для loot-таблицы (предметы из ITEMS). tier — по danger региона (0–1: 1, 2–3: 2, 4–5: 3). */
export const EXP_LOOT = {
  1: [{ id: 'medkit', w: 4 }, { id: 'calmers', w: 3 }, { id: 'rare-parts', w: 1 }],
  2: [{ id: 'medkit', w: 3 }, { id: 'servo-parts', w: 2 }, { id: 'rare-parts', w: 2 }, { id: 'lockpick-set', w: 1 }],
  3: [{ id: 'rare-parts', w: 3 }, { id: 'servo-parts', w: 3 }, { id: 'emp-grenade', w: 2 }, { id: 'terminal-shard', w: 1 }],
};

/** Лояльность и ограничения. */
export const EXP_LOYALTY = {
  sentOnTrait: +1,                // отправили по вкусу (loves-тег подходит типу)
  refusedBelow: -19,              // не пойдёт
  returnBonusBase: +2,            // см. EXP_OUTCOMES
  ghostedReturn: -4,              // не забрали из плена за captiveRescueDays
  banBlocks: ['leaving', 'cold'], // loyaltyBand
};

/** Подсказка «чьи навыки»: какие навыки считаем для типа, плюс бонус от талантов (worldFlag). */
export const EXP_FLAGS = { scoutBonus: 'hidden-routes', tradeBonus: 'cheap-trade', lootBonus: 'find-cache' };
