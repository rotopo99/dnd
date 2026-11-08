// Battlefields (docs/specs/battlefields.md): tile biome of a battle / node, templates 22×12 with props, boss arenas,
// weather and time of day. Pure data shaping (runs in Node): the result is a map def for rules/grid.js parseMap:
//   { grid, biome, weather, tod, props: [{id, x, y, w, h, cover, blocks, destructible, hp, debris}], surfaces: [{kind, x, y}],
//     starts?: {E: [[x, y]]} (boss first), template? }
// Rules see props through chars: half cover 'c', full 'C', blocking without cover 'f' (T_BLOCK), deep water 'W' (T_BLOCK),
// fire '~', rubble ','; terrain.js reads def.props for hp / debris (destructible) or makes them static.
import { BATTLEFIELD as BF, WEATHER, BIOMES } from '../data/combat.js';
import { TEMPLATES, BOSS_ARENAS } from '../data/maps/fields/layouts.js';
import { PROPS, PROP_IDS } from '../assets/props.js';
import { BIOME_IDS } from '../assets/tilesets.js';
import { parseMap, reachable, blocksMove, DIRS8 } from '../rules/grid.js';

export { TEMPLATES, BOSS_ARENAS };
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Small deterministic rng (LCG) from a number / string seed. */
export function fieldRng(seed) {
  let s = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  if (!s) s = 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Tile biome (one of 9 BIOME_IDS): explicit (new id or old BIOMES id) > region (main 70%, variants share the rest by seed)
 * > faction (as region) > hazard > wasteland.
 */
export function tileBiomeOf({ biome = null, region = null, faction = null, hazard = null, seed = 0 } = {}) {
  if (biome && BIOME_IDS.includes(biome)) return biome;
  if (biome && BF.legacy[biome]) return BF.legacy[biome];
  const list = BF.regions[region] || BF.regions[faction];
  if (list) {
    const r = fieldRng(`${seed}:biome`)();
    if (list.length === 1 || r < BF.mainWeight) return list[0];
    return list[1 + Math.min(list.length - 2, Math.floor(((r - BF.mainWeight) / (1 - BF.mainWeight)) * (list.length - 1)))];
  }
  if (hazard && BF.hazard[hazard]) return BF.hazard[hazard];
  return 'wasteland';
}

/** Weather and time of day of a battle: time from the game day (WEATHER.cycle), weather by seed (clear 55%), filtered by biome. */
export function pickWeather(biome, seed = 0, day = 1) {
  const [times, weathers] = WEATHER.allowed[biome] || [['day'], []];
  const cyc = WEATHER.cycle[((day | 0) + (seed >>> 0)) % WEATHER.cycle.length];
  const tod = times.includes(cyc) ? cyc : times[0];
  const r = fieldRng(`${seed}:weather`);
  const weather = !weathers.length || r() < WEATHER.clearChance ? 'clear' : weathers[Math.floor(r() * weathers.length)];
  return { tod, weather };
}

/** Sight range (cells, 0 = unlimited) and light radius of a map def's weather / time. */
export function visionOf(def) {
  const T = WEATHER.tod[def?.tod] || WEATHER.tod.day, Wd = WEATHER.weather[def?.weather] || WEATHER.weather.clear;
  const vs = [T.vis, Wd.vis].filter((v) => v > 0);
  const dark = def?.tod === 'night' || !!Wd.dark;
  return { vis: vs.length ? Math.min(...vs) : 0, light: dark ? (WEATHER.tod.night.light || 3) : 0, dark };
}

/** Props that fit a biome and a slot: cover 'half' | 'full', max width. */
export function propsFor(biome, cover, maxW = 1, { only = null } = {}) {
  return PROP_IDS.filter((id) => {
    const p = PROPS[id];
    if (only ? !only.includes(id) : BF.slotSkip.includes(id)) return false;
    if (cover !== undefined && p.cover !== cover) return false;
    if (p.w > maxW || p.h !== 1) return false;
    return p.biomes.includes('*') || p.biomes.includes(biome);
  });
}

const FLOOR = new Set(['.', '=']);
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

function propEntry(id, x, y) {
  const p = PROPS[id];
  return { id, x, y, w: p.w, h: p.h, cover: p.cover, blocks: p.blocks, destructible: p.destructible, hp: p.hp, debris: p.debris };
}
const coverChar = (cover, blocks) => (cover === 'full' ? 'C' : cover === 'half' ? (blocks ? 'c' : ',') : blocks ? 'f' : '.');

/** Cells of '~' flood-connected to the map edge (deep water). */
function deepCells(g) {
  const H = g.length, W = g[0].length, seen = new Set(), st = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && g[y][x] === '~') st.push([x, y]);
  while (st.length) {
    const [x, y] = st.pop(), k = `${x},${y}`;
    if (seen.has(k) || g[y]?.[x] !== '~') continue;
    seen.add(k);
    st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/**
 * Paint a raw layout (template / boss arena / procedural grid) with a biome: slots -> props + rule chars, pools -> surfaces.
 * g — array of char arrays (mutated). Returns { props, surfaces }.
 */
export function fillSlots(g, biome, rnd, { plain = BF.plainCover, drop = BF.dropCover } = {}) {
  const H = g.length, W = g[0].length;
  const props = [], surfaces = [];
  const deep = deepCells(g);
  const src = g.map((r) => r.slice());
  const freeRight = (x, y, w) => { for (let i = 1; i < w; i++) if (x + i >= W || !FLOOR.has(src[y][x + i]) || g[y][x + i] !== src[y][x + i]) return false; return true; };
  const place = (id, x, y) => {
    const e = propEntry(id, x, y);
    props.push(e);
    for (let i = 0; i < e.w; i++) g[y][x + i] = coverChar(e.cover, e.blocks);
    return e;
  };
  const liquid = BF.liquid[biome] || 'water';
  // heights h / H; a non-height cell boxed by ≥ 2 raised neighbours (the boss spot on a dais) takes their height
  const ev = src.map((r) => r.map((ch) => (ch === 'h' ? 1 : ch === 'H' ? 2 : 0)));
  let elev = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ev[y][x] || src[y][x] === '#') continue;
    const ns = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ev[y + dy]?.[x + dx] || 0).filter((v) => v > 0);
    if (ns.length >= 2) ev[y][x] = Math.max(...ns);
  }
  if (ev.some((r) => r.some((v) => v))) elev = ev.map((r) => r.join(''));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = src[y][x];
    if (g[y][x] !== ch) continue; // already taken by a wide prop
    switch (ch) {
      case '~':
        if (deep.has(`${x},${y}`)) g[y][x] = 'W';
        else if (liquid === 'water') g[y][x] = 'w';
        else { g[y][x] = '.'; surfaces.push({ kind: liquid, x, y }); }
        break;
      case 'h': case 'H': g[y][x] = '.'; break; // heights go to def.elev
      case 'x': g[y][x] = ','; break;
      case 'B': g[y][x] = 'E'; break;
      case 'f': place('fence', x, y); break;
      case 's': place('server', x, y); break;
      case 't': place('tower', x, y); break;
      case 'k': props.push(propEntry('campfire', x, y)); g[y][x] = '~'; break;
      case 'T': if (freeRight(x, y, 2)) place('tent', x, y); else g[y][x] = 'c'; break;
      case 'b': {
        const ok = ['barrel', 'barrel-toxic'].filter((id) => PROPS[id].biomes.includes(biome));
        g[y][x] = (ok.length ? pick(rnd, ok) : 'barrel') === 'barrel-toxic' ? 'g' : 'b';
        break;
      }
      case 'v': {
        const vs = propsFor(biome, undefined, 3, { only: BF.vehicles }).filter((id) => PROPS[id].w === 1 || freeRight(x, y, PROPS[id].w));
        if (vs.length) place(pick(rnd, vs), x, y);
        else { const alt = propsFor(biome, 'full'); if (alt.length) place(pick(rnd, alt), x, y); else g[y][x] = 'C'; }
        break;
      }
      case 'c': case 'C': {
        const cover = ch === 'c' ? 'half' : 'full';
        if (ch === 'c' && rnd() < drop) { g[y][x] = '.'; break; }
        const list = propsFor(biome, cover);
        if (!list.length || rnd() < plain) break; // plain tile
        place(pick(rnd, list), x, y);
        break;
      }
      default: break;
    }
  }
  return { props, surfaces, elev };
}

