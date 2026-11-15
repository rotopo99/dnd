// Co-op battle (multiplayer.md §2–3, stage 2): deterministic battle on every client.
// Host: authority — runs AI / NPC / enemies, validates guests' intents, broadcasts commands {t:'cmd', turn, action}
// in its order and keeps per-turn hashes; on a guest's hash mismatch sends fullState. Guest: sends intents for its hero,
// replays host commands at the pace of its own animation, sends a hash at every turn boundary.
import { t } from '../data/text/index.js';
import { NET } from '../data/net.js';
import { C, FONT_B, text } from '../ui/draw.js';
import { createBattleScene, buildHeroUnit } from '../scenes/battle.js';
import { combatMetric } from '../gfx/settings.js';
import { currentUnit } from '../rules/combat.js';
import { makeWorldMap } from '../world/arena.js';
import { randomHero } from '../scenes/menu.js';
import { MSG, heroValid } from './protocol.js';
import { battleHash, snapshotBattle, restoreBattle } from './sync.js';
import { drawChatPeek, openChatInput } from '../ui/net-chat.js';
import { partyUnits, buildHero } from '../world/state.js';
import { heroIdOf, coopEntry, coopView } from '../world/coop.js';

export { heroIdOf };

/**
 * Stage 3: units of a world co-op battle, built the same way on every client from the host's save copy (setup.save):
 * host hero + active companions (partyUnits) + the guests' heroes of setup.heroes (ids heroIdOf(slot)).
 */
export function worldUnits(game, setup) {
  const save = setup.save;
  const list = partyUnits(save, game.data);
  for (const h of setup.heroes) {
    if (h.slot === 0) continue;
    const e = coopEntry(save, h.slot);
    if (!e) continue;
    const u = buildHero(coopView(save, e), game.data, { id: heroIdOf(h.slot) });
    if (save.battleBuff?.kb) u.kb += save.battleBuff.kb;
    list.push(u);
  }
  return list;
}

/**
 * Enemy scaling for N heroes (multiplayer.md «Масштаб врагов»): + NET.extraPerHero enemies per hero above the first,
 * taken cyclically from the encounter list. The exact formula is for balance-tester.
 */
export function scaleEnemies(list, heroes, extra = NET.extraPerHero) {
  const out = [...list];
  const add = Math.max(0, heroes - 1) * extra;
  for (let i = 0; i < add && list.length; i++) out.push(list[i % list.length]);
  return out;
}

/** Host: setup of the lobby's «Тренировочный бой» — every connected player's hero, standard1 scaled, random arena. */
export function trainingSetup(game, session, seed = (Math.random() * 1e9) | 0) {
  const heroes = session.players.filter((p) => p.connected).map((p) => ({
    slot: p.slot, name: p.name, color: p.color, hero: heroValid(game.data, p.hero) ? p.hero : { ...randomHero(game.data), name: p.name },
  }));
  const enemies = scaleEnemies(game.data.ENCOUNTERS.standard1.enemies, heroes.length);
  const map = makeWorldMap({ seed, enemies: enemies.length, id: 'coop-training' });
  return { kind: 'training', seed, heroes, enemies, map, title: t('net.battleTitle'), turnTimer: session.settings.turnTimer };
}

/** Host: broadcast battleStart and enter the battle. hooks — host world callbacks (startCoopBattle). */
export function hostStartBattle(game, session, setup, back, hooks) {
  session.busy = true;
  setup.battle = { ...(setup.battle || {}), metric: setup.battle?.metric ?? combatMetric() }; // host's rules for everyone
  session.broadcast({ t: MSG.battleStart, seed: setup.seed, setup });
  return startCoopBattle(game, session, setup, back, hooks);
}

/**
 * Both sides: build the battle scene from a setup and wire it to the session. back(game) — return (lobby / world).
 * setup: { seed, heroes [{slot, name, color, hero?}], enemies, map, title, turnTimer, save? (world: units from the host's
 *          save, worldUnits), hostUnits? (ids the host controls: companions), battle? (extra createBattleScene options:
 *          allies, rivals, partyLose, objectives, ambush, enemyInit, heroInit, race, tricks, hint) }
 * hooks (host only, stage 3): { onWin(g, S), onLose(g, S), onExit(g), onRetreatExit(g, S), opts: { onEvent, onRetreat } } —
 *   the world results run on the host; guests just go back and wait for the host's next snap.
 */
