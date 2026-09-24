"""Ставит упакованное приложение Firefox OS в профиль симулятора или на телефон.

  python install_app.py sim   <пакет.zip> <id> <имя> [разрешение ...]
  python install_app.py phone <пакет.zip> <id> <имя> [разрешение ...]

Приложение записывается в реестр как встроенное (appStatus 2), разрешения
добавляются в базу permissions.sqlite. Телефон: b2g останавливается и
запускается заново. Прежний реестр и база сохраняются рядом с ними.
"""
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import zipfile

SIM = r'C:/Projects/HTC-HD2-archive/fxos-simulator/sim/profile-run'
PHONE_WEBAPPS = '/data/local/webapps'
PHONE_PERMS = '/data/local/permissions.sqlite'

where, pkg_path, app_id, name = sys.argv[1:5]
perms = sys.argv[5:]
pkg = open(pkg_path, 'rb').read()
man = zipfile.ZipFile(pkg_path).read('manifest.webapp')
role = json.loads(man).get('role', '')


def adb(*args):
    r = subprocess.run(['adb'] + list(args), capture_output=True)
    if r.returncode:
        sys.exit('adb %s: %s' % (' '.join(args), r.stderr.decode('utf-8', 'replace')))
    return r.stdout.decode('utf-8', 'replace')


def entry(reg, local_id):
    origin = 'app://' + app_id
    now = int(time.time() * 1000)
    e = dict(reg['verticalhome.gaiamobile.org'])
    e.update(origin=origin, installOrigin=origin, manifestURL=origin + '/manifest.webapp',
             id=app_id, installTime=now, updateTime=now, localId=local_id, appStatus=2,
             manifestHash=hashlib.md5(man).hexdigest(),
             packageHash=hashlib.md5(pkg).hexdigest(), name=name, role=role)
    return e


def add_perms(db, local_id):
    con = sqlite3.connect(db)
    origin = 'app://%s^appId=%d' % (app_id, local_id)
    now = int(time.time() * 1000)
    for t in perms:
        if not con.execute('select 1 from moz_perms where origin=? and type=?',
                           (origin, t)).fetchone():
            con.execute('insert into moz_perms(origin,type,permission,expireType,'
                        'expireTime,modificationTime) values(?,?,1,0,0,?)', (origin, t, now))
    con.commit()
    con.close()


if where == 'sim':
    subprocess.run(['powershell', '-NoProfile', '-Command',
                    'Get-Process firefox -EA SilentlyContinue | Stop-Process -Force'])
    time.sleep(4)
    w = SIM + '/webapps'
    reg = json.load(open(w + '/webapps.json', encoding='utf-8'))
    local_id = reg[app_id]['localId'] if app_id in reg else \
        max(v.get('localId', 0) for v in reg.values()) + 1
    reg[app_id] = entry(reg, local_id)
    os.makedirs(w + '/' + app_id, exist_ok=True)
    shutil.copy(pkg_path, w + '/' + app_id + '/application.zip')
    open(w + '/' + app_id + '/manifest.webapp', 'wb').write(man)
    json.dump(reg, open(w + '/webapps.json', 'w', encoding='utf-8'), ensure_ascii=False)
    add_perms(SIM + '/permissions.sqlite', local_id)
    print('установлено в симулятор, localId', local_id)

elif where == 'phone':
    adb('shell', 'stop b2g')
    tmp = tempfile.mkdtemp()
    adb('pull', PHONE_WEBAPPS + '/webapps.json', tmp + '/webapps.json')
    adb('pull', PHONE_PERMS, tmp + '/permissions.sqlite')
    reg = json.load(open(tmp + '/webapps.json', encoding='utf-8'))
    local_id = reg[app_id]['localId'] if app_id in reg else \
        max(v.get('localId', 0) for v in reg.values()) + 1
    reg[app_id] = entry(reg, local_id)
    json.dump(reg, open(tmp + '/webapps.json', 'w', encoding='utf-8'), ensure_ascii=False)
    open(tmp + '/manifest.webapp', 'wb').write(man)
    add_perms(tmp + '/permissions.sqlite', local_id)
    d = PHONE_WEBAPPS + '/' + app_id
    adb('shell', 'mkdir -p ' + d)
    adb('push', pkg_path, d + '/application.zip')
    adb('push', tmp + '/manifest.webapp', d + '/manifest.webapp')
    adb('push', tmp + '/webapps.json', PHONE_WEBAPPS + '/webapps.json')
    adb('push', tmp + '/permissions.sqlite', PHONE_PERMS)
    adb('shell', 'chown system.system %s %s/*; chown root.root %s/webapps.json %s; '
                 'chmod 640 %s/webapps.json; chmod 600 %s; start b2g'
        % (d, d, PHONE_WEBAPPS, PHONE_PERMS, PHONE_WEBAPPS, PHONE_PERMS))
    shutil.rmtree(tmp, ignore_errors=True)
    print('установлено на телефон, localId', local_id)

else:
    sys.exit('первый аргумент: sim или phone')
