// Experience and levels (docs/specs/world.md, п. 7). Pure functions; data injected.

import { buildCreature, normalizeData } from './character.js';

/** Total XP needed for levels 1..5. */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500];
export const MAX_LEVEL = 5;
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
/** XP still needed for the next level (0 at the cap). */
export function xpToNext(xp) {
  const lv = levelForXp(xp);
  return lv >= MAX_LEVEL ? 0 : XP_THRESHOLDS[lv] - xp;
}

/**
 * XP for a battle: sum of `xp` of defeated enemies (dead or «Сломлен»; summons give nothing).
 * Accepts a finished battle (createBattle / simulateBattle({log}) state) or a list of enemy ids / defs.
 */
export function battleXp(battleOrEnemies, data) {
  if (battleOrEnemies && Array.isArray(battleOrEnemies.units)) {
    let xp = 0;
    for (const u of battleOrEnemies.units) {
      if (u.team === 'heroes' || u.kind === 'summon') continue;
      if (u.dead || u.broken || (battleOrEnemies.winner === 'heroes' && u.down)) xp += u.xp || 0;
    }
    return xp;
  }
  const D = normalizeData(data);
  let xp = 0;
  for (const e of battleOrEnemies || []) {
    const def = typeof e === 'string' ? D.enemies[e] : e;
    xp += (def && def.xp) || 0;
  }
  return xp;
}

/** XP for a quest: rewards.xp, else xp, else QUEST_XP by size ('small' | 'big' | 'key'; key: true -> 'key'). */
export function questXp(q) {
  if (!q) return 0;
  if (q.rewards && q.rewards.xp != null) return q.rewards.xp;
  if (q.xp != null) return q.xp;
  return QUEST_XP[q.size || (q.key ? 'key' : 'small')] || 0;
}

/**
 * Add XP to a hero record ({ xp, level }). Returns { xp, level, oldLevel, leveledUp, levels: [...new levels],
 * talentPicks: number of +1 talent levels crossed }.
 */
export function gainXp(hero, amount, data) {
  const talentLevels = (data && (data.TALENT_LEVELS || data.talentLevels)) || DEFAULT_TALENT_LEVELS;
  const oldLevel = hero.level || levelForXp(hero.xp || 0);
  const xp = (hero.xp || 0) + Math.max(0, amount);
  const level = Math.max(oldLevel, levelForXp(xp));
  const levels = [];
  for (let l = oldLevel + 1; l <= level; l++) levels.push(l);
  return { xp, level, oldLevel, leveledUp: level > oldLevel, levels, talentPicks: levels.filter((l) => talentLevels.includes(l)).length };
}

/**
 * Rebuild a hero on a new level keeping race, class, path, stats, talents, active combat talents and gadget.
 * `hero` — a creature from buildCreature (uses hero.build) or a build spec { race, cls, path, stats, talents, ... }.
 * opts: { level, data, talents?, activeCombat?, gadget?, keepDamage = true } — keepDamage keeps lost HP/MRL
 * (current = new max − damage taken, at least 1); ENR is kept as missing amount too.
 */
export function rebuildHero(hero, { level, data, talents, activeCombat, gadget, keepDamage = true } = {}) {
  const spec = hero.build || hero;
  const next = buildCreature({
    race: spec.race, cls: spec.cls, path: spec.path, stats: spec.stats, anyStat: spec.anyStat || undefined,
    level: level ?? hero.level ?? 1, data, name: spec.name || undefined, id: spec.id || undefined,
    talents: talents ?? spec.talents ?? [], activeCombat: activeCombat ?? spec.activeCombat ?? undefined, gadget: gadget ?? spec.gadget ?? undefined,
    equipment: spec.equipment || undefined, proficiencies: spec.proficiencies || undefined, skills: spec.skills || undefined,
    phobia: spec.phobia || undefined, multiclass: spec.multiclass || undefined, inventory: hero.inventory || spec.inventory || undefined,
  });
  if (keepDamage && hero.maxHp != null) {
    next.hp = Math.max(1, next.maxHp - Math.max(0, hero.maxHp - hero.hp));
    next.mrl = Math.max(1, next.maxMrl - Math.max(0, hero.maxMrl - hero.mrl));
    next.enr = Math.max(0, next.maxEnr - Math.max(0, hero.maxEnr - hero.enr));
  }
  return next;
}
