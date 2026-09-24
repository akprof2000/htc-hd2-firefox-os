#!/bin/bash
cp /mnt/c/Temp/mozconfig ~/gecko-b2g-b2g18_v1_1_0_hd/.mozconfig
export PATH=$HOME/bin27:$PATH
cd ~/gecko-b2g-b2g18_v1_1_0_hd
timeout 1500 make -f client.mk configure > ~/gecko-conf.log 2>&1
echo "настройка: $(tail -1 ~/gecko-conf.log | head -c 60)"
nohup make -f client.mk build > ~/gecko-build.log 2>&1 &
echo "сборка идёт"
