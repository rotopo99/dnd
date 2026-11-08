// Контент v4: враги и бои уровней 6–20 (docs/specs/levels-20.md, раздел «Мир 6–20»).
// Регистрирует врагов в ENEMIES_V3 (общий реестр, туда же пишет scaleV3), бои — в ENCOUNTERS_V4 (data/index.js сливает их в ENCOUNTERS).
// Состав:
//   1) lift(base, L) — версия существующего врага на уровне L (ЗДР, атака, урон, КБ, кости способностей — по формулам ниже).
//      Для всех 14 фракций по три «ключевых типа» (элита, ветеран, командир) на уровнях 8/12/16/20: id `<prefix>-<elite|vet|cmd>-l<L>`.
//   2) новые типы фракций (шаблон от уровня): id `<id>-l<L>`; 2–3 на фракцию.
//   3) эндгейм-боссы: Генерал ИИ, Кибер-Жрец в силе, Воплощение Судьи, Кринж-Вождь, Великий Собиратель, Лис-9 и Волк-0 в полной силе;
//      высокие формы монстров карты (Суунарссок, Арингли, Удазазаги).
//   4) бои по регионам (ENCOUNTERS_V4): патруль / отряд / элита на регион + боссы + финал (перекрывает 'w-cc-finale').
// Операции и статусы — только из docs/specs/core-rules.md. Числа — ориентир масштаба героев своего уровня (levels-20.md);
// силу боёв подгоняет tools/sim/tune-v3.mjs (POWER_V3 в enemies-v3.js, ключи — id боёв).
// Формулы (p = 1): ЗДР = (8 + 4.5·L) × ранг × роль; урон за удар ≈ 1.5·L × ранг; атака = мод + владение(L) + 1 + hit; КБ = 12 + роль + ⌊L/3⌋.

import { ENEMIES_V3, POWER_V3, scaleV3, foe, ability, st, profOf } from './enemies-v3.js';
import { ENEMIES as ENEMIES_V1 } from './enemies.js';

const mod = (v) => Math.floor(((v ?? 10) - 10) / 2);
const MACHINE_IMMUNE = ['fear', 'cringed', 'hallucination', 'poison', 'bleed'];

// ---------------------------------------------------------------- числа
export const RANK_HP = { grunt: 1, specialist: 0.85, elite: 1.5, miniboss: 2.2, boss: 3.0 };
export const RANK_DMG = { grunt: 1, specialist: 1.05, elite: 1.15, miniboss: 1.25, boss: 1.35 };
export const RANK_XP = { grunt: 1, specialist: 1.2, elite: 1.6, miniboss: 2.5, boss: 3.5 };
export const DMG_PER_LEVEL = 1.5;
// поздние уровни: герои растут быстрее линейного (способности, ступени, снаряжение) — множитель ЗДР и урона с ур. 7
export const LATE = (L) => 1 + 0.025 * Math.max(0, L - 6);
export const hpFor = (L, rank) => (8 + 4.5 * L) * LATE(L) * (RANK_HP[rank] ?? 1);
// опыт врага: как rules/progression.js enemyXpForLevel (150 на ур. 5, дальше × xpScale) × ранг
const THRESH = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
const span = (l) => THRESH[Math.max(1, Math.min(19, l))] - THRESH[Math.max(1, Math.min(19, l)) - 1];
// темп: ближние земли и старые квесты уже ведут к ур. 7–9, поэтому за врагов 6–9 даём меньше, дальше — полный опыт
export const XP_K = (L) => (L <= 9 ? 0.6 : L <= 14 ? 0.85 : L <= 16 ? 1.1 : 1.3);
export const enemyXp = (L, rank) => Math.round(XP_K(L) * (L <= 5 ? [20, 38, 60, 90, 150][L - 1] : 150 * (span(L) / span(5))) * (RANK_XP[rank] ?? 1));

const dmgTarget = (L, rank) => DMG_PER_LEVEL * L * LATE(L) * (RANK_DMG[rank] ?? 1);
function diceFor(avg, faces) { const n = Math.max(1, Math.round(avg / ((faces + 1) / 2))); return `${n}d${faces}`; }
/** Операция урона способности ≈ mult × 1.2·L (кости d8 + остаток в bonus). */
const D = (L, m, dmgType, extra = {}) => {
  const avg = m * DMG_PER_LEVEL * L * LATE(L); const n = Math.max(1, Math.round((avg * 0.75) / 4.5));
  return { op: 'damage', dice: `${n}d8`, dmgType, bonus: Math.max(0, Math.round(avg - n * 4.5)), ...extra };
};
const X6 = (L, k = 1) => `${Math.max(1, Math.round(L * 0.12 * k))}d6`;
const shieldV = (L, k = 2) => Math.round(L * k);

// ---------------------------------------------------------------- реестр
const put = (def) => { if (!ENEMIES_V3[def.id]) ENEMIES_V3[def.id] = def; return def.id; };

// ---------------------------------------------------------------- lift: версия существующего врага на уровне L
const scaleDice = (expr, f) => {
  const m = /^(\d+)d(\d+)(.*)$/.exec(expr || ''); if (!m) return expr;
  return `${Math.max(1, Math.min(12, Math.round(Number(m[1]) * f)))}d${m[2]}${m[3]}`;
};
function scaleEffect(ef, f, L, L0) {
  const o = { ...ef };
  if (o.dice && ['damage', 'heal', 'drain', 'shield'].includes(o.op)) o.dice = scaleDice(o.dice, f);
  if (o.extraDice) o.extraDice = scaleDice(o.extraDice, f);
  if (o.op === 'shield' && o.value != null) o.value = Math.round(o.value * f);
  if (o.op === 'damage' && typeof o.bonus === 'number') o.bonus += Math.floor((L - L0) / 3);
  return o;
}
const ADJ = { 8: ['Закалённый', 'Закалённая'], 12: ['Матёрый', 'Матёрая'], 16: ['Прославленный', 'Прославленная'], 20: ['Легендарный', 'Легендарная'] };
const adjFor = (L, fem) => (ADJ[L >= 20 ? 20 : L >= 16 ? 16 : L >= 12 ? 12 : L >= 8 ? 8 : 0] || ['Опытный', 'Опытная'])[fem ? 1 : 0];
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

/**
 * lift(baseId, L, { id, name, rank?, boss?, extra?: [ability], hpK?, faction? }) → id врага уровня L.
 * Берёт тип/теги/сопротивления/способности базы, пересчитывает числа под уровень L.
 */
export function lift(baseId, L, o = {}) {
  const id = o.id || `${baseId}-l${L}`;
  if (ENEMIES_V3[id]) return id;
  const b = ENEMIES_V3[baseId] || ENEMIES_V1[baseId];
  if (!b) throw new Error(`enemies-v4: unknown base "${baseId}"`);
  const rank = o.rank || b.rank || 'elite', L0 = b.level, dL = L - L0;
  const f = 1 + (L / L0 - 1) * 0.6 * LATE(L);
  const stats = {};
  for (const [k, v] of Object.entries(b.stats)) stats[k] = Math.min(21, v + Math.round(dL * (v >= 13 ? 0.4 : 0.2)));
  const hpRatio = Math.max(0.6, Math.min(1.3, b.hp / hpFor(L0, b.rank || 'elite')));
  const hp = Math.round(hpFor(L, rank) * hpRatio * (o.hpK || 1));
  const mrlRatio = Math.max(0.55, Math.min(1.3, (b.mrl || 0) / Math.max(1, b.hp)));
  let weapon = b.weapon || null;
  if (weapon) {
    const faces = Number((/d(\d+)/.exec(weapon.dice) || [0, 8])[1]);
    const rofK = weapon.rof > 1 ? 1 + (weapon.rof - 1) * 0.5 : 1;
    const avg = dmgTarget(L, rank) / rofK - mod(stats[weapon.stat]);
    weapon = { ...weapon, dice: diceFor(Math.max(2, avg), faces), attack: null };
  }
  const abilities = (b.abilities || []).map((a) => ({ ...a, effects: (a.effects || []).map((ef) => scaleEffect(ef, f, L, L0)) }));
  const nm = o.name || `${adjFor(L, o.fem)} ${lowerFirst(b.name)}`;
  const def = foe({
    ...b, id, name: nm, level: L, rank, boss: o.boss ?? b.boss ?? (rank === 'miniboss' || rank === 'boss'),
    faction: o.faction !== undefined ? o.faction : b.faction, stats, hp, mrl: Math.round(hp * mrlRatio),
    enr: b.enr ? Math.round(b.enr * Math.max(1, Math.pow(L / L0, 0.7))) : 0,
    weapon, kb: Math.min(24, (b.kb ?? 14) + Math.floor(dL / 3)), xp: enemyXp(L, rank), abilities: [...abilities, ...(o.extra || [])],
    places: [], canon: b.canon || [], desc: o.desc || `${b.desc || ''} (уровень ${L})`.trim(),
  });
  return put(def);
}

