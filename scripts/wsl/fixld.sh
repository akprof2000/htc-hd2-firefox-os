#!/bin/bash
set -u
T=~/android-ndk-r8e/toolchains/arm-linux-androideabi-4.4.3/prebuilt/linux-x86_64/bin
D=~/gecko-b2g-b2g26_v1_2/objdir-gonk26/build/unix/gold
mkdir -p "$D"
# Сборка кладёт сюда системный gold; подменяем компоновщиком для ARM
ln -sf "$T/arm-linux-androideabi-ld" "$D/ld"
ls -la "$D/ld"
"$D/ld" --version | head -1
