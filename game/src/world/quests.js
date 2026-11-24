// Quest interpreter over data/world/quests.js (schema in its header) and save.quests[id] =
// { state: 'active'|'done'|'failed', stage, opt: optionId|null, subs: { [i]: true | 'opt:<id>' } }.
//
// A "slot" is one executable goal of the current stage: { qid, stage, goal, sub?: index, option?: Option, choice?: Goal }.
//   kind 'choice' slots are decisions (UI lists options); other kinds are goals to resolve:
//   reach / talk / item / terminal — automatic (onArrive / onTalk / autoProgress); battle / check / challenge / pay — UI actions.
// Stage gate (third-exodus.md §2): stage.requires (Requires, e.g. { avgLevel }) not met →
//   stage.risk { flag, text } — a single decision «go anyway» (sets the flag; the flag should be in stage.requires.any);
//   else the stage's slots come with `locked` (reason text from stage.gate { text, vars }) and cannot be completed.
//   Old saves / stages without requires — no gate.
// Turn-in (data/text/quest-turnin.js QUEST_TURNIN[qid] = { npc, mode: 'return'|'radio', lines, radioCall? }):
//   st.path — chosen option ids and visited stage ids; at finish st.outcome = the latest of them that is a key of
//   `lines` (key k also matches stage 'end-k'), 'failed' for failed quests, else 'default'.
//   'return': finish marks st.turnin = true (state 'done', follow-ups unlock), the reward waits for claimTurnin
//     (location scene: the NPC is on the node / in the party). NPC nowhere to be found → reward at once + short line.
//   'radio': reward at once, qid queued in save.pendingRadio (the location scene shows the radio modal).
//   Failed quest with lines.failed: same delivery, no reward. Quests without an entry — as before.
// Quest timer (content-wave1.md §5.3): quest.timer { days, stage, onExpire } — entering `stage` sets st.due = day + days;
//   questTimerTick (passDays → delayed.js dayTick) at day >= due: enough subgoals done (all.min) → the next stage; else
//   onExpire — a stage id (onFail branch) or an outcome key (tracked in st.path, then the next stage; outcomeBy falls back
//   to it). While the timer runs an 'all' stage waits for every subgoal; once `min` succeeded a «that's enough» decision appears.
// Lore finds: entering a stage queues notes `stage:<qid>/<stage>` (world/lore.js).
import { dropItem } from './inventory.js';
import { QUESTS, sameLocation, QUEST_TURNIN, npcHome, resolveLocation } from './data.js';
import { t } from '../data/text/index.js';
import { grant, journal, requiresOk, tf, repToasts } from './state.js';
import { applyRep, normFaction } from './reputation.js';
import { NPCS } from '../data/npcs.js';
import { LOCATIONS } from '../data/world/locations.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { questXp } from '../rules/progression.js';
import { EXODUS } from '../data/world/exodus.js';
import { exodusActive, exodusLeft, exodusExtend } from './exodus.js';
import { personalStage, personalQuestDone } from './companions.js';
import { applyConsequences, markFinale, lateCourtMods } from './consequences.js';
import { ATTACK_RULES } from '../data/world/crime.js';
import { SPIRIT } from '../data/world/cyberspace.js';
import { restoreBody } from './spirit.js';
import { findsAt } from './lore.js';
import { cineStage, CINE_RESULT_NEXT, cineResultStage, CINE_RESULT_FX, CINE_AFTER, cineFlag, CINE_RESULT_SOFTEN } from './cine-hooks.js';
import { dossierDc, courtLimits, applyDossier, dossierPoints } from './dossier.js';
import { doorFarewell, npcName, doorBonus, finaleChoir, eveInterlude } from './wave4.js';

const HEIR_MULT = ATTACK_RULES.onDeath.quests.heirMult ?? 0.75;

export const questDef = (id) => QUESTS[id];
const stageDef = (q, id) => q.stages.find((s) => s.id === id);
const track = (st, id) => { if (id) (st.path = st.path || []).push(id); };
const SPECIAL_LINES = ['default', 'partial', 'failed'];

/** Outcome id of a finished quest for its turn-in lines. */
export function questOutcome(st, td, save = null) {
  if (st.state === 'failed') return 'failed';
  // td.outcomeBy: [{ key, all?: [flag] }] — the first entry whose flags are all set (no flags — fallback) wins (mq3-fall)
  if (save && td?.outcomeBy) for (const o of td.outcomeBy) if ((o.all || []).every((f) => save.flags?.[f])) return o.key;
  const keys = Object.keys(td?.lines || {}).filter((k) => !SPECIAL_LINES.includes(k));
  const hist = [...(st.path || []), st.opt, st.stage].filter(Boolean);
  for (let i = hist.length - 1; i >= 0; i--) {
    const k = keys.find((x) => x === hist[i] || `end-${x}` === hist[i]);
    if (k) return k;
  }
  return 'default';
}

