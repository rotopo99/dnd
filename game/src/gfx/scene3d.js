// 3D battlefield (docs/specs/3d.md, stage 1): WebGL layer under the Canvas 2D UI. Builds the static world from the
// battle grid (tiles, `elev`, walls / covers, props of the map def, live objects) in 8x8 chunks (a chunk is rebuilt
// when its cells change — `breakObject`), draws units (stage 2: skinned templates of gfx/units3d.js, instanced per
// template, poses of gfx/anim.js in a bone texture; hull outline in the team colour, x-ray silhouette behind walls),
// a shadow map pass, highlights of the 2D view as translucent quads, surfaces and effects of gfx/fx3d.js, team rings.
// Battle data never depends on this module (co-op determinism): it only reads S.
//   createGfx(canvas, game)           -> game.gfx { ok(), resize(w, h, cw, ch), endFrame(), use() }
//   battle3d(game, S)                 -> S.v3 (state) when 3D is on, else null (drops S.v3)
//   drawBattle3d(game, S, {hl, units}) render one frame (hl — captured 2D highlights, units — draw list)
//   pickBattle(S, px, py)             -> {x, y, fx?, fz?, unit?} | null (unit body first, else the cell under the ray)
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
import { createGL, worldProgram, overlayProgram, skinProgram, depthProgram, particleProgram, hasWebGL2, softwareGL, BONE_TEX_W, NBONES } from './gl.js';
import { MeshBuilder, OverlayBuilder, uploadMesh, freeMesh, uploadOverlay, resetOverlays, uploadInstanced, resetInstanced, keyRGB, rampRGB, cssRGBA } from './mesh.js';
import { createCamera, fitCamera, rotateCamera, zoomCamera, updateCamera, viewProj, project, pickCell, basis, panCamera, centerCamera } from './camera.js';
export { worldOf, buildChunk, buildEdges, nearMask, cutCells, topAt, TEAM, chunkSig, inView };
import { ramp, propModel, propTop } from './models.js';
import { unitTemplate } from './units3d.js';
import { gpuAtlas, faceCol, FACE_COLS } from './faces.js';
import { poseBones, animActive, aimOf, trackWalk } from './anim.js';
import { buildFx, particleMesh, weatherFx, emitAmbient } from './fx3d.js';
import { floorTone, floorExtras, scatterCell, wallBlock, buildBackdrop, lampsOf, lampGlow, ambientFx } from './env3d.js';
import { gfxMode, gfxPrefs, setGfxPref, markGfxBroken, gfxEngine } from './settings.js';
import { qualityPreset } from './quality.js';
import { createPost } from './post.js';

const G = GFX.geo;

