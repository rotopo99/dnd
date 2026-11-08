// Free node map (docs/specs/free-roam.md, этап 1): walk the node on the battle tile grid, the party in a chain, NPCs from
// npcsAt standing / walking, traders at stalls, crates, beds, benches, terminals, exits. Every interaction opens the
// existing windows through the node's menu controller (scenes/location.js with opts.roam: the same NPC actions —
// world/npc-actions.js, caches, rest, disassemble, gate, turn-ins, battles). «Меню узла» (Tab) shows the old view.
// Battles are not on this map yet (этап 2): they go to the usual battle scene and come back here (S.again).
import { t } from '../data/text/index.js';
import { ROAM } from '../data/world/roam.js';
import { NPCS } from '../data/npcs.js';
import { LOCATIONS, resolveLocation } from '../world/data.js';
import { C, FONT, FONT_B, text, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { hotspot } from '../ui/tooltip.js';
import { TILE, drawSprite, heroSpriteIds, tileSpriteIds, idleFrame } from '../assets/sprites.js';
import { drawTileExtra } from '../ui/battle-terrain.js';
import { T_RUBBLE, T_EXIT, isPassable, chebyshev } from '../rules/grid.js';
import { rollDice } from '../rules/dice.js';
import { activeCompanions, grant } from '../world/state.js';
import { pendingTurnins } from '../world/quests.js';
import { atBase, modActive as baseModActive } from '../world/base.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';
import { canCampAt } from './rest.js';
import { createLocationScene } from './location.js';
import {
  roamMapFor, roamGrid, roamNpcIds, placeNpcs, liveObjects, objectAction, approachCell, roamPath, inReach, restorePos, stashKey,
} from '../world/roam.js';

const NPC_CLASSES = ['zabivnoy', 'ranger', 'reper', 'technik', 'shaman'];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const toastAll = (game, list) => { for (const x of list || []) game.toast(x.text, x.color); };

/** Free map for a node with a map, else the menu view (the single entry point for «enter a node»). */
export function createNodeScene(locId) {
  return roamMapFor(locId) ? createRoamScene(locId) : createLocationScene(locId);
}

export function createRoamScene(rawId) {
  const locId = resolveLocation(rawId);
  const loc = LOCATIONS[locId];
  const map = roamMapFor(locId);
  const grid = roamGrid(map);
  const [W, H] = map.size;
  const S = { time: 0, zoom: 1, cam: null, party: [], trail: [], path: [], goal: null, npcs: [], objs: [], buttons: [], hover: null, hoverEnt: null, layer: null, saveT: 0, npcIds: '' };
  let self;
  let L; // the node's menu controller (location scene), shares all actions

  const cell = () => ROAM.zooms[S.zoom];
  const persist = (g) => { writePos(g); saveGame(g.save); };

  // ---------------------------------------------------------------- state
  function npcSprite(id) {
    const n = NPCS[id] || {};
    const cls = n.cls || NPC_CLASSES[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % NPC_CLASSES.length];
    return heroSpriteIds(n.race || 'human', cls);
  }
  function buildParty(game) {
    const sv = game.save;
    const old = S.party;
    const list = [{ key: 'hero', name: sv.hero.name, sprite: heroSpriteIds(sv.hero.race, sv.hero.cls, sv.hero.look) }];
    for (const p of activeCompanions(sv)) list.push({ key: p.npc, name: NPCS[p.npc]?.name || p.npc, sprite: npcSprite(p.npc) });
    const lead = old[0];
    S.party = list.map((m, i) => {
      const o = old.find((x) => x.key === m.key);
      if (o) return { ...o, ...m };
      const at = lead || { x: map.spawn.world[0], y: map.spawn.world[1] };
      return { ...m, x: at.x, y: at.y, cx: Math.round(at.x), cy: Math.round(at.y), i };
    });
  }
  function syncNpcs(game, force = false) {
    const ids = roamNpcIds(locId, game.save);
    const sig = ids.join(',');
    S.objs = liveObjects(map, locId, game.save);
    if (!force && sig === S.npcIds) { for (const n of S.npcs) { const st = S.objs.find((o) => o.type === 'stall' && o.stand && o.stand[0] === n.hx && o.stand[1] === n.hy); if (st && n.trader) st.npc = n.id; } marks(game); return; }
    S.npcIds = sig;
    const prev = new Map(S.npcs.map((n) => [n.id, n]));
    S.npcs = placeNpcs(map, grid, ids, S.objs).map((p) => {
      const o = prev.get(p.id);
      return o ? { ...o, trader: p.trader, route: p.route } : { ...p, hx: p.x, hy: p.y, fx: p.x, fy: p.y, ri: 0, wait: 1 + (p.x % 5), path: null, sprite: npcSprite(p.id) };
    });
    S.layer = null;
    marks(game);
  }
  /** Quest marks («!»): a turn-in waits or the NPC offers a quest. */
  function marks(game) {
    for (const n of S.npcs) n.mark = pendingTurnins(game.save, n.id).length ? 'turnin' : L && L.npc.offeredBy(game, NPCS[n.id]).length ? 'quest' : null;
  }
  function writePos(game) {
    const ld = S.party[0];
    if (!ld || !game.save) return;
    game.save.roam = { loc: locId, x: ld.cx, y: ld.cy, party: S.party.slice(1).map((m) => [m.cx, m.cy]) };
  }
  function spawn(game) {
    const r = restorePos(grid, game.save, locId);
    const [sx, sy] = r ? [r.x, r.y] : map.spawn.world;
    S.party.forEach((m, i) => {
      const p = i && r?.party[i - 1] ? r.party[i - 1] : [sx, sy];
      m.x = m.cx = p[0]; m.y = m.cy = p[1]; m.step = null;
    });
    S.trail = [];
  }

  // ---------------------------------------------------------------- movement
  const speed = (game) => (game.input.isDown('ShiftLeft') || game.input.isDown('ShiftRight') || S.runTo ? ROAM.run : ROAM.walk);
  function startStep(m, nx, ny, sp) {
    const slow = grid.tiles[ny * grid.w + nx] === T_RUBBLE || map.grid[ny][nx] === ',' ? ROAM.slowMul : 1;
    const dist = nx !== m.cx && ny !== m.cy ? Math.SQRT2 : 1;
    m.step = { fx: m.cx, fy: m.cy, tx: nx, ty: ny, t: 0, dur: dist / (sp * slow) };
  }
  function updateLeader(game, dt) {
    const ld = S.party[0];
    const inp = game.input;
    if (ld.step) {
      ld.step.t += dt;
      const k = Math.min(1, ld.step.t / ld.step.dur);
      ld.x = ld.step.fx + (ld.step.tx - ld.step.fx) * k;
      ld.y = ld.step.fy + (ld.step.ty - ld.step.fy) * k;
      if (k < 1) return;
      S.trail.push([ld.cx, ld.cy]);
      if (S.trail.length > 24) S.trail.shift();
      ld.cx = ld.step.tx; ld.cy = ld.step.ty; ld.step = null;
      if (!S.path.length) arrived(game);
    }
    // WASD / arrows: one cell at a time while held (cancels a click path)
    const dx = (inp.isDown('KeyD') || inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('KeyA') || inp.isDown('ArrowLeft') ? 1 : 0);
    const dy = (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 1 : 0) - (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0);
    if (dx || dy) {
      S.path = []; S.goal = null; S.runTo = false;
      const tries = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
      for (const [ax, ay] of tries) {
        const nx = ld.cx + ax, ny = ld.cy + ay;
        if (!isPassable(grid, nx, ny)) continue;
        if (ax && ay && !isPassable(grid, ld.cx + ax, ld.cy) && !isPassable(grid, ld.cx, ld.cy + ay)) continue;
        if (npcAt(nx, ny)) continue;
        startStep(ld, nx, ny, speed(game));
        S.manual = true;
        return;
      }
      return;
    }
    if (S.manual) { S.manual = false; arrived(game); }
    if (S.path.length) {
      const n = S.path.shift();
      startStep(ld, n.x, n.y, speed(game));
    }
  }
  function updateFollowers(dt, sp) {
    for (let i = 1; i < S.party.length; i++) {
      const m = S.party[i];
      const tg = S.trail[S.trail.length - i * ROAM.chainGap];
      if (!tg) continue;
      const ddx = tg[0] - m.x, ddy = tg[1] - m.y;
      const d = Math.hypot(ddx, ddy);
      if (d > ROAM.chainTeleport) { m.x = tg[0]; m.y = tg[1]; } else if (d > 0.01) {
        const s = Math.min(d, sp * 1.15 * dt);
        m.x += (ddx / d) * s; m.y += (ddy / d) * s;
      }
      m.cx = Math.round(m.x); m.cy = Math.round(m.y);
    }
  }
  const npcAt = (x, y) => S.npcs.find((n) => Math.round(n.fx) === x && Math.round(n.fy) === y);
  function updateNpcs(dt) {
    for (const n of S.npcs) {
      if (!n.route) continue;
      if (n.path && n.path.length) {
        const p = n.path[0];
        const ddx = p.x - n.fx, ddy = p.y - n.fy, d = Math.hypot(ddx, ddy);
        const s = ROAM.npcSpeed * dt;
        if (d <= s) { n.fx = p.x; n.fy = p.y; n.path.shift(); } else { n.fx += (ddx / d) * s; n.fy += (ddy / d) * s; }
        continue;
      }
      n.wait -= dt;
      if (n.wait > 0) continue;
      n.ri = (n.ri + 1) % n.route.length;
      const [tx, ty] = n.route[n.ri];
      n.path = roamPath(grid, Math.round(n.fx), Math.round(n.fy), tx, ty) || [];
      const [a, b] = ROAM.npcPause;
      n.wait = a + ((n.ri * 7 + tx) % (b - a + 1));
    }
  }

  // ---------------------------------------------------------------- interaction
  /** Walk to the entity, interact on arrival (immediately if already within reach). */
  function goTo(game, ent, run = false) {
    const ld = S.party[0];
    S.runTo = run;
    if (ent && reachOk(ld.cx, ld.cy, ent)) { S.path = []; S.goal = null; return interact(game, ent); }
    const tx = ent ? ent.x : S.hoverCell.x, ty = ent ? ent.y : S.hoverCell.y;
    const self2 = !ent || (ent.kind === 'obj' && !ent.o.solid);
    const dest = approachCell(grid, ld.step ? ld.step.tx : ld.cx, ld.step ? ld.step.ty : ld.cy, tx, ty, { self: self2 });
    if (!dest) return;
    const from = ld.step ? [ld.step.tx, ld.step.ty] : [ld.cx, ld.cy];
    S.path = roamPath(grid, from[0], from[1], dest.x, dest.y) || [];
    S.goal = ent;
    if (!S.path.length && !ld.step) arrived(game);
  }
  const reachOk = (x, y, ent) => (ent.kind === 'obj' && ent.o.cells ? ent.o.cells.some(([cx, cy]) => inReach(x, y, cx, cy)) : inReach(x, y, Math.round(ent.x), Math.round(ent.y)));
  function arrived(game) {
    const ld = S.party[0];
    const goal = S.goal;
    S.goal = null; S.runTo = false;
    if (goal && reachOk(ld.cx, ld.cy, goal)) return interact(game, goal);
    if (!goal && grid.tiles[ld.cy * grid.w + ld.cx] === T_EXIT) {
      const ex = S.objs.find((o) => o.type === 'exit' && o.cells?.some(([x, y]) => x === ld.cx && y === ld.cy));
      if (ex) interact(game, { kind: 'obj', o: ex, x: ex.x, y: ex.y });
    }
  }
  /** E: the nearest NPC / object within reach. */
  function nearest() {
    const ld = S.party[0];
    let best = null, bd = 9;
    for (const e of entities()) {
      if (!reachOk(ld.cx, ld.cy, e)) continue;
      const d = Math.hypot(e.x - ld.cx, e.y - ld.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const entities = () => [
    ...S.npcs.map((n) => ({ kind: 'npc', n, x: n.fx, y: n.fy })),
    ...S.objs.map((o) => ({ kind: 'obj', o, x: o.x, y: o.y })),
  ];

  /** NPC menu: the same buttons as the menu view (world/npc-actions.js). */
  function npcMenu(game, npc) {
    const acts = L.npc.npcActions(game, npc);
    game.openModal({
      title: npc.name, lines: [{ text: npc.role || '', color: '4' }],
      options: [...acts.map((a) => ({ label: a.label, sub: a.disabled ? a.reason : null, disabled: !!a.disabled, reason: a.reason, run: (g) => L.npc.doNpc(g, npc, a.id) })),
        { label: t('loc.close'), run: () => {} }],
    });
  }
  function interact(game, ent) {
    writePos(game);
    play('uiClick');
    if (ent.kind === 'npc') return npcMenu(game, NPCS[ent.n.id]);
    const o = ent.o;
    const a = objectAction(o);
    const sv = game.save;
    if (a.kind === 'trade') {
      const npc = NPCS[a.npc];
      const tr = L.npc.npcActions(game, npc).find((x) => x.id === 'trade');
      if (tr && !tr.disabled) return L.npc.doNpc(game, npc, 'trade');
      return npcMenu(game, npc);
    }
    if (a.kind === 'cache') return L.searchCache(game, a.cache);
    if (a.kind === 'empty') return game.toast(t('roam.stashOpened'), '4');
    if (a.kind === 'stash') {
      const R = ROAM.stash;
      sv.flags[stashKey(locId, o.id)] = true;
      const credits = rollDice(Math.random, R.credits) * R.mult;
      const items = Math.random() < R.itemChance ? [{ item: R.items[Math.floor(Math.random() * R.items.length)], n: 1 }] : [];
      game.toast(t('loc.found'), 'a');
      toastAll(game, grant(sv, { credits, items }, game.data));
      S.layer = null;
      return L.refresh(game);
    }
    if (a.kind === 'rest') {
      if (!canCampAt(locId)) return game.toast(t('roam.bedNo'), '4');
      return L.restAction(game).run(game);
    }
    if (a.kind === 'disassemble') {
      if (['town', 'hub'].includes(loc.kind) || (atBase(sv) && baseModActive(sv, 'workbench').ok)) return L.openDisassemble(game);
      return game.toast(t('roam.nothing'), '4');
    }
    if (a.kind === 'terminal') {
      const term = t('map.terminal');
      const acts = L.actions(game).filter((x) => x.label.startsWith(term));
      if (!acts.length) return game.toast(t('roam.terminalNone'), '4');
      return game.openModal({ title: t('roam.terminal'), lines: [],
        options: [...acts.map((x) => ({ label: x.label, sub: x.sub, disabled: !!x.disabled, run: (g) => x.run(g) })), { label: t('loc.close'), run: () => {} }] });
    }
    if (a.kind === 'exit') return confirmLeave(game);
    game.toast(t(`roam.${o.type}`) || t('roam.nothing'), '4');
  }
  function confirmLeave(game) {
    game.openModal({ title: t('roam.leaveTitle'), lines: [{ text: t('roam.leaveText') }],
      options: [{ label: t('roam.leave'), run: (g) => L.toMap(g) }, { label: t('roam.stay'), run: () => {} }] });
  }
  function toMenu(game) { writePos(game); L.S.inMenu = true; game.resume(L); }

  // ---------------------------------------------------------------- layout / camera
  function layout(game) {
    const W0 = game.width, H0 = game.height;
    const nav = [['menuView', 'roam.menu', 'Tab'], ['map', 'loc.map', 'M'], ['party', 'panel.party', 'P'], ['rep', 'panel.rep', 'R'], ['journal', 'panel.journal', 'J'], ['save', 'save.save', ''], ['menu', 'loc.toMenu', 'Esc']];
    const bw = 124, gap = 6;
    const x0 = W0 - nav.length * (bw + gap) - 10;
    S.buttons = nav.map(([id, key, k], i) => ({ id, label: t(key), key: k || undefined, x: x0 + i * (bw + gap), y: H0 - 52, w: bw, h: 42 }));
    const sv = game.save;
    if (sv.hero.pendingTalents > 0 || (sv.hero.pendingAsi || []).length) S.buttons.push({ id: 'party', label: sv.hero.pendingTalents > 0 ? t('talent.pending') : t('lvl.asiPending'), x: W0 - 260, y: 12, w: 248, h: 36, selected: true });
  }
  function camTarget(game) {
    const c = cell(), ld = S.party[0];
    const mw = W * c, mh = H * c;
    const tx = mw <= game.width ? (mw - game.width) / 2 : Math.max(0, Math.min(mw - game.width, (ld.x + 0.5) * c - game.width / 2));
    const ty = mh <= game.height - 60 ? (mh - game.height + 60) / 2 : Math.max(0, Math.min(mh - game.height + 60, (ld.y + 0.5) * c - (game.height - 60) / 2));
    return { x: tx, y: ty };
  }
  function nav(game, id) {
    writePos(game);
    if (id === 'menuView') return toMenu(game);
    if (id === 'map') return confirmLeave(game);
    return L.nav(game, id);
  }

  // ---------------------------------------------------------------- static layer (whole map at 32 px, scaled on draw)
  function buildLayer() {
    const c = ROAM.cell, s = c / TILE;
    const cv = document.createElement('canvas');
    cv.width = W * c; cv.height = H * c;
    const x2 = cv.getContext('2d');
    x2.imageSmoothingEnabled = false;
    const b = { grid: { ...grid, tiles: roamGrid({ grid: map.grid, objects: [] }).tiles } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = map.grid[y][x];
      const px = x * c, py = y * c;
      if (ch === 'w') { x2.fillStyle = C.g; x2.fillRect(px, py, c, c); x2.fillStyle = rgba(C.f, 0.35); if ((x + y * 3) % 4 === 0) x2.fillRect(px + 6, py + 12, 14, 2); continue; }
      drawSprite(x2, tileSpriteIds(ch === '=' || ch === '"' ? '.' : ch, x, y), px, py, s);
      if (ch === '=') { x2.fillStyle = C['8']; x2.fillRect(px, py, c, c); x2.fillStyle = C['6']; for (let k = 0; k < 4; k++) x2.fillRect(px, py + k * 8 + 7, c, 1); }
      if (ch === '"') { x2.fillStyle = rgba(C.k, 0.75); x2.fillRect(px, py, c, c); x2.fillStyle = C.l; for (let k = 0; k < 3; k++) x2.fillRect(px + 4 + k * 10, py + 6 + (k % 2) * 10, 3, 9); }
      if (grid.tiles[y * W + x] === T_EXIT) { x2.fillStyle = rgba(C.a, 0.35); x2.fillRect(px, py, c, c); }
      drawTileExtra(x2, b, ch, x, y, c);
    }
    for (const o of S.objs) drawObject(x2, o, o.x * c, o.y * c, c, s);
    x2.strokeStyle = rgba(C['0'], 0.18);
    x2.beginPath();
    for (let x = 1; x < W; x++) { x2.moveTo(x * c + 0.5, 0); x2.lineTo(x * c + 0.5, cv.height); }
    for (let y = 1; y < H; y++) { x2.moveTo(0, y * c + 0.5); x2.lineTo(cv.width, y * c + 0.5); }
    x2.stroke();
    S.layer = cv;
  }
  function drawObject(x2, o, px, py, c, s) {
    const k = c / 16;
    const R = (col, x, y, w, h) => { x2.fillStyle = col; x2.fillRect(px + x * k, py + y * k, w * k, h * k); };
    switch (o.type) {
      case 'stall': R(C['8'], 0, 6, 16, 9); R(C['6'], 0, 13, 16, 2); R(C.c, 0, 1, 16, 4); R(C['5'], 2, 1, 3, 4); R(C['5'], 9, 1, 3, 4); break;
      case 'bed': R(C['6'], 2, 1, 12, 14); R(C.g, 3, 5, 10, 9); R(C['5'], 3, 2, 10, 3); break;
      case 'stash': drawSprite(x2, ['obj-crate'], px, py, s); if (o.opened) { R(rgba(C['0'], 0.6), 2, 4, 12, 4); } else { R(C.a, 7, 8, 2, 2); } break;
      case 'bench': R(C['7'], 1, 5, 14, 4); R(C['6'], 2, 9, 2, 6); R(C['6'], 12, 9, 2, 6); R(C['4'], 4, 3, 5, 2); break;
      case 'terminal': R(C['2'], 3, 2, 10, 13); R(C.i, 4, 3, 8, 6); R(C.h, 5, 4, 3, 1); R(C.h, 5, 6, 5, 1); break;
      case 'fire': R(C['3'], 3, 11, 10, 3); R(C.e, 5, 5, 6, 7); R(C.b, 7, 8, 2, 4); break;
      case 'well': R(C['3'], 2, 4, 12, 11); R(C['0'], 4, 6, 8, 7); R(C['8'], 1, 2, 14, 2); break;
      case 'exit': if (o.boat) { R(C['7'], 1, 6, 14, 6); R(C['6'], 3, 11, 10, 2); R(C['5'], 7, 0, 1, 7); R(C['5'], 8, 1, 4, 4); } break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- scene
  self = {
    id: 'roam', locId, S,
    get loc() { return L; },
    /** Re-create the free map after a battle / entry event (location again()). */
    again(game) { writePos(game); game.setScene(createRoamScene(locId)); },
    enter(game) {
      L = createLocationScene(locId, { roam: self });
      syncNpcs(game, true);
      buildParty(game);
      spawn(game);
      layout(game);
      S.cam = null;
      L.enter(game); // gate, wanted, entry events, turn-ins — exactly as the menu node
    },
    resume(game) {
      L.S.inMenu = false;
      syncNpcs(game);
      buildParty(game);
      layout(game);
      L.resume(game);
    },
    resize(game) { layout(game); },
    toastAnchor(game) { return { x: game.width / 2, y: game.height - 80, dir: -1 }; },
    // test hooks
    goTo: (game, ent) => goTo(game, ent),
    entities, interact: (game, ent) => interact(game, ent), npcMenu: (game, id) => npcMenu(game, NPCS[id]), grid, map,
    update(game, dt) {
      S.time += dt;
      if (L.pump(game)) return;
      const inp = game.input;
      // camera / hover
      const c = cell();
      if (!S.cam) S.cam = camTarget(game);
      const ct = camTarget(game);
      const kk = Math.min(1, dt * ROAM.camLerp);
      S.cam.x += (ct.x - S.cam.x) * kk; S.cam.y += (ct.y - S.cam.y) * kk;
      const m = inp.mouse;
      S.hover = hitButton(S.buttons, m);
      const mx = Math.floor((m.x + S.cam.x) / c), my = Math.floor((m.y + S.cam.y) / c);
      S.hoverCell = mx >= 0 && my >= 0 && mx < W && my < H ? { x: mx, y: my } : null;
      S.hoverEnt = null;
      if (S.hoverCell && !S.hover) {
        // sprites are taller than a tile: the cell under the mouse or the one below it
        const es = entities();
        S.hoverEnt = es.find((e) => e.kind === 'npc' && Math.round(e.x) === mx && (Math.round(e.y) === my || Math.round(e.y) === my + 1))
          || es.find((e) => e.kind === 'obj' && (e.o.cells ? e.o.cells.some(([x, y]) => x === mx && y === my) : e.x === mx && e.y === my)) || null;
      }
      if (m.wheel) { S.zoom = Math.max(0, Math.min(ROAM.zooms.length - 1, S.zoom - Math.sign(m.wheel))); S.cam = null; }
      if (m.clicked) {
        if (S.hover) { if (S.hover.disabled) return; play('uiClick'); return nav(game, S.hover.id); }
        const dbl = S.lastClick && S.time - S.lastClick < 0.3;
        S.lastClick = S.time;
        if (S.hoverEnt) goTo(game, S.hoverEnt, dbl);
        else if (S.hoverCell && isPassable(grid, mx, my)) goTo(game, null, dbl);
      } else if (inp.wasPressed('KeyE')) { const e = nearest(); if (e) interact(game, e); }
      else if (inp.wasPressed('Tab')) return nav(game, 'menuView');
      else if (inp.wasPressed('KeyM')) return nav(game, 'map');
      else if (inp.wasPressed('KeyP')) return nav(game, 'party');
      else if (inp.wasPressed('KeyR')) return nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) return nav(game, 'journal');
      else if (inp.wasPressed('KeyG')) return nav(game, 'gear');
      else if (inp.wasPressed('KeyB')) return nav(game, 'codex');
      else if (inp.wasPressed('Escape')) return nav(game, 'menu');
      if (game.modals.length || game.scene !== self) return;
      updateLeader(game, dt);
      updateFollowers(dt, speed(game));
      updateNpcs(dt);
      S.saveT += dt;
      if (S.saveT >= ROAM.saveTick) { S.saveT = 0; writePos(game); }
    },
    render(game) {
      const { ctx, width: W0, height: H0 } = game;
      const sv = game.save;
      clear(ctx, W0, H0);
      if (!S.layer) buildLayer();
      const c = cell(), k = c / ROAM.cell;
      const cam = S.cam || camTarget(game);
      const cx = Math.round(cam.x), cy = Math.round(cam.y);
      // visible part of the static layer only
      const sx = Math.max(0, cx / k), sy = Math.max(0, cy / k);
      const dx = sx * k - cx, dy = sy * k - cy;
      const sw = Math.min(S.layer.width - sx, (W0 - dx) / k), sh = Math.min(S.layer.height - sy, (H0 - dy) / k);
      ctx.imageSmoothingEnabled = false;
      if (sw > 0 && sh > 0) ctx.drawImage(S.layer, sx, sy, sw, sh, dx, dy, sw * k, sh * k);
      const scr = (x, y) => [Math.round(x * c - cx), Math.round(y * c - cy)];
      // path dots and the hovered cell
      ctx.fillStyle = rgba(C.h, 0.5);
      for (const p of S.path) { const [px, py] = scr(p.x, p.y); ctx.fillRect(px + c / 2 - 2, py + c / 2 - 2, 4, 4); }
      if (S.hoverCell && !S.hover) {
        const [px, py] = scr(S.hoverCell.x, S.hoverCell.y);
        ctx.strokeStyle = S.hoverEnt ? C.a : rgba(C['5'], 0.4); ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, c - 2, c - 2);
      }
      // units sorted by y (only those on screen)
      const s = c / TILE, tms = S.time * 1000;
      const list = [];
      for (const n of S.npcs) list.push({ y: n.fy, x: n.fx, sprite: n.sprite, npc: n });
      S.party.forEach((m, i) => list.push({ y: m.y, x: m.x, sprite: m.sprite, member: m, i }));
      list.sort((a, b) => a.y - b.y);
      for (const u of list) {
        const [px, py] = scr(u.x, u.y);
        if (px < -c * 2 || py < -c * 2 || px > W0 + c || py > H0 + c * 2) continue;
        ctx.fillStyle = rgba(C['0'], 0.4); ctx.fillRect(px + c * 0.2, py + c * 0.8, c * 0.6, c * 0.15);
        drawSprite(ctx, u.sprite, px, py, s, { frame: idleFrame(tms, (u.i || 0) * 0.37 + (u.npc ? u.x : 0)) });
        if (u.member) { ctx.fillStyle = u.i === 0 ? C.h : C.j; ctx.fillRect(px + c * 0.3, py + c - 3, c * 0.4, 2); }
        if (u.npc) {
          const mark = u.npc.mark;
          if (mark) text(ctx, '!', px + c / 2, py - c * 0.9, C.a, FONT_B, 'center');
        }
      }
      // names: hovered entity + NPCs near the leader
      const ld = S.party[0];
      for (const n of S.npcs) {
        const near = chebyshev(Math.round(n.fx), Math.round(n.fy), ld.cx, ld.cy) <= 3;
        const hov = S.hoverEnt?.kind === 'npc' && S.hoverEnt.n === n;
        if (!near && !hov) continue;
        const [px, py] = scr(n.fx, n.fy);
        const nm = NPCS[n.id]?.name || n.id;
        ctx.font = '12px monospace';
        const tw = ctx.measureText(nm).width + 8;
        ctx.fillStyle = rgba(C['0'], 0.7); ctx.fillRect(px + c / 2 - tw / 2, py - c * 0.6 - 14, tw, 15);
        text(ctx, nm, px + c / 2, py - c * 0.6 - 13, hov ? C.a : C['5'], '12px monospace', 'center');
      }
      if (S.hoverEnt) {
        const e = S.hoverEnt;
        const [px, py] = scr(e.x, e.y);
        if (e.kind === 'npc') {
          const npc = NPCS[e.n.id];
          hotspot(px, py - c, c, c * 2, { title: npc.name, lines: [npc.role || '', ...(e.n.mark ? [{ text: t(e.n.mark === 'turnin' ? 'roam.turnin' : 'roam.quest'), color: 'a' }] : [])] });
        } else hotspot(px, py, c, c, { title: objName(e.o), lines: objLines(e.o) });
      }
      // HUD: node, day, credits; help line; buttons
      panel(ctx, 10, 10, 520, 54, rgba(C['1'], 0.88), C['3']);
      text(ctx, fit(ctx, loc.name, 500, FONT_B), 20, 16, C.h, FONT_B);
      text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level}`, 20, 40, C.b, '13px monospace');
      text(ctx, fit(ctx, t('roam.help'), W0 - S.buttons.length * 130 - 40, '12px monospace'), 12, H0 - 36, C['4'], '12px monospace');
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
  function objName(o) {
    if (o.type === 'stall') return o.npc ? `${t('roam.stall')}: ${NPCS[o.npc]?.name}` : t('roam.stall');
    if (o.type === 'stash') return o.cache ? t('roam.cache') : t('roam.stash');
    if (o.type === 'exit') return o.boat ? t('roam.boat') : t('roam.exitWorld');
    return t(`roam.${o.type}`);
  }
  function objLines(o) {
    if (o.type === 'stash' && o.opened) return [t('roam.stashOpened')];
    if (o.type === 'bed') return [t('roam.bedSub')];
    if (o.type === 'bench') return [t('roam.benchSub')];
    return [];
  }
  return self;
}
