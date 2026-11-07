// Character building: heroes from race + class + level, enemies from enemies.js defs.
// Pure data in, plain objects out. Data is injected (never imported) so the same code
// runs in the browser and in Node balance sims.

import {
  collectItems, applyEquipment, defaultProficiencies, mergeProficiencies, weaponTierFor, armorTierFor,
  armorKb, DMG_TYPE_TIER_DMG, LIGHT_MASTERY_BONUS_ACTIONS, MECH_MIN_TIER, enrichWeapon, normalizeArmor, stigmaFlags,
} from './equipment.js';

export const STATS = ['str', 'dex', 'con', 'int', 'wil', 'cha', 'per'];
export const ARMOR_DEX_CAP = { cloth: 99, light: 99, medium: 2, heavy: 0 };
/** Weapon proficiency tiers (canon): 1 no skill -> disadvantage, 2 +0, 3 +1, 4 +2. */
export const TIER_BONUS = [0, 0, 0, 1, 2];
export const START_WEAPON_TIER = 3;

export const mod = (v) => Math.floor(((v ?? 10) - 10) / 2);
/** Proficiency bonus (docs/specs/levels-20.md): +2 on 1–4, +3 on 5–8, +4 on 9–12, +5 on 13–16, +6 on 17–20. */
export const profBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, level || 1)) - 1) / 4);
/** Ability score improvements (levels-20.md): default levels, cap of a stat after ASI. */
export const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19];
export const ASI_STAT_MAX = 20;
export const asiLevelsFor = (cls) => (cls && Array.isArray(cls.asiLevels) ? cls.asiLevels : DEFAULT_ASI_LEVELS);

/**
 * Accepts data with either lower-case or upper-case keys (RACES / races ...).
 * Returns { races, classes, statuses, enemies, summons, encounters, veilTable, proxyStormTable }.
 */
export function normalizeData(d = {}) {
  if (d.__normalized) return d;
  const classes = d.classes || d.CLASSES || {};
  return {
    __normalized: true,
    races: d.races || d.RACES || {},
    classes: Array.isArray(classes) ? Object.fromEntries(classes.map((c) => [c.id, c])) : classes,
    statuses: d.statuses || d.STATUSES || {},
    enemies: d.enemies || d.ENEMIES || {},
    summons: d.summons || d.SUMMONS || {},
    encounters: d.encounters || d.ENCOUNTERS || {},
    veilTable: d.veilTable || d.VEIL_TABLE || null,
    proxyStormTable: d.proxyStormTable || d.PROXY_STORM_TABLE || null,
    talents: d.talents || d.TALENTS || {},
    gadgets: d.gadgets || d.GADGETS || {},
    combatTalentLimit: d.combatTalentLimit || d.COMBAT_TALENT_LIMIT || defaultCombatTalentLimit,
    specializations: d.specializations || d.SPECIALIZATIONS || null,
    skills: d.skills || d.SKILLS || null,
    items: collectItems(d),
    multiclass: d.multiclass || d.MULTICLASS || [],
  };
}

/** Fallback for data.COMBAT_TALENT_LIMIT (levels-20.md): 2 on 1–3, 3 on 4–7, 4 on 8–12, 5 on 13+. */
export const defaultCombatTalentLimit = (level) => (level >= 13 ? 5 : level >= 8 ? 4 : level >= 4 ? 3 : 2);
export const isCombatTalent = (t) => !!t && t.kind !== 'world';

const ROLE_TO_AI = { tank: 'melee', melee: 'melee', ranged: 'ranged', caster: 'caster', control: 'caster', support: 'support' };

let autoId = 0;
const nextId = (prefix) => `${prefix}${++autoId}`;

function mergeResist(into, src) {
  if (!src) return into;
  for (const k in src) {
    const v = src[k];
    const cur = into[k];
    if (cur === 'immune' || v === 'immune') into[k] = 'immune';
    else if (!cur) into[k] = v;
    else if (cur !== v) delete into[k]; // resist + vuln cancel out
  }
  return into;
}

function passiveApplies(p, level, path) {
  if (p.level && p.level > level) return false;
  if (p.path && path && p.path !== path) return false;
  return true;
}

