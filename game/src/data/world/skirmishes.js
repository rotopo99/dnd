// Стычки на карте мира (docs/specs/skirmishes.md): бой двух сторон, в который игрок может вмешаться.
// Только данные: логика (спавн маркеров, окно выбора, сборка боя) — в коде по спеке.
// Состав стороны = ростер + «микс» ролей (g/s/e/m) + диапазон уровня региона; числа крутит balance-tester.
import { RELATIONS, STANCES } from '../factions.js';

/** Полоса силы по уровню L (L = clamp(средний уровень партии, lo..hi региона)). */
export const BANDS = [
  { id: 1, from: 1, to: 3 },
  { id: 2, from: 4, to: 7 },
  { id: 3, from: 8, to: 11 },
  { id: 4, from: 12, to: 15 },
  { id: 5, from: 16, to: 20 },
];
export const bandOf = (level) => (BANDS.find((b) => level >= b.from && level <= b.to) || BANDS[BANDS.length - 1]).id;

/**
 * Ростеры. t — враги ур. 1–5 (индекс 0 = ур.1), hi — префикс фракции для полос 3–5:
 * `${hi}-vet-l8|12|16|20`, `${hi}-elite-…`, `${hi}-cmd-…` (L ≥ 18 → l20, 16–17 → l16, иначе ближайший вниз).
 */
export const ROSTERS = {
  pirates:         { faction: 'pirates',         hi: 'pir',  t: ['pir-deckhand', 'pir-knifer', 'pir-grenadier', 'pir-netrunner', 'pir-boarding-captain'] },
  warprom:         { faction: 'warprom',         hi: 'wp',   t: ['wp-conscript', 'wp-bayonet', 'wp-sniper', 'wp-stormtrooper', 'wp-kuznechik'] },
  aiParty:         { faction: 'aiParty',         hi: 'ai',   t: ['ai-patrol', 'ai-agitator', 'ai-riot', 'ai-laser-trooper', 'ai-commissar'] },
  tinBrotherhood:  { faction: 'tinBrotherhood',  hi: 'tin',  t: ['tin-novice', 'tin-ronin', 'tin-samurai', 'tin-hammer', 'tin-blade-master'] },
  renegades:       { faction: 'renegades',       hi: 'ren',  t: ['ren-partisan', 'ren-sapper', 'ren-fighter', 'ren-saboteur', 'ren-commissar'] },
  mechanids:       { faction: 'mechanids',       hi: 'mech', t: ['mech-node', 'mech-welder', 'mech-plagued', 'mech-cutter', 'mech-hive-node'] },
  cringegons:      { faction: 'cringegons',      hi: 'crg',  t: ['crg-heckler', 'crg-toastmaster', 'crg-bayanist', 'crg-brute', 'crg-collector-agent'] },
  scavengers:      { faction: 'scavengers',      hi: 'scv',  t: ['scv-picker', 'scv-magnet', 'scv-gunner', 'scv-sawman', 'scv-mech-pilot'] },
  tekhonki:        { faction: 'tekhonki',        hi: 'tek',  t: ['tek-acolyte', 'tek-keyman', 'tek-seeker', 'tek-ritualist', 'tek-golem'] },
  neutralVillages: { faction: 'neutralVillages', hi: 'nv',   t: ['nv-militia', 'nv-hunter', 'nv-watchman', 'nv-elder-guard', 'nv-elder-guard'] },
  agrozone:        { faction: 'agrozone',        hi: 'agro', t: ['agro-overseer', 'agro-sprayer', 'agro-loader', 'agro-harvester', 'agro-chief-overseer'] },
  mutantsPlant:    { faction: 'mutantsPlant',    hi: 'mutr', t: ['mutr-thornling', 'mutr-sporer', 'mutr-strangler', 'mutr-thorn-archer', 'mutr-treant'] },
  cult:            { faction: 'cult',            hi: 'cult', t: ['cult-neophyte', 'cult-terminalist', 'cult-plague-bearer', 'cult-executioner', 'cult-judge-hand'] },
  mutantsBeast:    { faction: 'mutantsBeast',    hi: 'mutz', t: ['mutz-sniffer', 'mutz-hunter', 'mutz-tusker', 'mutz-trapper', 'mutz-alpha'] },
  // случайные группы без фракции
  bandits:   { faction: null, hi: 'pir',  t: ['gang-thug', 'scavenger', 'pirate', 'pirate-gunner', 'scavenger-hunter'] },
  rebels:    { faction: 'renegades', hi: 'ren', t: ['rioter', 'rebel', 'rebel-gunner', 'rebel-veteran', 'rebel-veteran'] },
  beasts:    { faction: null, hi: 'mutz', t: ['fauna-ratwolf', 'fauna-ash-crow', 'fauna-glowboar', 'fauna-bloat', 'fauna-wire-spider'] },
  robots:    { faction: null, hi: 'mech', t: ['drone', 'junk-mech', 'crawler', 'turret', 'cleaner'] },
  cultists:  { faction: 'cult', hi: 'cult', t: ['cultist', 'acolyte', 'cultist-gunner', 'cultist-3', 'cultist-5'] },
  skrilets:  { faction: 'cult', hi: 'cult', t: ['skrilet', 'skrilet', 'skrilet', 'skrilet-5', 'skrilet-5'] },
  wolves:    { faction: 'warprom', hi: 'wp', t: ['wolf-1-grey', 'wolf-2-driver', 'wolf-3-fang', 'wolf-4-howler', 'wolf-5-matyorny'] },
};

