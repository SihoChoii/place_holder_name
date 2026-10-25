#!/usr/bin/env bash
# One API process serves /api and the Next.js static export on the same origin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
[[ -f apps/api/dist/index.js ]] || { echo "Not built yet: run pnpm build" >&2; exit 1; }
[[ -f apps/web/out/index.html ]] || { echo "Website not built: run pnpm build" >&2; exit 1; }
exec node apps/api/dist/index.js
