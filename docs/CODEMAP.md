# Code Map

> Карта кода: читай её **вместо того, чтобы открывать файлы подряд**.
> Ведёт `game-programmer` и обновляет в том же коммите, где меняет структуру.
> Формат: файл — за что отвечает — главные экспорты — кто вызывает.

## Вход
- `game/index.html` — canvas на всё окно, фон `#14141c` (цвет `0`), грузит `src/main.js`.
- `game/src/main.js` — игровой цикл (фиксированный шаг 1/60), объект `game` { ctx, canvas, width, height, input, data, hero, save, time, scene, setScene, resume, modals, openModal, closeModal, toasts, toast }; пока открыт модал, сцена не получает `update`. Canvas = размер окна 1:1 (минимум 1280×720, меньше — даунскейл CSS); на resize зовёт `scene.resize?.(game)`. `window.__game` для плейтестов (`__game.scene.id`, у боя `__game.scene.S`).

## Системы
- `game/src/input.js` — `createInput(target, canvas)` → { isDown(code), wasPressed(code), typed() (символы за шаг), mouse { x, y, clicked, rightClicked, inside }, endFrame() }. Координаты мыши — в пикселях canvas. Вызывает: `main.js`.

## UI (`game/src/ui/`)
- `draw.js` — `C` (палитра по ключу), шрифты `FONT/FONT_B/FONT_L/FONT_XL`, `LINE`, `text`, `wrap` (кеш), `textBlock`, `fit`, `panel`, `button`, `hitButton`, `inRect`, `bar` (полоса ресурса по STYLE), `resLine`, `icon`/`drawIcon` (PNG из `game/assets/icons/`), `clear`.
- `battle-log.js` — `formatEvent(S, e)` → строка лога (сегменты `[text, colour]`), `eventSound(S, e)` → `play(...)`, `teamColor(u)`.
- `battle-view.js` — `layoutBattle(game, S)` (+ `.buttons(S)` — при многих способностях две строки, `.result(game, S)`), `renderBattle(game, S)`, `isHiddenFoe(u)`.
- `modal.js` — модальные окна (стек `game.modals`; спека `{ title, lines, options:[{label, sub, disabled, keep, run}], build?, onCancel? }`, клавиши 1–9/Enter/Esc) и тосты (`game.toast(text, colour)`, справа сверху): `updateModal`, `renderModal`, `updateToasts`, `renderToasts`, `message`.
- `checks-ui.js` — окна проверок навыков: `openCheck` (выбор навыка → кто бросает → бросок с режимом и модификаторами), `openGroupCheck`, `openChallenge` (N успехов до M провалов), `resultLines`.

## Мир (`game/src/world/`) — логика без DOM
- `data.js` — единая точка доступа к данным мира: реэкспорт `data/world/*` (`REGIONS`, `LOCATIONS`, `START_LOCATION`, `ROUTES`, `ENCOUNTER_TABLES`, `QUESTS`, `EVENTS`, `ORIGINS`…), `GADGETS/gadgetFor`, `SPECIALIZATIONS`, `NPC_DIALOGUE`, `PARTY_EVENTS_TEXT`; хелперы `npcsAt`, `encounterEnemies(encId, size, {reduce})` (первые `ceil(n×s/4)`), `encounterName/Map`, `npcGreeting/npcTopics`, `storyText/speakerName`, `baseId` (`'cleaner^2.2'` → `'cleaner'`), `SHOP_STOCK`.
- `reputation.js` — обёртка над `data/world/origins.js`: `applyRep(save, f, Δ)` → список изменений с распространением, `repTier`, `tierAtLeast`, `factionName`, `startingRep`, `FACTION_IDS`, `TIERS`.
- `checks.js` — проверки навыков поверх `rules/skills.js`: `checkInfo(member, skill, extraAdv)` (режим, владение, бонусы талантов/примочки/предметов), `checkChance`, `rollCheck`, `hasWorldFlag`, `worldFlagValues`, `skillName`.
- `state.js` — сохранение как состояние мира: `newSave(hero)`, `members`, `buildHero`/`buildCompanion`/`partyUnits` (через `buildCreature({talents, activeCombat, gadget})`), `recruit/canRecruit`, `requiresOk`, `grant(save, Effects)` → тосты, `gainXp` (через `rules/progression.js`), `deed` (одобрение и уход компаньонов), `companionRepCheck`, `restDepartures`, `restParty`, `visit/discover/isKnownRoute/routesFrom`, `locFaction`, `encounterThreshold`, `pickEncounter`, `learnTalent`, `partySize`, `journal`.
- `quests.js` — интерпретатор схемы `data/world/quests.js`: `questsOffered`, `startQuest`, `slots/slotsAt` (исполнимые цели этапа: choice/battle/check/challenge/pay; `all`-подцели), `completeSlot`, `chooseOption`, `failSlot` (onFail), `onArrive`, `onTalk`, `onBattleWon`, `autoProgress` (item/terminal/doneFlag), `currentGoalText`.
- `arena.js` — `makeWorldMap({seed, enemies, hazard})` — процедурная карта боя, если у встречи нет своей.
- `game/src/save.js` — `localStorage['ruslania-save-v1']` в try/catch: `hasSave`, `loadGame`, `saveGame`, `deleteSave`.

