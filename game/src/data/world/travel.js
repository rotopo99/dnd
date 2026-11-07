// Перемещение v3 по канон-карте. Спека: docs/specs/world.md, п. 2.
// Путь двусторонний: [from, to, kind, extra?]. km — по координатам карты (1 px = 4 км) или канон-маршруту (ROUTES canon-map.js);
// days = ceil(km / SPEED[kind]); danger по умолчанию — регион узла `to`; rolls — сколько бросков встречи за путь.
// kind: 'district' (район в городе, 0 дней) | 'road' | 'trail' | 'wild' (бездорожье) | 'sea' (пиратские лодки, платно)
//       | 'lake' (паром братства) | 'canoe' (лодки на Ледяной остров) | 'tunnel' (тайный ход).
// Переход между светами: только Великий тракт через пиратский перешеек (север) или море.

import { LOCATIONS } from './locations.js';
import { REGIONS } from './regions.js';
import { SKILL_EVENTS } from './travel-skills.js';
import { TABLE_BATTLES_V4, SEA_EXTRA_V4 } from './battles-v4.js';

/** км в день по типу пути. */
export const SPEED = { district: Infinity, road: 40, trail: 25, wild: 20, sea: 150, lake: 100, canoe: 60, tunnel: 30 };
/** Сколько км на один бросок встречи (не меньше 1 броска, если danger > 0; district — 0). */
export const ENCOUNTER_ROLL_KM = { district: Infinity, road: 300, trail: 200, wild: 150, sea: 500, lake: 400, canoe: 300, tunnel: 200 };
/** Плата пиратам за море: кредов за каждые 150 км; дружелюбны −50%, союзники — бесплатно. Паром братства бесплатный. */
export const FARE = { sea: 10, canoe: 30, lake: 0, perKm: 150, friendlyMult: 0.5, allyMult: 0 };
/** Морские и лодочные пути закрыты при «враждебны» с пиратами (паром — при «враждебны» с братством). */
const PIRATE_BOAT = { rep: { faction: 'pirates', min: 'suspicious' } };
const TIN_FERRY = { rep: { faction: 'tinBrotherhood', min: 'suspicious' } };

