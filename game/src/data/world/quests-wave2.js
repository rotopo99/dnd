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
const Q = (id, name, giver, region, level, summary, stages, rewards, extra = {}) => ({
  id, name, type: 'mixed', key: false, giver, region, level, requires: null, summary, wave2: true, stages, rewards, ...extra,
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
      st('clues', 'Собрать улики теракта. Нужно три из четырёх, и без протокола Сокральни картина неполная.', all([
        { ...check(['perception', 'analysis'], 12), location: 'funicular', doneFlag: 'ha-proof-leaflet', desc: 'Листовка у фуникулёра: дописка «а если он улыбается?»' },
        { ...check(['hacking', 'tech', 'analysis'], 14), location: 'harmony-reactor', doneFlag: 'ha-proof-reactor', desc: 'Журнал допуска реактора: пульс отсутствует, голос — хором' },
        { ...check(['persuasion', 'analysis', 'perception'], 13), location: 'lox-5', doneFlag: 'ha-proof-lox5', desc: 'Письмо Lox-5 у метки в Штабцентре' },
        { ...check(['stealth', 'religion', 'hacking'], 15), location: 'sokralnya', doneFlag: 'ha-proof-protocol', desc: 'Протокол «пробы № 1» в Сокральне' },
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
];

export const QUESTS_WAVE2_MAP = Object.fromEntries(QUESTS_WAVE2.map((q) => [q.id, q]));
