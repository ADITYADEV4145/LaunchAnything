import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from './runtime.js';
import { platforms, checkImage, compositeColor, type Size } from './check.js';
import { assertPrivate } from './privacy.js';
import { ocrCheck } from './capture.js';
async function optionalJson(path: string) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw e; } }
async function dataImage(path: string) { const extension = extname(path).slice(1); return `data:image/${extension === 'svg' ? 'svg+xml' : extension};base64,${(await readFile(path)).toString('base64')}`; }
async function fallback(cwd: string): Promise<string | undefined> {
  for (const entry of await readdir(cwd, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist'].includes(entry.name)) continue;
    const path = join(cwd, entry.name);
    if (entry.isFile() && /\.(png|svg|jpg|jpeg)$/i.test(entry.name)) return path;
    if (entry.isDirectory()) { const found = await fallback(path); if (found) return found; }
  }
}
export async function makeImages(cwd: string, options: { template?: string; size?: string; headline?: string } = {}) {
  const paths = launchDir(cwd); const product = JSON.parse(await readFile(paths.product, 'utf8'));
  const config = await optionalJson(paths.config); const brand = config.brandKit ? await optionalJson(resolve(cwd, config.brandKit)) : {};
  const colors = { background: '#101827', foreground: '#ffffff', accent: '#77e5b3', ...brand.colors };
  const fonts = { heading: 'Arial', body: 'Arial', ...brand.fonts };
  const headline = options.headline ?? product.oneLiner; assertPrivate(`${product.name}\n${headline}`);
  const shots = await optionalJson(join(paths.media, 'shots', 'manifest.json'));
  const shot = Array.isArray(shots) ? shots[0] : undefined;
  const source = shot ? join(paths.media, 'shots', shot.files.find((f: string) => f.endsWith('.png'))) : await fallback(cwd);
  const screenshot = source ? await dataImage(source) : '';
  const logo = brand.logo ? await dataImage(resolve(cwd, brand.logo)) : '';
  const sizes = options.size ? [options.size] : Object.keys(platforms);
  if (sizes.some(s => !(s in platforms))) throw new Error('Unknown image size');
  if (options.template && !Object.keys(platforms).includes(options.template)) throw new Error('Unknown template');
  const dir = join(paths.media, 'images'); await mkdir(dir, { recursive: true });
  const app = await browser(); const report = [];
  try {
    for (const id of sizes as Size[]) {
      const size = platforms[id];
      let template: string;
      const custom = join(dir, 'custom');
      let customFiles: string[] = []; try { customFiles = (await readdir(custom)).filter(f => f.endsWith('.html')).sort(); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      template = await readFile(customFiles.length ? join(custom, customFiles[0]) : join(packageRoot(), 'templates/images', `${options.template ?? id}.html`), 'utf8');
      const values: Record<string, string> = { headline, title: product.name, background: colors.background, foreground: colors.foreground, accent: colors.accent, headingFont: fonts.heading, bodyFont: fonts.body, screenshot, logo, frame: shot?.kind === 'mobile' || (!shot && /expo/i.test(JSON.stringify(await optionalJson(join(cwd, 'package.json'))))) ? 'phone' : 'browser' };
      const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? ''));
      const page = await app.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(html); await page.evaluate(() => document.fonts.ready);
        const metrics = await page.locator('[data-headline]').evaluate(el => {
          const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
          const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
          let parent: Element | null = el; const backgrounds: number[][] = [];
          while (parent) { backgrounds.unshift(rgba(getComputedStyle(parent).backgroundColor)); parent = parent.parentElement; }
          return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, foreground: rgba(style.color), backgrounds };
        });
        const png = await page.screenshot(); await ocrCheck(png); const file = join(dir, `${id}.png`); await writeFile(file, png);
        const background = metrics.backgrounds.reduce((base, layer) => compositeColor(layer, base), [255, 255, 255]);
        report.push(await checkImage(file, id, { ...metrics, background }));
      } finally { await page.close(); }
    }
    await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    if (report.some(r => !r.ok)) throw new Error('Image checks failed; see .launch/media/images/report.json');
    return report;
  } finally { await app.close(); }
}
