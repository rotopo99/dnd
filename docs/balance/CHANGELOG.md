# Журнал баланса (balance-tester, 2026-11-03)

Метод: `tools/sim/balance.mjs` (сим A — партия, сим B — соло, `--mode prologue`, `--mode races`). Эффект указан в п.п. вклада (сим A, n=300 при итерациях, 800 в финале; шум одного пути ≈ ±3.5–6 п.п.).
Исходное состояние (до правок): вклад путей вне ±5 п.п. — 16/33 (ур.1) и 26/33 (ур.5), rms 9.2 и 10.5 п.п.
Итог: 6/33 (ур.1) и 10/33 (ур.5), rms 3.9 и 4.4 п.п.; партия 66% / 60%.

## Составы боёв (`game/src/data/enemies.js`)
- `ENCOUNTERS.party1` (новый): 3 культиста, 2 стрелка, скрилет, 2 мусорщика, ползун, мех свалок (10 врагов) — 66% побед. Лор: культ Судьи + мусорщики + мутант-хищник + механизм, `canon/lore/*`, арт мобов.
- `ENCOUNTERS.party5` (новый): 2 культиста-5, 2 стрелка-5, скрилет-5, мусорщик-5, ползун-5, мех-5 (8) — 60%. Кринж-шут в партийных составах не оставлен: он слабо давит партию, ставится в `standard5`.
- `ENCOUNTERS.standard1`: cultist + cultist-gunner + crawler → cultist ×2 + cultist-gunner + crawler. Почему: после ослабления культиста соло ур.1 стало слишком лёгким (мартиалы 78–88%). Эффект: соло ур.1 вне цели 10 билдов, почти все снизу, у мартиалов 58–66%.
- `cultist`: ЗДР 11→10, атака 3→2. `cultist-gunner`: атака 3→2. Почему: prologue-1 был ≈100%. Эффект: prologue-1 ≈ 80%.
- `acolyte` (босс пролога): ЗДР 26→44, МРЛ 24→34, КБ 12→14, кинжал 1d4/атака 3 → 1d8/атака 5, «Шёпот Судьи» 2d6→4d6. Почему: prologue-3 был ≈100%. Эффект: 83% (цель 65–80, минимум класса 55% — СлавоТех).

## Находка по движку (не менял)
- AI/легальные действия не используют способности `range: 0, target: 'tile'` с областью (Энергетический импульс Техноманта не кастовался ни разу). У Техноманта обойдено `range: 3`. Остались с `range: 0`: `beast-roar` (Мутант), `cringe-field` (Рэпер) — ИИ их не применяет; для игрока работает ли выбор тайла при range 0 — проверить UI.
- Один и тот же бой даёт разные результаты при смене числа юнитов (id юнитов из глобального счётчика): шум ±3–4 п.п. на n=300.
- Силы мобов в партийном бою нелинейны: +1 враг = −15…−20 п.п. Состав подбирается дискретно.

## Классы (`game/src/data/classes/`)
Рычаги по порядку из спеки. Эффект — приблизительный (смена нескольких вещей за итерацию).

