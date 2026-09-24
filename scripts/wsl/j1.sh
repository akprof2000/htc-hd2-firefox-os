#!/bin/bash
set -u
F=~/gecko-b2g-b2g26_v1_2/.mozconfig
sed -i 's|MOZ_MAKE_FLAGS="-j4"|MOZ_MAKE_FLAGS="-j1"|' "$F"
grep MAKE_FLAGS "$F"