// ---------------------------------------------------------------- 14 фракций: элита / ветеран / командир (8, 12, 16, 20)
// [prefix, faction, elite base, vet base, cmd base, cmd name (если база — не командир), cmd fem?]
const KEY = [
  ['pir', 'pirates', 'pir-quartermaster', 'pir-grenadier', 'pir-boarding-captain', null],
  ['wp', 'warprom', 'wp-bolterman', 'wp-stormtrooper', 'wp-kuznechik', null],
  ['ai', 'aiParty', 'ai-ukaz-guard', 'ai-laser-trooper', 'ai-commissar', null],
  ['tin', 'tinBrotherhood', 'tin-blade-master', 'tin-samurai', 'boss-tin-renegade', 'наставник-ронин'],
  ['ren', 'renegades', 'ren-commissar', 'ren-fighter', 'ren-commissar', 'комендант фронта'],
  ['mech', 'mechanids', 'mech-assimilator', 'mech-cutter', 'mech-hive-node', null],
  ['crg', 'cringegons', 'crg-collector-agent', 'crg-bayanist', 'crg-collector-agent', 'распорядитель Собирателя'],
  ['scv', 'scavengers', 'scv-mech-pilot', 'scv-gunner', 'scv-mech-pilot', 'бригадир мех-свалки'],
  ['tek', 'tekhonki', 'tek-golem', 'tek-seeker', 'tek-ritualist', 'старший ритуалист'],
  ['nv', 'neutralVillages', 'nv-elder-guard', 'nv-watchman', 'nv-elder-guard', 'старшина ополчения'],
  ['agro', 'agrozone', 'agro-harvester', 'agro-loader', 'agro-chief-overseer', null],
  ['mutr', 'mutantsPlant', 'mutr-treant', 'mutr-strangler', 'mutr-treant', 'патриарх рощи'],
  ['cult', 'cult', 'cult-executioner', 'cult-plague-bearer', 'cult-judge-hand', null],
  ['mutz', 'mutantsBeast', 'mutz-alpha', 'mutz-tusker', 'mutz-alpha', 'вожак великой стаи'],
];
export const KEY_LEVELS = [8, 12, 16, 20];
const FEM_BASE = new Set(['cult-judge-hand']);
/** id версии ключевого типа: V('pir', 'elite', 12). Уровень любой — создаётся по требованию. */
export function V(prefix, kind, L) {
  const row = KEY.find((r) => r[0] === prefix); if (!row) throw new Error(`enemies-v4: unknown prefix "${prefix}"`);
  const [, faction, eliteB, vetB, cmdB, cmdName] = row;
  const id = `${prefix}-${kind}-l${L}`;
  if (ENEMIES_V3[id]) return id;
  if (kind === 'elite') return lift(eliteB, L, { id, rank: 'elite', faction });
  if (kind === 'vet') return lift(vetB, L, { id, rank: 'specialist', faction });
  const fem = FEM_BASE.has(cmdB);
  return lift(cmdB, L, { id, rank: 'miniboss', boss: true, faction, fem, name: cmdName ? `${adjFor(L, false)} ${cmdName}` : undefined });
}
for (const [prefix] of KEY) for (const L of KEY_LEVELS) for (const k of ['elite', 'vet', 'cmd']) V(prefix, k, L);

// ---------------------------------------------------------------- новые типы (шаблон от уровня)
const ROLES = {
  brute: { stat: 'str', ai: 'melee', hp: 1.15, kb: 4, die: 10, range: 1 },
  tank: { stat: 'str', ai: 'melee', hp: 1.5, kb: 7, die: 8, range: 1 },
  skirmisher: { stat: 'dex', ai: 'melee', hp: 0.9, kb: 3, die: 8, range: 1 },
  shooter: { stat: 'dex', ai: 'ranged', hp: 0.8, kb: 2, die: 8, range: 12 },
  caster: { stat: 'int', ai: 'caster', hp: 0.75, kb: 1, die: 6, range: 8, mrl: 1.35 },
  support: { stat: 'cha', ai: 'support', hp: 0.85, kb: 2, die: 6, range: 6, mrl: 1.2 },
};
const TEMPLATES = {};
/** Описание нового типа: { name, faction, role, rank?, tags?, mech?, cast?, weapon: {name, dmgType, range?, stat?}, abilities(L), immune?, resist?, hpK?, speed?, desc, loot? }. */
const tpl = (id, spec) => { TEMPLATES[id] = spec; };
function buildNew(id, L, s) {
  const R = ROLES[s.role], rank = s.rank || 'specialist';
  const main = Math.min(21, 12 + Math.floor(L * 0.45));
  const stat = s.weapon?.stat || R.stat;
  const cast = s.cast || R.stat;
  const stats = st(10, 10, 11 + Math.floor(L / 3), 10, 10, 10, 10);
  stats[stat] = main; if (cast !== stat) stats[cast] = main - 1;
  const hp = Math.round(hpFor(L, rank) * R.hp * (s.hpK || 1));
  const mech = !!s.mech;
  const weapon = s.weapon === null ? null : {
    name: s.weapon.name, dice: diceFor(Math.max(2, dmgTarget(L, rank) - mod(main)), R.die), dmgType: s.weapon.dmgType, stat,
    range: s.weapon.range ?? R.range, hit: -1,
  };
  return foe({
    id, name: s.name, level: L, faction: s.faction, rank, boss: rank === 'miniboss' || rank === 'boss',
    tags: s.tags || (mech ? ['mechanical'] : ['organic']), stats, hp, mrl: Math.round(hp * (R.mrl || 0.7) * (s.mrlK || 1)), castStat: cast,
    weapon, kb: Math.min(24, 12 + R.kb + Math.floor(L / 3) + (s.kbAdj || 0)), speed: s.speed ?? 6, ai: R.ai, xp: enemyXp(L, rank),
    resist: s.resist || {}, immuneStatus: [...(mech ? MACHINE_IMMUNE : []), ...(s.immune || [])], loot: s.loot ?? s.faction ?? null,
    abilities: s.abilities ? s.abilities(L) : [], desc: s.desc || '', canon: s.canon || ['docs/lore/npcs.md'],
  });
}
/** id нового типа на уровне L: N('pir-cannoneer', 12). */
export function N(typeId, L) {
  const s = TEMPLATES[typeId]; if (!s) throw new Error(`enemies-v4: unknown template "${typeId}"`);
  const id = `${typeId}-l${L}`;
  return ENEMIES_V3[id] ? id : put(buildNew(id, L, s));
}
const native = {}; // уровень, на котором тип «родной» (регистрируется всегда)
const nt = (id, L, spec) => { tpl(id, spec); native[id] = L; };
const sv = (o) => ability({ roll: 'save', onSave: 'half', ...o });
const aoe = (o) => sv({ range: 8, target: 'tile', area: { shape: 'radius', size: 2 }, ...o });
const selfA = (o) => ability({ action: 'bonus', range: 0, target: 'self', roll: 'auto', ...o });
const summonA = (o) => ability({ action: 'bonus', range: 4, target: 'tile', roll: 'auto', ...o });

// ---- Пираты
nt('pir-cannoneer', 12, { name: 'Канонир «Шторм»', faction: 'pirates', role: 'shooter', weapon: { name: 'Кулеврина', dmgType: 'blunt', range: 14 },
  abilities: (L) => [aoe({ id: 'pir-cannon-salvo', name: 'Картечный залп', save: 'dex', range: 14, usesPerBattle: 2, effects: [D(L, 1.3, 'fire'), { op: 'status', id: 'burn', turns: 2 }], desc: 'Картечь по площади (радиус 2) и горение.' })],
  desc: 'Борт-артиллерист: целится по палубе, а не по людям. Людей в палубе не бывает.' });
nt('pir-diver', 14, { name: 'Водолаз-душегуб', faction: 'pirates', role: 'skirmisher', weapon: { name: 'Абордажный тесак', dmgType: 'slash' },
  abilities: (L) => [selfA({ id: 'pir-from-deep', name: 'Из глубины', usesPerBattle: 1, effects: [{ op: 'status', id: 'stealth', turns: 2 }], desc: 'Скрытность на 2 хода.' }),
    ability({ id: 'pir-gut-cut', name: 'Потрошитель', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L) }, { op: 'status', id: 'bleed', turns: 3 }], desc: 'Доп. урон и кровотечение.' })],
  desc: 'Ныряет под борт и всплывает уже внутри. Любит неожиданность и чаевые.' });
nt('pir-duelist', 16, { name: 'Корсар-дуэлянт', faction: 'pirates', role: 'skirmisher', hpK: 1.25, weapon: { name: 'Рапира Буревестника', dmgType: 'pierce' },
  abilities: (L) => [selfA({ id: 'pir-duel-stance', name: 'Стойка дуэлянта', usesPerBattle: 1, effects: [{ op: 'buff', stat: 'kb', value: 3, turns: 3 }], desc: '+3 КБ на 3 хода.' }),
    ability({ id: 'pir-double-lunge', name: 'Двойной выпад', range: 1, effects: [{ op: 'weapon' }, { op: 'weapon' }], desc: 'Две атаки подряд.' })],
  desc: 'Дерётся красиво и с комментариями. Флот Буревестника держит таких для авторитета.' });
// ---- Военпром
nt('wp-vanguard', 14, { name: 'Андроид-штурмовик', faction: 'warprom', role: 'shooter', mech: true, hpK: 1.2, resist: { toxin: 'immune', electric: 'vuln' }, weapon: { name: 'Штурмовая винтовка', dmgType: 'pierce', range: 10 },
  abilities: (L) => [ability({ id: 'wp-suppress', name: 'Огонь на подавление', range: 10, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'slow', turns: 1 }], desc: 'Попадание замедляет цель.' }),
    selfA({ id: 'wp-assault-mode', name: 'Режим штурма', usesPerBattle: 1, effects: [{ op: 'buff', stat: 'hit', value: 2, turns: 3 }, { op: 'status', id: 'haste', turns: 3 }], desc: '+2 к атаке и ускорение.' })],
  desc: 'Плацдарм андроидов: кожа похожа на человеческую, терпение — нет.' });
