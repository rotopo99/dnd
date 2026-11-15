// Co-op session (multiplayer.md §1, §5, §6): host + up to 3 guests, slots, versions, lobby, ready, ping, chat.
// No DOM besides timers; the transport is any peer with { send(msg), close(), open, onOpen, onMessage, onClose, onError }
// (net/peer.js createPeer — WebRTC; createLoopPair — in-memory for tests).
import { NET } from '../data/net.js';
import { MSG, makeHello, checkHello, validate, cleanChat, localVersion, normalizeHero } from './protocol.js';
import { createPeer, NetError } from './peer.js';

const token = () => Math.random().toString(36).slice(2, 10);
const color = (slot) => NET.colors[slot] || NET.colors[0];

/**
 * createSession({ role: 'host'|'guest', name, hero, makePeer?, version?, pingEvery?, now? })
 * Events (on(type, fn)): 'lobby' (players / settings changed), 'chat' (line), 'status' (status), 'error' (NetError),
 * 'msg' (msg, fromSlot) — game messages (battleStart, cmd, hash, fullState, …), 'left' (player), 'joined' (player).
 */
export function createSession({ role, name, hero, makePeer = () => createPeer(), version = localVersion(), pingEvery = NET.pingEvery, now = () => Date.now() }) {
  const host = role === 'host';
  const listeners = {};
  const s = {
    role, host, version,
    slot: host ? 0 : null,
    status: 'idle', // idle | waiting | connecting | connected | lost | rejected
    error: null, // last NetError (text for the UI)
    players: host ? [{ slot: 0, name: name || 'Host', hero: normalizeHero(hero), ready: true, connected: true, ping: 0, color: color(0) }] : [],
    settings: { turnTimer: NET.turnTimer },
    chat: [], // { slot, name, text, color, at }
    busy: false, // host: in a battle (new guests are rejected with 'busy')
    peers: new Map(), // host: slot → peer
    pending: null, // host: the peer being invited (code exchange in progress); guest: the peer to the host
    on(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); return () => s.off(type, fn); },
    off(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    me() { return s.players.find((p) => p.slot === s.slot) || null; },
    player(slot) { return s.players.find((p) => p.slot === slot) || null; },
  };
  const emit = (type, ...a) => { for (const f of listeners[type] || []) { try { f(...a); } catch (e) { console.error(e); } } };
  const setStatus = (st) => { if (s.status !== st) { s.status = st; emit('status', st); } };
  const fail = (err) => { s.error = err instanceof NetError ? err : new NetError('failed'); emit('error', s.error); };

  // ---------------------------------------------------------------- shared
  function addChat(line) {
    s.chat.push({ ...line, at: now() });
    if (s.chat.length > NET.chatLines) s.chat.shift();
    emit('chat', s.chat[s.chat.length - 1]);
  }
  const lobbyMsg = () => ({ t: MSG.lobby, players: s.players.map(({ slot, name: n, hero: h, ready, connected, ping, color: c }) => ({ slot, name: n, ready, connected, ping, color: c, hero: heroBrief(h) })), settings: s.settings });
  const heroBrief = (h) => (h ? { name: h.name, race: h.race, cls: h.cls, level: h.level || 1 } : null);

  // ---------------------------------------------------------------- host
  function broadcast(msg, except = null) {
    for (const [slot, p] of s.peers) if (slot !== except && p.open) p.send(msg);
  }
  function sendTo(slot, msg) { const p = s.peers.get(slot); return !!p?.open && p.send(msg); }
  function pushLobby() { broadcast(lobbyMsg()); emit('lobby', s.players); }

  function hostAttach(peer) {
    peer.slot = null;
    peer.onMessage = (m) => hostOnMessage(peer, m);
    peer.onClose = () => {
      if (peer.slot == null) return;
      const pl = s.player(peer.slot);
      s.peers.delete(peer.slot);
      if (pl) { pl.connected = false; pl.ready = false; emit('left', pl); }
      pushLobby();
    };
    peer.onError = (e) => { if (s.pending === peer) { s.pending = null; setStatus(s.peers.size ? 'connected' : 'idle'); } fail(e); };
    peer.onOpen = () => setStatus('connected');
    return peer;
  }

  function hostOnMessage(peer, m) {
    if (!validate(m).ok) return;
    if (m.t === MSG.hello) {
      if (peer.slot != null) return;
      const bad = checkHello(m, s.version);
      if (bad) { peer.send({ t: MSG.reject, ...bad }); setTimeout(() => peer.close(), 300); return; }
      // rejoin: a disconnected player with the same token takes the slot back (stage 4 stores it longer)
      let pl = m.rejoinToken ? s.players.find((p) => !p.connected && p.token === m.rejoinToken) : null;
      if (!pl && s.busy) { peer.send({ t: MSG.reject, reason: 'busy' }); setTimeout(() => peer.close(), 300); return; }
      if (!pl) {
        s.players = s.players.filter((p) => p.connected); // free slots of players who left
        const used = new Set(s.players.map((p) => p.slot));
        let slot = 1;
        while (used.has(slot)) slot++;
        if (slot >= NET.maxPlayers) { peer.send({ t: MSG.reject, reason: 'full' }); setTimeout(() => peer.close(), 300); return; }
        pl = { slot, name: m.name || `P${slot + 1}`, hero: normalizeHero(m.hero), ready: false, connected: true, ping: 0, color: color(slot), token: token() };
        s.players.push(pl);
        s.players.sort((a, b) => a.slot - b.slot);
      } else { pl.connected = true; pl.hero = normalizeHero(m.hero) || pl.hero; }
      peer.slot = pl.slot;
      s.peers.set(pl.slot, peer);
      if (s.pending === peer) s.pending = null;
      peer.send({ t: MSG.welcome, slot: pl.slot, token: pl.token, players: lobbyMsg().players, settings: s.settings });
      setStatus('connected');
      emit('joined', pl);
      pushLobby();
      return;
    }
    if (peer.slot == null) return; // nothing before hello
    const from = peer.slot;
    const pl = s.player(from);
    switch (m.t) {
      case MSG.ping: peer.send({ t: MSG.pong, ts: m.ts }); return;
      case MSG.pong: if (pl) pl.ping = Math.max(0, now() - m.ts); return;
      case MSG.chat: {
        const text = cleanChat(m.text);
        if (!text || !pl) return;
        const line = { t: MSG.chat, slot: from, name: pl.name, text, color: pl.color };
        broadcast(line);
        addChat(line);
        return;
      }
      case MSG.ready: if (pl) { pl.ready = !!m.ready; pushLobby(); } return;
      default: emit('msg', m, from);
    }
  }

  /** Host: new invite → offer code (string). The previous unfinished invite is dropped. */
  async function invite() {
    if (s.pending && !s.pending.open) s.pending.close();
    const peer = hostAttach(makePeer());
    s.pending = peer;
    setStatus(s.peers.size ? 'connected' : 'waiting');
    return peer.createOffer();
  }
  /** Host: the guest's answer code for the current invite. */
  async function acceptAnswer(code) {
    if (!s.pending) throw new NetError('state');
    if (!s.peers.size) setStatus('connecting');
    await s.pending.acceptAnswer(code);
  }

  // ---------------------------------------------------------------- guest
  function guestAttach(peer) {
    s.pending = peer;
    const hello = () => peer.send(makeHello({ name, hero, version: s.version, rejoinToken: s.token }));
    peer.onOpen = hello;
    peer.onMessage = (m) => guestOnMessage(m);
    peer.onClose = () => { if (s.status === 'rejected') return; setStatus('lost'); for (const p of s.players) if (p.slot !== s.slot) p.connected = false; emit('lobby', s.players); };
    peer.onError = (e) => { setStatus('idle'); fail(e); };
    if (peer.open) hello();
    return peer;
  }

  function guestOnMessage(m) {
    if (!validate(m).ok) return;
    switch (m.t) {
      case MSG.welcome:
        s.slot = m.slot; s.token = m.token; s.players = m.players; s.settings = m.settings || s.settings;
        setStatus('connected');
        emit('lobby', s.players);
        return;
      case MSG.reject:
        s.error = new NetError(m.reason, { mine: m.mine, theirs: m.theirs });
        setStatus('rejected');
        emit('error', s.error);
        return;
      case MSG.lobby: s.players = m.players; if (m.settings) s.settings = m.settings; emit('lobby', s.players); return;
      case MSG.ping: s.pending?.send({ t: MSG.pong, ts: m.ts }); return;
      case MSG.pong: { const me = s.me(); if (me) me.ping = Math.max(0, now() - m.ts); return; }
      case MSG.chat: addChat({ slot: m.slot, name: m.name, text: cleanChat(m.text), color: m.color }); return;
      case MSG.kick: s.error = new NetError('kicked'); setStatus('rejected'); emit('error', s.error); s.pending?.close(); return;
      default: emit('msg', m, 0);
    }
  }

  /** Guest: host's offer code → answer code (string). */
  async function join(code) {
    s.pending?.close();
    const peer = guestAttach(makePeer());
    setStatus('waiting');
    return peer.acceptOffer(code);
  }

  // ---------------------------------------------------------------- API
  Object.assign(s, {
    invite, acceptAnswer, join, broadcast, sendTo,
    /** Attach an already connected peer (tests / loopback). */
    attach(peer) { return host ? hostAttach(peer) : guestAttach(peer); },
    /** To the host (guest) or to everyone (host). */
    send(msg) { return host ? (broadcast(msg), true) : !!s.pending?.send(msg); },
    chatSend(text) {
      const tx = cleanChat(text);
      if (!tx) return false;
      if (host) { const me = s.me(); const line = { t: MSG.chat, slot: 0, name: me.name, text: tx, color: me.color }; broadcast(line); addChat(line); return true; }
      return !!s.pending?.send({ t: MSG.chat, text: tx });
    },
    /** System line (no author): host — to everyone, guest — local only. */
    notice(text) {
      const line = { t: MSG.chat, slot: -1, name: '', text: cleanChat(text), color: '4' };
      if (host) broadcast(line);
      addChat(line);
    },
    setReady(on) {
      const me = s.me();
      if (me) me.ready = !!on;
      if (host) pushLobby(); else s.pending?.send({ t: MSG.ready, ready: !!on });
    },
    kick(slot) {
      if (!host || !slot) return;
      const p = s.peers.get(slot);
      p?.send({ t: MSG.kick });
      setTimeout(() => p?.close(), 200);
      s.peers.delete(slot);
      s.players = s.players.filter((x) => x.slot !== slot);
      pushLobby();
    },
    setSettings(patch) { if (!host) return; Object.assign(s.settings, patch); pushLobby(); },
    /** Host: connected guests count (without the host). */
    guests() { return s.players.filter((p) => p.slot !== 0 && p.connected).length; },
    ping() {
      if (host) { pushLobby(); broadcast({ t: MSG.ping, ts: now() }); } else s.pending?.send({ t: MSG.ping, ts: now() });
    },
    close() {
      clearInterval(s.pingTimer);
      if (host) { for (const p of s.peers.values()) p.close(); s.peers.clear(); s.pending?.close(); }
      else s.pending?.close();
      setStatus('idle');
    },
  });
  if (pingEvery > 0) s.pingTimer = setInterval(() => s.ping(), pingEvery * 1000);
  return s;
}
