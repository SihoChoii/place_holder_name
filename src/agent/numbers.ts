const DIGIT_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const SMALL_NAMES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS_NAMES = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const WORD_VALUES: Record<string, number> = Object.fromEntries(SMALL_NAMES.map((word, value) => [word, value]));
for (let value = 2; value < TENS_NAMES.length; value++) WORD_VALUES[TENS_NAMES[value]] = value * 10;

const NUMBER_TOKEN = /(?<![\w-])-?\d[\d,]*(?:\.\d+)?/g;
const QUANTITY = '(?:years?|light|ly|parsecs?|stars?|minutes?|seconds?|hours?|days?|percent|times|degrees?|planets?|comments?|posts?|miles?|kilometers?)';
const WRITTEN_QUANTITY = new RegExp(`\\b((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and|[-\\s])+?)\\s+${QUANTITY}\\b`, 'gi');
const DATE_TOKEN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function numberVariants(value: number): string[] {
  const variants = new Set<string>();
  variants.add(String(value));
  variants.add(String(Math.round(value)));
  for (let decimals = 0; decimals <= 2; decimals++) {
    const fixed = value.toFixed(decimals);
    variants.add(fixed);
    variants.add(fixed.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1'));
  }
  return [...variants];
}

function normalizedNumber(token: string): string {
  return token.replaceAll(',', '');
}
function numericTokens(text: string): string[] {
  const tokens = [...text.matchAll(NUMBER_TOKEN)].map((match) => match[0]);
  for (const date of text.matchAll(DATE_TOKEN)) {
    tokens.push(date[1], date[2], date[3]);
  }
  return tokens;
}


function parseWrittenNumber(phrase: string): number | null {
  let total = 0;
  let current = 0;
  const words = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return null;
  for (const word of words) {
    if (word === 'and') continue;
    if (word === 'hundred') {
      if (current === 0) return null;
      current *= 100;
      continue;
    }
    if (word === 'thousand' || word === 'million') {
      if (current === 0) return null;
      total += current * (word === 'thousand' ? 1_000 : 1_000_000);
      current = 0;
      continue;
    }
    const value = WORD_VALUES[word];
    if (value === undefined) return null;
    current += value;
  }
  return total + current;
}


export class NumberLedger {
  private readonly lexemes = new Set<string>();
  private readonly values = new Set<number>();
  private readonly names = new Set<string>();
  addValue(value: unknown): void {
    const visited = new WeakSet<object>();
    const visit = (item: unknown): void => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        this.values.add(item);
        for (const variant of numberVariants(item)) {
          this.lexemes.add(normalizedNumber(variant));
          this.values.add(Number(variant));
        }
        return;
      }
      if (typeof item === 'string') {
        this.addText(item);
        return;
      }
      if (!item || typeof item !== 'object' || visited.has(item)) return;
      visited.add(item);
      if (Array.isArray(item)) {
        for (const child of item) visit(child);
      } else {
        for (const child of Object.values(item)) visit(child);
      }
    };
    visit(value);
  }

  addText(text: string): void {
    for (const token of numericTokens(text)) {
      this.lexemes.add(normalizedNumber(token));
      const numeric = Number(normalizedNumber(token));
      if (Number.isFinite(numeric)) this.values.add(numeric);
    }
  }

  addName(name: string): void {
    if (name) this.names.add(name);
  }

  check(text: string): { ok: true } | { ok: false; offending: string[] } {
    let inspect = text;
    for (const name of this.names) {
      inspect = inspect.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    }
    const offending = new Set<string>();
    for (const token of numericTokens(inspect)) {
      if (!this.lexemes.has(normalizedNumber(token))) offending.add(token);
    }
    for (const match of inspect.matchAll(WRITTEN_QUANTITY)) {
      const phrase = match[1];
      const words = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
      if (!words.some((word) => word !== 'and')) continue;
      const value = parseWrittenNumber(phrase);
      if (value === null || !this.values.has(value)) offending.add(phrase.trim());
    }
    return offending.size === 0 ? { ok: true } : { ok: false, offending: [...offending] };
  }
}

function spokenBelowThousand(value: number): string {
  if (value < 20) return SMALL_NAMES[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    return rest === 0 ? TENS_NAMES[tens] : `${TENS_NAMES[tens]}-${SMALL_NAMES[rest]}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return rest === 0 ? `${SMALL_NAMES[hundreds]} hundred` : `${SMALL_NAMES[hundreds]} hundred ${spokenBelowThousand(rest)}`;
}

function spokenInteger(value: number): string {
  if (value < 1_000) return spokenBelowThousand(value);
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1_000);
    const rest = value % 1_000;
    return rest === 0 ? `${spokenBelowThousand(thousands)} thousand` : `${spokenBelowThousand(thousands)} thousand ${spokenBelowThousand(rest)}`;
  }
  if (value < 1_000_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const rest = value % 1_000_000;
    return rest === 0 ? `${spokenBelowThousand(millions)} million` : `${spokenBelowThousand(millions)} million ${spokenInteger(rest)}`;
  }
  return String(value).split('').map((digit) => DIGIT_NAMES[Number(digit)]).join(' ');
}

export function spokenNumber(token: string): string {
  const normalized = token.replaceAll(',', '').trim();
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholeRaw, decimal] = unsigned.split('.');
  if (!/^\d+$/.test(wholeRaw) || (decimal !== undefined && !/^\d+$/.test(decimal))) return token;
  const whole = Number(wholeRaw);
  if (!Number.isSafeInteger(whole)) return token;
  const spoken = spokenInteger(whole);
  const decimalSpoken = decimal === undefined ? '' : ` point ${[...decimal].map((digit) => DIGIT_NAMES[Number(digit)]).join(' ')}`;
  return `${negative ? 'minus ' : ''}${spoken}${decimalSpoken}`;
}

export function retryAfterText(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
