// Контент-волна 5: середина игры, ур. 7–12. Спека: docs/specs/content-wave5.md §1–§3. Схема — как quests-wave3.js.
// Тексты — data/text/wave5.js (сценарист, ключи w5.<quest>.<step>[.<option>]); здесь только ключи через T().
// Новое в схеме волны 5 (движок: world/state.js requiresOk / grant / counterValue):
//   Requires { race }                — раса героя (w5-census: у мутанта-зверя нюх — автоуспех);
//   Effects  { leave: [npc] }        — напарник уходит из отряда (w5-two-trails: дуэль, zz-found);
//   W5_COUNTERS                      — счётчики из флагов, как W3_COUNTERS (улики переписи, удачные строфы указа).
// Квест «по проверке» никогда не запирается: у каждого выбора есть вариант без броска, проверки без onFail
// (повтор, потом вариант закрывается) — только рядом с ним. Проверено tools/out/wave5-flow.mjs.
import { WAVE5_TEXT } from '../text/wave5.js';
import { C13_SCHEDULE } from '../cinematics/c13-schedule.js';

/** Keys this module reads (tools/test.mjs: every one resolves in WAVE5_TEXT). */
export const W5_KEYS_USED = new Set();
const T = (k) => { W5_KEYS_USED.add(k); return WAVE5_TEXT[k] ?? k; };
const J = (...ks) => ks.map(T).join(' ');
const head = (k) => T(k).replace(/:?\s*\{n\} из 3/, ''); // «Найти улики: {n} из 3» -> «Найти улики» (счёт — в notes)

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail, extra = {}) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}), ...extra });
const battle = (encounter, location, onFail) => ({ kind: 'battle', encounter, location, ...(onFail ? { onFail } : {}) });
const choice = (options, extra = {}) => ({ kind: 'choice', options, ...extra });
const pay = (credits) => ({ kind: 'pay', credits });
const reach = (location) => ({ kind: 'reach', location });
const all = (goals, min) => ({ kind: 'all', goals, ...(min ? { min } : {}) });
const opt = (id, text, goal, next, extra = {}) => ({ id, text, ...(goal ? { goal } : {}), ...(next ? { next } : {}), ...extra });
const st = (id, text, goal, next, extra = {}) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }), ...extra });
const Q = (id, key, giver, region, level, stages, rewards, extra = {}) => ({
  id, name: T(`w5.${key}.title`), type: 'mixed', key: false, giver, region, level, requires: { level }, summary: T(`w5.${key}.desc`),
  wave5: true, trial: true, stages, rewards, ...extra,
});
/** «Дальше» stage after a failed roll: its text is the fail line, one button moves on (and may set flags). */
const onward = (id, text, label, next, effects) => st(id, text, choice([opt('on', label, null, next, effects ? { effects } : {})]), next);

// Числа волны 5 (баланс крутит balance-tester).
export const WAVE5_RULES = {
  levels: { census: 7, bread: 8, crown: 9, recruit: 10, trails: 10, edict: 11, schedule: 12 },
  censusNeed: 3,          // улик для обвинения
  censusFailMul: 0.7,     // провал переписи (мало улик): награда −30%
  quietCredits: 150,      // census-quiet: лекарства
  breadCaravan: 80,       // bread-shared караваном
  breadPrice: { burned: 1.25, shared: 0.9 }, // R1: цены еды в Аграре (Мельник Помол)
  crownFine: 200,         // crown-framed: вира пиратов
  breadBounty: 300,       // bread-sold: АИ платит
  trailsLoy: 20,          // zz-truth: лояльность обеих ≥ N — автоуспех
  eveBreadExtra: 2,       // R1(в): bread-burned — +2 мародёра-беженца в первой волне mq4-eve
  proxyCalmHpPct: 0.9,    // R4(б): proxy-calmed — первая волна mq4-eve −10% ЗДР
  stormPatch: 0.25,       // QA v56 #2: «Перевязка в укрытии» after a won storm node — party HP +25% of max (not ammo / medkits)
};
const R = WAVE5_RULES;

