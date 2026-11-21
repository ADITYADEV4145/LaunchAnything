import type { Page } from 'playwright';
import { PNG } from 'pngjs';
import { createRequire } from 'node:module';
import { assertPrivate } from './privacy.js';
import { exec } from './runtime.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { GIFEncoder, quantize, applyPalette } = createRequire(import.meta.url)('gifenc') as typeof import('gifenc');
export async function guard(page: Page, selectors: string[]) {
  return page.evaluate((selectors) => {
    const redacted = selectors.flatMap(s => Array.from(document.querySelectorAll(s)));
    for (const el of redacted) (el as HTMLElement).style.filter = 'blur(18px)';
    const visible = Array.from(document.querySelectorAll('*')).filter(el => !redacted.some(r => r.contains(el)) && (el as HTMLElement).getClientRects().length);
    const text = visible.map(el => [Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '), ...['title', 'alt', 'placeholder'].map(a => el.getAttribute(a)), 'value' in el ? String(el.value) : ''].join(' ')).join('\n');
    return { text, redactedCount: new Set(redacted).size };
  }, selectors).then(result => { assertPrivate(result.text); return result.redactedCount; });
}
export async function ocrCheck(png: Buffer): Promise<boolean> {
  try { await exec('tesseract', ['--version']); } catch { return false; }
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-ocr-'));
  try { const file = join(dir, 'capture.png'); await writeFile(file, png); const { stdout } = await exec('tesseract', [file, 'stdout'], { timeout: 30000 }); assertPrivate(stdout); return true; }
  finally { await rm(dir, { recursive: true, force: true }); }
}
export function gif(frames: Buffer[]): Uint8Array {
  const encoder = GIFEncoder();
  for (const frame of frames) { const png = PNG.sync.read(frame); const palette = quantize(png.data, 256); encoder.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay: 450 }); }
  encoder.finish(); return encoder.bytes();
}
