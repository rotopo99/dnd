// Rest like D&D (data/world/rest.js REST): 2 short rests between long ones, a long rest needs provisions.
// Pure logic over the save (no DOM). State: save.rest = { short, max }; per holder (save.hero / party entry):
// hdUsed — spent hit dice, enr — ENR (null = full), restUses — { abilityId: n } of `recharge` abilities.
// UI — scenes/rest.js; battle → world: afterBattle() (world-battle.js writeBack).
import { REST } from '../data/world/rest.js';
import { mod } from '../rules/character.js';
import { clearWithdrawal } from '../rules/aftermath.js';
import { LOCATIONS, ITEMS, PLAY_DATA as GAME_DATA } from './data.js';
import { buildHero, buildCompanion, activeCompanions, locFaction, regionOf, encounterThreshold, tf } from './state.js';
import { bagKeys, bagOf, holderOf, stashOf, takeItem, giveItem } from './inventory.js';
import { atBase, modFx, power, modLevel } from './base.js';
import { heatOf, hunterBonus } from './crime.js';

const roll = (rng, n) => 1 + Math.floor(rng() * n);

/** save.rest with defaults (old saves: 2 short rests). */
export function restState(save) {
  if (!save.rest || typeof save.rest.short !== 'number') save.rest = { short: REST.short.max, max: REST.short.max };
  return save.rest;
}
export const shortsLeft = (save) => restState(save).short;
export const shortMax = (save) => restState(save).max ?? REST.short.max;

/** Members who rest: hero + active companions not down for good. → [{ holder, unit, name, isHero }]. */
export function restMembers(save, data = GAME_DATA) {
  const out = [{ holder: save.hero, unit: buildHero(save, data), isHero: true }];
  for (const p of activeCompanions(save)) {
    if (p.hp === 0) continue;
    const u = buildCompanion(save, p, data);
    if (u) out.push({ holder: p, unit: u, isHero: false });
  }
  for (const m of out) m.name = m.unit.name;
  return out;
}

/** Hit die size of a unit: by class hpPerLevel (REST.hitDie). */
export function hitDie(unit, data = GAME_DATA) {
  const hpl = data.CLASSES?.[unit.classId]?.hpPerLevel ?? 2;
  return REST.hitDie[Math.max(0, Math.min(4, hpl))] || 8;
}
/** { total, left, die, conMod } of a holder (total = level). */
export function hitDice(holder, unit, data = GAME_DATA) {
  const total = Math.max(1, unit.level || 1);
  return { total, left: Math.max(0, total - (holder.hdUsed || 0)), die: hitDie(unit, data), conMod: mod(unit.stats?.con) };
}
const hdHeal = (rng, hd) => Math.max(REST.hitDieMin, roll(rng, hd.die) + hd.conMod);

// ----------------------------------------------------------------------------- provisions
const provOf = (id) => ITEMS[id]?.provision || 0;
/** Stores counted for provisions: bags and quick slots; the stash only at the base. */
function eachFood(save, fn) {
  for (const key of bagKeys(save)) { const b = bagOf(holderOf(save, key)); fn(b.quick); fn(b.grid); }
  if (atBase(save)) fn(stashOf(save).grid);
}
/** Rations the party carries (item `provision` × count). Old saves without bags — the count view. */
export function provisionCount(save) {
  let n = 0;
  if (!save.hero?.bag) { for (const [id, k] of Object.entries(save.hero?.items || {})) n += provOf(id) * k; return n; }
  eachFood(save, (list) => { for (const e of list) if (e && provOf(e.item)) n += provOf(e.item) * (e.n || 1); });
  return n;
}
/** Rations needed for a long rest: one per resting member. */
export const rationsNeed = (save, data = GAME_DATA) => restMembers(save, data).length * REST.long.rationsPerMember;

/** Eat `need` rations: cheapest items first (1-ration items before 2-ration ones). Returns rations eaten. */
export function eatProvisions(save, need) {
  const have = {};
  eachFood(save, (list) => { for (const e of list) if (e && provOf(e.item)) have[e.item] = (have[e.item] || 0) + (e.n || 1); });
  if (!save.hero?.bag) for (const [id, k] of Object.entries(save.hero?.items || {})) if (provOf(id)) have[id] = k;
  let left = need;
  const ids = Object.keys(have).sort((a, b) => provOf(a) - provOf(b) || (ITEMS[a].price || 0) - (ITEMS[b].price || 0));
  for (const id of ids) {
    while (left > 0 && have[id] > 0) {
      if (!takeItem(save, id, 1)) { have[id] = 0; break; }
      have[id]--; left -= provOf(id);
    }
  }
  return need - Math.max(0, left);
}