// ------------------------------------------------------------------ рёбра
const E = [
  // ---------- Альфа-Гармония и утёс
  ['alpha-harmony', 'harmony-reactor', 'district'], ['alpha-harmony', 'harmony-sector-d', 'district'],
  ['alpha-harmony', 'harmony-workshop', 'district'], ['alpha-harmony', 'harmony-post', 'district'],
  ['alpha-harmony', 'mesto-krusheniya-alfa-garmonii', 'district', { name: 'Фуникулёр' }],
  ['mesto-krusheniya-alfa-garmonii', 'sea-monsters-m19', 'sea'],
  ['mesto-krusheniya-alfa-garmonii', 'garmoniya', 'sea', { name: 'К мутантам-Р' }],
  ['mesto-krusheniya-alfa-garmonii', 'gidroponika', 'sea', { name: '«К огню»: в Агрозону' }],
  ['mesto-krusheniya-alfa-garmonii', 'vonyuchka', 'sea', { name: '«К маякам»: на западный свет' }],
  ['mesto-krusheniya-alfa-garmonii', 'pirates-m29', 'sea'],
  ['mesto-krusheniya-alfa-garmonii', 'shtabtsentr', 'sea'],
  ['mesto-krusheniya-alfa-garmonii', 'ruins-m35', 'trail', { name: 'Тропа по мысу' }],

  // ---------- Пиратский перешеек (Великий тракт Свалка — Штабцентр, канон 2150 км, разбит на участки)
  ['svalka', 'ruins-m35', 'road', { name: 'Великий тракт' }], ['ruins-m35', 'raytsentr', 'road'],
  ['ruins-m35', 'brigands-m26', 'road', { name: 'Великий тракт' }], ['brigands-m26', 'pirates-m30', 'road', { name: 'Великий тракт' }],
  ['pirates-m30', 'shtabtsentr', 'road', { name: 'Великий тракт' }],
  ['raytsentr', 'circuses-m40', 'trail'], ['brigands-m26', 'baza-predlozhki', 'trail'],
  ['pirates-m30', 'krushenie-nebesnogo-bazara', 'trail'],
  ['raytsentr', 'ledyanoy-ring', 'canoe', { name: 'Лодки на Ледяной остров' }], ['ledyanoy-ring', 'necropolises-m47', 'wild'],

  // ---------- Мусорщики
  ['svalka', 'sputnik', 'trail'], ['svalka', 'dungeons-m13', 'trail'], ['svalka', 'lox-4', 'trail'], ['svalka', 'artem', 'wild'],
  ['svalka', 'dodze', 'road'], ['svalka', 'vonyuchka', 'road', { km: 688 }],

  // ---------- Жестяное братство
  ['dodze', 'zhestoboy', 'road'], ['dodze', 'velikiy-khram', 'trail'], ['dodze', 'dungeons-m17', 'trail'],
  ['dodze', 'lake-monsters-m18', 'trail'], ['dodze', 'battlefields-m9', 'trail'], ['dodze', 'selyshko', 'road'],
  ['selyshko', 'slavotech', 'road'], ['selyshko', 'noch', 'road'], ['selyshko', 'brigands-m27', 'trail'],
  ['slavotech', 'velikaya-arena', 'road'], ['slavotech', 'dzen', 'trail'], ['slavotech', 'noch', 'road'],
  ['noch', 'fortetsiya', 'road'], ['fortetsiya', 'boynik', 'trail'], ['fortetsiya', 'zhesternya', 'trail'],
  ['zhestoboy', 'velikiy-mekh', 'trail'], ['zhestoboy', 'stoikost-2', 'road'], ['zhestoboy', 'betonka', 'road', { km: 967 }],
  ['zhestoboy', 'slavotech', 'lake', { name: 'Паром по Жестяному озеру', requires: TIN_FERRY }],
  ['zhestoboy', 'lake-monsters-m18', 'lake', { requires: TIN_FERRY }],
  ['zhesternya', 'lox-2', 'trail'], ['zhesternya', 'kalostok', 'trail'],

  // ---------- Мутанты-Ж
  ['vonyuchka', 'lesyanka', 'trail'], ['lesyanka', 'selyshko', 'trail'], ['lesyanka', 'boynik', 'trail'],
  ['boynik', 'zhesternya', 'trail'], ['proeb', 'kalostok', 'trail', { km: 302 }], ['proeb', 'liza', 'wild'],

  // ---------- Нейтральные селения
  ['kalostok', 'dacha-babki', 'trail'],
  ['dacha-babki', 'bunker-lisa', 'trail', { hidden: true, reveal: 'galina-told', name: 'Люк под дачей' }],
  ['kalostok', 'dozorka-dzhona', 'trail'], ['dozorka-dzhona', 'beacon-1', 'wild'], ['dozorka-dzhona', 'beacon-2', 'wild'],
  ['beacon-1', 'beacon-3', 'wild', { hidden: true, reveal: 'khikhik-talked' }],
  ['kalostok', 'svyatost', 'trail', { km: 198 }], ['svyatost', 'lox', 'trail'], ['svyatost', 'peremoga', 'trail'],
  ['peremoga', 'ostanovka', 'trail'], ['ostanovka', 'belba', 'trail'], ['ostanovka', 'stoikost', 'trail'],
  ['peremoga', 'agrara', 'road'], ['agrara', 'svoboda', 'road'], ['agrara', 'smotreltse', 'road'],
  ['svoboda', 'zavod', 'road', { km: 527 }],

  // ---------- Техоньки
  ['zavod', 'betonka', 'road', { km: 511 }], ['zavod', 'libraries-m39', 'trail'], ['zavod', 'brigands-m28', 'trail'],
  ['zavod', 'brigands-m25', 'trail'], ['zavod', 'ruins-m36', 'trail'], ['stanok', 'ruins-m36', 'trail'],
  ['stanok', 'lox-3', 'trail'], ['stanok', 'smotreltse', 'road'], ['stanok', 'betonka', 'road'],
  ['smotreltse', 'hill-monsters-m20', 'trail'], ['hill-monsters-m20', 'dzen', 'wild'],

  // ---------- Механиды
  ['betonka', 'jousts-m41', 'district'], ['betonka', 'battlefields-m10', 'trail'], ['betonka', 'ekspeditsiya-istseleniya', 'trail'],
  ['ekspeditsiya-istseleniya', 'semya-chumy', 'wild'], ['battlefields-m10', 'semya-chumy', 'wild'],
  ['stoikost-2', 'caves-m46', 'trail'], ['caves-m46', 'dungeons-m16', 'trail'], ['dungeons-m16', 'dungeons-m15', 'wild'],

  // ---------- Мутанты-Р и Агрозона
  ['garmoniya', 'gidroponika', 'road', { km: 334 }], ['garmoniya', 'sacred-forests-m21', 'trail'],
  ['gidroponika', 'cleaner-checkpoint', 'road'], ['cleaner-checkpoint', 'battlefields-m11', 'road'],
  ['battlefields-m11', 'ruins-m37', 'trail'], ['battlefields-m11', 'sheryanka', 'trail'], ['ruins-m37', 'ruins-m38', 'trail'],
  ['ruins-m38', 'cleaner-checkpoint', 'trail'], ['sacred-forests-m21', 'battlefields-m11', 'trail'],

  // ---------- Культ
  ['gidroponika', 'sokralnya', 'road', { km: 366 }], ['sokralnya', 'kiberspeys', 'trail'], ['sokralnya', 'vooruzhenie', 'trail'],
  ['sokralnya', 'shtabtsentr', 'road', { km: 363 }], ['sokralnya', 'putinlyandiya', 'road'],

  // ---------- АИ Партия (Путинляндия = Коррупция-Сити) и Военпром
  ['putinlyandiya', 'cc-gate', 'district'], ['putinlyandiya', 'cc-dead-streets', 'district'],
  ['putinlyandiya', 'cc-carwash', 'district'], ['putinlyandiya', 'cc-duel-club', 'district'],
  ['putinlyandiya', 'putin-inner', 'district'], ['cc-dead-streets', 'cc-temple', 'district'],
  ['cc-temple', 'cc-node', 'district', { requires: { flag: 'cc-node-found' } }],
  ['putinlyandiya', 'inns-m5', 'road'], ['inns-m5', 'shtabtsentr', 'road'], ['putinlyandiya', 'necropolises-m49', 'trail'],
  ['putinlyandiya', 'kreml', 'road'], ['kreml', 'dungeons-m12', 'trail'], ['kreml', 'mogila-viktora', 'trail'],
  ['kreml', 'pepelnoe-gornilo', 'road', { km: 809 }],
  ['cc-carwash', 'battlefields-m11', 'tunnel', { hidden: true, reveal: 'alik-tunnel', name: 'Тоннель Алика' }],

  // ---------- Отступники
  ['shtabtsentr', 'marta', 'district'], ['shtabtsentr', 'lox-5', 'trail'], ['shtabtsentr', 'bunker-kuksiusa', 'trail'],
  ['bunker-kuksiusa', 'mogila-viktora', 'trail'], ['shtabtsentr', 'krushenie-nebesnogo-bazara', 'trail'],

  // ---------- Кринжгоны
  ['pepelnoe-gornilo', 'vyzhigatel-vayba', 'trail'], ['pepelnoe-gornilo', 'nadezhda', 'road'],
  ['nadezhda', 'necropolises-m48', 'trail'], ['nadezhda', 'dungeons-m14', 'trail'], ['baza-predlozhki', 'dungeons-m14', 'wild'],

  // ---------- Море (порты port: true, пиратские стоянки, утёс Гармонии)
  ['pirates-m29', 'vonyuchka', 'sea'], ['garmoniya', 'gidroponika', 'sea'], ['gidroponika', 'shtabtsentr', 'sea'],
  ['pirates-m29', 'svoboda', 'sea', { name: 'Вокруг южного мыса' }], ['svoboda', 'zavod', 'sea'], ['zavod', 'betonka', 'sea'],
  ['betonka', 'pirates-m30', 'sea', { name: 'Северный путь' }], ['pirates-m30', 'pepelnoe-gornilo', 'sea'],
  ['pirates-m30', 'shtabtsentr', 'sea'],
];

