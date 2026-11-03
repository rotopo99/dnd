// Перемещение: граф путей и таблицы встреч. Спека: docs/specs/world.md, п. 2.
// Путь двусторонний. days — дни пути (0 — внутри поселения: без смены дня, одна проверка встречи, если danger > 0).
// danger — опасность пути; по умолчанию — опасность региона узла `to`. region — чья таблица встреч (по умолчанию регион `to`).
// hidden: true — путь не виден, пока не открыт (флаг reveal, слух или world-флаг hidden-routes / squeeze).
// requires — как у узла.

export const ROUTES = [
  // --- хаб
  { from: 'alpha-harmony', to: 'harmony-reactor', days: 0, danger: 0 },
  { from: 'alpha-harmony', to: 'harmony-sector-d', days: 0, danger: 0 },
  { from: 'alpha-harmony', to: 'funicular', days: 0, danger: 0 },
  // --- дорога «к маякам»
  { from: 'funicular', to: 'galina-dacha', days: 1, danger: 1 },
  { from: 'galina-dacha', to: 'dacha-hatch', days: 0, danger: 0, hidden: true, reveal: 'galina-told' },
  { from: 'galina-dacha', to: 'neutral-villages', days: 1, danger: 1 },
  { from: 'neutral-villages', to: 'villages-tower', days: 1, danger: 1 },
  { from: 'neutral-villages', to: 'cringe-border', days: 1, danger: 2 },
  { from: 'cringe-border', to: 'beacon-north', days: 0, danger: 2 },
  { from: 'cringe-border', to: 'beacon-east', days: 0, danger: 2 },
  { from: 'cringe-border', to: 'beacon-swamp', days: 1, danger: 2, hidden: true, reveal: 'khikhik-talked' },
  // --- дорога «к огню»
  { from: 'funicular', to: 'agrozone', days: 2, danger: 2 },
  { from: 'neutral-villages', to: 'agrozone', days: 2, danger: 2 },
  { from: 'agrozone', to: 'burg-svoboda', days: 1, danger: 2 },
  { from: 'agrozone', to: 'burg-beton', days: 1, danger: 1 },
  { from: 'agrozone', to: 'cleaner-checkpoint', days: 1, danger: 2 },
  { from: 'burg-svoboda', to: 'agro-elevator', days: 1, danger: 2 },
  { from: 'cleaner-checkpoint', to: 'burg-svoboda', days: 1, danger: 2 },
  // --- дорога «к мёртвым»
  { from: 'funicular', to: 'cc-gate', days: 2, danger: 3 },
  { from: 'cc-gate', to: 'corruption-city', days: 0, danger: 0 },
  { from: 'corruption-city', to: 'cc-carwash', days: 0, danger: 0 },
  { from: 'corruption-city', to: 'cc-duel-club', days: 0, danger: 0 },
  { from: 'corruption-city', to: 'cc-dead-streets', days: 0, danger: 3 },
  { from: 'cc-dead-streets', to: 'cc-temple', days: 0, danger: 3 },
  { from: 'cc-temple', to: 'cc-node', days: 0, danger: 0, requires: { flag: 'cc-node-found' } },
  // --- тайный путь Алика: из подвала автомойки в Агрозону мимо ворот
  { from: 'cc-carwash', to: 'agrozone', days: 2, danger: 2, hidden: true, reveal: 'alik-tunnel' },
];

/** Встреча, если d20 <= ENCOUNTER_PER_DANGER × danger + mod (не ниже 1 при danger > 0). */
export const ENCOUNTER_DIE = 20;
export const ENCOUNTER_PER_DANGER = 3;

/** Модификаторы шанса встречи (world.md, п. 2). */
export const ENCOUNTER_MODS = {
  safeRouteBestTwo: true,                 // флаг safe-route: суммируются два лучших value в партии
  pirates: { friendly: -1, ally: -2 },    // пираты контролируют дороги
  night: 3,                               // ночной переход (−1 день при days ≥ 2); night-sight гасит
};

/** Засада: групповая проверка Наблюдательности; провал — враги +5 к инициативе. no-ambush — без проверки. */
export const AMBUSH = { skill: 'perception', dc: 12, enemyInit: 5 };

/** Привал в поле: доля восстановления и бросок встречи как за день пути. */
export const FIELD_CAMP = { restore: 0.5, encounterRoll: true };

/**
 * Таблицы встреч по регионам. w — вес. raceWeight — множитель веса, если такая раса есть в партии.
 * kind:
 *   battle  — { encounter, faction } (бой отменяется, если репутация с faction >= friendly: вместо него trader/rumor)
 *   event   — { id, text, check: { skill | skills, dc, group? }, success: Outcome, fail: Outcome }
 *   trader  — { stock: [item id] }
 *   rumor   — открыть случайный скрытый узел/путь региона или тайник
 *   npc     — встреча с NPC «пустошей» (npcs.js location 'wastes'): { npc }
 *   unique  — уникальный ивент персонажа партии настолки (пишет сценарист): { npc, event }, once
 * Outcome: { text, xp?, credits?, rep?: { faction: delta }, items?: [{ item, n }], hp?: -N (каждому), mrl?: -N, battle?: encounter, flag? }
 */
