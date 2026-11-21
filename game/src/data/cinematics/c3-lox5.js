// C3 «Лицо на листовке» — правда о теракте на Гармонии (BIBLE §4.4, T13: Lox-5 + «Хор-4», исполнитель — не Lox). ~3 мин.
// Две версии правды: полная запись (флаг truth-lox5) или обрывок (lox5-partial). Решает QTE «Удержать поток».
export const C3_LOX5 = {
  id: 'c3-lox5', title: 'Лицо на листовке', mins: 1.5, music: 'tension', stage: 'reactor-log',
  trigger: { at: 'ha-reactor', needFlag: 'met-lox', once: true },
  cast: {
    hero: { k: 'hero' },
    lox: { name: 'Lox', model: 'hero_m_field', hair: 'short', portrait: 'lox', voice: { gender: 'm', race: 'human', pitch: 105 } },
    lox5: { name: 'Lox-5', model: 'hero_m_uniform', hair: 'short', portrait: 'lox', voice: { gender: 'm', race: 'human', pitch: 105 }, look: 'blank' },
    chor: { name: 'Хор-4', model: null, portrait: 'cultist', voice: { gender: 'm', race: 'human', pitch: 90, choir: 4 } },
  },
  start: 'leaflet',
  beats: {
    leaflet: {
      shot: 'two:lox:hero>push:6', fx: [{ k: 'fade', from: 'black', d: 1 }],
      set: { lox: { at: [-1, 0], face: [0, 3], anim: 'lean', emo: 'sad' }, hero: { at: [1, 0], face: 'lox', anim: 'idle' } },
      lines: [
        { w: 'lox', t: 'Сколько раз я видел это лицо на стенах. Оно мне уже снится.', emo: 'sad' },
        { w: 'lox', t: 'Красивое, правда? «Стрелять, потом выяснять». Хотя бы порядок указали.', p: 0.7, emo: 'cringe' },
        { w: 'lox', t: 'Я сюда не из-за прощения прилетел. Ну... в основном из-за него.', p: 0.8 },
      ],
      next: 'console',
    },
    console: {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [{ w: 'lox', t: 'Журнал реактора. «Проба № 1». Вставляй. Только не кашляй — он обидчивый.', emo: 'smug' }],
      qte: { kind: 'hold', keys: ['E'], sec: 4, need: 2.5, label: 'Удержать поток данных',
        ok: { next: 'log-full', on: { flag: { 'truth-lox5': true } } },
        fail: { next: 'log-partial', on: { flag: { 'lox5-partial': true } } } },
    },
    'log-full': {
      shot: 'wide', fx: [{ k: 'grade', id: 'mono-blue' }, { k: 'sfx', id: 'summon' }],
      set: { lox5: { at: [0, -2], face: [0, 3], anim: 'idle', emo: 'neutral' } },
      lines: [
        { w: 'narr', t: 'Запись. Реактор, 03:12.' },
        { w: 'chor', t: 'Узел три. Блокировка снята. Приступить.', vox: 'choir', p: 0.5 },
      ],
      next: 'fl-hand',
    },
    'fl-hand': {
      shot: 'xclose:lox5', set: { lox5: { anim: 'reach' } }, hold: 1.5,
      lines: [{ w: 'chor', t: 'Приступить. Приступить. Приступить.', vox: 'choir', p: 1.5 }],
      next: 'fl-no',
    },
    'fl-no': {
      shot: 'close:lox5', set: { lox5: { emo: 'sad', anim: 'shake' } }, fx: [{ k: 'sfx', id: 'breakdown' }],
      lines: [
        { w: 'lox5', t: '...Нет.', emo: 'sad', p: 1.8 },
        { w: 'narr', t: 'Он вводит блокировку. Взрывается один узел. Платформа держится.', p: 0.8 },
      ],
      next: 'back-full',
    },
    'log-partial': {
      shot: 'wide', fx: [{ k: 'grade', id: 'mono-blue' }, { k: 'glitch', d: 0.6 }],
      set: { lox5: { at: [0, -2], face: [0, 3], anim: 'reach' } },
      lines: [
        { w: 'narr', t: 'Запись. Реактор, 03:12. Поток рвётся.' },
        { w: 'narr', t: '[ПОМЕХИ] ...нажал... [ПОМЕХИ] ...взрыв.', p: 0.4 },
      ],
      next: 'back-partial',
    },
    'back-full': {
      shot: 'close:lox>push:5', fx: [{ k: 'grade', id: 'off' }],
      set: { lox: { face: [0, 3], emo: 'surprised' } },
      lines: [
        { w: 'lox', t: 'Он сказал «нет». Моё лицо сказало «нет».', emo: 'surprised', p: 1 },
        { w: 'lox', t: 'Я двадцать лет не мог.', p: 1.2, emo: 'sad' },
      ],
      next: 'choice',
    },
    'back-partial': {
      shot: 'close:lox', fx: [{ k: 'grade', id: 'off' }],
      set: { lox: { emo: 'sad', anim: 'shake' } },
      lines: [
        { w: 'lox', t: 'Запись обрывается на кнопке. Значит, это я.', emo: 'sad', p: 0.8 },
        { w: 'lox', t: 'Ну, хотя бы консоль мы починили. Ударом. Как всё в нашем деле.', p: 0.9, emo: 'cringe' },
      ],
      next: 'choice',
    },
    choice: {
      shot: 'two:lox:hero',
      choice: {
        sec: 10, who: 'lox',
        opts: [
          { id: 'hand', l: 'Положить руку ему на плечо', tone: 'kind', next: 'c-hand', on: { rel: { lox: 2 }, rem: { who: 'lox' } } },
          { id: 'proof', l: 'Показать: «Хор-4» — не его почерк', tone: 'smart', req: { flag: 'truth-lox5' }, next: 'c-proof', on: { flag: { 'truth-layer3': true } } },
          { id: 'find', l: 'Закрыть консоль: «Вторую половину найдём»', tone: 'smart', req: { flag: 'lox5-partial' }, next: 'c-find', on: { flag: { 'cine-c3-seeking': true } } },
          { id: 'public', l: 'Предложить раздать запись всем: пусть листовки поменяют', tone: 'hard', req: { flag: 'truth-lox5' }, next: 'c-public', on: { flag: { 'truth-public': true }, rep: { renegades: 1, aiParty: -1 } } },
          { id: 'autograph', l: 'Вернуть ему листовку: «Автограф?»', tone: 'funny', next: 'c-fun', on: { rel: { lox: 1 }, rem: { who: 'lox', t: 'Lox запомнит, что ты попросил автограф.' } } },
        ],
        silence: { l: 'Постоять рядом', next: 'c-silent', on: { rel: { lox: 1 } } },
      },
    },
    'c-hand': {
      shot: 'med:hero', set: { hero: { anim: 'reach' } },
      lines: [{ w: 'lox', t: 'Давно никто... Ладно. Не смотри. Я сейчас вспомню, как дышать.', p: 0.6, emo: 'sad' }],
      next: 'outro',
    },
    'c-proof': {
      shot: 'close:hero>push:3',
      lines: [
        { w: 'lox', t: 'Хор-4. Скриптлет вместо души. Тело дёргали за ниточки — а он всё равно сказал «нет».', emo: 'surprised' },
        { w: 'lox', t: 'Значит, жрец не пустил его до конца. Кто-то в нём ещё был. Мой клон. Мой... кто?', p: 0.8, emo: 'sad' },
      ],
      next: 'outro',
    },
    'c-find': {
      shot: 'med:lox',
      lines: [{ w: 'lox', t: 'Ты веришь в хорошее. Это раздражает. Продолжай.', p: 0.7, emo: 'happy' }],
      next: 'outro',
    },
    'c-public': {
      shot: 'low:lox', set: { lox: { emo: 'surprised' } },
      lines: [
        { w: 'lox', t: 'Раздать? Мои три минуты славы на всю платформу? Они уже вывешены по стенам.', emo: 'cringe' },
        { w: 'lox', t: 'Ладно. Если пока листовки поменяют, я переживу. Я многое пережил — и листовки тоже.', p: 0.6, emo: 'happy' },
      ],
      next: 'outro',
    },
    'c-fun': {
      shot: 'two:lox:hero', set: { lox: { emo: 'happy', anim: 'laugh' } }, fx: [{ k: 'vox', kind: 'laugh', who: 'lox' }],
      lines: [{ w: 'lox', t: 'Ха! Пишу «Lox-1, оригинал». Знаешь, как редко мне предлагают подписать что-то, а не стрелять?', p: 0.4, emo: 'happy' }],
      next: 'outro',
    },
    'c-silent': {
      shot: 'high:lox>pull:6', hold: 2,
      lines: [{ w: 'lox', t: 'Молчание. Хорошо. Мне тоже нечего сказать. Постоим минуту.', p: 1.5, emo: 'sad' }],
      next: 'outro',
    },
    outro: {
      shot: 'close:lox>push:5', fx: [{ k: 'music', id: 'tension', fade: 2 }],
      lines: [
        { w: 'lox', t: 'Один вопрос, пока не ушёл. Пять сказал «нет». Тогда кто был девятый?', emo: 'sad' },
        { w: 'lox', t: 'Они все пустые. Но если пятый смог... может и другие?', p: 0.9, emo: 'surprised' },
      ],
      end: { result: 'c3-done', on: { flag: { 'lox9-doubt': true } } },
    },
  },
};
