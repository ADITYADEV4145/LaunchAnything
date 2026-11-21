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

function markdownLink(text: string, startIndex: number) {
    const opening = /!?\[[^\]\r\n]*\]\([ \t]*/y;
    opening.lastIndex = startIndex;
    const match = opening.exec(text);
    if (!match) return;
    let cursor = startIndex + match[0].length;
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
    if (cursor >= text.length || depth !== 0) return;
    const target = text.slice(start, cursor);
    if (!/^https?:\/\//i.test(target)) return;
    if (angle) cursor++;
    const closing = text.slice(cursor).match(/^[ \t]*(?:\r?\n[ \t]*)?(?:(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^()\r\n]*\))[ \t]*(?:\r?\n[ \t]*)?)?\)/);
    if (!closing) return;
    return { target, end: cursor + closing[0].length };
}

export function extractLinks(text: string) {
  const links: string[] = [];
  const scheme = /https?:\/\//iy;
  for (let index = 0; index < text.length;) {
    if (text[index] === '<') {
      const end = text.indexOf('>', index + 1);
      const target = end < 0 ? '' : text.slice(index + 1, end);
      if (/^https?:\/\/[^\s<>]+$/i.test(target)) {
        links.push(target);
        index = end + 1;
        continue;
      }
    }
    const markdown = (text[index] === '[' || text[index] === '!') ? markdownLink(text, index) : undefined;
    if (markdown) {
      links.push(markdown.target);
      index = markdown.end;
      continue;
    }
    scheme.lastIndex = index;
    if (!scheme.test(text)) { index++; continue; }
    let cursor = index;
    let depth = 0;
    for (; cursor < text.length; cursor++) {
      const char = text[cursor];
      const next = text[cursor + 1];
      if (char === "'" && (!next || /\s/u.test(next) || (next.charCodeAt(0) > 127 && /\p{P}/u.test(next)))) break;
      if (/[\s<>"→]/u.test(char) || (char === ')' && depth === 0)) break;
      if (char === '(') depth++;
      else if (char === ')') depth--;
    }
    links.push(text.slice(index, cursor));
    index = cursor;
  }
  return links.map(normalizeLink);
}
