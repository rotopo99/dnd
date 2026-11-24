// Content wave 4 end-to-end (docs/specs/content-wave4.md): from one prepared late-game save (cloned per run) drives
// mq4-eve «Последняя ночь» (c11 on the real runner with every pick / QTE, the three waves won or lost, the priest by argument
// or fight, companion cards) and then mq3-court to every ending: A closed / crooked / lox-leave, B reflash (and B failed -> A),
// C oldgod / order / scrap, D vessel by consent-signed (good alignment) / lox9 / surrender; c12 on the runner for each branch.
// Asserts: every active stage offers an action, every walk finishes within a step budget, fin-* flags, the epilogue
// (≤ 18 slides, ending block, factions, companions), no double rewards on a repeat. Exit code 1 on any softlock / assertion.
// Run: node tools/out/wave4-flow.mjs
import assert from 'node:assert/strict';
import { GAME_DATA } from '../../game/src/data/index.js';
import * as st from '../../game/src/world/state.js';
import * as QS from '../../game/src/world/quests.js';
import * as CQ from '../../game/src/world/consequences.js';
import * as DL from '../../game/src/world/delayed.js';
import * as CN from '../../game/src/world/cine.js';
import * as HK from '../../game/src/world/cine-hooks.js';
import * as DS from '../../game/src/world/dossier.js';
import * as W4 from '../../game/src/world/wave4.js';
import { CINEMATICS } from '../../game/src/data/cinematics/index.js';

let seed = 41;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let runs = 0, steps = 0;
const fails = [];
const check = (name, fn) => { try { fn(); } catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); } };

/** The late-game save: act II done, arsenal done, level 17, a party of three, a mid-size dossier. */
function base(extra = {}) {
  const s = st.newSave({ name: 'T', race: 'human', cls: 'ranger', path: null, origin: 'pirates', alignment: 'good', anyStat: null, talents: [] });
  Object.assign(s.flags, { 'prologue-done': true, 'act1-done': true, 'act2-done': true, 'dawn-known': true, 'arsenal-sealed': true, 'met-lox': true }, extra);
  s.quests['mq3-arsenal'] = { state: 'done', stage: 'seal', path: [] };
  s.hero.level = 17; s.hero.credits = 1000;
  for (const id of ['lox', 'tik', 'telifon']) st.recruit(s, id);
  s.party.find((p) => p.npc === 'lox').approval = 45;
  s.party.find((p) => p.npc === 'telifon').approval = 40;
  s.party.find((p) => p.npc === 'tik').approval = -40; // leaves before the Door (cards add ≤ +5)
  return s;
}
const clone = (s) => structuredClone(s);

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
  return QS.completeSlot(s, x, GAME_DATA);
}
/** Walk until the quest ends or `until(s)` holds. */
function walk(s, qid, pol, until = null, budget = 120) {
  runs++;
  for (let i = 0; i < budget; i++) {
    const q = s.quests[qid];
    if (q.state !== 'active' || until?.(s)) return q.state;
    act(s, qid, pol); steps++;
    playQueued(s, pol);
  }
  throw new Error(`${qid}: not finished in ${budget} steps (stage ${s.quests[qid].stage}) — softlock`);
}

/** Play a cinematic on the runner (world env writes flags); returns R. */
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
const seenCine = new Map();
/** Queued scenes play as the game would (c11 at the twist; c4 / c6 at the court are resolved by the walk policy). */
function playQueued(s, pol) {
  const q = s.cine?.queue || [];
  for (const id of [...q]) {
    if (id === 'c12-verdict') continue; // the finale scene waits for the epilogue step (court)
    s.cine.queue = s.cine.queue.filter((x) => x !== id);
    if (!pol.cine?.[id]) { s.flags[`cine-seen:${id}`] = true; continue; } // c4 / c6: resolved by the court policy (wave2-flow)
    const [pick, qte] = pol.cine[id];
    const R = playCine(s, id, pick, qte);
    (seenCine.get(id) || seenCine.set(id, new Set()).get(id)).add(R.result);
  }
}

