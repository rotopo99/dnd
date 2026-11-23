# QA v40 — content wave 2, live UI (2026-11-23)

Verdict: **НА ДОРАБОТКУ** (1 blocker class: w2-cold is unobtainable and unfinishable; 1 high: w2-harmony-truth dead end; the rest is minor).

## Method
Playwright against the real UI (clicks on NPC/action/modal buttons, real keys in cinematics). Save state, flags and some quest stages were injected only to reach a start point (`startQuest`, `onBattleWon` for the door fight). Math.random pinned (0.97 / 0.02) to force check outcomes. Scripts: `tools/out/qa40-*.mjs` (lib: `qa40-lib.mjs`). `node tools/test.mjs` 334/334, `wave2-flow.mjs` OK (these do not see the bugs below: they use state, not the UI).
Console errors across all runs: **0**. Text scan for raw ids / undefined / `{x}`: **0 hits** in dialogue, modals, check scenes, radio, journal.
Environment note: SwiftShader 3D runs at about 4 fps, so game time is slow-mo and QTE timing was measured in game time in comic mode (`comic=1`); the 3D QTE cannot be judged here.

## Acceptance
| # | Criterion | Result |
|---|---|---|
| 1 | c4 won/draw/lost -> verdict / judge-fight / judge-fight-hard; court-lost hides reflash | OK. Won: verdict (closed, reflash); draw: judge-fight -> verdict (closed only); lost: judge-fight-hard -> verdict with closed + vessel, reflash hidden (spec says closed also hidden: spec 1.2 vs code differ, minor). Hard fight lost -> `crushed` stage, no game over (checked by real battle). |
| 2 | c6 alive: closed DC 13 / lox-leave; dead: grave, Lox leaves party | Partly. c6 plays before c4 (queue c6 -> c4) OK; saved: `lox-alive-door`, `door-halfsealed`, Lox stays, "Отпуск" option; dead: `lox-dead`, `lox-leaflet`, Lox `left`, "Приманка" option, radio `rd-w2-lox-dead`. DC value and grave node not visible in UI (see L3), not verified. |
| 3 | w2-harmony-truth: 2 clues no Жрец; 3 + protocol -> ending; public -> 5 days -> wanted-lox-off + radio | OK for public/marta/quiet/clone (public: `wanted-lox-off` + apology radio on day 6; marta: scandal radio; clone: framed radio). **But B2.** |
| 4 | w2-name: no `collector-met` -> not offered; `ladov-name-known` -> c8 once | OK (flag set after quest; c8 plays before arena fight, `cine-seen` set). Offer/skip never trigger c8 (L2). |
| 5 | w2-cold with Repa gives +1 talent slot; without Repa blocked | **FAIL — B1.** |
| 6 | >= 2 ways, rumor and radio per quest, console clean, no blocked ending | customs/laugh/name/harmony OK; cold broken; radio missing for laugh `kept`, name `offer/skip` (info). |

## Bugs
### B1 — BLOCKER: w2-cold «Вежливая очередь» cannot be started or finished
Repro: any save, lagoon-bar (or whole map): Repa is not in any node's NPC list; with `recruit repa` he is also not talkable. Scan of every location with `npcsAt`: `repa` appears nowhere. Forced `startQuest` -> door / queue / choice work (checks, choice, flags), but the last stage `back` ("Вернуться к Репе в Бар Лагуны", `talk repa @ lagoon-bar`) can never complete: 40 UI attempts, quest stays active forever; no reward, no `cq:w2-cold:*` outcome, so the `rd-w2-cold/-repa` radio and delayed events never fire. Talent slot (+1) not granted either (`talents [] pend=0` after `repa-block-found`).
Expected: Repa reachable. Where: `data/npcs.js:357` (`cameo: true`, 'Не встречается'), `world/data.js:226,243` (cameo NPCs never placed), `quests-wave2.js` giver `repa` / stages `ask`, `back`; companions.js has no repa. Fix options: place Repa at lagoon-bar for this quest (npcPlacement flag) or make the giver a placed NPC; add turnin fallback for unreachable NPC (`turninReachable`) at `back`.

### B2 — HIGH: w2-harmony-truth locks out the "true" endings after three easy clues
Repro: take quest, collect leaflet (funicular), reactor, and lox5 (auto after c3 or Штабцентр) via the UI -> stage advances to `accuse` at the third clue (`all.min: 3`, `quests.js:525`). The Sokralnya check ("протокол") disappears from the actions list; `ha-proof-protocol` can no longer be collected. In `accuse`, `public` and `marta` are disabled ("Нужны улики: протокол…"), only `quiet` / `clone` (the framing trap) remain, no way back. Journal text says "нужно три из четырёх, и без протокола картина неполная" — nothing warns the player that the protocol must be among the three. Because c3 sets `ha-proof-lox5` automatically, this is the most likely path.
Expected (spec 2.2): protocol obligatory, so the stage must not close without it (e.g. `all` with required subgoal / `pickWith`, or advance only when protocol is done and 2 of 3 others). Where: `quests-wave2.js` stage `clues` (`all([...], 3)`), `HA_TRUTH` requires.

