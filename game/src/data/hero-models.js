// GLB heroes on the Three.js path (docs/specs/threejs-migration.md §6, stage 3): which units get a Blender character
// (three/party.js) and how the appearance editor (ui/look-data.js) maps onto the GLB parts of tools/blender
// (body_<sex>, hair_<style>_<sex>, outfit_<outfit>_<sex>). Everything else keeps the procedural template.
export const HERO_MODELS = {
  on: true,
  teams: ['heroes'],                 // unit teams with GLB characters (party, companions, other players); npc — later
  races: ['human', 'tekhonok', 'cringegon', 'mutant-plant', 'mutant-beast'], // robots / skeletons / spirits stay procedural
  xSex: 'm',                         // gender 'x' (not set) -> this body
  height: { f: 1.674, m: 1.79 },     // fallback when the .json meta is missing (m)
  // editor hair (OPT.hair) -> GLB style; null — bald (no hair part)
  hair: { bald: null, crop: 'short', short: 'short', fringe: 'bob', long: 'long', tail: 'ponytail', bun: 'ponytail', mohawk: 'spiky', spiky: 'spiky', dreads: 'long', afro: 'bob' },
  hairDefault: 'short',
  // editor outfit (OUTFITS id) -> GLB outfit; 'auto' — by the armour type
  outfit: { wanderer: 'field', scout: 'field', warden: 'uniform', bulwark: 'uniform', cultist: 'rags', pirate: 'rags', technician: 'cyber', tin: 'uniform', renegade: 'rags' },
  armor: { cloth: 'field', light: 'field', medium: 'uniform', heavy: 'uniform', mech: 'cyber' },
  // body shape keys (Blender sliders) from the editor look: key -> [look field, multiplier]
  shape: { bust: ['bust', 1], hips: ['hips', 1], shoulders: ['shoulders', 1], height: ['height', 1] },
  build: { lean: -1, normal: 0, sturdy: 1 },
  // tints: the texture is turned to luminance x palette colour x gain (gain ~ 1 / mean luminance of the texture)
  tint: { hair: /^Hair/, hairGain: 12, cloth: /(Main|Suit|Shirt)$/, clothGain: 5 },
  // battle action (gfx/anim.js act kinds) -> clip; the clip is sped up to the action length within clipSpeed
  clip: { swing: 'attack_melee', shoot: 'attack_shoot', cast: 'cast', throw: 'attack_melee', use: 'cast' },
  clipSpeed: [0.7, 2.6],
  walkSpeed: 1.4, runSpeed: 3.4, runAt: 2.3, // m/s of the clips at timeScale 1; faster display motion -> run
  fade: 0.18,
  outline: 0x14141c, outlineTeam: 0.3,       // hull = dark + 30 % team colour (as the procedural hull)
  flash: 0.9,                                // hit flash -> emissive white x this
  keepUnseen: 5,                             // s an off-screen (culled) character stays built
  physics: { off: 0, low: 0.5, normal: 1 },  // settings «Физика тела» -> spring bones weight
};
