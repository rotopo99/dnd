// Experience and levels (docs/specs/world.md, п. 7). Pure functions; data injected.

import { buildCreature, normalizeData, asiLevelsFor } from './character.js';

/** Total XP needed for levels 1..20 (docs/specs/levels-20.md). */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const MAX_LEVEL = 20;
/** Content up to this level has hand-set XP; above it fallbacks scale with the XP a level needs. */
export const XP_BASE_LEVEL = 5;
/** Fallback XP of one enemy without `xp` on levels 1..5 (typical values of enemies-v3.js). */
export const ENEMY_XP_BASE = [20, 38, 60, 90, 150];
/** Quest XP when a quest has no explicit rewards.xp (world.md: small 100–200, big 300–500, key 600–1000). */
export const QUEST_XP = { small: 150, big: 400, key: 800 };
/** Fallback for data.TALENT_LEVELS: levels that grant +1 talent. */
export const DEFAULT_TALENT_LEVELS = [2, 4];

export function levelForXp(xp) {
  let lv = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) lv = i + 1;
  return Math.min(MAX_LEVEL, lv);
}
export const xpForLevel = (level) => XP_THRESHOLDS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
/** Progress inside the current level (UI XP bars): { from, to, into, span, left, k ∈ [0,1], max }. */
export function xpProgress(xp, level = levelForXp(xp)) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, level));
  const from = XP_THRESHOLDS[lv - 1];
  if (lv >= MAX_LEVEL) return { from, to: from, into: 0, span: 0, left: 0, k: 1, max: true };
  const to = XP_THRESHOLDS[lv];
  const into = Math.max(0, xp - from);
  return { from, to, into, span: to - from, left: Math.max(0, to - xp), k: Math.max(0, Math.min(1, into / (to - from))), max: false };
}
/** XP still needed for the next level (0 at the cap). */
export function xpToNext(xp) {
  const lv = levelForXp(xp);
  return lv >= MAX_LEVEL ? 0 : XP_THRESHOLDS[lv] - xp;
}

/** XP from level L to L+1 (the last span is reused at the cap). */
export const levelSpan = (level) => {
  const l = Math.max(1, Math.min(MAX_LEVEL - 1, level || 1));
  return XP_THRESHOLDS[l] - XP_THRESHOLDS[l - 1];
};
/**
 * XP multiplier of content of a given level: 1 up to XP_BASE_LEVEL, then levelSpan(L) / levelSpan(XP_BASE_LEVEL)
 * (≈1.0 at 5, 1.2 at 6, 2.8 at 10, 4.0 at 15, 6.7 at 19–20), so the pace «a level per 1–2 regions» of levels 1–5 holds.
 */
export const xpScale = (level) => ((level || 1) <= XP_BASE_LEVEL ? 1 : levelSpan(level) / levelSpan(XP_BASE_LEVEL));
/** XP of an enemy of a level when its def has no `xp`. */
export function enemyXpForLevel(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, level || 1));
  return l <= XP_BASE_LEVEL ? ENEMY_XP_BASE[l - 1] : Math.round(ENEMY_XP_BASE[XP_BASE_LEVEL - 1] * xpScale(l));
}
const enemyXp = (x) => (x.xp != null ? x.xp : enemyXpForLevel(x.level));

/**
 * XP for a battle: sum of `xp` of defeated enemies (dead or «Сломлен»; summons give nothing).
 * Accepts a finished battle (createBattle / simulateBattle({log}) state) or a list of enemy ids / defs.
 */
export function battleXp(battleOrEnemies, data) {
  if (battleOrEnemies && Array.isArray(battleOrEnemies.units)) {
    let xp = 0;
    for (const u of battleOrEnemies.units) {
      if (u.team === 'heroes' || u.kind === 'summon') continue;
      // combat rework: xpMul — fled coward ×0.5, killed summoner ×1.25 (archetypes.js)
      if (u.dead || u.broken || u.fled || (battleOrEnemies.winner === 'heroes' && u.down)) xp += Math.round((u.xp != null ? u.xp : u.kind === 'enemy' ? enemyXpForLevel(u.level) : 0) * (u.xpMul ?? 1));
    }
    return xp;
  }
  const D = normalizeData(data);
  let xp = 0;
  for (const e of battleOrEnemies || []) {
    const def = typeof e === 'string' ? D.enemies[e] : e;
    xp += def ? enemyXp(def) : 0;
  }
  return xp;
}