## Сцены (`game/src/scenes/`)
Контракт сцены: `{ id, enter?(game), update(game, dt), render(game), resize?(game), resume?(game) }`. `game.setScene` вызывает `enter`, `game.resume(scene)` возвращает в уже открытую сцену (вызывает `resume`).
- `menu.js` — `menuScene`, `continueGame(game)` («Продолжить» при наличии сохранения), `randomHero`, `startQuickBattle`.
- `create.js` — страница 1: раса/класс/путь/имя → «Далее». `create-talents.js` — страница 2: происхождение (`originAllowed`), мировоззрение, 4 слота талантов (`talentsForSlot`, ≤ 2 боевых), примочка класса, «+1 к характеристике» у человека → пролог.
- `dialogue.js` — `createDialogueScene({ title, lines, hero, portraits, onDone })` (реплика может нести `name`; портреты NPC — `drawPortrait`), `toLines`.
- `battle.js` — `createBattleScene({ hero | heroes(game), map | map(seed), enemies, allies, ambush, title, intro, hint, winText, defeatLines, barks, race, onEvent, onWin, onLose?, onExit })`. Несколько героев (партия): управляемый юнит меняется по ходу. Засада: враги +5 к инициативе.
- `prologue.js` — `startPrologue(game, hero)` → эпилог → `startWorld(game, hero, flags)` (новое сохранение, +350 опыта, хаб `START_LOCATION`).
- `location.js` — `createLocationScene(locId)`: вход по репутации (`entry`), NPC (говорить: приветствие по порогу + расспросы, торговля, наставник/импланты, наём, квесты), действия (цели квестов, бои узла, тайники, терминал, отдых/лечение/возвращение душ, слухи, привал, выступление), полоса партии, тосты, ивенты при входе/отдыхе. `tierColor(tier)`.
- `world-map.js` — `createWorldMapScene()`: узлы (`drawMapIcon`), пути с днями и опасностью, туман, путь по графу, дни, бросок встречи в логе (`d20 ≤ 3×danger+mod`), засада, встречи (бой/событие/торговец/слух/NPC), поиск скрытых узлов, ивенты в пути.
- `world-battle.js` — `startWorldBattle(game, { encounter | enemies, allies, map, location, faction, ambush, id, onWin, onLose? })`, `encounterSetup` (финал с учётом терминалов и `finaleMods`; финал только для 3+ бойцов). Запись ЗДР/МРЛ в сохранение, опыт, смерть → Киберспейс.
- `event.js` — `eventsFor(save, loc, 'enter'|'rest')`, `travelEvents(save, region)`, `runEvent(game, ev, then)` — уникальные ивенты.
- `cyberspace.js` — `startCyberspace(game, { reason, helped })`, `createCyberspaceScene()`, `nearestOursTerminal`: 3 узла (бой или проверка, СЛ 13 + Отметины), помощь партии, Отметины Судьи, 3 = конец игры.
- `panels.js` — `createPanelsScene({ tab: 'party'|'rep'|'journal', back, canSwap })`: партия (ресурсы, предметы, резерв/отряд, таланты и их набор, новый талант, «ИИ ведёт компаньонов»), репутация (шкала и пороги), журнал (квесты и события).

