// Узлы карты мира v3 — на канон-карте (docs/canon/map/, game/src/data/world/canon-map.js). Спека: docs/specs/world.md.
// id канонических мест = поле `slug` из canon-map.js. Узлы v1.0 стали районами (parent) или алиасами (aliasOf) —
// таблица «старый id → новый slug» в world.md, п. 1.3; алиасы — в ALIASES ниже.
//
// Поля узла:
//   id, name, region (id из regions.js), kind ('hub'|'town'|'camp'|'wild'|'dungeon'|'terminal'|'boss'|'sea'),
//   tier — для бургов: 'capital'|'city'|'town'|'village'|'hamlet' (по населению), poi — тип канон-маркера,
//   px {x,y} — пиксели канон-карты 1536×762 (рисовать поверх map.png), pos {x,y} — то же в 0..1000 (старый UI),
//   canonMap: false — узла нет на канон-карте (район или игровое место), parent — узел, внутри которого район,
//   faction, pop, capital, port — из canon-map.js (у бургов), art, desc,
//   services: 'rest'|'heal'|'trade'|'train'|'implant'|'rumors'|'recruit'|'terminal'|'revive'|'harbor'|'ferry',
//   npcs: [id] (главнее npcs.js[].location), hidden, requires, entry, terminal, battles: [{ id, encounter, map?, once, when?, tag? }],
//   battleMap, caches, hazard, quests, danger (своя опасность места, иначе — региона),
//   tag — желаемый тип врагов для enemies-v3 (пока бой берёт существующий encounter).

import { BURGS, MARKERS, MAP_SIZE } from './canon-map.js';
import { NPCS } from '../npcs.js';
import { NODE_BATTLES_V4 } from './battles-v4.js';
import { CACHES_DENSITY } from './density-caches.js';

export const MAP_SPACE = { w: MAP_SIZE.w, h: MAP_SIZE.h, kmPerPx: MAP_SIZE.kmPerPx, image: 'docs/canon/map/map.png' };

const at = (x, y) => ({ px: { x, y }, pos: { x: Math.round((x * 1000) / MAP_SIZE.w), y: Math.round((y * 1000) / MAP_SIZE.h) } });

const BASE = () => ({
  art: null, services: [], npcs: [], hidden: null, requires: null, entry: null,
  terminal: null, battles: [], caches: [], hazard: null, quests: [], battleMap: null, danger: null, tag: null,
  canonMap: true, parent: null, tier: null, poi: null,
});

/** Уровень бурга по населению (world.md, п. 1.2). */
export function burgTier(b) {
  if (b.capital) return 'capital';
  if (b.pop >= 5000) return 'city';
  if (b.pop >= 1000) return 'town';
  if (b.pop >= 150) return 'village';
  return 'hamlet';
}

/** Сервисы по уровню бурга. Порт добавляет 'harbor' (морские пути, travel.js). */
export const TIER_SERVICES = {
  capital: ['rest', 'heal', 'trade', 'train', 'recruit', 'rumors'],
  city: ['rest', 'heal', 'trade', 'train', 'rumors'],
  town: ['rest', 'heal', 'trade', 'rumors'],
  village: ['rest', 'trade', 'rumors'],
  hamlet: ['rest', 'rumors'],
};
export const TIER_NAMES = { capital: 'Столица', city: 'Город', town: 'Посёлок', village: 'Деревня', hamlet: 'Хутор' };

const SEED = (k) => [{ id: `${k}-stash`, check: { skill: 'perception', dc: 14 }, loot: [{ item: 'medkit', n: 1 }, { credits: 40 }] }];

