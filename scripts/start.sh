#!/usr/bin/env bash
# Start the built API (one process, one moderation loop). It also serves apps/web/dist when built.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
[[ -f apps/api/dist/index.js ]] || { echo "Not built yet: run pnpm build" >&2; exit 1; }
exec node apps/api/dist/index.js
