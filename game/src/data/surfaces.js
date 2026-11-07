// Поверхности на клетках боя (Этап B). Спека — docs/specs/statuses-surfaces.md, разделы 4–7.
// Движок — rules/surfaces.js (получает эти данные через data.SURFACES / data.SURFACE_RULES).
//
// Поверхность:
//   layer  — 'floor' (лужа) | 'gas' (облако поверх; на клетке не больше 1 floor + 1 gas)
//   turns  — длительность в раундах по умолчанию (−1 в начале раунда)
//   enter  — эффект при входе и в начале хода на клетке:
//     dice/dmgType — урон × tier(L) (L — уровень создателя), save — спас (успех: половина урона, без статусов)
//     statuses — [[id, раунды]]; organic — статусы только живым; mech — статусы только машинам
//   ai     — штраф клетки для ИИ (спека §7)
//   color/core — ключи палитры STYLE (C в ui/draw.js); anim — 'flicker' | 'arc' | 'shine' | 'bubble' | 'pulse' | 'fog' | 'stripes'
//   desc   — строка эффекта в подсказке клетки; interacts — «Взаимодействует: …»

export const SURFACES = {
  fire: {
    id: 'fire', name: 'Огонь', layer: 'floor', turns: 4, color: 'e', core: 'b', anim: 'flicker', ai: 8,
    enter: { dice: '1d6', dmgType: 'fire', save: 'dex', statuses: [['burn', 3]] },
    desc: '1d6 огня и горение 3 р. (спас ЛВК — половина, без горения).',
    interacts: 'масло — пожар, вода — пар, лёд — тает, газ — взрыв',
  },
  electric: {
    id: 'electric', name: 'Ток', layer: 'floor', turns: 2, color: 'h', core: '5', anim: 'arc', ai: 7,
    enter: { dice: '1d6', dmgType: 'electric', statuses: [['shocked', 1]] },
    desc: '1d6 электро и шок.',
    interacts: 'вода и кровь — электролужа, масло — искра, газ — взрыв, лёд — трескается',
  },
  water: {
    id: 'water', name: 'Вода', layer: 'floor', turns: 8, color: 'f', core: 'h', anim: 'shine', ai: 0,
    enter: { statuses: [['wet', 3]] },
    desc: 'Мокрый 3 р., тушит горение.',
    interacts: 'ток — электролужа, огонь — пар, холод — лёд, кислота — растворяется',
  },
  oil: {
    id: 'oil', name: 'Масло', layer: 'floor', turns: 10, color: '6', core: 'o', anim: 'shine', ai: 3,
    enter: { statuses: [['oiled', 3], ['slick', 2]] },
    desc: 'В масле 3 р., скольжение 2 р.',
    interacts: 'огонь и искра — пожар, кислота — растворяет',
  },
  acid: {
    id: 'acid', name: 'Кислота', layer: 'floor', turns: 5, color: 'j', core: 'k', anim: 'bubble', ai: 6,
    enter: { dice: '1d4', dmgType: 'toxin', save: 'con', statuses: [['acid', 3]], mech: [['corrosion', 2]] },
    desc: '1d4 яда и кислота 3 р. (спас ТЕЛ — половина, без статуса); машинам — коррозия.',
    interacts: 'вода — растворяется, огонь — токсин-газ, масло — дым',
  },
  toxgas: {
    id: 'toxgas', name: 'Токсин-газ', layer: 'gas', turns: 3, color: 'k', core: 'j', anim: 'fog', ai: 6,
    enter: { dice: '1d4', dmgType: 'toxin', statuses: [['poison', 2], ['choking', 2]] },
    desc: '1d4 яда, отравление и удушье. Взрывоопасен.',
    interacts: 'огонь и ток — взрыв газа',
  },
  ice: {
    id: 'ice', name: 'Лёд', layer: 'floor', turns: 6, color: 'h', core: '5', anim: 'shine', ai: 2,
    enter: { statuses: [['slick', 2]], fallSave: 'dex', wetStatus: ['chilled', 2] },
    desc: 'Скольжение 2 р., спас ЛВК или падение; мокрых знобит.',
    interacts: 'огонь — тает в воду, ток — трескается, вода — замерзает',
  },
  blood: {
    id: 'blood', name: 'Кровь', layer: 'floor', turns: 6, color: 'c', core: 'd', anim: 'shine', ai: 1,
    enter: { organic: [['scent', 3]] },
    desc: 'Запах крови 3 р. живым.',
    interacts: 'ток — электролужа (1 клетка), огонь — дым, лёд — розовый лёд',
  },
  cringe: {
    id: 'cringe', name: 'Кринж-лужа', layer: 'floor', turns: 4, color: 'n', core: 'm', anim: 'pulse', ai: 5,
    enter: { dice: '1d4', dmgType: 'cringe', panic: { mrlBelow: 0.25, turns: 2, save: 'wil' } },
    desc: '1d4 кринжа по МРЛ; при МРЛ ≤ 25% — кринж-паника (спас ТВД).',
    interacts: 'огонь — «сгореть со стыда», прокси — усиление',
  },
  proxy: {
    id: 'proxy', name: 'Прокси-поле', layer: 'floor', turns: 5, color: 'a', core: 'b', anim: 'stripes', ai: 4,
    enter: { statuses: [['overload', 3]] },
    desc: 'Прокси-перегрузка 3 р. Техоньки не затронуты и получают +1 к атаке.',
    interacts: 'ток — перенапряжение, кринж — усиление',
  },
  smoke: {
    id: 'smoke', name: 'Дым', layer: 'gas', turns: 4, color: '3', core: '4', anim: 'fog', ai: 1,
    enter: { statuses: [['choking', 2]] },
    desc: 'Удушье 2 р.; дальние атаки сквозь дым с помехой.',
    interacts: 'огонь — горит дольше',
  },
  steam: {
    id: 'steam', name: 'Пар', layer: 'gas', turns: 2, color: '4', core: '5', anim: 'fog', ai: 1,
    enter: { statuses: [['choking', 1], ['wet', 2]] },
    desc: 'Удушье 1 р., мокрый; дальние атаки сквозь пар с помехой.',
    interacts: '—',
  },
};

