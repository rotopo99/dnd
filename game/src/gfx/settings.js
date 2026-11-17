// Graphics settings (docs/specs/3d.md §3): 3D / 2D, «Снизить эффекты», «Снизить движение», brightness.
// Stored in localStorage; `?gfx=2d|3d` in the URL overrides the mode (tests: old scenarios run in 2D by default under
// automation — navigator.webdriver — new ones pass ?gfx=3d).
import { GFX } from '../data/gfx.js';
import { hasWebGL2, softwareGL } from './gl.js';
import { RULES } from '../data/combat.js';

let prefs = null;
export function gfxPrefs() {
  if (prefs) return prefs;
  prefs = { ...GFX.defaults };
  try { Object.assign(prefs, JSON.parse(globalThis.localStorage?.getItem(GFX.storageKey) || '{}')); } catch { /* private mode */ }
  return prefs;
}
export function setGfxPref(k, v) {
  gfxPrefs()[k] = v;
  if (k === 'mode') session = null; // an explicit choice beats ?gfx= for the rest of the session
  if (k === 'engine') engineUrl = null; // same for ?engine=
  try { globalThis.localStorage?.setItem(GFX.storageKey, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/** metric-combat.md: stage of metric rules for new battles (settings «Бой: по клеткам» -> 0). */
export const combatMetric = () => (gfxPrefs().metric === 'off' ? 0 : RULES.metric);

let session;
const urlMode = () => {
  if (session === undefined) { try { session = new URLSearchParams(globalThis.location?.search || '').get('gfx'); } catch { session = null; } }
  return session;
};
let engineUrl;
/** threejs-migration.md: 3D backend 'three' (Three.js, game/src/three/) | 'old' (own WebGL2, gfx/*). `?engine=` beats the
 *  setting; 'three' falls back to 'old' while / if Three.js did not load (caller checks game.gfx.three). */
export function gfxEngine() {
  if (engineUrl === undefined) { try { engineUrl = new URLSearchParams(globalThis.location?.search || '').get('engine'); } catch { engineUrl = null; } }
  if (engineUrl === 'old' || engineUrl === 'three') return engineUrl;
  return gfxPrefs().engine === 'old' ? 'old' : 'three';
}
let broken = false; // shader error / lost context: 2D until reload
export const markGfxBroken = () => { broken = true; };
export const gfxBroken = () => broken;

/** Effective mode: '3d' | '2d'. */
export function gfxMode() {
  if (broken || !hasWebGL2()) return '2d';
  const u = urlMode();
  if (u === '2d' || u === '3d') return u;
  const m = gfxPrefs().mode;
  if (m === '2d' || m === '3d') return m;
  // auto: 3D on real GPUs; automation (old 2D tests) and software GL (slow) — 2D
  if (globalThis.navigator?.webdriver || softwareGL()) return '2d';
  return '3d';
}
