// Backstories (world-consequences.md ч.4) over data/world/backstories.js: one per hero, `save.hero.bg = id`.
// Start effects are applied once by state.newSave (applyBackstory): rep (applyRep with spread), items, credits,
// flags, topics (flag `topic:<id>`), drawback (rep / phobia / wanted). Skill bonuses work through buildHero
// (backstoryWorld → the merged gadget's world entries { check, bonus }), so checks and the skills window see them.
import { giveItem } from './inventory.js';
import { BACKSTORIES, TOPIC_NOTES, TOPIC_TALK } from '../data/world/backstories.js';
import { SKILLS } from '../data/talents.js';
import { applyRep, factionName } from './reputation.js';
import { ITEMS } from './data.js';
import { t } from '../data/text/index.js';

const tf = (k, v) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');

export const backstoryOf = (id) => (id && BACKSTORIES[id]) || null;
export const backstoryList = (race) => Object.values(BACKSTORIES).filter((b) => !b.races || !race || b.races.includes(race));
export const hasTopic = (save, topic) => !!save?.flags?.[`topic:${topic}`];
const skillName = (s) => SKILLS[s]?.name || s;

/** World entries for the merged gadget: [{ check, bonus, name }]. */
export function backstoryWorld(hero) {
  const b = backstoryOf(hero?.bg);
  return b ? b.skills.map((s) => ({ check: s.skill, bonus: s.bonus, name: b.name })) : [];
}

/**
 * Drawback «no battle experience» (drawback.hit): passives for the merged gadget until the first won battle
 * (codex kills are empty). → [{ op: { hit } }].
 */
export function backstoryPassives(save) {
  const b = backstoryOf(save?.hero?.bg);
  const hit = b?.drawback?.hit;
  if (!hit) return [];
  const kills = save.codex?.kills;
  if (kills && Object.keys(kills).length) return [];
  return [{ op: { hit } }];
}

/** Apply start effects to a fresh save (before normalizeInventory: items go into hero.items counts). → [{ faction, delta }]. */
export function applyBackstory(save) {
  const b = backstoryOf(save.hero.bg);
  if (!b || save.flags[`bg:${b.id}`]) return [];
  save.flags[`bg:${b.id}`] = true;
  const st = b.start || {};
  const changes = [];
  for (const [f, d] of Object.entries(st.rep || {})) changes.push(...applyRep(save, f, d));
  for (const it of st.items || []) giveItem(save, it.id, it.n);
  save.hero.credits += st.credits || 0;
  for (const f of st.flags || []) save.flags[f] = true;
  for (const tp of b.topics || []) save.flags[`topic:${tp}`] = true;
  const dr = b.drawback || {};
  for (const [f, d] of Object.entries(dr.rep || {})) changes.push(...applyRep(save, f, d));
  if (dr.phobia) {
    const list = Array.isArray(save.hero.phobia) ? save.hero.phobia : [];
    if (!list.some((p) => p.trigger === dr.phobia)) list.push({ trigger: dr.phobia });
    save.hero.phobia = list;
  }
  if (dr.wanted) {
    save.wanted = save.wanted || {};
    for (const [f, heat] of Object.entries(dr.wanted)) save.wanted[f] = { heat: Math.max(save.wanted[f]?.heat || 0, heat), until: 0, bounty: 0 };
  }
  return changes;
}

/** Tooltip / details spec: description, pluses, conditional advantage, start, topics, the drawback. */
export function backstoryTip(b) {
  if (!b) return null;
  const st = b.start || {};
  const lines = [b.desc, { text: tf('bg.skills', { list: b.skills.map((s) => `${skillName(s.skill)} +${s.bonus}`).join(', ') }), color: 'j' }];
  for (const c of b.conditional || []) lines.push({ text: tf('bg.adv', { skill: skillName(c.skill), when: c.when }), color: 'j' });
  const start = [];
  const rep = Object.entries(st.rep || {}).map(([f, d]) => `${factionName(f)} ${d > 0 ? '+' : ''}${d}`);
  if (rep.length) start.push(tf('bg.rep', { list: rep.join(', ') }));
  if (st.items?.length) start.push(st.items.map((i) => `${ITEMS[i.id]?.name || i.id} ×${i.n}`).join(', '));
  if (st.credits) start.push(tf('bg.credits', { n: st.credits }));
  if (start.length) lines.push({ text: tf('bg.start', { list: start.join('; ') }), color: '5' });
  for (const tp of b.topics || []) lines.push({ text: tf('bg.topic', { text: TOPIC_NOTES[tp] || tp }), color: 'b' });
  lines.push({ text: tf('bg.drawback', { text: b.drawback?.note || b.drawback?.trust || '—' }), color: 'c' });
  return { title: b.name, lines };
}

/**
 * Backstory questions for an NPC (TOPIC_TALK): the hero has `topic:<id>` and the NPC's faction / id matches.
 * → [{ id, q, a, fx, used }] (used — the one-time fx was already given by this NPC).
 */
export function backstoryTopics(save, npcId, faction) {
  const out = [];
  for (const [id, tp] of Object.entries(TOPIC_TALK)) {
    if (!hasTopic(save, id)) continue;
    if (!(tp.npcs?.includes(npcId) || (faction && tp.factions?.includes(faction)))) continue;
    out.push({ id, q: tp.q, a: tp.a, fx: tp.fx || {}, used: !!save.flags[`topic-used:${id}:${npcId}`] });
  }
  return out;
}
/** Mark a backstory topic as used with this NPC; → the one-time effects ({ xp, credits }, hook) or null when used. */
export function useBackstoryTopic(save, npcId, id) {
  const k = `topic-used:${id}:${npcId}`;
  if (save.flags[k]) return null;
  save.flags[k] = true;
  return TOPIC_TALK[id]?.fx || {};
}
