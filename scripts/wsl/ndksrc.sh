#!/bin/bash
set -u
mkdir -p ~/gonk/ndk
cp -r ~/android-ndk-r8e/sources ~/gonk/ndk/ 2>/dev/null
echo "=== перенесено:"
ls ~/gonk/ndk/sources/ 2>/dev/null
ls ~/gonk/ndk/sources/android/cpufeatures/ 2>/dev/null
