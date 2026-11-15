// WebRTC transport without a server (multiplayer.md §4): RTCPeerConnection + one DataChannel 'game',
// manual signalling through invite codes `RSL1.` (JSON {v, type, sdp, ice} → deflate-raw → base64url).
// No trickle ICE: we wait for iceGatheringState=complete (≤ NET.iceWait s) so all candidates fit in one code.
import { NET } from '../data/net.js';
import { packMessage, createUnpacker } from './protocol.js';

export const CODE_PREFIX = 'RSL1.';
const CODE_V = 1;
const RAW_MARK = '!'; // not in the base64url alphabet: «uncompressed» payload (no CompressionStream)

/** Error with a code → text 'net.err.<code>' (scenes show it). */
export class NetError extends Error {
  constructor(code, info = {}) { super(code); this.code = code; this.info = info; }
}

// ---------------------------------------------------------------- base64url / compression
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new NetError('badCode');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
export const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Object → `RSL1.<base64url(deflate-raw(JSON))>` (or `RSL1.!<base64url(JSON)>` without CompressionStream). */
export async function encodeCode(obj, { compress = canCompress() } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (!compress) return CODE_PREFIX + RAW_MARK + b64url(bytes);
  return CODE_PREFIX + b64url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

/** Inverse of encodeCode. Whitespace / line breaks from messengers are ignored. Throws NetError('badCode'). */
export async function decodeCode(code) {
  const s = String(code || '').replace(/\s+/g, '');
  if (!s.startsWith(CODE_PREFIX)) throw new NetError('badCode');
  let body = s.slice(CODE_PREFIX.length);
  const raw = body.startsWith(RAW_MARK);
  if (raw) body = body.slice(1);
  let bytes;
  try {
    bytes = unb64url(body);
    if (!raw) {
      if (!canCompress()) throw new NetError('badCode');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new NetError('badCode');
  }
}

// ---------------------------------------------------------------- SDP slimming (DataChannel only)
const KEEP = /^(v=|o=|s=|t=|c=|m=application|a=(group|msid-semantic|ice-ufrag|ice-pwd|ice-options|fingerprint|setup|mid|sctp-port|max-message-size|sctpmap))/;

/** SDP → { sdp (without candidates and media noise), ice: ['candidate:…'] } (TCP candidates dropped). */
export function slimSdp(sdp) {
  const lines = String(sdp).split(/\r?\n/).filter(Boolean);
  const ice = [];
  const keep = [];
  for (const l of lines) {
    if (l.startsWith('a=candidate:')) { if (!/ tcp /i.test(l)) ice.push(l.slice(2)); continue; }
    if (KEEP.test(l)) keep.push(l);
  }
  return { sdp: keep.join('\n'), ice };
}

/** Inverse: candidates go back at the end of the application section. */
export function fullSdp(sdp, ice = []) {
  const lines = String(sdp).split(/\r?\n/).filter(Boolean);
  return [...lines, ...ice.map((c) => `a=${c}`), 'a=end-of-candidates', ''].join('\r\n');
}

export async function encodeDescription(desc) {
  const { sdp, ice } = slimSdp(desc.sdp);
  return encodeCode({ v: CODE_V, type: desc.type, sdp, ice });
}

/** Code → RTCSessionDescriptionInit; need — 'offer' | 'answer'. */
export async function decodeDescription(code, need) {
  const o = await decodeCode(code);
  if (!o || o.v !== CODE_V || typeof o.sdp !== 'string' || !Array.isArray(o.ice)) throw new NetError('badCode');
  if (need && o.type !== need) throw new NetError('wrongType', { need });
  return { type: o.type, sdp: fullSdp(o.sdp, o.ice) };
}

// ---------------------------------------------------------------- ICE servers
export function defaultIceServers() {
  let stun = NET.stun;
  try { const v = globalThis.localStorage?.getItem(NET.stunKey); if (v !== null && v !== undefined) stun = v; } catch { /* private mode */ }
  return stun ? [{ urls: stun }] : [];
}
export function setStun(url) {
  try { globalThis.localStorage?.setItem(NET.stunKey, String(url || '').trim()); } catch { /* private mode */ }
}
export function currentStun() { return defaultIceServers()[0]?.urls || ''; }

function waitIce(pc, sec) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(to); pc.removeEventListener('icegatheringstatechange', on); res(); };
    const on = () => { if (pc.iceGatheringState === 'complete') done(); };
    const to = setTimeout(done, sec * 1000);
    pc.addEventListener('icegatheringstatechange', on);
  });
}