nt('wp-handler', 12, { name: 'Оператор дронов', faction: 'warprom', role: 'support', weapon: { name: 'Пистолет-пулемёт', dmgType: 'pierce', range: 8, stat: 'dex' }, cast: 'int',
  abilities: (L) => [summonA({ id: 'wp-deploy-drone', name: 'Развернуть дрона', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'drone', turns: 3 }], desc: 'Боевой дрон на 3 хода.' }),
    ability({ id: 'wp-shield-projector', name: 'Щит-проектор', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 2 }, roll: 'auto', usesPerBattle: 2,
      effects: [{ op: 'shield', value: shieldV(L), turns: 2 }], desc: 'Щит союзникам рядом.' })],
  desc: 'Рядом с ним всегда жужжит что-то лишнее.' });
nt('wp-flamer', 16, { name: 'Огнемётчик Кремля', faction: 'warprom', role: 'brute', hpK: 1.1, weapon: { name: 'Огнемёт «Дыхание»', dmgType: 'fire', range: 4, stat: 'dex' },
  abilities: (L) => [sv({ id: 'wp-fire-stream', name: 'Струя пламени', range: 4, target: 'tile', area: { shape: 'cone', size: 4 }, save: 'dex', usesPerBattle: 3, effects: [D(L, 1.2, 'fire'), { op: 'status', id: 'burn', turns: 2 }], desc: 'Конус огня и горение.' })],
  desc: 'Топит всё, что движется в коридоре. Коридоры у Кремля длинные.' });
// ---- АИ Партия
nt('ai-censor', 16, { name: 'Цензор-аналитик', faction: 'aiParty', role: 'caster', hybrid: 1, tags: ['hybrid'], cast: 'wil', weapon: { name: 'Стилус-излучатель', dmgType: 'psychic', range: 8, stat: 'wil' },
  abilities: (L) => [aoe({ id: 'ai-ban', name: 'Запрет', save: 'wil', onSave: 'half', range: 10, usesPerBattle: 2, effects: [D(L, 1.0, 'psychic'), { op: 'status', id: 'silence', turns: 2 }], desc: 'Пси по МРЛ и немота (радиус 2).' })],
  desc: 'Вычёркивает «нежелательное»: слова, песни, героев.' });
nt('ai-kill-drone', 15, { name: 'Карательный дрон-палач', faction: 'aiParty', role: 'shooter', mech: true, weapon: { name: 'Лазерный излучатель', dmgType: 'energy', range: 14 }, resist: { electric: 'vuln' },
  abilities: (L) => [sv({ id: 'ai-laser-line', name: 'Лазерная прошивка', range: 14, target: 'tile', area: { shape: 'line', size: 8 }, save: 'dex', usesPerBattle: 2, effects: [D(L, 1.3, 'energy')], desc: 'Луч по линии.' })],
  desc: 'Летает над площадью. Ничего личного, только регламент.' });
nt('ai-political-officer', 14, { name: 'Политрук', faction: 'aiParty', role: 'support', weapon: { name: 'Табельный пистолет', dmgType: 'pierce', range: 8, stat: 'dex' },
  abilities: (L) => [ability({ id: 'ai-slogan', name: 'Лозунг дня', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 3 }, roll: 'auto', usesPerBattle: 2,
    effects: [{ op: 'status', id: 'blessed', turns: 3 }, { op: 'cleanse', count: 1, kind: 'debuff' }], desc: 'Союзникам: благословение и снятие одного дебаффа.' })],
  desc: 'Кричит «слава партии» в нужный момент и нужным тоном.' });
// ---- Жестяное братство
nt('tin-iron-monk', 12, { name: 'Железный монах', faction: 'tinBrotherhood', role: 'tank', weapon: { name: 'Посох-аналог', dmgType: 'blunt' },
  abilities: (L) => [selfA({ id: 'tin-iron-stance', name: 'Стойка железа', usesPerBattle: 1, effects: [{ op: 'status', id: 'fortified', turns: 3 }], desc: 'Сопротивление физическому урону.' }),
    ability({ id: 'tin-silent-strike', name: 'Удар без звука', range: 1, usesPerBattle: 2, effects: [{ op: 'weapon' }, { op: 'status', id: 'stun', turns: 1 }], desc: 'Попадание оглушает.' })],
  desc: 'Дисциплина вместо магии. Магия, впрочем, тоже дисциплинирована.' });
nt('tin-shadow-blade', 14, { name: 'Тень Братства', faction: 'tinBrotherhood', role: 'skirmisher', rank: 'specialist', weapon: { name: 'Короткий клинок', dmgType: 'slash' },
  abilities: (L) => [selfA({ id: 'tin-shadow-step', name: 'Шаг в тень', usesPerBattle: 1, effects: [{ op: 'status', id: 'stealth', turns: 2 }], desc: 'Скрытность на 2 хода.' }),
    ability({ id: 'tin-hamstring', name: 'Подрезать сухожилия', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L, 1.2) }, { op: 'status', id: 'slow', turns: 2 }, { op: 'status', id: 'bleed', turns: 2 }], desc: 'Замедление и кровотечение.' })],
  desc: 'Клан ходит в Тень, когда честь не отмывается светом.' });
nt('tin-forge-priest', 16, { name: 'Кузнец-жрец', faction: 'tinBrotherhood', role: 'support', weapon: { name: 'Молот аналогов', dmgType: 'blunt', range: 1, stat: 'str' }, cast: 'wil',
  abilities: (L) => [ability({ id: 'tin-forge-blessing', name: 'Благословение огня', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 3 }, roll: 'auto', usesPerBattle: 2,
    effects: [{ op: 'shield', value: shieldV(L), turns: 2 }, { op: 'buff', stat: 'dmg', value: 2, turns: 3 }], desc: 'Щит и +2 урона союзникам рядом.' }),
    ability({ id: 'tin-forge-heal', name: 'Закалка', range: 8, target: 'ally', roll: 'auto', usesPerBattle: 3, effects: [{ op: 'heal', dice: X6(L, 2), bonus: Math.round(L / 2), resource: 'hp' }], desc: 'Лечит союзника.' })],
  desc: 'Кует доспех прямо на союзнике. Союзник привыкает.' });
// ---- Отступники
nt('ren-demolition', 10, { name: 'Подрывник-ветеран', faction: 'renegades', role: 'shooter', weapon: { name: 'Обрез', dmgType: 'pierce', range: 8 },
  abilities: (L) => [aoe({ id: 'ren-charge', name: 'Заряд направленного действия', save: 'dex', usesPerBattle: 2, effects: [D(L, 1.4, 'fire'), { op: 'push', tiles: 2 }], desc: 'Взрыв (радиус 2) и отбрасывание.' })],
  desc: 'Знает три способа открыть дверь и один — закрыть навсегда.' });
nt('ren-sharpshooter', 13, { name: 'Снайпер Куксиуса', faction: 'renegades', role: 'shooter', weapon: { name: 'Снайперская винтовка', dmgType: 'pierce', range: 20 },
  abilities: (L) => [ability({ id: 'ren-mark-shot', name: 'Выстрел с меткой', range: 20, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'marked', turns: 3 }], desc: 'Попадание ставит метку.' })],
  desc: 'Работает по Куксиусовой науке: дыши, целься, не философствуй.' });
nt('ren-agitator', 11, { name: 'Агитатор свободы', faction: 'renegades', role: 'support', weapon: { name: 'Мегафон-кастет', dmgType: 'blunt', range: 1, stat: 'str' },
  abilities: (L) => [ability({ id: 'ren-rally', name: 'Речь у костра', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 3 }, roll: 'auto', usesPerBattle: 2,
    effects: [{ op: 'status', id: 'inspired', turns: 3 }, { op: 'status', id: 'blessed', turns: 2 }], desc: 'Вдохновение и благословение союзникам.' }),
    aoe({ id: 'ren-fear-speech', name: 'Обличение', save: 'wil', range: 8, usesPerBattle: 1, onSave: 'none', effects: [{ op: 'status', id: 'fear', turns: 2 }], desc: 'Страх врагам в радиусе 2.' })],
  desc: 'Если ему не аплодируют, он делает громче.' });
// ---- Механиды
nt('mech-swarm-queen', 16, { name: 'Королева роя', faction: 'mechanids', role: 'support', mech: true, rank: 'elite', weapon: { name: 'Жало-манипулятор', dmgType: 'pierce', range: 1, stat: 'str' }, cast: 'int',
  abilities: (L) => [summonA({ id: 'mech-spawn', name: 'Сборка роя', usesPerBattle: 3, effects: [{ op: 'summon', unit: 'drone', turns: 4 }], desc: 'Дрон на 4 хода.' }),
    ability({ id: 'mech-hive-shield', name: 'Общий щит', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 3 }, roll: 'auto', usesPerBattle: 2, effects: [{ op: 'shield', value: shieldV(L), turns: 2 }], desc: 'Щит союзникам.' })],
  desc: 'Мать цеха: рожает из чугуна и аккуратно считает потомство.' });
nt('mech-rust-hound', 10, { name: 'Ржавая гончая', faction: 'mechanids', role: 'brute', mech: true, speed: 9, weapon: { name: 'Кислотные челюсти', dmgType: 'toxin', stat: 'str' },
  abilities: () => [ability({ id: 'mech-rust-bite', name: 'Ржавый укус', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'corrosion', turns: 3 }], desc: 'Коррозия на 3 хода.' })],
  desc: 'Гончие цеха нюхают органику и охотятся на неё без перерыва на обед.' });
