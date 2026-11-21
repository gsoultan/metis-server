#!/bin/sh
# Reload systemd so it sees the unit, and on a fresh install enable and start
# the service, so it is running now and comes back on every boot:
#
# - A fresh install with no DATABASE_URL serves the setup wizard on :8080,
#   behind the one-time setup token in the log, so the first thing to do is
#   open http://<this server>:8080/setup.
# - An upgrade enables, starts and restarts nothing. The new binary carries
#   the engine and may carry schema migrations, so take a backup before the
#   first start of a new release; the running server keeps running the old
#   binary until you restart it yourself. Nor is a service the operator
#   disabled turned back on.
#
# How each format says "upgrade": deb passes "configure" and the old version,
# rpm passes the number of versions installed (2 or more). apk and Arch run
# this script on a fresh install only (an upgrade has its own hook, which this
# package does not use) and pass the new version.
set -e

fresh_install=true
case "$1" in
    configure) [ -z "${2:-}" ] || fresh_install=false ;;
    [2-9]|[1-9][0-9]) fresh_install=false ;;
esac

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
    if [ "$fresh_install" = true ]; then
        systemctl enable --now metis-server.service >/dev/null 2>&1 || true
    fi
elif command -v rc-update >/dev/null 2>&1; then
    # OpenRC (Alpine). Added to the default runlevel even where OpenRC is not
    # running, such as a container being built, so it starts on the next
    # boot; started now only where it is.
    if [ "$fresh_install" = true ]; then
        rc-update add metis-server default >/dev/null 2>&1 || true
        rc-service metis-server start >/dev/null 2>&1 || true
    fi
fi

if [ "$fresh_install" = true ]; then
    cat <<'MSG'
metis-server is installed, enabled at boot and started. Next:
  open http://<this server>:8080/setup and choose the database there;
  the setup token is in: journalctl -u metis-server | grep "setup token"
  (on Alpine: /var/log/metis-server/metis-server.log)
Or set DATABASE_URL and the secrets in /etc/metis-server/metis-server.env,
then: systemctl restart metis-server
MSG
else
    cat <<'MSG'
metis-server is upgraded. The running server still runs the old binary:
take a backup, then: systemctl restart metis-server
MSG
fi

exit 0
