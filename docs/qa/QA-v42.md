# QA v42 — Three.js stage 4 (NPC GLB, two-handed clips), w3 glyphs, QA-v40 regressions (2026-11-24)

Verdict: **ПРИНЯТО** (0 blockers; 1 medium design/gating issue, the rest low). Console errors in all runs: **0**.
Auto: `node tools/test.mjs` 357/357; `playtest --gfx 3d` clean; `gfx3d-leak.mjs` ok (battle/roam/menu, no growth); `wave3-flow.mjs` OK, no softlocks; `cinema.mjs --set wave2 --only 3d` OK.
Env: SwiftShader (about 4 fps), so timings are in game time / sampled loosely. Scripts: `tools/out/qa42-*.mjs`.

## Acceptance
| # | Check | Result |
|---|---|---|
| 1a | Roam NPC GLB (trader / guard / settler / Lox) | OK. alpha-harmony: Lox `npc\|lox`, Nikola / Sukhar / Gudok `npc\|trader`, Amanda / Sera / Gans `npc\|settler`; raytsentr: Yarosh `npc\|guard`. All `R.C` assembled, idle clip. |
| 1b | Boss battles: Judge avatar, Cyber-Priest, Great Collector | OK. Keys `npc\|arbitrazh`, `npc\|cyberpriest`, `npc\|ladov`, glb count 2. Close camera works. Fog check inconclusive (L3). |
| 1c | Cinematics c4 / c6 / c8 in 3D, Ladov grey tint | OK. Mode `3d` for all three (no comic), Judge, Lox and Ladov as GLB; Ladov is grey (`qa42-cine-sheet.png`, `cinema-c8-3d-ladov.png`). |
| 2 | Two-handed rifle / staff / hammer | OK. Idle `idle_2h`; staff / hammer swing `attack_2h`; rifle shoot `shoot_2h`; rifle walk `walk_2h`; weapon on `rightHand`, both hands on the weapon (`qa42-2h-sheet.png`). See L4. |
| 3 | w3-flags glyphs on the live map | Partly. star / anchor / flag read well; crossed blades read as a circled **X** (L1). |
| 4 | QA-v40 fixes | OK: Repa stands in the Lagoon bar and is talkable (not in the party), w2-cold finishes (block: reward, talent slot, radio «Привет Репе»; thaw: radio); harmony protocol is required (3 clues leaflet / reactor / lox5 do not close the stage, `accuse` offers public with the protocol; radio and `wanted-lox-off` at +6 days); Sera shows the list «Сера: есть дела (6)» with sub-lines; QTE tests in test.mjs pass. |
| 5 | Wave 3 smoke + live w3-vacation | OK after M1 workaround: formal way through the real UI to `done`, reward, radio `rd-w3-vac`, no errors. |

## Bugs
### M1 — MEDIUM: w3-vacation is not offered to many heroes
Repro: new human hero (pirate origin), `dungeons-m16`, talk to Узел-4 four times: no offer, quest never starts. Rep mechanids = -29 (human -20 + origin) = `suspicious`; non-trial quests are filtered out. Over race x origin (20 combos): w3-vacation blocked in 12/20, w3-sorter 4/20, w3-apology / liza / flags 0. Only a bribe talent or +rep unlocks it. `wave3-flow.mjs` uses `startQuest` directly, so it does not see this.
Expected: the comedy quest reachable by default (or a hint that the NPC distrusts you). Where: `game/src/world/npc-actions.js:72` (`offeredBy`), `isTrialQuest` line 34 (`id.startsWith('sq-')`); `data/world/origins.js:58-62` (mechanids -20). Fix options: `trial: true` on w3-vacation / w3-sorter, or origin mechanids rep.
### L1 — Low: «Отступники» glyph reads as an X
`ui/map-glyphs.js:20-27` (`swords`) at `r=5.5` (11 px): shaft + blade cross, spearheads are 2-3 px; on the map it is a green circle with X (`qa42-glyphs-sheet.png`), like «cancel / closed». Make the spear vertical + one blade diagonal, or a bigger head. Also the mark overlaps the hero marker and the labels in the Harmony cluster (`world-map.js:615`).
### L2 — Low: crowd NPCs look uniform
Roam crowd (`three/party.js:46-55`, `crowdTint`) renders mostly pale cream / gold silhouettes; trader vs settler vs guard are hard to tell at the default zoom (`qa42-roam-crowd.png`, `qa42-roam-raytsentr.png`).
### L3 — Low / info: Ladov vs fog
Great Collector is visible at the default camera in dusk (`qa42-boss-crops.png`) but dark grey on the grey dais: low contrast. The fog case is unverified: `S.wxForce` fog and swamp biome gave the same frame as without fog (`qa42-boss-collector-fog-far.png`); the real fog depends on the node weather. Test used `enemies:` directly (the finale has a party-size gate and cinema).
### L4 — Info: two-handed clips not fully sampled
Rifle melee event gave `idle_2h` at 350 ms (no bash clip; staff / hammer do give `attack_2h`); staff / hammer walk was not caught in sampling (click-move on SwiftShader). Bosses idle in `idle_2h`. Verify on a GPU.
### L5 — Info
Level-6 quest w3-vacation can be taken at level 1 (no level gate; checks 9-16%). The harness «RAW? Отмена undefined» is a false positive (cancel button has no sub-line).

## Screenshots (tools/out)
`qa42-cine-sheet.png`, `qa42-boss-sheet.png`, `qa42-boss-crops.png`, `qa42-2h-sheet.png`, `qa42-glyphs-sheet.png`, `qa42-map-<ai|ren|pir|council>.png`, `qa42-roam-alpha-harmony.png`, `qa42-roam-crowd.png`, `qa42-roam-raytsentr.png`, `qa42-sera-list.png`, `qa42-vac-loc.png`, `qa42-vac-end.png`.

## Not covered
Real 3D QTE timing, walk clips of staff / hammer, fog on a Ladov battle at the real node, other w3-vacation ways via the UI (split / resort / war: only through wave3-flow).
