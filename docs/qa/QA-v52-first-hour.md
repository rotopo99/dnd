# QA v52 — first hour, third pass (build 491946a, `?gfx=3d`, real UI)

Tools: `tools/out/qa52-sess.mjs` (persistent session, bot from qa49), `qa52-cmd.sh`. Screenshots `tools/out/qa52-*.png`. Console errors/warnings: **0** in the whole session (menu, create x3 races, prologue, hub, map, Гармония, shop, rest, cyberspace, roguelike, codex, 4 quality levels).
Note: the machine was loaded by other jobs (sim scripts); screenshots hit 30 s timeouts twice and rAF dropped to ~1-8 fps. Not a game bug, but the heavy 3D scene on a software GL is slow.

## Timeline
| t | Event |
|---|---|
| 0:00 | Menu -> create (human) -> prologue. Dialogue 16 s, cinema 25 s, battle 41 s |
| 1st run | Prologue battle 1 **lost** (bot, 0/30 HP at round 9); defeat window fits its box; tip «прячься за ящик (+2 КБ)» present |
| 2nd run | Won 3 battles, level 2, hub (Альфа-Гармония) at ~6:30 |
| hub | Clicked NPC Ганс while walking: hero walks to him, NPC menu opens (2.5 s). Tab menu OK. |
| Sera | Talk -> «Где сейчас интересно?» -> «Сера: есть дела (3)»: ★ «Сеть терминалов» recommended, «Остальное подождёт». Took it; offer window re-opens with the other two |
| Map | Quest markers: «?» on nodes, edge arrows, dashed circle «Цель квеста — где-то здесь». Click on a sea node -> confirm window (days, danger, cost, «Не хватает кредов»). Travelled to Гармония (30 cr) |
| Гармония | Shop Лопух: bought bottle (20->6), sold (6->7). Long rest: day 6->7, 1 ration. |
| Node battle | «Бой: Рощёвые стражи» (1 lvl-? vine strangler, 46 HP, +12 to hit) lost; defeat text explains Киберспейс/Отметины; cyberspace 3 nodes: won battle, failed check (20 %), won battle -> «Душа вернулась» at **Реактор Гармонии** (not where the fight was) with 18/36 HP |
| Quest 2 | Sector D (free land travel, 2 days, no confirm) -> Тушёнкин «Пустой котёл» -> challenge failed -> stage «Бой» |
| Gear/Codex | Equipment tab has a 3D model; Bestiary lists cultists with win counts |
| Other races | Skeleton-robot and synth: creator OK (3D), skeleton prologue dialogue/battle portrait OK |
| Roguelike | «Забег»: Russian roles, locked heroes with price, map legend, 2-hero squad, node battle starts |
| Quality | 4 levels cycle, no errors |

