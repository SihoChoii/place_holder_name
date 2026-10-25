import { spokenNumber } from '../numbers.js';

const INVITATION = ' Want to know more? Just ask.';
const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const NUMBER = /(?<![\w-])-?\d[\d,]*(?:\.\d+)?/g;

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectNames(text: string, names: readonly string[]): { text: string; restore(value: string): string } {
  const protectedValues: string[] = [];
  let protectedText = text;
  for (const name of [...names].sort((left, right) => right.length - left.length)) {
    if (!name) continue;
    const marker = `\uE000${String.fromCharCode(0xE100 + protectedValues.length)}\uE001`;
    const expression = new RegExp(escapePattern(name), 'g');
    if (!expression.test(protectedText)) continue;
    protectedText = protectedText.replace(expression, marker);
    protectedValues.push(name);
  }
  return {
    text: protectedText,
    restore(value: string) {
      return value.replace(/\uE000([\uE100-\uE1FF])\uE001/g, (_match, marker: string) => {
        const index = marker.charCodeAt(0) - 0xE100;
        return protectedValues[index] ?? '';
      });
    },
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/gi, '')
    .replace(/https?:\/\/[^\s<>()]+/gi, '')
    .replace(/[`*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addPause(text: string): string {
  const ends = [...text.matchAll(/[.!?](?=\s|$)/g)];
  if (ends.length < 2) return text;
  const first = ends[0];
  const index = first.index ?? 0;
  return `${text.slice(0, index + first[0].length)} [pause]${text.slice(index + first[0].length)}`;
}

function cutAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text.trimEnd();
  const prefix = text.slice(0, maxChars + 1);
  const boundary = prefix.lastIndexOf(' ');
  return (boundary > 0 ? prefix.slice(0, boundary) : text.slice(0, maxChars)).trimEnd();
}

export function toSpeechScript(text: string, protectedNames: readonly string[]): string {
  const protectedText = protectNames(text, protectedNames);
  const stripped = stripMarkdown(protectedText.text)
    .replace(DATE, (date) => date.split('-').map(spokenNumber).join('-'))
    .replace(NUMBER, (token) => spokenNumber(token));
  const restored = protectedText.restore(stripped);
  const paused = addPause(restored).replace(/\[pause\].*\[pause\]/g, '[pause]');
  const base = cutAtWord(paused, 600 - INVITATION.length);
  return `${base}${INVITATION}`.slice(0, 600).trimStart();
}
