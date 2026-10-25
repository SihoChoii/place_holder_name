# Operations runbook

## Machines and ports

| Machine | Role | Port | Notes |
| --- | --- | --- | --- |
| MacBook 24 GB (backend) | API + SQLite + photos + website | 4000 (`PORT`) | `data/` on local disk (not iCloud/Dropbox) |
| MacBook 32 GB | Gemma guide (Ollama) | 11434 | `GUIDE_BASE_URL=http://<host>:11434`, model `gemma4:e4b-it-q4_K_M` |
| Laptop 32 GB / 14 GB VRAM | Clef moderation (Ollama ≥ 0.35) | 11434 | `CLEF_BASE_URL=http://<host>:11434`, model `clef-flash:9b-q8_0` |

Addresses are not recorded here until known; put them in `.env` only. Firewall 11434 to the backend host.
Check Wi-Fi client isolation if the phone cannot reach `http://<backend-host>:4000/api/health/live`.

## Model hosts (each inference laptop)

Set in the Ollama service environment, then restart Ollama (`launchctl setenv …` + restart app on macOS;
`systemctl edit ollama` on Linux):

```dotenv
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_NO_CLOUD=1
OLLAMA_CONTEXT_LENGTH=4096
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_MAX_QUEUE=4
OLLAMA_KEEP_ALIVE=-1
```

```bash
ollama pull gemma4:e4b-it-q4_K_M     # guide host
ollama pull clef-flash:9b-q8_0       # moderation host
ollama ps                            # verify context + GPU/CPU placement
```

From the backend laptop: `pnpm models:check` (then `pnpm models:check --write-lock` once all pass).
If Clef fails on the GPU laptop, swap roles (Clef on the 24 GB Mac, API on the GPU laptop) **before** creating demo data.

## Start / stop

```bash
pnpm start                 # foreground; Ctrl-C (SIGINT) or SIGTERM stops cleanly
```

- One API process per data directory: a second start exits with "Another Star Tagger API (pid N)…" (`data/api.pid`).
- Startup applies pending migrations, removes orphaned upload files older than 1 h, starts the moderation loop and
  background model probes. Unfinished moderation jobs persist in SQLite and resume automatically after restart.
- Liveness: `GET /api/health/live`. Readiness: `GET /api/health/ready` (database, media, guide, moderation).
- Website: build the SPA into `apps/web/dist` (web team: `pnpm --filter @stargaze/web build`), restart the API; it serves
  the SPA at `/` with `index.html` fallback. In web development, the Vite dev server proxies `/api` to `http://<host>:4000`.
- `APP_ORIGIN` must list every origin browsers use (comma-separated), e.g. `http://192.168.1.20:4000,http://localhost:5173`.

## Moderation recovery

```bash
pnpm moderation:list                      # queued/failed jobs, oldest pending age
pnpm moderation:retry --all-failed        # after restoring the Clef host
pnpm moderation:retry <job-id>
pnpm moderation:approve <tag-id> --reason "demo: operator reviewed"   # audited; never counts as real moderation
```

Retries happen after 5, 15, 30, 60 s; the 5th failure marks the job failed (`review_failed` for the author).
Content stays pending (never auto-approved) while Clef is down.

## Backup / restore

```bash
pnpm db:backup                    # → data/backups/<timestamp>/{stargaze.sqlite, media/, manifest.json}
```

Restore: stop the API, copy `stargaze.sqlite` to `DB_PATH` (delete any stale `-wal`/`-shm` next to it) and the
`media/*.webp` files into `MEDIA_DIR`, then start. Never copy only the live main DB file while the API runs.

## Client base URLs

- Web: relative `/api/...` (same origin). Cookie `st_session` (HttpOnly, SameSite=Lax).
- iOS: `http://<backend-lan-host>:4000` (configurable in the app), bearer token in Keychain; ATS exception and
  `NSLocalNetworkUsageDescription` required for plain-HTTP LAN access.
