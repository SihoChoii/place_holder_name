# Stargaze

Hackathon monorepo for a mobile sky viewer: camera pass-through, star alignment (GPS + gyroscope + time), accounts, and social media on stars.

```
apps/
  ios/     SwiftUI + ARKit sky app
  web/     Next.js marketing + catalog + auth UI
  api/     Hono REST API (auth, stars, media, reactions)
packages/
  db/      Prisma + PostgreSQL schema
  shared/  Zod schemas + shared TypeScript types
```

## Prerequisites

- Node 20+ and [pnpm](https://pnpm.io)
- Docker (for Postgres)
- Xcode 16+ and [XcodeGen](https://github.com/yonaskolb/XcodeGen) for the iOS app

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:push
pnpm db:generate
pnpm --filter @stargaze/api seed

# terminal 1
pnpm dev:api

# terminal 2
pnpm dev:web
```

- Web: http://localhost:3000  
- API: http://localhost:4000/health  
- Prisma Studio: `pnpm db:studio`

### iOS

```bash
cd apps/ios
xcodegen generate
open Stargaze.xcodeproj
```

Run on a physical iPhone. For device → Mac API calls, set `APIClient.baseURL` to your Mac’s LAN IP (see `apps/ios/README.md`).

## API surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Log in |
| GET | `/auth/me` | Bearer | Current user |
| GET | `/stars` | — | Catalog search |
| GET | `/stars/:id` | — | Star detail |
| GET | `/stars/:id/media` | — | Media on a star |
| POST | `/media` | Bearer | Attach media / note |
| POST | `/media/:id/reactions` | Bearer | React |
| DELETE | `/media/:id/reactions/:emoji` | Bearer | Remove reaction |

## Database models

`User` → `Media` → `Reaction`, with `Media` linked to `Star` (RA/Dec catalog).

## Scripts

| Script | What it does |
|--------|----------------|
| `pnpm dev` | Turbo-run API + web |
| `pnpm db:up` / `db:down` | Start/stop Postgres |
| `pnpm db:push` | Sync Prisma schema |
| `pnpm db:migrate` | Create migrations |
| `pnpm --filter @stargaze/api seed` | Seed bright stars |
