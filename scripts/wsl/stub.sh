#!/bin/bash
set -e
T=~/android-ndk-r8e/toolchains/arm-linux-androideabi-4.4.3/prebuilt/linux-x86_64/bin/arm-linux-androideabi
D=~/gonk/out/target/product/leo/obj/lib
cat > /tmp/stlcompat.cpp <<'CPP'
// В libstlport.so на HTC HD2 (Android 4.0.4) нет std::uncaught_exception(),
// а STLport из NDK на неё ссылается. Собираем без исключений, поэтому
// честный ответ — «исключение не обрабатывается».
namespace std {
  bool uncaught_exception() throw() { return false; }
}
CPP
$T-g++ -c -fno-exceptions -fPIC -o /tmp/stlcompat.o /tmp/stlcompat.cpp
$T-ar rcs "$D/libstlcompat.a" /tmp/stlcompat.o
echo "=== библиотека-добавка создана:"
ls -la "$D/libstlcompat.a"
$T-nm "$D/libstlcompat.a" | grep uncaught
