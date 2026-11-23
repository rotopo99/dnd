// C9 «Дверь на двоих» — финал личного квеста Лизы w3-liza (content-wave3.md §1, canon characters/party.md):
// Старая кузня (бункер №5 «Выправка»), шкаф отца. Лиза всю жизнь думала, что отец запер подземный город и сбежал;
// запись говорит: «Я не запирал город. Я отдал маску». Выбор: показать запись (liza-truth) / дать открыть самой
// (QTE hold, liza-self-open) / спрятать (liza-lie, музыка -> tragic) / молчать (liza-silent). Лиза — ивент-напарница
// (rel ±5, cinematics.md), в отряд не вербуется. Ставится в очередь на стадии w3-liza/door (cine-hooks). ~2 мин.
export const C9_LIZA_DOOR = {
  id: 'c9-liza-door', title: 'Дверь на двоих', mins: 2, music: 'romance', stage: 'door-hall',
  trigger: { at: 'liza-door', needFlag: 'liza-forge-done', once: true },
  cast: {
    hero: { k: 'hero' },
    liza: { name: 'Лиза', model: 'hero_f_field', hair: 'bob', portrait: 'liza', voice: { gender: 'f', race: 'human', pitch: 215 } },
    father: { name: 'Запись отца', model: null, portrait: 'liza', voice: { gender: 'm', race: 'human', pitch: 100 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>push:6', fx: [{ k: 'fade', from: 'black', d: 1.4 }],
      set: { liza: { at: [0, -1.5], face: [0, -3], anim: 'idle', emo: 'neutral' }, hero: { at: [1.4, 2.2], face: 'liza', anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Старая кузня. Два скелета сидят спиной к спине. Противогаз у них один, на двоих.' },
        { w: 'narr', t: 'Из щели шкафа идёт свет. Его забыли выключить. Здесь никто ничего не выключал.', p: 0.8 },
      ],
      hold: 1.2,
      next: 'liza1',
    },
    liza1: {
      shot: 'two:liza:hero', set: { liza: { face: 'hero', anim: 'talk' } },
      lines: [
        { w: 'liza', t: 'Мой отец не любил двери. Он их считал. Двери любят тех, кто их считает.' },
        { w: 'liza', t: 'Я это, кажется, повторяю, чтобы не плакать.', p: 0.7, emo: 'sad' },
        { w: 'liza', t: 'В шкафу — его запись. Я знаю, что там. Он запер город и ушёл. Я просто хочу услышать, как он это говорит.', p: 0.6 },
      ],
      react: { who: 'hero', shot: 'close:hero', emo: 'sad', sec: 1 },
      next: 'door',
    },
    door: {
      shot: 'ots:hero:liza', set: { liza: { anim: 'reach' } },
      choice: {
        sec: 10, who: 'liza',
        opts: [
          { id: 'truth', l: 'Показать запись', tone: 'kind', next: 'truth', on: { flag: { 'liza-truth': true }, rel: { liza: 3 }, rem: { who: 'liza', t: 'Лиза запомнит, что ты показал.' } } },
          { id: 'self', l: 'Дать ей открыть самой', tone: 'smart', next: 'qte-hold' },
          { id: 'lie', l: 'Спрятать запись: «Пусть думает, что он запер»', tone: 'hard', next: 'lie',
            on: { flag: { 'liza-lie': true, 'ai-delisting-proof': true }, rel: { liza: -2 } } },
        ],
        silence: { l: 'Молчать', next: 'silent', on: { flag: { 'liza-silent': true }, rel: { liza: 1 } } },
      },
    },
    'qte-hold': {
      shot: 'xclose:liza', set: { liza: { anim: 'reach', emo: 'scared' } },
      lines: [{ w: 'narr', t: 'Замок отца. Лиза держит отмычку и не дышит. Ей нужно, чтобы кто-то держал тишину.' }],
      qte: { kind: 'hold', keys: ['E'], sec: 4, need: 3, label: 'Держать тишину',
        ok: { next: 'truth', on: { flag: { 'liza-self-open': true }, rel: { liza: 4 }, rem: { who: 'liza', t: 'Лиза запомнит, что ты не вмешался.' } } },
        fail: { next: 'truth', on: { flag: { 'liza-self-open': true }, rel: { liza: 1 } } } },
    },
    truth: {
      shot: 'close:liza>push:4', fx: [{ k: 'sfx', id: 'summon' }],
      lines: [
        { w: 'father', t: 'Если ты это слышишь — я не запирал город. Город заперли снаружи. По акту «списание».', vox: 'static' },
        { w: 'father', t: 'Я отдал маску Семёну. У него дети. У меня — ты, а ты уже умеешь открывать двери.', vox: 'static', p: 0.7 },
      ],
      react: { who: 'liza', shot: 'xclose:liza', emo: 'sad', sec: 1.8 },
      next: 'relief',
    },
    lie: {
      shot: 'close:hero', set: { hero: { anim: 'shake' } }, fx: [{ k: 'music', id: 'tragic', fade: 2 }],
      lines: [
        { w: 'narr', t: 'Запись в кармане. Шкаф пуст. Лиза кивает: так она и думала.' },
        { w: 'liza', t: 'Значит, запер. Хорошо. Так проще. Ненавидеть проще, чем скучать.', p: 0.7, emo: 'sad' },
      ],
      hold: 1.5,
      next: 'relief-lie',
    },
    'relief-lie': {
      shot: 'wide>pull:6', set: { liza: { anim: 'idle', emo: 'neutral' } },
      lines: [
        { w: 'liza', t: 'Двери меня любят. Особенно закрытые. Пойду, пока эта не передумала.', emo: 'neutral' },
        { w: 'narr', t: 'Запись тёплая, как улика. Она пригодится против Партии. Лизе она бы пригодилась больше.', p: 0.8 },
      ],
      end: { result: 'c9-done' },
    },
    silent: {
      shot: 'two:liza:hero>pull:5', set: { liza: { anim: 'reach' } },
      lines: [
        { w: 'narr', t: 'Вы молчите. Лиза открывает шкаф сама, смотрит на запись и не включает её.' },
        { w: 'liza', t: 'Потом. Двери не убегают. Это я убегаю.', p: 0.8 },
      ],
      next: 'relief',
    },
    relief: {
      shot: 'wide>crane:6', set: { liza: { anim: 'idle', emo: 'happy' } },
      lines: [
        { w: 'liza', t: 'Я открыла дверь. Теперь мне надо найти ещё сорок.', emo: 'happy' },
        { w: 'liza', t: 'Двери меня не любят. Они меня просто знают. Открыто. Не благодари.', p: 0.8 },
      ],
      end: { result: 'c9-done' },
    },
  },
};
