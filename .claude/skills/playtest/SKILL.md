---
name: playtest
description: Запустить игру в headless-браузере, снять скриншоты и собрать ошибки консоли. Используй после изменений в game/ и перед коммитом.
argument-hint: [--keys "ArrowRight*10,Space"]
---

# Рецепт: плейтест

1. `node tools/playtest.mjs $ARGUMENTS`
   - нужен Node 18+ и Playwright (`npm i -D playwright && npx playwright install chromium`, если не установлен).
2. Прочитай вывод: ошибки консоли и необработанные исключения = провал.
3. Открой скриншоты из `tools/out/` (инструментом Read) и опиши, что видно: рендерится ли сцена, нет ли артефактов, читается ли UI.
4. Итог одной строкой: `OK` или список проблем.
