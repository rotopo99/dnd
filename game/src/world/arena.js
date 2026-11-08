// Procedural battle map for world battles (combat-rework §7): 22×12, border walls, start columns 1–4 / 17–20 free.
// Biome (data/combat.js BIOMES; biomeOf: explicit > region > faction > hazard) sets the objects: crates 'c',
// concrete 'C', flimsy walls 'x', machines 'm', generators 'G', barrels 'b'/'g', puddles 'w', fire '~',
// heights '1'/'2' (hills 3×3 of h1; platforms: 2×2 h2 in a ring of h1 — every height has a ramp).
// Objects are placed on the left half and mirrored (80%) to the right — fair access to cover for both sides.
// Connectivity check (every start reaches every other); ≤ 5 attempts, then a map without objects.
// battlefields.md: a boss of BOSS_ARENAS among the enemies -> its hand-made arena; else a template (BATTLEFIELD.templateChance,
// by place kind / biome / ambush) or this procedural arena; both are painted by the tile biome (props, pools, weather).
import { BIOMES, biomeOf, BATTLEFIELD } from '../data/combat.js';
import { parseMap, reachable } from '../rules/grid.js';
import { tileBiomeOf, buildField, templateFor, paintProcedural, fieldRng, BOSS_ARENAS } from './battlefields.js';

const W = 22, H = 12;
const enemyKey = (e) => String(typeof e === 'string' ? e : e?.enemyId || e?.id || '').split('^')[0];

/**
 * makeWorldMap({ seed, enemies (count), enemyIds?, hazard, biome, region, faction, id, kind? (location kind), ambush?, day?,
 *                template? (force), weather?, tod? })
 */
export function makeWorldMap({ seed = 1, enemies = 4, enemyIds = [], hazard = null, biome = null, region = null, faction = null, id = 'world',
  kind = null, ambush = false, day = 1, template = null, weather = null, tod = null } = {}) {
  const bi = enemyIds.findIndex((e) => BOSS_ARENAS[enemyKey(e)]);
  if (bi >= 0) {
    const boss = enemyKey(enemyIds[bi]);
    const def = buildField({ boss, seed, enemies, bossIndex: bi, day, id, weather, tod });
    if (connectedDef(def)) return def;
  }
  const tile = tileBiomeOf({ biome, region, faction, hazard, seed });
  if (template || fieldRng(`${seed}:tplc`)() < BATTLEFIELD.templateChance) {
    const tpl = template || templateFor({ kind, biome: tile, ambush, seed });
    for (let attempt = 0; attempt < 5; attempt++) {
      const def = buildField({ template: tpl, biome: tile, seed: seed + attempt * 7919, enemies, day, id, weather, tod });
      if (connectedDef(def)) return def;
    }
  }
  const bio = biomeOf({ biome, region, faction, hazard });
  for (let attempt = 0; attempt < 5; attempt++) {
    const g = build(seed + attempt * 7919, enemies, hazard, bio, true);
    const paint = paintProcedural(g, { biome: tile, seed: seed + attempt, day, weather, tod });
    if (connected(g)) return finish(g, id, tile, paint);
  }
  const g = build(seed, enemies, hazard, bio, false);
  return finish(g, id, tile, paintProcedural(g, { biome: tile, seed, day, weather, tod }));
}