const BOATS = new Set(['sea', 'canoe']);
const kmOf = (a, b) => Math.round(Math.hypot(a.px.x - b.px.x, a.px.y - b.px.y) * 4);

export const ROUTES = E.map(([from, to, kind, x = {}]) => {
  const a = LOCATIONS[from], b = LOCATIONS[to];
  const km = x.km ?? (a && b ? kmOf(a, b) : 0);
  const days = kind === 'district' ? 0 : Math.max(1, Math.ceil(km / SPEED[kind]));
  const danger = x.danger ?? (kind === 'district' ? 0 : (b?.danger ?? REGIONS[b?.region]?.danger ?? 1));
  const rolls = danger > 0 && kind !== 'district' ? Math.max(1, Math.ceil(km / ENCOUNTER_ROLL_KM[kind])) : 0;
  const fare = BOATS.has(kind) ? (kind === 'canoe' ? FARE.canoe : Math.max(FARE.sea, Math.round(km / FARE.perKm) * FARE.sea)) : 0;
  const region = BOATS.has(kind) || kind === 'lake' ? 'sea' : b?.region;
  return {
    from, to, kind, km, days, danger, rolls, fare, region,
    requires: x.requires ?? (BOATS.has(kind) ? PIRATE_BOAT : null),
    hidden: !!x.hidden, reveal: x.reveal || null, name: x.name || null,
  };
});

