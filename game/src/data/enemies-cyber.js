// Киберспейс v2 (docs/specs/cyberspace-v2.md): версии врагов зон «под героя» (scale: 'hero') и бои enc-cs-* (quests-cyber.js).
// Реестр ENEMIES собирается при загрузке (data/index.js), поэтому все версии регистрируются здесь заранее — по сетке уровней
// CS_SCALE_LEVELS; в бою берётся ближайшая ступень ≤ уровня героя (csEnemyId). Новые типы — nt() в enemies-v4.js.
import { ENEMIES_V3 } from './enemies-v3.js';
import { ENEMIES as ENEMIES_V1 } from './enemies.js';
import { N, lift } from './enemies-v4.js';
import { CS_ZONES, CS_EVENTS } from './world/cyberspace.js';

/** Ступени уровней для врагов «под героя» (баланс: чаще ступени — больше записей в реестре). */
export const CS_SCALE_LEVELS = [3, 6, 9, 12, 15, 18];

const CS_NEW = new Set(['cs-glitch-hound', 'cs-ice-warden', 'cs-echo-wail', 'cs-leech-daemon', 'cs-null-walker', 'cs-judge-eye']);
const tplOf = (ref) => { const m = /^(.+)-l(\d+)$/.exec(ref); return m ? m[1] : null; };
const levelOf = (id) => (ENEMIES_V3[id] || ENEMIES_V1[id])?.level || 1;

/** Ступень сетки для уровня героя (null — ниже первой ступени: враги как есть). */
export const scaleStep = (level) => [...CS_SCALE_LEVELS].reverse().find((L) => L <= level) ?? null;

/** id врага зоны для уровня героя: { ref } — существующий (lift / шаблон v4), { new } — тип CS_ENEMIES. */
export function csEnemyId(spec, level) {
  const L = scaleStep(level);
  if (spec.new) return N(spec.new, L ?? 3);
  const ref = spec.ref;
  if (L == null || L === levelOf(ref)) return ref;
  const tpl = tplOf(ref);
  if (tpl) { try { return N(tpl, L); } catch { /* not a v4 template — lift below */ } }
  return lift(tpl && (ENEMIES_V3[tpl] || ENEMIES_V1[tpl]) ? tpl : ref, L);
}

/** Список врагов узла/события: [{ref|new, n}] → ids под уровень героя. */
export const csEnemies = (list, level) => (list || []).flatMap((s) => Array(Math.max(1, s.n || 1)).fill(0).map(() => csEnemyId(s, level)));

/** Уровень врагов зоны: уровень героя в пределах zone.levels (вне диапазона новых записей в реестре нет). */
export const zoneLevel = (zone, level) => Math.max(zone.levels[0], Math.min(zone.levels[1], level || 1));

// предрегистрация: враги зон и событий на ступенях диапазона уровней зоны
for (const [zid, z] of Object.entries(CS_ZONES)) {
  const specs = [];
  for (const n of z.nodes) if (n.enemies) specs.push(...n.enemies);
  for (const ev of Object.values(CS_EVENTS)) if (ev.zone === zid) for (const o of ev.options) if (o.fx?.battle) specs.push(o.fx.battle);
  const steps = [z.levels[0], ...CS_SCALE_LEVELS.filter((L) => L >= z.levels[0] && L <= z.levels[1])];
  for (const s of specs) for (const L of steps) csEnemyId(s, L);
}
for (const id of CS_NEW) for (const L of CS_SCALE_LEVELS) N(id, L);

const enc = (id, name, level, enemies) => ({ id, name, level, faction: 'cult', places: [], enemies, biome: 'cyberspace' });
/** Бои квестов Киберспейса (CS_ENC_TODO в quests-cyber.js). */
export const ENCOUNTERS_CYBER = Object.fromEntries([
  enc('enc-cs-null-walkers', 'Нуль-ходоки Пустоши', 12, [N('cs-null-walker', 12), N('cs-null-walker', 12)]),
  enc('enc-cs-scriptlets', 'Скриптлеты у Привратной', 4, ['scriptlet', 'scriptlet', lift('scriptlet', 3)]),
  enc('enc-cs-leech', 'Скандал на Рынке душ', 8, [N('cs-leech-daemon', 9), 'scriptlet', 'scriptlet']),
].map((e) => [e.id, e]));
