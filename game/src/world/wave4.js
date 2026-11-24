// Content wave 4 helpers (docs/specs/content-wave4.md §2, §5). Pure (no DOM).
//   eveMods(save, encId)       §2 the Raytsentr defence by earlier choices: EVE_MODS rows that apply to this wave
//   eveSetup(save, encId, enemies)  → { enemies (hpPct-wrapped), allies, buffs, notes, triggers } (scenes/world-battle.js encounterSetup;
//                              triggers — rules/battle-triggers.js: barge volley, hub terminal revive)
//   doorFarewell(save)         §5 at the Door (mq3-court door stage): loy ≥ 20 — support line, loy < −20 — the companion leaves
//   doorBonus(save, skills)    §5 a supporting companion (door-support-<id>, still active) whose class specialty is among the
//                              skills: → { n (R.door.bonus, not stacked), npc, skill } | null; quests.goalDc / cine.checkDc: DC − n
//   finaleChoir(save, qid, rng) §5 ending D: sister-pomekha in the party rolls meditation DC 14 — stays or leaves into the Choir
import { EVE_MODS, EVE_WAVES, WAVE4_RULES as R, FINALE_BARKS, FINALE_BARK_DEFAULT } from '../data/world/quests-wave4.js';
import { COMPANIONS } from '../data/companions.js';
import { NPCS } from '../data/npcs.js';
import { SPECIALIZATIONS } from '../data/skills.js';
import { GAME_DATA } from '../data/index.js';
import { skillCheck } from '../rules/skills.js';
import { memberUnit } from './state.js';

const f = (save, k) => !!save?.flags?.[k];

export function eveMods(save, encId) {
  if (!EVE_WAVES.includes(encId)) return [];
  return EVE_MODS.filter((m) => f(save, m.flag) && (!m.notFlag || !f(save, m.notFlag)) && (!m.waves || m.waves.includes(encId)));
}

const baseOf = (e) => (typeof e === 'string' ? e : e?.enemy || e?.id);
export function eveSetup(save, encId, enemies = []) {
  const mods = eveMods(save, encId);
  if (!mods.length) return { enemies, allies: [], buffs: [], notes: [], triggers: [] };
  const k = mods.reduce((a, m) => a * (m.hpPct || 1), 1);
  const out = k === 1 ? enemies : enemies.map((e) => ({ ...(typeof e === 'object' ? e : {}), enemy: baseOf(e), hpPct: Math.round((e?.hpPct || 1) * k * 100) / 100 }));
  return { enemies: out, allies: mods.flatMap((m) => m.allies || []), buffs: mods.map((m) => m.buff).filter(Boolean), notes: mods.map((m) => m.text),
    triggers: mods.flatMap((m) => m.triggers || []) };
}

/** §5: companions at the Door. Mutates the party (a cold companion leaves). → [{ npc, kind: 'support'|'leave', line }]. */
export function doorFarewell(save) {
  const out = [];
  for (const p of save?.party || []) {
    if (!['active', 'waiting'].includes(p.state) || !COMPANIONS[p.npc]) continue;
    const loy = p.approval || 0;
    if (loy < R.door.leave) {
      p.state = 'left';
      save.flags[`door-left-${p.npc}`] = true;
      out.push({ npc: p.npc, kind: 'leave', line: COMPANIONS[p.npc].leave?.line || '' });
    } else if (loy >= R.door.support && p.state === 'active') {
      save.flags[`door-support-${p.npc}`] = true;
      out.push({ npc: p.npc, kind: 'support', line: FINALE_BARKS[p.npc] || FINALE_BARK_DEFAULT });
    }
  }
  return out;
}
export const npcName = (id) => NPCS[id]?.name || id;

const activeParty = (save, npc) => (save?.party || []).find((p) => p.npc === npc && p.state === 'active');

/** §5: +1 to the court («dossier») rolls of a supporting companion's class specialty — as DC −n, once (not per companion). */
export function doorBonus(save, skills = []) {
  for (const p of save?.party || []) {
    if (p.state !== 'active' || !save.flags?.[`door-support-${p.npc}`]) continue;
    const skill = (SPECIALIZATIONS[NPCS[p.npc]?.cls]?.spec || []).find((x) => skills.includes(x));
    if (skill) return { n: R.door.bonus, npc: p.npc, skill };
  }
  return null;
}

/** §5 ending D: Сестра Помеха — meditation DC 14 not to go into the Choir. Once (flag choir-rolled). → { ok, line } | null. */
export function finaleChoir(save, qid, rng = Math.random) {
  const C = R.choir;
  if (qid !== C.quest || !f(save, C.fin) || f(save, 'choir-rolled')) return null;
  const p = activeParty(save, C.npc);
  if (!p) return null;
  save.flags['choir-rolled'] = true;
  const u = memberUnit(save, C.npc);
  const ok = !!u && skillCheck(u, C.skill, C.dc, { rng, data: GAME_DATA }).success;
  if (ok) save.flags['pomekha-stayed'] = true;
  else { p.state = 'left'; save.flags['pomekha-choir'] = true; }
  return { ok, line: ok ? 'w4.choirStay' : 'w4.choirLeave' };
}
