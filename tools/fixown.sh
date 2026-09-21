#!/system/bin/sh
cd /data/local/webapps || exit 1
chown system.system . webapps.json
for d in *; do
  if [ -d "$d" ]; then
    chown system.system "$d"
    for f in "$d"/*; do chown system.system "$f"; done
  fi
done
echo done
