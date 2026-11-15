// 3D battlefield (docs/specs/3d.md, stage 1): WebGL layer under the Canvas 2D UI. Builds the static world from the
// battle grid (tiles, `elev`, walls / covers, props of the map def, live objects) in 8x8 chunks (a chunk is rebuilt
// when its cells change — `breakObject`), draws units (stage 2: skinned templates of gfx/units3d.js, instanced per
// template, poses of gfx/anim.js in a bone texture; hull outline in the team colour, x-ray silhouette behind walls),
// a shadow map pass, highlights of the 2D view as translucent quads, surfaces and effects of gfx/fx3d.js, team rings.
// Battle data never depends on this module (co-op determinism): it only reads S.
//   createGfx(canvas, game)           -> game.gfx { ok(), resize(w, h, cw, ch), endFrame(), use() }
//   battle3d(game, S)                 -> S.v3 (state) when 3D is on, else null (drops S.v3)
//   drawBattle3d(game, S, {hl, units}) render one frame (hl — captured 2D highlights, units — draw list)
//   pickBattle(S, px, py)             -> {x, y} | null      (hover cell through the camera ray)
//   cellScreen(S, x, y, h)            -> top-left of the «virtual cell» centred on the projected cell centre
//   unitScreen(S, u, d)               -> anchor above the unit's head (x — virtual cell left, y — top)
//   cameraInput3d(game, S)            [ / ] — rotate, wheel over the map — zoom, buttons; true when input was used
//   camButtons(S)                     -> on-screen buttons (rotate ⟲ ⟳, «2D / 3D»)
import { GFX } from '../data/gfx.js';
import { WEATHER } from '../data/combat.js';
import { t } from '../data/text/index.js';
import { T_WALL, T_COVER, T_FULL, T_RUBBLE, T_HAZARD, T_EXIT, T_WATER, T_BLOCK, elevAt } from '../rules/grid.js';
import { biomeTones, tileGrid } from '../assets/tilesets.js';
import { PROPS } from '../assets/props.js';
import { liveChar } from '../ui/battle-terrain.js';
import { fieldBiome, propCells } from '../ui/field-view.js';
import { visionOf, lightSources } from '../world/battlefields.js';
import { createGL, worldProgram, overlayProgram, skinProgram, depthProgram, particleProgram, hasWebGL2, BONE_TEX_W } from './gl.js';
import { MeshBuilder, OverlayBuilder, uploadMesh, freeMesh, uploadOverlay, resetOverlays, uploadInstanced, resetInstanced, keyRGB, rampRGB, cssRGBA } from './mesh.js';
import { createCamera, fitCamera, rotateCamera, zoomCamera, updateCamera, viewProj, project, pickCell, basis, panCamera, centerCamera } from './camera.js';
import { ramp, propModel, propTop } from './models.js';
import { unitTemplate } from './units3d.js';
import { poseBones, animActive, aimOf, trackWalk } from './anim.js';
import { buildFx, particleMesh, weatherFx } from './fx3d.js';
import { gfxMode, gfxPrefs, setGfxPref, markGfxBroken } from './settings.js';

const G = GFX.geo;

// ---------------------------------------------------------------- context manager
export function createGfx(canvas, game) {
  const X = {
    canvas, gl: null, P: null, O: null, gen: 0, used: false, lost: false, lostAt: 0, failed: false,
    gpu: new Map(), // model key -> uploaded mesh (per context generation)
    ok() {
      if (X.failed) return false;
      if (X.gl && !X.lost) return true;
      if (X.lost) return false;
      try {
        X.gl = createGL(canvas, {
          onLost: () => { X.lost = true; X.lostAt = performance.now(); },
          onRestored: () => { X.lost = false; X.P = null; X.gen++; X.gpu.clear(); X.sh = null; X.bt = null; resetOverlays(X.gl); resetInstanced(X.gl); X.init(); },
        });
        if (!X.gl) throw new Error('no webgl2');
        X.init();
        return true;
      } catch (e) {
        console.warn('3D', e);
        X.fail();
        return false;
      }
    },
    init() {
      const gl = X.gl;
      X.P = worldProgram(gl); X.O = overlayProgram(gl); X.K = skinProgram(gl); X.PT = particleProgram(gl);
      X.D = depthProgram(gl, false); X.DK = depthProgram(gl, true);
    },
    fail() {
      X.failed = true; X.gl = null;
      markGfxBroken();
      game.toast(t('gfx.unavailable'), 'c');
    },
    resize(w, h, cw, ch) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = cw; canvas.style.height = ch;
    },
    use() { X.used = true; },
    endFrame() {
      if (X.lost && !X.failed && performance.now() - X.lostAt > GFX.lostTimeout * 1000) X.fail();
      const show = X.used && !X.failed;
      if (canvas.style.visibility !== (show ? 'visible' : 'hidden')) canvas.style.visibility = show ? 'visible' : 'hidden';
      X.used = false;
    },
    mesh(key, build) {
      let m = X.gpu.get(key);
      if (m === undefined) { m = uploadMesh(X.gl, build()); X.gpu.set(key, m); }
      return m;
    },
  };
  return X;
}

// ---------------------------------------------------------------- world description
function kindOf(b, rows, under, x, y) {
  const g = b.grid, i = y * g.w + x, tile = g.tiles[i];
  const ch = liveChar(b, rows[y]?.[x] ?? '#', x, y);
  if (ch === 'W') return 'deep';
  if (tile === T_WATER || ch === 'w' || ch === '~') return 'water';
  if (tile === T_WALL || ch === '#') return 'wall';
  if (tile === T_BLOCK) return 'fence';
  if (tile === T_RUBBLE) return 'rubble';
  if (tile === T_EXIT || ch === 'D') return 'exit';
  if (tile === T_HAZARD) return 'fire';
  if (under.has(i)) return 'floor';
  if (tile === T_COVER) return ch === 'm' ? 'shelf' : ch === 'G' ? 'gen' : 'half';
  if (tile === T_FULL) return ch === 'C' ? 'block' : 'full';
  if (ch === '=') return 'deck';
  if (ch === '"') return 'field'; // roam: field / tall grass
  return 'floor';
}
const OBST = { wall: G.wall, full: G.full, block: G.full, half: G.half, shelf: G.half + 0.2, gen: G.half + 0.1 };

