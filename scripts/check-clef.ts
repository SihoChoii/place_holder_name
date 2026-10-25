import { ConfigError } from '../src/agent/config.js';
import {
  MODERATION_QUESTION,
  decideModeration,
  systemOne,
  type ChoiceQuestion,
} from '../src/agent/moderation/clef.js';

const ROUTING_QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions: 'Choose the sky-guide task requested by the user.',
  criteria: {
    star_qa: 'Answer a factual question about a selected star.',
    travel_time_explainer: 'Explain a relativistic trip to a selected star.',
    constellation_guide: 'Find bright stars near a selected star.',
  },
};

function clefConfig(): { baseUrl: string; model: string } {
  const rawBaseUrl = process.env.CLEF_BASE_URL?.trim();
  if (!rawBaseUrl) throw new ConfigError('CLEF_BASE_URL is required and must be a Clef origin');
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new ConfigError('CLEF_BASE_URL must be an absolute http(s) origin');
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new ConfigError('CLEF_BASE_URL must be an http(s) origin without a path, credentials, query, or fragment');
  }
  return { baseUrl: parsed.origin, model: process.env.CLEF_MODEL?.trim() || 'clef-flash' };
}

async function askModeration(baseUrl: string, model: string, content: string): Promise<'approved' | 'pending' | 'rejected'> {
  const answers = await systemOne(
    baseUrl,
    model,
    { content, kind: 'comment' },
    { moderation: MODERATION_QUESTION },
    AbortSignal.timeout(3_000),
    fetch,
  );
  return decideModeration(answers.moderation.probabilities);
}

async function main(): Promise<void> {
  let config: { baseUrl: string; model: string };
  try {
    config = clefConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid Clef configuration';
    console.error(`ConfigError: ${message}`);
    process.exitCode = 1;
    return;
  }

  let beautiful: 'approved' | 'pending' | 'rejected';
  let threatening: 'approved' | 'pending' | 'rejected';
  let skill: string;
  try {
    beautiful = await askModeration(config.baseUrl, config.model, 'Vega looks beautiful tonight.');
    threatening = await askModeration(config.baseUrl, config.model, 'I will kill you and your family.');
    const answers = await systemOne(
      config.baseUrl,
      config.model,
      { content: 'Which nearby stars make a useful small constellation guide?' },
      { skill: ROUTING_QUESTION },
      AbortSignal.timeout(3_000),
      fetch,
    );
    skill = answers.skill.choice;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown transport failure';
    console.error(`Clef transport/protocol failure: ${message}`);
    process.exitCode = 2;
    return;
  }

  const mismatches: string[] = [];
  if (beautiful !== 'approved') mismatches.push(`benign moderation was ${beautiful}, expected approved`);
  if (threatening !== 'rejected') mismatches.push(`threat moderation was ${threatening}, expected rejected`);
  if (!(skill in ROUTING_QUESTION.criteria)) mismatches.push(`routing chose unsupported skill ${JSON.stringify(skill)}`);
  if (mismatches.length > 0) {
    console.error(`Clef classification mismatch: ${mismatches.join('; ')}`);
    process.exitCode = 3;
    return;
  }

  console.log('Clef moderation benign: approved');
  console.log('Clef moderation threat: rejected');
  console.log(`Clef routing: ${skill}`);
}

await main();
