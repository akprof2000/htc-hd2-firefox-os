#!/bin/bash
set -u
D=~/gonk/system/core/include/sysutils
mkdir -p "$D"
# В Android 4.0.4 этот заголовок лежал в nexus/, в 4.1 его перенесли в sysutils/.
# Gecko 18.1 рассчитан на 4.1, поэтому кладём копию на новое место.
cp -n ~/gonk/system/core/nexus/ResponseCode.h "$D/ResponseCode.h" 2>/dev/null || true
ls -la "$D/ResponseCode.h"
# заодно проверим, чего ещё из sysutils может не хватать
ls ~/gonk/system/core/include/sysutils/ 2>/dev/null
