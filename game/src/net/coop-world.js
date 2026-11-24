// Co-op world (multiplayer.md stages 3–4): the host's world is shared with the guests.
// Host — authority: runs the real scenes on its save; sends every guest a `snap` (scene, node, mirror save — the host's
// save with the guest's own hero, world/coop.js mirrorSave) on a scene change and a `delta` (fresh mirror) when the
// world changes; on the free node map — `pos` of everybody 10 Hz (guests' `move` validated: passable cell, speed);
// the top modal is mirrored to everybody (`modal`), guests vote (`vote` → marks), the host decides — except windows
// opened by a guest's own request (`act`: roam interaction) — those are decided by that guest (personal: trade, talks);
// battles from the world go through net/coop-battle (worldUnits: every client builds the units from the host's save);
// loot is split (take / pass, d20 roll-off, credits equally); guests' gear / level-up edits come back as `heroEdit`.
// Guest: rebuilds the same scene on the mirror save (its own hero is `save.hero`), input filtered (the host leads:
// only walking on the free map, panels, chat), nothing is saved locally except the copy of its hero (NET.heroKey).
// Stage 4: a dropped guest keeps the slot (session.keepSlots), on rejoin gets a snap (or battleStart + fullState).
// The controller lives in game.coop; main.js calls sceneUpdate / tick / render, ui/modal.js — decorateModal.
import { t } from '../data/text/index.js';
import { NET } from '../data/net.js';
import { ROAM } from '../data/world/roam.js';
import { MSG } from './protocol.js';
import { C, FONT, FONT_B, FONT_L, text, textBlock, panel, clear, fit } from '../ui/draw.js';
import { drawChatPeek, openChatInput, hideChatInput } from '../ui/net-chat.js';
import { hostStartBattle, startCoopBattle } from './coop-battle.js';
import { linkPlayers, linkPlayer, mirrorSave, coopEntry, coopLinked, coopView, acceptHeroEdit, splitCredits, rollOff, partyBrief } from '../world/coop.js';
import { setSaveBlocked, saveGame } from '../save.js';
import { receive, makeInst, canStash, qualityName } from '../world/inventory.js';
import { activeCompanions, tf } from '../world/state.js';
import { ITEMS } from '../world/data.js';

/** Scenes a guest runs himself (full input, his own windows): panels, the net menu, the co-op battle. */
const LOCAL = new Set(['panels', 'net']);
const FULL_INPUT = new Set(['panels', 'net', 'battle', 'create']);
const VIEW_KEYS = new Set(['KeyP', 'KeyR', 'KeyJ', 'KeyG', 'KeyB', 'KeyN']);
const ROAM_KEYS = new Set([...VIEW_KEYS, 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'AltLeft', 'AltRight']);
const BATTLE_OPTS = ['allies', 'rivals', 'partyLose', 'objectives', 'ambush', 'enemyInit', 'heroInit', 'race', 'tricks', 'hint', 'intro', 'triggers'];

let mods = null; // scene modules (dynamic: they import the whole world)
const loadMods = () => mods || (mods = Promise.all([import('../scenes/world-map.js'), import('../scenes/roam.js'), import('../scenes/location.js')])
  .then(([wm, roam, loc]) => ({ wm, roam, loc })));

const copy = (o) => JSON.parse(JSON.stringify(o));

/** Modal → plain spec for the mirror (labels / lines only). */
function serialModal(game, m) {
  const sp = m._spec || (m.build ? { ...m, ...m.build(game) } : m);
  return {
    title: String(sp.title || ''), border: sp.border || null, titleColor: sp.titleColor || null, width: sp.width || null,
    lines: (sp.lines || []).map((l) => (typeof l === 'string' ? { text: l } : { text: String(l?.text ?? ''), color: l?.color || null })),
    options: (sp.options || []).map((o) => ({ label: String(o.label ?? ''), sub: o.sub ? String(o.sub) : null, disabled: !!o.disabled, inert: !!o.inert, hostOnly: !!o.hostOnly })),
    owner: m._owner ?? null, loot: m.loot || null,
  };
}

/** A filtered input for a guest's view scenes: only `keys`, mouse hover (+ clicks on the free map). */
function filtered(real, keys, clicks) {
  const mouse = clicks ? real.mouse : { ...real.mouse, clicked: false, rightClicked: false, down: false, released: false };
  return {
    isDown: (c) => keys.has(c) && real.isDown(c),
    wasPressed: (c) => keys.has(c) && real.wasPressed(c),
    typed: () => '',
    mouse,
    endFrame() {},
  };
}

