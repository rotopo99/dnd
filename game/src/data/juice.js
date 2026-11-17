// Battle "juice" numbers (docs/research/premium-look.md, items 1–2, 9): hit-stop, camera shake, damage numbers, camera
// accent of big abilities. Visual only — battle logic never reads these. Colours are palette keys (docs/STYLE.md).
export const JUICE = {
  fps: 60, // hit-stop frames are counted at this rate
  // hit-stop: frames the view freezes (unit animations, camera; rules / AI / input keep running)
  hitStop: { crit: 4, kill: 3, heavy: 2 },
  heavyShare: 0.25, // a hit for >= this share of max HP is «heavy»
  // camera shake: [amplitude 2D px, seconds]; 3D — the amplitude x m3d metres per 2D px
  shake: { crit: [3, 0.18], kill: [4, 0.22], heavy: [2, 0.12], blast: [4, 0.25], phase: [4, 0.25], collapse: [4, 0.3], small: [2, 0.12] },
  m3d: 0.022, // 4 px -> ~0.09 m
  shakeHz: [31, 37], // two incommensurate frequencies (x, y), damped linearly
  // camera accent of big abilities (area, overcast, energy cost >= bigCost): zoom in/hold/out (s), peak zoom, slow motion
  accent: { zoom: 1.08, in: 0.4, hold: 0.15, out: 0.35, slow: 0.2, slowK: 0.35, bigCost: 3 },
  // floating numbers: pop (scale from -> 1, ease-out-back over popT s), drift px over driftT s, fade the last fadeT s
  pop: { from: 1.4, popT: 0.12, drift: 40, driftT: 0.8, life: 1.1, fadeT: 0.3, px: 18, critPx: 26, textPx: 15, stack: 0.25 },
  // hit flash on the model: frames of full bone-white (then the soft fade of d.flash)
  flashFrames: 1,
  // damage type -> palette key (HP damage); MRL damage, heals, temp HP have their own keys
  dmgColor: {
    pierce: 'c', blunt: 'c', slash: 'c', fire: 'e', electric: 'b', energy: 'h', cyber: 'h', toxin: 'j',
    psychic: 'n', cringe: 'n', proxy: 'a',
  },
  color: { hp: 'c', mrl: 'n', heal: 'j', healMrl: 'f', tmp: 'h', block: '4', miss: '4' },
};
