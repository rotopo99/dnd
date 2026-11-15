// Checker of hand-made maps (level-design.md §7.3 stage A): layers, passability, connectivity, ≥ 3 paths to the goal,
// POI density along the paths, heights, interactives, notes / secrets / battles, text length, references to NPC / item /
// enemy / encounter / skill / prop / location ids. Pure: used by tools/validate-maps.mjs, tools/test.mjs and the editor.
import { LEVEL_RULES as LR } from '../data/world/level-design.js';
import { parseMap, findPath, reachable, blocksMove, T_WATER, T_WALL, T_COVER } from '../rules/grid.js';
import { loadHandmade } from './handmade.js';

const DOORS = new Set(['door', 'hatch']);
const OBJ_TYPES = new Set(['note', 'secret', 'lever', 'door', 'hatch', 'sign', 'stall', 'bed', 'stash', 'bench', 'terminal', 'fire', 'well', 'exit']);
const OPS = new Set(['battle', 'toast', 'codex', 'flag', 'open']);

/** Walkable grid of the map: water and solid objects block; doors closed (open = false) or all open. */
export function checkGrid(map, open) {
  const g = parseMap({ grid: map.grid, ...(map.elev ? { elev: map.elev } : {}) });
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === T_WATER) g.tiles[i] = T_WALL;
  for (const o of map.objects) {
    if (o.type === 'exit') continue;
    if (DOORS.has(o.type) ? !open : o.solid) g.tiles[o.y * g.w + o.x] = T_COVER;
  }
  return g;
}

/** Route of a path: A* between consecutive points → [[x, y]…] (start included) or { error }. */
export function routeOf(g, pts) {
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const p = ax === bx && ay === by ? [] : findPath(g, ax, ay, bx, by, null);
    if (!p) return { error: i };
    for (const c of p) out.push([c.x, c.y]);
  }
  return out;
}

/**
 * validateHandmade(def, refs?) → { errors: [string], warnings: [string], stats }.
 * refs — { NPCS, ITEMS, ENEMIES, ENCOUNTERS, LOCATIONS, SKILLS, PROPS }; a missing table skips its reference check.
 */