/** Fold passive ops into a summary used by combat. */
function collectPassives(list) {
  const out = {
    statBonus: {}, resist: {}, kb: 0, hit: 0, dmg: { melee: 0, ranged: 0, spell: 0, all: 0 },
    init: 0, speed: 0, regen: [], immuneStatus: [], critRange: 20, advantage: [], deathSave: 0,
    maxHp: 0, maxMrl: 0, maxEnr: 0, cond: [], thorns: [],
  };
  for (const p of list) {
    const op = p.op || {};
    if (op.cond) {
      // conditional bonus (v2): { cond: 'targetWounded', hit?, dmg? } — applied by combat per attack
      out.cond.push({ cond: op.cond, hit: op.hit || 0, dmg: typeof op.dmg === 'number' ? op.dmg : 0, source: p.id || null });
      continue;
    }
    if (op.maxHp) out.maxHp += op.maxHp;
    if (op.maxMrl) out.maxMrl += op.maxMrl;
    if (op.maxEnr) out.maxEnr += op.maxEnr;
    if (op.thorns) out.thorns.push(op.thorns);
    if (op.statBonus) for (const k in op.statBonus) out.statBonus[k] = (out.statBonus[k] || 0) + op.statBonus[k];
    if (op.resist) mergeResist(out.resist, op.resist);
    if (op.kb) out.kb += op.kb;
    if (op.hit) out.hit += op.hit;
    if (op.dmg) {
      if (typeof op.dmg === 'number') out.dmg.all += op.dmg;
      else for (const k in op.dmg) out.dmg[k] = (out.dmg[k] || 0) + op.dmg[k];
    }
    if (op.init) out.init += op.init;
    if (op.speed) out.speed += op.speed;
    if (op.regen) out.regen.push(op.regen);
    if (op.immuneStatus) out.immuneStatus.push(...op.immuneStatus);
    if (op.critRange) out.critRange = Math.min(out.critRange, op.critRange);
    if (op.advantage) out.advantage.push(...op.advantage);
    if (op.deathSave) out.deathSave += op.deathSave;
  }
  return out;
}

function abilityAvailable(a, level, path) {
  if (a.todo) return false;
  if ((a.level || 1) > level) return false;
  if (a.path && a.path !== path) return false;
  return true;
}

/** Fields every combat unit has (heroes, enemies, summons). Battle state is added by combat.js. */
function baseUnit() {
  return {
    id: null, name: '', kind: 'hero', team: 'heroes', control: 'player', ai: 'melee',
    raceId: null, classId: null, enemyId: null, level: 1, path: null,
    tags: [], stats: {}, prof: 2,
    maxHp: 1, hp: 1, maxMrl: 0, mrl: 0, maxEnr: 0, enr: 0,
    armorType: 'cloth', armorKb: 0, kb: 10, kbBonus: 0, speed: 6, initBonus: 0,
    weapon: null, weaponTier: START_WEAPON_TIER,
    castStat: null, saves: [], resist: {}, immuneStatus: [],
    abilities: [], passives: [], hitBonus: 0, dmgBonus: { melee: 0, ranged: 0, spell: 0, all: 0 },
    critRange: 20, advantages: [], deathSaves: 0, regen: [], overcast: null,
    condBonuses: [], thorns: [], talents: [], activeTalents: [], gadget: null, worldFlags: [], skillMods: {}, build: null,
  };
}

/**
 * buildCreature({ race, cls, level, stats, path, team, data, id, name, anyStat, weaponTier })
 * race / cls may be objects or ids (resolved through data.races / data.classes).
 * stats — values BEFORE racial bonuses (defaults to cls.recommended). Racial `any: N`
 * goes to `anyStat` or, by default, to the class main stat (castStat, else weapon stat).
 */
/**
 * Resolve talents + gadget for a hero (docs/specs/talents.md). Returns { passives, abilities, world, active }.
 * Combat talents (kind !== 'world') are active up to COMBAT_TALENT_LIMIT(level): `activeCombat` lists them
 * explicitly, otherwise the first combat talents of `talents` are taken. Exceeding the limit throws.
 * World effects of every owned talent always apply. The gadget is always active (no limit).
 */
