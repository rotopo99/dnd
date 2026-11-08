// Companion barks (docs/specs/companions-scenes.md, «Реплики»): rare reactions with chance and cooldowns.
// World logic queues a situation (queueBark) without knowing about the game object; ui/bark.js pumps the queue each step,
// picks a line (pickBark) and shows it as a bubble with a portrait. The queue is runtime-only (never saved).
import { COMPANIONS, COMPANION_RULES, BARKS_GENERIC } from '../data/companions.js';
import { ROMANCE, ROMANCE_RULES, ROMANCE_EVENTS } from '../data/romance.js';

/** Romance situations (romance.md): romance / romanceHurt (partner), romanceJealous (rival), romanceParty (anyone). */
function romancePool(npc, situation) {
  const R = ROMANCE[npc];
  if (situation === 'romance') return R?.barks?.romance || [];
  if (situation === 'romanceHurt') return R?.barks?.hurt || [];
  if (situation === 'romanceJealous') { const l = R?.jealousy?.line; return l ? [l.replace(/^[^«]*«/, '').replace(/»\s*$/, '')] : []; }
  if (situation === 'romanceParty') return ROMANCE_EVENTS.partyBarks;
  return null;
}

const B = COMPANION_RULES.barks;
const queue = [];

/** A situation happened (npc — the companion it concerns, e.g. a liked deed). */
export function queueBark(situation, npc = null) {
  queue.push({ situation, npc });
  if (queue.length > 8) queue.shift();
}

/** Take all queued situations (ui/bark.js). */
export const takeBarks = () => queue.splice(0);

/** Cooldown state of a play session. */
export const createBarkState = () => ({ last: -1e9, perNpc: {}, perSit: {}, scene: null, sceneCount: 0 });

/**
 * Pick a bark for a situation or null. st — createBarkState(); now — seconds; cands — [{ npc, name }] (active, conscious);
 * o: { rng, scene (object — max B.maxPerScene per scene), npc (only this companion), dialogue (true — silent) }.
 * Personal lines (COMPANIONS[id].barks[situation]) win over BARKS_GENERIC.
 */
export function pickBark(st, now, situation, cands, { rng = Math.random, scene = null, npc = null, dialogue = false } = {}) {
  if (dialogue && B.ignoreInDialogue) return null;
  if (scene !== st.scene) { st.scene = scene; st.sceneCount = 0; }
  if (st.sceneCount >= B.maxPerScene) return null;
  if (now - st.last < B.globalCooldownSec) return null;
  if (now - (st.perSit[situation] ?? -1e9) < B.perSituationCooldownSec) return null;
  const list = cands.filter((c) => (!npc || c.npc === npc) && now - (st.perNpc[c.npc] ?? -1e9) >= B.perCompanionCooldownSec);
  if (!list.length) return null;
  if (rng() >= (B.chance[situation] ?? ROMANCE_RULES.barkChance?.[situation] ?? 0.2)) return null;
  const who = list[Math.floor(rng() * list.length) % list.length];
  const own = romancePool(who.npc, situation) ?? COMPANIONS[who.npc]?.barks?.[situation] ?? [];
  const pool = own.length ? own : BARKS_GENERIC[situation] || [];
  if (!pool.length) return null;
  const text = pool[Math.floor(rng() * pool.length) % pool.length].replace(/\{name\}/g, who.name);
  st.last = now; st.perNpc[who.npc] = now; st.perSit[situation] = now; st.sceneCount++;
  return { npc: who.npc, name: who.name, text, situation };
}
