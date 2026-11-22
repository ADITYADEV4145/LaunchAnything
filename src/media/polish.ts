import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { assertClean, ocrWords } from './banned.js';
import { mediaBrand, homepageHost, storyboard } from './assets.js';
import type { TerminalRegion } from './terminal.js';

export interface PolishedShot {
  id: string; file: string; source: string; theme: string; kind: string; purpose?: string; caption?: string; moneyMoment: boolean;
  width: number; height: number; scale: number; banned: string[];
  highlight?: { x: number; y: number; width: number; height: number };
  terminalBox?: TerminalRegion;
}
export async function polish(cwd: string): Promise<PolishedShot[]> {
  const paths = launchDir(cwd); const shots = await storyboard(cwd);
  if (!shots) throw new Error('Media polish requires a storyboard in .launch/shots.yaml; run liftoff shots plan first');
  const captures = JSON.parse(await readFile(join(paths.media, 'shots/manifest.json'), 'utf8'));
  const product = JSON.parse(await readFile(paths.product, 'utf8')); const brand = await mediaBrand(cwd);
  const dir = join(paths.media, 'polished'); await mkdir(dir, { recursive: true }); await rm(join(dir, 'manifest.json'), { force: true });
  const template = await readFile(join(packageRoot(), 'templates/media/frame.html'), 'utf8');
  const app = await browser(); const report: PolishedShot[] = [];
  try {
    for (const shot of shots) {
      const capture = captures.find((item: { id: string }) => item.id === shot.id);
      if (!capture) throw new Error(`Missing capture for shot ${shot.id}; run liftoff shots`);
      const variants: Record<string, string> = capture.variants ?? { light: capture.files.find((file: string) => file.endsWith('.png')) };
      for (const [theme, file] of Object.entries(variants)) {
        if (basename(file) !== file || !/\.png$/.test(file)) throw new Error('Invalid captured PNG filename');
        const destination = join(dir, file); await rm(destination, { force: true });
        assertClean(`${product.name}\n${shot.caption ?? ''}`, `polished ${shot.id}`);
        const source = join(paths.media, 'shots', file); const png = await readFile(source); const image = PNG.sync.read(png);
        const ocr = await ocrWords(png); assertClean(ocr.text, `source ${shot.id}`);
        const mobile = capture.kind === 'mobile' || shot.viewport.width < 600;
        const originalBox = capture.highlights?.[theme] ?? capture.highlight;
        let crop = { x: 0, y: 0, width: image.width, height: image.height };
        if (capture.kind === 'terminal' && ocr.words.length) {
          const padding = 40 * (capture.scale ?? 1);
          const x = Math.max(0, Math.floor(Math.min(...ocr.words.map(word => word.x)) - padding));
          const y = Math.max(0, Math.floor(Math.min(...ocr.words.map(word => word.y)) - padding));
          crop = { x, y, width: Math.min(image.width, Math.ceil(Math.max(...ocr.words.map(word => word.x + word.width)) + padding)) - x, height: Math.min(image.height, Math.ceil(Math.max(...ocr.words.map(word => word.y + word.height)) + padding)) - y };
        }
        const cropped = new PNG({ width: crop.width, height: crop.height }); PNG.bitblt(image, cropped, crop.x, crop.y, crop.width, crop.height, 0, 0);
        const box = originalBox ? { ...originalBox, x: originalBox.x - crop.x, y: originalBox.y - crop.y } : undefined;
        const visibleHeight = crop.height;
        const frameWidth = Math.min(mobile ? 340 : 1272, 700 * crop.width / visibleHeight);
        const contentHeight = frameWidth * visibleHeight / crop.width;
        const host = homepageHost(product.homepage ?? product.homepageUrl ?? product.url);
        const values: Record<string, string> = {
          ...brand.colors, title: product.name, logo: brand.logo, logoClass: brand.logo ? 'has-logo' : '', frameWidth: String(frameWidth), contentHeight: String(contentHeight),
          kind: mobile ? 'phone' : capture.kind === 'terminal' ? 'terminal' : 'browser', addressClass: capture.kind === 'web' ? 'address' : '',
          windowTitle: capture.kind === 'web' ? host || product.name : product.name,
          screenshot: `data:image/png;base64,${PNG.sync.write(cropped).toString('base64')}`, caption: shot.caption ?? '', cardClass: shot.card ? 'title-card' : capture.kind === 'terminal' ? 'terminal-shot' : '',
          hx: String(box ? box.x / crop.width * 100 : 0), hy: String(box ? box.y / visibleHeight * 100 : 0),
          hw: String(box ? box.width / crop.width * 100 : 0), hh: String(box ? box.height / visibleHeight * 100 : 0), ringDisplay: box ? 'block' : 'none',
        };
        const page = await app.newPage({ viewport: { width: 1400, height: shot.card ? 700 : Math.ceil(contentHeight + 128) }, deviceScaleFactor: 2 });
        try {
          await page.route('**/*', route => route.abort());
          await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? '')));
          await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode())); });
          assertClean(await page.locator('body').innerText(), `polished ${shot.id}`);
          const output = await page.screenshot(); assertClean((await ocrWords(output)).text, `polished ${shot.id}`);
          await writeFile(destination, output); const { width, height } = PNG.sync.read(output);
          const area = await page.locator('.content').boundingBox();
          const highlight = box && area ? { x: (area.x + box.x / crop.width * area.width) * 2, y: (area.y + box.y / crop.height * area.height) * 2, width: box.width / crop.width * area.width * 2, height: box.height / crop.height * area.height * 2 } : undefined;
          const terminalBox = capture.kind === 'terminal' && area ? { x: area.x * 2, y: area.y * 2, width: area.width * 2, height: area.height * 2 } : undefined;
          report.push({ id: shot.id, file, source, theme, kind: capture.kind, purpose: shot.purpose, caption: shot.caption, moneyMoment: shot.moneyMoment ?? false, width, height, scale: 2, highlight, terminalBox, banned: [] });
        } catch (error) { await rm(destination, { force: true }); throw error; }
        finally { await page.close(); }
      }
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(report, null, 2)); return report;
  } finally { await app.close(); }
}