/**
 * Turn-in lines (strings) of a quest by outcome: lines[outcome] → lines.default. With the save, td.variants
 * [{ outcome, all: [flag], key }] pick a flavour of the outcome (QA v44 L2: «closed» with door-halfsealed → «crooked»).
 */
export function turninLines(qid, outcome, save = null) {
  const td = QUEST_TURNIN[qid], l = td?.lines || {};
  const vr = save && (td?.variants || []).find((x) => x.outcome === outcome && (x.all || []).every((f) => save.flags?.[f]) && l[x.key]);
  const v = (vr ? l[vr.key] : null) ?? l[outcome] ?? l.default ?? [];
  return Array.isArray(v) ? v : [v];
}

/** Can the turn-in NPC be met (exists and stands somewhere, or travels with the party)? */
export function turninReachable(save, npcId) {
  if (!NPCS[npcId] || save.npcs?.[npcId]?.dead) return false;
  if (save.party?.some((p) => p.npc === npcId)) return true;
  return !!npcHome(npcId, save);
}

/** Quests waiting for a turn-in: [qid]; with npcId — only this NPC's. */
export function pendingTurnins(save, npcId = null) {
  return Object.keys(save.quests || {}).filter((id) => save.quests[id]?.turnin && QUEST_TURNIN[id] && (!npcId || QUEST_TURNIN[id].npc === npcId));
}

/** Journal text of a pending turn-in: «Вернуться к X (Y)». */
export function turninText(save, qid) {
  const n = QUEST_TURNIN[qid]?.npc;
  return tf('q.turnin', { npc: NPCS[n]?.name || n, loc: LOCATIONS[npcHome(n)]?.name || '?' });
}

/** Rewards of a done quest (xp, rewards, Exodus extension, talent choice). → toasts. */
function reward(save, qid, data) {
  const q = QUESTS[qid];
  const r = { ...(q.rewards || {}) };
  r.xp = questXp(q);
  // world-consequences.md §2: a quest passed to the dead giver's heir pays less
  if (save.heirs?.[qid]) { const k = HEIR_MULT; r.xp = Math.round(r.xp * k); if (r.credits) r.credits = Math.round(r.credits * k); }
  // expeditions.md: a reserve companion closed the quest — reward × EXP_TYPES.quest.reward.questRewardMul (st.expMul)
  const em = save.quests[qid]?.expMul;
  if (em) { r.xp = Math.round(r.xp * em); if (r.credits) r.credits = Math.round(r.credits * em); }
  // content-wave3.md: quest.rewardCut [{ flag, mul }] — a set flag cuts the reward (w3-vacation night shift −30%)
  for (const c of q.rewardCut || []) if (save.flags?.[c.flag]) { r.xp = Math.round(r.xp * c.mul); if (r.credits) r.credits = Math.round(r.credits * c.mul); }
  const out = grant(save, r, data, { keyChoice: q.key });
  // third-exodus.md: rewards.exodus { ext } — the Exodus deadline moves once (flag exo-ext:<quest id>)
  const ext = (q.rewards?.exodus || q.exodus)?.ext;
  if (ext) out.push(...exodusExtend(save, qid, ext));
  if (r.talentChoice) save.pendingTalentChoice = [...(save.pendingTalentChoice || []), r.talentChoice];
  if (q.personal) out.push(...personalQuestDone(save, q)); // companions-scenes.md: +loyalty, alternative path
  const choir = finaleChoir(save, qid); // content-wave4.md §5: ending D — Сестра Помеха rolls not to go into the Choir
  if (choir) { journal(save, t(choir.line)); out.push({ text: t(choir.line), color: choir.ok ? 'j' : 'c' }); }
  // QA v44 L6: c6 sets door-halfsealed when Lox is pulled out; only the endings that weld the Door (A: fin-closed) keep it —
  // after B / C / D the Door is not welded at all, so no «crooked seam» knock, no radio / epilogue line about it
  if (qid === 'mq3-court' && save.flags?.['door-halfsealed'] && !save.flags['fin-closed']) delete save.flags['door-halfsealed'];
  out.push(...applyConsequences(save, qid)); // world-consequences.md: flag cq:<qid>:<outcome>, rep, world changes (once)
  markFinale(save);
  // content-wave4.md §2: rewards.startQuest — the next quest begins at once (mq4-eve -> mq3-court: the court is at the Door)
  const nq = q.rewards?.startQuest;
  if (nq && QUESTS[nq] && !save.quests[nq] && requiresOk(save, QUESTS[nq].requires)) out.push(...startQuest(save, nq));
  return out;
}