/**
 * Роль → враг по полосе. Полосы 1–2: индексы в ROSTERS.t; полосы 3–5: vet/elite/cmd.
 * g — рядовой, s — сильнее, e — элита, m — командир.
 */
export const ROLE_TIER = {
  1: { g: 0, s: 1, e: 2, m: 2 },
  2: { g: 1, s: 2, e: 3, m: 4 },
  3: { g: 'vet', s: 'vet', e: 'elite', m: 'cmd' },
  4: { g: 'vet', s: 'vet', e: 'elite', m: 'cmd' },
  5: { g: 'vet', s: 'vet', e: 'elite', m: 'cmd' },
};
/** Суффикс уровня для полос 3–5 (вниз до ближайшего существующего). */
export const HI_SUFFIX = (level) => (level >= 18 ? 'l20' : level >= 16 ? 'l16' : level >= 12 ? 'l12' : 'l8');

/** Вес бойца для бюджета силы. */
export const UNIT_POWER = { g: 1, s: 1.5, e: 2.5, m: 3 };
/**
 * «1.0E» — обычная боевая встреча региона для партии из N: бюджет силы по размеру отряда (стартовые, подгоняет balance-tester).
 * Сторона набирается миксом, затем обрезается/добирается рядовыми до бюджета ±0.5.
 */
export const BUDGET = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13 };

/** Сила сторон (доля E). Тянется один вариант; у шаблона `even: true` — только «ровно». */
export const POWER_SPLITS = [
  { id: 'even',   a: 0.8, b: 0.8, w: 50 },
  { id: 'a-weak', a: 0.6, b: 1.0, w: 25 },
  { id: 'b-weak', a: 1.0, b: 0.6, w: 25 },
];

/** Правила появления и жизни маркеров на карте мира. */
export const SPAWN = {
  maxActive: 3,            // одновременно на карте
  perDayChance: 0.25,      // за каждый прошедший день (passDays), пока активных < maxActive
  perRegionMax: 1,
  lifeDays: [3, 6],        // срок жизни; по истечении — авторазрешение (сильная сторона побеждает), маркер пропадает
  roadChance: 0.35,        // шанс замены обычной боевой встречи в пути на «впереди бой» (только дорога/тропа/бездорожье, danger > 0)
  nodeShare: 0.5,          // доля маркеров, привязанных к узлу (осада/рейд); остальные — к пути между узлами
  minDanger: 1,            // регион с danger 0 — без стычек
  exodusCultMul: 2,        // метка Исхода ≥ 2: шаблоны с культом ×2 в вес; ≥ 4 — только они в регионах культа
  noSpawnAt: 'current',    // не появляются на узле, где стоит партия
  levelPad: 0,             // L = clamp(ср. уровень партии, lo..hi региона)
};

