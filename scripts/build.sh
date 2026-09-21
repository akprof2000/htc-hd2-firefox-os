#!/bin/bash
export PATH=$HOME/bin27:$PATH
cd ~/gecko-b2g-b2g44_v2_5
nohup make -f client.mk build > ~/g44-build.log 2>&1 &
echo "сборка 2.5 запущена"
