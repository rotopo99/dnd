// mq4-eve «Последняя ночь» (QA v44 pacing): the three Raytsentr waves differ — enemies (data/enemies-v4.js w-eve-1..3),
// optional objective (data/world/battle-objectives.js bindings) and a terrain modifier on the same map (world/wave4.js
// eveTerrain). Texts of the waves and interludes — quests-wave4.js EVE_WAVE_FLAVOR / EVE_INTERLUDES; UI lines — text/wave4-ui.js.
//   n        — wave number (EVE_WAVE_FLAVOR[n], EVE_INTERLUDES[n] after it)
//   terrain  — fire: { cells } permanent fire patches in the middle band (the approaches burn);
//              breach: { cells } cover / inner walls of the middle band knocked down (the barricade is breached);
//              dark: true — night battle (vision, light of fires and lamps)
//   band     — share of the map width around the centre where fire / breach go (heroes' and enemies' starts stay clear)
export const EVE_WAVE_SETUP = {
  'w-eve-1': { n: 1, terrain: { fire: { cells: 6 } } },
  'w-eve-2': { n: 2, terrain: { breach: { cells: 6 } } },
  'w-eve-3': { n: 3, terrain: { dark: true } },
};
export const EVE_TERRAIN_RULES = { band: [0.35, 0.65], startClear: 1 };
