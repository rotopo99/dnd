// Content wave 2 end-to-end (docs/specs/content-wave2.md): drives the wave-2 quests through world state only (no UI) —
// mq3-court by every c4 result (won / draw / lost, plus the challenge fallback), w2-harmony-truth to each ending
// (public / marta / quiet / clone) together with every court verdict, w2-name to each choice with the c8 scene results,
// the c7 / c8 scenes on the real runner (world/cine.js). Asserts: every active stage offers an action, every walk
// finishes (done / failed) within a step budget, consequences and delayed events apply without throwing.
// Run: node tools/out/wave2-flow.mjs   (exit code 1 on any softlock / assertion)
import assert from 'node:assert/strict';
import { GAME_DATA } from '../../game/src/data/index.js';
import * as st from '../../game/src/world/state.js';
import * as QS from '../../game/src/world/quests.js';
import * as CQ from '../../game/src/world/consequences.js';
import * as DL from '../../game/src/world/delayed.js';
import * as CN from '../../game/src/world/cine.js';
import * as HK from '../../game/src/world/cine-hooks.js';
import { CINEMATICS } from '../../game/src/data/cinematics/index.js';

let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const mk = (flags = {}) => {
  const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  Object.assign(s.flags, { 'prologue-done': true, 'act1-done': true, 'act2-done': true }, flags);
  s.hero.credits = 1000;
  return s;
};
let runs = 0, steps = 0;
const fails = [];
const check = (name, fn) => { try { fn(); } catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); } };

/** One action on the quest: the first actionable slot, resolved by `pol` ({ pick(ids, slot) -> id, ok(slot) -> bool }). */
function act(s, qid, pol) {
  const sl = QS.slots(s, qid).filter((x) => !x.locked || x.gate);
  assert.ok(sl.length, `${qid}/${s.quests[qid].stage}: no slots (softlock)`);
  const x = sl[0], g = x.goal;
  if (x.kind === 'choice') {
    const ids = QS.availableOptions(s, x).map((o) => o.id);
    assert.ok(ids.length, `${qid}/${x.stage.id}: choice without available options (softlock)`);
    return QS.chooseOption(s, x, pol.pick(ids, x), GAME_DATA);
  }
  if (g.kind === 'talk') return QS.onTalk(s, g.npc, GAME_DATA);
  if (g.kind === 'reach') return QS.onArrive(s, g.location, GAME_DATA);
  if (g.kind === 'battle') return pol.ok(x) ? QS.onBattleWon(s, g.encounter, g.location, GAME_DATA) : QS.failSlot(s, x, GAME_DATA);
  if (['check', 'challenge'].includes(g.kind)) return pol.ok(x) ? QS.completeSlot(s, x, GAME_DATA) : QS.failSlot(s, x, GAME_DATA);
  return QS.completeSlot(s, x, GAME_DATA); // pay / item / terminal
}

/** Walk the quest until it ends; returns the outcome. */
function walk(s, qid, pol, budget = 80) {
  runs++;
  for (let i = 0; i < budget; i++) {
    const q = s.quests[qid];
    if (q.state !== 'active') {
      if (q.turnin) QS.claimTurnin(s, qid, GAME_DATA);
      CQ.applyConsequences(s, qid);
      for (let d = 0; d < 10; d++) { s.day += 1; DL.delayedTick(s, GAME_DATA); }
      return q.state === 'done' ? q.outcome || 'done' : q.state;
    }
    act(s, qid, pol); // a failed retry keeps the stage (goalRetries) — the budget catches an endless loop
    steps++;
  }
  throw new Error(`${qid}: not finished in ${budget} steps (stage ${s.quests[qid].stage}) — softlock`);
}
const rndPol = (p = 0.5) => ({ pick: (ids) => ids[Math.floor(rnd() * ids.length)], ok: () => rnd() < p });
const prefer = (want, okP = 1) => ({ pick: (ids) => (ids.includes(want) ? want : ids[0]), ok: () => rnd() < okP });