// Счётчики из флагов (state.js counterValue). value = base + Σ plus, в [min, max].
const CLUES = ['tracks', 'coffee', 'ledger', 'pup', 'receipt'];
export const W5_COUNTERS = {
  'w5-census-clues': { base: 0, min: 0, max: 5, plus: Object.fromEntries(CLUES.map((c) => [`w5c-clue-${c}`, 1])) },
  'w5-census-tried': { base: 0, min: 0, max: 5, plus: Object.fromEntries(CLUES.flatMap((c) => [[`w5c-clue-${c}`, 1], [`w5c-miss-${c}`, 1]])) },
  'w5-edict-good': { base: 0, min: 0, max: 3, plus: { 'w5e-good-1': 1, 'w5e-good-2': 1, 'w5e-good-3': 1 } },
};
const ctr = (id, min, max) => ({ ctr: { id, ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) } });
const inParty = (npc, min = -100) => ({ loyalty: { npc, min } });

// ---------------------------------------------------------------- 1.1 w5-census: улики (петля выбора, как комнаты w3-apology)
const untried = (c) => ({ notFlag: `w5c-clue-${c}`, not: { flag: `w5c-miss-${c}` } });
const clueOpt = (c, skills, dc, extra = {}) => opt(c, T(`w5.census.clue.${c}.opt`), check(skills, dc, `miss-${c}`), 'clues',
  { requires: { ...untried(c), ...(extra.requires || {}) }, effects: { flags: [`w5c-clue-${c}`], text: T(`w5.census.clue.${c}.ok`) } });
const censusClues = st('clues', head('w5.census.obj.clues'), choice([
  clueOpt('tracks', ['survival', 'perception'], 13),
  // кофе: у мутанта-зверя нюх — автоуспех
  opt('coffee-nose', T('w5.census.clue.coffee.opt'), null, 'clues', { requires: { ...untried('coffee'), race: 'mutant-beast' },
    effects: { flags: ['w5c-clue-coffee'], text: T('w5.census.clue.coffee.ok') } }),
  clueOpt('coffee', ['perception', 'survival'], 12, { requires: { any: [{ not: { race: 'mutant-beast' } }] } }),
  clueOpt('ledger', ['lockpicking', 'stealth'], 14),
  clueOpt('pup', ['persuasion', 'meditation'], 12),
  clueOpt('receipt', ['analysis'], 15),
  opt('go', T('w5.census.obj.accuse'), null, 'accuse', { requires: ctr('w5-census-tried', R.censusNeed) }),
]), 'accuse', {
  notes: [0, 1, 2, 3, 4, 5].map((n) => ({ requires: ctr('w5-census-clues', n, n), text: T('w5.census.clue.count').replace('{n}', n), color: 'f' })),
});
const has3 = ctr('w5-census-clues', R.censusNeed);

