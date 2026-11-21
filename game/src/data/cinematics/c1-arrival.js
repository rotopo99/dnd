// C1 «День бунта» — пролог-завязка, перед боем 1 (docs/story/prologue.md). ~2.5 мин. Герой молчит (канон пролога).
// Формат beat: см. docs/specs/cinematics.md §1. on: {flag, rel, rep, rem, mrlPct, ctr}.
export const C1_ARRIVAL = {
  id: 'c1-arrival', title: 'День бунта', mins: 1.2, music: 'tension', stage: 'dock-riot',
  trigger: { at: 'prologue-1', before: 'battle-1', once: true },
  cast: {
    hero: { k: 'hero' },
    gans: { name: 'Ганс', model: 'hero_m_field', hair: 'short', portrait: 'npc-gans', voice: { gender: 'm', race: 'human', pitch: 110 } },
    sera: { name: 'Сера', model: 'hero_f_uniform', hair: 'bob', portrait: 'sera', voice: { gender: 'f', race: 'human', pitch: 220 } },
    cult: { name: 'Хор', model: 'outfit_cyber_m', portrait: 'cultist', voice: { gender: 'm', race: 'human', pitch: 90, choir: 3 } },
  },
  start: 'radio',
  beats: {
    radio: {
      shot: 'wide>crane:7', fx: [{ k: 'fade', from: 'black', d: 1.2 }],
      lines: [
        { w: 'narr', t: 'Радио «Голос Пустошей». Шумок: «Погода на Альфа-Гармонии: облачно, с прояснениями в виде пожаров.»' },
        { w: 'narr', t: '«Совет техников уверяет, что всё под контролем. Совет, мигните, если вас заперли в шкафу. Реклама!»', p: 0.5 },
      ],
      next: 'gate',
    },
    gate: {
      shot: 'ots:gans:hero', tr: 'cut',
      set: { hero: { at: [-1.5, 0], face: 'gans', anim: 'idle' }, gans: { at: [1.5, 0], face: 'hero', anim: 'lean', emo: 'sad' } },
      lines: [
        { w: 'gans', t: 'Стоять. Документы.' },
        { w: 'gans', t: '...Хотя какие документы. Сектор D горит, а я проверяю бумажки.', p: 0.9, emo: 'sad' },
        { w: 'gans', t: 'Ты по делу или за компанию с бунтом?', p: 0.4 },
      ],
      choice: {
        sec: 8, who: 'gans',
        opts: [
          { id: 'hands', l: 'Показать пустые руки', tone: 'kind', next: 'g-hands', on: { rel: { gans: 1 }, rem: { who: 'gans' } } },
          { id: 'joke', l: 'Достать мятую брошюру «Добро пожаловать на Гармонию!»', tone: 'funny', next: 'g-joke', on: { flag: { 'cine-c1-brochure': true } } },
          { id: 'shove', l: 'Молча отодвинуть его плечом', tone: 'hard', next: 'g-shove', on: { rel: { gans: -1 }, rem: { who: 'gans', t: 'Ганс запомнит, что его отодвинули.' } } },
        ],
        silence: { l: 'Смотреть на него', next: 'g-silent', on: { flag: { 'cine-c1-silent': true } } },
      },
    },
    'g-hands': {
      shot: 'close:gans', set: { gans: { emo: 'happy' } },
      lines: [{ w: 'gans', t: 'Пустые. Ага. Редкость. Тут у всех полные: ломов, обид, листовок.' }],
      next: 'alarm',
    },
    'g-joke': {
      shot: 'two:hero:gans', set: { hero: { anim: 'point' }, gans: { emo: 'surprised' } },
      lines: [
        { w: 'gans', t: 'Брошюра. Две тысячи тринадцатого года.', p: 0.4 },
        { w: 'gans', t: 'Экскурсия закончилась давно. Но вход бесплатный. Видимо, и выход тоже.', p: 0.7, emo: 'cringe' },
      ],
      next: 'alarm',
    },
    'g-shove': {
      shot: 'med:gans', set: { gans: { anim: 'stagger', emo: 'angry' } },
      lines: [{ w: 'gans', t: 'Эй! ...А, ладно. Проходи, горячая голова. Тут все такие.' }],
      next: 'alarm',
    },
    'g-silent': {
      shot: 'close:hero>push:3', hold: 1.2,
      lines: [{ w: 'gans', t: 'Молчун. Знаешь, это лучшая рекомендация за сегодня.', p: 1.2 }],
      next: 'alarm',
    },
    alarm: {
      shot: 'dutch:sera>hand', fx: [{ k: 'sfx', id: 'overcast' }, { k: 'shake', amp: 0.08 }],
      set: { sera: { at: [4, 2], face: 'gans', anim: 'run', emo: 'scared' } },
      lines: [
        { w: 'sera', t: 'Ганс! На реакторном узле кто-то поёт!' },
        { w: 'gans', t: 'Поёт?', emo: 'surprised' },
        { w: 'sera', t: 'Хором. Фальшиво. И терминал подпевает!', emo: 'scared' },
        { w: 'narr', t: 'Сирена: «Герметичные створки закрываются через три секунды. Не стойте в створках.»', p: 0.3 },
      ],
      next: 'shutter',
    },
    shutter: {
      shot: 'wide>whip', fx: [{ k: 'sfx', id: 'breakdown' }],
      qte: { kind: 'mash', keys: ['E'], need: 8, sec: 3, label: 'Проскочить!',
        ok: { next: 'slide-ok', on: { flag: { 'cine-c1-slid': true } } },
        fail: { next: 'slide-fail', on: { rel: { gans: 1 }, flag: { 'cine-c1-dragged': true }, rem: { who: 'gans', t: 'Ганс запомнит, что вытащил тебя за шиворот.' } } } },
    },
    'slide-ok': {
      shot: 'low:hero', set: { hero: { anim: 'run' } },
      lines: [{ w: 'gans', t: 'Ого. Ты случайно не курьер?', p: 0.6, emo: 'surprised' }],
      next: 'sting',
    },
    'slide-fail': {
      shot: 'med:gans', set: { gans: { anim: 'reach', emo: 'angry' }, hero: { anim: 'hit' } },
      lines: [
        { w: 'gans', t: 'Держу! Держу! ...Ты тяжелее, чем выглядишь.', emo: 'cringe' },
        { w: 'gans', t: 'Створка прищемила только достоинство. Оно у тебя было? Ну и ладно.', p: 0.5 },
      ],
      next: 'sting',
    },
    sting: {
      shot: 'low:cult>push:5', fx: [{ k: 'music', id: 'cult', fade: 1.5 }, { k: 'grade', id: 'red-dim' }],
      set: { cult: { at: [0, -6], anim: 'idle' } },
      lines: [
        { w: 'cult', t: 'Суд идёт. Встать.', emo: 'neutral', vox: 'choir' },
        { w: 'cult', t: 'Те, кто уже стоит, — встать ещё раз.', p: 0.8, vox: 'choir' },
      ],
      end: { result: 'to-battle-1', fx: [{ k: 'fade', to: 'black', d: 0.8 }] },
    },
  },
};
