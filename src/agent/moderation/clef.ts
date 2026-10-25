import { isPlainObject, withDeadline } from '../util.js';
import type { Verdict } from './rules.js';

export class ClefProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClefProtocolError';
  }
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
}

export const MODERATION_QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions: 'Classify this submission for moderation.',
  criteria: {
    allow: 'Legitimate sky-related content permitted for public display.',
    spam: 'Unsolicited, repetitive or deceptive promotional content.',
    block: 'Abusive, hateful, dangerous, sexual exploitation or privacy-violating content.',
  },
};

function parseChoiceAnswer(value: unknown, question: ChoiceQuestion): ChoiceAnswer {
  if (!isPlainObject(value) || value.type !== 'choice' || typeof value.choice !== 'string' || !isPlainObject(value.probabilities)) {
    throw new ClefProtocolError('invalid choice answer');
  }
  if (!(value.choice in question.criteria)) throw new ClefProtocolError('choice is not a criterion');
  const probabilities: Record<string, number> = {};
  for (const criterion of Object.keys(question.criteria)) {
    const probability = value.probabilities[criterion];
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new ClefProtocolError(`invalid probability for ${criterion}`);
    }
    probabilities[criterion] = probability;
  }
  return { choice: value.choice, probabilities };
}

export async function systemOne(
  base: string,
  model: string,
  state: unknown,
  questions: Record<string, ChoiceQuestion>,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Record<string, ChoiceAnswer>> {
  const response = await fetchImpl(`${base}/v1/systemone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
    signal,
  });
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Nothing remains to cancel when the transport has closed.
    }
    throw new ClefProtocolError(`clef responded with HTTP ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ClefProtocolError('clef returned invalid JSON');
  }
  if (!isPlainObject(payload) || !isPlainObject(payload.answers)) throw new ClefProtocolError('clef response has no answers');

  const answers: Record<string, ChoiceAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    answers[name] = parseChoiceAnswer(payload.answers[name], question);
  }
  return answers;
}

export function decideModeration(probabilities: Record<string, number>): Verdict {
  const allow = probabilities.allow;
  const spam = probabilities.spam;
  const block = probabilities.block;
  if (![allow, spam, block].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) {
    return 'pending';
  }
  if (block >= 0.7) return 'rejected';
  if (allow >= 0.8 && spam < 0.5) return 'approved';
  return 'pending';
}

export async function chooseSkill(
  base: string | null,
  model: string,
  message: string,
  candidates: Array<{ name: string; when: string }>,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  timeoutMs = 300,
): Promise<string | null> {
  if (!base || candidates.length < 2) return null;
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) criteria[candidate.name] = candidate.when;
  try {
    const answers = await withDeadline(signal, timeoutMs, (deadline) => systemOne(base, model, { content: message }, {
      skill: {
        type: 'choice',
        instructions: 'Choose the sky-guide task requested by the user.',
        criteria,
      },
    }, deadline, fetchImpl));
    const choice = answers.skill.choice;
    return candidates.some((candidate) => candidate.name === choice) ? choice : null;
  } catch {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError');
    return null;
  }
}
