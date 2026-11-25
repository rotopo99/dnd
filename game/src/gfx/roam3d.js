// Free node map in 3D (docs/specs/3d.md stage 3): the roam scene's grid (40x30) + biome, props and node objects
// (stalls, beds, stashes, workbenches, terminals, fires, wells, exit gates, boats) baked into the static 8x8 chunks of
// gfx/scene3d.js, the party / NPCs / guards / hunters / corpses / other co-op heroes as skinned figures (walk / idle of
// gfx/anim.js), guards' view cones as translucent floor wedges, night with up to GFX.light.night.max point lights
// (fires, lamps, the leader), weather particles. The camera follows the leader; drag pans, Home — back to the hero.
// The roam rules never depend on this module: it only reads the scene state.
//   roam3d(game, R)              -> adapter A (A.v3 — the 3D state) or null (2D); R = {S, map, locId, wx, area, camArea}
//   drawRoam3d(game, A, R, o)    one frame (o: {path, hover, hoverEnt, marks, cones, zones, others})
//   pickRoam(A, R, px, py)       -> {cell: {x, y} | null, ent: index into R.bodies | -1} (Three: Raycaster cell pick)
//   roamScreen(A, x, y, h)       -> {x, y} screen point of a cell centre at height h (2D layer anchors); A.ppm — px per m
//   roamCamInput(game, A)        wheel zoom, [ ] rotate, drag pan, Home; true when used
import { GFX } from '../data/gfx.js';
import { NPCS } from '../data/npcs.js';
import { ENEMIES } from '../data/index.js';
import { parseMap } from '../rules/grid.js';
import { LIGHT_PROPS } from '../world/battlefields.js';
import { battle3d, drawBattle3d, panInput3d } from './scene3d.js';
import { createCamera, rotateCamera, zoomCamera, centerCamera, project, pickCell } from './camera.js';
import { MeshBuilder, keyRGB } from './mesh.js';
import { roamObjModel, ramp } from './models.js';
import { unitTemplate } from './units3d.js';
import { gfxPrefs } from './settings.js';

const NPC_CLASSES = ['zabivnoy', 'ranger', 'reper', 'technik', 'shaman'];
const yawOf = (face) => Math.atan2(Math.cos(face), Math.sin(face)); // roam face (grid angle) -> model yaw
const baseEnemy = (e) => String(e?.enemy || e?.id || e || 'scavenger').split('^')[0];

/** Exit gate: two posts and a beam over the run of exit cells (offsets relative to the first cell). */
function gateModel(cells) {
  const mb = new MeshBuilder();
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
  const ox = cells[0][0], oy = cells[0][1], along = x1 - x0 >= y1 - y0;
  const post = ramp('6'), beam = ramp('8'), sign = ramp('a');
  if (along) {
    const zc = (y0 + y1) / 2 - oy;
    for (const x of [x0 - ox, x1 - ox - 0.14]) mb.box(x, 0, zc - 0.07, x + 0.14, 1.9, zc + 0.07, post);
    mb.box(x0 - ox, 1.8, zc - 0.09, x1 - ox, 1.95, zc + 0.09, beam);
    mb.box((x0 + x1) / 2 - ox - 0.3, 1.55, zc - 0.03, (x0 + x1) / 2 - ox + 0.3, 1.8, zc + 0.03, sign);
  } else {
    const xc = (x0 + x1) / 2 - ox;
    for (const z of [y0 - oy, y1 - oy - 0.14]) mb.box(xc - 0.07, 0, z, xc + 0.07, 1.9, z + 0.14, post);
    mb.box(xc - 0.09, 1.8, y0 - oy, xc + 0.09, 1.95, y1 - oy, beam);
    mb.box(xc - 0.03, 1.55, (y0 + y1) / 2 - oy - 0.3, xc + 0.03, 1.8, (y0 + y1) / 2 - oy + 0.3, sign);
  }
  return mb;
}

function objs3(objs) {
  const out = [];
  for (const o of objs) {
    if (o.type === 'exit') {
      if (o.boat) out.push({ x: o.x, y: o.y, mb: roamObjModel('boat'), sig: 'q' });
      else if (o.hatch) out.push({ x: o.x, y: o.y, mb: roamObjModel('hatch', 'open'), sig: 'h1' });
      else if (o.cells?.length) { const c = o.cells[0]; out.push({ x: c[0], y: c[1], mb: gateModel(o.cells), sig: `g${o.cells.length}` }); }
      continue;
    }
    if (o.type === 'secret' && (o.opened || o.hidden)) continue;
    const v = (o.type === 'stash' || o.type === 'door' || o.type === 'hatch' || o.type === 'lever' || o.type === 'note') && o.opened ? 'open' : '';
    out.push({ x: o.x, y: o.y, mb: roamObjModel(o.hatch ? 'hatch' : o.type, o.hatch ? 'open' : v), sig: `${o.type[0]}${v ? 1 : 0}`, glow: o.type === 'fire' ? 'warm' : o.type === 'terminal' ? 'cold' : null });
  }
  return out;
}

