import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { secretPatterns } from '../visuals/privacy.js';
import { exec } from '../visuals/runtime.js';

const rules: Record<string, RegExp[]> = {
  'fixture-path': [/(^|[\s/'"`(])\.?(?:liftoff-)?fixtures?\//im, /\.liftoff-fixture/],
  'tmp-path': [/\/tmp\/|\/var\/folders\/|\/private\/var\/|AppData\\Local\\Temp|\bliftoff-[A-Za-z0-9]{6}\b/],
  'shell-pipe': [/\|\s*(?:sed|grep|egrep|awk|cut|jq|head|tail|tr)\b/, /\b(?:sed|grep)\s+-[A-Za-z]/],
  'stack-trace': [/^\s+at\s+\S.*[:(]\d+(?::\d+)?\)?\s*$/m, /Traceback \(most recent call last\)/, /\bnode:internal\//],
  'api-key': Object.entries(secretPatterns).filter(([name]) => name !== 'email').map(([, pattern]) => pattern),
  email: [secretPatterns.email],
  'test-word': [/\btest(?:s|ing)?\b/i],
  foo: [/\bfoo(?:bar)?\b|\bbar\s+baz\b/i],
};
export function scanBanned(text: string): string[] {
  return Object.entries(rules).filter(([, patterns]) => patterns.some(pattern => new RegExp(pattern).test(text))).map(([name]) => name);
}
export function assertClean(text: string, where: string): void {
  const matches = scanBanned(text);
  if (matches.length) throw new Error(`Banned content in ${where}: ${matches.join(', ')}`);
}
export interface OcrWord { text: string; conf: number; x: number; y: number; width: number; height: number }
export async function ocrWords(png: Buffer): Promise<{ text: string; words: OcrWord[] }> {
  try { await exec('tesseract', ['--version']); }
  catch { throw new Error('OCR unavailable: install tesseract (apt install tesseract-ocr / brew install tesseract)'); }
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-ocr-'));
  try {
    const image = PNG.sync.read(png); let luminance = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      const alpha = image.data[i + 3] / 255;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(image.data[i + c] * alpha + 255 * (1 - alpha));
      image.data[i + 3] = 255;
      luminance += image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722;
    }
    if (luminance / (image.width * image.height) < 128) {
      for (let i = 0; i < image.data.length; i += 4) for (let c = 0; c < 3; c++) image.data[i + c] = 255 - image.data[i + c];
    }
    const file = join(dir, 'capture.png'); await writeFile(file, PNG.sync.write(image));
    const { stdout } = await exec('tesseract', [file, 'stdout', 'tsv'], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    const words: OcrWord[] = []; const lines = new Map<string, string[]>();
    for (const row of stdout.trimEnd().split(/\r?\n/).slice(1)) {
      const cells = row.split('\t'); const text = cells.slice(11).join('\t').trim();
      if (cells[0] !== '5' || !text) continue;
      const [x, y, width, height, conf] = cells.slice(6, 11).map(Number);
      words.push({ text, conf, x, y, width, height });
      const key = cells.slice(1, 5).join(':');
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key)!.push(text);
    }
    return { text: [...lines.values()].map(line => line.join(' ')).join('\n'), words };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