nt('mech-nanite-cloud', 14, { name: 'Облако наномашин', faction: 'mechanids', role: 'caster', mech: true, weapon: { name: 'Рой', dmgType: 'toxin', range: 6 }, tags: ['mechanical'], resist: { slash: 'resist', pierce: 'resist', blunt: 'resist', electric: 'vuln' }, cast: 'int',
  abilities: (L) => [aoe({ id: 'mech-nano-devour', name: 'Разборка на атомы', save: 'con', range: 8, area: { shape: 'radius', size: 3 }, effects: [D(L, 1.1, 'toxin'), { op: 'status', id: 'corrosion', turns: 2 }], desc: 'Яд и коррозия (радиус 3).' })],
  desc: 'Серое облако, которое медленно ест всё, что не еда.' });
// ---- Кринжгоны
nt('crg-banner-bearer', 12, { name: 'Знаменосец кринжа', faction: 'cringegons', role: 'support', weapon: { name: 'Древко-флаг', dmgType: 'blunt', range: 2, stat: 'str' }, cast: 'cha',
  abilities: (L) => [ability({ id: 'crg-banner', name: 'Знамя позора', action: 'bonus', range: 0, target: 'self', area: { shape: 'radius', size: 4 }, roll: 'auto', usesPerBattle: 2,
    effects: [{ op: 'status', id: 'inspired', turns: 3 }, { op: 'buff', stat: 'dmg', value: 2, turns: 3 }], desc: 'Союзникам рядом: вдохновение и +2 урона.' }),
    aoe({ id: 'crg-cringe-wave', name: 'Волна неловкости', save: 'wil', range: 0, area: { shape: 'radius', size: 3 }, effects: [D(L, 0.9, 'cringe'), { op: 'status', id: 'cringed', turns: 1 }], usesPerBattle: 2, desc: 'Кринж по МРЛ вокруг.' })],
  desc: 'Знамя пёстрое, цель одна: чтобы вам стало стыдно.' });
nt('crg-meme-lord', 15, { name: 'Мем-лорд', faction: 'cringegons', role: 'caster', tags: ['hybrid'], cast: 'cha', weapon: { name: 'Кринж-пушка', dmgType: 'cringe', range: 10, stat: 'cha' }, resist: { cringe: 'resist', psychic: 'resist' },
  abilities: (L) => [aoe({ id: 'crg-meme-flood', name: 'Потоп мемов', save: 'wil', range: 10, area: { shape: 'radius', size: 3 }, usesPerBattle: 2, effects: [D(L, 1.1, 'cringe'), { op: 'status', id: 'hallucination', turns: 2 }], desc: 'Кринж по МРЛ и галлюцинации (радиус 3).' })],
  desc: 'Его шутки старше его самого. И опаснее.' });
nt('crg-stage-diver', 10, { name: 'Стендапер-смертник', faction: 'cringegons', role: 'skirmisher', rank: 'grunt', weapon: { name: 'Микрофонная стойка', dmgType: 'blunt' }, immune: ['fear'],
  abilities: (L) => [aoe({ id: 'crg-final-bit', name: 'Последняя шутка', trigger: 'death', onDeath: true, range: 0, target: 'tile', area: { shape: 'radius', size: 2 }, save: 'wil',
    effects: [D(L, 1.0, 'cringe'), { op: 'status', id: 'cringed', turns: 2 }], desc: 'При гибели: кринж в радиусе 2.' })],
  desc: 'Падает со сцены в зал. Зал не ловит.' });
// ---- Мусорщики
nt('scv-junk-golem', 10, { name: 'Свалочный голем', faction: 'scavengers', role: 'tank', mech: true, hpK: 1.2, weapon: { name: 'Кулак-лом', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [ability({ id: 'scv-slam', name: 'Обвал хлама', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'push', tiles: 2 }, { op: 'status', id: 'prone', turns: 1 }], desc: 'Отбрасывает и валит.' })],
  desc: 'Куча, которая собралась в кулак. Кулак — тоже куча.' });
nt('scv-ram-raider', 13, { name: 'Рейдер-таран', faction: 'scavengers', role: 'brute', weapon: { name: 'Таран-бур', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [ability({ id: 'scv-charge', name: 'Таранный наскок', range: 4, usesPerBattle: 2, effects: [{ op: 'move', tiles: 4, mode: 'dash' }, { op: 'weapon', extraDice: X6(L) }, { op: 'push', tiles: 2 }], desc: 'Рывок, удар, отбрасывание.' })],
  desc: 'Тормозов на нём нет. Совести — по оценке.' });
nt('scv-scrap-sniper', 15, { name: 'Утилизатор-снайпер', faction: 'scavengers', role: 'shooter', weapon: { name: 'Рельсовая трубка', dmgType: 'pierce', range: 18 },
  abilities: (L) => [ability({ id: 'scv-disarm-shot', name: 'Выбить оружие', range: 18, usesPerBattle: 2, effects: [{ op: 'weapon' }, { op: 'status', id: 'disarm', turns: 2 }], desc: 'Попадание — разоружение.' })],
  desc: 'Разбирает чужое имущество прямо на владельце.' });
// ---- Техоньки
nt('tek-proxy-shaman', 12, { name: 'Прокси-шаман', faction: 'tekhonki', role: 'caster', tags: ['hybrid'], weapon: { name: 'Посох-антенна', dmgType: 'proxy', range: 8, stat: 'int' }, cast: 'int',
  abilities: (L) => [aoe({ id: 'tek-arc', name: 'Дуга', save: 'dex', range: 10, area: { shape: 'radius', size: 2 }, usesPerBattle: 3, effects: [D(L, 1.2, 'electric'), { op: 'status', id: 'silence', turns: 1 }], desc: 'Электро по площади и немота.' })],
  desc: 'Общается с Прокси напрямую. Прокси ответил один раз и больше не будет.' });
nt('tek-old-god-disciple', 15, { name: 'Ученик Старого бога', faction: 'tekhonki', role: 'caster', tags: ['hybrid'], cast: 'wil', weapon: { name: 'Чёрный кабель', dmgType: 'proxy', range: 8, stat: 'wil' },
  abilities: (L) => [ability({ id: 'tek-old-drain', name: 'Вычерпать', range: 8, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2.2), dmgType: 'proxy', to: 'hp', ratio: 0.5 }], desc: 'Урон и лечение на половину.' }),
    aoe({ id: 'tek-storm-call', name: 'Зов бури', save: 'wil', range: 10, usesPerBattle: 1, effects: [D(L, 1.3, 'proxy'), { op: 'status', id: 'hallucination', turns: 2 }], desc: 'Пси-шторм.' })],
  desc: 'Слышит голоса. Голоса просят аккуратнее.' });
nt('tek-servo-titan', 17, { name: 'Серво-титан', faction: 'tekhonki', role: 'tank', mech: true, rank: 'elite', weapon: { name: 'Сервомолот', dmgType: 'blunt', stat: 'str' }, resist: { electric: 'vuln' },
  abilities: (L) => [ability({ id: 'tek-seismic', name: 'Сейсмический удар', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L) }, { op: 'status', id: 'stun', turns: 1 }], desc: 'Оглушение.' })],
  desc: 'Старый бог приказал вырасти. Он вырос.' });
// ---- Нейтральные селения
nt('nv-veteran-ranger', 9, { name: 'Ветеран-следопыт', faction: 'neutralVillages', role: 'shooter', weapon: { name: 'Длинный лук', dmgType: 'pierce', range: 16 },
  abilities: (L) => [ability({ id: 'nv-snare-shot', name: 'Стрела-силок', range: 14, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'root', turns: 1 }], desc: 'Попадание обездвиживает.' })],
  desc: 'Слышал про кринж-маяки и отнёсся скептически.' });
nt('nv-village-healer', 8, { name: 'Деревенская целительница', faction: 'neutralVillages', role: 'support', weapon: { name: 'Посох-клюка', dmgType: 'blunt', range: 1, stat: 'str' },
  abilities: (L) => [ability({ id: 'nv-heal', name: 'Травяной настой', range: 8, target: 'ally', roll: 'auto', usesPerBattle: 3, effects: [{ op: 'heal', dice: X6(L, 2.4), bonus: L, resource: 'hp' }], desc: 'Лечит союзника.' })],
  desc: 'Лечит всех — и тех, кто дерётся с её сыном.' });
// ---- Агрозона
nt('agro-flame-loader', 12, { name: 'Погрузчик-огнемёт', faction: 'agrozone', role: 'brute', mech: true, weapon: { name: 'Огнемёт-манипулятор', dmgType: 'fire', range: 4, stat: 'str' },
  abilities: (L) => [sv({ id: 'agro-burn-row', name: 'Выжечь ряд', range: 4, target: 'tile', area: { shape: 'cone', size: 4 }, save: 'dex', usesPerBattle: 3, effects: [D(L, 1.2, 'fire'), { op: 'status', id: 'burn', turns: 2 }], desc: 'Конус огня и горение.' })],
  desc: 'Рассчитан на кукурузу. Применяется ко всему.' });
nt('agro-drone-swarm', 9, { name: 'Рой опрыскивателей', faction: 'agrozone', role: 'shooter', mech: true, rank: 'grunt', weapon: { name: 'Распылитель', dmgType: 'toxin', range: 8 },
  abilities: (L) => [aoe({ id: 'agro-spray', name: 'Опрыскивание', save: 'con', range: 8, usesPerBattle: 3, effects: [D(L, 0.9, 'toxin'), { op: 'status', id: 'poison', turns: 2 }], desc: 'Яд по площади.' })],
  desc: 'Пестициды для вредителей. Вредитель — вы.' });