export const QUESTS_WAVE5 = [
  // ================= w5-census «Перепись» (расследование, Вонючка, ур. 7) =================
  Q('w5-census', 'census', 'zoya-klyk', 'mutantsBeast', R.levels.census, [
    st('ask', J('w5.census.ask.1', 'w5.census.ask.2', 'w5.census.ask.3'), reach('vonyuchka'), 'clues'),
    censusClues,
    ...CLUES.map((c) => onward(`miss-${c}`, T(`w5.census.clue.${c}.fail`), head('w5.census.obj.clues'), 'clues', { flags: [`w5c-miss-${c}`] })),
    st('accuse', J('w5.census.accuse.1', 'w5.census.accuse.2', 'w5.census.accuse.3'), choice([
      opt('expose', T('w5.census.expose'), null, null, { requires: has3,
        effects: { flags: ['census-exposed'], deeds: ['honor'], text: T('w5.census.expose.ok') } }),
      opt('quiet', T('w5.census.quiet'), check(['persuasion', 'deception'], 15), null, { requires: { ...has3, credits: R.quietCredits },
        effects: { flags: ['census-quiet'], credits: -R.quietCredits, deeds: ['lie'], text: T('w5.census.quiet.ok') } }),
      opt('freed', T('w5.census.freed'), battle('enc-w5-census', 'svalka'), null, { requires: has3,
        effects: { flags: ['census-freed'], text: T('w5.census.freed.ok') } }),
      opt('fail', T('w5.census.res.fail'), null, null, { requires: ctr('w5-census-clues', null, R.censusNeed - 1),
        effects: { flags: ['census-fail'], text: T('w5.census.expose.fail') } }),
    ]), 'done'),
  ],
  { xp: 800, credits: 120, rep: { mutantsBeast: 2 }, items: [{ item: 'rare-parts', n: 2 }] },
  { rewardCut: [{ flag: 'census-fail', mul: R.censusFailMul }],
    outcomeBy: [{ key: 'exposed', all: ['census-exposed'] }, { key: 'quiet', all: ['census-quiet'] }, { key: 'freed', all: ['census-freed'] }, { key: 'fail', all: ['census-fail'] }] }),

  // ================= w5-bread «Хлебный суд» (мораль, Гидропоника, ур. 8) =================
  Q('w5-bread', 'bread', 'w5-ryabov', 'agrozone', R.levels.bread, [
    st('meet', J('w5.bread.ask.1', 'w5.bread.ask.2', 'w5.bread.ask.3'), talk('w5-ryabov', 'gidroponika'), 'inspect'),
    st('inspect', T('w5.bread.obj.inspect'), { ...check(['tech', 'analysis'], 13, 'inspect-fail'), location: 'gidroponika', desc: T('w5.bread.inspect.opt') }, 'verdict',
      { effects: { flags: ['bread-counted'], text: T('w5.bread.inspect.ok') } }),
    onward('inspect-fail', T('w5.bread.inspect.fail'), T('w5.bread.obj.verdict'), 'verdict'),
    st('verdict', T('w5.bread.obj.verdict'), choice([
      opt('burn', T('w5.bread.burn'), check(['tech', 'stealth'], 12), null,
        { effects: { flags: ['bread-burned'], deeds: ['free-slaves'], text: T('w5.bread.burn.ok') } }),
      opt('share', T('w5.bread.share'), check(['persuasion', 'analysis'], 15), null, { effects: { flags: ['bread-shared'], text: T('w5.bread.share.ok') } }),
      opt('share-pay', `${T('w5.bread.share')} (${R.breadCaravan} кр.)`, pay(R.breadCaravan), null, { requires: { credits: R.breadCaravan },
        effects: { flags: ['bread-shared'], text: T('w5.bread.share.ok') } }),
      opt('split', T('w5.bread.split'), check(['persuasion', 'analysis'], 17, null, { easeBy: [{ flag: 'bread-counted', n: 2 }] }), null,
        { effects: { flags: ['bread-split', 'ryabov-defect'], deeds: ['honor'], text: T('w5.bread.split.ok') } }),
      opt('sell', T('w5.bread.sell'), null, null, { effects: { flags: ['bread-sold'], credits: R.breadBounty, deeds: ['greed'], text: T('w5.bread.sell.ok') } }),
    ]), 'done'),
  ],
  { xp: 950, credits: 100 },
  { outcomeBy: [{ key: 'burned', all: ['bread-burned'] }, { key: 'shared', all: ['bread-shared'] }, { key: 'split', all: ['bread-split'] }, { key: 'sold', all: ['bread-sold'] }] }),

  // ================= w5-crown «Корона и кубок» (фетч с подвохом, Свалка, ур. 9; после sq3-sc-crown) =================
  Q('w5-crown', 'crown', 'glava-musora', 'scavengers', R.levels.crown, [
    st('scene', J('w5.crown.ask.1', 'w5.crown.ask.2', 'w5.crown.ask.3'), { ...check(['perception', 'analysis'], 13, 'scene-fail'), location: 'svalka' }, 'trail',
      { effects: { text: J('w5.crown.clue.1', 'w5.crown.clue.2') } }),
    // ложный след: без улик отряд идёт к пиратам с кулаками
    st('scene-fail', T('w5.crown.clue.3'), battle('enc-w5-crown', 'raytsentr', 'reveal'), 'reveal'),
    st('trail', J('w5.crown.trail.pirates.1', 'w5.crown.trail.pirates.2'), choice([
      opt('talk', T('w5.crown.trail.talk'), { ...check(['persuasion', 'deception'], 14, 'trail-fight'), location: 'raytsentr' }, 'reveal'),
      opt('fight', `${T('w5.crown.trail.fight')} ⚔`, battle('enc-w5-crown', 'raytsentr'), 'reveal'),
    ], { location: 'raytsentr' }), 'reveal'),
    st('trail-fight', T('w5.crown.pirates.fail'), battle('enc-w5-crown', 'raytsentr', 'reveal'), 'reveal'),
    st('reveal', J('w5.crown.grosh.1', 'w5.crown.grosh.2', 'w5.crown.grosh.3', 'w5.crown.grosh.4'), choice([
      opt('returned', T('w5.crown.returned'), null, null, { effects: { flags: ['crown-returned'], text: T('w5.crown.returned.ok') } }),
      opt('destroyed', T('w5.crown.destroyed'), check(['tech', 'acrobatics'], 15), null, { effects: { flags: ['crown-destroyed'], text: T('w5.crown.destroyed.ok') } }),
      opt('pirates', T('w5.crown.pirates'), check(['persuasion'], 14), null, { effects: { flags: ['crown-pirates'], text: T('w5.crown.pirates.ok') } }),
      opt('framed', T('w5.crown.framed'), check(['deception'], 15), null, { effects: { flags: ['crown-framed'], credits: R.crownFine, text: T('w5.crown.framed.ok') } }),
    ], { location: 'svalka' }), 'done'),
  ],
  { xp: 1000, credits: 150, items: [{ item: 'crown-shard', n: 1 }] },
  // QA v55 #1: a follow-up of sq3-sc-crown «Корона из кубков» (same King, same premise) — offered only after it is done
  { requires: { level: R.levels.crown, quest: { id: 'sq3-sc-crown', state: 'done' } },
    outcomeBy: [{ key: 'returned', all: ['crown-returned'] }, { key: 'destroyed', all: ['crown-destroyed'] }, { key: 'pirates', all: ['crown-pirates'] }, { key: 'framed', all: ['crown-framed'] }] }),

  // ================= w5-recruit «Новичок» (эскорт идёт не так, Славотеч -> Додзе, ур. 10) =================
  Q('w5-recruit', 'recruit', 'ken', 'tinBrotherhood', R.levels.recruit, [
    st('ask', J('w5.recruit.ask.1', 'w5.recruit.ask.2', 'w5.recruit.ask.3'), talk('ken', 'tin-consulate'), 'escort'),
    st('escort', T('w5.recruit.obj.escort'), reach('slavotech'), 'camp'),
    st('camp', T('w5.recruit.obj.camp'), check(['perception'], 13, 'camp-miss'), 'bridge',
      { effects: { flags: ['recruit-heard'], text: J('w5.recruit.camp.whisper', 'w5.recruit.camp.ok') } }),
    onward('camp-miss', T('w5.recruit.camp.fail'), T('w5.recruit.obj.bridge'), 'bridge'),
    st('bridge', J('w5.recruit.bridge.1', 'w5.recruit.bridge.2', 'w5.recruit.bridge.3'), choice([
      opt('saved', T('w5.recruit.saved'), check(['persuasion', 'meditation'], 15, 'bridge-fight', { easeBy: [{ flag: 'recruit-heard', n: 2 }] }), 'back',
        { effects: { flags: ['recruit-saved'], text: T('w5.recruit.saved.ok') } }),
      opt('handed', T('w5.recruit.handed'), check(['athletics', 'intimidation'], 14, 'bridge-fight'), 'back',
        { effects: { flags: ['recruit-handed'], text: T('w5.recruit.handed.ok') } }),
      opt('lost', T('w5.recruit.lost'), null, 'back', { effects: { flags: ['recruit-lost'], text: T('w5.recruit.lost.ok') } }),
      opt('killed', T('w5.recruit.killed'), battle('enc-w5-bridge', 'slavotech'), 'back',
        { effects: { flags: ['recruit-dead'], deeds: ['kill-surrendered'], text: T('w5.recruit.killed.ok') } }),
    ], { location: 'slavotech' }), 'back'), // QA v56 #4: the bridge is on the road out of Славотеч (spec §1.4: on the way)
    // слово / сила не сработали: культисты атакуют; после боя — тащить к Хану или отпустить
    st('bridge-fight', T('w5.recruit.handed.fail'), battle('enc-w5-bridge', 'slavotech', 'fled'), 'drag'),
    st('drag', T('w5.recruit.obj.done'), choice([
      opt('handed', T('w5.recruit.handed'), null, 'back', { effects: { flags: ['recruit-handed'], text: T('w5.recruit.handed.ok') } }),
      opt('lost', T('w5.recruit.lost'), null, 'back', { effects: { flags: ['recruit-lost'], text: T('w5.recruit.lost.ok') } }),
    ]), 'back'),
    onward('fled', T('w5.recruit.lost.ok'), T('w5.recruit.obj.done'), 'back', { flags: ['recruit-lost'] }),
    st('back', T('w5.recruit.obj.done'), reach('dodze'), 'done'),
  ],
  { xp: 1100, credits: 150, items: [{ item: 'tin-oath-cord', n: 1 }] },
  { outcomeBy: [{ key: 'killed', all: ['recruit-dead'] }, { key: 'saved', all: ['recruit-saved'] }, { key: 'handed', all: ['recruit-handed'] }, { key: 'lost', all: ['recruit-lost'] }] }),

  // ================= w5-two-trails «Два следа» (личный: Зоя и Заря, ур. 10) =================
  // Выдаёт Зоя у себя; если она в отряде — узлы Вонючки / Горящих полей (W5_LOC_QUESTS: квест узла, когда giver не стоит рядом).
  Q('w5-two-trails', 'trails', 'zoya-klyk', 'mutantsBeast', R.levels.trails, [
    st('trail', J('w5.trails.ask.1', 'w5.trails.ask.2'), reach('vonyuchka'), 'meeting'),
    st('meeting', J('w5.trails.meeting.zoya.1', 'w5.trails.meeting.zarya.1', 'w5.trails.meeting.zoya.2', 'w5.trails.meeting.zarya.2'),
      choice([opt('meet', T('w5.trails.obj.meeting'), null, 'choice')]), 'choice'),
    st('choice', T('w5.trails.obj.choice'), choice([
      opt('truth-loy', `${T('w5.trails.truth')} ♥`, null, null, { requires: { ...inParty('zoya-klyk', R.trailsLoy), any: [inParty('zarya', R.trailsLoy)] },
        effects: { flags: ['zz-truth'], loyalty: { 'zoya-klyk': 10, zarya: 10 }, text: T('w5.trails.truth.ok') } }),
      opt('truth', T('w5.trails.truth'), check(['persuasion', 'meditation'], 16, 'truth-fail'), null,
        { effects: { flags: ['zz-truth'], loyalty: { 'zoya-klyk': 10, zarya: 10 }, text: T('w5.trails.truth.ok') } }),
      opt('duel', T('w5.trails.duel'), check(['athletics', 'military'], 14, 'duel-lost'), null,
        { effects: { flags: ['zz-duel'], leave: ['zarya'], loyalty: { 'zoya-klyk': 5 }, text: T('w5.trails.duel.ok') } }),
      opt('hide', T('w5.trails.hide'), check(['deception'], 14, 'hide-fail'), null,
        { effects: { flags: ['zz-hidden'], loyalty: { zarya: -10 }, text: T('w5.trails.hide.ok') } }),
      opt('stay', T('w5.trails.stay'), null, null, { effects: { flags: ['zz-stay'], text: T('w5.trails.res.stay') } }),
    ]), 'done'),
    onward('duel-lost', T('w5.trails.duel.ok'), T('w5.trails.obj.done'), 'done', { flags: ['zz-duel'], leave: ['zoya-klyk'], loyalty: { zarya: 5 } }),
    st('truth-fail', T('w5.trails.truth.fail'), choice([
      opt('duel', T('w5.trails.duel'), null, null, { effects: { flags: ['zz-duel'], leave: ['zarya'], loyalty: { 'zoya-klyk': 5 }, text: T('w5.trails.duel.ok') } }),
      opt('stay', T('w5.trails.stay'), null, null, { effects: { flags: ['zz-stay'], text: T('w5.trails.res.stay') } }),
    ]), 'done'),
    st('hide-fail', T('w5.trails.hide.fail'), choice([
      opt('truth', T('w5.trails.truth'), null, null, { effects: { flags: ['zz-truth'], loyalty: { 'zoya-klyk': 5, zarya: 5 }, text: T('w5.trails.truth.ok') } }),
      opt('stay', T('w5.trails.stay'), null, null, { effects: { flags: ['zz-stay'], text: T('w5.trails.res.stay') } }),
    ]), 'done'),
  ],
  { xp: 1000, credits: 120 },
  { outcomeBy: [{ key: 'truth', all: ['zz-truth'] }, { key: 'duel', all: ['zz-duel'] }, { key: 'hidden', all: ['zz-hidden'] }, { key: 'stay', all: ['zz-stay'] }] }),

  // ================= w5-edict «Стихотворный указ» (кринж-магия, Путинляндия, ур. 11) =================
  Q('w5-edict', 'edict', 'w5-agitator', 'aiParty', R.levels.edict, [
    st('ask', J('w5.edict.ask.1', 'w5.edict.ask.2', 'w5.edict.ask.3'), talk('w5-agitator', 'putinlyandiya'), 'edict'),
    // hack / truth: next 'done' — no such stage, the quest ends there (option.next ?? stage.next)
    st('edict', T('w5.edict.obj.edict'), choice([
      opt('verse', T('w5.edict.obj.verse'), null, 'verse-1'),
      opt('hack', T('w5.edict.hack'), check(['tech', 'hacking'], 15, 'hack-fail'), 'done', { effects: { flags: ['edict-hack'], text: T('w5.edict.hack.ok') } }),
      opt('truth', T('w5.edict.truth'), check(['persuasion', 'deception'], 14, 'truth-fail'), 'done',
        { requires: { flag: 'truth-harmony-public' }, effects: { flags: ['edict-truth'], text: T('w5.edict.truth.ok') } }),
    ], { location: 'putinlyandiya' }), 'verse-1'),
    onward('hack-fail', T('w5.edict.hack.fail'), T('w5.edict.obj.verse'), 'verse-1'),
    onward('truth-fail', T('w5.edict.truth.fail'), T('w5.edict.obj.verse'), 'verse-1'),
    ...[1, 2, 3].flatMap((n) => {
      const next = n < 3 ? `verse-${n + 1}` : 'tally';
      const good = { effects: { flags: [`w5e-good-${n}`], text: T(`w5.edict.verse.${n}.good`) } };
      return [
        st(`verse-${n}`, T(`w5.edict.verse.${n}.prompt`), choice([
          opt('rap', T('w5.edict.verse.opt.rap'), check(['deception', 'persuasion'], 12, `cringe-${n}`), next, good),
          opt('cha', T('w5.edict.verse.opt.cha'), check(['persuasion'], 14, `cringe-${n}`), next, good),
          opt('tech', T('w5.edict.verse.opt.tech'), check(['tech'], 13, `cringe-${n}`), next, good),
        ]), next),
        onward(`cringe-${n}`, T(`w5.edict.verse.${n}.cringe`), T(n < 3 ? 'w5.edict.obj.verse' : 'w5.edict.obj.done'), next),
      ];
    }),
    st('tally', T('w5.edict.obj.done'), choice([
      opt('good3', T('w5.edict.obj.done'), null, null, { requires: ctr('w5-edict-good', 3), effects: { flags: ['edict-good3'], text: T('w5.edict.res.good3') } }),
      opt('good2', T('w5.edict.obj.done'), null, null, { requires: ctr('w5-edict-good', 2, 2), effects: { flags: ['edict-good2'], credits: 150, text: T('w5.edict.res.good2') } }),
      opt('good1', T('w5.edict.obj.done'), null, null, { requires: ctr('w5-edict-good', 1, 1), effects: { flags: ['edict-good1'], mrl: -3, text: T('w5.edict.res.good1') } }),
      opt('good0', `${T('w5.edict.obj.done')} ⚔`, battle('enc-w5-edict', 'putinlyandiya', 'storm-lost'), null,
        { requires: ctr('w5-edict-good', null, 0), effects: { flags: ['edict-good0'], text: T('w5.edict.res.good0') } }),
    ]), 'done'),
    // кринж-шторм проигран: площадь всё равно гудит, указ — «литературный враг»
    onward('storm-lost', T('w5.edict.res.good0'), T('w5.edict.obj.done'), 'done', { flags: ['edict-good0'] }),
  ],
  { xp: 900, credits: 100, items: [{ item: 'rhyme-book', n: 1 }] },
  { public: true, // «неделя единства»: указ читают все, даже враги Партии (world/quest-access.js questOpen)
    outcomeBy: [{ key: 'truth', all: ['edict-truth'] }, { key: 'hack', all: ['edict-hack'] }, { key: 'good3', all: ['edict-good3'] }, { key: 'good2', all: ['edict-good2'] },
    { key: 'good1', all: ['edict-good1'] }, { key: 'good0', all: ['edict-good0'] }] }),

  // ================= w5-schedule «Буря по расписанию» (драма, c13, Свобода, ур. 12) =================
  // disp-off (w3-apology): буря без расписания — узлы на 2 труднее; disp-live — Диспетчер на связи в c13.
  Q('w5-schedule', 'schedule', 'aztun', 'tekhonki', R.levels.schedule, [
    st('forecast', J('w5.schedule.ask.1', 'w5.schedule.ask.2', 'w5.schedule.forecast.radio'), talk('aztun', 'ancient-bunker'), 'fieldwork'),
    st('fieldwork', head('w5.schedule.obj.fieldwork'), all([1, 2, 3].map((n) => ({
      kind: 'choice', location: 'svoboda', doneFlag: `w5-node-${n}`, label: T(`w5.schedule.node.label.${n}`), desc: T(`w5.schedule.node.${n}`), options: [
        opt(`fix-${n}`, T('w5.schedule.node.hint'), check(['tech', 'proxy'], 14, `fight-${n}`, { easeBy: [{ flag: 'disp-off', n: -2 }] }), null,
          { effects: { flags: [`w5-node-${n}`, 'w5-sched-tech'], text: T('w5.schedule.node.ok') } }),
        opt(`fight-${n}`, T('w5.schedule.node.fail'), battle('enc-w5-storm', 'svoboda'), null,
          { effects: { flags: [`w5-node-${n}`], healPct: WAVE5_RULES.stormPatch, text: T('w5.schedule.node.patch') } }),
      ] }))), 'storm', { notes: [
      // director: before the first node — three fights may come in a row, rest between them (Азтун on the radio)
      { text: T('w5.schedule.node.warn'), color: 'a', requires: { not: { any: [1, 2, 3].map((n) => ({ flag: `w5-node-${n}` })) } } },
      { text: T('w5.schedule.node.noDisp'), requires: { flags: ['disp-off'] } }] }), // QA v56 #3: only without the Dispatcher
    // c13 «Расписание» играет на входе (cine-hooks: svoboda -> stage:w5-schedule/storm); без сцены — тот же выбор кнопками
    st('storm', T('w5.schedule.obj.storm'), choice([
      opt('divert', C13_OPT('divert'), check(['tech', 'proxy'], 15, 'storm-miss'), 'back', { effects: { flags: ['storm-diverted', 'proxy-calmed'] } }),
      opt('shield', C13_OPT('shield'), null, 'back', { effects: { flags: ['storm-shielded', 'boltik-dead'] } }),
      opt('turn', C13_OPT('turn'), check(['hacking', 'tech'], 15, 'storm-turn-fail'), 'back',
        { requires: { any: [{ flag: 'disp-live' }, { flag: 'w5-sched-tech' }] }, effects: { flags: ['storm-diverted', 'proxy-calmed', 'disp-apologized-public'] } }),
    ], { location: 'svoboda' }), 'back'),
    onward('storm-miss', T('w5.schedule.res.hit'), T('w5.schedule.obj.done'), 'back', { flags: ['storm-hit', 'proxy-hit'] }),
    onward('storm-turn-fail', T('w5.schedule.res.shielded'), T('w5.schedule.obj.done'), 'back', { flags: ['storm-shielded', 'boltik-dead'] }),
    st('back', T('w5.schedule.obj.done'), talk('aztun', 'ancient-bunker'), 'done'),
  ],
  { xp: 1300, credits: 200, items: [{ item: 'proxy-capacitor', n: 1 }] },
  { outcomeBy: [{ key: 'diverted', all: ['storm-diverted'] }, { key: 'shielded', all: ['storm-shielded'] }, { key: 'hit', all: ['storm-hit'] }] }),
];
function C13_OPT(id) { return C13_SCHEDULE.beats.choice.choice.opts.find((o) => o.id === id)?.l || id; }