### M1 — MEDIUM: w2-harmony-truth offered as the 5th conversation
Sera offers one quest per talk (`npc-actions.js:169-170`, `offered[0]`), order: mq-exodus, sq-terminals, mq3-vessel, sq-cs-voices, then «Лицо на листовке». A player who answers "Позже" gets the same first quest every time. Five full dialogues with the "Расспросить" menu to reach wave-2 content; boring, and it is easy to never see it.

### L1 — Low: Russian grammar in turn-in toast / journal
"Вернуться к Инспектор Досмотр", "к Часовой Будильник", "к Хранитель Истории" (nominative instead of dative). Source: `turninText` / quest `back` hints built from `NPCS[id].name`.
### L2 — Low: w2-name `offer` (and `skip`) have no payoff
`ladov-offer-soul` only sets a flag; c8 is gated by `ladov-name-known` and the `ladov-trade` result needs the c8 "обмен" choice, so after `offer` the arena plays as before and no scene/radio reacts (checked: with only `ladov-offer-soul` c8 does not start). Also no radio for `offer`/`skip`.
### L3 — Low: verdict modal hides DCs
"Суд / Финал" lists options without skill/DC (`closed` 15->13 with Lox alive is invisible), unlike check scenes. Epilogue: 4 slides only; the faction strip is repeated on every slide and clipped with "…"; "Отпуск" and "Lox жив" slides say the same thing.
### L4 — Low: no radio for w2-laugh `kept`, w2-harmony `quiet`, w2-customs `stamp` at once (tax appears after 6 days, fine). Spec asks one radio line per quest; `kept` has none.
### L5 — Info: c8 QTE label "Назвать: Г-А-Л-Д" shows Cyrillic while keycaps are Latin G A L D (physical keys, layout-independent, works). Wrong letter from the QTE set ends the series at once (`cine.js:216`), a stray `X` is ignored.
### L6 — Info: journal gives no clue progress (which of 4 clues done, where). Only goal text.

## Cinematics and timing
- c4: three branches reached by real keys (plea -> witness tap -> closing -> roll). Tap «Протест!» window 1.2 s: pressed ok at 0.4 and 1.05 s. Mash «Не дать себя переселить!» need 10 in 3.5 s (about 3/s): ok at about 4/s. Fair.
- c6: c6 plays first when the quest enters `inside` (queue `c6-lox-door`, `c4-court`), both play back to back without problems. Mash «Вытащить Lox!» need 12 in 4 s (3/s): fair on paper; my pace test failed only because comic mode runs at 4 fps here and drops presses that share a game step (`cineKey` counts one press per step). `qte=skip` gives `lox-alive-door` + `door-halfsealed`; failure gives `lox-dead`, `lox-leaflet`, Lox leaves.
- c7: tap «Блокировка» 1.2 s: ok when pressed at 0.3, 0.9, 1.15 s (game time). Only trigger found: after the reactor clue (and c3 plays first on arrival at the reactor if unseen). Result flags `lox5-woke-seen` / `lox5-partial` OK.
- c8: choice -> seq Г-А-Л-Д 3.6 s for 4 keys. Pace 1.0 s first key + 0.8 s per key = ok; 1.0 + 0.9 s gaps = fail at 3.6 s. So the window allows a slow human; ok (fair). Wrong key -> `ladov-torn` (arena boss at 90 %), full -> `ladov-named`. Flags and arena reaction verified.
- Cinematic text/choice readability OK (screens `qa40-cine-sheet.png`, `qa40-c8-qte.png`).

## Fun / clarity notes
- Good: dry-absurd texts (customs, laugh), radio lines land; w2-laugh and w2-customs are short, clear and have a real moral choice. c4/c6 chain feels coherent.
- Boring: the quest-giver menu (5 talks with Sera), the same "Проверка: <quest name>" label for every clue (button does not tell which clue it is; only the sub-line does).
- Confusing: quest checks at four different nodes with no map hint in the journal; Sokralnya entry is a hostile gate (stealth DC 14) before the clue even starts.

## Screenshots (tools/out)
`qa40-offer-harm.png`, `qa40-journal-harm.png`, `qa40-cine-sheet.png` (c8/c7 choice, c8 Ladov, c7 wake), `qa40-c8-qte.png`, `qa40-c7-qte.png`, `qa40-verdict-won.png`, `qa40-verdict-lost.png`, `qa40-verdict-won-lox-alive-door.png`, `qa40-verdict-won-lox-dead.png`, `qa40-epilogue-sheet.png`, `qa40-hard-end.png`, `qa40-laugh-loc.png`, `qa40-cold-loc.png`.

## Not covered
w2-customs `fake` ambush after 4 days (flag `customs-inspector-gone` seen, no ambush observed in UI), closed-node access after `customs-closed`, 6-day `judge-knocks` ambush, `kiberspeys-door` grave node, Lox-9 NPC appearing at the grave, real 3D QTE timing on GPU hardware, the c4 Judge-avatar draw fight played to the end (win path injected).