// ------------------------------------------------------------------ mq4-eve: c11 × waves × priest
const C11 = [['read', 'ok'], ['tear', 'ok'], ['sign', 'ok'], ['sign', 'fail'], ['silence', 'ok']];
const eveOut = new Set();
function eve(s, c11, wavesOk, argue) {
  assert.ok(QS.questsOffered(s, 'sera').some((q) => q.id === 'mq4-eve'), 'mq4-eve offered');
  assert.ok(!st.requiresOk(s, QS.questDef('mq3-court').requires), 'no court before the night');
  QS.startQuest(s, 'mq4-eve');
  const pol = {
    cine: c11 ? { 'c11-consent': c11 } : {},
    pick: (ids, x) => (x.stage.id === 'priest' ? (argue ? 'argue' : 'fight') : x.stage.id === 'last-night' ? ids[0] : x.stage.id.startsWith('card-') ? ids[Math.floor(rnd() * ids.length)]
      : x.stage.id === 'twist' ? ['read', 'tear', 'sign', 'silent'][Math.floor(rnd() * 4)] : ids[0]),
    ok: (x) => (x.stage.id.startsWith('wall-') ? wavesOk : x.stage.id === 'priest' ? argue !== 'lose' : rnd() < 0.6),
  };
  const out = walk(s, 'mq4-eve', pol);
  assert.equal(out, 'done', 'mq4-eve done');
  eveOut.add(s.quests['mq4-eve'].outcome);
  assert.ok(s.flags['eve-done'] && s.flags['cine-seen:c11-consent'] !== undefined);
  assert.ok(['consent-known', 'consent-torn', 'consent-signed', 'consent-silent'].some((f) => s.flags[f]) || !c11, 'c11 / fallback set a consent flag');
  assert.equal(s.quests['mq3-court']?.state, 'active', 'the court starts after the night');
  for (let d = 0; d < 3; d++) { s.day += 1; DL.delayedTick(s, GAME_DATA); }
}

// ------------------------------------------------------------------ the court to a chosen ending
const ENDINGS = {
  closed: { opt: 'closed', fin: ['fin-closed'], c4: 'court-won' },
  crooked: { opt: 'closed', fin: ['fin-closed', 'door-halfsealed'], c4: 'court-draw', failVerdict: true },
  'lox-leave': { opt: 'lox-leave', fin: ['fin-closed', 'fin-lox-leave'], c4: 'court-won', flags: { 'lox-alive-door': true } },
  reflash: { opt: 'reflash', fin: ['fin-reflash'], c4: 'court-won', flags: { 'lis-online': true } },
  'reflash-fail': { opt: 'reflash', fin: ['fin-closed'], c4: 'court-won', flags: { 'lis-online': true }, failReflash: true },
  oldgod: { opt: 'oldgod', fin: ['fin-admin', 'fin-admin-oldgod'], c4: 'court-draw', flags: { 'sputnik-owner-tekhonki': true, 'oldgod-doubt': true } },
  order: { opt: 'order', fin: ['fin-admin', 'fin-admin-order'], c4: null, flags: { 'sputnik-owner-ai': true } },
  scrap: { opt: 'scrap', fin: ['fin-admin', 'fin-admin-scrap'], c4: 'court-won', flags: { 'sputnik-owner-scavengers': true } },
  vessel: { opt: 'vessel', fin: ['fin-vessel'], c4: 'court-won', c11: ['sign', 'ok'], pomekha: true },
  lox9: { opt: 'lox9', fin: ['fin-lox9'], c4: 'court-draw', flags: { 'lox-dead': true, 'lox-leaflet': true } },
  surrender: { opt: 'surrender', fin: ['fin-vessel'], c4: 'court-lost', crushed: true, thin: true }, // thin dossier: the hard fight stays hard
};
const finSeen = new Set(), c12Seen = new Set(), halfLate = new Set();
function court(s, e) {
  const qid = 'mq3-court';
  assert.equal(s.quests[qid].stage, 'door');
  QS.onBattleWon(s, 'enc-kiberspeys-door', 'kiberspeys', GAME_DATA);
  assert.equal(s.quests[qid].stage, 'inside');
  assert.ok(s.flags['door-left-tik'] && s.party.find((p) => p.npc === 'tik').state === 'left', 'a cold companion leaves at the Door');
  assert.ok(s.flags['door-support-lox'], 'a warm companion supports');
  assert.equal(s.dossier, DS.dossierPoints(s));
  if (e.c4) QS.cineResult(s, e.c4, { proof: 1 }, GAME_DATA, 'c4-court');
  if (e.c4 === 'court-lost') assert.equal(s.quests[qid].stage, DS.dossierPoints(s) >= 6 ? 'judge-fight' : 'judge-fight-hard', 'dossier ≥ 6 softens the lost court');
  s.cine.queue = []; // c4 / c6 resolved above (their own flows: wave2-flow)
  const pol = {
    pick: (ids, x) => {
      if (x.stage.id === 'verdict') { assert.ok(ids.includes(e.opt) || e.crushed, `${e.opt} offered: ${ids}`); return ids.includes(e.opt) ? e.opt : ids[0]; }
      if (x.stage.id === 'crushed') return e.crushed ? 'surrender' : ids[0];
      return ids.includes(e.opt) ? e.opt : ids[0];
    },
    ok: (x) => {
      if (x.stage.id === 'judge-fight-hard') return !e.crushed;
      if (x.stage.id === 'verdict') return x.option?.id === 'reflash' ? !e.failReflash : !e.failVerdict;
      return true;
    },
  };
  // the verdict reached: c12 is queued by the finale (markFinale) and plays before the epilogue
  const out = walk(s, qid, pol, null, 40);
  assert.equal(out, 'done');
  for (const f of e.fin) assert.ok(s.flags[f], `${f} set`);
  assert.ok(s.flags['game-complete'] && s.pendingEpilogue);
  assert.equal(HK.takeCineQueue(s), 'c12-verdict', 'c12 queued before the epilogue');
  const R = playCine(s, 'c12-verdict', 'silence', rnd() < 0.7 ? 'ok' : 'fail');
  c12Seen.add(R.visited.find((b) => ['a', 'b', 'c-oldgod', 'c-order', 'c-scrap', 'd', 'd-lox9'].includes(b)));
  assert.equal(R.result, 'c12-done');
  // c12 QTE «Удержать створку» failed after the consequences: the halfsealed mod still applies (late), once
  if (s.flags['door-halfsealed'] && s.quests[qid].outcome !== 'lox-leave' && s.cq.some((x) => x.qid === qid && x.o === 'closed')) {
    assert.ok(s.cq.some((x) => x.qid === qid && x.o === 'mod:halfsealed'), 'late halfsealed mod');
    halfLate.add(R.visited.includes('a-crooked') ? 'qte' : 'stage');
  }
  // ending D: Сестра Помеха in the party rolled meditation (stays or leaves into the Choir)
  if (s.flags['fin-vessel'] && e.pomekha) assert.ok(s.flags['pomekha-stayed'] || s.flags['pomekha-choir'], 'choir check');
  assert.equal(s.cq.filter((x) => x.o === 'mod:halfsealed').length <= 1, true);
  assert.deepEqual(HK.cinesAt(s, 'final:mq3-court'), [], 'c12 once');
  for (const f of e.fin) finSeen.add(f);
}

