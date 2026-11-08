// «Третий исход», эскалация на дорогах (docs/specs/third-exodus.md §1, метки 2–5): отряды культа и ревенанты.
// Бои по уровню региона (середина `levels`): `x-cult-<region>-1` (патруль), `x-cult-<region>-2` (отряд с командиром),
// `x-revenant-<region>` (материализованные души). Враги — лифты существующих типов культа (lift / V из enemies-v4.js).
// Какие бои и с каким весом попадают в таблицы встреч — data/world/exodus.js `EXODUS.roads`, логика — world/exodus-road.js.
import { lift, V } from './enemies-v4.js';
import { ENEMIES_V3 } from './enemies-v3.js';
import { REGIONS } from './world/regions.js';

/** Уровень боёв эскалации в регионе: середина levels, не ниже 2. */
export const exodusRegionLevel = (region) => {
  const lv = REGIONS[region]?.levels || [3, 3];
  return Math.max(2, Math.round((lv[0] + lv[1]) / 2));
};

/** «Скрилет-ревенант»: скрилет-палач на уровне L, бьёт по рассудку (пси → МРЛ). */
function revenant(L) {
  const id = lift('skrilet-5', L, { id: `x-revenant-l${L}`, name: 'Скрилет-ревенант', rank: 'specialist', faction: 'cult',
    desc: 'Душа, вытолкнутая терминалом обратно в мир и одетая в железо скрилета. Бьёт не по телу — по рассудку.' });
  const e = ENEMIES_V3[id];
  if (e?.weapon && e.weapon.dmgType !== 'psychic') e.weapon = { ...e.weapon, dmgType: 'psychic', name: 'Касание пустоты' };
  return id;
}

const enc = (id, name, level, enemies) => ({ id, name, level, faction: 'cult', places: [], enemies, exodus: true });
const list = [];
for (const region of Object.keys(REGIONS)) {
  const L = exodusRegionLevel(region);
  const rev = revenant(L);
  list.push(
    enc(`x-cult-${region}-1`, 'Отряд культа: сборщики душ', L, [V('cult', 'vet', L), V('cult', 'vet', L), V('cult', 'elite', L)]),
    enc(`x-cult-${region}-2`, 'Отряд культа: свита приговора', L, [V('cult', 'cmd', L), V('cult', 'elite', L), V('cult', 'vet', L), V('cult', 'vet', L)]),
    enc(`x-revenant-${region}`, 'Материализованные души', L, [rev, rev, V('cult', 'vet', L)]),
  );
}
export const ENCOUNTERS_EXODUS = Object.fromEntries(list.map((x) => [x.id, x]));
