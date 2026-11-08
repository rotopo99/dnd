# QA REPORT v12 (regression)

Stand: HEAD db66ac0 "Exodus escalation ...". Scripts: `tools/out/qa12-*.mjs`; screenshots `tools/out/qa12-*.png`. Game code not touched.

## Automated runs
- `node tools/test.mjs`: 204 passed, 0 failed.
- `node tools/smoke-rules.mjs --n 1`: 846 battles, 0 exceptions.
- tools/out/*.mjs (47 files): all PASS, 0 console errors, except:
  - `objectives.mjs` ("FAIL hack progress 0") and `v3-battle.mjs` ("grenade aiming: null" -> TypeError) failed once each in the first sequential run, then passed 5/5 and 4/4 reruns: FLAKY on timing (waits on real time), not game bugs.
  - `qa9-hub.mjs`: STALE (`o[6].run is not a function`, modal option indices changed).
  - `world.mjs`: STALE, timeout (as in v9).
  - desc-shots, v3-battle (equip), v5-levels, scenario, prologue-flow, qa9-loot*: now pass (the v9 STALE/B1 entries are resolved).

## v9 bugs regression
| v9 | Status |
|---|---|
| B1 loot destroyed (BLOCKER) | FIXED (qa9-loot: grenade 3, medkit 3, rusty-plate 1, toast "В рюкзак: 4") |
| B2 no G in hub/map | FIXED (G in hub -> panels tab gear) |
| B3/B4 clipped NPC / nav buttons | FIXED visually (qa12-02-hub-Z.png, 6 buttons fit) |
| B10 "На базу" without route | FIXED (disabled + reason, world-map.js:151) |
| B5, B6, B7, B8, B9, B11 | not rechecked in depth (minor) |

## Checklist
- New game (3D look, backstory, talents) -> prologue -> hub: OK (qa12-flow, no errors).
- G conflict: hub/map/panels G = inventory (gear); in battle G = interact (button disabled when no object), no cross effect. OK.
- Q W E R (abilities) vs 1-6 (quick): independent; empty/disabled quick slots do nothing, 20-key spam without errors. OK (qa12-keys, qa12-06).
- Rest (Z on map; "Привал" in hub): short/long, rations. With wanted heat >= threshold: warning lines in the modal, short rest -> group Stealth check, long rest + failed check -> encounter -> battle -> back to the node (day 2, no errors). OK (qa12-rest*, qa12-03, qa12-12).
- Leap-slam onto an occupied tile (enemy / ally / self): rejected `badTarget`, no stacking; adjacent tile OK. OK. (Note: stacking seen only when a test teleports units by writing x/y without `b.occ`; not a game bug.)
- Companion promotion with talent + ASI: party-talents.mjs OK (ASI window -> talent instead of ASI -> level talents).
- "Одеть лучшее" for all -> undo: snapshot restored exactly (bags, equipment, stash, counter); repeat run idempotent. OK (qa12-best).
- Retreat with a boss: D disabled "Выход закрыт до 2-й фазы босса"; after phase 2 whole party exits -> modal "Партия отступила", back to the previous node, day +1. OK (qa12-boss).
- Exodus mark 3: long trip -> modal "Долгий переход" with days; Esc cancels, no travel. OK (qa12-exo).
- Amnesty: disabled with reason (no item), enabled after getting items, pays, heat 0, rep +10, flag amnesty:<f>. OK (qa12-amn).
- Squad size: max 4; extra recruits become `waiting`; reserve/rejoin OK (qa12-squad).
- Old v9 save (no rest/wanted/pendingTalents/tv/codex.flags, old auto-ASI): loads, companions get pendingTalents 2, codex flags added; panels/rest/battle work. OK (qa12-old).

## Bugs
No blockers or serious bugs found.

### B1 MINOR. Hub has no Z hotkey for rest
Map: Z = Привал; hub: only the button "Привал" (no key hint). Fix: handler in `location.js` ~l.1017 (next to KeyG) if consistency is wanted.

### B2 MINOR. Flaky browser scenarios
`tools/out/objectives.mjs`, `v3-battle.mjs`: time-based waits fail occasionally under load. Make them wait on state.

### B3 MINOR. Stale scripts
`qa9-hub.mjs`, `world.mjs` do not match current flows; delete or update.

### B4 MINOR. Heat spread removes the companion silently
Setting heat 5-6 for a faction (addHeat) made Андрей leave the party in my tests (by design "уход напарников на 5"); the rest modal then lists only the hero. Check that there is a toast/log line at leaving (not verified visually).

### Notes
- `canRecruit` returns null (ok) even when the squad is full; the limit is enforced in `recruit` (-> `waiting`) and UI via `squadFree`. Verify the recruit dialog tells the player that the new companion goes to reserve.
- Not verified visually: gifts UI, codex finds toast, 3D hero animation (covered by test.mjs / avatar.mjs, which pass).

## Verdict: ПРИНЯТО