export function roam3d(game, R) {
  const S = R.S;
  let A = S.r3;
  if (!A) {
    const grid = parseMap({ grid: R.map.grid, ...(R.map.elev ? { elev: R.map.elev } : {}) }); // hand-made maps: heights
    A = S.r3 = {
      time: 0, follow3: true, focus3: null, lights3: null, v3: null, objSig: '', pseudo: new Map(), prev: new Map(),
      b: { grid, gridVersion: 0, noBreak: true, units: [], traps: [], barrels: grid.barrels || [], surfaces: null, zones: [], data: {}, objects: null,
        map: { grid: R.map.grid, props: R.map.props || [], biome: R.map.biome, wallH: GFX.roam.wall, objs3: [], tod: 'day', weather: 'clear' } },
      dispOf: (u) => u,
      L: { area: R.area, camArea: R.camArea, cell: 32 },
    };
  }
  A.L.area = R.area; A.L.camArea = R.camArea;
  A.b.map.tod = R.wx.tod; A.b.map.weather = R.wx.weather;
  const sig = S.objs.map((o) => `${o.type}${o.opened ? 1 : 0}${o.hidden ? 'h' : ''}${o.x},${o.y}`).join(';');
  if (sig !== A.objSig) { A.objSig = sig; A.b.map.objs3 = objs3(S.objs); A.b.gridVersion++; }
  const fresh = !A.v3;
  const V = battle3d(game, A);
  if (!V) { S.r3 = null; return null; }
  if (fresh || !V.roamInit) {
    V.roamInit = true;
    V.cam.zoomIdx = Math.min(V.cam.zooms.length - 1, GFX.roam.zoomDefault);
    V.cam.zoom = V.cam.zooms[V.cam.zoomIdx];
    const ld = S.party[0];
    if (ld) { V.cam.cx = ld.x + 0.5; V.cam.cz = ld.y + 0.5; }
  }
  A.ppm = V.cam.ppmFit * V.cam.zoom;
  A.L.cell = Math.max(16, Math.round(A.ppm));
  return A;
}

/** Pseudo battle unit of a roam entity (cached: templates are keyed by race / class / look / enemy). */
function pseudo(A, key, make) {
  let u = A.pseudo.get(key);
  if (!u) { u = make(); A.pseudo.set(key, u); }
  return u;
}
function npcUnit(A, key, id, team = 'npc') {
  return pseudo(A, key, () => {
    const n = NPCS[id] || {};
    const cls = n.cls || NPC_CLASSES[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % NPC_CLASSES.length];
    return { id: key, kind: 'hero', team, npcId: id, raceId: n.race || 'human', classId: cls, name: n.name || id, look: null, avatar: n.avatar || null }; // npcId: three/party.js npc models
  });
}
function enemyUnit(A, key, e) {
  const id = baseEnemy(e);
  return pseudo(A, `${key}|${id}`, () => ({ id: key, kind: 'enemy', team: 'enemies', enemyId: id, tags: ENEMIES[id]?.tags || [] }));
}