/** Colours of a tile kind of a biome: [main, second] palette keys (cover colours minus the floor under them). */
const toneMemo = new Map();
function tileTones(biome, kind) {
  const key = `${biome}|${kind}`;
  let r = toneMemo.get(key);
  if (r) return r;
  const count = (rows) => { const n = {}; for (const row of rows) for (const ch of row) if (ch !== '.' && ch !== '0') n[ch] = (n[ch] || 0) + 1; return n; };
  const n = count(tileGrid(biome, kind, 0));
  if (kind === 'half' || kind === 'full') { const f = count(tileGrid(biome, 'floor', 0)); for (const k in f) n[k] = (n[k] || 0) - f[k] * 0.9; }
  const keys = Object.keys(n).filter((k) => n[k] > 0).sort((a, b) => n[b] - n[a]);
  r = [keys[0] || '3', keys[1] || keys[0] || '2'];
  toneMemo.set(key, r);
  return r;
}

function worldOf(b) {
  const g = b.grid, rows = b.map.grid || [];
  const biome = fieldBiome(b.map) || 'wasteland';
  const under = propCells(b.map.props, g.w);
  const n = g.w * g.h, wallH = b.map.wallH || G.wall;
  const kind = new Array(n), floor = new Float32Array(n), obst = new Float32Array(n);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x, k = kindOf(b, rows, under, x, y);
    kind[i] = k;
    floor[i] = k === 'water' ? G.water : k === 'deep' ? G.water * 2 : elevAt(g, x, y) * G.elev;
    obst[i] = k === 'wall' ? wallH : OBST[k] || 0;
  }
  const alive = (p) => b.noBreak || !p.destructible || !p.blocks || !!b.objects?.get(p.y * g.w + p.x);
  const props = (b.map.props || []).filter((p) => PROPS[p.id]);
  for (const p of props) {
    if (!alive(p) || !(p.blocks || p.cover)) continue;
    for (let i = 0; i < (p.w || 1); i++) if (p.x + i < g.w) { const k = p.y * g.w + p.x + i; obst[k] = Math.max(obst[k], propTop(p.id)); }
  }
  // walls of the map border (<= 2 cells thick): bit per side N 1, E 2, S 4, W 8 — the near sides are drawn low
  const edge = new Uint8Array(n);
  const wall = (x, y) => kind[y * g.w + x] === 'wall';
  const run = (x, y, dx, dy, d) => { for (let k = 0; k <= d; k++) if (!wall(x + dx * k, y + dy * k)) return false; return true; };
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!wall(x, y)) continue;
    let m = 0;
    if (y <= 1 && run(x, y, 0, -1, y)) m |= 1;
    if (g.w - 1 - x <= 1 && run(x, y, 1, 0, g.w - 1 - x)) m |= 2;
    if (g.h - 1 - y <= 1 && run(x, y, 0, 1, g.h - 1 - y)) m |= 4;
    if (x <= 1 && run(x, y, -1, 0, x)) m |= 8;
    edge[y * g.w + x] = m;
  }
  // extra static models baked into the chunks (roam: stalls, beds, stashes, gates ...): {x, y, mb, sig}
  const objs = b.map.objs3 || [];
  return { biome, kind, floor, obst, props, alive, edge, objs, wallH, w: g.w, h: g.h };
}

/** Wall cell: block with a bevel (trees in swamp / forest); low — the cut-away version (near map border). */
function wallMesh(mb, Wd, x, y, low) {
  const tones = biomeTones(Wd.biome), f = Wd.floor[y * Wd.w + x], hv = hash(x, y);
  const [wa, wb] = tileTones(Wd.biome, 'wall');
  if (tones.wall === 'trees') {
    mb.cyl(x + 0.5, f, y + 0.5, low ? 0.25 : 0.7, 0.12, ramp(tones.wc.trunk || '6'), { seg: 6 });
    if (low) { mb.cyl(x + 0.5, f, y + 0.5, 0.2, 0.4, ramp(wa), { seg: 7, r1: 0.25, rot: hv % 7 }); return; }
    mb.cyl(x + 0.5, f + 0.5, y + 0.5, 0.9, 0.48, ramp(wa), { seg: 7, r1: 0.22, rot: hv % 7 });
    mb.cyl(x + 0.5, f + 1.25, y + 0.5, 0.65, 0.34, ramp(wb), { seg: 7, r1: 0, rot: hv % 5 });
  } else mb.bevelBox(x, f, y, x + 1, f + (low ? G.cut : Wd.wallH || G.wall), y + 1, low ? 0.04 : G.bevel, ramp(wa), { top: ramp(wb) });
}

/** Border walls grouped by side mask: { mask, full, low } builders. */
function buildEdges(Wd) {
  const groups = new Map();
  for (let i = 0; i < Wd.edge.length; i++) {
    const m = Wd.edge[i];
    if (!m) continue;
    let g = groups.get(m);
    if (!g) { g = { mask: m, full: new MeshBuilder(), low: new MeshBuilder() }; groups.set(m, g); }
    const x = i % Wd.w, y = (i / Wd.w) | 0;
    wallMesh(g.full, Wd, x, y, false);
    wallMesh(g.low, Wd, x, y, true);
  }
  return [...groups.values()];
}
/** Sides of the map facing the camera (target yaw): bits N 1, E 2, S 4, W 8. */
function nearMask(cam) {
  const a = (cam.yawTo * Math.PI) / 180, sx = Math.sin(a), cz = Math.cos(a);
  return (cz < -0.1 ? 1 : 0) | (sx > 0.1 ? 2 : 0) | (cz > 0.1 ? 4 : 0) | (sx < -0.1 ? 8 : 0);
}

// ---------------------------------------------------------------- static chunk mesh
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; return Math.imul(h, 1103515245) >>> 0; };

