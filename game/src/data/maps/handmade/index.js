// Hand-made maps (docs/specs/level-design.md §7.2). Roam maps bind to a node by `loc`; arenas (`kind: 'arena'`) to a boss
// enemy id by `boss`. Loader — world/handmade.js; checker — world/handmade-check.js (node tools/validate-maps.mjs).
import alphaHarmony from './alpha-harmony.js';
import raytsentr from './raytsentr.js';
import dachaBabki from './dacha-babki.js';
import arenaLis9 from './arena-lis9.js';
import svalka from './svalka.js';
import putinlyandiya from './putinlyandiya.js';
import sokralnya from './sokralnya.js';
import slavotech from './slavotech.js';
import betonka from './betonka.js';
import gidroponika from './gidroponika.js';
import arenaAiGeneral from './arena-ai-general.js';
import arenaCyberPriest from './arena-cyber-priest.js';
import arenaCrgChief from './arena-crg-chief.js';
import arenaGreatCollector from './arena-great-collector.js';
import arenaWolf0 from './arena-wolf-0.js';
import arenaJudgeAvatar from './arena-judge-avatar.js';

export const HANDMADE_LIST = [alphaHarmony, raytsentr, dachaBabki, arenaLis9, svalka, putinlyandiya, sokralnya, slavotech, betonka, gidroponika, arenaAiGeneral, arenaCyberPriest, arenaCrgChief, arenaGreatCollector, arenaWolf0, arenaJudgeAvatar];
export const HANDMADE = Object.fromEntries(HANDMADE_LIST.map((d) => [d.id, d]));
/** Node id → roam map def. */
export const HANDMADE_BY_LOC = Object.fromEntries(HANDMADE_LIST.filter((d) => d.kind !== 'arena' && d.loc).map((d) => [d.loc, d]));
/** Boss enemy id → arena def. */
export const HANDMADE_ARENAS = Object.fromEntries(HANDMADE_LIST.filter((d) => d.kind === 'arena' && d.boss).map((d) => [d.boss, d]));
/** Note id → { map, title, text } (codex «Записки»). */
export const HANDMADE_NOTES = Object.fromEntries(HANDMADE_LIST.flatMap((d) => (d.objects || []).filter((o) => o.type === 'note').map((o) => [o.id, { map: d.id, loc: d.loc, title: o.title || '', text: o.text }])));
// «Полная сила» (enemies-v4) — те же арены, что у базовых боссов; фазы босса (66% / 33%: поверхность, подкрепления) — движок archetypes.js.
if (HANDMADE_ARENAS['boss-wolf-0-alpha']) HANDMADE_ARENAS['boss-wolf-0-full'] = HANDMADE_ARENAS['boss-wolf-0-alpha'];
if (HANDMADE_ARENAS['boss-lis-9-tail']) HANDMADE_ARENAS['boss-lis-9-full'] = HANDMADE_ARENAS['boss-lis-9-tail'];
