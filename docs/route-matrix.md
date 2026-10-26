# Route matrix

All paths are under `/api`. Status: `planned` → `implemented` (automated tests pass) → `live-verified` (real models/devices).
No route is `live-verified` yet: the Gemma/Clef hosts and a physical iPhone have not been reachable from this machine.
`docs/openapi.json` is generated from the registered routes (`pnpm openapi`, 27 paths = the 30 rows below, with PUT/DELETE reaction and GET/POST comments sharing paths).

| Route | Auth | Step | Status |
| --- | --- | --- | --- |
| `POST /auth/signup` | none (+Origin) | 05 | implemented |
| `POST /auth/login` | none (+Origin) | 05 | implemented |
| `POST /auth/logout` | none (+Origin) | 05 | implemented |
| `GET /me` | user | 05 | implemented |
| `GET /stars/:hyg_id` | user | 06 | implemented |
| `GET /stars/:hyg_id/travel-time` | user | 06 | implemented |
| `POST /stars/:hyg_id/claim` | user, Idempotency-Key | 06 | implemented |
| `GET /stars/:hyg_id/tags` | user | 10 | implemented |
| `POST /tags` | user, Idempotency-Key | 08 | implemented |
| `GET /tags/:id` | user | 10 | implemented |
| `DELETE /tags/:id` | user (author) | 11 | implemented |
| `GET /me/tags` | user | 10 | implemented |
| `GET /media/:id` | user | 08 | implemented |
| `POST /view/content` | user | 10 | implemented |
| `GET /tags/:id/comments` | user | 11 | implemented |
| `POST /tags/:id/comments` | user, Idempotency-Key | 11 | implemented |
| `DELETE /comments/:id` | user (author) | 11 | implemented |
| `PUT /tags/:id/reactions/:emoji` | user | 11 | implemented |
| `DELETE /tags/:id/reactions/:emoji` | user | 11 | implemented |
| `GET /explore/feed` | user | 12 | implemented |
| `GET /explore/search` | user | 12 | implemented |
| `GET /public/stars/:hyg_id` | none | 12 | implemented |
| `GET /public/stars/:hyg_id/tags` | none | 12 | implemented |
| `GET /public/feed` | none | 12 | implemented |
| `GET /public/search` | none | 12 | implemented |
| `GET /public/tags/:id/comments` | none | 12 | implemented |
| `GET /public/media/:id` (`?size=thumb`) | none | 12 | implemented |
| `GET /public/claimed` | none | 12 | implemented (ETag/304) |
| `POST /agent/chat` | user | 13 | implemented |
| `GET /health/live` | none | 02 | implemented |
| `GET /health/ready` | none | 15 | implemented |
