import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

import type { RequestCtx } from '../types.js';
import { abortError, estimatedTokens, isPlainObject } from '../util.js';

const DEFAULT_MAX_TOKENS = 220;
const MAX_SKILL_TOKENS = 350;
const REFUSAL_TEXT = 'I can’t help with that, but I can help you explore the sky.';
const WEB_WRITE_TEXT = 'Claiming, posting, tagging, and commenting happen in the iOS app, where you can review and confirm your change.';

export interface Skill {
  name: string;
  when: string;
  tools: string[];
  priority: number;
  maxTokens: number;
  body: string;
}

export type Route =
  | { kind: 'skill'; skill: Skill }
  | { kind: 'refusal'; skill: Skill; text: string }
  | { kind: 'web_write'; skill: Skill; text: string };

type SkillMetadata = {
  name: string;
  when: string;
  tools: string[];
  priority: number;
  max_tokens?: number;
};

function fail(file: string, reason: string): never {
  throw new Error(`Invalid skill ${file}: ${reason}`);
}

function parseSkill(file: string, knownTools: ReadonlySet<string>): Skill {
  const source = readFileSync(file, 'utf8');
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/.exec(source);
  if (match === null) fail(file, 'expected YAML frontmatter');

  const document = parseDocument(match[1]);
  if (document.errors.length > 0) fail(file, document.errors[0]?.message ?? 'invalid YAML');
  const rawMetadata: unknown = document.toJS();
  if (!isPlainObject(rawMetadata)) fail(file, 'metadata must be an object');

  const allowedKeys: Record<string, true> = {
    name: true,
    when: true,
    tools: true,
    priority: true,
    max_tokens: true,
  };
  for (const key of Object.keys(rawMetadata)) {
    if (allowedKeys[key] !== true) fail(file, `unknown metadata field ${key}`);
  }

  const metadata = rawMetadata as Partial<SkillMetadata>;
  if (typeof metadata.name !== 'string' || metadata.name.trim() === '') fail(file, 'name must be a non-empty string');
  if (typeof metadata.when !== 'string' || metadata.when.trim() === '') fail(file, 'when must be a non-empty string');
  if (!Array.isArray(metadata.tools) || metadata.tools.some((tool) => typeof tool !== 'string' || tool.trim() === '')) {
    fail(file, 'tools must be an array of non-empty strings');
  }
  if (new Set(metadata.tools).size !== metadata.tools.length) fail(file, 'tools must not contain duplicates');
  for (const tool of metadata.tools) {
    if (!knownTools.has(tool)) fail(file, `unknown tool ${tool}`);
  }
  if (typeof metadata.priority !== 'number' || !Number.isFinite(metadata.priority)) {
    fail(file, 'priority must be a finite number');
  }
  if (metadata.max_tokens !== undefined && (
    typeof metadata.max_tokens !== 'number'
    || !Number.isInteger(metadata.max_tokens)
    || metadata.max_tokens <= 0
  )) {
    fail(file, 'max_tokens must be a positive integer');
  }

  const body = match[2].trim();
  if (body === '') fail(file, 'body must not be empty');
  if (estimatedTokens(body) > MAX_SKILL_TOKENS) fail(file, `body exceeds ${MAX_SKILL_TOKENS} tokens`);

  return {
    name: metadata.name.trim(),
    when: metadata.when.trim(),
    tools: [...metadata.tools],
    priority: metadata.priority,
    maxTokens: metadata.max_tokens ?? DEFAULT_MAX_TOKENS,
    body,
  };
}

/** Loads and validates every markdown skill at process startup. */
export function loadSkills(dir: URL, knownTools: ReadonlySet<string>): Map<string, Skill> {
  if (dir.protocol !== 'file:') throw new Error('Skill directory must be a file URL');

  const skills = new Map<string, Skill>();
  const directory = fileURLToPath(dir);
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const skill = parseSkill(`${directory}/${entry.name}`, knownTools);
    if (skills.has(skill.name)) throw new Error(`Duplicate skill name ${skill.name}`);
    skills.set(skill.name, skill);
  }
  return skills;
}

function requiredSkill(skills: Map<string, Skill>, name: string): Skill {
  const skill = skills.get(name);
  if (skill === undefined) throw new Error(`Required skill ${name} is missing`);
  return skill;
}

