#!/usr/bin/env bash
# Star Tagger: get the whole project (API + website) running on http://localhost:4000
#
# Usage (from anywhere):
#   bash scripts/run-local.sh         # run from the repo (it finds the repo root from its own location)
#   STAR_TAGGER_DIR=~/Documents/place_holder_name bash run-local.sh
#   bash run-local.sh --clone         # clone https://github.com/SihoChoii/place_holder_name into ./place_holder_name first
#   bash run-local.sh --update        # git pull --ff-only on the current branch first
#   bash run-local.sh --seed          # also run `pnpm seed` (demo data; see docs/operations.md)
#   bash run-local.sh --background    # start the server in the background, log to data/server.log
#
# What it does: checks Node and pnpm, creates .env if missing (the repo's setup script also
# generates JWT_SECRET), installs, builds the API and website, migrates the SQLite database,
# frees nothing on its own (it stops if port 4000 is busy), starts the server, and waits for
# GET /api/health/live to answer. It never overwrites an existing .env and never prints secrets.
#
# AI models: the guide and moderation need the Gemma and clef computers. Set GUIDE_BASE_URL,
# GUIDE_MODEL, GUIDE_API_STYLE, CLEF_BASE_URL, CLEF_MODEL, CLEF_API_STYLE (and keys) in .env.
# Without them the site still runs, the guide is "unavailable", and new posts stay pending.

set -euo pipefail

REPO_URL="https://github.com/SihoChoii/place_holder_name.git"
PORT="${PORT:-4000}"
DO_CLONE=0; DO_UPDATE=0; DO_SEED=0; DO_BG=0
for arg in "$@"; do
  case "$arg" in
    --clone) DO_CLONE=1 ;;
    --update) DO_UPDATE=1 ;;
    --seed) DO_SEED=1 ;;
    --background) DO_BG=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# 1. Find (or clone) the repo
if [[ "$DO_CLONE" == 1 ]]; then
  command -v git >/dev/null || die "git is not installed"
  [[ -d place_holder_name/.git ]] || git clone "$REPO_URL" place_holder_name
  ROOT="$(cd place_holder_name && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -n "${STAR_TAGGER_DIR:-}" ]]; then ROOT="$STAR_TAGGER_DIR"
  elif [[ -f "$SCRIPT_DIR/../pnpm-workspace.yaml" ]]; then ROOT="$SCRIPT_DIR/.."
  else ROOT="$PWD"; fi
  ROOT="$(cd "$ROOT" && pwd)"
fi
[[ -f "$ROOT/pnpm-workspace.yaml" && -d "$ROOT/apps/api" ]] || die "$ROOT is not the Star Tagger repo (run it from inside the repo, set STAR_TAGGER_DIR, or use --clone)"
cd "$ROOT"
say "Repo: $ROOT"

if [[ "$DO_UPDATE" == 1 ]]; then
  say "Updating (fast-forward only)"
  git pull --ff-only
fi

# 2. Tools
command -v node >/dev/null || die "Node is not installed. Install Node 24 (https://nodejs.org) and rerun."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node 20 or newer is required (found $(node -v)). Node 24 is what the project targets."
[[ "$NODE_MAJOR" == 24 ]] || echo "Note: Node $(node -v) found; the project targets Node 24."

if ! command -v pnpm >/dev/null; then
  if command -v corepack >/dev/null; then
    say "Enabling pnpm through corepack"
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
  else
    die "pnpm is not installed. Run: npm install -g pnpm@9.15.0"
  fi
fi

# 3. Port check
port_busy() {
  if command -v lsof >/dev/null; then lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null; then ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN
  else (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null
  fi
}
if port_busy; then
  die "Port $PORT is already in use. If it is an old Star Tagger server, stop it first (for example: lsof -ti tcp:$PORT | xargs kill) and rerun."
fi

# 4. .env and local-origin settings
say "Setting up (.env, install, build, database migration)"
bash scripts/setup.sh

# Make sure the website origin for this machine is allowed for cookie writes.
if ! grep -Eq '^APP_ORIGIN=.*http://localhost:'"$PORT" .env; then
  if grep -q '^APP_ORIGIN=' .env; then
    sed -i.bak "s|^APP_ORIGIN=\(.*\)|APP_ORIGIN=\1,http://localhost:${PORT}|" .env && rm -f .env.bak
  else
    printf '\nAPP_ORIGIN=http://localhost:%s\n' "$PORT" >> .env
  fi
  echo "Added http://localhost:$PORT to APP_ORIGIN in .env"
fi

if [[ "$DO_SEED" == 1 ]]; then
  say "Seeding demo data"
  pnpm seed
fi

# 5. Start
mkdir -p data
export PORT HOST="${HOST:-0.0.0.0}"
if [[ "$DO_BG" == 1 ]]; then
  say "Starting in the background"
  nohup pnpm start > data/server.log 2>&1 &
  echo $! > data/server.pid
  echo "Server PID $(cat data/server.pid), log: $ROOT/data/server.log (stop with: lsof -ti tcp:$PORT | xargs kill)"
else
  say "Starting in the foreground (press Ctrl+C to stop)"
  pnpm start &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT
fi

# 6. Wait until it answers
say "Waiting for http://localhost:$PORT/api/health/live"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT/api/health/live" >/dev/null 2>&1; then
    echo
    echo "Star Tagger is up:  http://localhost:$PORT"
    echo "Health:             http://localhost:$PORT/api/health/ready  (models show as unavailable until Gemma and clef are configured)"
    echo "From the phone use: http://<this-computer-LAN-address>:$PORT/api"
    [[ "$DO_BG" == 1 ]] && exit 0
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 1
done
die "The server did not answer within 60 seconds. Check the output above (or data/server.log with --background)."
