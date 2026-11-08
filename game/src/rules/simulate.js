// Headless battle simulation (balance sims, tests). Deterministic by seed.

import { createBattle } from './combat.js';
import { playTurn } from './ai.js';

/**
 * simulateBattle({ map, heroes, enemies, allies, rivals?, data, seed, maxRounds, log })
 * Every unit is AI-controlled. Returns { winner: team | 'draw', rounds, survivors, log? }.
 * 'draw' — nobody won within maxRounds (or the turn loop stalled).
 */
export function simulateBattle({ map, heroes, enemies, allies, rivals, data, seed = 1, maxRounds = 30, log = false } = {}) {
  const b = createBattle({ map, heroes, enemies, allies, rivals, data, seed, log });
  for (const u of b.units) u.control = 'ai';
  let guard = 0;
  const maxSteps = maxRounds * (b.units.length + 8) * 4;
  while (!b.winner && b.turn && b.round <= maxRounds && guard++ < maxSteps) {
    playTurn(b);
  }
  const survivors = b.units.filter((u) => !u.dead && !u.down && !u.removed).map((u) => ({ id: u.id, enemyId: u.enemyId, team: u.team, hp: u.hp, maxHp: u.maxHp, mrl: u.mrl, maxMrl: u.maxMrl }));
  const out = { winner: b.winner || 'draw', rounds: Math.min(b.round, maxRounds), survivors };
  if (log) out.log = b.log;
  return out;
}

/** Run n battles with seeds seed0..seed0+n-1. Returns { wins: {team: n}, draws, avgRounds }. */
export function simulateMany(params, n, seed0 = 1) {
  const wins = {};
  let rounds = 0;
  let draws = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateBattle({ ...params, seed: seed0 + i, log: false });
    if (r.winner === 'draw') draws++;
    else wins[r.winner] = (wins[r.winner] || 0) + 1;
    rounds += r.rounds;
  }
  return { wins, draws, avgRounds: rounds / n };
}
