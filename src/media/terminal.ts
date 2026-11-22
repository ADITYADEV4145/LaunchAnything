import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Browser } from 'playwright';
import { launchDir } from '../core/launch-dir.js';
import { escapeHtml } from '../visuals/runtime.js';
import { terminalLayout } from '../visuals/terminal-layout.js';
import { assertClean, ocrWords, type OcrWord } from './banned.js';
import { optionalJson, storyboard } from './assets.js';

export interface TerminalTranscript { text: string; highlight?: string }
export interface TerminalRegion { x: number; y: number; width: number; height: number }
export interface TerminalMetrics { box: TerminalRegion; capHeight: number; columns: number }

export async function terminalSource(cwd: string, source: string): Promise<TerminalTranscript | undefined> {
  const media = launchDir(cwd).media;
  const polished = await optionalJson(join(media, 'polished/manifest.json'));
  const original = Array.isArray(polished) ? polished.find(item => resolve(media, 'polished', item.file) === source)?.source ?? source : source;
  const captures = await optionalJson(join(media, 'shots/manifest.json'));
  const capture = Array.isArray(captures) ? captures.find(item => item.kind === 'terminal' && item.files.some((file: string) => resolve(media, 'shots', file) === original)) : undefined;
  if (!capture) return;
  const shot = (await storyboard(cwd))?.find(shot => shot.id === capture.id);
  const text = typeof capture.transcript === 'string' ? capture.transcript : await readFile(join(media, 'tapes', `${capture.id}.txt`), 'utf8');
  return { text, highlight: shot?.highlight && 'text' in shot.highlight ? shot.highlight.text : undefined };
}

export async function renderTerminal(app: Browser, transcript: TerminalTranscript, options: { width: number; height: number; minCapHeight: number; columns: number; title: string; accent: string }) {
  assertClean(transcript.text, 'terminal transcript');
  const page = await app.newPage({ viewport: { width: Math.floor(options.width), height: Math.floor(options.height) } });
  try {
    const horizontal = options.columns <= 48 ? .7 : 1;
    const glyph = await page.evaluate(minCapHeight => {
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = '100px monospace';
      let size = Math.ceil(minCapHeight * 100 / context.measureText('BLOCK').actualBoundingBoxAscent) + 1;
      context.font = `${size}px monospace`;
      while (context.measureText('BLOCK').actualBoundingBoxAscent < minCapHeight) context.font = `${++size}px monospace`;
      return { width: context.measureText('M').width, cap: context.measureText('BLOCK').actualBoundingBoxAscent, size };
    }, options.minCapHeight);
    const fontSize = glyph.size;
    const width = Math.floor(options.width);
    const padding = Math.max(16, Math.ceil(width * .028));
    const contentWidth = width - padding * 2 - 2;
    const columns = Math.min(options.columns, Math.floor(contentWidth / (glyph.width * horizontal)));
    if (columns < 8) throw new Error('Terminal target is too narrow for readable text');
    const layout = terminalLayout(transcript.text, { cols: columns });
    const lines = layout.text.split('\n');
    const bar = Math.max(36, Math.ceil(fontSize * 1.25));
    const height = Math.ceil(lines.length * fontSize * 1.12 + padding * 2 + bar + 2);
    if (height > options.height) throw new Error('Terminal transcript cannot fit at the minimum readable cap height; shorten the captured interaction');
    await page.setViewportSize({ width, height });
    const highlight = transcript.highlight;
    const rows = lines.map(line => {
      const at = highlight ? line.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
      return at < 0 ? escapeHtml(line) : `${escapeHtml(line.slice(0, at))}<mark>${escapeHtml(line.slice(at, at + highlight!.length))}</mark>${escapeHtml(line.slice(at + highlight!.length))}`;
    });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#1e1e2e;color:#e8f0ff;border:1px solid #394150;border-radius:12px;overflow:hidden}header{height:${bar}px;background:#202738;display:flex;align-items:center;gap:12px;padding:0 ${padding}px;font:700 ${Math.max(18, fontSize * .65)}px Arial}i{width:9px;height:9px;border-radius:50%;background:${options.accent}}main{padding:${padding}px}pre{margin:0;width:${100 / horizontal}%;transform:scaleX(${horizontal});transform-origin:top left;font:${fontSize}px/1.12 monospace;white-space:pre}mark{background:transparent;color:inherit;outline:3px solid ${options.accent};border-radius:5px;box-shadow:0 0 12px ${options.accent}66}</style><header><i style="background:#ff6058"></i><i style="background:#ffbd44"></i><i></i>${escapeHtml(options.title)}</header><main><pre>${rows.join('\n')}</pre></main>`);
    const png = await page.screenshot(); assertClean((await ocrWords(png)).text, 'reflowed terminal');
    return { png, width, height, terminal: { columns, capHeight: glyph.cap, box: { x: padding + 1, y: bar + padding + 1, width: contentWidth, height: height - bar - padding * 2 - 2 } }, highlight: highlight ? await page.locator('mark').first().boundingBox() ?? undefined : undefined };
  } finally { await page.close(); }
}

export function terminalCapHeight(words: OcrWord[], frameHeight: number, box?: TerminalRegion): number | undefined {
  const valid = words.filter(word => word.conf >= 0 && word.text.length > 1);
  const terminal = box ? valid.filter(word => word.x >= box.x - 2 && word.x + word.width <= box.x + box.width + 2 && word.y >= box.y - 2 && word.y + word.height <= box.y + box.height + 2) : valid.filter(word => /grounding|\.(?:ts|js|py)\b|\([^)]*\)/i.test(word.text));
  if (!terminal.length) return box ? 0 : undefined;
  const heights = terminal.map(word => word.height).sort((a, b) => a - b);
  return heights[Math.min(heights.length - 1, Math.floor(heights.length * .8))] / frameHeight;
}
