#!/bin/bash
set -u
mkdir -p ~/bin27
ln -sf ~/py27/bin/python2.7 ~/bin27/python
ln -sf ~/py27/bin/python2.7 ~/bin27/python2
ln -sf ~/py27/bin/python2.7 ~/bin27/python2.7
export PATH=~/bin27:$PATH
cd ~/gecko-b2g-b2g18_v1_1_0_hd
python --version
timeout 1500 make -f client.mk configure 2>&1 | tail -22
