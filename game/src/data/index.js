// Bundle of all rules data for the engine (createBattle / buildCreature / skillCheck `data` param).
import { RACES } from './races.js';
import { CLASSES, CLASS_ORDER } from './classes/index.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from './effects.js';
import { ENEMIES, ENCOUNTERS } from './enemies.js';
import { TALENTS, SKILLS, COMBAT_TALENT_LIMIT } from './talents.js';
import { GADGETS } from './gadgets.js';
import { SPECIALIZATIONS } from './skills.js';
import prologue1 from './maps/prologue-1.js';
import prologue2 from './maps/prologue-2.js';
import prologue3 from './maps/prologue-3.js';
import hatch1 from './maps/hatch-1.js';
import burningField1 from './maps/burning-field-1.js';

export const GAME_DATA = {
  RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE,
  TALENTS, GADGETS, SPECIALIZATIONS, SKILLS, COMBAT_TALENT_LIMIT,
};
export const PLAYABLE_RACES = Object.values(RACES).filter((r) => r.playable).map((r) => r.id);
export { CLASS_ORDER };
export const MAPS = {
  'prologue-1': prologue1, 'prologue-2': prologue2, 'prologue-3': prologue3,
  'hatch-1': hatch1, 'burning-field-1': burningField1,
};