export function validateHandmade(def, refs = {}) {
  const errors = [], warnings = [];
  const E = (s) => errors.push(s), Wn = (s) => warnings.push(s);
  const fl = def?.ascii?.floor;
  if (!def?.id) E('no id');
  if (!Array.isArray(fl) || !fl.length) { E('no ascii.floor'); return { errors, warnings, stats: {} }; }
  const H = fl.length, W = fl[0].length;
  fl.forEach((r, y) => { if (r.length !== W) E(`floor row ${y}: width ${r.length} ≠ ${W}`); });
  for (const k of ['elev', 'objs']) {
    const rows = def.ascii[k];
    if (!rows) continue;
    if (rows.length !== H) E(`${k}: ${rows.length} rows ≠ ${H}`);
    rows.forEach((r, y) => { if (r.length !== W) E(`${k} row ${y}: width ${r.length} ≠ ${W}`); });
  }
  (def.ascii.elev || []).forEach((r, y) => [...r].forEach((ch, x) => { if (!/[0-9. ]/.test(ch)) E(`elev ${x},${y}: '${ch}' is not a digit`); }));
  if (errors.length) return { errors, warnings, stats: {} };

  const arena = def.kind === 'arena';
  const scale = def.scale || LR.scale;
  const map = loadHandmade(def);
  const gOpen = checkGrid(map, true), gClosed = checkGrid(map, false);
  const pass = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && !blocksMove(g.tiles[y * g.w + x]);
  const inside = (p) => Array.isArray(p) && p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H;

  // ids
  const ids = new Set();
  for (const o of [...(def.objects || []), ...(def.battles || []), ...(def.triggers || [])]) {
    if (!o.id) E(`object without id (${o.type || 'battle/trigger'})`);
    else if (ids.has(o.id)) E(`duplicate id ${o.id}`);
    ids.add(o.id);
  }
  for (const o of def.objects || []) {
    if (!OBJ_TYPES.has(o.type)) E(`${o.id}: unknown type ${o.type}`);
    if (!inside([o.x, o.y])) { E(`${o.id}: outside the map`); continue; }
    if (fl[o.y][o.x] === '#' || fl[o.y][o.x] === 'w') E(`${o.id}: stands on a wall / water (${o.x},${o.y})`);
  }

  // texts
  const text = (who, s) => { if (s && s.length > LR.textMax) E(`${who}: text ${s.length} > ${LR.textMax}`); };
  for (const o of def.objects || []) text(o.id, o.text);
  for (const t of def.triggers || []) for (const op of t.do || []) text(t.id, op.text);
  for (const b of def.battles || []) text(b.id, b.brief);

  // references
  const ref = (table, id, who) => { if (refs[table] && !refs[table][id]) E(`${who}: unknown ${table} id '${id}'`); };
  if (def.loc) ref('LOCATIONS', def.loc, 'loc');
  for (const n of def.npcs || []) { ref('NPCS', n.npc, 'npcs'); if (!pass(gOpen, n.x, n.y)) E(`npc ${n.npc}: cell ${n.x},${n.y} is not walkable`); }
  for (const p of def.props || []) ref('PROPS', p.id, 'props');
  for (const o of def.objects || []) {
    for (const l of o.loot || []) if (l.item) ref('ITEMS', l.item, o.id);
    if (o.check?.skill) ref('SKILLS', o.check.skill, o.id);
    if (o.lock?.skill) ref('SKILLS', o.lock.skill, o.id);
    if (o.type === 'exit' && o.to && o.to !== 'world') ref('LOCATIONS', o.to, o.id);
    for (const d of o.opens || []) if (!(def.objects || []).some((x) => x.id === d && DOORS.has(x.type))) E(`${o.id}: opens unknown door ${d}`);
    if (o.lock === 'lever' && !(def.objects || []).some((x) => x.type === 'lever' && (x.opens || []).includes(o.id))) E(`${o.id}: locked by a lever, no lever opens it`);
  }
  for (const b of def.battles || []) {
    if (b.encounter) ref('ENCOUNTERS', b.encounter, b.id);
    for (const e of b.enemies || []) ref('ENEMIES', e, b.id);
    if (!b.encounter && !(b.enemies || []).length) E(`${b.id}: no encounter / enemies`);
    if (!(b.foes || []).length) E(`${b.id}: no foe cells`);
    for (const f of b.foes || []) if (!pass(gOpen, f[0], f[1])) E(`${b.id}: foe cell ${f} is not walkable`);
    if (b.rect && (b.rect[2] < 8 || b.rect[3] < 6)) Wn(`${b.id}: the cut ${b.rect[2]}×${b.rect[3]} is tiny`);
  }
  for (const t of def.triggers || []) {
    if (t.when?.event !== 'enter' || !t.when.rect) E(`${t.id}: only when {event:'enter', rect} is supported`);
    for (const op of t.do || []) {
      if (!OPS.has(op.op)) E(`${t.id}: unknown op ${op.op}`);
      if (op.op === 'battle' && !(def.battles || []).some((b) => b.id === op.id)) E(`${t.id}: battle ${op.id} not found`);
      if (op.op === 'open' && !(def.objects || []).some((x) => x.id === op.door)) E(`${t.id}: door ${op.door} not found`);
    }
  }
  if (refs.ENCOUNTERS || refs.ENEMIES) for (const b of def.battles || []) if (!(def.triggers || []).some((t) => (t.do || []).some((op) => op.op === 'battle' && op.id === b.id))) Wn(`${b.id}: no trigger starts it`);

  // heights
  const levels = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pass(gOpen, x, y)) levels.add(gOpen.elev ? gOpen.elev[y * W + x] : 0);
  if (levels.size < LR.minLevels) E(`heights: ${levels.size} walkable levels < ${LR.minLevels}`);

  // connectivity
  const sp = map.spawn.world;
  const stats = { size: [W, H], levels: [...levels].sort(), scale };
  if (arena) {
    const a = parseMap({ grid: def.ascii.floor.map((r, y) => [...r].map((ch, x) => ('PEAB'.includes(def.ascii.objs?.[y]?.[x]) ? def.ascii.objs[y][x] : ch)).join('')), ...(map.elev ? { elev: map.elev } : {}) });
    const st = [...a.starts.P, ...a.starts.A, ...a.starts.E, ...a.starts.F];
    const hasB = (def.ascii.objs || []).some((r) => r.includes('B'));
    if (!a.starts.P.length || !a.starts.E.length || !hasB) E('arena: needs P, E and B starts');
    if (st.length) {
      const r = reachable(a, st[0].x, st[0].y, 9999, null);
      for (const p of st) if (r.dist[p.y * a.w + p.x] < 0) E(`arena: start ${p.x},${p.y} is cut off`);
    }
  } else {
    if (!inside(sp) || !pass(gClosed, sp[0], sp[1])) E(`spawn ${sp} is not walkable`);
    const rc = reachable(gClosed, sp[0], sp[1], 99999, null), ro = reachable(gOpen, sp[0], sp[1], 99999, null);
    const near = (r, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && r.dist[ny * W + nx] >= 0) return true; } return false; };
    for (const o of map.objects) {
      const cells = o.cells || [[o.x, o.y]];
      const r = o.type === 'exit' ? rc : ro;
      if (!cells.some(([x, y]) => near(r, x, y))) E(`${o.id}: unreachable from the spawn${o.type === 'exit' ? ' (doors closed)' : ''}`);
      if (o.stand && ro.dist[o.stand[1] * W + o.stand[0]] < 0) E(`${o.id}: stand unreachable`);
    }
    for (const b of def.battles || []) for (const f of b.foes || []) if (ro.dist[f[1] * W + f[0]] < 0) E(`${b.id}: foe ${f} unreachable`);
    for (const t of def.triggers || []) {
      const [rx, ry, rw, rh] = t.when?.rect || [0, 0, 0, 0];
      let ok = false;
      for (let y = ry; y < ry + rh && !ok; y++) for (let x = rx; x < rx + rw; x++) if (x < W && y < H && ro.dist[y * W + x] >= 0) { ok = true; break; }
      if (!ok) E(`${t.id}: trigger rect unreachable`);
    }
    if (def.goal && rc.dist[def.goal[1] * W + def.goal[0]] < 0) E(`goal ${def.goal} unreachable with doors closed (the direct way must work)`);
    if (!def.goal) E('no goal');

    // paths
    const paths = def.paths || [];
    if (paths.length < LR.minPaths) E(`paths: ${paths.length} < ${LR.minPaths}`);
    for (const k of LR.needKinds) if (!paths.some((p) => p.kind === k)) E(`paths: no '${k}' path`);
    if (!paths.some((p) => p.kind === 'hidden')) Wn('paths: no hidden path');
    const anchors = [
      ...(def.poi || []).map((p) => p.at), ...map.objects.filter((o) => o.type !== 'exit').map((o) => [o.x, o.y]),
      ...(def.battles || []).flatMap((b) => b.foes || []), ...(def.npcs || []).map((n) => [n.x, n.y]), sp,
    ];
    const isAnchor = (x, y) => anchors.some((a) => Math.max(Math.abs(a[0] - x), Math.abs(a[1] - y)) <= LR.poiNear);
    const routes = [];
    let maxGap = 0;
    for (const p of paths) {
      if (!LR.pathKinds.includes(p.kind)) E(`path ${p.id}: unknown kind ${p.kind}`);
      if (!(p.pts || []).length) { E(`path ${p.id}: no points`); continue; }
      const bad = p.pts.find((q) => !inside(q) || !pass(gOpen, q[0], q[1]));
      if (bad) { E(`path ${p.id}: point ${bad} is not walkable`); continue; }
      const r = routeOf(gOpen, p.pts);
      if (r.error) { E(`path ${p.id}: no way from point ${r.error - 1} to ${r.error}`); continue; }
      routes.push({ p, r });
      if (def.goal) { const last = p.pts[p.pts.length - 1]; if (Math.max(Math.abs(last[0] - def.goal[0]), Math.abs(last[1] - def.goal[1])) > 1) Wn(`path ${p.id}: does not end at the goal`); }
      if (p.kind === 'vertical' && !r.some(([x, y]) => (gOpen.elev?.[y * W + x] || 0) >= LR.verticalLevel)) E(`path ${p.id}: vertical but never climbs to level ${LR.verticalLevel}`);
      if (p.kind === 'hidden' && !r.some(([x, y]) => map.objects.some((o) => DOORS.has(o.type) && o.x === x && o.y === y && (o.lock?.skill || o.type === 'hatch')))) Wn(`path ${p.id}: hidden but passes no locked door / hatch`);
      // POI density: metres walked since the last point of interest
      let acc = 0, worst = 0, at = null;
      for (let i = 0; i < r.length; i++) {
        const [x, y] = r[i];
        if (i) acc += (x !== r[i - 1][0] && y !== r[i - 1][1] ? Math.SQRT2 : 1) * scale;
        if (isAnchor(x, y)) acc = 0;
        if (acc > worst) { worst = acc; at = [x, y]; }
      }
      maxGap = Math.max(maxGap, worst);
      if (worst > LR.poiGap) E(`path ${p.id}: ${worst.toFixed(1)} m without a point of interest (near ${at})`);
    }
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const A = new Set(routes[i].r.map((c) => `${c[0]},${c[1]}`)), B = routes[j].r.map((c) => `${c[0]},${c[1]}`);
      const sh = B.filter((k) => A.has(k)).length / Math.min(A.size, B.length);
      if (sh > LR.maxOverlap) E(`paths ${routes[i].p.id} / ${routes[j].p.id}: ${Math.round(sh * 100)}% shared — the same way`);
    }
    stats.paths = routes.map((x) => `${x.p.id}:${x.p.kind}:${x.r.length}`);
    stats.maxGap = +maxGap.toFixed(1);

    // content density
    const objs = def.objects || [];
    const kinds = new Set(objs.filter((o) => ['lever', 'door', 'hatch', 'secret', 'terminal'].includes(o.type)).map((o) => o.type));
    if (map.objects.some((o) => o.type === 'terminal')) kinds.add('terminal');
    for (const r of fl) { if (/[bg]/.test(r)) kinds.add('barrel'); if (r.includes('~')) kinds.add('trap'); if (r.includes('w')) kinds.add('water'); }
    if ((def.surfaces || []).length) kinds.add('surface');
    if (kinds.size < LR.minInteract) E(`interactives: ${kinds.size} kinds (${[...kinds]}) < ${LR.minInteract}`);
    const nN = objs.filter((o) => o.type === 'note').length, nS = objs.filter((o) => o.type === 'secret').length, nB = (def.battles || []).length;
    if (nN < LR.notes[0]) E(`notes: ${nN} < ${LR.notes[0]}`); else if (nN > LR.notes[1]) Wn(`notes: ${nN} > ${LR.notes[1]}`);
    if (nS < LR.secrets[0]) E(`secrets: ${nS} < ${LR.secrets[0]}`); else if (nS > LR.secrets[1]) Wn(`secrets: ${nS} > ${LR.secrets[1]}`);
    if (nB < LR.battles[0]) E(`battles: ${nB} < ${LR.battles[0]}`); else if (nB > LR.battles[1]) Wn(`battles: ${nB} > ${LR.battles[1]}`);
    for (const o of objs) {
      if (o.type === 'note' && !o.text) E(`${o.id}: a note without text`);
      if (o.type === 'secret' && !o.check?.skill) E(`${o.id}: a secret without a skill check`);
      if (o.type === 'secret' && !(o.loot || []).length) E(`${o.id}: a secret without loot`);
    }
    Object.assign(stats, { notes: nN, secrets: nS, battles: nB, interact: [...kinds] });
  }
  return { errors, warnings, stats };
}

/** Several maps: each map + note ids unique across maps. → { [id]: result } (result `_all` for cross-map errors). */
export function validateAll(defs, refs = {}) {
  const out = {}, notes = new Map(), all = [];
  for (const d of defs) {
    out[d.id] = validateHandmade(d, refs);
    for (const o of d.objects || []) {
      if (o.type !== 'note' && o.type !== 'secret') continue;
      if (notes.has(o.id)) all.push(`${o.type} id ${o.id} in ${d.id} and ${notes.get(o.id)}`);
      notes.set(o.id, d.id);
    }
  }
  out._all = { errors: all, warnings: [], stats: {} };
  return out;
}
