# Route matrix

All paths are under `/api`. Status: `planned` → `implemented` (automated tests pass) → `live-verified` (real models/devices).

| Route | Auth | Step | Status |
| --- | --- | --- | --- |
| `POST /auth/signup` | none (+Origin) | 05 | planned |
| `POST /auth/login` | none (+Origin) | 05 | planned |
| `POST /auth/logout` | none (+Origin) | 05 | planned |
| `GET /me` | user | 05 | planned |
| `GET /stars/:hyg_id` | user | 06 | planned |
| `GET /stars/:hyg_id/travel-time` | user | 06 | planned |
| `POST /stars/:hyg_id/claim` | user, Idempotency-Key | 06 | planned |
| `GET /stars/:hyg_id/tags` | user | 10 | planned |
| `POST /tags` | user, Idempotency-Key | 08 | planned |
| `GET /tags/:id` | user | 10 | planned |
| `DELETE /tags/:id` | user (author) | 11 | planned |
| `GET /me/tags` | user | 10 | planned |
| `GET /media/:id` | user | 08 | planned |
| `POST /view/content` | user | 10 | planned |
| `GET /tags/:id/comments` | user | 11 | planned |
| `POST /tags/:id/comments` | user, Idempotency-Key | 11 | planned |
| `DELETE /comments/:id` | user (author) | 11 | planned |
| `PUT /tags/:id/reactions/:emoji` | user | 11 | planned |
| `DELETE /tags/:id/reactions/:emoji` | user | 11 | planned |
| `GET /explore/feed` | user | 12 | planned |
| `GET /explore/search` | user | 12 | planned |
| `GET /public/stars/:hyg_id` | none | 12 | planned |
| `GET /public/stars/:hyg_id/tags` | none | 12 | planned |
| `GET /public/feed` | none | 12 | planned |
| `GET /public/search` | none | 12 | planned |
| `GET /public/tags/:id/comments` | none | 12 | planned |
| `GET /public/media/:id` | none | 12 | planned |
| `POST /agent/chat` | user | 13 | planned |
| `GET /health/live` | none | 02 | planned |
| `GET /health/ready` | none | 15 | planned |
