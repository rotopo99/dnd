// Content wave 3 helpers (docs/specs/content-wave3.md). Pure (no DOM).
//   lizaDoorReady(save)  §1 payoff rel ≥ 1: «Дверь Лизы» — a free «открыто» at a locked cache once per WAVE3_RULES.lizaDoorDays
//   useLizaDoor(save)    spend it (save.cine.lizaDoorDay = day) → true if it was ready
//   harmonySupply(save)  §2 «снабжение» Гармонии 0–5 (W3_COUNTERS, derived from flags)
//   harmonySide(save)    §2 who holds Harmony: 'ai' | 'ren' | 'pir' | 'council' | null
import { WAVE3_RULES as R } from '../data/world/quests-wave3.js';
import { relOf, counterValue } from './state.js';

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
