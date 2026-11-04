// Квесты v3 по канон-карте. Сюжет: docs/story/main-plot.md. Схема — как world/quests.js (шапка там же).
// location — slug из world/canon-map.js. region — id фракции-государства карты (14 шт., маппинг на regions.js — дизайнер).
// npc — id из npcs.js. Бои: id из ENCOUNTERS (enemies.js) или временные 'enc-*' до enemies-v3.js (список — ENC_TODO внизу).
// Corruption City = putinlyandiya (ответ автора 2026-11-04).

const reach = (location) => ({ kind: 'reach', location });
const talk = (npc, location) => ({ kind: 'talk', npc, location });
const fight = (encounter, location) => ({ kind: 'battle', encounter, location });
const check = (skills, dc, onFail) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}) });
const pay = (credits) => ({ kind: 'pay', credits });
const choice = (...options) => ({ kind: 'choice', options });
const opt = (id, text, goal, effects, next, requires) => ({ id, text, ...(goal ? { goal } : {}), ...(effects ? { effects } : {}), next: next ?? null, ...(requires ? { requires } : {}) });
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' ? { end: 'done' } : { next }) });
const Q = (id, name, type, region, giver, level, summary, stages, rewards, extra = {}) =>
  ({ id, name, type, key: false, giver, region, level, requires: null, summary, stages, rewards, v3: true, ...extra });

