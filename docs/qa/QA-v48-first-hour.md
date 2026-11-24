# QA v48 — new-player first hour (2026-11-24)

Verdict: **НА ДОРАБОТКУ** (no crashes, 0 console errors; but battle 1 is a wall and the first hour could only be verified up to prologue battles 1-3).
Method: Playwright, headless Chromium, `?gfx=3d` (SwiftShader), real mouse/keys only, no state injection. Scripts: `tools/out/qa48-*.mjs` (`qa48-lib*.mjs` helpers, `qa48-m.mjs` full-flow bot, `qa48-r.mjs` roguelike). Screenshots `tools/out/qa48-*.png`.
Caveats: SwiftShader is slow, so no real FPS/stall numbers (two browsers at once even made `page.screenshot` time out: harness contention, not a bug). The bot is crude (click-attack, Steel Fist, Dash vs archer), so win-rate numbers are a lower bound. Playwright `keyboard.type` of Cyrillic does not reach the name field (no keydown); typing via `press('KeyV')` works. Harness only.

## Timeline (wall clock from page load)
| t | Event |
|---|---|
| 0:05 | Main menu (2D, pixel sprites; 3D not visible until battle/creator). Tagline + 4 buttons. `qa48-01-menu.png` |
| 0:08 | "Новая игра" -> step 1 race/class/path/name + mode (Recommended / Free). `qa48-02-create.png` |
| 0:12 | Enter -> straight to Appearance (step 3 of 4; steps 1-2 not labelled). 3D GLB model, tabs Основа/Тело/Лицо/Волосы/Одежда/Детали, presets/random/undo, rotate/zoom. Works. `qa48-03-after-enter.png`, `qa48-10-look-cloth.png` |
| 0:20 | Step 4 "Происхождение и таланты" -> Начать. `qa48-11-after-look.png` |
| Free mode | Stats 27 pts, skills, proficiency sliders (3 pts), phobias: each +2 pts, max 3 -> header "Очки: 6 / 27 + 6 (фобии)", Далее disabled with red "Не распределено 6 очков". Works. `qa48-04-free-next.png`, `qa48-06-phobias.png` |
| 0:15 after Начать | Prologue: 20 lines of text-only dialogue on black with one 2D sprite (radio "Голос Пустошей" humor, seer, explosion). ~30 s of reading with Space; Esc skips. `qa48-20-step00.png` |
| 0:32 | "Загрузка сцены…" blank screen, then c1-arrival 3D cinematic: choice with timer bar (4 options tagged Мягко / Смешно / Жёстко / Молчать), QTE "Проскочить! Жми E 0/8". Good, funny, readable. `qa48-21-p1.png`, `qa48-21-p3.png` |
| 0:42 | Battle 1 "Склад запчастей" (banner with hint). **Time to first fun ~45 s of play, but first real choice is the cinematic at 0:37; first combat action ~0:55.** |
| 1:55-12:00 | Battle 1: bot lost ~8 of 9 tries (once won b1 and b2, lost b3). Retry works; no softlock. |
| not reached | Hub, quests, world map travel, level-up, radio (V), codex, inventory on model: **NOT VERIFIED** (could not win prologue battles with the bot). |
| Run mode | Забег: squad pick (4 of 11 locked) -> StS-style map -> node -> 3D battle at 0:15. Works, no errors. |

## Acceptance of the brief (what was reachable)
- Main menu: OK. Character creation, appearance editor on GLB: OK. Proficiency sliders: OK. Phobias +2 pts each: OK.
- Prologue c1-arrival: OK (3 choices/QTE, no errors). Humor lands in the radio intro and in "Достать мятую брошюру «Добро пожаловать на Гармонию!»".
- First 3-4 battles: only battle 1 (and once 2-3) seen. Hub / quests / travel / level-up / radio / codex / inventory: not verified.
- Console: 0 errors/warnings in every run (menu, creator, prologue, battle, run mode).

