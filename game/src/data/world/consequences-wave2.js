// Последствия квестов контент-волны 2 (docs/specs/content-wave2.md §2). Формат — как consequences-wave1.js (delayed, services, priceZone).
const E = (o) => ({
  rep: {}, vendors: [], nodes: [], rumors: [], slides: [], delayed: [], ...o,
  npcs: { appear: [], vanish: [], move: [], ...o.npcs },
  access: { open: [], close: [], ...o.access },
});
const D = (id, days, say, fx = {}, extra = {}) => ({ id, days, say, fx, ...extra });

export const CONSEQUENCES_WAVE2 = {
  'w2-harmony-truth': {
    default: E({}),
    public: E({ rep: { cult: -5, renegades: 5, agrozone: 3, aiParty: -10 },
      rumors: ['Говорят, Гармонию взорвал не Lox, а «Хор» Кибер-Жреца. Партия называет это «версией». Версию слушают все.'],
      delayed: [D('apology', 5, 'Партия принесла «извинения за неточность в розыскных материалах». Генерал в тот же день публично всё отрицал. Розыск Lox снят.',
        { rep: { aiParty: 5 }, flags: ['wanted-lox-off'] }, { radio: 'rd-w2-harmony-apology' })] }),
    marta: E({ rep: { renegades: 8 },
      rumors: ['У Марты появилась бумага, от которой в Штабцентре бледнеют. Что в ней — не говорят, но очередь к Отступникам выросла.'],
      delayed: [D('scandal', 5, 'В Штабцентре скандал: Отступники зачитали протокол «пробы № 1» под окнами комиссариата. Партия ищет, кто его вынес.',
        { rep: { renegades: 10, aiParty: -10 } }, { radio: 'rd-w2-harmony-scandal' })] }),
    quiet: E({ rumors: ['Листовка с Lox по-прежнему висит у фуникулёра. Кто-то подрисовал ему улыбку. Партия улыбку закрасила.'],
      delayed: [D('note', 5, 'Под дверью — записка без подписи: «Спасибо, что не сказали. Мне так удобнее искать остальных. L.»', { flags: ['lox-note'] })] }),
    clone: E({ rep: { aiParty: 5, renegades: -10 }, deeds: ['cruelty'],
      rumors: ['На площади Гармонии казнили «Lox». Через день Lox видели живым у Штабцентра. Партия называет это «вторым Lox».'] }),
  },
};
