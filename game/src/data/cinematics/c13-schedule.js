// C13 «Расписание» — драма w5-schedule/storm (content-wave5.md §2). Поле у Свободы, ветряки; прокси-буря по графику 18:40.
// Дед Болтик с пейсмекером на ящике, Диспетчер по радио (три набора реплик: disp-live / disp-off / иначе).
// Выбор 12 с (молчание = щит): отвести (QTE ШУНТ W-A-S-D), щит (без QTE, Болтик погибает), вмешаться в Диспетчера (QTE удержание Space).
// Все ветки приходят в end: storm-diverted / storm-shielded / storm-hit. Результат c13-done. ~2 мин.
// Для программиста: stage 'proxy-storm' нужно добавить в STAGES; req-флаг 'w5-sched-tech' ставит программист (тех СЛ 15 / СлавоТех) в fieldwork.
// QTE ШУНТ: окно 5.6 с вместо 3 с спеки (правило CINE_RULES.qte.seq: окно ≥ 1.4 с × клавиш; 4 клавиши).
export const C13_SCHEDULE = {
  id: 'c13-schedule', title: 'Расписание', mins: 2, music: 'tension', stage: 'proxy-storm',
  trigger: { at: 'svoboda', needQuest: { id: 'w5-schedule', stage: 'storm' }, once: true },
  cast: {
    hero: { k: 'hero' },
    boltik: { name: 'Дед Болтик', model: 'hero_m_field', hair: 'short', portrait: 'boltik', voice: { gender: 'm', race: 'human', pitch: 95 } },
    disp: { name: 'Диспетчер (эфир)', model: 'hero_m_field', hair: 'short', portrait: 'dispatcher', look: 'spirit', voice: { gender: 'm', race: 'android', pitch: 85 } },
  },
  start: 'open',
  beats: {
    // ---------- бит 1: тишина, ветряки встают, радио
    open: {
      shot: 'wide>crane:7', fx: [{ k: 'fade', from: 'black', d: 1.5 }],
      set: { boltik: { at: [-2, 0], face: 'hero', anim: 'sit' }, hero: { at: [0, 3], face: 'boltik', anim: 'idle' }, disp: { at: [4, -3], face: 'hero', anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Поле у Свободы. Ветряки вращаются лениво, а потом встают разом, как по команде.' },
        { w: 'narr', t: 'Ветра нет. Ветра никогда и не было. Было расписание.', p: 0.6 },
      ],
      next: 'radio',
    },
    radio: { branch: [{ if: { flag: 'disp-off' }, next: 'radio-off' }, { next: 'radio-on' }] },
    'radio-on': {
      shot: 'close:disp', set: { disp: { anim: 'talk' } },
      lines: [{ w: 'disp', t: 'Расписание: восемнадцать сорок. Прошу прощения за неудобство.', emo: 'neutral' }],
      next: 'boltik1',
    },
    'radio-off': {
      shot: 'close:hero', fx: [{ k: 'sfx', id: 'static' }],
      lines: [{ w: 'narr', t: 'Рация хрипит. Диспетчера нет. Ничего не объявили. Буря идёт без извинений, и это хуже.' }],
      next: 'boltik1',
    },
    boltik1: {
      shot: 'med:boltik', set: { boltik: { emo: 'sad' } },
      lines: [{ w: 'narr', t: 'Дед Болтик сидит на ящике. Одна рука на груди: держит пейсмекер, как птицу.' }],
      next: 'talk',
    },
    // ---------- бит 2: щитовая, разговор с Болтиком (3 набора)
    talk: { branch: [{ if: { flag: 'disp-live' }, next: 'talk-live' }, { if: { flag: 'disp-off' }, next: 'talk-off' }, { next: 'talk-none' }] },
    'talk-live': {
      shot: 'two:hero:boltik', set: { boltik: { anim: 'talk' } },
      lines: [
        { w: 'boltik', t: 'Ты слышишь? Он извиняется. За бурю. Впервые вовремя.' },
        { w: 'boltik', t: 'Я старый. Включил меня в список лишних? Нет? Тогда извиняться передо мной не за что.', p: 0.5 },
        { w: 'disp', t: 'Приношу извинения за предыдущие. Раскаяние пока в процессе установки.', p: 0.5, emo: 'sad' },
      ],
      next: 'horizon',
    },
    'talk-off': {
      shot: 'two:hero:boltik', set: { boltik: { anim: 'talk' } },
      lines: [
        { w: 'boltik', t: 'Тишина. Раньше хоть извинялся. Теперь просто гасит.' },
        { w: 'boltik', t: 'Я старый. Включил меня в список лишних? Не знаю. Мне никто не сказал.', p: 0.5 },
        { w: 'boltik', t: 'Без расписания страшнее. Не знаешь, когда бояться.', p: 0.5, emo: 'scared' },
      ],
      next: 'horizon',
    },
    'talk-none': {
      shot: 'two:hero:boltik', set: { boltik: { anim: 'talk' } },
      lines: [
        { w: 'boltik', t: 'Диспетчер извиняется регулярно. Это как дождь: надоедает, но привыкаешь.' },
        { w: 'boltik', t: 'Я старый. Включил меня в список лишних? Нет? Тогда извиняться некому.', p: 0.5 },
        { w: 'boltik', t: 'Но если что — не оставляй мой ящик. Сядет кто попало.', p: 0.5, emo: 'smug' },
      ],
      next: 'horizon',
    },
    horizon: {
      shot: 'wide>pull:5', set: { boltik: { anim: 'idle' } },
      lines: [{ w: 'narr', t: 'На горизонте огни Свободы. Тёплые, домашние. Над ними темнеет небо — не облаками, а прямоугольником.' }],
      next: 'choice',
    },
    // ---------- бит 3: выбор 12 с, молчание = щит
    choice: {
      shot: 'two:hero:boltik',
      choice: {
        sec: 12, who: 'boltik',
        opts: [
          { id: 'divert', l: 'Отвести бурю на Азтун', tone: 'smart', next: 'divert',
            on: { flag: { 'w5-storm-divert': true } } },
          { id: 'shield', l: 'Поставить щит: отключить пейсмекер Болтика', tone: 'hard', next: 'shield',
            on: { flag: { 'storm-shielded': true, 'boltik-dead': true } } },
          { id: 'turn', l: 'Вмешаться в Диспетчера: повернуть ручку', tone: 'funny', next: 'turn',
            req: { any: ['disp-live', 'w5-sched-tech'] }, on: { flag: { 'w5-storm-turn': true } } },
        ],
        silence: { l: 'Молчать', next: 'silent', on: { flag: { 'storm-shielded': true, 'boltik-dead': true } } },
      },
    },
    // ---------- бит 4а: отвести — QTE ШУНТ
    divert: {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [{ w: 'narr', t: 'Щиток открыт. Четыре клеммы, и по каждой бежит хвост бури. Нужен шунт: по порядку, без промаха.' }],
      qte: { kind: 'seq', keys: ['W', 'A', 'S', 'D'], sec: 5.6, label: 'ШУНТ',
        ok: { next: 'divert-ok', on: { flag: { 'storm-diverted': true, 'proxy-calmed': true } } },
        fail: { next: 'divert-fail', on: { flag: { 'storm-hit': true, 'proxy-hit': true } } } },
    },
    'divert-ok': {
      shot: 'wide>crane:6', fx: [{ k: 'shake', amp: 0.12 }],
      lines: [
        { w: 'narr', t: 'Буря вздыхает и поворачивает. Тяжело, как корова, которую уводят с дороги.' },
        { w: 'narr', t: 'Над Азтуном вспыхивает чужое небо. Там тоже живут. Но там привыкли.', p: 0.6 },
      ],
      next: 'end-diverted',
    },
    'divert-fail': {
      shot: 'dutch:hero', fx: [{ k: 'shake', amp: 0.2 }],
      lines: [
        { w: 'narr', t: 'Пальцы промахиваются на последней клемме. Щиток вспыхивает, ветряки взвывают.' },
        { w: 'boltik', t: 'Ничего. Не твоя вина. Графики не обжалуются.', emo: 'sad' },
      ],
      next: 'end-hit',
    },
    // ---------- бит 4б: щит — без QTE
    shield: {
      shot: 'two:hero:boltik>push:4', set: { boltik: { anim: 'talk', emo: 'sad' } },
      lines: [
        { w: 'narr', t: 'Щит можно поставить. Он питается от пейсмекера. Только от пейсмекера.' },
        { w: 'boltik', t: 'Не надо передо мной извиняться. Я сам нажму.', emo: 'smug' },
      ],
      next: 'shield-press',
    },
    'shield-press': {
      shot: 'close:boltik', set: { boltik: { anim: 'nod' } },
      lines: [
        { w: 'boltik', t: 'Свободу не отдавай. Там у меня правнуки. А ящик пусть стоит.', p: 0.4 },
        { w: 'narr', t: 'Он нажимает кнопку. Над полем вырастает купол цвета остывшего чая.', p: 0.6 },
      ],
      next: 'shield-in',
    },
    // тот же исход при таймауте, без реплики «Я сам нажму»
    silent: {
      shot: 'close:boltik', set: { boltik: { anim: 'nod', emo: 'sad' } },
      lines: [
        { w: 'narr', t: 'Вы молчите. Время идёт, как по расписанию.' },
        { w: 'boltik', t: 'Я понял. Не мучайся. Я нажму сам.', p: 0.4, emo: 'sad' },
      ],
      next: 'shield-in',
    },
    'shield-in': { branch: [{ if: { flag: 'disp-live' }, next: 'shield-live' }, { next: 'end-shielded' }] },
    'shield-live': {
      shot: 'close:disp', set: { disp: { emo: 'sad' } },
      lines: [{ w: 'disp', t: 'Приношу извинения лично Болтику. Извинение номер... он не вернёт. Принимаю.', emo: 'sad' }],
      next: 'end-shielded',
    },
    // ---------- бит 4в: вмешаться в Диспетчера — QTE «ПОВЕРНУТЬ РУЧКУ»
    turn: {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [
        { w: 'narr', t: 'Ручка графика. Тугая, как совесть. Если её повернуть, Диспетчер перепишет расписание. Или обидится.' },
        { w: 'disp', t: 'Прошу не трогать. Приношу извинения заранее.', p: 0.4 },
      ],
      qte: { kind: 'hold', keys: ['Space'], sec: 4, need: 2.5, label: 'ПОВЕРНУТЬ РУЧКУ',
        ok: { next: 'turn-ok', on: { flag: { 'storm-diverted': true, 'proxy-calmed': true, 'disp-apologized-public': true } } },
        fail: { next: 'turn-fail', on: { flag: { 'storm-shielded': true, 'boltik-dead': true } } } },
    },
    'turn-ok': {
      shot: 'close:disp', set: { disp: { anim: 'talk', emo: 'sad' } }, fx: [{ k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'disp', t: 'Принято. Расписание изменено. Приношу извинения всем, кого уносило ветром. Публично. Вслух. На всех частотах.' },
        { w: 'narr', t: 'Ветряки снова вращаются. Ветра нет. Но все знают, чьё это было решение.', p: 0.6 },
      ],
      next: 'end-diverted',
    },
    'turn-fail': {
      shot: 'close:hero', fx: [{ k: 'shake', amp: 0.2 }],
      lines: [
        { w: 'narr', t: 'Ручка идёт дальше, чем нужно, и срывается. Диспетчер молчит. Потом очень вежливо повторяет расписание.' },
        { w: 'boltik', t: 'Ничего. Он не злой. Он просто всегда прав.', emo: 'smug' },
      ],
      next: 'shield-press',
    },
    // ---------- бит 5: итоги, последний кадр; тост «Болтик запомнит»
    'end-diverted': {
      shot: 'med:boltik>orbit:6', set: { boltik: { anim: 'idle', emo: 'happy' } }, fx: [{ k: 'music', id: 'cyberspace', fade: 3 }],
      lines: [
        { w: 'narr', t: 'Свобода цела. Огни горят. Дед Болтик сидит на ящике и смотрит на шкалу: там все стрелки в зелёном.' },
        { w: 'boltik', t: 'Живём. Антенну чинить надо. Я потихоньку.', p: 0.5, emo: 'happy' },
      ],
      next: 'end-diverted2',
    },
    'end-diverted2': {
      shot: 'wide>crane:5', fx: [{ k: 'fade', to: 'black', d: 2.5 }],
      lines: [{ w: 'narr', t: 'Он берёт отвёртку и лезет к антенне. На ящике остаётся тёплое пятно. Это и есть «спасибо».', p: 1 }],
      rem: { who: 'boltik', t: 'Дед Болтик запомнит это.' },
      end: { result: 'c13-done' },
    },
    'end-shielded': {
      shot: 'wide>pull:6', fx: [{ k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'narr', t: 'Буря бьёт в купол. Ветряки поют, сердито и недолго.' },
        { w: 'narr', t: 'Потом всё стихает. Купол гаснет. Свобода цела. Ящик пуст.', p: 0.6 },
      ],
      next: 'end-shielded2',
    },
    'end-shielded2': {
      shot: 'low:hero>push:4', fx: [{ k: 'fade', to: 'black', d: 3 }],
      lines: [{ w: 'narr', t: 'На ящике лежит отвёртка. Никто не берёт её. Все по очереди смотрят.', p: 1 }],
      end: { result: 'c13-done' },
    },
    'end-hit': {
      shot: 'wide>pull:6', fx: [{ k: 'shake', amp: 0.25 }, { k: 'music', id: 'tragic', fade: 3 }],
      lines: [
        { w: 'narr', t: 'Буря входит в Свободу, как комиссия: громко, без стука, по списку. Одиннадцать раненых. Лавка закрыта.' },
        { w: 'narr', t: 'Все живы. Это ничего не значит и значит всё.', p: 0.6 },
      ],
      next: 'end-hit2',
    },
    'end-hit2': {
      shot: 'med:boltik', set: { boltik: { anim: 'idle', emo: 'sad' } }, fx: [{ k: 'fade', to: 'black', d: 2.5 }],
      lines: [
        { w: 'boltik', t: 'Не извиняйся. Не надо передо мной. Передо мной не надо.', emo: 'sad' },
        { w: 'narr', t: 'Он смотрит на шкалу и тихо чинит антенну. Руки не дрожат. Дрожит всё остальное.', p: 1 },
      ],
      rem: { who: 'boltik', t: 'Дед Болтик запомнит это.' },
      end: { result: 'c13-done' },
    },
  },
};