/**
 * createPeer({ iceServers }) → peer:
 *  host: await createOffer() → code; await acceptAnswer(code)
 *  guest: await acceptOffer(code) → answer code
 *  send(msg) (objects, chunked), close(); callbacks onOpen(), onMessage(msg), onClose(), onError(NetError), onState(state)
 *  state: new → offering / answering → connecting → open → closed | failed
 */
export function createPeer({ iceServers = defaultIceServers(), connectTimeout = NET.connectTimeout, iceWait = NET.iceWait } = {}) {
  if (typeof RTCPeerConnection === 'undefined') throw new NetError('noRtc');
  const pc = new RTCPeerConnection({ iceServers });
  const unpack = createUnpacker();
  let timer = null;
  const peer = {
    pc, channel: null, state: 'new',
    onOpen: null, onMessage: null, onClose: null, onError: null, onState: null,
    async createOffer() {
      bind(pc.createDataChannel('game', { ordered: true }));
      setState('offering');
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc, iceWait);
      return encodeDescription(pc.localDescription);
    },
    async acceptOffer(code) {
      const desc = await decodeDescription(code, 'offer');
      pc.ondatachannel = (e) => bind(e.channel);
      setState('answering');
      await pc.setRemoteDescription(desc);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc, iceWait);
      arm();
      return encodeDescription(pc.localDescription);
    },
    async acceptAnswer(code) {
      const desc = await decodeDescription(code, 'answer');
      if (pc.signalingState !== 'have-local-offer') throw new NetError('state');
      await pc.setRemoteDescription(desc);
      arm();
    },
    send(msg) {
      const ch = peer.channel;
      if (!ch || ch.readyState !== 'open') return false;
      for (const f of packMessage(msg)) ch.send(f);
      return true;
    },
    get open() { return peer.channel?.readyState === 'open'; },
    close() {
      clearTimeout(timer);
      try { peer.channel?.close(); } catch { /* already closed */ }
      try { pc.close(); } catch { /* already closed */ }
      if (peer.state !== 'failed') setState('closed');
    },
  };
  function setState(s) { if (peer.state === s) return; peer.state = s; peer.onState?.(s); }
  function fail(code) {
    if (peer.state === 'failed' || peer.state === 'closed') return;
    clearTimeout(timer);
    setState('failed');
    peer.onError?.(new NetError(code));
    try { pc.close(); } catch { /* ignore */ }
  }
  function arm() {
    setState('connecting');
    clearTimeout(timer);
    timer = setTimeout(() => { if (!peer.open) fail('timeout'); }, connectTimeout * 1000);
  }
  function bind(ch) {
    peer.channel = ch;
    ch.onopen = () => { clearTimeout(timer); setState('open'); peer.onOpen?.(); };
    ch.onclose = () => { const was = peer.state; if (was === 'open') { setState('closed'); peer.onClose?.(); } };
    ch.onmessage = (e) => { const m = unpack.push(String(e.data)); if (m) peer.onMessage?.(m); };
  }
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'failed') { if (peer.state === 'open') { setState('closed'); peer.onClose?.(); } else fail('failed'); }
    else if (s === 'disconnected' && peer.state === 'open') peer.onState?.('disconnected');
  };
  return peer;
}

/** In-memory pair of peers with the same interface (tests, no WebRTC): link() → [a, b]. */
export function createLoopPair() {
  const mk = () => ({ state: 'open', open: true, onOpen: null, onMessage: null, onClose: null, onError: null, onState: null, other: null, unpack: createUnpacker(),
    send(msg) { if (!this.open || !this.other?.open) return false; for (const f of packMessage(msg)) { const m = this.other.unpack.push(f); if (m) this.other.onMessage?.(m); } return true; },
    close() { if (!this.open) return; this.open = false; this.state = 'closed'; const o = this.other; if (o?.open) { o.open = false; o.state = 'closed'; o.onClose?.(); } } });
  const a = mk(), b = mk();
  a.other = b; b.other = a;
  return [a, b];
}