// ---------------------------------------------------------------- context manager
export function createGfx(canvas, game) {
  const X = {
    canvas, gl: null, P: null, O: null, gen: 0, used: false, lost: false, lostAt: 0, failed: false,
    scale: 1, w: canvas.width, h: canvas.height, // render scale of the GL layer (software GL: GFX.soft.scale) / logical size
    gpu: new Map(), // model key -> uploaded mesh (per context generation), shared by all 3D states
    refs: new Map(), // model key -> number of live 3D states using it (0 -> X.idle, freed beyond GFX.meshIdle)
    idle: new Set(), // unreferenced cached meshes, oldest first
    live: new Set(), // holders (S of a battle / roam adapter) with a 3D state (S.v3) on this context
    stale: null, // holders to free at the end of the frame unless drawn in it (scene switch: game.setScene / resume)
    three: null, // threejs-migration.md: Three.js backend (three/engine.js createThree), set by main.js once Three.js loaded
    /** Three.js draws the battle: engine setting 'three' and the backend is up (else the old renderer). */
    threeOn() { const E = X.three; return gfxEngine() === 'three' && !!E && !E.failed && (E.lost || E.ok()); }, // lost: wait (2D after GFX.lostTimeout)
    ok() {
      if (X.failed) return false;
      if (X.gl && !X.lost) return true;
      if (X.lost) return false;
      try {
        X.gl = createGL(canvas, {
          onLost: () => { X.lost = true; X.lostAt = performance.now(); },
          onRestored: () => { X.lost = false; X.P = null; X.gen++; X.gpu.clear(); X.refs.clear(); X.idle.clear(); X.live.clear(); X.sh = null; X.bt = null; X.post = undefined; resetOverlays(X.gl); resetInstanced(X.gl); X.init(); },
        }, { antialias: !softwareGL() });
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
      // software rasteriser (SwiftShader / llvmpipe, only with an explicit 3D choice): fill rate is the bottleneck —
      // no MSAA and a lower-resolution GL layer (CSS scales it up; the 2D UI stays sharp)
      X.soft = softwareGL();
      const sc = X.soft ? GFX.soft.scale : 1;
      if (sc !== X.scale) { X.scale = sc; X.resize(X.w, X.h, canvas.style.width, canvas.style.height); }
    },
    fail() {
      X.failed = true; X.gl = null;
      markGfxBroken();
      game.toast(t('gfx.unavailable'), 'c');
    },
    resize(w, h, cw, ch) {
      X.w = w; X.h = h;
      canvas.width = Math.max(1, Math.round(w * X.scale)); canvas.height = Math.max(1, Math.round(h * X.scale));
      canvas.style.width = cw; canvas.style.height = ch;
      X.three?.resize(w, h, cw, ch);
    },
    use() { X.used = true; },
    endFrame() {
      if (X.lost && !X.failed && performance.now() - X.lostAt > GFX.lostTimeout * 1000) X.fail();
      if (X.stale) { for (const S of X.stale) dropBattle3d(game, S); X.stale = null; }
      const show = X.used && !X.failed;
      if (canvas.style.visibility !== (show ? 'visible' : 'hidden')) canvas.style.visibility = show ? 'visible' : 'hidden';
      X.used = false;
      X.three?.endFrame();
    },
    /** Scene switch: 3D states not drawn by the next frame are freed (chunks, edges, floor texture, mesh refs). */
    leaveScene() { if (X.live.size) X.stale = new Set(X.live); },
    /** Cached GPU mesh of a model; `V` (a 3D state) takes a reference (released by dropBattle3d). */
    mesh(key, build, V = null) {
      let m = X.gpu.get(key);
      if (m === undefined) { m = uploadMesh(X.gl, build()); X.gpu.set(key, m); }
      if (V && !V.meshes.has(key)) { V.meshes.add(key); X.refs.set(key, (X.refs.get(key) || 0) + 1); X.idle.delete(key); }
      return m;
    },
    release(V) {
      for (const key of V.meshes) {
        const n = (X.refs.get(key) || 1) - 1;
        if (n > 0) { X.refs.set(key, n); continue; }
        X.refs.delete(key); X.idle.delete(key); X.idle.add(key);
      }
      V.meshes.clear();
      for (const key of X.idle) {
        if (X.idle.size <= GFX.meshIdle) break;
        X.idle.delete(key); freeMesh(X.gl, X.gpu.get(key)); X.gpu.delete(key);
      }
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
  const Wd = { biome, kind, floor, obst, props, alive, edge, objs, wallH, under, w: g.w, h: g.h };
  Wd.lamps = lampsOf(Wd, b);
  return Wd;
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
  } else wallBlock(mb, Wd, x, y, low, wa, wb);
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
  const [ha, hb] = tileTones(biome, 'half'), [fa, fb] = tileTones(biome, 'full');
  const rHalf = ramp(ha), rHalfTop = ramp(hb), rFull = ramp(fa), rFullTop = ramp(fb);
  // level-design.md: height steps read as retaining walls (wall tone, darker than the floor) — levels, ramps, cliffs
  const rBorder = rampRGB([o.dk, o.base, o.lt]), rSide = rampRGB([o.dk, o.dk, o.dk]); // floor tones: gfx/env3d.js floorTone (upper levels lighter)
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
    const fr = k === 'water' ? rWater : k === 'deep' ? rDeep : k === 'deck' ? ramp('8') : k === 'exit' ? ramp('6') : floorTone(Wd, x, y, f);
    mb.quad([x, f, y], [x, f, y + 1], [x + 1, f, y + 1], [x + 1, f, y], fr, { ao, inside: [x + 0.5, f - 1, y + 0.5] });
    floorExtras(mb, Wd, x, y);
    scatterCell(mb, Wd, x, y);
    // side faces down to lower neighbours (and the map border)
    const sides = [[0, 1, [x, y + 1], [x + 1, y + 1]], [0, -1, [x + 1, y], [x, y]], [1, 0, [x + 1, y + 1], [x + 1, y]], [-1, 0, [x, y], [x, y + 1]]];
    for (const [dx, dz, a, c] of sides) {
      const nt = top(x + dx, y + dz);
      if (nt >= f - 1e-3) continue;
      mb.quad([a[0], nt, a[1]], [c[0], nt, c[1]], [c[0], f, c[1]], [a[0], f, a[1]], k === 'water' || k === 'deep' ? rWater : nt >= 0 ? rSide : rBorder, { inside: [x + 0.5, f - 0.5, y + 0.5], ao: [0.6, 0.6, 0, 0] });
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
  const X = game.gfx, three = gfxMode() === '3d' && !!X?.threeOn();
  const want = gfxMode() === '3d' && (three || X?.ok());
  if (!want) {
    if (S.v3) dropBattle3d(game, S);
    return null;
  }
  const engine = three ? 'three' : 'old', gen = three ? X.three.gen : X.gen;
  if (S.v3 && (S.v3.gen !== gen || S.v3.engine !== engine)) { const cam = S.v3.cam; dropBattle3d(game, S); S.v3 = { cam }; }
  if (!S.v3?.world && !S.v3?.chunks) {
    S.v3 = { cam: S.v3?.cam || createCamera(), engine, chunks: new Map(), meshes: new Set(), gen, face: {}, hgt: {}, anim: {}, impact: {}, fx: [], lastSig: '', lastDraw: -1, gv: -1, world: null };
    X.live.add(S);
  }
  X.stale?.delete(S);
  const V = S.v3, b = S.b;
  const gv = `${b.gridVersion || 0}|${b.objects?.size || 0}`;
  if (V.gv !== gv && three) { V.world = worldOf(b); V.gv = gv; } // three/battle.js rebuilds its scene from V.world
  if (V.gv !== gv) {
    V.world = worldOf(b); V.gv = gv;
    const gl = game.gfx.gl;
    V.floorTex = floorTexture(gl, V.world, V.floorTex);
    for (const e of V.edges || []) { freeMesh(gl, e.full); freeMesh(gl, e.low); }
    V.edges = buildEdges(V.world).map((e) => ({ mask: e.mask, full: uploadMesh(gl, e.full), low: uploadMesh(gl, e.low) }));
    const bk = `${V.world.biome}|${V.world.w}x${V.world.h}`;
    if (V.backKey !== bk) { // horizon beyond the map (once per biome / size)
      freeBackdrop(gl, V.backdrop);
      const B = buildBackdrop(V.world, GFX.sky[V.world.biome] || GFX.sky.default);
      V.backdrop = { ground: B.ground, low: uploadMesh(gl, B.low), groups: B.groups.map((g) => ({ mask: g.mask, mesh: uploadMesh(gl, g.mb) })) };
      V.backKey = bk;
    }
  }
  const L = S.L;
  if (L) fitCamera(V.cam, L.camArea || { x: L.area.x, y: L.area.y + 30, w: L.area.w, h: L.area.h - 54 }, b.grid.w, b.grid.h, G.wall + 0.5);
  return V;
}
function freeBackdrop(gl, B) {
  if (!B) return;
  freeMesh(gl, B.low);
  for (const g of B.groups) freeMesh(gl, g.mesh);
}
/** Frees the GPU resources of a 3D state (chunks, border walls, floor texture; mesh refs back to the shared cache). */
export function dropBattle3d(game, S) {
  const X = game.gfx, V = S.v3;
  X?.live.delete(S);
  if (!V) return;
  if (V.engine === 'three') { X?.three?.dropBattle(V); V.chunks?.clear(); V.world = null; S.v3 = null; return; }
  const gl = X?.gl;
  if (gl && V.gen === X.gen) {
    for (const c of V.chunks.values()) freeMesh(gl, c.mesh);
    for (const e of V.edges || []) { freeMesh(gl, e.full); freeMesh(gl, e.low); }
    freeBackdrop(gl, V.backdrop);
    if (V.floorTex) gl.deleteTexture(V.floorTex);
    X.release(V);
  }
  V.chunks.clear(); V.edges = null; V.backdrop = null; V.floorTex = null; V.world = null;
  S.v3 = null;
}

/** Floor height per cell (R32F, texelFetch in the world shader: cut-away / see-through measure height above floor). */
function floorTexture(gl, Wd, old) {
  const tex = old || gl.createTexture();
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, Wd.w, Wd.h, 0, gl.RED, gl.FLOAT, Wd.floor);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
  return tex;
}

/**
 * metric-combat.md «Обзор»: cut-away fade (walls on the camera side of the focus sink to GFX.view.cutH), see-through
 * points (active unit, hovered unit / cursor point) and the X-ray flag. Advances V.cutK; returns the shader state.
 */
function viewState(S, V, cam, prefs, dt) {
  const VW = GFX.view, mode = prefs.walls || 'cut';
  const want = mode === 'cut' && V.focusPt ? 1 : 0;
  const k0 = V.cutK ?? 0;
  V.cutK = prefs.reduceFx || prefs.reduceMotion ? want : k0 + Math.sign(want - k0) * Math.min(Math.abs(want - k0), dt / VW.fade);
  const pts = [], cuts = [];
  const { f } = basis(cam), fl = Math.hypot(f[0], f[2]) || 1, tx = -f[0] / fl, tz = -f[2] / fl; // toward the camera
  if (mode !== 'off') {
    const b = S.b, Wd = V.world, flr = (x, z) => Wd.floor[Math.max(0, Math.min(Wd.h - 1, Math.floor(z))) * Wd.w + Math.max(0, Math.min(Wd.w - 1, Math.floor(x)))] || 0;
    const cur = b.turn ? b.byId[b.turn.unitId] : null;
    const add = (u) => { if (u && !u.dead && !u.removed && !u.fogHidden) { const d = S.dispOf(u); pts.push([d.x + 0.5, (V.hgt[u.id] ?? 0) + 0.7, d.y + 0.5]); } };
    if (V.focusPt && !cur) pts.push([V.focusPt.x, flr(V.focusPt.x, V.focusPt.z) + 0.7, V.focusPt.z]);
    add(cur);
    const hc = S.hover?.cell;
    const hu = hc ? b.units.find((u) => !u.dead && !u.removed && u.x === hc.x && u.y === hc.y) : null;
    if (hu && hu !== cur) add(hu);
    else if (S.hover?.pt) { const x = S.hover.pt.px / 1.5, z = S.hover.pt.py / 1.5; pts.push([x, flr(x, z) + 0.3, z]); }
    // cut boxes: in front of the active unit (focus) and the cursor / hovered unit only
    if (mode === 'cut') for (const p of pts.slice(0, 2)) cuts.push([p[0], p[2], VW.cutLen, VW.cutW]);
  }
  return { k: V.cutK, xray: !!S.xray, pts: pts.slice(0, 4), cuts, dir: [tx, tz], moving: V.cutK !== want };
}

/** Cells inside the cut boxes (the shader test on cell centres): [index]. */
function cutCells(Wd, view) {
  const out = new Set(), [tx, tz] = view.dir;
  for (const [px, pz, len, hw] of view.cuts) {
    const R = len + hw;
    for (let y = Math.max(0, Math.floor(pz - R)); y <= Math.min(Wd.h - 1, Math.floor(pz + R)); y++) {
      for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(Wd.w - 1, Math.floor(px + R)); x++) {
        const vx = x + 0.5 - px, vz = y + 0.5 - pz, t = vx * tx + vz * tz, q = Math.abs(vx * tz - vz * tx);
        if (t > 0.3 && t < len && q < hw) out.add(y * Wd.w + x);
      }
    }
  }
  return out;
}
/** Dark lids on the cut obstacles (the cut top would show the hollow inside). */
function cutLids(V, view, ob) {
  if (!(view.k > 0) || !view.cuts.length) return;
  const Wd = V.world, VW = GFX.view, ch = 6 + (VW.cutH - 6) * view.k, col = [...keyRGB(VW.lid), 1];
  for (const i of cutCells(Wd, view)) {
    if (Wd.obst[i] <= ch + 0.01) continue;
    const x = i % Wd.w, y = (i / Wd.w) | 0;
    ob.rect(x, y, x + 1, y + 1, Wd.floor[i] + ch, col);
  }
}

// picking: covers / props are surfaces (smash targets); walls are see-through for the cursor (cells behind them stay clickable)
const topAt = (V) => (x, y) => { const i = y * V.world.w + x, o = V.world.obst[i]; return V.world.floor[i] + (o > 0.3 && o < 1.5 && V.world.kind[i] !== 'wall' ? o : 0); };

export function pickBattle(S, px, py) {
  const V = S.v3;
  if (!V?.world) return null;
  if (V.engine === 'three' && V.T) return V.T.pick(S, px, py); // three/battle.js: Raycaster
  const b = S.b, cam = V.cam;
  // a unit body under the cursor wins (click on a unit = its cell / target), else the floor / obstacle top (a point);
  // the floor hit always comes along as fx / fz (metric hover point); `unit` — id of the picked body
  let best = null, bd = Infinity;
  for (const u of b.units) {
    if (u.dead || u.removed) continue;
    const d = S.dispOf(u);
    const h = V.hgt[u.id] ?? 0;
    const T = unitTemplate(u, { simple: !!gfxPrefs().reduceFx });
    const a = project(cam, d.x + 0.5, h, d.y + 0.5), c = project(cam, d.x + 0.5, h + T.top * T.scale, d.y + 0.5);
    const rw = cam.ppmFit * cam.zoom * 0.3;
    if (px > a.x - rw && px < a.x + rw && py < a.y && py > c.y && a.d < bd) { bd = a.d; best = { x: u.x, y: u.y, unit: u.id }; }
  }
  const fl = pickCell(cam, px, py, b.grid.w, b.grid.h, topAt(V));
  if (!best) return fl;
  return fl ? { ...best, fx: fl.fx, fz: fl.fz } : best;
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
  const top = (V.glbTop?.[u.id] ?? T.top * T.scale) + 0.15; // GLB units: their own model top (three/party.js)
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
export function cameraInput3d(game, S, { keysOnly = false } = {}) {
  const inp = game.input, m = inp.mouse;
  const btns = keysOnly ? [] : camButtons(S, game); // keysOnly: under a turn banner (it takes the clicks) — keys / wheel
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
const physicsK = (prefs) => (prefs.physics === 'off' ? 0 : prefs.physics === 'low' ? 0.5 : 1);
const TEAM = (u) => (u.team === 'heroes' ? (u.kind === 'hero' ? 'player' : 'ally') : u.team === 'enemies' ? 'enemy' : 'rival');
const ob = new OverlayBuilder();
const PARTS = [];
/** Overlay batch + particles of the last prepFrame (three/battle.js draws them). */
export const frameBatches = () => ({ ob, PARTS });
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
const shadowSize = (prefs) => (prefs.reduceFx || prefs.shadows === 'off' ? 0 : (GFX.shadow.size[prefs.shadows] || GFX.shadow.size.high) * qualityPreset().shadow);

export function drawBattle3d(game, S, opts = {}) {
  const X = game.gfx, V = S.v3;
  if (V?.engine === 'three') { if (V.world && X.three?.ok()) { X.stale?.delete(S); X.three.drawBattle(game, S, opts); } return; }
  const gl = X.gl;
  if (!gl || !V?.world || X.lost) return;
  X.use();
  X.stale?.delete(S);
  const F = prepFrame(game, S, opts, { soft: X.soft, size: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` });
  if (!F) return;
  const { b, Wd, prefs, cam, now, view, busy, inst: raw, ls, lampsN, ambN, wxActive } = F;
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
  const A0 = cam.area;
  const shown = [];
  for (const c of V.chunks.values()) if (c.mesh && inView(S, cam, c.box)) shown.push(c);
  const inst = [];
  for (const p of raw) { const m = X.mesh(`tpl:${p.T.key}`, () => p.T.mb, V); if (m) inst.push({ ...p, m }); }
  // rows: grouped by template, opaque first (x-ray / body / outline draw the opaque run, the translucent run after)
  inst.sort((p, q) => (p.T.key < q.T.key ? -1 : p.T.key > q.T.key ? 1 : (p.trans ? 1 : 0) - (q.trans ? 1 : 0)));
  const groups = [];
  const rowF = BONE_TEX_W * 4;
  if (boneData.length < inst.length * rowF) boneData = new Float32Array(inst.length * rowF * 2);
  inst.forEach((p, row) => {
    let g = groups[groups.length - 1];
    if (!g || g.key !== p.T.key) { g = { key: p.T.key, m: p.m, first: row, nOp: 0, nTr: 0 }; groups.push(g); }
    if (p.trans) g.nTr++; else g.nOp++;
    poseInst(p, V, now, prefs, boneData, row * rowF);
  });
  return renderOld(game, S, F, { inst, groups, shown, A0, b, Wd, prefs, cam, view, busy, ls, lampsN, ambN, wxActive });
}

/** Chunk box [x0, z0, x1, z1, top] inside the map area of the screen (orthographic frustum culling). */
function inView(S, cam, bx) {
  const A0 = cam.area;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const X of [bx[0], bx[2]]) for (const Z of [bx[1], bx[3]]) for (const Y of [G.base, bx[4]]) {
    const p = project(cam, X, Y, Z);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return x1 >= A0.x && x0 <= A0.x + A0.w && y1 >= S.L.area.y && y0 <= S.L.area.y + S.L.area.h;
}

/** Bones (12 x NBONES floats: rows of 3x4) + 12 extra floats (flash rgb+k, team rgb+alpha, outline px, face column) of
 *  one unit instance into out[o ..] — shared by the old renderer (bone texture row) and three/battle.js. */
export function poseInst(p, V, now, prefs, out, o) {
  const d = p.it.d;
  poseBones(p.T, p.st, { dead: p.dead, down: !!d.down }, now, { x: d.x + 0.5, y: V.hgt[p.it.u.id] ?? 0, z: d.y + 0.5, yaw: p.a }, out, o, { walking: p.walking, reduceMotion: prefs.reduceMotion, physics: physicsK(prefs), crouch: p.it.crouch || 0, walkMul: p.it.walkMul || 1 });
  const emo = d.emoT > 0 && d.emo ? d.emo : 'neutral', seed = p.st.seed;
  const blink = p.dead || d.down || ((now * 0.37 + seed * 7.3) % 1) < 0.045;
  const wc = WHITE();
  out.set([wc[0], wc[1], wc[2], p.flash, p.team[0], p.team[1], p.team[2], p.alpha, p.grow, p.T.anime ? faceCol(emo, blink) / FACE_COLS : 0, 0, 0], o + NBONES * 12);
}
let whiteC = null;
const WHITE = () => whiteC || (whiteC = keyRGB('5')); // hit flash: bone white, soft (d.flash fades)

/**
 * Backend-independent part of a battle frame: camera tween, unit heights, the overlay batch `ob` (contact blobs,
 * surfaces / fx decals, weather, lamp pools, highlights, rings, cut lids) + particles PARTS, render-on-demand check
 * and the unit instances (template, facing, walk state, alpha, flash, team colour). null — the frame is unchanged.
 * R = {soft (idle fps), size (drawing buffer, part of the signature)}.
 */
export function prepFrame(game, S, { hl = [], units = [], cur = null, overlay = null } = {}, R = {}) {
  const V = S.v3;
  // display clock: S.vtime (battle: frozen by the juice hit-stop, slowed by the accent), else S.time
  const b = S.b, Wd = V.world, prefs = gfxPrefs(), cam = V.cam, now = S.vtime ?? S.time;
  const dt = Math.min(GFX.camera.maxDt, V.lastT == null ? 0 : Math.max(0, now - V.lastT));
  V.lastT = now;
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
  const view = viewState(S, V, cam, prefs, dt);
  ob.clear();
  PARTS.length = 0;
  const fl = (x, y) => (Wd.floor[y * Wd.w + x] ?? 0) + G.overlay;
  // contact shadows (premium-look): soft blobs under obstacles / props (static, cached per world version) and units
  {
    const CT = GFX.contact, cc = keyRGB(CT.color);
    if (!prefs.reduceFx) {
      if (V.blobGv !== V.gv) {
        V.blobGv = V.gv; V.blobs = [];
        for (let y = 0; y < Wd.h; y++) for (let x = 0; x < Wd.w; x++) {
          const i = y * Wd.w + x, k = Wd.kind[i];
          if (Wd.obst[i] > 0 && k !== 'wall' && k !== 'fence' && k !== 'deep' && k !== 'water') V.blobs.push(x + 0.5, y + 0.5, Wd.floor[i] + G.overlay - 0.004);
        }
      }
      for (let i = 0; i < V.blobs.length; i += 3) ob.blob(V.blobs[i], V.blobs[i + 1], V.blobs[i + 2], CT.objR, CT.objR, [cc[0], cc[1], cc[2], CT.objA], 12);
    }
    for (const it of units) {
      if (it.u.dead || it.u.removed || it.alpha < 0.5) continue;
      const d = it.d, r = CT.unitR * (it.u.boss ? GFX.unit.bossScale : 1);
      ob.blob(d.x + 0.5, d.y + 0.5, (V.hgt[it.u.id] ?? 0) + G.overlay - 0.002, r, r, [cc[0], cc[1], cc[2], CT.unitA * it.alpha]);
    }
  }
  const fxActive = buildFx(S, V, now, prefs, ob, PARTS);
  const wxActive = weatherFx(V, b.map, now, prefs, ob, PARTS);
  // premium-look: glow pools of lamps / fires / screens + rare ambient particles (time quantised to the idle redraw rate:
  // no per-frame redraws); both off with «Снизить эффекты»
  const tick = R.soft ? GFX.soft.idleFps : GFX.idleFps, tq = Math.floor(now * tick) / tick;
  const visE = visionOf(b.map), lampsN = lampGlow(Wd, cam, tq, prefs, ob, !!visE.dark || b.map.tod === 'dusk');
  const ambN = ambientFx(V, Wd.biome, tq, prefs, PARTS, emitAmbient);
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
    if (it.u === cur) {
      // QA v48 #5: the active unit stands out in a clump — solid wide ring, bright outer band, soft halo
      const A = GFX.unit.activeRing;
      ob.ring(d.x + 0.5, d.y + 0.5, y, r0 - A.grow, r1 + A.grow, [c[0], c[1], c[2], 1]);
      ob.ring(d.x + 0.5, d.y + 0.5, y, r1 + A.gap, r1 + A.gap + A.band, [1, 1, 1, A.bandAlpha * pulse]);
      ob.ring(d.x + 0.5, d.y + 0.5, y, r1 + A.gap + A.band, r1 + A.gap + A.band + A.halo, [c[0], c[1], c[2], A.haloAlpha * pulse]);
    } else ob.ring(d.x + 0.5, d.y + 0.5, y, r0, r1, [c[0], c[1], c[2], 0.7]);
  }
  // render on demand: unchanged frame -> keep the last image (15 fps idle refresh: breathing, slow surface motion);
  // actions, hits, falls, projectiles, walking and camera tweens — every frame
  const walking = units.some((it) => it.d.path?.length);
  cutLids(V, view, ob);
  const busy = fxActive || wxActive || walking || animActive(V, now) || cam.moving || view.moving;
  const sig = `${cam.yaw.toFixed(2)}|${cam.zoom.toFixed(3)}|${cam.cx.toFixed(3)}|${cam.cz.toFixed(3)}|${V.gv}|${ob.v.length}|${hashArr(ob.v)}|${units.map((it) => `${it.d.x.toFixed(2)},${it.d.y.toFixed(2)},${it.alpha.toFixed(2)},${it.tint || ''},${(it.d.flash || 0).toFixed(2)},${it.d.flashF || 0},${it.d.down ? 1 : 0}`).join(';')}|${cam.fx ? `${cam.fx.dx.toFixed(1)},${cam.fx.dy.toFixed(1)},${cam.fx.z.toFixed(3)}` : ''}|${R.size}|${prefs.brightness}|${prefs.reduceFx}|${prefs.shadows}|${prefs.reduceMotion}|${view.k.toFixed(2)}|${view.xray ? 1 : 0}|${view.pts.map((p) => `${p[0].toFixed(2)},${p[2].toFixed(2)}`).join(';')}|${prefs.walls}`;
  if (!busy && sig === V.lastSig && S.time - V.lastDraw < 1 / (R.soft ? GFX.soft.idleFps : GFX.idleFps)) return null;
  V.lastSig = sig; V.lastDraw = S.time;

  const A0 = cam.area;
  // ---- units: templates (cached meshes) + per-instance bones / colours in the bone texture
  const simple = !!prefs.reduceFx;
  const heroes = b.units.filter((u) => u.team === 'heroes' && !u.dead), foes = b.units.filter((u) => u.team !== 'heroes' && !u.dead);
  const inst = [];
  const offScreen = (d) => { const p = project(cam, d.x + 0.5, 0, d.y + 0.5); return p.x < A0.x - 120 || p.x > A0.x + A0.w + 120 || p.y < S.L.area.y - 60 || p.y > S.L.area.y + S.L.area.h + 220; };
  for (const it of units) {
    const u = it.u, d = it.d;
    if (it.cull && offScreen(d)) continue;
    const T = unitTemplate(u, { simple, lod: cam.zoomIdx === 0 || units.length > 10 });
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
    const flash = d.flashF > 0 ? 1 : Math.min(0.6, (d.flash || 0) * 3); // juice: 1 frame of full bone-white, then soft
    const team = keyRGB(it.tint || it.teamKey || GFX.team[TEAM(u)]);
    inst.push({ it, T, st, a, alpha, flash, team, dead, walking: !!d.path?.length, trans: alpha < 0.99, grow: it.tint ? GFX.unit.outlineTargetPx : GFX.unit.outlinePx });
  }
  return { V, b, Wd, prefs, cam, now, dt, view, busy, inst, lampsN, ambN, wxActive, fxActive };
}

/** Old WebGL2 renderer of a prepared frame (gfx/gl.js programs). */
function renderOld(game, S, F, { inst, groups, shown, A0, b, Wd, prefs, cam, view, busy, lampsN, ambN, wxActive }) {
  const X = game.gfx, gl = X.gl, V = S.v3, now = F.now;
  const rowF = BONE_TEX_W * 4;
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

  const rs = X.scale, W = gl.canvas.width / rs, H = gl.canvas.height / rs; // logical px (GL layer may be scaled down)
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

  const bg = keyRGB(GFX.sky[Wd.biome] || GFX.sky.default);
  // post-processing (gfx/post.js): the scene goes into an offscreen target (image + emissive), composited at the end;
  // «Снизить эффекты» or no MRT -> straight to the canvas as before
  const usePost = !prefs.reduceFx && qualityPreset().oldPost; // quality «low»: no post chain (docs/perf.md)
  if (usePost && X.post === undefined) { try { X.post = createPost(gl, { soft: X.soft }); } catch (e) { console.warn('post', e); X.post = null; } }
  const post = usePost ? X.post : null;
  if (post) post.begin(gl.canvas.width, gl.canvas.height, bg);
  else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  // the world only inside the map area (UI panels around it stay clean)
  const A = cam.area;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(Math.floor(A.x * rs), Math.floor((H - (S.L.area.y + S.L.area.h)) * rs), Math.ceil(A.w * rs), Math.ceil(S.L.area.h * rs));
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
  const Fd = GFX.fill.dir, fv = [r[0] * Fd[0] - f[0] * Fd[2], Fd[1], r[2] * Fd[0] - f[2] * Fd[2]], fvl = Math.hypot(...fv) || 1;
  const HF = GFX.hfog;
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
    const wc = keyRGB(NT.warm);
    if (U.uLightCol) gl.uniform4f(U.uLightCol, wc[0], wc[1], wc[2], amount ? NT.warmAmt * amount / NT.amount : 0);
    gl.uniform3fv(U.uLights, larr);
    gl.uniform1i(U.uNumLights, ls.length);
    gl.uniform1f(U.uBright, prefs.brightness || 1);
    gl.uniform1f(U.uMaxPix, GFX.maxPixel);
    // fill light opposite the key; height fog in the biome fog colour (both off with «Снизить эффекты»)
    if (U.uFill) gl.uniform4f(U.uFill, fv[0] / fvl, fv[1] / fvl, fv[2] / fvl, prefs.reduceFx ? 0 : GFX.fill.k);
    const hk = GFX.env.hfog[Wd.biome] || [1, 1];
    if (U.uHFog) gl.uniform4f(U.uHFog, HF.y0, HF.y1 * hk[1], 0, 0);
    if (U.uHFogC) gl.uniform4f(U.uHFogC, fc[0], fc[1], fc[2], prefs.reduceFx ? 0 : HF.amount * hk[0]);
    if (U.uToon) { // anime toon: soft band edge, rim strength, shadow hue amount, outline darkness
      const T2 = GFX.toon, sh = keyRGB(T2.shadeHue), rm = keyRGB(T2.rim), rs = keyRGB(T2.rust);
      gl.uniform4f(U.uToon, T2.soft, prefs.reduceFx ? T2.rim2 * 0.5 : T2.rimK, T2.hue, T2.outline);
      gl.uniform3f(U.uShadeHue, sh[0], sh[1], sh[2]); gl.uniform3f(U.uRimCol, rm[0], rm[1], rm[2]); gl.uniform3f(U.uRustCol, rs[0], rs[1], rs[2]);
      gl.uniform3f(U.uView, f[0], f[1], f[2]);
      gl.uniform1f(U.uPxM, 1 / (cam.ppmFit * cam.zoom));
      gl.uniform1i(U.uFace, 2); gl.uniform1i(U.uMatTex, 3);
    }
    gl.uniform1i(U.uShadow, 1);
    gl.uniform3f(U.uShadowOn, shSize ? GFX.shadow.strength : 0, 1 / (shSize || 1), GFX.shadow.bias);
  };
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, SH.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'face'));
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, gpuAtlas(gl, X, 'mat'));
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, BT.tex);

  if (V.backdrop) { // horizon ground: flat colour bands with the cheap overlay program, drawn first (no depth write)
    const O = X.O, ov = uploadOverlay(gl, V.backdrop.ground, 1);
    gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(O.prog);
    gl.uniformMatrix4fv(O.u.uVP, false, VP);
    gl.uniform1f(O.u.uBright, prefs.brightness || 1);
    gl.uniform1f(O.u.uMaxPix, GFX.maxPixel);
    gl.bindVertexArray(ov.vao);
    gl.drawArrays(gl.TRIANGLES, 0, ov.count);
    gl.depthMask(true); gl.enable(gl.CULL_FACE);
  }
  const P = X.P, U = P.u;
  common(P);
  gl.uniformMatrix4fv(U.uModel, false, IDENT);
  gl.uniform4f(U.uTint, 0, 0, 0, 0);
  gl.uniform4f(U.uFlat, 0, 0, 0, 0);
  gl.uniform1f(U.uAlpha, 1);
  // «Обзор»: cut-away / see-through / X-ray uniforms (world program only; units keep their x-ray silhouettes)
  {
    const VW = GFX.view, dl = Math.hypot(f[0], f[2]) || 1, ppmPx = cam.ppmFit * cam.zoom;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, V.floorTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(U.uFloorT, 4);
    const fp = V.focusPt || { x: 0, z: 0 };
    gl.uniform4f(U.uCut, fp.x, fp.z, -f[0] / dl, -f[2] / dl);
    gl.uniform4f(U.uCutK, view.cuts.length ? view.k : 0, VW.cutH, 0, view.xray ? VW.xrayAlpha : 0);
    const cp = new Float32Array(8);
    view.cuts.forEach((c, i) => cp.set(c, i * 4));
    if (U.uCutP) gl.uniform4fv(U.uCutP, cp);
    if (U.uNumCut) gl.uniform1i(U.uNumCut, view.cuts.length);
    const see = new Float32Array(16);
    view.pts.forEach(([x, y, z], i) => {
      const cw = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
      const nx = (VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / cw, ny = (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / cw, nz = (VP[2] * x + VP[6] * y + VP[10] * z + VP[14]) / cw;
      see.set([(nx * 0.5 + 0.5) * W * rs, (ny * 0.5 + 0.5) * H * rs, VW.seeR * ppmPx * rs, nz * 0.5 + 0.5], i * 4);
    });
    if (U.uSee) gl.uniform4fv(U.uSee, see);
    gl.uniform1i(U.uNumSee, view.pts.length);
    gl.uniform1f(U.uSeeKeep, VW.seeAlpha);
  }
  for (const c of shown) { gl.bindVertexArray(c.mesh.vao); gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0); }
  const near = nearMask(cam);
  if (V.backdrop) { // horizon: ground bands + clutter always, tall silhouettes only on the far sides (the near ones would hide the map)
    const B = V.backdrop;
    gl.uniform3f(U.uShadowOn, 0, 1 / (shSize || 1), GFX.shadow.bias); // no shadow taps over the big flat areas (fill rate)
    for (const m of [B.low]) if (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); }
    for (const g of B.groups) if (g.mesh && !(g.mask & near)) { gl.bindVertexArray(g.mesh.vao); gl.drawElements(gl.TRIANGLES, g.mesh.count, gl.UNSIGNED_INT, 0); }
    gl.uniform3f(U.uShadowOn, shSize ? GFX.shadow.strength : 0, 1 / (shSize || 1), GFX.shadow.bias);
  }
  for (const e of V.edges || []) {
    const m = e.mask & near ? e.low : e.full;
    if (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); }
  }
  // barrels (break mid-battle)
  for (const br of b.barrels || []) {
    const id = br.kind === 'toxgas' ? 'barrel-toxic' : 'barrel', m = X.mesh(`prop:${id}`, () => propModel(id), V);
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
  gl.uniform1i(KU.uMode, 2);
  gl.uniform1f(KU.uFlatMul, 0.8);
  gl.uniform1f(KU.uXAlpha, 1);
  for (const g of groups) drawGroup(K, g, 0, g.nOp);
  gl.cullFace(gl.BACK);
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
  if (post) post.end({ area: [A.x * rs, (H - (S.L.area.y + S.L.area.h)) * rs, A.w * rs, S.L.area.h * rs], bal: GFX.post.balance[Wd.biome] || GFX.post.balance.default });
  gl.bindVertexArray(null);
  V.stats = { units: inst.length, groups: groups.length, particles: PARTS.length / 12, shadow: shSize, busy, chunks: shown.length, chunksAll: V.chunks.size, lights: ls.length, glow: lampsN, ambient: ambN, weather: wxActive, post: !!post, msaa: post ? post.samples : 0 };
}
const angDelta = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function hashArr(a) { let h = 0; for (let i = 0; i < a.length; i += 7) h = (Math.imul(h, 31) + (a[i] * 1000 | 0) + (a[i + 2] * 977 | 0) + (a[i + 6] * 100 | 0)) | 0; return h; }
