# Blender pipeline (headless `bpy`) -> GLB

Models of the game are built by scripts; nothing is hand-modelled. Output: `game/assets/models/`, previews: `tools/out/blender-*.png`.

## Setup
```
python3.13 -m venv .venv && .venv/bin/pip install bpy==5.3.0     # ~300 MB, venv is git-ignored (or set BPY_VENV)
NEED_GL=1 tools/blender/run.sh build_all.py                       # everything (xvfb-run needed only for preview renders)
tools/blender/run.sh build_all.py --only body --no-preview        # fast, no GL (a few seconds)
```
Options: `--only faces|body|hair|outfit|preset`, `--sex male|female`, `--no-preview`.
EEVEE previews run on software GL under `xvfb-run` (first render compiles shaders, ~1 min).

## Modules
| file | what |
|---|---|
| `skeleton.py` | proportions (MALE/FEMALE), VRM-humanoid bone table (T-pose, +X = character's left, front = -Y in Blender = +Z in glTF), armature |
| `bodymesh.py` | skin-modifier graph -> subdivision (body lvl 2, hands lvl 1) |
| `head.py` | anime head (deformed UV sphere, planar face UV, ears, nose), emotion shape keys |
| `face_atlas.py` | procedural face atlas (eyes+iris+highlights, brows, mouth, blush, nose), 6 expressions, face-shadow SDF map |
| `rig.py` | assembles body+hands+head, automatic weights (heat) with nearest-bone fallback, body shape keys |
| `hair.py` | 3 styles: `long`, `bob`, `short` (cap + wedge strands, spring-bone chains) |
| `clothes.py` | outfits `field` (jacket, chest rig, backpack, pants, boots, orange accent) and `uniform` (piped coat, skirt or trousers, shoes) |
| `anim.py` | procedural FK clips |
| `export.py`, `build_all.py`, `preview.py` | export, orchestration, toon+outline preview |

## Output files (`game/assets/models/`)
- `body_f.glb`, `body_m.glb` - body + armature + 9 animations + shape keys.
- `hair_{long,bob,short}_{f,m}.glb`, `outfit_{field,uniform}_{f,m}.glb` - parts: same armature (same bone names) + skinned meshes; bind to the body skeleton by bone name.
- `hero_{f,m}_{uniform,field}.glb` - assembled presets (everything + animations).
- `*.json` - meta: bone list, spring chains, expressions, animations, triangles.
- `face_{f,m}_{neutral,blink,happy,angry,sad,surprised}.png` (512 px, swap-in face atlases), `face_sdf.png` (face shadow threshold map: value = light azimuth 0..180 deg / 180 at which the texel goes into shadow; mirror for the other side).

## Contract
- Bones: VRM 1.0 humanoid names (`hips spine chest upperChest neck head leftShoulder leftUpperArm ... leftThumbMetacarpal ...`). Hair bones `hair_<chain>_<i>` (parent `head`).
- Spring bones: JSON in `springBones` (node extras of hair mesh + `.json` meta): `{name, bones[], stiffness, gravityPower, gravityDir, dragForce, hitRadius}`. Not the VRMC extension - the loader maps it.
- Shape keys (morph targets): `blink happy angry sad surprised` (face; geometry-driven, texture variants in `face_*.png` for stronger looks), `bust hips shoulders build legs_long height` (sliders, `build` -1..1 etc.). Outfits carry the same body keys (transferred).
- Materials are plain PBR (base colour / texture): the game applies its own toon shader + inverted-hull outline (see `preview.py` for the reference look: 3 bands, outline 2.5 mm).
- Animations (30 fps): `idle walk run crouch_walk` loop; `attack_melee attack_shoot cast hit death` one-shot. In place (no root motion). Legs are auto-grounded.
- Size: ~13.7k tris body (female; male similar), hair 1.4-2.8k, outfit 3-4k; hero GLB about 1.5-2.5 MB (limit 3).
- Triangle count is not tuned for mobile; LOD = drop outfit/hair parts or use the lower subdivision (`build_skin(level=1)`).

## Known limits
- Face expressions are texture-painted features moved by shape keys: strong emotions look best with the `face_*` texture swap.
- Hair strands are simple wedges; physics is data-only here (the game runs the spring bones).
- Skirt/coat do not collide with legs (spring chains for the skirt are not authored).
