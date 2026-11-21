// When cinematics start (cinematics.md §7.6): scene `trigger` -> a point in the game, conditions, one-shot flag
// `cine-seen:<id>`. Pure (no DOM, light imports: quests.js calls cineStage from enterStage).
//   cinePoint(trigger)         -> 'prologue:battle-1' | 'battle:<encounter>' | 'loc:<id>' | 'stage:<quest>/<stage>' | 'date:<npc>:<n>'
//   cineReady(save, def)       trigger conditions: once, needFlag, after (flag), req {party, loy, bond}
//   cinesAt(save, point)       ids ready at the point ('before' triggers first)
//   cineStage(save, qid, sid)  quest stage entered: CINE_STAGE_FLAGS + queue ready scenes (save.cine.queue)
//   takeCineQueue(save)        next queued id (main.js setScene on a calm scene)
//   cineResultStage(qid, sid, result)  content-wave2.md §1.2: the scene's end.result -> the next stage of a quest (or null)
import { CINEMATICS, CINEMATIC_ORDER } from '../data/cinematics/index.js';

// Designer's trigger names -> game points (the scenes name story moments, the game has encounters / nodes / stages).
export const CINE_POINT_ALIAS = {
  'battle-1': 'prologue:battle-1',                 // c1: scenes/prologue.js before battle 1
  'battle-cult-cell': 'battle:w-harmony-cult-cell', // c2: sector D cult cell (quest «cell» stage / ambush)
  'ha-reactor': 'loc:harmony-reactor',             // c3: entering the Harmony reactor node
  'mq3-court': 'stage:mq3-court/inside',           // c6 (before) and c4 (after): the door is stormed, the court opens
};
// Flags the triggers wait for, set by quest stages (enterStage).
export const CINE_STAGE_FLAGS = { 'mq3-court/inside': 'mq3-court' };

// content-wave2.md §1.2: a scene played at a quest stage decides the next stage by its end.result (the stage goal —
// the c4 challenge — stays as the fallback when the scene did not play). `result` keys: c4 end results and spec aliases.
export const CINE_RESULT_NEXT = {
  'mq3-court/inside': {
    'court-won': 'verdict',
    'court-draw': 'judge-fight', 'to-battle-judge-avatar': 'judge-fight',
    'court-lost': 'judge-fight-hard', 'to-battle-judge-avatar-hard': 'judge-fight-hard',
  },
};
// Side effects of a result (quests.js cineResult): flags; ctrFlags {counter: flag} — set when the scene counter ≥ 1;
// dead — the companion dies in the scene (leaves the party for good, save.npcs[id].dead).
export const CINE_RESULT_FX = {
  'court-won': { flags: ['court-precedent'], ctrFlags: { proof: 'court-proof' } },
  'lox-lost': { dead: 'lox' },
};
// After a scene (by id, any result): ifFlag set -> flags (content-wave2.md: c3 truth-lox5 -> the w2-harmony-truth clue).
export const CINE_AFTER = {
  'c3-lox5': { ifFlag: 'truth-lox5', flags: ['ha-proof-lox5'] },
};
export const cineResultStage = (qid, sid, result) => (result && CINE_RESULT_NEXT[`${qid}/${sid}`]?.[result]) || null;

export function cinePoint(tr) {
  if (!tr) return null;
  if (tr.romance) return `date:${tr.romance}:${tr.date || 1}`;
  return CINE_POINT_ALIAS[tr.before] || CINE_POINT_ALIAS[tr.after] || CINE_POINT_ALIAS[tr.at] || null;
}

const inParty = (save, id) => (save.party || []).some((p) => p.npc === id && ['active', 'waiting'].includes(p.state));

export function cineReady(save, def) {
  const tr = def.trigger || {}, f = save?.flags || {};
  if (tr.once !== false && f[`cine-seen:${def.id}`]) return false;
  if (tr.needFlag && !f[tr.needFlag]) return false;
  if (tr.after && CINE_POINT_ALIAS[tr.after]?.startsWith('stage:') && !f[tr.after]) return false;
  const rq = def.req;
  if (rq) {
    if (rq.party && !inParty(save, rq.party)) return false;
    for (const [id, min] of Object.entries(rq.loy || {})) if (((save.party || []).find((p) => p.npc === id)?.approval || 0) < min) return false;
    for (const [id, min] of Object.entries(rq.bond || {})) if ((save.romance?.[id]?.bond || 0) < min) return false;
  }
  return true;
}

/** Scenes of a point in order: `before` triggers first, then data order. */
const idsAt = (point) => CINEMATIC_ORDER.filter((id) => cinePoint(CINEMATICS[id].trigger) === point)
  .sort((a, b) => (CINEMATICS[a].trigger.before ? 0 : 1) - (CINEMATICS[b].trigger.before ? 0 : 1));

export function cinesAt(save, point) {
  if (!save || !point) return [];
  return idsAt(point).filter((id) => cineReady(save, CINEMATICS[id]));
}

/** Quest stage entered: its flag (CINE_STAGE_FLAGS), then scenes of `stage:<qid>/<sid>` are queued. */
export function cineStage(save, qid, sid) {
  const key = `${qid}/${sid}`;
  if (CINE_STAGE_FLAGS[key]) (save.flags ||= {})[CINE_STAGE_FLAGS[key]] = true;
  const ids = idsAt(`stage:${key}`);
  if (!ids.length) return;
  save.cine ||= {};
  const q = (save.cine.queue ||= []);
  for (const id of ids) if (!q.includes(id)) q.push(id);
}

/** Next queued scene that is still ready (conditions are re-checked: c4 sees the flags c6 wrote). */
export function takeCineQueue(save) {
  const q = save?.cine?.queue;
  while (q?.length) {
    const id = q.shift();
    if (CINEMATICS[id] && cineReady(save, CINEMATICS[id])) return id;
  }
  return null;
}
