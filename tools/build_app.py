"""Собирает пакет приложения Firefox OS (zip) из папки app/.

    python tools/build_app.py apps/youtube/app youtube.zip
"""
import os
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src).replace(os.sep, '/'))
print(out, len(zipfile.ZipFile(out).namelist()), 'файлов')