### Техномант
- `technomant.js` hpPerLevel 0→3; броня cloth kb1 → light kb2 (куртка с экранирующей подкладкой). Ур.1 соло 7%→15%, слабый класс партии (−20 п.п.) вышел к ~0.
- `energy-pulse`: range 0→3 (ИИ не кастует range 0), cost 3→5. Раньше не применялся совсем; после — энергетик +21, затем cost 5 вернул к +4.
- `energy-beam` cost 3→2; `cyber-hack` (Кодер) 1d8→2d6 + ИНТ, cost 3→1 (был −19 п.п.).
- `phantom-blast` (Иллюзионист) level 3→1 (у Иллюзиониста на ур.1 не было атаки; −14 → +5, потом ≈ −2). Вне канона, не противоречит (иллюзии, class-roadmap).
- `cyber-storm` 2d8→2d6, cost 6→8; `energy-blast` 3d8→3d6, cost 8→12, раз за бой; `hologram` cost 2→1; `hypno-pulse` cost 5→4.
- Новая пассивка `phantom-mastery` (ур.5, Иллюзионист): +2 к урону способностей. Канон: «Мастер иллюзий» (class-paths).
### Айтишник
- hpPerLevel 1→0 (ур.1 +17 → +2.6). `mark` 2→1, `weapon-tune` 2→1→2 (финал: +2, был −7 на ур.5), `junk-grenade` 2d6→1d8, cost 3→4.
- `proximity-mine` 2d8→2d6, cost 4→5; `demo-charge` 3d8→2d8, cost 6→8, раз за бой (сапёр +23 → ≈ −1 на ур.5). `combat-drone` 2→3 раза; `deploy-turret` 3→4 хода.
- Новая способность `combat-mech` (ур.5, Изобретатель, 6 ЭНР, раз за бой): призывает `junk-mech` на 4 хода. Вне канона, не противоречит: мех свалок есть в арте мобов, Изобретатель собирает устройства.
### Забивной
- hpPerLevel 2→1 (соло слишком сильный); `sniper-scope` +2→+1 к атаке; `heavy-plating` +2→+1 КБ, новая пассивка `tempered-steel` (ур.5, +1 КБ, чтобы ур.5 не просел); новая пассивка `weapon-mastery` (ур.5): +1 атака, +2 урон (канон: ступень «мастерство» +2 к атаке; бонус считаем ур.5).
### Мутант
- Броня light kb 2→3; `thick-skin` +2→+1 КБ; новые пассивки ур.5: `weapon-mastery` (+1 атака, +2 урон), `feral-might` (Зверь, +2 урон), `killer-eye` (Хищник, крит 19–20); `ambush-strike` cost 5→4, 3 раза. Ур.5: −10 → ≈ −2.6.
### Рейнджер
- hpPerLevel 1→3; `marksman` +2→+1; `improved-cover` (Выживальщик) с ур.5 на ур.1; `weapon-mastery` ур.5 (+1/+2 дальний урон); `sneak-shot` 2d8→3d8, 3 раза; `aimed-fire` +1d4→+1d6. Ур.5: −11.5 → ≈ 0; ур.1: −2.5…−6.
### Арбитр
- `healing-light` 2d8→2d6, cost 6→7 (АoE-лечение давало ~65 ЗДР/бой); `energy-barrier` cost 2→3; `improved-barrier` cost 4→6; `retribution` +1d6→+1d4; `guard-stance` +2→+1 КБ; `cyber-aura` теперь +1 КБ и сопротивление киберу; `vow-of-vengeance` метка 2→3; `verdict` cost 4→3, 3 раза; `disintegrate` cost 5→4; пассивки ур.5: `avenger-mastery` (+1 атака), `judge-mastery` (+2 урон способностей). Оружие 1d8→1d10 (пролог). Защитник ур.5: +14 → +5…7.
### Уголовник
- hpPerLevel 1→3; `weapon-mastery` ур.5 (+1/+2); `weak-spot` (Взломщик, ур.1, +1 урон ближнего боя). Ур.5 −11 → +1.8.
### Эколог
- hpPerLevel 2→3; `storm` 2d8→2d6, cost 6→7; `call-beast` cost 4→6; `silence-curse` теперь +2d6 пси и немота; `em-shamanism` cost 7→4, 2 раза; `whisper-curse` cost 3→2; `ritual-upgrade` (Техно-Шаман, ур.5, +2 урон способностей); новая способность `spirit-host` (ур.5, Путь Духов, 4 ЭНР, 2 духа). Вне канона, не противоречит (расширение «Вызова духа»).
### Рэпер
- hpPerLevel 1→3; `dissonant-chord` 1d8/1d4 → 1d12/1d8, cost 2→1; `sound-wave` 2d6→2d8, cost 4→3; `fake-news` 1d6→1d8, cost 3→1; `mass-hysteria` cost 5→4; `universal-lie` cost 7→6; `unfunny-joke` 1d10→1d12; `victory-hymn` +3→+2; `field-medic` 1d6→1d4; `healing-music` 2d6→1d8; пассивка `loud-sound` (Техно-Музыкант, +3 урон способностей). Рэпер ур.5 66% соло → 72–90% (не доведён).
### СлавоТех
- hpPerLevel 2→1; `healing-wave` 2d8→2d6; `proxy-tornado` 2d8→2d6, cost 6→7; `proxy-blast` 2d6→1d8, cost 2→3; `purge` cost 4→5; `retribution-code` cost 2→5; `shieldbearer` cost 3→4; оружие 1d8→1d10; пассивка `blessed-wrench` (+1 атака; нужна для пролога). Вне канона, не противоречит.
### КиберТех
- hpPerLevel 1→3 (через 0 и 2); `one-dim-shot` 1d8→1d10; `judge-whisper` cost 2→1; `weakness-curse` cost 2→1; `cyber-storm` 2d8→2d6, cost 5→8; `judge-curse` метка 4→1; `hell-gate` cost 6→7; `cyber-blast` cost 5→9.

