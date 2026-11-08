// Skills v3 (docs/specs/skills-v3.md): skill actions of a node (data/world/node-skill-actions.js) and «skill hints»
// (data/world/skill-hints.js). No DOM: the menu node (scenes/location.js) and the free map (scenes/roam.js) open them through
// ui/skill-ui.js. Decisions:
//  - the best party member rolls (bestFor → the highest chance), d20 via rules/skills.js skillCheck with an injectable rng;
//  - crit 20: credits and xp ×1.5; crit 1: every cost (negative hp / mrl / credits / rep / repLocal) ×1.5 (rounded away from 0);
//  - xp is flat × (1 + hero level / 10); repLocal goes to the node's faction (locFaction);
//  - done flags: once game `nsa:<id>`, node `nsa:<id>@<node>`, day `nsa:<id>@<node>:<day>` (save.flags, survive save/load).
import { NODE_SKILL_ACTIONS } from '../data/world/node-skill-actions.js';
import { NODE_HINTS, NPC_HINTS } from '../data/world/skill-hints.js';
import { GAME_DATA } from '../data/index.js';
import { skillCheck } from '../rules/skills.js';
import { checkInfo, checkChance, skillName } from './checks.js';
import { bestFor } from './skill-uses.js';
import { outcomeKey, applyFx } from './check-run.js';
import { members, requiresOk, grant, locFaction, journal, tf } from './state.js';
import { sameLocation, resolveLocation, LOCATIONS } from './data.js';

export { NODE_SKILL_ACTIONS };
const CRIT_MUL = 1.5;
const HINT_MAX = 3;

/** Flag that marks an action as done (by its `once`). */
export function actionFlag(a, locId, day) {
  const once = a.once || 'node';
  if (once === 'game') return `nsa:${a.id}`;
  if (once === 'day') return `nsa:${a.id}@${locId}:${day}`;
  return `nsa:${a.id}@${locId}`;
}

/** Does the action belong to the node: its own `node` or the node's kind. */
export const actionFits = (a, locId, loc) => (a.node ? sameLocation(a.node, locId) : !!loc && a.nodeType === loc.kind);

/**
 * Skill actions of a node: [{ id, skill, dc, label, text, a, done, why, best: {member, chance} | null }].
 * Hidden: `needs` not met. done — by the `once` flag (why: 'done' | 'doneDay').
 */
export function skillActionsAt(save, locId, loc = LOCATIONS[resolveLocation(locId)], data = GAME_DATA) {
  const id = resolveLocation(locId);
  const ms = members(save, data);
  const out = [];
  for (const a of NODE_SKILL_ACTIONS) {
    if (!actionFits(a, id, loc)) continue;
    if (a.needs && !requiresOk(save, a.needs, data)) continue;
    const done = !!save.flags[actionFlag(a, id, save.day)];
    const b = ms.length ? bestFor(ms, [a.skill], a.dc) : null;
    out.push({ id: a.id, skill: a.skill, dc: a.dc, label: a.label, text: a.text, a, done, why: done ? (a.once === 'day' ? 'doneDay' : 'done') : null,
      best: b ? { member: b.member, chance: b.chance, kind: b.info.kind } : null });
  }
  // node-specific first, then by the party's chance
  return out.sort((x, y) => (y.a.node ? 1 : 0) - (x.a.node ? 1 : 0) || (y.best?.chance || 0) - (x.best?.chance || 0));
}

const scaleCost = (v) => (v < 0 ? -Math.ceil(-v * CRIT_MUL) : v);

