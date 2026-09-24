#!/bin/bash
set -e
cd ~/Python-2.7.18
make -s -j4 2>&1 | tail -2
make -s install 2>&1 | tail -1
~/py27/bin/python2.7 -c "import bz2, zlib, sqlite3; print('модули на месте')"
