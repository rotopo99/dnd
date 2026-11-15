// 3D battlefield (docs/specs/3d.md, stage 1): WebGL layer under the Canvas 2D UI. Builds the static world from the
// battle grid (tiles, `elev`, walls / covers, props of the map def, live objects) in 8x8 chunks (a chunk is rebuilt
// when its cells change — `breakObject`), draws units as capsule dummies (hull outline in the team colour, x-ray
// silhouette behind walls), highlights of the 2D view as translucent quads, surfaces, team rings.
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
import { createGL, worldProgram, overlayProgram, hasWebGL2 } from './gl.js';
import { MeshBuilder, OverlayBuilder, uploadMesh, freeMesh, uploadOverlay, resetOverlays, keyRGB, rampRGB, cssRGBA } from './mesh.js';
import { createCamera, fitCamera, rotateCamera, zoomCamera, updateCamera, viewProj, project, pickCell, basis } from './camera.js';
import { ramp, propModel, propTop, unitModel } from './models.js';
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
          onRestored: () => { X.lost = false; X.P = null; X.gen++; X.gpu.clear(); resetOverlays(X.gl); X.init(); },
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
    init() { X.P = worldProgram(X.gl); X.O = overlayProgram(X.gl); },
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
  const n = g.w * g.h;
  const kind = new Array(n), floor = new Float32Array(n), obst = new Float32Array(n);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x, k = kindOf(b, rows, under, x, y);
    kind[i] = k;
    floor[i] = k === 'water' ? G.water : k === 'deep' ? G.water * 2 : elevAt(g, x, y) * G.elev;
    obst[i] = OBST[k] || 0;
  }
  const alive = (p) => !p.destructible || !p.blocks || !!b.objects?.get(p.y * g.w + p.x);
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
  return { biome, kind, floor, obst, props, alive, edge, w: g.w, h: g.h };
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
  } else mb.bevelBox(x, f, y, x + 1, f + (low ? G.cut : G.wall), y + 1, low ? 0.04 : G.bevel, ramp(wa), { top: ramp(wb) });
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
  return s;
}

// ---------------------------------------------------------------- battle state
export function battle3d(game, S) {
  const want = gfxMode() === '3d' && game.gfx?.ok();
  if (!want) {
    if (S.v3) dropBattle3d(game, S);
    return null;
  }
  if (!S.v3 || S.v3.gen !== game.gfx.gen) S.v3 = { cam: S.v3?.cam || createCamera(), chunks: new Map(), gen: game.gfx.gen, face: {}, hgt: {}, lastSig: '', lastDraw: -1, gv: -1, world: null };
  const V = S.v3, b = S.b;
  const gv = `${b.gridVersion || 0}|${b.objects?.size || 0}`;
  if (V.gv !== gv) {
    V.world = worldOf(b); V.gv = gv;
    const gl = game.gfx.gl;
    for (const e of V.edges || []) { freeMesh(gl, e.full); freeMesh(gl, e.low); }
    V.edges = buildEdges(V.world).map((e) => ({ mask: e.mask, full: uploadMesh(gl, e.full), low: uploadMesh(gl, e.low) }));
  }
  const L = S.L;
  if (L) fitCamera(V.cam, { x: L.area.x, y: L.area.y + 30, w: L.area.w, h: L.area.h - 54 }, b.grid.w, b.grid.h, G.wall + 0.5);
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
    const a = project(cam, d.x + 0.5, h, d.y + 0.5), c = project(cam, d.x + 0.5, h + unitModel(u).top * GFX.unit.scale, d.y + 0.5);
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
  const top = unitModel(u).top * GFX.unit.scale + 0.15;
  const p = project(V.cam, d.x + 0.5, (V.hgt[u.id] ?? 0) + top, d.y + 0.5);
  return { x: p.x - L.cell / 2, y: p.y };
}