/** Play a cinematic on the runner with fixed picks / QTE result; world env writes flags; returns R. */
function playCine(s, id, pick, qte) {
  const env = { flag: (k, v) => { if (v === false || v == null) delete s.flags[k]; else s.flags[k] = v; }, rel: () => [], rep: () => [], bond: () => [], date: () => [], mrlPct: () => [],
    roll: (sk, dc) => ({ ok: rnd() < 0.5, total: 10, skill: sk[0], dc }), name: (w) => w };
  const R = CN.createCine(CINEMATICS[id], { save: s, env });
  for (let i = 0; i < 30000 && !R.done; i++) {
    if (R.phase === 'choice' && R.choice.t >= R.choice.lock && !R.choice.expired) CN.cinePick(R, pick);
    if (R.phase === 'qte' && !R.qte.res && qte === 'ok') {
      const q = R.qte;
      if (q.kind === 'hold') CN.cineHold(R, true); else if (q.kind === 'seq') CN.cineKey(R, q.keys[q.idx]); else CN.cineKey(R, q.keys[0]);
    }
    CN.cineTick(R, 0.05);
  }
  assert.ok(R.done && R.result && R.result !== 'error', `${id}: ended (${R.result})`);
  QS.cineResult(s, R.result, R.ctr, GAME_DATA, id);
  return R;
}

// ------------------------------------------------------------------ mq3-court: c4 results -> stages -> every verdict
const COURT = ['court-won', 'court-draw', 'court-lost', null]; // null — the scene did not play: the challenge fallback
const DOOR = [{}, { 'lox-alive-door': true, 'door-halfsealed': true }, { 'lox-dead': true, 'lox-leaflet': true }];
const HARMONY = ['public', 'marta', 'quiet', 'clone'];
const courtSeen = new Set(), verdicts = new Set();
function court(s, res, pol) {
  QS.startQuest(s, 'mq3-court');
  QS.onBattleWon(s, 'enc-kiberspeys-door', 'kiberspeys', GAME_DATA);
  assert.equal(s.quests['mq3-court'].stage, 'inside');
  assert.ok(s.cine?.queue?.includes('c4-court'), 'c4 queued at the court');
  if (res) {
    Object.assign(s.flags, { [res]: true });
    QS.cineResult(s, res, { proof: 1 }, GAME_DATA, 'c4-court');
    const want = { 'court-won': 'verdict', 'court-draw': 'judge-fight', 'court-lost': 'judge-fight-hard' }[res];
    assert.equal(s.quests['mq3-court'].stage, want, `${res} -> ${want}`);
    if (res === 'court-lost') {
      const ids = (sv) => QS.availableOptions(sv, QS.slots(sv, 'mq3-court')[0]).map((o) => o.id);
      if (s.quests['mq3-court'].stage === 'verdict') assert.ok(!ids(s).includes('reflash'));
    }
  }
  courtSeen.add(String(res));
  const out = walk(s, 'mq3-court', pol);
  if (s.quests['mq3-court'].state === 'done') verdicts.add(out);
  if (res === 'court-lost') assert.ok(!s.flags['ending-reflash'], 'court-lost hides reflash');
  return out;
}

for (const h of HARMONY) for (const res of COURT) for (const door of DOOR) for (let k = 0; k < 6; k++) {
  check(`harmony ${h} × ${res} × ${Object.keys(door)[0] || 'door-default'} #${k}`, () => {
    const s = mk({ 'met-lox': true, ...door, ...(k % 2 ? { 'lis-online': true, 'lox9-free': true } : {}) });
    // w2-harmony-truth first: all four clues (c7 on the reactor clue), then the chosen ending
    QS.startQuest(s, 'w2-harmony-truth');
    QS.onTalk(s, 'sera', GAME_DATA);
    assert.equal(s.quests['w2-harmony-truth'].stage, 'clues');
    const clue = (loc) => { const x = QS.slots(s, 'w2-harmony-truth').find((y) => y.goal.location === loc); if (x) QS.completeSlot(s, x, GAME_DATA); };
    clue('harmony-reactor');
    assert.ok(s.flags['ha-proof-reactor'] && s.cine?.queue?.includes('c7-ha-reel'), 'c7 queued by the reactor clue');
    assert.equal(HK.takeCineQueue(s), 'c7-ha-reel');
    const R7 = playCine(s, 'c7-ha-reel', ['stop', 'watch', 'know', 'silence'][k % 4], k % 3 ? 'ok' : 'fail');
    assert.equal(R7.result, 'c7-done'); assert.ok(s.flags['truth-harmony-seen']);
    assert.ok(s.flags['lox5-woke-seen'] || s.flags['lox5-partial']);
    if (h === 'public' || h === 'marta') { clue('sokralnya'); }
    clue('funicular');
    if (s.quests['w2-harmony-truth'].stage === 'clues') clue('lox-5');
    if (s.quests['w2-harmony-truth'].stage === 'clues') clue('sokralnya');
    assert.equal(s.quests['w2-harmony-truth'].stage, 'accuse', '3 clues -> accuse');
    const ho = walk(s, 'w2-harmony-truth', prefer(h));
    assert.equal(ho, h, `harmony ending ${h}`);
    assert.ok(s.flags[`truth-harmony-${h === 'clone' ? 'framed' : h}`]);
    if (h === 'public') assert.ok(s.flags['wanted-lox-off'], 'public -> wanted-lox-off after 5 days');
    // then the court, by the c4 result, with random picks / rolls
    court(s, res, k < 3 ? rndPol(0.6) : rndPol(0.3));
  });
}

