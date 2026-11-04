// Battle scene: grid battle on top of the rules engine (game/src/rules/). Logic, input and AI pacing live here;
// drawing is in ui/battle-view.js, event formatting/sounds in ui/battle-log.js.
//
// createBattleScene(opts) -> scene
//   opts: { hero: { race, cls, path, name }, map?, enemies?, allies?, seed?, title, intro?, hint?,
//           winText?, defeatLines?: [{who,text}], barks?: { [enemyId]: key }, onEvent?(S, e),
//           onWin(game, S), onExit(game) }
// Events from the engine are queued and replayed one by one: a 'move' blocks the queue until the
// walk animation ends, so popups / sounds / log lines appear in order and at the right place.
import { t } from '../data/text/index.js';
import { buildCreature, buildEnemy } from '../rules/character.js';
import { gadgetFor } from '../data/gadgets.js';
import * as combat from '../rules/combat.js';
import {
  createBattle, getLegalActions, perform, endTurn, isAiTurn, currentUnit, getReachable,
  abilityUsable, abilityRange, abilityTargets, attackOdds, saveFailChance, weaponAttackBonus,
  spellAttackBonus, getDc, weaponRange, isStanding,
} from '../rules/combat.js';
import { chebyshev, lineOfSight, walkLine, T_WALL } from '../rules/grid.js';
import { chooseAction } from '../rules/ai.js';
import { play } from '../audio/sfx.js';
import { formatEvent, eventSound } from '../ui/battle-log.js';
import { hitButton, inRect, C } from '../ui/draw.js';
import { layoutBattle, renderBattle, isHiddenFoe } from '../ui/battle-view.js';
import { line as storyLine } from '../data/text/prologue.js';

const AI_STEP = 0.42; // s between AI actions
const AI_TURN_GAP = 0.3; // s before an AI unit starts acting
const WALK_SPEED = 9; // tiles per second
const MAX_LOG = 200;
const MAX_AI_STEPS = 16;

/** Remove items failing keep() in place (no new array per frame). */
function compact(arr, keep) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[n++] = arr[i];
  arr.length = n;
}

// Melee or ranged attack for previews: engine export when available (v1.2), else by weapon / ability range.
function meleeAttack(b, u, action) {
  if (typeof combat.isMeleeAttack === 'function') return combat.isMeleeAttack(b, u, action);
  if (action.type === 'attack') return weaponRange(u) <= 1;
  const a = u.abilities.find((x) => x.id === action.ability);
  if (!a) return true;
  if ((a.effects || []).some((e) => e.op === 'weapon')) return weaponRange(u) <= 1;
  return abilityRange(u, a) <= 1;
}

/** Same rule as the engine's inArea (combat.js): radius with LOS from the centre, cone with LOS from the caster,
 *  line by Bresenham from the caster stopping at walls. */
function tileInArea(b, u, a, center, x, y) {
  const size = a.area.size || 1;
  if (a.area.shape === 'radius') return chebyshev(center.x, center.y, x, y) <= size && lineOfSight(b.grid, center.x, center.y, x, y);
  const vx = center.x - u.x, vy = center.y - u.y;
  if (!vx && !vy) return false;
  const tx = x - u.x, ty = y - u.y;
  const d = Math.max(Math.abs(tx), Math.abs(ty));
  if (d < 1 || d > size) return false;
  if (a.area.shape === 'cone') {
    const cos = (vx * tx + vy * ty) / (Math.hypot(vx, vy) * Math.hypot(tx, ty));
    return cos >= 0.7 && lineOfSight(b.grid, u.x, u.y, x, y);
  }
  const k = size / Math.max(Math.abs(vx), Math.abs(vy));
  const ex = u.x + Math.round(vx * k), ey = u.y + Math.round(vy * k);
  let hit = false, blocked = false;
  const g = b.grid;
  walkLine(u.x, u.y, ex, ey, (px, py) => {
    if (px < 0 || py < 0 || px >= g.w || py >= g.h || g.tiles[py * g.w + px] === T_WALL) { blocked = true; return true; }
    if (px === x && py === y) { hit = true; return true; }
    return false;
  });
  if (!hit && !blocked && x === ex && y === ey) hit = true;
  return hit;
}

const REASONS = {
  energy: 'battle.noEnr', uses: 'battle.uses', action: 'battle.noAction', silence: 'battle.silence',
  disarm: 'battle.disarm', turn: 'battle.notTurn', down: 'battle.down', noTargets: 'battle.noTargets',
};

