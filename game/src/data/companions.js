// Напарники: вербовка, лояльность, личные квесты, прокачка, реплики. Спека: docs/specs/companions-scenes.md.
// Владелец данных — game-designer. Данные чистые (без импортов): движок читает их, id проверяются tools-скриптом спеки.
//
// ---------------------------------------------------------------------------------------------------------------
// ФОРМАТ
// COMPANION_NPCS[]            — новые NPC-напарницы в формате npcs.js (recruitable: true, cls/path/race — существующие id).
// COMPANIONS[npcId] = {
//   gender: 'f' | 'm' | 'x',  home: id узла (куда уходит при уходе),
//   recruit: { pitch, conditions: [Cond], alt?: [Cond] }   — ВСЕ conditions выполнены ИЛИ все alt (запасной путь).
//   loyalty: { start, deeds: { tag: Δ } }                  — +к общим likes/dislikes из npcs.js (COMPANION), Δ с тем же знаком.
//   quest:   id личного квеста (PERSONAL_QUESTS), altPath: путь класса для «переучивания» (после квеста),
//   leave:   { line, return?: Cond }                       — реплика при уходе и условие возвращения.
//   barks:   { situation: [строки] }                       — личные реплики (приоритет над BARKS_GENERIC).
// }
// Cond (kind):
//   { kind:'rep', faction, min:'neutral'|'friendly'|'ally' }   репутация фракции героя не ниже порога (REP_TIERS)
//   { kind:'intro' }                      завершена стадия 1 («знакомство») личного квеста этого напарника
//   { kind:'quest', id, state? }          чужой квест (state по умолчанию 'done')
//   { kind:'check', skills:[..], dc, }  проверка навыка (сцена — авто-обёртка autoScene из world/check-scenes.js)
//   { kind:'pay', credits }               разовая плата (списывается при согласии)
//   { kind:'align', is:'good'|'evil' }    мировоззрение героя
//   { kind:'flag', flag } | { kind:'item', item }
//   { kind:'level', min }                 уровень героя
//   { kind:'notWith', id, hard }          несовместимость: hard — нельзя нанять, пока тот в партии (active/waiting);
//                                         не hard — можно, но «трение» (см. COMPANION_RULES.friction)
//   Любая Cond имеет why — строка отказа, которую игрок видит в диалоге.
// PERSONAL_QUESTS[id] = { id, name, npc, stages: [{ id, text, goal, loyaltyMin? }], rewards }
//   goal — грамматика data/world/quests.js (reach / talk / battle / check / choice); loyaltyMin — стадия открывается
//   при лояльности не ниже. Стадия 'meet' — всегда первая (знакомство, нужна для intro-условия).
// ---------------------------------------------------------------------------------------------------------------

// ============================================================== ПРАВИЛА (числа крутит balance-tester)
export const COMPANION_RULES = {
  // Опыт: у каждого напарника свой p.xp. Получает долю от каждой награды героя (бой, квест, проверка).
  xp: { activeShare: 1.0, waitingShare: 0.5, leftShare: 0, catchUpMul: 1.5, levelCapOverHero: 0 },
  // Лояльность = approval (−100…100, rules.js R.approval). Здесь — дополнительные события.
  loyalty: {
    bands: [
      { id: 'devoted', min: 60, name: 'Предан' }, { id: 'trusting', min: 20, name: 'Доверяет' },
      { id: 'neutral', min: -19, name: 'Присматривается' }, { id: 'cold', min: -49, name: 'Остыл' },
      { id: 'leaving', min: -100, name: 'На грани ухода' },
    ],
    events: {
      questStage: +5, questDone: +15,        // стадия / завершение личного квеста
      sharedVictory: +1,                     // раз за 3 боя без потерь в партии (счётчик)
      downedInBattle: -3,                    // напарник упал, а герой не лечил до конца боя
      reviveInBattle: +3,                    // герой поднял упавшего напарника
      leftWaiting: -1,                       // за каждые 3 игровых дня в очереди «ждёт на хабе»
      giftRare: +4,                          // подарок по вкусу (раз на предмет), см. npcs.js COMPANION.likes
      bondRest: +1, frictionRest: -2,        // привал: bond-пара вместе / soft-несовместимые вместе
      refuseOrder: -5,                       // игрок отклонил просьбу напарника (в диалоге)
    },
    leaveAt: -70, warnAt: -50, teachAt: 50, trustsChoicesAt: 20, // как rules.js + новый порог доверия к выбору прокачки
    returnLoyalty: -40,                      // вернувшись, стартует с −40 (recruit уже так делает) и требует извинения (return Cond)
  },
  // Прокачка (человек, 2026-11-08): напарники прокачиваются как герой — таланты по уровням, ASI или талант;
  // всё выбирает игрок (trustsChoicesAt больше не влияет на ASI).
  // Размер отряда (человек, 2026-11-07): base мест (вместе с героем) + perChaMod за каждую единицу положительного
  // мод. ХАР героя + value флага мира 'squad-size' у талантов героя («Лидерство», «Командный голос»).
  squad: { base: 4, perChaMod: 1 },
  // «Одеть лучшее» (world/best-gear.js): оценка = ожидаемый урон атаки против КБ refKb + ур.×kbPerLevel
  // + kbWeight × КБ − штрафы (невыполненные требования, броня без владения); очередь rof добавляет rofShare за выстрел.
  bestGear: { refKb: 12, kbPerLevel: 0.5, kbWeight: 0.8, reqPenalty: 3, untrainedPenalty: 3, rofShare: 0.3 },
  levelup: {
    asi: true,            // движок levelup.js openAsi(game, level, …, { unit: companion }) на уровнях asiLevelsFor(cls)
    talentOffers: 3,      // «Талант вместо роста»: 3 случайных из talentPool(sv, u) + любимый (companion.talents[1])
    altPathAtLevel: 5,    // раз за игру, после завершения личного квеста: сменить путь на altPath (rebuild, без потери ASI)
  },
  // Реплики-реакции: редко и по поводу.
  barks: {
    globalCooldownSec: 150, perCompanionCooldownSec: 300, perSituationCooldownSec: 480,
    maxPerScene: 1, durationSec: 3.5, ignoreInDialogue: true,
    chance: { // базовый шанс при наступлении ситуации; личные likes/dislikes и крит-ситуации — выше
      battleStart: 0.12, critHit: 0.18, lowHp: 0.40, allyDown: 0.60, victory: 0.15, levelUp: 1.0, rareLoot: 0.40,
      campRest: 0.30, newRegion: 0.20, likeDeed: 0.70, dislikeDeed: 0.85, checkSuccess: 0.25, checkFail: 0.35,
      enemyOfFaction: 0.50, lowMrl: 0.35, questStageDone: 0.40,
    },
  },
  // Трение/связи пар
  friction: { loyaltyPerRest: -2, endsWhenQuestDone: true },
};

