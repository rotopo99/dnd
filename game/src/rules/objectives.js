// Optional battle objectives, arena chests and retreat through exits (docs/specs/combat-rework.md §6, stage 2).
// Pure rules — runs in Node. Numbers: b.data.combat (data/combat.js COMBAT.objectives / chest / retreat).
//
// Decisions:
//  - createBattle({ objectives: { goal, chests, retreat, exitLock, rep } }) → initObjectives after terrain/archetypes.
//    goal: 'rescue' | 'terminal' | 'hold' | 'assassinate' | 'nofire' | 'speed' | 'flawless' (or { id, ... }) or null.
//  - Props (captive, terminal, chest) are not terrain objects: they are not in b.objects (cannot be smashed, area hits
//    skip them), their tile is T_COVER (blocks movement, half cover). The map def is cloned (b.map.grid) so exits 'D'
//    and extra cargo crates 'c' show on the sprite layer without touching shared map data.
//  - Exits: existing 'D' of the map (if the map is not «reach the exit») or 2 tiles in the column closest to the heroes'
//    edge. Retreat = an action standing on an exit: the unit leaves (b.objectives.retreated). If no standing hero is left
//    and someone retreated, the battle ends with b.winner = 'retreat' (checkVictory) — downed members are carried out.
//  - Events: objective {id, state: start|done|fail|warn, reason?}, objFree, objHack, chestOpen, chestTrap, retreat, exitOpen.
//  - rescue: free the captive (bonus action next to it) before the end of round `rounds` (then it is executed).
//    terminal: `need` successful hacks (action next to it, best of skills vs dc). hold: rounds ending with a standing
//    hero in the zone; at victory it counts the current round. assassinate: the strongest non-boss enemy starts to flee
//    at round `fleeRound` (coward run to the edge) — kill it first. nofire: marked crates must not break, burn or get
//    fire next to them. speed: win by round N (normal / elite / boss). flawless: no one on the party side goes down.
import { emitEvent, isStanding, dealDamage } from './combat.js';
import { T_FLOOR, T_COVER, T_EXIT, chebyshev, inBounds, DIRS8, blocksMove } from './grid.js';
import { battleLevel, tierOf } from './surfaces.js';
import { objectHp } from './terrain.js';
import { skillCheck } from './skills.js';
import { rollDice } from './dice.js';

const cfg = (b) => (b.data && b.data.combat) || null;
const OBJ = (b, id) => (cfg(b)?.objectives || {})[id] || {};
export const OBJECTIVE_IDS = ['rescue', 'terminal', 'hold', 'assassinate', 'nofire', 'speed', 'flawless'];

const idxOf = (b, x, y) => y * b.grid.w + x;
const dcOf = (b, dc) => Math.round((dc?.[0] ?? 10) + (dc?.[1] ?? 0) * battleLevel(b));

function setChar(b, x, y, ch) {
  const r = b.map.grid[y] || '';
  b.map.grid[y] = r.slice(0, x) + ch + r.slice(x + 1);
}
function touchGrid(b) {
  b.gridVersion = (b.gridVersion || 0) + 1;
  b.occVersion++;
  b.reachCache = null;
}
const isFloor = (b, x, y) => inBounds(b.grid, x, y) && b.grid.tiles[idxOf(b, x, y)] === T_FLOOR && !b.occ[idxOf(b, x, y)]
  && !(b.grid.elev && b.grid.elev[idxOf(b, x, y)]);

/** Free floor tile for a blocking prop in the x-share range [f0, f1] measured from the heroes' edge. */
function placeTile(b, f0, f1) {
  const O = b.objectives, g = b.grid;
  const xs = (f) => Math.round(O.left ? f * (g.w - 1) : (1 - f) * (g.w - 1));
  const a = Math.min(xs(f0), xs(f1)), z = Math.max(xs(f0), xs(f1));
  const cands = [];
  for (let y = 1; y < g.h - 1; y++) for (let x = a; x <= z; x++) {
    if (!isFloor(b, x, y)) continue;
    let blocked = 0, nearProp = false;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(g, nx, ny) || blocksMove(g.tiles[idxOf(b, nx, ny)])) blocked++;
      if (O.props.some((p) => p.x === nx && p.y === ny)) nearProp = true;
    }
    if (blocked <= 1 && !nearProp && !O.exits.some((e) => chebyshev(e.x, e.y, x, y) <= 1)) cands.push({ x, y });
  }
  if (!cands.length) return null;
  return cands[Math.floor(b.rng() * cands.length)];
}

