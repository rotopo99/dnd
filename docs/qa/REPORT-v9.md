# QA REPORT v9 (regression)

Stand: clean tree, HEAD after "WIP: consequences/crime and base/backstories". Scripts: `tools/out/qa9-*.mjs`; screenshots `tools/out/qa9-*.png`.

## Automated runs
- `node tools/test.mjs`: 166 passed, 0 failed.
- `node tools/smoke-rules.mjs --n 1`: 846 battles, 0 exceptions.
- tools/out/*.mjs (26 scenarios):
  - PASS: avatar, base-create, combat-rework, companions-scenes, consequences, density, exodus, inventory, music-check, stage-a, stage-b-surfaces, turnin, v3-create, v3-map, v4-portraits, v4-skills, vendors-codex, world-edge, world-logic.
  - FAIL desc-shots: "loot: key 1 takes all" and "gear tooltip" -> REAL BUG B1 (loot is lost).
  - FAIL v3-battle ("equip swaps"): STALE. Shift+LMB in the grid is now a quick move, not "equip"; the test expects the old counter model.
  - FAIL v5-levels (5 FAIL + crash on `S.buttons`): STALE. Looks for level-up as a scene with buttons; it is now modals (my direct run qa9-levels works).
  - FAIL scenario.mjs (`reach` of undefined): STALE (old unit API).
  - TIMEOUT prologue-flow, world: STALE (flow got the "Внешность" step create-look; Enter no longer reaches the prologue as scripted).

## Walkthrough
| Step | Result |
|---|---|
| New game, 3D look (rotate, zoom, accessories, random) | OK, no console errors |
| Backstory (modal + details), neutral alignment, talents + details panel | OK, save: alignment neutral, bg, talents, avatar (see B6, B8) |
| Prologue -> hub, +350 xp, level 2 | OK |
| NPC: talk, topics, quest offer on "Уйти", recruit (Lox: disabled with reasons), steal, attack | OK. Buttons clipped: B3 |
| Merchant (stock, details panel, key-gated greyed rows) | OK; truncated labels B7 |
| Masterwork purchase | OK: pump-shotgun masterwork, credits -297, +1 hit / +1 dmg in buildHero |
| Inventory (drag, rotate, shield->off-hand, mod, quick) | OK (inventory.mjs, 9/9) |
| Check scene (d20 animation, result) | OK (companions-scenes, screenshot cs-result.png). Cache search uses a modal, not the scene (by design?) |
| Turn-in (return/radio) | OK (turnin.mjs 5/5) |
| Battle: intents, odds, RMB pin, Esc unpin, F fast toggle, key 1 grenade with zone preview | OK. Surfaces - stage-b-surfaces 5/5 |
| Level-up hero + companion (modal chain, ASI, companion auto-ASI) | OK |
| Map: Exodus HUD, "На базу" (H), arrival at base | OK (see B9, B10) |
| Codex B, Journal (Последствия, Эпилог button) | OK |
| Save S -> slot, Load L from menu | OK |
| Old save (no v, no bag, no exodus/codex/met/base, unknown location) | loads, location falls back to hub, no errors. No real fixture exists (tools/fixtures has only rules-data.mjs) - emulated in qa9-old*.mjs |
Console errors in all my scenarios: 0.

## Bugs
### B1 BLOCKER. Battle loot (items) is destroyed
Repro: `tools/out/qa9-loot.mjs` (or any `openLoot` with items): fresh save (items medkit 2, grenade 1), `openLoot(g, {credits:12, items:[grenade x2, rusty-plate, medkit]})`, key 1 "Забрать всё".
Expected: grenade 3, medkit 3, rusty-plate 1. Got: credits +12 and the toast "В рюкзак: предметов 4", but items end as `{medkit:2, grenade:1}`: the quick-slot grenade moved/removed, rusty-plate gone. Nothing on the ground.
Cause: `world-battle.js openLoot take()` (~l.166-174) calls `addInst` (which does not update the `hero.items` counter) and then `syncItems`, which treats the stale counter as "old code deleted items" and `takeItem`s the difference. Needs `refreshView(save)` after the addInst loop (before syncItems), or wrap in `mutate(...)` as `shop.js:98` does. Same pattern, probably the same effect: `world/base.js:186` (garden/custom items `addInst` -> stash without `refreshView`).
Evidence: desc-shots.mjs FAIL, qa9-32-loot.png.

### B2 SERIOUS. Hub: no hotkey G (inventory)
G works only inside the panels scene (P first). In the hub and on the map G does nothing. If the brief/GDD says "инвентарь G", it needs a handler in `location.js` (~l.968) and `world-map.js` (~l.605). Minor if only P-G is intended.

### B3 SERIOUS (visual). NPC buttons are clipped when 5-6 buttons
`location.js` ~l.895: `bw = min(.., floor(380/acts.length)-4)`. 6 buttons (Sekiro, Великая/Тин Арена) = 59 px: "Говор…", "Купит…", "Украс…", "Напас…" (qa9-07-npc6.png). 5 buttons (72 px): "Купить у наставника" clipped in 33 of the nodes (mentors); 4 buttons - 13 more. Fix: give the name column less room / two-line row / short label "У наставника" / icons.

### B4 MINOR. Hub nav buttons truncated
"Репутац…", "Сохрани…" (98 px) in location (qa9-06-hub.png). Same widths for Esc "Меню".

### B5 MINOR. Duplicate NPC "Распорядитель Гонг" in Великая Арена (two rows, different portraits; one with quest "!").

### B6 MINOR. Dev text in backstory descriptions
"Беженец с Небесного базара": "добавляется фобия высоты (триггер как в create-build)". Last option's sub-line is cut off with "…" (qa9-04-bg.png). Details panel for the highlighted option shows only the generic header until hover.

### B7 MINOR. Shop labels truncated
"Втюхать хлам по полной цене: Обман С…", "Купить: Помповое ружьё (Мастеровое) …", hotkey digit overlaps the label on the 2nd column (qa9-12-shop.png). "кач. 1/2" in labels is a cryptic number (working=1, masterwork=2) next to the word "(Мастеровое)".

### B8 MINOR. Create-talents: origin "Житель Нейтральных селен…" truncated (qa9-03-talents*.png).

### B9 MINOR. Map: hint line overlaps the bottom-left buttons
"Масштаб ×1.5 · ..." is drawn under "−", "К партии", "Ночью: нет" (qa9-25-map-base.png).

### B10 MINOR. "На базу" button is active when there is no known route
From Альфа-Гармония: press H -> toast "Нет известного пути" only. The button should be disabled / explain (`world-map.js` nav 'base' -> `startTravel`). Hidden route to the bunker starts at dacha-babki (flag `galina-told`).

### B11 MINOR. Journal
"Квестов пока нет." is shown together with the "Последствия" section; the consequence line shows only the quest name ("Пустой котёл") without the outcome text (qa9-28-journal.png).

### Notes (not bugs)
- Loading with the empty slot option does nothing (no feedback).
- Companion Андрей ASI is auto (+2 INT) when loyalty < 20: as designed.