// ----------------------------------------------------------------------------- risk
/** Rest risk at a node: { danger, wanted, risky, need } — a dangerous node or the node faction's wanted level. */
export function restRisk(save, locId, data = GAME_DATA) {
  const loc = LOCATIONS[locId] || {};
  const safe = (loc.services || []).includes('rest') || ['hub', 'town', 'base'].includes(loc.kind) || atBase(save);
  const danger = safe ? 0 : (loc.danger ?? regionOf(locId)?.danger ?? 0);
  const f = locFaction(locId);
  const wanted = !!f && heatOf(save, f) >= REST.ambush.wantedHeat;
  let need = 0;
  if (danger > 0 || wanted) {
    const th = encounterThreshold(save, { to: locId, danger: Math.max(1, danger) }, data);
    need = th.need + hunterBonus(save);
  }
  return { danger, wanted, risky: danger > 0 || wanted, need };
}

// ----------------------------------------------------------------------------- effects
function clearUsedFlags(save) { for (const k of Object.keys(save.flags || {})) if (k.startsWith('used:')) delete save.flags[k]; }
function resetUses(holder, kinds) {
  if (!holder.restUses) return;
  for (const [id, a] of Object.entries(holder.restUsesKind || {})) if (kinds.includes(a)) delete holder.restUses[id];
  if (kinds.includes('long')) { holder.restUses = {}; holder.restUsesKind = {}; }
}
const setHp = (m, hp) => { m.holder.hp = hp >= m.unit.maxHp ? null : hp; };
const setEnr = (m, enr) => { m.holder.enr = enr >= m.unit.maxEnr ? null : Math.max(0, enr); };

/** Short-rest effects (also the hungry rest): hit dice, ENR, «за короткий отдых». → toasts. */
function shortEffects(save, data, rng) {
  const out = [];
  const S = REST.short;
  for (const m of restMembers(save, data)) {
    const u = m.unit, h = m.holder;
    const hd = hitDice(h, u, data);
    let hp = u.hp, spent = 0;
    // spend dice while the wound is worth a die (or the member is below half)
    while (hd.left - spent > 0 && hp < u.maxHp && (u.maxHp - hp >= Math.ceil(hd.die / 2) || hp < u.maxHp / 2)) { hp = Math.min(u.maxHp, hp + hdHeal(rng, hd)); spent++; }
    h.hdUsed = (h.hdUsed || 0) + spent;
    setHp(m, hp);
    const gain = Math.max(Math.ceil(u.maxEnr * S.enrFrac), (u.level || 1) * S.enrPerLevel);
    if (u.maxEnr > 0) setEnr(m, u.enr + gain);
    resetUses(h, ['short']);
    out.push({ text: tf('rest.shortMember', { name: m.name, hp: hp - u.hp, d: spent, enr: Math.min(gain, u.maxEnr - u.enr) }), color: '4' });
  }
  clearUsedFlags(save);
  return out;
}

/** Short rest: 1 hour, no days. → { ok, why?, toasts }. */
export function shortRest(save, data = GAME_DATA, rng = Math.random) {
  const st = restState(save);
  if (st.short <= 0) return { ok: false, why: 'noShort', toasts: [] };
  st.short--;
  return { ok: true, toasts: shortEffects(save, data, rng) };
}

/** Base bonuses: medbay — MRL full + all hit dice, generator — +1 short rest. */
export function baseRestBonus(save) {
  if (!atBase(save)) return { medbay: false, generator: false };
  return { medbay: !!modFx(save, 'medbay'), generator: modLevel(save, 'generator') > 0 && power(save).supply > 0 };
}

/**
 * Long rest. mode: 'field' (eats rations), 'lodging' (paid / free night, no rations, MRL full), 'base' (eats rations;
 * medbay / generator bonuses), 'hungry' (no rations: short effects + fatigue, the short counter stays).
 * → { ok, why?, toasts, eaten }. Days are passed by the caller (passDays).
 */
