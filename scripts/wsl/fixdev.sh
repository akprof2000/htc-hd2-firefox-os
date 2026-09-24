#!/bin/bash
set -u
F=~/gecko-b2g-b2g26_v1_2/.mozconfig
sed -i '/disable-gold/d;/системный компоновщик gold/d' "$F"
grep -q 'enable-release' "$F" || cat >> "$F" <<'CFG'

# Без этого сборка считает себя «сборкой разработчика» и подсовывает
# системный компоновщик gold, который не понимает ARM
ac_add_options --enable-release
CFG
tail -4 "$F"
rm -rf ~/gecko-b2g-b2g26_v1_2/objdir-gonk26