function epilogue(s, e) {
  for (let d = 0; d < 8; d++) { s.day += 1; DL.delayedTick(s, GAME_DATA); }
  if (s.cq.some((x) => x.o === 'mod:halfsealed')) assert.ok(s.flags['judge-knocks'], 'the Judge knocks 6 days after a crooked seal');
  const sl = CQ.epilogueSlides(s);
  const ids = sl.map((x) => x.id);
  assert.ok(sl.length <= 18 + 3, `≤ 18 (+ romance): ${sl.length}`);
  assert.equal(ids[0], 'epi-intro'); assert.equal(ids.at(-1), 'epi-outro');
  assert.ok(ids.some((x) => x.startsWith('epi-fin-')), `ending slide: ${ids}`);
  assert.ok(ids.some((x) => x.startsWith('epi-year-')), 'a year later');
  assert.ok(ids.filter((x) => x.startsWith('epi-f-')).length >= 3, `factions: ${ids}`);
  assert.ok(ids.filter((x) => x.startsWith('epi-c-')).length >= 2, `companions: ${ids}`);
  for (const x of sl) assert.ok(x.title && x.text, `${x.id} has text`);
  // repeat: no double rewards / flags
  const xp = s.hero.xp, cq = s.cq.length;
  CQ.applyConsequences(s, 'mq3-court'); QS.claimTurnin(s, 'mq3-court', GAME_DATA);
  assert.equal(s.hero.xp, xp); assert.equal(s.cq.length, cq);
  assert.deepEqual(CQ.epilogueSlides(s).map((x) => x.id), ids);
}

// ------------------------------------------------------------------ runs: every ending × eve variants
const DOSSIER = { 'truth-harmony-public': true, 'ladov-named': true, 'dawn-archive': true, 'victor-soul-freed': true, 'saved-people': true, 'saved-workshop': true,
  'harmony-ren': true, 'ally-tin': true, 'disp-live': true };
