#!/bin/bash
# Сборка ждёт библиотеки по пути out/target/product/<устройство>/obj/lib
set -u
D=~/gonk/out/target/product/leo/obj/lib
mkdir -p "$D"
cp -f /mnt/c/Temp/syslib/lib/*.so "$D/" 2>/dev/null
echo "библиотек разложено: $(ls "$D" | wc -l)"
# заодно сделаем sysroot-подобную структуру
mkdir -p ~/gonk/out/target/product/leo/obj/{include,lib}
ls "$D" | head -5
