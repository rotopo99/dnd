// C7 «Запись № 1» — улика w2-harmony-truth у реактора (content-wave2.md §3, BIBLE §4.4, T13): журнал допуска
// показывает Lox-5 и «Хор-4» Кибер-Жреца; тело пустое, голосов три, один тише. QTE tap «Блокировка» решает,
// увидит ли герой, как клон «просыпается» (lox5-woke-seen) или запись оборвётся (lox5-partial). ~1.5 мин.
export const C7_HA_REEL = {
  id: 'c7-ha-reel', title: 'Запись № 1', mins: 1.5, music: 'cyberspace', stage: 'reactor-log',
  trigger: { needFlag: 'ha-proof-reactor', at: 'harmony-reactor', once: true },
  cast: {
    hero: { k: 'hero' },
    lox5: { name: 'Lox-5', model: 'hero_m_uniform', hair: 'short', portrait: 'lox', look: 'spirit', voice: { gender: 'm', race: 'human', pitch: 105 } },
    chor: { name: 'Хор-4', model: null, portrait: 'cultist', voice: { gender: 'm', race: 'human', pitch: 90, choir: 3 } },
    sera: { name: 'Сера (на связи)', model: null, portrait: 'sera', voice: { gender: 'f', race: 'human', pitch: 220 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>push:6', fx: [{ k: 'fade', from: 'black', d: 1.2 }, { k: 'glitch', d: 0.3 }],
      set: { hero: { at: [0, 2], face: [0, -3], anim: 'idle' }, lox5: { at: [0, -2.5], face: [0, 3], anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Реактор Гармонии. Журнал допуска мигает: «Найдена запись. Воспроизвести? Да / Да».' },
        { w: 'sera', t: 'Я вижу твой терминал. Не трогай красное.', p: 0.6 },
        { w: 'sera', t: 'Там всё красное? Тогда не трогай ничего. Кроме «Да».', p: 0.5, emo: 'cringe' },
      ],
      hold: 0.8,
      next: 'play',
    },
    play: {
      shot: 'med:lox5>push:5', fx: [{ k: 'grade', id: 'mono-blue' }, { k: 'sfx', id: 'summon' }],
      set: { lox5: { emo: 'neutral' } },
      lines: [
        { w: 'narr', t: 'Запись. Коридор реактора, 03:11. Lox-5 у щита питания. Глаза пустые, как квартальный отчёт.' },
        { w: 'chor', t: 'Взорвать узел питания.', vox: 'choir', p: 0.6 },
        { w: 'chor', t: 'Взорвать. Узел. Питания.', vox: 'choir', p: 0.5 },
        { w: 'narr', t: 'Голосов три. Третий отстаёт на полслова и звучит тише. Будто его не спрашивали.', p: 0.7 },
      ],
      react: { who: 'hero', shot: 'close:hero', emo: 'scared', sec: 1.2 },
      next: 'choice',
    },
    choice: {
      shot: 'two:lox5:hero',
      choice: {
        sec: 9, who: 'lox5',
        opts: [
          { id: 'stop', l: 'Остановить запись', tone: 'hard', next: 'c-stop' },
          { id: 'watch', l: 'Досмотреть', tone: 'smart', next: 'c-watch', on: { flag: { 'cine-c7-watched': true } } },
          { id: 'know', l: 'Сказать: «Я знаю»', tone: 'kind', next: 'c-know', on: { flag: { 'cine-c7-know': true } } },
        ],
        silence: { l: 'Ждать', next: 'c-wait' },
      },
    },
    'c-stop': {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [
        { w: 'narr', t: 'Кнопка «Стоп» нажимается. Запись вежливо продолжается.' },
        { w: 'sera', t: 'В прошивке две тысячи четвёртого «Стоп» — это рекомендация.', p: 0.4, emo: 'cringe' },
      ],
      next: 'wake',
    },
    'c-watch': {
      shot: 'close:lox5>push:4',
      lines: [
        { w: 'chor', t: 'Приступить. Приступить.', vox: 'choir' },
        { w: 'narr', t: 'Тихий голос в хоре сбивается. Он говорит не «приступить». Он говорит «подождите».', p: 0.9 },
      ],
      next: 'wake',
    },
    'c-know': {
      shot: 'ots:hero:lox5', set: { hero: { anim: 'talk' } },
      lines: [
        { w: 'narr', t: 'Запись не слышит. Записи никогда не слышат.', p: 0.5 },
        { w: 'narr', t: 'Но голова Lox-5 поворачивается к камере. На полградуса. Как от сквозняка.', p: 0.9 },
      ],
      next: 'wake',
    },
    'c-wait': {
      shot: 'high:lox5>pull:5', hold: 1.5,
      lines: [{ w: 'chor', t: 'Приступить.', vox: 'choir', p: 1.4 }],
      next: 'wake',
    },
    wake: {
      shot: 'xclose:lox5', set: { lox5: { anim: 'reach', emo: 'surprised' } }, fx: [{ k: 'sfx', id: 'breakdown' }],
      lines: [{ w: 'narr', t: 'Lox-5 моргает. Впервые за запись. Рука идёт не к подрыву — к блокировке.' }],
      qte: { kind: 'tap', keys: ['E'], sec: 1.2, label: 'Блокировка',
        ok: { next: 'ok', on: { flag: { 'lox5-woke-seen': true }, rem: { who: 'sera', t: 'Сера запомнит, что ты это видел.' } } },
        fail: { next: 'fail', on: { flag: { 'lox5-partial': true } } } },
    },
    ok: {
      shot: 'close:lox5>push:3', set: { lox5: { anim: 'shake', emo: 'sad' } },
      lines: [
        { w: 'lox5', t: 'Отставить. Только третий узел. Там никого.', emo: 'sad', p: 0.6 },
        { w: 'narr', t: 'Взрывается один узел вместо шести. Пять тысяч беженцев не знают, кому сказать спасибо.', p: 0.9 },
        { w: 'narr', t: 'Листовки знают, кому сказать другое.', p: 0.5 },
      ],
      next: 'outro',
    },
    fail: {
      shot: 'wide', fx: [{ k: 'glitch', d: 0.8 }, { k: 'shake', amp: 0.1 }],
      lines: [
        { w: 'narr', t: '[ПОМЕХИ] ...рука... [ПОМЕХИ]', p: 0.3 },
        { w: 'narr', t: 'Запись обрывается на самом интересном. Как все записи, которые кому-то мешали.', p: 0.6 },
      ],
      next: 'outro',
    },
    outro: {
      shot: 'close:hero>pull:5', fx: [{ k: 'grade', id: 'off' }, { k: 'music', id: 'cyberspace', fade: 2 }],
      lines: [
        { w: 'sera', t: 'Журнал скопирован. Пульса нет, голосов три, совести — полторы.', p: 0.4 },
        { w: 'sera', t: 'Это мне записывать, или вы сами запомните?', p: 0.8, emo: 'smug' },
      ],
      end: { result: 'c7-done', on: { flag: { 'truth-harmony-seen': true } } },
    },
  },
};
