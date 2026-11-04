// Equipment and proficiency tiers (canon rules/core-rules.md, rules 2–3 and 8). Pure; items are injected.
//
// Item schema (engine side; docs/specs/items.md may add fields):
//   weapon:  { id, name, slot: 'weapon', type, dice, dmgType, stat, range, hit?, dmg?, ap?, onHit?: [op], twoHanded?,
//              noise?, rof?, recoil? }   ap — ignores up to N of the target's armour KB; onHit — ops on a hit
//              (status ops may carry chance 0..1 and save: 'con' — DC 8 + prof + mod(weapon stat));
//              rof > 1 enables «Очередь» (rof shots, shot i needs KB + recoil × i).
//   armor:   { id, name, slot: 'armor', type: 'cloth'|'light'|'medium'|'heavy'|'mech', kb, dexCap?, stealthDis?, resist?, noise? }
//   offhand: { id, name, slot: 'offhand', kb?, passives? }  (shields; an off-hand weapon gives no extra attack in v3)
//   mod:     { id, name, slot: 'mod', target: 'weapon'|'armor', hit?, dmg?, ap?, rof?, recoil?, range?, noise?, onHit?, kb?, resist? }
//   consumable / grenade / trap: see combat.js useItem (ability-like: action, range, target, area, roll, save, effects, trap).

export const ARMOR_ORDER = ['cloth', 'light', 'medium', 'heavy', 'mech'];
export const ARMOR_DEX_CAP_BY_TYPE = { cloth: 99, light: 99, medium: 2, heavy: 0, mech: 0 };
/** Canon weapon types (melee / ranged). Data may use others; unknown types just default to tier 2. */
export const WEAPON_TYPES = [
  'sabre', 'polearm', 'fist', 'knife', 'sword', 'axe', 'hammer', 'katana', 'bastard', 'twoHanded',
  'pistol', 'smg', 'rifle', 'auto', 'mg', 'launcher', 'crossbow', 'bow', 'throw', 'bolter',
];
/** Proficiency tiers (canon): 1 none, 2 can use, 3 proficient, 4 mastery. */
export const TIERS = { none: 1, can: 2, proficient: 3, mastery: 4 };
/** Attack bonus by weapon-type tier (tier 1 also gives disadvantage). */
export const WEAPON_TIER_HIT = [0, 0, 0, 1, 2];
/** Damage bonus by damage-type tier («тип урона», canon rule 2): weapons and abilities of that type. */
export const DMG_TYPE_TIER_DMG = [0, 0, 0, 1, 2];
/** Armour mastery (tier 4): heavy/mech +1 KB; light +1 bonus action per turn; medium ignores stealth disadvantage. */
export const HEAVY_MASTERY_KB = 1;
export const LIGHT_MASTERY_BONUS_ACTIONS = 1;
/** Proficiency points for player choices on top of class defaults: 3 at level 1, +1 per level. */
export const profPoints = (level) => 2 + Math.max(1, level || 1);
/** Highest tier a player may buy at creation (mastery only for the class's own weapon type). */
export const CREATION_MAX_TIER = 3;

const fmod = (v) => Math.floor(((v ?? 10) - 10) / 2);

/** All items from data: ITEMS or WEAPONS / ARMOR / OFFHAND / MODS / CONSUMABLES / GRENADES / TRAPS. */
export function collectItems(d = {}) {
  const out = {};
  const add = (src) => {
    if (!src) return;
    const list = Array.isArray(src) ? src : Object.values(src);
    for (const it of list) if (it && it.id) out[it.id] = it;
  };
  for (const k of ['ITEMS', 'items', 'WEAPONS', 'weapons', 'ARMOR', 'armor', 'OFFHAND', 'offhand', 'MODS', 'mods',
    'CONSUMABLES', 'consumables', 'GRENADES', 'grenades', 'TRAPS', 'traps']) add(d[k]);
  return out;
}

export function resolveItem(items, ref, slot) {
  if (!ref) return null;
  const it = typeof ref === 'string' ? items[ref] : ref;
  if (!it) throw new Error(`equipment: unknown item "${ref}"`);
  if (slot && it.slot && it.slot !== slot) throw new Error(`equipment: item "${it.id}" is a ${it.slot}, not a ${slot}`);
  return it;
}

const armorIndex = (t) => Math.max(0, ARMOR_ORDER.indexOf(t || 'cloth'));

/**
 * Class defaults: own weapon type (if the class weapon has one) at 3, own damage type at 2, armour up to the class
 * armour type at 3, one step heavier at 2, heavier still at 1. cls.proficiencies / path.proficiencies override.
 */
