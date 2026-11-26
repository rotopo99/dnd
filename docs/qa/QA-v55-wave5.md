# QA v55: content wave 5 (7 quests, c13)

Date: 2026-11-26. Spec: `docs/specs/content-wave5.md`. Method: prepared lvl 7/8/9/12 saves (`tools/out/qa55-lib.mjs`, via `newSave`/`gainXp`/`recruit`, loaded via menu, `?gfx=3d`), then real UI (node menu, dialogue, offers, checks, map travel). Supplement: `node tools/out/wave5-flow.mjs` (world-state walk: 430 walks, all outcomes of all 7 quests and c13 on the real cinema runner) passes, "no softlocks". Screenshots: `tools/out/qa55-*.png`.

## Coverage (honest)
| Item | Status |
|---|---|
| w5-census (lvl 7) | UI end to end: offer from Zoya in party, 5 clue checks with odds %, "miss" stages, accuse, outcome `fail`, radio turn-in, XP 800x0.7 and 120x0.7 credits paid, flags set. Other outcomes only via flow script. |
| w5-bread (lvl 8) | UI end to end: Ryabov dialogue, offer, inspect check, verdict, `shared` (80 cr / speech check), rep and Pomol prices change (R1a), delayed radio queued (due day 9), XP 950. Burn option failed its check and was removed (no retry). |
| w5-crown (lvl 9) | UI to stage `reveal`: offer, scene check (failed twice), `scene-fail` battle at Райцентр won, reached `reveal`. Resolution not played in UI (needs return trip Райцентр -> Свалка). |
| w5-recruit, w5-two-trails, w5-edict | NOT played in UI (time; battle bot unreliable). Only flow-script coverage. Offers verified only for census (lvl 7: other quests not offered, `questsOffered` of Ryabov/Agitator/Aztun empty at lvl 7). |
| w5-schedule + c13 | UI: Aztun offer works at lvl 12 (after dialogue topic menu), stage `fieldwork`; travel to Свобода hit random pirate fights, bot could not finish them, so c13 was NOT played in UI. Verified statically/by flow script: sec 12, silence = shielded, QTE ШУНТ (W A S D) and ПОВЕРНУТЬ РУЧКУ (hold Space 2.5 s), flags diverted/shielded/hit. |
| R1-R4 UI (Зоя/Заря after «Две тропы», epilogue slides, mq4-eve) | not checked in UI; flow script only. |
| Raw text keys | none: all 186 literal `w5.*` keys exist in `data/text/wave5.js`; none seen on screen. |
| Portraits | `w5-boltik` and `w3-dispatcher` render (pixel portraits; `tools/out/qa55-portraits.png`, `qa55-40-dispatcher.png`). |
| Console | 0 errors/warnings in all sessions. |
| Skill-hint / challenge window | Check window shows "Q бросает · шанс 88% · СЛ 13" (good). "(сменить)" only exists in `openChallenge` (skill challenges) and was not shown by any wave-5 quest; wave-5 checks are single checks. Travel events still use the old "Кто бросает?" window. |
| Battle length 6-9 rounds | Not measurable with my UI bot (hero passive, archers kite: 13-27 rounds in random pirate fights, not wave-5 encounters). Per `docs/BALANCE-wave5.md`: census 9.1, bridge 9.7 rounds (slightly above target), storm win rate 64%. |

## Issues
| # | Sev | Repro | File |
|---|---|---|---|
| 1 | Medium | w5-crown is a duplicate premise of `sq3-sc-crown` "Корона из кубков" (both "корону украли") offered at once by the same Король; two near-identical quests in the offer list. | `data/world/quests-wave5.js` / wave3 quest |
| 2 | Medium | w5-crown: stages `scene-fail`/`trail` at Райцентр, `reveal` back at Свалка; map route Свалка to Райцентр took ~19 days with random fights; the "3 days to war" in the offer text has no timer. Heavy ping-pong. | `quests-wave5.js` 120-140 |
| 3 | Medium | Wave-5 fights: balance doc admits census 9.1 / bridge 9.7 rounds (>9) and storm 64% win; not re-verified in UI. | `data/enemies-wave5.js` |
| 4 | Low | w5-census journal: "Староста Лишай больше не встретить"; w5-bread: "«Аграра» изменился" (grammar of generated consequence lines). | `consequences-wave5.js` / `world/consequences.js` |
| 5 | Low | Option label "Поджечь склад вместе с рабами" reads as burning the slaves. | `data/text/wave5.js` (`w5.bread.*`) |
| 6 | Low | Census: with only 2 clues the only exit is `fail` (no retry once all 5 tried); on bad luck the quest ends at -30%. By design but harsh. | `quests-wave5.js` 60-100 |
| 7 | Low | Bread `shared`: Renegades (Марта) -5 from spec did not show net change (4 -> 4); probably rep propagation, unverified. | `consequences-wave5.js` 39 |
| 8 | Info | c13 QTE ШУНТ window 5.6 s vs 3 s in spec (documented in c13 file). Spec XP numbers differ from data (800 vs 450, etc.); balance-tuned. | `c13-schedule.js` |
| 9 | Info | Random-event modal (Праздник добычи) and radio modal open on node entry; Escape does not close single-option modals (Enter/1 does). | UI |

## Verdict
**НА ДОРАБОТКУ** (conditional): no crashes, softlocks or raw keys found; census, bread and the crown start work. But 4 of 7 quests and c13 were not played through the UI in this pass (container restart, slow 3D battles, unreliable bot). Re-run the remaining UI scenarios (recruit, two-trails, edict, c13 with both QTEs, R1-R4 slides) before ПРИНЯТО; fix issues 1-3 first.