/** The player met the NPC: the pending turn-in is closed, the reward granted (none for failed). → toasts. */
export function claimTurnin(save, qid, data) {
  const st = save.quests[qid];
  if (!st?.turnin) return [];
  st.turnin = false;
  return st.state === 'done' ? reward(save, qid, data) : [];
}

/** Pending turn-ins whose NPC cannot be met any more: reward at once with a short line. → toasts. */
export function turninFallback(save, data) {
  const out = [];
  for (const qid of pendingTurnins(save)) {
    const n = QUEST_TURNIN[qid].npc;
    if (turninReachable(save, n)) continue;
    out.push(...shortLine(qid, save.quests[qid].outcome, save), ...claimTurnin(save, qid, data));
  }
  return out;
}

const shortLine = (qid, outcome, save = null) => {
  const line = turninLines(qid, outcome, save)[0];
  const n = QUEST_TURNIN[qid]?.npc;
  return line ? [{ text: `${NPCS[n]?.name || n}: «${line}»`, color: '5' }] : [];
};

export function stageOf(save, id) {
  const q = QUESTS[id], st = save.quests[id];
  if (!q || !st || st.state !== 'active') return null;
  return stageDef(q, st.stage) || null;
}

/** Quests this NPC can give now. */
export function questsOffered(save, npcId) {
  return Object.values(QUESTS).filter((q) => (save.heirs?.[q.id] || q.giver) === npcId && !save.quests[q.id] && requiresOk(save, q.requires)); // heirs: crime.js killNpc
}

export function startQuest(save, id) {
  const q = QUESTS[id];
  save.quests[id] = { state: 'active', stage: q.stages[0].id, opt: null, subs: {}, fails: {}, failedOpts: {} };
  enterStage(save, id, q.stages[0].id);
  journal(save, tf('q.new', { name: q.name }));
  return [{ text: tf('q.new', { name: q.name }), color: 'h' }];
}

/** Stage entered: lore finds of the stage, the quest timer starts on its stage. via 'cine' — a scene result moved here (no scenes re-queued). */
function enterStage(save, qid, stageId, via = null) {
  const q = QUESTS[qid], st = save.quests[qid];
  findsAt(save, `stage:${qid}/${stageId}`);
  if (stageDef(q, stageId)?.dossier) applyDossier(save); // content-wave4.md §1: the court reads the dossier on entry
  if (stageDef(q, stageId)?.farewell) for (const x of doorFarewell(save)) // content-wave4.md §5: companions at the Door
    journal(save, tf(x.kind === 'leave' ? 'w4.doorLeave' : 'w4.doorSupport', { name: npcName(x.npc), line: x.line }));
  if (via !== 'cine') cineStage(save, qid, stageId); // cinematics.md: stage flags + queued scenes (mq3-court/inside -> c6, c4)
  else st.via = stageId;
  if (q.timer && q.timer.stage === stageId && st.due == null) st.due = save.day + q.timer.days;
  if (st.at?.[stageId] == null) (st.at ||= {})[stageId] = save.day || 0; // first day on the stage (Requires questDays)
}
/** Timer of an active quest on its stage: days left (≥ 0) or null. */
export function timerLeft(save, qid) {
  const q = QUESTS[qid], st = save.quests[qid];
  if (!q?.timer || st?.state !== 'active' || st.stage !== q.timer.stage || st.due == null) return null;
  return Math.max(0, st.due - save.day);
}
const timed = (save, qid, stage) => QUESTS[qid]?.timer?.stage === stage.id && save.quests[qid]?.due != null;
const subOk = (save, st, sg, i) => st.subs[i] === true || (sg.doneFlag && !!save.flags[sg.doneFlag]);
/** Subgoals an 'all' stage needs before it moves on by itself: a running timer waits for all of them. */
const needNow = (save, qid, stage) => (timed(save, qid, stage) && stage.goal.min ? stage.goal.goals.length : allNeed(save, stage.goal));
/** An 'all' stage may move on: enough subgoals done and every `required` subgoal done (or failed for good). */
const allReady = (save, qid, stage) => {
  const st = save.quests[qid], g = stage.goal;
  const done = g.goals.filter((sg, i) => subDone(save, st, sg, i));
  return done.length >= needNow(save, qid, stage) && g.goals.every((sg, i) => !sg.required || subDone(save, st, sg, i));
};