function buildChunk(Wd, cx0, cy0) {
  const { w, h, kind, floor, obst, biome } = Wd;
  const tones = biomeTones(biome), o = tones.o;
  const rFloor = rampRGB([o.dk, o.base, o.lt]), rFloor2 = rampRGB([o.dk, o.dk, o.base]);
  const [ha, hb] = tileTones(biome, 'half'), [fa, fb] = tileTones(biome, 'full');
  const rHalf = ramp(ha), rHalfTop = ramp(hb), rFull = ramp(fa), rFullTop = ramp(fb);
  const wk = tones.water || ['1', '2', '3'];
  const rWater = rampRGB([wk[0], wk[1], wk[1]]), rDeep = rampRGB([wk[0], wk[0], wk[1]]);
  const deb = tones.debris || ['3', '4', '2', '6'];
  const mb = new MeshBuilder();
  const top = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? G.base : floor[y * w + x]);
  const occ = (x, y, my) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : floor[y * w + x] + obst[y * w + x] > my + 0.3 ? 1 : 0);
  for (let y = cy0; y < Math.min(h, cy0 + GFX.chunk); y++) for (let x = cx0; x < Math.min(w, cx0 + GFX.chunk); x++) {
    const i = y * w + x, k = kind[i], f = floor[i], hv = hash(x, y);
    // floor top with corner AO
    const ao = [[x, y, -1, -1], [x, y + 1, -1, 1], [x + 1, y + 1, 1, 1], [x + 1, y, 1, -1]].map(([, , dx, dz]) => {
      const a = occ(x + dx, y, f), c = occ(x, y + dz, f), d = occ(x + dx, y + dz, f);
      return Math.min(1, (a + c + (a && c ? 1 : d)) / 3);
    });
    const fr = k === 'water' ? rWater : k === 'deep' ? rDeep : k === 'deck' ? ramp('8') : k === 'exit' ? ramp('6') : (hv % 100 < 14 ? rFloor2 : rFloor);
    mb.quad([x, f, y], [x, f, y + 1], [x + 1, f, y + 1], [x + 1, f, y], fr, { ao, inside: [x + 0.5, f - 1, y + 0.5] });
    // side faces down to lower neighbours (and the map border)
    const sides = [[0, 1, [x, y + 1], [x + 1, y + 1]], [0, -1, [x + 1, y], [x, y]], [1, 0, [x + 1, y + 1], [x + 1, y]], [-1, 0, [x, y], [x, y + 1]]];
    for (const [dx, dz, a, c] of sides) {
      const nt = top(x + dx, y + dz);
      if (nt >= f - 1e-3) continue;
      mb.quad([a[0], nt, a[1]], [c[0], nt, c[1]], [c[0], f, c[1]], [a[0], f, a[1]], k === 'water' || k === 'deep' ? rWater : rFloor, { inside: [x + 0.5, f - 0.5, y + 0.5], ao: [0.6, 0.6, 0, 0] });
    }
    const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
    switch (k) {
      case 'wall': if (!Wd.edge[i]) wallMesh(mb, Wd, x, y, false); break; // border walls: buildEdges
      case 'full': mb.bevelBox(X0 + 0.06, f, Z0 + 0.06, X1 - 0.06, f + G.full, Z1 - 0.06, G.bevel, rFull, { top: rFullTop }); break;
      case 'block': mb.bevelBox(X0 + 0.1, f, Z0 + 0.1, X1 - 0.1, f + G.full, Z1 - 0.1, G.bevel, ramp('3'), { top: ramp('4') }); break;
      case 'half': mb.bevelBox(X0 + 0.1, f, Z0 + 0.12, X1 - 0.1, f + G.half, Z1 - 0.12, 0.06, rHalf, { top: rHalfTop }); break;
      case 'shelf':
        mb.box(X0 + 0.12, f, Z0 + 0.3, X1 - 0.12, f + G.half + 0.2, Z1 - 0.3, ramp('2'));
        for (let s = 1; s < 3; s++) mb.box(X0 + 0.1, f + s * 0.25, Z0 + 0.28, X1 - 0.1, f + s * 0.25 + 0.04, Z1 - 0.28, ramp('4'));
        break;
      case 'gen': mb.add(propModel('generator'), x, f, y); break;
      case 'fence': mb.add(propModel('fence'), x, f, y); break;
      case 'field': // roam: low grass wedges
        for (let r = 0; r < 3; r++) {
          const hh = hash(x * 5 + r, y * 11 + r), px = x + 0.18 + (hh % 64) / 100, pz = y + 0.18 + ((hh >>> 8) % 64) / 100;
          mb.wedge(px - 0.07, f, pz - 0.03, px + 0.07, f + 0.16 + ((hh >>> 16) % 10) / 100, pz + 0.03, ramp(r % 2 ? 'l' : 'k'), { ao: 0 });
        }
        break;
      case 'rubble': {
        const n = G.rubble[0] + (hv % (G.rubble[1] - G.rubble[0] + 1));
        for (let r = 0; r < n; r++) {
          const hh = hash(x * 7 + r, y * 13 - r), px = x + 0.15 + (hh % 60) / 100, pz = y + 0.15 + ((hh >>> 8) % 60) / 100;
          const s = 0.1 + ((hh >>> 16) % 10) / 100;
          mb.bevelBox(px - s, f, pz - s * 0.8, px + s, f + 0.06 + ((hh >>> 4) % 12) / 100, pz + s * 0.8, 0.03, ramp(deb[r % deb.length]));
        }
        break;
      }
      case 'fire': mb.box(X0 + 0.15, f, Z0 + 0.15, X1 - 0.15, f + G.hazard, Z1 - 0.15, rampRGB(['e', 'e', 'e']), { glow: true, ao: 0 }); break;
      case 'exit':
        mb.box(X0 + 0.2, f, Z0 + 0.2, X1 - 0.2, f + 0.02, Z1 - 0.2, rampRGB(['a', 'a', 'a']), { ao: 0 });
        mb.box(X0 + 0.28, f, Z0 + 0.28, X1 - 0.28, f + 0.025, Z1 - 0.28, ramp('6'), { ao: 0 });
        break;
      default:
    }
  }
  // props whose footprint origin is in this chunk
  for (const p of Wd.props) {
    if (p.x < cx0 || p.y < cy0 || p.x >= cx0 + GFX.chunk || p.y >= cy0 + GFX.chunk || !Wd.alive(p)) continue;
    mb.add(propModel(p.id), p.x, floor[p.y * w + p.x] || 0, p.y);
  }
  for (const o of Wd.objs) {
    if (o.x < cx0 || o.y < cy0 || o.x >= cx0 + GFX.chunk || o.y >= cy0 + GFX.chunk) continue;
    mb.add(o.mb, o.x, floor[o.y * w + o.x] || 0, o.y);
  }
  return mb;
}

function chunkSig(Wd, cx0, cy0) {
  let s = '';
  const { w, h } = Wd;
  for (let y = Math.max(0, cy0 - 1); y < Math.min(h, cy0 + GFX.chunk + 1); y++) for (let x = Math.max(0, cx0 - 1); x < Math.min(w, cx0 + GFX.chunk + 1); x++) {
    const i = y * w + x;
    s += Wd.kind[i][0] + Wd.kind[i][1] + (Wd.floor[i] * 4 | 0) + (Wd.obst[i] * 10 | 0);
  }
  for (const p of Wd.props) if (p.x >= cx0 && p.y >= cy0 && p.x < cx0 + GFX.chunk && p.y < cy0 + GFX.chunk) s += Wd.alive(p) ? 'P' : 'p';
  for (const o of Wd.objs) if (o.x >= cx0 && o.y >= cy0 && o.x < cx0 + GFX.chunk && o.y < cy0 + GFX.chunk) s += o.sig;
  return s;
}

