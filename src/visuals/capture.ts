import type { Page, Frame } from 'playwright';
import { PNG } from 'pngjs';
import { createRequire } from 'node:module';
import { assertPrivate } from './privacy.js';
import { exec } from './runtime.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { GIFEncoder, quantize, applyPalette } = createRequire(import.meta.url)('gifenc') as typeof import('gifenc');
export async function guard(page: Page, selectors: string[]) {
  let redactedCount = 0;
  const covered = new Set<Frame>();
  const depth = (frame: Frame): number => frame.parentFrame() ? 1 + depth(frame.parentFrame()!) : 0;
  for (const frame of page.frames().sort((a, b) => depth(a) - depth(b))) {
    if (frame.parentFrame() && covered.has(frame.parentFrame()!)) { covered.add(frame); continue; }
    let result: { text: string; textContent: string; redactedCount: number };
    try {
      if (frame.parentFrame()) {
        const element = await frame.frameElement();
        try {
          const isCovered = await element.evaluate((el, selectors) => {
            let current: Element | null = el;
            while (current) {
              if (selectors.some(s => current!.matches(s))) return true;
              current = current.parentElement ?? (current.getRootNode() as ShadowRoot).host ?? null;
            }
            return false;
          }, selectors);
          if (isCovered) { covered.add(frame); continue; }
        } finally { await element.dispose(); }
      }
      result = await frame.evaluate((selectors) => {
        const nodes: string[] = []; const attributes: string[] = []; let redactedCount = 0;
        const visit = (el: Element) => {
          if (selectors.some(s => el.matches(s))) {
            (el as HTMLElement).style.setProperty('filter', 'blur(18px)', 'important'); redactedCount++; return;
          }
          const style = getComputedStyle(el);
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || style.display === 'none') return;
          if (el.getClientRects().length && style.visibility === 'visible') {
            attributes.push(...['title', 'alt', 'placeholder'].map(a => el.getAttribute(a) ?? ''), 'value' in el ? String(el.value) : '');
            for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) nodes.push(node.textContent ?? '');
          }
          for (const child of el.children) visit(child);
          if (el.shadowRoot) for (const child of el.shadowRoot.children) visit(child);
        };
        visit(document.documentElement);
        return { text: [...nodes, ...attributes].join('\n'), textContent: nodes.join(''), redactedCount };
      }, selectors);
    } catch {
      throw new Error('Privacy guard: unable to inspect frame; redact its iframe element or a containing element before capture');
    }
    assertPrivate(result.text); assertPrivate(result.textContent); redactedCount += result.redactedCount;
  }
  return redactedCount;
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