## Re-check of open v49 issues
| # | Issue | v52 |
|---|---|---|
| 13 | Unwinnable road encounter | Not reproduced (the one road roll was «тихо»). The «Обойти» window was **not seen**: no road encounter triggered in 1 trip; not verified |
| 14 | Travel confirm | Fixed for paid routes (days, danger, cost). Free land route (Сектор D, 2 days) travels with no confirm |
| 15 | Quest direction | Partly: markers/arrows exist, but target nodes are in fog ("где-то здесь") and 3 of 5 terminals are in Коррупция-Сити; quest needs 3 -> impossible at lvl 2 without CC (see #2) |
| 16 | Silent defeat | Fixed: text fits, explains Киберспейс, Отметины, node count. Tip only if known enemy type |
| 17 | 3 quests at once | Fixed (★ recommended, rest deferred) |
| 18 | NPC click while walking | Fixed |
| 19 | Map label overlap | Partly: home cluster still stacks 5 markers, label of the party node hidden/«Альфа-Гарм…я: жилые п…» truncated, red alarm icon on top of the node |
| 20 | Equipment 3D model | Fixed (small, bottom-right; big empty area remains) |
| 21 | Empty bestiary | Fixed |
| 22 | Level-up 20 talents | Not re-tested |
| 23 | CC naming | Not re-tested |
| v48 #6 | Roguelike legend/Russian | Fixed |
| v49 #9 | Hero look differs | Fixed in dialogue/party card/gear; creator = same dark skin |
| v49 #4 | Battle camera tiny | Fixed (units larger); wide map battles still small |

## Issues
| # | Sev | Issue | Repro | Where |
|---|---|---|---|---|
| 1 | High | Prologue battle 1 lost in 2 of 3 bot runs (human and skeleton): round 9, 0/30 HP; medkit use sometimes "12 -> 12" (no heal) | Prologue, play with bot `qa49-bot.mjs`; seen in log `MEDKIT hp 12 -> 12` | battle balance / medkit item use |
| 2 | High | «Сеть терминалов» (marked ★ "по силам сейчас", lvl 2) needs 3 of 5 terminals, but 3 are in Коррупция-Сити (lvl ~17) and the other two (ostanovka, ruins-m38) are fogged; trip costs 70+ cr with 50 cr start. Not completable in the first hour | Take quest, open M | `data/world/quests.js` sq-terminals (min:3), `data/world/locations.js` |
| 3 | High | Credits dead-end: 50 cr start, trips 30-70 cr, shop sells at 1 cr (bottle bought 14, sold 1; rations 1). After one trip player (7 cr) cannot return/travel | Travel to Гармония, buy, then M | economy: fares, sell ratio in `shop.js` |
| 4 | Med | Node battles «Бой: Рощёвые стражи» have no difficulty preview; solo lvl 2 hero (36 HP) vs 46 HP enemy, +12 to hit: lost in 4 rounds | Гармония -> Tab -> Бой | node encounter list, `scenes/location.js` |
| 5 | Med | After cyberspace the hero wakes at Реактор Гармонии (another location, 1 day away) at 18/36 HP without explanation of the move | Lose node battle, finish cyberspace | cyberspace return, `scenes/cyberspace.js` |
| 6 | Med | Accepting Sera's quest toasts «Исход отложен на 4 дн.» (unexplained; not shown for quest 2) | Take «Сеть терминалов» | `data/world/exodus.js:54` |
| 7 | Med | Free travel (Сектор D) skips confirm and silently spends 2 days (day 7->9) and spawns a find popup immediately | M -> click Сектор D | `world-map.js` click handler |
| 8 | Med | Challenge UI: shows «3/2» in action list (successes/failures ambiguous), skill buttons without chance, then extra «Кто бросает?» window with a single option | Sector D quest -> Решить -> Уговорить | `scenes/check-scene.js` |
| 9 | Low | Keys pressed right after another modal action are swallowed (Digit2 then Digit4 in pause menu: second ignored) | Pause -> 2 -> 4 quickly | modal key handling |
| 10 | Low | Settings «Качество» changes look very little in battle at 1280x720 (low vs high nearly identical); no hint of what each level does | Settings -> Качество x3 -> Быстрый бой | `gfx/quality.js`, `ui/settings-ui.js:53` |
| 11 | Low | Creator skin label «Синт: чёрный металл» for Скелет-робот with white body; skeleton and synth bodies are nearly identical (only head differs) | Create -> race | create-look data |
| 12 | Low | Prologue cinema first shot is an empty room; hero not in frame while text speaks | Prologue ~25 s | cinema camera |
| 13 | Low | Loading a save opens an auto «Находка» popup before control | Continue | location enter |
| 14 | Low | Party tab «Активные боевые 0/2 — » empty with ability list below, unclear | P | `panels` party |
| 15 | Low | Sera/offer rows are text-truncated («…»), centred inconsistently | Sera offers | offer window |

## Top-10
1. Make sq-terminals completable at lvl 2 (or don't mark ★) (#2).
2. Fix first-hour economy: fares vs start cash, sell prices (#3).
3. Prologue battle 1 balance / medkit (#1).
4. Show difficulty on node battles (#4).
5. Explain relocation + HP after cyberspace (#5).
6. Explain «Исход отложен» (#6).
7. Confirm/cost for free trips (#7).
8. Simplify challenge UI (#8).
9. Verify the «Обойти» window (not triggered in this pass).
10. Make quality levels visibly different / documented (#10).

## Not verified
«Обойти» road-encounter window; terminal quest completion; quest 3; level-up recommendation; skeleton/synth in a cinematic with the hero in frame (battle lost before it) and synth in battle (only portrait screenshots attempted).

## Verdict: НА ДОРАБОТКУ
