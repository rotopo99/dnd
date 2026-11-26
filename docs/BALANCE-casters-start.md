# Balance: casters on a naive start (prologue battle 1)

Tools: `tools/sim/casters-start.mjs` (naive / q / dmg / ai policies, prologue 1-3 + world fights, `--fix` in-memory patches from `tools/sim/casters-fixes.mjs`), `tools/sim/casters-diag.mjs` (level-1 stat dump). Old `tools/sim/prologue.mjs` gives the same battle-1 numbers.
Policies: **naive** = click-attack only; **q** = naive + the real Q key (first non-reaction ability, only if it targets a foe); **ai** = rules/ai.js drives the hero. n=100-150 seeds (±5%). Note: CLASS_ORDER holds 11 classes, not 12.

## 1. Why casters lose (level 1, human)
| class | HP | KB | basic attack (to-hit / avg dmg) | Q ability (first non-reaction) | Q useful vs a foe? |
|---|---|---|---|---|---|
| zabivnoy (ref.) | 30 | 16 | +5 / 1d8+3 = 7.5 melee | steel-fist (weapon attack) | yes |
| technomant | 31 | 14 | +4 / 1d4+2 = 4.5 range 8 | energy-beam 2 ENR 1d8 | yes (+25 pp) |
| itishnik | 29 | 13 | +3 / 1d6+1 = 4.5 range 8 | **field-repair (heals an ally)** | **no** |
| ecolog / reper / cybertech | 32 / 32 / 33 | 14 / 13 / 13 | melee 1d6+0..1 ~3.5-4.5 | thorns / unfunny-joke / one-dim-shot | yes (reper +11, ecolog and cybertech worse) |

Findings:
1. Three fanatics/gunner (23 HP total) hit the hero from round 2. A 4.5-avg hit at 55-65% needs ~9 rounds; the hero dies in ~5-6. Zabivnoy deals 7.5 at ~80% and wins in ~5.
2. Itishnik: Q is a heal (no target among enemies), the grenade is Q-slot 2 and weak (1d8 fire tile, 12% naive). The real opener is the turret (`deploy-turret`, inventor path): forced Q=turret gives 83% naive. Starting hint says «Q — приём класса: Экстренный ремонт» which is misleading.
3. Itishnik has the lowest HP (hpPerLevel 0) and KB 13.
4. The hint «Q ...» (ui/battle-tutorial.js) appears only after the first attack or on turn 3, long after the first round.
5. Ecolog/cybertech got *worse* with Q (56%/47% vs 68%/63%): first-ability use burns turns on weak 0-2 ENR spells vs plain strike. Not touched (above 60% naive).
6. Side finding, not caused by this change: AI-played **slavotech wins only 15-19%** (naive 85%) in battle 1, ~45-50% in world fights. The AI wastes turns on shields/heals for a lone hero. Needs a separate ai.js ticket.

## 2. Applied change (game/src/data/classes, verified)
| class | change | reason |
|---|---|---|
| technomant | new L1 passive `starter-grit`: +1 hit, +2 ranged dmg | pistol 1d4 is the weakest starting weapon; the item itself is untouched (enemy cultists use it) |
| itishnik | same passive: +1 hit, +2 ranged dmg, +1 KB, +3 HP; `deploy-turret` moved to the first ability slot (Q) | weakest class; Q becomes an offensive opener matching the Inventor path |

Only passives and ability order changed (no items, no TUNE, no engine). `node tools/test.mjs`: 384 passed, 0 failed.

## 3. Battle 1 results (win %, naive / naive+Q / AI)
| class | before | after |
|---|---|---|
| zabivnoy | 100 / 100 / 96 | 99 / 100 / 95 (noise) |
| technomant | 49 / 74 / 100 | **70 / 80 / 100** |
| mutant | 99 / 99 / 100 | unchanged |
| itishnik | 14 / 14 / 97 | **71 / 89 / 99** |
| ranger, arbiter, ugolovnik | 97-98 / 98-100 / 100 | unchanged |
| ecolog | 68 / 56 / 97 | unchanged (optional patch below) |
| reper | 62 / 73 / 100 | unchanged (optional patch below) |
| slavotech | 85 / 85 / 19 | unchanged (AI issue, see 1.6) |
| cybertech | 63 / 47 / 98 | unchanged (optional patch below) |

All classes >= 60% naive. AI win rate: itishnik 97 -> 99 (just over the ~97% cap; technomant was already 100). The cap is already exceeded by 8 of 11 classes before this change (AI is near 100% for all but zabivnoy/slavotech), so it cannot be met by hero-side tuning without hardening the enemies; do not soften TUNE further.

Battle 2 / 3 and first world fights (naive, n=40; world = solo level 2 vs scaled `w-road-crawlers`, `w-road-pirates`):
| class | b2 | b3 | crawlers | pirates |
|---|---|---|---|---|
| technomant before -> after | 15 -> 30 | 18 -> 33 | 0 -> 5 | 0 -> 5 |
| itishnik before -> after | 3 -> 33 | 8 -> 33 | 3 -> 3 | 0 -> 0 |
| zabivnoy (ref.) | 65 | 93 | 45 | 53 |
Prologue battles 2-3 and road fights stay hard for the naive click for most classes (ranger 68/55, ecolog 20/40, reper 25/30, cybertech low): they assume skills and a party. `w-villages-jesters` is 100% for everyone. Not in scope; recommend the hint changes below rather than more numbers.

## 4. Optional follow-ups (not applied)
- Melee casters ecolog / reper / cybertech sit at 62-68% (thin margin). Patch tested (`p-melee2`): L1 passive +1 melee damage -> 81 / 77 / 76% naive, AI unchanged (98-100%).
- Hint (ui/battle-tutorial.js): show the `skill` hint on turn 1 (not after the first attack) and pick the first *offensive* ability, not `abilities.find(non-reaction)`; for support Q say «Q — ...: ставит турель / бьёт по цели».
- Expiry: the passive persists to level 20 (+2 ranged dmg is small there). If wanted, add `maxLevel` to `passiveApplies` (rules/character.js) and set 4.
- Itishnik sapper / mechanic paths have no turret, so Q is still field-repair there; consider junk-grenade first for the sapper.
- AI for slavotech (battle 1: 19%).

## Решения режиссёра (2026-11-26)
- Принято: +1 урона ближнего боя ecolog / reper / cybertech на старте.
- Принято: подсказка умения — с 1-го хода и указывает на первое атакующее умение (а не на лечение).
- Принято: путям Айтишника без турели (сапёр, механик) — атакующее умение на Q.
- Отдельная задача: ИИ Славотеха выигрывает бой 1 лишь в 15–19% (наивный клик — 85%) — баг ИИ.
- Потолок ≤97% для ИИ снят: ИИ-игра ≈100% почти у всех и до правок, это не цель баланса.