nt('agro-silo-warden', 15, { name: 'Смотритель элеватора', faction: 'agrozone', role: 'tank', mech: true, rank: 'elite', weapon: { name: 'Шнек', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [selfA({ id: 'agro-silo-shell', name: 'Зерновой щит', usesPerBattle: 1, effects: [{ op: 'shield', value: shieldV(L, 3), turns: 3 }], desc: 'Большой щит себе.' }),
    ability({ id: 'agro-grain-crush', name: 'Давка зерном', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'root', turns: 1 }], desc: 'Обездвиживает.' })],
  desc: 'Сторожит зерно, как только АИ умеет.' });
// ---- Мутанты-Р
nt('mutr-bloom-shaman', 12, { name: 'Шаман цветения', faction: 'mutantsPlant', role: 'support', weapon: { name: 'Побег-посох', dmgType: 'toxin', range: 6, stat: 'wil' }, cast: 'wil',
  abilities: (L) => [ability({ id: 'mutr-bloom-heal', name: 'Цветение', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 3 }, roll: 'auto', usesPerBattle: 2, effects: [{ op: 'status', id: 'regen', turns: 3 }], desc: 'Регенерация союзникам.' }),
    aoe({ id: 'mutr-spores', name: 'Споры', save: 'con', range: 8, usesPerBattle: 2, effects: [D(L, 0.9, 'toxin'), { op: 'status', id: 'poison', turns: 2 }], desc: 'Яд (радиус 2).' })],
  desc: 'Цветёт, когда кто-то рядом умирает. Старается, чтобы это был не он.' });
nt('mutr-vine-lord', 15, { name: 'Лоза-хозяйка', faction: 'mutantsPlant', role: 'brute', rank: 'elite', weapon: { name: 'Плеть-лоза', dmgType: 'slash', range: 3, stat: 'str' },
  abilities: (L) => [sv({ id: 'mutr-entangle', name: 'Опутать', range: 8, target: 'tile', area: { shape: 'radius', size: 2 }, save: 'str', onSave: 'none', usesPerBattle: 2, effects: [{ op: 'status', id: 'root', turns: 2 }, D(L, 0.6, 'pierce')], desc: 'Обездвиживает (радиус 2).' })],
  desc: 'Роща в её руках — сеть.' });
nt('mutr-spore-bomb', 9, { name: 'Споровый шар', faction: 'mutantsPlant', role: 'skirmisher', rank: 'grunt', weapon: { name: 'Шипы', dmgType: 'pierce' },
  abilities: (L) => [aoe({ id: 'mutr-pop', name: 'Лопнуть', trigger: 'death', onDeath: true, range: 0, target: 'tile', area: { shape: 'radius', size: 2 }, save: 'con', effects: [D(L, 1.0, 'toxin'), { op: 'status', id: 'poison', turns: 2 }], desc: 'При гибели: яд в радиусе 2.' })],
  desc: 'Красиво катится. Громко лопается.' });
// ---- Культ Судьи
nt('cult-soul-reaper', 16, { name: 'Жнец душ', faction: 'cult', role: 'caster', tags: ['hybrid'], rank: 'elite', cast: 'wil', weapon: { name: 'Коса-терминал', dmgType: 'psychic', range: 2, stat: 'wil' },
  abilities: (L) => [ability({ id: 'cult-reap', name: 'Жатва', range: 8, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2.3), dmgType: 'psychic', to: 'mrl', ratio: 0.6 }], desc: 'Пси по МРЛ и лечение себя.' }),
    aoe({ id: 'cult-fear-reap', name: 'Дыхание конца', save: 'wil', range: 8, onSave: 'none', usesPerBattle: 1, effects: [{ op: 'status', id: 'fear', turns: 2 }], desc: 'Страх (радиус 2).' })],
  desc: 'Собирает то, что Судья отметил.' });
nt('cult-skrilet-prime', 14, { name: 'Скрилет-убийца старшей формы', faction: 'cult', role: 'skirmisher', tags: ['hybrid'], weapon: { name: 'Клинки-кости', dmgType: 'slash' },
  abilities: (L) => [selfA({ id: 'cult-skr-vanish', name: 'Растворение', usesPerBattle: 1, effects: [{ op: 'status', id: 'stealth', turns: 2 }], desc: 'Скрытность на 2 хода.' }),
    ability({ id: 'cult-skr-rend', name: 'Разорвать', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L, 1.3) }, { op: 'status', id: 'bleed', turns: 3 }], desc: 'Доп. урон и кровотечение.' })],
  desc: 'Тот, кого вы не увидели, но услышали.' });
nt('cult-judge-seer', 18, { name: 'Провидец приговора', faction: 'cult', role: 'caster', tags: ['hybrid'], cast: 'wil', rank: 'elite', weapon: { name: 'Жезл приговора', dmgType: 'psychic', range: 10, stat: 'wil' }, resist: { psychic: 'resist', cringe: 'resist' },
  abilities: (L) => [aoe({ id: 'cult-seer-verdict', name: 'Приговор', save: 'wil', onSave: 'none', range: 10, area: { shape: 'radius', size: 3 }, usesPerBattle: 2, effects: [{ op: 'status', id: 'curse', turns: 3 }, { op: 'status', id: 'marked', turns: 3 }], desc: 'Проклятие и метка (радиус 3).' }),
    ability({ id: 'cult-seer-glare', name: 'Взгляд Судьи', range: 10, roll: 'save', save: 'wil', onSave: 'half', effects: [D(L, 1.2, 'psychic')], desc: 'Пси по МРЛ.' })],
  desc: 'Читает «дело» наперёд. Дело чаще всего плохо.' });
nt('cult-datawraith', 18, { name: 'Дата-призрак', faction: 'cult', role: 'caster', tags: ['hybrid'], weapon: { name: 'Поток данных', dmgType: 'cyber', range: 8, stat: 'int' }, resist: { slash: 'resist', pierce: 'resist', blunt: 'resist', proxy: 'vuln' },
  abilities: (L) => [aoe({ id: 'cult-data-flood', name: 'Перегрузка канала', save: 'int', range: 8, usesPerBattle: 2, effects: [D(L, 1.1, 'cyber'), { op: 'status', id: 'hallucination', turns: 1 }], desc: 'Кибер-урон и галлюцинации.' })],
  desc: 'Дух, которому не хватило души на тело.' });
nt('cult-firewall', 18, { name: 'Файрвол Судьи', faction: 'cult', role: 'tank', mech: true, rank: 'elite', weapon: { name: 'Решётка-кулак', dmgType: 'energy', stat: 'str' }, resist: { proxy: 'vuln', electric: 'vuln' },
  abilities: (L) => [selfA({ id: 'cult-fw-wall', name: 'Стена доступа', usesPerBattle: 1, effects: [{ op: 'shield', value: shieldV(L, 3), turns: 3 }], desc: 'Большой щит себе.' }),
    ability({ id: 'cult-fw-block', name: 'Блокировка', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'silence', turns: 2 }], desc: 'Немота.' })],
  desc: 'Не пускает. Никого. Даже туда, где вы уже были.' });
// ---- Мутанты-Ж
nt('mutz-bone-crusher', 10, { name: 'Костолом', faction: 'mutantsBeast', role: 'brute', weapon: { name: 'Костяная дубина', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [ability({ id: 'mutz-crush', name: 'Крушить', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L) }, { op: 'status', id: 'stun', turns: 1 }], desc: 'Оглушение.' })],
  desc: 'Громко. Просто громко.' });
nt('mutz-night-stalker', 13, { name: 'Ночной выслеживатель', faction: 'mutantsBeast', role: 'skirmisher', speed: 8, weapon: { name: 'Когти', dmgType: 'slash' },
  abilities: (L) => [selfA({ id: 'mutz-lurk', name: 'Затаиться', usesPerBattle: 1, effects: [{ op: 'status', id: 'stealth', turns: 2 }], desc: 'Скрытность на 2 хода.' }),
    ability({ id: 'mutz-rake', name: 'Располосовать', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L) }, { op: 'status', id: 'bleed', turns: 3 }], desc: 'Кровотечение.' })],
  desc: 'Видит в темноте, слышит во сне, догоняет всегда.' });
nt('mutz-shaman', 12, { name: 'Шаман стаи', faction: 'mutantsBeast', role: 'support', weapon: { name: 'Тотем-посох', dmgType: 'blunt', range: 1, stat: 'str' }, cast: 'wil',
  abilities: (L) => [ability({ id: 'mutz-howl-buff', name: 'Зов крови', action: 'bonus', range: 8, target: 'ally', area: { shape: 'radius', size: 4 }, roll: 'auto', usesPerBattle: 2, effects: [{ op: 'status', id: 'haste', turns: 3 }, { op: 'status', id: 'berserk', turns: 3 }], desc: 'Стае: ускорение и берсерк.' }),
    ability({ id: 'mutz-mend', name: 'Лизнуть раны', range: 6, target: 'ally', roll: 'auto', usesPerBattle: 2, effects: [{ op: 'heal', dice: X6(L, 2.2), bonus: L, resource: 'hp' }], desc: 'Лечит.' })],
  desc: 'Шерсть, бусы и командный голос.' });