const LIST = [
  // ============================================================ ГЛАВНЫЙ СЮЖЕТ
  // ---------- Акт I: финал
  Q('mq3-relay', 'Ретранслятор', 'mixed', 'aiParty', 'sera', 3,
    'Главный узел Коррупция-Сити оказался ретранслятором. Куда уходил сигнал?',
    [
      st('read', 'Сера разбирает данные узла.', talk('sera', 'alpha-harmony'), 'trace'),
      st('trace', 'Отследить сигнал.', choice(
        opt('analysis', 'Разобрать логи самому.', check(['analysis', 'hacking', 'judge'], 15, 'archon')),
        opt('archon', 'Спросить Архонта: он слышит Судью.', talk('archon', 'putinlyandiya'), { flags: ['archon-ally'] }),
      ), 'dawn'),
      st('dawn', 'В логах шифр «Рассвет» и адрес: Сокральня, Дверь у маркера «Киберспейс». Плюс график падения тяги реактора.', talk('sera', 'alpha-harmony'), 'done'),
    ],
    { xp: 600, rep: { technikums: 10 }, flags: ['act1-done', 'dawn-known', 'harmony-drift-warned'] },
    { key: true, requires: { flag: 'exodus-stopped' } }),

  // ---------- Акт II
  Q('mq3-vessel', 'Сосуд № 3', 'mixed', 'renegades', 'sera', 4,
    'Кого Судья примеряет на роль тела? Архив «Рассвета», клоны Lox, Архонт.',
    [
      st('clues', 'Собрать улики (минимум 2 из 3).', { kind: 'all', min: 2, goals: [
        { ...reach('bunker-kuksiusa'), doneFlag: 'dawn-archive' },
        { ...talk('lox-clone-9', 'lox-5'), doneFlag: 'lox9-met' },
        { ...talk('archon', 'putinlyandiya'), doneFlag: 'archon-ally' },
      ] }, 'truth'),
      st('truth', 'Сложить улики: «Рассвет» делал тела, Партия продала культу клонов, Отметины Судьи — это примерка. Идеальное тело — тот, кто возвращается из Киберспейса.', talk('sera', 'alpha-harmony'), 'done'),
    ],
    { xp: 800, flags: ['vessel-hero'], talentChoice: ['judge-eye', 'darkness-resistance'] },
    { key: true, requires: { flag: 'act1-done' } }),

  Q('mq3-sputnik', 'Спутник', 'mixed', 'scavengers', 'svk-petrovich', 4,
    'Упавший спутник у Свалки — обломок глобальной системы управления, «артефакт». Его хотят все.',
    [
      st('see', 'Добраться до Спутника.', reach('sputnik'), 'raid'),
      st('raid', 'К Спутнику идут культисты.', fight('enc-sputnik-raid', 'sputnik'), 'owner'),
      st('owner', 'Кому отдать Спутник?', choice(
        opt('tekhonki', 'Старому богу (Азтун): мировая прокси-буря.', talk('aztun', 'zavod'), { flags: ['sputnik-owner-tekhonki'], rep: { tekhonki: 25, aiParty: -15 }, deeds: ['tech-faith'] }),
        opt('ai', 'Партии (Индекс): глобальный контроль.', talk('pl-index', 'putinlyandiya'), { flags: ['sputnik-owner-ai'], rep: { aiParty: 25, renegades: -15 }, deeds: ['serve-ai'] }),
        opt('scav', 'Главе Мусора: металлолом есть металлолом.', talk('glava-musora', 'svalka'), { flags: ['sputnik-owner-scavengers'], rep: { scavengers: 20 }, credits: 300, deeds: ['greed'] }),
        opt('tech', 'Техникумам: изучить, не включать.', check(['tech', 'hacking'], 17, 'destroy'), { flags: ['sputnik-owner-technikums'], rep: { technikums: 20, scavengers: -10 } }),
        opt('destroy', 'Разбить. Никому.', check(['athletics', 'tech'], 13), { flags: ['sputnik-destroyed'], rep: { scavengers: -15 }, deeds: ['honor'] }),
      ), 'done'),
    ],
    { xp: 900 }, { key: true, requires: { flag: 'act1-done' } }),

  Q('mq3-burner', 'Выжигатель Вайба', 'mixed', 'cringegons', 'nd-stydoba', 4,
    'Машина кринжгонов выжигает МРЛ целых краёв. Пустых людей Великий Собиратель отдаёт культу под души.',
    [
      st('nadezhda', 'Старейшина Стыдоба знает уязвимость.', talk('nd-stydoba', 'nadezhda'), 'way'),
      st('way', 'Как подобраться?', choice(
        opt('base', 'Освободить пленных Предложки — они знают дорогу.', null, null, 'base-fight', { notFlag: 'predlozhka-freed' }),
        opt('engineer', 'Убедить инженера Ой-Всё.', check(['persuasion', 'meditation'], 16, 'base'), { flags: ['oy-vse-turned'] }, 'core'),
        opt('known', 'Пленные уже свободны.', null, null, 'core', { flag: 'predlozhka-freed' }),
      ), null),
      st('base-fight', 'Штурм Базы Предложки.', fight('enc-cringe-base', 'baza-predlozhki'), 'core'),
      st('core', 'Сердце Выжигателя.', fight('enc-vibe-burner', 'vyzhigatel-vayba'), 'done'),
    ],
    { xp: 900, rep: { neutralVillages: 15, cringegons: -20 }, flags: ['burner-off', 'collector-met'] },
    { key: true, requires: { flag: 'act1-done' } }),

  Q('mq3-crossing', 'Через море', 'mixed', 'pirates', 'rc-kompas', 3,
    'Карта — два материка. «Любое перемещение между сторонами света — через пиратов» (канон). Или нет?',
    [
      st('how', 'Как перебраться?', choice(
        opt('ring', 'Выиграть Ледяной ринг — Буревестник повезёт.', null, null, 'ring'),
        opt('pay', 'Заплатить пиратам 250 кредов.', pay(250), { rep: { pirates: 5 } }, 'done-stage'),
        opt('ferry', 'Паром Свободы.', talk('sv-brod', 'svoboda'), null, 'ferry', { notFlag: 'ferry-free' }),
        opt('port', 'Порт Бетонки (если чума вылечена).', talk('bt-uzel88', 'betonka'), { rep: { pirates: -5 } }, 'done-stage', { flag: 'plague-cured' }),
        opt('bog', 'Лоцман Помехов поведёт «по воле бога».', check(['proxy', 'religion', 'survival'], 15, 'ring'), { rep: { tekhonki: 5, pirates: -5 } }, 'done-stage'),
      ), null),
      st('ring', 'Три боя на льду.', fight('enc-ice-ring', 'ledyanoy-ring'), 'done-stage'),
      st('ferry', 'Отбить паром у налётчиков.', fight('enc-brigands', 'svoboda'), 'done-stage'),
      st('done-stage', 'Путь на другую сторону открыт.', reach('raytsentr'), 'done'),
    ],
    { xp: 500, flags: ['crossing-open'] }, { key: true, requires: { flag: 'act1-done' } }),

  Q('mq3-allies', 'Совет сторон', 'mixed', 'neutralVillages', 'amanda', 5,
    'Перед «Третьим исходом» нужны союзники. Минимум две фракции.',
    [
      st('gather', 'Заручиться поддержкой (минимум 2).', { kind: 'all', min: 2, goals: [
        { kind: 'talk', npc: 'khan', location: 'slavotech', doneFlag: 'ally-tin' },
        { kind: 'talk', npc: 'marta', location: 'marta', doneFlag: 'ally-renegades' },
        { kind: 'talk', npc: 'elder-ulyana', location: 'svoboda', doneFlag: 'ally-villages' },
        { kind: 'talk', npc: 'mother-of-gears', location: 'betonka', doneFlag: 'ally-mechanids' },
        { kind: 'talk', npc: 'zver', location: 'vonyuchka', doneFlag: 'ally-mutants' },
        { kind: 'talk', npc: 'aztun', location: 'zavod', doneFlag: 'ally-tekhonki' },
        { kind: 'talk', npc: 'burevestnik', location: 'raytsentr', doneFlag: 'ally-pirates' },
        { kind: 'talk', npc: 'pl-index', location: 'putinlyandiya', doneFlag: 'ally-ai' },
      ] }, 'report'),
      st('report', 'Рассказать Аманде, кто с нами.', talk('amanda', 'alpha-harmony'), 'done'),
    ],
    { xp: 700, flags: ['allies-ready'] }, { key: true, requires: { flag: 'act1-done' } }),

  // Кульминация акта II — падение Альфа-Гармонии (канон: она разобьётся; маркер — куда).
  Q('mq3-fall', 'Падение Гармонии', 'mixed', 'mutantsPlant', 'sera', 5,
    'Реактор теряет тягу. Альфа-Гармония падает. Спасти всё нельзя.',
    [
      st('alarm', 'Сера: «Это не дрейф. Культ запустил пробный исход через реактор».', talk('sera', 'alpha-harmony'), 'reactor'),
      st('reactor', 'Бой у реактора: культ держит управление.', fight('enc-harmony-fall', 'alpha-harmony'), 'save'),
      st('save', 'Что спасти? Обычно — два пункта; с «Лисом» (lis-online) — три.', { kind: 'all', pick: 2, pickWith: { flag: 'lis-online', pick: 3 }, goals: [
        { kind: 'check', skills: ['persuasion', 'military', 'athletics'], dc: 13, doneFlag: 'saved-people', desc: 'Люди: эвакуация (фуникулёр, паром, баржи союзников).' },
        { kind: 'check', skills: ['tech', 'hacking'], dc: 15, doneFlag: 'saved-terminal', desc: 'Реактор и терминал: точка возвращения души.' },
        { kind: 'check', skills: ['tech', 'athletics'], dc: 13, doneFlag: 'saved-workshop', desc: 'Мастерская Николы и архив Вазгена.' },
        { kind: 'check', skills: ['persuasion', 'intimidation'], dc: 14, doneFlag: 'saved-sector-d', desc: 'Сектор D и бунтари.' },
      ] }, 'crash'),
      st('crash', 'Платформа падает у утёса — маркер крушения.', reach('mesto-krusheniya-alfa-garmonii'), 'hub'),
      // Хаб переезжает в Хатаб-Сити = raytsentr (решение режиссёра; HUB_STATES['harmony-fallen'] в locations.js).
      st('hub', 'Спасённое и спасённые — в Хатаб-Сити. Буревестник: «Груз принят. Счёт — потом».', talk('amanda', 'raytsentr'), 'done'),
    ],
    { xp: 1000, flags: ['harmony-fallen', 'act2-done'] }, { key: true, requires: { flag: 'allies-ready' } }),

  // ---------- Акт III
  Q('mq3-arsenal', 'Вооружение', 'mixed', 'cult', 'ar-poluraspad', 5,
    'План Б культа: поднять довоенный арсенал, чтобы души хлынули в Киберспейс.',
    [
      st('go', 'Добраться до арсенала.', reach('vooruzhenie'), 'keeper'),
      st('keeper', 'Хранитель Полураспад не пускает никого.', choice(
        opt('talk', 'Убедить: «пост — это не склад, пост — это люди».', check(['persuasion', 'military'], 15, 'force')),
        opt('force', 'Пройти силой.', null, { deeds: ['cruelty'] }, 'cult'),
      ), 'cult'),
      st('cult', 'Культисты уже внутри.', fight('enc-arsenal-cult', 'vooruzhenie'), 'seal'),
      st('seal', 'Запечатать арсенал.', check(['tech', 'military'], 14), 'done'),
    ],
    { xp: 900, rep: { cult: -20 }, flags: ['arsenal-sealed'] }, { key: true, requires: { flag: 'act2-done' } }),

  Q('mq3-court', 'Суд', 'mixed', 'cult', 'sera', 5,
    'Дверь у маркера «Киберспейс» открыта. Войти, выстоять суд Судьи и решить судьбу Киберспейса.',
    [
      st('door', 'Штурм Двери с союзниками.', fight('enc-kiberspeys-door', 'kiberspeys'), 'inside'),
      st('inside', 'Киберспейс. Суд над «идеальным телом».', { kind: 'challenge', skills: ['persuasion', 'judge', 'meditation', 'religion'], dc: 17, successes: 5, failures: 3, onFail: 'judge-fight',
        easeBy: ['victor-soul-freed', 'saved-people', 'saved-terminal', 'arsenal-sealed', 'burner-off'] }, 'verdict'),
      st('judge-fight', 'Приговор вынесен. Бой с Судьёй.', fight('enc-judge', 'kiberspeys'), 'verdict'),
      st('verdict', 'Финал.', choice(
        opt('closed', '«Дело закрыто»: разрушить Дверь.', check(['tech', 'athletics', 'judge'], 15), { flags: ['ending-closed'] }),
        opt('oldgod', '«Старый бог»: прокси-буря по всему миру.', null, { flags: ['ending-oldgod'] }, null, { flag: 'sputnik-owner-tekhonki' }),
        opt('order', '«Порядок»: Судья в карантин, мир под контроль АИ.', null, { flags: ['ending-order'], deeds: ['serve-ai'] }, null, { flag: 'sputnik-owner-ai' }),
        opt('reflash', '«Перепрошивка»: вернуть Киберспейсу первый смысл.', check(['hacking', 'judge'], 19, 'closed'), { flags: ['ending-reflash'], deeds: ['mercy'] }, null, { flag: 'lis-online' }),
        opt('vessel', '«Сосуд»: принять тело Судьи.', null, { flags: ['ending-vessel'], deeds: ['cult-deal'] }, null, { alignment: 'evil' }),
        opt('lox9', '«Приманка»: Lox-9 займёт место героя.', null, { flags: ['ending-lox9'], deeds: ['honor'] }, null, { flag: 'lox9-free' }),
      ), 'done'),
    ],
    { xp: 1000, flags: ['game-complete'] }, { key: true, requires: { flag: 'act2-done' } }),

  // ============================================================ ЦЕПОЧКИ АВТОРСКИХ МАРКЕРОВ
  Q('ch3-kalostok', 'Калостокский треугольник', 'mixed', 'neutralVillages', 'kl-sulema', 3,
    'Дача Бабки, Бункер Лиса и Дозорка Джона у пепелища Калостока. Включить ИИ гражданской обороны «Лис».',
    [
      st('sulema', 'Сулема рассказывает о бункере, который шлёт «Лис — Гармонии».', talk('kl-sulema', 'kalostok'), 'dacha'),
      st('dacha', 'Галина на Даче Бабки знает, где ключ.', talk('galina', 'dacha-babki'), 'dzhon'),
      st('dzhon', 'Дозорный Джон видел, кто ходил к бункеру.', talk('dzhon', 'dozorka-dzhona'), 'bunker'),
      st('bunker', 'Бункер Лиса: охранные дроны.', fight('enc-lis-drones', 'bunker-lisa'), 'pass'),
      st('pass', 'Пароль Вазгена.', choice(
        opt('aynura', 'Ключ из памяти Айнуры.', null, null, 'online', { flag: 'aynura-key' }),
        opt('hack', 'Взломать.', check(['hacking', 'tech'], 18), null, 'online'),
      ), null),
      st('online', '«Лис» включён: «Внимание, гражданин. Гармония под наблюдением».', talk('lis', 'bunker-lisa'), 'done'),
    ],
    { xp: 600, rep: { technikums: 15, neutralVillages: 10 }, flags: ['lis-online', 'ally-villages-hint', 'vazgen-trace'] }),

  Q('ch3-kuksius-bunker', 'Нижний ярус', 'mixed', 'renegades', 'bk-shtyk', 4,
    'Бункер Куксиуса: штаб штурма Военпрома, внизу — лаборатория «Рассвета».',
    [
      st('shtyk', 'Ветеран Штык откроет верхние ярусы.', talk('bk-shtyk', 'bunker-kuksiusa'), 'down'),
      st('down', 'Нижний ярус охраняют пустые тела «Рассвета».', fight('enc-dawn-bodies', 'bunker-kuksiusa'), 'archive'),
      st('archive', 'Архив: программа идеального тела, тела вывезены.', check(['analysis', 'tech', 'judge'], 14), 'done'),
    ],
    { xp: 600, items: [{ item: 'dawn-schematic', n: 1 }], flags: ['dawn-archive'], rep: { renegades: 10 } }),

  Q('ch3-lox-marks', 'Пять пустых глаз', 'mixed', 'aiParty', 'lox', 4,
    'Пять меток Lox на карте — пять клонов. Каждый думает, что настоящий — он.',
    [
      st('marks', 'Найти клонов (минимум 3 из 5).', { kind: 'all', min: 3, goals: [
        { kind: 'battle', encounter: 'enc-lox-clone', location: 'lox', doneFlag: 'lox-1-done' },
        { kind: 'battle', encounter: 'enc-lox-clone', location: 'lox-2', doneFlag: 'lox-2-done' },
        { kind: 'battle', encounter: 'enc-lox-clone', location: 'lox-3', doneFlag: 'lox-3-done' },
        { kind: 'battle', encounter: 'enc-lox-clone', location: 'lox-4', doneFlag: 'lox-4-done' },
        { kind: 'talk', npc: 'lox-clone-9', location: 'lox-5', doneFlag: 'lox9-met' },
      ] }, 'nine'),
      st('nine', 'Lox-9 сомневается. Что с ним делать?', choice(
        opt('free', 'Отпустить: пусть станет собой.', check(['persuasion', 'meditation'], 14, 'kill'), { flags: ['lox9-free'], deeds: ['mercy'] }),
        opt('kill', 'Закончить дело.', fight('enc-lox-clone', 'lox-5'), { deeds: ['kill-surrendered'] }),
        opt('party', 'Сдать Партии за награду.', null, { rep: { aiParty: 15 }, credits: 200, deeds: ['serve-ai', 'greed'] }),
      ), 'report'),
      st('report', 'Рассказать Lox.', talk('lox', 'alpha-harmony'), 'done'),
    ],
    { xp: 700, rep: { aiParty: -10 }, flags: ['lox-clones-handled'] }),

  Q('ch3-underground', 'Открыто. Не благодари', 'search', 'mutantsBeast', 'pr-rasteryasha', 3,
    'У Проёба — метки Лизы и вход в подземный город, где она родилась.',
    [
      st('marks', 'Находчик Нашлось видел метки.', talk('pr-nashlos', 'proeb'), 'entrance'),
      st('entrance', 'Найти вход по меткам.', check(['perception', 'lockpicking'], 14), 'first'),
      st('first', 'Первый ярус подземного города: ползуны.', fight('w-villages-hatch', 'liza'), 'done'),
    ],
    { xp: 400, items: [{ item: 'lockpick-set', n: 1 }], flags: ['underground-city-found'] }),

  Q('ch3-artem-nest', 'Ветер слева', 'search', 'scavengers', 'sborshchik', 3,
    'Лёжка Артёма в 241 км от Свалки: снайперское гнездо и запись последнего выстрела.',
    [
      st('find', 'Найти лёжку.', check(['survival', 'perception'], 14), 'scope'),
      st('scope', 'Оптика с записью: кто первым шёл к Спутнику.', reach('artem'), 'done'),
    ],
    { xp: 300, items: [{ item: 'artyom-scope', n: 1 }], flags: ['sputnik-raiders-known'] }),

  Q('ch3-sky-bazaar', 'Обломки неба', 'mixed', 'pirates', 'nb-lyustra', 3,
    'Небесный базар упал в 2013-м. В обломках — архив, за ним охотятся Предложка, пираты и мусорщики.',
    [
      st('go', 'Добраться до обломков.', reach('krushenie-nebesnogo-bazara'), 'dig'),
      st('dig', 'Нижние палубы: мусорщики-конкуренты.', fight('w-road-scavengers', 'krushenie-nebesnogo-bazara'), 'who'),
      st('who', 'Кому архив?', choice(
        opt('tsitata', 'Сборщице Цитате (Предложка).', null, { rep: { neutralVillages: 5 }, flags: ['archive-predlozhka'], talentChoice: ['analyst', 'tech-archaeologist'] }),
        opt('pirates', 'Пиратам — за переправу.', null, { rep: { pirates: 15 }, flags: ['crossing-discount'] }),
        opt('lyustra', 'Люстре — на продажу.', null, { credits: 250, rep: { scavengers: 10 }, deeds: ['greed'] }),
      ), 'done'),
    ],
    { xp: 500 }),

  Q('ch3-tin-oath', 'Сталь под сталью', 'mixed', 'tinBrotherhood', 'ken', 4,
    'Путь к союзу с ЖБ: Великая Арена, Великий Храм, Великий Мех.',
    [
      st('arena', 'Турнир Великой Арены.', fight('enc-arena-final', 'velikaya-arena'), 'dodze'),
      st('dodze', 'Испытание Додзе у Сэнсэя Отвеса.', { kind: 'challenge', skills: ['meditation', 'athletics', 'endurance', 'religion'], dc: 14, successes: 3, failures: 2, onFail: 'arena' }, 'temple'),
      st('temple', 'Совет у Великого Храма. Хан слушает.', talk('khan', 'velikiy-khram'), 'mech'),
      st('mech', 'Великий Мех проснулся сам. Что с ним?', choice(
        opt('break', 'Разбить.', fight('enc-great-mech', 'velikiy-mekh'), { flags: ['mech-broken'], rep: { tinBrotherhood: 10 } }),
        opt('reflash', 'Перепрошить, отдать Ласточке.', check(['tech', 'proxy', 'hacking'], 17, 'break'), { flags: ['mech-ally'], rep: { tinBrotherhood: 5, tekhonki: -5 } }),
      ), 'done'),
    ],
    { xp: 800, rep: { tinBrotherhood: 20 }, flags: ['ally-tin'], talent: 'death-rhythm' }),

  Q('ch3-plague', 'Чума металла', 'mixed', 'mechanids', 'mother-of-gears', 4,
    'Экспедиция исцеления погибла. Её журнал ведёт к Семени Чумы.',
    [
      st('mother', 'Мать Шестерён просит закончить дело экспедиции.', talk('mother-of-gears', 'betonka'), 'expedition'),
      st('expedition', 'Лагерь экспедиции: журнал доктора Шунта.', talk('bt-shunt', 'ekspeditsiya-istseleniya'), 'seed'),
      st('seed', 'Семя Чумы — заражённое ядро.', fight('enc-plague-seed', 'semya-chumy'), 'cure'),
      st('cure', 'Что сделать с Семенем?', choice(
        opt('cure', 'Перепрошить: лекарство из «я».', check(['tech', 'medicine', 'hacking'], 16, 'burn'), { flags: ['plague-cured'], rep: { mechanids: 25, cult: -10 } }),
        opt('burn', 'Выжечь — вместе с частью коллектива.', null, { flags: ['plague-cured', 'mechanids-wounded'], rep: { mechanids: 5 }, deeds: ['cruelty'] }),
      ), 'done'),
    ],
    { xp: 800, flags: ['ally-mechanids-hint'] }),

  // ============================================================ ПОБОЧНЫЕ ПО РЕГИОНАМ
  // ---------- aiParty (Коррупция-Сити)
  Q('sq3-ai-coupons', 'Фальшивые талоны', 'mixed', 'aiParty', 'pl-kvota', 3, 'Кто подделывает талоны?',
    [st('find', 'Найти фальшивомонетчика.', check(['analysis', 'perception'], 13), 'deal'),
     st('deal', 'Подпольщица печатает талоны для беглецов.', choice(
       opt('turn', 'Сдать Квоте.', null, { rep: { aiParty: 10 }, credits: 120, deeds: ['serve-ai'] }),
       opt('hide', 'Прикрыть и купить пару.', check(['deception'], 14), { rep: { aiParty: -5 }, deeds: ['lie', 'help-weak'] }),
     ), 'done')], { xp: 200 }),
  Q('sq3-ai-column', 'Колонна', 'combat', 'aiParty', 'pl-sirena', 3, 'Колонна беглецов застряла у ворот. Нужна диверсия.',
    [st('distract', 'Отвлечь Чистильщиков.', fight('w-cc-gate', 'putinlyandiya'), 'done')],
    { xp: 300, rep: { aiParty: -10, tinBrotherhood: 10 }, deeds: ['free-slaves'] }),
  Q('sq3-ai-census', 'Перепись мёртвых', 'talk', 'aiParty', 'pl-index', 3, 'Мёртвые граждане обязаны встать на учёт.',
    [st('count', 'Переписать души на улицах.', { kind: 'challenge', skills: ['religion', 'persuasion', 'judge', 'medicine'], dc: 13, successes: 3, failures: 2, onFail: 'riot' }, 'report'),
     st('riot', 'Мёртвые против переписи.', fight('w-cc-dead', 'putinlyandiya'), 'report'),
     st('report', 'Сдать списки Индексу.', talk('pl-index', 'putinlyandiya'), 'done')], { xp: 250, rep: { aiParty: 10 } }),

  // ---------- warprom (Кремль)
  Q('sq3-wp-probirka', 'Девятая партия', 'mixed', 'warprom', 'kr-probirka', 4, 'Лаборант клон-цехов просит вывезти его из Кремля.',
    [st('out', 'Вывести Пробирку.', choice(
      opt('sneak', 'Тихо.', check(['stealth'], 15, 'loud')),
      opt('loud', 'С боем.', fight('enc-warprom-patrol', 'kreml'), { rep: { warprom: -10 } }),
    ), 'talk'),
     st('talk', 'Пробирка называет, куда ушли пять партий клонов.', talk('kr-probirka', 'kreml'), 'done')],
    { xp: 400, flags: ['lox-marks-known'] }),
  Q('sq3-wp-bar-map', 'Карта на стене', 'search', 'warprom', 'kr-gilza', 3, 'На стене «Последнего патрона» — ходы к бункеру Куксиуса.',
    [st('copy', 'Скопировать карту, пока ветераны спорят.', check(['perception', 'analysis'], 12), 'done')], { xp: 150, flags: ['kuksius-bunker-route'] }),
  Q('sq3-wp-door', 'Дверь, которую нельзя мыть', 'mixed', 'warprom', 'janitor-tryapkin', 4, 'Нижний ярус Кремля: дверь, к которой Тряпкину запрещено подходить.',
    [st('door', 'Открыть.', check(['lockpicking', 'hacking'], 16), 'vats'),
     st('vats', 'Клон-чаны и охрана.', fight('enc-clone-vats', 'kreml'), 'done')], { xp: 450, rep: { warprom: -10 }, flags: ['clone-vats-found'] }),

  // ---------- tinBrotherhood
  Q('sq3-tin-lights', 'Свет в Ночи', 'talk', 'tinBrotherhood', 'nc-filin', 3, 'Кто светит сигналы в городе без света?',
    [st('watch', 'Выследить.', check(['perception', 'stealth'], 13), 'who'),
     st('who', 'Это Фонарщица Лучина — подаёт знаки контрабандистам.', choice(
       opt('turn', 'Сдать Филину.', null, { rep: { tinBrotherhood: 10 } }),
       opt('deal', 'Уговорить её светить для разведки братства.', check(['persuasion'], 14), { rep: { tinBrotherhood: 10, pirates: -5 }, deeds: ['mercy'] }),
     ), 'done')], { xp: 250 }),
  Q('sq3-tin-tractors', 'Ржавая пашня', 'mixed', 'tinBrotherhood', 'se-pakhota', 3, 'Чума металла перекинулась на технику Селышка.',
    [st('sample', 'Взять пробу.', check(['tech', 'medicine'], 13), 'swarm'),
     st('swarm', 'Заражённые машины.', fight('enc-plague-machines', 'selyshko'), 'done')], { xp: 300, items: [{ item: 'plague-sample', n: 1 }], rep: { tinBrotherhood: 10 } }),
  Q('sq3-tin-border', 'Граница терпения', 'talk', 'tinBrotherhood', 'ft-bastion', 3, 'Фортеция ЖБ и Лесянка мутантов-Ж на грани стычки.',
    [st('talks', 'Свести Бастиона и Лосиху Мирру.', { kind: 'challenge', skills: ['persuasion', 'military', 'biology', 'intimidation'], dc: 15, successes: 4, failures: 2, onFail: 'clash' }, 'done'),
     st('clash', 'Стычка на границе.', fight('enc-border-clash', 'fortetsiya'), 'done')],
    { xp: 450, rep: { tinBrotherhood: 10, mutantsBeast: 10 }, deeds: ['mercy'] }),

  // ---------- pirates
  Q('sq3-pir-crystal', 'Хрусталь с неба', 'search', 'pirates', 'rc-broshka', 3, 'Брошка ищет «небесный хрусталь» с обломков базара.',
    [st('get', 'Найти хрусталь в обломках.', reach('krushenie-nebesnogo-bazara'), 'sell'),
     st('sell', 'Отдать Брошке.', talk('rc-broshka', 'raytsentr'), 'done')], { xp: 250, credits: 200, rep: { pirates: 5 } }),
  Q('sq3-pir-chart', 'Сорок градусов', 'search', 'pirates', 'rc-kompas', 3, 'Компас продаст карту — если принести ему «правильный» компас из руин.',
    [st('ruins', 'Руины на побережье.', fight('w-road-crawlers', 'ruins-m35'), 'done')], { xp: 250, flags: ['crossing-discount'] }),

  // ---------- scavengers
  Q('sq3-sc-crown', 'Корона из кубков', 'mixed', 'scavengers', 'glava-musora', 3, 'Корону украли. Новым королём станет вор. Все ищут вора — чтобы стать вором.',
    [st('trail', 'Найти вора раньше остальных.', check(['perception', 'survival', 'analysis'], 14), 'thief'),
     st('thief', 'Вор — Крысиная Тома: «король должен узнать, каково без короны».', choice(
       opt('return', 'Вернуть корону королю.', null, { rep: { scavengers: 15 } }),
       opt('wear', 'Надеть корону самому. Ненадолго.', fight('w-road-scavengers', 'svalka'), { rep: { scavengers: -10 }, items: [{ item: 'cup-crown', n: 1 }] }),
     ), 'done')], { xp: 300 }),
  Q('sq3-sc-petrovich', 'Он пищит', 'combat', 'scavengers', 'svk-petrovich', 3, 'Ночью к Спутнику лезут налётчики.',
    [st('night', 'Ночной бой у Спутника.', fight('w-road-scavengers', 'sputnik'), 'done')], { xp: 300, rep: { scavengers: 10 } }),

  // ---------- mechanids
  Q('sq3-mech-port', 'Не болен', 'talk', 'mechanids', 'bt-uzel88', 3, 'Порт Бетонки пускает только здоровых.',
    [st('prove', 'Пройти проверку коллектива.', check(['endurance', 'tech', 'deception'], 14), 'done')], { xp: 200, flags: ['betonka-port-guest'] }),
  Q('sq3-mech-signal', 'Сигнал заражения', 'mixed', 'mechanids', 'node-fifteen', 4, 'Заражение идёт по сигналу. Откуда?',
    [st('trace', 'Отследить.', check(['hacking', 'analysis'], 15), 'relay'),
     st('relay', 'Ретранслятор культа в цехах.', fight('enc-plague-machines', 'betonka'), 'done')], { xp: 400, rep: { mechanids: 15, cult: -5 } }),

  // ---------- agrozone
  Q('sq3-agro-leyka', 'Полей меня', 'mixed', 'agrozone', 'gp-leyka', 3, 'Мутант-растение прячется в теплицах Гидропоники с семенным фондом.',
    [st('choose', 'Что делать?', choice(
      opt('save', 'Вывести Лейку и семена.', check(['stealth', 'deception'], 15, 'fight'), { rep: { mutantsPlant: 15, agrozone: -10 }, deeds: ['help-weak'] }),
      opt('fight', 'Прорываться.', fight('w-agro-cleaners', 'gidroponika'), { rep: { mutantsPlant: 15, agrozone: -15 } }),
      opt('turn', 'Выдать Ростку.', null, { rep: { agrozone: 15, mutantsPlant: -20 }, credits: 150, deeds: ['anti-mutant'] }),
    ), 'done')], { xp: 350 }),
  Q('sq3-agro-bread', 'Девяносто семь процентов', 'talk', 'agrozone', 'gp-rostok', 4, 'Кому идёт хлеб Гидропоники?',
    [st('split', 'Решить с Ростком.', choice(
      opt('party', 'Партии — по плану.', null, { rep: { agrozone: 10, aiParty: 5 }, deeds: ['serve-ai'] }),
      opt('harmony', 'Часть — Альфа-Гармонии.', check(['persuasion', 'deception'], 15), { rep: { technikums: 15 }, flags: ['harmony-bread'] }),
      opt('marta', 'Часть — Марте.', check(['intimidation', 'deception'], 16), { rep: { renegades: 15, agrozone: -10 }, deeds: ['free-slaves'] }),
    ), 'done')], { xp: 400 }),

  // ---------- cult
  Q('sq3-cult-undercover', 'Подсудимый', 'talk', 'cult', 'sk-apellyatsiya', 4, 'Внедриться в Сокральню под видом подсудимого.',
    [st('trial', 'Пройти «суд» культа.', { kind: 'challenge', skills: ['deception', 'judge', 'religion', 'meditation'], dc: 15, successes: 3, failures: 2, onFail: 'exposed' }, 'inside'),
     st('exposed', 'Раскрыт.', fight('enc-sokralnya-guard', 'sokralnya'), 'done'),
     st('inside', 'Узнать расписание «Третьего исхода».', talk('sk-apellyatsiya', 'sokralnya'), 'done')], { xp: 500, flags: ['exodus-schedule'] }),
  Q('sq3-cult-buffer', 'Ваша душа очень важна для нас', 'talk', 'cult', 'sk-bufer', 4, 'Привратник Двери скучает. Ему никто не пишет.',
    [st('chat', 'Поговорить с Буфером.', check(['hacking', 'persuasion', 'judge'], 14), 'done')], { xp: 300, flags: ['door-backdoor'] }),

  // ---------- renegades
  Q('sq3-ren-join', 'Цена — ты', 'combat', 'renegades', 'sht-kayma', 3, 'Испытание Отступников у таверны Марты.',
    [st('test', 'Рейд на конвой Чистильщиков.', fight('w-agro-cleaners', 'shtabtsentr'), 'marta'),
     st('marta', 'Марта смотрит на тебя.', talk('marta', 'marta'), 'done')], { xp: 400, rep: { renegades: 15 }, deeds: ['free-slaves'] }),
  Q('sq3-ren-mines', 'Кто переставляет мины', 'mixed', 'renegades', 'yarosh', 3, 'Кто-то ставит мины Яроша ближе к Хатаб-Сити (столица пиратов, где Отступники держат гарнизон).',
    [st('watch', 'Засада у минного поля на подступах к Хатаб-Сити.', check(['stealth', 'perception'], 14, 'fight'), 'who'),
     st('fight', 'Диверсанты.', fight('enc-saboteurs', 'raytsentr'), 'who'),
     st('who', 'Это клон Lox по приказу Партии.', talk('yarosh', 'raytsentr'), 'done')], { xp: 350, rep: { renegades: 10 }, flags: ['lox-marks-known'] }),

  // ---------- mutantsBeast
  Q('sq3-mb-pits', 'Три схватки', 'combat', 'mutantsBeast', 'bn-klykan', 3, 'Ямы Бойника — путь к уважению Зверя.',
    [st('pit', 'Три боя в яме.', fight('enc-beast-pit', 'boynik'), 'zver'),
     st('zver', 'Зверь замечает героя.', talk('zver', 'vonyuchka'), 'done')], { xp: 400, rep: { mutantsBeast: 15 }, flags: ['pack-respect'] }),
  Q('sq3-mb-lost', 'Деревня потерянных', 'search', 'mutantsBeast', 'pr-rasteryasha', 2, 'Помочь жителям Проёба найти потерянное.',
    [st('find', 'Найти три пропажи.', check(['perception', 'survival'], 12), 'done')], { xp: 150, rep: { mutantsBeast: 5 }, flags: ['liza-marks-seen'] }),

  // ---------- mutantsPlant
  Q('sq3-mp-refuge', 'Мы уже падали', 'mixed', 'mutantsPlant', 'gm-iva', 4, 'Гармония (основана беженцами Небесного базара) готова принять беженцев Альфа-Гармонии.',
    [st('supplies', 'Собрать припасы для лагеря.', { kind: 'item', item: 'medkit', n: 3 }, 'pier'),
     st('pier', 'Отбить причал у пиратов-налётчиков.', fight('w-road-pirates', 'garmoniya'), 'done')], { xp: 400, rep: { mutantsPlant: 15 }, flags: ['garmoniya-ready'] }),
  Q('sq3-mp-seeds', 'Семена, а не месть', 'search', 'mutantsPlant', 'mutant-shaman', 3, 'Партия жжёт приграничный лес. Шаман просит не мести, а семян.',
    [st('forest', 'Собрать семена в священном лесу.', reach('sacred-forests-m21'), 'done')], { xp: 250, rep: { mutantsPlant: 10 }, deeds: ['mercy'] }),

  // ---------- cringegons
  Q('sq3-cr-nadezhda', 'Надежда', 'combat', 'cringegons', 'nd-stydoba', 3, 'Каратели Кринж-Вождя идут на поселение мирных кринжгонов.',
    [st('defend', 'Оборона Надежды.', fight('w-villages-jesters', 'nadezhda'), 'done')], { xp: 400, rep: { neutralVillages: 10 }, flags: ['nadezhda-saved'] }),
  Q('sq3-cr-base', 'Забытое войско', 'combat', 'cringegons', 'nd-stydoba', 4, 'Освободить пленных Предложки на захваченной базе.',
    [st('storm', 'Штурм Базы Предложки.', fight('enc-cringe-base', 'baza-predlozhki'), 'rubezh'),
     st('rubezh', 'Защитник Рубеж: «Смена наконец пришла».', talk('defender-rubezh', 'baza-predlozhki'), 'done')], { xp: 500, flags: ['predlozhka-freed'] }),

  // ---------- tekhonki
  Q('sq3-tk-oil', 'Масло для станка', 'search', 'tekhonki', 'stn-shpindel', 2, 'Станок не в духе. Ему нужна жертва — хорошее масло.',
    [st('oil', 'Найти довоенное масло в старых цехах Станка.', check(['survival', 'perception', 'tech'], 12), 'done')], { xp: 150, rep: { tekhonki: 10 } }),
  Q('sq3-tk-doubt', 'Баланс или баланда', 'talk', 'tekhonki', 'sm-ryab', 4, 'Смотрящая Рябь сомневается в воле старого бога.',
    [st('listen', 'Дослушать помехи вместе с ней.', { kind: 'challenge', skills: ['proxy', 'meditation', 'analysis', 'religion'], dc: 15, successes: 3, failures: 2, onFail: 'storm' }, 'done'),
     st('storm', 'Прокси-буря накрывает Смотрельце.', fight('enc-proxy-storm', 'smotreltse'), 'done')], { xp: 400, flags: ['oldgod-doubt'], rep: { tekhonki: 5 } }),

  // ---------- neutralVillages
  Q('sq3-nv-ferry', 'Вода общая', 'combat', 'neutralVillages', 'sv-brod', 3, 'Налётчики захватили паром Свободы.',
    [st('ferry', 'Отбить паром.', fight('enc-brigands', 'svoboda'), 'done')], { xp: 350, rep: { neutralVillages: 10, pirates: -5 }, flags: ['ferry-free'] }),
  Q('sq3-nv-convoy', 'Хлебный обоз', 'combat', 'neutralVillages', 'ag-borozda', 3, 'Обоз Аграры с хлебом для Альфа-Гармонии.',
    [st('escort', 'Сопроводить обоз.', fight('w-road-pirates', 'agrara'), 'done')], { xp: 350, rep: { neutralVillages: 10, technikums: 10 }, flags: ['harmony-bread'] }),
  Q('sq3-nv-name', 'Стоикость первая', 'talk', 'neutralVillages', 'stk-upor', 2, 'Две Стоикости спорят, кто первая.',
    [st('talks', 'Помирить Деда Упора и Стоика Кремня.', { kind: 'challenge', skills: ['persuasion', 'deception', 'analysis'], dc: 12, successes: 3, failures: 2, onFail: 'done-bad' }, 'done'),
     st('done-bad', 'Обе переименовались в «Стоикость». Ничего не изменилось.', reach('stoikost'), 'done')], { xp: 150, rep: { neutralVillages: 5, tinBrotherhood: 5 } }),
  Q('sq3-nv-bus', 'Автобус будет', 'search', 'neutralVillages', 'os-kuzmich', 2, 'Тринадцать жителей Остановки ждут автобус с ЭВК.',
    [st('bus', 'Найти в руинах довоенный автобус.', reach('ruins-m36'), 'tell'),
     st('tell', 'Рассказать Кузьмичу. Он решит ждать дальше.', talk('os-kuzmich', 'ostanovka'), 'done')], { xp: 150, talent: 'safe-path' }),

  // ============================================================ КОНТРАКТЫ
  Q('ct3-ice-ring', 'Ледяной ринг', 'combat', 'pirates', 'rc-toroz', 3, 'Бои на льду за славу и проход.',
    [st('ring', 'Три боя.', fight('enc-ice-ring', 'ledyanoy-ring'), 'done')], { xp: 400, credits: 200, rep: { pirates: 10 }, flags: ['ice-ring-won'] }),
  Q('ct3-brigands-1', 'Контракт: банда у моста', 'combat', 'neutralVillages', 'sv-yarmarka', 2, 'Разбойники грабят торговцев.',
    [st('camp', 'Лагерь разбойников.', fight('enc-brigands', 'brigands-m25'), 'done')], { xp: 200, credits: 120 }),
  Q('ct3-brigands-2', 'Контракт: налёт на дорогу', 'combat', 'tinBrotherhood', 'zh-nakovalnya', 3, 'Банда на дороге Жестобой — Бетонка.',
    [st('camp', 'Логово банды.', fight('enc-brigands', 'brigands-m27'), 'done')], { xp: 250, credits: 150 }),
  Q('ct3-pirates', 'Контракт: пиратские воды', 'combat', 'tinBrotherhood', 'sl-klepa', 3, 'Пираты без флага Буревестника грабят порт Славотеча.',
    [st('raid', 'Пиратское гнездо.', fight('w-road-pirates', 'pirates-m29'), 'done')], { xp: 300, credits: 180, rep: { tinBrotherhood: 5 } }),
  Q('ct3-lake-monster', 'Контракт: рыба, которая знает', 'combat', 'neutralVillages', 'bl-som', 3, 'Озёрное чудовище у Белбы.',
    [st('hunt', 'Охота.', fight('enc-lake-monster', 'lake-monsters-m18'), 'done')], { xp: 350, credits: 160, rep: { neutralVillages: 5 } }),
  Q('ct3-sea-monster', 'Контракт: морской змей', 'combat', 'pirates', 'rc-kompas', 4, 'Морское чудовище на пути между материками.',
    [st('hunt', 'Охота.', fight('enc-sea-monster', 'sea-monsters-m19'), 'done')], { xp: 450, credits: 220, flags: ['crossing-discount'] }),
  Q('ct3-hill-monster', 'Контракт: тварь с холмов', 'combat', 'tinBrotherhood', 'ft-bastion', 3, 'Холмовое чудовище у границы.',
    [st('hunt', 'Охота.', fight('enc-hill-monster', 'hill-monsters-m20'), 'done')], { xp: 350, credits: 160 }),
  Q('ct3-necropolis', 'Контракт: беспокойные мёртвые', 'combat', 'neutralVillages', 'sy-tish', 3, 'Некрополь у Святости: души не уходят в Киберспейс.',
    [st('rest', 'Упокоить.', choice(
      opt('fight', 'Бой с духами.', fight('w-cc-dead', 'necropolises-m47')),
      opt('rite', 'Обряд.', check(['religion', 'meditation', 'judge'], 15, 'fight'), { deeds: ['mercy'] }),
    ), 'done')], { xp: 300, credits: 120, rep: { neutralVillages: 5 } }),
  Q('ct3-dungeon', 'Контракт: подземелье Предложки', 'combat', 'neutralVillages', 'collector-tsitata', 4, 'Цитате нужна книга из подземелья.',
    [st('delve', 'Подземелье.', fight('enc-dungeon', 'dungeons-m12'), 'done')], { xp: 400, credits: 150, talentChoice: ['analyst', 'letter-reading'] }),
];