/** Fx of an outcome with crits applied, repLocal folded into rep, xp scaled by level. */
export function outcomeFx(a, outcome, save, locId) {
  const base = outcome === 'success' || outcome === 'critSuccess' ? a.success : a.fail;
  const fx = { ...base, rep: { ...(base.rep || {}) } };
  if (outcome === 'critSuccess') {
    if (fx.credits > 0) fx.credits = Math.round(fx.credits * CRIT_MUL);
    if (fx.xp > 0) fx.xp = Math.round(fx.xp * CRIT_MUL);
  }
  if (outcome === 'critFail') {
    for (const k of ['hp', 'mrl', 'credits', 'repLocal']) if (fx[k] < 0) fx[k] = scaleCost(fx[k]);
    for (const f of Object.keys(fx.rep)) fx.rep[f] = scaleCost(fx.rep[f]);
  }
  if (fx.repLocal) {
    const f = locFaction(resolveLocation(locId));
    if (f) fx.rep[f] = (fx.rep[f] || 0) + fx.repLocal;
  }
  if (!Object.keys(fx.rep).length) delete fx.rep;
  if (fx.xp) fx.xp = Math.round(fx.xp * (1 + (save.hero.level || 1) / 10));
  return fx;
}

/**
 * Run an action: roll → outcome → fx → done flag → journal. → { ok, outcome, natural, total, dc, member, skill, text, toasts, zero }.
 * The caller saves the game.
 */
export function runSkillAction(save, locId, a, { rng, data = GAME_DATA } = {}) {
  const id = resolveLocation(locId);
  const ms = members(save, data);
  const b = bestFor(ms, [a.skill], a.dc);
  let r = { success: false, natural: 1, total: 0 };
  if (b) r = skillCheck(b.member.unit, b.info.skill, a.dc, { adv: b.info.extraAdv, data, ...(rng ? { rng } : {}) });
  const outcome = outcomeKey(r.success, r.natural);
  const fx = outcomeFx(a, outcome, save, id);
  const { xp, ...rest } = fx;
  const res = applyFx(save, rest, { data });
  const toasts = [...res.toasts];
  if (xp) toasts.push(...grant(save, { xp }, data));
  save.flags[actionFlag(a, id, save.day)] = true;
  journal(save, tf('nsa.journal', { label: a.label, res: tf(r.success ? 'nsa.ok' : 'nsa.fail', {}) }));
  return { ok: r.success, outcome, natural: r.natural, total: r.total, dc: a.dc, member: b?.member || null, skill: a.skill, text: fx.text || '', toasts, zero: res.zero };
}

// ---------------------------------------------------------------- hints
/** Skills useful in a node (≤ 3): NODE_HINTS ∪ open skill actions ∪ cache / entry check skills, in that order. */
export function hintSkillsOf(save, locId, loc = LOCATIONS[resolveLocation(locId)]) {
  const id = resolveLocation(locId);
  const list = [...(NODE_HINTS[id] || [])];
  for (const x of save ? skillActionsAt(save, id, loc) : NODE_SKILL_ACTIONS.filter((a) => actionFits(a, id, loc)).map((a) => ({ skill: a.skill, a }))) {
    if (!x.done && x.a.node) list.push(x.skill); // node-specific actions are the «special» hint; generic ones would flood every town
  }
  for (const c of loc?.caches || []) {
    if (save?.caches?.includes(c.id)) continue;
    list.push(...(c.check?.skills || (c.check?.skill ? [c.check.skill] : [])));
  }
  if (loc?.entry?.check?.skill) list.push(loc.entry.check.skill);
  return [...new Set(list)].slice(0, HINT_MAX);
}

/** Skills an NPC's topics can be solved with (≤ 3). */
export const npcHintSkills = (npcId) => (NPC_HINTS[npcId] || []).slice(0, HINT_MAX);

/** Who in the party has the skill (specialisation / related): names. */
export function skillOwners(save, skill, data = GAME_DATA) {
  return members(save, data).filter((m) => checkInfo(m, skill).kind !== 'other').map((m) => m.name);
}

/** Tip lines «Здесь пригодится: Навык (есть у: имя)» for a list of skills. */
export function hintLines(save, skills) {
  return skills.map((s) => {
    const who = skillOwners(save, s);
    return { text: `${skillName(s)} — ${who.length ? tf('hint.has', { who: who.join(', ') }) : tf('hint.none', {})}`, color: who.length ? 'j' : '4' };
  });
}

/** Percent chance of the best member (UI sub-line). */
export const chancePct = (best) => (best ? Math.round(best.chance * 100) : 0);
export { checkChance };