/** Выбор игрока: ключи совпадают с кодом/текстами `skirm.choice.*`. */
export const CHOICES = {
  joinA:   { team: 'heroes', allies: 'a', foes: ['b'], xpMul: 0.8, lootMul: 1.0, thanks: true },
  joinB:   { team: 'heroes', allies: 'b', foes: ['a'], xpMul: 0.8, lootMul: 1.0, thanks: true },
  all:     { team: 'heroes', allies: null, foes: ['a', 'b'], xpMul: 1.25, lootMul: 1.0, thanks: false },
  sneak:   { skill: 'stealth', group: true, dcBase: 10, dcPerDanger: 1, dcMax: 17, okXpMul: 0.1, fail: 'all', failInit: 2 },
  wait:    { simRounds: 8, hpFloorFrac: 0.15, deadLootMul: 0.5, survivorLootMul: 1.0, xpMul: 1.0, days: 0 },
};

/** Репутация. `foeSpread` — штраф врагам за вмешательство; распространение на союзников/врагов делает applyRep. */
export const REP = {
  join: 3,              // победа с стороной: +N её фракции
  joinFoe: -2,          // побеждённой стороне
  joinLose: 0,          // поражение/бегство — без репутации
  all: -2,              // против всех: −N каждой стороне с фракцией
  waitKillWinner: -1,   // добил победителя: −N его фракции
  waitScavenge: 0,
  friendlyTierBonus: 1, // сторона дружит с партией (friendly+) — +1 к награде за помощь
  allyDeathPenalty: 0,  // не вводим
};

/** Благодарность стороны-союзника после победы (только `thanks`). */
export const THANKS = {
  credits: 0.5,          // доля стоимости добычи побеждённых в кредитах сверху
  favorChance: 0.35,     // флаг `skirm-favor:<faction>`: следующая покупка у фракции −10% (раз)
  favorDiscount: 0.1,
  escortChance: 0.15,    // выжившие командир (m/e) идёт с партией: союзник в следующем бою (флаг `skirm-escort`, расходуется)
  questChance: 0.1,      // шаблон с `quest` — выдаёт простое поручение (по таблице quest шаблона, если есть)
};

/**
 * Шаблоны. side: { r: ростер, mix: 'ggse', name: строка для карточки }.
 * where: регионы (id REGIONS) + kind 'road' | 'node' | 'both'. even — только равные силы. w — вес.
 * Фракционные шаблоны (`pairsFromMatrix`) идут отдельно — см. ниже.
 */
