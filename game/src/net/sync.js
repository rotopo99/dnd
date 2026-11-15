// Battle sync for co-op (multiplayer.md §2): state hash every turn, full state snapshot / restore on desync.
// Pure, no DOM: works in the browser and in Node (tools/test.mjs).

/** 32-bit FNV-1a of a string → unsigned int. */
export function fnv32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Canonical serialisation of what matters for the outcome: turn, rng, units, battlefield counters. */
export function canonBattle(b) {
  const t = b.turn;
  const parts = [b.round, b.turnIndex, b.winner || '', b.rng.getState(), t ? `${t.unitId},${t.move},${t.actions},${t.bonus}` : '-'];
  for (const u of b.units) {
    const st = (u.statuses || []).map((s) => `${s.id}:${s.turns ?? ''}`).join('.');
    parts.push(`${u.id},${u.x},${u.y},${u.hp},${u.mrl},${u.enr ?? u.energy ?? ''},${+!!u.dead}${+!!u.down}${+!!u.removed},${u.shield?.value || 0},${st}`);
  }
  parts.push(`${b.zones?.length || 0},${b.traps?.length || 0},${b.drops?.length || 0},${b.surfaces?.size ?? ''}`);
  return parts.join('|');
}

export const battleHash = (b) => fnv32(canonBattle(b));

// Keys that are not state (functions, shared game data, caches) — kept from the local battle on restore.
const SKIP = new Set(['data', 'rng', 'onEvent', 'byId', 'statusCache', 'reachCache', 'log']);

/**
 * Graph → JSON-safe value. Keeps shared references and cycles ({$r}), Map / Set, typed arrays, ±Infinity / NaN.
 * Functions are dropped.
 */
function encodeGraph(root) {
  const ids = new Map();
  let next = 0;
  const enc = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (ids.has(v)) return { $r: ids.get(v) };
    const id = next++;
    ids.set(v, id);
    if (ArrayBuffer.isView(v)) return { $i: id, $t: v.constructor.name, a: Array.from(v) };
    if (Array.isArray(v)) return { $i: id, $a: v.map((x) => { const e = enc(x); return e === undefined ? null : e; }) };
    if (v instanceof Map) return { $i: id, $m: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    if (v instanceof Set) return { $i: id, $s: [...v].map(enc) };
    const o = { $i: id, $o: {} };
    for (const k of Object.keys(v)) { const e = enc(v[k]); if (e !== undefined) o.$o[k] = e; }
    return o;
  };
  return enc(root);
}

function decodeGraph(root) {
  const byId = new Map();
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if ('$n' in v) return Number(v.$n);
    if ('$r' in v) return byId.get(v.$r);
    if (v.$t) { const T = globalThis[v.$t]; const out = new T(v.a); byId.set(v.$i, out); return out; }
    if (v.$a) { const out = []; byId.set(v.$i, out); for (const x of v.$a) out.push(dec(x)); return out; }
    if (v.$m) { const out = new Map(); byId.set(v.$i, out); for (const [k, x] of v.$m) out.set(dec(k), dec(x)); return out; }
    if (v.$s) { const out = new Set(); byId.set(v.$i, out); for (const x of v.$s) out.add(dec(x)); return out; }
    const out = {};
    byId.set(v.$i, out);
    for (const k of Object.keys(v.$o || {})) out[k] = dec(v.$o[k]);
    return out;
  };
  return dec(root);
}

/** Full battle state → JSON string (multiplayer.md: fullState). */
export function snapshotBattle(b) {
  const s = {};
  for (const k of Object.keys(b)) if (!SKIP.has(k)) s[k] = b[k];
  return JSON.stringify({ s: encodeGraph(s), rng: b.rng.getState() });
}

/** Replace the battle state in place (b keeps its identity, data, rng function and event hook). */
export function restoreBattle(b, json) {
  const { s, rng } = typeof json === 'string' ? JSON.parse(json) : json;
  const st = decodeGraph(s);
  for (const k of Object.keys(b)) if (!SKIP.has(k)) delete b[k];
  Object.assign(b, st);
  b.byId = {};
  for (const u of b.units) b.byId[u.id] = u;
  b.rng.setState(rng);
  b.statusCache = {};
  b.reachCache = null;
  return b;
}
