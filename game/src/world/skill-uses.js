// Skill usefulness mechanics outside the engine (docs/specs/skills.md §5, needs N1–N7) — logic without DOM.
// Numbers: data/world/skill-rules.js (SKILL_RULES). Scenes call these helpers; checks go through world/checks.js.
import { SKILL_RULES as SR } from '../data/world/skill-rules.js';
import { GAME_DATA } from '../data/index.js';
import { mod } from '../rules/character.js';
import { baseId } from './data.js';
import { checkInfo, checkChance, rollCheck } from './checks.js';

/** Best CHA modifier among members (N1). */
export const bestChaMod = (members) => Math.max(0, ...members.map((m) => mod(m.unit.stats?.cha ?? 10)));

/** N1: multipliers from CHA: { buy, sell, mod }. */
export function chaTrade(members) {
  const T = SR.trade;
  const m = bestChaMod(members);
  return { mod: m, buy: 1 - Math.min(T.buyMax, T.buyPerMod * m), sell: 1 + Math.min(T.sellMax, T.sellPerMod * m) };
}

/** Best performer for any of the skills: { member, skill, info, chance } (null without members). */
export function bestFor(members, skills, dc, extraAdv) {
  let best = null;
  for (const skill of skills) for (const m of members) {
    const info = checkInfo(m, skill, extraAdv);
    const chance = checkChance(info, dc);
    if (!best || chance > best.chance) best = { member: m, skill, info, chance };
  }
  return best;
}

/** Roll the best performer at once (automatic checks: camp, medkit, samples). { success, member, skill, res } */
export function autoCheck(members, skills, dc) {
  const b = bestFor(members, skills, dc);
  if (!b) return { success: false };
  const res = rollCheck(b.member, b.info, dc);
  return { success: res.success, member: b.member, skill: b.skill, res };
}

/** A member has the skill as specialisation or related (N7 appraisal). */
export const knowsSkill = (members, skill) => members.some((m) => checkInfo(m, skill).kind !== 'other');

// ----------------------------------------------------------------------------- N3: talks instead of a fight
const enemyDef = (id, data = GAME_DATA) => data.ENEMIES?.[id] || data.ENEMIES?.[baseId(id)] || null;
const DEAF = new RegExp(SR.parley.deafPattern, 'i');

/** Does this enemy listen to talks (people and robots; not beasts, undead, cringegons, digital ghosts)? */
export function listens(id, data = GAME_DATA) {
  const e = enemyDef(id, data);
  if (!e) return false;
  const P = SR.parley;
  if (e.boss) return false;
  if (P.deafFactions.includes(e.faction)) return false;
  if ((e.tags || []).some((t) => P.deafTags.includes(t))) return false;
  return !DEAF.test(baseId(id)) && !DEAF.test(e.name || '');
}

/** Talks are possible when every enemy listens. */
export const canParley = (enemyIds, data = GAME_DATA) => !!enemyIds?.length && enemyIds.every((id) => listens(id, data));

/** DC of talks: 12 + danger (max 17). */
export const parleyDc = (danger = 0) => Math.min(SR.parley.maxDc, SR.parley.baseDc + Math.max(0, danger | 0));

// ----------------------------------------------------------------------------- N6: battle tricks
export const TRICKS = ['analysis', 'hacking', 'tech', 'medicine', 'athletics', 'stealth', 'biology'];

/** DC of a battle trick against a target of `level` (12 + level / 2). */
export const trickDc = (level = 0) => SR.tricks.dc + Math.floor((level || 0) / 2);

// ----------------------------------------------------------------------------- N7: economy
/** DC to take an item apart: tier + 10. */
export const disassembleDc = (it) => SR.economy.disassemble.dcBase + (it?.tier || 1);
export const disassembleParts = (it) => SR.economy.disassemble.n + ((it?.tier || 1) >= SR.economy.disassemble.bonusFromTier ? 1 : 0);

/** Were there mutants among the beaten enemies (biology samples)? */
export function mutantsIn(enemyIds, data = GAME_DATA) {
  const S = SR.economy.samples;
  return (enemyIds || []).some((id) => { const e = enemyDef(id, data); return e && (S.factions.includes(e.faction) || (e.tags || []).some((t) => S.tags.includes(t))); });
}
