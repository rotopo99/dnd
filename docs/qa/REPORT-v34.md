# QA v34 (regression after v15)

Scripts: tools/out/qa34-{create,flex,flex2,world,rot,leak,leak-roam,old,old2,settings}.mjs. Screenshots: tools/out/qa34-*.png. Game code untouched.

## Runs
- `node tools/test.mjs`: 301 passed, 0 failed. `validate-maps.mjs`: all maps ok. `smoke-rules.mjs --n 1`: 846 battles, 0 exceptions.
- tools/out/*.mjs (qa15-* skipped), 89 scripts: all exit 0 except below (re-run alone).
  - gfx3d-roam "arrows pan the battle camera": FLAKY (failed under load, passes alone).
  - net-world "guest interaction -> host window" (guest walks to nikola, d=1.0, presses E, no host window): fails 2 of 3 alone, run 3 had only this one failing; run under load had 1; once 3 (incl. "back on node map"). Suspected flaky/timing, needs a look (coop-world remoteInteract range or `goTo` stop distance).
  - gfx3d "rotate ]" (yaw unchanged after the key, pressed ~1.6 s after the hero click-walk): the key works (qa34-rot.mjs: ]/[ rotate 90 deg, also after banner). Likely key dropped while the walk animation plays, or test timing. Low.
  - qa12-rest2: hangs in its tail (`T.prologue()`), rest/ambush part works -> stale script. world.mjs: ok alone (timeout only under load).

## Path
- Menu -> creation (rec) -> look -> talents -> prologue dialogue in 3D: OK. Flexible creation: point buy, phobias (cap 3, +2 points each, "6 unspent" locks Next with message), proficiency sliders + tooltips: OK.
- Roam hub in 3D, passive secret spotting, Q "look around", battle trigger -> 3D metric battle (barricade): OK. Old-style save without new fields (no look/phobias/prof/rest/settings/base) loads; save/load roundtrip OK.
- Settings (graphics, FX, physics, shadows, brightness, highlight, cones, walls, xray, metric by cells/metres, theme, 5 volumes): toggles persist, no errors.
- Run, net lobby + coop battle, cards/casino, hand maps, metric stages 1-3, rest, themes: covered by the passing scripts.

## Performance (SwiftShader, indicative)
- Battle 3D: ~8 fps (frame median 119 ms, gfx3d-perf). Roam 3D idle: ~4-5 fps measured under heavy parallel load (not reliable).

## Bugs
1. **P1 GPU resource leak.** Steps: enter a 3D battle (quick battle) and exit to menu x30, count createBuffer/deleteBuffer (qa34-leak.mjs). Expected: live buffers return to baseline. Got: +43 buffers, +21 VAOs, +1 texture per battle (1309 buffers / 628 VAOs / 34 textures after 30). Roam: +72 buffers, +36 VAOs, +1 texture per entry (qa34-leak-roam.mjs, 929 buffers after 12). JS heap stable. Cause: `dropBattle3d` (game/src/gfx/scene3d.js:305) is called only when switching 3D->2D; nothing frees chunk meshes/edges/floorTex on scene exit; roam3d likewise (game/src/gfx/roam3d.js).
2. P3 net-world guest interaction flaky/failing (see above).
3. P3 key `]` may be ignored while the hero's walk animation plays (gfx3d.mjs).
4. P4 Settings modal hint "3D: [ / ]..." is shown even in 2D mode; trying to start a game with an invalid race/class pair (e.g. mutant ranger) in a hand-built save silently returns to the menu (normalizeSave -> null, no message).
5. P4 `M` on the free map (roam) does not open the world map (stays in roam) - likely by design (exit via map edge/objects); confirm.

Not verified manually: full UI walk of quest accept/turn-in, 3D bridge/cover visuals, Dacha hatch, card match, Run first fight by UI, two-context lobby - only via existing scripts (pass).

## Verdict: НА ДОРАБОТКУ (P1 leak). Everything else functional.