export const QUESTS_V3 = Object.fromEntries(LIST.map((q) => [q.id, q]));

// Временные id боёв — заменить на ENCOUNTERS_V3 из enemies-v3.js (второй дизайнер).
export const ENC_TODO = {
  'enc-sputnik-raid': 'культисты-налётчики у Спутника (ур. 4)',
  'enc-cringe-base': 'гарнизон кринжгонов на Базе Предложки (кринж-шуты, ур. 4)',
  'enc-vibe-burner': 'Выжигатель Вайба: машина-босс + шуты, урон по МРЛ (ур. 4–5)',
  'enc-ice-ring': 'три боя на льду, скользкие клетки (ур. 3)',
  'enc-brigands': 'разбойники/налётчики (ур. 2–3)',
  'enc-harmony-fall': 'культ у реактора падающей платформы (ур. 5)',
  'enc-arsenal-cult': 'культисты в довоенном арсенале (ур. 5)',
  'enc-kiberspeys-door': 'штурм Двери: скрилеты, аколиты (ур. 5)',
  'enc-judge': 'финальный бой с аватаром Судьи (ур. 5)',
  'enc-lis-drones': 'охранные дроны ГО в Бункере Лиса (mechanical, ур. 3)',
  'enc-dawn-bodies': 'пустые тела «Рассвета» (hybrid, ур. 4)',
  'enc-lox-clone': 'клон Lox + каратели (ур. 4)',
  'enc-arena-final': 'финал турнира Великой Арены (ур. 4)',
  'enc-great-mech': 'Великий Мех — босс (mechanical, ур. 5)',
  'enc-plague-seed': 'Семя Чумы — заражённое ядро + машины (ур. 4)',
  'enc-plague-machines': 'заражённые чумой металла машины (ур. 3)',
  'enc-warprom-patrol': 'патруль андроидов Военпрома (ур. 4)',
  'enc-clone-vats': 'охрана клон-чанов (ур. 4)',
  'enc-border-clash': 'стычка ЖБ и мутантов-Ж (ур. 3)',
  'enc-sokralnya-guard': 'стража Сокральни (ур. 4)',
  'enc-saboteurs': 'диверсанты Партии с клоном Lox (ур. 3)',
  'enc-beast-pit': 'ямы Бойника, три мутанта (ур. 3)',
  'enc-proxy-storm': 'бой в прокси-буре: механические враги, таблица PROXY_STORM (ур. 4)',
  'enc-lake-monster': 'озёрное чудовище (ур. 3)',
  'enc-sea-monster': 'морское чудовище (ур. 4)',
  'enc-hill-monster': 'холмовое чудовище (ур. 3)',
  'enc-dungeon': 'подземелье: ползуны и ловушки (ур. 4)',
};

// Новые предметы (дизайнер снаряжения): dawn-schematic, lockpick-set, artyom-scope, terminal-shard, plague-sample, cup-crown.
// Новые поля, которых нет в quests.js (нужна поддержка в коде):
//   'all'.pick / pickWith — игрок выбирает не больше N подцелей (с флагом — больше); остальные теряются (mq3-fall);
//   challenge.easeBy — каждый флаг из списка снижает СЛ на 1 (свидетели защиты на суде, mq3-court);
//   effects.credits у опций и requires.alignment — как в rewards.
