// Bundle of all rules data for the engine (createBattle / buildCreature `data` param).
import { RACES } from './races.js';
import { CLASSES, CLASS_ORDER } from './classes/index.js';
import { STATUSES, VEIL_TABLE, PROXY_STORM_TABLE } from './effects.js';
import { ENEMIES, ENCOUNTERS } from './enemies.js';
import prologue1 from './maps/prologue-1.js';
import prologue2 from './maps/prologue-2.js';
import prologue3 from './maps/prologue-3.js';

export const GAME_DATA = { RACES, CLASSES, STATUSES, ENEMIES, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE };
export const PLAYABLE_RACES = Object.values(RACES).filter((r) => r.playable).map((r) => r.id);
export { CLASS_ORDER };
export const MAPS = { 'prologue-1': prologue1, 'prologue-2': prologue2, 'prologue-3': prologue3 };
