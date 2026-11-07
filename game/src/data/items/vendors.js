// Профили торговцев и наставников: у каждого NPC свой товар. Спека — docs/specs/vendors-bestiary.md (часть 1).
// Данные без логики: движок лавки (shop.js) собирает ассортимент по правилам спеки.
//
// ARCHETYPES — специализация: пулы предметов по ступеням (tier предмета 1–5), staples (всегда есть), buys, markup.
// FACTION_BANS — что фракция не продаёт и не покупает.
// VENDORS[npcId] = { arch, size, greed, restock, loves?, sig?, ed?, mentor?, addTrade?, lvl?, note }
//   sig   — «фирменное», 2–4 id: строка = эксклюзив (нигде больше не продаётся), { id, q:'masterwork' } = «издание» мастера.
//   ed    — (минорные торговцы) id оружия/брони/мода, которые у него продаются в мастеровом качестве (иначе — правило авто-изданий).
//   greed — наценка характера (−0.10 щедрый … +0.20 жадный), множитель цены = 1 + greed.
//   loves — что скупает дороже (×1.25): 'cat:weapon', 'cat:armor', 'cat:mod', 'kind:medicine', 'type:knife', 'group:ranged'.
//   lvl   — уровень региона вручную (если у узла нет region); иначе REGIONS[LOCATIONS[loc].region].levels[1].
//   mentor — наставник: размер лавки ≤ 4, скидка на обучение по репутации (спека, п. «Наставники»).
//   addTrade — у NPC в данных нет услуги 'trade': программист добавляет её.

export const TIER_CAP = [[3, 1], [5, 2], [9, 3], [14, 4], [99, 5]]; // [макс. levels[1] региона, потолок tier предметов]
export const tierCap = (lvl) => TIER_CAP.find(([m]) => lvl <= m)[1];

export const ROTATION = { defaultRestock: 4, sizes: { S: 5, M: 8, L: 11 }, rareChance: 0.3, rareMarkup: 1.3, junkShare: 0.5, lovesMul: 1.25 };

export const FACTION_BANS = {
  tinBrotherhood: ['plasma', 'laser', 'energy', 'cyberblade', 'melta', 'proxy', 'cringe'],
  tekhonki: ['cyberblade'],
  aiParty: ['kind:opiate', 'cringe'],
  mechanids: ['kind:food'],
  cringegons: [],
};

const A = (name, o) => ({ markup: 1, sellRate: 0.4, buys: ['weapon', 'armor', 'mod', 'consumable'], staples: [], ...o, name });

