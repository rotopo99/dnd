// Seeded PRNG (mulberry32). Pure, no DOM: works in browser and Node.
// createRng(seed) -> rng() in [0,1) with helpers rng.int(min,max), rng.pick(arr), rng.seed.

export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const s = String(value);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function createRng(seed = 1) {
  let a = hashSeed(seed);
  const rng = function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Integer in [min, max] inclusive. */
  rng.int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  /** Random element of a non-empty array (undefined for empty). */
  rng.pick = (arr) => (arr.length ? arr[Math.floor(rng() * arr.length)] : undefined);
  /** Current internal state (to snapshot / restore). */
  rng.getState = () => a;
  rng.setState = (s) => { a = s >>> 0; };
  rng.seed = seed;
  return rng;
}
