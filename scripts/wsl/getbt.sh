#!/bin/bash
set -u
cd ~/gonk
mkdir -p external/bluetooth
[ -d external/bluetooth/bluez ] || git clone -q --depth 1 --branch android-4.0.4_r2.1 https://android.googlesource.com/platform/external/bluetooth/bluez external/bluetooth/bluez 2>&1 | tail -1
ls external/bluetooth/bluez/lib/bluetooth/ 2>/dev/null | head -5
