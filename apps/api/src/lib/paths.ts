import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root = nearest ancestor of this module containing pnpm-workspace.yaml (independent of cwd). */
export const REPO_ROOT = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error("Cannot locate repository root (pnpm-workspace.yaml)");
    dir = up;
  }
})();

export const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));
