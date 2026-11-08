// Mini-game «Взлом» (docs/specs/cyberspace-v2.md §4, HACK_RULES): a graph entry → core, turns timer, Judge trace.
// Pure logic (no DOM): makeHack builds the board, hackOptions lists what can be done with a neighbour node,
// hackAct applies an action. Rolls come from the caller (`roll(skills, dc)` → { success, natural, total }).
import { HACK_RULES, CS_RULES, CS_CACHE } from '../data/world/cyberspace.js';

const R = HACK_RULES;

/** Tier of the hack by hero level (1: 1–5, 2: 6–11, 3: 12–20). */
export const hackTier = (level) => (level >= 12 ? 3 : level >= 6 ? 2 : 1);

const pickW = (rng, list) => {
  const sum = list.reduce((s, x) => s + x.w, 0);
  let r = rng() * sum;
  for (const x of list) { r -= x.w; if (r < 0) return x.id; }
  return list[0]?.id || null;
};

/**
 * New board. opts: { rng, turnsBonus (Кибердека / хакер в отряде), trapsVisible (terminal-touch), trace (start) }.
 * → { tier, dc, nodes: [{id, col, row, rows, kind, hidden, broken, locked, fails, seen}], edges: [[a, b]], at, prev: [], turns, trace, cap,
 *     rollback: 1, cacheLoot: [], log: [], done: null | 'win' | 'fail', battle }
 */
export function makeHack(tier, { rng = Math.random, turnsBonus = 0, trapsVisible = false, trace = 0 } = {}) {
  const T = R.tiers[tier] || R.tiers[1];
  const mid = T.size - 2;
  // columns of 2–3 nodes between the entry and the core
  const cols = [];
  let left = mid;
  while (left > 0) { const n = left <= 3 ? left : (left === 4 ? 2 : (rng() < 0.4 ? 3 : 2)); cols.push(n); left -= n; }
  const nodes = [{ id: 0, col: 0, row: 0, rows: 1, kind: 'entry', seen: true }];
  const colIds = [[0]];
  cols.forEach((n, c) => {
    const ids = [];
    for (let r = 0; r < n; r++) { const id = nodes.length; nodes.push({ id, col: c + 1, row: r, rows: n, kind: 'open', fails: 0 }); ids.push(id); }
    colIds.push(ids);
  });
  const core = nodes.length;
  nodes.push({ id: core, col: cols.length + 1, row: 0, rows: 1, kind: 'core' });
  colIds.push([core]);
  // edges: every node links forward (same relative row + a random extra), every node gets an incoming link
  const edges = [];
  const has = (a, b) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const link = (a, b) => { if (a !== b && !has(a, b)) edges.push([a, b]); };
  for (let c = 0; c < colIds.length - 1; c++) {
    const A = colIds[c], B = colIds[c + 1];
    for (const a of A) {
      const ra = nodes[a].rows > 1 ? nodes[a].row / (nodes[a].rows - 1) : 0.5;
      link(a, B[Math.round(ra * (B.length - 1))]);
      if (B.length > 1 && rng() < 0.45) link(a, B[Math.floor(rng() * B.length)]);
    }
    for (const b of B) if (!A.some((a) => has(a, b))) link(A[Math.floor(rng() * A.length)], b);
    if (A.length > 1) for (let i = 0; i < A.length - 1; i++) if (rng() < 0.3) link(A[i], A[i + 1]);
  }
  // kinds of the middle nodes: ICE, traps, one cache, the rest open; ICE never on every route of the first column
  const midIds = nodes.filter((n) => n.kind === 'open').map((n) => n.id);
  const shuffled = [...midIds].sort(() => rng() - 0.5);
  let k = 0;
  for (let i = 0; i < T.ice && k < shuffled.length; i++) nodes[shuffled[k++]].kind = 'ice';
  for (let i = 0; i < T.traps && k < shuffled.length; i++) { const n = nodes[shuffled[k++]]; n.kind = 'trap'; n.hidden = !trapsVisible; }
  if (k < shuffled.length && midIds.length >= 4) nodes[shuffled[k++]].kind = 'cache';
  const turns = T.turns + turnsBonus;
  return { tier, dc: T.dc, nodes, edges, at: 0, prev: [], turns, maxTurns: turns, trace, cap: CS_RULES.traceCap, rollback: 1, loot: [], log: [], done: null, battle: false, rng };
}

