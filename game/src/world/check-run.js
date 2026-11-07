// Check scenes (docs/specs/companions-scenes.md, part 2) — logic without DOM: which scene a check opens, approach
// availability and odds, the roll, the outcome (crit 20 / 1) and its consequences (fx). UI — scenes/check-scene.js.
import { CHECK_SCENE_RULES as CS, sceneFor, checkKey, autoScene } from '../data/world/check-scenes.js';
import { checkInfo, checkChance, skillName } from './checks.js';
import { skillCheck } from '../rules/skills.js';
import { GAME_DATA } from '../data/index.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS, QUESTS } from './data.js';
import { t } from '../data/text/index.js';
import { grant, tf, members } from './state.js';
import { questXp } from '../rules/progression.js';
import { passDays } from './exodus.js';

/** Path part of a quest slot's scene key: `o:<opt>`, `s<N>`, `s<N>o:<opt>` (data/world/check-scenes.js header). */
export function slotPath(slot) {
  const sub = slot.sub !== undefined ? `s${slot.sub}` : '';
  const opt = slot.option ? `o:${slot.option.id}` : '';
  return `${sub}${opt}`;
}

/**
 * Scene of a quest check slot: { key, scene } (explicit by key or autoScene). Approaches keep only skills of this goal
 * (a scene shared through `at` may list foreign ones); fewer than 2 left → auto approaches for the goal's other skills.
 */
export function questScene(slot) {
  const key = checkKey(slot.qid, slot.stage.id, slotPath(slot));
  const text = slot.goal.desc || slot.option?.text || slot.stage.text;
  const sc = sceneFor(key, slot.goal, text);
  const skills = slot.goal.skills || [];
  if (sc.auto || !skills.length) return { key, scene: sc };
  const aps = sc.approaches.map((ap) => ({ ...ap, skills: ap.skills.filter((s) => skills.includes(s)) })).filter((ap) => ap.skills.length);
  if (aps.length < 2) for (const a of autoScene(slot.goal, text).approaches) if (aps.length < 4 && !aps.some((x) => x.skills.includes(a.skills[0]))) aps.push(a);
  return { key, scene: { ...sc, approaches: aps } };
}

/** Scene for a free check (recruitment, etc.): autoScene over the skills. */
export const plainScene = (skills, prolog = '') => autoScene({ skills }, prolog);

const clampMod = (n) => Math.max(CS.caps.dcModMin, Math.min(CS.caps.dcModMax, n || 0));

/**
 * Approach state: { ap, ok, why, member, skill, info, dc, bonus, adv, chance }.
 * The best member × skill of the approach rolls; item approaches need the item in the backpack; companion approaches —
 * the companion active and conscious. group — everyone rolls (chance — of the best).
 */
export function approachState(save, ms, ap, baseDc) {
  const dc = baseDc + clampMod(ap.dcMod);
  const out = { ap, ok: true, why: null, dc, bonus: ap.bonus || 0, adv: !!ap.adv };
  if (ap.companion && !ms.some((m) => m.key === ap.companion)) { out.ok = false; out.why = tf('cs.needCompanion', { name: NPCS[ap.companion]?.name || ap.companion }); }
  if (ap.item && !((save.hero.items?.[ap.item] || 0) > 0)) { out.ok = false; out.why = out.why || tf('cs.needItem', { item: ITEMS[ap.item]?.name || ap.item }); }
  let best = null;
  for (const skill of ap.skills || []) for (const m of ms) {
    const info = checkInfo(m, skill, out.adv ? t('cs.adv') : null);
    const c = checkChance({ ...info, total: info.total + out.bonus }, dc);
    if (!best || c > best.chance) best = { member: m, skill, info, chance: c };
  }
  return { ...out, ...(best || { member: ms[0], skill: (ap.skills || [])[0], info: null, chance: 0 }) };
}

/** All approaches of a scene with their state. */
export const approachStates = (save, ms, scene, baseDc) => scene.approaches.map((ap) => approachState(save, ms, ap, baseDc));