export const TEMPLATES = [
  { id: 'bandits-caravan', name: 'Бандиты и караван', kind: 'road', where: ['neutralVillages', 'pirates', 'tinBrotherhood', 'scavengers', 'agrozone'], w: 12,
    a: { r: 'bandits', mix: 'ggsm', name: 'Бандиты' }, b: { r: 'neutralVillages', mix: 'ggs', name: 'Охрана каравана' }, quest: 'caravan', loot: 'trade' },
  { id: 'mutz-vs-scv', name: 'Мутанты и мусорщики', kind: 'both', where: ['scavengers', 'mutantsBeast'], w: 10,
    a: { r: 'mutantsBeast', mix: 'gsge', name: 'Мутанты-Ж' }, b: { r: 'scavengers', mix: 'ggsg', name: 'Мусорщики' } },
  { id: 'cult-vs-watch', name: 'Культ и стража', kind: 'node', where: ['neutralVillages', 'tinBrotherhood', 'harmony', 'pirates'], w: 10, cult: true,
    a: { r: 'cult', mix: 'gsse', name: 'Культ Судьи' }, b: { r: 'neutralVillages', mix: 'gggs', name: 'Стража' }, siege: true },
  { id: 'beasts-vs-hunters', name: 'Звери и охотники', kind: 'road', where: ['neutralVillages', 'mutantsBeast', 'tinBrotherhood', 'wilds'], w: 8, even: true,
    a: { r: 'beasts', mix: 'gggs', name: 'Стая' }, b: { r: 'neutralVillages', mix: 'sgs', name: 'Охотники' } },
  { id: 'mech-vs-scv', name: 'Механиды и мусорщики', kind: 'both', where: ['mechanids', 'scavengers'], w: 8,
    a: { r: 'mechanids', mix: 'gsse', name: 'Механиды' }, b: { r: 'scavengers', mix: 'gsse', name: 'Мусорщики' } },
  { id: 'robots-vs-bandits', name: 'Дроны и бандиты', kind: 'road', where: ['aiParty', 'warprom', 'scavengers', 'wilds'], w: 8,
    a: { r: 'robots', mix: 'gggs', name: 'Дроны' }, b: { r: 'bandits', mix: 'ggsm', name: 'Бандиты' } },
  { id: 'pirates-vs-tin', name: 'Пираты и братство', kind: 'both', where: ['pirates', 'tinBrotherhood'], w: 8,
    a: { r: 'pirates', mix: 'ggse', name: 'Пираты' }, b: { r: 'tinBrotherhood', mix: 'gsse', name: 'Жестяное братство' } },
  { id: 'cultists-vs-skrilets', name: 'Сектанты и скрилеты', kind: 'node', where: ['cult', 'wilds', 'renegades'], w: 6, cult: true,
    a: { r: 'cultists', mix: 'ggs', name: 'Сектанты' }, b: { r: 'skrilets', mix: 'sse', name: 'Скрилеты' } },
  { id: 'agro-vs-rebels', name: 'Надсмотрщики и повстанцы', kind: 'both', where: ['agrozone'], w: 10,
    a: { r: 'agrozone', mix: 'gsse', name: 'Надсмотрщики' }, b: { r: 'rebels', mix: 'ggsg', name: 'Повстанцы' }, quest: 'rebels' },
  { id: 'rioters-vs-ai', name: 'Бунтовщики и патруль АИ', kind: 'node', where: ['aiParty', 'corruption'], w: 8,
    a: { r: 'rebels', mix: 'gggs', name: 'Бунтовщики' }, b: { r: 'aiParty', mix: 'gsse', name: 'Патруль АИ' } },
  { id: 'cringe-vs-villages', name: 'Кринжгоны и селяне', kind: 'both', where: ['neutralVillages', 'cringegons'], w: 6, siege: true,
    a: { r: 'cringegons', mix: 'gsse', name: 'Кринжгоны' }, b: { r: 'neutralVillages', mix: 'gggs', name: 'Ополчение' } },
  { id: 'plants-vs-agro', name: 'Растения и опрыскиватели', kind: 'both', where: ['mutantsPlant', 'agrozone'], w: 8,
    a: { r: 'mutantsPlant', mix: 'gsse', name: 'Мутанты-Р' }, b: { r: 'agrozone', mix: 'gsge', name: 'Агрозона' } },
  { id: 'tin-vs-cult', name: 'Охотники братства и культ', kind: 'road', where: ['tinBrotherhood', 'cult', 'wilds'], w: 8, cult: true,
    a: { r: 'tinBrotherhood', mix: 'gss', name: 'Охотники на культ' }, b: { r: 'cult', mix: 'gse', name: 'Культ Судьи' } },
  { id: 'scv-vs-pirates', name: 'Мусорщики и пираты', kind: 'both', where: ['scavengers', 'pirates'], w: 8,
    a: { r: 'scavengers', mix: 'gsg', name: 'Мусорщики' }, b: { r: 'pirates', mix: 'gsg', name: 'Пираты' }, even: true },
  { id: 'mutz-vs-tek', name: 'Мутанты и техоньки', kind: 'road', where: ['mutantsBeast', 'tekhonki'], w: 8,
    a: { r: 'mutantsBeast', mix: 'gsge', name: 'Мутанты-Ж' }, b: { r: 'tekhonki', mix: 'gsse', name: 'Техоньки' } },
  { id: 'crawlers-vs-junk', name: 'Ползуны и мехи на свалке', kind: 'node', where: ['scavengers', 'mechanids'], w: 5, even: true,
    a: { r: 'robots', mix: 'ggg', name: 'Ползуны' }, b: { r: 'robots', mix: 'gsg', name: 'Старые мехи' } },
  { id: 'mech-vs-tek', name: 'Механиды и «прокси»', kind: 'both', where: ['mechanids', 'tekhonki'], w: 6,
    a: { r: 'mechanids', mix: 'gsse', name: 'Механиды' }, b: { r: 'tekhonki', mix: 'gsse', name: 'Техоньки' } },
  { id: 'militia-vs-bandits', name: 'Ополчение и налётчики', kind: 'node', where: ['neutralVillages', 'villages', 'harmony'], w: 10, siege: true,
    a: { r: 'bandits', mix: 'ggsm', name: 'Налётчики' }, b: { r: 'neutralVillages', mix: 'ggg', name: 'Ополчение' }, quest: 'village' },
  { id: 'wolves-vs-fauna', name: 'Волки Военпрома и звери', kind: 'road', where: ['warprom', 'wilds'], w: 6,
    a: { r: 'wolves', mix: 'gs', name: 'Стая «Волк»' }, b: { r: 'beasts', mix: 'gggs', name: 'Дикие звери' } },
  { id: 'cult-vs-renegades', name: 'Культ и отступники', kind: 'both', where: ['renegades', 'cult'], w: 6, cult: true,
    a: { r: 'cult', mix: 'gsse', name: 'Культ Судьи' }, b: { r: 'renegades', mix: 'gsse', name: 'Отступники' } },
  { id: 'bandits-vs-bandits', name: 'Две шайки делят добычу', kind: 'road', where: ['scavengers', 'pirates', 'neutralVillages', 'agrozone', 'tekhonki', 'mutantsBeast'], w: 10, even: true,
    a: { r: 'bandits', mix: 'ggs', name: 'Шайка «Левые»' }, b: { r: 'bandits', mix: 'ggs', name: 'Шайка «Правые»' } },
  { id: 'tin-vs-bandits', name: 'Ронины и грабители', kind: 'road', where: ['tinBrotherhood'], w: 6,
    a: { r: 'tinBrotherhood', mix: 'gss', name: 'Ронины' }, b: { r: 'bandits', mix: 'gggs', name: 'Грабители' } },
  { id: 'pirates-vs-ai', name: 'Контрабандисты и заградотряд', kind: 'both', where: ['pirates', 'aiParty', 'warprom'], w: 5,
    a: { r: 'pirates', mix: 'ggse', name: 'Контрабандисты' }, b: { r: 'aiParty', mix: 'gsse', name: 'Заградотряд АИ' } },
];

