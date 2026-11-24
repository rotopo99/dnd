# QA v44 — wave 4 finale (mq4-eve, court, c11/c12, epilogue) + enemy GLB (2026-11-24)

Verdict: **ПРИНЯТО** (0 blockers, 0 console errors in all runs; 3 medium, rest low).
Auto: `node tools/test.mjs` 372/372; `wave2-flow` / `wave3-flow` / `wave4-flow` OK, no softlocks (wave4: 11 endings, c11 x5, c12 x7); `playtest --gfx 3d` clean; `gfx3d-leak.mjs` ok (no growth); `three-enemies.mjs` day + `--night` (humans, wolves, drones, mutz) all ok.
Real-UI scripts (state-injected L17/18 save, keys and clicks): `tools/out/qa44-eve.mjs`, `qa44-court.mjs` (env `END=closed|reflash|oldgod|order|scrap|vessel|lox9|lox-leave`, `LOW=1`, `SKIPDOOR=<stage>`, `RNG0=1`, `DAYS=1`), `qa44-cine3d.mjs <id> <flags>`, `qa44-eveenemies.mjs`. Logs: `tools/out/qa44-court-*.log`. Screens: `tools/out/qa44-*.png`.

## Acceptance
| Check | Result |
|---|---|
| mq4-eve offered by Sera (L17, act2-done, arsenal done) | OK |
| c11 plays once (comic and 3D), narrator Kuksius, choice read / tear / sign / silence, flags set | OK (see M1) |
| 3 waves, rests (saved-people heal), barge volley (harmony-pir), terminal revive (saved-terminal, fires in the first battle) | OK, log lines seen |
| Priest: argue (check Hacking/Religion DC 17, `priest-turned`) | OK |
| Priest: fight -> win / lose path (`priest-lost` -> `priest-at-door`) | Lose path OK. A crude L17 ranger (114 HP, no gear) lost after 21 rounds; the win path is only covered by wave4-flow. Not a balance verdict. |
| Last-night cards (3 choices per companion, `eve-talk/eve-hub`) | OK, but see M2 |
| Court: dossier shown "Досье защиты: N из 12", DC shown on every option (12 pts: closed 8, reflash 12; 2 pts: closed 14) | OK |
| Temptation highlight (dossier <= 3) | Works: red note + "Судья подсказывает этот выход" (L1) |
| 8 endings A / B / C-oldgod / C-order / C-scrap / D-vessel / lox9 / lox-leave -> c12 branch -> epilogue | OK. Slides 16-18 (<= 18), `epi-fin-*` and `epi-year-*` present, `epi-perfect` at 12 pts, no raw ids (scanner clean), texts fit |
| c12 in comic and 3D | OK, no errors. Branch A has the "hold the door" QTE (A-S-D) |
| door-halfsealed knock after 6 days | OK: delayed `judge-knocks` due day 7 (start day 1), consumed |
| Enemy GLB: cultist, pirate, brute, wolf, drone | OK 5/5 on GLB; clips attack / bite / shoot, hit, death correct; HP bar anchor above model top; night tint (dusk grade) applied; no GPU resource growth |

## Bugs
- **M1 (medium)** c11 does not start after the omen talk. The cinematic is queued (`save.cine.queue = ['c11-consent']`) but plays only on the next `setScene` (leave and re-enter Raytsentr). Right after Sera's dialogue the player stays on the location with stage `twist`, and the fallback button "Решить: Последняя ночь" (read / tear / sign / silent) is available, so the key cinematic can be skipped by accident. Repro: `node tools/out/qa44-eve.mjs` without `REENTER=1`. Where: `scenes/cinema.js:85 cineInterrupt` only from `main.js:48 setScene`; dialogue close uses `g.resume`.
- **M2 (medium, content)** All companion cards say the same line: "<имя> сидит у костра на валу. Утром — Дверь." plus three generic buttons. The spec wanted personal reactions; the emotional peak before the Door is flat. `data/world/quests-wave4.js:61`.
- **M3 (medium, visual)** During c12 the reward/world-change toasts ("Жестяное братство +10 · …", "Мир изменился: …") draw over the speaker plate and subtitle (`qa44-closed-c12-verdict-open.png`). The rep summary should wait for the end of the scene, or be hidden in cinema.
- **L1** The thin-dossier note says "Дверь или сосуд — выбирайте", but a neutral hero without `consent-signed` has no "Сосуд" option, so the only choice is "Дело закрыто" (`qa44-closed-active-verdict-modal.png`). Reword or offer D.
- **L2** Failed "Дело закрыто" -> `crooked` -> the radio says "Дверь разрушена, Судья умолк. Скучно, как в хорошем финале", while the door is sealed crooked. Needs a halfsealed variant of the line.
- **L3** Every wave win shows "✗ Удержать точку: провалено (не удержали)" in the loot modal: `hold` is a bonus objective, but the win comes from killing everyone first. The spec says "hold 8 rounds". Either make it the win condition or remove the objective for `w-eve-*` (`data/world/battle-objectives.js:36`).
- **L4** Brute (mutz): pale grey with an olive tint, not clearly green. The HP bars of the two mutz do not overlap each other, but the bar of the rear unit (tallest model) goes under the "Цели боя" strip at the top edge and is hidden (`qa44-enemy-close-night.png`, `qa44-night-mutz-battle.png`).
- **L5** Wave 3 ended with no loot modal in the run (the log shows none); the stage still advanced. Not reproduced twice.
- **L6** The c6 "Lox door" scene plays before the verdict in every run, and `door-halfsealed` is set when its QTE fails, even for a successful B / C ending (the Judge still knocks). By design, but the epilogue does not mention it.

## Fun / pacing
Strong: omen -> consent twist -> wall -> priest -> night -> Door -> court with dossier -> c12 -> 16-18 slide epilogue. Choices are clear: DC is visible, the dossier counter is visible, endings are named. Weak spots: three consecutive kill-all battles in one hub with only a rest modal between them (the same fight three times); the last night is a menu of 3 buttons per companion (M2); c12 is short (D branch about 5 lines, A about 10) for a "3 minute" climax, and the vessel ending is over in seconds. c11 has a good beat: the consent line and the "mелким шрифтом" gag land.
