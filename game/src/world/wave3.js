// Content wave 3 helpers (docs/specs/content-wave3.md). Pure (no DOM).
//   lizaDoorReady(save)  §1 payoff rel ≥ 1: «Дверь Лизы» — a free «открыто» at a locked cache once per WAVE3_RULES.lizaDoorDays
//   useLizaDoor(save)    spend it (save.cine.lizaDoorDay = day) → true if it was ready
//   harmonySupply(save)  §2 «снабжение» Гармонии 0–5 (W3_COUNTERS, derived from flags)
//   harmonySide(save)    §2 who holds Harmony: 'ai' | 'ren' | 'pir' | 'council' | null
//   eventDue / markEvent §2 «Цена»: recurring hub events (events-wave3.js trigger.every / since; day in save.w3.events)
//   lizaCaches(save, locId, loc)  §1 rel ≥ 3: one extra cache «Открыто. Не благодари» per dungeon node (id `liza:<loc>`)
//   inHarmony(locId) / harmonyExitToll(save, from, to)  §2 pirates: 5% of credits when leaving the Harmony cluster
//   travelCut(save, days)  §2 pirates: −10% travel time; fractions bank in save.w3.travelBank → −1 day on a hop ≥ 2 days
import { WAVE3_RULES as R } from '../data/world/quests-wave3.js';
import { relOf, counterValue, lizaKeysOn } from './state.js';
import { LOCATIONS } from '../data/world/locations.js';
import { t } from '../data/text/index.js';

export function lizaDoorReady(save) {
  if (save?.quests?.['w3-liza']?.state !== 'done' || save.flags?.['liza-skip']) return false;
  if (relOf(save, 'liza') < R.lizaDoorRel) return false;
  const last = save.cine?.lizaDoorDay;
  return last == null || (save.day || 0) - last >= R.lizaDoorDays;
}

export function useLizaDoor(save) {
  if (!lizaDoorReady(save)) return false;
  save.cine ||= {};
  save.cine.lizaDoorDay = save.day || 0;
  return true;
}

export const harmonySupply = (save) => counterValue(save, 'harmony-supply');
export function harmonySide(save) {
  const f = save?.flags || {};
  return ['ai', 'ren', 'pir', 'council'].find((k) => f[`harmony-${k}`]) || null;
}

/** Recurring event cooldown (trigger.every days since the last run, the first — since the quest's consequences). */
export function eventDue(save, ev) {
  const tr = ev?.trigger || {};
  if (!tr.every) return true;
  const last = save.w3?.events?.[ev.id] ?? (tr.since ? (save.cq || []).find((x) => x.qid === tr.since)?.day : null);
  return last == null || (save.day || 0) - last >= tr.every;
}
export function markEvent(save, ev) {
  if (!ev?.trigger?.every) return;
  save.w3 ||= {};
  (save.w3.events ||= {})[ev.id] = save.day || 0;
}

/** Liza's extra caches on a node (location.js caches list): free, once per node. */
export function lizaCaches(save, locId, loc = LOCATIONS[locId]) {
  if (!loc || !R.lizaCache.kinds.includes(loc.kind) || !lizaKeysOn(save)) return [];
  return [{ id: `liza:${locId}`, loot: R.lizaCache.loot, text: t('w3.lizaCache'), liza: true }];
}

const HUB = 'alpha-harmony';
export const inHarmony = (locId) => locId === HUB || LOCATIONS[locId]?.parent === HUB;
/** Pirate Harmony: credits taken when the party leaves the hub cluster (0 — no toll). */
export function harmonyExitToll(save, from, to) {
  if (harmonySide(save) !== 'pir' || !inHarmony(from) || inHarmony(to)) return 0;
  return Math.floor((save.hero?.credits || 0) * R.pirExitToll);
}
/** Pirate trade routes: days of a hop after the −10% cut (mutates the bank; call once per hop). */
export function travelCut(save, days) {
  if (harmonySide(save) !== 'pir' || !(days > 0)) return days;
  save.w3 ||= {};
  let bank = Math.min(1, (save.w3.travelBank || 0) + days * R.pirTravelCut);
  let out = days;
  if (bank >= 1 && days >= 2) { out = days - 1; bank -= 1; }
  save.w3.travelBank = Math.round(bank * 1000) / 1000;
  return out;
}
