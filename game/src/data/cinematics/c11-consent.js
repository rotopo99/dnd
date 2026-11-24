// C11 «Согласие» — поворот поздней игры (content-wave4.md §3). Вал Райцентра, «Последняя ночь» (mq4-eve, стадия twist).
// [додумано; BIBLE T5, решение режиссёра 2026-11-24] В бланке «Рассвета» есть строка «Согласие добровольца»: Судья — Арбитраж,
// ему нужна подпись подсудимого. Куксиус №0 подписал в 2012, не читая. Отметины героя — попытки получить подпись.
// Рассказчик по приоритету: Куксиус (kuksius-helped / dawn-archive), иначе Архонт (archon-ally), иначе Сера (лог ретранслятора).
// Исходы (cine-hooks CINE_RESULT_NEXT: любой → стадия wall-1): c11-known / c11-torn / c11-signed / c11-signed-bad / c11-silent. ~2 мин.
export const C11_CONSENT = {
  id: 'c11-consent', title: 'Согласие', mins: 2, music: 'cyberspace', stage: 'roof-night',
  trigger: { at: 'mq4-twist', once: true },
  cast: {
    hero: { k: 'hero' },
    kuksius: { name: 'Куксиус', model: 'hero_m_field', hair: 'short', portrait: 'kuksius', look: 'blank', voice: { gender: 'm', race: 'human', pitch: 70 } },
    archon: { name: 'Архонт', model: 'hero_m_uniform', hair: 'short', portrait: 'archon', voice: { gender: 'm', race: 'android', pitch: 95 } },
    sera: { name: 'Сера', model: 'hero_f_field', hair: 'ponytail', portrait: 'sera', voice: { gender: 'f', race: 'human', pitch: 220 } },
  },
  start: 'open',
  beats: {
    open: {
      shot: 'wide>crane:6', fx: [{ k: 'fade', from: 'black', d: 1.4 }],
      set: {
        hero: { at: [0, 2.4], face: [0, -1], anim: 'idle' },
        kuksius: { at: [-1.6, -0.6], face: 'hero', anim: 'idle' },
        archon: { at: [1.6, -0.6], face: 'hero', anim: 'idle' },
        sera: { at: [0, -2.2], face: 'hero', anim: 'idle' },
      },
      lines: [
        { w: 'narr', t: 'Вал Райцентра. Ночь. Терминалы за рекой поют одну ровную ноту.' },
        { w: 'narr', t: 'На доске у костра — бланк «Рассвета». Кто-то принёс его сюда и ушёл.', p: 0.6 },
      ],
      next: 'who',
    },
    who: { branch: [{ if: { any: ['kuksius-helped', 'dawn-archive'] }, next: 'k-intro' }, { if: { flag: 'archon-ally' }, next: 'a-intro' }, { next: 's-intro' }] },
    'k-intro': {
      shot: 'med:kuksius>push:5', set: { kuksius: { anim: 'talk' } },
      lines: [
        { w: 'kuksius', t: 'Это мой бланк. Номер ноль. Я его подписал в двенадцатом году. Не читая.' },
        { w: 'kuksius', t: 'Внизу мелким шрифтом: «на вечность». Я думал, это опечатка.', p: 0.5, emo: 'sad' },
      ],
      next: 'k-vessel',
    },
    'k-vessel': { branch: [{ if: { flag: 'vessel-hero' }, next: 'k-tried' }, { next: 'line' }] },
    'k-tried': {
      shot: 'close:kuksius', set: { kuksius: { emo: 'surprised' } },
      lines: [{ w: 'kuksius', t: 'Ты уже примерялся. Сосуд тебе шёл. Это меня и пугает.', emo: 'scared' }],
      next: 'line',
    },
    'a-intro': {
      shot: 'med:archon>push:5', set: { archon: { anim: 'talk' } },
      lines: [
        { w: 'archon', t: 'Я — сосуд номер два. Мне жмёт. Хотите знать почему? Я подписал не своё согласие.' },
        { w: 'archon', t: 'Бланк один на всех. Строка одна. Подпись — каждого.', p: 0.5 },
      ],
      next: 'line',
    },
    's-intro': {
      shot: 'med:sera>push:5', set: { sera: { anim: 'talk' } },
      lines: [
        { w: 'sera', t: 'Я ещё раз прогнала лог ретранслятора. «Рассвет» — не шифр. Это бланк.' },
        { w: 'sera', t: 'В нём графа, которой нет в протоколах Партии. Графа для подписи.', p: 0.5 },
      ],
      next: 'line',
    },
    line: {
      shot: 'xclose:hero', fx: [{ k: 'music', id: 'tension', fade: 2 }],
      lines: [
        { w: 'narr', t: 'Строка: «Согласие добровольца». Ниже — пусто.' },
        { w: 'narr', t: 'Судья не берёт тела силой. Он Арбитраж: ему нужна подпись подсудимого. Каждая Отметина была просьбой расписаться.', p: 0.7 },
        { w: 'narr', t: 'Без согласия сосуд не работает.', p: 0.6 },
      ],
      react: { who: 'hero', shot: 'close:hero', emo: 'surprised', sec: 1 },
      next: 'decide',
    },
    decide: {
      shot: 'two:hero:kuksius',
      choice: {
        sec: 10, who: 'kuksius',
        opts: [
          { id: 'read', l: 'Прочитать бланк до конца', tone: 'smart', next: 'read' },
          { id: 'tear', l: 'Порвать бланк', tone: 'hard', next: 'tear' },
          { id: 'sign', l: 'Подписать самому — понарошку', tone: 'funny', next: 'sign' },
        ],
        silence: { l: 'Молчать', next: 'silent' },
      },
    },
    read: {
      shot: 'close:hero>push:4', set: { hero: { anim: 'nod' } },
      lines: [
        { w: 'narr', t: 'Пункт сорок: «Согласие может быть отозвано до вынесения приговора». Мелким шрифтом. Но есть.' },
        { w: 'kuksius', t: 'Сорок лет носил и не дочитал. Спасибо. Это пойдёт в протокол.', p: 0.5, emo: 'happy' },
      ],
      end: { result: 'c11-known', on: { flag: { 'consent-known': true }, rel: { kuksius: 1 }, rem: { who: 'kuksius', t: 'Куксиус запомнит это.' } } },
    },
    tear: {
      shot: 'close:hero', set: { hero: { anim: 'attack_melee' } }, fx: [{ k: 'shake', amp: 0.12 }],
      lines: [
        { w: 'narr', t: 'Бумага рвётся неохотно, как будто её делали на века. Обрывки уносит к реке.' },
        { w: 'kuksius', t: 'Бланка больше нет. Доказательства — тоже. Но и подписать теперь нечего.', p: 0.5, emo: 'sad' },
      ],
      end: { result: 'c11-torn', on: { flag: { 'consent-torn': true } } },
    },
    sign: {
      shot: 'xclose:hero', set: { hero: { anim: 'reach' } },
      lines: [{ w: 'narr', t: 'Ручка тяжёлая, как печать. Подпись должна выйти чужой — тогда она не считается.' }],
      qte: { kind: 'seq', keys: ['Q', 'W', 'E'], sec: 2.5, label: 'ПОДПИСЬ',
        ok: { next: 'sign-ok' }, fail: { next: 'sign-bad' } },
    },
    'sign-ok': {
      shot: 'two:hero:kuksius', set: { kuksius: { emo: 'surprised' } },
      lines: [{ w: 'kuksius', t: 'Закорючка. Не ваша. Судья примет её за согласие — и ошибётся. Хитро.', emo: 'happy' }],
      end: { result: 'c11-signed', on: { flag: { 'consent-signed': true }, rel: { kuksius: 1 }, rem: { who: 'kuksius', t: 'Куксиус запомнит это.' } } },
    },
    'sign-bad': {
      shot: 'high:hero>pull:4', fx: [{ k: 'grade', id: 'white-dim' }],
      lines: [
        { w: 'narr', t: 'Подпись вышла ровной. Своей. Бланк вздрогнул и улетел к Двери, как письмо по адресу.' },
        { w: 'kuksius', t: 'Ой. Теперь у него есть ваш почерк.', p: 0.5, emo: 'scared' },
      ],
      end: { result: 'c11-signed-bad', on: { flag: { 'consent-signed': true, 'judge-has-signature': true } } },
    },
    silent: {
      shot: 'high:hero>pull:5', hold: 1,
      lines: [{ w: 'kuksius', t: 'Ты хотя бы не подписал. Это уже больше, чем я.', p: 0.6 }],
      end: { result: 'c11-silent', on: { flag: { 'consent-silent': true } } },
    },
  },
};
