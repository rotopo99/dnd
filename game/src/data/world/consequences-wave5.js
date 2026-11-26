// Последствия квестов контент-волны 5 (docs/specs/content-wave5.md §1, §3, §5). Формат — как consequences-wave3.js.
// Тексты — data/text/wave5.js (ключи сценариста). Реактивные флаги R1–R4 читают: world/wave4.js (mq4-eve), world/dossier.js,
// world/companions.js (zz-peace), world/wave5.js (темы NPC, реплики «Последней ночи»), слайды EPILOGUE_WAVE5.
import { WAVE5_TEXT } from '../text/wave5.js';
import { WAVE5_RULES as R } from './quests-wave5.js';

export const W5_CQ_KEYS = new Set();
const T = (k) => { W5_CQ_KEYS.add(k); return WAVE5_TEXT[k] ?? k; };
const E = (o) => ({
  rep: {}, vendors: [], nodes: [], rumors: [], slides: [], delayed: [], ...o,
  npcs: { appear: [], vanish: [], move: [], ...o.npcs },
  access: { open: [], close: [], ...o.access },
});
const D = (id, days, say, fx = {}, extra = {}) => ({ id, days, say, fx, ...extra });

export const CONSEQUENCES_WAVE5 = {
  // ---------------------------------------------------------------- §1.1 w5-census
  'w5-census': {
    default: E({}),
    exposed: E({ rep: { mutantsBeast: 5 },
      npcs: { vanish: ['w5-khrip'] },
      nodes: [{ loc: 'vonyuchka', desc: T('w5.census.res.exposed'), glyph: '⚖', tone: 'warn' }],
      rumors: [T('w5.census.rumor')], delayed: [D('radio', 3, T('w5.census.radio'), {}, { radio: 'rd-w5-census' })] }),
    quiet: E({
      rumors: [T('w5.census.rumor')],
      delayed: [D('note', 6, T('w5.census.hrip.note'), {}, { radio: 'rd-w5-census' })] }),
    freed: E({ rep: { scavengers: -10, mutantsBeast: 10 },
      nodes: [{ loc: 'vonyuchka', desc: T('w5.census.res.freed'), glyph: '✚', tone: 'good' }],
      rumors: [T('w5.census.rumor')], delayed: [D('radio', 3, T('w5.census.radio'), {}, { radio: 'rd-w5-census' })] }),
    fail: E({ rep: { mutantsBeast: -3 }, npcs: { vanish: ['w5-khrip'] }, rumors: [T('w5.census.res.fail')] }),
  },
  // ---------------------------------------------------------------- §1.2 w5-bread (R1: Аграра — цены Мельника Помола)
  'w5-bread': {
    default: E({}),
    burned: E({ rep: { agrozone: 15, aiParty: -10, neutralVillages: -15 },
      vendors: [{ npc: 'ag-pomol', mult: R.breadPrice.burned }],
      nodes: [{ loc: 'gidroponika', desc: T('w5.bread.res.burned'), glyph: '🔥', tone: 'bad' }],
      rumors: [T('w5.bread.rumor')], delayed: [D('radio', 8, T('w5.bread.radio.burned'), {}, { radio: 'rd-w5-bread' })] }),
    shared: E({ rep: { agrozone: -10, neutralVillages: 15, renegades: -5 },
      vendors: [{ npc: 'ag-pomol', mult: R.breadPrice.shared, add: ['ration'] }],
      nodes: [{ loc: 'agrara', desc: T('w5.bread.res.shared'), glyph: '🍞', tone: 'good' }],
      rumors: [T('w5.bread.rumor')], delayed: [D('radio', 8, T('w5.bread.radio.shared'), {}, { radio: 'rd-w5-bread' })] }),
    split: E({ rep: { agrozone: -3, aiParty: -3, neutralVillages: -3, renegades: 3 },
      rumors: [T('w5.bread.rumor')], delayed: [D('radio', 8, T('w5.bread.radio.split'), {}, { radio: 'rd-w5-bread' })] }),
    sold: E({ rep: { aiParty: 15, agrozone: -15 },
      npcs: { vanish: ['w5-ryabov'] },
      rumors: [T('w5.bread.rumor')], delayed: [D('radio', 8, T('w5.bread.radio.sold'), {}, { radio: 'rd-w5-bread' })] }),
  },
  // ---------------------------------------------------------------- §1.3 w5-crown (R2)
  'w5-crown': {
    default: E({}),
    returned: E({ rep: { scavengers: 20 },
      rumors: [T('w5.crown.rumor')],
      // через 10 дней Король «слышит» и казнит Гроша
      delayed: [D('grosh', 10, T('w5.crown.epi.bad'), {}, { tone: 'bad', radio: 'rd-w5-crown' })] }),
    destroyed: E({ rep: { scavengers: 10 },
      nodes: [{ loc: 'svalka', desc: T('w5.crown.res.destroyed'), glyph: '♔', tone: 'good' }],
      rumors: [T('w5.crown.rumor')], delayed: [D('radio', 4, T('w5.crown.radio'), {}, { radio: 'rd-w5-crown' })] }),
    pirates: E({ rep: { pirates: 15, scavengers: -20 },
      nodes: [{ loc: 'svalka', desc: T('w5.crown.res.pirates'), glyph: '⚔', tone: 'bad' }],
      rumors: [T('w5.crown.rumor')], delayed: [D('radio', 4, T('w5.crown.radio'), {}, { radio: 'rd-w5-crown' })] }),
    framed: E({ rep: { pirates: -15 }, rumors: [T('w5.crown.res.framed')] }),
  },
  // ---------------------------------------------------------------- §1.4 w5-recruit
  'w5-recruit': {
    default: E({}),
    saved: E({ rep: { tinBrotherhood: 15 },
      npcs: { move: [{ npc: 'w5-ivolga', to: 'dodze' }] },
      rumors: [T('w5.recruit.rumor')],
      delayed: [D('drawing', 12, T('w5.recruit.drawing'), {}, { radio: 'rd-w5-recruit' })] }),
    handed: E({ rep: { tinBrotherhood: 5 }, npcs: { move: [{ npc: 'w5-ivolga', to: 'dodze' }] }, rumors: [T('w5.recruit.res.handed')],
      delayed: [D('radio', 4, T('w5.recruit.radio'), {}, { radio: 'rd-w5-recruit' })] }),
    lost: E({ rep: { cult: 10, tinBrotherhood: -10 }, npcs: { vanish: ['w5-ivolga'] }, rumors: [T('w5.recruit.res.lost')] }),
    killed: E({ rep: { tinBrotherhood: -20 }, npcs: { vanish: ['w5-ivolga'] }, rumors: [T('w5.recruit.res.killed')] }),
  },
  // ---------------------------------------------------------------- §1.5 w5-two-trails (R3)
  'w5-two-trails': {
    default: E({}),
    truth: E({ rumors: [T('w5.trails.rumor')],
      delayed: [D('peace', 4, T('w5.trails.res.peace'), { flags: ['zz-peace'] }, { radio: 'rd-w5-trails' })] }),
    duel: E({ rumors: [T('w5.trails.res.duel')] }),
    hidden: E({ delayed: [D('found', 10, T('w5.trails.res.found'), { flags: ['zz-found'], leave: ['zoya-klyk', 'zarya'] }, { tone: 'bad' })] }),
    stay: E({}),
  },
  // ---------------------------------------------------------------- §1.6 w5-edict
  'w5-edict': {
    default: E({}),
    good3: E({ rep: { aiParty: 10 }, delayed: [D('radio', 3, T('w5.edict.radio'), {}, { radio: 'rd-w5-edict' })] }),
    good2: E({ delayed: [D('radio', 3, T('w5.edict.radio'), {}, { radio: 'rd-w5-edict' })] }),
    good1: E({ rumors: [T('w5.edict.rumor')], delayed: [D('radio', 3, T('w5.edict.radio'), {}, { radio: 'rd-w5-edict' })] }),
    good0: E({ rep: { aiParty: -5 }, rumors: [T('w5.edict.rumor')], delayed: [D('radio', 3, T('w5.edict.radio'), {}, { radio: 'rd-w5-edict' })] }),
    hack: E({ rep: { aiParty: -5 }, rumors: [T('w5.edict.res.hack')] }),
    truth: E({ rep: { aiParty: -15 }, rumors: [T('w5.edict.res.truth')] }),
  },
  // ---------------------------------------------------------------- §1.7 w5-schedule (R4)
  'w5-schedule': {
    default: E({}),
    diverted: E({ rep: { tekhonki: 10, neutralVillages: 15 },
      nodes: [{ loc: 'svoboda', desc: T('w5.schedule.res.diverted'), glyph: '⚡', tone: 'good' }],
      rumors: [T('w5.schedule.rumor')], delayed: [D('radio', 3, T('w5.schedule.radio'), {}, { radio: 'rd-w5-schedule' })] }),
    shielded: E({ rep: { tekhonki: -15, neutralVillages: 10 },
      npcs: { vanish: ['w5-boltik'] },
      nodes: [{ loc: 'svoboda', desc: T('w5.schedule.boltik.dead'), glyph: '✝', tone: 'warn' }],
      rumors: [T('w5.schedule.rumor')], delayed: [D('radio', 3, T('w5.schedule.radio'), {}, { radio: 'rd-w5-schedule' })] }),
    hit: E({ rep: { neutralVillages: -10 },
      vendors: [{ npc: 'sv-yarmarka', mult: 1.2 }],
      nodes: [{ loc: 'svoboda', desc: T('w5.schedule.res.hit'), glyph: '⚠', tone: 'bad' }],
      rumors: [T('w5.schedule.rumor')], delayed: [D('radio', 3, T('w5.schedule.radio'), {}, { radio: 'rd-w5-schedule' })] }),
  },
};

