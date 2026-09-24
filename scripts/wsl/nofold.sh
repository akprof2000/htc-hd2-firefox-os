#!/bin/bash
set -u
F=~/gecko-b2g-b2g26_v1_2/.mozconfig
grep -q 'MOZ_FOLD_LIBS' "$F" || cat >> "$F" <<'CFG'

# Сворачивание библиотек ломает сборку подсистемы безопасности
export MOZ_FOLD_LIBS=
CFG
tail -3 "$F"
rm -rf ~/gecko-b2g-b2g26_v1_2/objdir-gonk26
