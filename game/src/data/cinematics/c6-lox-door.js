// C6 «Дверь» — жертва напарника (Lox, Акт III, штурм Двери у kiberspeys). ~3 мин.
// Дверь держится, пока у пульта стоит тот, чьё лицо есть в списках. Спасти можно — ценой полуоткрытой Двери (СЛ суда +2).
// Провал QTE и «принять» ведут к одной ветке гибели, но разной подаче. Игра не заканчивается.
export const C6_LOX_DOOR = {
  id: 'c6-lox-door', title: 'Дверь', mins: 1.5, music: 'tension', stage: 'door-hall',
  trigger: { at: 'kiberspeys-door', before: 'mq3-court', once: true }, req: { party: 'lox', loy: { lox: 40 } },
  cast: {
    hero: { k: 'hero' },
    lox: { name: 'Lox', model: 'hero_m_field', hair: 'short', portrait: 'lox', voice: { gender: 'm', race: 'human', pitch: 105 } },
    judge: { name: 'Судья', model: null, portrait: 'judge', voice: { gender: 'm', race: 'android', pitch: 80 } },
  },
  start: 'door',
  beats: {
    door: {
      shot: 'wide>shake', fx: [{ k: 'shake', amp: 0.15 }, { k: 'sfx', id: 'overcast' }],
      set: { lox: { at: [-2, 0], face: [0, -5], anim: 'lean', emo: 'neutral' }, hero: { at: [2, 0], face: 'lox', anim: 'idle' } },
      lines: [
        { w: 'narr', t: 'Дверь дрожит. Терминалы по залу гудят одну ноту. Она ниже, чем хотелось бы.' },
        { w: 'lox', t: 'Дверь держится на подтверждении. Кто-то должен стоять у пульта, пока остальные внутри. Иначе — сброс.', p: 0.5 },
        { w: 'lox', t: 'Могла бы быть кнопка. Но нет. Нужна рука. Человеческая. Ну, или клонская. Мне без разницы.', p: 0.4, emo: 'cringe' },
      ],
      next: 'face',
    },
    face: {
      shot: 'close:lox>push:5',
      lines: [
        { w: 'lox', t: 'Пульт признаёт только лицо из списка. Моё. Я проверил. Ирония: то, что все ненавидят, — единственный ключ.', emo: 'sad', p: 0.5 },
        { w: 'lox', t: 'Значит, остаюсь. Вопрос — как ты это воспримешь.', p: 0.9 },
      ],
      choice: {
        sec: 12, who: 'lox',
        opts: [
          { id: 'offer', l: 'Предложить остаться вместо него', tone: 'kind', next: 'refuse', on: { rel: { lox: 2 } } },
          { id: 'other', l: 'Искать другой способ', tone: 'smart', next: 'other', on: { flag: { 'cine-c6-sought': true } } },
          { id: 'nod', l: 'Кивнуть. Принять', tone: 'hard', next: 'accept', on: { rem: { who: 'lox', t: 'Lox запомнит, что ты не стал спорить.' } } },
        ],
        silence: { l: 'Молчать', next: 'accept-silent' },
      },
    },
    refuse: {
      shot: 'two:lox:hero', set: { lox: { emo: 'happy', anim: 'shake' } },
      lines: [
        { w: 'lox', t: 'Не выйдет. Пульт тебя не знает. А меня знает вся пустошь. Спасибо, что предложил.', emo: 'happy', p: 0.4 },
        { w: 'lox', t: 'Хотя... мог бы сказать громче. Для протокола.', p: 0.5, emo: 'cringe' },
      ],
      next: 'pull-set',
    },
    other: {
      shot: 'med:hero', set: { hero: { anim: 'cast' } },
      lines: [{ w: 'lox', t: 'Есть способ. Минут двадцать. У нас пять.', p: 0.5, emo: 'sad' }, { w: 'narr', t: 'Ты лезешь в кабели. Пальцы — быстрее мысли.', p: 0.3 }],
      check: { skills: ['hack', 'engineering'], dc: 15, ok: { next: 'pull-set' }, fail: { next: 'accept', on: { flag: { 'cine-c6-late': true } } } },
    },
    'pull-set': {
      shot: 'wide>shake', fx: [{ k: 'sfx', id: 'breakdown' }, { k: 'shake', amp: 0.2 }],
      lines: [
        { w: 'narr', t: 'Створки Двери опускаются. Между ними и полом — человеческий рост. Пока.' },
      ],
      qte: { kind: 'mash', keys: ['E'], need: 12, sec: 4, label: 'Вытащить Lox!',
        ok: { next: 'saved', on: { flag: { 'lox-alive-door': true, 'door-halfsealed': true }, rem: { who: 'lox' } } },
        fail: { next: 'lost-qte', on: { flag: { 'lox-dead': true } } } },
    },
    saved: {
      shot: 'two:lox:hero>fig8:6', set: { lox: { at: [0, 0], anim: 'sit', emo: 'happy' }, hero: { anim: 'sit' } }, fx: [{ k: 'music', id: 'world', fade: 2 }],
      lines: [
        { w: 'lox', t: 'Ты идиот. Спасибо.', p: 0.8, emo: 'happy' },
        { w: 'lox', t: 'Дверь закрылась не до конца. Это плохо. Но я живой. Это — тоже новость.', p: 0.6, emo: 'cringe' },
        { w: 'narr', t: 'Судья через Дверь, шёпотом: «Свидетель... в наличии. Занесено.»', p: 0.5 },
      ],
      end: { result: 'lox-saved', on: { rep: { renegades: 0 } } },
    },
    'accept-silent': {
      shot: 'two:lox:hero', hold: 1.5,
      lines: [{ w: 'lox', t: 'Ты молчишь. Понимаю. Я бы тоже молчал. Давно уже надо было молчать.', p: 1.2, emo: 'sad' }],
      next: 'accept',
    },
    accept: {
      shot: 'close:lox', set: { lox: { face: 'hero', emo: 'sad', anim: 'talk' } }, fx: [{ k: 'music', id: 'tragic', fade: 2 }],
      lines: [
        { w: 'lox', t: 'Я всю жизнь был чьей-то копией. Лицо на стенах — не моё, а чьё-то «чистое».', p: 0.4 },
        { w: 'lox', t: 'Дай хоть раз побыть оригиналом.', p: 1.2, emo: 'happy' },
      ],
      next: 'last',
    },
    'lost-qte': {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } }, fx: [{ k: 'music', id: 'tragic', fade: 1 }],
      lines: [
        { w: 'lox', t: 'Не тяни. Не успеешь. Отпусти.', p: 0.4, emo: 'sad' },
        { w: 'lox', t: 'Ты почти поймал. Это больше, чем кто-либо. Я считаю.', p: 0.9, emo: 'happy' },
      ],
      next: 'last',
    },
    last: {
      shot: 'close:lox>push:6',
      lines: [
        { w: 'lox', t: 'Скажи Гансу: я извинился. Он не ответил вслух, но простил. Я слышал.', p: 0.4, emo: 'sad' },
        { w: 'lox', t: 'А если встретишь девятого... пусть не повторяет мои ошибки. Пусть делает свои.', p: 1, emo: 'happy' },
        { w: 'lox', t: 'И листовку мою сохрани. Не для славы. Для смеха.', p: 0.8, emo: 'happy' },
      ],
      next: 'walk',
    },
    walk: {
      shot: 'low:lox>pull:7', set: { lox: { at: [0, -4], face: [0, -6], anim: 'walk' } }, fx: [{ k: 'sfx', id: 'death' }],
      lines: [{ w: 'narr', t: 'Он идёт к пульту. Той самой походкой, по которой он узнавал своих клонов.', p: 1 }],
      next: 'empty',
    },
    empty: {
      shot: 'wide>pull:8', fx: [{ k: 'fade', to: 'black', d: 3, after: 5 }],
      set: { lox: { anim: 'idle' } }, hold: 3,
      lines: [{ w: 'judge', t: 'Дверь закрыта. Свидетель... выбыл. Занесено.', p: 1.8 }],
      end: { result: 'lox-lost', on: { flag: { 'lox-dead': true, 'lox-leaflet': true }, mrlPct: -5 } },
    },
  },
};
