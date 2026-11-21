function normalizeLink(url: string) {
  let normalized = url.replace(/\\([\\()[\]])/g, '$1');
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  while (normalized) {
    const end = normalized.at(-1)!;
    if (/[.,;:!?'"’”*_>]/u.test(end)) normalized = normalized.slice(0, -1);
    else if (pairs[end] && [...normalized].filter(c => c === end).length >
      [...normalized].filter(c => c === pairs[end]).length) normalized = normalized.slice(0, -1);
    else break;
  }
  return normalized;
}

export function extractLinks(text: string) {
  const links: string[] = [];
  const opening = /!?\[[^\]\r\n]*\]\([ \t]*/g;
  let bare = '', consumed = 0;
  for (const match of text.matchAll(opening)) {
    if (match.index < consumed) continue;
    let cursor = match.index + match[0].length;
    const angle = text[cursor] === '<';
    if (angle) cursor++;
    const start = cursor;
    let depth = 0;
    for (; cursor < text.length; cursor++) {
      const char = text[cursor];
      if (char === '\\') { cursor++; continue; }
      if (angle ? char === '>' : depth === 0 && (char === ')' || /\s/.test(char))) break;
      if (!angle && char === '(') depth++;
      else if (!angle && char === ')') depth--;
    }
    if (cursor >= text.length || depth !== 0) continue;
    const target = text.slice(start, cursor);
    if (!/^https?:\/\//i.test(target)) continue;
    if (angle) cursor++;
    const closing = text.slice(cursor).match(/^[ \t]*(?:(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^()\r\n]*\))[ \t]*)?\)/);
    if (!closing) continue;
    links.push(target);
    bare += text.slice(consumed, match.index) + ' ';
    consumed = cursor + closing[0].length;
  }
  bare += text.slice(consumed);
  links.push(...(bare.match(/https?:\/\/[^\s<>"']+/gi) ?? []));
  return links.map(normalizeLink);
}
