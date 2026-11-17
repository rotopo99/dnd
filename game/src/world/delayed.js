// Delayed consequences (content-wave1.md §3, §5.2): CONSEQUENCES[qid][outcome].delayed = [{ id, days, say, fx, rumors?, radio? }].
// applyConsequences → scheduleDelayed: save.delayed [{ id, due, qid, o }]. passDays → delayedTick: every due entry fires once
// (guard flag `dl:<qid>:<id>`): fx through state.grant (rep / credits / items / flags / hp), `say` → toast «Пришли новости…»,
// journal and a rumor (save.crimeRumors pool, as crime.js addRumor); `radio` → the news id is pushed up in the radio queue.
// Also ticks quest timers (quests.js questTimerTick). Pure, no DOM.
import { CONSEQUENCES } from '../data/world/consequences.js';
import { QUESTS } from './data.js';
import { grant, journal, tf } from './state.js';
import { questTimerTick } from './quests.js';

export const DL_FLAG = (qid, id) => `dl:${qid}:${id}`;
const RUMOR_DAYS = 30;

/** Queue the delayed effects of a consequence entry (once per quest — applyConsequences is once already). */
export function scheduleDelayed(save, qid, o, entry) {
  for (const d of entry?.delayed || []) {
    if (save.flags?.[DL_FLAG(qid, d.id)]) continue;
    save.delayed = [...(save.delayed || []), { id: d.id, due: save.day + (d.days || 0), qid, o }];
  }
}

/** Fire due delayed effects. → toasts. */
export function delayedTick(save, data) {
  const out = [];
  const keep = [];
  for (const x of save.delayed || []) {
    if (x.due > save.day) { keep.push(x); continue; }
    const flag = DL_FLAG(x.qid, x.id);
    if (save.flags[flag]) continue;
    const d = (CONSEQUENCES[x.qid]?.[x.o]?.delayed || []).find((y) => y.id === x.id);
    save.flags[flag] = true;
    if (!d) continue;
    const name = QUESTS[x.qid]?.name || x.qid;
    out.push({ text: tf('news.toast', { text: d.say }), color: d.tone === 'bad' ? 'c' : 'a' });
    journal(save, tf('news.journal', { name, text: d.say }));
    out.push(...grant(save, d.fx || {}, data));
    for (const r of [d.say, ...(d.rumors || [])]) save.crimeRumors = [...(save.crimeRumors || []), { text: r, until: save.day + RUMOR_DAYS }].slice(-12);
    if (d.radio) save.radioPush = [...new Set([...(save.radioPush || []), d.radio])];
  }
  save.delayed = keep;
  return out;
}

/** Days passed (exodus.js passDays): delayed effects and quest timers. → toasts. */
export function dayTick(save, data) {
  return [...delayedTick(save, data), ...questTimerTick(save, data)];
}
