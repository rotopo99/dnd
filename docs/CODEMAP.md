# Code Map

> Карта кода: читай её **вместо того, чтобы открывать файлы подряд**.
> Ведёт `game-programmer` и обновляет в том же коммите, где меняет структуру.
> Формат: файл — за что отвечает — главные экспорты — кто вызывает.

## Вход
- `game/index.html` — canvas 768×432, грузит `src/main.js`.
- `game/src/main.js` — игровой цикл (фиксированный шаг 1/60), объект `game` { ctx, width, height, input, scene, setScene }. `window.__game` для плейтестов.

## Системы
- `game/src/input.js` — `createInput(target)` → { isDown(code), wasPressed(code), endFrame() }. Вызывает: `main.js`.

## Сцены (`game/src/scenes/`)
Контракт сцены: `{ enter?(game), update(game, dt), render(game) }`.
- `title.js` — `titleScene`, заставка. Вызывает: `main.js`.

## Движок правил (`game/src/rules/`)
Чистый JS без DOM и без импорта данных: данные передаются параметром `data`
(`{ RACES, CLASSES, STATUSES, ENEMIES, SUMMONS?, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE }`, ключи можно и в нижнем регистре; `normalizeData`).
Работает в браузере и в Node. Решения по дырам спеки — комментарий в начале `combat.js`.
- `rng.js` — `createRng(seed)` → `rng()` ∈ [0,1) + `.int(a,b)`, `.pick(arr)`, `.getState/.setState`; `hashSeed(v)`.
- `dice.js` — `parseDice('2d6+3')`, `rollDice(rng, expr, crit)`, `rollDiceDetail`, `avgDice`, `firstDie`, `d20(rng, {adv, dis})` → `{natural, rolls, mode}` (adv+dis гасятся), `chanceD20(need, mode)`.
- `character.js` — `buildCreature({race, cls, level, stats, path, team, data, id, anyStat})` (race/cls — объект или id; stats — до расовых бонусов, по умолчанию `recommended` пути/класса; путь переопределяет weapon/armor/recommended/role; бросает ошибку при запрещённой `allowedRaces`), `buildEnemy(def|id, {id, team, data, kind})` (`weapon.attack` — готовый бонус), `isAllowed(race, cls)`, `mod`, `profBonus`, `pointBuyCost`, `normalizeData`, константы `STATS`, `ARMOR_DEX_CAP`, `TIER_BONUS`.
- `grid.js` — `parseMap(def)` → `{w,h,tiles,starts:{P,E,A},exits}` (точки построчно), `makeArena({w,h,heroes,enemies,cover})`, `chebyshev`, `lineOfSight` (Брезенхэм, стены), `hasCover` (+2 КБ), `reachable(g,x,y,max,occ)` (BFS, 8 направлений), `pathTo`, `findPath` (A*), `distanceField`, `nearestFree`, `T_*` тайлы.
- `combat.js` — бой. `createBattle({map, heroes, enemies, allies, data, seed, log, onEvent, autoReactions})` → battle; `getLegalActions(b, unitId)`; `perform(b, action)` → `{ok, error?, events}`; `endTurn(b)` → events; `isAiTurn(b)`, `currentUnit(b)`, `getReachable(b, id)`, `unitView(b, u)`, `checkVictory(b)`.
  Действия: `{type:'move', to}` · `'dash'` · `'disengage'` · `{type:'attack', target}` · `{type:'ability', ability, target? | tile?}` · `{type:'endStatus', status}` · `'endTurn'` (+ `unit`).
  Состояние: `b.units[]` (`x,y,hp,mrl,enr,statuses,buffs,shield,down,dead,team,kind`), `b.turn` (`unitId, move, actions, bonus, disengaged, lostControl`), `b.round`, `b.winner`, `b.log[]`.
  События лога `{type, actor, target, round, ...}`: battleStart, initiative, roundStart, turnStart/turnEnd, move (path), dash, disengage, attack (roll, kb, hit, crit), damage (amount, dmgType, resource hp|mrl, absorbed, value), heal, shield/shieldBreak/shieldEnd, status/statusEnd/statusImmune, tick, buff/buffEnd, mark, cleanse, save, ability (overcast), overcast (roll, d10, row), push, teleport, summon/unsummon, reaction, opportunity, hazard, down, downTick, death, stabilize, deathSave, nadlom, breakdown (heartbreak|lostControl|broken), broken, bigHit, skipTurn, standUp, hallucination, extraAction, victory.
  Правила v1.2: «Сломлен» у не-боссов (`u.broken`, `u.removed`), `OVERCAST_LIMIT` = 2 (`u.overcastsUsed`), помеха дальней атаке в упор (`enemyAdjacent(b, u, x?, y?)`).
  Хелперы для ИИ/UI: `attackOdds`, `saveFailChance`, `damageMultiplier`, `getKb`, `getSpeed`, `getDc`, `abilityTargets`, `abilitySpecs`, `targetValid`, `abilityUsable`, `dealDamage`, `applyStatus`, `healUnit`.
- `ai.js` — `chooseAction(b, unitId)` → одно действие (вызывать до `endTurn`), `playTurn(b)` — весь ход ИИ + `endTurn`; `evalAction`, `evalAbility`, `planTile`. Профиль — `unit.ai` (`melee|ranged|caster|support`).
- `simulate.js` — `simulateBattle({map, heroes, enemies, allies, data, seed, maxRounds, log})` → `{winner: team|'draw', rounds, survivors, log?}`; `simulateMany(params, n, seed0)`.

## Данные
- `game/src/data/factions.js` — `FACTIONS`, `STANCES`, `RELATIONS[a][b]` (кем b является для a), `stance(a,b)`. 14 фракций из канона.
- `game/assets/icons/*.png` — 256×256: `class_{face,fighter,rogue,tech}`, `race_{human,mutant,skeleton,synth}`, `res_{hp,energy,morale}`.
- `game/src/data/text/index.js` — `t(key)`, все строки интерфейса (ru).

## Инструменты
- `tools/playtest.mjs` — headless-плейтест: скриншоты в `tools/out/`, код выхода 1 при ошибках консоли.
- `tools/test.mjs` — тесты движка правил на фикстурах (`node tools/test.mjs`, код 1 при провале).
- `tools/fixtures/rules-data.mjs` — маленькие данные по схеме спеки (2 расы, 2 класса, 3 врага, статусы, таблица завесы).
- `tools/smoke-rules.mjs` — смоук на реальных данных: класс × играбельная раса × путь × ур. 1/5 против `ENCOUNTERS.standard1/5` + сюжетные карты (`--n 20 --seed 1`).