export function createBattleScene(opts) {
  const S = { opts };
  let seed = opts.seed ?? ((Math.random() * 1e9) | 0);

  function start(game) {
    let heroes;
    if (opts.heroes) heroes = typeof opts.heroes === 'function' ? opts.heroes(game) : opts.heroes;
    else {
      const h = opts.hero;
      heroes = [buildCreature({ race: h.race, cls: h.cls, path: h.path, name: h.name, data: game.data, id: 'hero', anyStat: h.anyStat || undefined, talents: h.talents || [], gadget: gadgetFor(h.cls)?.id })];
    }
    S.queue = [];
    let enemies = opts.enemies;
    // ambush (world.md §2): enemies get +5 initiative
    if (opts.ambush && enemies) enemies = enemies.map((e, i) => { const u = buildEnemy(e, { data: game.data, id: `e${i + 1}` }); u.initBonus += 5; return u; });
    S.b = createBattle({
      map: typeof opts.map === 'function' ? opts.map(seed) : opts.map, heroes, enemies, allies: opts.allies, data: game.data, seed,
      onEvent: (e) => S.queue.push(e),
    });
    const b = S.b;
    S.heroId = heroes[0].id; // the player-controlled unit whose turn it is (party: switches every turn)
    S.mainId = heroes[0].id;
    S.partySize = heroes.length;
    // display names: duplicates get a number
    const count = {};
    for (const u of b.units) count[u.name] = (count[u.name] || 0) + 1;
    const seen = {};
    S.names = {};
    for (const u of b.units) {
      seen[u.name] = (seen[u.name] || 0) + 1;
      S.names[u.id] = count[u.name] > 1 ? `${u.name} ${seen[u.name]}` : u.name;
    }
    S.name = (id) => S.names[id] || b.byId[id]?.name || '—';
    S.disp = {};
    b.units.forEach((u, i) => addDisp(u, i));
    S.popups = [];
    S.bubbles = [];
    S.log = [];
    S.sel = null; // { kind: 'attack' } | { kind: 'ability', a }
    S.aiTimer = AI_TURN_GAP;
    S.aiSteps = 0;
    S.aiUnit = null;
    S.result = null;
    S.resultTimer = 0;
    S.banner = !!(opts.intro || opts.hint);
    S.message = null; // { text, t }
    S.hover = { cell: null, button: null };
    S.lastTeam = null;
    S.time = 0;
    S.dirty = true;
    S.flags = {};
    layoutBattle(game, S);
    refresh();
  }

  function addDisp(u, i = Object.keys(S.disp).length) {
    S.disp[u.id] = { x: u.x, y: u.y, path: [], flash: 0, fade: 0, gone: false, phase: (i * 0.37) % 1, hp: u.hp, mrl: u.mrl, down: u.down, drift: 0 };
    return S.disp[u.id];
  }
  const dispOf = (u) => S.disp[u.id] || addDisp(u);
  S.dispOf = dispOf;

  // ---------------------------------------------------------------- derived state (rebuilt when dirty)
  function refresh() {
    S.dirty = false;
    const b = S.b;
    const cu = currentUnit(b);
    if (cu && !b.winner && cu.team === 'heroes' && cu.kind === 'hero' && !isAiTurn(b) && isStanding(cu)) S.heroId = cu.id;
    S.playerTurn = !!cu && !b.winner && cu.id === S.heroId && !isAiTurn(b);
    const hero = b.byId[S.heroId];
    S.reach = null;
    S.attackTargets = new Set();
    S.specs = {};
    if (S.playerTurn) {
      if (b.turn.move > 0) S.reach = getReachable(b, S.heroId);
      for (const act of getLegalActions(b, S.heroId, { noMoves: true })) {
        if (act.target && isHiddenFoe(b.byId[act.target])) continue;
        if (act.type === 'attack') S.attackTargets.add(act.target);
        else if (act.type === 'ability') (S.specs[act.ability] || (S.specs[act.ability] = [])).push(act);
      }
    }
    // action buttons
    const btns = [];
    const bt = b.turn;
    const reasonOf = (r) => (r ? t(REASONS[r] || 'battle.notAllowedHere') : null);
    let r = !S.playerTurn ? 'turn' : bt.actions <= 0 ? 'action' : hero.noAttack || !hero.weapon ? 'disarm' : S.attackTargets.size ? null : 'noTargets';
    btns.push({ id: 'attack', label: t('battle.attack'), sub: hero.weapon ? `${hero.weapon.dice}${hero.weapon.range > 1 ? ` ↔${hero.weapon.range}` : ''}` : '', key: 'A', disabled: !!r, reason: reasonOf(r), selected: S.sel?.kind === 'attack' });
    let n = 0;
    for (const a of hero.abilities) {
      if (a.action === 'reaction') continue;
      n++;
      let why = S.playerTurn ? abilityUsable(b, hero, a, false) : 'turn';
      if (why === 'action' && a.action === 'bonus') why = 'bonus';
      if (!why && !(S.specs[a.id] || []).length) why = 'noTargets';
      const parts = [a.cost ? `${a.cost} ${t('battle.cost')}` : t('battle.free')];
      if (a.usesPerBattle) parts.push(`${a.usesPerBattle - (hero.uses?.[a.id] || 0)}/${a.usesPerBattle}`);
      btns.push({
        id: `ab:${a.id}`, a, label: a.name, sub: parts.join(' · '), subColor: a.cost ? C.b : undefined,
        key: n <= 9 ? String(n) : '', disabled: !!why, reason: why === 'bonus' ? t('battle.noBonus') : reasonOf(why),
        selected: S.sel?.kind === 'ability' && S.sel.a.id === a.id,
      });
    }
    r = !S.playerTurn ? 'turn' : bt.actions <= 0 ? 'action' : null;
    btns.push({ id: 'dash', label: t('battle.dash'), sub: t('act.action'), disabled: !!r, reason: reasonOf(r) });
    r = !S.playerTurn ? 'turn' : bt.bonus <= 0 || bt.disengaged ? 'bonus' : null;
    btns.push({ id: 'disengage', label: t('battle.disengage'), sub: t('act.bonus'), disabled: !!r, reason: r === 'bonus' ? t('battle.noBonus') : reasonOf(r) });
    btns.push({ id: 'endTurn', label: t('battle.endTurn'), sub: t('battle.endTurnKey'), disabled: !S.playerTurn, reason: S.playerTurn ? null : t('battle.notTurn') });
    S.buttons = btns;
    layoutBattle.buttons(S);
    // target cells for the current selection
    S.targetCells = null;
    if (S.sel && S.playerTurn) {
      const cells = new Map();
      if (S.sel.kind === 'attack') {
        for (const id of S.attackTargets) { const u = b.byId[id]; cells.set(u.y * b.grid.w + u.x, { target: id }); }
      } else {
        for (const act of S.specs[S.sel.a.id] || []) {
          if (act.target) { const u = b.byId[act.target]; cells.set(u.y * b.grid.w + u.x, { target: act.target }); }
          else if (act.tile) cells.set(act.tile.y * b.grid.w + act.tile.x, { tile: act.tile });
        }
      }
      S.targetCells = cells;
    } else if (S.sel) S.sel = null;
  }

  // ---------------------------------------------------------------- previews for the UI
  /** Hit / save chance of the current selection (or base attack) against a unit. */
  S.odds = (tgt, sel = S.sel) => {
    const b = S.b;
    const u = b.byId[S.heroId];
    if (!tgt || tgt.team === u.team) return null;
    if (!sel || sel.kind === 'attack') {
      const melee = meleeAttack(b, u, { type: 'attack', unit: u.id, target: tgt.id });
      const o = attackOdds(b, u, tgt, weaponAttackBonus(b, u), melee, true);
      return { kind: 'hit', chance: o.chance, crit: o.critChance, mode: o.mode };
    }
    const a = sel.a;
    if (a.roll === 'attack') {
      const melee = meleeAttack(b, u, { type: 'ability', unit: u.id, ability: a.id, target: tgt.id });
      const wop = (a.effects || []).find((e) => e.op === 'weapon');
      const o = wop
        ? attackOdds(b, u, tgt, weaponAttackBonus(b, u) + (wop.hit || 0), melee, true)
        : attackOdds(b, u, tgt, spellAttackBonus(b, u, a), melee, false);
      return { kind: 'hit', chance: o.chance, crit: o.critChance, mode: o.mode };
    }
    if (a.roll === 'save' && a.save) return { kind: 'save', chance: saveFailChance(b, tgt, a.save, getDc(b, u, a)), dc: getDc(b, u, a), stat: a.save };
    return null;
  };

  /** Area tiles and affected units for ability a with a target spec. */
  S.areaPreview = (a, act) => {
    const b = S.b;
    const u = b.byId[S.heroId];
    const spec = act && act.target ? { unit: act.target } : act && act.tile ? { x: act.tile.x, y: act.tile.y } : {};
    const units = abilityTargets(b, u, a, spec);
    const tiles = [];
    if (a.area) {
      const selfC = a.target === 'self' || (abilityRange(u, a) === 0 && !act?.target && !act?.tile);
      const c = selfC ? u : spec.unit ? b.byId[spec.unit] : { x: spec.x, y: spec.y };
      const R = a.area.size || 1;
      const ox = a.area.shape === 'radius' ? c.x : u.x, oy = a.area.shape === 'radius' ? c.y : u.y;
      const g = b.grid;
      for (let y = Math.max(0, oy - R); y <= Math.min(g.h - 1, oy + R); y++) {
        for (let x = Math.max(0, ox - R); x <= Math.min(g.w - 1, ox + R); x++) {
          if (g.tiles[y * g.w + x] !== T_WALL && tileInArea(b, u, a, c, x, y)) tiles.push(y * g.w + x);
        }
      }
    }
    return { tiles, units };
  };

  // ---------------------------------------------------------------- actions
  function doAction(action) {
    const res = perform(S.b, action);
    if (!res.ok) {
      const key = res.error === 'fear' ? 'battle.noFear' : res.error === 'outOfRange' ? 'battle.outOfRange' : 'battle.notAllowedHere';
      say(t(key));
      return false;
    }
    S.sel = null;
    S.dirty = true;
    return true;
  }
  const say = (text) => { S.message = { text, t: 2.2 }; };

  function selectButton(btn) {
    if (!btn || btn.disabled) { if (btn?.reason) say(btn.reason); return; }
    play('uiClick');
    const b = S.b;
    switch (btn.id) {
      case 'attack': S.sel = S.sel?.kind === 'attack' ? null : { kind: 'attack' }; break;
      case 'dash': doAction({ type: 'dash' }); break;
      case 'disengage': doAction({ type: 'disengage' }); break;
      case 'endTurn': S.sel = null; perform(b, { type: 'endTurn' }); break;
      default: {
        const a = btn.a;
        if (S.sel?.kind === 'ability' && S.sel.a.id === a.id) { S.sel = null; break; }
        const specs = S.specs[a.id] || [];
        // untargeted (self / aura) abilities fire right away
        if (specs.length === 1 && !specs[0].target && !specs[0].tile) doAction({ type: 'ability', ability: a.id });
        else S.sel = { kind: 'ability', a };
      }
    }
    S.dirty = true;
  }

  function clickCell(cx, cy) {
    const b = S.b;
    const idx = cy * b.grid.w + cx;
    if (S.sel) {
      const tc = S.targetCells && S.targetCells.get(idx);
      if (!tc) { S.sel = null; S.dirty = true; return; }
      if (S.sel.kind === 'attack') doAction({ type: 'attack', target: tc.target });
      else doAction({ type: 'ability', ability: S.sel.a.id, ...(tc.target ? { target: tc.target } : { tile: tc.tile }) });
      return;
    }
    const occ = b.units.find((u) => !u.dead && !u.removed && u.x === cx && u.y === cy && !isHiddenFoe(u) && S.attackTargets.has(u.id));
    if (occ) { doAction({ type: 'attack', target: occ.id }); return; }
    if (S.reach && S.reach.dist[idx] > 0) doAction({ type: 'move', to: { x: cx, y: cy } });
  }

  // ---------------------------------------------------------------- event replay
  function busy() {
    for (const id in S.disp) if (S.disp[id].path.length) return true;
    return false;
  }

  function pushLog(segs) {
    if (!segs) return;
    S.log.push(segs);
    if (S.log.length > MAX_LOG) S.log.shift();
  }

  function popup(u, text, color) {
    const d = dispOf(u);
    let stack = 0;
    for (const p of S.popups) if (p.id === u.id && p.t < 0.3) stack++;
    S.popups.push({ id: u.id, x: d.x, y: d.y, text, color, t: -stack * 0.25 });
  }

  function bubble(u, text) {
    compact(S.bubbles, (x) => x.id !== u.id);
    S.bubbles.push({ id: u.id, text, t: 0 });
  }

  function storyBubble(u, key) {
    const lines = storyLine(key, opts.race || opts.hero?.race);
    if (!lines || !lines.length) return;
    const l = lines[(Math.random() * lines.length) | 0];
    bubble(u, l.text);
  }
  S.storyBubble = storyBubble;
  S.pushLog = pushLog;

  function handleEvent(e) {
    const b = S.b;
    const T = e.target ? b.byId[e.target] : null;
    const A = e.actor ? b.byId[e.actor] : null;
    if (e.type !== 'move' && e.type !== 'turnEnd' && e.type !== 'battleStart' && e.type !== 'initiative') pushLog(formatEvent(S, e));
    eventSound(S, e);
    switch (e.type) {
      case 'move': {
        const d = dispOf(A);
        d.path.push(...e.path);
        break;
      }
      case 'push': case 'teleport': {
        const u = e.type === 'push' ? T : A;
        if (u) dispOf(u).path.push({ ...e.to });
        break;
      }
      case 'attack': if (!e.hit && T) popup(T, t('battle.miss'), C['4']); break;
      case 'damage': {
        if (!T) break;
        const d = dispOf(T);
        d[e.resource] = e.value;
        if (e.amount > 0 || !e.absorbed) {
          d.flash = 0.12;
          const col = e.resource === 'mrl' ? C.n : e.dmgType === 'proxy' ? C.a : C.c;
          popup(T, `${e.crit ? '!' : ''}−${e.amount}`, col);
        }
        if (e.absorbed) popup(T, `◊${e.absorbed}`, C.f);
        break;
      }
      case 'heal': if (T) { dispOf(T)[e.resource] = e.value; popup(T, `+${e.amount}`, e.resource === 'mrl' ? C.f : C.j); } break;
      case 'shield': if (T) popup(T, `◊${e.value}`, C.f); break;
      case 'nadlom': if (T) popup(T, t('state.strain'), C.n); break;
      case 'breakdown':
        if (T) {
          if (e.value != null) dispOf(T).hp = e.value;
          popup(T, t('state.breakdown'), C.n);
        }
        break;
      case 'broken': if (T) { const d = dispOf(T); d.fade = 1; d.drift = 1; popup(T, t('battle.broken'), C.n); } break;
      case 'down': if (T) { dispOf(T).down = true; popup(T, t('state.unconscious'), C.c); } break;
      case 'stabilize': if (T) { const d = dispOf(T); d.down = false; d.hp = e.value; } break;
      case 'death': if (T) { const d = dispOf(T); d.fade = 1; d.down = false; } break;
      case 'unsummon': if (T) dispOf(T).fade = 1; break;
      case 'summon': if (T) { const d = addDisp(T); d.x = e.x; d.y = e.y; } break;
      case 'status': if (T && b.data.statuses[e.id]) popup(T, b.data.statuses[e.id].name, b.data.statuses[e.id].kind === 'buff' ? C.j : C.a); break;
      case 'turnStart': {
        if (A && A.team === 'enemies' && opts.barks && opts.barks[A.enemyId] && Math.random() < 0.35) storyBubble(A, opts.barks[A.enemyId]);
        break;
      }
      default: break;
    }
    opts.onEvent?.(S, e);
    S.dirty = true;
  }

  function processQueue() {
    while (S.queue.length && !busy()) handleEvent(S.queue.shift());
  }

  function syncDisp() {
    for (const u of S.b.units) {
      const d = dispOf(u);
      if (d.path.length) continue;
      d.hp = u.hp; d.mrl = u.mrl; d.down = u.down;
      if (!u.dead && !u.removed) { d.x = u.x; d.y = u.y; }
    }
  }

  function animate(dt) {
    for (const id in S.disp) {
      const d = S.disp[id];
      if (d.flash > 0) d.flash -= dt;
      if (d.fade > 0) { d.fade -= dt * 1.4; if (d.fade <= 0) d.gone = true; }
      if (!d.path.length) continue;
      const p = d.path[0];
      const dx = p.x - d.x, dy = p.y - d.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = WALK_SPEED * dt;
      if (dist <= stepLen) { d.x = p.x; d.y = p.y; d.path.shift(); play('step'); }
      else { d.x += (dx / dist) * stepLen; d.y += (dy / dist) * stepLen; }
    }
    for (const p of S.popups) p.t += dt;
    compact(S.popups, (p) => p.t < 1.1);
    for (const x of S.bubbles) x.t += dt;
    compact(S.bubbles, (x) => x.t < 3.2);
    if (S.message && (S.message.t -= dt) <= 0) S.message = null;
  }

  // ---------------------------------------------------------------- AI pacing
  function aiStep() {
    const b = S.b;
    const u = currentUnit(b);
    if (!u) return;
    if (S.aiUnit !== b.turn) { S.aiUnit = b.turn; S.aiSteps = 0; }
    let act = S.aiSteps >= MAX_AI_STEPS ? { type: 'endTurn' } : chooseAction(b, u.id);
    S.aiSteps++;
    if (!act || act.type === 'endTurn') {
      endTurn(b);
      S.aiTimer = AI_TURN_GAP;
    } else {
      const res = perform(b, act);
      if (!res.ok) { endTurn(b); S.aiTimer = AI_TURN_GAP; }
      else S.aiTimer = act.type === 'move' || act.type === 'disengage' ? 0.12 : AI_STEP;
    }
    S.dirty = true;
  }

  // ---------------------------------------------------------------- input
  function handleInput(game) {
    const inp = game.input;
    const m = inp.mouse;
    S.hover.button = null;
    S.hover.cell = null;
    if (S.result) {
      const btn = hitButton(S.resultButtons, m);
      S.hover.button = btn;
      if (m.clicked && btn) resultAction(game, btn.id);
      else if (inp.wasPressed('Enter') || inp.wasPressed('Space')) resultAction(game, S.resultButtons[0].id);
      return;
    }
    if (S.banner) {
      if (m.clicked || inp.wasPressed('Space') || inp.wasPressed('Enter') || inp.wasPressed('Escape')) { S.banner = false; play('uiClick'); }
      return;
    }
    const L = S.L;
    if (inRect(L.map, m.x, m.y)) {
      const cx = Math.floor((m.x - L.mapX) / L.cell), cy = Math.floor((m.y - L.mapY) / L.cell);
      if (cx >= 0 && cy >= 0 && cx < S.b.grid.w && cy < S.b.grid.h) S.hover.cell = { x: cx, y: cy };
    }
    S.hover.button = hitButton(S.buttons, m);
    const locked = !S.playerTurn || S.queue.length || busy();
    if (inp.wasPressed('Escape') || m.rightClicked) { if (S.sel) { S.sel = null; S.dirty = true; } }
    if (locked) return;
    if (m.clicked) {
      if (S.hover.button) selectButton(S.hover.button);
      else if (S.hover.cell) clickCell(S.hover.cell.x, S.hover.cell.y);
    }
    for (let i = 1; i <= 9; i++) {
      if (inp.wasPressed(`Digit${i}`) || inp.wasPressed(`Numpad${i}`)) selectButton(S.buttons.find((x) => x.key === String(i)));
    }
    if (inp.wasPressed('KeyA')) selectButton(S.buttons[0]);
    if (inp.wasPressed('Space') || inp.wasPressed('Enter')) selectButton(S.buttons.find((x) => x.id === 'endTurn'));
  }

  function resultAction(game, id) {
    play('uiClick');
    if (id === 'next') opts.onWin(game, S);
    else if (id === 'lose') opts.onLose(game, S);
    else if (id === 'retry') { seed = (seed + 7919) | 0; start(game); }
    else if (id === 'menu') opts.onExit(game);
  }

  // ---------------------------------------------------------------- scene
  return {
    id: 'battle',
    S,
    enter(game) { start(game); },
    resize(game) { layoutBattle(game, S); S.dirty = true; },
    update(game, dt) {
      S.time += dt;
      animate(dt);
      processQueue();
      if (S.dirty) refresh();
      handleInput(game);
      if (S.dirty) refresh();
      const b = S.b;
      if (S.queue.length || busy()) return;
      syncDisp();
      if (b.winner) {
        if (!S.result && (S.resultTimer += dt) > 0.7) {
          S.result = b.winner === 'heroes' ? 'win' : 'lose';
          layoutBattle.result(game, S);
        }
        return;
      }
      if (S.banner) return;
      if (isAiTurn(b)) {
        S.aiTimer -= dt;
        if (S.aiTimer <= 0) aiStep();
      } else if (!b.turn) {
        // no one can act and no winner: close the battle as a defeat
        S.result = 'lose';
        layoutBattle.result(game, S);
      } else {
        const cu = currentUnit(b);
        // hero fell during own turn (e.g. opportunity attack) or a non-hero player-side unit: pass the turn
        if (!cu || cu.id !== S.heroId || !isStanding(cu)) {
          S.sel = null;
          endTurn(b);
          S.dirty = true;
        }
      }
    },
    render(game) { renderBattle(game, S); },
  };
}
