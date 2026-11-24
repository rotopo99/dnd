// Последствия квестов контент-волны 4 (docs/specs/content-wave4.md §2). Формат — как consequences-wave3.js.
// Слайды эпилога финала (§4) — EPILOGUE_WAVE4 (world/data.js добавляет их в EPILOGUE; отбор — world/consequences.js epilogueSlides).
const E = (o) => ({
  rep: {}, vendors: [], nodes: [], rumors: [], slides: [], delayed: [], ...o,
  npcs: { appear: [], vanish: [], move: [], ...o.npcs },
  access: { open: [], close: [], ...o.access },
});
const NODE = (desc, tone = 'good') => [{ loc: 'raytsentr', desc, glyph: '☾', tone }];

export const CONSEQUENCES_WAVE4 = {
  'mq4-eve': {
    default: E({ rep: { pirates: 5, neutralVillages: 5 },
      nodes: NODE('Райцентр пережил ночь. На валу — свежие доски и мелом: «Повестку получили».'),
      rumors: ['Говорят, в Райцентре души шли к валу строем, как в очередь. Очередь не прошла.'] }),
    turned: E({ rep: { pirates: 5, neutralVillages: 5, cult: -10 },
      nodes: NODE('Райцентр пережил ночь. У ворот сидит бывший Кибер-Жрец и учится говорить без хора.'),
      rumors: ['Кибер-Жрец ушёл от хора. Говорят, впервые в жизни заказал еду себе, а не Судье.'] }),
    beaten: E({ rep: { pirates: 8, cult: -15 },
      nodes: NODE('Райцентр пережил ночь. Хор разошёлся, у ворот — пятно, которое никто не моет.'),
      rumors: ['Кибер-Жреца победили у ворот Райцентра. Хор разошёлся по домам. У них были дома.'] }),
  },
};
export const EPILOGUE_WAVE4 = [];
