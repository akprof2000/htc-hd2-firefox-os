"""Приложения Firefox OS на HTC HD2 — одной командой, через adb.

    python hd2app.py fetch <слово>         найти пакет в архиве Firefox Marketplace
                                           и скачать (показывает издателя и права)
    python hd2app.py install <пакет.zip>   установить на телефон
                          [--id <id>]      каталог и origin (по умолчанию из имени)
    python hd2app.py fix-manifests         вернуть manifest.webapp приложениям,
                                           у которых он не извлечён из пакета

adb берётся из переменной ADB или из PATH. После install и fix-manifests
система на телефоне перезапускается сама (stop b2g; start b2g).
"""
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

WEBAPPS = "/data/local/webapps"
ARCHIVE = ("https://archive.org/download/Firefox_Marketplace_2018_03_Capture/"
           "Firefox_Marketplace_2018_03_Capture")
INDEX_CACHE = os.path.join(tempfile.gettempdir(), "fxos_marketplace_index.txt")


# ---------------------------------------------------------------- adb

def adb_path():
    adb = os.environ.get("ADB") or shutil.which("adb")
    if not adb:
        sys.exit("adb не найден: добавьте его в PATH или укажите в переменной ADB")
    return adb


def adb(*args, check=True):
    r = subprocess.run([adb_path(), *args], capture_output=True)
    if check and r.returncode != 0:
        sys.exit("adb %s: %s" % (" ".join(args),
                                 (r.stderr or r.stdout).decode("utf-8", "replace").strip()))
    return r.stdout.decode("utf-8", "replace")


def shell(cmd):
    return adb("shell", cmd)


def q(path):
    """Путь в одинарных кавычках для оболочки телефона (id бывают с {})."""
    return "'" + path.replace("'", "'\\''") + "'"


def require_device():
    if "\tdevice" not in adb("devices"):
        sys.exit("Телефон не подключён: проверьте кабель и «Отладку по USB»")


def set_owner(app_dir):
    shell("chown system.system %s; for f in %s/*; do chown system.system \"$f\"; done"
          % (q(app_dir), q(app_dir)))


def restart_b2g():
    shell("sync; stop b2g; sleep 2; start b2g")
    print("система перезапускается — рабочий стол появится через минуту-полторы")


# ------------------------------------------------------------ реестр

def registry_entry(registry, app_id, manifest_bytes, package_bytes):
    now = int(time.time() * 1000)
    origin = "app://" + app_id
    return {
        "origin": origin,
        "installOrigin": origin,
        "receipt": None,
        "installTime": now,
        "updateTime": now,
        "manifestURL": origin + "/manifest.webapp",
        "localId": max(v.get("localId", 0) for v in registry.values()) + 1,
        "appStatus": 1,
        "manifestHash": hashlib.md5(manifest_bytes).hexdigest(),
        "packageHash": hashlib.md5(package_bytes).hexdigest(),
        "id": app_id,
        "basePath": WEBAPPS,
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
        "name": json.loads(manifest_bytes).get("name", app_id),
        "csp": "",
        "redirects": None,
        "kind": "packaged",
    }


def slug(text):
    return re.sub(r"[^a-z0-9]+", "", text.lower()) or "app"


# ------------------------------------------------------------ команды

def cmd_install(package_path, app_id=None):
    require_device()
    package = open(package_path, "rb").read()
    manifest = zipfile.ZipFile(io.BytesIO(package)).read("manifest.webapp")
    m = json.loads(manifest)
    if m.get("type") in ("privileged", "certified"):
        sys.exit("%s — приложение типа %s: без подписи Marketplace такое не установить"
                 % (m.get("name"), m.get("type")))
    dev = slug((m.get("developer") or {}).get("name", "local"))
    app_id = app_id or "%s.%s.app" % (slug(m.get("name", "app")), dev)
    app_dir = "%s/%s" % (WEBAPPS, app_id)
    print("ставлю %s %s как %s" % (m.get("name"), m.get("version", ""), app_id))

    with tempfile.TemporaryDirectory() as tmp:
        shell("stop b2g")
        try:
            local_reg = os.path.join(tmp, "webapps.json")
            adb("pull", WEBAPPS + "/webapps.json", local_reg)
            registry = json.load(open(local_reg, encoding="utf-8"))
            if app_id in registry:
                sys.exit("%s уже установлено" % app_id)
            registry[app_id] = registry_entry(registry, app_id, manifest, package)

            local_man = os.path.join(tmp, "manifest.webapp")
            open(local_man, "wb").write(manifest)
            json.dump(registry, open(local_reg, "w", encoding="utf-8"), ensure_ascii=False)

            shell("cp %s/webapps.json /data/local/webapps.json.bak" % WEBAPPS)
            shell("mkdir -p %s" % q(app_dir))
            adb("push", package_path, app_dir + "/application.zip")
            adb("push", local_man, app_dir + "/manifest.webapp")
            adb("push", local_reg, WEBAPPS + "/webapps.json")
            set_owner(app_dir)
            shell("chown system.system %s/webapps.json" % WEBAPPS)
        finally:
            shell("start b2g")
    print("готово: иконка «%s» появится в конце рабочего стола "
          "(прежний реестр — /data/local/webapps.json.bak)" % m.get("name"))


