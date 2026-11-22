export function terminalLayout(transcript: string, options: { cols?: number; fontSize?: number; width?: number; height?: number } = {}) {
  const plain = transcript.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '').replace(/\t/g, '    ').trimEnd();
  const lines = plain.split('\n');
  const columns = options.cols ?? Math.min(110, Math.max(40, ...lines.map(line => line.length)));
  if (!Number.isInteger(columns) || columns < 1 || columns > 110) throw new Error('Terminal columns must be an integer between 1 and 110');
  const wrapped = lines.flatMap(line => {
    const result: string[] = [];
    while (line.length > columns) {
      const split = line.slice(0, columns + 1).lastIndexOf(' ');
      if (split <= 0) throw new Error(`Terminal token exceeds ${columns} columns; shorten the visible command or output identifier`);
      result.push(line.slice(0, split)); line = line.slice(split).trimStart();
    }
    return [...result, line];
  });
  if (wrapped.some(line => line.length > columns)) throw new Error('Terminal transcript exceeds its column count');
  const fontSize = options.fontSize ?? 32;
  const width = Math.max(options.width ?? 1600, Math.ceil(columns * fontSize * .65 + 80));
  const height = Math.max(options.height ?? 900, Math.ceil((wrapped.length + 2) * fontSize * 1.3 + 80));
  if (height > 8192) throw new Error('Terminal transcript is too tall; capture a smaller product interaction');
  return { text: wrapped.join('\n'), columns, width, height };
}