// ---------------------------------------------------------------- battle state
export function battle3d(game, S) {
  const want = gfxMode() === '3d' && game.gfx?.ok();
  if (!want) {
    if (S.v3) dropBattle3d(game, S);
    return null;
  }
  if (!S.v3 || S.v3.gen !== game.gfx.gen) S.v3 = { cam: S.v3?.cam || createCamera(), chunks: new Map(), gen: game.gfx.gen, face: {}, hgt: {}, anim: {}, impact: {}, fx: [], lastSig: '', lastDraw: -1, gv: -1, world: null };
  const V = S.v3, b = S.b;
  const gv = `${b.gridVersion || 0}|${b.objects?.size || 0}`;
  if (V.gv !== gv) {
    V.world = worldOf(b); V.gv = gv;
    const gl = game.gfx.gl;
    for (const e of V.edges || []) { freeMesh(gl, e.full); freeMesh(gl, e.low); }
    V.edges = buildEdges(V.world).map((e) => ({ mask: e.mask, full: uploadMesh(gl, e.full), low: uploadMesh(gl, e.low) }));
  }
  const L = S.L;
  if (L) fitCamera(V.cam, L.camArea || { x: L.area.x, y: L.area.y + 30, w: L.area.w, h: L.area.h - 54 }, b.grid.w, b.grid.h, G.wall + 0.5);
  return V;
}
function dropBattle3d(game, S) {
  const gl = game.gfx?.gl;
  if (gl && S.v3.gen === game.gfx.gen) {
    for (const c of S.v3.chunks.values()) freeMesh(gl, c.mesh);
    for (const e of S.v3.edges || []) { freeMesh(gl, e.full); freeMesh(gl, e.low); }
  }
  S.v3 = null;
}

// picking: covers / props are surfaces (smash targets); walls are see-through for the cursor (cells behind them stay clickable)
const topAt = (V) => (x, y) => { const i = y * V.world.w + x, o = V.world.obst[i]; return V.world.floor[i] + (o > 0.3 && o < 1.5 && V.world.kind[i] !== 'wall' ? o : 0); };

export function pickBattle(S, px, py) {
  const V = S.v3;
  if (!V?.world) return null;
  const b = S.b, cam = V.cam;
  // units first: a click on the body selects its cell
  let best = null, bd = Infinity;
  for (const u of b.units) {
    if (u.dead || u.removed) continue;
    const d = S.dispOf(u);
    const h = V.hgt[u.id] ?? 0;
    const T = unitTemplate(u, { simple: !!gfxPrefs().reduceFx });
    const a = project(cam, d.x + 0.5, h, d.y + 0.5), c = project(cam, d.x + 0.5, h + T.top * T.scale, d.y + 0.5);
    const rw = cam.ppmFit * cam.zoom * 0.3;
    if (px > a.x - rw && px < a.x + rw && py < a.y && py > c.y && a.d < bd) { bd = a.d; best = { x: u.x, y: u.y }; }
  }
  return best || pickCell(cam, px, py, b.grid.w, b.grid.h, topAt(V));
}

export function cellScreen(S, x, y, h = 0) {
  const L = S.L, V = S.v3;
  if (!V?.world) return { x: L.mapX + x * L.cell, y: L.mapY + y * L.cell };
  const xi = Math.max(0, Math.min(V.world.w - 1, Math.round(x))), yi = Math.max(0, Math.min(V.world.h - 1, Math.round(y)));
  const p = project(V.cam, x + 0.5, V.world.floor[yi * V.world.w + xi] + h, y + 0.5);
  return { x: p.x - L.cell / 2, y: p.y - L.cell / 2 };
}
export function unitScreen(S, u, d) {
  const L = S.L, V = S.v3;
  if (!V?.world) return { x: L.mapX + d.x * L.cell, y: L.mapY + d.y * L.cell };
  const T = unitTemplate(u, { simple: !!gfxPrefs().reduceFx });
  const top = T.top * T.scale + 0.15;
  const p = project(V.cam, d.x + 0.5, (V.hgt[u.id] ?? 0) + top, d.y + 0.5);
  return { x: p.x - L.cell / 2, y: p.y };
}

// ---------------------------------------------------------------- camera input / buttons
export function camButtons(S, game) {
  const L = S.L;
  if (!L || !hasWebGL2() || game?.gfx?.failed) return [];
  const y = 7, x1 = L.area.x + L.area.w - 120; // top bar, left of «Раунд N»
  const out = [{ id: 'gfx', label: S.v3 ? '2D' : '3D', tip: t('gfx.toggleTip'), x: x1 - 44, y, w: 44, h: 26 }];
  if (S.v3) {
    out.push({ id: 'rotR', label: '⟳', tip: t('gfx.rotTip'), x: x1 - 44 - 4 - 30, y, w: 30, h: 26 }, { id: 'rotL', label: '⟲', tip: t('gfx.rotTip'), x: x1 - 44 - 8 - 60, y, w: 30, h: 26 });
    out.push({ id: 'focus', label: '◎', tip: t('gfx.focusTip'), x: x1 - 44 - 12 - 90, y, w: 30, h: 26 });
  }
  return out;
}
/**
 * Camera pan (3d.md stage 3): middle / right button drag, arrows (WASD belong to the battle's abilities / the roam walk).
 * Right drag starts after GFX.camera.dragMin px so a right click stays a click. Returns true while panning.
 */
