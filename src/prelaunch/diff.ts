export function addition(path: string, content: string) {
  const lines = content.trimEnd().split('\n');
  return ['diff --git a/' + path + ' b/' + path, 'new file mode 100644',
    '--- /dev/null', '+++ b/' + path, `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map(line => '+' + line), '',
  ].join('\n');
}

export function insertion(path: string, source: string, offset: number, lines: string[]) {
  if (!lines.length) return '';
  const original = source ? source.match(/[^\n]*\n|[^\n]+$/g) ?? [] : [];
  const start = Math.max(0, offset - 3), end = Math.min(original.length, offset + 3);
  const count = end - start;
  const before = original.slice(start, offset);
  const after = original.slice(offset, end);
  const eol = original.find(line => line.endsWith('\n'))?.endsWith('\r\n') ? '\r\n' : '\n';
  const context = (line: string) => ' ' + (line.endsWith('\n') ? line : line + '\n\\ No newline at end of file\n');
  const prefix = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  return prefix + `@@ -${count ? start + 1 : start},${count} +${start + 1},${count + lines.length} @@\n` +
    before.map(context).join('') + lines.map(line => '+' + line + eol).join('') + after.map(context).join('');
}
