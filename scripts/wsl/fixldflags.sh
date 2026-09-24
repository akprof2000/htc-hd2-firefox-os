#!/bin/bash
set -u
F=~/gecko-b2g-b2g26_v1_2/.mozconfig
sed -i '/LDFLAGS=/d;/libstlport.so этого телефона/d' "$F"
echo "=== настройка сборки 1.2:"
grep -vE '^\s*$|^#' "$F"
rm -rf ~/gecko-b2g-b2g26_v1_2/objdir-gonk26
