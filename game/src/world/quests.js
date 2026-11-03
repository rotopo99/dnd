// Quest runner over save.quests (world.md §5). Goals: reach, talk, battle, check, challenge, choice, item.
import { QUESTS } from './data.js';
import { grant, journal } from './state.js';

export const questDef = (id) => QUESTS[id];
export const questState = (save, id) => save.quests[id] || null;

export function stageOf(save, id) {
  const q = QUESTS[id], st = save.quests[id];
  if (!q || !st || st.state !== 'active') return null;
  return q.stages.find((s) => s.id === st.stage) || null;
}

/** Quests this NPC can give now. */
export function questsOffered(save, npcId) {
  return Object.values(QUESTS).filter((q) => q.giver === npcId && !save.quests[q.id] && (!q.requires?.flag || save.flags[q.requires.flag]));
}

export function startQuest(save, id) {
  const q = QUESTS[id];
  save.quests[id] = { state: 'active', stage: q.stages[0].id, vars: {} };
  journal(save, `Новый квест: «${q.name}».`);
  return [{ text: `Новый квест: ${q.name}`, color: 'h' }];
}

/** Move to the next stage (or finish). Returns toasts. */
export function advance(save, id, next, data, extra) {
  const q = QUESTS[id];
  const st = save.quests[id];
  const stage = stageOf(save, id);
  const out = [];
  if (extra) out.push(...grant(save, extra, data));
  const to = next || stage?.next;
  if (stage?.end || !to || !q.stages.some((s) => s.id === to)) {
    st.state = 'done';
    journal(save, `Квест выполнен: «${q.name}».`);
    out.push({ text: `Квест выполнен: ${q.name}`, color: 'j' });
    out.push(...grant(save, { ...q.rewards, keyChoice: q.key }, data));
  } else {
    st.stage = to;
    const s = q.stages.find((x) => x.id === to);
    journal(save, `«${q.name}»: ${s.text}`);
  }
  return out;
}

export function failQuest(save, id) {
  const st = save.quests[id];
  if (st) st.state = 'failed';
  journal(save, `Квест провален: «${QUESTS[id].name}».`);
  return [{ text: `Квест провален: ${QUESTS[id].name}`, color: 'c' }];
}

/** Active stages whose goal is at this location (battle / check / challenge / choice). */
export function goalsAt(save, locId) {
  const out = [];
  for (const id of Object.keys(save.quests)) {
    const s = stageOf(save, id);
    if (s && s.goal.location === locId && s.goal.kind !== 'reach') out.push({ quest: id, stage: s });
  }
  return out;
}

/** Reaching a location completes 'reach' goals. */
export function onArrive(save, locId, data) {
  const out = [];
  for (const id of Object.keys(save.quests)) {
    const s = stageOf(save, id);
    if (s && s.goal.kind === 'reach' && s.goal.location === locId) out.push(...advance(save, id, null, data));
  }
  return out;
}

/** Talking to an NPC completes 'talk' goals. */
export function onTalk(save, npcId, data) {
  const out = [];
  for (const id of Object.keys(save.quests)) {
    const s = stageOf(save, id);
    if (s && s.goal.kind === 'talk' && s.goal.npc === npcId) out.push(...advance(save, id, null, data));
  }
  return out;
}

/** A location battle won: completes 'battle' goals bound to it. */
export function onBattleWon(save, battleId, data) {
  const out = [];
  for (const id of Object.keys(save.quests)) {
    const s = stageOf(save, id);
    if (s && s.goal.kind === 'battle' && s.goal.battle === battleId) out.push(...advance(save, id, null, data));
  }
  return out;
}
