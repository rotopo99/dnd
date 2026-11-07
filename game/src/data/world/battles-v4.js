// Бои v4 (ур. 6–20) в мире: свободные бои узлов (`battles`) и случайные встречи регионов (ENCOUNTER_TABLES).
// Бои и их уровни — enemies-v4.js (ENCOUNTERS_V4, REGION_ENCOUNTERS); шкала уровней регионов — regions.js (`levels`, `act`).
// Подключено: locations.js (NODE_BATTLES_V4 дописываются в battles узлов) и travel.js (TABLE_BATTLES_V4 заменяют боевые записи таблиц
// регионов второго круга и дальше; ближние регионы — harmony, villages, tin, pirates — остаются на v1.0/v3).
// Квестовые бои (w-*, enc-* с привязкой в quests*.js) не трогаем: они дописаны рядом, а не заменены.

import { REGION_ENCOUNTERS as R } from '../enemies-v4.js';

const once = (id, encounter, extra = {}) => ({ id, encounter, once: true, ...extra });

/** узел → новые свободные бои (дописываются в конец loc.battles). */
export const NODE_BATTLES_V4 = {
  // второй круг (5–9)
  vonyuchka: [once('v4-vonyuchka-patrol', R.mutantsBeast.patrol)],
  boynik: [once('v4-boynik-host', R.mutantsBeast.host)],
  liza: [once('v4-liza-elite', R.mutantsBeast.elite)],
  svalka: [once('v4-svalka-patrol', R.scavengers.patrol)],
  'dungeons-m13': [once('v4-dumpmine-host', R.scavengers.host)],
  sputnik: [once('v4-sputnik-elite', R.scavengers.elite)],
  gidroponika: [once('v4-gidro-patrol', R.agrozone.patrol)],
  'ruins-m37': [once('v4-rebelcamp-host', R.agrozone.host)],
  'ruins-m38': [once('v4-elevator-elite', R.agrozone.elite)],
  garmoniya: [once('v4-garmoniya-patrol', R.mutantsPlant.patrol), once('v4-garmoniya-host', R.mutantsPlant.host)],
  'sacred-forests-m21': [once('v4-grove-elite', R.mutantsPlant.elite)],
  zavod: [once('v4-zavod-patrol', R.tekhonki.patrol)],
  'brigands-m25': [once('v4-raiders-host', R.tekhonki.host)],
  'ruins-m36': [once('v4-techbunker-elite', R.tekhonki.elite)],
  'hill-monsters-m20': [once('v4-hill-monster', 'v4-mon-hill')],
  betonka: [once('v4-betonka-patrol', R.mechanids.patrol)],
  'battlefields-m10': [once('v4-plague-field-host', R.mechanids.host)],
  'dungeons-m16': [once('v4-flooded-elite', R.mechanids.elite)],
  // дальние регионы, Акт II (10–16)
  shtabtsentr: [once('v4-shtab-patrol', R.renegades.patrol)],
  'krushenie-nebesnogo-bazara': [once('v4-bazaar-host', R.renegades.host)],
  'bunker-kuksiusa': [once('v4-kuksius-elite', R.renegades.elite)],
  'ledyanoy-ring': [once('v4-ring-patrol', R.wilds.patrol), once('v4-lake-monster', 'v4-mon-lake')], // озеро у ринга: хозяин озёр в старшей форме
  'dungeons-m15': [once('v4-icebunker-host', R.wilds.host), once('v4-lis-9-full', 'v4-boss-lis-9')],
  'necropolises-m47': [once('v4-icenecro-elite', R.wilds.elite)],
  'sea-monsters-m19': [once('v4-sea-monster', 'v4-mon-sea')],
  kreml: [once('v4-kreml-patrol', R.warprom.patrol)],
  'dungeons-m12': [once('v4-kreml-host', R.warprom.host), once('v4-kreml-elite', R.warprom.elite), once('v4-wolf-0-full', 'v4-boss-wolf-0')],
  'pepelnoe-gornilo': [once('v4-gornilo-patrol', R.cringegons.patrol)],
  'dungeons-m14': [once('v4-catacomb-host', R.cringegons.host)],
  'necropolises-m48': [once('v4-ash-necro-elite', R.cringegons.elite)],
  'baza-predlozhki': [once('v4-crg-chief', 'v4-boss-crg-chief')],
  'vyzhigatel-vayba': [once('v4-great-collector', 'v4-boss-collector')],
  // Акт III (15–20)
  putinlyandiya: [once('v4-putin-patrol', R.aiParty.patrol), once('v4-ai-general', 'v4-boss-ai-general')],
  'inns-m5': [once('v4-inn-host', R.aiParty.host)],
  'necropolises-m49': [once('v4-south-necro-elite', R.aiParty.elite)],
  sokralnya: [once('v4-sokralnya-patrol', R.cult.patrol), once('v4-cyber-priest', 'v4-boss-cyber-priest')],
  vooruzhenie: [once('v4-armory-host', R.cult.host), once('v4-armory-elite', R.cult.elite)],
  kiberspeys: [once('v4-cyber-guard', 'v4-cyber-guard', { when: 'terminal' })],
};

const B = (w, encounter, faction) => ({ w, kind: 'battle', encounter, faction });
const triple = (r, ws = [3, 2, 1]) => [B(ws[0], r.patrol, r.faction), B(ws[1], r.host, r.faction), B(ws[2], r.elite, r.faction)];

/** регион → боевые записи таблицы встреч (заменяют старые боевые записи; события, торговцы, слухи, NPC остаются). */
export const TABLE_BATTLES_V4 = {
  mutantsBeast: triple(R.mutantsBeast), scavengers: triple(R.scavengers), agrozone: triple(R.agrozone), mutantsPlant: triple(R.mutantsPlant),
  tekhonki: [...triple(R.tekhonki), B(1, 'v4-mon-hill', null)], mechanids: triple(R.mechanids),
  renegades: triple(R.renegades), wilds: [...triple(R.wilds), B(1, 'v4-mon-lake', null)], warprom: triple(R.warprom), cringegons: triple(R.cringegons),
  aiParty: triple(R.aiParty), cult: triple(R.cult),
};
/** море: к старым боям добавляется древний змей. */
export const SEA_EXTRA_V4 = [B(1, 'v4-mon-sea', null)];
