// Hand-made maps (level-design.md §7.2): ASCII layers (floor / elev / objs) + JSON (props, objects, battles, triggers,
// paths, POI) → a free node map compatible with roam-gen.js (grid, elev, objects, spots, spawn) and a battle def for
// boss arenas. Battles embedded in a place start on a cut of the same map (roam-battle.js keeps elev / props).
// Pure: no DOM. Data — data/maps/handmade/*.js; checks — world/handmade-check.js; editor — game/editor.html.
import { PROPS } from '../assets/props.js';
import { MARKERS } from './roam-gen.js';

/** Default `solid` of hand-made object types (doors / hatches — while closed). */
export const OBJ_SOLID = { note: false, secret: false, lever: true, door: true, hatch: true, sign: true };

const SPOT = 'n', STAND = 's', SPAWN = '@';
const ARENA_STARTS = new Set(['P', 'E', 'A', 'B', 'F']);

/** Rows of a layer as arrays (missing → filler). */
function layer(rows, W, H, fill) {
  return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => rows?.[y]?.[x] ?? fill));
}

/** Elevation rows of digits ('.' / ' ' → 0); null when the map is flat. */
export function elevRows(def) {
  const rows = def.ascii?.elev;
  if (!rows?.length) return null;
  const out = rows.map((r) => [...r].map((ch) => (/[0-9]/.test(ch) ? ch : '0')).join(''));
  return out.some((r) => /[1-9]/.test(r)) ? out : null;
}

/** Props with their footprint (PROPS: w, h, cover, blocks). Unknown ids are kept as 1×1 blocks (the checker reports them). */
export function propsOf(def) {
  return (def.props || []).map((p) => {
    const P = PROPS[p.id] || {};
    return { id: p.id, x: p.x, y: p.y, w: p.w || P.w || 1, h: p.h || P.h || 1, cover: P.cover ?? null, blocks: P.blocks ?? true, ...(p.tags ? { tags: p.tags } : {}) };
  });
}

/** Exit runs from 'D' cells of the floor (4-neighbour groups) → [{ cells, in }]. */
export function exitRuns(floor) {
  const H = floor.length, W = floor[0].length, seen = new Set(), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (floor[y][x] !== 'D' || seen.has(`${x},${y}`)) continue;
    const cells = [], q = [[x, y]];
    seen.add(`${x},${y}`);
    while (q.length) {
      const [cx, cy] = q.shift();
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
        if (floor[ny]?.[nx] === 'D' && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    let inn = null;
    for (const [cx, cy] of cells) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inn && nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && floor[ny][nx] !== 'D' && floor[ny][nx] !== '#') inn = [nx, ny];
    }
    out.push({ cells, in: inn || cells[0] });
  }
  return out;
}

/**
 * Hand-made def → free node map (the shape of generateRoam): { id, hand, type, size, grid, elev, biome, props, objects,
 * spots, zones, spawn: { world }, battles, triggers, npcPos, scale }. Blocking props stamp 'c' / 'C' / 'f' on floor cells.
 */
export function loadHandmade(def) {
  const floorRows = def.ascii.floor;
  const H = floorRows.length, W = Math.max(...floorRows.map((r) => r.length));
  const g = layer(floorRows, W, H, '#');
  const o = layer(def.ascii.objs, W, H, '.');
  const props = propsOf(def);
  for (const p of props) {
    if (!p.blocks) continue;
    const ch = p.cover === 'full' ? 'C' : p.cover === 'half' ? 'c' : 'f';
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) if (g[p.y + dy]?.[p.x + dx] === '.') g[p.y + dy][p.x + dx] = ch;
  }
  const objects = [], spots = [], stands = [], counts = {};
  let spawn = def.spawn?.world || null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = o[y][x];
    const M = def.kind === 'arena' ? null : MARKERS[ch]; // arenas: P / E / A / B are starts
    if (M) {
      const n = counts[M.type] = (counts[M.type] || 0) + 1;
      objects.push({ id: `${M.type}${n}`, type: M.type, x, y, solid: M.solid, ...(M.boat ? { to: 'world', boat: true } : {}) });
    } else if (ch === SPOT) spots.push([x, y]);
    else if (ch === STAND) stands.push([x, y]);
    else if (ch === SPAWN && !spawn) spawn = [x, y];
  }
  for (const ob of def.objects || []) {
    if (ob.type === 'exit') { objects.push({ to: 'world', ...ob, solid: false }); continue; } // an exit inside the map (a hatch down)
    const solid = ob.solid ?? OBJ_SOLID[ob.type] ?? MARKERS[Object.keys(MARKERS).find((k) => MARKERS[k].type === ob.type)]?.solid ?? true;
    objects.push({ ...ob, solid });
  }
  for (const ob of objects) {
    if (ob.type !== 'stall' || ob.stand) continue;
    let best = null, bd = 9;
    for (const s of stands) { const d = Math.abs(s[0] - ob.x) + Math.abs(s[1] - ob.y); if (d < bd) { bd = d; best = s; } }
    if (best) ob.stand = best;
  }
  const runs = exitRuns(g);
  runs.forEach((e, i) => {
    const ex = (def.exits || []).find((d) => d.cells?.some(([x, y]) => e.cells.some(([cx, cy]) => cx === x && cy === y)));
    objects.push({ id: ex?.id || `exit${i + 1}`, type: 'exit', to: ex?.to || 'world', label: ex?.label, x: e.cells[0][0], y: e.cells[0][1], cells: e.cells, solid: false });
  });
  if (!spawn) spawn = runs[0]?.in || [W >> 1, H >> 1];
  const npcPos = Object.fromEntries((def.npcs || []).map((n) => [n.npc, [n.x, n.y]]));
  return {
    id: def.loc || def.id, hand: def.id, type: def.type || 'hub', name: def.name, size: [W, H], grid: g.map((r) => r.join('')), elev: elevRows(def),
    biome: def.biome || 'ruins-city', props, objects, spots, zones: (def.zones || []).filter((z) => z.rect), spawn: { world: spawn },
    battles: def.battles || [], triggers: def.triggers || [], npcPos, scale: def.scale || 1.5, scenario: def.scenario || null,
    ...(def.tod ? { tod: def.tod } : {}), ...(def.weather ? { weather: def.weather } : {}),
  };
}

