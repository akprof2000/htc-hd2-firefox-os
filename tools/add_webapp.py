"""Добавить упакованное приложение Firefox OS в реестр webapps.json — без Marketplace.

    python add_webapp.py webapps.json <id> application.zip > webapps-new.json

webapps.json снимается с телефона (/data/local/webapps/webapps.json), новый
кладётся обратно. Рядом, в /data/local/webapps/<id>/, должны лежать
application.zip и manifest.webapp (извлечённый из пакета). Владелец — system
(tools/fixown.sh), затем перезапуск b2g: stop b2g; start b2g.

Приложение ставится как обычное (appStatus 1): это допускает разрешения
уровня web. Для privileged-приложений нужен appStatus 2 — подписанный
пакет с Marketplace это позволяет, самосборный нет.
"""
import hashlib
import json
import sys
import time
import zipfile

registry_path, app_id, package_path = sys.argv[1:4]

registry = json.load(open(registry_path, encoding="utf-8"))
if app_id in registry:
    sys.exit("%s уже есть в реестре" % app_id)

package = open(package_path, "rb").read()
manifest = zipfile.ZipFile(package_path).read("manifest.webapp")
name = json.loads(manifest).get("name", app_id)
now = int(time.time() * 1000)
origin = "app://" + app_id

registry[app_id] = {
    "origin": origin,
    "installOrigin": origin,
    "receipt": None,
    "installTime": now,
    "updateTime": now,
    "manifestURL": origin + "/manifest.webapp",
    "localId": max(v.get("localId", 0) for v in registry.values()) + 1,
    "appStatus": 1,
    "manifestHash": hashlib.md5(manifest).hexdigest(),
    "packageHash": hashlib.md5(package).hexdigest(),
    "id": app_id,
    "basePath": "/data/local/webapps",
    "removable": True,
    "installerAppId": 0,
    "installerIsBrowser": False,
    "installState": "installed",
    "storeId": "",
    "storeVersion": 0,
    "role": "",
    "widgetPages": [],
    "enabled": True,
    "downloading": False,
    "readyToApplyDownload": False,
    "name": name,
    "csp": "",
    "redirects": None,
    "kind": "packaged",
}

json.dump(registry, sys.stdout, ensure_ascii=False)
sys.stderr.write("добавлено: %s (%s), localId %d\n"
                 % (name, app_id, registry[app_id]["localId"]))
