import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { assertClean, ocrWords } from './banned.js';
import { dataImage, mediaBrand, homepageHost, storyboard } from './assets.js';

export interface PolishedShot {
  id: string; file: string; source: string; theme: string; kind: string; purpose?: string; caption?: string; moneyMoment: boolean;
  width: number; height: number; scale: number; banned: string[];
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
        const box = capture.highlights?.[theme] ?? capture.highlight;
        const bottom = Math.max(0, ...ocr.words.map(word => word.y + word.height), box ? box.y + box.height : 0);
        const visibleHeight = capture.kind === 'terminal' && ocr.words.length ? Math.min(image.height, Math.max(image.height * .35, bottom + 64 * (capture.scale ?? 1))) : image.height;
        const frameWidth = Math.min(mobile ? 340 : 1272, 700 * image.width / visibleHeight);
        const contentHeight = frameWidth * visibleHeight / image.width;
        const host = homepageHost(product.homepage ?? product.homepageUrl ?? product.url);
        const values: Record<string, string> = {
          ...brand.colors, frameWidth: String(frameWidth), contentHeight: String(contentHeight),
          kind: mobile ? 'phone' : capture.kind === 'terminal' ? 'terminal' : 'browser', addressClass: capture.kind === 'web' ? 'address' : '',
          windowTitle: capture.kind === 'web' ? host || product.name : product.name,
          screenshot: await dataImage(source), caption: shot.caption ?? '', cardClass: shot.card ? 'title-card' : '',
          hx: String(box ? box.x / image.width * 100 : 0), hy: String(box ? box.y / visibleHeight * 100 : 0),
          hw: String(box ? box.width / image.width * 100 : 0), hh: String(box ? box.height / visibleHeight * 100 : 0), ringDisplay: box ? 'block' : 'none',
        };
        const page = await app.newPage({ viewport: { width: 1400, height: shot.card ? 700 : Math.ceil(contentHeight + 160) }, deviceScaleFactor: 2 });
        try {
          await page.route('**/*', route => route.abort());
          await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? '')));
          await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
          assertClean(await page.locator('body').innerText(), `polished ${shot.id}`);
          const output = await page.screenshot(); assertClean((await ocrWords(output)).text, `polished ${shot.id}`);
          await writeFile(destination, output); const { width, height } = PNG.sync.read(output);
          report.push({ id: shot.id, file, source, theme, kind: capture.kind, purpose: shot.purpose, caption: shot.caption, moneyMoment: shot.moneyMoment ?? false, width, height, scale: 2, banned: [] });
        } catch (error) { await rm(destination, { force: true }); throw error; }
        finally { await page.close(); }
      }
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(report, null, 2)); return report;
  } finally { await app.close(); }
}