const optionsOf = (save, goal) => (goal.options || []).filter((o) => requiresOk(save, o.requires));

/** Current executable slots of a quest. */
/** Gate of a stage: null (open) or the reason text. */
export function stageLocked(save, stage) {
  if (!stage?.requires || requiresOk(save, stage.requires)) return null;
  return stage.gate ? tf(stage.gate.text, stage.gate.vars) : t('loc.notAvailable');
}

export function slots(save, qid) {
  const lock = stageLocked(save, stageOf(save, qid));
  const out = openSlots(save, qid);
  if (!lock) return out;
  const stage = stageOf(save, qid);
  if (stage.risk) {
    const choice = { kind: 'choice', location: stage.goal.location, options: [{ id: 'gate-risk', gateRisk: true, text: t(stage.risk.text), effects: { flags: [stage.risk.flag] } }] };
    return [{ qid, stage, goal: choice, choice, kind: 'choice', gate: lock }];
  }
  return out.map((s) => ({ ...s, locked: lock }));
}

function openSlots(save, qid) {
  const st = save.quests[qid];
  const stage = stageOf(save, qid);
  if (!stage) return [];
  const g = stage.goal;
  const out = [];
  const fromChoice = (choice, chosen, sub) => {
    if (chosen) {
      const o = choice.options.find((x) => x.id === chosen);
      if (o && o.goal) out.push({ qid, stage, goal: o.goal, option: o, choice, sub });
    } else out.push({ qid, stage, goal: choice, choice, sub, kind: 'choice' });
  };
  if (g.kind === 'choice') fromChoice(g, st.opt, undefined);
  else if (g.kind === 'all') {
    g.goals.forEach((sg, i) => {
      if (subDone(save, st, sg, i)) return;
      if (sg.kind === 'choice') fromChoice(sg, typeof st.subs[i] === 'string' && st.subs[i].startsWith('opt:') ? st.subs[i].slice(4) : null, i);
      else out.push({ qid, stage, goal: sg, sub: i });
    });
    // timed stage: `min` subgoals succeeded → the player may stop early
    if (timed(save, qid, stage) && g.min && out.length && g.goals.filter((sg, i) => subOk(save, st, sg, i)).length >= g.min) {
      const choice = { kind: 'choice', options: [{ id: 'timer-enough', text: t('timer.enough') }] };
      out.push({ qid, stage, goal: choice, choice, kind: 'choice' });
    }
  } else out.push({ qid, stage, goal: g });
  return out;
}

/**
 * How many subgoals of an 'all' goal finish the stage: min, or pick (v3: the player picks at most N, the rest are lost;
 * pickWith { flag, pick } raises N when the flag is set), else all of them.
 */
export function allNeed(save, g) {
  if (g.min) return g.min;
  if (g.pick) return Math.min(g.goals.length, g.pickWith && save.flags[g.pickWith.flag] ? g.pickWith.pick : g.pick);
  return g.goals.length;
}

/**
 * DC of a check / challenge goal: v3 easeBy — every set flag from the list lowers the DC by 1 ({flag, n} — by n).
 * content-wave4.md §1: dcFrom 'dossier' — the DC comes from the dossier (easeBy stays as data, not applied);
 * dossierPer N — easeBy, then −1 per N dossier points.
 */
export function goalDc(save, goal) {
  // content-wave4.md §5: a supporting companion at the Door — +1 to the court («dossier») rolls of his specialty (as DC −1)
  const door = goal.dcFrom === 'dossier' || goal.dossierPer ? doorBonus(save, goal.skills)?.n || 0 : 0;
  if (goal.dcFrom === 'dossier') return dossierDc(save, goal) - door;
  const ease = (goal.easeBy || []).reduce((a, f) => a + (typeof f === 'string' ? (save.flags[f] ? 1 : 0) : (save.flags[f.flag] ? f.n ?? 1 : 0)), 0);
  return goal.dossierPer ? dossierDc(save, goal, (goal.dc || 0) - ease) - door : (goal.dc || 0) - ease;
}
/** Successes / failures of a challenge goal (content-wave4.md: the court by the dossier and the c11 consent). */
export const goalLimits = (save, goal) => courtLimits(save, goal);