export const neighbours = (h, id = h.at) => h.edges.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));

/** Nodes reachable by «Обойти» over an ICE neighbour: its other neighbours (not ICE, not here). */
const bypassTargets = (h, ice) => neighbours(h, ice).filter((x) => x !== h.at && !(h.nodes[x].kind === 'ice' && !h.nodes[x].broken));

/**
 * Actions for a neighbour node: [{ act: 'move'|'hack'|'pick'|'bypass', cost, trace, to? }] (empty if not adjacent / game over).
 * hasPick — the party carries «Отмычка ICE».
 */
export function hackOptions(h, id, { hasPick = false } = {}) {
  if (h.done || !neighbours(h).includes(id)) return [];
  const n = h.nodes[id];
  const tick = CS_RULES.traceFromTick;
  if (n.kind === 'ice' && !n.broken) {
    const out = [];
    if (!n.locked) out.push({ act: 'hack', cost: 1, trace: tick });
    if (hasPick) out.push({ act: 'pick', cost: 1, trace: tick });
    const by = bypassTargets(h, id).sort((a, b) => h.nodes[b].col - h.nodes[a].col)[0];
    if (by != null && h.turns >= 2) out.push({ act: 'bypass', cost: 2, trace: tick + 1, to: by });
    return out;
  }
  return [{ act: 'move', cost: 1, trace: tick }];
}

function enter(h, id) {
  h.prev.push(h.at);
  h.at = id;
  const n = h.nodes[id];
  n.seen = true;
  if (n.kind === 'trap' && !n.sprung) { n.sprung = true; n.hidden = false; h.trace += 2; h.log.push({ key: 'hack.log.trap' }); }
  if (n.kind === 'cache' && !n.taken) {
    n.taken = true;
    const it = pickW(h.rng, CS_CACHE[h.tier] || CS_CACHE[1]);
    if (it) { h.loot.push(it); h.log.push({ key: 'hack.log.cache', item: it }); }
  }
  if (n.kind === 'core') { h.done = 'win'; h.log.push({ key: 'hack.log.core' }); }
}

function settle(h) {
  if (h.done) return h;
  if (h.trace >= h.cap) { h.done = 'fail'; h.battle = true; h.log.push({ key: 'hack.log.traced' }); }
  else if (h.turns <= 0) { h.done = 'fail'; h.log.push({ key: 'hack.log.timeout' }); }
  return h;
}

/**
 * Apply an action. act: 'move' | 'hack' | 'pick' | 'bypass' (needs `id` — the neighbour) | 'rollback'.
 * roll(skills, dc) → { success } for 'hack'. → { ok, h }.
 */
export function hackAct(h, act, id, { roll = null, hasPick = false } = {}) {
  if (h.done) return { ok: false, h };
  if (act === 'rollback') {
    if (h.rollback <= 0 || !h.prev.length) return { ok: false, h };
    h.rollback--; h.at = h.prev.pop(); h.log.push({ key: 'hack.log.rollback' });
    return { ok: true, h };
  }
  const opt = hackOptions(h, id, { hasPick }).find((o) => o.act === act);
  if (!opt) return { ok: false, h };
  h.turns -= opt.cost;
  h.trace += opt.trace;
  const n = h.nodes[id];
  if (act === 'move') enter(h, id);
  else if (act === 'pick') { n.broken = true; h.usedPick = (h.usedPick || 0) + 1; h.log.push({ key: 'hack.log.pick' }); enter(h, id); }
  else if (act === 'bypass') { h.log.push({ key: 'hack.log.bypass' }); enter(h, opt.to); }
  else if (act === 'hack') {
    const r = roll ? roll(R.nodeKinds.ice.check, h.dc) : { success: false };
    if (r.success) { n.broken = true; n.fails = 0; h.log.push({ key: 'hack.log.iceOk', total: r.total }); enter(h, id); }
    else {
      n.fails = (n.fails || 0) + 1;
      h.trace += CS_RULES.traceFromFail;
      h.log.push({ key: 'hack.log.iceFail', total: r.total });
      if (n.fails >= 2) { n.locked = true; h.log.push({ key: 'hack.log.locked' }); }
    }
  }
  settle(h);
  return { ok: true, h };
}
