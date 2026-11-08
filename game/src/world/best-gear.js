// «Одеть лучшее» (feedback 2026-11-07): pick the best weapon / off-hand / armour for a party member from the bags
// of the whole party and the stash (when reachable), by an estimate of expected damage per attack and KB built
// from the member's real creature (proficiency tiers, requirements, quality, mods of the instance, two-handed).
// Loose mods are not installed automatically (installing may need a check and can break the mod) — instances
// keep their own mods. Numbers — data/companions.js COMPANION_RULES.bestGear.
import { ITEMS } from './data.js';
import { mod, TIER_BONUS } from '../rules/character.js';
import { avgDice } from '../rules/dice.js';
import { COMPANION_RULES as CR } from '../data/companions.js';
import { NPCS } from '../data/npcs.js';
import { t } from '../data/text/index.js';
import { buildHero, buildCompanion } from './state.js';
import { bagKeys, bagOf, holderOf, stashOf, canStash, slotFor, moveItem, syncItems, refreshView, eqInst } from './inventory.js';

const SLOTS = ['weapon', 'offhand', 'armor'];
const BG = () => CR.bestGear || { refKb: 12, kbPerLevel: 0.5, kbWeight: 0.8, reqPenalty: 3, untrainedPenalty: 3, rofShare: 0.3 };
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const sig = (e) => `${e.item}|${e.q || ''}|${(e.mods || []).join(',')}`;

/** Creature of a member with a trial equipment (restored right after). */
function unitWith(save, key, eq, data) {
  const h = holderOf(save, key);
  const keep = h.equipment;
  h.equipment = eq;
  try { return key === 'hero' ? buildHero(save, data) : buildCompanion(save, h, data); } finally { h.equipment = keep; }
}

/** Expected damage of one weapon attack against a reference KB of the member's level. */
export function expectedDamage(u) {
  const w = u.weapon;
  if (!w) return 0;
  const Q = BG();
  const melee = (w.range || 1) <= 1 || w.melee;
  const kind = melee ? 'melee' : 'ranged';
  const sm = mod(u.stats?.[w.stat || 'str'] ?? 10);
  const atk = sm + (u.prof || 2) + (TIER_BONUS[u.weaponTier] || 0) + (w.hit || 0) + (u.hitBonus?.[kind] || 0) + (u.hitBonus?.all || 0);
  const kb = Q.refKb + Math.floor((u.level || 1) * Q.kbPerLevel);
  let p = Math.max(0.05, Math.min(0.95, (21 - (kb - atk)) / 20));
  if (u.weaponTier === 1 || (u.reqPenalty || []).length) p *= p; // disadvantage
  const dmg = Math.max(1, avgDice(w.dice || '1d4') + sm + (w.dmg || 0) + (u.dmgBonus?.[kind] || 0) + (u.dmgBonus?.all || 0) + (u.dmgTypeBonus?.[w.dmgType] || 0));
  return p * dmg * (1 + Q.rofShare * Math.max(0, (w.rof || 1) - 1));
}

/** Score of a creature: expected damage + kbWeight × KB − penalties (unmet requirements, untrained armour). */
export function gearScore(u) {
  const Q = BG();
  return expectedDamage(u) + Q.kbWeight * (u.kb || 0) - Q.reqPenalty * (u.reqPenalty || []).length - (u.armorTier === 1 ? Q.untrainedPenalty : 0);
}

/** Candidate instances: grid entries of all party bags + the stash (if reachable) → [{ ref, e }]. */
function sources(save) {
  const out = [];
  for (const k of bagKeys(save)) bagOf(holderOf(save, k)).grid.forEach((e) => out.push({ ref: { c: 'bag', key: k }, e }));
  if (canStash(save)) stashOf(save).grid.forEach((e) => out.push({ ref: { c: 'stash' }, e }));
  return out.filter((x) => slotFor(ITEMS[x.e.item]) && SLOTS.includes(slotFor(ITEMS[x.e.item])));
}

const trialEq = (eq, slot, inst) => {
  const t = clone(eq) || { weapon: null, armor: null, offhand: null, pack: null, mods: [] };
  t.inst = t.inst || {};
  t[slot] = inst ? inst.item : null;
  if (inst) t.inst[slot] = { q: inst.q, mods: [...(inst.mods || [])] }; else delete t.inst[slot];
  if (slot === 'weapon' && inst && ITEMS[inst.item]?.twoHanded) { t.offhand = null; delete t.inst.offhand; }
  return t;
};

/**
 * Plan of the best gear for a member: { key, changes: [{ slot, from, to }], before: {dmg, kb}, after: {dmg, kb} }.
 * Greedy: weapon (with the off-hand freed by a two-handed one), then off-hand, then armour. `taken` — signatures
 * already claimed by other members in «всем».
 */