// ---------------------------------------------------------------- camera input / buttons
export function camButtons(S, game) {
  const L = S.L;
  if (!L || !hasWebGL2() || game?.gfx?.failed) return [];
  const y = 7, x1 = L.area.x + L.area.w - 120; // top bar, left of «Раунд N»
  const out = [{ id: 'gfx', label: S.v3 ? '2D' : '3D', tip: t('gfx.toggleTip'), x: x1 - 44, y, w: 44, h: 26 }];
  if (S.v3) out.push({ id: 'rotR', label: '⟳', tip: t('gfx.rotTip'), x: x1 - 44 - 4 - 30, y, w: 30, h: 26 }, { id: 'rotL', label: '⟲', tip: t('gfx.rotTip'), x: x1 - 44 - 8 - 60, y, w: 30, h: 26 });
  return out;
}
const inR = (r, m) => m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h;
export function cameraInput3d(game, S) {
  const inp = game.input, m = inp.mouse;
  const btns = camButtons(S, game);
  S.camHover = btns.find((bt) => inR(bt, m)) || null;
  let act = m.clicked && S.camHover ? S.camHover.id : null;
  if (inp.wasPressed('BracketLeft')) act = 'rotL';
  if (inp.wasPressed('BracketRight')) act = 'rotR';
  if (act === 'gfx') {
    setGfxPref('mode', S.v3 ? '2d' : '3d');
    S.dirty = true;
    return true;
  }
  const V = S.v3;
  if (!V) return !!act;
  if (act === 'rotL') rotateCamera(V.cam, -1);
  if (act === 'rotR') rotateCamera(V.cam, 1);
  const L = S.L;
  let used = !!act;
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

export function drawBattle3d(game, S, { hl = [], units = [], cur = null } = {}) {
  const X = game.gfx, gl = X.gl, V = S.v3;
  if (!gl || !V?.world || X.lost) return;
  X.use();
  const b = S.b, Wd = V.world, prefs = gfxPrefs(), cam = V.cam;
  const dt = Math.min(0.1, V.lastT == null ? 0 : S.time - V.lastT);
  V.lastT = S.time;
  // camera: lean to the active unit when zoomed in
  const cu = cur ? S.dispOf(cur) : null;
  updateCamera(cam, dt, { focus: cu ? { x: cu.x + 0.5, z: cu.y + 0.5 } : null, instant: prefs.reduceMotion });
  // unit heights (smooth steps on elevation)
  for (const it of units) {
    const d = it.d, i = Math.max(0, Math.min(Wd.w * Wd.h - 1, Math.round(d.y) * Wd.w + Math.round(d.x)));
    const ht = Wd.floor[i] ?? 0;
    const h0 = V.hgt[it.u.id];
    V.hgt[it.u.id] = h0 == null || prefs.reduceMotion ? ht : h0 + (ht - h0) * Math.min(1, dt * GFX.unit.lerpH);
  }
  // overlay: highlights, surfaces, rings
  ob.clear();
  const fl = (x, y) => (Wd.floor[y * Wd.w + x] ?? 0) + G.overlay;
  for (const [k, cell] of b.surfaces || []) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || y < 0 || x >= Wd.w || y >= Wd.h) continue;
    for (const layer of ['floor', 'gas']) {
      const s = cell[layer], d = s && b.data.surfaces?.[s.kind];
      if (!d || s.hazard) continue;
      const c = keyRGB(d.color || '5');
      if (layer === 'floor') { ob.rect(x, y, x + 1, y + 1, fl(x, y), [c[0], c[1], c[2], 0.35]).frame(x, y, x + 1, y + 1, fl(x, y) + 0.001, 0.05, [c[0], c[1], c[2], 0.75]); }
      else ob.rect(x, y, x + 1, y + 1, fl(x, y) + 0.6, [c[0], c[1], c[2], 0.22]);
    }
  }
  for (const z of b.zones || []) {
    const R = z.size || 1, c = z.kind === 'smoke' ? [0.7, 0.73, 0.78, 0.22] : [0.47, 0.78, 0.55, 0.2];
    for (let y = z.y - R; y <= z.y + R; y++) for (let x = z.x - R; x <= z.x + R; x++) if (x >= 0 && y >= 0 && x < Wd.w && y < Wd.h) ob.rect(x, y, x + 1, y + 1, fl(x, y) + 0.5, c);
  }
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
    const d = it.d, c = keyRGB(GFX.team[TEAM(it.u)]), y = (V.hgt[it.u.id] ?? 0) + G.overlay + 0.004;
    const [r0, r1] = GFX.unit.ring;
    ob.ring(d.x + 0.5, d.y + 0.5, y, r0, r1, [c[0], c[1], c[2], it.u === cur ? 0.95 * pulse : 0.7]);
    if (it.u === cur) ob.ring(d.x + 0.5, d.y + 0.5, y, r1 + 0.04, r1 + 0.08, [c[0], c[1], c[2], 0.5 * pulse]);
  }
  // render on demand: unchanged frame -> keep the last image (15 fps idle refresh)
  const sig = `${cam.yaw.toFixed(2)}|${cam.zoom.toFixed(3)}|${cam.cx.toFixed(3)}|${cam.cz.toFixed(3)}|${V.gv}|${ob.v.length}|${hashArr(ob.v)}|${units.map((it) => `${it.d.x.toFixed(2)},${it.d.y.toFixed(2)},${it.alpha.toFixed(2)},${it.tint || ''},${(it.d.flash || 0).toFixed(2)},${it.d.down ? 1 : 0}`).join(';')}|${gl.drawingBufferWidth}x${gl.drawingBufferHeight}|${prefs.brightness}|${prefs.reduceFx}`;
  if (sig === V.lastSig && S.time - V.lastDraw < 1 / GFX.idleFps) return;
  V.lastSig = sig; V.lastDraw = S.time;

  // chunks
  const CH = GFX.chunk;
  for (let cy = 0; cy < Wd.h; cy += CH) for (let cx = 0; cx < Wd.w; cx += CH) {
    const key = `${cx},${cy}`, s = chunkSig(Wd, cx, cy), c = V.chunks.get(key);
    if (c && c.sig === s) continue;
    if (c) freeMesh(gl, c.mesh);
    V.chunks.set(key, { sig: s, mesh: uploadMesh(gl, buildChunk(Wd, cx, cy)) });
  }

  const W = gl.canvas.width, H = gl.canvas.height;
  gl.viewport(0, 0, W, H);
  const bg = keyRGB(GFX.sky[Wd.biome] || GFX.sky.default);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.disable(gl.SCISSOR_TEST);
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
  gl.depthMask(true);

  const P = X.P, U = P.u, VP = viewProj(cam, W, H);
  gl.useProgram(P.prog);
  gl.uniformMatrix4fv(U.uVP, false, VP);
  gl.uniformMatrix4fv(U.uModel, false, IDENT);
  const { r, f } = basis(cam), Ld = GFX.light.dir;
  const lv = [r[0] * Ld[0] - f[0] * Ld[2], Ld[1], r[2] * Ld[0] - f[2] * Ld[2]];
  const ll = Math.hypot(...lv);
  gl.uniform3f(U.uLight, lv[0] / ll, lv[1] / ll, lv[2] / ll);
  gl.uniform2f(U.uSteps, GFX.light.steps[0], GFX.light.steps[1]);
  gl.uniform1f(U.uAo, GFX.light.ao);
  gl.uniform1f(U.uGrow, 0);
  // fog: biome colour, denser in fog / rain (WEATHER vis); off with «Снизить эффекты»
  const vis = visionOf(b.map), FG = GFX.light.fog;
  const fc = keyRGB(GFX.fogColor[Wd.biome] || GFX.fogColor.default);
  const T = [cam.cx, cam.cy, cam.cz];
  gl.uniform4f(U.uFogPlane, f[0], f[1], f[2], -(f[0] * T[0] + f[1] * T[1] + f[2] * T[2]));
  gl.uniform4f(U.uFog, fc[0], fc[1], fc[2], prefs.reduceFx ? 0 : vis.vis ? Math.min(0.6, FG.max + 0.2) : FG.max);
  gl.uniform2f(U.uFogRange, vis.vis ? -4 : FG.near, vis.vis ? vis.vis * 2 : FG.far);
  // night / dusk tint with static light holes
  const tod = b.map.tod, NT = GFX.light.night;
  const amount = vis.dark ? NT.amount : tod === 'dusk' ? NT.dusk : 0;
  const ovl = WEATHER.tod[tod]?.overlay?.[0] || '0', nc = keyRGB(ovl);
  gl.uniform4f(U.uNight, nc[0], nc[1], nc[2], amount);
  if (amount) {
    const ls = vis.dark ? lightSources(b).slice(0, 8) : [];
    const arr = new Float32Array(24);
    ls.forEach(([x, y, rr], k) => { arr[k * 3] = x + 0.5; arr[k * 3 + 1] = y + 0.5; arr[k * 3 + 2] = (rr + 0.5) * NT.radiusMul; });
    gl.uniform3fv(U.uLights, arr);
    gl.uniform1i(U.uNumLights, ls.length);
  } else gl.uniform1i(U.uNumLights, 0);
  gl.uniform4f(U.uTint, 0, 0, 0, 0);
  gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  gl.uniform1f(U.uAlpha, 1);
  gl.uniform1f(U.uBright, prefs.brightness || 1);
  gl.uniform1f(U.uMaxPix, GFX.maxPixel);

  for (const c of V.chunks.values()) if (c.mesh) { gl.bindVertexArray(c.mesh.vao); gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0); }
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
  // units: body, hull outline (front faces culled, grown along normals), x-ray behind walls
  const drawn = [];
  const heroes = b.units.filter((u) => u.team === 'heroes' && !u.dead), foes = b.units.filter((u) => u.team !== 'heroes' && !u.dead);
  for (const it of units) {
    const u = it.u, d = it.d;
    const mdl = unitModel(u), m = X.mesh(`unit:${mdl.key}`, () => mdl.mb);
    if (!m) continue;
    // facing: movement direction, else towards the other side
    const fz = V.face[u.id] || (V.face[u.id] = { x: d.x, y: d.y, a: null });
    let a = fz.a;
    if (Math.abs(d.x - fz.x) + Math.abs(d.y - fz.y) > 0.01) { a = Math.atan2(d.x - fz.x, d.y - fz.y); fz.x = d.x; fz.y = d.y; }
    if (a == null || !d.path?.length) {
      const other = u.team === 'heroes' ? foes : heroes;
      if (other.length && !(d.path?.length)) {
        let ox = 0, oy = 0; for (const o of other) { ox += o.x; oy += o.y; }
        a = Math.atan2(ox / other.length - d.x, oy / other.length - d.y);
      } else if (a == null) a = cam.yaw * Math.PI / 180;
    }
    fz.a = a;
    let y = V.hgt[u.id] ?? 0, lie = 0;
    if (u.dead || u.removed) y -= (1 - it.alpha) * 0.6;
    if (d.down) { lie = Math.PI / 2; y += GFX.unit.r; }
    const M = modelMat(d.x + 0.5, y, d.y + 0.5, a, lie, GFX.unit.scale);
    drawn.push({ m, M, it });
  }
  const team = (it) => keyRGB(it.tint || GFX.team[TEAM(it.u)]);
  // x-ray: units hidden behind walls / props — flat team colour at 30 %, drawn against the world depth before the units
  // themselves (no self-occlusion); stencil keeps it one layer thick
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthFunc(gl.GREATER);
  gl.depthMask(false);
  gl.clear(gl.STENCIL_BUFFER_BIT);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.EQUAL, 0, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
  for (const o of drawn) {
    if (o.it.u.dead || o.it.u.removed) continue;
    const c = team(o.it);
    gl.uniformMatrix4fv(U.uModel, false, o.M);
    gl.uniform4f(U.uFlat, c[0], c[1], c[2], 1);
    gl.uniform1f(U.uAlpha, GFX.unit.xray);
    gl.bindVertexArray(o.m.vao);
    gl.drawElements(gl.TRIANGLES, o.m.count, gl.UNSIGNED_INT, 0);
  }
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.BLEND);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  gl.uniform1f(U.uAlpha, 1);
  const translucent = [];
  for (const o of drawn) {
    const it = o.it;
    if (it.alpha < 0.99) { translucent.push(o); continue; }
    gl.uniformMatrix4fv(U.uModel, false, o.M);
    gl.bindVertexArray(o.m.vao);
    const fl2 = Math.min(0.6, (it.d.flash || 0) * 3);
    const wc = keyRGB('5'); // hit flash: bone white, soft (d.flash fades)
    gl.uniform4f(U.uTint, wc[0], wc[1], wc[2], fl2);
    gl.drawElements(gl.TRIANGLES, o.m.count, gl.UNSIGNED_INT, 0);
    // outline hull
    const c = team(it);
    gl.cullFace(gl.FRONT);
    gl.uniform1f(U.uGrow, it.tint ? 0.035 : 0.022);
    gl.uniform4f(U.uFlat, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1);
    gl.drawElements(gl.TRIANGLES, o.m.count, gl.UNSIGNED_INT, 0);
    gl.cullFace(gl.BACK);
    gl.uniform1f(U.uGrow, 0);
    gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  }
  gl.uniform4f(U.uTint, 0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const o of translucent) { // fading / downed / own invisible units
    gl.uniformMatrix4fv(U.uModel, false, o.M);
    gl.uniform1f(U.uAlpha, o.it.alpha);
    gl.bindVertexArray(o.m.vao);
    gl.drawElements(gl.TRIANGLES, o.m.count, gl.UNSIGNED_INT, 0);
  }
  gl.depthFunc(gl.LEQUAL);
  gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  gl.uniform1f(U.uAlpha, 1);
  // overlay quads (no depth write, slight offset against z-fighting)
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
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindVertexArray(null);
}
function hashArr(a) { let h = 0; for (let i = 0; i < a.length; i += 7) h = (Math.imul(h, 31) + (a[i] * 1000 | 0) + (a[i + 2] * 977 | 0) + (a[i + 6] * 100 | 0)) | 0; return h; }
