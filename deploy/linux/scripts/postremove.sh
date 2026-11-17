#!/bin/sh
# Tell systemd the unit is gone. The metis-server account and
# /etc/metis-server are kept, so a reinstall finds the settings it had.
set -e

if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload >/dev/null 2>&1 || true
fi

exit 0
