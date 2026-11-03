// Происхождение героя (фракционный слот талантов) и стартовая репутация.
// Спека: docs/specs/world.md, п. 3; docs/specs/talents.md. Канон отношений рас: lore/timeline.md, lore/faction-stances.md.
// Решение человека (GDD, 2026-11-03): мутант враждебен АИ Партии, КРОМЕ происхождения «раб АИ Партии» — там «подозрение».

import { RELATIONS } from '../factions.js';

/** Малые фракции вне матрицы (id — как в npcs.js EXTRA_FACTIONS). Репутация есть, распространения нет. */
export const MINOR_FACTIONS = ['tekhnikumy', 'predlozhka'];

/** Пороги репутации: value >= min. Порядок — от высшего. */
export const REP_TIERS = [
  { id: 'ally', name: 'Союзники', min: 50 },
  { id: 'friendly', name: 'Дружелюбны', min: 15 },
  { id: 'neutral', name: 'Нейтральны', min: -14 },
  { id: 'suspicious', name: 'Подозрительны', min: -49 },
  { id: 'hostile', name: 'Враждебны', min: -100 },
];
export const REP_MIN = -100;
export const REP_MAX = 100;
export const repTier = (v) => REP_TIERS.find((t) => v >= t.min).id;

/** Коэффициент распространения по RELATIONS[G][F] — «кем F является для G». */
export const REP_SPREAD = {
  ally: 0.5, vassal: 0.5, suzerain: 0.5,
  friendly: 0.25,
  neutral: 0, unknown: 0,
  suspicion: -0.1,
  rival: -0.25,
  enemy: -0.5,
};

const clamp = (v) => Math.max(REP_MIN, Math.min(REP_MAX, v));

/**
 * Изменить репутацию у фракции и распространить на один шаг по матрице. Мутирует и возвращает rep.
 * Возвращает также список изменений в rep.__last (для всплывающей строки UI) — не сохраняется.
 */
export function spreadRep(rep, faction, delta) {
  const changes = [[faction, delta]];
  rep[faction] = clamp((rep[faction] || 0) + delta);
  if (RELATIONS[faction]) {
    for (const g of Object.keys(RELATIONS)) {
      if (g === faction) continue;
      const k = REP_SPREAD[RELATIONS[g][faction]] || 0;
      const d = Math.trunc(delta * k);
      if (!d) continue;
      rep[g] = clamp((rep[g] || 0) + d);
      changes.push([g, d]);
    }
  }
  Object.defineProperty(rep, '__last', { value: changes, enumerable: false, configurable: true, writable: true });
  return rep;
}

/** Расовая база (не распространяется — это уже итог отношения мира к расе). Не указанное = 0. */
export const RACE_REP = {
  all: { cringegons: -60, cult: -20 },
  human: { aiParty: -15, agrozone: -5, tinBrotherhood: 5, mechanids: -20 },
  skeleton: { scavengers: -35, tinBrotherhood: 5, mechanids: 10 },
  android: { aiParty: 20, warprom: 15, agrozone: 10, mechanids: 15, tinBrotherhood: -20, renegades: -10 },
  'mutant-beast': { aiParty: -50, warprom: -35, agrozone: -35, mutantsBeast: 30, mutantsPlant: 15, tinBrotherhood: -10, renegades: 10, mechanids: -20 },
  'mutant-plant': { aiParty: -50, warprom: -35, agrozone: -25, mutantsPlant: 30, mutantsBeast: 15, renegades: 10, mechanids: -20 },
};

/** Итог пролога (герой сорвал теракт на Альфа-Гармонии). Распространяется. */
export const PROLOGUE_REP = { tekhnikumy: 30, cult: -30, pirates: 5 };

/**
 * Происхождения. faction/rep — прибавка своей фракции (распространяется по матрице);
 * override — значения, которые ставятся ПОСЛЕ этого (не распространяются); races: null — любые играбельные.
 * talents — id из talents.js (slot: 'faction').
 */