def cmd_fix_manifests():
    require_device()
    listing = shell("cd %s; for d in *; do [ -d \"$d\" ] && [ -f \"$d/application.zip\" ] "
                    "&& [ ! -f \"$d/manifest.webapp\" ] && echo \"$d\"; done" % WEBAPPS)
    broken = [line.strip() for line in listing.splitlines() if line.strip()]
    if not broken:
        print("у всех упакованных приложений манифест на месте")
        return
    with tempfile.TemporaryDirectory() as tmp:
        for app_id in broken:
            app_dir = "%s/%s" % (WEBAPPS, app_id)
            local_zip = os.path.join(tmp, "app.zip")
            adb("pull", app_dir + "/application.zip", local_zip)
            manifest = zipfile.ZipFile(local_zip).read("manifest.webapp")
            local_man = os.path.join(tmp, "manifest.webapp")
            open(local_man, "wb").write(manifest)
            adb("push", local_man, app_dir + "/manifest.webapp")
            set_owner(app_dir)
            print("исправлено: %s (%s)" % (json.loads(manifest).get("name"), app_id))
    restart_b2g()


def cmd_fetch(word):
    if not os.path.exists(INDEX_CACHE):
        print("скачиваю опись архива Marketplace (9 МБ)…")
        urllib.request.urlretrieve(ARCHIVE + ".txt", INDEX_CACHE)
    rx = re.compile(r"Firefox_Marketplace_2018_03_Capture/(\d+-[^/]*%s[^/]*)/([^/]+\.zip)$"
                    % re.escape(word), re.IGNORECASE)
    found = []
    for line in open(INDEX_CACHE, encoding="utf-8", errors="replace"):
        mt = rx.search(line.strip())
        if mt:
            found.append((mt.group(1), mt.group(2), int(line.split()[0])))
    if not found:
        sys.exit("в архиве ничего не нашлось по «%s»" % word)
    if len(found) > 1:
        print("нашлось несколько, уточните слово:")
        for d, f, s in found:
            print("  %-45s %s (%d КБ)" % (d, f, s // 1024))
        return
    folder, name, size = found[0]
    base = "%s.zip/Firefox_Marketplace_2018_03_Capture/%s" % (ARCHIVE, folder)
    info = json.load(urllib.request.urlopen(base + "/info.json"))
    title = info.get("name")
    title = (title.get("ru") or title.get("en-US")) if isinstance(title, dict) else title
    print("нашлось: %s — %s, издатель %s, %s, %d КБ"
          % (folder, title, info.get("author"), info.get("premium_type"), size // 1024))
    urllib.request.urlretrieve(base + "/" + name, name)
    got = os.path.getsize(name)
    if got != size:
        sys.exit("скачано %d байт вместо %d — файл повреждён" % (got, size))
    m = json.loads(zipfile.ZipFile(name).read("manifest.webapp"))
    print("скачано: %s" % name)
    print("тип: %s; разрешения: %s" % (m.get("type", "web"),
                                       ", ".join(m.get("permissions", {})) or "нет"))
    print("поставить: python hd2app.py install %s" % name)


def main(argv):
    if len(argv) >= 2 and argv[0] == "install":
        app_id = argv[argv.index("--id") + 1] if "--id" in argv else None
        cmd_install(argv[1], app_id)
    elif argv[:1] == ["fix-manifests"]:
        cmd_fix_manifests()
    elif len(argv) == 2 and argv[0] == "fetch":
        cmd_fetch(argv[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