## Issues
| # | Sev | Issue | Repro | Where |
|---|---|---|---|---|
| 1 | **High** | Battle 1 is a wall for naive play. 30 HP vs 2 fanatics + sniper; fanatics apply Горение / Запах крови / electro DoT (−3..−5 per turn) that melts HP; the player has no explanation of statuses and the "Снять: Горение" button only appears when burning. Bot lost ~8/9. Sniper kites at range; Round 14 reached. Defeat text is nice but no tip ("Use cover / cleanse / dash"). | New game -> Recommended -> play battle 1 with click-attack. `qa48-40-battle-2-lose.png` | balance of `b1` in `game/src/scenes/prologue.js` / `ENCOUNTERS`, status DoT |
| 2 | **High** | Quick slots 1-2 are **empty** in battle 1; toast "Пустой быстрый слот. Положи гранату или стим в разгрузку…" but the creator screen lists "На поясе: Аптечка, Самодельная граната" and there is no gear access during the prologue fight. The medkit promised at creation is unusable. `qa48-43-medkit1.png` | Battle 1, press 1 | prologue hero loadout -> quick slots (`battle.js` quickBtns, `prologue.js`) |
| 3 | Med | Intro is 20 lines of text on a black screen with a single 2D sprite before any interaction (~30-40 s). Opening is wordy; the first real hook (the cinematic) starts at 0:32. | Start new game, press Space | `prologue.js` intro dialogue |
| 4 | Med | Battle camera: units tiny, hero and enemies overlap in a clump at adjacency; picking the right cell needs care; "Дальше бюджета хода: сначала Рывок" toast is jargon. `qa48-32-b1-selA2.png` | Battle 1 | `scene3d.js pickBattle`, `battle.js` metric move |
| 5 | Med | Raw key in the log: "+2 buff.speed (2)" (wolf "Вой/Клык", roguelike battle 1). Missing text key `buff.speed`. `qa48-54-run-node2.png` | Забег -> first node | `game/src/ui/battle-log.js:83`, `game/src/data/text/index.js:180` (add `buff.speed`) |
| 6 | Med | Roguelike: map icons (⚔ ☠ $ ▣ ? ♨ ♛) have no legend; role labels English "tank / ranged / caster / support"; "Память киберспейса: 0" and "Восхождение" unexplained; Enter on empty squad gives no feedback; Старт disabled without reason hint beyond a grey line. `qa48-50-run-start.png`, `qa48-52-run-next.png` | Menu -> Забег | `run-start.js:22` (`tp.role`), `run-map.js` |
| 7 | Low | Create screen: name hint "кликни и печатай" overlaps the "Режим" label. `qa48-02-create.png` | Menu -> Новая игра | `create.js` layout (name `b.y+b.h+6` vs mode label `oy+396`) |
| 8 | Low | Mode step numbering: Recommended jumps to "Шаг 3 из 4"; steps 1-2 never shown; step 4 screen has no "Шаг 4 из 4" and "боевой: 0/2" is unexplained. | Recommended -> Enter | `create-look.js`, `create-talents.js` |
| 9 | Low | Hero looks differ between creator, portrait (dark hair in create card, blond/orange in battle portrait) and cinematic (short brown hair). Possibly random per-scene hair colour. `qa48-02-create.png` vs `qa48-30-battle1.png` | any | portrait-of.js / model builder |
| 10 | Low | Battle hint line "ПКМ по юниту — меню (атака, карточка) · Tab · F · Enter…" is clipped and drawn over the map bottom. | Battle | `battle.js` hint text |
| 11 | Low | Right-click shows an info card, not a menu as the hint says ("меню (атака…)"). | Battle, RMB enemy `qa48-31-rmb.png` | battle.js |
| 12 | Info | Empty dark info panel in roguelike battle (no card when nothing selected), battle tint very dark. | Run battle | `qa48-54-run-node2.png` |

## Top-10 improvements (impact on a new player)
1. Rebalance / soften battle 1 (HP, DoT damage, or give a free heal); add a defeat tip naming what killed you.
2. Fill quick slots with the Аптечка and the grenade (or let the prologue open the belt), and show what a medkit does.
3. Tutorial prompts in battle 1: "click enemy = attack, Q = Steel Fist, cover +2 КБ, burning: use 'Снять'".
4. Shorten the prologue intro (merge lines, 3-4 per screen, or an inline radio image) and put the cinematic first.
5. Camera framing: zoom to the active hero and the nearest threat on turn start; make the hero outline/ring stronger against the clump.
6. Explain status icons (Горение, Запах крови) with a hover tooltip in the unit card and one-line log reason.
7. Fix `buff.speed` and audit all `t()` keys for raw keys (log, cards).
8. Roguelike onboarding: legend for node icons, Russian role names, one-line premise, reason text on disabled Старт.
9. Creator step counter consistent (1-4 everywhere) and fix label overlap.
10. Keep one hero look across creator / portrait / cinematic / battle (consistency sells the editor).

## Open (not verified, next pass)
Hub, first quests, world-map travel, first level-up, radio (V), codex, inventory/equipment on the model, performance on real GPU. Needs a stronger bot or a save written by the human; do not inject state.