/** Числа комбинаций и общих правил (спека §2, §5). */
export const SURFACE_RULES = {
  tierStep: 5,            // tier(L) = 1 + ⌊(L−1)/5⌋
  dcBase: 10,             // СЛ спасов поверхностей = 10 + ⌊L/2⌋
  chainCap: 12,           // клеток масла/газа, вспыхивающих за раунд
  explosion: { dice: '2d6', save: 'dex', push: 1, fireTurns: 2 },
  blaze: { dice: '1d6', fireTurns: 5, smokeTurns: 2, burnTurns: 3 },
  electrify: { water: 3, blood: 3, proxy: 2, proxyMechMul: 1.5, overloadPlus: 1 },
  steamTurns: 2,
  meltTurns: 8,           // лёд → вода
  shatterTurns: 3,        // лёд + ток → вода
  freezeTurns: 6,         // вода + холод → лёд
  frozenTurns: 1,         // существа в замерзающей воде
  acidicTurns: 2,         // «кислая» вода после растворения кислоты
  vaporAcidTurns: 2,      // кислота + огонь → токсин-газ
  smokeOutTurns: 1,       // кровь + огонь, масло + кислота → дым
  smokeFirePlus: 1,       // огонь в дыму горит дольше
  slickTurns: 3,          // масло + лёд
  cringeProxyMul: 1.5,    // кринж-лужа на прокси-поле
  burnoutPanic: 2,        // кринж + огонь → паника без спаса
  bleedEvery: 2,          // кровотечение оставляет кровь раз в N ходов носителя
  burnDeathFire: 2,       // горящий умер → огонь на клетке
  deathBlood: 6,          // живой умер → кровь на клетке (радиус 0)
  hazardAi: 6,            // штраф ИИ постоянного огня (T_HAZARD)
  nativeHit: 1,           // техоньки на прокси, Рэпер/кринжгоны на кринже: +1 к атаке
  scentHpShare: 0.25,     // потеря ≥ 25% ЗДР за раунд → запах крови
};

/** Теги существ по фракции врага (data/index.js добавляет их к ENEMIES). */
export const FACTION_TAGS = {
  mutantsPlant: ['plant', 'mutant'],
  mutantsBeast: ['beast', 'mutant'],
  tekhonki: ['proxy'],
  cringegons: ['cringe'],
};

/**
 * Привязки к способностям классов и врагов (спека §6.2–6.3): data/index.js дописывает `add` в конец effects
 * (индексы upgrades не сдвигаются), `swap` меняет статус. Op `surface` без `per` ставится один раз в центре
 * способности, `per: 'target'` — под каждой задетой целью (с проверкой попадания, `crit`, `only`).
 */
