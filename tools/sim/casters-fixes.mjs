// Candidate patches for docs/BALANCE-casters-start.md (applied in memory by casters-start.mjs --fix a,b).
// Every fix mutates the loaded class data (the sim builds the hero from class weapon / armor / hpPerLevel).
const setW = (id, dice, hit) => ({ CLASSES }) => { CLASSES[id].weapon = { ...CLASSES[id].weapon, dice, hit: hit ?? CLASSES[id].weapon.hit }; };
export const FIXES = {
  // weapon dice of the starting caster weapons
  'pistol-d6': setW('technomant', '1d6'),
  'nail-d8': setW('itishnik', '1d8'),
  'nail-d6hit1': setW('itishnik', '1d6', 1),
  'sickle-d8': setW('ecolog', '1d8'),
  'mic-d8': setW('reper', '1d8'),
  'blade-d8': setW('cybertech', '1d8'),
  // hp / kb
  'itish-hp': ({ CLASSES }) => { CLASSES.itishnik.hpPerLevel = 3; },
  'itish-kb': ({ CLASSES }) => { CLASSES.itishnik.armor = { ...CLASSES.itishnik.armor, kb: 3 }; },
  'techno-kb': ({ CLASSES }) => { CLASSES.technomant.armor = { ...CLASSES.technomant.armor, kb: CLASSES.technomant.armor.kb + 1 }; },
  // Q = offensive / summon ability
  'itish-q-turret': ({ CLASSES }) => { const a = CLASSES.itishnik.abilities; const i = a.findIndex((x) => x.id === 'deploy-turret'); a.unshift(...a.splice(i, 1)); },
};
FIXES['nail-d8hit1'] = setW('itishnik', '1d8', 1);
FIXES['itish-hp5'] = ({ CLASSES }) => { CLASSES.itishnik.hpPerLevel = 5; };
FIXES['itish-kb4'] = ({ CLASSES }) => { CLASSES.itishnik.armor = { ...CLASSES.itishnik.armor, kb: 4 }; };
FIXES['pistol-d6hit1'] = setW('technomant', '1d6', 1);
FIXES['pistol-d8'] = setW('technomant', '1d8');
// level-1 class passives (no item / engine change): the proposed form
const pas = (cls, op) => ({ CLASSES }) => { (CLASSES[cls].passives ||= []).push({ id: 'starter-grit', name: 'Стартовая закалка', level: 1, path: null, desc: 'sim', op }); };
FIXES['p-itish'] = pas('itishnik', { hit: 1, dmg: { ranged: 1 }, kb: 1, maxHp: 3 });
FIXES['p-techno1'] = pas('technomant', { hit: 1, dmg: { ranged: 1 } });
FIXES['p-techno2'] = pas('technomant', { hit: 1, dmg: { ranged: 2 } });
FIXES['p-techno3'] = pas('technomant', { hit: 1, dmg: { ranged: 1 }, maxHp: 3 });
FIXES['p-melee1'] = (c) => { for (const k of ['reper', 'cybertech', 'ecolog']) pas(k, { hit: 1, dmg: { melee: 1 } })(c); };
FIXES['p-melee2'] = (c) => { for (const k of ['reper', 'cybertech', 'ecolog']) pas(k, { dmg: { melee: 1 } })(c); };
// proposed set (docs/BALANCE-casters-start.md)
FIXES['proposed'] = (c) => {
  pas('itishnik', { hit: 1, dmg: { ranged: 2 }, kb: 1, maxHp: 3 })(c);
  pas('technomant', { hit: 1, dmg: { ranged: 2 } })(c);
  for (const k of ['reper', 'cybertech', 'ecolog']) pas(k, { hit: 1, dmg: { melee: 1 } })(c);
  FIXES['itish-q-turret'](c);
};
FIXES['proposed-noq'] = (c) => { FIXES.proposed(c); };
