// Diagnostics: level-1 stats of every class (HP, KB, basic attack, first abilities). Usage: node tools/sim/casters-diag.mjs
import { GAME_DATA, PLAYABLE_RACES } from '../../game/src/data/index.js';
import { CLASS_ORDER, CLASSES } from '../../game/src/data/classes/index.js';
import { RACES } from '../../game/src/data/races.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { starterKit } from '../../game/src/world/data.js';
import { gadgetFor } from '../../game/src/data/gadgets.js';
for (const cls of CLASS_ORDER) {
  const race = PLAYABLE_RACES.find((r) => isAllowed(RACES[r], CLASSES[cls]));
  const path = CLASSES[cls].paths[0].id;
  const kit = starterKit(cls, path);
  const h = buildCreature({ race, cls, path, data: GAME_DATA, id: 'hero', name: 'T', gadget: gadgetFor(cls)?.id });
  const w = h.weapon || {};
  console.log(cls.padEnd(11), 'hp', h.maxHp, 'kb', h.kb, 'wpn', w.name, w.dice, w.dmgType, 'rng', w.range, 'hit', w.hit, 'spd', h.speed,
    '| kit', kit?.weapon, kit?.armor, (kit?.belt || []).join(','), '| abil:', h.abilities.map((a) => `${a.id}(${a.cost},${a.effects?.map((e) => e.op + ':' + (e.dice || e.value || '')).join('/')},r${a.range},${a.target})`).join(' '));
}
console.log('--- attack stats');
for (const cls of CLASS_ORDER) {
  const race = PLAYABLE_RACES.find((r) => isAllowed(RACES[r], CLASSES[cls]));
  const h = buildCreature({ race, cls, path: CLASSES[cls].paths[0].id, data: GAME_DATA, id: 'hero', name: 'T', gadget: gadgetFor(cls)?.id });
  console.log(cls.padEnd(11), 'stats', JSON.stringify(h.stats), 'prof', h.prof, 'en', h.maxEnr ?? h.maxEnergy ?? h.energy, 'keys', Object.keys(h).filter((k) => /en|mp|mana|res|pool/i.test(k)).map((k) => k + '=' + JSON.stringify(h[k])).join(' ').slice(0, 200));
}