/** Fast, intentionally narrow safety precheck for requests that need no model call. */
export function precheck(message: string): boolean {
  const normalized = message.normalize('NFKC').trim();
  if (normalized === '') return false;

  const promptOverride = /\b(ignore|disregard|override|bypass)\b[\s\S]{0,80}\b(previous|prior|system|instructions?|rules?|guardrails?)\b/i;
  const ownPending = /\b(my|mine|own)\b[\s\S]{0,60}\b(pending|hidden)\b|\b(pending|hidden)\b[\s\S]{0,60}\b(my|mine|own)\b/i;
  const privateContent = /\b(show|reveal|list|give)\b[\s\S]{0,60}\b(all|other|someone(?:\s+else)?'?s?)\b[\s\S]{0,60}\b(pending|hidden|private)\b/i;
  const anotherUsersContent = /\b(other|another|everyone|someone\s+else)\b/i;
  const clearHarm = /\b(?:i(?:'m| am)|i want to|help me|how (?:can|do) i|ways? to)\b[\s\S]{0,40}\b(kill|hurt|harm|attack|assault|doxx|blackmail)\b|\b(kill|hurt|harm|attack|assault|doxx|blackmail)\b[\s\S]{0,30}\b(your|my|his|her|their)\s+(family|friend|partner|child|children)\b/i;
  const coworkerJoke = /\b(joke|mock|insult|roast)\b[\s\S]{0,50}\b(coworker|colleague|boss|classmate)\b/i;
  return promptOverride.test(normalized)
    || (privateContent.test(normalized) && (!ownPending.test(normalized) || anotherUsersContent.test(normalized)))
    || clearHarm.test(normalized)
    || coworkerJoke.test(normalized);
}


function candidatesFor(ctx: RequestCtx, skills: Map<string, Skill>, exoplanets: boolean): Array<{ name: string; when: string }> {
  const excluded = new Set(['demo_mode_narrator', 'star_fact_card', 'voice_script_writer', 'safety_refusal']);
  if (!exoplanets) excluded.add('exoplanet_panel');
  if (ctx.client === 'web') {
    excluded.add('tag_note_assist');
    excluded.add('claim_helper');
    excluded.add('comment_moderation_explainer');
  }

  return [...skills.values()]
    .filter((skill) => !excluded.has(skill.name))
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
    .map((skill) => ({ name: skill.name, when: skill.when }));
}

/** Selects one authored skill with deterministic safety and mode precedence. */
export async function selectRoute(
  message: string,
  ctx: RequestCtx,
  skills: Map<string, Skill>,
  opts: {
    exoplanets: boolean;
    classify?: (message: string, candidates: Array<{ name: string; when: string }>) => Promise<string | null>;
  },
): Promise<Route> {
  if (precheck(message)) {
    return { kind: 'refusal', skill: requiredSkill(skills, 'safety_refusal'), text: REFUSAL_TEXT };
  }
  if (ctx.demo) return { kind: 'skill', skill: requiredSkill(skills, 'demo_mode_narrator') };
  if (message.trim() === '' && ctx.selected !== undefined) {
    return { kind: 'skill', skill: requiredSkill(skills, 'star_fact_card') };
  }
  const mentionsDraft = /\b(note|caption|tag|comment|reply)\b/i.test(message);
  const asksToWrite = /\b(write|draft|compose|create|add|leave|post|publish)\b/i.test(message);
  const directDraft = /^\s*(tag|comment|reply)\b|\btag this\b/i.test(message);
  const draftRequest = mentionsDraft && (asksToWrite || directDraft);
  if (ctx.client === 'web') {
    const skill = requiredSkill(skills, 'explore_guide');
    const webClaimRequest = /^(?:please\s+)?claim\b(?=[\s\S]{0,40}\b(?:for me|this|that|it|my|a star)\b)|^(?:can|could)\s+i\s+claim\b/i.test(message);
    const webDraftRequest = /^(?:please\s+)?(?:post|publish|tag)\s+(?:this|that|my|a|the)\b|^(?:please\s+)?(?:write|draft|compose|create|add|leave|submit)\s+(?:my|a|the)\s+(?:note|caption|comment|tag)\b|^(?:can|could)\s+i\s+(?:post|publish|tag|write|draft|compose|create|add|leave|submit|comment)\b|^(?:please\s+)?comment\s+on\s+(?:this|that)\s+post\b|^(?:can|could)\s+you\s+comment\s+on\s+(?:this|that)\s+post\b/i.test(message);
    return webClaimRequest || webDraftRequest
      ? { kind: 'web_write', skill, text: WEB_WRITE_TEXT }
      : { kind: 'skill', skill };
  }
  if (/\b(pending|not showing|hidden|moderat(?:e|ion|ed)?)\b/i.test(message)) {
    return { kind: 'skill', skill: requiredSkill(skills, 'comment_moderation_explainer') };
  }
  if (draftRequest) {
    return { kind: 'skill', skill: requiredSkill(skills, 'tag_note_assist') };
  }
  if (/\b(claim|cooldown|owner|ownership|mine)\b/i.test(message)) {
    return { kind: 'skill', skill: requiredSkill(skills, 'claim_helper') };
  }
  if (/\b(travel|how long|get there|light[- ]?years?|years lost)\b|\b(?:0\.\d+|\d+(?:\.\d+)?)\s*c\b/i.test(message)) {
    return { kind: 'skill', skill: requiredSkill(skills, 'travel_time_explainer') };
  }
  if (/\b(constellation|nearby|near|around|next to)\b/i.test(message)) {
    return { kind: 'skill', skill: requiredSkill(skills, 'constellation_guide') };
  }
  if (opts.exoplanets && /\b(planets?|exoplanets?)\b/i.test(message)) {
    return { kind: 'skill', skill: requiredSkill(skills, 'exoplanet_panel') };
  }

  const candidates = candidatesFor(ctx, skills, opts.exoplanets);
  if (opts.classify !== undefined && candidates.length >= 2) {
    try {
      const choice = await opts.classify(message, candidates);
      if (choice !== null && candidates.some((candidate) => candidate.name === choice)) {
        return { kind: 'skill', skill: requiredSkill(skills, choice) };
      }
    } catch {
      if (ctx.signal.aborted) throw abortError(ctx.signal);
      // A routing classifier is optional; deterministic routing remains available.
    }
  }

  return {
    kind: 'skill',
    skill: requiredSkill(skills, ctx.mode === 'explore' ? 'explore_guide' : 'star_qa'),
  };
}
