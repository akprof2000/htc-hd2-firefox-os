#!/bin/bash
set -u
cd ~/gonk
B=android-4.0.4_r2.1
G=https://android.googlesource.com
for r in platform/frameworks/base:frameworks/base platform/system/media:system/media platform/external/dbus:external/dbus; do
  repo="${r%%:*}"; dir="${r##*:}"
  [ -d "$dir" ] && { echo "   $dir уже есть"; continue; }
  echo "   качаю $dir"
  git clone -q --depth 1 --branch $B "$G/$repo" "$dir" 2>&1 | tail -1
done
echo "=== итого:"
du -sh ~/gonk 2>/dev/null
