// Codex / bestiary progress (docs/specs/vendors-bestiary.md, part 2). Pure: works on the save, no DOM.
// save.codex = { seen: {enemyKey: true}, kills: {enemyKey: n}, terms: {'status:id' | 'surface:id': true}, flags: [] }.
// Enemy key — baseId: id without `^…`; a level version (`-5`, `-l8`) shares the base record if the base has ENEMY_LORE.
// Levels: 0 — unknown, 1 — seen, 2 — beaten (1+ win), 3 — studied (WORLD_RULES.codex.knownKills wins).
// Finds — save.flags['cx-…'] (ENEMY_LORE[key].finds, FACTION_FINDS). Hooks: scenes/world-battle.js (start / win / events).
import { ENEMY_LORE, FACTION_FINDS } from '../data/text/codex.js';
import { ENEMIES } from '../data/index.js';
import { STATUSES } from '../data/effects.js';
import { SURFACES } from '../data/surfaces.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { tf } from './state.js';

export const KNOWN_KILLS = WORLD_RULES.codex.knownKills;

export const emptyCodex = () => ({ seen: {}, kills: {}, terms: {}, flags: [] });
export const codexOf = (save) => (save.codex && typeof save.codex === 'object' ? save.codex : (save.codex = emptyCodex()));

export function enemyKey(id) {
  const base = String((id && typeof id === 'object' ? id.id : id) || '').split('^')[0];
  if (ENEMY_LORE[base]) return base;
  const root = base.replace(/-(l?\d+)$/, '');
  return root !== base && ENEMY_LORE[root] ? root : base;
}

export const enemyName = (key) => ENEMIES[key]?.name || key;

export function codexLevel(save, key) {
  const c = codexOf(save);
  const k = c.kills[key] || 0;
  return k >= KNOWN_KILLS ? 3 : k > 0 ? 2 : c.seen[key] ? 1 : 0;
}

/** Mark enemies (ids / unit specs) as seen. → toasts for new records. */
export function markSeen(save, ids) {
  const c = codexOf(save);
  const out = [];
  for (const id of ids || []) {
    const key = enemyKey(id);
    if (!ENEMIES[key] || c.seen[key]) continue;
    c.seen[key] = true;
    out.push({ text: tf('codex.seen', { name: enemyName(key) }), color: 'f' });
  }
  return out;
}

/** One win per record per battle (beaten enemy ids). → toasts when a record becomes «studied». */
export function markKills(save, ids) {
  const c = codexOf(save);
  const out = [];
  for (const key of new Set((ids || []).map(enemyKey))) {
    if (!ENEMIES[key]) continue;
    c.seen[key] = true;
    c.kills[key] = (c.kills[key] || 0) + 1;
    if (c.kills[key] === KNOWN_KILLS) out.push({ text: tf('codex.known', { name: enemyName(key) }), color: 'f' });
  }
  return out;
}

/** A status / surface applied in battle opens its term. kind: 'status' | 'surface'. */
export function markTerm(save, kind, id) {
  const src = kind === 'status' ? STATUSES : SURFACES;
  if (!src[id]) return false;
  const c = codexOf(save);
  const k = `${kind}:${id}`;
  if (c.terms[k]) return false;
  c.terms[k] = true;
  return true;
}

export const enemyFinds = (save, key) => (ENEMY_LORE[key]?.finds || []).filter((f) => save.flags?.[f.flag]);
export const factionFinds = (save, f) => FACTION_FINDS.filter((x) => x.faction === f && save.flags?.[x.flag]);

/** Save normalisation: unknown ids dropped; old saves — an empty codex. */
export function normCodex(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const o = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  return {
    seen: Object.fromEntries(Object.keys(o(c.seen)).filter((k) => ENEMIES[k]).map((k) => [k, true])),
    kills: Object.fromEntries(Object.entries(o(c.kills)).filter(([k, v]) => ENEMIES[k] && Number(v) > 0).map(([k, v]) => [k, Math.floor(Number(v))])),
    terms: Object.fromEntries(Object.keys(o(c.terms)).filter((k) => { const [kd, id] = k.split(':'); return (kd === 'status' ? STATUSES : kd === 'surface' ? SURFACES : {})[id]; }).map((k) => [k, true])),
    flags: Array.isArray(c.flags) ? c.flags.filter((x) => typeof x === 'string') : [],
  };
}
