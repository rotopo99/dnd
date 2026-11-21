// C4 «Суд» — кульминация (Акт III, docs/story/main-plot.md): Судья судит героя, «идеальное тело». Герой молчит — слово у свидетелей.
// Слабость Судьи (README п. 18): он обязан следовать процедуре. Свидетели считаются в ctr.witness и снижают СЛ финальной проверки.
// Провал — не конец: ветки draw (бой с аватаром Судьи) и lost (бой с помехой, путь «Сосуд»). ~4 мин.
// Условия beat `branch`: [{ if: {flag|notFlag|any:[..]|ctr:{имя: min}}, next }, ..., { next }] — первое сработавшее.
export const C4_COURT = {
  id: 'c4-court', title: 'Суд', mins: 2.5, music: 'cyberspace', stage: 'court-cyber',
  trigger: { at: 'kiberspeys-door', after: 'mq3-court', once: true },
  ctr0: { witness: 0, proof: 0, counsel: 0, polite: 0, silent: 0 },
  cast: {
    hero: { k: 'hero' },
    judge: { name: 'Судья', model: 'judge-avatar', portrait: 'judge', voice: { gender: 'm', race: 'android', pitch: 80 } },
    victor: { name: 'Виктор (дух)', model: 'hero_m_field', hair: 'short', portrait: 'victor', look: 'spirit', voice: { gender: 'm', race: 'human', pitch: 120 } },
    lox: { name: 'Lox', model: 'hero_m_field', hair: 'short', portrait: 'lox', voice: { gender: 'm', race: 'human', pitch: 105 } },
    lyosha: { name: 'Лёша', model: 'hero_m_field', hair: 'short', portrait: 'courier', voice: { gender: 'm', race: 'human', pitch: 150 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>crane:7', fx: [{ k: 'fade', from: 'white', d: 1.5 }],
      set: { judge: { at: [0, -5], anim: 'idle' }, hero: { at: [0, 3], face: 'judge', anim: 'idle' } },
      lines: [
        { w: 'judge', t: 'Суд идёт. Заседание закрыто для публики: публики не осталось, все в очереди.', emo: 'neutral' },
        { w: 'judge', t: 'Дело номер сто двенадцать. Подсудимый обвиняется в том, что у него идеальное тело.', p: 0.7 },
        { w: 'judge', t: 'Свидетелей защиты нет. Какая удача: это ускоряет процесс.', p: 0.5, emo: 'smug' },
      ],
      next: 'plea',
    },
    plea: {
      shot: 'low:judge>push:5',
      lines: [{ w: 'judge', t: 'Признаёте ли вы себя виновным в идеальности?', p: 0.4 }],
      choice: {
        sec: 10, who: 'judge',
        opts: [
          { id: 'deny', l: 'Не признавать', tone: 'hard', next: 'p-deny' },
          { id: 'counsel', l: 'Потребовать защитника по процедуре', tone: 'smart', next: 'p-counsel', on: { ctr: { counsel: 1 } } },
          { id: 'number', l: 'Спросить: «Номер дела? Для протокола»', tone: 'funny', next: 'p-number', on: { ctr: { polite: 1 } } },
        ],
        silence: { l: 'Молчать', next: 'p-silent', on: { ctr: { silent: 1 } } },
      },
    },
    'p-deny': {
      shot: 'close:judge', set: { judge: { emo: 'neutral', anim: 'talk' } },
      lines: [{ w: 'judge', t: 'Отрицание занесено. Отрицание — признание, но в более длинной форме.' }],
      next: 'souls',
    },
    'p-counsel': {
      shot: 'close:judge', set: { judge: { emo: 'surprised' } }, hold: 0.8,
      lines: [
        { w: 'judge', t: 'Право на защиту... существует. Пункт четыре, мелким шрифтом.', p: 0.6 },
        { w: 'judge', t: 'Я сам его вписал. В две тысячи пятом. В минуту слабости.', p: 0.5, emo: 'sad' },
      ],
      next: 'souls',
    },
    'p-number': {
      shot: 'close:judge', set: { judge: { emo: 'happy', anim: 'nod' } },
      lines: [{ w: 'judge', t: 'Сто двенадцатый! Вы первый, кто спросил. Обычно просят — скорее.', emo: 'happy' }],
      next: 'souls',
    },
    'p-silent': {
      shot: 'high:hero', set: { judge: { anim: 'talk' } },
      lines: [{ w: 'judge', t: 'Молчание — отказ от защиты. Принято. Дальше — быстрее.', p: 1.2, emo: 'smug' }],
      next: 'souls',
    },

    souls: {
      shot: 'high:judge>crane:7', fx: [{ k: 'sfx', id: 'summon' }],
      lines: [
        { w: 'judge', t: 'Позвольте пояснить суду. Я помню каждую душу, которую принял. Каждую.', emo: 'sad', p: 0.5 },
        { w: 'judge', t: 'Отпустить их — значит признать, что приговоры были напрасны. А я не напрасен. Я — процедура.', p: 0.8 },
        { w: 'judge', t: 'Свидетели защиты, если они есть, — приглашаются. Только по одному. И не перебивать.', p: 0.7, emo: 'angry' },
      ],
      react: { who: 'hero', shot: 'close:hero', emo: 'neutral', sec: 1.4 },
      next: 'w-victor-gate',
    },
    'w-victor-gate': { branch: [{ if: { flag: 'victor-soul-freed' }, next: 'w-victor' }, { next: 'w-lox-gate' }] },
    'w-victor': {
      shot: 'two:victor:judge', fx: [{ k: 'sfx', id: 'summon' }],
      set: { victor: { at: [-2.5, 0], face: 'judge', anim: 'idle', emo: 'neutral' } },
      lines: [
        { w: 'judge', t: 'Свидетель Виктор. Умер. Прописан в очереди.' },
        { w: 'victor', t: 'Прописан и недоволен. Подсудимый вытащил меня оттуда. Идеальный он только в одном: упрямый.', emo: 'smug' },
        { w: 'judge', t: 'Свидетель отклоняется от формы. Свидетель...', p: 0.3, emo: 'angry' },
      ],
      qte: { kind: 'tap', keys: ['E'], sec: 1.2, label: 'Протест!',
        ok: { next: 'v-ok', on: { ctr: { witness: 1 } } }, fail: { next: 'v-fail' } },
    },
    'v-ok': {
      shot: 'close:judge', set: { judge: { emo: 'surprised', anim: 'shake' } }, fx: [{ k: 'sfx', id: 'crit' }],
      lines: [
        { w: 'judge', t: 'Перебивать нельзя. Но... отвод свидетеля — тоже перебивание.', emo: 'cringe' },
        { w: 'judge', t: 'Занести в протокол: показания приняты. Мне это не нравится.', p: 0.5 },
      ],
      next: 'w-lox-gate',
    },
    'v-fail': {
      shot: 'med:victor', set: { victor: { emo: 'sad', anim: 'shrug' } },
      lines: [
        { w: 'judge', t: 'Показания не занесены. Форма нарушена.' },
        { w: 'victor', t: 'Ничего. Я привык, что меня не дослушивают. Ещё с войны.', p: 0.5, emo: 'sad' },
      ],
      next: 'w-lox-gate',
    },

    'w-lox-gate': { branch: [{ if: { flag: 'truth-lox5' }, next: 'w-lox' }, { next: 'w-courier-gate' }] },
    'w-lox': {
      shot: 'two:lox:judge', set: { lox: { at: [2.5, 0], face: 'judge', anim: 'idle', emo: 'smug' } },
      lines: [
        { w: 'judge', t: 'Свидетель Lox. Преступник в розыске. Лицо на листовках.' },
        { w: 'lox', t: 'Был. До вызова в суд. Теперь я — свидетель. Статус сменился. Протокол!', emo: 'smug' },
        { w: 'judge', t: '...Статус действительно сменился.', p: 0.7, emo: 'cringe' },
        { w: 'lox', t: 'Подсудимый поверил мне, когда у меня на лбу висела награда. Это вам не идеальность. Это глупость. Но моя.', p: 0.4, emo: 'happy' },
      ],
      on: { ctr: { witness: 1 } },
      next: 'w-courier-gate',
    },
    'w-courier-gate': { branch: [{ if: { any: ['cine-c2-stalled', 'cine-c2-impressed', 'cine-c2-memory-lost'] }, next: 'w-courier' }, { next: 'closing' }] },
    'w-courier': {
      shot: 'med:lyosha', set: { lyosha: { at: [-1.5, 1], face: 'judge', anim: 'idle', emo: 'scared' } },
      lines: [
        { w: 'lyosha', t: 'Я письмо принёс! Не знаю куда. Тётя пишет: «Лёша, возвращайся, у нас борщ».', emo: 'scared' },
        { w: 'judge', t: 'Борщ. Что это?', p: 0.8, emo: 'surprised' },
        { w: 'lyosha', t: 'Ну... суп. Красный. С любовью.', p: 0.4 },
        { w: 'judge', t: '...Занести в протокол: борщ. С любовью.', p: 1.3, emo: 'sad' },
      ],
      react: { who: 'hero', shot: 'xclose:hero', emo: 'happy', sec: 1.5 },
      on: { ctr: { witness: 1 } },
      next: 'closing',
    },

    closing: {
      shot: 'wide>fig8:8',
      lines: [
        { w: 'judge', t: 'Свидетели выслушаны. Слово подсудимому. Подсудимый, как обычно, промолчит?', emo: 'smug' },
      ],
      choice: {
        sec: 10, who: 'judge', prompt: 'Предъявить суду...',
        opts: [
          { id: 'article', l: 'Статью 1: «Душа вправе покинуть очередь после рассмотрения дела»', tone: 'smart', next: 'c-article', on: { ctr: { proof: 1 } } },
          { id: 'log', l: 'Запись Lox-5: даже подставное тело сказало «нет»', tone: 'kind', req: { flag: 'truth-lox5' }, next: 'c-log', on: { ctr: { proof: 1 } } },
          { id: 'song', l: 'Спеть Судье песню про очередь', tone: 'funny', next: 'c-song', on: { flag: { 'judge-hummed': true } } },
          { id: 'queue', l: 'Показать на Судью: «Ты тоже в очереди»', tone: 'hard', next: 'c-queue', on: { ctr: { proof: 1, polite: -1 } } },
        ],
        silence: { l: 'Молчать', next: 'c-silent' },
      },
    },
    'c-article': {
      shot: 'close:judge', set: { judge: { emo: 'surprised' } },
      lines: [{ w: 'judge', t: 'Статья один. Читаю... Я это писал? Почерк мой.', p: 0.5 }],
      next: 'verdict',
    },
    'c-log': {
      shot: 'med:lox', set: { lox: { emo: 'happy' } },
      lines: [{ w: 'judge', t: 'Тело без души отказалось исполнять приказ. В моих правилах такого нет. В моих правилах вообще мало чего есть.', p: 0.5, emo: 'cringe' }],
      next: 'verdict',
    },
    'c-song': {
      shot: 'low:hero>shake', set: { hero: { anim: 'cast', emo: 'cringe' } }, fx: [{ k: 'sfx', id: 'cringe' }],
      lines: [
        { w: 'judge', t: 'Песня не предусмотрена.', p: 0.6, emo: 'angry' },
        { w: 'judge', t: '...Размер выдержан. Припев запоминается. Прошу прекратить.', p: 0.9, emo: 'cringe' },
      ],
      next: 'verdict',
    },
    'c-queue': {
      shot: 'close:judge', set: { judge: { emo: 'angry' } },
      lines: [{ w: 'judge', t: 'Я не в очереди. Я — её конец. Я — её...', emo: 'angry' }, { w: 'judge', t: '...Номер у меня тоже есть. Первый. Неприятно.', p: 1, emo: 'sad' }],
      next: 'verdict',
    },
    'c-silent': {
      shot: 'high:hero>pull:6', hold: 1.5,
      lines: [{ w: 'judge', t: 'Подсудимый молчит. Как предсказано.', p: 1.5 }],
      next: 'verdict',
    },

    verdict: {
      shot: 'close:judge>fig8:6', fx: [{ k: 'music', id: 'boss', fade: 2 }],
      lines: [{ w: 'judge', t: 'Суд удаляется. Суд — это я. Я удалился. Приговор.', p: 0.5 }],
      check: {
        skills: ['persuasion', 'analysis', 'hack'], dc: 19,
        mod: [{ ctr: 'witness', dc: -2 }, { ctr: 'proof', dc: -1 }, { ctr: 'counsel', dc: -1 }, { ctr: 'polite', dc: -1 }, { ctr: 'silent', dc: 2 }, { flag: 'door-halfsealed', dc: 2 }],
        ok: { next: 'won' }, fail: { next: 'fail-gate' },
      },
    },
    'fail-gate': { branch: [{ if: { ctr: { witness: 1 } }, next: 'draw' }, { next: 'lost' }] },
    won: {
      shot: 'low:judge>push:6', set: { judge: { emo: 'surprised', anim: 'shake' } }, fx: [{ k: 'sfx', id: 'victory' }],
      lines: [
        { w: 'judge', t: 'Процедурная ошибка. Нарушена очередность. Я обязан...', emo: 'surprised' },
        { w: 'judge', t: 'Я обязан пересмотреть дело. Заседание перенесено на неопределённый срок.', p: 0.7, emo: 'sad' },
        { w: 'narr', t: 'Табло над залом мигает: «Ваш номер: 1». Судья не знает, куда смотреть.', p: 0.6 },
      ],
      end: { result: 'court-won', on: { flag: { 'court-won': true }, rem: { who: 'lox', t: 'Суд запомнит, что его переиграли бумагой.' } } },
    },
    draw: {
      shot: 'low:judge>shake', set: { judge: { emo: 'angry' } }, fx: [{ k: 'shake', amp: 0.2 }],
      lines: [
        { w: 'judge', t: 'Приговор не вынесен. И не отменён. Подсудимому оставаться на месте.' },
        { w: 'judge', t: 'Охрана!', p: 0.5, emo: 'angry' },
      ],
      end: { result: 'to-battle-judge-avatar', on: { flag: { 'court-draw': true } } },
    },
    lost: {
      shot: 'high:hero', set: { judge: { emo: 'smug' } }, fx: [{ k: 'grade', id: 'white-dim' }],
      lines: [{ w: 'judge', t: 'Виновен в идеальности. Приговор: переселение. Немедленно.' }],
      qte: { kind: 'mash', keys: ['E'], need: 10, sec: 3.5, label: 'Не дать себя переселить!',
        ok: { next: 'draw' }, fail: { next: 'lost-end', on: { flag: { 'court-lost': true } } } },
    },
    'lost-end': {
      shot: 'xclose:hero', fx: [{ k: 'grade', id: 'white-flash', d: 0.6 }],
      lines: [{ w: 'judge', t: 'Принято. Примерка начата. Если не подойдёт — вернём. Жмёт — не жмёт, сообщим.', emo: 'smug', p: 0.8 }],
      end: { result: 'to-battle-judge-avatar-hard', on: { flag: { 'court-lost': true } } },
    },
  },
};
