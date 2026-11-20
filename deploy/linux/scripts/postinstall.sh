#!/bin/sh
# Reload systemd so it sees the unit. Deliberately does not enable, start or
# restart the service:
#
# - On a fresh install starting it is the operator's call: it serves the
#   setup wizard to anyone who can reach the port (behind the setup token in
#   the log), and they may want a firewall or an address chosen first.
# - On an upgrade the new binary carries the engine and may carry schema
#   migrations, so take a backup before the first start of a new release. The
#   running server keeps running the old binary until you restart it yourself.
set -e

# The package declares these owners, but pacman unpacks by numeric id, and the
# metis-server account's id is only known on this host, so on Arch they come
# out root:root. Set them here so every format ends the same way. Not
# recursive: whatever the service wrote under /var/lib/metis-server is already
# its own.
chown root:metis-server /etc/metis-server /etc/metis-server/metis-server.env
chmod 0750 /etc/metis-server
chmod 0640 /etc/metis-server/metis-server.env
chown metis-server:metis-server /var/lib/metis-server
chmod 0750 /var/lib/metis-server

if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
fi

cat <<'MSG'
metis-server is installed. To run it:
  1. systemctl enable --now metis-server
  2. open http://<this server>:8080/setup and choose the database there;
     the setup token is in: journalctl -u metis-server | grep "setup token"
  (or set DATABASE_URL and the secrets in /etc/metis-server/metis-server.env first)
After an upgrade, take a backup, then: systemctl restart metis-server
MSG

exit 0
