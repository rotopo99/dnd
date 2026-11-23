// C8 «Имя» — перед ареной Великого Собирателя (content-wave2.md §3, BIBLE §4.11, T12): полковник Г. А. Ладов,
// выжженный командир Предложки, примеряет чужие души в поисках своей. Предложка из стыда не зовёт его по имени —
// начать должен герой. QTE seq «Г-А-Л-Д»: имя целиком (ladov-named) или оборванное (ladov-torn); обмен душой — ladov-trade.
// Исходы читает арена (cine-hooks CINE_ENCOUNTER_MODS / CINE_BATTLE_SKIP). ~2 мин.
export const C8_LADOV_NAME = {
  id: 'c8-ladov-name', title: 'Имя', mins: 2, music: 'cringe-low', stage: 'collector-hall',
  trigger: { at: 'arena-great-collector', before: 'arena-great-collector', needFlag: 'ladov-name-known', once: true },
  cast: {
    hero: { k: 'hero' },
    ladov: { name: 'Великий Собиратель', model: 'ladov', portrait: 'great-collector', look: 'blank', voice: { gender: 'm', race: 'human', pitch: 82 } },
    keeper: { name: 'Хранитель Истории', model: 'hero_m_rags', hair: 'long', portrait: 'keeper-of-history', voice: { gender: 'm', race: 'human', pitch: 125 } },
    choir: { name: 'Предложка', model: null, portrait: 'predlozhka-1', voice: { gender: 'm', race: 'human', pitch: 110, choir: 3 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>crane:7', fx: [{ k: 'fade', from: 'black', d: 1.5 }],
      set: {
        ladov: { at: [0, -3], face: [0, 3], anim: 'reach' },
        hero: { at: [0.8, 3], face: 'ladov', anim: 'idle' }, keeper: { at: [-1.6, 3.4], face: 'ladov', anim: 'idle', emo: 'scared' },
      },
      lines: [
        { w: 'narr', t: 'Зал Коллекции. Витрины до потолка. В каждой — чьи-то глаза. На каждой — табличка с именем.' },
        { w: 'narr', t: 'Тишина такая, что слышно, как пыль ложится по инвентарной описи.', p: 1 },
      ],
      hold: 1.2,
      next: 'ladov',
    },
    ladov: {
      shot: 'low:ladov>push:5',
      lines: [
        { w: 'ladov', t: 'Подходит? Нет. Следующий.', p: 0.4 },
        { w: 'ladov', t: 'Душа номер четыре тысячи двенадцать. Тоже нет. Слишком весёлая.', p: 0.8 },
      ],
      next: 'turn',
    },
    turn: {
      shot: 'ots:hero:ladov', set: { ladov: { face: 'hero', anim: 'talk' } },
      lines: [
        { w: 'ladov', t: 'Посетитель. Музей закрыт. Навсегда.', p: 0.5 },
        { w: 'ladov', t: 'Но вы можете стать экспонатом. Это бесплатно. Это вообще ничего не стоит — я проверял.', p: 0.6 },
      ],
      react: { who: 'keeper', shot: 'med:keeper', emo: 'scared', sec: 1.4 },
      next: 'choice',
    },
    choice: {
      shot: 'two:ladov:hero',
      choice: {
        sec: 10, who: 'ladov',
        opts: [
          { id: 'name', l: 'Назвать его по имени', tone: 'kind', next: 'say', on: { flag: { 'cine-c8-said': true } } },
          { id: 'file', l: 'Показать «Личное дело № 0»', tone: 'smart', next: 'c-file' },
          { id: 'trade', l: 'Предложить обмен: душу-замену вместо экспонатов', tone: 'hard', next: 'c-trade' },
        ],
        silence: { l: 'Молчать', next: 'c-silent' },
      },
    },
    'c-silent': {
      shot: 'close:ladov', hold: 1,
      lines: [
        { w: 'ladov', t: 'Молчание. Моё любимое. У меня его целый склад.', p: 1.2 },
        { w: 'keeper', t: '(шёпотом) Скажи его. Мы не можем первыми. Стыдно.', p: 0.6, emo: 'sad' },
      ],
      next: 'say',
    },
    say: {
      shot: 'med:keeper', set: { keeper: { anim: 'talk', emo: 'sad' } },
      lines: [{ w: 'keeper', t: 'Г. А. Ладов. Полковник. По слогам: он отвык от длинного.', emo: 'sad' }],
      next: 'name',
    },
    name: {
      shot: 'close:hero>push:3',
      qte: { kind: 'seq', keys: ['G', 'A', 'L', 'D'], sec: 5.6, label: 'Назвать: G-A-L-D (Г-А-Л-Д)',
        ok: { next: 'choir', on: { rel: { 'keeper-of-history': 1 } } },
        fail: { next: 'torn' } },
    },
    'c-file': {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [
        { w: 'ladov', t: 'Личное дело номер ноль. Графа «владелец» вырезана. Аккуратно. Это мой почерк.', p: 0.4 },
        { w: 'ladov', t: 'Приказ две тысячи четвёртого: «переносить без остатка». Я перенёс. Остаток — я.', p: 1 },
      ],
      react: { who: 'keeper', shot: 'med:keeper', emo: 'surprised', sec: 1.2 },
      next: 'choir',
    },
    choir: {
      shot: 'wide>orbit:7', fx: [{ k: 'sfx', id: 'summon' }],
      set: { keeper: { anim: 'hands_up', emo: 'sad' }, ladov: { anim: 'idle', emo: 'neutral' } },
      lines: [
        { w: 'choir', t: 'Полковник Ладов.', vox: 'choir', p: 0.6 },
        { w: 'choir', t: 'Г. А. Ладов. Командир Предложки. Мы ваши. Мы пришли по списку.', vox: 'choir', p: 0.5 },
      ],
      hold: 1.8,
      next: 'react',
    },
    react: {
      shot: 'close:ladov>push:4', set: { ladov: { anim: 'shrug' } },
      lines: [
        { w: 'ladov', t: 'Это... звучит знакомо?', p: 1.4 },
        { w: 'ladov', t: 'Нет. Звучит как приказ.', p: 1 },
        { w: 'ladov', t: 'Приказы я выполняю. Экспонаты — вернуть владельцам. По описи.', p: 0.8 },
      ],
      next: 'after',
    },
    after: {
      shot: 'two:keeper:hero', set: { keeper: { anim: 'sit', emo: 'surprised' } },
      lines: [{ w: 'keeper', t: 'Он сказал «владельцам». Этого слова у него не было двадцать лет. Запишу. Сноской.', p: 0.6, emo: 'happy' }],
      end: { result: 'ladov-named', on: { flag: { 'ladov-named': true }, rem: { who: 'keeper', t: 'Предложка запомнит, кто начал первым.' } } },
    },
    torn: {
      shot: 'dutch:ladov', fx: [{ k: 'glitch', d: 0.5 }],
      lines: [
        { w: 'narr', t: 'Имя рвётся на «Лад...». Получается «ладно».', p: 0.3 },
        { w: 'ladov', t: 'Ладно? Ладно. Принято. Следующий.', p: 0.6 },
        { w: 'keeper', t: 'Он услышал «ладно». Он всю жизнь слышал «ладно».', p: 0.7, emo: 'sad' },
      ],
      end: { result: 'ladov-torn', on: { flag: { 'ladov-torn': true } } },
    },
    'c-trade': {
      shot: 'two:ladov:hero>push:5', set: { ladov: { anim: 'reach' } },
      lines: [
        { w: 'ladov', t: 'Обмен? Одна душа вместо коллекции. Невыгодно. Но в ней может оказаться то, что мне подходит.', p: 0.5 },
        { w: 'ladov', t: 'Опись принимает. Подпишите здесь. И здесь. И вот тут, где мелко: «безвозвратно».', p: 0.7, emo: 'smug' },
      ],
      react: { who: 'keeper', shot: 'med:keeper', emo: 'sad', sec: 1.2 },
      next: 'trade-end',
    },
    'trade-end': {
      shot: 'high:hero>pull:6', fx: [{ k: 'grade', id: 'white-flash', d: 0.6 }],
      lines: [
        { w: 'keeper', t: 'Не надо... Хотя кто я такой, чтобы спорить. Я — сноска.', emo: 'sad' },
        { w: 'ladov', t: 'Подходит? ...Почти. Экспонаты свободны. Посетитель — тоже. Частично.', p: 1.2 },
      ],
      end: { result: 'ladov-trade', on: { flag: { 'ladov-trade': true }, mrlPct: -15 } },
    },
  },
};