// ============================================================== НОВЫЕ NPC (5 напарниц)
const NEW = (id, name, faction, race, location, role, services, character, speech, bark, hook, extra) => ({
  id, name, faction, race, key: false, location, role, services, character, speech, bark, hook, invented: true, ...extra,
});

export const COMPANION_NPCS = [
  NEW('sedmaya', 'Седьмая', 'warprom', 'android', 'warprom', 'андроид-снайпер Военпрома, списанная из серии', ['recruit', 'info'],
    'Точная, спокойная, непривычная к тому, что с ней разговаривают как с человеком.', 'Ровно, короткими фразами, без «я» — привычка серии.',
    'Серия «Ворон», номер семь. Остальные шесть — на плацу. Я — в списке «выбыла».', 'Ищет, кто подписал её списание.',
    { recruitable: true, cls: 'ranger', path: 'hunter' }),
  NEW('bulatka', 'Булатка', 'tinBrotherhood', 'human', 'tin-arena', 'боец-тяжеловес Арены, дочь кузнеца', ['recruit', 'info'],
    'Широкая, громкая, обидчивая в вопросах чести и добрая во всём остальном.', 'Басом, с кузнечными поговорками.',
    'Железо любит удар, человек — слово. Дашь слово — держи, а нет — не давай!', 'Её молот — единственное, что осталось от отца.',
    { recruitable: true, cls: 'zabivnoy', path: 'iron-titan' }),
  NEW('kosochka', 'Косточка', 'scavengers', 'skeleton', 'king-dumps', 'скелет-механик, сбежала от охотников на скелетов', ['recruit', 'info'],
    'Суетливая, смешливая, чинит всё, что ломается, и ломает всё, что слишком чинится.', 'Скороговоркой, с лязгом на смехе.',
    'Не смотри на меня как на запчасти! На запчасти я сама смотрю — но на чужие.', 'За её череп на Свалках назначена цена.',
    { recruitable: true, cls: 'itishnik', path: 'inventor' }),
  NEW('laska', 'Ласка', 'pirates', 'mutant-beast', 'raytsentr', 'штурман-мутант пиратов, рыжая и быстрая', ['recruit', 'info'],
    'Азартная, коварная в карты и честная в драке; не выносит тесных клеток.', 'Мурлычуще, с подколками.',
    'Карта — на стол, ножи — под стол. А потом наоборот.', 'Задолжала Буревестнику больше, чем стоит её шкура.',
    { recruitable: true, cls: 'mutant', path: 'predator' }),
  NEW('provoloka', 'Проволока', 'tekhonki', 'tekhonok', 'zavod', 'ученица шаманов прокси, отлучённая за вопросы', ['recruit', 'info'],
    'Любопытная и упрямая; верит в Старого бога, но хочет понять, как он устроен.', 'Нараспев, потом резко по делу.',
    'Старый бог не обидится на вопрос. Старейшины — обидятся. Идём?', 'Носит в волосах медную проволоку-«антенну».',
    { recruitable: true, cls: 'ecolog', path: 'techno-shaman' }),
];

// ============================================================== НАПАРНИКИ
const rep = (faction, min, why) => ({ kind: 'rep', faction, min, why });
const intro = (why) => ({ kind: 'intro', why });
const chk = (skills, dc, why, scene) => ({ kind: 'check', skills, dc, why, ...(scene ? { scene } : {}) });
const pay = (credits, why) => ({ kind: 'pay', credits, why });
const align = (is, why) => ({ kind: 'align', is, why });
const flag = (f, why) => ({ kind: 'flag', flag: f, why });
const quest = (id, why, state) => ({ kind: 'quest', id, why, ...(state ? { state } : {}) });
const notWith = (id, hard, why) => ({ kind: 'notWith', id, hard, why });
const level = (min, why) => ({ kind: 'level', min, why });