function build(seed, enemies, hazard, bio, withObjects) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ri = (r) => (r ? r[0] + Math.floor(rnd() * (r[1] - r[0] + 1)) : 0);
  const g = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.');
    g.push(row);
  }
  const B = BIOMES[bio] || BIOMES.wasteland;
  const inMid = (x, y) => x >= 5 && x <= W - 6 && y >= 1 && y <= H - 2;
  const free = (x, y) => inMid(x, y) && g[y][x] === '.';
  const mirror = (x, y, ch) => { const mx = W - 1 - x; if (rnd() < 0.8 && free(mx, y)) g[y][mx] = ch; };
  if (withObjects) {
    // heights first, in the contested centre (objects never stand on them)
    const hills = ri(B.hills), plats = ri(B.platforms);
    for (let i = 0; i < hills + plats; i++) {
      const plat = i >= hills;
      const size = plat ? 4 : 3;
      const x0 = Math.floor((W - size) / 2) + (rnd() < 0.5 ? 0 : (size & 1) - 1), y0 = 1 + Math.floor(rnd() * (H - 1 - size)); // contested centre
      for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) {
        if (!free(x, y)) continue;
        const core = plat && x > x0 && x < x0 + 3 && y > y0 && y < y0 + 3;
        g[y][x] = core ? '2' : '1';
      }
    }
    const place = (ch, n, len) => {
      for (let i = 0; i < Math.ceil(n / 2); i++) {
        let x = 5, y = 1;
        for (let k = 0; k < 8; k++) { x = 5 + Math.floor(rnd() * 6); y = 1 + Math.floor(rnd() * (H - 2)); if (free(x, y)) break; }
        const horiz = rnd() < 0.5;
        const L = len ? len[0] + Math.floor(rnd() * (len[1] - len[0] + 1)) : 1;
        for (let k = 0; k < L; k++) {
          const px = x + (horiz ? k : 0), py = y + (horiz ? 0 : k);
          if (!free(px, py)) continue;
          g[py][px] = ch;
          if (i * 2 + 1 < n || n % 2 === 0) mirror(px, py, ch);
        }
      }
    };
    place('c', ri(B.crate), [1, 2]);
    place('C', ri(B.concrete), [1, 2]);
    place('x', ri(B.wall), [2, 3]);
    place('m', ri(B.machine), null);
    place('G', ri(B.generator), null);
    const barrels = ri(B.barrel) + (hazard === 'fire' && !B.barrel ? 1 : 0);
    for (let i = 0; i < barrels; i++) { const x = 6 + Math.floor(rnd() * 10), y = 2 + Math.floor(rnd() * 8); if (free(x, y)) g[y][x] = rnd() < 0.3 ? 'g' : 'b'; }
    for (let i = 0; i < ri(B.gas); i++) { const x = 6 + Math.floor(rnd() * 10), y = 2 + Math.floor(rnd() * 8); if (free(x, y)) g[y][x] = 'g'; }
    const puddles = ri(B.puddles);
    for (let i = 0; i < puddles; i++) {
      const cx = 6 + Math.floor(rnd() * 10), cy = 2 + Math.floor(rnd() * 8);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) if (free(cx + dx, cy + dy) && rnd() < 0.85) g[cy + dy][cx + dx] = 'w';
    }
    const fire = Math.max(ri(B.fire), hazard === 'fire' ? 6 : 0);
    for (let i = 0; i < fire; i++) { const x = 5 + Math.floor(rnd() * 12), y = 1 + Math.floor(rnd() * 10); if (free(x, y)) g[y][x] = '~'; }
  }
  const ps = [[2, 4], [2, 7], [3, 5], [3, 6]];
  for (const [x, y] of ps) g[y][x] = 'P';
  const n = Math.max(4, enemies);
  const es = [];
  for (let y = 2; y <= 9 && es.length < n; y++) for (const x of [W - 3, W - 5]) if (es.length < n) es.push([x, y + (x === W - 5 ? 1 : 0)]);
  for (const [x, y] of es) if (y > 0 && y < H - 1) g[y][x] = 'E';
  return g;
}

const connected = (g) => connectedDef({ grid: g.map((r) => r.join('')) });
function connectedDef(def) {
  const grid = parseMap(def);
  const all = [...grid.starts.P, ...grid.starts.A, ...grid.starts.E];
  const r = reachable(grid, all[0].x, all[0].y, 999, null);
  return all.every((p) => r.dist[p.y * grid.w + p.x] >= 0);
}

function finish(g, id, biome, paint = {}) {
  return { id, name: id, biome, grid: g.map((r) => r.join('')), enemies: [], allies: [], win: 'killAll', lose: 'allDown', ...paint };
}
