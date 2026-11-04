// Skill checks outside battle (world.md §5) over the engine's skillCheck (rules/skills.js).
// A member is { key, name, isHero, unit } — unit is a built creature (talents/gadget world effects in unit.skillMods).
// Items with world { check, bonus } come in through the hero's merged gadget (state.js gadgetWithItems).
import { SKILLS } from '../data/talents.js';
import { mod } from '../rules/character.js';
import { skillTier, skillCheck, SKILL_STATS } from '../rules/skills.js';
import { GAME_DATA } from '../data/index.js';
import { SPECIALIZATIONS } from './data.js';

export const skillName = (s) => SKILLS[s]?.name || s;

/** Preview: { skill, stat, kind: 'spec'|'related'|'other', mode, prof, statMod, bonus, total, notes[] }. */
export function checkInfo(member, skill, extraAdv) {
  const u = member.unit;
  const stat = SKILLS[skill]?.stat || SKILL_STATS[skill] || 'int';
  const kind = skillTier(u, skill, SPECIALIZATIONS);
  const notes = [];
  let bonus = 0;
  const m = u.skillMods?.[skill];
  if (m) for (const s of m.sources) {
    if (s.adv) notes.push({ text: s.name || s.id, adv: true });
    if (s.bonus) { bonus += s.bonus; notes.push({ text: s.name || s.id, bonus: s.bonus }); }
  }
  let adv = kind === 'spec', dis = kind === 'other';
  if (extraAdv) { notes.push({ text: extraAdv, adv: true }); adv = true; }
  const mode = adv && dis ? 'normal' : adv ? 'adv' : dis ? 'dis' : 'normal';
  const prof = kind !== 'other' ? u.prof || 2 : 0;
  const statMod = mod(u.stats?.[stat] ?? 10);
  return { skill, stat, kind, mode, prof, statMod, bonus, total: statMod + prof + bonus, notes, extraAdv: !!extraAdv };
}

export function checkChance(info, dc) {
  const need = Math.min(21, Math.max(1, dc - info.total));
  const p = Math.max(0, Math.min(1, (21 - need) / 20));
  return info.mode === 'adv' ? 1 - (1 - p) * (1 - p) : info.mode === 'dis' ? p * p : p;
}

/** Roll through the engine. Returns { rolls, natural, total, dc, success, info }. */
export function rollCheck(member, info, dc) {
  const r = skillCheck(member.unit, info.skill, dc, { adv: info.extraAdv, data: GAME_DATA });
  return { rolls: r.rolls, natural: r.natural, total: r.total, dc, success: r.success, info };
}

/** Any member has a world flag (talents / gadget / items). */
export function hasWorldFlag(members, flag) {
  return members.some((m) => (m.unit.worldFlags || []).some((w) => w.id === flag));
}
export function worldFlagValues(members, flag) {
  const out = [];
  for (const m of members) for (const w of m.unit.worldFlags || []) if (w.id === flag) out.push(w.value ?? 1);
  return out.sort((a, b) => b - a);
}
