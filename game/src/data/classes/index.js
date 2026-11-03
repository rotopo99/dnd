// Реестр классов. Порядок — как в каноне (docs/canon/rules/classes.md).
import zabivnoy from './zabivnoy.js';
import technomant from './technomant.js';
import mutant from './mutant.js';
import itishnik from './itishnik.js';
import ranger from './ranger.js';
import arbiter from './arbiter.js';
import ugolovnik from './ugolovnik.js';
import ecolog from './ecolog.js';
import reper from './reper.js';
import slavotech from './slavotech.js';
import cybertech from './cybertech.js';

const LIST = [zabivnoy, technomant, mutant, itishnik, ranger, arbiter, ugolovnik, ecolog, reper, slavotech, cybertech];

export const CLASSES = Object.fromEntries(LIST.map((c) => [c.id, c]));
export const CLASS_ORDER = LIST.map((c) => c.id);