function addProp(b, kind, f0, f1, extra = {}) {
  const p0 = placeTile(b, f0, f1);
  if (!p0) return null;
  const p = { kind, x: p0.x, y: p0.y, ...extra };
  b.grid.tiles[idxOf(b, p.x, p.y)] = T_COVER;
  b.objectives.props.push(p);
  touchGrid(b);
  return p;
}

function placeExits(b, n) {
  const O = b.objectives, g = b.grid;
  if (b.map.win === 'reachExit') return;
  if (g.exits && g.exits.length) { O.exits = g.exits.map((e) => ({ x: e.x, y: e.y })); return; }
  const P = g.starts.P.length ? g.starts.P : b.units.filter((u) => u.team === 'heroes');
  const edge = O.left ? Math.min(...P.map((p) => p.x)) : Math.max(...P.map((p) => p.x));
  for (let k = 0; k < g.w; k++) {
    const x = O.left ? 1 + k : g.w - 2 - k;
    if (O.left ? x > edge + 1 : x < edge - 1) break;
    const col = [];
    for (let y = 1; y < g.h - 1; y++) if (isFloor(b, x, y)) col.push({ x, y });
    if (!col.length) continue;
    const pick = n >= 2 && col.length >= 2 ? [col[0], col[col.length - 1]] : [col[Math.floor(col.length / 2)]];
    for (const e of pick) { g.tiles[idxOf(b, e.x, e.y)] = T_EXIT; setChar(b, e.x, e.y, 'D'); g.exits.push(e); O.exits.push(e); }
    touchGrid(b);
    return;
  }
}

/** Speed tier of the battle: boss / elite / normal. */
function speedTier(b, C) {
  const foes = b.units.filter((u) => u.team === 'enemies' && u.kind !== 'summon');
  if (foes.some((u) => u.boss || u.arch === 'boss')) return 'boss';
  if (foes.length >= (C.eliteFrom ?? 5) || foes.some((u) => u.rank === 'elite')) return 'elite';
  return 'normal';
}

