# Hair: editor id -> 3D model

Source: `HERO_MODELS.hair` in `game/src/data/hero-models.js` (used by `three/character.js heroSpec`; `HAIRS` there lists the loadable styles).
Models: `game/assets/models/hair_<style>_{f,m}.glb`, built by `tools/blender/hair.py` (`HAIR_STYLES=... build_all.py --only hair`).
Review sheet: `NEED_GL=1 tools/blender/run.sh haircheck.py female|male [styles]` -> `tools/out/blender-hair-<sex>.png`.

| editor id (2D) | before | now | new model |
|---|---|---|---|
| bald | none | none | - |
| crop | short | crop | yes: tight cap, stubby front locks |
| short | short | short | - |
| fringe | bob | fringe | yes: heavy bangs to the brows, short back |
| long | long | long | - |
| tail | ponytail | ponytail | - |
| bun | ponytail | bun | yes: top-knot ball |
| mohawk | spiky | mohawk | yes: shaved sides, midline fin |
| spiky | spiky | spiky | - |
| dreads | long | dreads | yes: 15 thick ropes, spring chains |
| afro | bob | afro | yes: round cloud shell |

Unused by the editor but kept: `bob`, `twin` (cinematic casts, presets).