// ------------------------------------------------------------------ бурги (37) — имя, описание, особенности
// extraServices добавляются к сервисам уровня. v1.0-данные (npcs, quests, terminal, battles) перенесены на новые узлы.
const BURG_INFO = {
  // --- АИ Партия
  putinlyandiya: { name: 'Путинляндия (Коррупция-Сити)', extraServices: ['implant'],
    npcs: ['announcer-rovnya', 'archivist-nine', 'telifon', 'dymka', 'boomerang'],
    terminal: { id: 'cc-terminal-1', state: 'ritual' },
    battles: [{ id: 'market-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    entry: { faction: 'aiParty', check: { skills: ['deception', 'persuasion', 'hacking'], dc: 15 }, toll: 50, battle: 'w-cc-gate' },
    desc: 'Столица АИ Партии, 20 000 душ. Внешнее кольцо в народе зовут Коррупция-Сити: тут торгуют досье, а мёртвые выходят из терминалов.' },
  // --- Военпром
  kreml: { name: 'Кремль', extraServices: ['implant'], entry: { faction: 'warprom', check: { skills: ['deception', 'military'], dc: 16 }, battle: 'w-cc-gate' },
    desc: 'Столица Военпрома: плацдарм андроидов и железа. Предателей и слабых тут нет — их сразу утилизируют.' },
  // --- Жестяное братство
  slavotech: { name: 'Славотеч', extraServices: ['ferry'], npcs: [],
    desc: 'Столица Жестяного братства у Жестяного озера. Верховный совет, кузни, честь под сталью.' },
  zhestoboy: { name: 'Жестобой', extraServices: ['ferry'], desc: 'Озёрный порт братства. Отсюда видно Великого Меха — и лучше не подходить.' },
  dodze: { name: 'Додзе', desc: 'Город школ боя. Монахи-самураи учат дышать и не бояться.' },
  noch: { name: 'Ночь', desc: 'Город, где фонари гасят ровно в девять. Аналоговые часы на каждой стене.' },
  selyshko: { name: 'Селышко', desc: 'Консульство братства: связь с простыми людьми и вербовка.' },
  fortetsiya: { name: 'Фортеция', desc: 'Пограничная крепость братства против мутантов-Ж.' },
  dzen: { name: 'Дзен', desc: 'Пустой монастырь на 45 человек. Тут ничего не происходит, и это правило.' },
  'stoikost-2': { name: 'Стойкость (братство)', desc: 'Северная застава братства у Механид. Чума металла стучится в ворота.' },
  zhesternya: { name: 'Жестерня', desc: 'Мастерская-хутор братства на границе Селений. Сорок жителей, сорок молотков.' },
  // --- Пираты
  raytsentr: { name: 'Райцентр', extraServices: ['implant'], desc: 'Столица пиратов на реке. Самый большой выбор товаров — краденых на любой вкус.' },
  // --- Мусорщики
  svalka: { name: 'Свалка', extraServices: ['implant'], npcs: [],
    desc: 'Столица мусорщиков и трон Главы Мусора — он же Король свалок. Сильнейший выживает, скелеты — добыча.' },
  // --- Механиды
  betonka: { name: 'Бетонка', extraServices: ['implant'], danger: 4,
    desc: 'Порт-столица механидов. Коллективный разум ассимилирует технику; органике тут не рады, а чума металла рада всем.' },
  // --- Техоньки
  zavod: { name: 'Завод', extraServices: ['implant'], hazard: 'proxyStorm',
    desc: 'Столица техоньков в бывшем заводе Военпрома. Станки молятся Старому богу и иногда отвечают.' },
  stanok: { name: 'Станок', hazard: 'proxyStorm', desc: 'Город ритуальщиков: из хлама делают оружие, из оружия — святыни.' },
  smotreltse: { name: 'Смотрельце', hazard: 'proxyStorm', desc: 'Город-антенна: слушают радиопомехи и записывают шёпот Старого бога.' },
  // --- Нейтральные селения
  svoboda: { name: 'Свобода', desc: 'Портовая столица Нейтральных селений на западе. Совет старейшин и рыбный рынок.' },
  agrara: { name: 'Аграра', desc: 'Крупнейшее селение: поля, мельницы, ярмарка. Кормит пол-юга.' },
  svyatost: { name: 'Святость', services: ['rest', 'heal', 'trade', 'rumors', 'recruit'],
    npcs: ['elder-ulyana', 'innkeeper-pelmen', 'shepherd-timokha', 'prisoner-khikhik'],
    quests: ['mq-beacons', 'sq-khikhik', 'sq-timokha'],
    desc: 'Восточный центр селений (бывшее «Село совета»): старейшина Ульяна, трактир Пельменя, пленный кринжгон в сарае.' },
  stoikost: { name: 'Стойкость', desc: 'Хутор на сто душ, который пережил всё. Даже ЭВК тут называют «той грозой».' },
  belba: { name: 'Белба', desc: 'Сто человек и одна коза-рекордсменка. Коза знаменита.' },
  peremoga: { name: 'Перемога', desc: 'Деревня с памятником победе, о которой никто не помнит, над кем.' },
  ostanovka: { name: 'Остановка', terminal: { id: 'term-villages', state: 'ritual' },
    battles: [{ id: 'tower-guard', encounter: 'w-villages-terminal', once: true, when: 'terminal' }],
    desc: 'Тринадцать человек и автобусная остановка с ретранслятором. Культ повесил на него ритуальный терминал.' },
  kalostok: { name: 'Калосток', hazard: 'fire',
    desc: 'Сорок жителей и жёлтые от серы стены: здесь прошла серная буря после испытаний АИ — отсюда имя Серы.' },
  // --- Мутанты-Ж
  vonyuchka: { name: 'Вонючка', desc: 'Порт-столица мутантов-Ж. Запах слышно за километр, а клыки — за два.' },
  lesyanka: { name: 'Лесянка', desc: 'Посёлок в чаще. Здесь живут те, кто мутировал «из-за среды», и гордятся этим.' },
  boynik: { name: 'Бойник', desc: 'Бойцовская яма мутантов-Ж. Спорят здесь только зубами.' },
  proeb: { name: 'Проёб', desc: 'Сорок два мутанта на краю болот. Название честно отражает экономику.' },
  sheryanka: { name: 'Шерянка', desc: 'Восточный анклав мутантов-Ж за морем, у Агрозоны. Шерсть дыбом от Чистильщиков.' },
  // --- Мутанты-Р
  garmoniya: { name: 'Гармония', desc: 'Порт мутантов-Р. С летающей Альфа-Гармонией не связан — просто совпало (и все путают).' },
  // --- Агрозона
  gidroponika: { name: 'Гидропоника', npcs: ['overseer-norma'],
    entry: { faction: 'agrozone', check: { skills: ['deception', 'persuasion'], dc: 13 }, toll: 20 },
    desc: 'Столица Агрозоны (бывший «Бетон» лоялистов): гидропонные башни, склад пайков, камеры и лозунги.' },
  // --- Культ
  sokralnya: { name: 'Сокральня', services: ['rest', 'trade', 'rumors'],
    entry: { faction: 'cult', check: { skills: ['deception', 'religion', 'judge'], dc: 15 } },
    desc: 'Столица Культа Судьи. Колокола звонят приговорами, в 42 км — вход в Киберспейс.' },
  // --- Отступники
  shtabtsentr: { name: 'Штабцентр (Хатаб-Сити)',
    desc: 'Порт-столица Отступников на руинах западной битвы. Подступы заминированы, в таверне «Марта» собирают восстание.' },
  // --- Кринжгоны
  'pepelnoe-gornilo': { name: 'Пепельное Горнило', danger: 5, services: ['rest'],
    entry: { faction: 'cringegons', battle: 'w-villages-jesters' },
    desc: 'Столица кринжгонов в пепле. Отсюда Кринж-Вождь шлёт маяки и шутки, от которых умирают.' },
  nadezhda: { name: 'Надежда', danger: 5, services: ['rest'], entry: { faction: 'cringegons', battle: 'w-villages-jesters' },
    desc: 'Захваченное кринжгонами селение. Название оставили — для смеха.' },
  'baza-predlozhki': { name: 'База Предложки', services: ['rest', 'rumors', 'train'],
    desc: 'Последний оплот забытого войска Предложки — внутри земель кринжгонов. Держат их агрессию уже девять лет.' },
};

// ------------------------------------------------------------------ авторские маркеры (25) и отобранные POI генератора (31)
// region — по территории карты (ближайший бург и цвет области).
const MARKER_INFO = {
  // ---------- авторские
  marta: { name: 'Таверна «Марта»', region: 'renegades', kind: 'camp', services: ['rest', 'rumors', 'recruit'],
    desc: 'Таверна в Штабцентре, штаб восстания Марты. Пиво дешёвое, свобода дорогая.' },
  'dacha-babki': { name: 'Дача Бабки (Галины)', region: 'neutralVillages', kind: 'camp', services: ['rest', 'trade'],
    art: '03_локации/Дача_Галины.jpg', npcs: ['galina'], quests: ['sq-galina-hatch'],
    desc: 'Огород, теплица, горячий источник и Галина. Про люк хозяйка молчит.' },
  'bunker-lisa': { name: 'Бункер Лиса (люк под дачей)', region: 'neutralVillages', kind: 'dungeon',
    art: '03_локации/Люк_под_дачей.jpg',
    hidden: { check: { skill: 'perception', dc: 13 }, flags: ['find-cache', 'hidden-routes'], reveal: ['galina-told'] },
    battles: [{ id: 'hatch-nest', encounter: 'w-villages-hatch', map: 'hatch-1', once: true },
      { id: 'lis-vault', encounter: 'v3-lis-vault', once: true }, { id: 'lis-1-defective', encounter: 'v3-boss-lis-1', once: true }],
    caches: [{ id: 'hatch-stash', check: { skill: 'perception', dc: 14 }, loot: [{ item: 'medkit', n: 2 }, { item: 'servo-parts', n: 1 }, { credits: 60 }] }],
    battleMap: 'hatch-1',
    desc: 'Довоенный бункер: ход из люка под дачей. Кто такой Лис, знает только Галина.' },
  'dozorka-dzhona': { name: 'Дозорка Джона', region: 'neutralVillages', kind: 'wild', hazard: 'cringe', danger: 2,
    npcs: ['beacon-keeper', 'defender-rubezh'],
    desc: 'Дозорная вышка над границей кринж-маяков. Джон ушёл, вышка осталась.' },
  'bunker-kuksiusa': { name: 'Бункер Куксиуса', region: 'renegades', kind: 'dungeon', danger: 3,
    battles: [{ id: 'kuksius-bunker', encounter: 'w-villages-hatch', once: true, tag: 'technocult' }], caches: SEED('kuksius'),
    desc: 'Бункер, откуда Куксиус Первый начинал штурм Военпрома. Двери до сих пор открываются по старому паролю.' },
  liza: { name: 'Подземный город (метка Лизы)', region: 'mutantsBeast', kind: 'dungeon', danger: 2,
    desc: 'Вход в подземный город, где родилась Лиза. Сюда ведёт её уникальный ивент (events.js).' },
  artem: { name: 'Лёжка Артёма', region: 'scavengers', kind: 'wild', danger: 2,
    desc: 'Снайперская лёжка выживальщика из команды Куксиуса. Гильзы, консервы, отличный обзор.' },
  'mogila-viktora': { name: 'Могила Виктора', region: 'renegades', kind: 'wild', services: [], danger: 1,
    desc: 'Памятник: Виктор, «железный титан» из команды Куксиуса, лежит здесь. На кресте — его молот.' },
  lox: { name: 'Метка Lox: Святость', region: 'neutralVillages', kind: 'wild', danger: 2, tag: 'lox-clone',
    desc: 'Здесь видели одного из клонов Lox. Или самого Lox. Он и сам не всегда уверен.' },
  'lox-2': { name: 'Метка Lox: Жестерня', region: 'tinBrotherhood', kind: 'wild', danger: 2, tag: 'lox-clone',
    desc: 'Кузнецы видели человека, который извинялся перед собственным отражением.' },
  'lox-3': { name: 'Метка Lox: Станок', region: 'tekhonki', kind: 'wild', danger: 3, tag: 'lox-clone',
    desc: 'Техоньки пытались «освятить» клона Lox. Клон был против.' },
  'lox-4': { name: 'Метка Lox: Свалка', region: 'scavengers', kind: 'wild', danger: 2, tag: 'lox-clone',
    desc: 'На свалке нашли агента Lox-7 в разобранном виде. Без одного агента.' },
  'lox-5': { name: 'Метка Lox: Штабцентр', region: 'renegades', kind: 'wild', danger: 3, tag: 'lox-clone',
    desc: 'Отступники держат тут пленного клона Lox. Настоящий Lox хочет с ним поговорить.' },
  vooruzhenie: { name: 'Вооружение', region: 'cult', kind: 'dungeon', danger: 4, hazard: 'fire',
    battles: [{ id: 'arsenal', encounter: 'w-cc-terminal', once: true, tag: 'cult-arsenal' }], caches: SEED('arsenal'),
    desc: 'Радиоактивный склад оружия, который культ отбил у АИ. Светится по ночам.' },
  sputnik: { name: 'Спутник', region: 'scavengers', kind: 'dungeon', danger: 3,
    battles: [{ id: 'sputnik', encounter: 'w-road-scavengers', once: true }], caches: SEED('sputnik'),
    desc: 'Упавший довоенный спутник. Мусорщики разбирают его третий год и всё никак.' },
  'vyzhigatel-vayba': { name: 'Выжигатель Вайба', region: 'cringegons', kind: 'boss', danger: 5, hazard: 'cringe',
    battles: [{ id: 'vibe-burner', encounter: 'w-villages-beacon', once: true, tag: 'cringe-superbeacon' }],
    desc: 'Главный кринж-излучатель у Пепельного Горнила. Маяки у Селений — его дети.' },
  kiberspeys: { name: 'Вход в Киберспейс', region: 'cult', kind: 'terminal', danger: 4,
    terminal: { id: 'term-kiberspeys', state: 'ritual' },
    battles: [{ id: 'cyber-gate', encounter: 'w-cyberspace', once: false, when: 'terminal' }],
    desc: 'Разлом у Сокральни, где Киберспейс протекает в мир. Отсюда душа может войти — и выйти. Иногда.' },
  'krushenie-nebesnogo-bazara': { name: 'Крушение Небесного базара', region: 'renegades', kind: 'dungeon', danger: 3,
    battles: [{ id: 'sky-bazaar', encounter: 'w-road-pirates', once: true }], caches: SEED('bazaar'),
    desc: 'Обломки пиратского летающего рынка, рухнувшего в 2013. С Альфа-Гармонией не путать: это другой объект.' },
  'mesto-krusheniya-alfa-garmonii': { name: 'Утёс Альфа-Гармонии', region: 'harmony', kind: 'camp', danger: 0,
    art: '03_локации/Фуникулёр.jpg', services: ['trade', 'rumors', 'harbor'], npcs: ['seer', 'courier-lapsha'],
    stateDesc: { 'harmony-fallen': 'Место крушения Альфа-Гармонии: обломки палуб на утёсе, дым, мародёры.' },
    desc: 'Утёс, у которого зависла Альфа-Гармония. Нижняя станция фуникулёра, пиратский причал, Предсказатель. (Канон-метка — место будущего крушения.)' },
  'velikiy-khram': { name: 'Великий Храм', region: 'tinBrotherhood', kind: 'camp', services: ['rest', 'train'],
    desc: 'Храм братства у Додзе: здесь клянутся «под сталью — сталь».' },
  'velikaya-arena': { name: 'Великая Арена', region: 'tinBrotherhood', kind: 'camp', services: ['train', 'trade'],
    battles: [{ id: 'arena', encounter: 'w-cc-duel', once: false, when: 'quest' }],
    desc: 'Арена Жестяного братства у Славотеча: бои и испытания. Холст — песок, кисть — молот.' },
  'ledyanoy-ring': { name: 'Ледяной ринг', region: 'wilds', kind: 'camp', danger: 3, services: ['rest', 'train'],
    battles: [{ id: 'ice-ring', encounter: 'w-cc-duel', once: false, when: 'quest' }],
    desc: 'Бойцовский ринг на льду северного острова. Проигравших не хоронят — их и так заморозило.' },
  'semya-chumy': { name: 'Семя Чумы', region: 'mechanids', kind: 'boss', danger: 5, hazard: 'proxyStorm',
    battles: [{ id: 'plague-seed', encounter: 'w-villages-hatch', once: true, tag: 'metal-plague-boss' }],
    desc: 'Источник «чумы металла» 2014 года. Механиды охраняют его как святыню, культ — как подарок.' },
  'ekspeditsiya-istseleniya': { name: 'Экспедиция исцеления', region: 'mechanids', kind: 'dungeon', danger: 4,
    caches: [{ id: 'expedition-stash', check: { skill: 'medicine', dc: 14 }, loot: [{ item: 'medkit', n: 3 }, { credits: 80 }] }],
    desc: 'Лагерь медиков, ушедших лечить чуму металла. Вернулись не все. Точнее, никто.' },
  'velikiy-mekh': { name: 'Великий Мех', region: 'tinBrotherhood', kind: 'boss', danger: 4,
    battles: [{ id: 'great-mech', encounter: 'w-villages-hatch', once: true, tag: 'great-mech-boss' }],
    desc: 'Гигантский довоенный мех у Жестобоя. Братство не может его победить, но и бросить не может — дело чести.' },

  // ---------- POI генератора
  'dungeons-m12': { name: 'Коридоры под Кремлём', region: 'warprom', kind: 'dungeon', danger: 5, art: '03_локации/Военпром_коридор_интерьер.jpg',
    battles: [{ id: 'kreml-corridors', encounter: 'w-cc-gate', once: true, tag: 'warprom-androids' },
      { id: 'wolf-pack', encounter: 'v3-wolf-pack', once: true }, { id: 'wolf-hunt', encounter: 'v3-wolf-hunt', once: true },
      { id: 'wolf-alpha', encounter: 'v3-boss-wolf-0', once: true }], caches: SEED('kreml'),
    desc: 'Служебные коридоры Военпрома. Уборщик Тряпкин знает тут каждую вентиляцию.' },
  'dungeons-m13': { name: 'Шахта Свалки', region: 'scavengers', kind: 'dungeon', danger: 2,
    battles: [{ id: 'dump-mine', encounter: 'w-road-scavengers', once: true }], caches: SEED('dumpmine'),
    desc: 'Мусорщики роют вниз: под свалкой — свалка постарше.' },
  'dungeons-m14': { name: 'Кринж-катакомбы', region: 'cringegons', kind: 'dungeon', danger: 5,
    battles: [{ id: 'cringe-catacombs', encounter: 'w-villages-jesters', once: true, tag: 'cringe-elite' }], caches: SEED('catacombs'),
    desc: 'Подземелья, откуда кринжгоны выводят «Великого Собирателя». Эхо повторяет худшие шутки.' },
  'dungeons-m15': { name: 'Ледяной бункер', region: 'wilds', kind: 'dungeon', danger: 3,
    battles: [{ id: 'ice-bunker', encounter: 'w-road-crawlers', once: true, tag: 'ice-beasts' },
      { id: 'lis-tail', encounter: 'v3-boss-lis-9', once: true }], caches: SEED('icebunker'),
    desc: 'Вмёрзший в ледник бункер довоенной армии. Внутри тепло — и это плохой знак.' },
  'dungeons-m16': { name: 'Затопленный цех', region: 'mechanids', kind: 'dungeon', danger: 4,
    battles: [{ id: 'flooded-works', encounter: 'w-villages-hatch', once: true, tag: 'mechanid-drones' }], caches: SEED('flooded'),
    desc: 'Цех механидов, ушедший под воду. Станки работают и под водой.' },
  'dungeons-m17': { name: 'Старая кузня', region: 'tinBrotherhood', kind: 'dungeon', danger: 2,
    battles: [{ id: 'old-forge', encounter: 'w-villages-hatch', once: true }], caches: SEED('forge'),
    desc: 'Заброшенная кузня братства. Говорят, тут ковали Ржавую броню первые мастера.' },
  'ruins-m35': { name: 'Руины таможни', region: 'pirates', kind: 'wild', danger: 2,
    battles: [{ id: 'customs-ruins', encounter: 'w-road-pirates', once: true }], caches: SEED('customs'),
    desc: 'Довоенная таможня на перешейке. Пираты берут пошлину и сейчас — по старой памяти.' },
  'ruins-m36': { name: 'Древний бункер техоньков', region: 'tekhonki', kind: 'dungeon', danger: 3, hazard: 'proxyStorm',
    battles: [{ id: 'ancient-bunker', encounter: 'w-road-scavengers', once: true, tag: 'living-mechanisms' }], caches: SEED('ancient'),
    desc: 'Тот самый бункер «с механизмами, похожими на живые» из сводки. Старый бог здесь проснулся.' },
  'ruins-m37': { name: 'Лагерь восставших', region: 'agrozone', kind: 'camp', danger: 2, services: ['rest', 'trade', 'recruit'],
    npcs: ['marta'], entry: { faction: 'renegades' },
    desc: 'Руины совхоза, где Марта собрала беглых рабов (бывший «бург Свобода» v1.0). «Отмена ID-чипов!»' },
  'ruins-m38': { name: 'Элеватор', region: 'agrozone', kind: 'terminal', danger: 3,
    terminal: { id: 'term-agrozone', state: 'ritual' },
    battles: [{ id: 'elevator-guard', encounter: 'w-agro-terminal', once: true, when: 'terminal' }],
    desc: 'Пустое зернохранилище в руинах. Внутри молятся на мигающий экран.' },
  'necropolises-m47': { name: 'Ледяной некрополь', region: 'wilds', kind: 'dungeon', danger: 4,
    battles: [{ id: 'ice-necropolis', encounter: 'w-cyberspace', once: true, tag: 'frozen-souls' }], caches: SEED('icenecro'),
    desc: 'Кладбище тех, кого не пустил Киберспейс. Души вмёрзли в лёд и шепчут.' },
  'necropolises-m48': { name: 'Пепельный некрополь', region: 'cringegons', kind: 'dungeon', danger: 5,
    battles: [{ id: 'ash-necropolis', encounter: 'w-cc-dead', once: true }],
    desc: 'Могилы жертв первого вторжения кринжгонов (2006). На надгробиях — смешные подписи.' },
  'necropolises-m49': { name: 'Южный некрополь Партии', region: 'aiParty', kind: 'dungeon', danger: 4,
    battles: [{ id: 'party-necropolis', encounter: 'w-cc-dead', once: true }], caches: SEED('partynecro'),
    desc: 'Сюда АИ свозит «утилизированных». Терминал культа рядом сделал кладбище беспокойным.' },
  'lake-monsters-m18': { name: 'Жестяное озеро', region: 'tinBrotherhood', kind: 'wild', danger: 3,
    battles: [{ id: 'lake-monster', encounter: 'w-road-crawlers', once: true, tag: 'lake-monster' }],
    desc: 'Озеро братства. В глубине — что-то ржавое и голодное.' },
  'sea-monsters-m19': { name: 'Пролив Чудищ', region: 'wilds', kind: 'sea', danger: 3,
    battles: [{ id: 'sea-monster', encounter: 'w-road-crawlers', once: true, tag: 'sea-monster' }],
    desc: 'Пролив под утёсом Гармонии. Пиратские лодки обходят его стороной, если им заплатили.' },
  'hill-monsters-m20': { name: 'Гремящие холмы', region: 'tekhonki', kind: 'wild', danger: 3, hazard: 'proxyStorm',
    battles: [{ id: 'hill-monster', encounter: 'w-road-crawlers', once: true, tag: 'hill-monster' }],
    desc: 'Холмы, где прокси-бури оживили старый экскаватор. Он считает холмы своими.' },
  'brigands-m25': { name: 'Логово рейдеров', region: 'tekhonki', kind: 'wild', danger: 3,
    battles: [{ id: 'raiders-25', encounter: 'w-road-scavengers', once: true, tag: 'tekhonki-raid' }], caches: SEED('raid25'),
    desc: 'Рейдеры-техоньки с самодельными пушками, которые стреляют «по воле бога».' },
  'brigands-m26': { name: 'Перевал разбойников', region: 'pirates', kind: 'wild', danger: 2,
    battles: [{ id: 'raiders-26', encounter: 'w-road-pirates', once: true, tag: 'brigands' }],
    desc: 'Перевал на Великом тракте. Тут грабят даже пиратов — за это их уважают.' },
  'brigands-m27': { name: 'Овраг изгоев', region: 'tinBrotherhood', kind: 'wild', danger: 2,
    battles: [{ id: 'raiders-27', encounter: 'w-road-scavengers', once: true, tag: 'tin-outcasts' }],
    desc: 'Изгнанные из братства «за резню» живут здесь и режут дальше.' },
  'brigands-m28': { name: 'Банда Ржавых', region: 'tekhonki', kind: 'wild', danger: 3,
    battles: [{ id: 'raiders-28', encounter: 'w-road-scavengers', once: true, tag: 'tekhonki-raid' }],
    desc: 'Банда, которая молится не Старому богу, а своему главарю. Техоньки им не рады.' },
  'pirates-m29': { name: 'Южная бухта (Флот Буревестника)', region: 'pirates', kind: 'camp', danger: 2, services: ['trade', 'rumors', 'harbor'],
    desc: 'Пиратская стоянка у Вонючки: флот Капитана Буревестника и плавучий рынок.' },
  'pirates-m30': { name: 'Ровная Лагуна', region: 'pirates', kind: 'town', danger: 1,
    services: ['rest', 'trade', 'rumors', 'recruit', 'harbor'], art: '03_локации/Ровная_Лагуна.jpg',
    desc: 'Северная пиратская лагуна с Баром Лагуны: игроки, наёмники, торговцы «дубовыми амулетами».' },
  'battlefields-m9': { name: 'Западный сектор (руины завода АИ)', region: 'tinBrotherhood', kind: 'wild', danger: 2,
    battles: [{ id: 'west-sector', encounter: 'w-agro-cleaners', once: true, tag: 'ai-remnants' }], caches: SEED('westsector'),
    desc: 'Поле первой большой битвы ЖБ и АИ (2008, «Разгром завода АИ»). До сих пор находят гильзы и андроидов.' },
  'battlefields-m10': { name: 'Поле чумы металла', region: 'mechanids', kind: 'wild', danger: 4,
    battles: [{ id: 'plague-field', encounter: 'w-villages-hatch', once: true, tag: 'mechanid-drones' }],
    desc: 'Где в 2014 братство остановило «чуму металла». Ржавчина тут растёт как трава.' },
  'battlefields-m11': { name: 'Горящие поля', region: 'agrozone', kind: 'wild', danger: 2, hazard: 'fire', battleMap: 'burning-field-1',
    npcs: ['grandpa-kolos', 'zarya', 'forger-lyova'],
    caches: [{ id: 'fields-seed', check: { skill: 'survival', dc: 13 }, loot: [{ item: 'seed-bank', n: 1 }] }],
    quests: ['sq-zarya', 'sq-lyova-chips', 'sq-kolos-fields'],
    desc: 'Поле гражданской войны Агрозоны: дым до горизонта, сорок процентов полей — в пепел.' },
  'caves-m46': { name: 'Пещера Эха', region: 'mechanids', kind: 'dungeon', danger: 3,
    battles: [{ id: 'echo-cave', encounter: 'w-road-crawlers', once: true }], caches: SEED('echo'),
    desc: 'Пещера, где эхо отвечает голосом коллективного разума механид.' },
  'libraries-m39': { name: 'Архив старых мастеров', region: 'tekhonki', kind: 'camp', danger: 2, services: ['train', 'rumors'],
    desc: 'Довоенная библиотека инженеров. Техоньки считают её храмом, инструкции — молитвами.' },
  'circuses-m40': { name: 'Цирк убийц', region: 'pirates', kind: 'camp', danger: 2, services: ['train', 'trade'],
    desc: 'Бродячий цирк, где учат «Броску с отскоком». Клоуны вооружены. Особенно клоуны.' },
  'jousts-m41': { name: 'Турнир Бетонки', region: 'mechanids', kind: 'camp', danger: 4, services: ['train'],
    battles: [{ id: 'betonka-joust', encounter: 'w-cc-duel', once: false, when: 'quest', tag: 'mech-joust' }],
    desc: 'Механиды проводят турниры мехов. Органике можно участвовать — как мишени.' },
  'inns-m5': { name: 'Таверна «У моста»', region: 'aiParty', kind: 'camp', danger: 3, services: ['rest', 'rumors', 'trade'],
    desc: 'Таверна у моста к Путинляндии. Сюда приходят те, кого не пустили в столицу. То есть все.' },
  'sacred-forests-m21': { name: 'Священная роща Р', region: 'mutantsPlant', kind: 'camp', danger: 2, services: ['rest', 'train'],
    desc: 'Роща, где мутанты-Р пускают корни на ночь. Чужаков не трогают — если те не курят.' },
};

// ------------------------------------------------------------------ узлы без канон-метки: районы и игровые места
const EXTRA = [
  // --- Альфа-Гармония (висит над утёсом mesto-krusheniya-alfa-garmonii)
  { id: 'alpha-harmony', name: 'Альфа-Гармония: жилые палубы', region: 'harmony', kind: 'hub', ...at(780, 368),
    parent: null, art: '03_локации/Альфа_Гармония_утёс.jpg',
    services: ['rest', 'heal', 'trade', 'recruit', 'revive'],
    npcs: ['sera', 'paracetamol', 'amanda', 'aynura', 'cook-kasha', 'lox', 'bosun-sukhar'],
    quests: ['mq-exodus', 'mq-agro-fire', 'sq-terminals', 'sq-aynura'],
    desc: 'Летающая платформа, зависшая над утёсом. Палубы беженцев и медпункт Парацетамола.' },
  { id: 'harmony-reactor', name: 'Реактор Гармонии', region: 'harmony', kind: 'terminal', ...at(783, 364), parent: 'alpha-harmony',
    art: '03_локации/Реактор_Гармонии.jpg', services: ['terminal', 'revive'], terminal: { id: 'term-harmony', state: 'ours' },
    caches: [{ id: 'reactor-code', check: { skill: 'hacking', dc: 13 }, loot: [{ item: 'servo-parts', n: 1 }] },
      { id: 'reactor-proxy', check: { skill: 'proxy', dc: 13 }, loot: [{ item: 'rare-parts', n: 1 }, { credits: 30 }] }],
    desc: 'Перепрошитый Серой терминал — точка возвращения души.' },
  { id: 'harmony-sector-d', name: 'Сектор D', region: 'harmony', kind: 'camp', ...at(776, 364), parent: 'alpha-harmony',
    npcs: ['riot-boss', 'brother-povestka'],
    battles: [{ id: 'sector-d-riot', encounter: 'w-harmony-riot', once: true, when: 'quest' },
      { id: 'sector-d-cell', encounter: 'w-harmony-cult-cell', once: true, when: 'quest' }],
    caches: [{ id: 'sectord-rations', check: { skill: 'survival', dc: 12 }, loot: [{ item: 'medkit', n: 1 }, { credits: 20 }] },
      { id: 'sectord-quiet', check: { skill: 'meditation', dc: 12 }, loot: [{ item: 'calmers', n: 1 }, { credits: 20 }] },
      { id: 'sectord-rubble', check: { skill: 'athletics', dc: 12 }, loot: [{ item: 'medkit', n: 1 }, { credits: 30 }] }],
    quests: ['sq-sector-d', 'sq-povestka'], desc: 'Бунты из-за еды. Пустой котёл громче любого митинга.' },
  { id: 'harmony-workshop', name: 'Мастерская Николы', region: 'harmony', kind: 'town', ...at(778, 361), parent: 'alpha-harmony',
    services: ['trade', 'train', 'implant'], npcs: ['nikola', 'pip-junior'],
    caches: [{ id: 'workshop-box', check: { skill: 'lockpicking', dc: 13 }, loot: [{ item: 'servo-parts', n: 1 }, { credits: 40 }] },
      { id: 'workshop-graft', check: { skill: 'biology', dc: 13 }, loot: [{ item: 'medkit', n: 1 }, { credits: 40 }] }],
    desc: 'Протезы на стенах, протезы на полу, один протез на потолке — сам залез.' },
  { id: 'harmony-post', name: 'Пост караула № 2', region: 'harmony', kind: 'camp', ...at(784, 371), parent: 'alpha-harmony',
    services: ['train'], npcs: ['victor-sundown', 'gans'], quests: ['sq-cult-mines'],
    caches: [{ id: 'post-armoury', check: { skill: 'military', dc: 13 }, loot: [{ item: 'grenade', n: 1 }, { credits: 40 }] },
      { id: 'post-relics', check: { skill: 'religion', dc: 13 }, loot: [{ item: 'calmers', n: 1 }, { credits: 40 }] },
      { id: 'post-vent', check: { skill: 'acrobatics', dc: 13 }, loot: [{ item: 'rare-parts', n: 1 }, { credits: 30 }] }],
    desc: 'Пост технической части. Новый замок, которого Сандаун боится.' },

  // --- кринж-маяки у Селений (кринжгоны высадились с моря: на карте их нет — это передовые объекты вторжения)
  { id: 'beacon-1', name: 'Северный маяк', region: 'neutralVillages', kind: 'wild', ...at(470, 585), hazard: 'cringe', danger: 2,
    battles: [{ id: 'beacon-1', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Мачта из костей и антенн между Калостоком и Проёбом. Гудит анекдотами.' },
  { id: 'beacon-2', name: 'Восточный маяк', region: 'neutralVillages', kind: 'wild', ...at(492, 562), hazard: 'cringe', danger: 2,
    battles: [{ id: 'beacon-2', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Стоит у колодца. Вода краснеет. (Ивент Артёма, events.js.)' },
  { id: 'beacon-3', name: 'Болотный маяк', region: 'neutralVillages', kind: 'wild', ...at(505, 625), hazard: 'cringe', danger: 2,
    hidden: { check: { skill: 'survival', dc: 14 }, flags: ['hidden-routes', 'squeeze'], reveal: ['khikhik-talked'] },
    battles: [{ id: 'beacon-3', encounter: 'w-villages-beacon', once: true, when: 'quest' }],
    desc: 'Маяк в болотах за Проёбом, о котором знает только пленный Хихик.' },

  // --- Агрозона
  { id: 'cleaner-checkpoint', name: 'Блокпост Чистильщиков', region: 'agrozone', kind: 'camp', ...at(930, 470), danger: 2,
    npcs: ['cleaner-protokol'],
    entry: { faction: 'agrozone', check: { skills: ['deception'], dc: 15 }, battle: 'w-agro-cleaners' },
    battles: [{ id: 'checkpoint-assault', encounter: 'w-agro-checkpoint', once: true, when: 'quest' }],
    desc: 'Шлагбаум и огнемёты на дороге от Гидропоники к полям. «Это не бунт — это чистка».' },

  // --- Путинляндия (Коррупция-Сити): районы
  { id: 'cc-gate', name: 'КПП внешнего кольца', region: 'aiParty', kind: 'camp', ...at(1128, 466), parent: 'putinlyandiya',
    entry: { faction: 'aiParty', check: { skills: ['deception', 'persuasion', 'hacking'], dc: 15 }, toll: 50, battle: 'w-cc-gate' },
    desc: 'Сканеры ID, очередь, Чистильщики. Мёртвым вход свободный.' },
  { id: 'cc-dead-streets', name: 'Улицы мёртвых', region: 'aiParty', kind: 'wild', ...at(1150, 484), parent: 'putinlyandiya', danger: 3,
    npcs: ['archon'], terminal: { id: 'cc-terminal-2', state: 'ritual' },
    battles: [{ id: 'dead-streets', encounter: 'w-cc-dead', once: false },
      { id: 'streets-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    quests: ['sq-archon'], desc: 'Материализованные души вежливо здороваются. Некоторые — зубами.' },
  { id: 'cc-carwash', name: 'Автомойка Алика', region: 'aiParty', kind: 'town', ...at(1133, 482), parent: 'putinlyandiya',
    services: ['trade'], npcs: ['alik'], quests: ['sq-alik'], desc: 'Сеть автомоек. Под ней — сеть кое-чего ещё.' },
  { id: 'cc-duel-club', name: 'Подпольный дуэльный клуб', region: 'aiParty', kind: 'town', ...at(1152, 470), parent: 'putinlyandiya',
    services: ['train'], npcs: ['duel-master'], battles: [{ id: 'duel', encounter: 'w-cc-duel', once: false, when: 'quest' }],
    quests: ['sq-duel'], desc: 'Ставки, кровь, «Танец клинка» для выживших.' },
  { id: 'cc-temple', name: 'Храм Приговора', region: 'aiParty', kind: 'terminal', ...at(1156, 478), parent: 'putinlyandiya', danger: 3,
    terminal: { id: 'cc-terminal-3', state: 'ritual' },
    battles: [{ id: 'temple-terminal', encounter: 'w-cc-terminal', once: true, when: 'terminal' }],
    desc: 'Бывший суд. Культ оставил вывеску и поменял обвиняемого.' },
  { id: 'cc-node', name: 'Главный узел', region: 'aiParty', kind: 'boss', ...at(1142, 490), parent: 'putinlyandiya', danger: 5,
    npcs: ['cyber-priest'], requires: { flag: 'cc-node-found' },
    battles: [{ id: 'finale', encounter: 'w-cc-finale', once: true, when: 'quest' }],
    desc: 'Под столицей Партии сходится вся сеть «Третьего исхода». Судья ищет тело именно здесь.' },
  { id: 'putin-inner', name: 'Внутренний город', region: 'aiParty', kind: 'town', ...at(1141, 471), parent: 'putinlyandiya', danger: 5,
    requires: { rep: { faction: 'aiParty', min: 'ally' } }, services: ['rest', 'trade', 'implant'],
    desc: 'Закрытая столица: «лишь особенные могут там находиться». Там Путин Марк 2 и Генерал ИИ.' },
];

// ------------------------------------------------------------------ сборка
const LIST = [];
const burgById = {};
for (const b of BURGS) {
  burgById[b.id] = b;
  const info = BURG_INFO[b.slug] || {};
  const tier = burgTier(b);
  const services = info.services ? [...info.services] : [...TIER_SERVICES[tier], ...(info.extraServices || [])];
  if (b.port && !services.includes('harbor')) services.push('harbor');
  LIST.push({
    ...BASE(), ...at(b.x, b.y),
    id: b.slug, name: info.name || b.name, region: b.faction, kind: 'town', tier,
    faction: b.faction, pop: b.pop, capital: !!b.capital, port: !!b.port,
    entry: { faction: b.faction },
    ...info, services,
  });
}
for (const m of MARKERS) {
  const info = MARKER_INFO[m.slug];
  if (!info) continue;
  LIST.push({ ...BASE(), ...at(m.x, m.y), id: m.slug, poi: m.custom ? 'author' : m.type, icon: m.icon, ...info });
}
for (const e of EXTRA) LIST.push({ ...BASE(), canonMap: false, ...e });

/**
 * Алиасы: старые id v1.0 и id мест из npcs.js LOCATIONS → новый узел. Запись алиаса — копия цели с aliasOf и
 * alias: true (у неё есть pos/px, чтобы старые сохранения и UI не падали). Маршруты строятся только по настоящим id.
 */
export const ALIASES = {
  // v1.0
  'funicular': 'mesto-krusheniya-alfa-garmonii',
  'galina-dacha': 'dacha-babki',
  'dacha-hatch': 'bunker-lisa',
  'neutral-villages': 'svyatost',
  'cringe-border': 'dozorka-dzhona',
  'villages-tower': 'ostanovka',
  'agrozone': 'battlefields-m11',
  'burg-svoboda': 'ruins-m37',
  'burg-beton': 'gidroponika',
  'agro-terminal': 'ruins-m38',
  'corruption-city': 'putinlyandiya',
  // места из npcs.js LOCATIONS (у NPC там стоит location)
  'flat-lagoon': 'pirates-m30',
  'lagoon-bar': 'pirates-m30',
  'pirate-fleet': 'pirates-m29',
  'warprom': 'kreml',
  'warprom-corridor': 'dungeons-m12',
  'king-dumps': 'svalka',
  'scavenger-camp': 'svalka',
  'khatab-city': 'raytsentr', // автор: Хатаб-Сити — столица пиратов (бург Райцентр)
  'vazgen-lab': 'dungeons-m15', // режиссёр: тайная лаборатория Вазгена — «никто не может найти»
  'wastes': 'ancient-bunker', // режиссёр: пустоши техоньков
  'west-sector': 'battlefields-m9',
  'ai-capital': 'putin-inner',
  'tin-citadel': 'slavotech',
  'tin-arena': 'velikaya-arena',
  'tin-consulate': 'selyshko',
  'sky-bazaar': 'krushenie-nebesnogo-bazara',
  'beast-lands': 'vonyuchka',
  'green-border': 'garmoniya',
  'ancient-bunker': 'ruins-m36',
  'proxy-wastes': 'stanok',
  'mechanid-works': 'betonka',
  'predlozhka-archive': 'baza-predlozhki',
  'cyberspace': 'kiberspeys',
};

/** NPC, чьё место в v3 не совпадает с алиасом их npcs.js location (лидеры кринжгонов — у себя дома, а не на дозорке). */
export const NPC_PLACE = {
  'cringe-chief': 'pepelnoe-gornilo',
  'cringe-jester': 'pepelnoe-gornilo',
  'great-collector': 'dungeons-m14',
  'diss': 'pirates-m30',
};

export const LOCATIONS = Object.fromEntries(LIST.map((l) => [l.id, l]));

// v4 (ур. 6–20): свободные бои узлов по шкале уровней (battles-v4.js); квестовые бои узлов не затронуты
for (const [id, bs] of Object.entries(NODE_BATTLES_V4)) {
  if (!LOCATIONS[id]) throw new Error(`battles-v4: unknown node "${id}"`);
  LOCATIONS[id].battles = [...LOCATIONS[id].battles, ...bs];
}

// NPC по месту из npcs.js: если у узла нет явного списка npcs, его заполняют NPC, чей location (через ALIASES / NPC_PLACE)
// указывает на этот узел. Камео партии настолки (cameo) — только в ивентах, на узлы не ставятся.
{
  const placed = new Set(LIST.flatMap((l) => l.npcs));
  const explicit = new Set(LIST.filter((l) => l.npcs.length).map((l) => l.id));
  for (const n of Object.values(NPCS)) {
    if (n.cameo || placed.has(n.id)) continue;
    const target = NPC_PLACE[n.id] || ALIASES[n.location] || n.location;
    const node = LOCATIONS[target];
    if (!node || (explicit.has(target) && !NPC_PLACE[n.id])) continue;
    node.npcs = [...node.npcs, n.id];
    placed.add(n.id);
  }
  // third-exodus.md §3: density NPCs of the hub platform go into the explicit lists of harmony nodes
  for (const n of Object.values(NPCS)) {
    const node = n.density && LOCATIONS[n.location];
    if (node?.region === 'harmony' && !node.npcs.includes(n.id)) node.npcs = [...node.npcs, n.id];
  }
}

// third-exodus.md §3: density caches (density-caches.js) → node caches { id, check, loot: [{ item, n }, { credits }], text }
export const cacheLoot = (ids = [], credits = 0) => {
  const n = {};
  for (const id of ids) n[id] = (n[id] || 0) + 1;
  return [...Object.entries(n).map(([item, k]) => ({ item, n: k })), ...(credits ? [{ credits }] : [])];
};
for (const c of CACHES_DENSITY) {
  if (!LOCATIONS[c.node]) throw new Error(`density-caches: unknown node "${c.node}"`);
  LOCATIONS[c.node].caches = [...LOCATIONS[c.node].caches, { id: c.id, check: c.check, loot: cacheLoot(c.loot, c.credits), text: c.text }];
}

for (const [old, target] of Object.entries(ALIASES)) {
  if (LOCATIONS[target] && !LOCATIONS[old]) LOCATIONS[old] = { ...LOCATIONS[target], id: old, aliasOf: target, alias: true };
}

/** Настоящий id узла (алиас → цель). */
export const resolveLocation = (id) => (LOCATIONS[id]?.aliasOf) || id;
/** Только настоящие узлы (без алиасов) — для карты и графа. */
export const MAP_NODES = LIST.map((l) => l.id);

/** Узел старта после пролога и узлы, открытые сразу. */
export const START_LOCATION = 'alpha-harmony';
export const START_DISCOVERED = ['alpha-harmony', 'harmony-reactor', 'harmony-sector-d', 'harmony-workshop', 'harmony-post',
  'mesto-krusheniya-alfa-garmonii', 'garmoniya', 'gidroponika', 'vonyuchka', 'pirates-m29'];

/** Точка возвращения души по умолчанию. */
export const DEFAULT_RESPAWN = 'harmony-reactor';

/**
 * Состояния мира для хаба (ответ автора канона: Альфа-Гармония разобьётся в будущем). Флаг сохранения — key.
 * После крушения: хаб переезжает, узлы платформы закрыты, утёс становится местом крушения (stateDesc).
 */
export const HUB_STATES = {
  default: { hub: 'alpha-harmony', respawn: 'harmony-reactor', closed: [] },
  'harmony-fallen': {
    hub: 'raytsentr',                         // предложение: техникумы уходят к пиратам, которые и так кормили платформу (❓ в GDD)
    respawn: 'kiberspeys',                    // до перепрошивки нового терминала — только разлом у Сокральни
    closed: ['alpha-harmony', 'harmony-reactor', 'harmony-sector-d', 'harmony-workshop', 'harmony-post'],
    crashSite: 'mesto-krusheniya-alfa-garmonii',
    moveNpcs: { raytsentr: ['sera', 'paracetamol', 'amanda', 'aynura', 'nikola', 'pip-junior', 'victor-sundown', 'gans', 'cook-kasha'] },
  },
};

/**
 * Терминалы Киберспейса (world.md, п. 1). Действия на узле с terminal.state === 'ritual' после боя охраны:
 * break — сломать (state 'dead'); reflash — перепрошить (state 'ours'); leave — уйти.
 * advFlags — флаги, дающие преимущество; cultRep — изменение репутации культа.
 */
export const TERMINAL_ACTIONS = {
  break:   { name: 'Сломать', check: { skills: ['tech', 'athletics'], dc: 13 }, result: 'dead', cultRep: -5, xp: 100 },
  reflash: { name: 'Перепрошить', check: { skills: ['hacking', 'judge'], dc: 15 }, advFlags: ['terminal-touch', 'judge-code'],
    result: 'ours', cultRep: -10, xp: 150 },
  leave:   { name: 'Оставить', check: null, result: null, cultRep: 0, xp: 0 },
};

/** Терминалы, которые облегчают финал (ENCOUNTERS['w-cc-finale'].reduce): каждый не-ritual убирает одного врага. */
export const FINALE_TERMINALS = ['term-villages', 'term-agrozone', 'cc-terminal-1', 'cc-terminal-2', 'cc-terminal-3'];

/** Цены услуг (креды). level — уровень героя. */
export const SERVICE_PRICES = {
  rest: (level) => 10 * level,          // бесплатно при «дружелюбны» с фракцией узла
  revive: (level) => 50 * level,        // вернуть компаньона из Киберспейса; на Гармонии бесплатно при «дружелюбны» с техникумами
  toll: (base) => base,                 // пошлина на входе при «подозрительны»
};

/** Предметы v1.0 (минимум). price — базовая цена. Снаряжение v3 — game/src/data/items/* (другой отдел). */
export const ITEMS = {
  medkit: { id: 'medkit', name: 'Аптечка', price: 25, use: { heal: { dice: '2d4', bonus: 2, resource: 'hp' } }, desc: 'Вне боя: 2d4 + 2 ЗДР.' },
  calmers: { id: 'calmers', name: 'Успокоительное', price: 25, use: { heal: { dice: '2d4', bonus: 2, resource: 'mrl' } }, desc: 'Вне боя: 2d4 + 2 МРЛ.' },
  grenade: { id: 'grenade', name: 'Самодельная граната', price: 40, desc: 'На один бой: способность «Граната» (2d6 огня, радиус 1, спас ЛВК СЛ 12).' },
  rations: { id: 'rations', name: 'Ящик пайков', price: 50, desc: 'Квестовый предмет: еда для сектора D.' },
  'servo-parts': { id: 'servo-parts', name: 'Сервоприводы', price: 80, desc: 'Довоенные детали. Айнура и Никола обрадуются.' },
  'rare-parts': { id: 'rare-parts', name: 'Редкие детали', price: 120, desc: 'Нужны для «Оружейного тюнинга».' },
  'seed-bank': { id: 'seed-bank', name: 'Банка семян', price: 0, desc: 'Последние семена Агрозоны.' },
  'blank-chips': { id: 'blank-chips', name: 'Пустые ID-чипы', price: 0, desc: 'Квестовый предмет Лёвы.' },
  'alik-package': { id: 'alik-package', name: 'Посылка Алика', price: 0, contraband: true, desc: 'Не открывать. Не трясти. Не спрашивать.' },
  'soul-shard': { id: 'soul-shard', name: 'Осколок памяти', price: 0, desc: 'Чужая память, тёплая на ощупь.' },
  'terminal-shard': { id: 'terminal-shard', name: 'Осколок терминала', price: 40, desc: 'С могилы Виктора. Голубая метка «К.». Иногда шепчет голосом, который умеет ждать.' },
  'plague-sample': { id: 'plague-sample', name: 'Проба чумы металла', price: 0, desc: 'Ржавчина, которая шевелится. Держать в банке.' },
  'cup-crown': { id: 'cup-crown', name: 'Корона из кубков', price: 150, desc: 'Корона Короля свалок. Один кубок — за третье место.' },
  'oak-amulet': { id: 'oak-amulet', name: 'Дубовый амулет', price: 30, desc: 'Пиратская защита от Судьи. Эффективность не подтверждена. Совсем.' },
  // --- предметы ивентов партии (world/events.js)
  'dawn-schematic': { id: 'dawn-schematic', name: 'Схема проекта «Рассвет»', price: 0, key: true,
    world: [{ check: 'tech', bonus: 2 }],
    desc: 'Чертёж Куксиуса. Пока в рюкзаке — Технологии +2. Никола отдал бы за неё полмастерской.' },
  'lockpick-set': { id: 'lockpick-set', name: 'Набор отмычек Лизы', price: 60,
    world: [{ check: 'lockpicking', bonus: 2 }],
    desc: 'Чужие отмычки. Пока в рюкзаке — Взлом +2. Совесть −1 (не считается).' },
  'artyom-scope': { id: 'artyom-scope', name: 'Прицел Артёма', price: 100,
    passives: [{ id: 'item-artyom-scope', name: 'Прицел Артёма', desc: '+1 к атаке дальним оружием.', op: { hit: 1 } }],
    req: { weapon: 'ranged' },
    desc: 'Снайперский прицел. Стрелку (оружие с range > 1) — +1 к атаке; ближникам бесполезен.' },
};
// Предметы с world / passives работают, пока лежат в инвентаре героя (экипировки в v1 нет).
// passives предмета считаются как пассивки таланта, но НЕ занимают лимит боевых талантов (как примочки).