function makeGoal(b, spec) {
  const id = typeof spec === 'string' ? spec : spec?.id;
  if (!OBJECTIVE_IDS.includes(id)) return null;
  const C = OBJ(b, id);
  const g = { id, state: 'active', progress: 0, need: 0, reward: C.reward || {}, rep: (spec && spec.rep) || null };
  switch (id) {
    case 'rescue': {
      const p = addProp(b, 'captive', 0.6, 0.85);
      if (!p) return null;
      g.need = C.rounds ?? 4; g.x = p.x; g.y = p.y;
      break;
    }
    case 'terminal': {
      const p = addProp(b, 'terminal', 0.4, 0.6);
      if (!p) return null;
      g.need = C.need ?? 2; g.x = p.x; g.y = p.y; g.dc = dcOf(b, C.dc);
      break;
    }
    case 'hold': {
      const gr = b.grid, R = C.radius ?? 1;
      const cx = Math.floor(gr.w / 2), cy = Math.floor(gr.h / 2);
      let best = null;
      for (let y = 1 + R; y < gr.h - 1 - R; y++) for (let x = 1 + R; x < gr.w - 1 - R; x++) {
        let free = 0;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (!blocksMove(gr.tiles[idxOf(b, x + dx, y + dy)])) free++;
        const score = free * 10 - chebyshev(cx, cy, x, y) * 3 - Math.abs(cx - x);
        if (!best || score > best.score) best = { x, y, score };
      }
      if (!best) return null;
      g.zone = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = best.x + dx, y = best.y + dy;
        if (!blocksMove(gr.tiles[idxOf(b, x, y)])) g.zone.push({ x, y });
      }
      g.x = best.x; g.y = best.y; g.need = C.rounds ?? 3;
      break;
    }
    case 'assassinate': {
      const foes = b.units.filter((u) => u.team === 'enemies' && u.kind !== 'summon' && !u.boss && u.arch !== 'boss' && u.arch !== 'summoner');
      if (!foes.length) return null;
      const t = foes.reduce((m, u) => (u.maxHp > m.maxHp ? u : m), foes[0]);
      g.target = t.id; g.need = C.fleeRound ?? 3;
      break;
    }
    case 'nofire': {
      if (!cfg(b) || !b.objects) return null;
      const [lo, hi] = C.cargo || [2, 4];
      const mid = (o) => Math.abs(o.x - b.grid.w / 2);
      g.cargo = [...b.objects.values()].filter((o) => o.kind === 'crate' || o.kind === 'machine').sort((a, c) => mid(a) - mid(c)).slice(0, hi).map((o) => ({ x: o.x, y: o.y }));
      const def = cfg(b).objects.crate;
      for (let k = 0; g.cargo.length < lo && k < 8; k++) {
        const p0 = placeTile(b, 0.35, 0.65);
        if (!p0) break;
        const hp = objectHp(def, battleLevel(b));
        b.grid.tiles[idxOf(b, p0.x, p0.y)] = T_COVER;
        b.objects.set(idxOf(b, p0.x, p0.y), { kind: 'crate', x: p0.x, y: p0.y, hp, maxHp: hp, armor: def.armor ?? 8, cover: def.cover });
        setChar(b, p0.x, p0.y, 'c');
        g.cargo.push(p0);
        touchGrid(b);
      }
      if (!g.cargo.length) return null;
      g.need = g.cargo.length;
      break;
    }
    case 'speed': g.tier = speedTier(b, C); g.need = (C.rounds || {})[g.tier] ?? 4; break;
    case 'flawless': break;
    default: return null;
  }
  return g;
}

/**
 * Set up objectives of a battle: spec { goal?, chests?: n, retreat?: bool, exitLock?: bool }.
 * Must run after units and terrain are placed.
 */
export function initObjectives(b, spec = {}) {
  const P = b.grid.starts.P;
  const left = P.length ? P.reduce((s, p) => s + p.x, 0) / P.length < b.grid.w / 2 : true;
  b.map = { ...b.map, grid: [...b.map.grid] };
  b.objectives = { left, goal: null, props: [], exits: [], exitLock: false, retreated: [], chestsOpened: 0, chests: 0 };
  const O = b.objectives;
  if (spec.retreat) { placeExits(b, cfg(b)?.retreat?.exits ?? 2); O.exitLock = !!spec.exitLock && O.exits.length > 0; }
  const CH = cfg(b)?.chest || {};
  for (let i = 0; i < (spec.chests || 0); i++) {
    if (addProp(b, 'chest', 0.3, 0.7, { open: false, trapped: b.rng() < (CH.trap?.chance ?? 0.2), dc: dcOf(b, CH.dc) })) O.chests++;
  }
  if (spec.goal) O.goal = makeGoal(b, spec.goal);
  if (O.goal) emitEvent(b, { type: 'objective', id: O.goal.id, state: 'start', need: O.goal.need });
  return O;
}

function finish(b, g, state, reason = null) {
  if (g.state !== 'active') return;
  g.state = state;
  g.reason = reason;
  emitEvent(b, { type: 'objective', id: g.id, state, reason, progress: g.progress, need: g.need });
}

const heroSide = (u) => u.team === 'heroes' && u.kind !== 'summon';
const inZone = (b, g) => g.zone.some((z) => b.units.some((u) => heroSide(u) && isStanding(u) && u.x === z.x && u.y === z.y));
const nearCargo = (g, x, y, r) => g.cargo.some((c) => chebyshev(c.x, c.y, x, y) <= r);