export const ENCOUNTER_TABLES = {
  harmony: [],

  villages: [
    { w: 3, kind: 'battle', encounter: 'w-villages-jesters', faction: 'cringegons' },
    { w: 3, kind: 'battle', encounter: 'w-road-crawlers', faction: null },
    { w: 1, kind: 'battle', encounter: 'w-road-pirates', faction: 'pirates' },
    { w: 2, kind: 'event', id: 'ev-lost-goat', text: 'На дороге мечется коза старейшины. Козу надо вернуть, а она против.',
      check: { skills: ['survival', 'athletics'], dc: 12 },
      success: { text: 'Коза дома. Селяне запомнили.', xp: 50, rep: { neutralVillages: 3 } },
      fail: { text: 'Коза победила. Партия в навозе.', mrl: -2 } },
    { w: 2, kind: 'event', id: 'ev-beacon-echo', text: 'Ветер приносит обрывок кринж-анекдота. Хочется засмеяться и умереть.',
      check: { skill: 'meditation', dc: 13, group: true },
      success: { text: 'Выдержали. Даже не улыбнулись.', xp: 40 },
      fail: { text: 'Кто-то хихикнул. Всем стыдно.', mrl: -4 } },
    { w: 2, kind: 'trader', stock: ['medkit', 'calmers', 'oak-amulet'] },
    { w: 1, kind: 'rumor' },
    { w: 1, kind: 'npc', npc: 'nomad-vetla' },
    { w: 1, kind: 'unique', npc: 'artyom', event: 'cameo-artyom', once: true },
  ],

  agrozone: [
    { w: 4, kind: 'battle', encounter: 'w-agro-cleaners', faction: 'agrozone' },
    { w: 3, kind: 'battle', encounter: 'w-agro-rebels', faction: 'renegades' },
    { w: 1, kind: 'battle', encounter: 'w-road-scavengers', faction: 'scavengers', raceWeight: { skeleton: 3 } },
    { w: 2, kind: 'event', id: 'ev-refugees', text: 'Колонна беженцев с полей. Просят воды и дорогу к Гармонии.',
      check: { skills: ['persuasion', 'survival'], dc: 12 },
      success: { text: 'Показали дорогу. Кто-то сунул вам банку тушёнки.', xp: 60, rep: { renegades: 2, tekhnikumy: 2 }, items: [{ item: 'medkit', n: 1 }] },
      fail: { text: 'Колонна разбрелась. Чистильщики найдут их раньше.', mrl: -3 } },
    { w: 2, kind: 'event', id: 'ev-burning-row', text: 'Огонь перекинулся на дорогу. Обход — полдня.',
      check: { skills: ['athletics', 'acrobatics'], dc: 13, group: true },
      success: { text: 'Проскочили сквозь дым.', xp: 40 },
      fail: { text: 'Обожглись.', hp: -4 } },
    { w: 1, kind: 'trader', stock: ['medkit', 'rations'] },
    { w: 1, kind: 'rumor' },
    { w: 1, kind: 'npc', npc: 'mad-nail' },
    { w: 1, kind: 'unique', npc: 'party-victor', event: 'cameo-victor', once: true },
  ],

  corruption: [
    { w: 3, kind: 'battle', encounter: 'w-cc-dead', faction: 'cult' },
    { w: 2, kind: 'battle', encounter: 'w-cc-gate', faction: 'aiParty' },
    { w: 1, kind: 'battle', encounter: 'w-road-pirates', faction: 'pirates' },
    { w: 2, kind: 'event', id: 'ev-polite-dead', text: 'Мёртвый в шляпе вежливо спрашивает, который час. И какой год. И где его тело.',
      check: { skills: ['persuasion', 'religion', 'judge'], dc: 14 },
      success: { text: 'Душа благодарит и рассказывает, куда её тянет: к Храму Приговора.', xp: 80, flag: 'rumor-temple' },
      fail: { text: 'Душа обижается и холодно касается вас.', mrl: -5 } },
    { w: 2, kind: 'event', id: 'ev-id-scan', text: 'Патрульный дрон сканирует ID-чипы.',
      check: { skills: ['hacking', 'deception', 'stealth'], dc: 14 },
      success: { text: 'Дрон улетел, довольный.', xp: 60 },
      fail: { text: 'Тревога! Вы в розыске.', rep: { aiParty: -5 }, battle: 'w-cc-gate' } },
    { w: 1, kind: 'trader', stock: ['medkit', 'calmers', 'grenade', 'oak-amulet'] },
    { w: 1, kind: 'rumor' },
    { w: 1, kind: 'npc', npc: 'wanderer-knife' },
    { w: 1, kind: 'unique', npc: 'liza', event: 'cameo-liza', once: true },
    { w: 1, kind: 'unique', npc: 'kuksius', event: 'cameo-kuksius', once: true },
  ],
};

/** Отдельные события для уникальных встреч, которые не привязаны к таблице (пишет сценарист). */
export const UNIQUE_EVENTS = ['cameo-artyom', 'cameo-victor', 'cameo-liza', 'cameo-kuksius', 'cameo-repa'];
