#!/bin/bash
set -e
F=~/gonk/frameworks/base/include/utils/Unicode.h
cp -n "$F" "$F.orig" 2>/dev/null || true
python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
old = "typedef uint32_t char32_t;\ntypedef uint16_t char16_t;"
new = ("// В C++11 эти типы встроенные — объявляем только для старых компиляторов\n"
       "#if !defined(__cplusplus) || __cplusplus < 201103L\n"
       "typedef uint32_t char32_t;\n"
       "typedef uint16_t char16_t;\n"
       "#endif")
if old in s:
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))
    print('заголовок поправлен')
else:
    print('уже поправлен или не найден')
PY
