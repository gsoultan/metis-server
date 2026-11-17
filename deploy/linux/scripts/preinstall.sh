#!/bin/sh
# Create the unprivileged system account the service runs as. Idempotent, so
# upgrades and reinstalls go through it unchanged. Its own account rather
# than the engine's `metis`: this process needs none of the engine's secrets,
# and on a host running both it must not be able to read them.
set -e

if ! getent group metis-server >/dev/null 2>&1; then
    if command -v groupadd >/dev/null 2>&1; then
        groupadd --system metis-server
    else
        addgroup -S metis-server
    fi
fi

if ! getent passwd metis-server >/dev/null 2>&1; then
    if command -v useradd >/dev/null 2>&1; then
        useradd --system --gid metis-server --home-dir /nonexistent --no-create-home \
            --shell /usr/sbin/nologin --comment "Metis web app" metis-server 2>/dev/null ||
        useradd --system --gid metis-server --home-dir /nonexistent --no-create-home \
            --shell /sbin/nologin --comment "Metis web app" metis-server
    else
        adduser -S -D -H -h /nonexistent -s /sbin/nologin -G metis-server -g "Metis web app" metis-server
    fi
fi

exit 0