/** Guest: what the host is doing in a scene without a mirror (dialogue, cyberspace, …). */
function waitScene(ctrl) {
  return {
    id: 'coop-wait',
    update() {},
    render(game) {
      const { ctx } = game;
      clear(ctx, game.width, game.height);
      const w = Math.min(820, game.width - 80), x = (game.width - w) / 2, y = game.height / 2 - 140;
      panel(ctx, x, y, w, 260, C['1'], C['3']);
      const v = ctrl.view || {};
      text(ctx, fit(ctx, v.title || t('net.waitTitle'), w - 48, FONT_L), x + 24, y + 22, C.h, FONT_L);
      if (v.text) {
        if (v.name) text(ctx, v.name, x + 24, y + 70, C.a, FONT_B);
        textBlock(ctx, v.text, x + 24, y + 98, w - 48, C['5'], FONT, 22, 6);
      } else textBlock(ctx, t('net.waitHostScene'), x + 24, y + 70, w - 48, C['4'], FONT, 22, 4);
    },
  };
}

/**
 * createCoopWorld(game, session, { openMenu }) — the controller (game.coop). Host: call before entering the world
 * (startWorld / startFromSave); guest: on the first `snap` (net-menu). openMenu(game) — the net menu (F2).
 */
export function createCoopWorld(game, session, { openMenu } = {}) {
  game.coop?.stop(game);
  const host = session.host;
  const base = { setScene: game.setScene, resume: game.resume, openModal: game.openModal };
  const ctrl = {
    host, guest: !host, session,
    linked: null, // host: the save the session players are linked to
    sceneKey: '', desc: null, viewKey: '', // host: last scene description sent
    lastSig: new Map(), // host: slot → JSON of the last mirror sent
    heroSig: new Map(), // host: slot → JSON of the guest's hero (heroSync on change)
    pos: new Map(), // slot → { x, y, tx, ty, loc, at }
    modalSeq: 0, modalId: 0, modalSig: '', votes: new Map(), // mirrored modal (host: authority)
    mirror: null, // guest: { id, spec, votes }
    actor: null, // host: slot whose request is being executed (its windows are its own)
    lootSt: null, lootSeq: 0,
    snap: null, pending: null, view: null, applying: false, // guest
    mySig: '', heroT: 0, posT: 0, deltaT: 0, sent: null,
    stats: { snaps: 0, deltas: 0, moves: 0, rejected: 0, edits: 0, acts: 0 },
    backScene: null,
  };
  const me = () => session.slot;
  const playerName = (slot) => session.player(slot)?.name || (slot === 0 ? 'Host' : `P${slot + 1}`);
  const colorKey = (slot) => session.player(slot)?.color || NET.colors[slot] || 'h';
  const connected = (slot) => slot === me() || !!session.player(slot)?.connected;
  ctrl.myColor = () => C[colorKey(me())] || C.h;

  // ---------------------------------------------------------------- game hooks
  game.setScene = function (scene) {
    if (!host && !ctrl.applying && !LOCAL.has(scene?.id)) return; // guest: only the host changes the world scene
    base.setScene.call(this, scene);
    if (scene?.id !== 'net') hideChatInput(); // the lobby's sticky chat field must not stay over the world
    if (!host) restoreMirror();
  };
  game.resume = function (scene) {
    base.resume.call(this, scene);
    if (scene?.id !== 'net') hideChatInput();
    if (!host) restoreMirror();
  };
  game.openModal = function (spec) {
    // guest: the world's windows come from the host; his own level-up (personal) and panels stay local
    if (!host && !spec?.net && !spec?.personal && !FULL_INPUT.has(this.scene?.id)) return;
    if (host && ctrl.actor != null && spec && spec._owner === undefined) spec._owner = ctrl.actor;
    base.openModal.call(this, spec);
  };
  let ready = false; // the message that created a guest's controller is fed by ctrl.feed (not by the live listener)
  Promise.resolve().then(() => { ready = true; });
  const offs = [session.on('msg', (m, from) => ready && (host ? hostMsg(m, from) : guestMsg(m))), session.on('joined', (p) => host && joined(p)),
    session.on('left', (p) => { ctrl.pos.delete(p.slot); })];
  if (host) session.keepSlots = true; else setSaveBlocked(true);
  loadMods();

  // ---------------------------------------------------------------- host
  function sceneDesc() {
    const sc = game.scene, id = sc?.id;
    if (!id || LOCAL.has(id) || id === 'battle') return null; // host-local / battle (battleStart)
    if (id === 'worldmap') return { scene: 'worldmap' };
    if (id === 'roam') return { scene: 'roam', node: sc.locId };
    if (id === 'location') return { scene: 'location', node: sc.locId };
    return { scene: 'wait', node: id };
  }
  const guests = () => (game.save ? coopLinked(game.save).filter((e) => session.player(e.slot)?.connected) : []);
  function sendSnap(slot) {
    const d = ctrl.desc;
    const save = mirrorSave(game.save, slot);
    if (!d || !save) return;
    ctrl.lastSig.set(slot, JSON.stringify(save));
    ctrl.stats.snaps++;
    session.sendTo(slot, { t: MSG.snap, ...d, save, view: game.scene?.netView?.() || null, slot });
    ctrl.modalSig = ''; // re-send the current modal after the scene
  }
  function relink() {
    linkPlayers(game.save, session.players.filter((p) => p.connected));
    ctrl.linked = game.save;
    ctrl.sceneKey = '';
  }
  function joined(p) {
    if (!game.save) return;
    const e = linkPlayer(game.save, p);
    if (!e) return;
    ctrl.lastSig.delete(p.slot);
    const sc = game.scene;
    if (sc?.id === 'battle' && sc.coopRejoin) sc.coopRejoin(p.slot);
    else sendSnap(p.slot);
  }
  function hostTick(dt) {
    if (!game.save) return;
    if (ctrl.linked !== game.save) relink();
    const d = sceneDesc();
    if (d) {
      const key = JSON.stringify(d);
      if (key !== ctrl.sceneKey) {
        ctrl.sceneKey = key; ctrl.desc = d;
        if (d.scene !== 'roam') ctrl.pos.clear();
        for (const e of guests()) sendSnap(e.slot);
      }
      const v = game.scene?.netView?.() || null;
      const vk = JSON.stringify(v);
      if (vk !== ctrl.viewKey) { ctrl.viewKey = vk; session.broadcast({ t: MSG.delta, view: v }); }
    }
    syncModal();
    ctrl.posT += dt;
    if (ctrl.posT >= NET.posEvery) { ctrl.posT = 0; hostPos(dt); }
    ctrl.deltaT += dt;
    if (ctrl.deltaT >= NET.deltaEvery && !session.busy) {
      ctrl.deltaT = 0;
      for (const e of guests()) {
        const save = mirrorSave(game.save, e.slot);
        const sig = JSON.stringify(save);
        if (sig === ctrl.lastSig.get(e.slot)) continue;
        ctrl.lastSig.set(e.slot, sig);
        ctrl.stats.deltas++;
        session.sendTo(e.slot, { t: MSG.delta, save });
      }
    }
  }
  function hostPos() {
    const sc = game.scene;
    if (sc?.id !== 'roam' || !sc.leader) return;
    const ld = sc.leader();
    const list = [{ slot: 0, x: ld.x, y: ld.y }];
    for (const [slot, p] of ctrl.pos) if (p.loc === sc.locId && connected(slot)) list.push({ slot, x: p.tx, y: p.ty });
    session.broadcast({ t: MSG.pos, list, loc: sc.locId });
  }
  function syncModal() {
    const m = game.modals[game.modals.length - 1] || null;
    // not mirrored: host-local panels, the battle, personal windows (the host's own level-up)
    const shown = m && !m.personal && !session.busy && !LOCAL.has(game.scene?.id) ? m : null;
    const id = shown ? (shown._netId ||= ++ctrl.modalSeq) : 0;
    if (id !== ctrl.modalId) { ctrl.modalId = id; ctrl.votes.clear(); }
    const spec = shown ? serialModal(game, shown) : null;
    const votes = [...ctrl.votes];
    const sig = JSON.stringify([id, spec, votes]);
    if (sig === ctrl.modalSig) return;
    ctrl.modalSig = sig;
    session.broadcast({ t: MSG.modal, id, spec, votes });
  }
  /** Host: run a modal option on behalf of a player (his request's windows; his hero for the run). */
  function pickFor(slot, m, idx) {
    const sp = m._spec || (m.build ? { ...m, ...m.build(game) } : m);
    const opt = sp.options?.[idx];
    if (!opt || opt.disabled || opt.inert || opt.hostOnly) return;
    if (!opt.keep) game.modals.splice(game.modals.indexOf(m), 1);
    withActor(slot, () => opt.run?.(game));
  }
  /** Run fn as player `slot`: windows it opens are his; save.hero is his hero for the run (no save while swapped). */
  function withActor(slot, fn) {
    const save = game.save;
    const e = slot > 0 ? coopEntry(save, slot) : null;
    const real = save.hero, toast = game.toast;
    ctrl.actor = slot;
    if (e) { save.hero = e.hero; setSaveBlocked(true); }
    // the result for the requester too: his toasts travel to him
    if (slot > 0) game.toast = function (txt, color) { session.sendTo(slot, { t: MSG.act, kind: 'toast', text: String(txt), color }); return toast.call(this, txt, color); };
    try { return fn(); } finally {
      game.toast = toast;
      ctrl.actor = null;
      if (e) { save.hero = real; setSaveBlocked(false); saveGame(save); }
    }
  }
  function hostMsg(m, from) {
    const save = game.save;
    if (!save) return;
    switch (m.t) {
      case MSG.move: {
        const sc = game.scene;
        if (sc?.id !== 'roam' || m.loc !== sc.locId) return;
        const p = ctrl.pos.get(from);
        const now = game.time;
        const far = p && p.loc === m.loc && Math.hypot(m.x - p.tx, m.y - p.ty) > ROAM.run * Math.max(NET.posEvery, now - p.at) * 1.5 + NET.posSlack;
        if (!sc.validPos?.(Math.round(m.x), Math.round(m.y)) || far) {
          ctrl.stats.rejected++;
          if (p) session.sendTo(from, { t: MSG.pos, list: [], fix: { x: p.tx, y: p.ty }, loc: sc.locId });
          return;
        }
        ctrl.stats.moves++;
        if (p && p.loc === m.loc) Object.assign(p, { tx: m.x, ty: m.y, at: now });
        else ctrl.pos.set(from, { x: m.x, y: m.y, tx: m.x, ty: m.y, loc: m.loc, at: now });
        return;
      }
      case MSG.act: {
        const sc = game.scene;
        ctrl.stats.acts++;
        // the host's own personal windows (level-up) do not block a guest's request
        if (m.kind === 'roam' && sc?.id === 'roam' && !game.modals.some((x) => !x.personal) && sc.remoteInteract) {
          const ok = withActor(from, () => sc.remoteInteract(game, m));
          if (!ok) session.sendTo(from, { t: MSG.act, kind: 'fail' });
        } else session.sendTo(from, { t: MSG.act, kind: 'busy' });
        return;
      }
      case MSG.vote: {
        if (m.promptId !== ctrl.modalId) return;
        const top = game.modals[game.modals.length - 1];
        ctrl.votes.set(from, m.optId);
        if (top && top._netId === m.promptId && top._owner === from) pickFor(from, top, m.optId);
        return;
      }
      case MSG.lootRoll: if (ctrl.lootSt && m.itemId === ctrl.lootSt.id) ctrl.lootSt.pick(from, m.choice === 'take' ? 'take' : 'pass'); return;
      case MSG.heroEdit: {
        const e = coopEntry(save, from);
        if (!e) return;
        const r = acceptHeroEdit(e, m);
        if (r.ok) ctrl.stats.edits++;
        else session.sendTo(from, { t: MSG.heroSync, hero: e.hero, stash: e.stash, ground: e.ground, why: r.why });
        ctrl.lastSig.delete(from);
        return;
      }
      default:
    }
  }

  /** Host: a world battle (scenes/world-battle.js startWorldBattle options) as a co-op battle. */
  ctrl.battle = (g, o) => {
    const save = g.save;
    const seed = (Math.random() * 1e9) | 0;
    const mine = session.me();
    const heroes = [{ slot: 0, name: mine?.name || save.hero.name, color: colorKey(0) },
      ...guests().map((e) => ({ slot: e.slot, name: playerName(e.slot), color: colorKey(e.slot) }))];
    const battle = {};
    for (const k of BATTLE_OPTS) if (o[k] !== undefined && o[k] !== null) battle[k] = o[k];
    const setup = {
      kind: 'world', seed, save: copy(save), heroes, hostUnits: activeCompanions(save).map((p) => `c-${p.npc}`),
      enemies: o.enemies, map: typeof o.map === 'function' ? o.map(seed) : o.map, title: o.title, turnTimer: session.settings.turnTimer, battle,
    };
    ctrl.modalSig = '';
    session.broadcast({ t: MSG.modal, id: 0, spec: null, votes: [] });
    return hostStartBattle(g, session, setup, (g2) => o.onExit?.(g2), {
      onWin: o.onWin, onLose: o.onLose, onExit: o.onExit, onRetreatExit: o.onRetreatExit, opts: { onEvent: o.onEvent, onRetreat: o.onRetreat },
    });
  };

  /**
   * Host: loot split (multiplayer.md «Лут»): credits equally, then every item stack — «Взять» / «Пас» by each player
   * (guests: lootRoll), the takers roll d20 (ties reroll), the winner gets it into his bag; nobody — the host's party.
   * The host may resolve now or give by hand. Without connected guests — the usual loot window (fallback).
   */
  ctrl.loot = (g, loot, then, fallback) => {
    const save = g.save;
    const players = [0, ...guests().map((e) => e.slot)];
    if (players.length === 1) return fallback(g, loot, then);
    const parts = splitCredits(loot.credits || 0, players.length);
    if (loot.credits) {
      players.forEach((slot, i) => { const h = slot === 0 ? save.hero : coopEntry(save, slot)?.hero; if (h) h.credits = (h.credits || 0) + parts[i]; });
      session.notice(tf('net.lootCredits', { n: loot.credits, each: parts[players.length - 1] }));
    }
    const queue = (loot.items || []).filter((x) => ITEMS[x.id]).map((x) => ({ ...x }));
    const total = queue.length;
    const label = ({ id, n, q }) => `${ITEMS[id]?.name || id}${q && q !== 'working' ? ` (${qualityName(q)})` : ''}${n > 1 ? ` ×${n}` : ''}`;
    const give = (slot, it) => {
      const e = slot > 0 ? coopEntry(save, slot) : null;
      const v = e ? coopView(save, e) : save;
      receive(v, makeInst(it.id, it.q), it.n, { others: !e, stash: canStash(save), ground: true });
    };
    const notes = loot.notes || [];
    if (!queue.length) {
      if (!notes.length && !loot.credits) return then();
      g.openModal({ title: t('loot.title'), lines: [...notes, ...(loot.credits ? [{ text: tf('net.lootCredits', { n: loot.credits, each: parts[players.length - 1] }), color: 'b' }] : [])],
        options: [{ label: t('battle.ok'), run: (g2) => then(g2) }], onCancel: (g2) => then(g2) });
      return;
    }
    const next = () => {
      const it = queue.shift();
      if (!it) { ctrl.lootSt = null; then(g); return; }
      const st = { id: `L${++ctrl.lootSeq}`, picks: new Map() };
      ctrl.lootSt = st;
      const spec = {
        loot: st.id, onCancel: false, width: 680,
        title: `${t('net.lootTitle')} ${total - queue.length}/${total}: ${label(it)}`,
        lines: [],
        build: () => ({ lines: [...(total - queue.length === 1 ? notes : []), { text: t('net.lootHint'), color: '4' },
          ...players.map((s) => ({ text: `${playerName(s)}: ${st.picks.has(s) ? t(st.picks.get(s) === 'take' ? 'net.lootTake' : 'net.lootPass') : connected(s) ? '…' : t('net.st.lost')}`, color: colorKey(s) }))] }),
        options: [
          { label: t('net.lootTake'), keep: true, run: () => st.pick(0, 'take') },
          { label: t('net.lootPass'), keep: true, run: () => st.pick(0, 'pass') },
          { label: t('net.lootRollNow'), hostOnly: true, run: () => resolve() },
          ...players.map((s) => ({ label: tf('net.lootGive', { player: playerName(s) }), hostOnly: true, run: () => done(s, null) })),
        ],
      };
      const close = () => { const i = g.modals.indexOf(spec); if (i >= 0) g.modals.splice(i, 1); };
      const done = (winner, rounds) => {
        close();
        if (winner == null) give(0, it);
        else give(winner, it);
        const rolls = rounds?.length ? ` (d20: ${rounds.map((r) => r.map(([s, v]) => `${playerName(s)} ${v}`).join(', ')).join(' / ')})` : '';
        session.notice(`${t('net.lootTitle')}: ${label(it)} → ${winner == null ? t('net.lootNobody') : playerName(winner)}${rolls}`);
        next();
      };
      const resolve = () => {
        const takers = players.filter((s) => st.picks.get(s) === 'take');
        const r = rollOff(takers);
        done(r.winner, r.rounds);
      };
      st.pick = (slot, choice) => {
        if (ctrl.lootSt !== st) return;
        st.picks.set(slot, choice);
        if (players.every((s) => st.picks.has(s) || !connected(s))) resolve();
      };
      g.openModal(spec);
    };
    next();
  };

  // ---------------------------------------------------------------- guest
  function guestMsg(m) {
    switch (m.t) {
      case MSG.snap: onSnap(m); return;
      case MSG.delta:
        if (m.view !== undefined) ctrl.view = m.view;
        if (m.save) { watchHero(true); game.save = m.save; ctrl.mySig = heroSig(); keepHero(); ctrl.stats.deltas++; }
        return;
      case MSG.modal:
        ctrl.mirror = m.spec ? { id: m.id, spec: m.spec, votes: new Map(m.votes || []) } : null;
        restoreMirror(true);
        return;
      case MSG.pos: {
        if (m.fix) { const ld = game.scene?.leader?.(); if (ld) { ld.step = null; ld.x = ld.cx = Math.round(m.fix.x); ld.y = ld.cy = Math.round(m.fix.y); } return; }
        const seen = new Set();
        for (const p of m.list || []) {
          if (p.slot === me()) continue;
          seen.add(p.slot);
          const o = ctrl.pos.get(p.slot);
          if (o && o.loc === m.loc) { o.tx = p.x; o.ty = p.y; } else ctrl.pos.set(p.slot, { x: p.x, y: p.y, tx: p.x, ty: p.y, loc: m.loc });
        }
        for (const s of [...ctrl.pos.keys()]) if (!seen.has(s)) ctrl.pos.delete(s);
        return;
      }
      case MSG.heroSync:
        if (game.save && m.hero) { game.save.hero = m.hero; if (m.stash) game.save.stash = m.stash; if (m.ground) game.save.ground = m.ground; ctrl.mySig = heroSig(); keepHero(); }
        if (m.why) game.toast(t('net.editRejected'), 'c');
        return;
      case MSG.act: if (m.kind === 'toast') game.toast(m.text, m.color); else game.toast(t(m.kind === 'busy' ? 'net.hostBusy' : 'net.actFail'), '4'); return;
      case MSG.battleStart: {
        ctrl.mirror = null;
        ctrl.applying = true;
        try { startCoopBattle(game, session, m.setup, () => afterBattle()); } finally { ctrl.applying = false; }
        return;
      }
      case MSG.battleEnd: {
        const sc = game.scene;
        if (sc?.id === 'battle' && sc.coopLeave && !sc.S?.b?.winner) sc.coopLeave(game); // the host left early (retreat)
        return;
      }
      default:
    }
  }
  const heroSig = () => (game.save ? JSON.stringify([game.save.hero, game.save.stash, game.save.ground]) : '');
  /** Guest: his hero copy in localStorage (stage 4: comes back with the next hello). */
  function keepHero() {
    try { if (game.save?.hero) localStorage.setItem(NET.heroKey, JSON.stringify(game.save.hero)); } catch { /* private mode */ }
  }
  /** Guest: send his hero if he changed it (gear, bag, level-up picks). */
  function watchHero(force = false) {
    if (!game.save || !ctrl.snap) return;
    const sig = heroSig();
    if (sig === ctrl.mySig) return;
    ctrl.mySig = sig;
    ctrl.stats.edits++;
    session.send({ t: MSG.heroEdit, hero: game.save.hero, stash: game.save.stash, ground: game.save.ground });
    keepHero();
    if (force) ctrl.heroT = 0;
  }
  function onSnap(m) {
    ctrl.snap = m;
    ctrl.stats.snaps++;
    game.save = m.save;
    ctrl.mySig = heroSig();
    ctrl.view = m.view || null;
    keepHero();
    const sc = game.scene;
    if (sc?.id === 'panels' || (sc?.id === 'battle' && sc.coop)) { ctrl.pending = m; return; }
    applySnap(m);
  }
  async function applySnap(m) {
    ctrl.pending = null;
    const M = await loadMods();
    if (ctrl.snap !== m || game.coop !== ctrl) return; // a newer one came meanwhile
    let sc;
    try {
      if (m.scene === 'worldmap') sc = M.wm.createWorldMapScene();
      else if (m.scene === 'roam') sc = M.roam.createRoamScene(m.node);
      else if (m.scene === 'location') sc = M.loc.createLocationScene(m.node);
    } catch (e) { console.warn('coop scene', e); }
    ctrl.pos.clear();
    ctrl.applying = true;
    try { game.setScene(sc || waitScene(ctrl)); } finally { ctrl.applying = false; }
  }
  function afterBattle() {
    const m = ctrl.pending || ctrl.snap;
    if (m) { ctrl.snap = m; applySnap(m); return; }
    ctrl.applying = true;
    try { game.setScene(waitScene(ctrl)); } finally { ctrl.applying = false; }
  }
  /** Guest: keep the mirrored modal on top of his stack (setScene clears the stack). */
  function restoreMirror(changed = false) {
    if (host) return;
    const cur = game.modals.findIndex((x) => x.net);
    const mm = ctrl.mirror;
    if (cur >= 0 && (changed || !mm || game.modals[cur]._mid !== mm.id)) game.modals.splice(cur, 1);
    else if (cur >= 0) return;
    if (!mm || game.scene?.id === 'battle') return;
    const sp = mm.spec;
    const mine = sp.owner === me();
    const who = sp.loot ? null : mine ? t('net.youDecide') : sp.owner != null ? tf('net.playerDecides', { player: playerName(sp.owner) }) : t('net.hostDecides');
    base.openModal.call(game, {
      net: true, _mid: mm.id, title: sp.title, border: sp.border, titleColor: sp.titleColor, width: sp.width || undefined, onCancel: false,
      lines: [...(who ? [{ text: who, color: '4' }] : []), ...sp.lines],
      options: sp.options.map((o, i) => ({
        label: o.label, sub: o.sub, inert: o.inert, keep: true,
        disabled: o.disabled || o.hostOnly || (sp.loot && i > 1),
        run: () => {
          if (sp.loot) session.send({ t: MSG.lootRoll, itemId: sp.loot, choice: i === 0 ? 'take' : 'pass' });
          else session.send({ t: MSG.vote, promptId: mm.id, optId: i });
          mm.votes.set(me(), i);
        },
      })),
    });
  }
  function guestTick(dt) {
    if (ctrl.pending && game.scene?.id !== 'panels' && !(game.scene?.id === 'battle' && game.scene.coop)) applySnap(ctrl.pending);
    ctrl.heroT += dt;
    if (ctrl.heroT >= 0.25) { ctrl.heroT = 0; watchHero(); }
    if (ctrl.mirror && !game.modals.some((x) => x.net) && game.scene?.id !== 'battle') restoreMirror();
    ctrl.posT += dt;
    const sc = game.scene;
    if (ctrl.posT >= NET.posEvery && sc?.id === 'roam' && sc.leader && session.status === 'connected') {
      ctrl.posT = 0;
      const ld = sc.leader();
      const k = `${sc.locId}:${ld.x.toFixed(2)},${ld.y.toFixed(2)}`;
      if (k !== ctrl.sent) { ctrl.sent = k; session.send({ t: MSG.move, x: ld.x, y: ld.y, loc: sc.locId }); }
    }
  }

  // ---------------------------------------------------------------- shared API (main.js, roam.js, modal.js)
  if (!host) {
    ctrl.sceneUpdate = (g, dt) => {
      const sc = g.scene, id = sc?.id;
      if (FULL_INPUT.has(id)) return sc.update(g, dt);
      const real = g.input;
      g.input = filtered(real, id === 'roam' ? ROAM_KEYS : VIEW_KEYS, id === 'roam');
      try { sc.update(g, dt); } finally { g.input = real; }
    };
  }
  ctrl.tick = (g, dt) => {
    for (const p of ctrl.pos.values()) { const k = Math.min(1, dt * NET.posLerp); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    if (host) hostTick(dt); else guestTick(dt);
    const id = g.scene?.id;
    if (g.modals.length || id === 'net' || id === 'battle' || id === 'create') return;
    if (g.input.wasPressed('Slash') || g.input.wasPressed('Backquote')) openChatInput(g, session);
    else if (g.input.wasPressed('F2') && openMenu) openMenu(g);
  };
  ctrl.feed = (m, from = 0) => (host ? hostMsg(m, from) : guestMsg(m));
  ctrl.request = (g, req) => { session.send({ t: MSG.act, ...req }); };
  /** Other players' figures on the free map `locId`: [{ slot, x, y, name, color, hero }]. */
  ctrl.others = (g, locId) => {
    const brief = g.save ? partyBrief(g.save) : [];
    const out = [];
    for (const [slot, p] of ctrl.pos) {
      if (p.loc !== locId || slot === me() || !connected(slot)) continue;
      const b = brief.find((x) => x.slot === slot);
      out.push({ slot, x: p.x, y: p.y, name: b?.name || playerName(slot), color: colorKey(slot), hero: b?.hero, sprite: p.sprite });
    }
    return out;
  };
  ctrl.decorateModal = (g, m, L) => {
    const votes = host ? (m._netId === ctrl.modalId ? ctrl.votes : null) : m.net ? ctrl.mirror?.votes : null;
    if (!votes?.size || m.loot) return;
    const by = new Map();
    for (const [slot, idx] of votes) (by.get(idx) || by.set(idx, []).get(idx)).push(slot);
    for (const b of L.buttons) {
      const list = by.get(b.idx);
      if (!list) continue;
      let x = b.x + b.w - 8;
      for (const slot of list) {
        const nm = `● ${playerName(slot)}`;
        g.ctx.font = '12px monospace';
        text(g.ctx, nm, x, b.y + 4, C[colorKey(slot)] || C.h, '12px monospace', 'right');
        x -= g.ctx.measureText(nm).width + 10;
      }
    }
  };
  ctrl.render = (g) => {
    const id = g.scene?.id;
    if (id === 'net' || id === 'battle' || id === 'create') return;
    const { ctx } = g;
    // players strip (top right): colour, name, status
    const list = session.players;
    const w = 220, x = g.width - w - 10;
    let y = 76;
    for (const p of list) {
      panel(ctx, x, y, w, 24, 'rgba(20,20,28,0.8)', C[p.color] || C['3']);
      text(ctx, fit(ctx, `${p.slot === 0 ? '★ ' : ''}${p.name}${p.slot === me() ? ` (${t('net.you')})` : ''}${p.connected ? '' : ` — ${t('net.st.lost')}`}`, w - 12, '12px monospace'), x + 6, y + 5, p.connected ? C[p.color] || C.h : C['4'], '12px monospace');
      y += 28;
    }
    drawChatPeek(ctx, session, { x: 12, y: g.height - 70, w: 520 }, { hint: t('net.chatHintWorld') });
    if (!host && session.status !== 'connected') {
      const msg = `${t('net.st.lost')} — F2: ${t('net.rejoin')}`;
      ctx.font = FONT_B;
      const tw = ctx.measureText(msg).width + 32;
      panel(ctx, g.width / 2 - tw / 2, 50, tw, 34, 'rgba(20,20,28,0.9)', C.c);
      text(ctx, msg, g.width / 2, 58, C.c, FONT_B, 'center');
    }
  };
  /** Guest: back into the host's current scene (net menu «В игру»). */
  ctrl.backToGame = (g) => {
    if (host) { if (ctrl.backScene) g.resume(ctrl.backScene); ctrl.backScene = null; return true; }
    const m = ctrl.pending || ctrl.snap;
    if (!m) return false;
    applySnap(m);
    return true;
  };
  ctrl.stop = (g) => {
    for (const f of offs) f();
    offs.length = 0;
    g.setScene = base.setScene; g.resume = base.resume; g.openModal = base.openModal;
    if (!host) { setSaveBlocked(false); g.save = null; } else session.keepSlots = false;
    g.modals = g.modals.filter((x) => !x.net);
    if (g.coop === ctrl) g.coop = null;
  };
  /** Test / debug state. */
  ctrl.info = () => ({
    host, slot: me(), scene: game.scene?.id, node: game.scene?.locId || null, stats: { ...ctrl.stats }, pos: [...ctrl.pos].map(([s, p]) => [s, +p.x.toFixed(2), +p.y.toFixed(2), p.loc]),
    modal: ctrl.mirror ? { id: ctrl.mirror.id, title: ctrl.mirror.spec.title, owner: ctrl.mirror.spec.owner, loot: ctrl.mirror.spec.loot, votes: [...ctrl.mirror.votes] } : host && ctrl.modalId ? { id: ctrl.modalId, votes: [...ctrl.votes] } : null,
    loot: ctrl.lootSt?.id || null, linked: game.save ? coopLinked(game.save).map((e) => [e.slot, e.name]) : [],
    hero: game.save?.hero ? { name: game.save.hero.name, credits: game.save.hero.credits, xp: game.save.hero.xp, level: game.save.hero.level } : null,
  });
  game.coop = ctrl;
  return ctrl;
}
