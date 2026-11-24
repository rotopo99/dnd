// Quest access by faction trust (world.md §3 «Пороги»): which of an NPC's quests the hero is offered at the current tier.
// Pure (no UI): shared by world/npc-actions.js offeredBy and tools/test.mjs (race × origin reachability audit).
//   hostile    — only story (key) quests;
//   suspicious — story quests and «trial» quests (a way to earn trust: sq-*, wave 1–3 quests, companion personal quests);
//                a bribe talent in the party lifts the limit;
//   neutral+   — everything.
// Story (key) quests never lock by reputation (director 2026-11-24, QA v42 M1): the spine must be reachable for every
// race × origin.
import { repTier } from './reputation.js';
import { effectiveRep, hasFlagInParty } from './state.js';
import { questsOffered } from './quests.js';
import { npcRepFaction } from './data.js';

/** «Trial» quest: explicit `trial` mark (wave 1–3, personal), else a side quest sq-* without key. */
export const isTrialQuest = (q) => !q.key && (q.trial ?? q.id.startsWith('sq-'));
/** Trust tier of the party with faction f (gear stigma included); no faction — neutral. */
export const trustTier = (save, f, data) => (f ? repTier(effectiveRep(save, f, data)) : 'neutral');
/** Is quest q open at trust tier `tier` (bribe — the party has the bribe flag)? */
export function questOpen(q, tier, bribe = false) {
  if (q.key) return true;
  if (tier === 'hostile') return false;
  if (tier === 'suspicious') return bribe || isTrialQuest(q);
  return true;
}
/** Quests NPC `npc` offers to the party right now. */
export function offeredQuests(save, data, npc) {
  const tier = trustTier(save, npcRepFaction(npc), data);
  const bribe = tier === 'suspicious' && hasFlagInParty(save, data, 'bribe');
  return questsOffered(save, npc.id).filter((q) => questOpen(q, tier, bribe));
}
