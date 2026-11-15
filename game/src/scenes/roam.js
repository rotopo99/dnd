// Free node map (docs/specs/free-roam.md, этап 1): walk the node on the battle tile grid, the party in a chain, NPCs from
// npcsAt standing / walking, traders at stalls, crates, beds, benches, terminals, exits. Every interaction opens the
// existing windows through the node's menu controller (scenes/location.js with opts.roam: the same NPC actions —
// world/npc-actions.js, caches, rest, disassemble, gate, turn-ins, battles). «Меню узла» (Tab) shows the old view.
// Этап 2: battles started here are cut out of this grid (world/roam-battle.js provider → world-battle.js), the party
// comes back on the cells it ended on, corpses stay; guards' view cones, notice meter, alarm, sneaking (C), theft from
// behind, raids — world/roam-stealth.js. M1 (QA v15): Z rest, H base, N night as on the world map.
import { t } from '../data/text/index.js';
import { ROAM } from '../data/world/roam.js';
import { NPCS } from '../data/npcs.js';
import { LOCATIONS, resolveLocation } from '../world/data.js';
import { C, FONT, FONT_B, text, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { hotspot } from '../ui/tooltip.js';
import { TILE, drawSprite, heroSpriteIds, tileSpriteIds, idleFrame, enemySpriteIds } from '../assets/sprites.js';
import { ENEMIES } from '../data/index.js';
import { drawTileExtra } from '../ui/battle-terrain.js';
import { fieldBiome, drawFieldCell, drawFieldProps, propCells } from '../ui/field-view.js';
import { skillActionsAt, npcHintSkills, hintSkillsOf, hintLines } from '../world/node-actions.js';
import { openSkillAction, openSkillActions, drawSkillBadge, drawHintBadges } from '../ui/skill-ui.js';
import { skillName } from '../world/checks.js';
import { T_RUBBLE, T_EXIT, isPassable, chebyshev } from '../rules/grid.js';
import { rollDice } from '../rules/dice.js';
import { activeCompanions, grant, tf, locFaction, members, pickEncounter } from '../world/state.js';
import { npcRole, guardEnemies, addHeat, payFine, fineFor, heatOf } from '../world/crime.js';
import { autoCheck, knowsSkill } from '../world/skill-uses.js';
import { startWorldBattle, encounterSetup } from './world-battle.js';
import { encounterName } from '../world/data.js';
import { baseOpen, BASE_LOC } from '../world/base.js';
import { setRoamProvider, roamBattleMap, aftermath } from '../world/roam-battle.js';
import { seesCell, conePoly, viewRange, noticeStep, behindOf, seesParty, zoneAt, faceOf } from '../world/roam-stealth.js';
import { hashSeed } from '../world/roam-gen.js';
import { pendingTurnins } from '../world/quests.js';
import { atBase, modActive as baseModActive } from '../world/base.js';
import { saveGame } from '../save.js';
import { roam3d, drawRoam3d, pickRoam, roamScreen, roamCamInput, bodyTop } from '../gfx/roam3d.js';
import { pickWeather } from '../world/battlefields.js';
import { play } from '../audio/sfx.js';
import { canCampAt } from './rest.js';
import { createLocationScene } from './location.js';
import {
  roamMapFor, roamGrid, roamNpcIds, placeNpcs, liveObjects, objectAction, approachCell, roamPath, inReach, restorePos, stashKey,
} from '../world/roam.js';

const HUD_H = 70; // px above the map for the node name
// co-op guest: the panels he may open himself (the rest — the host's: menu, map, rest, skills, base)
const GUEST_NAV = new Set(['party', 'rep', 'journal', 'gear', 'codex']);
/** Stable key of a map entity (co-op interaction requests). */
const entKey = (e) => (e.kind === 'npc' ? `npc:${e.n.id}` : e.kind === 'obj' ? `obj:${e.o.type}:${e.o.x},${e.o.y}` : e.kind === 'skill' ? `skill:${e.p.s.id}` : `${e.kind}:${Math.round(e.x)},${Math.round(e.y)}`);
const NPC_CLASSES = ['zabivnoy', 'ranger', 'reper', 'technik', 'shaman'];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const toastAll = (game, list) => { for (const x of list || []) game.toast(x.text, x.color); };

/** Free map for a node with a map, else the menu view (the single entry point for «enter a node»). */
export function createNodeScene(locId) {
  return roamMapFor(locId) ? createRoamScene(locId) : createLocationScene(locId);
}

export function createRoamScene(rawId, opts = {}) {
  const locId = resolveLocation(rawId);
  const loc = LOCATIONS[locId];
  const map = roamMapFor(locId);
  const grid = roamGrid(map);
  const [W, H] = map.size;
  const S = { time: 0, zoom: 1, cam: null, party: [], trail: [], path: [], goal: null, npcs: [], objs: [], buttons: [], hover: null, hoverEnt: null, layer: null, saveT: 0, npcIds: '',
    // этап 2: posts of the node's guards, hostiles hunting the party, corpses, notice meter, alarm, sneaking
    posts: [], hostiles: [], corpses: [], gone: [], notice: 0, seen: false, rollT: 0, rollOk: false, alarm: null, sneak: false };
  const fac = locFaction(locId);
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
      return o ? { ...o, trader: p.trader, route: p.route } : { ...p, hx: p.x, hy: p.y, fx: p.x, fy: p.y, ri: 0, wait: 1 + (p.x % 5), path: null, sprite: npcSprite(p.id), face: (hashSeed(p.id) % 4) * (Math.PI / 2) };
    });
    S.layer = null;
    marks(game);
  }
  /**
   * skills-v3.md: up to ROAM.skillSpots open skill actions as points with a skill badge — on a free cell next to an NPC's home
   * (in order), else on a free spot; deterministic per node. The full list — «Навыки» button.
   */
  function syncSkills(game) {
    const open = skillActionsAt(game.save, locId, loc).filter((x) => !x.done);
    S.skillAll = skillActionsAt(game.save, locId, loc).length;
    S.skillOpen = open.length;
    const taken = new Set([...S.npcs.map((n) => `${n.hx},${n.hy}`), ...S.objs.map((o) => `${o.x},${o.y}`)]);
    const free = (x, y) => isPassable(grid, x, y) && !taken.has(`${x},${y}`) && grid.tiles[y * W + x] !== T_EXIT;
    const anchors = [...S.npcs.map((n) => [n.hx, n.hy]), ...(map.spots || [])];
    const pts = [];
    open.slice(0, ROAM.skillSpots).forEach((x, i) => {
      const old = (S.skills || []).find((p) => p.s.id === x.id);
      if (old) { pts.push({ ...old, s: x }); taken.add(`${old.x},${old.y}`); return; }
      for (let k = 0; k < anchors.length; k++) {
        const [ax, ay] = anchors[(i + k) % anchors.length];
        const cand = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [ax + dx, ay + dy]).find(([cx, cy]) => free(cx, cy));
        if (cand) { pts.push({ s: x, x: cand[0], y: cand[1] }); taken.add(`${cand[0]},${cand[1]}`); return; }
      }
    });
    S.skills = pts;
  }
  /** Quest marks («!»): a turn-in waits or the NPC offers a quest. */
  function marks(game) {
    syncSkills(game);
    for (const n of S.npcs) n.mark = pendingTurnins(game.save, n.id).length ? 'turnin' : L && L.npc.offeredBy(game, NPCS[n.id]).length ? 'quest' : null;
  }
  function writePos(game) {
    const ld = S.party[0];
    if (!ld || !game.save) return;
    if (S.battleDone) return; // the battle wrote the party's new cells (provider after())
    game.save.roam = { loc: locId, x: ld.cx, y: ld.cy, party: S.party.slice(1).map((m) => [m.cx, m.cy]), corpses: S.corpses, gone: S.gone };
  }
  function spawn(game) {
    const r = restorePos(grid, game.save, locId);
    const sr = game.save.roam?.loc === locId ? game.save.roam : null;
    S.corpses = sr?.corpses || []; S.gone = sr?.gone || [];
    const [sx, sy] = r ? [r.x, r.y] : map.spawn.world;
    S.party.forEach((m, i) => {
      const p = i && r?.party[i - 1] ? r.party[i - 1] : [sx, sy];
      m.x = m.cx = p[0]; m.y = m.cy = p[1]; m.step = null;
    });
    S.trail = [];
  }

  // ---------------------------------------------------------------- movement
  const running = (game) => game.input.isDown('ShiftLeft') || game.input.isDown('ShiftRight') || S.runTo;
  const speed = (game) => (S.sneak && !running(game) ? ROAM.stealth.sneak : running(game) ? ROAM.run : ROAM.walk);
  const gait = (game) => (S.sneak && !running(game) ? 'sneak' : running(game) ? 'run' : 'walk');
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
  const npcAt = (x, y) => S.npcs.find((n) => Math.round(n.fx) === x && Math.round(n.fy) === y) || S.posts.find((p) => p.x === x && p.y === y);
  function updateNpcs(dt) {
    for (const n of S.npcs) {
      if (!n.route) continue;
      if (n.path && n.path.length) {
        const p = n.path[0];
        const ddx = p.x - n.fx, ddy = p.y - n.fy, d = Math.hypot(ddx, ddy);
        const s = ROAM.npcSpeed * dt;
        if (d > 0.01) n.face = faceOf(ddx, ddy);
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
    ...(S.skills || []).map((p) => ({ kind: 'skill', p, x: p.x, y: p.y })),
    ...S.posts.map((p) => ({ kind: 'post', p, x: p.x, y: p.y })),
    ...S.hostiles.map((h) => ({ kind: 'hostile', h, x: h.fx, y: h.fy })),
    ...S.corpses.map((c) => ({ kind: 'corpse', c, x: c.x, y: c.y })),
  ];

  /** NPC menu: the same buttons as the menu view (world/npc-actions.js). */
  function npcMenu(game, npc) {
    const acts = L.npc.npcActions(game, npc);
    // §2.2: theft from behind / from the side (outside the NPC's cone) — DC ROAM.stealth.theftBehind
    const n = S.npcs.find((x) => x.id === npc.id), ld = S.party[0];
    const behind = !!n && behindOf(grid, { x: Math.round(n.fx), y: Math.round(n.fy), face: n.face || 0 }, ld.cx, ld.cy);
    const theftMod = behind ? ROAM.stealth.theftBehind : 0;
    game.openModal({
      title: npc.name, lines: [{ text: npc.role || '', color: '4' }, ...(npcHintSkills(npc.id).length ? [{ text: t('hint.title'), color: 'a' }, ...hintLines(game.save, npcHintSkills(npc.id))] : [])],
      options: [...acts.map((a) => ({ label: a.label, sub: a.disabled ? a.reason : a.id === 'steal' && theftMod ? tf('roam.theftSub', { n: theftMod }) : null, disabled: !!a.disabled, reason: a.reason, run: (g) => L.npc.doNpc(g, npc, a.id, { theftMod }) })),
        { label: t('loc.close'), run: () => {} }],
    });
  }
  function interact(game, ent) {
    writePos(game);
    play('uiClick');
    if (ent.kind === 'npc') return npcMenu(game, NPCS[ent.n.id]);
    if (ent.kind === 'post') return game.toast(t('roam.guardSub'), '4');
    if (ent.kind === 'hostile') return game.toast(t('roam.hostileSub'), 'c');
    if (ent.kind === 'corpse') return game.toast(t('roam.corpseSub'), '4');
    // multiplayer.md stage 3: a co-op guest asks the host; the result (windows) comes to everybody
    if (game.coop?.guest) { const ld = S.party[0]; return game.coop.request(game, { kind: 'roam', ent: entKey(ent), x: ld.cx, y: ld.cy }); }
    if (ent.kind === 'skill') return openSkillAction(game, locId, ent.p.s, (g) => { syncSkills(g); L.refresh(g); });
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
    if (a.kind === 'transit') return import('./world-map.js').then((m) => m.openTransit(game, { before: (g) => writePos(g) }));
    game.toast(t(`roam.${o.type}`) || t('roam.nothing'), '4');
  }
  function confirmLeave(game) {
    game.openModal({ title: t('roam.leaveTitle'), lines: [{ text: t('roam.leaveText') }],
      options: [{ label: t('roam.leave'), run: (g) => L.toMap(g) }, { label: t('roam.stay'), run: () => {} }] });
  }
  function toMenu(game) { writePos(game); L.S.inMenu = true; game.resume(L); }

  // ---------------------------------------------------------------- этап 2: guards, stealth, alarm, battles on the map
  const night = (game) => !!game.mapNight;
  const permit = (game) => !!fac && (game.save.rep?.[fac] ?? 0) >= ROAM.stealth.permitRep; // no faction — local militia, no permits
  /** Posts of the node's guards (ROAM.stealth.sentries by map type): by the exits and in restricted zones, turning. */
  function makePosts(game) {
    const n = ROAM.stealth.sentries[map.type] || 0; // no faction — the node's militia (crime.js fallback guards)
    S.posts = [];
    if (!n) return;
    const enemy = guardEnemies(game.save, fac).enemies[0] || 'scavenger';
    const busy = new Set([...S.objs.flatMap((o) => (o.cells || [[o.x, o.y]]).map(([x, y]) => `${x},${y}`)), ...S.npcs.map((n2) => `${n2.hx},${n2.hy}`)]);
    const free = (x, y) => isPassable(grid, x, y) && grid.tiles[y * W + x] !== T_EXIT && !busy.has(`${x},${y}`);
    const near = (cx, cy, r0, r1) => {
      for (let r = r0; r <= r1; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
      return null;
    };
    const cand = [];
    const exits = S.objs.filter((o) => o.type === 'exit' && !o.boat);
    const zones = (map.zones || []).filter((z) => z.restricted);
    for (let i = 0; i < Math.max(exits.length, zones.length); i++) {
      if (zones[i]) { const z = zones[i]; const c = near(z.rect[0] + (z.rect[2] >> 1), z.rect[1] + (z.rect[3] >> 1), 0, 4); if (c) cand.push({ c, toward: null }); }
      if (exits[i]) { const e = exits[i]; const c = near(e.x, e.y, 3, 5); if (c) cand.push({ c, toward: [W >> 1, H >> 1] }); }
    }
    cand.slice(0, n).forEach(({ c, toward }, i) => {
      const id = `post${i + 1}`;
      if (S.gone.includes(id)) return;
      busy.add(`${c[0]},${c[1]}`);
      const base = toward ? Math.atan2(toward[1] - c[1], toward[0] - c[0]) : (i % 4) * (Math.PI / 2);
      const faces = [base, base + Math.PI / 2, base, base - Math.PI / 2];
      S.posts.push({ id, x: c[0], y: c[1], hx: c[0], hy: c[1], face: base, faces, fi: 0, turnT: ROAM.stealth.turn[0] + i, enemy, sprite: enemySpriteIds(enemy) });
    });
  }
  /** Who watches: posts + guard NPCs (crime.js role guard) of a faction. → [{ x, y, face, ref }] */
  function watchers() {
    const out = S.posts.map((p) => ({ x: p.x, y: p.y, face: p.face, ref: p }));
    for (const n of S.npcs) if (npcRole(NPCS[n.id]) === 'guard') out.push({ x: Math.round(n.fx), y: Math.round(n.fy), face: n.face || 0, ref: n });
    return out;
  }
  /** The party is suspicious: in a restricted zone without a permit, or wanted by the node's faction. */
  function suspect(game) {
    const ld = S.party[0];
    S.inZone = !!zoneAt(map, ld.cx, ld.cy) && !permit(game);
    return S.inZone || (fac && heatOf(game.save, fac) >= ROAM.stealth.wantedHeat);
  }
  const showCones = (game) => game.input.isDown('AltLeft') || game.input.isDown('AltRight') || S.alarm || S.perceive;
  function updateStealth(game, dt) {
    const st = ROAM.stealth;
    for (const p of S.posts) {
      p.turnT -= dt;
      if (p.turnT <= 0) { p.fi = (p.fi + 1) % p.faces.length; p.face = p.faces[p.fi]; p.turnT = st.turn[0] + ((p.fi * 3 + p.x) % (st.turn[1] - st.turn[0] + 1)); }
    }
    if (S.alarm) return updateAlarm(game, dt);
    const sus = suspect(game);
    const ld = S.party[0], range = viewRange(night(game));
    S.seen = !!sus && watchers().some((w) => Math.hypot(w.x - ld.cx, w.y - ld.cy) <= st.coneNear && S.party.some((m) => seesCell(grid, w, m.cx, m.cy, range)));
    if (S.seen) {
      S.rollT -= dt;
      if (S.rollT <= 0) { S.rollT = st.rollEvery; S.rollOk = autoCheck(members(game.save, game.data), ['stealth'], st.rollDc).success; }
    } else { S.rollT = 0; S.rollOk = false; }
    S.notice = noticeStep(S.notice, dt, S.seen, gait(game), S.rollOk);
    if (S.notice >= 100) raiseAlarm(game);
  }
  /** Notice 100: alarm — heat, the posts walk to the party; ROAM.stealth.alarmTime s to leave or pay, then they fight. */
  function raiseAlarm(game) {
    const sv = game.save;
    S.alarm = { t: ROAM.stealth.alarmTime, fine: fineFor(20 * (1 + heatOf(sv, fac))) };
    play('enemyTurn');
    game.toast(t('roam.alarmStart'), 'c');
    toastAll(game, addHeat(sv, fac, ROAM.stealth.alarmHeat));
    const list = S.posts.length ? S.posts.map((p) => ({ ...p, post: p })) : guardEnemies(sv, fac).enemies.map((e, i) => {
      const ex = S.objs.find((o) => o.type === 'exit') || { x: map.spawn.world[0], y: map.spawn.world[1] };
      return { id: `guard${i + 1}`, x: ex.x, y: ex.y, enemy: e, sprite: enemySpriteIds(e) };
    });
    S.posts = [];
    S.hostiles.push(...list.map((h) => ({ ...h, kind: 'guards', fx: h.x, fy: h.y, path: null, repath: 0 })));
    layout(game);
  }
  function payAlarm(game) {
    if (!S.alarm) return;
    toastAll(game, payFine(game.save, S.alarm.fine));
    game.toast(t('roam.fined'), 'j');
    S.alarm = null; S.notice = 0;
    const back = S.hostiles.filter((h) => h.post);
    S.hostiles = S.hostiles.filter((h) => !h.post && h.kind !== 'guards');
    S.posts = back.map((h) => ({ ...h.post }));
    persist(game);
    layout(game);
  }
  function updateAlarm(game, dt) {
    S.alarm.t -= dt;
    S.notice = 100;
    if (S.alarm.t <= 0 && !S.alarm.fight) { S.alarm.fight = true; game.toast(t('roam.alarmFight'), 'c'); }
  }
  /** Hostiles walk toward the leader; one that sees the party (ROAM.battle.seeRange, clear view) starts the battle. */
  function updateHostiles(game, dt) {
    const ld = S.party[0], B = ROAM.battle;
    for (const h of S.hostiles) {
      const hunting = h.kind !== 'guards' || S.alarm?.fight;
      if (hunting && seesParty(grid, { x: h.fx, y: h.fy }, S.party)) return fightOnMap(game, h.kind);
      h.repath -= dt;
      if (h.repath <= 0) {
        h.repath = B.repath;
        const stop = !hunting && Math.hypot(h.fx - ld.cx, h.fy - ld.cy) <= 2.5;
        h.path = stop ? [] : roamPath(grid, Math.round(h.fx), Math.round(h.fy), ld.cx, ld.cy) || [];
        if (h.path.length) h.path.pop(); // not onto the leader's cell
      }
      const p = h.path?.[0];
      if (!p) continue;
      const ddx = p.x - h.fx, ddy = p.y - h.fy, d = Math.hypot(ddx, ddy), s2 = B.chase * dt;
      if (d > 0.01) h.face = faceOf(ddx, ddy);
      if (d <= s2) { h.fx = p.x; h.fy = p.y; h.path.shift(); } else { h.fx += (ddx / d) * s2; h.fy += (ddy / d) * s2; }
    }
  }
  /** «Бой!»: the hostiles of this kind fight on the node map (the battle cut — the provider below). */
  function fightOnMap(game, kind) {
    const list = S.hostiles.filter((h) => h.kind === kind);
    if (!list.length) return;
    writePos(game);
    game.toast(t('roam.fight'), 'c');
    const foes = list.map((h) => [Math.round(h.fx), Math.round(h.fy)]);
    const gone = list.filter((h) => h.post).map((h) => h.id);
    const title = kind === 'guards' ? tf('crime.guardsTitle', { faction: loc.name }) : S.raidTitle || loc.name;
    startWorldBattle(game, { enemies: list.map((h) => h.enemy), faction: kind === 'guards' ? fac : S.raidFaction, title, roamFoes: foes, roamGone: gone, noObjectives: true,
      onWin: (g) => { if (kind === 'guards') L.V(g).gate = true; self.again(g); } });
  }
  /** Raid on entering (ROAM.raid): raiders of the region come in from the farthest exit and hunt the party. */
  function maybeRaid(game) {
    const R = ROAM.raid, sv = game.save;
    const key = `raid:${locId}:${sv.day}`;
    if (opts.again || sv.flags[key] || !R.kinds.includes(loc.kind) || (loc.danger || 0) < R.minDanger || Math.random() >= R.chance) return;
    sv.flags[key] = true;
    const e = pickEncounter(sv, loc.region);
    if (!e || e.kind !== 'battle' || !e.encounter) return;
    spawnRaid(game, encounterSetup(sv, e.encounter).enemies, encounterName(e.encounter), e.faction);
  }
  function spawnRaid(game, enemies, name, faction) {
    const ld = S.party[0];
    const ex = [...S.objs.filter((o) => o.type === 'exit' && !o.boat)].sort((a, b) => Math.hypot(b.x - ld.cx, b.y - ld.cy) - Math.hypot(a.x - ld.cx, a.y - ld.cy))[0];
    const at = ex ? approachCell(grid, ex.x, ex.y, ex.x, ex.y) || { x: map.spawn.world[0], y: map.spawn.world[1] } : { x: 1, y: 1 };
    S.raidTitle = name; S.raidFaction = faction || null;
    enemies.forEach((en, i) => {
      const id = typeof en === 'string' ? en : en.enemy || en.id;
      S.hostiles.push({ id: `raid${i + 1}`, kind: 'raid', enemy: en, sprite: enemySpriteIds(id), fx: at.x, fy: at.y, x: at.x, y: at.y, path: null, repath: i * 0.2 });
    });
    game.toast(tf('roam.raid', { name }), 'c');
  }
  /**
   * world-battle.js asks for the battle map while the party is here (roam-battle.js setRoamProvider): units on their
   * cells — party, hostiles (o.roamFoes), the attacked NPC and his guards (o.roamTarget / roamHelpers), the node's posts
   * for a guard fight, else a group toward the nearest exit. after(): party cells and corpses back into save.roam.
   */
  const provider = {
    locId,
    cut(game, enemies, allies, o) {
      const party = S.party.map((m) => [m.cx, m.cy]);
      let foes = [...(o.roamFoes || [])];
      const npcCell = (id) => { const n = S.npcs.find((x) => x.id === id); return n ? [Math.round(n.fx), Math.round(n.fy)] : null; };
      if (!foes.length && o.roamTarget) foes = [npcCell(o.roamTarget), ...(o.roamHelpers || []).map(npcCell)].filter(Boolean);
      if (!foes.length && o.faction && o.faction === fac) foes = [...S.posts.map((p) => [p.x, p.y]), ...S.hostiles.map((h) => [Math.round(h.fx), Math.round(h.fy)])];
      if (!foes.length) {
        const ld = party[0];
        const ex = S.objs.filter((x) => x.type === 'exit').map((x) => [x.x, x.y]).sort((a, b) => Math.hypot(a[0] - ld[0], a[1] - ld[1]) - Math.hypot(b[0] - ld[0], b[1] - ld[1]))[0];
        const dir = ex ? Math.atan2(ex[1] - ld[1], ex[0] - ld[0]) : 0;
        foes = [[Math.round(ld[0] + Math.cos(dir) * ROAM.battle.foeGap), Math.round(ld[1] + Math.sin(dir) * ROAM.battle.foeGap)]];
      }
      const k = foes.length;
      while (foes.length < enemies.length) foes.push(foes[foes.length % k]);
      const def = roamBattleMap(map, S.objs, { party, foes: foes.slice(0, Math.max(1, enemies.length)), allies: allies.map(() => party[0]), id: locId, name: loc.name });
      return {
        map: def,
        after(g, BS) {
          const a = aftermath(def, BS.b.units);
          const ld = a.party[0] || party[0];
          S.battleDone = true;
          g.save.roam = { loc: locId, x: ld[0], y: ld[1], party: a.party.slice(1), corpses: [...S.corpses, ...a.corpses].slice(-30), gone: [...S.gone, ...(o.roamGone || [])] };
        },
      };
    },
  };
  /** M1: H — to the base over the world map (as the world map's «На базу»). */
  function toBase(game) {
    const sv = game.save;
    if (!baseOpen(sv)) return game.toast(t('base.noRoute'), 'c');
    if (resolveLocation(sv.location) === resolveLocation(BASE_LOC)) return game.toast(t('roam.atBase'), '4');
    game.visit = null; sv.roam = null;
    import('./world-map.js').then((m) => { const sc = m.createWorldMapScene(); game.setScene(sc); sc.S.travelTo(BASE_LOC); });
  }

  // ---------------------------------------------------------------- layout / camera
  function layout(game) {
    const W0 = game.width, H0 = game.height;
    const nav = [['menuView', 'roam.menu', 'Tab'], ['map', 'loc.map', 'M'], ['party', 'panel.party', 'P'], ['rep', 'panel.rep', 'R'], ['journal', 'panel.journal', 'J'], ['save', 'save.save', ''], ['menu', 'loc.toMenu', 'Esc']];
    const bw = 124, gap = 6;
    const x0 = W0 - nav.length * (bw + gap) - 10;
    S.buttons = nav.map(([id, key, k], i) => ({ id, label: t(key), key: k || undefined, x: x0 + i * (bw + gap), y: H0 - 52, w: bw, h: 42 }));
    if (S.alarm) S.buttons.push({ id: 'fine', label: tf('roam.fine', { n: S.alarm.fine }), key: 'F', x: 10, y: 120, w: 200, h: 36, selected: true });
    if (S.skillAll) S.buttons.push({ id: 'skills', label: `${t('nsa.group')} ${S.skillOpen}/${S.skillAll}`, x: x0 - bw - gap, y: H0 - 52, w: bw, h: 42 });
    S.hints = hintSkillsOf(game.save, locId, loc);
    const sv = game.save;
    if (sv.hero.pendingTalents > 0 || (sv.hero.pendingAsi || []).length) S.buttons.push({ id: 'party', label: sv.hero.pendingTalents > 0 ? t('talent.pending') : t('lvl.asiPending'), x: W0 - 260, y: 12, w: 248, h: 36, selected: true });
  }
  function camTarget(game) {
    const c = cell(), ld = S.party[0];
    const mw = W * c, mh = H * c;
    const tx = mw <= game.width ? (mw - game.width) / 2 : Math.max(0, Math.min(mw - game.width, (ld.x + 0.5) * c - game.width / 2));
    const top = -HUD_H, vh = game.height - 60 - HUD_H; // the map lives between the HUD and the button bar
    const ty = mh <= vh ? top + (mh - vh) / 2 : Math.max(top, Math.min(mh - vh + top, (ld.y + 0.5) * c - vh / 2 + top));
    return { x: tx, y: ty };
  }
  function nav(game, id) {
    if (game.coop?.guest && !GUEST_NAV.has(id)) { game.toast(t('net.hostOnly'), '4'); return; } // co-op: the host leads
    writePos(game);
    if (id === 'menuView') return toMenu(game);
    if (id === 'skills') return openSkillActions(game, locId, (g) => { syncSkills(g); layout(g); L.refresh(g); });
    if (id === 'map') return confirmLeave(game);
    if (id === 'fine') return payAlarm(game);
    return L.nav(game, id);
  }

  // ---------------------------------------------------------------- 3D view (docs/specs/3d.md stage 3)
  /** Node weather: night — the N toggle (as stealth), weather by the day (world/battlefields.js pickWeather); S.wxForce — tests. */
  function weatherOf(game) {
    const day = game.save?.day || 1;
    if (!S.wx || S.wx.day !== day) {
      const w = pickWeather(fieldBiome(map) || 'wasteland', hashSeed(locId), day).weather;
      S.wx = { day, weather: w === 'storm' ? 'clear' : w };
    }
    const f = S.wxForce || {};
    return { tod: f.tod || (night(game) ? 'night' : 'day'), weather: f.weather || S.wx.weather };
  }
  const view3 = (game) => ({
    S, map, locId, wx: weatherOf(game), others: game.coop?.others?.(game, locId) || [],
    area: { x: 0, y: 0, w: game.width, h: game.height }, camArea: { x: 0, y: HUD_H, w: game.width, h: game.height - HUD_H - 60 },
  });
  /** Hover in 3D: a body under the cursor (NPC / guard / hunter / corpse), else the picked cell. */
  function hover3d(game, A, R, m) {
    const pk = pickRoam(A, R, m.x, m.y);
    S.hoverCell = pk.cell;
    const es = entities();
    const ref = pk.ent >= 0 ? R.bodies[pk.ent].ref : null;
    if (ref) S.hoverEnt = es.find((e) => (ref.kind === 'npc' && e.n === ref.n) || (ref.kind === 'post' && e.p === ref.p) || (ref.kind === 'hostile' && e.h === ref.h) || (ref.kind === 'corpse' && e.c === ref.c)) || null;
    else if (pk.cell) {
      const { x: mx, y: my } = pk.cell;
      S.hoverEnt = es.find((e) => e.kind === 'npc' && Math.round(e.x) === mx && Math.round(e.y) === my)
        || es.find((e) => e.kind === 'obj' && (e.o.cells ? e.o.cells.some(([x, y]) => x === mx && y === my) : e.x === mx && e.y === my))
        || es.find((e) => e.kind === 'skill' && e.x === mx && e.y === my) || null;
    }
  }

  // ---------------------------------------------------------------- static layer (whole map at 32 px, scaled on draw)
  function buildLayer() {
    const c = ROAM.cell, s = c / TILE;
    const cv = document.createElement('canvas');
    cv.width = W * c; cv.height = H * c;
    const x2 = cv.getContext('2d');
    x2.imageSmoothingEnabled = false;
    const b = { grid: { ...grid, tiles: roamGrid({ grid: map.grid, objects: [] }).tiles } };
    const biome = fieldBiome(map); // battlefields.md: the node's biome tiles and props
    const under = propCells(map.props, W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = map.grid[y][x];
      const px = x * c, py = y * c;
      if (biome) {
        drawFieldCell(x2, biome, ch === '"' ? '.' : ch, b.grid.tiles[y * W + x], x, y, px, py, c, under.has(y * W + x));
        if (ch === '"') { x2.fillStyle = rgba(C.k, 0.45); x2.fillRect(px, py, c, c); x2.fillStyle = C.l; for (let k = 0; k < 3; k++) x2.fillRect(px + 4 + k * 10, py + 6 + (k % 2) * 10, 3, 9); }
        if (grid.tiles[y * W + x] === T_EXIT) { x2.fillStyle = rgba(C.a, 0.35); x2.fillRect(px, py, c, c); }
        drawTileExtra(x2, b, ch, x, y, c, { field: true });
        continue;
      }
      if (ch === 'w') { x2.fillStyle = C.g; x2.fillRect(px, py, c, c); x2.fillStyle = rgba(C.f, 0.35); if ((x + y * 3) % 4 === 0) x2.fillRect(px + 6, py + 12, 14, 2); continue; }
      drawSprite(x2, tileSpriteIds(ch === '=' || ch === '"' ? '.' : ch, x, y), px, py, s);
      if (ch === '=') { x2.fillStyle = C['8']; x2.fillRect(px, py, c, c); x2.fillStyle = C['6']; for (let k = 0; k < 4; k++) x2.fillRect(px, py + k * 8 + 7, c, 1); }
      if (ch === '"') { x2.fillStyle = rgba(C.k, 0.75); x2.fillRect(px, py, c, c); x2.fillStyle = C.l; for (let k = 0; k < 3; k++) x2.fillRect(px + 4 + k * 10, py + 6 + (k % 2) * 10, 3, 9); }
      if (grid.tiles[y * W + x] === T_EXIT) { x2.fillStyle = rgba(C.a, 0.35); x2.fillRect(px, py, c, c); }
      drawTileExtra(x2, b, ch, x, y, c);
    }
    if (biome) drawFieldProps(x2, map.props, c);
    for (const o of S.objs) drawObject(x2, o, o.x * c, o.y * c, c, s);
    // этап 2: restricted zones — a red tint and a dashed border
    for (const z of map.zones || []) {
      if (!z.restricted) continue;
      const [zx, zy, zw, zh] = z.rect;
      x2.fillStyle = rgba(C.c, 0.1); x2.fillRect(zx * c, zy * c, zw * c, zh * c);
      x2.strokeStyle = rgba(C.c, 0.6); x2.lineWidth = 2; x2.setLineDash([6, 4]); x2.strokeRect(zx * c + 1, zy * c + 1, zw * c - 2, zh * c - 2); x2.setLineDash([]);
    }
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
      case 'transit': R(C['6'], 7, 3, 2, 13); R(C.b, 1, 2, 14, 5); R(C['0'], 3, 4, 10, 1); R(C['7'], 0, 14, 16, 1); R(C['7'], 2, 12, 1, 3); R(C['7'], 13, 12, 1, 3); break;
      case 'exit': if (o.boat) { R(C['7'], 1, 6, 14, 6); R(C['6'], 3, 11, 10, 2); R(C['5'], 7, 0, 1, 7); R(C['5'], 8, 1, 4, 4); } break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- scene
  self = {
    id: 'roam', locId, S,
    get loc() { return L; },
    /** Re-create the free map after a battle / entry event (location again()). */
    again(game) { writePos(game); game.setScene(createRoamScene(locId, { again: true })); },
    enter(game) {
      L = createLocationScene(locId, { roam: self });
      syncNpcs(game, true);
      buildParty(game);
      spawn(game);
      makePosts(game);
      S.perceive = knowsSkill(members(game.save, game.data), 'perception');
      setRoamProvider(provider);
      layout(game);
      S.cam = null;
      L.enter(game); // gate, wanted, entry events, turn-ins — exactly as the menu node
      if (game.scene === self && !game.coop?.guest) maybeRaid(game);
    },
    resume(game) {
      L.S.inMenu = false;
      setRoamProvider(provider);
      syncNpcs(game);
      buildParty(game);
      layout(game);
      L.resume(game);
    },
    resize(game) { layout(game); },
    toastAnchor(game) { return { x: game.width / 2, y: game.height - 80, dir: -1 }; },
    // test hooks
    goTo: (game, ent) => goTo(game, ent),
    raiseAlarm: (game) => raiseAlarm(game), spawnRaid: (game, enemies, name) => spawnRaid(game, enemies, name), watchers, provider,
    entities, interact: (game, ent) => interact(game, ent), npcMenu: (game, id) => npcMenu(game, NPCS[id]), grid, map,
    // multiplayer.md stage 3 (host): a guest's interaction request — the entity by key, within reach of the guest's cell
    remoteInteract(game, req) {
      const e = entities().find((x) => entKey(x) === req.ent);
      // NPCs walk their routes on every client independently — a looser reach for them
      const ok = e && (e.kind === 'npc' ? Math.hypot(e.x - req.x, e.y - req.y) <= ROAM.coopNpcReach : reachOk(Math.round(req.x), Math.round(req.y), e));
      if (!ok) return false;
      interact(game, e);
      return true;
    },
    validPos: (x, y) => isPassable(grid, x, y),
    leader: () => S.party[0],
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
      const A3 = S.r3?.v3 ? S.r3 : null;
      let mx = Math.floor((m.x + S.cam.x) / c), my = Math.floor((m.y + S.cam.y) / c);
      S.hoverCell = mx >= 0 && my >= 0 && mx < W && my < H ? { x: mx, y: my } : null;
      S.hoverEnt = null;
      const cam3 = A3 && !S.hover && roamCamInput(game, A3); // 3D: wheel zoom, [ ] rotate, drag pan, Home
      if (A3) {
        S.hoverCell = null;
        if (!S.hover && m.x >= 0) hover3d(game, A3, S.r3R, m);
        if (S.hoverCell) { mx = S.hoverCell.x; my = S.hoverCell.y; }
      } else if (S.hoverCell && !S.hover) {
        // sprites are taller than a tile: the cell under the mouse or the one below it
        const es = entities();
        S.hoverEnt = es.find((e) => e.kind === 'npc' && Math.round(e.x) === mx && (Math.round(e.y) === my || Math.round(e.y) === my + 1))
          || es.find((e) => e.kind === 'obj' && (e.o.cells ? e.o.cells.some(([x, y]) => x === mx && y === my) : e.x === mx && e.y === my))
          || es.find((e) => e.kind === 'skill' && e.x === mx && e.y === my) || null;
      }
      if (m.wheel && !A3) { S.zoom = Math.max(0, Math.min(ROAM.zooms.length - 1, S.zoom - Math.sign(m.wheel))); S.cam = null; }
      if (m.clicked && !(cam3 && S.r3?.v3?.drag?.on)) {
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
      else if (inp.wasPressed('KeyC')) { S.sneak = !S.sneak; game.toast(t(S.sneak ? 'roam.sneakOn' : 'roam.sneakOff'), S.sneak ? 'j' : '4'); }
      else if (inp.wasPressed('KeyZ')) { if (canCampAt(locId)) { writePos(game); return L.restAction(game).run(game); } game.toast(t('rest.notHere'), 'c'); }
      else if (inp.wasPressed('KeyH')) return toBase(game);
      else if (inp.wasPressed('KeyN')) { game.mapNight = !game.mapNight; game.toast(t(game.mapNight ? 'roam.nightOn' : 'roam.nightOff'), 'b'); }
      else if (inp.wasPressed('KeyF') && S.alarm) return payAlarm(game);
      if (game.modals.length || game.scene !== self) return;
      updateLeader(game, dt);
      updateFollowers(dt, speed(game));
      updateNpcs(dt);
      if (!game.coop?.guest) { updateStealth(game, dt); updateHostiles(game, dt); } // co-op: guards and hunters live on the host
      if (game.scene !== self) return;
      S.saveT += dt;
      if (S.saveT >= ROAM.saveTick) { S.saveT = 0; writePos(game); }
    },
    render(game) {
      const { ctx, width: W0, height: H0 } = game;
      const sv = game.save;
      const R3 = view3(game);
      const A3 = roam3d(game, R3);
      S.r3R = R3;
      if (A3) return render3d(game, A3, R3);
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
      // skills-v3.md: skill action points (badge, pulsing frame)
      for (const p of S.skills || []) {
        const [px, py] = scr(p.x, p.y);
        if (px < -c || py < -c || px > W0 || py > H0) continue;
        const bs = Math.round(c * 0.62);
        ctx.strokeStyle = rgba(C.a, 0.5 + 0.3 * Math.sin(S.time * 4)); ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, c - 4, c - 4);
        drawSkillBadge(ctx, p.s.skill, px + (c - bs) / 2, py + (c - bs) / 2, bs, !!p.s.best && p.s.best.kind !== 'other');
      }
      const ld = S.party[0];
      // этап 2: guards' view cones (Alt / Perception in the party / alarm); red while the party is seen
      if (showCones(game)) {
        const range = viewRange(night(game));
        for (const w of watchers()) {
          if (Math.hypot(w.x - ld.cx, w.y - ld.cy) > ROAM.stealth.coneNear) continue;
          const poly = conePoly(grid, w, range);
          ctx.beginPath();
          poly.forEach(([x, y], i) => { const px = x * c - cx, py = y * c - cy; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
          ctx.closePath();
          const hot = S.seen && S.party.some((m) => seesCell(grid, w, m.cx, m.cy, range));
          ctx.fillStyle = hot ? rgba(C.c, 0.25) : rgba(C.a, 0.14); ctx.fill();
          ctx.strokeStyle = hot ? rgba(C.c, 0.7) : rgba(C.a, 0.4); ctx.lineWidth = 1; ctx.stroke();
        }
      }
      // corpses of the battles fought here (save.roam.corpses)
      for (const k of S.corpses) {
        const [px, py] = scr(k.x, k.y);
        if (px < -c || py < -c || px > W0 || py > H0) continue;
        ctx.fillStyle = rgba(C.c, 0.35); ctx.fillRect(px + c * 0.15, py + c * 0.55, c * 0.7, c * 0.3);
        ctx.save(); ctx.globalAlpha = 0.5; drawSprite(ctx, enemySpriteIds(typeof k.enemy === 'string' ? k.enemy : k.enemy?.enemy || 'scavenger'), px, py + c * 0.25, (c / TILE) * 0.8); ctx.restore();
      }
      // units sorted by y (only those on screen)
      const s = c / TILE, tms = S.time * 1000;
      const list = [];
      for (const p of S.posts) list.push({ y: p.y, x: p.x, sprite: p.sprite, foe: p });
      for (const h of S.hostiles) list.push({ y: h.fy, x: h.fx, sprite: h.sprite, foe: h, hunt: true });
      for (const n of S.npcs) list.push({ y: n.fy, x: n.fx, sprite: n.sprite, npc: n });
      S.party.forEach((m, i) => list.push({ y: m.y, x: m.x, sprite: m.sprite, member: m, i }));
      // multiplayer.md: the other players' heroes (positions from the host, interpolated)
      for (const o of game.coop?.others?.(game, locId) || []) list.push({ y: o.y, x: o.x, sprite: o.sprite || (o.sprite = heroSpriteIds(o.hero?.race || 'human', o.hero?.cls || 'zabivnoy', o.hero?.look)), other: o, i: o.slot });
      list.sort((a, b) => a.y - b.y);
      for (const u of list) {
        const [px, py] = scr(u.x, u.y);
        if (px < -c * 2 || py < -c * 2 || px > W0 + c || py > H0 + c * 2) continue;
        ctx.fillStyle = rgba(C['0'], 0.4); ctx.fillRect(px + c * 0.2, py + c * 0.8, c * 0.6, c * 0.15);
        drawSprite(ctx, u.sprite, px, py, s, { frame: idleFrame(tms, (u.i || 0) * 0.37 + (u.npc ? u.x : 0)) });
        if (u.member) { ctx.fillStyle = u.i === 0 ? (game.coop ? game.coop.myColor() : C.h) : C.j; ctx.fillRect(px + c * 0.3, py + c - 3, c * 0.4, 2); }
        if (u.other) {
          const col = C[u.other.color] || C.h;
          ctx.fillStyle = col; ctx.fillRect(px + c * 0.2, py + c - 3, c * 0.6, 3);
          ctx.font = '12px monospace';
          const tw = ctx.measureText(u.other.name).width + 8;
          ctx.fillStyle = rgba(C['0'], 0.7); ctx.fillRect(px + c / 2 - tw / 2, py - c * 0.6 - 14, tw, 15);
          text(ctx, u.other.name, px + c / 2, py - c * 0.6 - 13, col, '12px monospace', 'center');
        }
        if (u.foe) { ctx.fillStyle = u.hunt ? C.c : C.a; ctx.fillRect(px + c * 0.3, py + c - 3, c * 0.4, 2); if (u.hunt) text(ctx, '!', px + c / 2, py - c * 0.9, C.c, FONT_B, 'center'); }
        if (u.npc) {
          const mark = u.npc.mark;
          if (mark) text(ctx, '!', px + c / 2, py - c * 0.9, C.a, FONT_B, 'center');
        }
      }
      overlay2d(game, scr, c, (e, px, py) => py - c * 0.6 - 14);
    },
  };
  /** Names, hotspots and the HUD over the world (2D and 3D). scr(x, y) -> top-left of the cell box, c — its size, plateY. */
  function overlay2d(game, scr, c, plateY) {
    const { ctx, width: W0, height: H0 } = game;
    const sv = game.save, ld = S.party[0];
      // names: hovered entity + NPCs near the leader
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
        } else if (e.kind === 'skill') {
          const x = e.p.s;
          hotspot(px, py, c, c, { title: x.label, lines: [tf('nsa.mapHint', { skill: skillName(x.skill) }), { text: `${t('battle.dc')} ${x.dc}${x.best ? ` · ${x.best.member.name} ${Math.round(x.best.chance * 100)}%` : ''}`, color: 'a' }] });
        } else if (e.kind === 'post') hotspot(px, py - c, c, c * 2, { title: t('roam.guard'), lines: [ENEMIES[e.p.enemy]?.name || '', t('roam.guardSub')] });
        else if (e.kind === 'hostile') hotspot(px, py - c, c, c * 2, { title: t('roam.hostile'), lines: [ENEMIES[String(e.h.enemy?.enemy || e.h.enemy).split('^')[0]]?.name || '', { text: t('roam.hostileSub'), color: 'c' }] });
        else if (e.kind === 'corpse') hotspot(px, py, c, c, { title: t('roam.corpse'), lines: [ENEMIES[String(e.c.enemy?.enemy || e.c.enemy).split('^')[0]]?.name || '', t('roam.corpseSub')] });
        else hotspot(px, py, c, c, { title: objName(e.o), lines: objLines(e.o) });
      }
      // HUD: node, day, credits; help line; buttons
      panel(ctx, 10, 10, 520, 54, rgba(C['1'], 0.88), C['3']);
      text(ctx, fit(ctx, loc.name, 500, FONT_B), 20, 16, C.h, FONT_B);
      text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level}`, 20, 40, C.b, '13px monospace');
      drawHintBadges(ctx, sv, S.hints || [], 522, 18, 22, 'right'); // skills-v3.md: «здесь пригодится»
      // этап 2: stealth line — sneaking, restricted zone, notice meter; alarm banner
      if (S.sneak || S.inZone || S.notice > 0 || S.alarm) {
        panel(ctx, 10, 68, 260, 46, rgba(C['1'], 0.88), S.seen || S.alarm ? C.c : C['3']);
        const st = S.alarm ? t('roam.alarmFight').replace(/!$/, '') : S.seen ? t('roam.seen') : S.inZone ? t('roam.restricted') : '';
        text(ctx, `${S.sneak ? t('roam.sneakOn') : t('roam.sneakOff')}${st ? ` · ${st}` : ''}`, 18, 73, S.seen || S.alarm ? C.c : S.sneak ? C.j : C['5'], '12px monospace');
        text(ctx, t('roam.notice'), 18, 93, C['4'], '12px monospace');
        ctx.fillStyle = C['0']; ctx.fillRect(110, 95, 150, 10);
        ctx.fillStyle = S.notice >= 70 ? C.c : S.notice >= 35 ? C.a : C.j; ctx.fillRect(110, 95, 1.5 * S.notice, 10);
      }
      if (S.alarm) {
        const msg = S.alarm.fight ? t('roam.alarmFight') : tf('roam.alarm', { s: Math.ceil(S.alarm.t) });
        ctx.font = FONT_B;
        const tw = ctx.measureText(msg).width + 24;
        panel(ctx, W0 / 2 - tw / 2, 14, tw, 30, rgba(C['0'], 0.9), C.c);
        if (Math.floor(S.time * 3) % 2 === 0 || S.alarm.fight) text(ctx, msg, W0 / 2, 20, C.c, FONT_B, 'center');
      }
      text(ctx, fit(ctx, t('roam.help'), W0 - S.buttons.length * 130 - 40, '12px monospace'), 12, H0 - 36, C['4'], '12px monospace');
      for (const b of S.buttons) button(ctx, b, S.hover === b);
  }
  /** 3D frame: the WebGL world (gfx/roam3d.js) + the 2D layer (skill badges, marks, names, tooltips, HUD) on top. */
  function render3d(game, A, R) {
    const { ctx, width: W0, height: H0 } = game;
    ctx.clearRect(0, 0, W0, H0);
    const ld = S.party[0];
    const range = viewRange(night(game));
    const cones = showCones(game) ? watchers().filter((w) => Math.hypot(w.x - ld.cx, w.y - ld.cy) <= ROAM.stealth.coneNear).map((w) => ({
      pts: conePoly(grid, w, range), hot: S.seen && S.party.some((m) => seesCell(grid, w, m.cx, m.cy, range)) })) : [];
    drawRoam3d(game, A, R, { path: S.path, hover: !S.hover ? S.hoverCell : null, hoverEnt: S.hoverEnt, skills: S.skills, cones, zones: (map.zones || []).filter((z) => z.restricted) });
    const c = A.L.cell;
    const scr = (x, y) => { const p = roamScreen(A, x, y); return [Math.round(p.x - c / 2), Math.round(p.y - c / 2)]; };
    for (const p of S.skills || []) {
      const [px, py] = scr(p.x, p.y);
      if (px < -c || py < -c || px > W0 || py > H0) continue;
      const bs = Math.round(Math.min(40, c * 0.62));
      drawSkillBadge(ctx, p.s.skill, px + (c - bs) / 2, py + (c - bs) / 2 - c * 0.3, bs, !!p.s.best && p.s.best.kind !== 'other');
    }
    const heads = new Map();
    for (const it of R.bodies || []) {
      const p = roamScreen(A, it.d.x, it.d.y, bodyTop(it));
      heads.set(it.ref.n || it.ref.p || it.ref.h || it.ref.o || it.ref.m, p.y);
      if (p.x < -40 || p.y < -40 || p.x > W0 + 40 || p.y > H0 + 40) continue;
      const r = it.ref;
      if (r.kind === 'npc' && r.n.mark) text(ctx, '!', p.x, p.y - 22, C.a, FONT_B, 'center');
      if (r.kind === 'hostile') text(ctx, '!', p.x, p.y - 22, C.c, FONT_B, 'center');
      if (r.kind === 'other') {
        const col = C[r.o.color] || C.h;
        ctx.font = '12px monospace';
        const tw = ctx.measureText(r.o.name).width + 8;
        ctx.fillStyle = rgba(C['0'], 0.7); ctx.fillRect(p.x - tw / 2, p.y - 18, tw, 15);
        text(ctx, r.o.name, p.x, p.y - 17, col, '12px monospace', 'center');
      }
    }
    overlay2d(game, scr, c, (e, px, py) => (heads.get(e.n || e.p || e.h) ?? py) - 18 - (heads.has(e.n || e.p || e.h) ? 0 : c * 0.6));
  }
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
