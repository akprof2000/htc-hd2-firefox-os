#!/bin/bash
set -e
F=~/gonk/system/vold/ResponseCode.h
python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
add = """
    // Коды томов: в Android 4.0.4 они жили в самом vold, а Gecko 18.1
    // ждёт их из заголовка. Значения — из vold (110 подтверждён живым
    // ответом "110 sdcard /mnt/sdcard 4" на телефоне).
    static const int VolumeListResult = 110;

    static const int VolumeStateChange = 605;
    static const int VolumeMountFailedBlank = 610;
    static const int VolumeMountFailedDamaged = 611;
    static const int VolumeMountFailedNoMedia = 612;

    static const int VolumeDiskInserted = 630;
    static const int VolumeDiskRemoved = 631;
    static const int VolumeBadRemoval = 632;
"""
marker = "    static const int CommandOkay = 200;"
assert marker in s, 'не нашёл, куда вставить'
open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(marker, marker + "\n" + add))
print('коды добавлены')
PY
grep -c "static const int" "$F"