export function panInput3d(game, V, { keys = true } = {}) {
  const inp = game.input, m = game.input.mouse, cam = V.cam, C = GFX.camera;
  let used = false;
  const held = m.middle || m.right;
  if (held && m.x >= 0) {
    if (!V.drag) V.drag = { x: m.x, y: m.y, on: m.middle };
    const dx = m.x - V.drag.x, dy = m.y - V.drag.y;
    if (!V.drag.on && Math.hypot(dx, dy) >= C.dragMin) V.drag.on = true;
    if (V.drag.on && (dx || dy)) { panCamera(cam, dx, dy); V.drag.x = m.x; V.drag.y = m.y; used = true; }
    if (V.drag.on) used = true;
  } else V.drag = null;
  if (keys) {
    const kx = (inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('ArrowLeft') ? 1 : 0);
    const ky = (inp.isDown('ArrowDown') ? 1 : 0) - (inp.isDown('ArrowUp') ? 1 : 0);
    if (kx || ky) { const st = C.panSpeed / 60; panCamera(cam, -kx * st, -ky * st); used = true; }
  }
  return used;
}
const inR = (r, m) => m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h;
export function cameraInput3d(game, S) {
  const inp = game.input, m = inp.mouse;
  const btns = camButtons(S, game);
  S.camHover = btns.find((bt) => inR(bt, m)) || null;
  let act = m.clicked && S.camHover ? S.camHover.id : null;
  if (inp.wasPressed('BracketLeft')) act = 'rotL';
  if (inp.wasPressed('BracketRight')) act = 'rotR';
  if (inp.wasPressed('Home')) act = 'focus';
  if (act === 'gfx') {
    setGfxPref('mode', S.v3 ? '2d' : '3d');
    S.dirty = true;
    return true;
  }
  const V = S.v3;
  if (!V) return !!act;
  if (act === 'rotL') rotateCamera(V.cam, -1);
  if (act === 'rotR') rotateCamera(V.cam, 1);
  if (act === 'focus' && V.focusPt) centerCamera(V.cam, V.focusPt.x, V.focusPt.z);
  const L = S.L;
  let used = !!act;
  if (panInput3d(game, V)) used = true;
  if (m.wheel && inR(L.area, m) && !inR(L.log, m)) { zoomCamera(V.cam, -m.wheel); used = true; }
  return used;
}

// ---------------------------------------------------------------- frame
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function modelMat(x, y, z, yaw, lie = 0, s = 1) {
  const c = Math.cos(yaw), si = Math.sin(yaw), cl = Math.cos(lie), sl = Math.sin(lie);
  // M = T * Ry(yaw) * Rx(lie) * S
  return new Float32Array([
    c * s, 0, -si * s, 0,
    si * sl * s, cl * s, c * sl * s, 0,
    si * cl * s, -sl * s, c * cl * s, 0,
    x, y, z, 1,
  ]);
}
const TEAM = (u) => (u.team === 'heroes' ? (u.kind === 'hero' ? 'player' : 'ally') : u.team === 'enemies' ? 'enemy' : 'rival');
const ob = new OverlayBuilder();
const PARTS = [];
let boneData = new Float32Array(BONE_TEX_W * 4 * 32);

