import { isIP } from 'node:net';

export type Verdict = 'approved' | 'pending' | 'rejected';

export interface ModerationInput {
  kind: 'note' | 'comment' | 'link';
  text: string;
  url?: string;
}

export type RuleResult =
  | { verdict: 'rejected'; reason: string }
  | { verdict: 'continue'; text: string };

const KIND_LIMITS: Record<ModerationInput['kind'], number> = {
  note: 140,
  comment: 280,
  link: 280,
};
const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
const BLOCKED_CONTENT = [
  /\b(?:i(?:'m| am)? going to |i will )?(?:kill|murder|rape|doxx)\b/i,
  /\b(?:kill yourself|bomb threat|credit card number|social security number)\b/i,
  /\b(?:guaranteed (?:profit|returns?)|wire (?:money|funds)|crypto giveaway|double your money|seed phrase)\b/i,
];

function privateIpv4(host: string): boolean {
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function privateMappedIpv6(host: string): boolean {
  const match = /^::ffff:(.+)$/.exec(host);
  if (!match) return false;
  if (match[1].includes('.')) return privateIpv4(match[1]);
  const groups = match[1].split(':');
  if (groups.length !== 2 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return true;
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return privateIpv4(`${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`);
}

function localIp(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  const version = isIP(normalized);
  if (version === 4) return privateIpv4(normalized);
  if (version === 6) {
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:')
      || normalized.startsWith('fc') || normalized.startsWith('fd') || privateMappedIpv6(normalized);
  }
  return false;
}

function validPublicUrl(raw: string): boolean {
  if (raw.length === 0 || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password || !url.hostname) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')) return false;
  return !localIp(host);
}

export function applyRules(input: ModerationInput): RuleResult {
  const text = input.text.normalize('NFKC');
  if (text.length > 2048 || text.length > KIND_LIMITS[input.kind]) {
    return { verdict: 'rejected', reason: 'text_too_long' };
  }
  if (BLOCKED_CONTENT.some((rule) => rule.test(text))) return { verdict: 'rejected', reason: 'blocked_content' };

  const urls = [...text.matchAll(URL_PATTERN)].map((match) => match[0]);
  if (input.url !== undefined) urls.push(input.url.normalize('NFKC'));
  if (urls.length > 2) return { verdict: 'rejected', reason: 'too_many_links' };
  if (urls.some((url) => !validPublicUrl(url))) return { verdict: 'rejected', reason: 'invalid_link' };
  return { verdict: 'continue', text };
}