## Движок правил (`game/src/rules/`)
Чистый JS без DOM и без импорта данных: данные передаются параметром `data`
(`{ RACES, CLASSES, STATUSES, ENEMIES, SUMMONS?, ENCOUNTERS, VEIL_TABLE, PROXY_STORM_TABLE }`, ключи можно и в нижнем регистре; `normalizeData`).
Работает в браузере и в Node. Решения по дырам спеки — комментарий в начале `combat.js`.
- `rng.js` — `createRng(seed)` → `rng()` ∈ [0,1) + `.int(a,b)`, `.pick(arr)`, `.getState/.setState`; `hashSeed(v)`.
- `dice.js` — `parseDice('2d6+3')`, `rollDice(rng, expr, crit)`, `rollDiceDetail`, `avgDice`, `firstDie`, `d20(rng, {adv, dis})` → `{natural, rolls, mode}` (adv+dis гасятся), `chanceD20(need, mode)`.
- `character.js` — `buildCreature({race, cls, level, stats, path, team, data, id, anyStat})` (race/cls — объект или id; stats — до расовых бонусов, по умолчанию `recommended` пути/класса; путь переопределяет weapon/armor/recommended/role; бросает ошибку при запрещённой `allowedRaces`), `buildEnemy(def|id, {id, team, data, kind})` (`weapon.attack` — готовый бонус), `isAllowed(race, cls)`, `mod`, `profBonus`, `pointBuyCost`, `normalizeData`, константы `STATS`, `ARMOR_DEX_CAP`, `TIER_BONUS`.
  Таланты и примочки (v2): `buildCreature({..., talents: [ids], activeCombat?: [ids], gadget?: id})` — пассивки и способности активных боевых талантов (лимит `data.COMBAT_TALENT_LIMIT(level)`, иначе понятная ошибка) и примочки; мировые эффекты всех талантов → `creature.worldFlags` `[{id, value, factions, source}]` и `creature.skillMods` `{skill: {bonus, adv, sources}}` (движок их не применяет). Новые пассивки: `maxHp`/`maxMrl`/`maxEnr`, `{cond: 'targetWounded', hit?, dmg?}`, `thorns: {dice, dmgType}`. `creature.build` — всё для пересборки. `resolveTalents`, `isCombatTalent`, `defaultCombatTalentLimit`.
- `skills.js` — проверки вне боя: `skillCheck(creature, skill, dc, {adv, dis, rng, data, bonus})` → `{roll, total, success, mode, tier, bonus, parts}` (специализация — преимущество + владение, смежный — обычный + владение, остальное — помеха); `skillTier`, `SKILL_STATS`. `data` = `{ SPECIALIZATIONS, SKILLS? }`.
- `progression.js` — `XP_THRESHOLDS`, `levelForXp`, `xpForLevel`, `xpToNext`, `battleXp(battle | enemyIds, data)` (убитые и «Сломлен»), `questXp(q)` (`rewards.xp` / `QUEST_XP`), `gainXp(hero, amount, data)` → `{xp, level, leveledUp, levels, talentPicks}`, `rebuildHero(creature, {level, data, keepDamage})` (сохраняет путь, статы, таланты, примочку, id).
- `grid.js` — `parseMap(def)` → `{w,h,tiles,starts:{P,E,A},exits}` (точки построчно), `makeArena({w,h,heroes,enemies,cover})`, `chebyshev`, `lineOfSight` (Брезенхэм, стены), `hasCover` (+2 КБ), `reachable(g,x,y,max,occ)` (BFS, 8 направлений), `pathTo`, `findPath` (A*), `distanceField`, `nearestFree`, `T_*` тайлы.
- `combat.js` — бой. `createBattle({map, heroes, enemies, allies, data, seed, log, onEvent, autoReactions})` → battle; `getLegalActions(b, unitId)`; `perform(b, action)` → `{ok, error?, events}`; `endTurn(b)` → events; `isAiTurn(b)`, `currentUnit(b)`, `getReachable(b, id)`, `unitView(b, u)`, `checkVictory(b)`.
  Действия: `{type:'move', to}` · `'dash'` · `'disengage'` · `{type:'attack', target}` · `{type:'ability', ability, target? | tile?}` · `{type:'endStatus', status}` · `'endTurn'` (+ `unit`).
  Состояние: `b.units[]` (`x,y,hp,mrl,enr,statuses,buffs,shield,down,dead,team,kind`), `b.turn` (`unitId, move, actions, bonus, disengaged, lostControl`), `b.round`, `b.winner`, `b.log[]`.
  События лога `{type, actor, target, round, ...}`: battleStart, initiative, roundStart, turnStart/turnEnd, move (path), dash, disengage, attack (roll, kb, hit, crit), damage (amount, dmgType, resource hp|mrl, absorbed, value), heal, shield/shieldBreak/shieldEnd, status/statusEnd/statusImmune, tick, buff/buffEnd, mark, cleanse, save, ability (overcast), overcast (roll, d10, row), push, teleport, summon/unsummon, reaction, opportunity, hazard, down, downTick, death, stabilize, deathSave, nadlom, breakdown (heartbreak|lostControl|broken), broken, bigHit, skipTurn, standUp, hallucination, extraAction, victory.
  Правила v1.2: «Сломлен» у не-боссов (`u.broken`, `u.removed`), `OVERCAST_LIMIT` = 2 (`u.overcastsUsed`), помеха дальней атаке в упор (`enemyAdjacent(b, u, x?, y?)`).
  Призывы растут с уровнем призывателя: `SUMMON_HP_PER_LEVEL` = 3, `SUMMON_DMG_PER_LEVEL` = 1 за уровень выше 1 (`scaleSummon`). Пассивка `thorns` → событие `thorns`.
  Константы правил: `BREAKDOWN_HEARTBREAK_MAX`, `HEARTBREAK_HP_LOSS`, `BREAKDOWN_MRL_RESET`, `NADLOM_FRACTION`, `BIG_HIT_FRACTION`, `BIG_HIT_DC`, `COVER_KB`, `DOWN_TURNS_TO_DEATH`, `OVERCAST_LIMIT`. Победа: `map.lose === 'heroDown'` — любой герой лёг → `'enemies'`; `makeArena` ставит `lose: 'teamDown'` (вся сторона).
  Шанс попадания для UI: `attackOdds(b, u, target, bonus, isMeleeAttack(b, u, action), isWeapon)`.
  Хелперы для ИИ/UI: `attackOdds`, `saveFailChance`, `damageMultiplier`, `getKb`, `getSpeed`, `getDc`, `abilityTargets`, `abilitySpecs`, `targetValid`, `abilityUsable`, `dealDamage`, `applyStatus`, `healUnit`.
