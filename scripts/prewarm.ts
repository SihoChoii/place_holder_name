import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { prewarm, type PrewarmOptions } from '../src/agent/prewarm.js';
import { isPlainObject } from '../src/agent/util.js';

function usage(): never {
  throw new Error('Usage: npm run prewarm -- --adapter <absolute-or-relative-local-module>');
}

function isPrewarmOptions(value: unknown): value is PrewarmOptions {
  if (!isPlainObject(value)) return false;
  const { db, backend, config, fetch, wikipedia, limit } = value;
  if (db === null || typeof db !== 'object') return false;
  if (backend === null || typeof backend !== 'object' || !('catalog' in backend) || typeof backend.catalog !== 'function') {
    return false;
  }
  return isPlainObject(config)
    && typeof config.guideBaseUrl === 'string'
    && typeof config.guideModel === 'string'
    && (fetch === undefined || typeof fetch === 'function')
    && (wikipedia === undefined || typeof wikipedia === 'boolean')
    && (limit === undefined || typeof limit === 'number');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--adapter' || args[1] === undefined || args[1].trim() === '') usage();

  const adapterUrl = pathToFileURL(resolve(args[1])).href;
  // The operator supplies this trusted local integration module at runtime.
  const loaded: unknown = await import(adapterUrl);
  if (!isPlainObject(loaded) || !isPrewarmOptions(loaded.default)) {
    throw new Error('The prewarm adapter default export must be PrewarmOptions with db, backend, and config.');
  }

  const result = await prewarm(loaded.default, new AbortController().signal);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
