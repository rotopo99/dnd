// Контент-волна 2: пять квестов. Спека: docs/specs/content-wave2.md §2. Схема — как quests-wave1.js (шапка world/quests.js).
// Исходы (ключи QUEST_TURNIN/CONSEQUENCES) = id опций и стадий (questOutcome). Узлы — id locations.js (алиасы допустимы).
// Улики — флаги doneFlag подцелей `all`; ha-proof-lox5 ставится и сам после сцены c3 (cine-hooks CINE_AFTER, флаг truth-lox5).

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}) });
const battle = (encounter, location) => ({ kind: 'battle', encounter, location });
const choice = (options) => ({ kind: 'choice', options });
const all = (goals, min) => ({ kind: 'all', goals, ...(min ? { min } : {}) });
const opt = (id, text, goal, next, extra = {}) => ({ id, text, ...(goal ? { goal } : {}), next, ...extra });
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }) });
// trial: a «trial» quest — offered by a suspicious faction too (a way to earn its trust, world/quest-access.js; QA v42 M1)
const Q = (id, name, giver, region, level, summary, stages, rewards, extra = {}) => ({
  id, name, type: 'mixed', key: false, giver, region, level, requires: null, summary, wave2: true, trial: true, stages, rewards, ...extra,
});
// «3 из 4, и протокол обязателен»: протокол + любые две из трёх остальных
const HA = ['ha-proof-leaflet', 'ha-proof-reactor', 'ha-proof-lox5'];
const HA_TRUTH = { flags: ['ha-proof-protocol'], any: [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({ flags: [HA[a], HA[b]] })) };

