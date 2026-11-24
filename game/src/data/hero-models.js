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
  tint: { hair: /^Hair/, hairGain: 12, cloth: /(Main|Suit|Shirt)$/, clothGain: 5, coat: /^(ApronCloth|VestPlate|UshankaTop|RagsScarf)$/, coatGain: 4, pants: /^(fieldPants|RagsShorts)$/, pantsGain: 4 },
  // battle action (gfx/anim.js act kinds) -> clip; the clip is sped up to the action length within clipSpeed
  clip: { swing: 'attack_melee', shoot: 'attack_shoot', cast: 'cast', throw: 'attack_melee', use: 'cast' },
  clip2h: { swing: 'attack_2h', shoot: 'shoot_2h', throw: 'attack_2h' }, // two-handed weapon: action clips (others as clip)
  loop2h: { idle: 'idle_2h', walk: 'walk_2h', run: 'run_2h' },            // two-handed weapon: locomotion loops (crouch_walk stays)
  clipSpeed: [0.7, 2.6],
  walkSpeed: 1.4, runSpeed: 3.4, runAt: 2.3, // m/s of the clips at timeScale 1; faster display motion -> run
  fade: 0.18,
  outline: 0x14141c, outlineTeam: 0.3, outlineTeamNpc: 0.08,       // hull = dark + 30 % team colour (as the procedural hull)
  flash: 0.9,                                // hit flash -> emissive white x this
  keepUnseen: 5,                             // s an off-screen (culled) character stays built
  physics: { off: 0, low: 0.5, normal: 1 },  // settings «Физика тела» -> spring bones weight
  // weapon in hand (three/weapons.js): gfx/gear3d.js weaponKind -> category (missing / null — empty hand)
  weapon: {
    cat: { knife: 'blade', sword: 'blade', sabre: 'blade', katana: 'blade', cyberblade: 'blade', axe: 'blade', hammer: 'blunt', club: 'blunt',
      polearm: 'staff', wand: 'staff', bow: 'staff', pistol: 'pistol', smg: 'pistol', rifle: 'rifle', mg: 'rifle', crossbow: 'rifle', launcher: 'rifle', laser: 'rifle', melta: 'rifle' },
    glow: ['cyberblade', 'laser', 'melta', 'wand'], // kinds with a glowing part
    bone: 'rightHand', grip: [0, 0.07, -0.025],      // m in the hand bone (y: wrist -> knuckles; -x: thumb side; -z: palm)
    // two-handed: categories / kinds held in both hands — *_2h clips, mounted on the model meta grip2h (tools/blender README)
    twoHand: { cats: ['rifle', 'staff'], kinds: ['hammer'] },
    carry2h: { staff: -Math.PI / 2, blunt: Math.PI / 2 }, // rad about x: shaft onto the rifle axis in the *_2h loops (staff: orb over the shoulder, hammer: head low)
    carry2hNative: ['attack_2h'], carryLerp: 14,           // clips holding the shaft natively; ease 1/s
    carry2hPos: [0.017, 0.03, 0],                          // carry: shaft between the fists (the rifle frame puts the support palm ~7 cm above the grip axis)
    holster: { bone: 'hips', pos: [-0.2, -0.08, 0.02], rot: [0, 0, Math.PI * 0.94] }, // u.hide.weapon: stowed at the right hip
    scale: 1.2,                                      // stylized oversize, readable at battle zoom
    color: { metal: 0xb4bcc8, dark: 0x343a46, wood: 0x7a5232, grip: 0x2a2320, glow: 0x4fd0ff },
  },
  // key characters / crowd NPCs as assembled Blender models (npc_<id>.glb; three/party.js npcSpec). sex: face atlas set.
  npc: {
    on: true,
    sex: { lox: 'm', arbitrazh: 'm', ladov: 'm', cyberpriest: 'f', trader: 'f', settler: 'm', guard: 'm' },
    byNpc: { lox: 'lox', 'lox-clone-7': 'lox', judge: 'arbitrazh', 'great-collector': 'ladov', 'cyber-priest': 'cyberpriest' }, // data/npcs.js id
    byEnemy: { 'ai-lox-clone': 'lox', 'boss-judge-avatar': 'arbitrazh', 'boss-great-collector': 'ladov', 'cyber-priest': 'cyberpriest', 'boss-cyber-priest-prime': 'cyberpriest' },
    // QA v42 L3: low-contrast key models — colour gain, flat emissive lift (reads in dusk / fog), light rim instead of the
    // dark hull (rim palette key lerped over the team hull by rimK, hull thickness x grow)
    lift: { ladov: { gain: 1.3, emissive: 0.07, rim: '5', rimK: 0.7, grow: 1.5 } },
    // roam NPCs without a key model (team npc, human): by role; deterministic tint variety by the npc id
    crowd: { races: ['human'], trade: 'trader', guardFactions: ['aiParty', 'tinBrotherhood', 'warprom', 'renegades'], guard: 'guard', other: 'settler' },
    // QA v42 L2: per-role palettes [cloth (shirt / jacket), coat (apron / vest / hat / scarf)], pants — hue and value spread so the
    // crowd is not one cream-gold mass (no light / amber keys: lumTint gain washes them out to cream); skin / hair by other bits of the id hash. Palette keys (assets/sprites.js PALETTE).
    crowdTint: {
      trade: [['g', '8'], ['l', '6'], ['o', 'm'], ['i', 'e'], ['7', 'j'], ['1', 'c'], ['c', '3'], ['k', '7']],
      guard: [['2', 'l'], ['l', '3'], ['g', '3'], ['k', '2'], ['6', 'm'], ['1', 'd'], ['3', 'g']],
      other: [['m', '7'], ['8', 'k'], ['f', '6'], ['j', 'g'], ['d', 'm'], ['3', 'o'], ['6', 'i'], ['n', '2']],
      skin: ['9', '9', '8', '7'],
      pants: ['1', '2', '6', 'l', 'g', 'm', '3'],
      hair: ['0', '2', '7', '8', '6', '1', '5'],
    },
  },
};
