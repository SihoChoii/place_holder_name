import type Database from 'better-sqlite3';

import type { CatalogIndex } from '../catalog.js';
import type { Config } from '../config.js';
import type { Digest } from '../memory/digest.js';
import type { Prefs } from '../memory/prefs.js';
import type { Moderator } from '../moderation/pipeline.js';
import type {
  Access,
  BackendReads,
  Client,
  DraftCard,
  FactCard,
  Mode,
  RequestCtx,
  StarFacts,
} from '../types.js';

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolEnv {
  backend: BackendReads;
  db: Database.Database;
  ctx: RequestCtx;
  prefs: Prefs;
  moderator: Moderator;
  catalog: CatalogIndex;
  digest: Digest;
  cfg: Config;
  now: () => number;
  facts: Map<number, StarFacts>;
}

export interface ToolResult {
  data: unknown;
  card?: FactCard | DraftCard;
  refs: number[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
  modes: Mode[];
  clients: Client[];
  access: Access;
  idArgs?: string[];
  tagArg?: string;
  run(
    args: Record<string, unknown>,
    env: ToolEnv,
    signal: AbortSignal,
    deadlineMs: number,
  ): Promise<ToolResult>;
}

export class ToolDenied extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
