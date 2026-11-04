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
//
// v3.1 item properties (docs/specs/items.md «Нужно от движка»). Weapon `props` are hoisted onto the weapon by
// normalizeWeapon (mods add `extra` / `enr`):
//   reach: true          — melee weapon hits 2 tiles away (weapon.melee = true, range REACH_RANGE)
//   thrown: N            — action { type: 'throw', target }: ranged attack up to N tiles, the weapon drops on a tile
//                          near the target (b.drops) and the owner picks it up by stepping on it; meanwhile — fists
//   arc: true            — no line of sight needed, target cover is ignored
//   area: { shape, size, save? } — no attack roll: everyone hostile in the area saves (default 'dex', DC 8 + prof +
//                          mod(weapon stat)), half on success; onHit / extra only on a failed save
//   charges: N           — shots per battle (unit.weaponCharges); 0 — weapon unusable
//   enr: N               — ENR per attack action (a burst pays once); units with max ENR 0 are self-powered
//   overheat: '1d6'      — natural 1 burns the shooter (fire); or { shots, turns?, dice? } — after `shots` shots
//                          the weapon is unusable for `turns` (1) own turns
//   extra: { dice, dmgType, only?, cond? } | [...] — extra damage on a hit (only — target tag, cond — condMatches)
//   onCrit: [op]         — ops on a critical hit (onHit ops with fromCrit are then ignored)
//   stigma: { faction: delta } — not for combat: creature.worldFlags { id: 'stigma', value, factions, source }
// armour: mech: { shield } — permanent shield at battle start (unit.mechShield); mech armour below MECH_MIN_TIER
//   gives the no-skill penalty (disadvantage on attacks); props.stigma as on weapons; passives / grants work for
//   armour and weapons.

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

/** Reach weapons (props.reach): melee at this distance. */
export const REACH_RANGE = 2;
/** Default range of a thrown melee weapon (props.thrown: true). */
export const THROWN_DEFAULT_RANGE = 4;
/** Mech armour needs this armour tier, else the no-skill penalty (spec items.md: «ступень 3 и выше, иначе помеха»). */
export const MECH_MIN_TIER = 3;
/** Props hoisted from weapon.props onto the weapon. */
export const WEAPON_PROP_KEYS = ['reach', 'thrown', 'arc', 'area', 'charges', 'enr', 'overheat', 'extra', 'stigma'];

/** No weapon / weapon thrown away. */
export const UNARMED = Object.freeze({ name: 'Кулак', dice: '1d2', dmgType: 'blunt', stat: 'str', range: 1, hit: 0 });

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
  const weapon = { ...(wItem || classWeapon || UNARMED) };
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
  for (const m of mods) {
    if ((m.target || 'weapon') !== 'weapon') continue;
    if (m.extra) weapon.extra = [...toList(weapon.extra ?? weapon.props?.extra), ...toList(m.extra)];
    if (m.enr) weapon.enr = (weapon.enr ?? weapon.props?.enr ?? 0) + m.enr;
  }
  if (weapon.recoil && weapon.recoil < 0) weapon.recoil = 0;
  normalizeWeapon(weapon);
  normalizeArmor(armor);
  return { weapon, armor, offhand: off ? { ...off } : null, mods: mods.map((m) => m.id) };
}

/** KB from armour (canon: 10 + armour KB + mod ЛВК, capped by armour type / dexCap). */
export function armorKb(armor, dex, tier) {
  const cap = armor.dexCap ?? ARMOR_DEX_CAP_BY_TYPE[armor.type || 'cloth'] ?? 99;
  let kb = 10 + (armor.kb || 0) + Math.min(fmod(dex), cap);
  if (tier >= 4 && (armor.type === 'heavy' || armor.type === 'mech')) kb += HEAVY_MASTERY_KB;
  return kb;
}

const toList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Hoist weapon.props (WEAPON_PROP_KEYS) onto the weapon in place: reach → melee + range REACH_RANGE, thrown: true →
 * THROWN_DEFAULT_RANGE, extra → array, onCrit kept. Fields already on the weapon win. Returns the weapon.
 */
export function normalizeWeapon(w) {
  if (!w) return w;
  const p = w.props || {};
  for (const k of WEAPON_PROP_KEYS) if (w[k] === undefined && p[k] !== undefined && p[k] !== null && p[k] !== false) w[k] = p[k];
  if (w.ap === undefined && p.ap) w.ap = p.ap;
  if (w.reach) { w.melee = true; w.range = Math.max(w.range || 1, REACH_RANGE); }
  if (w.thrown === true) w.thrown = THROWN_DEFAULT_RANGE;
  if (w.extra) w.extra = toList(w.extra);
  if (w.onCrit && !w.onCrit.length) delete w.onCrit;
  return w;
}

/** Armour: props.stigma → stigma, mech.shield → mechShield. In place. */
export function normalizeArmor(a) {
  if (!a) return a;
  if (a.stigma === undefined && a.props && a.props.stigma) a.stigma = a.props.stigma;
  if (a.mechShield === undefined && a.mech && a.mech.shield) a.mechShield = a.mech.shield;
  return a;
}

/**
 * Enemy weapons built by data (enemies-v3 weaponFrom keeps only `item`): copy item props the engine needs.
 * Returns a new weapon object (or the same if no item is known).
 */
export function enrichWeapon(items, w) {
  if (!w || !w.item || !items || !items[w.item]) return w;
  const it = items[w.item];
  const out = { ...w };
  if (out.props === undefined && it.props) out.props = it.props;
  if (out.onCrit === undefined && it.onCrit && it.onCrit.length) out.onCrit = it.onCrit;
  if (out.grants === undefined && it.grants && it.grants.length) out.grants = it.grants;
  return normalizeWeapon(out);
}

/** World flags from worn gear stigma: [{ id: 'stigma', value, factions: [faction], source: itemId }]. */
export function stigmaFlags(...gear) {
  const out = [];
  for (const g of gear) {
    const st = g && (g.stigma || (g.props && g.props.stigma));
    if (!st) continue;
    for (const [f, v] of Object.entries(st)) out.push({ id: 'stigma', value: v, factions: [f], source: g.id || g.name || null });
  }
  return out;
}
