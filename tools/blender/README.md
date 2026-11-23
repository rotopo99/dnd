# Blender pipeline (headless `bpy`) -> GLB

Models of the game are built by scripts; nothing is hand-modelled. Output: `game/assets/models/`, previews: `tools/out/blender-*.png`.

## Setup
```
python3.13 -m venv .venv && .venv/bin/pip install bpy==5.3.0     # ~300 MB, venv is git-ignored (or set BPY_VENV)
NEED_GL=1 tools/blender/run.sh build_all.py                       # everything (xvfb-run needed only for preview renders)
tools/blender/run.sh build_all.py --only body --no-preview        # fast, no GL (a few seconds)
```
Env: `QUICK=1` (one preview view), `HAIR_STYLES=a,b`, `OUTFITS=a,b`, `PRESETS=name,name`.
Options: `--only faces|body|hair|outfit|preset|npc`, `--sex male|female`, `--no-preview`; env `NPCS=lox,guard` limits the NPC set.
EEVEE previews run on software GL under `xvfb-run` (first render compiles shaders, ~1 min).

## Modules
| file | what |
|---|---|
| `skeleton.py` | proportions (MALE/FEMALE), VRM-humanoid bone table (T-pose, +X = character's left, front = -Y in Blender = +Z in glTF), armature; leg stretch `LEG` (env `LEG_STRETCH`, default 1.17): `zmap/zinv`, `stretch_mesh`, `stretch_bones`, `height_m` |
| `bodymesh.py` | skin-modifier graph -> subdivision (body lvl 2, hands lvl 1) |
| `head.py` | anime head (deformed UV sphere, planar face UV, ears, nose), emotion shape keys |
| `face_atlas.py` | procedural face atlas (eyes+iris+highlights, brows, mouth, blush, nose), 6 expressions, face-shadow SDF map |
| `rig.py` | assembles body+hands+head, automatic weights (heat) with nearest-bone fallback, body shape keys |
| `sculpt.py` | analytic sculpt pass on the skin body (hourglass waist/hips, bust, glutes, calves, clavicles, pecs...) + smoothing; weights smoothed after heat |
| `hair.py` | 6 styles: `long bob short ponytail twin spiky` (cap + V-tipped lock sheets with ridges + bangs + tapered clumps, tip-gradient texture with anime ring highlight, spring chains) |
| `clothes.py` | 4 outfits `field uniform cyber rags`: decimated shells with snapped hems (trim bands sliced + kept out of decimation), noise/crease folds, weave/knit/leather textures, A-line pleated skirt conformed to the body (`BodyRadius`) with flared, turned-up hem and 8x2 spring bones (`skirt_k_q`), coat tails draped (`drape`), layer resolve (`push_out`: skirt > coat > trousers > body), rags: clean cuts + deliberate torn tongues (`tatter`), glowing cyber seams |
| `animsheet.py`, `animsheet_pack.py`, `face_check.py` | motion frame renders -> `tools/out/blender-anim-*.png/.gif`; expression close-ups -> `blender-face-*.png` |
| `anim.py` | procedural FK clips (leg lengths read from the stretched armature; shoulder raise `Ls/Rs`; `ground_y=0` keeps feet in place); two-handed clips: arms by 2-bone IK to a weapon frame (`ik2h`, grip `gx gy gz` in hs units from the upper chest, `w_yaw w_pitch w_roll`, `w_staff`, `w_sup` = support-hand distance), forearm takes 55 % of the wrist twist; `GRIP2H` = weapon frame in the `rightHand` bone |
| `npc.py` | key characters / crowd NPCs (`NPCS`): base outfit with a palette override (`build_outfit(pal=, extra=)`) + extras in the raw layout: coat torso, A-line coat / robe tail with spring bones `coat_k_q` and a front slit, hood (head -> upperChest weights), apron (hips -> both thighs), rigid head gear joined into `Headgear` (visor, judge mask / cap, officer cap, helmet, ushanka, goggles, choir grille, cable halo; fitted around head + hair `hat_fit`), body gear (mantle, seal, medals, plate vest, satchel); `build(nid)` |
| `weaponcheck.py`, `npccheck.py` | `blender-2h-<s>-<rifle|staff>.png` (game-like weapon on `GRIP2H`), `blender-npcpose-<id>.png` (rest + clip frames) |
| `posecheck.py` | review sheet: rest front/side/back + clip frames -> `tools/out/blender-pose-<s>-<hair>-<outfit>.png` (`NEED_GL=1 run.sh posecheck.py female long uniform walk:8:three,sit:10:side`) |
| `export.py`, `build_all.py`, `preview.py` | export, orchestration, toon+outline preview |

## Output files (`game/assets/models/`)
- `body_f.glb`, `body_m.glb` - body + armature + 12 animations + shape keys.
- `hair_{long,bob,short,ponytail,twin,spiky}_{f,m}.glb`, `outfit_{field,uniform,cyber,rags}_{f,m}.glb` - parts: same armature (same bone names) + skinned meshes; bind to the body skeleton by bone name.
- `hero_{f,m}_{uniform,field,cyber,rags}.glb` - assembled presets (everything + animations).
- `npc_{lox,arbitrazh,ladov,cyberpriest,trader,settler,guard}.glb` - key characters + crowd (assembled like presets, all animations; 2.5-3.4 MB, limit 4). Meta: `npc`, `outfit` (base kind), parts `Outfit_<id>_<Part>` (`CoatTail` / `Hood` / `Headgear` / ...); coat / robe tails add spring chains `coat0..7` (bones `coat_<k>_<q>`, parent hips).
- `*.json` - meta: bone list, spring chains, expressions, animations, triangles.
- `face_{f,m}_{neutral,blink,happy,angry,sad,surprised}.png` (512 px, swap-in face atlases), `face_sdf.png` (face shadow threshold map: value = light azimuth 0..180 deg / 180 at which the texel goes into shadow; mirror for the other side).

## Contract
- Bones: VRM 1.0 humanoid names (`hips spine chest upperChest neck head leftShoulder leftUpperArm ... leftThumbMetacarpal ...`). Hair bones `hair_<chain>_<i>` (parent `head`).
- Spring bones: JSON in `springBones` (node extras of hair mesh + `.json` meta): `{name, bones[], stiffness, gravityPower, gravityDir, dragForce, hitRadius}`. Not the VRMC extension - the loader maps it.
- Shape keys (morph targets): `blink happy angry sad surprised` (face; geometry-driven, texture variants in `face_*.png` for stronger looks), `bust hips shoulders build legs_long height` (sliders, `build` -1..1 etc.). Outfits carry the same body keys (transferred).
- Materials are plain PBR (base colour / texture): the game applies its own toon shader + inverted-hull outline (see `preview.py` for the reference look: 3 bands, outline 2.5 mm).
- Animations (30 fps): `idle walk run crouch_walk talk sit idle_2h walk_2h run_2h aim_2h` loop (meta `loops`); `attack_melee attack_shoot cast hit death shrug shoot_2h attack_2h` one-shot.
  Two-handed: `idle_2h` low ready, `walk_2h` low ready, `run_2h` port arms (diagonal across the chest), `aim_2h` shouldered rifle (40 f), `shoot_2h` (20 f, recoil at f 2-5), `attack_2h` (44 f: guard -> wind-up over the right shoulder f 10-16 -> chop f 22 -> recover; staff / heavy weapon, both fists on the shaft, left hand 0.30 hs below the right).
  The hands only match a weapon mounted with the meta `grip2h` = {bone: rightHand, pos, basis}: weapon frame (game `three/weapons.js`: grip at 0, +y up / shaft, +z barrel) in the `rightHand` bone frame, `basis` = columns x_w, y_w, z_w (i.e. weapon +y = -x of the hand, +z = +y of the hand). The 1h clips keep the old `HERO_MODELS.weapon.grip`. In place (no root motion). Legs are auto-grounded.
  Cinematics clips: `talk` (90 f: open-palm beats, nods), `shrug` (36 f), `sit` (90 f: seat ~0.45-0.5 m behind the actor origin, feet stay at the origin; no chair in the model).
- Proportions: ~8 heads (male ~1.92 m, female ~1.80 m, `height_m` in the meta). Everything is authored in the raw layout and the leg band is stretched at the end of `rig.build_body`; hair / outfits are built in the raw layout (outfits on a raw proxy of the body) and mapped with the same `zmap`.
- Size: ~13.7k tris body (female; male similar), hair 1.4-2.8k, outfit 3-4k; hero GLB about 1.9-2.1 MB (limit 3), body 1.3 MB; rest-constant animation channels are not exported (each clip: hips translation + 52 bone rotations).
- Triangle count is not tuned for mobile; LOD = drop outfit/hair parts or use the lower subdivision (`build_skin(level=1)`).

## Known limits
- Face expressions are texture-painted features moved by shape keys: strong emotions look best with the `face_*` texture swap.
- Hair strands are simple wedges; physics is data-only here (the game runs the spring bones).
- Skirt: spring bones authored (8 sectors x 2), lower part also follows the thighs (front up to 97%, back 82%) to avoid cutting through; no real collision (extreme run poses may still graze it).