/** Встреча, если d20 <= ENCOUNTER_PER_DANGER × danger + mod (не ниже 1 при danger > 0). Бросков за путь — route.rolls. */
export const ENCOUNTER_DIE = 20;
export const ENCOUNTER_PER_DANGER = 3;

/** Модификаторы шанса встречи (world.md, п. 2). */
export const ENCOUNTER_MODS = {
  safeRouteBestTwo: true,
  pirates: { friendly: -1, ally: -2 },    // пираты контролируют дороги и моря
  night: 3,
};

export const AMBUSH = { skill: 'perception', dc: 12, enemyInit: 5 };
export const FIELD_CAMP = { restore: 0.5, encounterRoll: true };

// ------------------------------------------------------------------ таблицы встреч (по регионам + море)
// Формат записи — как в v1.0 (world.md, п. 2). tag — желаемый тип врагов для enemies-v3; бой пока берёт encounter.
const B = (w, encounter, faction, x = {}) => ({ w, kind: 'battle', encounter, faction, ...x });
const TRADER = (w, stock) => ({ w, kind: 'trader', stock });
const RUMOR = (w = 1) => ({ w, kind: 'rumor' });
const EV = (w, id, text, check, success, fail) => ({ w, kind: 'event', id, text, check, success, fail });

const EV_REFUGEES = EV(2, 'ev-refugees', 'Колонна беженцев. Просят воды и дорогу к Гармонии.', { skills: ['persuasion', 'survival'], dc: 12 },
  { text: 'Показали дорогу. Кто-то сунул банку тушёнки.', xp: 60, rep: { technikums: 2 }, items: [{ item: 'medkit', n: 1 }] },
  { text: 'Колонна разбрелась.', mrl: -3 });
const EV_STORM = EV(2, 'ev-proxy-storm', 'Прокси-буря: техника в рюкзаках искрит, импланты сходят с ума.', { skills: ['proxy', 'tech', 'survival'], dc: 14, group: true },
  { text: 'Переждали в яме. Буря прошла мимо.', xp: 60 },
  { text: 'Буря зацепила: всё механическое бьёт током.', hp: -4 });

