#!/bin/bash
# Скриптам сборки Gecko 2013 года нужен Python 2 — в современных дистрибутивах его нет.
set -e
cd ~
[ -f Python-2.7.18.tgz ] || wget -q https://www.python.org/ftp/python/2.7.18/Python-2.7.18.tgz
[ -d Python-2.7.18 ] || tar xzf Python-2.7.18.tgz
cd Python-2.7.18
[ -f Makefile ] || ./configure --prefix=$HOME/py27 --enable-optimizations=no -q 2>&1 | tail -2
make -s -j4 2>&1 | tail -3
make -s install 2>&1 | tail -2
~/py27/bin/python2.7 --version
