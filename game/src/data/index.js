// Bundle of all rules data for the engine (createBattle / buildCreature / skillCheck `data` param).
import { RACES } from './races.js';
import { CLASSES as CLASSES_BASE, CLASS_ORDER } from './classes/index.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from './effects.js';
import { ENEMIES as ENEMIES_V1, ENCOUNTERS as ENCOUNTERS_V1 } from './enemies.js';
import { ENEMIES_V3, ENCOUNTERS_V3 } from './enemies-v3.js';
import { ENCOUNTERS_V4 } from './enemies-v4.js'; // v4: враги и бои 6–20; регистрирует врагов в ENEMIES_V3
import { WEAPONS, CLASS_PROFICIENCY } from './items/weapons.js';
import { ARMOR } from './items/armor.js';
import { MODS } from './items/mods.js';
import { CONSUMABLES } from './items/consumables.js';
import { ITEMS as WORLD_ITEMS } from './world/locations.js';
import { TALENTS, SKILLS, COMBAT_TALENT_LIMIT } from './talents.js';
import { GADGETS } from './gadgets.js';
import { SPECIALIZATIONS } from './skills.js';
import prologue1 from './maps/prologue-1.js';
import prologue2 from './maps/prologue-2.js';
import prologue3 from './maps/prologue-3.js';
import hatch1 from './maps/hatch-1.js';
import burningField1 from './maps/burning-field-1.js';

/** Classes with v3 weapon-type proficiencies (items/weapons.js CLASS_PROFICIENCY; class data's own proficiencies win). */
export const CLASSES = Object.fromEntries(Object.entries(CLASSES_BASE).map(([id, c]) => [id, CLASS_PROFICIENCY[id] ? {
  ...c, proficiencies: { ...(c.proficiencies || {}), weaponTypes: { ...CLASS_PROFICIENCY[id].weaponTypes, ...(c.proficiencies?.weaponTypes || {}) } },
} : c]));

/** Enemies and battles: v1.0 + v3 (enemies-v3.js) + v4 (enemies-v4.js, ур. 6–20; 'w-cc-finale' v4 перекрывает v1.0). */
export const ENEMIES = { ...ENEMIES_V1, ...ENEMIES_V3 };
export const ENCOUNTERS = { ...ENCOUNTERS_V1, ...ENCOUNTERS_V3, ...ENCOUNTERS_V4 };
/**
 * One item catalogue: v3 gear (items/*) + v1.0 world items (world/locations.js ITEMS). Same id in both
 * (medkit, calmers, grenade) → one record: world fields (use, passives, price, desc) over the v3 battle fields.
 */
export const ITEMS = { ...WEAPONS, ...ARMOR, ...MODS, ...CONSUMABLES };
for (const [id, it] of Object.entries(WORLD_ITEMS)) ITEMS[id] = { ...(ITEMS[id] || {}), ...it };

export const GAME_DATA = {
  ITEMS,
  RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE,
  TALENTS, GADGETS, SPECIALIZATIONS, SKILLS, COMBAT_TALENT_LIMIT,
};
export const PLAYABLE_RACES = Object.values(RACES).filter((r) => r.playable).map((r) => r.id);
export { CLASS_ORDER };
export const MAPS = {
  'prologue-1': prologue1, 'prologue-2': prologue2, 'prologue-3': prologue3,
  'hatch-1': hatch1, 'burning-field-1': burningField1,
};