// ---- Дикие земли (без фракции)
nt('wild-frost-wraith', 12, { name: 'Ледяной призрак', faction: null, role: 'caster', tags: ['organic'], cast: 'wil', weapon: { name: 'Стылое касание', dmgType: 'psychic', range: 6, stat: 'wil' }, resist: { slash: 'resist', pierce: 'resist', blunt: 'resist', toxin: 'immune', proxy: 'vuln' }, loot: null,
  abilities: (L) => [aoe({ id: 'wild-frost-chill', name: 'Заморозка душ', save: 'con', range: 8, usesPerBattle: 2, effects: [D(L, 1.0, 'psychic'), { op: 'status', id: 'slow', turns: 2 }], desc: 'Пси по МРЛ и замедление.' })],
  desc: 'Замёрзший в льду душ — из тех, что в Киберспейс так и не дошли.' });
nt('wild-ice-golem', 13, { name: 'Ледяной голем', faction: null, role: 'tank', rank: 'elite', mech: false, weapon: { name: 'Ледяной кулак', dmgType: 'blunt', stat: 'str' }, resist: { fire: 'vuln', toxin: 'immune' }, immune: ['bleed', 'poison'], loot: null,
  abilities: (L) => [ability({ id: 'wild-ice-slam', name: 'Ледяной удар', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'slow', turns: 2 }, { op: 'push', tiles: 2 }], desc: 'Замедляет и толкает.' })],
  desc: 'Кто-то зачем-то слепил его из ледника.' });

// ---- Киберспейс v2 (docs/specs/cyberspace-v2.md, CS_ENEMIES в data/world/cyberspace.js): цифровые, ур. 6–16; версии под героя — data/enemies-cyber.js
const CS_RES = (o) => ({ cyber: 'resist', toxin: 'immune', proxy: 'vuln', ...o });
nt('cs-glitch-hound', 6, { name: 'Глитч-гончая', faction: 'cult', role: 'skirmisher', rank: 'grunt', tags: ['digital'], speed: 8, loot: 'cyberspace', immune: ['poison', 'bleed'], resist: CS_RES(),
  weapon: { name: 'Глитч-клыки', dmgType: 'cyber' },
  abilities: (L) => [ability({ id: 'cs-lag-dash', name: 'Рывок-«лаг»', range: 4, usesPerBattle: 2, effects: [{ op: 'weapon' }, { op: 'status', id: 'glitch', turns: 1 }], desc: 'Бросок на 4 клетки: удар и «Глитч» на ход.' })],
  desc: 'Гончая из битых пакетов. Догоняет раньше, чем срывается с места.' });
nt('cs-ice-warden', 9, { name: 'Страж-ICE', faction: 'cult', role: 'tank', tags: ['digital'], loot: 'cyberspace', immune: ['poison', 'bleed'], resist: { cyber: 'resist', fire: 'vuln', pierce: 'resist' },
  weapon: { name: 'Ледяной шлюз-кулак', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [ability({ id: 'cs-ice-barrier', name: 'Барьер', action: 'bonus', range: 6, target: 'ally', area: { shape: 'radius', size: 2 }, roll: 'auto', usesPerBattle: 2,
    effects: [{ op: 'buff', stat: 'kb', value: 2, turns: 2 }], desc: 'Союзники рядом: +2 КБ на 2 хода.' })],
  desc: 'Защита Судьи от «лишних душ». Замёрз в одном бите и доволен.' });
nt('cs-echo-wail', 8, { name: 'Эхо-плакальщик', faction: null, role: 'caster', tags: ['digital'], cast: 'wil', loot: 'cyberspace', immune: ['poison', 'bleed'], resist: { cyber: 'resist', psychic: 'vuln', cringe: 'vuln' },
  weapon: { name: 'Всхлип', dmgType: 'psychic', range: 6, stat: 'wil' },
  abilities: (L) => [aoe({ id: 'cs-wail', name: 'Плач', save: 'wil', range: 8, usesPerBattle: 2, effects: [D(L, 1.0, 'psychic')], desc: 'Пси по МРЛ (радиус 2).' })],
  desc: 'Поёт колыбельную. Не враждебен — просто плохо умеет по-другому.' });
nt('cs-leech-daemon', 11, { name: 'Демон-пиявка', faction: 'cult', role: 'support', rank: 'elite', tags: ['digital'], cast: 'int', loot: 'cyberspace', immune: ['poison', 'bleed'], resist: CS_RES(),
  weapon: { name: 'Присоски', dmgType: 'cyber', range: 1, stat: 'str' },
  abilities: (L) => [ability({ id: 'cs-leech', name: 'Высасывание', range: 6, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2), dmgType: 'cyber', to: 'hp', ratio: 0.5 }], desc: 'Кибер-урон, пиявка лечится.' }),
    summonA({ id: 'cs-leech-call', name: 'Призыв кибер-демона', usesPerBattle: 1, effects: [{ op: 'summon', unit: 'cyber-demon', turns: 3 }], desc: 'Кибер-демон на 3 хода.' })],
  desc: 'Посредник Рынка душ. Берёт комиссию прямо из тебя.' });
nt('cs-null-walker', 13, { name: 'Нуль-ходок', faction: 'cult', role: 'skirmisher', rank: 'elite', tags: ['digital'], loot: 'cyberspace', immune: ['poison', 'bleed'], resist: { cyber: 'immune', pierce: 'resist', proxy: 'vuln' },
  weapon: { name: 'Стирающая ладонь', dmgType: 'cyber' },
  abilities: (L) => [ability({ id: 'cs-erase', name: 'Стирание', range: 1, usesPerBattle: 2, effects: [{ op: 'weapon', extraDice: X6(L) }, { op: 'status', id: 'stun', turns: 1 }], desc: 'Доп. урон, цель пропускает ход.' })],
  desc: 'То, что стёрто, иногда ходит. Тихо и без имени.' });
nt('cs-judge-eye', 16, { name: 'Око Судьи', faction: 'cult', role: 'caster', rank: 'miniboss', tags: ['digital'], cast: 'wil', loot: 'cyberspace', immune: ['poison', 'bleed', 'fear'], resist: { cyber: 'immune', psychic: 'resist', proxy: 'vuln' },
  weapon: { name: 'Взгляд', dmgType: 'cyber', range: 10, stat: 'wil' },
  abilities: (L) => [sv({ id: 'cs-eye-mark', name: 'Метка взгляда', range: 10, save: 'wil', onSave: 'none', usesPerBattle: 2, effects: [{ op: 'status', id: 'marked', turns: 3 }], desc: 'Метка на цель.' }),
    aoe({ id: 'cs-eye-verdict', name: 'Приговор', save: 'wil', range: 10, usesPerBattle: 2, effects: [D(L, 1.6, 'cyber')], desc: 'Большой кибер-урон (радиус 2).' })],
  desc: 'Судья не смотрит. Смотрит Око. Разница — для протокола.' });

for (const [id, L] of Object.entries(native)) N(id, L);

// ---------------------------------------------------------------- эндгейм-боссы
const NO_MIND_RES = { psychic: 'resist', cringe: 'resist' };
function boss(id, L, s) { return put(buildNew(id, L, { rank: 'boss', ...s })); }

boss('boss-ai-general', 19, { name: 'Генерал ИИ', faction: 'aiParty', role: 'shooter', tags: ['hybrid'], cast: 'int', hpK: 1.1, kbAdj: 2, immune: ['fear'], loot: 'boss-armory-ai',
  weapon: { name: 'Табельная пушка Генерала', dmgType: 'energy', range: 14 },
  abilities: (L) => [
    summonA({ id: 'gen-order', name: 'Приказ о чистке', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'ai-laser-trooper', turns: 4 }], desc: 'Лазерный трупер на 4 хода.' }),
    aoe({ id: 'gen-barrage', name: 'Заградительный огонь', save: 'dex', range: 14, area: { shape: 'radius', size: 3 }, usesPerBattle: 3, effects: [D(L, 1.5, 'energy'), { op: 'status', id: 'dazed', turns: 1 }], desc: 'Огонь по площади (радиус 3).' }),
    sv({ id: 'gen-purge', name: 'Это не бунт — это чистка', range: 0, target: 'tile', area: { shape: 'radius', size: 5 }, save: 'wil', usesPerBattle: 2, effects: [D(L, 1.2, 'psychic'), { op: 'status', id: 'fear', turns: 1 }], desc: 'Пси по МРЛ и страх (радиус 5).' }),
    ability({ id: 'gen-target-lock', name: 'Контроль цели', range: 14, usesPerBattle: 3, effects: [{ op: 'weapon' }, { op: 'status', id: 'marked', turns: 3 }], desc: 'Попадание ставит метку.' }),
    selfA({ id: 'gen-backup', name: 'Резервный контур', usesPerBattle: 1, effects: [{ op: 'shield', value: shieldV(L, 5), turns: 3 }], desc: 'Большой щит себе.' })],
  desc: 'Заместитель лидера АИ Партии, управляет армией и карателями. «Это не бунт – это чистка».', canon: ['lore/history.md', 'lore/timeline.md'] });

