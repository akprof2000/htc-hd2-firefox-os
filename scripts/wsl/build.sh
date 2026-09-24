#!/bin/bash
export PATH=$HOME/bin27:$PATH
cd ~/gecko-b2g-b2g18_v1_1_0_hd
nohup make -f client.mk build > ~/gecko-build.log 2>&1 &
echo "сборка запущена, журнал: ~/gecko-build.log"
