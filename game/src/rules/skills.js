// Out-of-combat skill checks (docs/specs/world.md, п. 5; canon rule 1: off-specialization -> disadvantage,
// specialization -> advantage). Pure: specializations / skill stats are injected via `data`.

import { d20 } from './dice.js';
import { mod } from './character.js';

/** Canon «2 базовых навыка + 2 доп» (sheet of Repa: «база +2», «доп +1»). */
export const SKILL_BASE_BONUS = 2;
export const SKILL_EXTRA_BONUS = 1;

/** Canon skill -> stat (rules/stats-skills.md); used when data.SKILLS is not passed. */
export const SKILL_STATS = {
  athletics: 'str', acrobatics: 'dex', stealth: 'dex', persuasion: 'cha', deception: 'cha', intimidation: 'cha',
  analysis: 'int', hacking: 'int', lockpicking: 'per', tech: 'int', biology: 'int', proxy: 'wil', judge: 'int',
  meditation: 'wil', medicine: 'int', survival: 'con', endurance: 'con', perception: 'per', religion: 'int', military: 'int',
};

/**
 * How a creature rolls a skill: 'spec' (adv + prof), 'related' (normal + prof) or 'other' (dis, no prof).
 * A talent with { check: skill, adv: true } makes the skill a specialization.
 */
export function skillTier(creature, skill, specializations) {
  if (creature.skillMods && creature.skillMods[skill] && creature.skillMods[skill].adv) return 'spec';
  const row = specializations && creature.classId ? specializations[creature.classId] : null;
  if (row && row.spec.includes(skill)) return 'spec';
  if (row && row.related.includes(skill)) return 'related';
  return 'other';
}

/**
 * skillCheck(creature, skill, dc, { adv, dis, rng, data }) -> { roll, total, success, natural, rolls, mode, tier, bonus, parts }
 * d20 + mod(skill stat) + (prof if spec/related) + talent bonuses >= dc. Mode from the tier, combined with opts.adv/dis
 * (advantage and disadvantage cancel). parts — [{ label, value }] for the UI log line ("+2 Глазомер").
 */
export function skillCheck(creature, skill, dc, opts = {}) {
  const data = opts.data || {};
  const specs = data.SPECIALIZATIONS || data.specializations || null;
  const skills = data.SKILLS || data.skills || null;
  const stat = (skills && skills[skill] && skills[skill].stat) || SKILL_STATS[skill];
  if (!stat) throw new Error(`skillCheck: unknown skill "${skill}"`);
  const rng = opts.rng || Math.random;
  const tier = skillTier(creature, skill, specs);
  const adv = tier === 'spec' || !!opts.adv;
  // v3: armour without skill / stealth-penalty armour (medium without mastery) -> disadvantage on stealth
  const armorDis = skill === 'stealth' && !!creature.stealthDis;
  const dis = tier === 'other' || !!opts.dis || armorDis;
  const r = d20(rng, { adv, dis });
  const parts = [{ label: stat, value: mod(creature.stats[stat]) }];
  if (tier !== 'other') parts.push({ label: 'prof', value: creature.prof || 2 });
  const picks = creature.skillPicks;
  if (picks && picks.base.includes(skill)) parts.push({ label: 'base', value: SKILL_BASE_BONUS });
  else if (picks && picks.extra.includes(skill)) parts.push({ label: 'extra', value: SKILL_EXTRA_BONUS });
  const m = creature.skillMods && creature.skillMods[skill];
  if (m) for (const s of m.sources) if (s.bonus) parts.push({ label: s.name || s.id, value: s.bonus, talent: s.id });
  if (opts.bonus) parts.push({ label: 'bonus', value: opts.bonus });
  const bonus = parts.reduce((a, p) => a + p.value, 0);
  const total = r.natural + bonus;
  return { roll: r.natural, natural: r.natural, rolls: r.rolls, mode: r.mode, tier, bonus, total, dc, success: total >= dc, parts, armorDis,
    advSources: m ? m.sources.filter((s) => s.adv).map((s) => s.name || s.id) : [] };
}
