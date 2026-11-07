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
import { SURFACES, SURFACE_RULES, FACTION_TAGS, SURFACE_BINDINGS } from './surfaces.js';
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

// Этап B: теги фракций (plant, proxy, beast…) и привязки поверхностей/статусов к способностям (data/surfaces.js).
for (const def of Object.values(ENEMIES)) {
  const extra = FACTION_TAGS[def.faction];
  if (extra) def.tags = [...new Set([...(def.tags || ['organic']), ...extra])];
}
/** Apply SURFACE_BINDINGS to an ability list (append ops, swap statuses). Idempotent per ability object. */
function bindAbilities(list, clsId) {
  for (const a of list || []) {
    const bd = a && SURFACE_BINDINGS[a.id];
    if (!bd || a.surfaceBound || (bd.classes && !bd.classes.includes(clsId))) continue;
    a.surfaceBound = true;
    let effects = a.effects || [];
    if (bd.swap) effects = effects.map((op) => (op.op === 'status' && bd.swap[op.id] ? { ...op, id: bd.swap[op.id] } : op));
    a.effects = [...effects, ...(bd.add || [])];
  }
}
for (const c of Object.values(CLASSES)) {
  bindAbilities(c.abilities, c.id);
  for (const p of c.paths || []) bindAbilities(p.abilities, c.id);
}
for (const def of Object.values(ENEMIES)) if (Array.isArray(def.abilities)) bindAbilities(def.abilities, null);

export const GAME_DATA = {
  ITEMS, SURFACES, SURFACE_RULES,
  RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE,
  TALENTS, GADGETS, SPECIALIZATIONS, SKILLS, COMBAT_TALENT_LIMIT,
};
export const PLAYABLE_RACES = Object.values(RACES).filter((r) => r.playable).map((r) => r.id);
export { CLASS_ORDER };
export const MAPS = {
  'prologue-1': prologue1, 'prologue-2': prologue2, 'prologue-3': prologue3,
  'hatch-1': hatch1, 'burning-field-1': burningField1,
};
