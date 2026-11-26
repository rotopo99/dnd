# AI fixes: Slavotech and Reper (2026-11-26)

Code: `game/src/rules/ai.js`. Diagnostics: `node tools/sim/ai-diag.mjs` (action mix, downs, damage share), `node tools/sim/wave5.mjs --bycls`.

## Diagnosis

- **Slavotech** (solo road fights, level 2): it fought with the wrench but had the `support` profile, so it kited adjacent foes every turn. Per fight it averaged 9.8 «Отход», 15.8 moves and 6 self-heals against 4.6 attacks, and fights lasted 12 turns.
- **Reper** (wave 5): it recast stacking hymns (`victory-hymn`, `rage-hymn`) every round, and it valued +hit/+dmg on itself and on casters that never roll weapon attacks. That waste is small, though. The main cause is that the reper is the focus-fire target: it takes 43% of the party's damage (90% of it ranged), and it is down by round 3.3 in 84% of the fights it loses. Cybertech (KB 13) shows the same pattern. Enemy archetype `sniper` prioritises support/caster roles, and the reper has the lowest KB.

## Changes

1. `meleeNow(b, u)`: a non-melee unit whose best hostile option (in any slot) is in melee reach does not kite. "Best" means no ranged option is worth at least 0.5 of it. Tile scoring still uses `u.ai`, because using `meleeNow` there too sent level-1 supports into melee and cost 15–20 points in prologue battle 2.
2. `buffUse`: a +hit/+dmg buff on an ally without a weapon, or on a caster/support, is worth ×0.4.
3. Tried and dropped:
   - ENR opportunity price: no measurable gain.
   - Topping-up heals at low value: no gain.
   - Pressure-scaled shields: no gain.
   - A discount for recasting a buff: buffs stack in the rules, and the arbiter lost 5 points on road-pirates.
   - Per-shooter cover in the grid `planTile`: reper +2–3, but the finale collector fights went +7 (seeds 1 and 2), outside ±5.

## Before / after (AI wins, %)

Prologue 1–3 (solo level 1) and world fights (solo level 2), `casters-start.mjs --policy ai --n 100`:

| class | p1 | p2 | p3 | road-crawlers | road-pirates | jesters |
|---|---|---|---|---|---|---|
| zabivnoy | 98→98 | 81→81 | 97→97 | 85→85 | 86→86 | 100→100 |
| technomant | 99→99 | 99→99 | 80→80 | 76→76 | 95→95 | 100→100 |
| mutant | 100→100 | 97→97 | 87→88 | 79→79 | 86→86 | 100→100 |
| itishnik | 99→99 | 100→100 | 91→91 | 83→83 | 93→93 | 100→100 |
| ranger | 100→100 | 100→100 | 98→98 | 80→80 | 99→99 | 100→100 |
| arbiter | 100→100 | 78→78 | 93→92 | 87→87 | 91→91 | 100→100 |
| ugolovnik | 100→100 | 96→96 | 84→85 | 92→92 | 96→96 | 100→100 |
| ecolog | 99→99 | 98→98 | 98→97 | 79→79 | 94→93 | 100→100 |
| reper | 100→100 | 95→91* | 82→86 | 100→100 | 100→100 | 97→99 |
| **slavotech** | 90→85* | 85→85 | 84→83 | **59→76** | **48→86** | 91→91 |
| cybertech | 98→98 | 96→94 | 95→91* | 99→99 | 100→100 | 100→100 |

\* Rechecked at n=300 (before → after): slavotech p1 93→90, p3 76→75; reper p2 94→92, p3 84→88; cybertech p2 95→94, p3 93→91. All of these are within 3 points.

Wave 5, `wave5.mjs --n 60 --bycls` (all 5 battles, parties of 3 and 4):

| zab | tech | mut | iti | ranger | arb | ugo | eco | reper | slav | cyber |
|---|---|---|---|---|---|---|---|---|---|---|
| 84→85 | 88→90 | 86→85 | 90→90 | 84→83 | 89→87 | 84→84 | 90→89 | 74→74 | 90→89 | 83→85 |

Finale, `finale.mjs --small 1` (seed 1, n=20 per class):

| scenario | before | after |
|---|---|---|
| w-eve-1/2/3 | 89/90/96 | 90/91/95 |
| cyber-priest gate/sokr | 59/59 | 61/57 |
| judge 3 term / 0 term / hard | 95/79/73 | 95/79/73 |
| collector / c8 torn / named | 67/71/100 | 67/70/100 |
| wp patrol/host/elite | 100/100/97 | 100/100/97 |

## Status

- Slavotech: fixed. Road fights went from 59/48 to 76/86.
- Reper: the AI waste is removed, but the wave-5 rate is unchanged at 74%. Closing the gap is a class balance question, not an AI one: KB 13, low HP, and being the top focus target. Possible levers are KB/HP, the `sniper` prio for support roles, or per-shooter cover in the AI (if the finale shift is acceptable).
