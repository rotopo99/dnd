// Co-op party in the host's save (multiplayer.md stages 3–4), no DOM.
// save.coop = { players: [{ slot, name, hero, stash, ground }] } — the guests' heroes live in the host's save: a full
// save-format hero each (own backpack, credits, XP, talents) + own stash / «На земле». slot ≥ 1 — linked to a player
// of the session (slot −1 — away: the save was loaded and nobody with this name has joined yet).
// A guest sees a mirror of the host's save where `hero` is his own hero (mirrorSave), so every panel of the game
// (gear, party, level-up) works on his hero only; his edits come back as `heroEdit` and are checked by acceptHeroEdit.
import { newSave } from './state.js';
import { ITEMS } from './data.js';

/** Battle unit id of a player slot (slot 0 — 'hero', as in single player). */
export const heroIdOf = (slot) => (slot === 0 ? 'hero' : `hero${slot + 1}`);
export const coopPlayers = (save) => (Array.isArray(save?.coop?.players) ? save.coop.players : []);
/** Guests' heroes that take part (linked to a session slot). */
export const coopLinked = (save) => coopPlayers(save).filter((e) => e.slot > 0);
export const coopCount = (save) => coopLinked(save).length;
export const isCoopSave = (save) => coopPlayers(save).length > 0;
export const coopEntry = (save, slot) => coopPlayers(save).find((e) => e.slot === slot) || null;

const copy = (o) => JSON.parse(JSON.stringify(o));
const brief = (h) => (h ? { name: h.name, race: h.race, cls: h.cls, path: h.path, level: h.level || 1, look: h.look || null } : null);

/** A full save-format hero of a guest: his own copy (bag present) as is, else a new hero from the brief (newSave). */
export function coopHeroFrom(h) {
  if (!h || typeof h !== 'object') return null;
  if (h.bag && Array.isArray(h.bag.grid)) {
    const out = copy(h);
    out.talents = Array.isArray(out.talents) ? out.talents : [];
    out.credits = Number(out.credits) || 0;
    out.level = Math.max(1, Number(out.level) || 1);
    out.xp = Math.max(0, Number(out.xp) || 0);
    return out;
  }
  const s = newSave({ ...h, talents: Array.isArray(h.talents) ? h.talents : [] });
  s.hero.level = Math.max(1, Number(h.level) || 1);
  s.hero.xp = Math.max(0, Number(h.xp) || 0);
  return s.hero;
}

/** The host's save as seen by a member: his hero, no companions, his stash / ground (shares every other field). */
export function coopView(save, e) {
  if (!e.stash || !Array.isArray(e.stash.grid)) e.stash = { grid: [] };
  if (!e.ground || !Array.isArray(e.ground.grid)) e.ground = { grid: [] };
  return { ...save, hero: e.hero, party: [], stash: e.stash, ground: e.ground };
}

/**
 * Link the session players to the save's co-op entries (stage 4: by name, then by slot): an entry with the same name
 * keeps its hero and progress, a new player gets an entry from his hero. Entries of absent players → slot −1.
 * players — session players [{ slot, name, hero, connected }]. Returns the linked entries.
 */
export function linkPlayers(save, players) {
  save.coop = save.coop && typeof save.coop === 'object' ? save.coop : {};
  const list = coopPlayers(save);
  save.coop.players = list;
  const used = new Set();
  for (const p of players) {
    if (!p || p.slot === 0) continue;
    let e = list.find((x) => !used.has(x) && x.name === p.name) || list.find((x) => !used.has(x) && x.slot === p.slot && !players.some((q) => q.name === x.name));
    if (!e) {
      const hero = coopHeroFrom(p.hero);
      if (!hero) continue;
      e = { slot: p.slot, name: p.name, hero };
      list.push(e);
    }
    e.slot = p.slot; e.name = p.name;
    used.add(e);
  }
  for (const e of list) if (!used.has(e)) e.slot = -1;
  return list.filter((e) => used.has(e));
}

/** Link one player who joined mid-game (by name / slot); null — no hero. */
export function linkPlayer(save, p) {
  const list = coopPlayers(save);
  const others = list.filter((x) => x.slot > 0 && x.slot !== p.slot);
  return linkPlayers(save, [...others.map((x) => ({ slot: x.slot, name: x.name })), p]).find((e) => e.slot === p.slot) || null;
}

/** A guest's mirror of the host's save (snap / delta): his hero, his stash, brief of the others. JSON copy. */
export function mirrorSave(save, slot) {
  const e = coopEntry(save, slot);
  if (!e) return null;
  const v = coopView(save, e);
  const out = copy({ ...v, coop: null });
  out.coop = {
    mirror: slot,
    host: brief(save.hero),
    players: coopLinked(save).map((x) => ({ slot: x.slot, name: x.name, hero: brief(x.hero) })),
  };
  return out;
}