// Радио «Голос Пустошей» (data/world/radio.js добавляет в RADIO.news): по одной строке на квест.
const N = (id, when, key, extra = {}) => ({ id, when, text: [T(key)], tone: 'news', prio: 52, once: true, ...extra });
export const RADIO_WAVE5 = [
  N('rd-w5-census', { any: [{ cq: 'w5-census:exposed' }, { cq: 'w5-census:quiet' }, { cq: 'w5-census:freed' }] }, 'w5.census.radio'),
  N('rd-w5-bread', { questDone: 'w5-bread' }, 'w5.bread.rumor', { tone: 'warn' }),
  N('rd-w5-crown', { questDone: 'w5-crown' }, 'w5.crown.radio', { tone: 'gossip' }),
  N('rd-w5-recruit', { any: [{ cq: 'w5-recruit:saved' }, { cq: 'w5-recruit:handed' }] }, 'w5.recruit.radio'),
  N('rd-w5-trails', { flag: 'zz-peace' }, 'w5.trails.radio', { tone: 'gossip' }),
  N('rd-w5-edict', { questDone: 'w5-edict' }, 'w5.edict.radio', { tone: 'gossip' }),
  N('rd-w5-schedule', { any: [{ flag: 'storm-diverted' }, { flag: 'storm-shielded' }, { flag: 'proxy-hit' }] }, 'w5.schedule.radio', { tone: 'warn' }),
  // c13: the Dispatcher apologised to the whole of Svoboda on air
  N('rd-w5-disp-public', { flag: 'disp-apologized-public' }, 'w5.schedule.forecast.radio', { prio: 60 }),
];

