// Последствия квестов контент-волны 1. Формат — как world/consequences.js (rep, vendors, npcs, access, nodes, rumors, slides)
// + НОВЫЕ поля (нужна поддержка в движке, см. docs/specs/content-wave1.md §5):
//   delayed  [{ id, days, say, tone?, fx: { rep, credits, items, flags, hp }, rumors?: [..], radio?: radioId }]
//            — отложенное последствие: через `days` игровых дней после сдачи квеста срабатывает fx и показывается `say` (тост + журнал + слух).
//            Хранение: save.delayed = [{ id, due: day, qid, outcome }]; флаг-страж `dl:<qid>:<id>` — один раз.
//   services { loc: { add: [..], remove: [..] } } — меняет услуги узла (rest/heal/trade/rumors).
//   priceZone { locs: [..], mult }                — множитель цен у всех лавок узлов (вода/свет/связь меняют цены).
// Ключ внешнего слоя — id квеста, внутреннего — исход (как QUEST_TURNIN[qid].lines). default — всё остальное.

const E = (o) => ({
  rep: {}, vendors: [], nodes: [], rumors: [], slides: [], delayed: [], ...o,
  npcs: { appear: [], vanish: [], move: [], ...o.npcs },
  access: { open: [], close: [], ...o.access },
});
const D = (id, days, say, fx = {}, extra = {}) => ({ id, days, say, fx, ...extra });

