#!/usr/bin/env bash
#
# Start Metis for local development from this checkout: PostgreSQL, the engine,
# and this web app's Vite dev server, with one Ctrl-C stopping them all. Sign in
# at http://localhost:5273 as admin / admin.
#
#   ./scripts/dev.sh              engine + UI (default)
#   ./scripts/dev.sh --reset      start again with an empty development database
#   ./scripts/dev.sh --sample     set up and fill it with worked examples
#   ./scripts/dev.sh --wizard     leave a fresh database to the setup wizard
#   ./scripts/dev.sh backend      the engine only
#   ./scripts/dev.sh ui           this web app only, against an engine on :8273
#
# The engine owns the development stack, so this runs the engine checkout's own
# scripts/dev.sh (METIS_ENGINE_DIR, default ../metis) and points its UI at this
# repository. Every argument and setting (UI_PORT, API_PORT, DATABASE_URL, ...)
# goes to it unchanged; see its --help.
#
# admin / admin is development only. The engine's script sets a fresh
# development database up through the setup wizard with a long random password,
# then writes the hash of "admin" into that one database. No build of the engine
# or of metis-server accepts a password that short, and nothing here changes
# what either binary, the Dockerfile or docker-compose.yml does.

set -Eeuo pipefail

readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENGINE_DIR="${METIS_ENGINE_DIR:-$ROOT/../metis}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--help) sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

[[ -x "$ENGINE_DIR/scripts/dev.sh" ]] \
  || die "no metis engine checkout at $ENGINE_DIR: clone gsoultan/metis there, or set METIS_ENGINE_DIR"

# Compile the engine first, unless only the UI is asked for. The engine's script
# starts it with `go run` and, alongside, a setup step that waits 60 seconds for
# it to answer. On a machine's first run `go run` compiles every dependency,
# which takes minutes, so the setup step gave up and the database stayed at the
# setup wizard: admin / admin did not sign in. With the build cache warm from
# here, `go run` (or air) only links.
if [[ " $* " != *" ui "* && " $* " != *" front "* && " $* " != *" frontend "* \
      && " $* " != *" -h "* && " $* " != *" --help "* ]]; then
  printf '==> Compiling the engine (minutes on the first run, seconds after)\n'
  (cd "$ENGINE_DIR" && go build -o /dev/null ./cmd/metis) || die "the engine in $ENGINE_DIR does not compile"
fi

# The engine's script runs the UI from METIS_SERVER_DIR; this checkout, always,
# so a second clone of metis-server elsewhere is never the one that starts.
export METIS_SERVER_DIR="$ROOT"
exec "$ENGINE_DIR/scripts/dev.sh" "$@"
