// Flexible character creation: validation of a player's build (v3). Pure; data injected.
//
// build = { race, cls, path?, level = 1, stats (BEFORE racial bonuses), anyStat?, skills: { base: [2], extra: [2] },
//           proficiencies?: { weaponTypes, dmgTypes, armor }, phobia?: { trigger, effect? } | [...],
//           talents?, activeCombat?, gadget?, multiclass?: { cls, path? }, equipment?,
//           asi?: [{ level, stats: { str: 2 } | { str: 1, dex: 1 } } | { level, talent }] }  (levels-20.md)
// validateBuild(build, data) -> [{ field, code, msg }] (empty = valid).

import { STATS, normalizeData, pointBuyCost, isAllowed, buildCreature, MULTICLASS_MIN_LEVEL, asiLevelsFor, ASI_STAT_MAX } from './character.js';
import { defaultProficiencies, proficiencyCost, profPoints, CREATION_MAX_TIER, ARMOR_ORDER } from './equipment.js';
import { SKILL_STATS } from './skills.js';
import { PHOBIA_COMBAT_TRIGGERS, PHOBIA_WORLD_TRIGGERS } from './combat.js';

/** Point buy (canon): all stats 8, 27 points; 9–13 cost 1 per point, 14–15 cost 2; max 15 before racial bonuses. */
export const POINT_BUY_TOTAL = 27;
export const STAT_MIN = 8;
export const STAT_MAX = 15;
/** Canon «2 базовых навыка + 2 доп». */
export const BASE_SKILLS = 2;
export const EXTRA_SKILLS = 2;
export const MAX_PHOBIAS = 3;

