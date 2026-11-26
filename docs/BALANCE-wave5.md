# Balance: content wave 5 (2026-11-26)
Sim: `node tools/sim/wave5.mjs [--n 40] [--seed 3] [--tier 0] [--only crown]` — party of 3/4 (leader class x all 11 classes, random mates, random paths/races), level = encounter level, best gear of the tier a player has by then (L8-9: tier 2, L10-11: tier 3, L12: tier 4), full HP, 2 medkits, AI-controlled. This is an optimistic party: the 4-party is expected above the 60-85% band; 3-party is the benchmark. Existing non-boss waves 3-4 battles (wp-patrol/host L16) also sit at 96-100%, so ~95% for 4 is in line.

## 1. Battles (win%, n=20 per class, seed 7)
Pass 1 (HP-heavy) fixed the win rate but fights took 11-15 rounds; director asked for 6-9 rounds at 65-80% (party 3). Pass 2 trades HP for damage.
| Encounter | Lvl | P3 original | P3 pass 1 (rounds) | P3 final (rounds) | P4 original | P4 final |
|---|---|---|---|---|---|---|
| enc-w5-census | 8 | 100 | 79 (15) | 71 (9.1) | 100 | 98 |
| enc-w5-crown | 9 | 100 | 71 (13) | 75 (7.8) | 100 | 99 |
| enc-w5-bridge | 10 | 100 | 73 (14) | 71 (9.7) | 100 | 96 |
| enc-w5-edict | 11 | 99 | 77 (11) | 78 (6.7) | 100 | 98 |
| enc-w5-storm | 12 | 88 | 74 (8) | 64 (6.6) -> pass 3: 92 (6.2), see §1a | 99 | 94 -> 98 |

Final numbers (enemies-wave5.js, helper `W(base, L, tag, rank, hpK, dmgK, hit)`; same unit counts and types): hpK 1.0 everywhere (rank elite, or miniboss for sawman/gunners L8, terminalist, agitator; storm tekhonka is `cmd`); weapon and ability damage dice x dmgK, weapon to-hit +hit: census/bridge/edict dmgK 2.6 hit +2, crown 1.7 hit +1, storm scriptlets 1.5 hit +1. Remaining limits: census (9.1) and bridge (9.7) are slightly above the 9-round target and storm P3 is 64%; the P4 party stays at 94-99% (optimistic best-gear AI). Weakest class is reper (AI issue, separate ticket). Battle XP: census 606->1260, crown 1189->1535, bridge 1499->2606, edict 1530->1862, storm 1904->2346 (a fight is 6-14% of a level span).

## 1a. Pass 3: enc-w5-storm in real play (QA v56 #2)
QA: 9-15 rounds, 4 of 6 lost, while the sim said 64%. The gap was not the map: the sim now has `--map roam` (the real battle: a 24x13 cut of the Свобода free map, party on random cells, all foes `ROAM.battle.foeGap` = 5 tiles toward the nearest exit, as `scenes/roam.js` provider.cut) and that alone gave 69% (7.8 rounds) vs 65% on the arena. No reinforcements or eve mods touch this encounter. The gap is the **chain**: with no tech / proxy skill all three fieldwork nodes are fights in a row and HP / medkits carry over (`--chain 3`); at 64-78% per fight the chain was 4% with no rest and 53% with the two short rests the party has (`--rest short`: breather + short rest between fights, REST.short.max = 2). QA's starter gear (save hack) mattered little: tier 1 vs tier 4 = 74% vs 69% per fight.

Pass 3 (target: the whole forced fieldwork ~70% for a party of 3, 6-9 rounds per fight): helper `X(src, tag, dmgK, hit, hpK)` copies a built V / N enemy. Commander `w5-tek-cmd-l12` dmg x0.5, HP x0.85 (storm 7d6 -> 4d6); `w5-shaman-l12` arc x0.5, HP x0.85 (4d8+7 -> 2d8+7, x3 per battle on a clumped party); scriptlets `w5-scr2-l12` HP x0.85, dmg x0.8, no to-hit bonus. XP unchanged (2346).

`node tools/sim/wave5.mjs --only storm --n 20 --seed 7 --map roam` (+ `--chain 3`):
| Mode | P3 win (rounds) | P4 win (rounds) |
|---|---|---|
| one fight, real map | 90 (6.9) | 98 (3.9) |
| one fight, arena | 92 (6.2) | - |
| 3 fights + 2 short rests | **70 (6.6)** | 89 (4.4) |
| 3 fights, no rest | 22 (7.2) | - |
| 3 fights + rests, tier-1 gear | 67 (6.2) | 87 (4.8) |
Remaining risk: a party that skips the short rests between nodes still loses most chains; the rest window is one key away in the node, no hint yet (design call).

## 2. Quest rewards (xp / credits), same-level references: L7 w3-sorter 750, w3-liza 900; L8 w3-flags 1300, w2-harmony-truth 900; L9 w2-name/w3-apology 1000; L12 sq-new-body 900
| Quest | Lvl | XP before | XP after | Credits before | after |
|---|---|---|---|---|---|
| w5-census | 7 | 450 | 800 | 120 | 120 |
| w5-bread | 8 | 600 | 950 | 0 | 100 |
| w5-crown | 9 | 650 | 1000 | 150 | 150 |
| w5-recruit | 10 | 700 | 1100 | 100 | 150 |
| w5-two-trails | 10 | 600 | 1000 | 0 | 120 |
| w5-edict | 11 | 500 | 900 | 0 | 100 |
| w5-schedule | 12 | 900 | 1300 | 200 | 200 |
Problem: wave 5 paid 30-50% below waves 3-4 at the same level. Total quest XP 4400 -> 7050; with 5 battles (~8.7k) wave 5 gives ~16k of the ~77k needed from L7 to L12 (about 20%), so it cannot over-level; the other quests/random fights fill the rest. Quests alone never level a hero by design (spans 11-21k), so the band is carried by battles.

## 3. Items
| Item | Before | After | Verdict |
|---|---|---|---|
| crown-shard | mrlGuard 1 (same as wave-3 recycle-tag, price 90) | same | OK, no stronger than recycle-tag |
| rhyme-book | Deception +1 world | same | OK; below the +2 norm (35 of 47 world items give +2); `check-scenes` caps item bonus at +2 total |
| proxy-capacitor | maxEnr +1, Proxy +1 (key) | maxEnr +4, Proxy +1 | +1 ENR was a dead stat (class talents give +10); +4 stays below them |
| tin-oath-cord | Persuasion +1 | same | OK |

## 4. Checks
`node tools/test.mjs`: 397 passed, 0 failed. `node tools/out/wave5-flow.mjs`: OK, no softlocks (430 walks). Pass 3: same.
