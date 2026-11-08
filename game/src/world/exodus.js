// «Третий исход» — глобальный таймер (docs/specs/third-exodus.md §1). Состояние: save.exodus = { start, ext, mark } (нет — таймер не идёт).
// Числа — data/world/exodus.js. Дни идут через passDays (путь, отдых); метки и продления — exodusSync (идемпотентно).
import { EXODUS as X } from '../data/world/exodus.js';
import { t } from '../data/text/index.js';
import { journal, tf } from './state.js';
import { clashTick } from './clashes.js';
import { EXODUS_RADIO, EXODUS_RUMORS, EXODUS_NPC } from '../data/text/exodus.js';

/** Timer stopped for good (mq-exodus closed / node destroyed). */
export const exodusStopped = (save) => X.stopFlags.some((f) => save.flags?.[f]);
/** Timer running: started and not stopped. */
export const exodusActive = (save) => !!save?.exodus && !exodusStopped(save);

/** Start the timer once the start flag is set (idempotent). */
export function exodusStart(save) {
  if (save.exodus || !save.flags?.[X.startFlag]) return false;
  save.exodus = { start: save.day, ext: 0, mark: 0 };
  return true;
}

export const exodusTotal = (save) => X.t0 + (save.exodus?.ext || 0);
export const exodusDeadline = (save) => save.exodus.start + exodusTotal(save);
/** Days left (null without a timer). */
export const exodusLeft = (save) => (save?.exodus ? exodusDeadline(save) - save.day : null);
/** Share of the stock left: left / (T0 + ext). */
export const exodusShare = (save) => (save?.exodus ? exodusLeft(save) / exodusTotal(save) : 1);

/** Mark that the current state calls for (0..5), by share / left. */
export function markFor(save) {
  if (!save?.exodus) return 0;
  const sh = exodusShare(save), left = exodusLeft(save);
  let m = 0;
  for (const k of X.marks) if (sh <= k.share || (k.left != null && left <= k.left)) m = k.n;
  return m;
}
/** Current mark (for prices / encounters): 0 when the timer is stopped. */
export const exodusMark = (save) => (exodusActive(save) ? save.exodus.mark || 0 : 0);

const sourceDone = (save, s) => {
  if (s.terminal) { const st = save.terminals?.[s.terminal]; return s.state ? st === s.state : !!st && st !== 'ritual'; }
  if (s.flag) return !!save.flags[s.flag];
  if (s.anyFlag) return s.anyFlag.some((f) => save.flags[f]);
  if (s.quest) return save.quests?.[s.quest]?.state === 'done';
  return false;
};

/** Extend the deadline once per source id (flag `exo-ext:<id>`), total ≤ extCap. → toast lines. */
export function exodusExtend(save, id, days) {
  if (!save.exodus || save.flags[`exo-ext:${id}`]) return [];
  save.flags[`exo-ext:${id}`] = true;
  const n = Math.max(0, Math.min(days, X.extCap - save.exodus.ext));
  if (!n) return [];
  save.exodus.ext += n;
  const text = tf('exodus.extended', { n });
  journal(save, text);
  return [{ text, color: 'j' }];
}

/**
 * Bring the timer up to date: start, extensions from finished deeds, new marks (one-way), Harmony's fall, zero.
 * Idempotent; call after any day change or world change. → { out: toast lines, zero: bool }.
 */
export function exodusSync(save) {
  const out = [], marks = [];
  exodusStart(save);
  if (!exodusActive(save)) return { out, zero: false, marks };
  for (const s of X.ext) if (sourceDone(save, s)) out.push(...exodusExtend(save, s.id, s.days));
  const m = markFor(save);
  while ((save.exodus.mark || 0) < m) {
    const n = ++save.exodus.mark;
    marks.push(n);
    const text = `${t('exodus.mark')} ${n}: ${t(`exodus.mark.${n}`)}`;
    journal(save, text);
    out.push({ text, color: 'c' });
    if (n === X.harmony.mark && !save.flags[X.harmony.flag]) { save.flags[X.harmony.flag] = true; journal(save, t('exodus.harmonyFallen')); out.push({ text: t('exodus.harmonyFallen'), color: 'c' }); }
  }
  // zero: stays true until the node falls (a lost finale → the next node entry starts it again)
  const zero = exodusLeft(save) <= 0;
  return { out, zero, marks };
}