/** Draw list of the roam entities: [{u, d, alpha, face?, teamKey, cull, ref}] (R.bodies keeps it for picking). */
function bodies(game, A, R) {
  const S = R.S, sv = game.save, RG = GFX.roam, out = [];
  const pos = (key, x, y) => {
    const p = A.prev.get(key), moved = !!p && Math.hypot(p[0] - x, p[1] - y) > 1e-4;
    A.prev.set(key, [x, y]);
    return { x, y, path: moved ? [1] : null };
  };
  S.party.forEach((m, i) => {
    const u = i === 0
      ? pseudo(A, `hero|${sv.hero.race}|${sv.hero.cls}|${sv.hero.look}|${JSON.stringify(sv.hero.hide || 0)}`, () => ({ id: 'r:hero', kind: 'hero', team: 'heroes', raceId: sv.hero.race, classId: sv.hero.cls, look: sv.hero.look, avatar: sv.hero.avatar || null, hide: sv.hero.hide || null, name: sv.hero.name }))
      : npcUnit(A, `r:${m.key}`, m.key, 'heroes');
    // controls-divinity.md: the sneaking crouch (S.crouch 0..1) and the attack lunge (m.ox / m.oy render offset)
    const d = pos(u.id, m.x, m.y);
    d.x += m.ox || 0; d.y += m.oy || 0;
    out.push({ u, d, alpha: 1, teamKey: i === 0 ? GFX.team.player : GFX.team.ally, ref: { kind: 'member', m }, crouch: S.crouch || 0, walkMul: S.walkMul || 1 });
  });
  for (const n of S.npcs) {
    const u = npcUnit(A, `n:${n.id}`, n.id);
    out.push({ u, d: pos(u.id, n.fx, n.fy), alpha: 1, face: yawOf(n.face || 0), teamKey: RG.npc, cull: true, ref: { kind: 'npc', n } });
  }
  for (const p of S.posts) {
    const u = enemyUnit(A, `p:${p.id}`, p.enemy);
    out.push({ u, d: pos(u.id, p.fx ?? p.x, p.fy ?? p.y), alpha: 1, face: yawOf(p.face || 0), teamKey: RG.guard, cull: true, ref: { kind: 'post', p } });
  }
  for (const h of S.hostiles) {
    const u = enemyUnit(A, `h:${h.id}`, h.enemy);
    out.push({ u, d: pos(u.id, h.fx, h.fy), alpha: 1, teamKey: RG.hunter, cull: true, ref: { kind: 'hostile', h } });
  }
  S.corpses.forEach((c, i) => {
    const u = enemyUnit(A, `c:${i}`, c.enemy);
    out.push({ u, d: { x: c.x, y: c.y, path: null, down: true }, alpha: 0.55, face: (i * 1.7) % 6.28, teamKey: '3', noRing: true, cull: true, ref: { kind: 'corpse', c } });
  });
  for (const o of R.others || []) {
    const u = pseudo(A, `o:${o.slot}|${o.hero?.race}|${o.hero?.cls}`, () => ({ id: `r:o${o.slot}`, kind: 'hero', team: 'heroes', raceId: o.hero?.race || 'human', classId: o.hero?.cls || 'zabivnoy', look: o.hero?.look || null, avatar: o.hero?.avatar || null, name: o.name }));
    out.push({ u, d: pos(u.id, o.x, o.y), alpha: 1, teamKey: o.color || RG.other, cull: true, ref: { kind: 'other', o } });
  }
  return out;
}

/** Night point lights: fires, lamps / glowing props, the leader — the nearest GFX.light.night.max to the leader. */
function roamLights(R) {
  const S = R.S, ld = S.party[0], LR = GFX.roam.lightR, out = [];
  for (const o of S.objs) if (o.type === 'fire') out.push([o.x, o.y, LR.fire]);
  for (const p of R.map.props || []) if (LIGHT_PROPS.includes(p.id)) out.push([p.x, p.y, LR.lamp]);
  out.sort((a, b) => Math.hypot(a[0] - ld.x, a[1] - ld.y) - Math.hypot(b[0] - ld.x, b[1] - ld.y));
  return [[ld.x, ld.y, LR.party], ...out].slice(0, GFX.light.night.max);
}

