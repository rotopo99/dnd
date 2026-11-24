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
      lines: [{ w: 'narr', t: 'Темно. Одна нота ещё звучит. Потом — нет.', p: 1 }],
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
      end: { result: 'c12-done' },
    },
    // ---------------- C «Новый администратор»: три голоса, один штамп
    'c-oldgod': {
      shot: 'high:judge>crane:5', fx: [{ k: 'music', id: 'cult', fade: 3 }],
      lines: [{ w: 'narr', t: 'Голос Диспетчера, ровный: «Баланс. Принято». Лишнее выключается на пятьдесят километров.' }],
      next: 'c-stamp',
    },
    'c-order': {
      shot: 'wide>push:5', fx: [{ k: 'music', id: 'tension', fade: 3 }],
      lines: [{ w: 'narr', t: 'На всех экранах — указ номер один: «Всё хорошо». Судья — модуль карантина. Он тоже подписал.' }],
      next: 'c-stamp',
    },
    'c-scrap': {
      shot: 'low:judge>push:4', set: { judge: { emo: 'cringe' } }, fx: [{ k: 'music', id: 'world', fade: 3 }],
      lines: [{ w: 'narr', t: 'Король свалок ставит Судью на весы: «Принято по весу. Тара — отдельно».' }],
      next: 'c-stamp',
    },
    'c-stamp': {
      shot: 'xclose:judge', fx: [{ k: 'shake', amp: 0.1 }, { k: 'sfx', id: 'victory' }],
      lines: [{ w: 'narr', t: 'Звук штампа. Один и тот же — для всех трёх.', p: 0.6 }],
      end: { result: 'c12-done' },
    },
    // ---------------- D «Сосуд» (герой или Lox-9)
    d: {
      shot: 'close:hero>push:5', set: { hero: { anim: 'reach' } }, fx: [{ k: 'grade', id: 'white-flash', d: 0.8 }, { k: 'music', id: 'cult', fade: 3 }],
      lines: [
        { w: 'judge', t: 'Постановили: принять. Подпись не смазана.', emo: 'smug' },
        { w: 'narr', t: 'Свет ровный. Ничего не жмёт.', p: 0.6 },
      ],
      next: 'd-end',
    },
    'd-lox9': {
      shot: 'close:lox>push:5', set: { lox: { anim: 'reach', emo: 'sad' } }, fx: [{ k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'lox', t: 'Я не он. Но он был прав.', emo: 'sad' },
        { w: 'narr', t: 'Lox-9 подписывает. Свет ровный. Судья уходит в тишину.', p: 0.6 },
      ],
      next: 'd-end',
    },
    'd-end': {
      shot: 'wide>pull:6', fx: [{ k: 'fade', to: 'black', d: 2 }],
      lines: [{ w: 'narr', t: 'В окне Райцентра — чьё-то лицо. Кто-то отворачивается.', p: 1 }],
      end: { result: 'c12-done' },
    },
  },
};
