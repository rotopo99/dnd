// C12 «Приговор» — финал (content-wave4.md §3). Сразу после выбора в mq3-court/verdict, до эпилога (consequences.js markFinale
// ставит сцену в очередь точки final:mq3-court). Общий вход: Дверь, лица свидетелей из досье (только чьи флаги стоят, ≤ 5),
// Судья читает приговор по формуле «Слушали… постановили…». Дальше — ветка по fin-*. Сцена не возвращает в бой;
// результат — c12-done (флаги fin-* уже стоят). QTE только в ветке A: «Удержать створку», провал → door-halfsealed. ~3 мин.
export const C12_VERDICT = {
  id: 'c12-verdict', title: 'Приговор', mins: 3, music: 'cyberspace', stage: 'court-cyber',
  trigger: { at: 'mq3-verdict', needFlag: 'game-complete', once: true },
  cast: {
    hero: { k: 'hero' },
    judge: { name: 'Судья', model: 'judge-avatar', portrait: 'judge', voice: { gender: 'm', race: 'android', pitch: 80 } },
    lox: { name: 'Lox', model: 'hero_m_field', hair: 'short', portrait: 'lox', voice: { gender: 'm', race: 'human', pitch: 105 } },
    shumok: { name: 'Шумок (эфир)', model: 'hero_m_field', hair: 'short', portrait: 'shumok', look: 'spirit', voice: { gender: 'm', race: 'human', pitch: 130 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>crane:7', fx: [{ k: 'fade', from: 'white', d: 1.5 }],
      set: { judge: { at: [0, -5], anim: 'idle' }, hero: { at: [0, 3], face: 'judge', anim: 'idle' }, lox: { at: [-2, 2.5], face: 'judge', anim: 'idle' }, shumok: { at: [4, -3], face: 'hero', anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Дверь в Киберспейс. Свет ровный, как в приёмной. Очередь за ней не кончается.' },
        { w: 'judge', t: 'Слушали дело номер сто двенадцать. Приобщены материалы защиты.', p: 0.6 },
      ],
      next: 'w-victor',
    },
    // свидетели досье: по кадру на флаг (≤ 5)
    'w-victor': { branch: [{ if: { flag: 'victor-soul-freed' }, next: 'wv' }, { next: 'w-kuksius' }] },
    wv: { shot: 'close:hero', lines: [{ w: 'narr', t: 'Виктор. Душа, которая ушла сама. Без очереди.' }], next: 'w-kuksius' },
    'w-kuksius': { branch: [{ if: { any: ['kuksius-helped', 'consent-known'] }, next: 'wk' }, { next: 'w-log' }] },
    wk: { shot: 'med:hero', lines: [{ w: 'narr', t: 'Куксиус, номер ноль. Дочитанный бланк, пункт сорок.' }], next: 'w-log' },
    'w-log': { branch: [{ if: { any: ['truth-harmony-public', 'truth-harmony-marta'] }, next: 'wl' }, { next: 'w-ladov' }] },
    wl: { shot: 'med:lox', lines: [{ w: 'narr', t: 'Лог Lox-5 и Хора-4. Кто нажал кнопку над Гармонией — записано.' }], next: 'w-ladov' },
    'w-ladov': { branch: [{ if: { flag: 'ladov-named' }, next: 'wd' }, { next: 'w-disp' }] },
    wd: { shot: 'close:hero', lines: [{ w: 'narr', t: 'Ладов, названный по имени. Коллекция душ свидетельствует строем.' }], next: 'w-disp' },
    'w-disp': { branch: [{ if: { flag: 'disp-live' }, next: 'wp' }, { next: 'sentence' }] },
    wp: { shot: 'med:hero', lines: [{ w: 'narr', t: 'Диспетчер Старого бога: «Приношу извинения». Впервые — по делу.' }], next: 'sentence' },
    sentence: {
      shot: 'low:judge>push:6', set: { judge: { anim: 'talk' } },
      lines: [{ w: 'judge', t: 'Постановили...', p: 0.6 }],
      next: 'fork',
    },
    fork: { branch: [
      { if: { flag: 'fin-reflash' }, next: 'b' },
      { if: { flag: 'fin-admin-oldgod' }, next: 'c-oldgod' },
      { if: { flag: 'fin-admin-order' }, next: 'c-order' },
      { if: { flag: 'fin-admin-scrap' }, next: 'c-scrap' },
      { if: { flag: 'fin-lox9' }, next: 'd-lox9' },
      { if: { flag: 'fin-vessel' }, next: 'd' },
      { next: 'a' },
    ] },
    // ---------------- A «Дело закрыто»
    a: {
      shot: 'close:judge', fx: [{ k: 'shake', amp: 0.15 }],
      lines: [
        { w: 'judge', t: 'Постановили: дело...', emo: 'neutral' },
        { w: 'narr', t: 'Печать опускается поверх его голоса: «ОБЖАЛОВАНИЮ НЕ ПОДЛЕЖИТ». Створка идёт вниз.', p: 0.4 },
      ],
      next: 'a-lox',
    },
    'a-lox': { branch: [{ if: { flag: 'fin-lox-leave' }, next: 'a-lox-hold' }, { next: 'a-hold' }] },
    'a-lox-hold': {
      shot: 'two:lox:hero', set: { lox: { anim: 'reach' } },
      lines: [{ w: 'lox', t: 'Держу. Иди. Я потом. Море подождёт.', emo: 'smug' }],
      next: 'a-hold',
    },
    'a-hold': {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [{ w: 'narr', t: 'Створка тяжелеет. Её нужно удержать до шва.' }],
      qte: { kind: 'seq', keys: ['A', 'S', 'D'], sec: 3, label: 'Удержать створку',
        ok: { next: 'a-end' }, fail: { next: 'a-crooked', on: { flag: { 'door-halfsealed': true } } } },
    },
    'a-crooked': {
      shot: 'med:hero', fx: [{ k: 'grade', id: 'white-dim' }],
      lines: [{ w: 'narr', t: 'Створка встала криво. Шов держится, но не весь. Изнутри вежливо стучат.' }],
      next: 'a-end',
    },
    'a-end': {
      shot: 'wide>pull:5', fx: [{ k: 'fade', to: 'black', d: 2 }, { k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'narr', t: 'Последняя очередь расходится. Не потому что разрешили — потому что дверь закрыта и спорить не с кем.' },
        { w: 'narr', t: 'Темно. Одна нота ещё звучит. Потом — нет.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
    // ---------------- B «Перепрошивка»
    b: {
      shot: 'med:judge>orbit:6', set: { judge: { emo: 'surprised', anim: 'nod' } }, fx: [{ k: 'music', id: 'world', fade: 3 }],
      lines: [
        { w: 'judge', t: 'Постановили: встать в очередь. Самому.', emo: 'surprised' },
        { w: 'judge', t: 'Номер один.', p: 0.6 },
        { w: 'narr', t: 'Души идут к терминалам. По одной. Никто не толкается.', p: 0.6 },
      ],
      next: 'b-end',
    },
    'b-end': {
      shot: 'close:shumok', set: { shumok: { emo: 'happy' } },
      lines: [
        { w: 'shumok', t: 'Свободная касса — седьмая. Не толпитесь.', emo: 'happy' },
        { w: 'narr', t: 'Где-то гаснет незнакомая свеча. С улыбкой.', p: 0.8 },
      ],
      next: 'b-end2',
    },
    'b-end2': {
      shot: 'wide>crane:6', fx: [{ k: 'fade', to: 'white', d: 3 }],
      lines: [
        { w: 'judge', t: 'Касса номер семь работает. Извините за ожидание. Это... моя вина.', emo: 'sad' },
        { w: 'narr', t: 'Очередь не исчезла. Она стала короче на одного. На самого Судью.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
    // ---------------- C «Новый администратор»: три голоса, один штамп
    'c-oldgod': {
      shot: 'high:judge>crane:5', fx: [{ k: 'music', id: 'cult', fade: 3 }],
      lines: [{ w: 'narr', t: 'Голос Диспетчера, ровный: «Баланс. Принято». Лишнее выключается на пятьдесят километров.' }],
      next: 'c-stamp-oldgod',
    },
    'c-order': {
      shot: 'wide>push:5', fx: [{ k: 'music', id: 'tension', fade: 3 }],
      lines: [{ w: 'narr', t: 'На всех экранах — указ номер один: «Всё хорошо». Судья — модуль карантина. Он тоже подписал.' }],
      next: 'c-stamp-order',
    },
    'c-scrap': {
      shot: 'low:judge>push:4', set: { judge: { emo: 'cringe' } }, fx: [{ k: 'music', id: 'world', fade: 3 }],
      lines: [{ w: 'narr', t: 'Король свалок ставит Судью на весы: «Принято по весу. Тара — отдельно».' }],
      next: 'c-stamp-scrap',
    },
    // у каждого администратора свой последний кадр; общий звук штампа
    'c-stamp-oldgod': {
      shot: 'xclose:judge', fx: [{ k: 'shake', amp: 0.1 }, { k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'narr', t: 'Звук штампа. Тот же, что у Судьи, — только глубже, как из колодца.', p: 0.6 },
        { w: 'narr', t: 'Погасло пятьдесят километров огней. Остался один: красный, на Двери, и он считает до одного.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
    'c-stamp-order': {
      shot: 'xclose:judge', fx: [{ k: 'shake', amp: 0.1 }, { k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'narr', t: 'Звук штампа. На каждом экране — один и тот же улыбающийся смайл.', p: 0.6 },
        { w: 'narr', t: 'Никто не смеётся. Все кивают. Это тоже порядок.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
    'c-stamp-scrap': {
      shot: 'xclose:judge', fx: [{ k: 'shake', amp: 0.1 }, { k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'narr', t: 'Звук штампа. Вслед — звон: кто-то ссыпает весь вердикт в ящик «Разное».', p: 0.6 },
        { w: 'narr', t: 'Очередь расходится, толкая тележки. Впервые за всё время кто-то свистит.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
    // ---------------- D «Сосуд» (герой или Lox-9)
    // D «Сосуд»: герой (d) — 12 битов, Lox-9 (d-lox9) — 11; общий хвост d-wall → d-end. Герой в кадре молчит: говорят те, кто остаётся.
    d: {
      shot: 'close:hero>push:5', set: { hero: { anim: 'reach' } }, fx: [{ k: 'grade', id: 'white-flash', d: 0.8 }, { k: 'music', id: 'cult', fade: 3 }],
      lines: [
        { w: 'judge', t: 'Постановили: принять. Подпись не смазана.', emo: 'smug' },
        { w: 'narr', t: 'Свет ровный. Ничего не жмёт.', p: 0.6 },
      ],
      next: 'd-loxq',
    },
    'd-loxq': { branch: [{ if: { flag: 'lox-dead' }, next: 'd-2dead' }, { next: 'd-2' }] },
    'd-2dead': {
      shot: 'med:hero', set: { shumok: { emo: 'sad' } },
      lines: [
        { w: 'narr', t: 'Рядом никто не держит за плечо. Куртка Lox лежит у Двери. Рукав ещё хранит форму плеча.' },
        { w: 'narr', t: 'Подпись лежит поверх — как закладка в книге, которую не дочитали.', p: 0.5 },
      ],
      next: 'd-3',
    },
    'd-2': {
      shot: 'two:lox:hero', set: { lox: { face: 'hero', anim: 'reach', emo: 'sad' } },
      lines: [
        { w: 'lox', t: 'Подожди. Не так. Мы же только дошли.', emo: 'sad' },
        { w: 'narr', t: 'Рука Lox тянется к плечу — и не касается. Между ними воздух, как стекло.', p: 0.5 },
      ],
      next: 'd-3',
    },
    'd-3': {
      shot: 'close:shumok', set: { shumok: { emo: 'sad' } },
      lines: [
        { w: 'shumok', t: 'Райцентр, это Шумок. Эфир занят. Я просто... оставлю канал открытым.', emo: 'sad' },
        { w: 'narr', t: 'В эфире — шорох. Это он вытирает глаза. Радиоволнами так можно.', p: 0.5 },
      ],
      next: 'd-4',
    },
    'd-4': {
      shot: 'med:hero>orbit:6', set: { hero: { anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Тело стоит прямо. Бумага в руке — тёплая, как чья-то ладонь.' },
        { w: 'narr', t: 'Внутри — тишина. Вся очередь, весь шум, все триста отказов. Сразу стало... нестрашно.', p: 0.6 },
      ],
      next: 'd-5',
    },
    'd-5': {
      shot: 'close:judge', set: { judge: { emo: 'surprised', anim: 'nod' } },
      lines: [
        { w: 'judge', t: 'Я ждал, что вы сопротивитесь. Здесь принято.' },
        { w: 'judge', t: 'Спасибо. Ни одна подпись не стоила мне так дорого.', emo: 'sad', p: 0.6 },
      ],
      next: 'd-6',
    },
    'd-6': {
      shot: 'wide>crane:6', fx: [{ k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'narr', t: 'Души в очереди перестают шуршать. Одна за другой садятся на пол — как дети после длинной дороги.' },
        { w: 'narr', t: 'Никто не кричит. Это самое страшное и самое тихое чудо.', p: 0.6 },
      ],
      next: 'd-wall',
    },
    'd-lox9': {
      shot: 'close:lox>push:5', set: { lox: { anim: 'reach', emo: 'sad' } }, fx: [{ k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'lox', t: 'Я не он. Но он был прав.', emo: 'sad' },
        { w: 'narr', t: 'Lox-9 подписывает. Свет ровный. Судья уходит в тишину.', p: 0.6 },
      ],
      next: 'd9-2',
    },
    'd9-2': {
      shot: 'two:lox:hero', set: { lox: { face: 'hero', emo: 'sad' } },
      lines: [
        { w: 'lox', t: 'Двадцать лет я боялся, что я копия. Оказывается, копия — это когда за кого-то держат дверь.', emo: 'sad' },
        { w: 'lox', t: 'Мне понравилось. Не говори ему.', emo: 'smug', p: 0.5 },
      ],
      next: 'd9-3',
    },
    'd9-3': {
      shot: 'close:shumok', set: { shumok: { emo: 'sad' } },
      lines: [
        { w: 'shumok', t: 'Райцентр, это Шумок. Передаю в эфир имя: Lox-9. Просто имя. Записали?', emo: 'sad' },
        { w: 'narr', t: 'На каждом терминале — одна строка, без заголовка. Её никто не просил.', p: 0.5 },
      ],
      next: 'd9-4',
    },
    'd9-4': {
      shot: 'med:hero',
      lines: [
        { w: 'narr', t: 'У Двери осталась куртка. Рукав ещё держит форму плеча.' },
        { w: 'narr', t: 'Никого не греет. Но её не выбросили. Это тоже решение.', p: 0.6 },
      ],
      next: 'd-wall',
    },
    // общий хвост D: тишина после, лицо в окне
    'd-wall': {
      shot: 'low:judge>push:6', set: { judge: { anim: 'idle', emo: 'neutral' } },
      lines: [
        { w: 'judge', t: 'Постановили: дело... без дела. Закрыто — изнутри.', emo: 'sad' },
        { w: 'narr', t: 'Судья складывает бумаги. Впервые аккуратно, а не по уставу. Потом гаснет, как лампа в пустой приёмной.', p: 0.6 },
      ],
      next: 'd-end',
    },
    'd-end': {
      shot: 'wide>pull:6', fx: [{ k: 'fade', to: 'black', d: 2.5 }],
      lines: [
        { w: 'narr', t: 'В окне Райцентра — чьё-то лицо. Кто-то в кадре отворачивается.' },
        { w: 'narr', t: 'Свет ровный. Но там, где отвернулись, он чуть-чуть мигнул.', p: 1 },
      ],
      end: { result: 'c12-done' },
    },
  },
};
