import { writeFileSync } from "node:fs";
import { loadConfig } from "../config.js";
import { buildApp } from "../app.js";
import { fromRoot } from "../lib/paths.js";

/** pnpm openapi — write docs/openapi.json from the registered routes and their schemas. */
const config = loadConfig({ ...process.env, DB_PATH: ":memory:" }, { partial: true });
const server = await buildApp({ ...config, dbPath: ":memory:" }, { logger: false, webDist: null });
await server.app.ready();
const spec = server.app.swagger();
writeFileSync(fromRoot("docs/openapi.json"), JSON.stringify(spec, null, 2) + "\n");
console.log(`docs/openapi.json: ${Object.keys((spec as { paths: object }).paths).length} paths`);
await server.close();