export function drawRoam3d(game, A, R, o = {}) {
  const S = R.S, ld = S.party[0], V = A.v3;
  A.time = S.time;
  A.focus3 = { x: ld.x + 0.5, z: ld.y + 0.5 };
  // walking pulls a panned view back to the hero
  if (ld.step && (V.cam.px || V.cam.pz) && !V.drag) { V.cam.px *= 0.9; V.cam.pz *= 0.9; if (Math.hypot(V.cam.px, V.cam.pz) < 0.05) V.cam.px = V.cam.pz = 0; }
  A.lights3 = roamLights(R);
  const list = bodies(game, A, R);
  R.bodies = list;
  const hl = [];
  for (const p of o.path || []) hl.push({ x: p.x, y: p.y, dot: 'rgba(200,220,240,0.55)' });
  for (const m of o.sel || []) hl.push({ x: m.cx, y: m.cy, stroke: '#6fcf7f' }); // selected party members
  if (o.hover) hl.push({ x: o.hover.x, y: o.hover.y, stroke: o.hoverEnt ? '#e8b04a' : 'rgba(220,220,220,0.45)' });
  const CN = GFX.roam.cone;
  const overlay = (ob, fl) => {
    const tp = (x, y) => fl(Math.max(0, Math.min(R.map.size[0] - 1, x | 0)), Math.max(0, Math.min(R.map.size[1] - 1, y | 0)));
    for (const z of o.zones || []) {
      const [zx, zy, zw, zh] = z.rect, c = keyRGB('c'), y = tp(zx, zy);
      ob.rect(zx, zy, zx + zw, zy + zh, y, [c[0], c[1], c[2], 0.08]);
      ob.frame(zx + 0.04, zy + 0.04, zx + zw - 0.04, zy + zh - 0.04, y + 0.001, 0.06, [c[0], c[1], c[2], 0.5]);
    }
    // interactive objects highlight (ui/roam-highlight.js marks3d): thin floor frames by kind, pulse already in m.a
    for (const m of o.marks || []) {
      const c = keyRGB(m.key), y = tp(m.x0, m.y0) + 0.002;
      ob.frame(m.x0 + 0.06, m.y0 + 0.06, m.x1 - 0.06, m.y1 - 0.06, y + 0.001, m.w + 0.03, [0.08, 0.08, 0.11, Math.min(0.5, m.a * 0.6)]);
      ob.frame(m.x0 + 0.075, m.y0 + 0.075, m.x1 - 0.075, m.y1 - 0.075, y + 0.002, m.w, [c[0], c[1], c[2], m.a]);
    }
    for (const cn of o.cones || []) {
      const c = keyRGB(cn.hot ? 'c' : 'a'), y = tp(cn.pts[0][0], cn.pts[0][1]) + 0.003;
      ob.poly(cn.pts, y, [c[0], c[1], c[2], cn.hot ? CN.hot : CN.fill]);
      const P = cn.pts;
      ob.line(P[0][0], P[0][1], P[1][0], P[1][1], y + 0.001, 0.04, [c[0], c[1], c[2], CN.edge]);
      ob.line(P[0][0], P[0][1], P[P.length - 1][0], P[P.length - 1][1], y + 0.001, 0.04, [c[0], c[1], c[2], CN.edge]);
    }
  };
  drawBattle3d(game, A, { hl, units: list, cur: null, overlay });
}

export function roamScreen(A, x, y, h = 0) {
  const V = A.v3, Wd = V.world;
  const xi = Math.max(0, Math.min(Wd.w - 1, Math.round(x))), yi = Math.max(0, Math.min(Wd.h - 1, Math.round(y)));
  return project(V.cam, x + 0.5, Wd.floor[yi * Wd.w + xi] + h, y + 0.5);
}
/** Head height (m) of a body of the draw list (for name plates / marks). */
export function bodyTop(it) {
  const T = unitTemplate(it.u, { simple: !!gfxPrefs().reduceFx });
  return T.top * T.scale + 0.15;
}

export function pickRoam(A, R, px, py) {
  const V = A.v3, cam = V.cam;
  let ent = -1, bd = Infinity;
  (R.bodies || []).forEach((it, i) => {
    if (it.ref.kind === 'member' || it.ref.kind === 'other' || it.d.down) return;
    const top = bodyTop(it);
    const a = roamScreen(A, it.d.x, it.d.y, 0), c = roamScreen(A, it.d.x, it.d.y, top);
    const rw = A.ppm * (it.ref.kind === 'npc' ? 0.5 : 0.32); // QA v49 #18: NPCs get a generous hit box
    if (px > a.x - rw && px < a.x + rw && py < a.y + rw * 0.4 && py > c.y && a.d < bd) { bd = a.d; ent = i; }
  });
  const W = V.world;
  if (V.engine === 'three' && V.T) { // three/battle.js: Raycaster against the pick surface (cell tops + tall sides)
    const k = V.T.pick(A, px, py);
    return { cell: k ? { x: k.x, y: k.y } : null, ent };
  }
  const cell = pickCell(cam, px, py, W.w, W.h, (x, y) => W.floor[y * W.w + x]);
  return { cell, ent };
}

export function roamCamInput(game, A) {
  const V = A?.v3;
  if (!V) return false;
  const inp = game.input, m = inp.mouse;
  let used = false;
  if (inp.wasPressed('BracketLeft')) { rotateCamera(V.cam, -1); used = true; }
  if (inp.wasPressed('BracketRight')) { rotateCamera(V.cam, 1); used = true; }
  if (inp.wasPressed('Home')) { centerCamera(V.cam, V.cam.bx, V.cam.bz); used = true; }
  if (m.wheel) { zoomCamera(V.cam, -m.wheel); used = true; }
  if (panInput3d(game, V, { keys: false })) used = true; // WASD / arrows walk the hero here
  return used;
}
