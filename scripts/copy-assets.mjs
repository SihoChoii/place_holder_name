import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'src');
const destinationRoot = join(root, 'dist');

async function copyAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) {
      await copyAssets(source);
      continue;
    }
    const relativePath = relative(sourceRoot, source);
    const isAsset = entry.name.endsWith('.md') || entry.name.endsWith('.sql') || relativePath === join('agent', 'evals', 'golden.json');
    if (!isAsset) continue;
    const destination = join(destinationRoot, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

await copyAssets(sourceRoot);