/**
 * XP for a quest: rewards.xp, else xp, else QUEST_XP by size ('small' | 'big' | 'key'; key: true -> 'key')
 * × xpScale(q.level).
 */
export function questXp(q) {
  if (!q) return 0;
  if (q.rewards && q.rewards.xp != null) return q.rewards.xp;
  if (q.xp != null) return q.xp;
  return Math.round((QUEST_XP[q.size || (q.key ? 'key' : 'small')] || 0) * xpScale(q.level));
}

/**
 * Add XP to a hero record ({ xp, level, cls? }). Returns { xp, level, oldLevel, leveledUp, levels: [...new levels],
 * talentPicks: number of +1 talent levels crossed, asiLevels: crossed ASI levels of the class (cls id or object) }.
 */
export function gainXp(hero, amount, data) {
  const talentLevels = (data && (data.TALENT_LEVELS || data.talentLevels)) || DEFAULT_TALENT_LEVELS;
  const oldLevel = hero.level || levelForXp(hero.xp || 0);
  const xp = (hero.xp || 0) + Math.max(0, amount);
  const level = Math.max(oldLevel, levelForXp(xp));
  const levels = [];
  for (let l = oldLevel + 1; l <= level; l++) levels.push(l);
  const clsRef = hero.cls || hero.classId;
  const cls = typeof clsRef === 'string' ? normalizeData(data || {}).classes[clsRef] : clsRef;
  const asi = asiLevelsFor(cls);
  return { xp, level, oldLevel, leveledUp: level > oldLevel, levels, talentPicks: levels.filter((l) => talentLevels.includes(l)).length,
    asiLevels: levels.filter((l) => asi.includes(l)) };
}

/**
 * What a class level gives (level-up window, character sheet): abilities / passives with `level === L`
 * (common or of the path), upgrades of that level, and whether L is an ASI level.
 */
export function levelGains(cls, path, level) {
  if (!cls) return { abilities: [], passives: [], upgrades: [], asi: false };
  const pathDef = (cls.paths || []).find((p) => p.id === path) || {};
  const mine = (x) => !x.todo && (x.level || 1) === level && (!x.path || x.path === path);
  return {
    abilities: (cls.abilities || []).filter(mine),
    passives: (cls.passives || []).filter(mine),
    upgrades: [...(cls.upgrades || []), ...(pathDef.upgrades || [])].filter((g) => (g.level || 1) === level && (!g.path || g.path === path)),
    asi: asiLevelsFor(cls).includes(level),
  };
}

/**
 * Rebuild a hero on a new level keeping race, class, path, stats, talents, active combat talents and gadget.
 * `hero` — a creature from buildCreature (uses hero.build) or a build spec { race, cls, path, stats, talents, ... }.
 * opts: { level, data, talents?, activeCombat?, gadget?, asi?, keepDamage = true } — keepDamage keeps lost HP/MRL
 * (current = new max − damage taken, at least 1); ENR is kept as missing amount too.
 */
export function rebuildHero(hero, { level, data, talents, activeCombat, gadget, asi, keepDamage = true } = {}) {
  const spec = hero.build || hero;
  const next = buildCreature({
    race: spec.race, cls: spec.cls, path: spec.path, stats: spec.stats, anyStat: spec.anyStat || undefined,
    level: level ?? hero.level ?? 1, data, name: spec.name || undefined, id: spec.id || undefined,
    talents: talents ?? spec.talents ?? [], activeCombat: activeCombat ?? spec.activeCombat ?? undefined, gadget: gadget ?? spec.gadget ?? undefined,
    equipment: spec.equipment || undefined, proficiencies: spec.proficiencies || undefined, skills: spec.skills || undefined,
    phobia: spec.phobia || undefined, multiclass: spec.multiclass || undefined, inventory: hero.inventory || spec.inventory || undefined,
    asi: asi ?? spec.asi ?? undefined,
  });
  if (keepDamage && hero.maxHp != null) {
    next.hp = Math.max(1, next.maxHp - Math.max(0, hero.maxHp - hero.hp));
    next.mrl = Math.max(1, next.maxMrl - Math.max(0, hero.maxMrl - hero.mrl));
    next.enr = Math.max(0, next.maxEnr - Math.max(0, hero.maxEnr - hero.enr));
  }
  return next;
}
