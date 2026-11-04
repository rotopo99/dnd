// Quest interpreter over data/world/quests.js (schema in its header) and save.quests[id] =
// { state: 'active'|'done'|'failed', stage, opt: optionId|null, subs: { [i]: true | 'opt:<id>' } }.
//
// A "slot" is one executable goal of the current stage: { qid, stage, goal, sub?: index, option?: Option, choice?: Goal }.
//   kind 'choice' slots are decisions (UI lists options); other kinds are goals to resolve:
//   reach / talk / item / terminal — automatic (onArrive / onTalk / autoProgress); battle / check / challenge / pay — UI actions.
import { QUESTS } from './data.js';
import { t } from '../data/text/index.js';
import { grant, journal, requiresOk, tf, repToasts } from './state.js';
import { applyRep, normFaction } from './reputation.js';
import { NPCS } from '../data/npcs.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { questXp } from '../rules/progression.js';

export const questDef = (id) => QUESTS[id];
const stageDef = (q, id) => q.stages.find((s) => s.id === id);

export function stageOf(save, id) {
  const q = QUESTS[id], st = save.quests[id];
  if (!q || !st || st.state !== 'active') return null;
  return stageDef(q, st.stage) || null;
}

/** Quests this NPC can give now. */
export function questsOffered(save, npcId) {
  return Object.values(QUESTS).filter((q) => q.giver === npcId && !save.quests[q.id] && requiresOk(save, q.requires));
}

export function startQuest(save, id) {
  const q = QUESTS[id];
  save.quests[id] = { state: 'active', stage: q.stages[0].id, opt: null, subs: {}, fails: {}, failedOpts: {} };
  journal(save, tf('q.new', { name: q.name }));
  return [{ text: tf('q.new', { name: q.name }), color: 'h' }];
}

const optionsOf = (save, goal) => (goal.options || []).filter((o) => requiresOk(save, o.requires));

/** Current executable slots of a quest. */
export function slots(save, qid) {
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
  } else out.push({ qid, stage, goal: g });
  return out;
}

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

/** Slots shown as actions on a location: goals bound to it, plus location-free decisions / checks / payments. */
export function slotsAt(save, locId) {
  return allSlots(save).filter((s) => {
    const k = s.kind || s.goal.kind;
    if (['reach', 'talk', 'item', 'terminal'].includes(k)) return false;
    const loc = s.goal.location || (s.kind === 'choice' ? s.choice.location : null);
    return loc ? loc === locId : true;
  });
}

function finish(save, qid, end, data) {
  const q = QUESTS[qid];
  const st = save.quests[qid];
  const out = [];
  st.state = end === 'failed' ? 'failed' : 'done';
  if (st.state === 'failed') {
    journal(save, tf('q.failed', { name: q.name }));
    out.push({ text: tf('q.failed', { name: q.name }), color: 'c' });
    const f = normFaction(NPCS[q.giver]?.faction);
    if (f) out.push(...repToasts(applyRep(save, f, R.questFailRep)));
    return out;
  }
  journal(save, tf('q.done', { name: q.name }));
  out.push({ text: tf('q.done', { name: q.name }), color: 'j' });
  const r = { ...(q.rewards || {}) };
  r.xp = questXp(q);
  out.push(...grant(save, r, data, { keyChoice: q.key }));
  if (r.talentChoice) save.pendingTalentChoice = [...(save.pendingTalentChoice || []), r.talentChoice];
  return out;
}

function toStage(save, qid, next, data) {
  const q = QUESTS[qid];
  const st = save.quests[qid];
  const stage = stageOf(save, qid);
  if (!next || !stageDef(q, next)) return finish(save, qid, stage?.end || 'done', data);
  st.stage = next; st.opt = null; st.subs = {};
  journal(save, tf('q.stage', { name: q.name, text: stageDef(q, next).text }));
  return [];
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
  if (slot.sub !== undefined && subDone(save, st, slot.stage.goal.goals[slot.sub], slot.sub)) return [];
  const out = applyEffects(save, slot.option?.effects, data, q.key);
  if (slot.sub !== undefined) {
    st.subs[slot.sub] = true;
    const g = slot.stage.goal;
    const done = g.goals.filter((sg, i) => subDone(save, st, sg, i)).length;
    if (done >= (g.min || g.goals.length)) {
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
      if (g.goals.filter((sg, i) => subDone(save, st, sg, i)).length >= (g.min || g.goals.length)) out.push(...toStage(save, slot.qid, slot.stage.next, data));
      return out;
    }
    return finish(save, slot.qid, 'failed', data);
  }
  if (slot.choice && slot.choice.options.some((o) => o.id === target)) {
    if (slot.sub !== undefined) st.subs[slot.sub] = `opt:${target}`;
    else st.opt = target;
    return [];
  }
  return toStage(save, slot.qid, target, data);
}

/** Reaching a location completes 'reach' goals. */
export function onArrive(save, locId, data) {
  const out = [];
  for (const s of allSlots(save)) if (s.goal.kind === 'reach' && s.goal.location === locId) out.push(...completeSlot(save, s, data));
  out.push(...autoProgress(save, data));
  return out;
}

/** Talking to an NPC completes 'talk' goals for it. */
export function onTalk(save, npcId, data) {
  const out = [];
  for (let guard = 0; guard < 8; guard++) {
    const s = allSlots(save).find((x) => x.goal.kind === 'talk' && x.goal.npc === npcId);
    if (!s) break;
    out.push(...completeSlot(save, s, data));
  }
  out.push(...autoProgress(save, data));
  return out;
}

/** A battle won at a location: completes 'battle' goals with that encounter there. */
export function onBattleWon(save, encId, locId, data) {
  const out = [];
  for (const s of allSlots(save)) if (s.goal.kind === 'battle' && s.goal.encounter === encId && (!s.goal.location || s.goal.location === locId)) out.push(...completeSlot(save, s, data));
  return out;
}

/** Goals satisfied by the world state: reach (the party is already on that node), item, terminal, doneFlag. */
export function autoProgress(save, data) {
  const out = [];
  for (let guard = 0; guard < 8; guard++) {
    const s = allSlots(save).find((x) => (x.goal.kind === 'reach' && x.goal.location === save.location)
      || (x.goal.kind === 'item' && (save.hero.items[x.goal.item] || 0) >= (x.goal.n || 1))
      || (x.goal.kind === 'terminal' && save.terminals[x.goal.terminal] && save.terminals[x.goal.terminal] !== 'ritual'));
    if (!s) break;
    if (s.goal.kind === 'item') save.hero.items[s.goal.item] -= s.goal.n || 1;
    out.push(...completeSlot(save, s, data));
  }
  // 'all' stages whose subgoals are done by flags
  for (const id of Object.keys(save.quests)) {
    const stage = stageOf(save, id);
    if (stage?.goal.kind === 'all' && !slots(save, id).length) out.push(...toStage(save, id, stage.next, data));
  }
  return out;
}

/** Text of the current goal for the journal. */
export function currentGoalText(save, id) {
  const s = stageOf(save, id);
  if (!s) return '';
  const st = save.quests[id];
  if (s.goal.kind === 'choice' && st.opt) return s.goal.options.find((o) => o.id === st.opt)?.text || s.text;
  return s.text;
}
