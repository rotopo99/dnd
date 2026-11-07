// «Насыщенность мира», проход 1: 35 тайников (спека п. 3). Формат:
//   { id, node, check: { skill, dc }, loot: [itemId, ...], credits?, text }
// node — реальный id узла (locations.js); itemId — из data/items/* и locations.js ITEMS; навыки — id из talents.js SKILLS.
// СЛ ≈ 10 + 2 × (ур. региона / 3). text — что видит игрок при успехе (одна-две строки).

export const CACHES_DENSITY = [
  // ---- Хаб и ближний круг (СЛ 10–13)
  { id: 'dc-harmony-vent', node: 'alpha-harmony', check: { skill: 'perception', dc: 11 }, loot: ['bandage', 'tushenka'], text: 'За вентиляционной решёткой — чей-то заначенный паёк и бинты. Кто-то очень не хотел делиться.' },
  { id: 'dc-harmony-bunk', node: 'alpha-harmony', check: { skill: 'lockpicking', dc: 12 }, loot: ['servo-parts'], credits: 25, text: 'Под нарами — сундучок с детальками. Замок смешной, но упрямый.' },
  { id: 'dc-workshop-shelf', node: 'harmony-workshop', check: { skill: 'tech', dc: 13 }, loot: ['electrical-tape', 'repair-kit'], text: 'На верхней полке Николиной мастерской — ремкомплект и изолента, которой явно торговали на чёрном рынке.' },
  { id: 'dc-post-roof', node: 'harmony-post', check: { skill: 'athletics', dc: 12 }, loot: ['grenade'], text: 'На крыше поста — граната в ведре с водой. Охлаждали, видимо.' },
  { id: 'dc-sectord-pot', node: 'harmony-sector-d', check: { skill: 'survival', dc: 11 }, loot: ['tushenka', 'tushenka'], text: 'В днище старого котла — две банки тушёнки. Котелок клянётся, что не знал.' },
  { id: 'dc-garm-greenhouse', node: 'garmoniya', check: { skill: 'biology', dc: 12 }, loot: ['antidote', 'bandage'], text: 'В дальней теплице — банка с противоядием и пучок перевязочной травы. Ни одна из банок не подписана.' },
  { id: 'dc-gidro-pipe', node: 'gidroponika', check: { skill: 'tech', dc: 12 }, loot: ['repair-kit'], credits: 30, text: 'В технической шахте под линией полива — забытый ремкомплект и мешочек кредитов. Капель с ума сойдёт.' },
  { id: 'dc-vonyuchka-den', node: 'vonyuchka', check: { skill: 'perception', dc: 12 }, loot: ['bandage', 'analgin'], text: 'В норе у забора — припрятанные лечебные припасы. Нюх тихо присвистывает.' },
  { id: 'dc-m29-hull', node: 'pirates-m29', check: { skill: 'survival', dc: 12 }, loot: ['molotov', 'tushenka'], text: 'В трюме выброшенного на мель корабля — бутылки и пайки. Пираты вернутся за ними через год. Или нет.' },
  { id: 'dc-svyatost-well', node: 'svyatost', check: { skill: 'athletics', dc: 11 }, loot: ['medkit'], text: 'На дне старого колодца — аптечка в герметичном пакете. Стоит спуститься.' },
  { id: 'dc-kalostok-wagon', node: 'kalostok', check: { skill: 'perception', dc: 11 }, loot: ['tushenka', 'valerian'], text: 'В кибитке Колобка — двойное дно с пайками и настойкой. Колобок знает, что вы знаете.' },
  { id: 'dc-agrara-field', node: 'agrara', check: { skill: 'survival', dc: 12 }, loot: ['rations'], credits: 20, text: 'Среди грядок — ящик пайков. Вороны не нашли. Вороны ещё придут.' },

  // ---- Второй круг (СЛ 12–15)
  { id: 'dc-zhestoboy-dock', node: 'zhestoboy', check: { skill: 'perception', dc: 13 }, loot: ['flashbang', 'grenade'], text: 'Под причальной доской — ящик с гранатами. Якорец клянётся, что ящик сам пришёл.' },
  { id: 'dc-slavotech-forge', node: 'slavotech', check: { skill: 'tech', dc: 13 }, loot: ['scrap-plates', 'repair-kit'], text: 'В остывшем горне — накладки из хорошей стали. Гвоздь не простит, но ремонт стоит того.' },
  { id: 'dc-dodze-mat', node: 'dodze', check: { skill: 'perception', dc: 12 }, loot: ['bandage', 'bandage', 'analgin'], text: 'Под татами — аптечка сэнсэя. Ни одной жалобы за тридцать лет, но запас — на троих.' },
  { id: 'dc-noch-tower', node: 'noch', check: { skill: 'stealth', dc: 13 }, loot: ['smoke-grenade'], credits: 30, text: 'На дозорной вышке — заначка Совы: дымовуха и мелочь. Спит ли она? Нет. Видит ли? Да.' },
  { id: 'dc-svalka-heap', node: 'svalka', check: { skill: 'perception', dc: 14 }, loot: ['rare-parts'], text: 'В куче хлама блестит что-то нужное. Метчик успеет его заклеймить, если вы не поторопитесь.' },
  { id: 'dc-svalka-crate', node: 'svalka', check: { skill: 'lockpicking', dc: 14 }, loot: ['emp-grenade', 'servo-parts'], text: 'Клейменый ящик Куч: внутри ЭМИ-граната и сервоприводы. Клеймо — за вами. Как и ответственность.' },
  { id: 'dc-boynik-ford', node: 'boynik', check: { skill: 'survival', dc: 13 }, loot: ['bear-trap'], text: 'У брода — зарытый капкан. Не для вас, но спасибо.' },
  { id: 'dc-lesyanka-herbs', node: 'lesyanka', check: { skill: 'biology', dc: 13 }, loot: ['antidote', 'codeine-syrup'], text: 'В корнях старой ели — банка с отваром и пузырёк сиропа. Мать Листва знала, куда прятала.' },
  { id: 'dc-zavod-altar', node: 'zavod', check: { skill: 'proxy', dc: 14 }, loot: ['blessed-nut'], text: 'У алтаря старого бога — гайка, тёплая и чуть вибрирующая. Мазут её обыскался.' },
  { id: 'dc-stanok-gears', node: 'stanok', check: { skill: 'tech', dc: 14 }, loot: ['servo-parts', 'rare-parts'], text: 'Среди подменённых шестерёнок — две нормальных. Оставлены на чёрный день.' },
  { id: 'dc-smotreltse-tower', node: 'smotreltse', check: { skill: 'perception', dc: 13 }, loot: ['loupe-sight'], text: 'На вышке — оптика Ока, которой он «не пользуется». Следит за вами тоже.' },
  { id: 'dc-betonka-scrap', node: 'betonka', check: { skill: 'tech', dc: 14 }, loot: ['repair-kit', 'scrap-plates'], text: 'В дальнем цехе — разобранный на запчасти механид. Он не против, но просит не называть имён.' },
  { id: 'dc-shtab-cellar', node: 'shtabtsentr', check: { skill: 'hacking', dc: 14 }, loot: ['emp-grenade'], credits: 50, text: 'В подвале штаба — запертый ящик с ЭМИ-гранатой и «кассой на чёрный день». Пароль — «марта123».' },
  { id: 'dc-raytsentr-pier', node: 'raytsentr', check: { skill: 'stealth', dc: 13 }, loot: ['molotov', 'tushenka'], credits: 40, text: 'Под пирсом — пиратская заначка. Тут и бутылки, и пайки, и пара крупных купюр.' },

  // ---- Дальние (СЛ 14–17)
  { id: 'dc-kreml-barracks', node: 'kreml', check: { skill: 'military', dc: 15 }, loot: ['army-medkit', 'frag-grenade'], text: 'Под нарами в казарме — неучтённый армейский запас. Портянка знает, но молчит.' },
  { id: 'dc-pl-archive', node: 'putinlyandiya', check: { skill: 'hacking', dc: 16 }, loot: ['holo-decoy'], credits: 80, text: 'В архиве талонов — резервный ключ и фальшивая голограмма. Законно ровно настолько, насколько это нужно.' },
  { id: 'dc-carwash-vat', node: 'cc-carwash', check: { skill: 'perception', dc: 15 }, loot: ['smoke-grenade', 'flashbang'], text: 'В бочке с шампунем — два свёртка. Алик не будет рад, что вы их нашли.' },
  { id: 'dc-sokralnya-altar', node: 'sokralnya', check: { skill: 'religion', dc: 16 }, loot: ['calmers', 'valerian'], text: 'За алтарём — склянки с успокоительным. Послушники принимают его, чтобы вынести службу.' },
  { id: 'dc-gornilo-pit', node: 'pepelnoe-gornilo', check: { skill: 'meditation', dc: 16 }, loot: ['anti-cringe-earplugs'], text: 'В яме у горна — беруши. Видимо, не все кринжгоны выдерживают собственный юмор.' },
  { id: 'dc-nadezhda-table', node: 'nadezhda', check: { skill: 'perception', dc: 15 }, loot: ['tushenka', 'adrenaline-stim'], text: 'Под накрытым столом — припасы для гостей, которых не было. Стим, как и положено, лежит с этикеткой «на случай радости».' },
  { id: 'dc-predlozhka-shelf', node: 'baza-predlozhki', check: { skill: 'analysis', dc: 16 }, loot: ['focus-lens', 'party-cell'], text: 'За ненужным томом — тайник Закладки: линза и батарейка. Он называет их «закладками».' },
  { id: 'dc-m35-cellar', node: 'ruins-m35', check: { skill: 'survival', dc: 14 }, loot: ['rare-parts', 'bodry-ilyich'], text: 'В подвале руин — довоенные детали и банка энергетика. Слух был прав.' },
  { id: 'dc-m40-tent', node: 'circuses-m40', check: { skill: 'lockpicking', dc: 14 }, loot: ['flashbang', 'tripwire'], text: 'В шатре бывшего цирка — реквизит, которым при желании можно напугать кого угодно.' },
  { id: 'dc-m47-crypt', node: 'necropolises-m47', check: { skill: 'perception', dc: 15 }, loot: ['bandage', 'antidote', 'rubber-lining'], text: 'В склепе — чьё-то снаряжение: бинты, противоядие и резиновая подкладка. Владелец не жаловался.' },
];

// ---------------------------------------------------------------------------------------------
// КАК ПОДКЛЮЧАТЬ (для программиста):
//   1. При сборке LOCATIONS (locations.js, после NODE_BATTLES_V4) для каждой записи c узла `c.node`:
//        LOCATIONS[c.node].caches.push({ id: c.id, check: c.check, loot: [...предметы по id (одинаковые = n+1), ...(c.credits ? [{credits}] : [])], text: c.text });
//      Формат существующих тайников: caches: [{ id, check: {skill, dc}, loot: [{ item, n }, { credits }] }] — нужен небольшой конвертер:
//        loot: c.loot (массив id) → сгруппировать в [{ item, n }], credits → { credits }.
//   2. `text` — сообщение при успехе (если location.js выводит произвольный текст тайника; иначе — в журнал/тост).
//   3. Проверка: навыки (perception, survival, lockpicking, hacking, tech, military, religion, biology, meditation, stealth, athletics, proxy, analysis).
// ---------------------------------------------------------------------------------------------