## Прогон после правок
См. `docs/balance/REPORT.md`.

## Мир v1.0 (2026-11-04): бои `w-*`
Файл: `game/src/data/enemies.js` (только числа и составы врагов/боёв; классы, таланты, примочки не менялись). Харнесс: `node tools/sim/balance.mjs --mode world [--size 2] [--no-talents] [--n N] [--seed S] [--only w-id] [--power p] [--enc id,id,...]`.
- **До:** партия из 4 с талантами и примочками выигрывала все `w-*` на 100% (финал 32% только из-за 8 врагов уровня 5). Новые враги слабее героев своего уровня: у героев ЗДР 10+ТЕЛ+5ур+hpPerLevel·ур против 8–40 ЗДР у врагов.
- **Новый рычаг `power` у боя** (+ экспорт `scaledEnemy(id, p)`): множитель силы всех врагов боя. ЗДР и МРЛ ×p, атака +round(3(p−1)), урон оружия +round(2(p−1)) (через характеристику оружия), КБ +round(2(p−1)), опыт ×p. Производные враги регистрируются в `ENEMIES` под id `base^p`, имя то же. `power` может быть массивом (по кругу по индексу врага): даёт промежуточную силу между ступеньками округления (шаг ±0.05 power около порога давал ±20 п.п.). Почему так, а не толпа: 15 одинаковых слабаков (бунтовщики) не выглядят боем, а размер боя под партию из 2 идёт по `ceil(n·s/4)`.
- **Составы:** списки приведены к чётному числу врагов (4 или 6) — иначе при партии из 2 соотношение «врагов на героя» скачет (5 врагов → 3 против 2 героев = ×1.5 вместо ×1.25). Порядок в списке: первые — «ядро».
  - `w-harmony-riot` 5→6 бунтовщиков; `w-harmony-cult-cell` 5→6 (3 культиста + 3 стрелка); `w-road-scavengers` 5→6; `w-villages-beacon` 5→6 (маяк, воин, 4 шута); `w-agro-burning-field` 5→6 чистильщиков; `w-villages-terminal` 5→6; `w-agro-checkpoint` 5→6 (капитан + 5); `w-agro-rebels` 5→6; `w-agro-terminal` 5→6 (скрилет, 3 культиста-3, 2 стрелка); `w-cc-duel` 3→4 (+ пират-хакер); `w-cyberspace` 3→4; `w-villages-hatch` порядок: ползун, ползун, мех, ползун.
  - `w-cc-finale`: 8 врагов → 9 с явной силой: кибер-жрец ×1.85, аколит-5 ×1.5, 2 скрилета-5 ×1.25, 3 культиста и 2 стрелка 1-го ур. (слабее — чтобы «всё сняли» оставляло жреца, аколита и двух скрилетов). `reduce`: 6 записей → 5 (терминалов в `FINALE_TERMINALS` пять; шестая не использовалась): стрелок, стрелок, культист, культист, культист. Было: 0 снятых 32%, всех снятых 100%; стало 45% и 68%.
- **Силы по бою (power):** riot 2.65, cult-cell 2.15, road-crawlers 2.55, road-scavengers 2.0, road-pirates 2.2, villages-jesters 2.9, villages-beacon 2.8, villages-hatch [2.74, 2.75], agro-burning-field 1.5, villages-terminal [2.25, 2.24], agro-cleaners 2.2, agro-checkpoint 1.7, agro-rebels 2.1, agro-svoboda-raid [2.25, 2.24], agro-terminal 2.1, cc-gate 2.2, cc-dead 3.1, cc-duel 2.65, cc-terminal 1.95, cyberspace 2.6.