/** Days pass (travel / rest): save.day += n, then exodusSync. */
export function passDays(save, n = 1) {
  save.day += n;
  const r = exodusSync(save);
  r.out.push(...clashTick(save, n)); // skirmishes.md: markers appear / resolve with the days
  return r;
}

/** A service of a node is off: Harmony fell (rest / trade / trainers). */
export const serviceOff = (save, loc, service) => !!save.flags?.[X.harmony.flag] && loc?.region === X.harmony.region && X.harmony.servicesOff.includes(service);

/** Encounter threshold bonus of the current mark for a region. */
export const encounterMod = (save, region) => (exodusMark(save) >= X.encounter.fromMark && X.encounter.regions.includes(region) ? X.encounter.mod : 0);
export const priceMult = (save) => X.priceMult[exodusMark(save)] || 1;
export const tollMult = (save) => X.tollMult[exodusMark(save)] || 1;

/** HUD line: { text, color key, blink } or null before the timer starts / after it stops. */
export function exodusHud(save) {
  if (!exodusActive(save)) return null;
  const left = Math.max(0, exodusLeft(save)), sh = exodusShare(save);
  return { text: `${t('exodus.hud')}: ${left} ${t('map.days')}`, color: sh <= X.redShare ? 'c' : 'b', blink: sh <= X.blinkShare };
}

/** The finale is fought in the «incarnation» mode: the zero came and the node is not destroyed yet. */
export const exodusZeroFinale = (save) => !!save?.flags?.[X.zero.flag] && !exodusStopped(save);

/** Finale at zero: the boss gets +bossHp ЗДР (a derived enemy `<id>^inc`, registered in the given ENEMIES table). */
export function incarnate(enemies, ENEMIES) {
  if (!enemies?.length) return enemies;
  const id = typeof enemies[0] === 'string' ? enemies[0] : enemies[0]?.id;
  const e = ENEMIES[id];
  if (!e) return enemies;
  const nid = `${id}^inc`;
  if (!ENEMIES[nid]) ENEMIES[nid] = { ...e, id: nid, hp: Math.round(e.hp * X.zero.bossHp) };
  return [nid, ...enemies.slice(1)];
}

// ---------------------------------------------------------------- radio, rumors, NPC lines (data/text/exodus.js)
const pick = (list, rng = Math.random) => (list?.length ? list[Math.floor(rng() * list.length)] : null);

/** Radio lines of a mark (the «📻» modal when the mark comes). */
export const exodusRadio = (n) => EXODUS_RADIO[n] || [];

/** A tavern rumor about the Exodus at the current mark (null — none / the dice said «an ordinary rumor»). */
export function exodusRumor(save, rng = Math.random) {
  const m = exodusMark(save);
  if (!m || rng() >= (X.tavernChance ?? 0.5)) return null;
  return pick(EXODUS_RUMORS[m], rng);
}

/**
 * An NPC's line about the Exodus: once per NPC per mark (save.npcs[id].exoMark), marks 1–2 → [0], 3–5 → [1].
 * → string | null. Marks the NPC as told.
 */
export function exodusNpcLine(save, npcId, faction) {
  const m = exodusMark(save);
  if (m < (X.npcLines?.fromMark ?? 1) || !npcId) return null;
  const st = (save.npcs[npcId] = save.npcs[npcId] || {});
  if ((st.exoMark || 0) >= m) return null;
  st.exoMark = m;
  const lines = EXODUS_NPC[faction] || EXODUS_NPC.none;
  return lines[m >= 3 ? 1 : 0] || null;
}

/** Long travel warning: { n, m } when the mark ≥ confirm.fromMark and the route is longer than confirm.days, else null. */
export function travelWarning(save, days) {
  const C = X.confirm;
  if (!C || exodusMark(save) < C.fromMark || days <= C.days) return null;
  return { n: days, m: Math.max(0, exodusLeft(save) - days) };
}
