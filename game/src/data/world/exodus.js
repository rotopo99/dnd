// «Третий исход» — глобальный таймер (docs/specs/third-exodus.md §1–2). Числа баланса; логика — world/exodus.js.
// T0 = ceil5(B × 1.2), B = 402 дня — «базовый маршрут» `node tools/sim/xp-route.mjs` (16 остановок, 46 переходов).
export const EXODUS = {
  startFlag: 'prologue-done',
  quest: 'mq-exodus', // журнал квеста: «Осталось N дн.»
  stopFlags: ['exodus-stopped', 'node-destroyed', 'node-reflashed', 'node-destroyed-late'],
  t0: 485,
  extCap: 60,
  restDays: 1, // отдых на узле / привал = 1 день
  // метки эскалации: доля остатка left / (T0 + ext) ≤ share (или left ≤ left, если задано); односторонние
  marks: [
    { n: 1, share: 0.75 },
    { n: 2, share: 0.5 },
    { n: 3, share: 0.3 },
    { n: 4, share: 0.15, left: 25 },
    { n: 5, share: 0.05 },
  ],
  redShare: 0.3, // HUD: красный при доле ≤
  blinkShare: 0.05, // HUD: мигание
  // эффекты текущей метки
  encounter: { fromMark: 1, regions: ['cult', 'wilds'], mod: 1 }, // +1 к порогу встречи
  tollMult: { 2: 1.25, 3: 1.25, 4: 1.25, 5: 1.25 }, // пошлины на входах
  priceMult: { 3: 1.2, 4: 1.2, 5: 1.4 }, // цены в лавках
  // эскалация на дорогах (метки 2–5): бои из data/enemies-exodus.js дописываются в таблицу встреч региона.
  // cult — отряд культа (size 1 — патруль, 2 — свита с командиром), revenant — материализованные души; w — вес в таблице;
  // minLevel — только регионы с верхним уровнем levels ≥ minLevel; onlyCult — регионы, где встречи = только эти бои.
  roads: {
    2: { cult: { w: 2, size: 1, minLevel: 8 } },
    3: { cult: { w: 3, size: 1, minLevel: 8 }, revenant: { w: 2 } },
    4: { cult: { w: 3, size: 2, minLevel: 5 }, revenant: { w: 3 } },
    5: { cult: { w: 4, size: 2, minLevel: 1 }, revenant: { w: 3 }, onlyCult: ['cult', 'aiParty', 'wilds', 'cringegons', 'warprom', 'renegades'] },
  },
  // подтверждение долгого перехода: «Переход займёт N дн., до исхода M дн. Идти?» — от метки fromMark, если дней > days
  confirm: { fromMark: 3, days: 5 },
  // реплика NPC про исход (data/text/exodus.js EXODUS_NPC) — раз на NPC на метку, от метки fromMark
  npcLines: { fromMark: 1 },
  // слух про исход в таверне вместо обычного — с шансом (от метки 1)
  tavernChance: 0.5,
  harmony: { mark: 4, flag: 'harmony-fallen', region: 'harmony', servicesOff: ['rest', 'trade', 'train', 'implant', 'recruit'] },
  // ноль: воплощение Судьи
  zero: { flag: 'exodus-zero', location: 'cc-node', encounter: 'w-cc-finale', bossHp: 1.25, winFlag: 'node-destroyed-late' },
  // продления (одноразово, флаг `exo-ext:<id>`): terminal (не ritual) | terminal+state | flag | anyFlag | quest (done)
  ext: [
    { id: 'term-villages', terminal: 'term-villages', days: 8 },
    { id: 'term-agrozone', terminal: 'term-agrozone', days: 8 },
    { id: 'cc-terminal-1', terminal: 'cc-terminal-1', days: 6 },
    { id: 'cc-terminal-2', terminal: 'cc-terminal-2', days: 6 },
    { id: 'cc-terminal-3', terminal: 'cc-terminal-3', days: 6 },
    ...['term-villages', 'term-agrozone', 'cc-terminal-1', 'cc-terminal-2', 'cc-terminal-3']
      .map((id) => ({ id: `${id}:ours`, terminal: id, state: 'ours', days: 4 })),
    { id: 'beacons', flag: 'beacons-out', days: 10 },
    { id: 'agro-fire', anyFlag: ['agro-marta', 'agro-order', 'agro-truce'], days: 8 },
    { id: 'sq-cult-mines', quest: 'sq-cult-mines', days: 6 },
    { id: 'sq-terminals', flag: 'terminals-marked', days: 4 },
    { id: 'sq-archon', quest: 'sq-archon', days: 6 },
  ],
};

// Гейты mq-exodus (§2): средний уровень партии, финал — жёсткий
export const EXODUS_GATES = {
  findNode: 12,
  assault: 17,
  assaultTerminals: 3,
  assaultRegions: ['warprom', 'cringegons'],
};
