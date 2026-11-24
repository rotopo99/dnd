# QA v49 — new-player first hour, pass 2 (2026-11-24)
Real UI only, `?gfx=3d`, no state injection. Scripts: `tools/out/qa49-*.mjs`; screenshots `tools/out/qa49-*.png`. Console: 0 errors/warnings in the whole run.
Note: headless swiftshader runs the world map at ~7 fps and makes screenshots time out; not counted as a bug.

## Timeline (wall clock)
- 0:00 menu -> Recommended -> look step (Шаг 2 из 3) -> talents (Шаг 3 из 3) -> Начать.
- 0:15 intro dialogue, 0:30 cinematic (choices/QTE), 0:46 battle 1 (tutorial hint panel, quick slots filled: grenade + medkit).
- 2:10 battle 1 won (bot: Стальной кулак, medkit at hp<=15, chase via metric move + Рывок). Prologue battle 2 -> win by ~5:10; dialogue; ~5:30 hub (roam) with level-up popup (Ур. 2).
- 6:00 level-up via «Выбрать новый талант» OK (Болевой порог). Party/Equipment/Codex tabs OK. Node menu, Sera dialogue -> 3 quest offers -> took «Третий исход». Radio (V) OK, 4 news items.
- 8:00 world map: ONE click on «Гидропоника» starts travel at once, charges 50 креды (-> 0), day 3. Random encounter «Арингли, морской змей (древний)» 395 HP, level 16; "ambush" from failed perception, exit locked. Hero (36 HP) died in round 1 (-62 HP hit). 
- Defeat -> Киберспейс (3 guard nodes, bot won 2/2) -> «Душа вернулась» -> Реактор Гармонии, day 5, 0 креды, HP 18/36, codex find popup. Quest destination (Коррупция-Сити) is not on the map.

## Re-check of v48 issues
| # | v48 issue | v49 |
|---|---|---|
| 1 | Battle 1 wall | Fixed: won 3 of 3 runs with medkit; tutorial hint panel visible. No defeat tip seen (boss loss shows only «Герой пал.») |
| 2 | Quick slots empty | Fixed (Аптечка + граната, medkit heals +8) |
| 3 | Long intro | Improved: dialogue 15 s, cinematic at 30 s, battle at 46 s |
| 4 | Battle camera tiny / jargon toast | Not fixed: units still small, wide framing (`qa49-43-medkit8.png`) |
| 5 | raw `buff.speed` | Fixed in code (`data/text/index.js:186`), not seen in play |
| 6 | Roguelike legend / English roles | Not re-tested |
| 7 | Create screen label overlap | Fixed |
| 8 | Step numbering | Fixed (1/3, 2/3, 3/3) |
| 9 | Hero look differs between scenes | Not fixed: creator = dark skin + mohawk; party card/dialogue/battle portrait = blond hair, brown skin (`qa49-02-create.png` vs `qa49-62-sera.png`) |
| 10 | Hint line over map | Partly: now one line, still drawn over the map bottom |
| 11 | RMB text | Fixed ("карточка и действия") |
| 12 | Empty info panel | Fixed (Подсказка panel) |

## New issues
| # | Sev | Issue | Repro | Where |
|---|---|---|---|---|
| 13 | **Critical** | Unwinnable random encounter on first travel: 395 HP lvl-16 boss vs a lvl-2 solo hero, "Выход закрыт до 2-й фазы", no flee; killed in one round. Costs the ferry fee too. | Hub -> M -> click Гидропоника -> Дальше x2 | world-map encounter table (`worldmap`/`encounters`), level gating of "road" encounters; `qa49-70-enc.png`, `qa49-71-boss.png` |
| 14 | High | World-map click travels instantly and pays 50 креды (all of them) with no confirm/cost preview; no money left afterwards. | M -> click a sea node | `scenes/worldmap.js` click handler |
| 15 | High | Quest «Третий исход»: "Добраться до ворот Коррупция-Сити", 485 days, but the city is not on the map / no marker / no hint how to get there. Journal has no direction. | Take quest from Sera, open M | quest data, worldmap fog/markers |
| 16 | Med | Death is silent: «Герой пал.» then jump to «Киберспейс» with «Отметины Судьи 0/3», «Пройдено 0/2» (3 nodes) with no explanation; no defeat tip for non-prologue fights. | Lose a road battle | defeat screen in `battle.js`, `cyberspace` scene |
| 17 | Med | After the first talk Sera offers 3 quests at once (key + two side); the first-hour player gets no priority hint beyond «Ключевой квест». All 6 NPCs have "!". | Node menu -> Сера -> Уйти | `npc-actions.js` offerQuest |
| 18 | Med | Hub free-roam: NPCs walk, so clicking a "!" NPC walks the hero but no dialogue opens; no tutorial for «Меню узла» (Tab) which is the only reliable way to talk. | Click an NPC | `scenes/roam.js` |
| 19 | Med | World map: labels of the home cluster overlap («Реактор Гармонии», «Пост караула», «Реактор D»), "Гармония" over "Гидропоника" at zoom 0.6. | M, zoom out | `worldmap.js` label layout |
| 20 | Low | Equipment/party tabs have no 3D model of the hero ("on the model" not available); large empty area; «Помеха на скрытность» jargon. | P -> Снаряжение | `panels` equipment |
| 21 | Low | Codex Bestiary empty after the prologue fights (cultists not recorded); Characters empty after meeting 6 NPCs until talking. | Кодекс | codex hooks |
| 22 | Low | Level-up: HP 30 -> 36 fine; talent list is 20 items with no recommendation. | Party -> Повысить уровень | level-up modal |
| 23 | Low | Radio: «в Коррупции-Сити» vs quest «Коррупция-Сити» (naming inconsistent). | V | text data |

## Top-10
1. Gate/rescale road encounters by level (13); give a flee option.
2. Travel confirmation with cost and danger (14).
3. Mark quest target / give directions to Коррупция-Сити (15).
4. Defeat explanation + tip, explain Киберспейс and Отметины (16).
5. Prioritise quests: show main quest first, defer side quests (17).
6. Roam: clickable NPCs while they walk / hint for Tab menu (18).
7. Same hero look in all scenes (9).
8. Battle camera zoom to action (4).
9. World-map label collisions (19).
10. 3D hero model in equipment panel (20).

## Not verified
Roguelike run mode, buff.speed in play, quests 2-3 (Sera side quests, other NPCs), actually reaching another location (blocked by 13), shops, rest (Привал).
