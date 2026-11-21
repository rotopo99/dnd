// C2 «Хор» — первое столкновение с Кибер-Жрецом (культ). ~3 мин. Судья ненавидит перебивающих, культ — тоже; процедура = оружие.
export const C2_PRIEST = {
  id: 'c2-priest', title: 'Хор', mins: 1.2, music: 'cult', stage: 'server-hall',
  trigger: { at: 'sokralnya-hall', before: 'battle-cult-cell', once: true },
  cast: {
    hero: { k: 'hero' },
    priest: { name: 'Кибер-Жрец', model: 'outfit_cyber_m', portrait: 'cyber-priest', voice: { gender: 'm', race: 'human', pitch: 100, choir: 3 } },
    lyosha: { name: 'Лёша', model: 'hero_m_field', hair: 'short', portrait: 'courier', voice: { gender: 'm', race: 'human', pitch: 150 } },
    cult: { name: 'Секретарь суда', model: 'outfit_cyber_f', portrait: 'cultist', voice: { gender: 'f', race: 'human', pitch: 200 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>push:6', fx: [{ k: 'fade', from: 'black', d: 1 }],
      set: { priest: { at: [0, -2], anim: 'idle' }, lyosha: { at: [0, 0.5], anim: 'sit', emo: 'scared' }, cult: { at: [-2.5, -1.5], anim: 'idle' }, hero: { at: [0, 6], face: 'priest', anim: 'crouch_walk' } },
      lines: [
        { w: 'priest', t: 'Суд идёт. Заседание открыто. Закрыть его будет некому.', vox: 'choir' },
        { w: 'cult', t: 'Обвиняется: Лёша, почтальон. Статья: незаявленное существование.', p: 0.5 },
        { w: 'lyosha', t: 'Я письмо принёс! До востребования! Открытку от тёти!', emo: 'scared', p: 0.4 },
        { w: 'priest', t: 'Открытка приобщена как улика. Тётя вызывается свидетелем.', vox: 'choir', p: 0.6 },
      ],
      next: 'notice',
    },
    notice: {
      shot: 'close:priest>push:4', set: { priest: { face: 'hero', anim: 'talk' } },
      lines: [
        { w: 'priest', t: 'А вот и второй подсудимый. Вы опоздали к началу заседания.', vox: 'choir', p: 1 },
        { w: 'priest', t: 'Мы ищем тело. Идеальное. Встаньте ровно... Плечи. Спина. Хороший материал.', vox: 'choir', p: 0.7, emo: 'smug' },
      ],
      react: { who: 'hero', shot: 'xclose:hero', emo: 'cringe', sec: 1.2 },
      choice: {
        sec: 9, who: 'priest',
        opts: [
          { id: 'protest', l: 'Заявить протест по процедуре', tone: 'smart', next: 'p-protest', on: { flag: { 'cine-c2-stalled': true }, ctr: { calm: 1 } } },
          { id: 'shoot', l: 'Выстрелить в терминал', tone: 'hard', next: 'p-shoot', on: { flag: { 'cine-c2-shot': true }, rem: { who: 'lyosha', t: 'Лёша запомнит, что ты начал стрелять первым.' } } },
          { id: 'swap', l: 'Занять место Лёши', tone: 'kind', next: 'p-swap', on: { rel: { lyosha: 2 }, rem: { who: 'lyosha' } } },
        ],
        silence: { l: 'Молчать', next: 'p-silent', on: { flag: { 'cine-c2-guilty': true } } },
      },
    },
    'p-protest': {
      shot: 'two:priest:hero', set: { hero: { anim: 'point' }, lyosha: { anim: 'crouch_walk' } },
      lines: [
        { w: 'priest', t: 'Протест... принят к рассмотрению. В порядке очереди.', vox: 'choir', emo: 'neutral' },
        { w: 'cult', t: 'Ваш номер — четыре миллиона сто восемнадцать тысяч девятьсот два.', p: 0.4 },
        { w: 'cult', t: 'Скорость очереди — один номер в год. Приходите в сорок два миллиона четыреста тридцатом.', p: 0.5, emo: 'cringe' },
      ],
      react: { who: 'lyosha', shot: 'med:lyosha', emo: 'surprised', sec: 1.5, anim: 'crouch_walk' },
      next: 'tail',
    },
    'p-shoot': {
      shot: 'low:hero>shake', fx: [{ k: 'sfx', id: 'crit' }, { k: 'shake', amp: 0.2 }],
      set: { hero: { anim: 'attack_shoot' }, priest: { anim: 'hit', emo: 'angry' } },
      lines: [
        { w: 'priest', t: 'Вы... ПЕРЕБИЛИ... СУД!', vox: 'choir', emo: 'angry' },
        { w: 'cult', t: 'Это нарушение! Это... это даже не прописано, потому что никто не думал!', emo: 'scared', p: 0.3 },
      ],
      next: 'tail',
    },
    'p-swap': {
      shot: 'ots:priest:hero', set: { hero: { anim: 'nod' } }, hold: 0.8,
      lines: [
        { w: 'priest', t: 'Подмена подсудимого допускается при уплате пошлины.', vox: 'choir' },
        { w: 'priest', t: 'Пошлина — одно воспоминание. Мы сами выберем. Не больно. Почти.', vox: 'choir', p: 0.3, emo: 'smug' },
      ],
      qte: { kind: 'seq', keys: ['Q', 'E', 'Q'], sec: 3.5, label: 'Удержать мысль!',
        ok: { next: 'swap-ok', on: { flag: { 'cine-c2-impressed': true }, ctr: { calm: 1 } } },
        fail: { next: 'swap-fail', on: { mrlPct: -10, flag: { 'cine-c2-memory-lost': true } } } },
    },
    'swap-ok': {
      shot: 'close:priest', set: { priest: { emo: 'surprised', anim: 'shake' } },
      lines: [{ w: 'priest', t: 'Воспоминание не извлеклось. Бракованное. Или очень упрямое.', vox: 'choir', emo: 'surprised' }],
      next: 'tail',
    },
    'swap-fail': {
      shot: 'xclose:hero', fx: [{ k: 'grade', id: 'white-flash', d: 0.4 }],
      lines: [{ w: 'priest', t: 'Принято. Какое — не скажу. Узнаете, когда понадобится.', vox: 'choir', emo: 'smug', p: 0.8 }],
      next: 'tail',
    },
    'p-silent': {
      shot: 'close:priest>push:3',
      lines: [
        { w: 'priest', t: 'Молчание — признание. Протокол это одобряет.', vox: 'choir', p: 1.2 },
        { w: 'cult', t: 'Он согласился?', emo: 'surprised', p: 0.4 },
        { w: 'priest', t: 'Он согласился. Приговор: кринж первой степени. Исполнять немедленно.', vox: 'choir', p: 0.4 },
      ],
      qte: { kind: 'seq', keys: ['W', 'A', 'S', 'D'], sec: 3.2, label: 'Выдержать приговор!',
        ok: { next: 'tail', on: { flag: { 'cine-c2-resisted': true } } },
        fail: { next: 'tail', on: { mrlPct: -10 } } },
    },
    tail: {
      shot: 'close:priest>fig8:8', fx: [{ k: 'music', id: 'tension', fade: 1 }],
      set: { priest: { at: [0, -4], face: 'hero', anim: 'talk' }, cult: { anim: 'attack_shoot' } },
      lines: [
        { w: 'priest', t: 'Подсудимый... у вас хорошая осанка. Не сутультесь, пока вас судят.', vox: 'choir', emo: 'smug' },
        { w: 'priest', t: 'Мы вернёмся. Мы всегда возвращаемся. Такая у нас, к сожалению, работа.', vox: 'choir', p: 0.7 },
        { w: 'cult', t: 'Охрана! Исполнять!', p: 0.5, emo: 'angry' },
      ],
      end: { result: 'to-battle-cult-cell', on: { flag: { 'met-priest': true } } },
    },
  },
};
