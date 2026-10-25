import { withDeadline } from '../util.js';
import { MODERATION_QUESTION, decideModeration, systemOne } from './clef.js';
import { applyRules } from './rules.js';

export type { ModerationInput, Verdict } from './rules.js';
import type { ModerationInput, Verdict } from './rules.js';

export interface Moderator {
  classifyText(
    input: ModerationInput,
    signal: AbortSignal,
    opts?: { timeoutMs?: number },
  ): Promise<{ verdict: Verdict }>;
}

export function createModerator(
  cfg: { clefBaseUrl: string | null; clefModel: string },
  fetchImpl: typeof fetch = globalThis.fetch,
): Moderator {
  return {
    async classifyText(input, signal, opts) {
      const rules = applyRules(input);
      if (rules.verdict === 'rejected') return { verdict: 'rejected' };
      if (!cfg.clefBaseUrl) return { verdict: 'pending' };
      try {
        const answers = await withDeadline(signal, opts?.timeoutMs ?? 3_000, (deadline) => systemOne(
          cfg.clefBaseUrl as string,
          cfg.clefModel,
          { content: rules.text, kind: input.kind, ...(input.url === undefined ? {} : { url: input.url }) },
          { moderation: MODERATION_QUESTION },
          deadline,
          fetchImpl,
        ));
        return { verdict: decideModeration(answers.moderation.probabilities) };
      } catch (error) {
        if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError');
        return { verdict: 'pending' };
      }
    },
  };
}