/** Mirror a layout horizontally; hero / enemy sides swap (P/A <-> E). */
function mirrorRows(rows) {
  return rows.map((r) => [...r].reverse().map((ch) => (ch === 'P' || ch === 'A' ? 'E' : ch === 'E' ? 'P' : ch)));
}

/** Make sure there are ≥ n starts `ch` (adds them on free floor nearest to the side's existing starts). */
function ensureStarts(g, ch, n, side) {
  const H = g.length, W = g[0].length;
  const have = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ch) have.push([x, y]);
  if (have.length >= n) return;
  const anchors = have.length ? have : [[side === 'left' ? 2 : W - 3, H >> 1]];
  const cand = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!FLOOR.has(g[y][x])) continue;
    if (side === 'left' ? x > W / 2 - 3 : x < W / 2 + 2) continue;
    const d = Math.min(...anchors.map(([ax, ay]) => Math.max(Math.abs(ax - x), Math.abs(ay - y))));
    cand.push([d, x, y]);
  }
  cand.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  for (const [, x, y] of cand.slice(0, n - have.length)) g[y][x] = ch;
}

/** Hero side: after a mirror the former E cells are P; two of them become A (allies). */
function normalizeStarts(g, mirrored) {
  if (!mirrored) return;
  const ps = [];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === 'P') ps.push([x, y]);
  ps.sort((a, b) => b[0] - a[0]).slice(0, 2).forEach(([x, y]) => { g[y][x] = 'A'; });
}