const subDone = (save, st, sg, i) => st.subs[i] === true || st.subs[i] === 'failed' || (sg.doneFlag && save.flags[sg.doneFlag]);
const slotKey = (slot) => `${slot.stage.id}:${slot.sub ?? '-'}:${slot.option?.id ?? '-'}`;
const choiceKey = (slot) => `${slot.stage.id}:${slot.sub ?? '-'}`;

/** Options of a choice slot still available: requires ok and not failed twice already. */
export function availableOptions(save, slot) {
  const st = save.quests[slot.qid];
  const failed = st.failedOpts?.[choiceKey(slot)] || [];
  return optionsOf(save, slot.choice).filter((o) => !failed.includes(o.id));
}

export function allSlots(save) {
  const out = [];
  for (const id of Object.keys(save.quests)) out.push(...slots(save, id));
  return out;
}

/** Locations of the current goals of active quests (radio L3 map marks). → Set of location ids. */
export function questTargets(save) {
  const out = new Set();
  for (const s of allSlots(save)) {
    if (save.quests[s.qid]?.state !== 'active') continue;
    const loc = s.goal.location || (s.kind === 'choice' ? s.choice.location : null);
    if (loc) out.add(resolveLocation(loc));
  }
  return out;
}

/** Slots shown as actions on a location: goals bound to it, plus location-free decisions / checks / payments. */
export function slotsAt(save, locId) {
  return allSlots(save).filter((s) => {
    const k = s.kind || s.goal.kind;
    if (['reach', 'talk', 'item', 'terminal'].includes(k)) return false;
    const loc = s.goal.location || (s.kind === 'choice' ? s.choice.location : null);
    return loc ? sameLocation(loc, locId) : true;
  });
}

function finish(save, qid, end, data) {
  const q = QUESTS[qid];
  const st = save.quests[qid];
  const out = [];
  st.state = end === 'failed' ? 'failed' : 'done';
  const td = QUEST_TURNIN[qid];
  if (td) st.outcome = questOutcome(st, td, save);
  if (st.state === 'failed') {
    journal(save, tf('q.failed', { name: q.name }));
    out.push({ text: tf('q.failed', { name: q.name }), color: 'c' });
    const f = normFaction(NPCS[q.giver]?.faction);
    if (f) out.push(...repToasts(applyRep(save, f, R.questFailRep)));
    if (td?.lines.failed) out.push(...deliver(save, qid, td));
    return out;
  }
  journal(save, tf('q.done', { name: q.name }));
  out.push({ text: tf('q.done', { name: q.name }), color: 'j' });
  // cyberspace-v2.md §7: quest extra { clearFlag, clearOn } — the outcome (option id) clears a flag; bodyDestroyed → the new body
  if (q.clearFlag && (!q.clearOn || st.outcome === q.clearOn || (st.path || []).includes(q.clearOn))) {
    if (q.clearFlag === SPIRIT.return.clearFlag) out.push(...restoreBody(save, data));
    else delete save.flags[q.clearFlag];
  }
  if (td) {
    out.push(...deliver(save, qid, td));
    if (st.turnin) return out;
  }
  out.push(...reward(save, qid, data));
  return out;
}

/** Turn-in delivery at finish: 'radio' → queue the radio modal; 'return' → wait for the NPC (or a short line if unreachable). */
function deliver(save, qid, td) {
  const st = save.quests[qid];
  if (td.mode === 'radio') { save.pendingRadio = [...(save.pendingRadio || []), qid]; return []; }
  if (td.mode !== 'return') return [];
  if (!turninReachable(save, td.npc)) return shortLine(qid, st.outcome, save);
  st.turnin = true;
  if (st.state !== 'done') return [];
  journal(save, tf('q.turninJournal', { name: QUESTS[qid].name, npc: NPCS[td.npc]?.name || td.npc, loc: LOCATIONS[npcHome(td.npc)]?.name || '?' }));
  return [{ text: turninText(save, qid), color: 'a' }];
}

/**
 * content-wave2.md §1.2: a cinematic ended with `result` (cine.js finish). Side effects of the result (CINE_RESULT_FX: flags,
 * counter flags, a companion dies) and, for a quest standing at a stage of CINE_RESULT_NEXT, the next stage (the stage's
 * own goal — the c4 challenge — is skipped). CINE_AFTER[id] — flags after a scene by id. → toasts.
 */
