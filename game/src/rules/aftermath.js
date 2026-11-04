// After-battle effects on persistent heroes (pure; the world calls these). v3.1: opiate withdrawal.
//
// Opiates (item.withdrawal = { mrl: dice, nextBattle?: { status, turns } }) used in battle queue
// unit.withdrawalPending (combat.js useItem). After the battle:
//   const res = applyWithdrawal(creature, battleUnit, rng)   // −MRL now, debuff until rest
// creature.withdrawal = { mrl, nextBattle, items, until: 'rest' } — while set, createBattle applies
// nextBattle.status at the start of every battle. clearWithdrawal(creature) on rest.

import { rollDice } from './dice.js';

/** Pending withdrawal entries of a battle unit (after the battle). */
export const pendingWithdrawal = (unit) => (unit && unit.withdrawalPending) || [];

/**
 * Roll withdrawal for a hero after a battle. Lowers creature.mrl (not below 0) and sets creature.withdrawal.
 * Returns { loss, withdrawal } or null if nothing was taken. rng — rules rng (createRng) or Math.random-like.
 */
export function applyWithdrawal(creature, unit, rng) {
  const list = pendingWithdrawal(unit);
  if (!list.length) return null;
  let loss = 0;
  let nextBattle = creature.withdrawal ? creature.withdrawal.nextBattle || null : null;
  for (const w of list) {
    if (w.mrl) loss += rollDice(rng, w.mrl);
    if (w.nextBattle && (!nextBattle || (w.nextBattle.turns || 1) > (nextBattle.turns || 1))) nextBattle = { ...w.nextBattle };
  }
  const base = unit && unit.mrl != null ? unit.mrl : creature.mrl ?? creature.maxMrl ?? 0;
  creature.mrl = Math.max(0, base - loss);
  const prev = creature.withdrawal || { mrl: 0, items: [] };
  creature.withdrawal = { mrl: prev.mrl + loss, nextBattle, items: [...prev.items, ...list.map((w) => w.item)], until: 'rest' };
  return { loss, withdrawal: creature.withdrawal };
}

/** Rest ends withdrawal. */
export function clearWithdrawal(creature) {
  if (creature) creature.withdrawal = null;
  return creature;
}
