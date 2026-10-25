#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

pnpm install
pnpm db:up

echo "Waiting for Postgres…"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U stargaze >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

pnpm db:generate
pnpm db:push

if command -v xcodegen >/dev/null 2>&1; then
  pnpm ios:gen
else
  echo "XcodeGen not found — skip iOS project (brew install xcodegen)"
fi

echo ""
echo "Template ready."
echo "  pnpm dev"
echo "  pnpm ios:gen && open apps/ios/Stargaze.xcodeproj"