export function cineResult(save, result, ctr = {}, data = null, id = null) {
  const out = [];
  const after = id && CINE_AFTER[id];
  if (after && save?.flags && (!after.ifFlag || save.flags[after.ifFlag])) for (const f of after.flags || []) save.flags[f] = true;
  if (after && save?.quests) out.push(...flagStages(save, data)); // a clue flag may finish an 'all' stage
  // content-wave4.md §3: c12 plays after the court consequences — a flag it set (door-halfsealed) applies its mod late
  if (save?.quests?.['mq3-court']?.state === 'done') out.push(...lateCourtMods(save));
  if (!result || !save?.quests) return out;
  const fx = CINE_RESULT_FX[result];
  if (fx) {
    save.flags ||= {};
    for (const f of fx.flags || []) save.flags[f] = true;
    for (const [k, f] of Object.entries(fx.ctrFlags || {})) if ((ctr?.[k] || 0) >= 1) save.flags[f] = true;
    if (fx.dead) {
      const p = (save.party || []).find((x) => x.npc === fx.dead && x.state !== 'left');
      if (p) p.state = 'left';
      save.npcs ||= {};
      save.npcs[fx.dead] = { ...(save.npcs[fx.dead] || {}), dead: true };
      journal(save, tf('q.cineDead', { name: NPCS[fx.dead]?.name || fx.dead }));
    }
  }
  for (const key of Object.keys(CINE_RESULT_NEXT)) {
    const [qid, sid] = key.split('/');
    const st = save.quests[qid];
    let next = cineResultStage(qid, sid, result);
    const soft = CINE_RESULT_SOFTEN[next]; // content-wave4.md §1: a thick dossier turns the hard Judge fight into the usual one
    if (soft && save.flags?.[soft.flag]) next = soft.to;
    if (!next || st?.state !== 'active' || st.stage !== sid) continue;
    out.push(...toStage(save, qid, next, data, 'cine'));
  }
  return out;
}

function toStage(save, qid, next, data, via = null) {
  const q = QUESTS[qid];
  const st = save.quests[qid];
  const stage = stageOf(save, qid);
  if (!next || !stageDef(q, next)) return finish(save, qid, stage?.end || 'done', data);
  st.stage = next; st.opt = null; st.subs = {};
  track(st, next);
  enterStage(save, qid, next, via);
  journal(save, tf('q.stage', { name: q.name, text: stageDef(q, next).text }));
  return q.personal ? personalStage(save, q) : [];
}

function applyEffects(save, eff, data, key) {
  if (!eff) return [];
  const out = grant(save, eff, data, { keyChoice: key });
  if (eff.talentChoice) save.pendingTalentChoice = [...(save.pendingTalentChoice || []), eff.talentChoice];
  if (eff.text) out.push({ text: eff.text, color: '5' });
  return out;
}

/** A slot's goal is resolved. */
export function completeSlot(save, slot, data) {
  const q = QUESTS[slot.qid];
  const st = save.quests[slot.qid];
  // stale slot (already resolved, e.g. a battle won twice through a scene reload): no double rewards
  if (st?.state !== 'active' || st.stage !== slot.stage.id) return [];
  if (slot.option?.gateRisk) return applyEffects(save, slot.option.effects, data, q.key);
  if (slot.locked && stageLocked(save, slot.stage)) return [];
  // (a doneFlag set by the check scene's fx just before does not count as «already done»)
  if (slot.sub !== undefined && (st.subs[slot.sub] === true || st.subs[slot.sub] === 'failed')) return [];
  const out = applyEffects(save, slot.option?.effects, data, q.key);
  track(st, slot.option?.id);
  if (slot.sub !== undefined) {
    st.subs[slot.sub] = true;
    const sg = slot.stage.goal.goals?.[slot.sub];
    if (sg?.doneFlag) { save.flags[sg.doneFlag] = true; cineFlag(save, sg.doneFlag); } // the world's memory of it (mq3-fall: saved-*); c7 waits for ha-proof-reactor
    if (sg?.toast) out.push({ text: sg.toast, color: 'j' }); // content-wave3.md: Liza's marks «Открыто. Не благодари»
    const g = slot.stage.goal;
    if (allReady(save, slot.qid, slot.stage)) {
      out.push(...applyEffects(save, slot.stage.effects, data, q.key));
      out.push(...toStage(save, slot.qid, slot.stage.next, data));
    }
    return out;
  }
  if (slot.stage.goal.kind !== 'choice' || !slot.option) out.push(...applyEffects(save, slot.stage.effects, data, q.key));
  const next = slot.option ? (slot.option.next ?? slot.stage.next) : slot.stage.next;
  if (slot.stage.end && !slot.option) return [...out, ...finish(save, slot.qid, slot.stage.end, data)];
  out.push(...toStage(save, slot.qid, next, data));
  return out;
}

