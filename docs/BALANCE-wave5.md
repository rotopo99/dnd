# Balance: content wave 5 (2026-11-26)
Sim: `node tools/sim/wave5.mjs [--n 40] [--seed 3] [--tier 0] [--only crown]` — party of 3/4 (leader class x all 11 classes, random mates, random paths/races), level = encounter level, best gear of the tier a player has by then (L8-9: tier 2, L10-11: tier 3, L12: tier 4), full HP, 2 medkits, AI-controlled. This is an optimistic party: the 4-party is expected above the 60-85% band; 3-party is the benchmark. Existing non-boss waves 3-4 battles (wp-patrol/host L16) also sit at 96-100%, so ~95% for 4 is in line.

## 1. Battles (before -> after, win%, n=20..40 per class)
| Encounter | Lvl | Party 3 before | Party 3 after | Party 4 before | Party 4 after | Rounds (3) after |
|---|---|---|---|---|---|---|
| enc-w5-census | 8 | 100 | 79 | 100 | 99 | 15 |
| enc-w5-crown | 9 | 100 | 71 | 100 | 99 | 13 |
| enc-w5-bridge | 10 | 100 | 73 | 100 | 96 | 14 |
| enc-w5-edict | 11 | 99 | 77 | 100 | 98 | 11 |
| enc-w5-storm | 12 | 88 | 74 | 99 | ~95 | 8 |

Problem: the lifted units were grunts/specialists with hp from `hpFor`; the fights ended in 3 rounds. Fix (enemies-wave5.js, same unit counts and types): own ids via `W(base, L, tag, rank, hpK)`: guards/pickers/magnets/knifers/neophytes/drones -> `elite` with hpK 1.5-1.8; sawman, terminalist, agitator -> `miniboss` (hpK 1.3-1.9); storm: tekhonka vet -> `cmd`, scriptlets elite hpK 1.4. Weakest class vs. these in 3-party: reper (~50-55%) — the AI plays him badly, not a wave-5 issue. Fights are long (11-15 rounds for 3) because the fix is HP-heavy; if the designer wants shorter, cut hpK ~20% and raise rank instead. Side effect: battle XP per fight rose (census 606->1260, crown 1189->1535, bridge 1499->2606, edict 1530->1862, storm 1904->2346); spans at L8-12 are 14-21k, so one fight is 6-14% of a level.

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
`node tools/test.mjs`: 397 passed, 0 failed. `node tools/out/wave5-flow.mjs`: OK, no softlocks (430 walks).
