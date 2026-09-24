#!/bin/bash
set -u
# Gecko 26 требует ещё пару заголовков, которых не было в 18.1
cd ~/gonk
B=android-4.0.4_r2.1
G=https://android.googlesource.com
[ -d external/valgrind ] || git clone -q --depth 1 --branch $B $G/platform/external/valgrind external/valgrind 2>&1 | tail -1
mkdir -p external/valgrind/fxos-include
echo "=== настройка сборки:"
sed 's|objdir-gonk|objdir-gonk26|' /mnt/c/Temp/mozconfig > ~/gecko-b2g-b2g26_v1_2/.mozconfig
grep -E 'MOZ_OBJDIR|gonk=' ~/gecko-b2g-b2g26_v1_2/.mozconfig
