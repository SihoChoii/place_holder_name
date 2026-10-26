# Model preflight

`pnpm models:check` runs these against the configured hosts **from the backend laptop** and writes
`data/models-check.json`. `--write-lock` writes `docs/model-lock.json` (Ollama version, model tag, digest) only when all pass.
`MODEL_LOCK_PATH` can select another lock path for both the command and runtime readiness. Readiness reports
`unverified` when no accepted lock exists, and `drift` when the configured model/digest/version differs from it.

| # | Check | Spec |
| --- | --- | --- |
| 1 | Both hosts reachable, models present (`/api/version`, `/api/tags` digest) | §4 |
| 2 | Guide normal answer, warm latency | §4.1 |
| 3 | Guide tool call with the app's tool schemas | §4.1 |
| 4 | Guide streaming (≥ 2 chunks) and cancellation | §4.1 |
| 5 | Clef accepted + rejected text fixture for each of the 5 categories | §4.3, §9 |
| 6 | Clef on 4 images (JPEG/PNG/WebP sources, 1024 px derivatives) | §4.2 |
| 7 | Two guide requests + one moderation request concurrently | §4.4 |

Disconnect/reconnect (§4.5) is exercised by stopping Ollama while the API runs: `/api/health/ready` shows the
component `unavailable`, posts stay pending (`delayed` → `review_failed`), and `pnpm moderation:retry --all-failed`
recovers after restart.

## Results

None yet. The model hosts' LAN addresses were not available to the backend agent, so **no live check has been run**.
`docs/model-lock.json` does not exist until a real run passes.
