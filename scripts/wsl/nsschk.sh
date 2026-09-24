#!/bin/bash
export PATH=$HOME/bin27:$PATH
S=~/gecko-b2g-b2g26_v1_2
cd $S/objdir-gonk26/security/build
make --no-print-directory -f $S/security/build/nss.mk \
  DEPTH=../.. topsrcdir=$S srcdir=$S/security/build echo-variable-libs 2>&1 | head -5