export const ENCOUNTER_TABLES = {
  harmony: [],
  neutralVillages: [
    B(3, 'w-villages-jesters', 'cringegons'), B(3, 'w-road-crawlers', null), B(1, 'w-road-pirates', 'pirates'),
    EV(2, 'ev-lost-goat', 'На дороге мечется коза старейшины. Козу надо вернуть, а она против.', { skills: ['survival', 'athletics'], dc: 12 },
      { text: 'Коза дома. Селяне запомнили.', xp: 50, rep: { neutralVillages: 3 } }, { text: 'Коза победила.', mrl: -2 }),
    EV(2, 'ev-beacon-echo', 'Ветер приносит обрывок кринж-анекдота.', { skill: 'meditation', dc: 13, group: true },
      { text: 'Выдержали. Даже не улыбнулись.', xp: 40 }, { text: 'Кто-то хихикнул. Всем стыдно.', mrl: -4 }),
    TRADER(2, ['medkit', 'calmers', 'oak-amulet']), RUMOR(), { w: 1, kind: 'npc', npc: 'nomad-vetla' },
  ],
  tinBrotherhood: [
    B(2, 'w-road-scavengers', 'scavengers', { raceWeight: { skeleton: 3 } }), B(2, 'w-road-crawlers', null),
    B(1, 'w-agro-cleaners', 'aiParty', { tag: 'ai-remnants' }),
    EV(3, 'ev-tin-patrol', 'Патруль братства: «Назови честь свою».', { skills: ['persuasion', 'religion', 'military'], dc: 12 },
      { text: 'Патруль кланяется и делится пайком.', xp: 50, rep: { tinBrotherhood: 3 } }, { text: 'Патруль недоволен: «Под сталью — пусто».', rep: { tinBrotherhood: -2 } }),
    TRADER(2, ['medkit', 'grenade']), RUMOR(), { w: 1, kind: 'npc', npc: 'mad-nail' },
  ],
  mutantsBeast: [
    B(3, 'w-road-crawlers', 'mutantsBeast', { tag: 'mutant-beast-pack' }), B(1, 'w-road-pirates', 'pirates'),
    EV(2, 'ev-swamp', 'Тропа ушла в болото.', { skills: ['survival', 'biology'], dc: 13, group: true },
      { text: 'Нашли брод по кочкам.', xp: 50 }, { text: 'Пиявки размером с ботинок.', hp: -3 }),
    TRADER(1, ['medkit']), RUMOR(),
  ],
  scavengers: [
    B(4, 'w-road-scavengers', 'scavengers', { raceWeight: { skeleton: 3 } }), B(1, 'w-road-crawlers', null),
    EV(2, 'ev-junk-pile', 'Гора хлама шевелится. Внутри что-то ценное — или кто-то голодный.', { skills: ['perception', 'tech'], dc: 13 },
      { text: 'Нашли детали.', xp: 40, items: [{ item: 'rare-parts', n: 1 }] }, { text: 'Хлам обрушился.', hp: -3 }),
    TRADER(2, ['medkit', 'grenade', 'rare-parts']), RUMOR(),
  ],
  tekhonki: [
    B(3, 'w-road-scavengers', 'tekhonki', { tag: 'tekhonki-raid' }), B(1, 'w-road-crawlers', null), EV_STORM,
    TRADER(1, ['grenade', 'rare-parts']), RUMOR(),
  ],
  mechanids: [
    B(4, 'w-villages-hatch', 'mechanids', { tag: 'mechanid-drones' }), EV_STORM,
    EV(2, 'ev-rust', 'Ржавый туман «чумы металла».', { skills: ['endurance', 'medicine'], dc: 14, group: true },
      { text: 'Обошли по ветру.', xp: 60 }, { text: 'Коррозия на всём металлическом.', hp: -4 }),
    RUMOR(),
  ],
  pirates: [
    B(3, 'w-road-pirates', 'pirates'), B(2, 'w-road-scavengers', 'scavengers'),
    EV(2, 'ev-toll', 'Пиратская застава: «Пошлина — 20 кредов или песня».', { skills: ['persuasion', 'deception', 'intimidation'], dc: 13 },
      { text: 'Пропустили за песню.', xp: 40 }, { text: 'Заплатили 20 кредов.', credits: -20 }),
    TRADER(2, ['medkit', 'calmers', 'grenade', 'oak-amulet']), RUMOR(),
  ],
  agrozone: [
    B(4, 'w-agro-cleaners', 'agrozone'), B(3, 'w-agro-rebels', 'renegades'),
    B(1, 'w-road-scavengers', 'scavengers', { raceWeight: { skeleton: 3 } }), EV_REFUGEES,
    EV(2, 'ev-burning-row', 'Огонь перекинулся на дорогу.', { skills: ['athletics', 'acrobatics'], dc: 13, group: true },
      { text: 'Проскочили сквозь дым.', xp: 40 }, { text: 'Обожглись.', hp: -4 }),
    TRADER(1, ['medkit', 'rations']), RUMOR(),
  ],
  mutantsPlant: [
    B(2, 'w-road-crawlers', 'mutantsPlant', { tag: 'mutant-plant-guard' }), B(2, 'w-agro-cleaners', 'aiParty'),
    EV(2, 'ev-spores', 'Облако спор над тропой. Красиво и чихательно.', { skills: ['biology', 'endurance'], dc: 12, group: true },
      { text: 'Мутанты-Р машут из рощи: свои.', xp: 40, rep: { mutantsPlant: 2 } }, { text: 'Чихали до вечера.', mrl: -2 }),
    TRADER(1, ['medkit', 'calmers']), RUMOR(),
  ],
  cult: [
    B(4, 'w-cc-dead', 'cult'), B(2, 'w-villages-terminal', 'cult'),
    EV(2, 'ev-sermon', 'Уличный проповедник зачитывает «приговор» прохожим.', { skills: ['religion', 'judge', 'deception'], dc: 14 },
      { text: 'Переспорили. Проповедник ушёл писать апелляцию.', xp: 60 }, { text: 'Приговор засел в голове.', mrl: -5 }),
    RUMOR(),
  ],
  renegades: [
    B(3, 'w-agro-rebels', 'renegades'), B(2, 'w-agro-cleaners', 'aiParty'), B(1, 'w-villages-jesters', 'cringegons'),
    EV(2, 'ev-minefield', 'Подступы заминированы. Таблички — на трёх языках и с ошибками.', { skills: ['perception', 'tech', 'military'], dc: 14 },
      { text: 'Прошли по флажкам.', xp: 60, rep: { renegades: 2 } }, { text: 'Мина. Маленькая, но обидная.', hp: -5 }),
    TRADER(1, ['medkit', 'grenade']), RUMOR(),
  ],
  aiParty: [
    B(3, 'w-cc-gate', 'aiParty'), B(3, 'w-cc-dead', 'cult'), B(1, 'w-road-pirates', 'pirates'),
    EV(2, 'ev-polite-dead', 'Мёртвый в шляпе вежливо спрашивает, который час. И где его тело.', { skills: ['persuasion', 'religion', 'judge'], dc: 14 },
      { text: 'Душа рассказывает, куда её тянет: к Храму Приговора.', xp: 80, flag: 'rumor-temple' }, { text: 'Холодное касание.', mrl: -5 }),
    EV(2, 'ev-id-scan', 'Дрон сканирует ID-чипы.', { skills: ['hacking', 'deception', 'stealth'], dc: 14 },
      { text: 'Дрон улетел, довольный.', xp: 60 }, { text: 'Тревога!', rep: { aiParty: -5 }, battle: 'w-cc-gate' }),
    TRADER(1, ['medkit', 'calmers', 'grenade', 'oak-amulet']), RUMOR(), { w: 1, kind: 'npc', npc: 'wanderer-knife' },
  ],
  warprom: [
    B(4, 'w-cc-gate', 'warprom', { tag: 'warprom-androids' }), B(1, 'w-agro-rebels', 'renegades'), RUMOR(),
  ],
  cringegons: [
    B(4, 'w-villages-beacon', 'cringegons', { tag: 'cringe-elite' }), B(3, 'w-villages-jesters', 'cringegons'),
    EV(2, 'ev-cringe-wave', 'Волна кринжа с Выжигателя Вайба.', { skill: 'meditation', dc: 16, group: true },
      { text: 'Выстояли.', xp: 80 }, { text: 'Стыд пробрал до костей.', mrl: -8 }),
  ],
  wilds: [
    B(3, 'w-road-crawlers', null, { tag: 'ice-beasts' }), B(1, 'w-cyberspace', null, { tag: 'frozen-souls' }),
    EV(2, 'ev-blizzard', 'Пурга.', { skills: ['survival', 'endurance'], dc: 15, group: true },
      { text: 'Вырыли снежную нору.', xp: 60 }, { text: 'Обморожения.', hp: -5 }),
  ],
  sea: [
    B(3, 'w-road-pirates', 'pirates'), B(2, 'w-road-crawlers', null, { tag: 'sea-monster' }),
    EV(2, 'ev-squall', 'Шквал. Капитан требует «надбавку за погоду».', { skills: ['persuasion', 'athletics'], dc: 13 },
      { text: 'Удержались на палубе, надбавку не дали.', xp: 40 }, { text: 'Заплатили 15 кредов и промокли.', credits: -15, mrl: -2 }),
    TRADER(1, ['medkit', 'oak-amulet']), RUMOR(),
  ],
};
// v4 (ур. 6–20): боевые записи регионов второго круга и дальше — по шкале уровней (battles-v4.js); события и торговцы остаются
for (const [r, bs] of Object.entries(TABLE_BATTLES_V4)) ENCOUNTER_TABLES[r] = [...bs, ...ENCOUNTER_TABLES[r].filter((e) => e.kind !== 'battle')];
ENCOUNTER_TABLES.sea.push(...SEA_EXTRA_V4);
// проверки навыков на дорогах (по региону) — world/travel-skills.js
for (const [r, list] of Object.entries(SKILL_EVENTS)) ENCOUNTER_TABLES[r].push(...list);
// старые ключи v1.0
ENCOUNTER_TABLES.villages = ENCOUNTER_TABLES.neutralVillages;
ENCOUNTER_TABLES.corruption = ENCOUNTER_TABLES.aiParty;

// Уникальные ивенты партии настолки — в world/events.js (EVENTS, триггер на узле).