export function startCoopBattle(game, session, setup, back, hooks = {}) {
  const host = session.host;
  const owners = {}; // unit id → slot
  const pinfo = {}; // slot → { name, color }
  for (const h of setup.heroes) { owners[heroIdOf(h.slot)] = h.slot; pinfo[h.slot] = { name: h.name, color: h.color }; }
  for (const id of setup.hostUnits || []) owners[id] = 0; // companions: the host plays them
  const playerName = (slot) => session.player(slot)?.name || pinfo[slot]?.name || `P${slot + 1}`;
  const playerColor = (slot) => C[session.player(slot)?.color || pinfo[slot]?.color || NET.colors[slot]] || C.h;
  const timerMax = setup.turnTimer ?? NET.turnTimer;
  const st = {
    seq: 0, // commands applied (host: issued)
    hashes: new Map(), // host: seq → hash at turn boundaries
    lastFull: {}, // host: slot → seq of the last fullState sent
    inbox: [], // guest: host commands waiting for the animation
    turnRef: null, turnT: 0, // timer of the current turn (host: authoritative; guest: display)
    resyncs: 0, desyncs: 0,
    turnKey: '',
  };
  let scene = null;
  const S = () => scene.S;
  const keyOf = (b) => `${b.round}:${b.turnIndex}:${b.winner || ''}`;
  /** After every applied command: at a turn boundary — hash (host stores, guest reports). */
  function afterApply() {
    const b = S().b;
    const k = keyOf(b);
    if (k === st.turnKey) return;
    st.turnKey = k;
    const h = battleHash(b);
    if (host) {
      st.hashes.set(st.seq, h);
      if (st.hashes.size > NET.hashKeep) st.hashes.delete(st.hashes.keys().next().value);
    } else session.send({ t: MSG.hash, turn: st.seq, h });
  }

  const net = {
    host,
    myId: heroIdOf(session.slot),
    owners,
    mine: (u) => !!u && owners[u.id] === session.slot,
    unitColor: (u) => (owners[u.id] != null ? playerColor(owners[u.id]) : null),
    waitText: (cu) => (cu && owners[cu.id] != null ? t('net.waitTurn').replace('{player}', playerName(owners[cu.id])) : t('battle.notTurn')),
    turnLabel(cu) {
      const slot = owners[cu.id];
      if (slot == null) return null;
      const left = timerMax && slot !== 0 && session.player(slot)?.connected !== false ? ` · ${Math.max(0, Math.ceil(timerMax - st.turnT))} ${t('net.sec')}` : '';
      const pl = session.player(slot);
      const tx = pl && !pl.connected ? t('net.autoTurn').replace('{player}', playerName(slot)) : t('net.turnOf').replace('{hero}', S().name(cu.id)).replace('{player}', playerName(slot));
      return { text: tx + left, color: playerColor(slot) };
    },
    intent(cmd) { session.send({ t: MSG.cmd, turn: st.seq, actor: currentUnit(S().b)?.id, action: cmd }); },
    applied(cmd) {
      st.seq++;
      session.broadcast({ t: MSG.cmd, turn: st.seq, action: cmd });
      afterApply();
    },
    /** Host: a remote player's hero whose owner is offline — host AI plays it. */
    auto(cu) {
      if (!host || !cu) return false;
      const slot = owners[cu.id];
      return slot != null && slot !== 0 && !session.player(slot)?.connected;
    },
    /** Host: the turn timer of a connected remote player → skip the turn. */
    tick(cu, dt) {
      const slot = owners[cu.id];
      if (!timerMax || slot == null || slot === session.slot) return;
      if (st.turnT >= timerMax) {
        S().run({ k: 'act', a: { type: 'endTurn' } });
        session.notice(t('net.skipped').replace('{player}', playerName(slot)));
      }
    },
  };

  const H = host ? hooks : {};
  const extra = { ...(setup.battle || {}), ...(H.opts || {}) };
  if (extra.onRetreat) { const f = extra.onRetreat; extra.onRetreat = (g, S2) => leave(g, () => f(g, S2)); }
  scene = createBattleScene({
    heroes: (g) => (setup.save ? worldUnits(g, setup) : setup.heroes.map((h) => buildHeroUnit(g, h.hero, heroIdOf(h.slot)))),
    map: setup.map,
    enemies: setup.enemies,
    seed: setup.seed,
    title: setup.title,
    ...extra,
    net,
    onWin: (g, S2) => leave(g, H.onWin && (() => H.onWin(g, S2))),
    onLose: (g, S2) => leave(g, H.onLose && (() => H.onLose(g, S2))),
    onExit: (g) => leave(g, H.onExit && (() => H.onExit(g))),
    ...(setup.battle?.objectives ? { onRetreatExit: (g, S2) => leave(g, H.onRetreatExit && (() => H.onRetreatExit(g, S2))) } : {}),
  });
  let left = false;
  function leave(g, then) {
    if (left) return;
    left = true;
    off();
    if (host) { session.busy = false; session.broadcast({ t: MSG.battleEnd }); }
    (then || back)(g);
  }

  // ---------------------------------------------------------------- messages
  function onMsg(m, from) {
    if (game.scene !== scene) return;
    const b = S().b;
    if (host) {
      if (m.t === MSG.cmd) {
        const cu = currentUnit(b);
        const a = m.action || {};
        const okActor = cu && m.actor === cu.id && owners[cu.id] === from && !b.winner;
        const okKind = a.k === 'act' ? !a.a?.unit || a.a.unit === cu?.id : a.k === 'trick' ? a.u === cu?.id : false;
        const res = okActor && okKind ? S().run(a) : { ok: false, error: 'turn' };
        if (!res.ok) session.sendTo(from, { t: MSG.nack, error: res.error || 'bad' });
      } else if (m.t === MSG.hash) {
        const h0 = st.hashes.get(m.turn);
        if (h0 === undefined || h0 === m.h || m.turn <= (st.lastFull[from] ?? -1)) return;
        st.desyncs++;
        st.lastFull[from] = st.seq;
        session.sendTo(from, { t: MSG.fullState, turn: st.seq, state: snapshotBattle(b) });
      }
      return;
    }
    if (m.t === MSG.cmd) st.inbox.push(m);
    else if (m.t === MSG.nack) { S().pending = false; S().dirty = true; }
    else if (m.t === MSG.fullState) {
      st.inbox.length = 0;
      restoreBattle(b, m.state);
      st.seq = m.turn;
      st.turnKey = keyOf(b);
      st.resyncs++;
      S().resync();
      game.toast(t('net.resync'), 'a');
    }
  }
  const offs = [session.on('msg', onMsg)];
  const off = () => { for (const f of offs) f(); offs.length = 0; };

  /** Guest: apply host commands while nothing is animating (same pace as the host). */
  function pump() {
    const sc = S();
    while (st.inbox.length && sc.idle()) {
      const m = st.inbox.shift();
      if (m.turn !== st.seq + 1) continue; // stale (before a fullState)
      sc.applyCmd(m.action);
      st.seq = m.turn;
      sc.pending = false;
      afterApply();
    }
  }

  const baseUpdate = scene.update, baseRender = scene.render, baseEnter = scene.enter;
  scene.coop = st;
  scene.coopSetup = setup;
  /** Guest: the host ended the battle (retreat / result) — back to the world without waiting for the local end. */
  scene.coopLeave = (g) => leave(g);
  /** Host, stage 4: a player came back mid-battle — the same setup and the current state. */
  scene.coopRejoin = (slot) => {
    session.sendTo(slot, { t: MSG.battleStart, seed: setup.seed, setup, rejoin: true });
    session.sendTo(slot, { t: MSG.fullState, turn: st.seq, state: snapshotBattle(S().b) });
    st.lastFull[slot] = st.seq;
  };
  scene.enter = (g) => {
    baseEnter(g);
    st.turnKey = keyOf(S().b);
    if (host) st.hashes.set(0, battleHash(S().b));
    else session.send({ t: MSG.hash, turn: 0, h: battleHash(S().b) });
  };
  scene.update = (g, dt) => {
    const b = S().b;
    if (b.turn !== st.turnRef) { st.turnRef = b.turn; st.turnT = 0; } else st.turnT += dt;
    if (!host) pump();
    if (!host && session.status !== 'connected' && g.input.wasPressed('Escape')) { leave(g); return; } // host is gone
    if (g.input.wasPressed('KeyC') && !S().result) { openChatInput(g, session); return; }
    baseUpdate(g, dt);
  };
  scene.render = (g) => {
    baseRender(g);
    const L = S().L;
    if (!host && session.status !== 'connected' && L) {
      const msg = `${t('net.st.lost')} — Esc: ${t('net.leave')}`;
      g.ctx.fillStyle = 'rgba(20,20,28,0.85)';
      g.ctx.fillRect(L.area.x + L.area.w / 2 - 260, L.area.y + 40, 520, 36);
      text(g.ctx, msg, L.area.x + L.area.w / 2, L.area.y + 48, C.c, FONT_B, 'center');
    }
    if (L) drawChatPeek(g.ctx, session, { x: L.area.x + 8, y: L.area.y + L.area.h - 12, w: Math.min(520, L.area.w - 16) }, { hint: t('net.chatHintBattle') });
  };
  game.setScene(scene);
  return scene;
}