export function defaultProficiencies(cls, pathDef = {}) {
  const w = pathDef.weapon || cls.weapon || {};
  const a = pathDef.armor || cls.armor || { type: 'cloth' };
  const out = { weaponTypes: {}, dmgTypes: {}, armor: {} };
  if (w.type) out.weaponTypes[w.type] = 3;
  if (w.dmgType) out.dmgTypes[w.dmgType] = 2;
  const ai = armorIndex(a.type);
  ARMOR_ORDER.forEach((t, i) => { out.armor[t] = i <= ai ? 3 : i === ai + 1 ? 2 : 1; });
  for (const src of [cls.proficiencies, pathDef.proficiencies]) {
    if (!src) continue;
    for (const k of ['weaponTypes', 'dmgTypes', 'armor']) Object.assign(out[k], src[k] || {});
  }
  return out;
}

export function mergeProficiencies(defaults, chosen) {
  const out = { weaponTypes: { ...defaults.weaponTypes }, dmgTypes: { ...defaults.dmgTypes }, armor: { ...defaults.armor } };
  if (chosen) for (const k of ['weaponTypes', 'dmgTypes', 'armor']) {
    for (const [t, v] of Object.entries(chosen[k] || {})) out[k][t] = Math.max(out[k][t] || 1, v);
  }
  return out;
}

/** Points spent by a player's choice over defaults: +1 per tier, the step to mastery (4) costs 2. */
export function proficiencyCost(defaults, chosen) {
  let cost = 0;
  if (!chosen) return 0;
  for (const k of ['weaponTypes', 'dmgTypes', 'armor']) {
    for (const [t, v] of Object.entries(chosen[k] || {})) {
      const from = defaults[k][t] || (k === 'armor' ? 1 : k === 'weaponTypes' ? 2 : 1);
      for (let tier = from + 1; tier <= v; tier++) cost += tier === 4 ? 2 : 1;
    }
  }
  return cost;
}

/** Weapon-type tier: weapons without a type are the class's own (tier 3); unknown types default to 2. */
export function weaponTierFor(prof, weapon) {
  if (!weapon || !weapon.type) return 3;
  return prof.weaponTypes[weapon.type] ?? 2;
}
export const armorTierFor = (prof, armor) => prof.armor[(armor && armor.type) || 'cloth'] ?? 1;
export const dmgTypeBonus = (prof, dmgType) => DMG_TYPE_TIER_DMG[prof.dmgTypes[dmgType] || 0] || 0;

/**
 * Apply equipment over class defaults. Returns { weapon, armor, offhand, mods } (plain copies).
 * Throws on unknown items, wrong slots and two-handed weapon + off-hand.
 */
export function applyEquipment(items, equipment, classWeapon, classArmor) {
  const eq = equipment || {};
  const wItem = resolveItem(items, eq.weapon, 'weapon');
  const aItem = resolveItem(items, eq.armor, 'armor');
  const off = resolveItem(items, eq.offhand, 'offhand');
  const mods = (eq.mods || []).map((m) => resolveItem(items, m, 'mod'));
  const weapon = { ...(wItem || classWeapon || { name: 'Кулак', dice: '1d2', dmgType: 'blunt', stat: 'str', range: 1, hit: 0 }) };
  const armor = { ...(aItem || classArmor || { type: 'cloth', kb: 0 }) };
  if (weapon.twoHanded && off) throw new Error(`equipment: two-handed "${weapon.id || weapon.name}" leaves no hand for "${off.id}"`);
  weapon.onHit = [...(weapon.onHit || [])];
  armor.resist = { ...(armor.resist || {}) };
  for (const m of mods) {
    if ((m.target || 'weapon') === 'weapon') {
      for (const k of ['hit', 'dmg', 'ap', 'rof', 'recoil', 'range', 'noise']) if (m[k]) weapon[k] = (weapon[k] || 0) + m[k];
      if (m.onHit) weapon.onHit.push(...m.onHit);
    } else {
      if (m.kb) armor.kb = (armor.kb || 0) + m.kb;
      if (m.noise) armor.noise = (armor.noise || 0) + m.noise;
      if (m.resist) Object.assign(armor.resist, m.resist);
      if (m.stealthDis === false) armor.stealthDis = false;
    }
  }
  if (weapon.recoil && weapon.recoil < 0) weapon.recoil = 0;
  return { weapon, armor, offhand: off ? { ...off } : null, mods: mods.map((m) => m.id) };
}

/** KB from armour (canon: 10 + armour KB + mod ЛВК, capped by armour type / dexCap). */
export function armorKb(armor, dex, tier) {
  const cap = armor.dexCap ?? ARMOR_DEX_CAP_BY_TYPE[armor.type || 'cloth'] ?? 99;
  let kb = 10 + (armor.kb || 0) + Math.min(fmod(dex), cap);
  if (tier >= 4 && (armor.type === 'heavy' || armor.type === 'mech')) kb += HEAVY_MASTERY_KB;
  return kb;
}
