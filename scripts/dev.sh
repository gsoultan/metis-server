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
# The engine and its database are the engine checkout's business, so this runs
# that checkout's scripts/dev.sh (METIS_ENGINE_DIR, default ../metis) for them,
# with --reset, --sample, --wizard, API_PORT, GRPC_PORT and DATABASE_URL passed
# through; see its --help. The web app is this repository's, so this starts it:
# Vite on UI_PORT (default 5273), proxying /api to the engine on API_PORT.
#
# admin / admin is development only. The engine's script sets a fresh
# development database up through the setup wizard with a long random password,
# then writes the hash of "admin" into that one database. No build of the engine
# or of metis-server accepts a password that short, and nothing here changes
# what either binary, the Dockerfile or docker-compose.yml does.

set -Eeuo pipefail

readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENGINE_DIR="${METIS_ENGINE_DIR:-$ROOT/../metis}"
# 5273 rather than Vite's 5173, which every other Vite project already uses.
readonly UI_PORT="${UI_PORT:-5273}"
readonly API_PORT="${API_PORT:-8273}"
export API_PORT

die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '  ->  %s\n' "$*"; }

require_engine() {
  [[ -x "$ENGINE_DIR/scripts/dev.sh" ]] \
    || die "no metis engine checkout at $ENGINE_DIR: clone gsoultan/metis there, or set METIS_ENGINE_DIR"
}

require_ui() {
  command -v bun >/dev/null 2>&1 \
    || die "bun is not installed. Install it from https://bun.sh (or run: brew install oven-sh/bun/bun)"
  if lsof -nP -iTCP:"$UI_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "port $UI_PORT is in use: stop what holds it, or set UI_PORT to something free"
  fi
  [[ -d "$ROOT/ui/node_modules" ]] || { info "Installing UI dependencies"; (cd "$ROOT/ui" && bun install); }
}

# run_ui starts Vite with its output prefixed the way the engine's script
# prefixes its own, so it is clear which lines came from where. Through process
# substitution rather than a pipeline, so that $! is Vite's shell, not sed's.
run_ui() {
  # Tells the Vite proxy where the engine is, so a non-default API_PORT still
  # works end to end.
  export METIS_BACKEND="http://localhost:${API_PORT}"
  info "UI       -> http://localhost:${UI_PORT}"
  cd "$ROOT/ui"
  exec bun run dev -- --port "$UI_PORT" --strictPort
}

# stop signals each job's whole process group: the engine's script stops its
# own servers on TERM, and Vite's group holds bun and the node process under it.
stop() {
  trap - INT TERM HUP EXIT
  set +m
  local pid
  for pid in "$@"; do
    kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

# compile_engine builds the engine once before its script starts it. That
# script runs it with `go run` and, alongside, a setup step that waits 60
# seconds for it to answer. On a machine's first run `go run` compiles every
# dependency, which takes minutes, so the setup step gave up and the database
# stayed at the setup wizard: admin / admin did not sign in. With the build
# cache warm from here, `go run` (or air) only links.
compile_engine() {
  info "Compiling the engine (minutes on the first run, seconds after)"
  (cd "$ENGINE_DIR" && go build -o /dev/null ./cmd/metis) || die "the engine in $ENGINE_DIR does not compile"
}

main() {
  local target="all" arg
  local engine_args=()
  for arg in "$@"; do
    case "$arg" in
      -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
      backend|api) target="backend" ;;
      ui|front|frontend) target="ui" ;;
      all) target="all" ;;
      *) engine_args+=("$arg") ;;
    esac
  done

  case "$target" in
    backend)
      require_engine
      compile_engine
      exec "$ENGINE_DIR/scripts/dev.sh" backend ${engine_args[@]+"${engine_args[@]}"}
      ;;
    ui)
      (( ${#engine_args[@]} == 0 )) \
        || printf 'warning: %s does nothing for the UI alone\n' "${engine_args[*]}" >&2
      require_ui
      run_ui
      ;;
    all)
      require_engine
      require_ui
      compile_engine

      # Both run in the background so either one stopping stops the other.
      # `set -m` makes each its own process group, so stop can signal the whole
      # tree rather than only the shell that started it (setsid does not exist
      # on macOS).
      set -m
      "$ENGINE_DIR/scripts/dev.sh" backend ${engine_args[@]+"${engine_args[@]}"} &
      ENGINE_PID=$!
      ( run_ui ) > >(sed -u 's/^/[ui] /') 2>&1 &
      UI_PID=$!
      set +m
      # Jobs in their own process groups do not get the terminal's Ctrl-C, so
      # the trap passes it on as TERM, which the engine's script stops on.
      trap 'stop "$ENGINE_PID" "$UI_PID"' INT TERM HUP EXIT

      info "Open http://localhost:${UI_PORT} once the engine is up. Ctrl-C stops both."
      # A poll rather than `wait -n`, which macOS's bash 3.2 does not have.
      while kill -0 "$ENGINE_PID" 2>/dev/null && kill -0 "$UI_PID" 2>/dev/null; do
        sleep 1
      done
      ;;
  esac
}

main "$@"