const B = (battleStart, victory, allyDown, extra = {}) => ({ battleStart: [battleStart], victory: [victory], allyDown: [allyDown], ...extra });

export const COMPANIONS = {
  // ---------------------------------------------------------------- существующие 16
  'lox': {
    gender: 'm', home: 'alpha-harmony', quest: 'cq-lox', altPath: 'defender',
    recruit: { pitch: 'Я бросил АИ, но не привычку проверять, кто за спиной. Докажи, что ты не клон.',
      conditions: [intro('Сначала помоги ему закрыть метку: он не идёт с теми, кого не видел в деле.'), notWith('sister-pomekha', false, 'Он терпит бывшую аколитку рядом сквозь зубы.')],
      alt: [chk(['analysis', 'perception'], 14, 'Или пройди его «проверку на клона» — пара вопросов и взгляд.')] },
    loyalty: { start: 0, deeds: { 'kill-surrendered': -5 } },
    leave: { line: 'Я иду дальше один. Клоны сами не кончатся.' },
    barks: B('Сверим часы. Сегодня никто не клон.', 'Чисто. Одним меньше врагов.', 'Держись! Не при мне!'),
  },
  'andrey': {
    gender: 'm', home: 'flat-lagoon', quest: 'cq-andrey', altPath: 'inventor',
    recruit: { pitch: 'Руки у меня золотые, а карманы дырявые. Найми, не пожалеешь.',
      conditions: [pay(150, 'Он просит аванс на запчасти: 150 кредитов.')], alt: [chk(['persuasion', 'tech'], 13, 'Уговори или покажи, что понимаешь в железе.')] },
    loyalty: { start: 5, deeds: { 'tech-faith': 3 } },
    leave: { line: 'Я вернусь в мастерскую. Не обижайся, железо не ждёт.' },
    barks: B('Подкрутим гайки — и вперёд.', 'Работает. Редкое чувство.', 'Эй, без поломок!'),
  },
  'dymka': {
    gender: 'f', home: 'corruption-city', quest: 'cq-dymka', altPath: 'manipulator',
    recruit: { pitch: 'Я тихая, потому что громкие умирают. Хочешь меня в команду — докажи, что не продашь мусорщикам.',
      conditions: [intro('Она не пойдёт с тем, кто не прикрыл её хотя бы раз.'), notWith('bulatka', false, 'Булатка не любит воров: трение.')],
      alt: [chk(['stealth', 'deception'], 15, 'Обмани её: притворись, что давно в курсе её тайны.')] },
    loyalty: { start: 0, deeds: { 'kill-surrendered': -5 } },
    leave: { line: 'Тень уходит туда, где тихо. Я не ухожу, я растворяюсь.' },
    barks: B('...', 'Никто нас не видел. Так и надо.', 'Не стой! Возьми меня за руку, живо!'),
  },
  'telifon': {
    gender: 'x', home: 'corruption-city', quest: 'cq-telifon', altPath: 'illusionist',
    recruit: { pitch: 'Бывшая АТС ищет новый узел. У вас связь есть?',
      conditions: [chk(['tech', 'hacking'], 13, 'Нужно подключиться и «поздороваться» на его протоколе.')],
      alt: [pay(200, 'Или оплатить техобслуживание: 200 кредитов.')] },
    loyalty: { start: 0, deeds: { 'tech-faith': 3 } },
    leave: { line: 'Связь потеряна. Ищу сеть получше.' },
    barks: B('Соединение установлено.', 'Звонок завершён. Все абоненты недоступны.', 'Абонент отключается!'),
  },
  'private-nedolyot': {
    gender: 'm', home: 'warprom-corridor', quest: 'cq-nedolyot', altPath: 'wasteland-sniper',
    recruit: { pitch: 'Если возьмёте — я дезертир. Если нет — я просто завтра опять не попаду.',
      conditions: [rep('warprom', 'neutral', 'Он не рискнёт пойти с врагом Военпрома.'), intro('Сначала помоги вынести его с поста без шума.')] },
    loyalty: { start: 0, deeds: { cruelty: -3 } },
    leave: { line: 'Обратно в казарму. Хоть там не стреляют в своих.' },
    barks: B('Главное — не попасть в своих.', 'Попал! Кто-нибудь видел, я попал!', 'Санитара! Любого!'),
  },
  'sekiro': {
    gender: 'm', home: 'tin-arena', quest: 'cq-sekiro', altPath: 'iron-titan',
    recruit: { pitch: 'Мой молот не знает лжи. Лжи не знаю и я.',
      conditions: [rep('tinBrotherhood', 'friendly', 'Арена не отпустит мастера с чужаком: нужна дружба Жестяного братства.'), notWith('madam-stavka', true, 'Он не встанет рядом с шулером.')],
      alt: [chk(['athletics', 'military'], 16, 'Победи его на ринге: он идёт за сильнейшим.')] },
    loyalty: { start: 0, deeds: { lie: -5 } },
    leave: { line: 'Честь не терпит компромиссов. Прощай.' },
    barks: B('Начнём.', 'Достойный бой.', 'Не позорься — вставай!'),
  },
  'madam-stavka': {
    gender: 'f', home: 'lagoon-bar', quest: 'cq-stavka', altPath: 'manipulator',
    recruit: { pitch: 'Ставлю на тебя. Ставка — моя шкура; выигрыш — всё остальное.',
      conditions: [pay(300, 'Входной взнос: 300 кредитов. Она играет только на деньги.'), notWith('sekiro', true, 'Рядом с ним она играть не станет.')],
      alt: [chk(['deception', 'persuasion'], 15, 'Обыграй её в блеф на её же столе.')] },
    loyalty: { start: 0, deeds: { greed: 3, honor: -3 } },
    leave: { line: 'Счёт закрыт. Банк уходит со стола.' },
    barks: B('Ставки сделаны.', 'Выигрыш — мне. Вам — опыт.', 'Не умирай, ты мне должен!'),
  },
  'zoya-klyk': {
    gender: 'f', home: 'flat-lagoon', quest: 'cq-zoya', altPath: 'beast',
    recruit: { pitch: 'Зубы мои — моё слово. Покажи, что ты не из тех, кто охотится на таких, как я.',
      conditions: [rep('mutantsBeast', 'neutral', 'Она не идёт с врагом Мутантов-Ж.'), notWith('zarya', true, 'Бывшая Чистильщица — это уже слишком: она не сядет рядом.')],
      alt: [chk(['intimidation', 'survival'], 14, 'Покажи силу и чутьё: она слушает только равных.')] },
    loyalty: { start: 0, deeds: { 'anti-mutant': -10 } },
    leave: { line: 'Стая зовёт. Не провожай.' },
    barks: B('Нюх подсказывает: будет драка.', 'Зубы сыты. Пока.', 'Раненый пахнет страхом. Держись!'),
  },
  'aunt-loza': {
    gender: 'f', home: 'green-border', quest: 'cq-loza', altPath: 'spirits',
    recruit: { pitch: 'Корни не любят чужих. Но если ты пришёл с миром...',
      conditions: [rep('mutantsPlant', 'neutral', 'Зелёная граница не отпускает знахарку к врагам.'), intro('Помоги ей с больной рощей — тогда поговорим.')] },
    loyalty: { start: 0, deeds: { 'anti-mutant': -10 } },
    leave: { line: 'Рощу нельзя оставлять. Простите.' },
    barks: B('Потерпите, милые, я рядом.', 'Все живы? Слава корням.', 'Дыши! Дыши, мой хороший!'),
  },
  'diss': {
    gender: 'x', home: 'lagoon-bar', quest: 'cq-diss', altPath: 'inspirer',
    recruit: { pitch: 'Я сбежал от кринжа, а теперь им зарабатываю. Давай заключим сделку.',
      conditions: [chk(['persuasion', 'meditation'], 13, 'Убеди кринжгона, что ты не станешь его «вождём».'), notWith('sister-pomekha', false, 'Аколитка пугает его: трение.')],
      alt: [pay(180, 'Или оплатить его выступление в Баре: 180 кредитов.')] },
    loyalty: { start: 0, deeds: { cruelty: -5 } },
    leave: { line: 'Мне нужна сцена. Простите — я без аплодисментов.' },
    barks: B('Бит пошёл.', 'Аплодисменты — потом!', 'Не умирай на моей сцене!'),
  },
  'rzhaven': {
    gender: 'm', home: 'proxy-wastes', quest: 'cq-rzhaven', altPath: 'healing',
    recruit: { pitch: 'Старый бог слушает. Я хочу, чтобы он услышал вас.',
      conditions: [rep('tekhonki', 'neutral', 'Он не уйдёт с врагом Техоньков.'), chk(['proxy', 'religion', 'meditation'], 14, 'Он проверит твоё «чувство прокси».')],
      alt: [flag('proxy-blessed', 'Или пройди обряд благословения у шаманов.')] },
    loyalty: { start: 0, deeds: { 'tech-faith': 5 } },
    leave: { line: 'Мне пора слушать бога без вас.' },
    barks: B('Старый бог, не подведи.', 'Прокси стихли. Хорошо.', 'Держись, я иду!'),
  },
  'tik': {
    gender: 'x', home: 'king-dumps', quest: 'cq-tik', altPath: 'inventor',
    recruit: { pitch: 'У меня появилось «я». Пока никому не говорил — оно новое.',
      conditions: [intro('Сначала покажи, что умеешь хранить тайну.'), notWith('kosochka', false, 'Косточка слишком шумная: трение.')] },
    loyalty: { start: 0, deeds: { 'serve-ai': -5 } },
    leave: { line: 'Коллектив зовёт. Я не знаю, почему мне грустно.' },
    barks: B('Я — отдельная единица. И готов.', 'Задача выполнена. Я рад? Да, рад.', 'Союзник, стой!'),
  },
  'shepherd-timokha': {
    gender: 'm', home: 'neutral-villages', quest: 'cq-timokha', altPath: 'hunter',
    recruit: { pitch: 'Стадо — не моё. Но совесть — моя.',
      conditions: [rep('neutralVillages', 'neutral', 'Село не отпустит пастуха с врагом общины.'), intro('Помоги найти пропавшее стадо.')] },
    loyalty: { start: 5, deeds: { greed: -3 } },
    leave: { line: 'Овцы не ждут. Я домой.' },
    barks: B('Не пугайте скотину.', 'Слава небу, обошлось.', 'Мужик не должен падать!'),
  },
  'yarosh': {
    gender: 'm', home: 'khatab-city', quest: 'cq-yarosh', altPath: 'hunter',
    recruit: { pitch: 'Я знаю каждую мину до Хатаб-Сити. И где не стоит проходить.',
      conditions: [rep('renegades', 'friendly', 'Отступники доверяют только друзьям.'), chk(['stealth', 'perception'], 14, 'Пройди его минное поле: он проверит сам.')],
      alt: [pay(250, 'Или заплати проводнику: 250 кредитов.')] },
    loyalty: { start: 0, deeds: { 'serve-ai': -5 } },
    leave: { line: 'Я ухожу к своим. Минное поле знает путь.' },
    barks: B('Тише. Тут я знаю каждый шаг.', 'Прошли. Спасибо.', 'Стой на месте, не двигайся!'),
  },
  'zarya': {
    gender: 'f', home: 'agrozone', quest: 'cq-zarya', altPath: 'avenger',
    recruit: { pitch: 'Я была Чистильщицей. Хочу искупить. Но не перед каждым.',
      conditions: [notWith('zoya-klyk', true, 'Зоя и Заря — смертельные враги: пока Зоя в партии, Заря не пойдёт.'), align('good', 'Она идёт только к тому, кто не станет повторением её прошлого.')],
      alt: [quest('cq-zarya', 'Или завершить её личный квест — тогда она сама попросится.', 'done')] },
    loyalty: { start: 0, deeds: { cruelty: -8, 'kill-surrendered': -8 } },
    leave: { line: 'Я не могу быть тем, кем была. И не могу быть рядом с теми, кто такой стал.' },
    barks: B('Щит поднят. Никого не отдам.', 'Живы. Это главное.', 'Назад! Я прикрою!'),
  },
  'sister-pomekha': {
    gender: 'f', home: 'lagoon-bar', quest: 'cq-pomekha', altPath: 'cyber-demon',
    recruit: { pitch: 'Судья слышит меня до сих пор. Я хочу, чтобы кто-то слышал рядом.',
      conditions: [rep('cult', 'suspicious', 'Культ ещё не отпустил её — но слишком высокий статус у культа ей тоже опасен.'), notWith('lox', false, 'Lox увидит в ней врага: трение.')],
      alt: [chk(['judge', 'persuasion'], 15, 'Убеди её: уход от Судьи — не конец.')] },
    loyalty: { start: 0, deeds: { 'cult-deal': -10 } },
    leave: { line: 'Тишина лучше, чем шёпот. Я возвращаюсь к тишине.' },
    barks: B('Он шепчет. Я не слушаю.', 'Тишина. Благодарю.', 'Не уходи в темноту!'),
  },

  // ---------------------------------------------------------------- новые 5 напарниц
  'sedmaya': {
    gender: 'f', home: 'warprom', quest: 'cq-sedmaya', altPath: 'survivor',
    recruit: { pitch: 'Выбыла. Это слово меня освободило. Или нет — проверим вместе.',
      conditions: [intro('Сначала найди с ней, кто подписал её списание.'), rep('warprom', 'suspicious', 'Военпром не должен считать вас врагом: она — его бывшее имущество.')],
      alt: [chk(['analysis', 'military'], 15, 'Докажи, что понимаешь её серию: ответь на три тактические загадки.')] },
    loyalty: { start: 0, deeds: { 'serve-ai': -5, mercy: 3 } },
    leave: { line: 'Серия закрыта. Но не я.' },
    barks: B('Дистанция. Ветер. Цель.', 'Попадание. Отчёт не нужен.', 'Прикрываю. Двигайся к укрытию.'),
  },
  'bulatka': {
    gender: 'f', home: 'tin-arena', quest: 'cq-bulatka', altPath: 'mech-killer',
    recruit: { pitch: 'Мой молот помнит каждый твой шаг. Если споткнёшься, он скажет!',
      conditions: [rep('tinBrotherhood', 'friendly', 'Арена даёт руку только друзьям Братства.'), quest('ch3-tin-oath', 'Сперва пройди Испытание Додзе.', 'done')],
      alt: [chk(['athletics', 'persuasion'], 15, 'Выиграй её поединок или убеди словом.')] },
    loyalty: { start: 0, deeds: { lie: -6, 'kill-surrendered': -6, honor: 4 } },
    leave: { line: 'Слово — железо. Ты своё сломал. Прощай.' },
    barks: B('Молот — вперёд!', 'Хороший день для железа!', 'Эй, поднимайся! Я не тащу трупов!'),
  },
  'kosochka': {
    gender: 'f', home: 'king-dumps', quest: 'cq-kosochka', altPath: 'mechanic',
    recruit: { pitch: 'Если не сдашь мусорщикам — я твоя. Если сдашь — хотя бы ударь первым.',
      conditions: [intro('Сначала помоги ей сбить охотников со следа.'), notWith('tik', false, 'Тик слишком тих: трение.')],
      alt: [chk(['deception', 'stealth'], 14, 'Сыграй мусорщика и «купи» её у конвоя.')] },
    loyalty: { start: 5, deeds: { 'kill-surrendered': -4, 'help-weak': 4, 'free-slaves': 3 } },
    leave: { line: 'Если не вернусь — разбери меня на что-нибудь доброе.' },
    barks: B('Подождите, я его сейчас чуть-чуть сломаю!', 'Что-то слишком хорошо. Подозрительно.', 'Ты цел? Хоть что-то отвалилось?'),
  },
  'laska': {
    gender: 'f', home: 'raytsentr', quest: 'cq-laska', altPath: 'beast',
    recruit: { pitch: 'Долг — как блоха: чем дольше носишь, тем больше кусает.',
      conditions: [pay(400, 'Выкупить её долг у Буревестника: 400 кредитов.')],
      alt: [chk(['deception', 'persuasion'], 15, 'Или обыграй её в карты — она платит словом.')] },
    loyalty: { start: 0, deeds: { greed: 4, lie: 2, 'free-slaves': 3 } },
    leave: { line: 'Тесно мне у вас. Прощай, жалко.' },
    barks: B('Ставлю на нас!', 'Мяу. Ещё раз?', 'Лапы убрали! Это мой — я его чиню!'),
  },
  'provoloka': {
    gender: 'f', home: 'zavod', quest: 'cq-provoloka', altPath: 'spirits',
    recruit: { pitch: 'Вопросы — это молитвы. Просто громкие.',
      conditions: [rep('tekhonki', 'neutral', 'Старейшины Завода закроют двери перед врагом Техоньков.'), chk(['proxy', 'tech', 'religion'], 14, 'Ответь на её вопрос о прокси так, чтобы она не обиделась.')],
      alt: [flag('proxy-blessed', 'Или пройди обряд, на котором она сама была.')] },
    loyalty: { start: 0, deeds: { 'tech-faith': 4, 'anti-mutant': -4, mercy: 2 } },
    leave: { line: 'Бог молчит. Я пойду спрошу громче.' },
    barks: B('Антенна на приём!', 'Прокси отпустило. Кажется.', 'Дыши ровно! Я не знаю, как работает вторая часть, но ты дыши!'),
  },
};