- `ai.js` — `chooseAction(b, unitId)` → одно действие (вызывать до `endTurn`), `playTurn(b)` — весь ход ИИ + `endTurn`; `evalAction`, `evalAbility`, `planTile`. Профиль — `unit.ai` (`melee|ranged|caster|support`).
- `simulate.js` — `simulateBattle({map, heroes, enemies, allies, data, seed, maxRounds, log})` → `{winner: team|'draw', rounds, survivors, log?}`; `simulateMany(params, n, seed0)`.

## Данные
- `game/src/data/skills.js` — `SPECIALIZATIONS[classId] = {spec, related}`, `DC` (world.md, п. 5). Создан программистом по таблице спеки; владелец — game-designer.
- `game/src/data/factions.js` — `FACTIONS`, `STANCES`, `RELATIONS[a][b]` (кем b является для a), `stance(a,b)`. 14 фракций из канона.
- `game/assets/icons/*.png` — 256×256: `class_{face,fighter,rogue,tech}`, `race_{human,mutant,skeleton,synth}`, `res_{hp,energy,morale}`.
- `game/src/data/index.js` — `GAME_DATA` (пакет данных для движка, в т. ч. `TALENTS`, `GADGETS`, `SPECIALIZATIONS`, `SKILLS`), `PLAYABLE_RACES`, `CLASS_ORDER`, `MAPS` (prologue-1..3, hatch-1, burning-field-1).
- `game/src/data/text/index.js` — `t(key)`, все строки интерфейса (ru): `menu.*`, `create.*`, `battle.*`, `role.*`, `stat.*`, `dmg.*`, `act.*`, `buff.*`, `area.*`; фолбэк на `PROLOGUE`.

## Инструменты
- `tools/playtest.mjs` — headless-плейтест (окно 1280×720): скриншоты в `tools/out/`, код выхода 1 при ошибках консоли.
- `tools/test.mjs` — тесты движка правил на фикстурах (`node tools/test.mjs`, код 1 при провале).
- `tools/fixtures/rules-data.mjs` — маленькие данные по схеме спеки (2 расы, 2 класса, 3 врага, статусы, таблица завесы).
- `tools/smoke-rules.mjs` — смоук на реальных данных: класс × играбельная раса × путь × ур. 1/5 против `ENCOUNTERS.standard1/5` + сюжетные карты (`--n 20 --seed 1`).
