import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { platforms, checkImage, contrast, type Size } from '../visuals/check.js';
import { assertClean, ocrWords } from './banned.js';
import { mediaBrand, dataImage, homepageHost, storyboard } from './assets.js';
import { polish } from './polish.js';
import type { MediaShot } from '../visuals/modern-shot.js';

export async function storyboardImages(cwd: string, options: { size?: string; template?: string; headline?: string } = {}) {
  const shots = await storyboard(cwd);
  if (!shots) throw new Error('Storyboard images require shots with purposes');
  if (options.size && !(options.size in platforms)) throw new Error('Unknown image size');
  if (options.template && !(options.template in platforms)) throw new Error('Unknown template');
  const paths = launchDir(cwd); const product = JSON.parse(await readFile(paths.product, 'utf8')); const brand = await mediaBrand(cwd);
  const polished = await polish(cwd);
  const money = shots.find(shot => shot.moneyMoment)!;
  const jobs: { file: string; size: Size; shot: MediaShot; pagination?: string }[] = [];
  for (const size of Object.keys(platforms) as Size[]) {
    if (options.size && size !== options.size) continue;
    if (size === 'instagram') {
      for (const [index, purpose] of ['hook', 'before', 'action', 'after', 'cta'].entries()) {
        const shot = purpose === 'after' ? money : shots.find(shot => shot.purpose === purpose);
        if (!shot) throw new Error(`Instagram carousel requires a ${purpose} shot; fill it from the repo`);
        jobs.push({ file: `instagram-${index + 1}.png`, size, shot, pagination: `${index + 1} / 5` });
      }
    } else jobs.push({ file: `${size}.png`, size, shot: money });
    if (size === 'product-hunt') {
      const gallery = shots.filter(shot => ['action', 'after', 'proof'].includes(shot.purpose!) && shot.id !== money.id && !shot.card);
      gallery.forEach((shot, index) => jobs.push({ file: `product-hunt-${index + 2}.png`, size, shot }));
    }
  }
  const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const background = rgb(brand.colors.background);
  let foreground = brand.colors.foreground;
  if (contrast(rgb(foreground), background) < 7) foreground = contrast([255, 255, 255], background) >= 7 ? '#ffffff' : '#000000';
  const dir = join(paths.media, 'images'); await mkdir(dir, { recursive: true }); await rm(join(dir, 'report.json'), { force: true });
  const template = await readFile(join(packageRoot(), 'templates/images/storyboard.html'), 'utf8');
  const labels: Record<string, string> = { hook: 'THE PROBLEM', before: 'BEFORE', action: 'IN ACTION', after: 'THE MOMENT', proof: 'THE PROOF', cta: 'GET STARTED' };
  const app = await browser(); const report = [];
  try {
    for (const job of jobs) {
      const { shot, size } = job; const dimensions = platforms[size];
      const titleCard = Boolean(shot.card && ['hook', 'cta'].includes(shot.purpose!));
      const capture = polished.find(item => item.id === shot.id && item.theme !== 'dark') ?? polished.find(item => item.id === shot.id);
      if (!capture) throw new Error(`No polished media for shot ${shot.id}`);
      const source = titleCard ? null : join(paths.media, 'polished', capture.file);
      const headline = shot.caption ?? product.oneLiner;
      assertClean(`${product.name}\n${headline}`, `image ${job.file}`);
      const values: Record<string, string> = {
        ...brand.colors, foreground, title: product.name, headline, logo: brand.logo,
        screenshot: source ? await dataImage(source) : '', host: homepageHost(product.homepage ?? product.homepageUrl ?? product.url),
        classes: [size === 'instagram' ? 'portrait' : '', titleCard ? 'title-card' : '', brand.logo ? 'has-logo' : ''].join(' '),
        eyebrow: labels[shot.purpose!] ?? '', pagination: job.pagination ?? '',
      };
      const file = join(dir, job.file); await rm(file, { force: true });
      const page = await app.newPage({ viewport: { width: dimensions.width, height: dimensions.height }, deviceScaleFactor: 1 });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? '')));
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode())); });
        assertClean(await page.locator('body').innerText(), `image ${job.file}`);
        const metrics = await page.locator('[data-headline]').evaluate(el => {
          const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
          return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, foreground: (style.color.match(/[\d.]+/g) ?? []).map(Number), background: (style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number) };
        });
        const png = await page.screenshot(); assertClean((await ocrWords(png)).text, `image ${job.file}`);
        await writeFile(file, png);
        const result = await checkImage(file, size, metrics);
        result.checks.contrast = result.contrastRatio >= 7; result.ok = Object.values(result.checks).every(Boolean);
        report.push({ ...result, file: job.file, role: shot.purpose, shot: shot.id, source, banned: [] as string[] });
        if ((size === 'product-hunt' && job.file === 'product-hunt.png') || job.file === 'instagram-1.png') {
          const alias = size === 'product-hunt' ? 'product-hunt-1.png' : 'instagram.png';
          await writeFile(join(dir, alias), png); report.push({ ...report[report.length - 1], file: alias });
        }
      } catch (error) { await rm(file, { force: true }); throw error; }
      finally { await page.close(); }
    }
    await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    if (report.some(item => !item.ok)) throw new Error('Image checks failed; see .launch/media/images/report.json');
    return report;
  } finally { await app.close(); }
}