/** Rain: a few small water puddles on free floor of the middle. */
function addPuddles(g, rnd, [a, b]) {
  const H = g.length, W = g[0].length, n = a + Math.floor(rnd() * (b - a + 1));
  for (let i = 0; i < n; i++) {
    const cx = 6 + Math.floor(rnd() * (W - 12)), cy = 2 + Math.floor(rnd() * (H - 4));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) if (g[cy + dy]?.[cx + dx] === '.' && rnd() < 0.8) g[cy + dy][cx + dx] = 'w';
  }
}

/** Template id for a place: location kind / biome / ambush candidates, else any (by seed). */
export function templateFor({ kind = null, biome = null, ambush = false, seed = 0 } = {}) {
  const cand = (ambush && BF.ambush) || BF.byKind[kind] || BF.byBiome[biome] || TEMPLATE_IDS;
  return cand[Math.floor(fieldRng(`${seed}:tpl`)() * cand.length)];
}

/**
 * Map def of a template / boss arena.
 * { template | boss (enemy id), biome, seed, enemies (count), bossIndex, weather, tod, id }
 */
export function buildField({ template = null, boss = null, biome = null, seed = 1, enemies = 4, bossIndex = 0, weather = null, tod = null, day = 1, id = 'world', mirror = null } = {}) {
  const arena = boss ? BOSS_ARENAS[boss] : null;
  const src = arena ? arena.grid : TEMPLATES[template || TEMPLATE_IDS[0]].grid;
  const bio = biome || arena?.biome || 'wasteland';
  const rnd = fieldRng(seed);
  const mir = arena ? false : mirror ?? rnd() < BF.mirrorChance;
  let g = src.map((r) => [...r]);
  if (mir) g = mirrorRows(src);
  normalizeStarts(g, mir);
  // boss start (before slots: 'B' becomes 'E')
  let bossAt = null;
  g.forEach((r, y) => r.forEach((ch, x) => { if (ch === 'B') bossAt = [x, y]; }));
  const { props, surfaces, elev } = fillSlots(g, bio, rnd, arena ? { plain: 0.5, drop: 0 } : {});
  const w = weather && tod ? { weather, tod } : pickWeather(bio, seed, day);
  if (w.weather === 'rain') addPuddles(g, rnd, WEATHER.weather.rain.puddles);
  ensureStarts(g, 'P', 5, 'left');
  ensureStarts(g, 'A', 2, 'left');
  ensureStarts(g, 'E', Math.max(4, enemies) + 1, 'right');
  repairConnectivity(g, props, elev);
  const def = finishDef(g, { id, biome: bio, ...w, props, surfaces, template: arena ? `boss:${boss}` : template, ...(elev ? { elev } : {}) });
  if (bossAt) {
    const es = [];
    g.forEach((r, y) => r.forEach((ch, x) => { if (ch === 'E' && !(x === bossAt[0] && y === bossAt[1])) es.push([x, y]); }));
    es.splice(Math.max(0, Math.min(es.length, bossIndex)), 0, bossAt);
    def.starts = { E: es };
  }
  return def;
}

/** Paint a procedural arena grid (world/arena.js) with a biome: c/C -> props, weather puddles. */
export function paintProcedural(g, { biome, seed, day = 1, weather = null, tod = null }) {
  const rnd = fieldRng(`${seed}:paint`);
  const { props, surfaces } = fillSlots(g, biome, rnd);
  repairConnectivity(g, props);
  const w = weather && tod ? { weather, tod } : pickWeather(biome, seed, day);
  if (w.weather === 'rain') addPuddles(g, rnd, WEATHER.weather.rain.puddles);
  return { props, surfaces, ...w };
}

