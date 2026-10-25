import { readFileSync } from 'node:fs';

import type { ChatMessage, OpenAiTool } from '../model/gemma.js';
import type { Turn } from '../memory/sessions.js';
import type { Skill } from '../skills/router.js';
import type { RequestCtx } from '../types.js';
import { untrusted } from '../untrusted.js';
import { estimatedTokens } from '../util.js';

const SYSTEM_TEMPLATE = readFileSync(new URL('./system.md', import.meta.url), 'utf8');

export const BUDGET = {
  system: 350,
  skill: 350,
  memory: 250,
  sky: 200,
  history: 600,
  toolRound: 600,
  total: 3000,
} as const;

export interface AssembleInput {
  ctx: RequestCtx;
  skill: Skill;
  message: string;
  selectedName?: string;
  turns: Turn[];
  summary: string | null;
  recentNames: string[];
  claimedNames: string[];
  skyNames: string[];
  tools: OpenAiTool[];
}

function textWithinBudget(text: string, budget: number): string {
  if (estimatedTokens(text) <= budget) return text;

  let end = Math.min(text.length, Math.floor((text.length * budget) / estimatedTokens(text)));
  while (end > 0) {
    const boundary = text.lastIndexOf(' ', end);
    const candidate = text.slice(0, boundary > 0 ? boundary : end).trimEnd();
    if (estimatedTokens(candidate) <= budget) return candidate;
    end = boundary > 0 ? boundary - 1 : end - 1;
  }
  return '';
}

function memorySection(input: AssembleInput): string {
  const lines: string[] = [];
  if (input.summary !== null && input.summary.trim() !== '') lines.push(`Summary: ${input.summary}`);
  if (input.recentNames.length > 0) lines.push(`Recent stars: ${input.recentNames.join(', ')}`);
  if (input.claimedNames.length > 0) lines.push(`Claimed stars: ${input.claimedNames.join(', ')}`);
  if (lines.length === 0) return '';

  let raw = lines.join('\n');
  let wrapped = untrusted('memory', 'session', raw, raw.length);
  while (estimatedTokens(wrapped) > BUDGET.memory && raw.length > 0) {
    raw = textWithinBudget(raw, Math.max(0, estimatedTokens(raw) - 1));
    wrapped = untrusted('memory', 'session', raw, raw.length);
  }
  return `## Memory\n${wrapped}`;
}

function skyContext(input: AssembleInput): string {
  const lines: string[] = [];
  if (input.ctx.selected !== undefined) {
    lines.push(`Selected star: ${input.selectedName ?? 'selected star'} (hyg_id ${input.ctx.selected})`);
  }
  const ids = [...input.ctx.inView]
    .sort((left, right) => left - right)
    .slice(0, 20);
  if (ids.length > 0) lines.push(`In-view star IDs: ${ids.join(', ')}`);
  const names = input.skyNames.slice(0, 20);
  if (names.length > 0) lines.push(`Stars in view, brightest first: ${names.join(', ')}`);
  if (
    input.ctx.tsMs !== undefined
    && Number.isSafeInteger(input.ctx.tsMs)
    && Math.abs(input.ctx.tsMs) <= 8_640_000_000_000_000
  ) {
    lines.push(`Observation time (UTC): ${new Date(input.ctx.tsMs).toISOString()}`);
  }
  if (lines.length === 0) return '';

  const content = textWithinBudget(lines.join('\n'), BUDGET.sky);
  return content === '' ? '' : `## Sky context\n${content}`;
}

function systemMessage(input: AssembleInput): ChatMessage {
  const skill = `## Skill\n${input.skill.body}`;
  const memory = memorySection(input);
  const sky = skyContext(input);
  const content = SYSTEM_TEMPLATE
    .replaceAll('{{mode}}', input.ctx.mode)
    .replaceAll('{{client}}', input.ctx.client)
    .replaceAll('{{skill}}', skill)
    .replaceAll('{{memory}}', memory)
    .replaceAll('{{sky_context}}', sky)
    .trim();
  return { role: 'system', content };
}

function historyGroups(turns: Turn[]): ChatMessage[][] {
  return turns.map((turn) => [
    { role: 'user', content: turn.user },
    { role: 'assistant', content: turn.assistant },
  ]);
}

function historyWithinBudget(groups: ChatMessage[][]): ChatMessage[][] {
  const retained = [...groups];
  while (retained.length > 0 && estimatedTokens(JSON.stringify(retained)) > BUDGET.history) retained.shift();
  return retained;
}

/** Estimates the serialized model input, including the allowed tool schemas. */
export function estimateMessages(messages: ChatMessage[], tools: OpenAiTool[]): number {
  return estimatedTokens(JSON.stringify({ messages, tools }));
}

/** Builds a bounded model prompt or returns null when essential context cannot fit. */
export function assemble(input: AssembleInput): ChatMessage[] | null {
  if (estimatedTokens(input.skill.body) > BUDGET.skill) return null;

  const system = systemMessage(input);
  const current: ChatMessage = input.message.trim() === '' && input.ctx.selected !== undefined
    ? {
      role: 'user',
      content: `The user tapped ${input.selectedName ?? 'the selected star'} (hyg_id ${input.ctx.selected}) with no question.`,
    }
    : { role: 'user', content: input.message };
  const retained = historyWithinBudget(historyGroups(input.turns));

  while (retained.length > 0 && estimateMessages([system, ...retained.flat(), current], input.tools) > BUDGET.total) {
    retained.shift();
  }
  const messages = [system, ...retained.flat(), current];
  return estimateMessages(messages, input.tools) <= BUDGET.total ? messages : null;
}