export const ARCHETYPES = {
  gunsmith: A('Оружейник (огнестрел)', { buys: ['weapon', 'mod'], staples: ['bottle-silencer'],
    tiers: { 1: ['samopal-pistol', 'nailgun', 'hunting-carbine', 'pipe-smg', 'ski-bow', 'bottle-silencer', 'red-dot-pawn', 'flame-hider', 'oil-mag'], 2: ['kedrach', 'pump-shotgun', 'shock-rifle', 'compensator', 'subsonic-barrel', 'hollow-mag', 'tracer-mag', 'rubber-mag', 'laser-pointer'], 3: ['sniper-rifle', 'rpg-tube', 'drum-mag', 'incendiary-mag', 'ap-mag', 'bipod', 'incendiary-muzzle', 'holo-reticle'], 4: ['wolf-fang', 'laser-rifle', 'thermal-scope', 'cryo-nozzle'], 5: ['lis-7-chuyo', 'lis-3-twin'] } }),
  bladesmith: A('Кузнец (холодное)', { buys: ['weapon', 'armor'], staples: ['serrated-edge'],
    tiers: { 1: ['machete', 'heavy-cleaver', 'hatchet', 'finka', 'bayonet', 'ritual-blade', 'rebar-spear', 'sickle', 'brass-knuckles', 'serrated-edge', 'weighted-edge', 'oiled-edge', 'wrapped-grip', 'mutant-tooth'], 2: ['fire-axe', 'power-sword', 'poison-edge', 'hooked-edge', 'shock-edge', 'trench-knife'], 3: ['watch-bastard', 'thermal-edge', 'acid-edge'], 4: ['monofil-katana', 'sleeper-blade', 'cryo-edge'], 5: [] } }),
  armorer: A('Бронник', { buys: ['armor', 'mod'], staples: ['quilted-jacket'],
    tiers: { 1: ['quilted-jacket', 'lined-leather', 'duster-coat', 'plated-overall', 'steel-sheet-plate', 'plate-rig', 'mesh-cloak', 'shielded-jacket', 'concert-kosuha', 'cult-robe', 'tire-patch', 'buckler-lid', 'door-shield'], 2: ['hazmat-suit', 'wire-mantle', 'host-jacket', 'tire-vest', 'sign-plate', 'scrap-plates', 'rubber-lining', 'asbestos-lining', 'loader-exo', 'quilted-lining', 'wet-suit', 'gas-filter', 'grip-spikes', 'swamp-boots', 'road-sign-shield', 'riot-shield', 'pocket-lining'], 3: ['concealed-vest', 'ceramic-insert', 'foil-lining', 'kevlar-sheet', 'fire-blanket', 'acid-coat', 'quiet-soles', 'tower-shield'], 4: ['wolf-link', 'reactive-plate', 'faraday-cage'], 5: ['kuznechik-walker', 'lis-8-hide', 'wolf-5-frame'] } }),
  medic: A('Аптекарь / медик', { markup: 1.05, buys: ['consumable'], sellRate: 0.45, staples: ['bandage', 'medkit'],
    tiers: { 1: ['bandage', 'medkit', 'calmers', 'analgin', 'valerian'], 2: ['calmers', 'rations'], 3: ['rations'], 4: [], 5: [] } }),
  techmod: A('Техник (моды и детали)', { buys: ['mod', 'weapon', 'consumable'], staples: ['repair-kit', 'electrical-tape'],
    tiers: { 1: ['electrical-tape', 'serrated-edge', 'loupe-sight', 'repair-kit', 'krona-battery', 'mech-bolt', 'wrapped-grip'], 2: ['compensator', 'scrap-plates', 'rubber-lining', 'asbestos-lining', 'servo-parts', 'proxy-can', 'sprint-spikes', 'spiked-plates', 'spare-cell', 'shock-edge', 'pocket-lining', 'tac-flashlight'], 3: ['drum-mag', 'shock-winding', 'ceramic-insert', 'foil-lining', 'magnet-anchors', 'arc-thrower', 'party-cell', 'rare-parts', 'shock-mag', 'acid-mag', 'proxy-lens', 'proxy-resonator', 'mirror-plate', 'insulator-lining', 'holo-reticle'], 4: ['lis-4-sniffer', 'wolf-link', 'arc-capacitor', 'hover-pads', 'cryo-edge', 'thermal-scope'], 5: ['lis-6-core'] } }),
  junk: A('Барахольщик (хлам)', { markup: 0.8, sellRate: 0.3, staples: ['tushenka', 'bandage'],
    tiers: { 1: ['shiv', 'pipe-smg', 'brass-knuckles', 'bear-trap', 'tushenka', 'electrical-tape', 'bandage', 'molotov', 'wire-bolas', 'throwing-knives', 'quilted-jacket', 'tire-patch', 'weighted-edge', 'oiled-edge', 'oil-mag', 'door-shield'], 2: ['tire-vest', 'tripwire', 'scrap-plates', 'kedrach', 'fire-axe', 'sprint-spikes', 'swamp-boots', 'side-pistol'], 3: ['shock-mat', 'rare-parts'], 4: ['drum-mag'], 5: [] } }),
  general: A('Лавочник (всякое)', { sellRate: 0.4, staples: ['bandage', 'tushenka'],
    tiers: { 1: ['bandage', 'tushenka', 'quilted-jacket', 'hatchet', 'machete', 'calmers', 'krona-battery', 'duster-coat', 'buckler-lid', 'side-pistol', 'wrapped-grip'], 2: ['medkit', 'hazmat-suit', 'pump-shotgun', 'portable-barricade', 'quilted-lining', 'tac-flashlight'], 3: ['concealed-vest', 'party-cell'], 4: ['lis-4-sniffer'], 5: [] } }),
  chemist: A('Химик (гранаты и ловушки)', { buys: ['consumable'], staples: ['grenade', 'molotov'],
    tiers: { 1: ['grenade', 'molotov', 'bear-trap'], 2: ['frag-grenade', 'proxy-can', 'tripwire', 'portable-barricade'], 3: ['emp-grenade', 'shock-mat'], 4: ['emp-grenade'], 5: ['shock-mat'] } }),
  cyber: A('Кибер-торговец (импланты и энергооружие)', { markup: 1.15, buys: ['weapon', 'mod'], staples: ['krona-battery'],
    tiers: { 1: ['shock-baton', 'proxy-sling', 'krona-battery'], 2: ['shock-rifle', 'proxy-can'], 3: ['laser-pistol', 'arc-thrower', 'party-cell', 'emp-grenade', 'cringe-amp', 'proxy-resonator', 'arc-capacitor'], 4: ['laser-rifle', 'lis-3-twin', 'hover-pads', 'cryo-nozzle'], 5: ['lis-4-sniffer'] } }),
  scholar: A('Книжник / наставник', { markup: 1.1, buys: ['mod', 'consumable'], sellRate: 0.45, staples: ['calmers', 'valerian'],
    tiers: { 1: ['calmers', 'valerian', 'bandage', 'loupe-sight'], 2: ['megaphone', 'portable-barricade', 'terminal-shard'], 3: ['party-cell', 'terminal-shard'], 4: [], 5: [] } }),
  provisions: A('Харчевник / раздатчик', { markup: 0.9, buys: ['consumable'], sellRate: 0.5, staples: ['tushenka'],
    tiers: { 1: ['tushenka', 'bandage', 'calmers', 'krona-battery', 'rations'], 2: ['rations', 'medkit'], 3: ['rations'], 4: ['rations'], 5: ['rations'] } }),
  bard: A('Сценический торговец (кринж-инструменты)', { buys: ['weapon', 'consumable'], staples: ['calmers'],
    tiers: { 1: ['mic-cord', 'spoons', 'valerian', 'calmers'], 2: ['megaphone'], 3: ['valerian'], 4: ['valerian'], 5: ['valerian'] } }),
  hunter: A('Охотник (шкуры, луки, капканы)', { buys: ['weapon', 'armor', 'consumable'], staples: ['bear-trap', 'bandage'],
    tiers: { 1: ['hunting-carbine', 'ski-bow', 'throwing-knives', 'hatchet', 'machete', 'bear-trap', 'duster-coat', 'tushenka', 'bandage', 'mutant-tooth', 'poison-edge'], 2: ['pump-shotgun', 'fire-axe', 'swamp-boots', 'quiet-soles'], 3: ['sniper-rifle'], 4: ['wolf-fang'], 5: [] } }),
  fence: A('Скупщик', { markup: 1.1, sellRate: 0.55, buys: ['weapon', 'armor', 'mod', 'consumable'], staples: ['medkit'],
    tiers: { 1: ['finka', 'machete', 'quilted-jacket', 'medkit', 'grenade', 'electrical-tape'], 2: ['kedrach', 'tire-vest', 'frag-grenade', 'compensator', 'hollow-mag', 'poison-edge', 'trench-knife'], 3: ['sniper-rifle', 'concealed-vest', 'drum-mag', 'kevlar-sheet', 'incendiary-mag'], 4: ['laser-rifle', 'sleeper-blade'], 5: ['lis-7-chuyo'] } }),
};