export const QUESTS_WAVE2 = [
  // ================= w2-harmony-truth «Лицо на листовке» (цепочка теракта, ур. 8) =================
  Q('w2-harmony-truth', 'Лицо на листовке', 'sera', 'renegades', 8,
    'Розыскная листовка с лицом Lox висит на Гармонии третий год. Сера сверила её с журналом допуска реактора, и цифры не сходятся. Кто на самом деле взорвал узел питания?',
    [
      st('ask', 'Сера раскладывает листовку рядом с распечаткой: «Пульса в журнале нет. У Lox пульс есть. Я проверяла».', talk('sera', 'alpha-harmony'), 'clues'),
      st('clues', 'Собрать улики теракта: протокол Сокральни обязателен, к нему — любые две из трёх остальных. Без протокола Сера не поверит.', all([
        { ...check(['perception', 'analysis'], 12), location: 'funicular', doneFlag: 'ha-proof-leaflet', desc: 'Листовка у фуникулёра: дописка «а если он улыбается?»' },
        { ...check(['hacking', 'tech', 'analysis'], 14), location: 'harmony-reactor', doneFlag: 'ha-proof-reactor', desc: 'Журнал допуска реактора: пульс отсутствует, голос — хором' },
        { ...check(['persuasion', 'analysis', 'perception'], 13), location: 'lox-5', doneFlag: 'ha-proof-lox5', desc: 'Письмо Lox-5 у метки в Штабцентре' },
        { ...check(['stealth', 'religion', 'hacking'], 15), location: 'sokralnya', doneFlag: 'ha-proof-protocol', required: true, desc: 'Протокол «пробы № 1» в Сокральне' },
      ], 3), 'accuse'),
      st('accuse', 'Что делать с правдой? Улики говорят: тело было пустым, а голос — чужим.', choice([
        opt('public', 'Обнародовать: журналы — Сере, голос — Шумку в эфир. Взрывал «Хор» Кибер-Жреца.', null, 'back', { requires: HA_TRUTH, effects: { flags: ['truth-harmony-public'] } }),
        opt('marta', 'Отдать протокол Марте: у Отступников будет рычаг на Партию.', talk('marta', 'marta'), 'back', { requires: HA_TRUTH, effects: { flags: ['truth-harmony-marta'] } }),
        opt('quiet', 'Промолчать. Lox нужна легенда: под ней удобно охотиться на клонов.', null, 'back', { effects: { flags: ['truth-harmony-quiet'] } }),
        opt('clone', 'Сдать Партии «клона, проданного культу». Листовка и журнал вроде бы сходятся.', null, 'framed', { effects: { flags: ['truth-harmony-framed'] } }),
      ]), 'back'),
      st('framed', 'Партия поблагодарила за бдительность и показательно казнила «Lox». Это был не он. И не тот клон.', talk('sera', 'alpha-harmony'), 'done'),
      st('back', 'Рассказать Сере, чем всё кончилось.', talk('sera', 'alpha-harmony'), 'done'),
    ],
    { xp: 900, credits: 150, rep: { technikums: 5 } },
    { requires: { any: [{ flag: 'act1-done' }, { flag: 'met-lox' }] } }),

  // ================= w2-name «Имя без чувств» (Ладов / Предложка, T12, ур. 9) =================
  Q('w2-name', 'Имя без чувств', 'keeper-of-history', 'cringegons', 9,
    'Хранитель Истории уверен: у Великого Собирателя было имя, и Предложка его помнит — голосом, не словами. Найти три свидетельства и решить, стоит ли его называть.',
    [
      { ...st('keeper', 'Хранитель раскрывает тетрадь со сносками: «Мы помним голос. Чей — сноска утеряна».', talk('keeper-of-history', 'baza-predlozhki'), 'shelf'), effects: { flags: ['ladov-w-voice'] } },
      st('shelf', 'Стеллаж в Кринж-катакомбах: на стеклянных глазах — подписи. Прочесть три имени.', check(['perception', 'survival', 'meditation'], 15, 'file'), 'file'),
      st('file', 'Терминал катакомб: «Личное дело № 0». Найти хотя бы одно из двух — имя или приказ.', all([
        { ...check(['hacking', 'tech'], 14), location: 'dungeons-m14', doneFlag: 'ladov-w-name', desc: 'Графа «владелец» вырезана, но фамилия осталась в шапке' },
        { ...check(['analysis', 'perception'], 14), location: 'dungeons-m14', doneFlag: 'ladov-w-order', desc: 'Приказ 2004 года: «переносить без остатка»' },
      ], 1), 'choose'),
      st('choose', 'Предложка ждёт решения. Дисс просит «не трогать»: имя может вернуть стыд — ему и им.', choice([
        opt('name', 'Назвать имя при всех. Пусть Предложка скажет его хором.', null, 'back',
          { requires: { any: [{ flags: ['ladov-w-voice', 'ladov-w-name'] }, { flags: ['ladov-w-voice', 'ladov-w-order'] }, { flags: ['ladov-w-name', 'ladov-w-order'] }] }, effects: { flags: ['ladov-name-known'] } }),
        opt('offer', 'Предложить обмен: душа-замена вместо экспонатов.', null, 'back', { effects: { flags: ['ladov-offer-soul'] } }),
        opt('skip', 'Не идти. Некоторые имена лучше оставить на полке.', null, 'back', { effects: { flags: ['ladov-skip'] } }),
      ]), 'back'),
      st('back', 'Вернуться к Хранителю Истории со сноской.', talk('keeper-of-history', 'baza-predlozhki'), 'done'),
    ],
    { xp: 1000, credits: 120, rep: { cringegons: 3 } },
    { requires: { flag: 'collector-met' } }),

  // ================= w2-cold «Вежливая очередь» (бункер «Холод», ур. 7) =================
  Q('w2-cold', 'Вежливая очередь', 'repa', 'none', 7,
    'Репа ищет свой блок памяти. В Ледяном бункере при −40 души живут в телах и стоят в очереди — вежливо, без конца. Терминал знает, что подходящий блок есть.',
    [
      st('ask', 'Репа кладёт на стойку объявление: «Ищу блок. Говорят, во льду. Пойдёшь со мной — что вспомню, то твоё».', talk('repa', 'lagoon-bar'), 'door'),
      st('door', 'Дверь Ледяного бункера вмёрзла. Открыть её и не вмёрзнуть самому.', check(['tech', 'survival', 'endurance'], 14, 'polite'), 'queue'),
      st('queue', 'Очередь из шести душ. Каждая уступает место другой. Уговорить их пропустить вперёд.', check(['persuasion', 'meditation', 'religion'], 13, 'polite'), 'choice'),
      st('polite', 'Очередь «вежливо» не пускает. Вежливость у неё ледяная и с кулаками.', battle('enc-w2-polite', 'dungeons-m15'), 'choice'),
      st('choice', 'Блок № 17 подходит. В нём — Эдик Семёныч, который давно хотел «свободное место».', choice([
        opt('block', 'Взять блок № 17: Эдик переезжает в пустоту Репы, Репа — в его голос.', null, 'back', { effects: { flags: ['repa-block-found'] } }),
        opt('thaw', 'Разморозить всех. Бункер погибнет, шесть душ выйдут наружу.', check(['tech', 'hacking'], 17), 'back', { effects: { flags: ['cold-thawed'], mrl: -5 } }),
        opt('leave', 'Уйти. Очередь вежливо закроет за вами дверь.', null, 'back', { effects: { flags: ['cold-left'] } }),
      ]), 'back'),
      st('back', 'Вернуться к Репе в Бар Лагуны.', talk('repa', 'lagoon-bar'), 'done'),
    ],
    { xp: 700, credits: 90, rep: { technikums: 2 } }),

  // ================= w2-customs «Досмотр» (бункер §8.1 №10, ур. 6) =================
  Q('w2-customs', 'Досмотр', 'w2-inspector', 'pirates', 6,
    'На руинах таможни скелет-инспектор держит печать над бланком с 2008 года. Без печати груз не груз — и караваны стоят.',
    [
      st('ask', 'Инспектор листает регламент: «Нет в списке разрешённых: кринж. Предъявите».', talk('w2-inspector', 'ruins-m35'), 'decide'),
      st('decide', 'Что делать с печатью?', choice([
        opt('stamp', 'Поставить печать по регламенту. Партия любит регламент.', null, 'back', { effects: { flags: ['customs-stamp'] } }),
        opt('fake', 'Подделать печать: пираты заплатят, инспектор не заметит.', check(['tech', 'deception'], 15, 'caught'), 'back', { effects: { flags: ['customs-fake'] } }),
        opt('closed', 'Не пускать никого. Инспектор остаётся при деле.', null, 'back', { effects: { flags: ['customs-closed'] } }),
      ]), 'back'),
      st('caught', 'Подделку заметили: печать смазана, а инспектор — нет. Штраф по тарифу 2008 года.', { kind: 'pay', credits: 60 }, 'back'),
      st('back', 'Доложить Инспектору итог досмотра.', talk('w2-inspector', 'ruins-m35'), 'done'),
    ],
    { xp: 450, credits: 80, rep: { pirates: 1 } }),

  // ================= w2-laugh «Смех по расписанию» (бункер «Норма счастья», ур. 7) =================
  Q('w2-laugh', 'Смех по расписанию', 'w2-sentry', 'warprom', 7,
    'В коридорах под Кремлём динамик смеётся ровно в 9 и в 18. Рядом стул, придвинутый к нему. Живой часовой слушает и плачет. Правильного ответа нет.',
    [
      st('ask', 'Часовой показывает на стул: «Сюда садились, чтобы смеяться вместе. Теперь сажусь я, чтобы не смеяться одному».', talk('w2-sentry', 'dungeons-m12'), 'choose'),
      st('choose', 'Что делать с динамиком?', choice([
        opt('off', 'Выключить. Тишина тоже норма.', check(['tech', 'hacking'], 14), 'back', { effects: { flags: ['laugh-off'], mrl: -3 } }),
        opt('kept', 'Сохранить и охранять расписание.', null, 'back', { effects: { flags: ['laugh-kept'] } }),
        opt('replaced', 'Записать свой смех вместо старого.', check(['persuasion', 'deception', 'meditation'], 16), 'back', { effects: { flags: ['laugh-replaced'] } }),
      ]), 'back'),
      st('back', 'Сказать часовому, что теперь будет в 9 и в 18.', talk('w2-sentry', 'dungeons-m12'), 'done'),
    ],
    { xp: 650, credits: 70, rep: { warprom: 2 } }),
];

export const QUESTS_WAVE2_MAP = Object.fromEntries(QUESTS_WAVE2.map((q) => [q.id, q]));

// Камео-NPC, которых волна 2 ставит на узлы (формат W3_NPC_RULES, world/data.js npcPlacement).
// Репа (cameo, npcs.js) иначе нигде не стоит: квест w2-cold нельзя ни взять, ни сдать (QA v40 B1).
export const W2_NPC_RULES = [
  { npc: 'repa', at: 'lagoon-bar', when: {} },
];
