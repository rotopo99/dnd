#!/usr/bin/env bash
# PreToolUse hook: блокирует опасные Bash-команды
# (рекурсивное удаление, force-push, reset --hard, clean -f).
# Код выхода 2 = отказ, текст из stderr увидит агент.
input="$(cat)"
# Достаём tool_input.command из JSON и превращаем экранированные \n в настоящие переводы строк.
cmd="$(printf '%s' "$input" \
  | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(\([^"\\]\|\\.\)*\)".*/\1/p' \
  | sed 's/\\n/\n/g; s/\\"/"/g')"

start='(^|[;&|(]|&&|\|\|)[[:space:]]*(sudo[[:space:]]+)?'
patterns=(
  "${start}rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)([[:space:]]|$)"
  "${start}git[[:space:]]+push[[:space:]].*(--force|[[:space:]]-f([[:space:]]|$))"
  "${start}git[[:space:]]+reset[[:space:]]+--hard"
  "${start}git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f"
)
for p in "${patterns[@]}"; do
  if hit="$(printf '%s\n' "$cmd" | grep -Em1 "$p")"; then
    echo "Заблокировано хуком block-dangerous: «${hit}». Удаляй файлы точечно или попроси человека." >&2
    exit 2
  fi
done
exit 0