/** Shadow resources of the context: depth texture + framebuffer of `size` (1 = dummy, shadows off). */
function shadowRes(X, size) {
  const gl = X.gl;
  if (X.sh && X.sh.size === size) return X.sh;
  if (X.sh) { gl.deleteTexture(X.sh.tex); gl.deleteFramebuffer(X.sh.fb); }
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  X.sh = { tex, fb, size };
  return X.sh;
}
/** Bone texture (RGBA32F, BONE_TEX_W x rows) with the instance data of the frame. */
function boneTex(X, rows) {
  const gl = X.gl;
  if (!X.bt || X.bt.rows < rows) {
    if (X.bt) gl.deleteTexture(X.bt.tex);
    const n = Math.max(32, 1 << Math.ceil(Math.log2(rows)));
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BONE_TEX_W, n, 0, gl.RGBA, gl.FLOAT, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    X.bt = { tex, rows: n };
  }
  return X.bt;
}
/** Orthographic light matrix fitted to the map box (static per camera step: no swimming shadows). */
function lightVP(Ld, Wd) {
  const l = Math.hypot(...Ld), L = [Ld[0] / l, Ld[1] / l, Ld[2] / l];
  const f = [-L[0], -L[1], -L[2]];
  const up = Math.abs(f[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(...r); r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pad = GFX.shadow.pad;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const X of [-pad, Wd.w + pad]) for (const Z of [-pad, Wd.h + pad]) for (const Y of [G.base - 0.5, G.wall + 2.5]) {
    const P = [X, Y, Z];
    x0 = Math.min(x0, d(P, r)); x1 = Math.max(x1, d(P, r)); y0 = Math.min(y0, d(P, u)); y1 = Math.max(y1, d(P, u)); z0 = Math.min(z0, d(P, f)); z1 = Math.max(z1, d(P, f));
  }
  const sx = 2 / (x1 - x0), sy = 2 / (y1 - y0), sz = 2 / (z1 - z0);
  const m = new Float32Array(16);
  m[0] = sx * r[0]; m[4] = sx * r[1]; m[8] = sx * r[2]; m[12] = -sx * (x0 + x1) / 2;
  m[1] = sy * u[0]; m[5] = sy * u[1]; m[9] = sy * u[2]; m[13] = -sy * (y0 + y1) / 2;
  m[2] = sz * f[0]; m[6] = sz * f[1]; m[10] = sz * f[2]; m[14] = -sz * (z0 + z1) / 2;
  m[15] = 1;
  return m;
}
/** Shadow quality: off with «Снизить эффекты» or the setting. */
const shadowSize = (prefs) => (prefs.reduceFx || prefs.shadows === 'off' ? 0 : GFX.shadow.size[prefs.shadows] || GFX.shadow.size.high);

export function drawBattle3d(game, S, { hl = [], units = [], cur = null, overlay = null } = {}) {
  const X = game.gfx, gl = X.gl, V = S.v3;
  if (!gl || !V?.world || X.lost) return;
  X.use();
  const b = S.b, Wd = V.world, prefs = gfxPrefs(), cam = V.cam, now = S.time;
  const dt = Math.min(0.1, V.lastT == null ? 0 : S.time - V.lastT);
  V.lastT = S.time;
  // camera: lean to the active unit when zoomed in
  const cu = cur ? S.dispOf(cur) : null;
  V.focusPt = cu ? { x: cu.x + 0.5, z: cu.y + 0.5 } : S.focus3 || null;
  updateCamera(cam, dt, { focus: V.focusPt, follow: !!S.follow3, instant: prefs.reduceMotion });
  // unit heights (smooth steps on elevation)
  for (const it of units) {
    const d = it.d, i = Math.max(0, Math.min(Wd.w * Wd.h - 1, Math.round(d.y) * Wd.w + Math.round(d.x)));
    const ht = Wd.floor[i] ?? 0;
    const h0 = V.hgt[it.u.id];
    V.hgt[it.u.id] = h0 == null || prefs.reduceMotion ? ht : h0 + (ht - h0) * Math.min(1, dt * GFX.unit.lerpH);
  }
  // overlay: highlights, surfaces (decals), rings; particles of surfaces and actions
  ob.clear();
  PARTS.length = 0;
  const fl = (x, y) => (Wd.floor[y * Wd.w + x] ?? 0) + G.overlay;
  const fxActive = buildFx(S, V, now, prefs, ob, PARTS);
  const wxActive = weatherFx(V, b.map, now, prefs, ob, PARTS);
  overlay?.(ob, fl);
  for (const tr of b.traps || []) if (tr.team === 'heroes') ob.frame(tr.x + 0.2, tr.y + 0.2, tr.x + 0.8, tr.y + 0.8, fl(tr.x, tr.y), 0.06, [...keyRGB('a'), 0.9]);
  for (const h of hl) {
    if (h.x < 0 || h.y < 0 || h.x >= Wd.w || h.y >= Wd.h) continue;
    const y = fl(h.x, h.y) + 0.002;
    if (h.dot) { const r = G.pathDot / 2; ob.rect(h.x + 0.5 - r, h.y + 0.5 - r, h.x + 0.5 + r, h.y + 0.5 + r, y + 0.002, cssRGBA(h.dot)); continue; }
    if (h.fill) { const c = cssRGBA(h.fill); ob.rect(h.x, h.y, h.x + 1, h.y + 1, y, [c[0], c[1], c[2], Math.min(0.6, c[3] * GFX.hlAlpha)]); }
    if (h.stroke) ob.frame(h.x + 0.03, h.y + 0.03, h.x + 0.97, h.y + 0.97, y + 0.001, G.border, cssRGBA(h.stroke));
  }
  const pulse = 0.75 + 0.25 * Math.sin(S.time * Math.PI); // 0.5 Hz breathing (no flicker)
  for (const it of units) {
    if (it.u.dead || it.u.removed) continue;
    if (it.noRing) continue;
    const d = it.d, c = keyRGB(it.teamKey || GFX.team[TEAM(it.u)]), y = (V.hgt[it.u.id] ?? 0) + G.overlay + 0.004;
    const [r0, r1] = GFX.unit.ring;
    ob.ring(d.x + 0.5, d.y + 0.5, y, r0, r1, [c[0], c[1], c[2], it.u === cur ? 0.95 * pulse : 0.7]);
    if (it.u === cur) ob.ring(d.x + 0.5, d.y + 0.5, y, r1 + 0.04, r1 + 0.08, [c[0], c[1], c[2], 0.5 * pulse]);
  }
  // render on demand: unchanged frame -> keep the last image (15 fps idle refresh: breathing, slow surface motion);
  // actions, hits, falls, projectiles, walking and camera tweens — every frame
  const walking = units.some((it) => it.d.path?.length);
  const busy = fxActive || wxActive || walking || animActive(V, now) || cam.moving;
  const sig = `${cam.yaw.toFixed(2)}|${cam.zoom.toFixed(3)}|${cam.cx.toFixed(3)}|${cam.cz.toFixed(3)}|${V.gv}|${ob.v.length}|${hashArr(ob.v)}|${units.map((it) => `${it.d.x.toFixed(2)},${it.d.y.toFixed(2)},${it.alpha.toFixed(2)},${it.tint || ''},${(it.d.flash || 0).toFixed(2)},${it.d.down ? 1 : 0}`).join(';')}|${gl.drawingBufferWidth}x${gl.drawingBufferHeight}|${prefs.brightness}|${prefs.reduceFx}|${prefs.shadows}|${prefs.reduceMotion}`;
  if (!busy && sig === V.lastSig && S.time - V.lastDraw < 1 / GFX.idleFps) return;
  V.lastSig = sig; V.lastDraw = S.time;

  // chunks: signatures only when the world changed (gridVersion / objects); a changed chunk is rebuilt alone
  const CH = GFX.chunk;
  if (V.chunkGv !== V.gv) {
    V.chunkGv = V.gv;
    for (let cy = 0; cy < Wd.h; cy += CH) for (let cx = 0; cx < Wd.w; cx += CH) {
      const key = `${cx},${cy}`, s = chunkSig(Wd, cx, cy), c = V.chunks.get(key);
      if (c && c.sig === s) continue;
      if (c) freeMesh(gl, c.mesh);
      let top = 0;
      for (let y = cy; y < Math.min(Wd.h, cy + CH); y++) for (let x = cx; x < Math.min(Wd.w, cx + CH); x++) { const i = y * Wd.w + x; top = Math.max(top, Wd.floor[i] + Wd.obst[i]); }
      V.chunks.set(key, { sig: s, mesh: uploadMesh(gl, buildChunk(Wd, cx, cy)), box: [cx, cy, Math.min(Wd.w, cx + CH), Math.min(Wd.h, cy + CH), top + 2.5] });
    }
  }
  // frustum culling (orthographic: the projected chunk box against the map area)
  const A0 = cam.area, inView = (bx) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const X of [bx[0], bx[2]]) for (const Z of [bx[1], bx[3]]) for (const Y of [G.base, bx[4]]) {
      const p = project(cam, X, Y, Z);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return x1 >= A0.x && x0 <= A0.x + A0.w && y1 >= S.L.area.y && y0 <= S.L.area.y + S.L.area.h;
  };
  const shown = [];
  for (const c of V.chunks.values()) if (c.mesh && inView(c.box)) shown.push(c);

  // ---- units: templates (cached meshes) + per-instance bones / colours in the bone texture
  const simple = !!prefs.reduceFx;
  const heroes = b.units.filter((u) => u.team === 'heroes' && !u.dead), foes = b.units.filter((u) => u.team !== 'heroes' && !u.dead);
  const inst = [];
  const offScreen = (d) => { const p = project(cam, d.x + 0.5, 0, d.y + 0.5); return p.x < A0.x - 120 || p.x > A0.x + A0.w + 120 || p.y < S.L.area.y - 60 || p.y > S.L.area.y + S.L.area.h + 220; };
  for (const it of units) {
    const u = it.u, d = it.d;
    if (it.cull && offScreen(d)) continue;
    const T = unitTemplate(u, { simple, lod: cam.zoomIdx === 0 });
    const m = X.mesh(`tpl:${T.key}`, () => T.mb);
    if (!m) continue;
    // facing: the target of the current action, else movement direction, else towards the other side
    const fz = V.face[u.id] || (V.face[u.id] = { x: d.x, y: d.y, a: null });
    let a = fz.a;
    const aim = aimOf(V, u.id, now);
    if (Math.abs(d.x - fz.x) + Math.abs(d.y - fz.y) > 0.01) { a = Math.atan2(d.x - fz.x, d.y - fz.y); fz.x = d.x; fz.y = d.y; }
    if (aim) a = Math.atan2(aim.x - (d.x + 0.5), aim.z - (d.y + 0.5));
    else if (it.face != null) a = a == null || prefs.reduceMotion ? it.face : a + angDelta(a, it.face) * Math.min(1, dt * 10);
    else if (a == null || !d.path?.length) {
      const other = u.team === 'heroes' ? foes : heroes;
      if (other.length && !(d.path?.length) && !(u.dead || u.removed)) {
        let ox = 0, oy = 0; for (const o of other) { ox += o.x; oy += o.y; }
        const want = Math.atan2(ox / other.length - d.x, oy / other.length - d.y);
        a = a == null || prefs.reduceMotion ? want : a + angDelta(a, want) * Math.min(1, dt * 8);
      } else if (a == null) a = cam.yaw * Math.PI / 180;
    }
    fz.a = a;
    const st = trackWalk(V, u.id, d.x, d.y);
    const dead = !!(u.dead || u.removed);
    if (dead && st.deathT0 < 0) st.deathT0 = now; // removed without an event (fled / unsummoned)
    // dying units: stay opaque while they fall, then fade
    const alpha = dead ? Math.min(1, it.alpha * 2.2) : it.alpha;
    const flash = Math.min(0.6, (d.flash || 0) * 3);
    const team = keyRGB(it.tint || it.teamKey || GFX.team[TEAM(u)]);
    inst.push({ it, T, m, st, a, alpha, flash, team, dead, walking: !!d.path?.length, trans: alpha < 0.99, grow: it.tint ? GFX.unit.growTarget : GFX.unit.grow });
  }
  // rows: grouped by template, opaque first (x-ray / body / outline draw the opaque run, the translucent run after)
  inst.sort((p, q) => (p.T.key < q.T.key ? -1 : p.T.key > q.T.key ? 1 : (p.trans ? 1 : 0) - (q.trans ? 1 : 0)));
  const groups = [];
  const rowF = BONE_TEX_W * 4;
  if (boneData.length < inst.length * rowF) boneData = new Float32Array(inst.length * rowF * 2);
  const wc = keyRGB('5'); // hit flash: bone white, soft (d.flash fades)
  inst.forEach((p, row) => {
    let g = groups[groups.length - 1];
    if (!g || g.key !== p.T.key) { g = { key: p.T.key, m: p.m, first: row, nOp: 0, nTr: 0 }; groups.push(g); }
    if (p.trans) g.nTr++; else g.nOp++;
    const d = p.it.d, o = row * rowF;
    poseBones(p.T, p.st, { dead: p.dead, down: !!d.down }, now, { x: d.x + 0.5, y: V.hgt[p.it.u.id] ?? 0, z: d.y + 0.5, yaw: p.a }, boneData, o, { walking: p.walking, reduceMotion: prefs.reduceMotion });
    boneData.set([wc[0], wc[1], wc[2], p.flash, p.team[0], p.team[1], p.team[2], p.alpha, p.grow, 0, 0, 0], o + 132);
  });
  const BT = boneTex(X, Math.max(1, inst.length));
  if (inst.length) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, BT.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BONE_TEX_W, inst.length, gl.RGBA, gl.FLOAT, boneData.subarray(0, inst.length * rowF));
  }
  const drawGroup = (P, g, from, n) => {
    if (!n) return;
    gl.uniform1i(P.u.uBase, g.first + from);
    gl.bindVertexArray(g.m.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, g.m.count, gl.UNSIGNED_INT, 0, n);
  };

  const W = gl.canvas.width, H = gl.canvas.height;
  const { r, f } = basis(cam), Ld = GFX.light.dir;
  const lv = [r[0] * Ld[0] - f[0] * Ld[2], Ld[1], r[2] * Ld[0] - f[2] * Ld[2]];
  const ll = Math.hypot(...lv);
  // ---- shadow pass (1 directional light from the upper left of the screen, steeper than the shading light)
  const shSize = shadowSize(prefs);
  const SH = shadowRes(X, shSize || 1);
  const Sd = GFX.shadow.dir;
  const sv = [r[0] * Sd[0] - f[0] * Sd[2], Sd[1], r[2] * Sd[0] - f[2] * Sd[2]];
  const SVP = lightVP(sv, Wd);
  if (shSize) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb);
    gl.viewport(0, 0, shSize, shSize);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    const D = X.D;
    gl.useProgram(D.prog);
    gl.uniformMatrix4fv(D.u.uVP, false, SVP);
    gl.uniformMatrix4fv(D.u.uModel, false, IDENT);
    if (D.u.uGrow) gl.uniform1f(D.u.uGrow, 0);
    for (const c of V.chunks.values()) if (c.mesh) { gl.bindVertexArray(c.mesh.vao); gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0); }
    const nearS = nearMask(cam);
    for (const e of V.edges || []) { const m = e.mask & nearS ? e.low : e.full; if (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); } }
    const DK = X.DK;
    gl.useProgram(DK.prog);
    gl.uniformMatrix4fv(DK.u.uVP, false, SVP);
    gl.uniform1i(DK.u.uBones, 0);
    if (DK.u.uMode) gl.uniform1i(DK.u.uMode, 0);
    if (DK.u.uGrow) gl.uniform1f(DK.u.uGrow, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, BT.tex);
    for (const g of groups) drawGroup(DK, g, 0, g.nOp);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  gl.viewport(0, 0, W, H);
  const bg = keyRGB(GFX.sky[Wd.biome] || GFX.sky.default);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.disable(gl.SCISSOR_TEST);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // the world only inside the map area (UI panels around it stay clean)
  const A = cam.area;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(A.x, H - (S.L.area.y + S.L.area.h), A.w, S.L.area.h);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.disable(gl.BLEND);

  const VP = viewProj(cam, W, H);
  // shared uniforms of the world and the skinned program
  const vis = visionOf(b.map), FG = GFX.light.fog;
  const fc = keyRGB(GFX.fogColor[Wd.biome] || GFX.fogColor.default);
  const Tg = [cam.cx, cam.cy, cam.cz];
  const tod = b.map.tod, NT = GFX.light.night;
  const amount = vis.dark ? NT.amount : tod === 'dusk' ? NT.dusk : 0;
  const ovl = WEATHER.tod[tod]?.overlay?.[0] || '0', nc = keyRGB(ovl);
  const ls = amount && vis.dark ? (S.lights3 || lightSources(b)).slice(0, GFX.light.night.max) : [];
  const larr = new Float32Array(24);
  ls.forEach(([x, y, rr], k) => { larr[k * 3] = x + 0.5; larr[k * 3 + 1] = y + 0.5; larr[k * 3 + 2] = (rr + 0.5) * NT.radiusMul; });
  const common = (P) => {
    const U = P.u;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniformMatrix4fv(U.uShadowVP, false, SVP);
    gl.uniform3f(U.uLight, lv[0] / ll, lv[1] / ll, lv[2] / ll);
    gl.uniform2f(U.uSteps, GFX.light.steps[0], GFX.light.steps[1]);
    gl.uniform1f(U.uAo, GFX.light.ao);
    gl.uniform1f(U.uGrow, 0);
    // fog: biome colour, denser in fog / rain (WEATHER vis); off with «Снизить эффекты»
    gl.uniform4f(U.uFogPlane, f[0], f[1], f[2], -(f[0] * Tg[0] + f[1] * Tg[1] + f[2] * Tg[2]));
    gl.uniform4f(U.uFog, fc[0], fc[1], fc[2], prefs.reduceFx ? 0 : vis.vis ? Math.min(0.6, FG.max + 0.2) : FG.max);
    gl.uniform2f(U.uFogRange, vis.vis ? -4 : FG.near, vis.vis ? vis.vis * 2 : FG.far);
    // night / dusk tint with static light holes
    gl.uniform4f(U.uNight, nc[0], nc[1], nc[2], amount);
    gl.uniform3fv(U.uLights, larr);
    gl.uniform1i(U.uNumLights, ls.length);
    gl.uniform1f(U.uBright, prefs.brightness || 1);
    gl.uniform1f(U.uMaxPix, GFX.maxPixel);
    gl.uniform1i(U.uShadow, 1);
    gl.uniform3f(U.uShadowOn, shSize ? GFX.shadow.strength : 0, 1 / (shSize || 1), GFX.shadow.bias);
  };
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, SH.tex);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, BT.tex);

  const P = X.P, U = P.u;
  common(P);
  gl.uniformMatrix4fv(U.uModel, false, IDENT);
  gl.uniform4f(U.uTint, 0, 0, 0, 0);
  gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  gl.uniform1f(U.uAlpha, 1);
  for (const c of shown) { gl.bindVertexArray(c.mesh.vao); gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0); }
  const near = nearMask(cam);
  for (const e of V.edges || []) {
    const m = e.mask & near ? e.low : e.full;
    if (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); }
  }
  // barrels (break mid-battle)
  for (const br of b.barrels || []) {
    const id = br.kind === 'toxgas' ? 'barrel-toxic' : 'barrel', m = X.mesh(`prop:${id}`, () => propModel(id));
    if (!m) continue;
    gl.uniformMatrix4fv(U.uModel, false, modelMat(br.x, Wd.floor[br.y * Wd.w + br.x] || 0, br.y, 0));
    gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
  }

  // ---- units (instanced per template): x-ray behind walls -> body -> outline hull -> translucent
  const K = X.K, KU = K.u;
  common(K);
  gl.uniform1i(KU.uBones, 0);
  // x-ray: units hidden behind walls / props — flat team colour at 30 %, drawn against the world depth before the
  // units themselves (no self-occlusion); stencil keeps it one layer thick
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthFunc(gl.GREATER);
  gl.depthMask(false);
  gl.clear(gl.STENCIL_BUFFER_BIT);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.EQUAL, 0, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
  gl.uniform1i(KU.uMode, 1);
  gl.uniform1f(KU.uFlatMul, 1);
  gl.uniform1f(KU.uXAlpha, GFX.unit.xray);
  for (const g of groups) drawGroup(K, g, 0, g.nOp);
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.BLEND);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  // bodies
  gl.uniform1i(KU.uMode, 0);
  for (const g of groups) drawGroup(K, g, 0, g.nOp);
  // outline hull: front faces culled, grown along normals (per instance: targets thicker), team colour x 0.8
  gl.cullFace(gl.FRONT);
  gl.uniform1i(KU.uMode, 1);
  gl.uniform1f(KU.uFlatMul, 0.8);
  gl.uniform1f(KU.uXAlpha, 1);
  gl.uniform1f(KU.uGrow, 0.0001);
  for (const g of groups) drawGroup(K, g, 0, g.nOp);
  gl.cullFace(gl.BACK);
  gl.uniform1f(KU.uGrow, 0);
  // fading / downed / own invisible units
  gl.uniform1i(KU.uMode, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const g of groups) drawGroup(K, g, g.nOp, g.nTr);
  gl.depthFunc(gl.LEQUAL);

  // ---- overlay quads (no depth write, slight offset against z-fighting)
  if (ob.count) {
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    gl.useProgram(X.O.prog);
    gl.uniformMatrix4fv(X.O.u.uVP, false, VP);
    gl.uniform1f(X.O.u.uBright, prefs.brightness || 1);
    gl.uniform1f(X.O.u.uMaxPix, GFX.maxPixel);
    const o = uploadOverlay(gl, ob, 0);
    gl.bindVertexArray(o.vao);
    gl.drawArrays(gl.TRIANGLES, 0, o.count);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  // ---- particles (instanced low-poly balls, translucent, depth-tested)
  if (PARTS.length) {
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(X.PT.prog);
    gl.uniformMatrix4fv(X.PT.u.uVP, false, VP);
    gl.uniform1f(X.PT.u.uBright, prefs.brightness || 1);
    gl.uniform1f(X.PT.u.uMaxPix, GFX.maxPixel);
    const pi = uploadInstanced(gl, particleMesh(), new Float32Array(PARTS), 0);
    gl.bindVertexArray(pi.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, pi.count, gl.UNSIGNED_INT, 0, pi.n);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindVertexArray(null);
  V.stats = { units: inst.length, groups: groups.length, particles: PARTS.length / 12, shadow: shSize, busy, chunks: shown.length, chunksAll: V.chunks.size, lights: ls.length, weather: wxActive };
}
const angDelta = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function hashArr(a) { let h = 0; for (let i = 0; i < a.length; i += 7) h = (Math.imul(h, 31) + (a[i] * 1000 | 0) + (a[i + 2] * 977 | 0) + (a[i + 6] * 100 | 0)) | 0; return h; }
