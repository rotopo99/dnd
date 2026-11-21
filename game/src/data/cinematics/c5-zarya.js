// C5 «Чай» — романтическая сцена (Заря, свидание 2). Тепло, неловко, без откровенного (затемнение). ~2.5 мин.
// Герой молчит; пол героя не упоминается (genderize не нужен). Заря — бывшая Чистильщица, не умеет принимать нежность.
export const C5_ZARYA = {
  id: 'c5-zarya', title: 'Чай', mins: 1.5, music: 'romance', stage: 'roof-night',
  trigger: { romance: 'zarya', date: 2, once: true }, req: { bond: { zarya: 40 }, party: 'zarya' },
  cast: {
    hero: { k: 'hero' },
    zarya: { name: 'Заря', model: 'hero_f_field', hair: 'ponytail', portrait: 'zarya', voice: { gender: 'f', race: 'human', pitch: 210 } },
  },
  start: 'roof',
  beats: {
    roof: {
      shot: 'wide>crane:6', fx: [{ k: 'fade', from: 'black', d: 1.5 }],
      set: { zarya: { at: [0, 0], face: [0, 4], anim: 'sit', emo: 'neutral' }, hero: { at: [3, 1], face: 'zarya', anim: 'walk' } },
      lines: [
        { w: 'narr', t: 'Край платформы. Внизу — облака, вверху — искры сварки.', p: 0.3 },
        { w: 'zarya', t: 'Не подкрадывайся. Я отучаюсь стрелять на звук. Но не сегодня.', p: 0.6, emo: 'smug' },
      ],
      next: 'mug',
    },
    mug: {
      shot: 'two:zarya:hero', set: { zarya: { face: 'hero', anim: 'talk' }, hero: { at: [1.2, 0.6] } },
      lines: [
        { w: 'zarya', t: 'Чай. Из... в общем, горячий. На вкус — как ремонт.' },
        { w: 'zarya', t: 'Хочешь? Вторая кружка.', p: 0.5, emo: 'happy' },
      ],
      choice: {
        sec: 9, who: 'zarya',
        opts: [
          { id: 'take', l: 'Взять кружку', tone: 'kind', next: 'm-take', on: { bond: { zarya: 2 } } },
          { id: 'song', l: 'Спросить про песню, которую она напевала', tone: 'smart', next: 'm-song', on: { bond: { zarya: 3 }, flag: { 'zarya-song': true } } },
          { id: 'fun', l: 'Покивать с видом знатока: «Ремонт — это комплимент?»', tone: 'funny', next: 'm-fun', on: { bond: { zarya: 2 } } },
        ],
        silence: { l: 'Молча сесть рядом', next: 'm-sit', on: { bond: { zarya: 2 } } },
      },
    },
    'm-take': { shot: 'xclose:hero', set: { hero: { anim: 'reach' } }, lines: [{ w: 'zarya', t: 'Осторожно, горячая. И ручка отваливается. Держи за бок. Так надёжнее.', emo: 'happy' }], next: 'thanks' },
    'm-song': {
      shot: 'close:zarya', set: { zarya: { emo: 'surprised' } },
      lines: [
        { w: 'zarya', t: 'Услышал? Это колыбельная. Её пела... не важно. Я слов не помню. Мотив помню.', emo: 'sad', p: 0.5 },
        { w: 'zarya', t: 'Как плохой выстрел: не попал, а всё равно звенит в ушах.', p: 0.6, emo: 'cringe' },
      ],
      next: 'thanks',
    },
    'm-fun': {
      shot: 'close:zarya', set: { zarya: { emo: 'happy', anim: 'laugh' } }, fx: [{ k: 'vox', kind: 'laugh', who: 'zarya' }],
      lines: [{ w: 'zarya', t: 'Ха! Нет. Это констатация факта. Комплименты я пока не освоила. Дойдём.', p: 0.4 }],
      next: 'thanks',
    },
    'm-sit': { shot: 'two:zarya:hero>pull:6', set: { hero: { at: [0.7, 0], anim: 'sit' } }, hold: 2, lines: [{ w: 'zarya', t: 'Спасибо, что не стал говорить. Тихо — это тоже умение.', p: 1.5, emo: 'happy' }], next: 'thanks' },
    thanks: {
      shot: 'close:zarya>push:5', set: { zarya: { emo: 'sad', anim: 'talk' } },
      lines: [
        { w: 'zarya', t: 'Я не умею, когда за меня... когда делают добро. Меня учили наоборот.', p: 0.5 },
        { w: 'zarya', t: 'Каждый раз думаю: что потом попросят взамен? А ты не просишь. И я теряюсь.', p: 0.8 },
      ],
      choice: {
        sec: 10, who: 'zarya',
        opts: [
          { id: 'proud', l: 'Показать жестом: гордишься ею', tone: 'kind', next: 't-proud', on: { bond: { zarya: 4 }, rem: { who: 'zarya' } } },
          { id: 'learn', l: 'Показать: учиться — не стыдно', tone: 'smart', next: 't-learn', on: { bond: { zarya: 3 } } },
          { id: 'ask', l: 'Дотронуться до её кружки: «Ничего не нужно»', tone: 'funny', next: 't-ask', on: { bond: { zarya: 2 } } },
        ],
        silence: { l: 'Молчать', next: 't-silent', on: { bond: { zarya: 1 } } },
      },
    },
    't-proud': { shot: 'xclose:zarya', set: { zarya: { emo: 'happy' } }, hold: 1, lines: [{ w: 'zarya', t: 'Не надо... Хотя — скажи ещё. Тише. Только без свидетелей.', emo: 'happy', p: 0.8 }], next: 'hands' },
    't-learn': { shot: 'close:zarya', lines: [{ w: 'zarya', t: 'Учиться... У меня был плохой учитель. Он любил распорядок. Ты — лучше.', p: 0.5, emo: 'happy' }], next: 'hands' },
    't-ask': { shot: 'two:zarya:hero', set: { zarya: { emo: 'cringe' } }, lines: [{ w: 'zarya', t: '«Ничего не нужно»... Ужасная формулировка. Для меня — как расстёгнутый ремень. Но спасибо.', p: 0.5, emo: 'happy' }], next: 'hands' },
    't-silent': { shot: 'close:hero', hold: 1.5, lines: [{ w: 'zarya', t: 'Тишина. Хорошо. С тобой она не страшная.', p: 1.5, emo: 'sad' }], next: 'hands' },
    hands: {
      shot: 'xclose:zarya>push:4', fx: [{ k: 'music', id: 'romance', fade: 2 }],
      set: { zarya: { emo: 'neutral', anim: 'reach' } },
      lines: [{ w: 'narr', t: 'Её рука рядом с твоей. Кружки уже остыли.', p: 1 }],
      qte: { kind: 'hold', keys: ['E'], sec: 4, need: 2.5, label: 'Не убирать руку',
        ok: { next: 'warm', on: { bond: { zarya: 4 }, flag: { 'zarya-held': true } } },
        fail: { next: 'soft', on: { bond: { zarya: 1 } } } },
    },
    warm: {
      shot: 'close:zarya', set: { zarya: { emo: 'happy' } },
      lines: [{ w: 'zarya', t: 'Рука тёплая. Странно. У меня всегда было — как у железа.', emo: 'happy', p: 0.9 }],
      next: 'radio',
    },
    soft: {
      shot: 'two:zarya:hero', set: { zarya: { emo: 'happy', anim: 'laugh' } },
      lines: [{ w: 'zarya', t: 'Мы оба ничего не умеем. Ничего. Давай в другой раз. Я потренируюсь на кружке.', p: 0.5, emo: 'happy' }],
      next: 'radio',
    },
    radio: {
      shot: 'wide>pull:7', fx: [{ k: 'fade', to: 'black', d: 2, after: 6 }],
      lines: [
        { w: 'narr', t: 'Из её рации тихо: «Голос Пустошей. Для тех, кто не спит: реклама мыла. Для тех, кто не один: тоже реклама мыла.»', p: 1 },
        { w: 'zarya', t: '...Выключу.', p: 0.5, emo: 'cringe' },
        { w: 'zarya', t: 'Нет, оставлю. Пусть играет.', p: 0.9, emo: 'happy' },
      ],
      end: { result: 'date-done', on: { flag: { 'zarya-date-c5': true }, romance: { zarya: 'date' } } },
    },
  },
};
