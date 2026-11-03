// Skill checks outside battle (world.md §5): d20 + mod(stat) [+ prof] + bonuses vs DC.
// Specialisation of the class → advantage + proficiency; related → normal + proficiency; others → disadvantage.
// Talents/gadgets: { check, bonus } and { check, adv: true } (the skill becomes a specialisation).
import { SKILLS, TALENTS } from '../data/talents.js';
import { mod, profBonus } from '../rules/character.js';
import { CLASS_SKILLS, GADGETS } from './data.js';

export const DC = { easy: 10, medium: 13, hard: 16, veryHard: 19 };
export const skillName = (s) => SKILLS[s]?.name || s;

/** World effects of a member: talents + class gadget. */
export function worldEffects(member) {
  const out = [];
  for (const id of member.talents || []) {
    const t = TALENTS[id];
    if (t) for (const w of t.world || []) out.push({ ...w, src: t.name });
  }
  const g = member.isHero ? GADGETS[member.cls] : null;
  if (g) for (const w of g.world || []) out.push({ ...w, src: g.name });
  return out;
}

export function hasWorldFlag(members, flag) {
  for (const m of members) for (const w of worldEffects(m)) if (w.worldFlag === flag) return true;
  return false;
}

/**
 * Preview of a check for a member: { mode, prof, statMod, bonus, total, notes[] }.
 * member: { name, cls, level, stats, talents, isHero }. extraAdv — reason string for external advantage.
 */
export function checkInfo(member, skill, extraAdv) {
  const sk = SKILLS[skill] || { stat: 'int' };
  const table = CLASS_SKILLS[member.cls] || { spec: [], related: [] };
  let kind = table.spec.includes(skill) ? 'spec' : table.related.includes(skill) ? 'related' : 'other';
  const notes = [];
  let bonus = 0;
  for (const w of worldEffects(member)) {
    if (w.check !== skill) continue;
    if (w.adv) { kind = 'spec'; notes.push({ text: w.src, adv: true }); }
    if (w.bonus) { bonus += w.bonus; notes.push({ text: w.src, bonus: w.bonus }); }
  }
  let mode = kind === 'spec' ? 'adv' : kind === 'related' ? 'normal' : 'dis';
  if (extraAdv) {
    notes.push({ text: extraAdv, adv: true });
    mode = mode === 'dis' ? 'normal' : 'adv';
  }
  const prof = kind !== 'other' ? profBonus(member.level || 1) : 0;
  const statMod = mod(member.stats?.[sk.stat] ?? 10);
  return { skill, stat: sk.stat, kind, mode, prof, statMod, bonus, total: statMod + prof + bonus, notes };
}

/** Success chance of a check preview vs dc. */
export function checkChance(info, dc) {
  const need = Math.min(20, Math.max(2, dc - info.total));
  const p = (21 - need) / 20;
  return info.mode === 'adv' ? 1 - (1 - p) * (1 - p) : info.mode === 'dis' ? p * p : p;
}

/** Roll a check. rng() ∈ [0,1). Returns { rolls, natural, total, dc, success, info }. */
export function rollCheck(info, dc, rng = Math.random) {
  const d = () => 1 + Math.floor(rng() * 20);
  const a = d();
  const rolls = info.mode === 'normal' ? [a] : [a, d()];
  const natural = info.mode === 'adv' ? Math.max(...rolls) : info.mode === 'dis' ? Math.min(...rolls) : a;
  const total = natural + info.total;
  return { rolls, natural, total, dc, success: total >= dc, info };
}