/**
 * Templates may fence a side off with a zigzag of cover (8-way moves cannot cut corners): open the cover cell next to the
 * reached area that touches an unreached walkable cell, until every start is reachable (≤ 8 cells). Mutates g / props.
 */
export function repairConnectivity(g, props, elev = null) {
  const OPEN = new Set(['c', 'C', 'f', 'b', 'g', ',', 'x']);
  for (let k = 0; k < 8; k++) {
    const grid = parseMap({ grid: g.map((r) => r.join('')), ...(elev ? { elev } : {}) });
    const all = [...grid.starts.P, ...grid.starts.A, ...grid.starts.E];
    if (!all.length) return;
    const r = reachable(grid, all[0].x, all[0].y, 9999, null);
    const ok = (x, y) => r.dist[y * grid.w + x] >= 0;
    if (all.every((p) => ok(p.x, p.y))) return;
    let fix = null;
    for (let y = 1; y < grid.h - 1 && !fix; y++) for (let x = 1; x < grid.w - 1 && !fix; x++) {
      if (!OPEN.has(g[y][x]) || !blocksMove(grid.tiles[y * grid.w + x])) continue;
      let near = false, far = false;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy, t = grid.tiles[ny * grid.w + nx];
        if (blocksMove(t)) continue;
        if (ok(nx, ny)) near = true; else far = true;
      }
      if (near && far) fix = [x, y];
    }
    if (!fix) return;
    const [fx, fy] = fix;
    const pi = props.findIndex((p) => p.y === fy && fx >= p.x && fx < p.x + (p.w || 1));
    if (pi >= 0) { const p = props[pi]; for (let i = 0; i < p.w; i++) g[fy][p.x + i] = '.'; props.splice(pi, 1); } else g[fy][fx] = '.';
  }
}

function finishDef(g, extra) {
  return { name: extra.id, grid: g.map((r) => r.join('')), enemies: [], allies: [], win: 'killAll', lose: 'allDown', ...extra };
}

/** Legacy BIOMES key for the procedural object counts of a tile biome (when no region / old id is known). */
export const legacyOf = (biome) => Object.entries(BF.legacy).find(([, v]) => v === biome)?.[0] || (BIOMES[biome] ? biome : 'wasteland');

/** Props that light the night (radius WEATHER.tod.night.light + 1). */
export const LIGHT_PROPS = ['lamp', 'campfire', 'server', 'hologram-pillar', 'data-pylon', 'glitch-cube', 'kiosk'];

/**
 * Weather vision of a battle (§4): ids of enemies the player cannot see — farther than `vis` (Chebyshev) from every standing
 * hero-side unit, outside the light of fires / lamps / own units at night, not revealed (`u.revealedUntil` ≥ round).
 */
export function fogHiddenIds(b) {
  const out = new Set();
  const v = visionOf(b.map);
  if (!v.vis) return out;
  const own = b.units.filter((u) => u.team === 'heroes' && !u.dead && !u.removed);
  const lights = [];
  if (v.dark) {
    for (const p of b.map.props || []) if (LIGHT_PROPS.includes(p.id)) lights.push([p.x, p.y, v.light + 1]);
    for (const [k, c] of b.surfaces || []) if (c.floor && (c.floor.kind === 'fire' || c.floor.kind === 'electric')) { const [x, y] = k.split(',').map(Number); lights.push([x, y, 1]); }
  }
  for (const u of b.units) {
    if (u.team !== 'enemies' || u.dead || u.removed) continue;
    if ((u.revealedUntil || 0) >= b.round) continue;
    const d = Math.min(99, ...own.map((o) => Math.max(Math.abs(o.x - u.x), Math.abs(o.y - u.y))));
    if (d <= v.vis) continue;
    if (lights.some(([x, y, r]) => Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) <= r)) continue;
    out.add(u.id);
  }
  return out;
}

/** Light sources for the night overlay: [x, y, radius] (own units, fires, lamps). */
export function lightSources(b) {
  const v = visionOf(b.map);
  const out = [];
  for (const u of b.units) if (u.team === 'heroes' && !u.dead && !u.removed) out.push([u.x, u.y, v.light || 3]);
  for (const p of b.map.props || []) if (LIGHT_PROPS.includes(p.id)) out.push([p.x, p.y, (v.light || 3) + 1]);
  for (const [k, c] of b.surfaces || []) if (c.floor && (c.floor.kind === 'fire' || c.floor.kind === 'electric')) { const [x, y] = k.split(',').map(Number); out.push([x, y, 1.5]); }
  return out;
}