export const CONSEQUENCES_WAVE1 = {
  // ---------------------------------------------------------------- (а) делёж ресурса
  'w1-filters': {
    default: E({ rep: { neutralVillages: 1 } }),
    villages: E({ rep: { neutralVillages: 8, scavengers: -6 },
      vendors: [{ npc: 'd-kuchka', mult: 1.15 }],
      nodes: [{ loc: 'svyatost', desc: 'У колодца новая табличка: «Вода чистая. Мусорщикам — отдельно». Табличку повесили гвоздём, который точно кто-то украл.', glyph: '✚', tone: 'good' }],
      rumors: ['Святость пьёт чистое. Свалка пьёт то, что нашла, и приглядывается к соседям.'],
      delayed: [D('thirst', 6, 'Из Святости принесли весть: дети болеют реже. Староста Свечка шлёт благодарность и бочонок.', { rep: { neutralVillages: 4 }, credits: 60 })] }),
    scav: E({ rep: { scavengers: 8, neutralVillages: -6 },
      vendors: [{ npc: 'd-kuchka', mult: 0.85 }],
      nodes: [{ loc: 'svalka', desc: 'Над свалкой висит чистая вода в бочке. Бочка охраняется лучше, чем склад патронов.', glyph: '⚑', tone: 'warn' }],
      rumors: ['Свалка получила фильтры и теперь продаёт «питьевую воду» по цене хорошего дробовика.'],
      delayed: [D('thirst', 6, 'В Святости пошли хворости. Люди винят вас и шепчутся.', { rep: { neutralVillages: -5 } })] }),
    half: E({ rep: { neutralVillages: 4, scavengers: 4 },
      rumors: ['Говорят, на Остановке поделили поровну. Все ругаются, значит, справедливо.'],
      delayed: [D('well', 7, 'Святость и Свалка поставили общий колодец на границе. Никто не хочет первым пить, но через неделю привыкнут.', { rep: { neutralVillages: 3, scavengers: 3 } })] }),
    'half-brawl': E({ rep: { neutralVillages: 2, scavengers: -3 }, rumors: ['На Остановке подрались за воду. Фильтры целы, у людей — нет.'] }),
    fake: E({ rep: { neutralVillages: 4, scavengers: 4 },
      delayed: [D('sieve', 5, 'Фильтры-подделки вскрылись. Оба селения узнали, что чистая вода их обманула. Посыльный от Огорода привёз записку: «Я не знаю тебя».', { rep: { neutralVillages: -9, scavengers: -9 } },
        { radio: 'rd-w1-filters-fraud' })] }),
    'fake-caught': E({ rep: { neutralVillages: -3, scavengers: -3 }, rumors: ['Подмену фильтров вскрыли ещё до первой кружки. Герой теперь известен как «тот, что с ситом».'] }),
    keep: E({ rep: { neutralVillages: -8, scavengers: -8 }, deeds: ['greed'],
      rumors: ['Кто-то забрал все шесть фильтров. Никто не видел, но все уверены.'],
      delayed: [D('buyer', 4, 'Скупщик с Остановки купил фильтры за хорошие деньги. Деньги пришли с запиской без подписи.', { credits: 220 })] }),
  },

  // ---------------------------------------------------------------- (б) комедийный NPC
  'w1-circus': {
    default: E({ rep: {} }),
    truth: E({ npcs: { move: [{ npc: 'd-arlekin', to: 'svyatost' }] },
      rumors: ['Арлекин перебрался в Святость: рассказывает детям, как «цирк уехал на гастроли, но по дороге заблудился».'],
      delayed: [D('book', 5, 'Арлекин прислал афишу: «Прощальные гастроли героя». Вложил в конверт 40 кредитов — сборы с одного зрителя.', { credits: 40 })] }),
    play: E({ rep: { }, vendors: [{ npc: 'd-arlekin', mult: 0.9, add: ['calmers'] }],
      nodes: [{ loc: 'circuses-m40', desc: 'У входа в цирк повесили новую афишу: «Гастроли возобновлены. Билеты — по запросу». Манекены стоят в первом ряду, ровно.', glyph: '✚', tone: 'good' }],
      rumors: ['В Цирке убийц снова дают представления. Билетов нет, зал забит, публика молчит.'],
      delayed: [D('troupe', 4, 'К Арлекину приехали двое настоящих артистов, привлечённых афишей. Он написал вам письмо без единой запятой от счастья.', { rep: { neutralVillages: 2 }, credits: 70 })] }),
    sponsor: E({ vendors: [{ npc: 'd-arlekin', mult: 0.95 }],
      rumors: ['Арлекин купил абонементы на весь свой зал у героя. Говорят, это единственный честный театральный бизнес в Пустошах.'] }),
    scare: E({ rumors: ['Арлекин боится «контролёра манежа». Ходят слухи, что контролёр — это вы.'],
      delayed: [D('inspector', 5, 'Кто-то в Цирке убийц повесил табличку «Проверено контролёром». Арлекин не снимает.', { credits: 30 })] }),
    encore: E({ rumors: ['Герой записан в труппу «Цирка убийц» пожизненно. Контракт на салфетке.'],
      delayed: [D('contract', 5, 'Пришла повестка из Цирка: «Вы обязаны явиться на репетицию». Вы не явились. Арлекин обиделся и прислал антракт — 20 кредитов.', { credits: 20, flags: ['w1-in-troupe'] })] }),
  },

  // ---------------------------------------------------------------- (в) на время
  'w1-flood': {
    default: E({ rep: { neutralVillages: 1 } }),
    both: E({ rep: { neutralVillages: 12 },
      vendors: [{ npc: 'd-lodochnik', mult: 0.9 }, { npc: 'd-prichal', mult: 0.9 }],
      nodes: [{ loc: 'svoboda', desc: 'У пирса стоит баржа с надписью «Не тонуть». Люди смотрят на неё с любовью.', glyph: '✚', tone: 'good' }],
      rumors: ['Герой спас баржу и склад за три дня. Река теперь уважает его лично.'],
      delayed: [D('harvest', 8, 'Посеяли спасённые семена. Белба шлёт ящик первых овощей: «Ешь, пока не передумали».', { credits: 80, items: [{ item: 'ration', n: 3 }] })] }),
    barge: E({ rep: { neutralVillages: 8 },
      vendors: [{ npc: 'd-prichal', mult: 0.92 }],
      rumors: ['Баржа спасена, люди целы, но в Белбе пахнет сырыми семенами.'],
      delayed: [D('hunger', 7, 'В Белбе плохая весна: семена сгнили. Староста винит реку, река отмалчивается.', { rep: { neutralVillages: -2 } })] }),
    seeds: E({ rep: { neutralVillages: 5 },
      rumors: ['Склад в Белбе цел, а вот баржа на мели. Люди снимали друг друга лодками.'],
      delayed: [D('refugees', 4, 'Беженцы с баржи дошли до Свободы. Они помнят, что кто-то выбрал не их. Один плюнул в вашу тень.', { rep: { neutralVillages: -4 } })] }),
    late: E({ rep: { neutralVillages: -6 },
      nodes: [{ loc: 'belba', desc: 'Следы паводка на стенах, на крышах сохнут простыни. Никто не говорит о складе.', glyph: '✕', tone: 'bad' }],
      rumors: ['Паводок сделал своё. Герой пришёл потом.'] }),
  },

  // ---------------------------------------------------------------- (г) детектив
  'w1-cauldron': {
    default: E({ rep: { pirates: 1 } }),
    'parus-proof': E({ rep: { pirates: 8 }, vendors: [{ npc: 'd-kambuz', mult: 0.85 }],
      npcs: { vanish: ['d-parus'] },
      rumors: ['Штурмана Паруса сняли с корабля за долги и яд. Команда зовёт героя «Следопытом», а он просит не звать.'],
      delayed: [D('revenge', 6, 'Парус сбежал и нанял двух бывших коллег. Они ждут у выхода из Райцентра. Тост не про то, как отдыхать.', { hp: -8, rep: { pirates: 2 } }, { radio: 'rd-w1-parus-escape' })] }),
    'parus-guess': E({ rep: { pirates: 5 }, npcs: { vanish: ['d-parus'] }, rumors: ['Герой угадал виновного. Без улик. Команда не знает, радоваться или бояться.'],
      delayed: [D('revenge', 6, 'Парус сбежал и вернулся с тремя друзьями. Команда сказала: «Не наши проблемы» — и расступилась.', { hp: -8 })] }),
    yakor: E({ rep: { pirates: -8 }, npcs: { vanish: ['d-yakor'] }, deeds: ['lie'],
      rumors: ['Боцмана Якоря повесили за яд, который он не варил. Настоящий отравитель стоит в очереди за добавкой.'],
      delayed: [D('second', 3, 'В котле снова яд. Теперь уже никто не сомневается, что вы ошиблись.', { rep: { pirates: -6 } }, { radio: 'rd-w1-cauldron-wrong' })] }),
    kambuz: E({ rep: { pirates: -10 }, vendors: [{ npc: 'd-kambuz', close: true }], deeds: ['lie'],
      rumors: ['Кока повесили. Командный ужин теперь готовит тот, кто не умеет.'] }),
    duel: E({ rep: { pirates: -12 }, deeds: ['cruelty'],
      rumors: ['Герой вырезал половину команды, чтобы доказать, что кока вешать нельзя. Кок плачет и благодарит.'] }),
    wrong: E({ rep: { pirates: -4 }, rumors: ['Виновный в Райцентре не найден. Котёл вымыт, но лучше его не пробовать.'] }),
  },

  // ---------------------------------------------------------------- (д) суд
  'w1-hearing': {
    default: E({ rep: { neutralVillages: 2 } }),
    debate: E({ rep: { neutralVillages: 8, scavengers: -4, cult: -4 },
      npcs: { appear: [{ npc: 'd-lom', at: 'kalostok' }] },
      rumors: ['На вече в Перемоге скелет выиграл дело о своей душе. Это первое подобное решение в Пустошах.'],
      delayed: [D('socks', 5, 'Колобок прислала носки. Две пары. Скелет, судя по записке, носит их на руках.', { credits: 20, items: [{ item: 'bandage', n: 2 }] })] }),
    proof: E({ rep: { neutralVillages: 6, scavengers: -3 }, rumors: ['Скелет получил прописку в Перемоге. Вече ещё ищет, где её пропустить.'] }),
    ordeal: E({ rep: { neutralVillages: 2, scavengers: -8 }, deeds: ['cruelty'], rumors: ['Суд поединком вернулся. Вече теперь стесняется.'] }),
    bribe: E({ rep: { neutralVillages: -4, scavengers: -2 }, deeds: ['greed'],
      vendors: [{ npc: 'd-vechevoy', mult: 1.1 }],
      rumors: ['Вече в Перемоге продаёт приговоры. Колокол зазвенел знакомой монетой.'] }),
    handover: E({ rep: { scavengers: 4, cult: 2, neutralVillages: -3 }, rumors: ['Скелета отдали. Колобок вяжет и не разговаривает.'] }),
    breakout: E({ rep: { neutralVillages: -2, scavengers: -6, cult: -4 },
      rumors: ['Скелет сбежал из зала суда прямо в окно. Вече объявило его «беглым имуществом» и забыло. Прописка осталась.'] }),
  },

  // ---------------------------------------------------------------- (е) заказчик врёт
  'w1-medbox': {
    default: E({ rep: { renegades: 2 } }),
    blind: E({ rep: { renegades: 5, mutantsPlant: 2 },
      delayed: [D('exposed', 5, 'В Гармонии вскрыли ящик. Лопух прислал письмо: «Мины?! Листовки?! Зачем мне это?» Гармония в тревоге, отношения с вами — тоже.', { rep: { mutantsPlant: -9, renegades: 3 } }, { radio: 'rd-w1-medbox-exposed' })] }),
    trap: E({ rep: { renegades: 1, mutantsPlant: -2 },
      delayed: [D('exposed', 4, 'Гармония узнала про ящик. Флажок прислала записку: «Сам виноват, надо было читать мелкий шрифт».', { rep: { mutantsPlant: -4 } })] }),
    confront: E({ rep: { renegades: 6 },
      delayed: [D('thanks', 5, 'Флажок передала оплату в двойном размере и просила забыть, что такое «ящик». Вы забыли. Почти.', { credits: 120 })] }),
    report: E({ rep: { aiParty: 6, renegades: -10 }, deeds: ['serve-ai'],
      delayed: [D('hunt', 6, 'Партия подала в розыск Флажок. Отступники ищут того, кто сдал ящик, и догадываются.', { rep: { renegades: -6 } }, { radio: 'rd-w1-medbox-report' })] }),
    sell: E({ rep: { scavengers: 3, renegades: -8 }, deeds: ['greed'],
      delayed: [D('boom', 5, 'Мусорщики испытали мины. Где-то в стороне Свалки слышали два хлопка. Куча прислал открытку: «Спасибо за качество».', { credits: 150 }, { radio: 'rd-w1-medbox-boom' })] }),
  },

  // ---------------------------------------------------------------- (ж) элитный охотник
  'w1-hunter': {
    default: E({ rep: { scavengers: -2 } }),
    fight: E({ rep: { scavengers: -4 }, rumors: ['Костолом мёртв. Мусорщики шепчутся о награде за вашу голову, но громко не говорят.'] }),
    trap: E({ rep: { scavengers: -3 }, rumors: ['Костолома нашли в яме с табличкой «не туда». Автор ловушки не установлен.'] }),
    respect: E({ rep: { scavengers: 5 }, vendors: [{ npc: 'd-kuchka', mult: 0.92 }],
      rumors: ['Костолом ушёл с кладбища, не взяв кости. Мусорщики говорят: «Видно, герой в друзьях у Главы».'] }),
    decoy: E({ rep: { scavengers: -1 },
      delayed: [D('lost', 8, 'Костолом вернулся: нашёл, что «братской могилы» нет. Он зол, но искать вас пока не стал. Пока.', { rep: { scavengers: -3 } }, { radio: 'rd-w1-hunter-returns' })] }),
  },

  // ---------------------------------------------------------------- (з) ремонт узла
  'w1-station': {
    default: E({ rep: { neutralVillages: 2 } }),
    light: E({ rep: { neutralVillages: 4 },
      vendors: [{ npc: 'd-rasp', add: ['bandage', 'ration'], mult: 0.95 }],
      services: { ostanovka: { add: ['trade'] } },
      priceZone: { locs: ['ostanovka'], mult: 0.92 },
      nodes: [{ loc: 'ostanovka', desc: 'На станции горит лампа. Одна. Её охраняют вдвоём, потому что красиво.', glyph: '✚', tone: 'good' }],
      rumors: ['На Остановке снова горит свет. К нему слетелись торговцы, мухи и пара путников.'] }),
    water: E({ rep: { neutralVillages: 4 },
      services: { ostanovka: { add: ['heal'] } },
      nodes: [{ loc: 'ostanovka', desc: 'Из крана течёт вода. Цвет честный, но течёт. Люди стоят очередью просто послушать.', glyph: '✚', tone: 'good' }],
      rumors: ['На Остановке заработал кран. Путники спорят, пить или молиться.'] }),
    comms: E({ rep: { neutralVillages: 4, technikums: 3 },
      access: { open: ['beacon-3'] },
      services: { ostanovka: { add: ['rumors'] } },
      nodes: [{ loc: 'ostanovka', desc: 'Ретранслятор на крыше пищит. Станция слышит эфир и, кажется, нервничает.', glyph: '✚', tone: 'good' }],
      rumors: ['На Остановке ловят «Голос Пустошей». Диктор упомянул героя; Расписание теперь не снимает наушники.'] }),
    parts: E({ rep: { neutralVillages: 1 }, priceZone: { locs: ['ostanovka'], mult: 1.05 },
      rumors: ['На Остановке всё работает понемногу. Расписание называет это «режимом экономии».'] }),
    brownout: E({ rep: { neutralVillages: 1 }, rumors: ['Остановка искрила, хлопнула и затихла. Расписание пишет заявку выше.'] }),
  },
};