export function resolveTalents(D, { talents = [], activeCombat, gadget, level }) {
  const owned = [];
  for (const tid of talents) {
    const t = D.talents[tid];
    if (!t) throw new Error(`buildCreature: unknown talent "${tid}"`);
    owned.push(t);
  }
  const combat = owned.filter(isCombatTalent);
  const limit = D.combatTalentLimit(level);
  let active;
  if (activeCombat) {
    for (const tid of activeCombat) {
      if (!talents.includes(tid)) throw new Error(`buildCreature: active talent "${tid}" is not owned`);
      if (!isCombatTalent(D.talents[tid])) throw new Error(`buildCreature: talent "${tid}" is not a combat talent`);
    }
    active = activeCombat.map((tid) => D.talents[tid]);
    if (active.length > limit) {
      throw new Error(`buildCreature: ${active.length} active combat talents, limit at level ${level} is ${limit} (COMBAT_TALENT_LIMIT)`);
    }
  } else {
    if (combat.length > limit) {
      throw new Error(`buildCreature: ${combat.length} combat talents, limit at level ${level} is ${limit} (COMBAT_TALENT_LIMIT); pass activeCombat`);
    }
    active = combat;
  }
  for (const t of active) {
    if (t.req && t.req.level && t.req.level > level) throw new Error(`buildCreature: talent "${t.id}" requires level ${t.req.level}`);
  }
  const sources = [...active];
  let g = null;
  if (gadget) {
    g = D.gadgets[gadget];
    if (!g) throw new Error(`buildCreature: unknown gadget "${gadget}"`);
    sources.push(g);
  }
  const passives = [];
  const abilities = [];
  for (const t of sources) {
    for (const p of t.passives || []) passives.push({ id: p.id || t.id, name: p.name || t.name, desc: p.desc || t.desc, ...p, talent: t.id });
    for (const a of t.abilities || []) if (!a.todo) abilities.push({ ...a, talent: t.id });
  }
  const world = [];
  for (const t of g ? [...owned, g] : owned) for (const w of t.world || []) world.push({ ...w, source: t.id, sourceName: t.name });
  return { passives, abilities, world, active: active.map((t) => t.id), gadget: g ? g.id : null };
}

/** Split world effects into { worldFlags: [...], skillMods: { skill: { bonus, adv, sources } } }. */
function worldEffects(world) {
  const worldFlags = [];
  const skillMods = {};
  for (const w of world) {
    if (w.worldFlag) worldFlags.push({ id: w.worldFlag, value: w.value ?? null, factions: w.factions || null, source: w.source });
    if (w.check) {
      const m = skillMods[w.check] || (skillMods[w.check] = { bonus: 0, adv: false, sources: [] });
      if (w.bonus) m.bonus += w.bonus;
      if (w.adv) m.adv = true;
      m.sources.push({ id: w.source, name: w.sourceName, bonus: w.bonus || 0, adv: !!w.adv });
    }
  }
  return { worldFlags, skillMods };
}

/** Multiclass (canon extra/multiclass.md, engine proposal): from level 3, second class abilities up to level − 2. */
export const MULTICLASS_MIN_LEVEL = 3;
export const multiclassLevel = (level) => Math.max(1, level - 2);

/** Abilities granted by a multiclass choice: second class (level − 2, own path or common) + data.MULTICLASS pool. */
export function multiclassAbilities(D, mainCls, mc, level) {
  if (!mc) return [];
  const cls2 = typeof mc.cls === 'string' ? D.classes[mc.cls] : mc.cls;
  if (!cls2) throw new Error(`buildCreature: unknown multiclass "${mc.cls}"`);
  if (level < MULTICLASS_MIN_LEVEL) throw new Error(`buildCreature: multiclass needs level ${MULTICLASS_MIN_LEVEL}`);
  if (cls2.id === mainCls.id) throw new Error('buildCreature: multiclass must be a different class');
  const lv2 = multiclassLevel(level);
  const out = (cls2.abilities || []).filter((a) => !a.todo && (a.level || 1) <= lv2 && (!a.path || a.path === mc.path))
    .map((a) => ({ ...a, multiclass: cls2.id, castStat: a.castStat || cls2.castStat || null }));
  for (const combo of D.multiclass || []) {
    const [A, B] = combo.pair || [];
    const ok = A && B && ((A.includes(mainCls.id) && B.includes(cls2.id)) || (B.includes(mainCls.id) && A.includes(cls2.id)));
    if (!ok || (combo.level && combo.level > level)) continue;
    for (const a of combo.abilities || []) if (!a.todo) out.push({ ...a, multiclass: combo.id });
  }
  return out;
}

