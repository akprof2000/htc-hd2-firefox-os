#!/bin/bash
set -u
cd ~/gonk
[ -d external/stlport ] || git clone -q --depth 1 --branch android-4.0.4_r2.1 https://android.googlesource.com/platform/external/stlport external/stlport 2>&1 | tail -1
echo "=== заголовки STL:"
ls external/stlport/stlport/ 2>/dev/null | head -6
echo "=== библиотека с телефона:"
ls out/target/product/leo/obj/lib/libstlport.so 2>/dev/null || echo "   libstlport.so НЕТ — посмотрим, чем заменить"
ls out/target/product/leo/obj/lib/ | grep -iE "stl|stdc" | head -3
