#!/bin/bash
set -u
F=~/gecko-b2g-b2g26_v1_2/.mozconfig
grep -q 'disable-gold' "$F" || cat >> "$F" <<'CFG'

# Сборка подставляет системный компоновщик gold (x86_64), который не понимает ARM
ac_add_options --disable-gold
CFG
tail -3 "$F"
rm -rf ~/gecko-b2g-b2g26_v1_2/objdir-gonk26