/** Main stat of a class/path: cast stat for caster roles, else the weapon stat (same rule as racial `any`). */
export function mainStatOf(cls, pathDef = {}, weaponDef = null) {
  const role = pathDef.role || cls.role;
  const casterRole = role === 'caster' || role === 'support' || role === 'control';
  const w = weaponDef || pathDef.weapon || cls.weapon;
  return (casterRole && cls.castStat) || (w && w.stat) || cls.castStat || 'str';
}

/**
 * Automatic ASI choices (companions): +2 to the main stat on every ASI level ≤ level; when the main stat
 * would exceed ASI_STAT_MAX the rest goes to CON, then DEX. `st` — stats after racial bonuses.
 */
export function autoAsi(cls, level, st, main) {
  const cur = { ...st };
  const out = [];
  for (const lv of asiLevelsFor(cls)) {
    if (lv > level) continue;
    const stats = {};
    let left = 2;
    for (const k of [main, 'con', 'dex', 'wil']) {
      const n = Math.min(left, Math.max(0, ASI_STAT_MAX - (cur[k] ?? 10)));
      if (n > 0) { stats[k] = (stats[k] || 0) + n; cur[k] = (cur[k] ?? 10) + n; left -= n; }
      if (!left) break;
    }
    out.push({ level: lv, stats, auto: true });
  }
  return out;
}

/**
 * Apply ASI entries (level ≤ hero level) to stats after racial bonuses, capping at ASI_STAT_MAX.
 * Returns { talents: [ids from talent choices], overflow: [stats that hit the cap] }.
 */
export function applyAsi(st, asi, level) {
  const talents = [];
  const overflow = [];
  for (const e of asi || []) {
    if (!e || (e.level || 0) > level) continue;
    if (e.talent) { talents.push(e.talent); continue; }
    for (const [k, v] of Object.entries(e.stats || {})) {
      if (!(k in st)) continue;
      const nv = st[k] + (Number(v) || 0);
      if (nv > ASI_STAT_MAX) overflow.push(k);
      st[k] = Math.min(ASI_STAT_MAX, nv);
    }
  }
  return { talents, overflow };
}

/** '+1' / '-2' strings (and negative numbers for cost) are deltas, plain numbers replace. */
function upValue(cur, v, negIsDelta = false) {
  if (typeof v === 'string' && /^[+-]\d+$/.test(v)) return Math.max(0, (cur || 0) + Number(v));
  if (negIsDelta && typeof v === 'number' && v < 0) return Math.max(0, (cur || 0) + v);
  return v;
}

/**
 * Upgrades (levels-20.md): `cls.upgrades` / `path.upgrades` = [{ level, ability, path?, changes }] with
 * level ≤ hero level are applied in level order to a copy of the ability. changes are NEW VALUES (not deltas):
 *   dice  — dice of the first effect with dice or a `weapon` op (for a `weapon` op it is its `extraDice`);
 *           `effect: i` picks the effect;
 *   bonus — new `bonus` of that effect (a number, 'castMod', or an array summed by combat.bonusValue);
 *           no dice effect → new `value` of the first `mark` op;
 *   cost, usesPerBattle — new value (tolerated deltas: '+N' / '-N' strings, a negative cost);
 *   area  — number = new area.size, object = merged into area;
 *   anything else (range, turns, …) — replaces the ability field.
 * The ability gets `upgrades: [levels]` (for the character sheet).
 */
export function applyUpgrades(abilities, upgrades, level, path) {
  const list = (upgrades || []).filter((g) => g && g.ability && (g.level || 1) <= level && (!g.path || g.path === path))
    .sort((a, b) => (a.level || 1) - (b.level || 1));
  if (!list.length) return abilities;
  return abilities.map((a0) => {
    const mine = list.filter((g) => g.ability === a0.id);
    if (!mine.length) return a0;
    const a = { ...a0, effects: (a0.effects || []).map((e) => ({ ...e })), upgrades: [] };
    for (const g of mine) {
      const ch = g.changes || {};
      for (const [k, v] of Object.entries(ch)) {
        if (k === 'effect') continue;
        if (k === 'dice' || k === 'bonus') {
          const withDice = (e) => e.dice || e.extraDice || e.op === 'weapon';
          let idx = ch.effect != null ? ch.effect : a.effects.findIndex(withDice);
          if (idx < 0 && k === 'bonus') idx = a.effects.findIndex((e) => e.op === 'mark');
          const e = a.effects[idx];
          if (!e) continue;
          if (k === 'dice') { if (e.op === 'weapon') e.extraDice = v; else e.dice = v; }
          else if (e.op === 'mark') e.value = v;
          else e.bonus = v;
        } else if (k === 'cost') a.cost = upValue(a.cost, v, true);
        else if (k === 'usesPerBattle') a.usesPerBattle = upValue(a.usesPerBattle, v);
        else if (k === 'area') a.area = typeof v === 'number' ? { ...(a.area || {}), size: v } : { ...(a.area || {}), ...v };
        else a[k] = v;
      }
      a.upgrades.push(g.level || 1);
    }
    return a;
  });
}