export const QUESTS_WAVE5_MAP = Object.fromEntries(QUESTS_WAVE5.map((q) => [q.id, q]));

/** Quests a node offers when the giver does not stand there (location.js loc.quests): Zoya may be in the party. */
export const W5_LOC_QUESTS = { vonyuchka: ['w5-census', 'w5-two-trails'], 'battlefields-m11': ['w5-two-trails'] };

// NPC по правилу (world/data.js npcRuleOk): R4(б) boltik-dead — Азтун приходит в Райцентр на «Последнюю ночь»;
// bread-split — Рябов перебегает к Отступникам (к Марте).
export const W5_NPC_RULES = [
  { npc: 'aztun', at: 'raytsentr', when: { all: ['boltik-dead'], quest: { id: 'mq4-eve', state: 'active' } } },
  { npc: 'w5-ryabov', at: 'ruins-m37', when: { all: ['ryabov-defect'] } },
];

// Реплики-темы по флагам (world/wave5.js w5Topics -> world/npc-actions.js «расспросить»): R1(б), R2(а), R4.
const topic = (quest, flag, key) => ({ id: `w5-${flag}`, flag, q: `«${T(`w5.${quest}.title`)}»`, a: T(key) });
export const W5_TOPICS = {
  marta: [topic('bread', 'bread-burned', 'w5.bread.marta.burned'), topic('bread', 'bread-shared', 'w5.bread.marta.shared')],
  'w5-ryabov': [topic('bread', 'ryabov-defect', 'w5.bread.ryabov.defect')],
  'glava-musora': [topic('crown', 'crown-returned', 'w5.crown.king.after.returned'), topic('crown', 'crown-destroyed', 'w5.crown.king.after.destroyed'),
    topic('crown', 'crown-pirates', 'w5.crown.king.after.pirates')],
  ken: [topic('recruit', 'recruit-lost', 'w5.recruit.ken.after.lost')],
  khan: [topic('recruit', 'recruit-handed', 'w5.recruit.khan.handed')],
  aztun: [topic('schedule', 'boltik-dead', 'w5.schedule.boltik.dead')],
  'w5-khrip': [topic('census', 'census-quiet', 'w5.census.hrip.note')],
};
// R3(б): «Последняя ночь» — у Двери и в затишьях Зоя и Заря говорят вместе (zz-peace, обе в отряде)
export const W5_FINALE_ZZ = { 'zoya-klyk': T('w5.trails.finale.zoya'), zarya: T('w5.trails.finale.zarya') };
export const W5_ZZ_BARKS = [1, 2, 3, 4].map((n) => T(`w5.trails.bark.zz${n}`));
export const W5_EVE_LINES = { 'boltik-dead': T('w5.schedule.boltik.dead') };
// R1(в), R2(в), R4(б): оборона Райцентра в mq4-eve (world/wave4.js eveMods / eveSetup; строки как EVE_MODS волны 4,
// стоят выше её строк — союзник волны 5 уступает потолку allyCap союзникам волны 4). addEnemies — враги сверху волны.
export const W5_EVE_MODS = [
  { flag: 'bread-shared', waves: ['w-eve-2'], allies: ['nv-vet-l12'], text: 'Ополченец Аграры: хлеб помнят' },
  { flag: 'bread-burned', waves: ['w-eve-1'], addEnemies: Array(R.eveBreadExtra).fill('scv-vet-l16'), text: 'Мародёры-беженцы с Гидропоники' },
  { flag: 'proxy-calmed', waves: ['w-eve-1'], hpPct: R.proxyCalmHpPct, text: 'Прокси-помехи слабее: буря легла' },
  { flag: 'crown-pirates', waves: ['w-eve-3'], allies: ['pir-vet-l12'], addEnemies: ['pir-vet-l16'], text: 'Пираты Райцентра: и союзник, и патруль' },
];

