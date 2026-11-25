// Render quality (docs/perf.md): setting «Качество» auto | low | medium | high -> preset GFX.quality[level].
//   gfxQuality()           -> 'low' | 'medium' | 'high' (effective: ?quality= beats the setting; auto -> remembered level)
//   qualityPreset()        -> GFX.quality[gfxQuality()]
//   sampleFrame(now, on3d) -> called once per animation frame (three/engine.js endFrame): auto mode measures frame
//                             intervals while a 3D scene is shown and steps down a level when they stay slow.
// Under automation (navigator.webdriver) auto does not adapt: test screenshots stay deterministic (pass ?quality=).
import { GFX } from '../data/gfx.js';
import { gfxPrefs, setGfxPref } from './settings.js';
import { softwareGL } from './gl.js';

const ORDER = ['low', 'medium', 'high'];
let urlQ;
const fromUrl = () => {
  if (urlQ === undefined) { try { urlQ = new URLSearchParams(globalThis.location?.search || '').get('quality'); } catch { urlQ = null; } }
  return ORDER.includes(urlQ) ? urlQ : null;
};

export function gfxQuality() {
  const u = fromUrl();
  if (u) return u;
  const p = gfxPrefs();
  if (ORDER.includes(p.quality)) return p.quality;
  if (ORDER.includes(p.autoQ)) return p.autoQ;
  return softwareGL() && !globalThis.navigator?.webdriver ? 'low' : 'high';
}
export const qualityPreset = () => GFX.quality[gfxQuality()];

/** Choosing a level in the settings; back to auto forgets the measured level (starts from the top again). */
export function setQuality(level) {
  setGfxPref('quality', level);
  if (level === 'auto') setGfxPref('autoQ', null);
}

// auto tuner: frame intervals of consecutive frames with a 3D scene (a gap / 2D frame restarts the warm-up)
const A = { since: 0, last: 0, dts: [], level: null };
export function sampleFrame(now, on3d) {
  const p = gfxPrefs();
  if (!on3d || p.quality !== 'auto' || fromUrl() || globalThis.navigator?.webdriver) { A.since = 0; A.last = 0; A.dts.length = 0; return; }
  const C = GFX.quality.auto, cur = gfxQuality();
  if (!A.since || A.level !== cur) { A.since = now; A.last = now; A.level = cur; A.dts.length = 0; return; } // new level: warm-up again
  const dt = now - A.last;
  A.last = now;
  if (dt > 1000) { A.since = now; A.dts.length = 0; return; } // tab in the background / scene load
  if (now - A.since < C.warm * 1000) return;
  A.dts.push(dt);
  if (now - A.since < (C.warm + C.window) * 1000 || A.dts.length < C.minFrames) return;
  const s = [...A.dts].sort((a, b) => a - b), p80 = s[Math.floor(s.length * 0.8)];
  A.dts.length = 0; A.since = now - C.warm * 1000; // next window right away
  const i = ORDER.indexOf(cur);
  if (p80 > 1000 / C.downFps && i > 0) setGfxPref('autoQ', ORDER[i - 1]);
}