/** Brief of the party for drawing / labels: [{ slot, name, hero: brief }] (host slot 0 included). */
export function partyBrief(save) {
  if (save?.coop?.mirror != null) return [{ slot: 0, name: save.coop.host?.name, hero: save.coop.host }, ...save.coop.players];
  return [{ slot: 0, name: save.hero.name, hero: brief(save.hero) }, ...coopLinked(save).map((x) => ({ slot: x.slot, name: x.name, hero: brief(x.hero) }))];
}

/** { id: n } of everything a member owns: bag, quick slots, worn gear and mods, stash, ground. */
export function heroItems(h, stash, ground) {
  const out = {};
  const add = (id, n = 1) => { if (typeof id === 'string' && id) out[id] = (out[id] || 0) + n; };
  const entry = (e) => { if (!e) return; add(e.item, Math.max(1, Number(e.n) || 1)); for (const m of e.mods || []) add(m); };
  for (const e of h?.bag?.grid || []) entry(e);
  for (const e of h?.bag?.quick || []) entry(e);
  const eq = h?.equipment || {};
  for (const k of ['weapon', 'armor', 'offhand', 'pack']) add(eq[k]);
  for (const m of eq.mods || []) add(m);
  for (const x of Object.values(eq.inst || {})) for (const m of x?.mods || []) add(m);
  for (const e of stash?.grid || []) entry(e);
  for (const e of ground?.grid || []) entry(e);
  return out;
}

/**
 * Host: a guest changed his hero (gear, bag layout, level-up picks). Accepted when nothing new appears: the same
 * person (race / class / name), XP / level / credits unchanged, no item count grows, talents and ASI grow only
 * within the pending picks. → { ok, why }; on ok the entry takes the edit (protected fields stay the host's).
 */
export function acceptHeroEdit(e, edit) {
  const old = e?.hero, nw = edit?.hero;
  if (!old || !nw || typeof nw !== 'object') return { ok: false, why: 'shape' };
  if (nw.race !== old.race || nw.cls !== old.cls || nw.name !== old.name) return { ok: false, why: 'person' };
  if ((nw.xp || 0) !== (old.xp || 0) || (nw.level || 1) !== (old.level || 1) || (nw.credits || 0) !== (old.credits || 0)) return { ok: false, why: 'progress' };
  const t0 = new Set(old.talents || []), t1 = Array.isArray(nw.talents) ? nw.talents : [];
  if ([...t0].some((id) => !t1.includes(id))) return { ok: false, why: 'talents' };
  if (t1.filter((id) => !t0.has(id)).length > (old.pendingTalents || 0)) return { ok: false, why: 'talents' };
  if ((nw.asi || []).length - (old.asi || []).length > (old.pendingAsi || []).length) return { ok: false, why: 'asi' };
  const a = heroItems(old, e.stash, e.ground), b = heroItems(nw, edit.stash ?? e.stash, edit.ground ?? e.ground);
  for (const [id, n] of Object.entries(b)) if (n > (a[id] || 0) || !ITEMS[id]) return { ok: false, why: 'items' };
  const keep = { xp: old.xp, level: old.level, credits: old.credits, hp: old.hp, mrl: old.mrl };
  e.hero = { ...copy(nw), ...keep };
  if (edit.stash?.grid) e.stash = copy(edit.stash);
  if (edit.ground?.grid) e.ground = copy(edit.ground);
  return { ok: true };
}

/** Credits split equally between n players; the remainder goes to the first (host). */
export function splitCredits(total, n) {
  const k = Math.max(1, n | 0);
  const each = Math.floor(Math.max(0, total) / k);
  const out = Array(k).fill(each);
  out[0] += Math.max(0, total) - each * k;
  return out;
}

/**
 * Loot roll-off (multiplayer.md «Лут»): every taker rolls d20, the highest wins, a tie rerolls among the tied.
 * takers — slots; rng() ∈ [0,1). → { winner, rounds: [[[slot, roll], …], …] } (winner null — nobody takes).
 */
export function rollOff(takers, rng = Math.random) {
  let pool = [...new Set(takers)];
  const rounds = [];
  if (!pool.length) return { winner: null, rounds };
  if (pool.length === 1) return { winner: pool[0], rounds };
  for (let r = 0; r < 50 && pool.length > 1; r++) {
    const rolls = pool.map((s) => [s, 1 + Math.floor(rng() * 20)]);
    rounds.push(rolls);
    const top = Math.max(...rolls.map((x) => x[1]));
    pool = rolls.filter((x) => x[1] === top).map((x) => x[0]);
  }
  return { winner: pool[0], rounds };
}

/** save.js: validated co-op block of a loaded save (players without a valid hero dropped; everybody away). */
export function normCoop(c, data) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.players)) return null;
  const players = c.players.filter((e) => e && typeof e.name === 'string' && e.hero && data?.RACES?.[e.hero.race] && data?.CLASSES?.[e.hero.cls])
    .map((e) => ({ slot: -1, name: e.name.slice(0, 24), hero: e.hero, stash: e.stash?.grid ? e.stash : { grid: [] }, ground: e.ground?.grid ? e.ground : { grid: [] } }));
  return players.length ? { players } : null;
}
