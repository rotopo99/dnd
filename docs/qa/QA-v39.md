# QA v39 (2026-11-21)

Verdict: ПРИНЯТО с замечаниями (0 блокеров).

## Run
- `node tools/test.mjs`: 333 passed, 0 failed (incl. wave2 and cine groups).
- `node tools/playtest.mjs`: OK, no console errors. `gfx3d-roam.mjs`: all ok.

## Checked
- GLB heroes, battle (human ranger fixed): loaded, 12 clips (idle/walk/run/hit/death/attack/cast/talk/sit/shrug...), hit clip plays, emissive flash 0.56 on hit, death clip on lethal damage, record kept. Exit to menu: `gfx.live.size` = 0, no errors.
- Roam 3D: ok (gfx3d-roam).
- `?engine=old`: battle renders, no GLB requests, no errors.
- Cinematics (ids are full: `?cine=c1-arrival`, not `c1`): c1, c3, c5, c6 play to the end (results to-battle-1, c3-done, date-done, lox-lost); c2, c4 reach choices (protest/shoot/swap; deny/counsel/number), branches play. 0 errors/warnings. Gesture clips not in GLB (laugh, lean, nod, point, reach, shake, stagger) go through CLIP_FALLBACK/CINE_GESTURES.
- .gltf.json fallback: with `**/*.glb` routed to 404, body_m.gltf.json loads (200), hero built with 12 clips and 24 extra meshes. Works.
- Wave2 (mq3-court c4 won/draw/lost, c6 Lox, 5 quests): covered by test.mjs logic tests (givers exist, 2+ ways, rumor/radio, outcomes). No manual end-to-end playthrough was done by me.

## Findings
1. **Low** — GLB fallback is noisy: each hidden .glb gives a 404 console error (3 per battle), which fails playtest's "no console errors" rule on hosts without .glb. `game/src/three/models.js:22-23` (loadAsync -> catch -> .gltf.json). Option: HEAD/probe once, remember the result, or prefer .gltf.json after the first 404.
2. **Low (test flake, not a proven leak)** — `tools/out/gfx3d-leak.mjs` battle part fails intermittently. Cause: `startQuickBattle` takes a RANDOM hero (`menu.js:24`); non-humanoid races (mutant plant, android) use the procedural unit templates, humanoids use GLB, so the counts depend on the draw. Plus the shared mesh cache keeps up to `GFX.meshIdle`=8 templates on the GPU (`data/gfx.js:14`, `gfx/scene3d.js:117`), so the "warm" snapshot at iteration 10 is not steady. 80-iteration run: Buffer 240/411/416/558/537/559/592/636, VAO 93/153/69/133/84/87/92/96, Texture steady 52 after 30. Slight upward drift of Buffer (about 3/iter after 50) remains, possibly cache variety; not confirmed. Roam stays flat (635 -> 635). Recommendation: fix the hero (human) and the encounter in the script, snapshot after 30+ iterations, compare the min over a window; add per-iteration disposal check of `T.party` (dropParty is called, live=0 after exit).
3. **Info** — `?cine=<id>` silently ends with `cine <id>: null` for an unknown id (short ids `c1` do not work; need `c1-arrival`). `main.js:122`, `scenes/cinema.js:57`. Add to the docs or accept short ids.
