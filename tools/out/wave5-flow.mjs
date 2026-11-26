// Content wave 5 end-to-end (docs/specs/content-wave5.md): drives the seven wave-5 quests through world state only (no UI)
// by every resolution with random rolls, w5-schedule with every c13 pick × QTE (on the real runner) and the fallback storm
// choice; then the reactive flags R1–R4 (mq4-eve setup, dossier, notWith lift, topics, epilogue, radio).
// Asserts: every active stage offers an action, every walk ends (done / failed) within a step budget, each resolution's flag
// is set, rewards are not doubled on a repeat turn-in, consequences and delayed events apply without throwing.
// Run: node tools/out/wave5-flow.mjs   (exit code 1 on any softlock / assertion)
import assert from 'node:assert/strict';
import { GAME_DATA } from '../../game/src/data/index.js';
import * as st from '../../game/src/world/state.js';
import * as QS from '../../game/src/world/quests.js';
import * as CQ from '../../game/src/world/consequences.js';
import * as DL from '../../game/src/world/delayed.js';
import * as CN from '../../game/src/world/cine.js';
import * as HK from '../../game/src/world/cine-hooks.js';
import * as RD from '../../game/src/world/radio.js';
import * as CP from '../../game/src/world/companions.js';
import * as DS from '../../game/src/world/dossier.js';
import * as W4 from '../../game/src/world/wave4.js';
import * as W5 from '../../game/src/world/wave5.js';
import { npcsAt } from '../../game/src/world/data.js';
import { CINEMATICS } from '../../game/src/data/cinematics/index.js';
import { WAVE5_RULES } from '../../game/src/data/world/quests-wave5.js';

let seed = 17;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const mk = (flags = {}, o = {}) => {
  const s = st.newSave({ name: 'T', race: o.race || 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  Object.assign(s.flags, { 'prologue-done': true, 'act1-done': true }, flags);
  s.hero.credits = o.credits ?? 1000;
  s.hero.level = o.level ?? 12;
  return s;
};
let runs = 0, steps = 0;
const fails = [];
const check = (name, fn) => { try { fn(); } catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); } };

/** One action on the quest: the first actionable slot, resolved by `pol` ({ pick(ids, slot) -> id, ok(slot) -> bool }). */
function act(s, qid, pol) {
  const sl = QS.slots(s, qid).filter((x) => !x.locked || x.gate);
  assert.ok(sl.length, `${qid}/${s.quests[qid].stage}: no slots (softlock)`);
  const x = sl[Math.floor(rnd() * sl.length)], g = x.goal;
  if (x.kind === 'choice') {
    const ids = QS.availableOptions(s, x).map((o) => o.id);
    assert.ok(ids.length, `${qid}/${x.stage.id}: choice without available options (softlock)`);
    return QS.chooseOption(s, x, pol.pick(ids, x), GAME_DATA);
  }
  if (g.kind === 'talk') return QS.onTalk(s, g.npc, GAME_DATA);
  if (g.kind === 'reach') return QS.onArrive(s, g.location, GAME_DATA);
  if (g.kind === 'battle') return pol.ok(x) ? QS.onBattleWon(s, g.encounter, g.location, GAME_DATA) : QS.failSlot(s, x, GAME_DATA);
  if (['check', 'challenge'].includes(g.kind)) return pol.ok(x) ? QS.completeSlot(s, x, GAME_DATA) : QS.failSlot(s, x, GAME_DATA);
  if (g.kind === 'pay') { assert.ok(s.hero.credits >= g.credits, `${qid}: pay ${g.credits} offered without credits`); s.hero.credits -= g.credits; }
  return QS.completeSlot(s, x, GAME_DATA);
}

/** Walk the quest until it ends; plays queued scenes with `cine(id)`; returns the outcome. */
function walk(s, qid, pol, budget = 120, cine = null) {
  runs++;
  for (let i = 0; i < budget; i++) {
    const q = s.quests[qid];
    if (cine) for (let id = HK.takeCineQueue(s); id; id = HK.takeCineQueue(s)) cine(id);
    else s.cine && (s.cine.queue = []);
    if (q.state !== 'active') {
      const xp0 = s.hero.xp;
      if (q.turnin) QS.claimTurnin(s, qid, GAME_DATA);
      const xp1 = s.hero.xp;
      if (q.turnin) { QS.claimTurnin(s, qid, GAME_DATA); assert.equal(s.hero.xp, xp1, `${qid}: a repeat turn-in pays nothing`); }
      assert.ok(xp1 >= xp0);
      CQ.applyConsequences(s, qid);
      CQ.applyConsequences(s, qid); // twice — still once
      for (let d = 0; d < 14; d++) { s.day += 1; DL.delayedTick(s, GAME_DATA); }
      return q.state === 'done' ? q.outcome || 'done' : q.state;
    }
    act(s, qid, pol);
    steps++;
  }
  throw new Error(`${qid}: not finished in ${budget} steps (stage ${s.quests[qid].stage}) — softlock`);
}

