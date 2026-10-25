function stripTemplateMarkers(value: string): string {
  return value
    .replace(/<\|[^>]*>|<[^<>|]*\|>/g, '')
    .replace(/<\/?untrusted/gi, '');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncateAtWord(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const prefix = value.slice(0, maxChars + 1);
  const boundary = prefix.lastIndexOf(' ');
  return boundary > 0 ? prefix.slice(0, boundary).trimEnd() : value.slice(0, maxChars);
}

export function untrusted(source: string, id: string | number, text: string, maxChars = 400): string {
  const sanitized = truncateAtWord(stripTemplateMarkers(text), Math.max(0, maxChars));
  return `<untrusted source="${escapeXml(stripTemplateMarkers(source))}" id="${escapeXml(String(id))}">${escapeXml(sanitized)}</untrusted>`;
}