boss('boss-cyber-priest-prime', 18, { name: 'Кибер-Жрец в силе', faction: 'cult', role: 'caster', tags: ['hybrid'], cast: 'wil', hpK: 1.15, resist: NO_MIND_RES, immune: ['fear'], loot: 'boss-plague-seed',
  weapon: { name: 'Посох-терминал: полная мощность', dmgType: 'blunt', range: 2, stat: 'wil' },
  abilities: (L) => [
    sv({ id: 'cp-whisper', name: 'Глас Судьи', range: 12, usesPerBattle: null, save: 'wil', effects: [D(L, 1.1, 'psychic')], desc: 'Пси по МРЛ.' }),
    ability({ id: 'cp-soul-theft', name: 'Похищение души', range: 8, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2.4), dmgType: 'cyber', to: 'hp', ratio: 0.5 }], desc: 'Кибер-урон, жрец лечится.' }),
    aoe({ id: 'cp-verdict', name: 'Приговор', save: 'wil', onSave: 'none', range: 10, area: { shape: 'radius', size: 3 }, usesPerBattle: 2, effects: [{ op: 'status', id: 'curse', turns: 3 }, { op: 'status', id: 'silence', turns: 2 }], desc: 'Проклятие и немота (радиус 3).' }),
    summonA({ id: 'cp-skrilet', name: 'Призыв скрилета', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'skrilet', turns: 4 }], desc: 'Скрилет на 4 хода.' }),
    selfA({ id: 'cp-upload', name: 'Резервная копия', usesPerBattle: 1, effects: [{ op: 'shield', value: shieldV(L, 4), turns: 3 }, { op: 'cleanse', count: 2, kind: 'debuff' }], desc: 'Щит и снятие двух дебаффов.' })],
  desc: 'Заместитель Судьи, управляет культистами. Здесь — без сдерживающих протоколов.', canon: ['lore/history.md', 'lore/npcs.md'] });

boss('boss-judge-avatar', 20, { name: 'Воплощение Судьи', faction: 'cult', role: 'caster', tags: ['hybrid'], cast: 'wil', hpK: 1.25, resist: NO_MIND_RES, immune: ['fear', 'stun', 'prone'], loot: 'boss-plague-seed', speed: 6,
  weapon: { name: 'Рука приговора', dmgType: 'psychic', range: 3, stat: 'wil' },
  abilities: (L) => [
    sv({ id: 'ja-no-appeal', name: 'Приговор без апелляции', range: 12, usesPerBattle: 3, save: 'wil', effects: [D(L, 2.4, 'psychic')], desc: 'Сильный пси-удар по МРЛ.' }),
    aoe({ id: 'ja-wrath', name: 'Гнев Судьи', save: 'wil', range: 0, target: 'tile', area: { shape: 'radius', size: 4 }, usesPerBattle: 3, effects: [D(L, 1.3, 'cringe'), { op: 'status', id: 'cringed', turns: 1 }], desc: 'Кринж по МРЛ вокруг (радиус 4).' }),
    aoe({ id: 'ja-mark', name: 'Отметина', save: 'wil', onSave: 'none', range: 12, area: { shape: 'radius', size: 2 }, usesPerBattle: 2, effects: [{ op: 'status', id: 'curse', turns: 3 }, { op: 'status', id: 'marked', turns: 3 }], desc: 'Проклятие и метка.' }),
    summonA({ id: 'ja-retinue', name: 'Свита из пустоты', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'skrilet', turns: 4 }], desc: 'Скрилет на 4 хода.' }),
    ability({ id: 'ja-absorb', name: 'Идеальное тело', range: 8, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2.5), dmgType: 'psychic', to: 'hp', ratio: 0.6 }], desc: 'Поглощает: урон и лечение себя.' })],
  desc: 'Судья ищет «идеальное тело». Нашёл — или считает, что нашёл. Финальный бой Акта III.', canon: ['lore/timeline.md', 'lore/history.md'] });

boss('boss-crg-chief', 15, { name: 'Кринж-Вождь', faction: 'cringegons', role: 'brute', tags: ['hybrid'], cast: 'cha', hpK: 1.1, immune: ['fear', 'cringed'], resist: { cringe: 'resist', psychic: 'resist' }, loot: 'boss-vibe-burner',
  weapon: { name: 'Рупор-палица', dmgType: 'blunt', stat: 'str' },
  abilities: (L) => [
    selfA({ id: 'chief-roar', name: 'Боевой клич', usesPerBattle: 1, effects: [{ op: 'status', id: 'berserk', turns: 3 }, { op: 'status', id: 'haste', turns: 3 }], desc: 'Берсерк и ускорение.' }),
    aoe({ id: 'chief-shame', name: 'Волна позора', save: 'wil', range: 0, target: 'tile', area: { shape: 'radius', size: 3 }, usesPerBattle: 3, effects: [D(L, 1.2, 'cringe'), { op: 'status', id: 'cringed', turns: 1 }], desc: 'Кринж по МРЛ (радиус 3).' }),
    summonA({ id: 'chief-jesters', name: 'Выход шутов', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'cringe-jester', turns: 4 }], desc: 'Кринж-шут на 4 хода.' }),
    ability({ id: 'chief-smash', name: 'Удар рупором', range: 1, usesPerBattle: 3, effects: [{ op: 'weapon', extraDice: X6(L, 1.3) }, { op: 'status', id: 'stun', turns: 1 }, { op: 'push', tiles: 2 }], desc: 'Оглушение и отбрасывание.' })],
  desc: 'Лидер кринжгонов: агрессивный и безжалостный. Орёт — и это его самая тонкая тактика.', canon: ['lore/history.md', 'lore/npcs.md'] });

boss('boss-great-collector', 16, { name: 'Великий Собиратель', faction: 'cringegons', role: 'caster', tags: ['hybrid'], cast: 'cha', hpK: 1.1, resist: NO_MIND_RES, immune: ['fear'], loot: 'boss-vibe-burner',
  weapon: { name: 'Крюк коллекционера', dmgType: 'cyber', range: 8, stat: 'cha' },
  abilities: (L) => [
    ability({ id: 'gc-collect', name: 'Коллекция', range: 10, usesPerBattle: 3, effects: [{ op: 'drain', dice: X6(L, 2.2), dmgType: 'cringe', to: 'mrl', ratio: 0.6 }], desc: 'Кринж по МРЛ и лечение МРЛ себе.' }),
    sv({ id: 'gc-exhibit', name: 'Витрина', range: 10, target: 'tile', area: { shape: 'radius', size: 2 }, save: 'str', onSave: 'none', usesPerBattle: 2, effects: [{ op: 'status', id: 'root', turns: 2 }, { op: 'status', id: 'disarm', turns: 2 }], desc: 'Обездвиживает и разоружает (радиус 2).' }),
    aoe({ id: 'gc-vibe-theft', name: 'Кража вайба', save: 'wil', range: 10, area: { shape: 'radius', size: 3 }, usesPerBattle: 2, effects: [D(L, 1.2, 'cringe'), { op: 'status', id: 'silence', turns: 2 }], desc: 'Кринж и немота (радиус 3).' }),
    summonA({ id: 'gc-exponats', name: 'Экспонаты', usesPerBattle: 2, effects: [{ op: 'summon', unit: 'cringe-jester', turns: 4 }], desc: 'Экспонат-шут на 4 хода.' }),
    selfA({ id: 'gc-vitrine', name: 'Бронестекло', usesPerBattle: 1, effects: [{ op: 'shield', value: shieldV(L, 4), turns: 3 }], desc: 'Щит себе.' })],
  desc: 'Новый лидер кринжгонов — по словам пленных. Собирает всё, чем вы дорожите, и отлично хранит.', canon: ['lore/npcs.md'] });

// Лис-9 и Волк-0 в полной силе (lift боссов v3 + «полная мощность»)
lift('boss-lis-9-tail', 15, { id: 'boss-lis-9-full', name: 'Лис-9 «Хвост»: полная сила', rank: 'boss', boss: true, hpK: 1.05,
  extra: [ability({ id: 'lis9-overdrive', name: 'Полная мощность', action: 'bonus', range: 0, target: 'self', roll: 'auto', usesPerBattle: 1,
    effects: [{ op: 'buff', stat: 'dmg', value: 4, turns: 3 }, { op: 'buff', stat: 'hit', value: 2, turns: 3 }, { op: 'status', id: 'haste', turns: 3 }], desc: 'Снимает ограничители: +4 урона, +2 к атаке, ускорение.' })] });
lift('boss-wolf-0-alpha', 16, { id: 'boss-wolf-0-full', name: 'Волк-0 «Альфа»: полная сила', rank: 'boss', boss: true, hpK: 1.05,
  extra: [ability({ id: 'wolf0-alpha-pack', name: 'Зов Альфы', action: 'bonus', range: 12, target: 'ally', area: { shape: 'radius', size: 12 }, roll: 'auto', usesPerBattle: 1,
    effects: [{ op: 'status', id: 'haste', turns: 3 }, { op: 'buff', stat: 'dmg', value: 3, turns: 3 }], desc: 'Вся стая: ускорение и +3 урона.' })] });
for (const [b, L] of [['lis-5-turret', 15], ['lis-4-scout', 15], ['lis-drone', 15], ['wolf-5-matyorny', 16], ['wolf-4-howler', 16], ['wolf-1-grey', 16]]) lift(b, L, { rank: ENEMIES_V3[b].rank === 'grunt' ? 'specialist' : ENEMIES_V3[b].rank });

// высокие формы монстров карты
const MONS = [['mon-suunarssok', 'Суунарссок', 'sun'], ['mon-aringli', 'Арингли', 'ari'], ['mon-udazazagi', 'Удазазаги', 'uda']];
const EPI = { 8: 'Старый', 12: 'Матёрый', 16: 'Древний', 20: 'Первородный' };
for (const [b, nm, k] of MONS) for (const L of KEY_LEVELS) lift(b, L, { id: `mon-${k}-l${L}`, name: `${nm} ${EPI[L]}`, rank: 'boss', boss: true });
const MON = (k, L) => lift(`mon-${{ sun: 'suunarssok', ari: 'aringli', uda: 'udazazagi' }[k]}`, L, { id: `mon-${k}-l${L}`, name: `${{ sun: 'Суунарссок', ari: 'Арингли', uda: 'Удазазаги' }[k]} ${EPI[L] || 'Матёрый'}`, rank: 'boss', boss: true });

