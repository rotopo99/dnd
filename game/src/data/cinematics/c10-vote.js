// C10 «Вече» — дебаты Совета беженцев в w3-flags (content-wave3.md §2): палуба Альфа-Гармонии, четыре стула из ящиков.
// Три посла (Хрящ — Отступники, Буревестник — пираты, посол Партии) говорят по два предложения: одно правда, одно ложь.
// Герой раскрывает ложь (ctr win), перебивает спикера (QTE tap «Слово!»), затем голосование: проверка СЛ 17 − win.
// ok -> c10-council (стадия council-won), fail -> c10-draw (debate-lost: сторону выбирают вручную). cine-hooks CINE_RESULT_NEXT. ~1.5 мин.
export const C10_VOTE = {
  id: 'c10-vote', title: 'Вече', mins: 1.5, music: 'cringe-low', stage: 'dock-riot',
  trigger: { at: 'w3-debate', needFlag: 'harmony-debate', once: true },
  ctr0: { win: 0 },
  cast: {
    hero: { k: 'hero' },
    sera: { name: 'Сера', model: 'hero_f_field', hair: 'ponytail', portrait: 'sera', voice: { gender: 'f', race: 'human', pitch: 220 } },
    hrjash: { name: 'Комиссар Хрящ', model: 'hero_m_field', hair: 'short', portrait: 'commissar-khryashch', voice: { gender: 'm', race: 'human', pitch: 78 } },
    burevestnik: { name: 'Капитан Буревестник', model: 'hero_m_field', hair: 'long', portrait: 'burevestnik', voice: { gender: 'm', race: 'human', pitch: 105 } },
    envoy: { name: 'Посол Партии', model: 'hero_m_uniform', hair: 'short', portrait: 'w3-envoy-ai', voice: { gender: 'm', race: 'human', pitch: 120 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>crane:6', fx: [{ k: 'fade', from: 'black', d: 1.2 }],
      set: {
        sera: { at: [0, -2.5], face: [0, 3], anim: 'idle' }, hero: { at: [0, 2.5], face: 'sera', anim: 'idle' },
        hrjash: { at: [-2.4, 0], face: [1, 0], anim: 'idle' }, burevestnik: { at: [2.4, 0], face: [-1, 0], anim: 'idle' },
        envoy: { at: [0, 0], face: [0, -3], anim: 'idle' },
      },
      lines: [
        { w: 'narr', t: 'Палуба Гармонии. Четыре стула из ящиков. Беженцы стоят вокруг и держат номерки.' },
        { w: 'sera', t: 'Регламент: три минуты на человека. Хлеб ждёт. Хлеб не умеет ждать долго.', p: 0.6 },
      ],
      hold: 0.8,
      next: 'envoys',
    },
    envoys: {
      shot: 'med:hrjash>pan:hrjash:envoy', set: { hrjash: { anim: 'talk' } },
      lines: [
        { w: 'hrjash', t: 'Стена держит Хатаб пять лет. Это правда, спросите стену.' },
        { w: 'hrjash', t: 'Отступники никогда не брали хлеб силой.', p: 0.4 },
        { w: 'burevestnik', t: 'Пираты возят хлеб по всему морю. Это правда, спросите море.', p: 0.5 },
        { w: 'burevestnik', t: 'Пошлина — пять процентов. Всегда пять. Никогда больше.', p: 0.4, emo: 'smug' },
        { w: 'envoy', t: 'Партия гарантирует порядок. Указ номер один уже подписан.', p: 0.5 },
        { w: 'envoy', t: 'Подписан лично Генералом. Он читал.', p: 0.4 },
      ],
      react: { who: 'hero', shot: 'close:hero', emo: 'smug', sec: 1 },
      next: 'choice',
    },
    choice: {
      shot: 'two:hero:sera',
      choice: {
        sec: 9, who: 'sera',
        opts: [
          { id: 'hrjash', l: 'Раскрыть ложь Хряща: хлеб в Хатабе берут по ордеру', tone: 'hard', next: 'c-hrjash', on: { ctr: { win: 1 } } },
          { id: 'bur', l: 'Раскрыть ложь Буревестника: пошлина растёт по ночам', tone: 'smart', next: 'c-bur', on: { ctr: { win: 1 } } },
          { id: 'party', l: 'Раскрыть ложь Партии: Генерал не читает', tone: 'funny', next: 'c-party', on: { ctr: { win: 1 } } },
          { id: 'bread', l: 'Показать список хлеба: кто сколько получил', tone: 'kind', next: 'c-bread', on: { ctr: { win: 1 } } },
        ],
        silence: { l: 'Ждать', next: 'c-wait' },
      },
    },
    'c-hrjash': { shot: 'close:hrjash', set: { hrjash: { emo: 'angry' } }, lines: [{ w: 'hrjash', t: 'Ордер — это тоже форма вежливости.', emo: 'angry' }], next: 'word' },
    'c-bur': { shot: 'close:burevestnik', set: { burevestnik: { emo: 'cringe' } }, lines: [{ w: 'burevestnik', t: 'По ночам — это не «всегда». Это «иногда». Ночью.', emo: 'cringe' }], next: 'word' },
    'c-party': { shot: 'close:envoy', set: { envoy: { emo: 'surprised' } }, lines: [{ w: 'envoy', t: 'Генерал... ознакомлен. Через референта. Референт читал.', emo: 'surprised' }], next: 'word' },
    'c-bread': { shot: 'close:sera', set: { sera: { emo: 'happy' } }, lines: [{ w: 'sera', t: 'Цифры сходятся. Впервые за год. Запишите это в протокол, пока не разошлись.', emo: 'happy' }], next: 'word' },
    'c-wait': { shot: 'high:hero>pull:5', hold: 1.2, lines: [{ w: 'narr', t: 'Послы говорят дальше. Беженцы считают номерки. Хлеб остывает.', p: 0.8 }], next: 'word' },
    word: {
      shot: 'two:hero:envoy', set: { envoy: { anim: 'talk' } },
      lines: [{ w: 'envoy', t: 'И в заключение, от имени Партии, позвольте зачитать указ номер один целиком...' }],
      qte: { kind: 'tap', keys: ['E'], sec: 1.2, label: 'Слово!',
        ok: { next: 'word-ok', on: { ctr: { win: 1 } } },
        fail: { next: 'word-fail' } },
    },
    'word-ok': { shot: 'close:hero', set: { hero: { anim: 'point' } }, lines: [{ w: 'sera', t: 'Слово предоставляется. Не им. Вам.', p: 0.4 }], next: 'vote' },
    'word-fail': { shot: 'close:envoy', set: { envoy: { emo: 'smug' } }, lines: [{ w: 'envoy', t: 'Вам слова не давали. Пункт сорок.', emo: 'smug' }], next: 'vote' },
    vote: {
      shot: 'wide>push:5', set: { sera: { anim: 'hands_up' } },
      lines: [{ w: 'sera', t: 'Голосуем. Кто за Совет — руки вверх. Кто против — тоже вверх, но с другим лицом.' }],
      check: { skills: ['persuasion', 'analysis', 'intimidation'], dc: 17, mod: [{ ctr: 'win', dc: -1 }], ok: { next: 'won' }, fail: { next: 'draw' } },
    },
    won: {
      shot: 'wide>crane:6', set: { sera: { emo: 'happy', anim: 'laugh' } }, fx: [{ k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'sera', t: 'Совет утверждён. Первое решение: хлеб. Второе: тоже хлеб.', emo: 'happy' },
        { w: 'narr', t: 'Шумок в эфире: «Совет заседает. Хлеб одобрен единогласно, кроме хлеба».', p: 0.7 },
      ],
      end: { result: 'c10-council', on: { flag: { 'harmony-vote-won': true }, rem: { who: 'sera', t: 'Сера запомнит, что вы дали слово беженцам.' } } },
    },
    draw: {
      shot: 'high:sera>pull:5', set: { sera: { emo: 'sad' } },
      lines: [
        { w: 'narr', t: 'Шумок в эфире: «Результаты: за — четыре тысячи сто восемнадцать, против — четыре тысячи сто девятнадцать, воздержался — хлеб».' },
        { w: 'sera', t: 'Ничья. Значит, решать будете вы. Выбирайте флаг. Я выберу, где стоять.', p: 0.7, emo: 'sad' },
      ],
      end: { result: 'c10-draw', on: { flag: { 'harmony-vote-draw': true } } },
    },
  },
};
