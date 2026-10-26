/** Disposable integration server. Model responses are explicitly fixtures, never live-model evidence. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../../api/src/config.js';
import { buildApp } from '../../api/src/app.js';
import { startFakeOllama } from '../../api/test/fixtures/fake-ollama.js';
const dir = mkdtempSync(join(tmpdir(), 'startagger-ios-integration-'));
const port = Number(process.env.IOS_TEST_API_PORT ?? 4400);
const host = process.env.IOS_TEST_API_HOST ?? '::';
const fake = await startFakeOllama();
const config = loadConfig({ JWT_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: `http://localhost:${port}`, DB_PATH: join(dir, 'db.sqlite'), MEDIA_DIR: join(dir, 'media'), GUIDE_BASE_URL: fake.url, CLEF_BASE_URL: fake.url, RATE_SIGNUP_PER_HOUR: '100' }, { dotenv: false });
const server = await buildApp(config, { background: true, webDist: null, logger: false });
await server.app.listen({ host, port });
console.log(`TEST API port ${port} (${host}) — disposable DB; fixture guide/moderation`);
console.log('Data directory:', dir);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await server.close(); await fake.close(); process.exit(0); });