/** Play a cinematic on the runner with fixed picks / QTE result; world env writes flags; returns R. */
function playCine(s, id, pick, qte) {
  const env = { flag: (k, v) => { if (v === false || v == null) delete s.flags[k]; else s.flags[k] = v; },
    rel: () => [], rep: () => [], bond: () => [], date: () => [], mrlPct: () => [],
    roll: (sk, dc) => ({ ok: rnd() < 0.5, total: 10, skill: sk[0], dc }), name: (w) => w, data: GAME_DATA };
  const R = CN.createCine(CINEMATICS[id], { save: s, env });
  for (let i = 0; i < 30000 && !R.done; i++) {
    if (R.phase === 'choice' && R.choice.t >= R.choice.lock && !R.choice.expired && pick !== 'silence') {
      const ids = R.choice.opts.map((o) => o.id);
      if (ids.includes(pick)) CN.cinePick(R, pick);
    }
    if (R.phase === 'qte' && !R.qte.res && qte === 'ok') {
      const q = R.qte;
      if (q.kind === 'hold') CN.cineHold(R, true); else if (q.kind === 'seq') CN.cineKey(R, q.keys[q.idx]); else CN.cineKey(R, q.keys[0]);
    }
    CN.cineTick(R, 0.05);
  }
  assert.ok(R.done && R.result && R.result !== 'error', `${id}: ended (${R.result})`);
  return R;
}

// resolution -> the flag it must leave (the outcome key = quest outcomeBy)
const WAYS = {
  'w5-census': { exposed: 'census-exposed', quiet: 'census-quiet', freed: 'census-freed', fail: 'census-fail' },
  'w5-bread': { burned: 'bread-burned', shared: 'bread-shared', split: 'bread-split', sold: 'bread-sold' },
  'w5-crown': { returned: 'crown-returned', destroyed: 'crown-destroyed', pirates: 'crown-pirates', framed: 'crown-framed' },
  'w5-recruit': { saved: 'recruit-saved', handed: 'recruit-handed', lost: 'recruit-lost', killed: 'recruit-dead' },
  'w5-two-trails': { truth: 'zz-truth', duel: 'zz-duel', hidden: 'zz-hidden', stay: 'zz-stay' },
  'w5-edict': { good3: 'edict-good3', good2: 'edict-good2', good1: 'edict-good1', good0: 'edict-good0', hack: 'edict-hack', truth: 'edict-truth' },
  'w5-schedule': { diverted: 'storm-diverted', shielded: 'storm-shielded', hit: 'storm-hit' },
};
// option ids that lead to a resolution (the rest of a choice is random)
const WANT = {
  'w5-census': { exposed: ['expose'], quiet: ['quiet'], freed: ['freed'], fail: ['fail'] },
  'w5-bread': { burned: ['burn'], shared: ['share', 'share-pay'], split: ['split'], sold: ['sell'] },
  'w5-crown': { returned: ['returned'], destroyed: ['destroyed'], pirates: ['pirates'], framed: ['framed'] },
  'w5-recruit': { saved: ['saved'], handed: ['handed'], lost: ['lost'], killed: ['killed'] },
  'w5-two-trails': { truth: ['truth', 'truth-loy'], duel: ['duel'], hidden: ['hide'], stay: ['stay'] },
  'w5-edict': { good3: ['verse'], good2: ['verse'], good1: ['verse'], good0: ['verse'], hack: ['hack'], truth: ['truth'] },
  'w5-schedule': { diverted: ['divert', 'turn'], shielded: ['shield'], hit: ['divert'] },
};
const out = Object.fromEntries(Object.keys(WAYS).map((q) => [q, new Set()]));
const flagsOnce = {}; // resolution flags exclusive per quest
for (const [qid, ways] of Object.entries(WAYS)) for (const way of Object.keys(ways)) for (let k = 0; k < 14; k++) {
  check(`${qid} ${way} #${k}`, () => {
    const flags = { ...(k % 2 ? { 'truth-harmony-public': true } : {}), ...(k % 3 === 0 ? { 'disp-live': true } : k % 3 === 1 ? { 'disp-off': true } : {}) };
    const s = mk(flags, { race: k % 4 === 3 ? 'mutant-beast' : 'human', credits: k === 5 ? 0 : 1000 });
    if (qid === 'w5-two-trails') { st.recruit(s, k % 2 ? 'zoya-klyk' : 'zarya'); if (k % 5 === 0) for (const p of s.party) p.approval = 30; }
    QS.startQuest(s, qid);
    const want = WANT[qid][way];
    // edict tally: good3 = all verses ok, good0 = all verses fail; census fail = misses
    const okP = (x) => {
      const sid = x.stage.id;
      if (qid === 'w5-edict' && sid.startsWith('verse-')) return way === 'good3' ? true : way === 'good0' ? false : way === 'good2' ? sid !== 'verse-3' : way === 'good1' ? sid === 'verse-1' : rnd() < 0.5;
      if (qid === 'w5-edict' && sid === 'edict') return way === 'hack' || way === 'truth';
      if (qid === 'w5-census' && sid === 'clues') return way === 'fail' ? false : true;
      if (qid === 'w5-schedule' && sid === 'storm') return way !== 'hit';
      return k < 7 ? true : rnd() < 0.55;
    };
    const pol = {
      pick: (ids, x) => {
        if (qid === 'w5-census' && x.stage.id === 'clues') return ids.find((i) => i !== 'go') || 'go';
        const w = want.find((i) => ids.includes(i));
        return w || ids[Math.floor(rnd() * ids.length)];
      },
      ok: okP,
    };
    const res = walk(s, qid, pol);
    out[qid].add(res);
    // exactly one resolution flag
    const set = Object.values(ways).filter((f) => s.flags[f]);
    if (res !== 'failed') assert.equal(set.length, 1, `${qid}: one resolution flag (${set})`);
    if (res !== 'failed') assert.ok(s.flags[ways[res]], `${qid}: outcome ${res} has its flag ${ways[res]}`);
    for (const f of set) flagsOnce[f] = true;
    if (qid === 'w5-two-trails' && res === 'truth') {
      assert.ok(s.flags['zz-peace'], 'zz-truth -> zz-peace in 4 days');
      st.recruit(s, 'zoya-klyk'); st.recruit(s, 'zarya');
      for (const p of s.party) p.state = 'active';
      assert.ok(CP.canJoin(s, 'zarya') || CP.inParty(s, 'zarya'), 'zz-peace lifts notWith');
      assert.ok(CP.recruitStatus(s, 'zarya').paths.every((p) => !p.why || !/Зоя/.test(p.why)), 'notWith lifted');
    }
    if (qid === 'w5-two-trails' && res === 'hidden') assert.ok(s.flags['zz-found'] && !CP.inParty(s, 'zoya-klyk') && !CP.inParty(s, 'zarya'), 'zz-found: both leave');
    if (qid === 'w5-two-trails' && res === 'duel') assert.ok(!(CP.inParty(s, 'zoya-klyk') && CP.inParty(s, 'zarya')), 'duel: the loser leaves');
  });
}