const V = (arch, size, greed, o = {}) => ({ arch, size, greed, restock: ROTATION.defaultRestock, ...o });
const T = (arch, o = {}) => V(arch, 'S', 0, { mentor: true, ...o }); // наставник
const ed = (id) => ({ id, q: 'masterwork' });

export const VENDORS = {
  // ===== Альфа-Гармония (ур. 1–2, потолок ступени 1) =====
  'nikola': V('cyber', 'M', 0.05, { sig: ['hydro-fist', 'shock-glove', 'folded-drone'], loves: ['kind:tool', 'cat:mod'], restock: 5, note: 'Протезист: «умные протезы» из обломков. Кулаки и дроны.' }),
  'paracetamol': V('medic', 'M', -0.1, { sig: ['party-phenazepam', 'adrenaline-stim'], loves: ['kind:medicine'], restock: 3, note: 'Робот-медик. Берёт мало, лечит всех.' }),
  'gans': T('techmod', { sig: [ed('plate-rig'), ed('hunting-carbine')], note: 'Бывший боец ГО и ЧС; продаёт свои старые пожитки.' }),
  'cook-kasha': V('provisions', 'S', -0.05, { restock: 2, ed: [], note: 'Раздатчица пайков: еда и бинты.' }),
  'pip-junior': V('techmod', 'S', -0.05, { ed: ['loupe-sight'], note: 'Подмастерье Николы: мелкие детали дешевле.' }),
  'bosun-sukhar': V('general', 'L', 0.1, { sig: ['tishina-smg', 'factory-silencer', ed('pump-shotgun')], loves: ['cat:consumable'], restock: 4, note: 'Поставщик Гармонии: знает, что сегодня привезли с материка.' }),
  'd-zabota': V('medic', 'S', 0, { restock: 3, note: 'Огурцы, настойки из рассады. Тля не продаётся.' }),
  'd-vasya': V('techmod', 'S', 0.1, { addTrade: true, ed: ['electrical-tape'], note: 'Протез-самоучка торгует собой по частям.' }),
  'd-kotelok': V('provisions', 'S', -0.1, { addTrade: true, restock: 2, note: 'Похлёбка из принесённого; дёшево, пока очередь не слышит.' }),
  'd-gudok': V('scholar', 'S', 0, { addTrade: true, ed: ['loupe-sight'], note: 'Радист: батарейки и линзы для антенн.' }),

  // ===== Нейтральные селения (ур. 1–3, ступень 1) =====
  'innkeeper-pelmen': V('provisions', 'M', -0.05, { sig: ['pelmeni', 'battle-bayan', 'spring-shashka'], loves: ['kind:food', 'cat:weapon'], restock: 3, note: 'Трактир: пельмени, баян на стене, шашка за печкой.' }),
  'galina': V('general', 'M', -0.1, { sig: ['babka-ladle', 'pitchfork', ed('sickle')], loves: ['kind:food'], restock: 3, note: 'Огородница с половником. Не любит чужих, любит картошку.' }),
  'sv-yarmarka': V('general', 'M', 0.05, { ed: ['duster-coat', 'machete'], note: 'Купчиха ярмарки: всего по чуть-чуть.' }),
  'sv-brod': V('hunter', 'S', 0, { ed: ['ski-bow'], note: 'Паромщик: охотничье и капканы.' }),
  'd-prichal': V('general', 'S', 0, { ed: ['hatchet'], note: 'Лодочник: снасти и мелочь.' }),
  'd-lodochnik': V('hunter', 'S', 0.05, { ed: ['throwing-knives'], note: 'Рыбак: ножи и крючья; рыба слишком умна.' }),
  'bl-som': V('provisions', 'S', -0.05, { ed: [], note: 'Староста Белбы: рыба и пайки.' }),
  'stk-zhernova': V('provisions', 'S', -0.05, { note: 'Мельничиха: хлеб, крупа, честный вес.' }),
  'pm-ordenok': V('junk', 'S', 0.1, { ed: ['brass-knuckles', 'tire-vest'], loves: ['cat:weapon'], note: 'Медали из мусора. Скупает значки и железо.' }),
  'os-gazeta': V('scholar', 'S', 0, { ed: ['loupe-sight'], note: 'Киоск старых газет; торгует «справочниками».' }),
  'ag-kopyto': V('medic', 'M', -0.05, { loves: ['kind:medicine'], restock: 3, note: 'Ветеринар: лечит всех, кто не кусается.' }),
  'ag-pomol': V('provisions', 'S', -0.05, { note: 'Мельник: мука, хлеб.' }),
  'ag-grosh': V('general', 'S', 0.1, { ed: ['quilted-jacket'], note: 'Зазывала: выкрикивает цену выше нужной.' }),
  'sy-buzina': V('medic', 'M', -0.05, { loves: ['kind:medicine'], note: 'Знахарка Святости: травы и настои.' }),
  'd-kolobok': V('general', 'S', -0.05, { ed: ['felt-soles'], restock: 2, note: 'Кочует с кибиткой: каждый день другое.' }),
  'nomad-vetla': T('hunter', { lvl: 3, note: 'Кочевница-наставница; шкуры и охотничье.' }),
  'wanderer-knife': V('junk', 'S', 0.15, { lvl: 12, restock: 1, ed: ['finka'], note: 'Случайный бродяга: каждый раз другой хлам.' }),

  // ===== Жестяное братство (ур. 2–4, ступень 2): только аналоговое =====
  'smith-okalina': V('bladesmith', 'L', 0.05, { sig: ['tin-katana', 'tin-warhammer', 'tin-oyoroi'], loves: ['type:katana', 'type:hammer', 'cat:armor'], restock: 5, note: 'Кузнец арены. Энергооружие не берёт даже даром.' }),
  'd-gvozd': V('bladesmith', 'M', 0.05, { sig: ['spring-bastard', 'nagan-revolver', 'mosin'], loves: ['cat:weapon'], restock: 5, note: 'Презирает электричество; всё на пружинах и порохе.' }),
  'sl-klepa': V('general', 'M', 0, { sig: ['spring-crossbow', 'saw-stars', 'felt-soles'], loves: ['cat:consumable'], note: 'Начальник порта: грузовой хлам и мелочи с кораблей.' }),
  'sl-povareshka': V('provisions', 'S', 0, { ed: [], note: 'Харчевник порта.' }),
  'zh-bagor': V('hunter', 'S', 0, { ed: ['throwing-knives'], note: 'Рыбак: багры и ножи.' }),
  'zh-lastochka': T('techmod', { note: 'Пилот мехов: запчасти и подкладки.' }),
  'nc-luchina': V('chemist', 'M', 0.1, { sig: ['flashbang', 'smoke-grenade'], restock: 3, note: 'Торговка светом: вспышки и дым (запрещённые).' }),
  'nc-mayatnik': V('techmod', 'S', 0, { ed: ['loupe-sight'], note: 'Часовщик: линзы и точные детали.' }),
  'nc-drema': V('medic', 'S', -0.05, { restock: 3, note: 'Знахарка: сон и успокоительное.' }),
  'se-smola': V('medic', 'S', -0.05, { restock: 3, note: 'Травница селышка.' }),
  'st2-gvozdik': V('provisions', 'S', 0, { restock: 2, note: 'Часовой торгует пайками.' }),
  'dz-kipyatok': V('provisions', 'S', 0, { sig: [], note: 'Чайный домик; успокоительное и пайки.' }),
  'dd-ris': V('provisions', 'S', -0.05, { note: 'Рисовая кухня додзе.' }),
  'zt-buben': V('general', 'M', 0, { ed: ['plated-overall'], note: 'Староста Жестерни.' }),
  'boomerang': T('hunter', { lvl: 12, note: 'Бывшая цирковая убийца: метательное.' }),
  'duel-master': T('bladesmith', { lvl: 12, note: 'Хозяин дуэльного клуба.' }),
  'old-lockpick': T('junk', { lvl: 3, note: 'Старый вор: отмычки и барахло.' }),
  'sekiro': T('bladesmith', { note: 'Мастер Арены; продаёт молоты и кастеты бойцов.' }),
  'monk-tishina': T('bladesmith', { note: 'Монах-самурай: аналоговые клинки.' }),
  'dd-otves': T('bladesmith', { note: 'Настоятель додзе.' }),
  'dd-bambuk': T('bladesmith', { note: 'Ученица: тренировочное железо.' }),
  'd-tatami': T('bladesmith', { note: 'Учит падать; продаёт мягкое и учебное.' }),
  'sl-skrizhal': T('scholar', { note: 'Аналоговая летопись.' }),
  'se-slovo': T('scholar', { note: 'Толмач.' }),
  'dz-pustota': T('scholar', { note: 'Отшельник Дзена: почти ничего не продаёт.' }),
  'd-yakorets': V('junk', 'S', 0.05, { ed: ['sign-plate'], note: 'Докер-скелет носит на себе то, что продаёт.' }),
  'brother-tyorka': V('bladesmith', 'S', 0.1, { ed: ['ritual-blade', 'bayonet'], loves: ['type:cyberblade'], note: 'Охотник на культистов: клинки против кибер-стали.' }),

  // ===== Пираты (ур. 2–4, ступень 2) =====
  'trader-dublon': V('fence', 'L', 0.15, { sig: ['captain-coat', 'holo-decoy', 'energy-pistol'], loves: ['cat:weapon', 'cat:armor'], restock: 3, note: 'Берёт всё, даже краденое. «Дубовый амулет — не у меня».' }),
  'rc-dub': V('fence', 'M', 0.1, { sig: ['oak-amulet', 'boarding-saber'], restock: 4, note: 'Продавец дубовых амулетов «от Судьи».' }),
  'rc-broshka': V('fence', 'L', 0.2, { sig: ['drum-launcher', 'cup-crown', 'makarych'], loves: ['cat:weapon', 'cat:armor', 'cat:mod', 'cat:consumable'], restock: 3, note: 'Скупщица краденого: платит больше всех, продаёт дороже всех.' }),
  'rc-yod': V('medic', 'M', 0, { sig: ['codeine-syrup', 'forsazh-stim'], loves: ['kind:medicine', 'kind:opiate'], restock: 3, note: 'Лекарь флота: опиаты и стимуляторы.' }),
  'rc-garpun': V('gunsmith', 'M', 0.05, { sig: ['boat-hook', ed('kedrach')], loves: ['group:ranged'], note: 'Речные причалы: абордажное и стволы с судов.' }),
  'd-kambuz': V('provisions', 'S', 0.05, { restock: 2, note: 'Кок флагмана: тушёнка и ром (без рома).' }),
  'cyber-lovkach': T('cyber', { note: 'Взломщик-наставник; торгует кибер-хламом.' }),
  'negotiator-whisper': T('scholar', { note: 'Переговорщик.' }),

  // ===== Мусорщики (ур. 4–7, ступень 3) =====
  'glava-musora': V('junk', 'L', 0.1, { sig: ['sledgehammer', ed('fire-axe')], loves: ['cat:weapon'], note: 'Король свалок: оружие дороже, чем честный хлам.' }),
  'sborshchik': V('junk', 'L', 0, { sig: ['sign-halberd', 'conveyor-mg', 'scrap-magnet'], loves: ['cat:mod', 'cat:armor'], restock: 3, note: 'Ресурсы лагеря. Половина стока — лотерея.' }),
  'nb-lyustra': V('junk', 'M', 0, { sig: ['rail-katana', 'rusty-plate', ed('tire-vest')], restock: 3, note: 'Барахольщица обломков Небесного базара.' }),
  'sv-lyutyi': V('fence', 'M', 0.1, { loves: ['cat:weapon', 'cat:mod'], note: 'Оценщик: за хлам платит честно (как раз за хлам).' }),
  'sv-pomoyka': V('provisions', 'S', -0.1, { note: 'Кашевар Помойной столовой.' }),
  'd-metchik': V('fence', 'S', 0.1, { loves: ['cat:armor'], note: 'Клеймит добычу и скупает клеймёное.' }),
  'd-kuchka': V('junk', 'S', -0.1, { loves: ['cat:mod', 'cat:consumable'], note: 'Выдаёт по весу, а не по цене.' }),
  'rat-toma': T('junk', { note: 'Наставница выживания: ловушки и хлам.' }),
  'lz-zamochek': V('junk', 'S', 0.1, { ed: ['finka'], note: 'Вор-подросток: чужое по дешёвке.' }),
  'w-palka': V('techmod', 'S', 0, { ed: ['magnet-anchors'], note: 'Изобретатель шахты Свалки.' }),
  'alik': V('general', 'M', 0.15, { ed: ['concealed-vest'], loves: ['cat:consumable'], note: 'Владелец автомоек: торгует пакетами. Дорого.' }),
  'andrey': V('techmod', 'M', 0, { ed: ['shock-winding'], note: 'Наёмный механик: чинит и продаёт детали.' }),

  // ===== Мутанты-Ж (ур. 4–6, ступень 2) =====
  'skinner': V('armorer', 'M', 0, { sig: ['mutant-hide', 'bear-blood', 'lumber-greataxe'], loves: ['cat:armor'], restock: 5, note: 'Броня из шкур. «Шкуры только с врагов. В основном».' }),
  'old-badger': T('hunter', { note: 'Следопыт-наставник.' }),
  'ls-dupl': V('hunter', 'S', 0, { ed: ['ski-bow'], note: 'Лесничий: луки и ловушки.' }),
  'd-nyukh': V('hunter', 'S', 0.05, { ed: ['throwing-knives'], note: 'Ищейка: берёт плату запахами.' }),
  'd-listva': V('medic', 'M', -0.05, { loves: ['kind:medicine'], restock: 3, note: 'Знахарка стаи.' }),
  'sh-koltun': V('medic', 'S', 0, { note: 'Цирюльник: бинты и ножницы.' }),
  'vn-muskus': V('chemist', 'S', 0, { ed: [], note: 'Торговец Вонючки: дымовые и вонючие смеси.' }),
  'vn-duh': V('chemist', 'S', 0.1, { note: 'Парфюмер: духи-гранаты.' }),
  'bn-kost': V('junk', 'S', 0.1, { loves: ['cat:weapon'], note: 'Букмекер ям: скупает оружие побеждённых.' }),
  'pr-nashlos': V('fence', 'S', 0.05, { note: 'Находит потерянное и продаёт обратно.' }),

  // ===== Техоньки (ур. 6–9, ступень 3) =====
  'ritualist-iskra': V('cyber', 'M', 0.05, { sig: ['proxy-wrench', 'coil-staff', 'proxy-golem-shell'], loves: ['type:proxy', 'cat:mod'], restock: 5, note: 'Прокси-кустарщина. «Почему взрывается — не спрашивай».' }),
  'stn-tranzistor': V('techmod', 'M', 0.1, { sig: ['proxy-sharpening', 'overcharge-cell', 'proxy-resonator'], loves: ['cat:mod'], note: 'Вероотступник: продаёт схемы и моды без благословения.' }),
  'stn-ogarok': V('bladesmith', 'M', 0, { sig: ['blessed-wrench', 'blessed-nut', 'ritual-breastplate'], loves: ['type:hammer'], note: 'Освящает оружие; вся его сталь «благословлена».' }),
  'stn-nazhdak': V('techmod', 'S', 0.05, { ed: ['shock-winding'], note: 'Торговец ритуальным железом.' }),
  'stn-shpindel': V('techmod', 'M', 0, { ed: ['drum-mag', 'rubber-lining'], note: 'Старший мастер Станка.' }),
  'd-ryzhik': V('bladesmith', 'S', 0, { ed: ['fire-axe'], note: 'Ходячая кузница: греет, пока продаёт.' }),
  'zv-pomekhov': V('techmod', 'S', 0, { ed: ['magnet-anchors'], note: 'Лоцман порта Завода.' }),
  'sm-shum': V('scholar', 'S', 0.05, { note: 'Записчик шёпота; продаёт записи (и линзы).' }),
  'aztun': T('techmod', { note: 'Шаман Старого бога.' }),
  'w-antenka': V('techmod', 'S', 0, { ed: ['loupe-sight'], note: 'Ловит радио из прокси-бурь.' }),

  // ===== Механиды (ур. 7–9, ступень 3) =====
  'assimilator-gvozdar': V('cyber', 'L', 0.2, { sig: ['melta-cutter', 'chainsaw-glaive', 'drone-reactor', 'junk-mech-suit'], loves: ['cat:mod', 'cat:armor'], restock: 6, note: 'Импланты и моды. «Органика платит». Скупает только металл.' }),
  'bt-uzel88': V('techmod', 'M', 0.05, { ed: ['ceramic-insert', 'compensator'], note: 'Портовый узел: детали и ремонт без вопросов.' }),
  'bt-nagar': V('techmod', 'S', -0.05, { ed: ['rubber-lining'], note: 'Смазчик: смазка и мелкий ремонт.' }),
  'd-gaika': V('techmod', 'S', 0, { ed: ['arc-thrower'], note: 'Чинит тех, кто ещё чинится.' }),

  // ===== Агрозона (ур. 5–8, ступень 3) =====
  'forger-lyova': V('fence', 'M', 0.1, { sig: ['potato-cannon', 'lockpick-set'], restock: 4, note: 'Подделыватель пропусков: из-под полы, пока надзиратели не видят.' }),
  'gp-rostok': V('general', 'M', 0.1, { ed: ['hazmat-suit'], note: 'Директор Гидропоники: всё по нормам.' }),
  'gp-kapelnitsa': V('medic', 'M', 0, { loves: ['kind:medicine'], restock: 3, note: 'Лечит растения и рабочих.' }),
  'gp-pay': V('provisions', 'S', 0, { restock: 2, note: 'Раздаёт пайки по нормам.' }),

  // ===== Мутанты-Р (ур. 5–8, ступень 3) =====
  'gardener-ship': V('medic', 'L', -0.05, { sig: ['thorn-bow', 'antidote', 'bark-weave'], loves: ['kind:medicine'], restock: 4, note: 'Алхимик: яды и лекарства с одного куста.' }),
  'aunt-loza': V('medic', 'M', 0, { sig: ['tishina-syringe', 'black-morphine'], loves: ['kind:opiate', 'kind:medicine'], restock: 4, note: 'Знахарка-эколог: обезболивающее посильнее.' }),
  'mutant-shaman': T('medic', { note: 'Шаман: настои.' }),
  'gm-listvyanka': V('medic', 'M', 0, { loves: ['kind:medicine'], note: 'Врач порта Гармония.' }),
  'd-lopukh': V('chemist', 'M', -0.05, { ed: [], loves: ['kind:medicine'], note: 'Семена и удобрения: удобрения тоже взрываются.' }),

  // ===== Военпром (ур. 11–14, ступень 4) =====
  'gunsmith-kalibr': V('gunsmith', 'L', 0.05, { sig: ['av15', 'pso-scope', 'extended-mag', 'kosilshik', 'thermal-scope'], loves: ['group:ranged', 'cat:mod'], restock: 6, mentor: true, note: 'Мастер-оружейник: лучшие стволы и обвесы.' }),
  'quartermaster-krotova': V('armorer', 'L', 0.05, { sig: ['arbiter-armor', 'army-medkit', 'kremlin-bolter'], loves: ['cat:armor', 'cat:weapon'], restock: 5, note: '«Списано по акту»: армейская броня и аптечки.' }),
  'kr-portyanka': V('armorer', 'M', 0, { sig: ['warprom-assault', 'go-autocamo', 'riot-gear'], loves: ['cat:armor'], restock: 5, note: 'Каптёр: списанная форма.' }),
  'kr-gilza': V('provisions', 'M', 0.1, { sig: ['bolt-pistol', 'bodry-ilyich'], loves: ['kind:stim'], note: 'Хозяйка бара у могилы: болтер на стене и бодрящее.' }),
  'kr-zazhim': T('gunsmith', { note: 'Фельдфебель: армейская амуниция.' }),
  'bp-pyl': T('gunsmith', { note: 'Сержант «забытого войска».' }),
  'w-dvoyka': T('gunsmith', { lvl: 10, note: 'Ветеран первых дней.' }),

  // ===== Отступники (ур. 10–12, ступень 4) =====
  'gunsmith-sazha': V('gunsmith', 'L', -0.1, { sig: ['rusty-ak', 'sawed-off', 'rebar-crossbow'], loves: ['group:ranged'], restock: 4, note: 'Трофейное и самодельное. Дешевле всех: восстанию нужны стволы.' }),
  'sht-shnur': V('chemist', 'M', 0, { ed: [], loves: ['kind:grenade', 'kind:trap'], restock: 3, note: 'Минёрша подступов: гранаты и растяжки.' }),
  'sht-efir': V('techmod', 'S', 0.05, { ed: ['focus-lens'], note: 'Радист штаба.' }),
  'mt-pena': V('provisions', 'S', 0.05, { note: 'Таверна «Марта».' }),
  'chronicler-bukva': T('scholar', { note: 'Летописец-наставник.' }),

  // ===== Кринжгоны (ур. 12–16, ступень 5) =====
  'nd-tartaletka': V('bard', 'M', 0, { sig: ['boombox', 'electro-balalaika', 'cringe-grenade'], loves: ['type:cringe'], restock: 4, note: 'Пекарь Надежды: в тесто идёт кринж, из теста — звук.' }),
  'd-nadezhdin': V('bard', 'S', 0.05, { ed: ['megaphone'], note: 'Селит кринжгонов среди людей: продаёт «человеческое».' }),
  'nd-rumyanets': T('bard', { sig: ['anti-cringe-earplugs', ed('mic-cord')], note: 'Учит переживать кринж; затычки в комплекте.' }),
  'd-arlekin': V('bard', 'S', 0.05, { lvl: 12, ed: ['spoons'], note: 'Клоун без цирка: реквизит.' }),

  // ===== АИ Партия (ур. 15–19, ступень 5) =====
  'archivist-nine': V('cyber', 'L', 0.1, { sig: ['ukaz-rifle', 'focus-lens', 'otlichnik-nootrop', 'hover-pads'], loves: ['cat:mod', 'type:laser'], restock: 6, note: 'Торгует досье и энергооружием. Не берёт кринж и опиаты.' }),
  'pl-kvota': V('cyber', 'L', 0.05, { sig: ['plasma-pistol', 'plasma-rifle', 'cleaner-carapace'], loves: ['type:plasma', 'cat:armor'], restock: 6, note: 'Госмагазин по талонам: плазма и броня зачистки.' }),
  'pl-kopirka': V('fence', 'M', 0.1, { ed: ['concealed-vest'], note: 'Копии досье и справок; скупает что угодно.' }),
  'pl-loyalov': T('scholar', { note: 'Курсы лояльности: «пособия» (успокоительное).' }),
  'announcer-rovnya': T('scholar', { lvl: 15, note: 'Пропагандист.' }),

  // ===== Культ (ур. 16–20, ступень 5) =====
  'sk-kvitantsiya': V('cyber', 'L', 0.2, { sig: ['verdict-scythe', 'cyber-blade', ed('cult-robe')], loves: ['cat:weapon'], restock: 6, note: 'Индульгенции и кибер-клинки. Покупка ставит стигму.' }),
  'sk-zaverenie': V('scholar', 'S', 0.15, { note: 'Нотариус: заверяет сделки с Киберспейсом.' }),
  'd-svechnoy': V('provisions', 'S', 0.1, { note: 'Свечи и успокоительное.' }),

  // ===== Прочие / Дикие земли =====
  'collector-tsitata': V('scholar', 'M', 0.05, { sig: ['artyom-scope', ed('loupe-sight')], loves: ['cat:mod'], restock: 6, note: 'Собирательница знаний: линзы, прицелы, редкие описания.' }),
  'mentor-konspekt': T('scholar', { note: 'Учитель аналитики.' }),
  'w-gvozdoder': V('general', 'S', 0.05, { lvl: 3, restock: 3, ed: ['hatchet'], note: 'Коробейник у моста.' }),
  'w-melochj': V('general', 'S', 0.05, { lvl: 5, restock: 3, ed: ['quilted-jacket'], note: 'Торговка на колёсах.' }),
  'w-verblyud': V('general', 'M', 0.1, { lvl: 8, restock: 3, ed: ['concealed-vest'], note: 'Караванщик: товар из-за таможни.' }),
  'w-order': V('gunsmith', 'S', 0.1, { lvl: 8, ed: ['sniper-rifle'], note: 'Охотник за головами: стволы и наручники.' }),
  'w-luzha': V('scholar', 'S', 0, { lvl: 6, ed: [], note: 'Гидролог: приборы и очки.' }),
  'w-vata': V('medic', 'S', -0.1, { lvl: 10, restock: 2, note: 'Санитарка: перевязывает всех подряд, берёт копейки.' }),
  'd-klyuch': V('scholar', 'S', 0.05, { lvl: 6, sig: [], ed: ['loupe-sight'], note: 'Коллекционер замков.' }),
  'd-sluh': V('junk', 'S', 0.05, { lvl: 8, ed: ['finka'], note: 'Шарит по карманам прошлого; продаёт находки.' }),
  'lb-lebedka': V('general', 'S', 0, { lvl: 1, ed: [], note: 'Грузчик фуникулёра.' }),
};