/** Flag of a hand-made object / battle / trigger state in save.flags. */
export const handKey = (locId, id) => `roam:${locId}:${id}`;
/** Codex note key in save.codex.flags (panel «Записки»). */
export const noteKey = (id) => `note:${id}`;
/** Cache id of a secret (save.caches, location searchCache). */
export const secretCache = (o) => ({ id: `hm:${o.id}`, check: o.check || null, loot: o.loot || [], text: o.text || '' });

/**
 * Live state of hand-made objects (mutates copies from liveObjects): doors / hatches open by flag, levers pulled, notes
 * read (codex flag), secrets found (save.caches). Doors that are open stop being solid.
 */
export function liveHand(objs, locId, save) {
  const flags = save?.flags || {}, notes = save?.codex?.flags || [];
  for (const o of objs) {
    if (o.type === 'door' || o.type === 'hatch') { o.opened = !!flags[handKey(locId, o.id)]; o.solid = !o.opened; }
    else if (o.type === 'lever') o.opened = !!flags[handKey(locId, o.id)];
    else if (o.type === 'note') o.opened = notes.includes(noteKey(o.id));
    else if (o.type === 'secret') { o.cache = secretCache(o); o.opened = (save?.caches || []).includes(o.cache.id); }
  }
  return objs;
}

/** Write door state into a walkable grid (roamGrid): a closed door blocks like cover, an open one is floor. */
export function applyDoors(grid, map, objs) {
  for (const o of objs) {
    if (o.type !== 'door' && o.type !== 'hatch') continue;
    const i = o.y * grid.w + o.x;
    grid.tiles[i] = o.solid ? 2 : base(map.grid[o.y][o.x]);
  }
  return grid;
}
const base = (ch) => (ch === '#' ? 1 : 0);

/** Point inside rect [x, y, w, h]. */
export const inRect = (r, x, y) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];

/**
 * Triggers that fire for a party member stepping on (x, y): `when.event === 'enter'` with `rect`, `if` (flag / noflag),
 * `once` (flag roam:<loc>:<id>). → [{ trigger, ops }] — the scene runs the ops (battle / toast / codex / flag / open).
 */
export function triggersAt(map, locId, save, x, y) {
  const flags = save?.flags || {}, out = [];
  for (const tr of map.triggers || []) {
    if (tr.when?.event !== 'enter' || !tr.when.rect || !inRect(tr.when.rect, x, y)) continue;
    if (tr.once !== false && flags[handKey(locId, `t:${tr.id}`)]) continue;
    if (tr.if?.flag && !flags[tr.if.flag]) continue;
    if (tr.if?.noflag && flags[tr.if.noflag]) continue;
    out.push({ trigger: tr, ops: tr.do || [] });
  }
  return out;
}

/** An embedded battle by id, unless already won (flag roam:<loc>:b:<id>). */
export function battleOf(map, locId, save, id) {
  const b = (map.battles || []).find((x) => x.id === id);
  return b && !save?.flags?.[handKey(locId, `b:${b.id}`)] ? b : null;
}

/** Region of an embedded battle's cut ([x, y, w, h] in the map) → { x, y, w, h } or null. */
export const battleRegion = (b) => (b?.rect ? { x: b.rect[0], y: b.rect[1], w: b.rect[2], h: b.rect[3] } : null);

/**
 * Boss arena def (battle map): floor + elev, starts from the objs layer (P / A / E, B = the boss), the boss start goes to
 * index bossIndex of starts.E. → map def for createBattle.
 */
export function handArenaDef(def, { id = 'world', bossIndex = 0, weather = null, tod = null } = {}) {
  const m = loadHandmade({ ...def, objects: [] });
  const o = layer(def.ascii.objs, m.size[0], m.size[1], '.');
  const rows = m.grid.map((r) => [...r]);
  let boss = null;
  const es = [];
  o.forEach((r, y) => r.forEach((ch, x) => {
    if (!ARENA_STARTS.has(ch)) return;
    if (ch === 'B') { boss = [x, y]; rows[y][x] = 'E'; return; }
    rows[y][x] = ch;
    if (ch === 'E') es.push([x, y]);
  }));
  const out = { id, name: def.name, biome: m.biome, grid: rows.map((r) => r.join('')), props: m.props, enemies: [], allies: [], win: 'killAll', lose: 'allDown',
    template: `hand:${def.id}`, ...(m.elev ? { elev: m.elev } : {}), weather: weather || def.weather || 'clear', tod: tod || def.tod || 'day' };
  if (boss) { es.splice(Math.max(0, Math.min(es.length, bossIndex)), 0, boss); out.starts = { E: es }; }
  if (def.surfaces) out.surfaces = def.surfaces;
  return out;
}