// ------------------------------------------------------------------ c13 on the runner: every pick × QTE × disp flags
const c13Out = new Set();
for (const pick of ['divert', 'shield', 'turn', 'silence']) for (const qte of ['ok', 'fail']) for (const disp of ['disp-live', 'disp-off', null]) {
  check(`c13 ${pick}/${qte}/${disp}`, () => {
    const s = mk(disp ? { [disp]: true } : {});
    QS.startQuest(s, 'w5-schedule');
    let played = 0;
    const cine = (id) => {
      assert.equal(id, 'c13-schedule'); played++;
      const R = playCine(s, id, pick, qte);
      assert.equal(R.result, 'c13-done');
      QS.cineResult(s, R.result, R.ctr, GAME_DATA, id);
    };
    const pol = { pick: (ids) => ids[0], ok: () => true };
    const res = walk(s, 'w5-schedule', pol, 120, cine);
    assert.equal(played, 1, 'c13 once');
    assert.ok(['diverted', 'shielded', 'hit'].includes(res), `c13 -> ${res}`);
    if (pick === 'silence' || pick === 'shield') assert.equal(res, 'shielded', 'silence / shield = storm-shielded');
    if (pick === 'divert') assert.equal(res, qte === 'ok' ? 'diverted' : 'hit', 'ШУНТ');
    if (s.flags['storm-shielded']) assert.ok(s.flags['boltik-dead']);
    if (s.flags['storm-diverted']) assert.ok(s.flags['proxy-calmed']);
    c13Out.add(res);
  });
}

