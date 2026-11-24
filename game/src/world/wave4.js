// Content wave 4 helpers (docs/specs/content-wave4.md §2, §5). Pure (no DOM).
//   eveMods(save, encId)       §2 the Raytsentr defence by earlier choices: EVE_MODS rows that apply to this wave
//   eveSetup(save, encId, enemies)  → { enemies (hpPct-wrapped), allies, buffs, notes } (scenes/world-battle.js encounterSetup)
//   doorFarewell(save)         §5 at the Door (mq3-court door stage): loy ≥ 20 — support line, loy < −20 — the companion leaves
import { EVE_MODS, EVE_WAVES, WAVE4_RULES as R, FINALE_BARKS, FINALE_BARK_DEFAULT } from '../data/world/quests-wave4.js';
import { COMPANIONS } from '../data/companions.js';
import { NPCS } from '../data/npcs.js';

const f = (save, k) => !!save?.flags?.[k];

export function eveMods(save, encId) {
  if (!EVE_WAVES.includes(encId)) return [];
  return EVE_MODS.filter((m) => f(save, m.flag) && (!m.notFlag || !f(save, m.notFlag)) && (!m.waves || m.waves.includes(encId)));
}

const baseOf = (e) => (typeof e === 'string' ? e : e?.enemy || e?.id);
export function eveSetup(save, encId, enemies = []) {
  const mods = eveMods(save, encId);
  if (!mods.length) return { enemies, allies: [], buffs: [], notes: [] };
  const k = mods.reduce((a, m) => a * (m.hpPct || 1), 1);
  const out = k === 1 ? enemies : enemies.map((e) => ({ ...(typeof e === 'object' ? e : {}), enemy: baseOf(e), hpPct: Math.round((e?.hpPct || 1) * k * 100) / 100 }));
  return { enemies: out, allies: mods.flatMap((m) => m.allies || []), buffs: mods.map((m) => m.buff).filter(Boolean), notes: mods.map((m) => m.text) };
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