/** Outcome id by success and the natural die. */
export function outcomeKey(success, natural) {
  if (success) return natural === CS.crit.natSuccess ? 'critSuccess' : 'success';
  return natural === CS.crit.natFail ? 'critFail' : 'fail';
}

/**
 * Roll an approach: { rolls: [{ member, natural, dice, mode, parts, total, success }], success, natural, total, dc, outcome }.
 * group — every member rolls the approach's skill, success when at least half pass (crit: any 20 on success / any 1 on failure).
 */
export function rollApproach(a, { rng = Math.random, group = false, ms = null } = {}) {
  const who = group && ms ? ms : [a.member];
  const rolls = who.map((m) => {
    const r = skillCheck(m.unit, a.skill, a.dc, { adv: a.adv, bonus: a.bonus || 0, rng, data: GAME_DATA });
    return { member: m, natural: r.natural, dice: r.rolls, mode: r.mode, parts: r.parts, total: r.total, success: r.success };
  });
  const okN = rolls.filter((r) => r.success).length;
  const success = group ? okN * 2 >= rolls.length : rolls[0].success;
  const nat = group ? (success ? (rolls.some((r) => r.natural === 20) ? 20 : 0) : (rolls.some((r) => r.natural === 1) ? 1 : 0)) : rolls[0].natural;
  return { rolls, okN, success, natural: rolls[0].natural, total: rolls[0].total, dc: a.dc, outcome: outcomeKey(success, nat) };
}

/** Outcome block { text: [..], fx? } — crits fall back to success / fail. {name}/{stage} substituted. */
export function outcomeOf(scene, key, vars = {}) {
  const o = scene.outcomes?.[key] || scene.outcomes?.[key === 'critSuccess' ? 'success' : key === 'critFail' ? 'fail' : key] || { text: [] };
  const sub = (s) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return { text: (o.text || []).map(sub), fx: o.fx || null };
}

/** Stage share of the quest XP for fx.xpPct: quest XP / number of stages. */
export function stageXp(qid) {
  const q = QUESTS[qid];
  return q ? Math.round(questXp(q) / Math.max(1, q.stages.length)) : 0;
}

/**
 * Apply fx once: hp / mrl (hero, or all with party), days, rep, credits, items, removeItems, flags, xpPct.
 * → { toasts, zero } (zero — the Exodus timer hit 0 on days; the caller starts the zero finale).
 */
export function applyFx(save, fx, { xpBase = 0, data = GAME_DATA } = {}) {
  const out = [];
  let zero = false;
  if (!fx) return { toasts: out, zero };
  if (fx.hp || fx.mrl) {
    const ms = fx.party ? members(save, data) : members(save, data).filter((m) => m.isHero);
    for (const m of ms) {
      const e = m.isHero ? save.hero : m.p;
      if (fx.hp) e.hp = Math.max(1, m.unit.hp + fx.hp);
      if (fx.mrl) e.mrl = Math.max(0, m.unit.mrl + fx.mrl);
    }
    const party = fx.party ? ` ${t('cs.party')}` : '';
    if (fx.hp) out.push({ text: `${tf('cs.hp', { n: fx.hp > 0 ? `+${fx.hp}` : fx.hp })}${party}`, color: fx.hp > 0 ? 'j' : 'c' });
    if (fx.mrl) out.push({ text: `${tf('cs.mrl', { n: fx.mrl > 0 ? `+${fx.mrl}` : fx.mrl })}${party}`, color: fx.mrl > 0 ? 'j' : 'n' });
  }
  if (fx.days > 0) {
    const r = passDays(save, fx.days);
    out.push({ text: tf('cs.days', { n: fx.days }), color: 'a' }, ...(r.out || []));
    zero = !!r.zero;
  }
  const xp = fx.xpPct ? Math.round(xpBase * fx.xpPct / 100) : 0;
  out.push(...grant(save, { credits: fx.credits, items: fx.items, removeItems: fx.removeItems, flags: fx.flags, rep: fx.rep, xp }, data));
  return { toasts: out, zero };
}

export { skillName };