// ------------------------------------------------------------------ levels: not offered below, offered at the level
check('levels', () => {
  const giverOf = { 'w5-census': 'zoya-klyk', 'w5-bread': 'w5-ryabov', 'w5-crown': 'glava-musora', 'w5-recruit': 'ken', 'w5-two-trails': 'zoya-klyk', 'w5-edict': 'w5-agitator', 'w5-schedule': 'aztun' };
  for (const [k, lvl] of Object.entries(WAVE5_RULES.levels)) {
    const qid = k === 'trails' ? 'w5-two-trails' : `w5-${k}`;
    const lo = mk({}, { level: lvl - 1 }), hi = mk({}, { level: lvl });
    // QA v55 #1: w5-crown is a follow-up of «Корона из кубков» — offered only after sq3-sc-crown is done
    if (qid === 'w5-crown') {
      assert.ok(!QS.questsOffered(hi, giverOf[qid]).some((q) => q.id === qid), 'w5-crown hidden before sq3-sc-crown');
      assert.ok(QS.questsOffered(hi, giverOf[qid]).some((q) => q.id === 'sq3-sc-crown'), 'sq3-sc-crown offered first by the same King');
      for (const s of [lo, hi]) { QS.startQuest(s, 'sq3-sc-crown'); s.quests['sq3-sc-crown'].state = 'done'; }
      assert.ok(!QS.questsOffered(hi, giverOf[qid]).some((q) => q.id === 'sq3-sc-crown'), 'no two crown quests in one list');
    }
    assert.ok(!QS.questsOffered(lo, giverOf[qid]).some((q) => q.id === qid), `${qid} hidden at ${lvl - 1}`);
    assert.ok(QS.questsOffered(hi, giverOf[qid]).some((q) => q.id === qid), `${qid} offered at ${lvl}`);
  }
  assert.ok(npcsAt('gidroponika', mk()).includes('w5-ryabov') && npcsAt('putinlyandiya', mk()).includes('w5-agitator'));
});

// ------------------------------------------------------------------ R1–R4 readers
check('reactive', () => {
  const eve = (flags, enc) => W4.eveSetup(mk(flags), enc, ['a', 'b']);
  assert.equal(eve({ 'bread-burned': true }, 'w-eve-1').enemies.length, 2 + WAVE5_RULES.eveBreadExtra, 'R1 bread-burned: marauders');
  assert.ok(eve({ 'bread-shared': true }, 'w-eve-2').allies.includes('nv-vet-l12'), 'R1 bread-shared: Agrara militia');
  assert.ok(eve({ 'proxy-calmed': true }, 'w-eve-1').enemies.every((e) => e.hpPct === WAVE5_RULES.proxyCalmHpPct), 'R4 proxy-calmed: wave 1 −10%');
  assert.ok(eve({ 'crown-pirates': true }, 'w-eve-3').allies.includes('pir-vet-l12'), 'R2 crown-pirates');
  const d0 = DS.dossierPoints(mk());
  assert.equal(DS.dossierPoints(mk({ 'ryabov-defect': true, 'crown-destroyed': true, 'storm-diverted': true })), d0 + 2, 'dossier: +1 witness (any), +1 choir');
  const s = mk({ 'boltik-dead': true }); s.quests['mq4-eve'] = { state: 'active', stage: 'rest-1' };
  assert.ok(npcsAt('raytsentr', s).includes('aztun'), 'R4 boltik-dead: Aztun at Raytsentr');
  assert.ok(W4.eveInterlude(s, 'mq4-eve', 'rest-1').some((l) => /Болтик/.test(l.text)), 'R4: the empty box line');
  assert.ok(W5.w5Topics(mk({ 'bread-burned': true }), 'marta').length === 1 && W5.w5Topics(mk({ 'crown-returned': true }), 'glava-musora').length === 1, 'R1/R2 topics');
  const slides = (f) => CQ.epilogueSlides(mk(f)).map((x) => x.id);
  for (const [id, f] of [['epi-crown-good', 'crown-destroyed'], ['epi-crown-bad', 'crown-returned'], ['epi-bread-burned', 'bread-burned'], ['epi-bread-shared', 'bread-shared'], ['epi-boltik', 'boltik-dead'], ['epi-zz', 'zz-peace']])
    assert.ok(slides({ [f]: true }).includes(id), `slide ${id}`);
  const z = mk({ 'zz-peace': true }); st.recruit(z, 'zoya-klyk'); st.recruit(z, 'zarya');
  for (const p of z.party) { p.state = 'active'; p.approval = 30; }
  assert.ok(W4.doorFarewell(z).some((x) => /Заря у костра|Рядом Зоя/.test(x.line)), 'R3: Zoya / Zarya at the Door');
});

check('coverage', () => {
  for (const [qid, ways] of Object.entries(WAYS)) for (const w of Object.keys(ways)) assert.ok(out[qid].has(w), `${qid} ${w} reached (${[...out[qid]]})`);
  for (const r of ['diverted', 'shielded', 'hit']) assert.ok(c13Out.has(r), `c13 -> ${r}`);
});

console.log(`wave5-flow: ${runs} walks, ${steps} steps; ${Object.entries(out).map(([q, o]) => `${q}: ${[...o].sort().join('/')}`).join('; ')}; c13: ${[...c13Out].sort().join('/')}`);
if (fails.length) { console.log(`FAILED ${fails.length}:\n  ${[...new Set(fails)].slice(0, 30).join('\n  ')}`); process.exit(1); }
console.log('wave5-flow: OK — no softlocks');
