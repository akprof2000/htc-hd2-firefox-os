#!/bin/bash
# Добавляет в базу NSS (cert9.db) корни Mozilla (cacert.pem) и Минцифры.
# Запуск: bash certs.sh <папка с cacert.pem, rus_root.pem, rus_sub.pem и nssdb/>
set -e
cd "$(wslpath "$1")"
mkdir -p split; rm -f split/*
n=0; f=""
while IFS= read -r l; do
  case "$l" in *"BEGIN CERT"*) n=$((n+1)); f=$(printf "split/%03d.pem" $n);; esac
  [ -n "$f" ] && echo "$l" >> "$f"
  case "$l" in *"END CERT"*) f="";; esac
done < cacert.pem
cp rus_root.pem split/900.pem
cp rus_sub.pem split/901.pem
ok=0
for p in split/*.pem; do
  nm=$(openssl x509 -in "$p" -noout -subject -nameopt multiline | sed -n 's/^ *commonName *= //p' | head -1)
  [ -z "$nm" ] && nm=$(openssl x509 -in "$p" -noout -subject -nameopt multiline | sed -n 's/^ *organizationName *= //p' | head -1)
  # корню — доверие для сайтов, почты и кода; промежуточному — без флагов
  t="C,C,C"; [ "$p" = split/901.pem ] && t=",,"
  if certutil -A -d sql:nssdb -n "$nm" -t "$t" -i "$p" 2>/dev/null; then ok=$((ok+1)); else echo "не добавлен: $p $nm"; fi
done
echo "добавлено: $ok"
certutil -L -d sql:nssdb | grep -c "C,C,C" || true
certutil -L -d sql:nssdb | grep -i "russian\|ISRG" || true
