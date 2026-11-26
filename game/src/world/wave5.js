// Content wave 5 helpers (docs/specs/content-wave5.md §3). Pure (no DOM). The reactive flags R1–R4 are read here:
//   w5Topics(save, npcId)    R1(б) Марта, R2(а) Король свалок, R4 Азтун, Кен / Хан / Рябов / Лишай: «расспросить» by flag
//                            (world/npc-actions.js adds them to the NPC topics)
//   w5EveMods(encId)         rows of W5_EVE_MODS for a wave of mq4-eve (world/wave4.js eveMods prepends them)
//   zzPeace(save)            R3: zz-peace and both Zoya and Zarya active in the party
//   w5DoorLine(save, npc)    R3(б): at the Door (doorFarewell) Zoya / Zarya speak to each other instead of the default line
//   w5EveLines(save, n)      lines of the mq4-eve lull rest-N: a Zoya/Zarya bark (zz-peace), Aztun at Raytsentr (boltik-dead)
import { W5_TOPICS, W5_EVE_MODS, W5_FINALE_ZZ, W5_ZZ_BARKS, W5_EVE_LINES } from '../data/world/quests-wave5.js';

const on = (save, f) => !!save?.flags?.[f];
const active = (save, npc) => (save?.party || []).some((p) => p.npc === npc && p.state === 'active');

export const w5Topics = (save, npcId) => (W5_TOPICS[npcId] || []).filter((x) => on(save, x.flag)).map(({ id, q, a }) => ({ id, q, a }));

export const w5EveMods = (encId) => W5_EVE_MODS.filter((m) => !m.waves || m.waves.includes(encId));

export const zzPeace = (save) => on(save, 'zz-peace') && active(save, 'zoya-klyk') && active(save, 'zarya');

export const w5DoorLine = (save, npc) => (zzPeace(save) && W5_FINALE_ZZ[npc]) || null;

export function w5EveLines(save, n) {
  const out = [];
  if (zzPeace(save)) out.push({ text: W5_ZZ_BARKS[(Math.max(1, n) - 1) % W5_ZZ_BARKS.length], color: 'j' });
  if (n === 1 && on(save, 'boltik-dead')) out.push({ text: W5_EVE_LINES['boltik-dead'], color: '5' });
  return out;
}