## v3 (2026-11-04): бои `ENCOUNTERS_V3`, оружие, броня, цены
Файлы: `game/src/data/enemies-v3.js`, `game/src/data/items/weapons.js`, `armor.js`. Движок, экраны, классы, таланты не менялись. Харнесс: `node tools/sim/balance.mjs --mode v3|gear [--kind normal|quest|elite] [--only id] [--items a,b] [--cat weapon|armor] --n N --seed S`; подгонка силы боёв: `node tools/sim/tune-v3.mjs` (бисекция, `--apply`).
- **Бои.** До правок все 86 боёв выигрывались на 100% за 2–7 раундов (враги слабее героев своего уровня). Новый рычаг `POWER_V3[id боя]` в `enemies-v3.js` (+ `scaleV3`, `SCALE_V3`): запись — число или объект `{p, hp, atk, dmg, kb}` (доли на (p−1)). По умолчанию ЗДР и МРЛ ×(1+0.5(p−1)), атака +3(p−1), урон +2(p−1) (оружие — через характеристику, способности — `bonus`), КБ +1.5(p−1). Для боёв, которые тянулись дольше 9.5 раундов, подгонка берёт «урон вместо ЗДР»: `{hp:0.2, atk:2, dmg:4, kb:1}` или `{hp:0, atk:2, dmg:5, kb:0}`. Производные враги — `base^p` в `ENEMIES_V3`. Подсказки `scale` сценариста не использовались (они 0.6–0.85, реально нужно 2–6).
- **Составы:** `v3-crg-wedding` 4→6 врагов (3→5 подпевал). Базовые ЗДР/урон: `boss-vibe-burner` ЗДР 85→60, «Выжечь вайб» 2d8→3d8; `boss-bazaar-ghost` ЗДР 58→42; `mech-hive-node` 72→55; `boss-sputnik-guardian` 66→52.
- **Силы:** см. `POWER_V3` в файле. Ручные правки после подгонки: pir-raid 2.55, wp-corridor 1.9, plague-machines 3.35, boss-lis-1 0.7, boss-armory 2.5, tin-trial 2.65, pir-flagship 2.95→2.7 (после усиления drum-launcher, он у абордажного капитана).
- **Оружие** (бонус `dmg` не попадает во врагов, `dice`/`hit` попадает):
  - `dmg` +1 (+2 тир-бонус): t2 spring-shashka, sign-halberd, power-sword, fire-axe, spring-bastard, lumber-greataxe, nagan-revolver, pump-shotgun, mosin, shock-rifle, energy-pistol, proxy-wrench, cyber-blade, megaphone, spring-crossbow, shock-glove; t3 hydro-fist, tin-warhammer, tin-katana, watch-bastard, sniper-rifle, thorn-bow, arc-thrower, battle-bayan, boombox; t4 monofil-katana, sleeper-blade, chainsaw-glaive, bolt-pistol, coil-staff, electro-balalaika (по +2); verdict-scythe +1; t1 shock-baton, hunting-carbine +1.
  - Выбросы вниз: throwing-knives/saw-stars 1d4→1d6 (+1 урона), wire-bolas 1d4→1d6 (+1), machete 1d6→1d8, rpg-tube 2d6→3d6, 3 заряда, +2 урона; drum-launcher 2d4→3d6, 5 зарядов, +1; plasma-pistol 1d10→2d6, перегрев 1d6→1d4, +3; plasma-rifle 2d6→2d8, 1 ЭНР, перегрев 1d6, +4; melta-cutter 2 ЭНР, +4; laser-pistol 1d6→1d8, +2; laser-rifle +1.
  - Выбросы вверх: kremlin-bolter 1d10→1d8, отдача 3→5. Реликты: lis-2 4d6, +5, 3 заряда, СИЛ 15→14; kuksius-spear точность +1→0; judge-gavel +2, sputnik-laser +3 (1 ЭНР), great-mech-fist/ice-ring-gloves/babka-ladle +1, anvil-katana +2.
- **Броня:** кузнечик (`kuznechik-walker`) щит 25→15, `lis-1` 25→20, `loader-exo` 10→7, `junk-mech-suit` 15→10; `host-jacket` КБ 0→1.
- **Цены:** fire-axe 45→110, hydro-fist 220→260, tin-warhammer 160→240, watch-bastard 220→260, conveyor-mg 260→320, thorn-bow 180→260, laser-pistol 320→360, rpg-tube 500→450, sleeper-blade 260→480, chainsaw-glaive 340→520, ukaz-rifle 450→600, coil-staff 480→540, electro-balalaika 380→480, kosilshik 650→900, kremlin-bolter 950→850, power-sword 300→220, host-jacket 150→110; арбитр-броня 400→250, steel-sheet-plate 300→320, go-autocamo 450→380, mutant-hide 260→300, tin-oyoroi 950→800, cleaner-carapace 800→600.
