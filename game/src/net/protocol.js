// Co-op protocol (docs/specs/multiplayer.md §6): message types, versions, hello check, framing / chunking.
// Pure, no DOM. Messages are JSON objects {t, n, ...}; frames on the DataChannel are JSON strings.
import { SAVE_VERSION } from '../save.js';
import { NET } from '../data/net.js';

export const PROTO = 1;
/** Bumped with releases: guests with another version are rejected (no cross-version play). */
export const GAME_VERSION = '0.12';

/** Message types (t). */
export const MSG = {
  hello: 'hello', welcome: 'welcome', reject: 'reject', lobby: 'lobby', chat: 'chat', ready: 'ready', kick: 'kick',
  battleStart: 'battleStart', battleEnd: 'battleEnd', cmd: 'cmd', nack: 'nack', hash: 'hash', fullState: 'fullState',
  snap: 'snap', delta: 'delta', move: 'move', pos: 'pos', vote: 'vote', lootRoll: 'lootRoll', heroSync: 'heroSync',
  ping: 'ping', pong: 'pong', chunk: 'chunk',
  // stage 3: co-op world — guest's request to the host (roam interaction), mirrored modal + votes, guest's hero edits
  act: 'act', modal: 'modal', heroEdit: 'heroEdit',
};

/** Required fields by type (validate()). */
const FIELDS = {
  hello: ['proto', 'gameVer', 'saveVer', 'name', 'hero'],
  welcome: ['slot', 'token', 'players'],
  reject: ['reason'],
  lobby: ['players'],
  chat: ['text'],
  ready: ['ready'],
  battleStart: ['seed', 'setup'],
  cmd: ['action'],
  nack: [],
  hash: ['turn', 'h'],
  fullState: ['turn', 'state'],
  ping: ['ts'],
  pong: ['ts'],
  chunk: ['id', 'i', 'of', 'data'],
  snap: ['scene', 'save'],
  delta: [],
  move: ['x', 'y'],
  pos: ['list'],
  vote: ['promptId', 'optId'],
  lootRoll: ['itemId', 'choice'],
  heroSync: ['hero'],
  act: ['kind'],
  modal: ['id'],
  heroEdit: ['hero'],
};

/** Local version triple (tests may override). */
export const localVersion = () => ({ proto: PROTO, gameVer: GAME_VERSION, saveVer: SAVE_VERSION });
export const versionLabel = (v) => `${v.gameVer}/s${v.saveVer}/p${v.proto}`;

/** Hero fields that travel in hello (save format of the hero, multiplayer.md §1). */
const HERO_FIELDS = ['race', 'cls', 'path', 'name', 'level', 'xp', 'anyStat', 'talents', 'stats', 'skills', 'proficiencies', 'phobia',
  'equipment', 'look', 'avatar', 'backstory', 'flex', 'origin', 'alignment', 'gadget',
  // stage 4: the guest's copy of his co-op hero (backpack, money, level-up state) comes back on the next join
  'bg', 'bag', 'items', 'credits', 'activeCombat', 'asi', 'pendingAsi', 'pendingTalents', 'levelNews', 'uniqueTalent', 'hp', 'mrl', 'judgeMarks', 'withdrawal'];

export function normalizeHero(h) {
  if (!h || typeof h !== 'object') return null;
  const out = {};
  for (const k of HERO_FIELDS) if (h[k] !== undefined && h[k] !== null) out[k] = h[k];
  out.name = String(out.name || '').slice(0, 24);
  return out;
}

/** Hero is usable by this game data (race / class / path exist). */
export function heroValid(data, h) {
  if (!h || !data.RACES?.[h.race] || !data.CLASSES?.[h.cls]) return false;
  return !h.path || data.CLASSES[h.cls].paths.some((p) => p.id === h.path);
}

export function makeHello({ name, hero, version = localVersion(), rejoinToken }) {
  return { t: MSG.hello, ...version, name: String(name || '').slice(0, 24), hero: normalizeHero(hero), ...(rejoinToken ? { rejoinToken } : {}) };
}

/** Host side: null — ok, else { reason, mine, theirs } (mine/theirs from the guest's point of view). */
export function checkHello(msg, version = localVersion()) {
  if (!msg || msg.proto !== version.proto || msg.gameVer !== version.gameVer || msg.saveVer !== version.saveVer) {
    return { reason: 'version', mine: msg ? versionLabel(msg) : '?', theirs: versionLabel(version) };
  }
  return null;
}

/** Structural check of an incoming message: { ok, error }. */
export function validate(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return { ok: false, error: 'shape' };
  if (!MSG[msg.t]) return { ok: false, error: 'type' };
  for (const f of FIELDS[msg.t] || []) if (msg[f] === undefined) return { ok: false, error: `field:${f}` };
  if (msg.t === MSG.chat && (typeof msg.text !== 'string' || msg.text.length > NET.chatMax)) return { ok: false, error: 'chat' };
  return { ok: true };
}

/** Chat text: one line, trimmed, ≤ chatMax. */
export const cleanChat = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, NET.chatMax);

let chunkSeq = 0;
/** Message → frames (strings). Long ones are cut into chunk messages. */
export function packMessage(msg, limit = NET.chunk) {
  const s = JSON.stringify(msg);
  if (s.length <= limit) return [s];
  const id = `${Date.now().toString(36)}${(chunkSeq++).toString(36)}`;
  const of = Math.ceil(s.length / limit);
  const out = [];
  for (let i = 0; i < of; i++) out.push(JSON.stringify({ t: MSG.chunk, id, i, of, data: s.slice(i * limit, (i + 1) * limit) }));
  return out;
}

/** Frame reader: push(frame) → message or null (chunk not complete / garbage). */
export function createUnpacker() {
  const parts = new Map();
  return {
    push(frame) {
      let m;
      try { m = JSON.parse(frame); } catch { return null; }
      if (!m || m.t !== MSG.chunk) return m;
      if (!validate(m).ok || m.of > 1000) return null;
      let p = parts.get(m.id);
      if (!p) { p = { got: 0, data: new Array(m.of) }; parts.set(m.id, p); }
      if (p.data[m.i] === undefined) { p.data[m.i] = m.data; p.got++; }
      if (p.got < m.of) return null;
      parts.delete(m.id);
      try { return JSON.parse(p.data.join('')); } catch { return null; }
    },
    get pending() { return parts.size; },
  };
}