export function planBestGear(save, key, data, taken = new Map()) {
  syncItems(save);
  const h = holderOf(save, key);
  if (!h) return null;
  let eq = clone(h.equipment) || { weapon: null, armor: null, offhand: null, pack: null, mods: [] };
  const u0 = unitWith(save, key, eq, data);
  const pool = sources(save);
  const changes = [];
  for (const slot of SLOTS) {
    if (slot === 'offhand' && ITEMS[eq.weapon]?.twoHanded) continue;
    let best = { score: gearScore(unitWith(save, key, eq, data)), inst: null };
    const seen = new Set();
    for (const { e } of pool) {
      if (slotFor(ITEMS[e.item]) !== slot) continue;
      const s = sig(e);
      if (seen.has(s)) continue;
      seen.add(s);
      const left = (pool.filter((x) => sig(x.e) === s).reduce((a, x) => a + (x.e.n || 1), 0)) - (taken.get(s) || 0);
      if (left <= 0) continue;
      let u;
      try { u = unitWith(save, key, trialEq(eq, slot, e), data); } catch { continue; }
      const sc = gearScore(u);
      if (sc > best.score + 0.01) best = { score: sc, inst: { item: e.item, q: e.q, mods: [...(e.mods || [])] } };
    }
    if (!best.inst) continue;
    const from = eqInst({ equipment: eq }, slot);
    changes.push({ slot, from, to: best.inst });
    if (slot === 'weapon' && ITEMS[best.inst.item]?.twoHanded && eq.offhand) changes.push({ slot: 'offhand', from: eqInst({ equipment: eq }, 'offhand'), to: null });
    eq = trialEq(eq, slot, best.inst);
    taken.set(sig(best.inst), (taken.get(sig(best.inst)) || 0) + 1);
  }
  const u1 = unitWith(save, key, eq, data);
  return { key, changes, before: { dmg: expectedDamage(u0), kb: u0.kb }, after: { dmg: expectedDamage(u1), kb: u1.kb } };
}

/** Snapshot of bags / equipment / stash / ground (for «Отменить»). */
export function gearSnapshot(save) {
  return clone({ hero: { bag: save.hero.bag, equipment: save.hero.equipment }, party: save.party.map((p) => ({ npc: p.npc, bag: p.bag, equipment: p.equipment })), stash: save.stash, ground: save.ground });
}
export function restoreGear(save, snap) {
  const s = clone(snap);
  save.hero.bag = s.hero.bag; save.hero.equipment = s.hero.equipment;
  for (const p of save.party) { const x = s.party.find((q) => q.npc === p.npc); if (x) { p.bag = x.bag; p.equipment = x.equipment; } }
  save.stash = s.stash; save.ground = s.ground;
  refreshView(save);
}

/** Apply a plan through inventory.moveItem (old pieces go where the new ones came from). → number of moves done. */
export function applyPlan(save, plan) {
  let done = 0;
  for (const c of plan?.changes || []) {
    if (!c.to) continue; // off-hand freed by a two-handed weapon — moveItem does it
    const s = sig(c.to);
    const src = sources(save).find((x) => sig(x.e) === s);
    if (!src) continue;
    const index = (src.ref.c === 'stash' ? stashOf(save) : bagOf(holderOf(save, src.ref.key))).grid.indexOf(src.e);
    const r = moveItem(save, { at: 'grid', ref: src.ref, index }, { at: 'equip', key: plan.key, slot: c.slot });
    if (r.ok) done++;
  }
  return done;
}

/** Best gear for members (one key or all): → { snap, plans, done }. */
export function equipBest(save, keys, data) {
  const snap = gearSnapshot(save);
  const taken = new Map();
  const plans = [];
  let done = 0;
  for (const k of keys) {
    const plan = planBestGear(save, k, data, taken);
    if (!plan) continue;
    done += applyPlan(save, plan);
    plans.push(plan);
  }
  return { snap, plans, done };
}

/** Lines «было → стало» of plans: [{ text, color }]. */
export function planLines(save, plans) {
  const name = (inst) => (inst ? ITEMS[inst.item]?.name || inst.item : '—');
  const out = [];
  for (const p of plans) {
    if (!p.changes.length) continue;
    out.push({ text: p.key === 'hero' ? save.hero.name : NPCS[p.key]?.name || p.key, color: 'h' });
    for (const c of p.changes) out.push({ text: `  ${t(`gear.slot.${c.slot}`)}: ${name(c.from)} → ${name(c.to)}`, color: '5' });
    out.push({ text: t('gear.bestSum').replace('{a}', p.before.dmg.toFixed(1)).replace('{b}', p.after.dmg.toFixed(1)).replace('{k1}', p.before.kb).replace('{k2}', p.after.kb), color: 'a' });
  }
  return out;
}
