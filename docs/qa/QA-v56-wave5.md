# QA v56: content wave 5, second pass

Date: 2026-11-26. Method: lvl-12 save built with `newSave`/`gainXp`/`recruit` (`tools/out/qa55-lib.mjs`, `qa55-sess.mjs`), loaded via menu, `?gfx=3d`. Then the real UI (node menu, dialogue, offers, check-scene, map travel, rest, journal, epilogue). Battles were played by the game's own `rules/ai.js` `chooseAction` for all party units (no UI bot), results through the normal result screens. Screenshots: `tools/out/qa56-*.png`. Console: 0 errors/warnings across the whole session.

Deviation from "real UI only" (honest): (1) after the first storm defeat I gave the party tier-4/5 gear through the save, and after the second cyberspace loop I reset party states/cyberspace through the save (the defeat flow itself, cyberspace, 2 Judge marks, "Вернуть души", worked). (2) For c13 replays I re-queued the stage with `cineStage` and cleared flags in memory (c13 triggers only on stage entry and is `once`); this spams the journal with "Подвести итог" lines, a harness artefact.

## Coverage
| Item | Result |
|---|---|
| w5-two-trails | PASS in UI: Вонючка, offer, meeting, choice, check-scene, outcome `truth`, radio turn-in |
| w5-edict | PASS in UI: offer from Агитатор (page 2 of NPC list), 3 verses with checks, outcome `good1`, turn-in dialogue |
| w5-recruit | PASS in UI: Кен at Селышко, Славотеч, camp check, bridge `saved`, back at Додзе, outcome `saved` (turn-in not done) |
| w5-crown | PASS in UI: only `sq3-sc-crown` offered first, done; then only `w5-crown` offered; scene, Райцентр trail (persuasion), back at Свалка, `reveal`, outcome `returned` |
| w5-schedule to c13 | PASS: Азтун offer (ruins-m36 = ancient-bunker), 3 nodes, storm stage, c13 plays. Silent timeout = shield: OK. Choice 2 + QTE ШУНТ (W A S D): OK, `storm-diverted`, `proxy-calmed`. Choice 3 shown only with `w5-sched-tech`: OK. QTE ПОВЕРНУТЬ РУЧКУ: FAIL, see #1 |
| R1-R4 | Зоя and Заря in one party after zz-peace: PASS (recruit window shows "Не вместе с: Зоя Клык" as passed, Заря joined). Delayed zz-peace due 4 days after: PASS. Topics (Король after `returned`, Азтун `boltik-dead`), door line, eve lines: PASS (checked via `world/wave5.js`). Epilogue slides `epi-crown-bad`, `epi-boltik`, `epi-zz` in the journal Эпилог: PASS. Dossier: `w5-witness` +1 (recruit-saved), `w5-choir` +1 with `storm-diverted`: PASS (points only) |
| Fixed texts | crown offer has no "3 дня"; crown ask/desc rewritten; "Помочь рабам Агрозоны сжечь склад" and cq.* wording present in code, not all seen on screen |
| Roller picker | "Бросает лучший для навыка (сменить)" shown in check-scene (`qa56-06-check-scene.png`) |
| AI fixes (Славотех, Репер) | Not verifiable with a ranger+Зоя+Lox+Заря party; no AI anomalies seen in 14 battles |

## Fights
Road/random fights: 4 in about 10 map trips (13-25 days each), 2-4 rounds, about 52-62 s wall time each, all won. Storm node fights (enc-w5-storm): 10 W, 6 L, 12 W, 13 L, 15 L (starter gear), then 9 W with tier-4/5 gear: 4 of 6 lost, 9-15 rounds (target 6-9). Cyberspace fights: 5 L, 4 L.

## Issues
| # | Sev | Repro | Where |
|---|---|---|---|
| 1 | High | c13, option «Вмешаться в Диспетчера: повернуть ручку»: hold Space (keyboard) for 4 s. `Space` is down (`input.isDown('Space')` true) but `qte.holding` stays false, `prog` 0, fail at t=4.02 -> `storm-shielded`, `boltik-dead`. The QTE is unwinnable by keyboard. Mouse hold not verified (test inconclusive). | `scenes/cinema.js` ~258: `cineHold(R, inp.isDown(\`Key${q.keys[0]}\`))` builds `KeySpace`; `data/cinematics/c13-schedule.js` 156 `keys: ['Space']` |
| 2 | Medium | Storm fights: 3 mandatory relay battles when the tech/proxy check fails (the party had no tech, all 3 checks failed). 9-15 rounds, lost 4 of 6, a loss sends the party to cyberspace (Judge marks, -credits). | `data/enemies-wave5.js` `enc-w5-storm`, `quests-wave5.js` fieldwork |
| 3 | Low | Fieldwork: three buttons with the same label «Решить: Буря по расписанию»; option text "Без Диспетчера - на два труднее" shown even with the Dispatcher alive; "СлавоТех-проверка" jargon. | `quests-wave5.js` fieldwork, `text/wave5.js` `w5.schedule.node.hint` |
| 4 | Low | w5-recruit bridge text "Мост у Додзе", but the choice is played at Славотеч (stage has no `location`); only the last stage goes to Додзе. | `quests-wave5.js` stage `bridge` |
| 5 | Low | w5-crown trail: two options with the same label "Пройти по следу: Райцентр, Пираты" (second with ⚔). Offer desc ends with a dangling "Пока Король пишет им вежливые письма." and ask.3 repeats the same idea. | `text/wave5.js` `w5.crown.desc`, `w5.crown.obj.trail` |
| 6 | Low | Dossier rows `w5.dossier.witness` / `w5.dossier.choir` text keys are not shown anywhere (the dossier is only a number). | `text/wave5.js` 40-41 |
| 7 | Low | Recruiting Заря at lvl 12 queues several "+2 к одной" modals; option «СИЛ 20 -> 20» is selectable but changes nothing (modal stays, loops on Digit1). | levelup modal |
| 8 | Info | Travel 13-25 days per leg, 9 legs = 290+ days; `page.screenshot` on the world map times out (30 s) in swiftshader. | harness |

## Verdict
**НА ДОРАБОТКУ.** All 4 remaining quests, the crown chain, c13 (silent, ШУНТ) and R1-R4 work in the UI with no console errors, and both v55 content fixes (crown prerequisite, no fake deadline) are confirmed. Blocking: issue 1 (the hold QTE cannot be passed with the keyboard, so the "turn" ending is unreachable). Recommended: issue 2 (storm fights too long and lethal). Not verified: mouse hold QTE, AI fixes for Славотех/Репер, other outcomes of quests (flow script only).