/** Pick an option of a choice slot. Options without a goal resolve immediately. */
export function chooseOption(save, slot, optId, data) {
  const st = save.quests[slot.qid];
  const o = slot.choice.options.find((x) => x.id === optId);
  if (!o) return [];
  if (o.goal) {
    track(st, o.id);
    if (slot.sub !== undefined) st.subs[slot.sub] = `opt:${o.id}`;
    else st.opt = o.id;
    const s = slots(save, slot.qid).find((x) => x.option === o);
    // talk / reach goals of the chosen option may already be satisfied later automatically
    return s ? [] : [];
  }
  return completeSlot(save, { ...slot, option: o, kind: undefined }, data);
}

/**
 * A check / challenge of a slot failed: onFail → another option of the same choice or another stage.
 * Without onFail: WORLD_RULES.goalRetries retries, then the goal is closed as failed —
 *   an option of a choice becomes unavailable (other options stay); a subgoal of 'all' counts as done-failed;
 *   a single stage goal fails the quest (giver's faction −5, world.md §3).
 */
export function failSlot(save, slot, data) {
  const st = save.quests[slot.qid];
  if (st?.state !== 'active' || st.stage !== slot.stage.id) return [];
  const target = slot.goal.onFail;
  if (!target) {
    st.fails = st.fails || {};
    const k = slotKey(slot);
    st.fails[k] = (st.fails[k] || 0) + 1;
    if (st.fails[k] <= R.goalRetries) return [{ text: t('q.retry'), color: 'c' }];
    if (slot.option) {
      st.failedOpts = st.failedOpts || {};
      const ck = choiceKey(slot);
      st.failedOpts[ck] = [...(st.failedOpts[ck] || []), slot.option.id];
      if (slot.sub !== undefined) st.subs[slot.sub] = null; else st.opt = null;
      if (availableOptions(save, { ...slot, choice: slot.choice }).length) return [{ text: t('q.optionClosed'), color: 'c' }];
    }
    if (slot.sub !== undefined) {
      st.subs[slot.sub] = 'failed';
      const g = slot.stage.goal;
      const out = [{ text: t('q.goalFailed'), color: 'c' }];
      if (allReady(save, slot.qid, slot.stage)) out.push(...toStage(save, slot.qid, slot.stage.next, data));
      return out;
    }
    return finish(save, slot.qid, 'failed', data);
  }
  if (slot.choice && slot.choice.options.some((o) => o.id === target)) {
    track(st, target);
    if (slot.sub !== undefined) st.subs[slot.sub] = `opt:${target}`;
    else st.opt = target;
    return [];
  }
  return toStage(save, slot.qid, target, data);
}

/** Reaching a location completes 'reach' goals. */
export function onArrive(save, locId, data) {
  const out = [];
  for (const s of allSlots(save)) if (s.goal.kind === 'reach' && sameLocation(s.goal.location, locId)) out.push(...completeSlot(save, s, data));
  out.push(...autoProgress(save, data));
  return out;
}

/** Talking to an NPC completes 'talk' goals for it. */
export function onTalk(save, npcId, data) {
  const out = [];
  for (let guard = 0; guard < 8; guard++) {
    const s = allSlots(save).find((x) => !x.locked && x.goal.kind === 'talk' && x.goal.npc === npcId);
    if (!s) break;
    out.push(...completeSlot(save, s, data));
  }
  out.push(...autoProgress(save, data));
  return out;
}

/** A battle won at a location: completes 'battle' goals with that encounter there. */
export function onBattleWon(save, encId, locId, data) {
  const out = [];
  for (const s of allSlots(save)) if (s.goal.kind === 'battle' && s.goal.encounter === encId && (!s.goal.location || sameLocation(s.goal.location, locId))) out.push(...completeSlot(save, s, data));
  return out;
}

/** Goals satisfied by the world state: reach (the party is already on that node), item, terminal, doneFlag. */
export function autoProgress(save, data) {
  const out = [];
  for (let guard = 0; guard < 8; guard++) {
    const s = allSlots(save).find((x) => !x.locked && ((x.goal.kind === 'reach' && sameLocation(x.goal.location, save.location))
      || (x.goal.kind === 'item' && (save.hero.items[x.goal.item] || 0) >= (x.goal.n || 1))
      || (x.goal.kind === 'terminal' && save.terminals[x.goal.terminal] && save.terminals[x.goal.terminal] !== 'ritual')));
    if (!s) break;
    if (s.goal.kind === 'item') dropItem(save, s.goal.item, s.goal.n || 1);
    out.push(...completeSlot(save, s, data));
  }
  out.push(...flagStages(save, data));
  return out;
}