// the challenge fallback lost to the end (no c4): judge-fight -> verdict; judge-fight-hard lost -> crushed (no game over)
check('court-lost hard fight lost -> crushed -> done', () => {
  const s = mk(); court(s, 'court-lost', { pick: (ids) => ids[0], ok: (x) => x.stage.id !== 'judge-fight-hard' });
  assert.equal(s.quests['mq3-court'].state, 'done');
});

// ------------------------------------------------------------------ w2-name: every choice + c8 results + the arena
const nameOut = new Set(), c8Out = new Set();
for (const way of ['name', 'offer', 'skip']) for (let k = 0; k < 8; k++) {
  check(`name ${way} #${k}`, () => {
    const s = mk({ 'collector-met': true });
    QS.startQuest(s, 'w2-name');
    const out = walk(s, 'w2-name', { pick: (ids) => (ids.includes(way) ? way : ids[0]), ok: () => k % 2 === 0 || rnd() < 0.5 });
    nameOut.add(out);
    const ready = HK.cinesAt(s, 'battle:v4-boss-collector');
    if (s.flags['ladov-name-known']) {
      assert.deepEqual(ready, ['c8-ladov-name']);
      const [pick, qte] = [['name', 'ok'], ['name', 'fail'], ['file', 'fail'], ['trade', 'ok'], ['silence', 'ok'], ['silence', 'fail'], ['name', 'ok'], ['trade', 'fail']][k];
      const R = playCine(s, 'c8-ladov-name', pick, qte);
      c8Out.add(R.result);
      assert.ok(s.flags['cine-seen:c8-ladov-name']);
      assert.deepEqual(HK.cinesAt(s, 'battle:v4-boss-collector'), [], 'c8 plays once');
      const foes = ['boss-great-collector', 'crg-meme-lord', 'crg-banner-bearer'];
      const mod = HK.cineEncounter(s, 'v4-boss-collector', foes);
      if (R.result === 'ladov-named') assert.deepEqual(mod, ['boss-great-collector']);
      if (R.result === 'ladov-torn') assert.equal(mod[0].hpPct, 0.8);
      if (R.result === 'ladov-trade') assert.ok(HK.cineBattleSkip('v4-boss-collector', R.result));
    } else assert.deepEqual(ready, [], 'no c8 without the name');
  });
}

// ------------------------------------------------------------------ the other wave-2 quests: random walks never stick
for (const qid of ['w2-cold', 'w2-customs', 'w2-laugh']) for (let k = 0; k < 40; k++) {
  check(`${qid} #${k}`, () => { const s = mk(); QS.startQuest(s, qid); walk(s, qid, rndPol(k % 4 ? 0.6 : 0.15)); });
}

// ------------------------------------------------------------------ coverage of the asked branches
check('coverage', () => {
  for (const r of COURT) assert.ok(courtSeen.has(String(r)), `court ${r} driven`);
  for (const w of ['name', 'offer', 'skip']) assert.ok(nameOut.has(w), `w2-name ${w}`);
  for (const r of ['ladov-named', 'ladov-torn', 'ladov-trade']) assert.ok(c8Out.has(r), `c8 ${r}`);
  assert.ok(verdicts.size >= 3, `verdicts reached: ${[...verdicts]}`);
});

console.log(`wave2-flow: ${runs} walks, ${steps} steps; court verdicts: ${[...verdicts].sort().join(', ')}; c8: ${[...c8Out].sort().join(', ')}`);
if (fails.length) { console.log(`FAILED ${fails.length}:\n  ${[...new Set(fails)].slice(0, 30).join('\n  ')}`); process.exit(1); }
console.log('wave2-flow: OK — no softlocks');