/** Battle event hook (combat.js emit): progress, failure and completion of the objective; boss phase opens exits. */
export function objectiveEvent(b, e) {
  const O = b.objectives;
  if (e.type === 'phase' && O.exitLock && e.n >= (cfg(b)?.retreat?.bossPhase ?? 2)) {
    O.exitLock = false;
    emitEvent(b, { type: 'exitOpen' });
  }
  const g = O.goal;
  if (!g || g.state !== 'active') return;
  switch (e.type) {
    case 'roundStart':
      if (g.id === 'rescue' && b.round > g.need) finish(b, g, 'fail', 'executed');
      else if (g.id === 'speed' && b.round > g.need) finish(b, g, 'fail', 'slow');
      else if (g.id === 'hold' && b.round > 1) {
        if (inZone(b, g)) { g.progress++; emitEvent(b, { type: 'objective', id: g.id, state: 'progress', progress: g.progress, need: g.need }); }
        if (g.progress >= g.need) finish(b, g, 'done');
      } else if (g.id === 'assassinate' && b.round >= g.need) {
        const t = b.byId[g.target];
        if (t && isStanding(t) && !t.fleeing) {
          t.arch = 'coward'; t.fleeing = true;
          emitEvent(b, { type: 'fleeStart', actor: t.id });
          emitEvent(b, { type: 'objective', id: g.id, state: 'warn', reason: 'flees' });
        }
      }
      break;
    case 'death': case 'broken':
      if (g.id === 'assassinate' && e.target === g.target) finish(b, g, 'done');
      else if (g.id === 'flawless' && heroSide(b.byId[e.target] || {})) finish(b, g, 'fail', 'down');
      break;
    case 'down':
      if (g.id === 'flawless' && heroSide(b.byId[e.target] || {})) finish(b, g, 'fail', 'down');
      break;
    case 'flee':
      if (g.id === 'assassinate' && e.target === g.target) finish(b, g, 'fail', 'fled');
      break;
    case 'objectBreak':
      if (g.id === 'nofire' && nearCargo(g, e.x, e.y, 0)) finish(b, g, 'fail', 'broken');
      break;
    case 'objectHit':
      if (g.id === 'nofire' && nearCargo(g, e.x, e.y, 0) && b.objects.get(idxOf(b, e.x, e.y))?.burnt) finish(b, g, 'fail', 'burnt');
      break;
    case 'surfaceCreate':
      if (g.id === 'nofire' && e.kind === 'fire' && nearCargo(g, e.x, e.y, (e.size || 0) + 1)) finish(b, g, 'fail', 'burnt');
      break;
    case 'victory': {
      const won = e.winner === 'heroes';
      if (!won) { finish(b, g, 'fail', 'lost'); break; }
      if (g.id === 'speed' || g.id === 'flawless' || g.id === 'nofire') finish(b, g, 'done');
      else if (g.id === 'hold') finish(b, g, g.progress + (inZone(b, g) ? 1 : 0) >= g.need ? 'done' : 'fail', 'short');
      else if (g.id === 'assassinate') { const t = b.byId[g.target]; finish(b, g, t && (t.dead || t.broken) ? 'done' : 'fail', 'fled'); }
      else finish(b, g, 'fail', 'notDone');
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- interactions (free / hack / open)

/** Props next to u it can use now: [{ kind: free|hack|open, x, y, cost: action|bonus, why }]. */
export function interactions(b, u) {
  const O = b.objectives;
  const out = [];
  if (!O || !u || !heroSide(u) || u.kind === 'ally') return out;
  const t = b.turn;
  for (const p of O.props) {
    if (chebyshev(u.x, u.y, p.x, p.y) !== 1) continue;
    let kind = null, cost = 'action';
    if (p.kind === 'captive' && O.goal?.id === 'rescue' && O.goal.state === 'active') { kind = 'free'; cost = OBJ(b, 'rescue').cost || 'bonus'; }
    else if (p.kind === 'terminal' && O.goal?.id === 'terminal' && O.goal.state === 'active') kind = 'hack';
    else if (p.kind === 'chest' && !p.open) kind = 'open';
    if (!kind) continue;
    const why = !t || t.unitId !== u.id ? 'turn' : cost === 'bonus' ? (t.bonus > 0 ? null : 'bonus') : t.actions > 0 ? null : 'action';
    out.push({ kind, x: p.x, y: p.y, cost, why, prop: p });
  }
  return out;
}

/** Best skill of a list for u: { skill, r } rolled with b.rng (null without skills data). */
function bestCheck(b, u, skills, dc) {
  let best = null;
  for (const sk of skills || []) {
    let est;
    try { est = skillCheck(u, sk, dc, { data: b.data, rng: () => 0.5 }); } catch { continue; }
    const score = est.bonus + (est.mode === 'adv' ? 4 : est.mode === 'dis' ? -4 : 0);
    if (!best || score > best.score) best = { skill: sk, score };
  }
  if (!best) {
    const n = 1 + Math.floor(b.rng() * 20);
    return { skill: null, r: { natural: n, total: n, success: n >= dc, dc } };
  }
  return { skill: best.skill, r: skillCheck(u, best.skill, dc, { data: b.data, rng: b.rng }) };
}

/** Use the prop on tile {x, y}. Returns null or an error reason. */
export function interact(b, u, tile) {
  const it = interactions(b, u).find((i) => i.x === tile?.x && i.y === tile?.y);
  if (!it) return 'badTarget';
  if (it.why) return it.why === 'bonus' ? 'noBonus' : it.why === 'action' ? 'noAction' : it.why;
  const t = b.turn;
  if (it.cost === 'bonus') t.bonus--; else t.actions--;
  t.acted = true;
  const O = b.objectives, p = it.prop;
  if (it.kind === 'free') {
    O.props.splice(O.props.indexOf(p), 1);
    b.grid.tiles[idxOf(b, p.x, p.y)] = T_FLOOR;
    touchGrid(b);
    emitEvent(b, { type: 'objFree', actor: u.id, x: p.x, y: p.y });
    finish(b, O.goal, 'done');
  } else if (it.kind === 'hack') {
    const g = O.goal;
    const { skill, r } = bestCheck(b, u, OBJ(b, 'terminal').skills, g.dc);
    if (r.success) g.progress++;
    emitEvent(b, { type: 'objHack', actor: u.id, x: p.x, y: p.y, skill, natural: r.natural, total: r.total, dc: g.dc, success: r.success, progress: g.progress, need: g.need });
    if (g.progress >= g.need) { p.hacked = true; finish(b, g, 'done'); }
  } else {
    const CH = cfg(b)?.chest || {};
    const { skill, r } = bestCheck(b, u, CH.skills, p.dc);
    emitEvent(b, { type: 'chestOpen', actor: u.id, x: p.x, y: p.y, skill, natural: r.natural, total: r.total, dc: p.dc, success: r.success, disarmed: r.success && p.trapped });
    if (r.success) { p.open = true; p.trapped = false; O.chestsOpened++; }
    else if (p.trapped) {
      p.trapped = false;
      const tr = CH.trap || {};
      const amount = rollDice(b.rng, tr.dice || '1d6') * tierOf(battleLevel(b));
      emitEvent(b, { type: 'chestTrap', target: u.id, x: p.x, y: p.y });
      dealDamage(b, null, u, amount, tr.dmgType || 'fire');
    }
  }
  return null;
}

// ---------------------------------------------------------------- retreat

/** Why u cannot retreat now (null — can): noExit | locked | notOnExit | turn | action. */
export function retreatWhy(b, u) {
  const O = b.objectives;
  if (!O || !O.exits.length) return 'noExit';
  if (O.exitLock) return 'locked';
  if (!u || !heroSide(u) || u.kind === 'ally') return 'noExit';
  if (!O.exits.some((e) => e.x === u.x && e.y === u.y)) return 'notOnExit';
  const t = b.turn;
  if (!t || t.unitId !== u.id) return 'turn';
  if (t.actions <= 0) return 'action';
  return null;
}

/** Summary for the world: { goal: {id, state, reward, rep, reason} | null, chestsOpened, chests, retreated }. */
export function objectiveSummary(b) {
  const O = b.objectives;
  if (!O) return { goal: null, chestsOpened: 0, chests: 0, retreated: [] };
  const g = O.goal;
  return { goal: g ? { id: g.id, state: g.state, reward: g.reward, rep: g.rep, reason: g.reason || null, progress: g.progress, need: g.need } : null,
    chestsOpened: O.chestsOpened, chests: O.chests, retreated: [...O.retreated] };
}
