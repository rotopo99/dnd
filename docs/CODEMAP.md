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

## Данные
- `game/src/data/factions.js` — `FACTIONS`, `STANCES`, `RELATIONS[a][b]` (кем b является для a), `stance(a,b)`. 14 фракций из канона.
- `game/assets/icons/*.png` — 256×256: `class_{face,fighter,rogue,tech}`, `race_{human,mutant,skeleton,synth}`, `res_{hp,energy,morale}`.
- `game/src/data/text/index.js` — `t(key)`, все строки интерфейса (ru).

## Инструменты
- `tools/playtest.mjs` — headless-плейтест: скриншоты в `tools/out/`, код выхода 1 при ошибках консоли.