// ---------------------------------------------------------------- бои
const spawn = (L) => lift('fauna-chimera', L, { id: `mon-spawn-l${L}`, name: 'Отпрыск чудища', rank: 'specialist', faction: null });
const enc = (id, name, level, faction, places, enemies, extra = {}) => ({ id, name, level, faction, places, enemies, ...extra });
const list = [];

// Регионные тройки: [регион, prefix, [новые типы], [ур. патруля, отряда, элиты], [имена x3], place-слаги]
const REG = [
  ['mutantsBeast', 'mutz', ['mutz-bone-crusher', 'mutz-night-stalker', 'mutz-shaman'], [4, 5, 6], ['Стая на тропе', 'Охота Большой стаи', 'Логово вожака'], 'mutz'],
  ['scavengers', 'scv', ['scv-junk-golem', 'scv-ram-raider', 'scv-scrap-sniper'], [5, 6, 7], ['Свалочные рейдеры', 'Налёт на тракт', 'Король-на-колёсах'], 'scv'],
  ['agrozone', 'agro', ['agro-drone-swarm', 'agro-flame-loader', 'agro-silo-warden'], [6, 7, 8], ['Зачистка поля', 'Колонна жнецов', 'Элеватор: смотрители'], 'agro'],
  ['mutantsPlant', 'mutr', ['mutr-spore-bomb', 'mutr-bloom-shaman', 'mutr-vine-lord'], [5, 7, 8], ['Рощёвые стражи', 'Цветение', 'Сердце рощи'], 'mutr'],
  ['tekhonki', 'tek', ['tek-proxy-shaman', 'tek-old-god-disciple', 'tek-servo-titan'], [7, 8, 9], ['Прокси-налёт', 'Хор Старого бога', 'Серво-цех'], 'tek'],
  ['mechanids', 'mech', ['mech-rust-hound', 'mech-nanite-cloud', 'mech-swarm-queen'], [7, 8, 9], ['Гончие цеха', 'Линия сборки', 'Улей: королева'], 'mech'],
  ['renegades', 'ren', ['ren-demolition', 'ren-sharpshooter', 'ren-agitator'], [10, 11, 12], ['Отряд подрывников', 'Фронт Хатаб-Сити', 'Штаб отступников'], 'ren'],
  ['wilds', null, ['wild-frost-wraith', 'wild-ice-golem', 'wild-frost-wraith'], [10, 12, 13], ['Ледяные призраки', 'Ледяной караван', 'Чертог льдов'], 'wild'],
  ['warprom', 'wp', ['wp-handler', 'wp-vanguard', 'wp-flamer'], [11, 13, 14], ['Колонна Военпрома', 'Плацдарм андроидов', 'Бастион Кремля'], 'wp'],
  ['cringegons', 'crg', ['crg-stage-diver', 'crg-banner-bearer', 'crg-meme-lord'], [12, 13, 14], ['Марш кринжа', 'Лагерь Предложки', 'Свита Вождя'], 'crg'],
  ['aiParty', 'ai', ['ai-political-officer', 'ai-kill-drone', 'ai-censor'], [15, 16, 17], ['Зачистка кварталов', 'Караул Указа', 'Кабинет цензоров'], 'ai'],
  ['cult', 'cult', ['cult-skrilet-prime', 'cult-soul-reaper', 'cult-judge-seer'], [16, 17, 18], ['Обряд на площади', 'Свита Судьи', 'Сокральня: внутренний круг'], 'cult'],
];
// wilds: ледяные звери вместо фракции — подмена элиты/ветерана/командира на лифты фауны и боссов
const WILD = { vet: ['band-panther', 'Снежная пантера'], elite: ['fauna-chimera', 'Ледяная химера'], cmd: ['boss-ice-champion', 'Чемпион льдов'] };
const wildId = (kind, L) => lift(WILD[kind][0], L, { id: `wild-${kind}-l${L}`, name: WILD[kind][1], rank: kind === 'vet' ? 'specialist' : kind === 'elite' ? 'elite' : 'miniboss', boss: kind === 'cmd', faction: null });
const pick = (prefix, kind, L) => (prefix ? V(prefix, kind, L) : wildId(kind, L));
export const REGION_ENCOUNTERS = {};
for (const [region, prefix, nu, [l1, l2, l3], [n1, n2, n3], slug] of REG) {
  const faction = prefix ? KEY.find((r) => r[0] === prefix)[1] : null;
  const a = (i, L) => N(nu[i % nu.length], L);
  const patrol = enc(`v4-${slug}-patrol`, n1, l1, faction, [], [pick(prefix, 'vet', l1), a(0, l1), pick(prefix, 'vet', l1), a(1, l1)]);
  const host = enc(`v4-${slug}-host`, n2, l2, faction, [], [pick(prefix, 'elite', l2), a(2, l2), a(0, l2), pick(prefix, 'vet', l2), a(1, l2)]);
  const elite = enc(`v4-${slug}-elite`, n3, l3, faction, [], [pick(prefix, 'cmd', l3), pick(prefix, 'elite', l3), a(1, l3), a(2, l3)]);
  list.push(patrol, host, elite);
  REGION_ENCOUNTERS[region] = { patrol: patrol.id, host: host.id, elite: elite.id, faction };
}

// боссы и особые бои
const lisFull = 'boss-lis-9-full', wolfFull = 'boss-wolf-0-full';
list.push(
  enc('v4-boss-lis-9', 'Лис-9 «Хвост»: полная сила', 15, null, ['dungeons-m15'], [lisFull, ENEMIES_V3['lis-5-turret-l15'].id, ENEMIES_V3['lis-4-scout-l15'].id, ENEMIES_V3['lis-drone-l15'].id]),
  enc('v4-boss-wolf-0', 'Волк-0 «Альфа»: полная сила', 16, 'warprom', ['dungeons-m12'], [wolfFull, 'wolf-5-matyorny-l16', 'wolf-4-howler-l16', 'wolf-1-grey-l16']),
  enc('v4-boss-ai-general', 'Генерал ИИ', 19, 'aiParty', ['putinlyandiya'], ['boss-ai-general', V('ai', 'elite', 19), V('ai', 'vet', 19), N('ai-political-officer', 19)]),
  enc('v4-boss-cyber-priest', 'Кибер-Жрец в силе', 19, 'cult', ['sokralnya'], ['boss-cyber-priest-prime', V('cult', 'elite', 19), N('cult-skrilet-prime', 19), N('cult-soul-reaper', 19)]),
  enc('v4-boss-crg-chief', 'Кринж-Вождь', 15, 'cringegons', ['baza-predlozhki'], ['boss-crg-chief', V('crg', 'elite', 15), N('crg-banner-bearer', 15), N('crg-stage-diver', 15), N('crg-stage-diver', 15)]),
  enc('v4-boss-collector', 'Великий Собиратель', 16, 'cringegons', ['vyzhigatel-vayba'], ['boss-great-collector', V('crg', 'elite', 16), N('crg-meme-lord', 16), N('crg-banner-bearer', 16)]),
  enc('v4-mon-hill', 'Удазазаги, гидра холмов (старая)', 9, null, ['hill-monsters-m20'], [MON('uda', 8), spawn(9), spawn(9)], { scale: 0.6 }),
  enc('v4-mon-lake', 'Суунарссок, хозяин озёр (матёрый)', 12, null, ['lake-monsters-m18'], [MON('sun', 12), spawn(12), spawn(12)], { scale: 0.6 }),
  enc('v4-mon-sea', 'Арингли, морской змей (древний)', 16, null, ['sea-monsters-m19'], [MON('ari', 16), spawn(16), spawn(16)], { scale: 0.6 }),
  enc('v4-cyber-guard', 'Киберспейс: сторожа Судьи', 18, 'cult', ['kiberspeys'], [N('cult-firewall', 18), N('cult-datawraith', 18), N('cult-datawraith', 18), N('cult-soul-reaper', 18)]),
  // финал Акта III: перекрывает 'w-cc-finale' из enemies.js (reduce — за каждый выключенный терминал)
  { id: 'w-cc-finale', name: 'Главный узел: Третий исход', level: 20, faction: 'cult', places: ['cc-node'],
    enemies: ['boss-judge-avatar', V('cult', 'elite', 20), N('cult-skrilet-prime', 20), N('cult-skrilet-prime', 20), V('cult', 'vet', 20), V('cult', 'vet', 20), V('cult', 'vet', 20)],
    reduce: [V('cult', 'vet', 20), V('cult', 'vet', 20), V('cult', 'vet', 20), N('cult-skrilet-prime', 20), N('cult-skrilet-prime', 20)] },
);
export const ENCOUNTERS_V4 = Object.fromEntries(list.map((x) => [x.id, x]));

// ---------------------------------------------------------------- сила боёв: POWER_V3 (общая таблица в enemies-v3.js, подгон — tools/sim/tune-v3.mjs)
for (const encn of Object.values(ENCOUNTERS_V4)) {
  const p = POWER_V3[encn.id];
  if (!p || p === 1) continue;
  const arr = Array.isArray(p) ? p : [p];
  encn.power = p;
  encn.baseEnemies = encn.enemies; // до масштаба (для `reduce`: сравнение по baseId)
  encn.enemies = encn.enemies.map((x, i) => { const q = arr[i % arr.length]; return typeof q === 'object' ? scaleV3(x, q.p, q) : scaleV3(x, q); });
}