// ============================================================== ЛИЧНЫЕ КВЕСТЫ (2–3 стадии)
const S = (id, text, goal, loyaltyMin) => ({ id, text, goal, ...(loyaltyMin != null ? { loyaltyMin } : {}) });
const R = (xp, items = []) => ({ xp, items, loyalty: 15, flags: [], unlockAltPath: true });

export const PERSONAL_QUESTS = {
  'cq-lox': { id: 'cq-lox', name: 'Метка за спиной', npc: 'lox', stages: [
    S('meet', 'Lox ищет следующую метку: нужно осмотреть место, где видели клона.', { kind: 'reach', location: 'lox-2' }),
    S('hunt', 'Выследить клона и вынудить на бой.', { kind: 'battle', encounter: 'enc-lox-clone', location: 'lox-2' }, 10),
    S('choice', 'Что делать с пойманным клоном?', { kind: 'choice', options: [
      { id: 'spare', text: 'Пощадить: он не виноват, что копия.', effects: { deeds: ['mercy'] }, next: null },
      { id: 'kill', text: 'Добить: «они не должны существовать».', effects: { deeds: ['kill-surrendered'] }, next: null } ] }, 30) ], rewards: R(400) },
  'cq-andrey': { id: 'cq-andrey', name: 'Мастерская в долг', npc: 'andrey', stages: [
    S('meet', 'Андрею нужны запчасти из Бара: поговорить с барменом.', { kind: 'reach', location: 'lagoon-bar' }),
    S('parts', 'Найти редкие детали: разобрать ящики или взломать склад.', { kind: 'check', skills: ['tech', 'lockpicking'], dc: 13 }, 10) ], rewards: R(250, [{ item: 'rare-parts', n: 2 }]) },
  'cq-dymka': { id: 'cq-dymka', name: 'Тень охотников', npc: 'dymka', stages: [
    S('meet', 'Дымка прячется от мусорщиков: отвести их со следа.', { kind: 'check', skills: ['stealth', 'deception'], dc: 14 }),
    S('hunters', 'Охотники нашли её укрытие: встретить их в проулке.', { kind: 'battle', encounter: 'v3-scv-skeleton-hunt', location: 'corruption-city' }, 15) ], rewards: R(350) },
  'cq-telifon': { id: 'cq-telifon', name: 'Старый абонент', npc: 'telifon', stages: [
    S('meet', 'Телифон слышит старый сигнал — проследить источник.', { kind: 'check', skills: ['hacking', 'analysis'], dc: 14 }),
    S('call', 'Ответить абоненту: в сети живой голос.', { kind: 'reach', location: 'cc-node' }, 20) ], rewards: R(300) },
  'cq-nedolyot': { id: 'cq-nedolyot', name: 'Дезертир поневоле', npc: 'private-nedolyot', stages: [
    S('meet', 'Вывести Пашку с поста незамеченным.', { kind: 'check', skills: ['stealth', 'persuasion'], dc: 13 }),
    S('patrol', 'Патруль заметил: встретить в коридоре.', { kind: 'battle', encounter: 'v3-wp-patrol', location: 'warprom-corridor' }, 10) ], rewards: R(250) },
  'cq-sekiro': { id: 'cq-sekiro', name: 'Долг молота', npc: 'sekiro', stages: [
    S('meet', 'Секиро вызывает героя на учебный поединок.', { kind: 'battle', encounter: 'v3-tin-arena', location: 'tin-arena' }),
    S('oath', 'Принести клятву: честная проверка стойкости.', { kind: 'check', skills: ['endurance', 'meditation'], dc: 14 }, 20) ], rewards: R(350) },
  'cq-stavka': { id: 'cq-stavka', name: 'Большая ставка', npc: 'madam-stavka', stages: [
    S('meet', 'Сыграть с Мадам: блеф за её столом.', { kind: 'check', skills: ['deception', 'persuasion'], dc: 14 }),
    S('debt', 'Закрыть долг должника: уговорить или запугать.', { kind: 'check', skills: ['intimidation', 'persuasion'], dc: 14 }, 10) ], rewards: R(300) },
  'cq-zoya': { id: 'cq-zoya', name: 'Стая', npc: 'zoya-klyk', stages: [
    S('meet', 'Зоя просит найти её стаю по запаху.', { kind: 'check', skills: ['survival', 'perception'], dc: 13 }),
    S('hunt', 'Встретить охотников на мутантов у логова.', { kind: 'battle', encounter: 'v3-mutz-hunt', location: 'beast-lands' }, 15) ], rewards: R(350) },
  'cq-loza': { id: 'cq-loza', name: 'Больная роща', npc: 'aunt-loza', stages: [
    S('meet', 'Осмотреть рощу: что травит корни.', { kind: 'check', skills: ['biology', 'medicine'], dc: 13 }),
    S('cure', 'Приготовить настой и зайти вглубь рощи.', { kind: 'battle', encounter: 'v3-mutr-grove', location: 'green-border' }, 10) ], rewards: R(300) },
  'cq-diss': { id: 'cq-diss', name: 'Концерт без кринжа', npc: 'diss', stages: [
    S('meet', 'Помочь Диссу с репетицией: убедить бармена.', { kind: 'check', skills: ['persuasion', 'deception'], dc: 13 }),
    S('gig', 'Концерт в Баре: удержать зал.', { kind: 'check', skills: ['persuasion', 'acrobatics', 'meditation'], dc: 14 }, 15) ], rewards: R(300) },
  'cq-rzhaven': { id: 'cq-rzhaven', name: 'Прокси над долиной', npc: 'rzhaven', stages: [
    S('meet', 'Услышать шторм: калибровка вместе с Ржавнем.', { kind: 'check', skills: ['proxy', 'meditation'], dc: 14 }),
    S('storm', 'Остановить прокси-бурю у святилища.', { kind: 'battle', encounter: 'v3-tek-storm', location: 'proxy-wastes' }, 15) ], rewards: R(350) },
  'cq-tik': { id: 'cq-tik', name: 'Моё «я»', npc: 'tik', stages: [
    S('meet', 'Тик просит спрятать его от коллектива.', { kind: 'check', skills: ['stealth', 'deception'], dc: 13 }),
    S('self', 'Встреча с коллективом: выбрать сторону.', { kind: 'choice', options: [
      { id: 'free', text: 'Заступиться: у него есть право на «я».', effects: { deeds: ['help-weak'] }, next: null },
      { id: 'return', text: 'Вернуть в коллектив: так надёжнее.', effects: { deeds: ['serve-ai'] }, next: null } ] }, 20) ], rewards: R(300) },
  'cq-timokha': { id: 'cq-timokha', name: 'Потерянное стадо', npc: 'shepherd-timokha', stages: [
    S('meet', 'Найти след стада.', { kind: 'check', skills: ['survival', 'perception'], dc: 12 }),
    S('wolves', 'Отбить стадо у волков.', { kind: 'battle', encounter: 'v3-wolf-pack', location: 'neutral-villages' }, 10) ], rewards: R(250) },
  'cq-yarosh': { id: 'cq-yarosh', name: 'Чужие мины', npc: 'yarosh', stages: [
    S('meet', 'Снять мину с подступов.', { kind: 'check', skills: ['tech', 'military'], dc: 14 }),
    S('ambush', 'Засада на минном поле.', { kind: 'battle', encounter: 'v3-ren-ambush', location: 'khatab-city' }, 15) ], rewards: R(350) },
  'cq-zarya': { id: 'cq-zarya', name: 'Искупление', npc: 'zarya', stages: [
    S('meet', 'Заря просит найти семью, которую её отряд оставил.', { kind: 'reach', location: 'agrozone' }),
    S('face', 'Встреча с семьёй: рассказать правду или промолчать.', { kind: 'choice', options: [
      { id: 'truth', text: 'Сказать правду.', effects: { deeds: ['honor'] }, next: null },
      { id: 'silence', text: 'Промолчать: ей будет легче.', effects: { deeds: ['lie'] }, next: null } ] }, 15) ], rewards: R(350) },
  'cq-pomekha': { id: 'cq-pomekha', name: 'Шёпот Судьи', npc: 'sister-pomekha', stages: [
    S('meet', 'Выдержать ночь рядом с «слышащей».', { kind: 'check', skills: ['meditation', 'judge'], dc: 14 }),
    S('whisper', 'Заглушить голос у остатков терминала.', { kind: 'battle', encounter: 'v3-cult-call', location: 'lagoon-bar' }, 20) ], rewards: R(350) },
  'cq-sedmaya': { id: 'cq-sedmaya', name: 'Списанная', npc: 'sedmaya', stages: [
    S('meet', 'Найти копию приказа о списании в архиве Военпрома.', { kind: 'check', skills: ['analysis', 'hacking', 'stealth'], dc: 14 }),
    S('trace', 'Выследить подписавшего: допросить или подслушать.', { kind: 'check', skills: ['intimidation', 'perception'], dc: 14 }, 10),
    S('verdict', 'Он найден. Что с ним делать?', { kind: 'choice', options: [
      { id: 'spare', text: 'Оставить в живых: пусть отвечает по закону.', effects: { deeds: ['mercy'] }, next: null },
      { id: 'kill', text: 'Убить: «приказ был не бумагой».', effects: { deeds: ['cruelty'] }, next: null } ] }, 30) ], rewards: R(450) },
  'cq-bulatka': { id: 'cq-bulatka', name: 'Молот отца', npc: 'bulatka', stages: [
    S('meet', 'Забрать отцовский молот у скупщика.', { kind: 'check', skills: ['persuasion', 'intimidation'], dc: 14 }),
    S('forge', 'Перековать молот: помочь с кузней.', { kind: 'check', skills: ['tech', 'athletics'], dc: 13 }, 10),
    S('oath', 'Бой чести на Арене.', { kind: 'battle', encounter: 'v3-tin-arena', location: 'tin-arena' }, 25) ], rewards: R(450) },
  'cq-kosochka': { id: 'cq-kosochka', name: 'Цена за череп', npc: 'kosochka', stages: [
    S('meet', 'Сбить охотников со следа на Свалках.', { kind: 'check', skills: ['stealth', 'survival', 'deception'], dc: 14 }),
    S('hunt', 'Охотники вышли на след: встретить.', { kind: 'battle', encounter: 'v3-scv-skeleton-hunt', location: 'king-dumps' }, 10),
    S('bounty', 'Снять награду: договориться с Королём или уничтожить списки.', { kind: 'choice', options: [
      { id: 'talk', text: 'Договориться с Королём свалок.', effects: { deeds: ['greed'] }, next: null },
      { id: 'burn', text: 'Сжечь списки охотников.', effects: { deeds: ['free-slaves'] }, next: null } ] }, 30) ], rewards: R(450) },
  'cq-laska': { id: 'cq-laska', name: 'Долг Буревестнику', npc: 'laska', stages: [
    S('meet', 'Сыграть с её кредитором: выиграть время.', { kind: 'check', skills: ['deception', 'persuasion'], dc: 14 }),
    S('raid', 'Рейд пиратов: доказать ценность в бою.', { kind: 'battle', encounter: 'v3-pir-raid', location: 'raytsentr' }, 10),
    S('pay', 'Выплатить остаток долга.', { kind: 'pay', credits: 250 }, 25) ], rewards: R(450) },
  'cq-provoloka': { id: 'cq-provoloka', name: 'Вопрос к Старому богу', npc: 'provoloka', stages: [
    S('meet', 'Пройти с ней мимо стражи Завода.', { kind: 'check', skills: ['persuasion', 'stealth', 'proxy'], dc: 13 }),
    S('ask', 'Задать вопрос в святилище.', { kind: 'check', skills: ['proxy', 'meditation', 'religion'], dc: 15 }, 10),
    S('storm', 'Ответ — прокси-буря. Выдержать.', { kind: 'battle', encounter: 'v3-tek-storm', location: 'zavod' }, 25) ], rewards: R(450) },
};

