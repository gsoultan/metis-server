#!/bin/sh
# Tell systemd the unit is gone. The metis-server account, /etc/metis-server
# and /var/lib/metis-server are kept: the state directory may hold
# config.yaml, which carries the at-rest encryption key, and losing it makes
# the database's encrypted variables unreadable. Remove them by hand if you
# mean to.
set -e

if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
fi

exit 0
