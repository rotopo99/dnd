// Free node map, этап 2 (free-roam.md §2.1): a battle on the node's own grid. The area around the party and the foes
// is cut out of the node map (ROAM.battle.cut, shifted to fit the borders), solid node objects become half-cover crates,
// units start on their current cells. After a win the scene puts the party back on the cells they ended on and leaves
// the corpses on the map. No DOM. The active free map registers a provider here; world-battle.js asks it for the map.
import { ROAM } from '../data/world/roam.js';
import { parseMap, blocksMove, T_WATER, T_HAZARD } from '../rules/grid.js';

let active = null; // { locId, cut(game, enemies, allies, o) → { map, after } }

/** The free map registers itself (enter / resume); null clears. */
export function setRoamProvider(p) { active = p; }
/** world-battle.js: a battle map from the free node the party stands in, or null (no free map — the usual arena). */
export function roamBattleFor(game, enemies, allies, o) {
  const sv = game?.save;
  if (!active || !sv || sv.location !== active.locId || sv.roam?.loc !== active.locId) return null;
  return active.cut(game, enemies, allies, o);
}

/** Region of the cut: size ≤ ROAM.battle.cut, centred on the points, shifted inside the map. → { x, y, w, h }. */
export function cutRegion(W, H, pts, size = ROAM.battle.cut) {
  const w = Math.min(size[0], W), h = Math.min(size[1], H);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const x = Math.max(0, Math.min(W - w, Math.round(mx - w / 2))), y = Math.max(0, Math.min(H - h, Math.round(my - h / 2)));
  return { x, y, w, h };
}

/**
 * Battle map def from the node map: rows of the region; solid objects → 'c' (half cover), exits 'D' → wall, the stall
 * awning '"' → floor; the biome and props of the node (shifted). starts — explicit P / E / A cells (parseMap).
 */
export function cutMapDef(map, objects, r, { id = 'roam', name = '' } = {}) {
  const solid = new Set((objects || []).filter((o) => o.solid).map((o) => `${o.x},${o.y}`));
  const rows = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    let s = '';
    for (let x = r.x; x < r.x + r.w; x++) {
      let ch = map.grid[y][x];
      if (solid.has(`${x},${y}`) && ch !== 'w') ch = 'c';
      else if (ch === 'D') ch = '#';
      else if (ch === '"' || ch === 'P' || ch === 'E' || ch === 'A' || ch === 'F') ch = '.';
      s += ch;
    }
    rows.push(s);
  }
  const props = (map.props || []).filter((p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h).map((p) => ({ ...p, x: p.x - r.x, y: p.y - r.y }));
  return { id: `roam-${id}`, name, biome: map.biome, props, grid: rows, enemies: [], allies: [], win: 'killAll', lose: 'allDown', roam: { region: r } };
}

/**
 * Start cells: each wanted cell (absolute) → the nearest free passable cell of the cut (BFS), no two units on one cell.
 * → [[x, y]…] in cut coordinates.
 */
export function placeStarts(def, wanted, taken = new Set()) {
  const g = parseMap(def);
  const r = def.roam.region;
  const free = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && !blocksMove(g.tiles[y * g.w + x]) && g.tiles[y * g.w + x] !== T_WATER && g.tiles[y * g.w + x] !== T_HAZARD && !taken.has(`${x},${y}`);
  const out = [];
  for (const [ax, ay] of wanted) {
    const sx = Math.max(0, Math.min(g.w - 1, ax - r.x)), sy = Math.max(0, Math.min(g.h - 1, ay - r.y));
    let pos = null;
    const seen = new Set([`${sx},${sy}`]);
    const q = [[sx, sy]];
    while (q.length && !pos) {
      const [x, y] = q.shift();
      if (free(x, y)) { pos = [x, y]; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    if (!pos) pos = [sx, sy];
    taken.add(`${pos[0]},${pos[1]}`);
    out.push(pos);
  }
  return out;
}

/**
 * Cells for foes without a place on the map (an entry event, a quest battle): a group ROAM.battle.foeGap+ tiles from the
 * leader, toward the nearest exit when there is one. → [[x, y]…] absolute.
 */
export function foeCells(grid, leader, n, exits = []) {
  const gap = ROAM.battle.foeGap;
  const ex = [...exits].sort((a, b) => Math.hypot(a[0] - leader[0], a[1] - leader[1]) - Math.hypot(b[0] - leader[0], b[1] - leader[1]))[0];
  const dir = ex ? Math.atan2(ex[1] - leader[1], ex[0] - leader[0]) : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = dir + ((i % 3) - 1) * 0.35, d = gap + Math.floor(i / 3);
    out.push([Math.round(leader[0] + Math.cos(a) * d), Math.round(leader[1] + Math.sin(a) * d)]);
  }
  return out.map(([x, y]) => [Math.max(1, Math.min(grid.w - 2, x)), Math.max(1, Math.min(grid.h - 2, y))]);
}

/**
 * Build the whole battle map: region around party + foes, def with explicit starts.
 * party / foes / allies — absolute cells. → def (def.roam.region for the way back).
 */
export function roamBattleMap(map, objects, { party, foes, allies = [], id, name }) {
  const [W, H] = map.size;
  const r = cutRegion(W, H, [...party, ...foes]);
  const def = cutMapDef(map, objects, r, { id, name });
  const taken = new Set();
  const P = placeStarts(def, party, taken);
  const A = placeStarts(def, allies.length ? allies : party.slice(0, 1), taken);
  const E = placeStarts(def, foes, taken);
  def.starts = { P, E, A };
  return def;
}

/**
 * After a won battle: hero units' cells back to node coordinates (party order), dead foes → corpses.
 * units — battle units (S.b.units). → { party: [[x, y]…], corpses: [{ x, y, enemy }] }.
 */
export function aftermath(def, units) {
  const r = def.roam.region;
  const party = units.filter((u) => u.team === 'heroes' && u.kind === 'hero' && u.x != null).map((u) => [u.x + r.x, u.y + r.y]);
  const corpses = units.filter((u) => u.team !== 'heroes' && u.kind !== 'summon' && (u.dead || u.down || u.hp <= 0) && !u.removed && u.x != null)
    .map((u) => ({ x: u.x + r.x, y: u.y + r.y, enemy: u.enemyId || u.id }));
  return { party, corpses };
}