export function buildCreature({ race, cls, level = 1, stats, path, team = 'heroes', data, id, name, anyStat, weaponTier, talents = [], activeCombat, gadget,
  equipment, proficiencies, skills, phobia, multiclass, inventory, asi } = {}) {
  const D = data ? normalizeData(data) : null;
  if (typeof race === 'string') race = D?.races[race];
  if (typeof cls === 'string') cls = D?.classes[cls];
  if (!race) throw new Error('buildCreature: unknown race');
  if (!cls) throw new Error('buildCreature: unknown class');
  if (!path) path = cls.paths && cls.paths.length ? cls.paths[0].id : null;
  if (!isAllowed(race, cls)) throw new Error(`buildCreature: race "${race.id}" is not allowed for class "${cls.id}"`);
  const pathDef = (cls.paths || []).find((p) => p.id === path) || {};
  const role = pathDef.role || cls.role;
  const ND = D || normalizeData({});
  const EQ = applyEquipment(ND.items, equipment, pathDef.weapon || cls.weapon, pathDef.armor || cls.armor);
  const weaponDef = EQ.weapon;
  const armorDef = EQ.armor;
  const prof = mergeProficiencies(defaultProficiencies(cls, pathDef), proficiencies);

  // ASI talent choices count as owned talents (deduplicated)
  const asiList = Array.isArray(asi) ? asi : [];
  const ownTalents = [...talents];
  for (const e of asiList) if (e && e.talent && (e.level || 0) <= level && !ownTalents.includes(e.talent)) ownTalents.push(e.talent);
  const TL = ownTalents.length || gadget ? resolveTalents(D || normalizeData({}), { talents: ownTalents, activeCombat, gadget, level }) : null;
  const passives = [...(race.passives || []), ...(cls.passives || []), ...(TL ? TL.passives : []), ...((EQ.offhand && EQ.offhand.passives) || []),
    ...(weaponDef.passives || []), ...(armorDef.passives || [])]
    .filter((p) => passiveApplies(p, level, path));
  const P = collectPassives(passives);

  const base = { ...(stats || pathDef.recommended || cls.recommended || {}) };
  const st = {};
  for (const k of STATS) st[k] = base[k] ?? 8;
  const rb = race.statBonus || {};
  for (const k in rb) {
    if (k === 'any') {
      const casterRole = role === 'caster' || role === 'support' || role === 'control';
      const target = anyStat || (casterRole && cls.castStat) || weaponDef?.stat || cls.castStat || 'str';
      st[target] += rb.any;
    } else if (k in st) st[k] += rb[k];
  }
  // ASI (levels-20.md): after racial bonuses, before passive stat bonuses; 'auto' — companions (main stat)
  const asiApplied = asi === 'auto' ? autoAsi(cls, level, st, mainStatOf(cls, pathDef, weaponDef)) : asiList;
  const AS = applyAsi(st, asiApplied, level);
  for (const k in P.statBonus) if (k in st) st[k] += P.statBonus[k];

  const u = baseUnit();
  u.id = id || nextId('h');
  u.name = name || `${cls.name || cls.id}`;
  u.kind = 'hero';
  u.team = team;
  u.ai = ROLE_TO_AI[role] || 'melee';
  u.role = role || null;
  u.raceId = race.id;
  u.classId = cls.id;
  u.level = level;
  u.path = path;
  u.tags = [...(race.tags || ['organic'])];
  u.stats = st;
  u.prof = profBonus(level);

  u.maxHp = 10 + st.con + 5 * level + (race.hpBonus || 0) + (cls.hpPerLevel || 0) * level + P.maxHp;
  u.maxMrl = 10 + 2 * st.wil + level + (race.mrlBonus || 0) + P.maxMrl;
  u.maxEnr = 5 + st.int + 3 * level + (race.enrBonus || 0) + P.maxEnr;
  u.hp = u.maxHp;
  u.mrl = u.maxMrl;
  u.enr = u.maxEnr;

  const armor = armorDef;
  u.armorType = armor.type || 'cloth';
  u.armorKb = armor.kb || 0;
  u.armorTier = armorTierFor(prof, armor);
  const offKb = (EQ.offhand && EQ.offhand.kb) || 0;
  u.kbBonus = P.kb + offKb;
  u.kb = armorKb(armor, st.dex, u.armorTier) + P.kb + offKb;
  // no skill: disadvantage on attack rolls and stealth; mech armour needs MECH_MIN_TIER
  u.armorPenalty = u.armorTier <= 1 || (u.armorType === 'mech' && u.armorTier < MECH_MIN_TIER);
  u.mechShield = armor.mechShield || 0;
  u.extraBonusActions = u.armorType === 'light' && u.armorTier >= 4 ? LIGHT_MASTERY_BONUS_ACTIONS : 0;
  u.stealthDis = u.armorPenalty || (!!armor.stealthDis && !(u.armorType === 'medium' && u.armorTier >= 4));
  u.noise = (armor.noise || 0) + (weaponDef.noise || 0) + (race.noise || 0);

  u.speed = (race.speed ?? 6) + P.speed;
  u.initBonus = P.init;
  u.weapon = { ...weaponDef };
  u.weaponTier = weaponTier || weaponTierFor(prof, weaponDef);
  u.proficiencies = prof;
  u.dmgTypeBonus = {};
  for (const [t, tier] of Object.entries(prof.dmgTypes)) if (DMG_TYPE_TIER_DMG[tier]) u.dmgTypeBonus[t] = DMG_TYPE_TIER_DMG[tier];
  u.equipment = { weapon: weaponDef.id || null, armor: armor.id || null, offhand: EQ.offhand ? EQ.offhand.id : null, mods: EQ.mods };
  u.castStat = cls.castStat || null;
  u.saves = [...(cls.saves || [])];
  u.resist = mergeResist(mergeResist(mergeResist({}, race.resist), P.resist), armor.resist);
  u.immuneStatus = [...(race.immuneStatus || []), ...P.immuneStatus];
  u.abilities = applyUpgrades([...(race.abilities || []), ...(cls.abilities || []), ...(TL ? TL.abilities : [])].filter((a) => abilityAvailable(a, level, path)),
    [...(cls.upgrades || []), ...(pathDef.upgrades || [])], level, path);
  for (const a of [...(weaponDef.grants || []), ...(armorDef.grants || [])]) if (!u.abilities.some((x) => x.id === a.id)) u.abilities.push(a);
  for (const a of multiclassAbilities(ND, cls, multiclass, level)) if (!u.abilities.some((x) => x.id === a.id)) u.abilities.push(a);
  u.multiclass = multiclass ? { cls: typeof multiclass.cls === 'string' ? multiclass.cls : multiclass.cls.id, path: multiclass.path || null } : null;
  u.passives = passives;
  u.hitBonus = P.hit;
  u.dmgBonus = P.dmg;
  u.critRange = P.critRange;
  u.advantages = P.advantage;
  u.deathSaves = P.deathSave;
  u.regen = P.regen;
  u.overcast = cls.overcast || null;
  u.soulless = !!race.soulless;
  u.condBonuses = P.cond;
  u.thorns = P.thorns;
  u.talents = ownTalents;
  u.asi = asiApplied.filter((e) => e && (e.level || 0) <= level).map((e) => ({ ...e }));
  u.asiOverflow = AS.overflow;
  u.activeTalents = TL ? TL.active : [];
  u.gadget = TL ? TL.gadget : null;
  const W = worldEffects(TL ? TL.world : []);
  // not applied by the engine: world systems read them (talents + gear stigma)
  u.worldFlags = [...W.worldFlags, ...stigmaFlags(weaponDef, armorDef, EQ.offhand)];
  u.skillMods = W.skillMods;
  u.skillPicks = skills ? { base: [...(skills.base || [])], extra: [...(skills.extra || [])] } : null;
  u.phobias = phobia ? (Array.isArray(phobia) ? phobia : [phobia]).map((p) => ({ ...p })) : [];
  u.inventory = { ...(inventory || {}) };
  // everything needed to rebuild the hero on another level (progression.js)
  u.build = { race: race.id, cls: cls.id, path, stats: { ...base }, anyStat: anyStat || null, talents: [...talents],
    activeCombat: activeCombat ? [...activeCombat] : null, gadget: gadget || null, name: name || null, id: u.id,
    equipment: equipment || null, proficiencies: proficiencies || null, skills: skills || null, phobia: phobia || null,
    multiclass: multiclass || null, inventory: inventory || null, asi: asi === 'auto' ? 'auto' : asiList.map((e) => ({ ...e })) };
  return u;
}