const prepared = base(DOSSIER);
for (const f of ['aiParty', 'pirates', 'technikums', 'cult', 'scavengers']) prepared.rep[f] = f === 'cult' ? -40 : 35;
const endingsDone = new Set();
let k = 0;
for (const [name, e] of Object.entries(ENDINGS)) for (let v = 0; v < 4; v++, k++) {
  check(`${name} #${v}`, () => {
    const s = clone(prepared);
    Object.assign(s.flags, e.flags || {});
    if (e.thin) for (const f of [...Object.keys(DOSSIER), 'arsenal-sealed']) delete s.flags[f];
    if (e.pomekha) { st.recruit(s, 'sister-pomekha'); Object.assign(s.party.find((p) => p.npc === 'sister-pomekha'), { approval: 30, state: 'active' }); }
    if (e.opt === 'vessel') assert.notEqual(s.hero.alignment, 'evil', 'D without evil');
    const c11 = e.c11 || (v === 3 ? null : C11[(k + v) % C11.length]);
    // vessel needs a signed blank; other runs may tear it (then vessel is closed — not their ending)
    eve(s, c11, v % 2 === 0, v === 2 ? 'lose' : v % 2 === 0);
    if (e.opt === 'vessel') assert.ok(s.flags['consent-signed']);
    if (e.opt === 'reflash' || e.opt === 'reflash-fail') assert.ok(DS.dossierPoints(s) >= 6, 'B needs dossier ≥ 6');
    court(s, e);
    epilogue(s, e);
    endingsDone.add(name);
  });
}

// ------------------------------------------------------------------ gates and the softlock guard
check('reflash hidden below 6 points and after a lost court; sputnik-destroyed hides C', () => {
  const s = base({ 'lis-online': true, 'sputnik-owner-ai': true, 'sputnik-destroyed': true });
  eve(s, ['silence', 'ok'], true, true);
  QS.onBattleWon(s, 'enc-kiberspeys-door', 'kiberspeys', GAME_DATA);
  QS.cineResult(s, 'court-won', {}, GAME_DATA, 'c4-court');
  const ids = QS.availableOptions(s, QS.slots(s, 'mq3-court')[0]).map((o) => o.id);
  assert.ok(DS.dossierPoints(s) < 6 && !ids.includes('reflash') && !ids.includes('order') && ids.includes('closed'), ids.join(','));
});
check('mq4-eve: no act2-done — not offered', () => {
  const s = base(); s.flags['act2-done'] = false;
  assert.ok(!QS.questsOffered(s, 'sera').some((q) => q.id === 'mq4-eve'));
});
check('mq4-eve: every flag set / none set, all waves lost — still ends', () => {
  for (const flags of [{}, { 'harmony-ai': true, 'harmony-ren': true, 'harmony-pir': true, 'harmony-council': true, 'saved-people': true, 'saved-workshop': true,
    'saved-sector-d': true, 'saved-terminal': true, 'ally-tin': true, 'mech-ally': true, 'plague-cured': true, 'mechanids-wounded': true, 'ladov-named': true }]) {
    const s = base(flags);
    eve(s, null, false, 'lose');
    // the hub terminal is a battle trigger now (rules/battle-triggers.js), the quest only holds a lost wave
    assert.ok(!s.flags['eve-revive-used'] && s.flags['eve-wave-3-lost']);
    const tr = W4.eveSetup(s, 'w-eve-1', []).triggers.map((x) => x.id);
    assert.deepEqual(tr, flags['saved-terminal'] ? ['eve-barges', 'eve-terminal'] : []);
  }
});
check('coverage', () => {
  for (const n of Object.keys(ENDINGS)) assert.ok(endingsDone.has(n), `ending ${n}`);
  for (const r of ['c11-known', 'c11-torn', 'c11-signed', 'c11-signed-bad', 'c11-silent']) assert.ok(seenCine.get('c11-consent')?.has(r), `c11 ${r}`);
  for (const b of ['a', 'b', 'c-oldgod', 'c-order', 'c-scrap', 'd', 'd-lox9']) assert.ok(c12Seen.has(b), `c12 ${b}`);
  for (const o of ['turned', 'beaten', 'default']) assert.ok(eveOut.has(o), `mq4-eve ${o}`);
  assert.ok(halfLate.has('qte'), `late halfsealed by the c12 QTE: ${[...halfLate]}`);
});

console.log(`wave4-flow: ${runs} walks, ${steps} steps; endings: ${[...endingsDone].sort().join(', ')}; fin: ${[...finSeen].sort().join(', ')}; c11: ${[...(seenCine.get('c11-consent') || [])].sort().join(', ')}; c12: ${[...c12Seen].sort().join(', ')}`);
if (fails.length) { console.log(`FAILED ${fails.length}:\n  ${[...new Set(fails)].slice(0, 30).join('\n  ')}`); process.exit(1); }
console.log('wave4-flow: OK — no softlocks');
