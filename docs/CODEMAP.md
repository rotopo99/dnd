# Code Map

> Карта кода: читай её **вместо того, чтобы открывать файлы подряд**.
> Ведёт `game-programmer` и обновляет в том же коммите, где меняет структуру.
> Формат: файл — за что отвечает — главные экспорты — кто вызывает.

## Вход
- `game/index.html` — canvas на всё окно, фон `#14141c` (цвет `0`), грузит `src/main.js`.
- `game/src/main.js` — игровой цикл (фиксированный шаг 1/60), объект `game` { ctx, canvas, width, height, input, data, hero, time, scene, setScene }. Canvas = размер окна 1:1 (минимум 1280×720, меньше — даунскейл CSS); на resize зовёт `scene.resize?.(game)`. `window.__game` для плейтестов (`__game.scene.id`, у боя `__game.scene.S`).

## Системы
- `game/src/input.js` — `createInput(target, canvas)` → { isDown(code), wasPressed(code), typed() (символы за шаг), mouse { x, y, clicked, rightClicked, inside }, endFrame() }. Координаты мыши — в пикселях canvas. Вызывает: `main.js`.

## UI (`game/src/ui/`)
- `draw.js` — `C` (палитра по ключу), шрифты `FONT/FONT_B/FONT_L/FONT_XL`, `LINE`, `text`, `wrap` (кеш), `textBlock`, `fit`, `panel`, `button`, `hitButton`, `inRect`, `bar` (полоса ресурса по STYLE), `resLine`, `icon`/`drawIcon` (PNG из `game/assets/icons/`), `clear`.
- `battle-log.js` — `formatEvent(S, e)` → строка лога (сегменты `[text, colour]`), `eventSound(S, e)` → `play(...)`, `teamColor(u)`.
- `battle-view.js` — `layoutBattle(game, S)` (+ `.buttons(S)`, `.result(game, S)`), `renderBattle(game, S)`: кеш статичного слоя карты (offscreen canvas, огонь анимируется поверх), масштаб клетки ×1..×3 под окно, подсветки, юниты, полоски, попапы, пузыри реплик, панель героя/цели/порядка ходов, лог, баннер, итог.

## Сцены (`game/src/scenes/`)
Контракт сцены: `{ id, enter?(game), update(game, dt), render(game), resize?(game) }`.
- `menu.js` — `menuScene` (стартовая), `randomHero(data)`, `startQuickBattle(game, hero?)` (случайный герой vs `ENCOUNTERS.standard1` на `makeArena`). Клавиши: Enter — новая игра, Q — быстрый бой.
- `create.js` — `createCreateScene()`: раса (`playable`), класс (`isAllowed`), путь, имя; превью и итоги через `buildCreature`. Старт → `startPrologue`.
- `dialogue.js` — `createDialogueScene({ title, lines, hero, onDone })`, `toLines(v)` (строка → реплика рассказчика). Пробел/клик — дальше, Esc — пропустить.
- `battle.js` — `createBattleScene({ hero, map?, enemies?, allies?, seed?, title, intro?, hint?, winText?, defeatLines?, barks?, onEvent?(S,e), onWin(game,S), onExit(game) })`. События движка идут в очередь и проигрываются по одному (`move` ждёт анимацию). Ход ИИ — по шагам `chooseAction` с паузой ~0.42 с. Состояние `S`: `b`, `disp` (отображаемые позиции/ЗДР/МРЛ), `sel`, `reach`, `buttons`, `log`, `popups`, `bubbles`, `result`.
- `prologue.js` — `startPrologue(game, hero)`: вступление → сцена 1 → `prologue-1` → … → `prologue-3` (Ганс) → эпилог → меню. Отдых между боями = новый `buildCreature`. Сюжетные реплики в бою (скрилет, аколит на ½ ЗДР, Ганс упал).

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
  Константы правил: `BREAKDOWN_HEARTBREAK_MAX`, `HEARTBREAK_HP_LOSS`, `BREAKDOWN_MRL_RESET`, `NADLOM_FRACTION`, `BIG_HIT_FRACTION`, `BIG_HIT_DC`, `COVER_KB`, `DOWN_TURNS_TO_DEATH`, `OVERCAST_LIMIT`. Победа: `map.lose === 'heroDown'` — любой герой лёг → `'enemies'`; `makeArena` ставит `lose: 'teamDown'` (вся сторона).
  Шанс попадания для UI: `attackOdds(b, u, target, bonus, isMeleeAttack(b, u, action), isWeapon)`.
  Хелперы для ИИ/UI: `attackOdds`, `saveFailChance`, `damageMultiplier`, `getKb`, `getSpeed`, `getDc`, `abilityTargets`, `abilitySpecs`, `targetValid`, `abilityUsable`, `dealDamage`, `applyStatus`, `healUnit`.
- `ai.js` — `chooseAction(b, unitId)` → одно действие (вызывать до `endTurn`), `playTurn(b)` — весь ход ИИ + `endTurn`; `evalAction`, `evalAbility`, `planTile`. Профиль — `unit.ai` (`melee|ranged|caster|support`).
- `simulate.js` — `simulateBattle({map, heroes, enemies, allies, data, seed, maxRounds, log})` → `{winner: team|'draw', rounds, survivors, log?}`; `simulateMany(params, n, seed0)`.

## Данные
- `game/src/data/factions.js` — `FACTIONS`, `STANCES`, `RELATIONS[a][b]` (кем b является для a), `stance(a,b)`. 14 фракций из канона.
- `game/assets/icons/*.png` — 256×256: `class_{face,fighter,rogue,tech}`, `race_{human,mutant,skeleton,synth}`, `res_{hp,energy,morale}`.
- `game/src/data/index.js` — `GAME_DATA` (пакет данных для движка), `PLAYABLE_RACES`, `CLASS_ORDER`, `MAPS` (prologue-1..3).
- `game/src/data/text/index.js` — `t(key)`, все строки интерфейса (ru): `menu.*`, `create.*`, `battle.*`, `role.*`, `stat.*`, `dmg.*`, `act.*`, `buff.*`, `area.*`; фолбэк на `PROLOGUE`.

## Инструменты
- `tools/playtest.mjs` — headless-плейтест (окно 1280×720): скриншоты в `tools/out/`, код выхода 1 при ошибках консоли.
- `tools/test.mjs` — тесты движка правил на фикстурах (`node tools/test.mjs`, код 1 при провале).
- `tools/fixtures/rules-data.mjs` — маленькие данные по схеме спеки (2 расы, 2 класса, 3 врага, статусы, таблица завесы).
- `tools/smoke-rules.mjs` — смоук на реальных данных: класс × играбельная раса × путь × ур. 1/5 против `ENCOUNTERS.standard1/5` + сюжетные карты (`--n 20 --seed 1`).
