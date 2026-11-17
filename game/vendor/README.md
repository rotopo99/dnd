# Vendor (third-party, MIT)

Static ES modules, no build step. Loaded through the import map in `game/index.html`.

| Folder | Package | Version | License |
|---|---|---|---|
| `three/` (`three.module.js`, `three.core.js`) | three | 0.187.0 | MIT — `three/LICENSE` |
| `three/addons/` (subset of `examples/jsm`: GLTFLoader, SkeletonUtils, BufferGeometryUtils, EffectComposer, RenderPass, ShaderPass, OutputPass, UnrealBloomPass, GTAOPass + their shaders) | three | 0.187.0 | MIT — `three/LICENSE` |
| `three-vrm/three-vrm.module.js` (`lib/three-vrm.module.min.js`) | @pixiv/three-vrm | 3.5.5 | MIT — `three-vrm/LICENSE` |

Update: `npm pack three@<v> @pixiv/three-vrm` in a scratch dir, copy `build/three.module.js` + `build/three.core.js` and the
addons above (with their relative imports), keep the paths. Add an addon: copy it with every file it imports relatively.