/**
 * Фракционные шаблоны из матрицы вражды (канон: `factions.js`). Пара берётся, если у любой стороны к другой
 * `enemy` (вес 10) или `rival` (вес 5). Регионы — родные регионы обеих фракций (id региона = id фракции).
 * Фракции без региона (нет в REGIONS) пропускаются в коде. Состав — mix по умолчанию.
 */
export const PAIR_MIX = 'gsse';
export const PAIR_WEIGHT = { enemy: 10, rival: 5 };
export function pairsFromMatrix(regionIds = null) {
  const out = [];
  const ids = Object.keys(RELATIONS);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const s = [RELATIONS[a][b], RELATIONS[b][a]];
      const worst = s.includes('enemy') ? 'enemy' : s.includes('rival') ? 'rival' : null;
      if (!worst) continue;
      const where = [a, b].filter((f) => !regionIds || regionIds.includes(f));
      if (!where.length) continue;
      out.push({ id: `pair-${a}-${b}`, name: null, kind: 'both', where, w: PAIR_WEIGHT[worst], cult: a === 'cult' || b === 'cult',
        a: { r: a, mix: PAIR_MIX }, b: { r: b, mix: PAIR_MIX }, stance: worst });
    }
  }
  return out;
}
export { STANCES };

/** Карточка при наведении на маркер: что показывать. */
export const CARD = { showPower: true, powerWords: [[0.5, 'слабая'], [0.8, 'средняя'], [1.0, 'сильная'], [9, 'очень сильная']], showDaysLeft: true, showRepHint: true };