export function longRest(save, data = GAME_DATA, { mode = 'field', rng = Math.random } = {}) {
  const st = restState(save);
  if (mode === 'hungry') {
    const out = shortEffects(save, data, rng);
    for (const m of restMembers(save, data)) {
      const loss = Math.ceil(m.unit.maxMrl * REST.hungry.mrlLoss);
      m.holder.mrl = Math.max(1, m.unit.mrl - loss);
    }
    out.push({ text: tf('rest.hungryDone'), color: 'c' });
    return { ok: true, toasts: out, eaten: 0 };
  }
  let eaten = 0;
  if (mode === 'field' || mode === 'base') {
    const need = rationsNeed(save, data);
    if (provisionCount(save) < need) return { ok: false, why: 'noFood', toasts: [] };
    eaten = eatProvisions(save, need);
  }
  const bonus = mode === 'base' ? baseRestBonus(save) : { medbay: false, generator: false };
  const mrlFull = mode === 'lodging' || bonus.medbay;
  for (const m of restMembers(save, data)) {
    const u = m.unit, h = m.holder;
    h.hp = null; h.enr = null;
    h.mrl = mrlFull ? null : (u.mrl + Math.ceil(u.maxMrl * REST.long.mrlFrac) >= u.maxMrl ? null : u.mrl + Math.ceil(u.maxMrl * REST.long.mrlFrac));
    const back = bonus.medbay ? 99 : Math.max(1, Math.floor((u.level || 1) * REST.long.hitDiceBack));
    h.hdUsed = Math.max(0, (h.hdUsed || 0) - back);
    resetUses(h, ['short', 'long']);
    if (h.withdrawal) clearWithdrawal(h); // a full rest ends opiate withdrawal (was restParty frac 1)
  }
  clearUsedFlags(save);
  st.max = REST.short.max + (bonus.generator ? REST.base.generatorShortBonus : 0);
  st.short = st.max;
  return { ok: true, toasts: [], eaten, bonus };
}

/** Survival on a field long rest: +rations on success (caller rolls the check). */
export function forageFind(save) {
  const F = REST.forage;
  return giveItem(save, F.item, F.n);
}
/** Foraging possible at this node (wild kinds). */
export const canForage = (locId) => REST.forage.kinds.includes(LOCATIONS[locId]?.kind);

// ----------------------------------------------------------------------------- after a battle
/**
 * World-battle write-back hook: persist ENR and «за отдых» uses; after a win — a breather (a free hit die,
 * not spent, + level × breather.enrPerLevel ENR) for every standing member. units: battle units by id. → toasts.
 */
export function afterBattle(save, byId, won, data = GAME_DATA, rng = Math.random) {
  const pairs = [[save.hero, byId.hero], ...save.party.map((p) => [p, byId[`c-${p.npc}`]])];
  let healed = 0;
  for (const [h, u] of pairs) {
    if (!h || !u) continue;
    // «за отдых» abilities: the battle copy had usesPerBattle = what was left
    for (const a of u.abilities || []) {
      const n = u.uses?.[a.id] || 0;
      if (!a.recharge || !n) continue;
      h.restUses = h.restUses || {}; h.restUsesKind = h.restUsesKind || {};
      h.restUses[a.id] = (h.restUses[a.id] || 0) + n;
      h.restUsesKind[a.id] = a.recharge;
    }
    if (u.dead || h.hp === 0) { h.enr = null; continue; }
    let enr = u.enr, hp = h.hp ?? u.maxHp;
    if (won && !u.down) {
      enr += (u.level || 1) * REST.breather.enrPerLevel;
      const hd = hitDice(h, u, data);
      for (let i = 0; i < REST.breather.hitDice && hp < u.maxHp; i++) hp = Math.min(u.maxHp, hp + hdHeal(rng, hd));
      if (hp > (h.hp ?? u.maxHp)) healed++;
      h.hp = hp >= u.maxHp ? null : hp;
    }
    h.enr = enr >= u.maxEnr ? null : Math.max(0, enr);
  }
  return won && healed ? [{ text: tf('rest.breather'), color: 'j' }] : [];
}
