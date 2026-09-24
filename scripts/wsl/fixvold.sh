#!/bin/bash
set -u
mkdir -p ~/gonk/system/vold
cp -f ~/gonk/system/core/nexus/ResponseCode.h ~/gonk/system/vold/ResponseCode.h
echo "=== коды, которые нужны движку:"
grep -oE 'ResponseCode::[A-Za-z]+' ~/gecko-b2g-b2g18_v1_1_0_hd/dom/system/gonk/*.cpp ~/gecko-b2g-b2g18_v1_1_0_hd/dom/system/gonk/*.h 2>/dev/null | sed 's/.*:://' | sort -u
echo "=== что есть в заголовке:"
grep -oE 'static const int [A-Za-z]+' ~/gonk/system/vold/ResponseCode.h | sed 's/static const int //' | sort -u
