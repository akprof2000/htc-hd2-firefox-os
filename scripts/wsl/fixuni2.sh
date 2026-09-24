#!/bin/bash
set -e
F=~/gonk/frameworks/base/include/utils/Unicode.h
python3 - "$F" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
# убираем прежнюю попытку
s = re.sub(r'// В C\+\+11 эти типы встроенные.*?#endif\n',
           'typedef uint32_t char32_t;\ntypedef uint16_t char16_t;\n', s, flags=re.S)
old = "typedef uint32_t char32_t;\ntypedef uint16_t char16_t;"
new = ("// В C++ этого компилятора типы уже встроенные — объявляем только для C\n"
       "#ifndef __cplusplus\n"
       "typedef uint32_t char32_t;\n"
       "typedef uint16_t char16_t;\n"
       "#endif")
assert old in s, 'шаблон не найден'
open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))
print('поправлено')
PY
sed -n '22,32p' "$F"
