// Free node map, этап 2 (free-roam.md §2.2): guards' view cones, notice meter, hiding behind cover, theft from behind,
// sight checks for hostiles. No DOM: scenes/roam.js draws the cones and runs the meter. Numbers — ROAM.stealth.
import { ROAM } from '../data/world/roam.js';
import { T_WALL, T_FULL, T_COVER } from '../rules/grid.js';

const DEG = Math.PI / 180;
const S = () => ROAM.stealth;

/** Angle difference in (-π, π]. */
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };
/** Facing angle of a step (dx, dy); null when standing. */
export const faceOf = (dx, dy) => (dx || dy ? Math.atan2(dy, dx) : null);

/**
 * Line of view from (ax,ay) to (bx,by): walls and full cover block; half cover (crate / stall) blocks only when it stands
 * right next to the target — the target is hiding behind it (free-roam.md: «прятки за укрытиями»).
 */
export function viewClear(grid, ax, ay, bx, by) {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  while (!(x === bx && y === by)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === bx && y === by) break;
    const t = grid.tiles[y * grid.w + x];
    if (t === T_WALL || t === T_FULL) return false;
    if (t === T_COVER && Math.max(Math.abs(x - bx), Math.abs(y - by)) <= 1) return false;
  }
  return true;
}

/** View range of a watcher: day / night (ROAM.stealth.range). */
export const viewRange = (night) => (night ? S().rangeNight : S().rangeDay);

/** Does watcher w {x, y, face} see cell (tx, ty)? Inside the cone (fov) and range, with a clear view. */
export function seesCell(grid, w, tx, ty, range) {
  const dx = tx - w.x, dy = ty - w.y;
  const d = Math.hypot(dx, dy);
  if (d > range + 1e-6) return false;
  if (d >= 0.5 && Math.abs(angDiff(Math.atan2(dy, dx), w.face)) > (S().fov / 2) * DEG + 1e-6) return false;
  return viewClear(grid, Math.round(w.x), Math.round(w.y), tx, ty);
}

/**
 * Cone polygon for drawing: rays every ROAM.stealth.rayStep degrees, each stops at the first wall / full cover.
 * → [[x, y]…] in tile units (centre of the watcher's cell first).
 */
export function conePoly(grid, w, range) {
  const step = S().rayStep * DEG, half = (S().fov / 2) * DEG;
  const ox = w.x + 0.5, oy = w.y + 0.5;
  const pts = [[ox, oy]];
  for (let a = -half; a <= half + 1e-6; a += step) {
    const ang = w.face + a, cx = Math.cos(ang), cy = Math.sin(ang);
    let r = 0;
    for (; r < range; r += 0.25) {
      const x = Math.floor(ox + cx * (r + 0.25)), y = Math.floor(oy + cy * (r + 0.25));
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) break;
      const t = grid.tiles[y * grid.w + x];
      if (t === T_WALL || t === T_FULL) break;
    }
    pts.push([ox + cx * r, oy + cy * r]);
  }
  return pts;
}

/** Notice gain per second by gait (walk / run / sneak); negative — decay outside every cone. */
export const noticeRate = (seen, gait) => (seen ? S().gain[gait] ?? S().gain.walk : -S().decay);

/**
 * One step of the notice meter: value 0..100, seen (any member in a cone), gait, halved (a won stealth roll in the cone).
 * → new value (clamped).
 */
export function noticeStep(v, dt, seen, gait, halved = false) {
  const r = noticeRate(seen, gait) * (seen && halved ? S().rollMul : 1);
  return Math.max(0, Math.min(100, v + r * dt));
}

/** Theft from behind / from the side: the thief stands outside the NPC's cone (or the NPC does not see through cover). */
export function behindOf(grid, npc, tx, ty) {
  return !seesCell(grid, npc, tx, ty, Math.max(S().rangeDay, 2));
}

/** A hostile sees the party: any member within `range` with a clear line of sight (all directions — it is hunting). */
export function seesParty(grid, foe, party, range = ROAM.battle.seeRange) {
  const fx = Math.round(foe.x), fy = Math.round(foe.y);
  return party.some((m) => Math.hypot(m.cx - fx, m.cy - fy) <= range && viewClear(grid, fx, fy, m.cx, m.cy));
}

/** Is cell (x, y) inside a restricted zone of the map? → the zone or null. */
export const zoneAt = (map, x, y) => (map.zones || []).find((z) => z.restricted && x >= z.rect[0] && y >= z.rect[1] && x < z.rect[0] + z.rect[2] && y < z.rect[1] + z.rect[3]) || null;

// ---------------------------------------------------------------- guard posts (ROAM.stealth.guards)
/** How many posts a node keeps: by map type + the faction's bonus; quiet factions — at most quietMax. */
export function guardCount(type, fac) {
  const G = S().guards;
  const n = (G.byType[type] || 0) + (G.factions[fac] || 0);
  return G.quiet.includes(fac) ? Math.min(n, G.quietMax) : n;
}
/**
 * Places worth guarding, in order: restricted zones (centre), then stalls with a trader (types G.stallGuards).
 * → [{x, y, zone?, stall?}]. Exits are never guarded by a standing post.
 */
export function guardPlaces(map, objs) {
  const G = S().guards, out = [];
  for (const z of map.zones || []) if (z.restricted) out.push({ x: z.rect[0] + (z.rect[2] >> 1), y: z.rect[1] + (z.rect[3] >> 1), zone: z });
  if (G.stallGuards.includes(map.type)) for (const o of objs) if (o.type === 'stall' && o.npc) out.push({ x: o.x, y: o.y, stall: o });
  return out;
}
/** Patrol route: up to n cells ≤ r from (cx, cy) where free(x, y), spread around (deterministic by seed); the post's cell first. */
export function patrolRoute(free, x0, y0, cx, cy, r, n, seed = 0) {
  const pts = [[x0, y0]];
  for (let k = 0; k < 8 && pts.length < n; k++) {
    const a = ((seed % 8) + k * 3) * (Math.PI / 4);
    for (let d = r; d >= 2; d--) {
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (free(x, y) && !pts.some((p) => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 3)) { pts.push([x, y]); break; }
    }
  }
  return pts;
}
