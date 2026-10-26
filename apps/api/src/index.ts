import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { acquireProcessLock, ProcessLockError } from "./lib/lock.js";

/** Process entry: one API process with one moderation loop. Stops cleanly on SIGINT/SIGTERM. */
const config = loadConfig();
let releaseLock: () => void;
try {
  releaseLock = acquireProcessLock(config.dbPath);
} catch (e) {
  if (!(e instanceof ProcessLockError)) throw e;
  console.error(e.message);
  process.exit(1);
}
process.on("exit", releaseLock);
const server = await buildApp(config, { background: true });
const { app } = server;

let closing = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    app.log.info({ signal: sig }, "shutting down");
    server.close().then(() => process.exit(0), (e) => { app.log.error(e); process.exit(1); });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ db: config.dbPath, media: config.mediaDir, moderation: config.moderationEnabled }, "Star Tagger API ready");
} catch (e) {
  app.log.error(e);
  await server.close();
  process.exit(1);
}