export const ORIGINS = {
  aiParty: { id: 'aiParty', name: 'Гражданин АИ Партии', faction: 'aiParty', rep: 20,
    races: ['human', 'skeleton', 'android'],
    talents: ['loyalty-chip', 'propaganda-jargon', 'archive-access', 'hidden-agent'],
    desc: 'Вырос под камерами Партии. Мутантов в гражданах не бывает.' },
  aiSlave: { id: 'aiSlave', name: 'Раб АИ Партии', faction: 'renegades', rep: 10,
    override: { aiParty: -25, agrozone: -20 },
    races: ['human', 'skeleton', 'mutant-beast', 'mutant-plant'],
    talents: ['slave-chip', 'field-calluses', 'chain-breaker'],
    desc: 'Бывший раб Агрозоны с ID-чипом под кожей. Для Партии — беглое имущество, а не мишень: «подозрение», а не вражда.',
    canon: 'решение человека 2026-11-03; lore/timeline.md («Побег из Агрозоны», «Отмена ID-чипов»)' },
  tinBrotherhood: { id: 'tinBrotherhood', name: 'Жестяное братство', faction: 'tinBrotherhood', rep: 20,
    races: ['human', 'skeleton', 'mutant-beast', 'mutant-plant'],
    talents: ['smith-strike', 'rusty-armor', 'analog-cipher', 'old-masters'],
    desc: 'Под сталью — сталь. Андроиды для братства — изгои.' },
  pirates: { id: 'pirates', name: 'Пиратская команда', faction: 'pirates', rep: 20, races: null,
    talents: ['smuggler-wit', 'fake-codes', 'quick-score', 'sea-legs'],
    desc: 'Все расы — если полезны.' },
  scavengers: { id: 'scavengers', name: 'Мусорщик', faction: 'scavengers', rep: 20,
    races: ['human', 'android', 'mutant-beast', 'mutant-plant'],
    talents: ['metal-sense', 'rot-nose', 'junk-throw', 'rat-king'],
    desc: 'Сильнейший выживает. Скелеты — добыча, а не свои.' },
  cult: { id: 'cult', name: 'Бывший культист', faction: 'cult', rep: 0, races: null,
    talents: ['judge-whisper', 'death-code', 'faceless', 'digital-asceticism'],
    desc: 'Слышал Судью и ушёл. Для культа — предатель: бонуса нет.' },
  renegades: { id: 'renegades', name: 'Отступник', faction: 'renegades', rep: 20, races: null,
    talents: ['approach-miner', 'freedom-price'],
    desc: 'Свобода любой ценой.' },
  neutralVillages: { id: 'neutralVillages', name: 'Житель Нейтральных селений', faction: 'neutralVillages', rep: 20, races: null,
    talents: ['village-kin', 'elders-word'],
    desc: 'Все — если не агрессивны.' },
  tekhnikumy: { id: 'tekhnikumy', name: 'Техникумы', faction: 'tekhnikumy', rep: 20, races: null,
    talents: ['no-id', 'smart-prosthesis'],
    desc: 'Технологии без ID-контроля. Свои на Альфа-Гармонии.' },
  mutantsBeast: { id: 'mutantsBeast', name: 'Стая мутантов-Ж', faction: 'mutantsBeast', rep: 20, races: ['mutant-beast'],
    talents: ['beast-reflexes'],
    desc: 'Живут в свой кайф и контакта особо не поддерживают.' },
  mutantsPlant: { id: 'mutantsPlant', name: 'Роща мутантов-Р', faction: 'mutantsPlant', rep: 20, races: ['mutant-plant'],
    talents: ['elastic-joints'],
    desc: 'Ближе к АИ — и поэтому знают её ксенофобию лучше всех.' },
};

export const originAllowed = (originId, raceId) => {
  const o = ORIGINS[originId];
  return !!o && (!o.races || o.races.includes(raceId));
};

/** Все фракции, у которых хранится репутация. */
export const REP_FACTIONS = [...Object.keys(RELATIONS), ...MINOR_FACTIONS];

/**
 * Стартовая репутация: раса → происхождение (с распространением) → override → пролог (с распространением).
 * prologue: false — для героя до пролога.
 */
export function startingRep(raceId, originId, { prologue = true } = {}) {
  const rep = Object.fromEntries(REP_FACTIONS.map((f) => [f, 0]));
  for (const src of [RACE_REP.all, RACE_REP[raceId] || {}]) for (const f in src) rep[f] = clamp(rep[f] + src[f]);
  const o = ORIGINS[originId];
  if (o) {
    if (o.rep) spreadRep(rep, o.faction, o.rep);
    if (o.override) for (const f in o.override) rep[f] = o.override[f];
  }
  if (prologue) for (const f in PROLOGUE_REP) spreadRep(rep, f, PROLOGUE_REP[f]);
  return rep;
}