// Слайды эпилога (§5). order — после слайдов волны 3, prio — отбор.
const S = (id, order, prio, title, text, when) => ({ id, order, prio, title, text, when });
export const EPILOGUE_WAVE5 = [
  S('epi-crown-good', 160, 40, T('w5.crown.title'), T('w5.crown.epi.good'), { all: ['crown-destroyed'] }),
  S('epi-crown-bad', 160, 40, T('w5.crown.title'), T('w5.crown.epi.bad'), { all: ['crown-returned'] }),
  S('epi-bread-burned', 161, 45, T('w5.bread.title'), T('w5.bread.epi.burned'), { all: ['bread-burned'] }),
  S('epi-bread-shared', 161, 45, T('w5.bread.title'), T('w5.bread.epi.shared'), { all: ['bread-shared'] }),
  S('epi-boltik', 162, 40, T('w5.schedule.title'), T('w5.schedule.epi.boltik'), { all: ['boltik-dead'] }),
  S('epi-zz', 163, 45, T('w5.trails.title'), T('w5.trails.epi.zz'), { all: ['zz-peace'] }),
  // R3(в): «Две дороги» — Зоя нашла правду сама, обе ушли
  S('epi-zz-found', 163, 40, T('w5.trails.title'), T('w5.trails.res.found'), { all: ['zz-found'] }),
];