/**
 * buildEnemy(def | id, { id, team, data, level }) — enemies/summons from enemies.js (ready numbers).
 * Attack bonus = mod(weapon stat) + prof + weapon.hit (or def.attackBonus if given).
 */
export function buildEnemy(def, { id, team = 'enemies', data, level, kind = 'enemy' } = {}) {
  if (typeof def === 'string') {
    const D = normalizeData(data);
    def = D.enemies[def] || D.summons[def];
    if (!def) throw new Error('buildEnemy: unknown enemy');
  }
  const items = data ? normalizeData(data).items : null;
  const u = baseUnit();
  const st = {};
  for (const k of STATS) st[k] = def.stats?.[k] ?? 10;
  const P = collectPassives(def.passives || []);
  u.id = id || nextId(kind === 'summon' ? 's' : 'e');
  u.name = def.name || def.id;
  u.kind = kind;
  u.team = team;
  u.control = 'ai';
  u.ai = def.ai || 'melee';
  u.enemyId = def.id;
  u.level = level || def.level || 1;
  u.tags = [...(def.tags || ['organic'])];
  u.stats = st;
  u.prof = def.prof ?? profBonus(u.level);
  u.maxHp = u.hp = def.hp ?? 10;
  u.maxMrl = u.mrl = def.mrl ?? 0;
  u.maxEnr = u.enr = def.enr ?? 0;
  u.kb = (def.kb ?? 10) + P.kb;
  u.armorType = def.armorType || 'light';
  u.armorKb = def.armorKb ?? Math.max(0, (def.kb ?? 10) - 10 - mod(st.dex));
  u.speed = (def.speed ?? 6) + P.speed;
  u.initBonus = (def.init || 0) + P.init;
  u.weapon = def.weapon ? enrichWeapon(items, { ...def.weapon }) : null;
  u.weaponTier = 3;
  const gearArmor = items && def.gear && def.gear.armor ? items[def.gear.armor] : null;
  u.mechShield = def.mechShield ?? (gearArmor ? normalizeArmor({ ...gearArmor }).mechShield || 0 : 0);
  u.attackBonus = def.attackBonus ?? def.weapon?.attack ?? null;
  u.castStat = def.castStat || (['int', 'wil', 'cha'].reduce((a, b) => (st[b] > st[a] ? b : a), 'int'));
  u.dcOverride = def.dc ?? null;
  u.saves = [...(def.saves || [])];
  u.resist = mergeResist(mergeResist({}, def.resist), P.resist);
  u.immuneStatus = [...(def.immuneStatus || []), ...P.immuneStatus];
  u.abilities = (def.abilities || []).filter((a) => !a.todo);
  u.passives = def.passives || [];
  u.hitBonus = P.hit;
  u.dmgBonus = P.dmg;
  u.critRange = P.critRange;
  u.advantages = P.advantage;
  u.deathSaves = P.deathSave;
  u.regen = P.regen;
  u.noAttack = !!def.noAttack || !def.weapon;
  u.condBonuses = P.cond;
  u.thorns = P.thorns;
  u.maxHp += P.maxHp; u.hp = u.maxHp;
  u.decoy = !!def.decoy;
  u.boss = !!def.boss;
  u.defaultTurns = def.defaultTurns ?? null;
  u.soulless = !!def.soulless;
  u.xp = def.xp ?? null; // null → progression.enemyXpForLevel(level)
  return u;
}

/** Class restriction by lore: cls.allowedRaces null = any race. */
export function isAllowed(race, cls) {
  const id = typeof race === 'string' ? race : race?.id;
  return !cls.allowedRaces || cls.allowedRaces.includes(id);
}

/** Point-buy cost of a stat layout (27 by canon). 9–13: 1/pt, 14–15: 2/pt. */
export function pointBuyCost(stats) {
  let total = 0;
  for (const k of STATS) {
    const v = stats[k] ?? 8;
    for (let x = 9; x <= v; x++) total += x >= 14 ? 2 : 1;
  }
  return total;
}