// Сдача: реплики исходов (res.*), сдача по рации там, где giver может быть в отряде / арестован.
const TI = (npc, lines, mode = 'return', extra = {}) => ({ npc, mode, lines, ...extra });
const res = (q, ...ks) => Object.fromEntries(ks.map(([o, ...k]) => [o, k.map((x) => T(`w5.${q}.${x}`))]));
export const QUEST_TURNIN_WAVE5 = {
  'w5-census': TI('zoya-klyk', { default: [T('w5.toast.done')], ...res('census', ['exposed', 'res.exposed'], ['quiet', 'res.quiet'], ['freed', 'res.freed'], ['fail', 'res.fail']) },
    'radio', { radioCall: T('w5.census.title') }),
  'w5-bread': TI('w5-ryabov', { default: [T('w5.toast.done')], ...res('bread', ['burned', 'res.burned'], ['shared', 'res.shared'], ['split', 'res.split'], ['sold', 'res.sold']) },
    'radio', { radioCall: T('w5.bread.title') }),
  'w5-crown': TI('glava-musora', { default: [T('w5.toast.done')], ...res('crown', ['returned', 'res.returned'], ['destroyed', 'res.destroyed'], ['pirates', 'res.pirates'], ['framed', 'res.framed']) }),
  'w5-recruit': TI('ken', { default: [T('w5.toast.done')], ...res('recruit', ['saved', 'res.saved'], ['handed', 'res.handed', 'khan.handed'], ['lost', 'res.lost', 'ken.after.lost'], ['killed', 'res.killed']) }),
  'w5-two-trails': TI('zoya-klyk', { default: [T('w5.toast.done')], ...res('trails', ['truth', 'res.peace'], ['duel', 'res.duel'], ['hidden', 'res.hidden'], ['stay', 'res.stay']) },
    'radio', { radioCall: T('w5.trails.title') }),
  'w5-edict': TI('w5-agitator', { default: [T('w5.toast.done')], ...res('edict', ['good3', 'res.good3'], ['good2', 'res.good2'], ['good1', 'res.good1'], ['good0', 'res.good0'],
    ['hack', 'res.hack'], ['truth', 'res.truth']) }),
  'w5-schedule': TI('aztun', { default: [T('w5.toast.done')], ...res('schedule', ['diverted', 'res.diverted'], ['shielded', 'res.shielded', 'boltik.dead'], ['hit', 'res.hit']) }),
};
