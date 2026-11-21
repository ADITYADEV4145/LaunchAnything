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
    while (/\s/u.test(text[cursor] ?? '') && cursor < text.length) cursor++;
    const delimiter = text[cursor];
    if (delimiter === '"' || delimiter === "'" || delimiter === '(') {
      const closing = delimiter === '(' ? ')' : delimiter;
      cursor++;
      for (; cursor < text.length; cursor++) {
        if (text[cursor] === '\\') { cursor++; continue; }
        if (text[cursor] === closing) break;
        if (delimiter === '(' && text[cursor] === '(') return;
        if (/^\r?\n[ \t]*\r?\n/.test(text.slice(cursor))) return;
      }
      if (cursor >= text.length) return;
      cursor++;
      while (/\s/u.test(text[cursor] ?? '') && cursor < text.length) cursor++;
    }
    if (text[cursor] !== ')') return;
    return { target, end: cursor + 1 };
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
  return links.map(normalizeLink).filter(link => {
    if (!/^https?:\/\/[^/?#]+/i.test(link)) return false;
    try { return Boolean(new URL(link).hostname); }
    catch { return false; }
  });
}