const S = (kind, size, turns, extra = {}) => ({ op: 'surface', kind, size, turns, ...extra });
const St = (id, turns, extra = {}) => ({ op: 'status', id, turns, ...extra });
const CRIT_BLOOD = S('blood', 0, 6, { per: 'target', crit: true });

export const SURFACE_BINDINGS = {
  // ---- игроки
  'crushing-blow': { add: [CRIT_BLOOD] },
  'impulse-shock': { add: [St('shocked', 1), St('glitch', 2, { only: 'mechanical' })] },
  // 'loud-sound' (Рэпер) и 'proxy-hunter' (СлавоТех) — пассивки, не способности: привязки пропущены.
  // 'energy-beam' — энергоурон без электро-режима; 'overclock' — бафф союзника (перегрузка вредила бы своему): пропущены.
  'cyber-storm': { add: [S('electric', 2, 3), St('glitch', 2, { only: 'mechanical' })] },
  'terminal-virus': { add: [St('glitch', 3, { only: ['mechanical', 'digital'] })] },
  'acid-spit': { add: [S('acid', 0, 5), St('acid', 3)] },
  'venom-claws': { add: [St('poison', 1, { ifSurface: 'toxgas' })] },
  'beast-claws': { add: [CRIT_BLOOD] },
  'junk-grenade': { add: [S('oil', 1, 10)] },
  'snare': { add: [St('frozen', 1, { ifSurface: ['water', 'ice'] })] },
  'dirty-trick': { add: [S('smoke', 0, 2), St('blind', 1)] },
  'blinding-light': { add: [St('blind', 2, { ifSurface: 'smoke' })] },
  'smite': { add: [S('fire', 0, 2, { per: 'target' })] },
  'backstab': { add: [CRIT_BLOOD] },
  'spore-cloud': { add: [S('toxgas', 2, 3), St('choking', 2)] },
  'poison-ivy': { add: [S('acid', 0, 3), St('acid', 2)] },
  'cringe-effect': { add: [S('cringe', 1, 3), St('panic', 2, { mrlBelow: 0.25 })] },
  'holy-iron': { add: [S('fire', 0, 2, { per: 'target', only: ['mechanical', 'digital'] })] },
  'code-cleanse': { add: [{ op: 'cleanse', ids: ['glitch', 'overload', 'irradiated'] }, { op: 'clearSurface', kinds: ['proxy', 'cringe'], size: 1 }] },
  'fear': { add: [St('panic', 2, { mrlBelow: 0.25 })], classes: ['cybertech'] },
  'one-dim-shot': { add: [St('glitch', 1, { only: 'mechanical' })] },
  'judge-whisper': { add: [S('cringe', 0, 3), St('hallucination', 1)], classes: ['cybertech'] },
  // ---- враги
  'pir-cannon-salvo': { add: [S('fire', 1, 3)] },
  'wp-fire-stream': { add: [S('fire', null, 4)] },
  'wp-suppress': { add: [St('choking', 1, { ifSurface: 'smoke' })] },
  'ai-laser-line': { add: [] }, // огонь по масле/газу — общим правилом «огненный урон по клетке»
  'ren-charge': { add: [S('fire', 0, 2)] },
  'mech-nano-devour': { add: [S('acid', 1, 4)] },
  'mech-rust-bite': { add: [St('acid', 1, { only: 'mechanical' })] },
  'crg-meme-flood': { add: [S('cringe', 2, 4)] },
  'crg-final-bit': { add: [S('cringe', 2, 3)] },
  'scv-slam': { add: [S('oil', 0, 10, { per: 'target' })] },
  'tek-arc': { add: [S('electric', 1, 2)] },
  'tek-old-drain': { add: [S('proxy', 1, 3), St('overload', 3)] },
  'agro-burn-row': { add: [S('fire', null, 4)] },
  'agro-spray': { add: [S('toxgas', 2, 3)] },
  'mutr-pop': { add: [S('toxgas', 2, 3)] },
  'mutr-spores': { add: [S('toxgas', 1, 2)] },
  'wild-ice-slam': { add: [S('ice', 0, 4)], swap: { slow: 'chilled' } },
  'wild-frost-chill': { add: [S('ice', 2, 4)], swap: { slow: 'chilled' } },
  'cult-data-flood': { swap: { hallucination: 'glitch' } },
  'cult-skr-rend': { add: [St('bleed', 2), S('blood', 0, 6, { per: 'target' })] },
  'cult-fear-reap': { add: [St('panic', 2, { mrlBelow: 0.25 })] },
};
