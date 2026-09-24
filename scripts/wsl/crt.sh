#!/bin/bash
set -u
N=~/android-ndk-r8e/platforms/android-14/arch-arm/usr
D=~/gonk/out/target/product/leo/obj/lib
echo "=== что есть в NDK:"
ls $N/lib/*.o 2>/dev/null | head -6
cp -f $N/lib/crt*.o "$D/" 2>/dev/null
echo "=== стартовые файлы на месте:"
ls "$D"/crt*.o 2>/dev/null
echo "=== смотрим, на чём споткнулось:"
tail -30 ~/gecko-b2g-b2g18_v1_1_0_hd/objdir-gonk/config.log 2>/dev/null | grep -iE "error|cannot|undefined" | head -8
