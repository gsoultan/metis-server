#!/bin/sh
# Reload systemd so it sees the unit. Deliberately does not enable, start or
# restart the service: on a fresh install METIS_ENGINE_URL has to be checked
# first, and on an upgrade the running server keeps the old binary until you
# restart it yourself, so the web app and the engine can be moved together.
set -e

# The package declares these owners, but pacman unpacks by numeric id, and the
# metis-server account's id is only known on this host, so on Arch they come
# out root:root. Set them here so every format ends the same way.
chown root:metis-server /etc/metis-server /etc/metis-server/metis-server.env
chmod 0750 /etc/metis-server
chmod 0640 /etc/metis-server/metis-server.env

if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
fi

cat <<'MSG'
metis-server is installed. To run it:
  1. check METIS_ENGINE_URL in /etc/metis-server/metis-server.env
     (with the engine on this host, see the note there about its port)
  2. systemctl enable --now metis-server
  3. open http://<this server>:8080
After an upgrade: systemctl restart metis-server
MSG

exit 0
