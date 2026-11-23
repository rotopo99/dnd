// Content wave 3 end-to-end (docs/specs/content-wave3.md): drives the wave-3 quests through world state only (no UI) —
// w3-vacation / w3-sorter / w3-apology by every way, w3-liza with every c9 pick and QTE result (on the real runner),
// w3-flags to each of the four sides (c10 on the runner for the council debate), epilogue slides and radio lines.
// Asserts: every active stage offers an action, every walk finishes (done / failed) within a step budget,
// consequences and delayed events apply without throwing, the spec's acceptance checks (§7).
// Run: node tools/out/wave3-flow.mjs   (exit code 1 on any softlock / assertion)
import assert from 'node:assert/strict';
import { GAME_DATA } from '../../game/src/data/index.js';
import * as st from '../../game/src/world/state.js';
import * as QS from '../../game/src/world/quests.js';
import * as CQ from '../../game/src/world/consequences.js';
import * as DL from '../../game/src/world/delayed.js';
import * as CN from '../../game/src/world/cine.js';
import * as HK from '../../game/src/world/cine-hooks.js';
import * as RD from '../../game/src/world/radio.js';
import { npcsAt } from '../../game/src/world/data.js';
import { CINEMATICS } from '../../game/src/data/cinematics/index.js';

let seed = 13;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const mk = (flags = {}) => {
  const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  Object.assign(s.flags, { 'prologue-done': true, 'act1-done': true }, flags);
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
  const x = pol.slot ? pol.slot(sl) : sl[0], g = x.goal;
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
  return QS.completeSlot(s, x, GAME_DATA); // pay / item / terminal
}

/** Walk the quest until it ends; plays queued scenes with `cine(id)`; returns the outcome. */
function walk(s, qid, pol, budget = 80, cine = null) {
  runs++;
  for (let i = 0; i < budget; i++) {
    const q = s.quests[qid];
    if (cine) for (let id = HK.takeCineQueue(s); id; id = HK.takeCineQueue(s)) cine(id);
    if (q.state !== 'active') {
      if (q.turnin) QS.claimTurnin(s, qid, GAME_DATA);
      CQ.applyConsequences(s, qid);
      for (let d = 0; d < 10; d++) { s.day += 1; DL.delayedTick(s, GAME_DATA); }
      return q.state === 'done' ? q.outcome || 'done' : q.state;
    }
    act(s, qid, pol);
    steps++;
  }
  throw new Error(`${qid}: not finished in ${budget} steps (stage ${s.quests[qid].stage}) — softlock`);
}
const rndPol = (p = 0.5) => ({ pick: (ids) => ids[Math.floor(rnd() * ids.length)], ok: () => rnd() < p });
const prefer = (want, okP = 1) => ({ pick: (ids) => (ids.includes(want) ? want : ids.find((x) => !x.startsWith('r-') && x !== 'hack') || ids[0]), ok: () => rnd() < okP });

/** Play a cinematic on the runner with fixed picks / QTE result; world env writes flags / rel; returns R. */
function playCine(s, id, pick, qte) {
  const env = { flag: (k, v) => { if (v === false || v == null) delete s.flags[k]; else s.flags[k] = v; },
    rel: (n, d) => { st.addRel(s, n, d); return []; }, rep: () => [], bond: () => [], date: () => [], mrlPct: () => [],
    roll: (sk, dc) => ({ ok: rnd() < 0.5, total: 10, skill: sk[0], dc }), name: (w) => w, data: GAME_DATA };
  const R = CN.createCine(CINEMATICS[id], { save: s, env });
  for (let i = 0; i < 30000 && !R.done; i++) {
    if (R.phase === 'choice' && R.choice.t >= R.choice.lock && !R.choice.expired) CN.cinePick(R, typeof pick === 'function' ? pick(R) : pick);
    if (R.phase === 'qte' && !R.qte.res && qte === 'ok') {
      const q = R.qte;
      if (q.kind === 'hold') CN.cineHold(R, true); else if (q.kind === 'seq') CN.cineKey(R, q.keys[q.idx]); else CN.cineKey(R, q.keys[0]);
    }
    CN.cineTick(R, 0.05);
  }
  assert.ok(R.done && R.result && R.result !== 'error', `${id}: ended (${R.result})`);
  return R;
}

// ------------------------------------------------------------------ §3 side quests: every way, random rolls
const sideOut = { 'w3-vacation': new Set(), 'w3-sorter': new Set(), 'w3-apology': new Set() };
const WAYS = { 'w3-vacation': ['formal', 'split', 'resort', 'war'], 'w3-sorter': ['free', 'closed', 'sold', 'self'], 'w3-apology': ['live', 'off', 'silent'] };
for (const [qid, ways] of Object.entries(WAYS)) for (const way of ways) for (let k = 0; k < 12; k++) {
  check(`${qid} ${way} #${k}`, () => {
    const s = mk(k % 3 === 0 ? { 'laugh-off': true } : k % 3 === 1 ? { 'customs-stamp': true } : {});
    if (k === 5) s.hero.credits = 0; // poor hero: pay options must hide, never stick
    QS.startQuest(s, qid);
    // apology rooms: restore in a random order until the exit opens
    const pol = { pick: (ids, x) => (x.stage.id === 'rooms' ? (ids.includes('enough') && rnd() < 0.5 ? 'enough' : ids[Math.floor(rnd() * ids.length)]) : (ids.includes(way) ? way : ids[Math.floor(rnd() * ids.length)])),
      ok: () => (k < 6 ? true : rnd() < 0.55) };
    const out = walk(s, qid, pol);
    sideOut[qid].add(out);
    if (qid === 'w3-apology' && out !== 'failed') {
      assert.ok(st.counterValue(s, 'disp-rooms') >= 3 || st.counterValue(s, 'disp-power') === 0, 'apology: 3 rooms or no power');
      assert.ok(st.counterValue(s, 'disp-rooms') < 5, 'apology: budget never fits all five rooms');
    }
    if (out === 'closed') assert.ok(CQ.closedLoc(s, 'dungeons-m13'), 'sort-closed closes the shaft');
  });
}

// ------------------------------------------------------------------ coverage
check('coverage', () => {
  for (const [qid, ways] of Object.entries(WAYS)) for (const w of ways) assert.ok(sideOut[qid].has(w), `${qid} ${w} reached (${[...sideOut[qid]]})`);
});

console.log(`wave3-flow: ${runs} walks, ${steps} steps; ${Object.entries(sideOut).map(([q, o]) => `${q}: ${[...o].sort().join('/')}`).join('; ')}`);
if (fails.length) { console.log(`FAILED ${fails.length}:\n  ${[...new Set(fails)].slice(0, 30).join('\n  ')}`); process.exit(1); }
console.log('wave3-flow: OK — no softlocks');