// ============================================================== РЕПЛИКИ-РЕАКЦИИ (общий пул, {name} — имя напарника)
// Ситуации (17): battleStart, critHit, lowHp, allyDown, victory, levelUp, rareLoot, campRest, newRegion, likeDeed,
// dislikeDeed, checkSuccess, checkFail, enemyOfFaction, lowMrl, questStageDone + кастомные тегам поступков.
export const BARKS_GENERIC = {
  battleStart: ['Началось.', 'Готов(а).', 'Вижу цели.'],
  critHit: ['Вот это попадание!', 'Прямо в точку!', 'Есть!'],
  lowHp: ['Я долго не продержусь!', 'Плохо дело!', 'Мне бы передышку!'],
  allyDown: ['Он упал!', 'Держись, сейчас помогу!', 'Нет-нет-нет...'],
  victory: ['Чисто.', 'Победа.', 'Отбились.'],
  levelUp: ['Чувствую силу.', 'Кажется, я стал(а) лучше.', 'Это приятное чувство.'],
  rareLoot: ['Ого, редкость!', 'Это пригодится.', 'Такое не бросают.'],
  campRest: ['Хорошее место.', 'Ну, спокойной ночи, команда.', 'Завтра будет легче. Наверное.'],
  newRegion: ['Здесь пахнет по-другому.', 'Далеко мы зашли.', 'Новое место — новые враги.'],
  likeDeed: ['Вот это по мне.', 'Правильно поступил.', 'Уважаю.'],
  dislikeDeed: ['Не нравится мне это.', 'Мы договаривались иначе.', 'Ещё раз — и я задумаюсь.'],
  checkSuccess: ['Повезло.', 'Отлично сработано.', 'Умеешь.'],
  checkFail: ['Бывает.', 'Не вышло.', 'Могло быть хуже.'],
  enemyOfFaction: ['Эти люди мне знакомы.', 'Вот и они.', 'Я предупреждала.'],
  lowMrl: ['Голова трещит...', 'Не могу сосредоточиться.', 'Мне нужна тишина.'],
  questStageDone: ['Один шаг сделан.', 'Идём дальше.', 'Это было важно.'],
};

// Все id личных квестов (для проверки): Object.keys(PERSONAL_QUESTS)
export const COMPANION_IDS = Object.keys(COMPANIONS);