/** 'all' stages whose subgoals are done by flags (also flags set by check-scene fx: enough of them → the next stage). */
function flagStages(save, data) {
  const out = [];
  for (const id of Object.keys(save.quests)) {
    const stage = stageOf(save, id);
    if (stage?.goal.kind !== 'all' || stageLocked(save, stage)) continue;
    const st = save.quests[id];
    if (!slots(save, id).length || allReady(save, id, stage)) out.push(...toStage(save, id, stage.next, data));
  }
  return out;
}

/** Days passed: expired quest timers (see the header). → toasts. */
export function questTimerTick(save, data) {
  const out = [];
  for (const [qid, st] of Object.entries(save.quests || {})) {
    const q = QUESTS[qid];
    if (!q?.timer || st.state !== 'active' || st.due == null || st.stage !== q.timer.stage || save.day < st.due) continue;
    const stage = stageOf(save, qid);
    delete st.due;
    st.expired = true;
    journal(save, tf('timer.expired', { name: q.name }));
    out.push({ text: tf('timer.expired', { name: q.name }), color: 'c' });
    const g = stage.goal;
    const ok = g.kind === 'all' ? g.goals.filter((sg, i) => subOk(save, st, sg, i)).length : 0;
    if (g.kind === 'all' && ok >= (g.min || g.goals.length)) { out.push(...toStage(save, qid, stage.next, data)); continue; }
    const target = q.timer.onExpire;
    if (target && stageDef(q, target)) { out.push(...toStage(save, qid, target, data)); continue; }
    track(st, target);
    out.push(...toStage(save, qid, stage.next, data));
  }
  return out;
}

/** Text of the current goal for the journal. */
/**
 * content-wave4.md: extra lines of a stage — stage.notes [{ requires?, text }] (the Judge's temptation in verdict) and the
 * dossier score (stage.dossier / stage.showDossier). → [{ text, color }].
 */
export function stageNotes(save, stage, qid = null) {
  if (!stage) return [];
  const out = qid ? eveInterlude(save, qid, stage.id) : []; // QA v44: the lull between the mq4-eve waves (radio, barks)
  if (stage.dossier || stage.showDossier) out.push({ text: tf('w4.dossier', { n: dossierPoints(save) }), color: 'f' });
  for (const n of stage.notes || []) if (requiresOk(save, n.requires)) out.push({ text: n.text, color: n.color || 'c' });
  return out;
}

/** content-wave4.md §1: option ids a live stage note marks (the Judge's temptation highlights A and D). → Set. */
export function stageHighlights(save, stage) {
  const out = new Set();
  for (const n of stage?.notes || []) if (n.highlight && requiresOk(save, n.requires)) for (const id of n.highlight) out.add(id);
  return out;
}

export function currentGoalText(save, id) {
  const s = stageOf(save, id);
  if (!s) return '';
  const st = save.quests[id];
  let text = s.goal.kind === 'choice' && st.opt ? s.goal.options.find((o) => o.id === st.opt)?.text || s.text : s.text;
  const lock = stageLocked(save, s);
  if (lock) text += ` (${lock})`;
  for (const n of stageNotes(save, s)) text += ` · ${n.text}`;
  // QA v40 L6 / B2: progress of an 'all' stage with min / required subgoals and where the rest is
  if (s.goal.kind === 'all' && (s.goal.min || s.goal.goals.some((sg) => sg.required))) {
    const g = s.goal, left = g.goals.filter((sg, i) => !subDone(save, st, sg, i));
    text += ` · ${tf('q.allProgress', { n: g.goals.length - left.length, need: allNeed(save, g) })}`;
    const req = left.filter((sg) => sg.required);
    if (req.length) text += ` · ${tf('q.allRequired', { list: req.map((sg) => sg.desc || LOCATIONS[resolveLocation(sg.location)]?.name || '?').join('; ') })}`;
    const where = [...new Set(left.map((sg) => LOCATIONS[resolveLocation(sg.location)]?.name).filter(Boolean))];
    if (where.length) text += ` · ${tf('q.allWhere', { list: where.join(', ') })}`;
  }
  if (id === EXODUS.quest && exodusActive(save)) text += ` · ${tf('exodus.left', { n: Math.max(0, exodusLeft(save)) })}`;
  const tl = timerLeft(save, id);
  if (tl != null) text += ` · ${tf('timer.left', { n: tl })}`;
  return text;
}