export function validateBuild(build, data) {
  const D = normalizeData(data);
  const errors = [];
  const err = (field, code, msg) => errors.push({ field, code, msg });
  const level = build.level || 1;
  const race = typeof build.race === 'string' ? D.races[build.race] : build.race;
  const cls = typeof build.cls === 'string' ? D.classes[build.cls] : build.cls;
  if (!race) err('race', 'unknownRace', `Неизвестная раса "${build.race}"`);
  else if (race.playable === false) err('race', 'notPlayable', `Раса "${race.id}" недоступна игроку`);
  if (!cls) err('cls', 'unknownClass', `Неизвестный класс "${build.cls}"`);
  if (race && cls && !isAllowed(race, cls)) err('cls', 'raceNotAllowed', `Класс "${cls.id}" недоступен расе "${race.id}"`);
  const pathDef = cls && build.path ? (cls.paths || []).find((p) => p.id === build.path) : null;
  if (cls && build.path && !pathDef) err('path', 'unknownPath', `У класса "${cls.id}" нет пути "${build.path}"`);

  // stats
  const st = build.stats || {};
  for (const k of STATS) {
    const v = st[k];
    if (!Number.isInteger(v)) err('stats', 'statMissing', `Не задана характеристика ${k}`);
    else if (v < STAT_MIN || v > STAT_MAX) err('stats', 'statRange', `${k} = ${v}: допустимо ${STAT_MIN}–${STAT_MAX} до расовых бонусов`);
  }
  if (STATS.every((k) => Number.isInteger(st[k]))) {
    const cost = pointBuyCost(st);
    if (cost > POINT_BUY_TOTAL) err('stats', 'overspent', `Потрачено ${cost} очков из ${POINT_BUY_TOTAL}`);
    else if (cost < POINT_BUY_TOTAL) err('stats', 'unspent', `Не распределено ${POINT_BUY_TOTAL - cost} очков`);
  }
  if (build.anyStat && !STATS.includes(build.anyStat)) err('anyStat', 'unknownStat', `Неизвестная характеристика "${build.anyStat}"`);

  // skills: 2 base + 2 extra, distinct
  const skillIds = Object.keys(D.skills || SKILL_STATS);
  const sk = build.skills || { base: [], extra: [] };
  const base = sk.base || [], extra = sk.extra || [];
  if (base.length !== BASE_SKILLS) err('skills', 'baseCount', `Базовых навыков должно быть ${BASE_SKILLS}`);
  if (extra.length !== EXTRA_SKILLS) err('skills', 'extraCount', `Дополнительных навыков должно быть ${EXTRA_SKILLS}`);
  const all = [...base, ...extra];
  for (const s of all) if (!skillIds.includes(s)) err('skills', 'unknownSkill', `Неизвестный навык "${s}"`);
  if (new Set(all).size !== all.length) err('skills', 'duplicateSkill', 'Навык выбран дважды');

  // proficiencies: points over class defaults
  if (cls && build.proficiencies) {
    const def = defaultProficiencies(cls, pathDef || {});
    const cost = proficiencyCost(def, build.proficiencies);
    const budget = profPoints(level);
    if (cost > budget) err('proficiencies', 'profOverspent', `Владения: потрачено ${cost} из ${budget} очков`);
    const ownType = (pathDef && pathDef.weapon && pathDef.weapon.type) || (cls.weapon && cls.weapon.type) || null;
    for (const k of ['weaponTypes', 'dmgTypes', 'armor']) {
      for (const [t, v] of Object.entries(build.proficiencies[k] || {})) {
        if (!Number.isInteger(v) || v < 1 || v > 4) err('proficiencies', 'tierRange', `${k}.${t} = ${v}: ступени 1–4`);
        else if (level === 1 && v > CREATION_MAX_TIER && !(k === 'weaponTypes' && t === ownType)) {
          err('proficiencies', 'masteryAtCreation', `${k}.${t}: мастерство при создании — только для своего типа оружия`);
        }
        if (k === 'armor' && !ARMOR_ORDER.includes(t)) err('proficiencies', 'unknownArmor', `Неизвестный тип брони "${t}"`);
      }
    }
  }

  // phobias (optional, canon: «фобии по желанию»)
  const ph = build.phobia ? (Array.isArray(build.phobia) ? build.phobia : [build.phobia]) : [];
  if (ph.length > MAX_PHOBIAS) err('phobia', 'tooMany', `Не больше ${MAX_PHOBIAS} фобий`);
  for (const p of ph) {
    if (!PHOBIA_COMBAT_TRIGGERS.includes(p.trigger) && !PHOBIA_WORLD_TRIGGERS.includes(p.trigger)) {
      err('phobia', 'unknownTrigger', `Неизвестный триггер фобии "${p.trigger}"`);
    }
  }

  // multiclass
  if (build.multiclass) {
    const c2 = D.classes[build.multiclass.cls];
    if (level < MULTICLASS_MIN_LEVEL) err('multiclass', 'level', `Второй класс — с ${MULTICLASS_MIN_LEVEL}-го уровня`);
    if (!c2) err('multiclass', 'unknownClass', `Неизвестный класс "${build.multiclass.cls}"`);
    else {
      if (cls && c2.id === cls.id) err('multiclass', 'sameClass', 'Второй класс должен отличаться от первого');
      if (race && !isAllowed(race, c2)) err('multiclass', 'raceNotAllowed', `Класс "${c2.id}" недоступен расе "${race.id}"`);
      if (build.multiclass.path && !(c2.paths || []).some((p) => p.id === build.multiclass.path)) err('multiclass', 'unknownPath', `У класса "${c2.id}" нет пути "${build.multiclass.path}"`);
    }
  }

  // ASI: one choice per ASI level of the class up to the build level; +2 to one stat or +1 to two, or a talent
  if (cls && build.asi != null && build.asi !== 'auto') {
    const levels = asiLevelsFor(cls);
    const list = Array.isArray(build.asi) ? build.asi : [];
    if (!Array.isArray(build.asi)) err('asi', 'asiFormat', 'Рост характеристик: ожидается список');
    const seen = new Set();
    for (const e of list) {
      const lv = e && e.level;
      if (!levels.includes(lv)) { err('asi', 'asiLevel', `Уровень ${lv}: нет роста характеристик (есть на ${levels.join(', ')})`); continue; }
      if (lv > level) err('asi', 'asiFuture', `Рост характеристик ${lv}-го уровня выше уровня героя ${level}`);
      if (seen.has(lv)) err('asi', 'asiDuplicate', `Рост характеристик ${lv}-го уровня выбран дважды`);
      seen.add(lv);
      if (e.talent && e.stats) err('asi', 'asiBoth', `Уровень ${lv}: либо характеристики, либо талант`);
      else if (e.talent) { if (!D.talents[e.talent]) err('asi', 'asiTalent', `Неизвестный талант "${e.talent}"`); }
      else {
        const ent = Object.entries(e.stats || {});
        const okKeys = ent.every(([k]) => STATS.includes(k));
        const vals = ent.map(([, v]) => v).sort();
        const okShape = (vals.length === 1 && vals[0] === 2) || (vals.length === 2 && vals[0] === 1 && vals[1] === 1);
        if (!okKeys || !okShape) err('asi', 'asiShape', `Уровень ${lv}: +2 к одной характеристике или +1 к двум`);
      }
    }
    for (const lv of levels) if (lv <= level && !seen.has(lv)) err('asi', 'asiMissing', `Не выбран рост характеристик ${lv}-го уровня`);
  }

  // talents, gadget, equipment: let the builder decide (limit, unknown ids, two-handed + off-hand …)
  if (!errors.length) {
    try {
      const u = buildCreature({ ...build, level, data: D });
      if (u.asiOverflow && u.asiOverflow.length) err('asi', 'asiCap', `Характеристика выше ${ASI_STAT_MAX}: ${[...new Set(u.asiOverflow)].join(', ')}`);
    } catch (e) {
      const m = e.message.replace(/^(buildCreature|equipment): /, '');
      const field = /talent/.test(m) ? 'talents' : /gadget/.test(m) ? 'gadget' : /item|hand/.test(m) ? 'equipment' : 'build';
      err(field, 'build', m);
    }
  }
  return errors;
}
