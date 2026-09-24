#!/bin/bash
export PATH=$HOME/bin27:$PATH
cd ~/gecko-b2g-b2g44_v2_5
cp ~/mozconfig44 .mozconfig
make -f client.mk configure > ~/g44-conf.log 2>&1
echo "настройка завершена с кодом $?"
tail -5 ~/g44-conf.log
