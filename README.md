# Stargaze monorepo

Empty Turborepo template for the hackathon project.

```
apps/
  ios/     Native iOS app (XcodeGen)
  web/     Website frontend (Next.js)
  api/     Backend API (Hono)
packages/
  db/      Database (Prisma + PostgreSQL)
  shared/  Shared TypeScript types / contracts
```

## Prerequisites

- Node 20+ and [pnpm](https://pnpm.io)
- Docker (Postgres)
- Xcode + [XcodeGen](https://github.com/yonaskolb/XcodeGen) for iOS

## Setup

```bash
pnpm setup    # .env, install, Postgres, Prisma generate/push, iOS project
pnpm dev      # API :4000 + web :3000
```

| | |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000/health |
| Postgres | `localhost:5433` |

### iOS

```bash
pnpm ios:gen
open apps/ios/Stargaze.xcodeproj
```

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm setup` | First-time bootstrap |
| `pnpm dev` | Run API + web |
| `pnpm db:up` / `db:down` | Start/stop Postgres |
| `pnpm db:push` | Sync Prisma schema |
| `pnpm db:migrate` | Create migrations |
| `pnpm ios:gen` | Regenerate Xcode project |

Packages are intentionally empty shells — add product code as you build features.
