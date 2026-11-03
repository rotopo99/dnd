// Character building: heroes from race + class + level, enemies from enemies.js defs.
// Pure data in, plain objects out. Data is injected (never imported) so the same code
// runs in the browser and in Node balance sims.

export const STATS = ['str', 'dex', 'con', 'int', 'wil', 'cha', 'per'];
export const ARMOR_DEX_CAP = { cloth: 99, light: 99, medium: 2, heavy: 0 };
/** Weapon proficiency tiers (canon): 1 no skill -> disadvantage, 2 +0, 3 +1, 4 +2. */
export const TIER_BONUS = [0, 0, 0, 1, 2];
export const START_WEAPON_TIER = 3;

export const mod = (v) => Math.floor(((v ?? 10) - 10) / 2);
export const profBonus = (level) => (level >= 5 ? 3 : 2);

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
  };
}

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
  };
  for (const p of list) {
    const op = p.op || {};
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
  };
}

/**
 * buildCreature({ race, cls, level, stats, path, team, data, id, name, anyStat, weaponTier })
 * race / cls may be objects or ids (resolved through data.races / data.classes).
 * stats — values BEFORE racial bonuses (defaults to cls.recommended). Racial `any: N`
 * goes to `anyStat` or, by default, to the class main stat (castStat, else weapon stat).
 */
export function buildCreature({ race, cls, level = 1, stats, path, team = 'heroes', data, id, name, anyStat, weaponTier } = {}) {
  const D = data ? normalizeData(data) : null;
  if (typeof race === 'string') race = D?.races[race];
  if (typeof cls === 'string') cls = D?.classes[cls];
  if (!race) throw new Error('buildCreature: unknown race');
  if (!cls) throw new Error('buildCreature: unknown class');
  if (!path) path = cls.paths && cls.paths.length ? cls.paths[0].id : null;

  const passives = [...(race.passives || []), ...(cls.passives || [])].filter((p) => passiveApplies(p, level, path));
  const P = collectPassives(passives);

  const base = { ...(stats || cls.recommended || {}) };
  const st = {};
  for (const k of STATS) st[k] = base[k] ?? 8;
  const rb = race.statBonus || {};
  for (const k in rb) {
    if (k === 'any') {
      const target = anyStat || cls.castStat || cls.weapon?.stat || 'str';
      st[target] += rb.any;
    } else if (k in st) st[k] += rb[k];
  }
  for (const k in P.statBonus) if (k in st) st[k] += P.statBonus[k];

  const u = baseUnit();
  u.id = id || nextId('h');
  u.name = name || `${cls.name || cls.id}`;
  u.kind = 'hero';
  u.team = team;
  u.ai = ROLE_TO_AI[cls.role] || 'melee';
  u.raceId = race.id;
  u.classId = cls.id;
  u.level = level;
  u.path = path;
  u.tags = [...(race.tags || ['organic'])];
  u.stats = st;
  u.prof = profBonus(level);

  u.maxHp = 10 + st.con + 5 * level + (race.hpBonus || 0) + (cls.hpPerLevel || 0) * level;
  u.maxMrl = 10 + 2 * st.wil + level + (race.mrlBonus || 0);
  u.maxEnr = 5 + st.int + 3 * level + (race.enrBonus || 0);
  u.hp = u.maxHp;
  u.mrl = u.maxMrl;
  u.enr = u.maxEnr;

  const armor = cls.armor || { type: 'cloth', kb: 0 };
  u.armorType = armor.type || 'cloth';
  u.armorKb = armor.kb || 0;
  u.kbBonus = P.kb;
  u.kb = 10 + u.armorKb + Math.min(mod(st.dex), ARMOR_DEX_CAP[u.armorType] ?? 99) + P.kb;

  u.speed = (race.speed ?? 6) + P.speed;
  u.initBonus = P.init;
  u.weapon = cls.weapon ? { ...cls.weapon } : { name: 'Кулак', dice: '1d2', dmgType: 'blunt', stat: 'str', range: 1, hit: 0 };
  u.weaponTier = weaponTier || START_WEAPON_TIER;
  u.castStat = cls.castStat || null;
  u.saves = [...(cls.saves || [])];
  u.resist = mergeResist(mergeResist({}, race.resist), P.resist);
  u.immuneStatus = [...(race.immuneStatus || []), ...P.immuneStatus];
  u.abilities = [...(race.abilities || []), ...(cls.abilities || [])].filter((a) => abilityAvailable(a, level, path));
  u.passives = passives;
  u.hitBonus = P.hit;
  u.dmgBonus = P.dmg;
  u.critRange = P.critRange;
  u.advantages = P.advantage;
  u.deathSaves = P.deathSave;
  u.regen = P.regen;
  u.overcast = cls.overcast || null;
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
  u.weapon = def.weapon ? { ...def.weapon } : null;
  u.weaponTier = 2;
  u.attackBonus = def.attackBonus ?? null;
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
  u.xp = def.xp || 0;
  return u;
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
