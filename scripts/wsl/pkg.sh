#!/bin/bash
export PATH=$HOME/bin27:$PATH
cd ~/gecko-b2g-b2g18_v1_1_0_hd/objdir-gonk
timeout 1200 make package > ~/gecko-pkg.log 2>&1
echo "код: $?"
tail -5 ~/gecko-pkg.log
ls -la dist/b2g-*.tar.gz dist/b2g/omni.ja 2>/dev/null
