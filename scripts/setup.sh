#!/usr/bin/env bash
# First-time / repeatable setup: .env (never overwritten), install, build, migrate. No Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

node -e 'const [M]=process.versions.node.split(".").map(Number); if (M < 20) { console.error("Node >= 20 required (spec targets Node 24)"); process.exit(1) } if (M !== 24) console.warn(`Note: Node ${process.versions.node}; the spec targets Node 24 LTS.`)'

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi
if ! grep -Eq '^JWT_SECRET=[^[:space:]#]{32,}' .env; then
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  if grep -q '^JWT_SECRET=' .env; then
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env && rm -f .env.bak
  else
    printf '\nJWT_SECRET=%s\n' "${SECRET}" >> .env
  fi
  echo "Generated JWT_SECRET in .env"
fi
for v in GUIDE_BASE_URL CLEF_BASE_URL; do
  grep -Eq "^${v}=" .env || grep -Eq "^GEMMA_BASE_URL=" .env || echo "WARNING: set ${v} in .env (model host on the LAN)"
done

pnpm install --frozen-lockfile || pnpm install
pnpm build
pnpm db:migrate
mkdir -p data/media

echo ""
echo "Ready. Next:"
echo "  pnpm models:check   # real Gemma/Clef preflight"
echo "  pnpm start          # API + website on http://<this-host>:4000"
