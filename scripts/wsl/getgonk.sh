#!/bin/bash
# Заголовки Android 4.0.4 — то, без чего движок не соберётся под телефон.
set -u
mkdir -p ~/gonk && cd ~/gonk
B=android-4.0.4_r2.1
G=https://android.googlesource.com
clone() {
  local repo="$1" dir="$2"
  [ -d "$dir" ] && { echo "   $dir уже есть"; return; }
  echo "   качаю $dir"
  git clone -q --depth 1 --branch $B "$G/$repo" "$dir" 2>&1 | tail -1
}
clone platform/bionic bionic
clone platform/system/core system/core
clone platform/hardware/libhardware hardware/libhardware
clone platform/hardware/libhardware_legacy hardware/libhardware_legacy
clone platform/dalvik dalvik
echo "=== скачано:"
du -sh ~/gonk/* 2>/dev/null
