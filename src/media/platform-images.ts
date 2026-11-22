import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { platforms, checkImage, contrast, type Size } from '../visuals/check.js';
import { assertClean, ocrWords } from './banned.js';
import { mediaBrand, dataImage, homepageHost, storyboard } from './assets.js';
import { polish } from './polish.js';
export interface CarouselSlide { role: string; caption: string; source?: string; id?: string }
export interface CarouselOptions { size?: Size; outDir?: string; prefix?: string }
export type CarouselReportItem = Awaited<ReturnType<typeof checkImage>> & { file: string; role: string; shot?: string; source: string | null; banned: string[] };
/** Render local image slides or caption-only brand cards without shots.yaml. One slide uses prefix.png; multiple slides use prefix-1.png, etc. */
export async function renderCarousel(cwd: string, slides: CarouselSlide[], options: CarouselOptions = {}): Promise<{ files: string[]; report: CarouselReportItem[] }> {
  if (!slides.length) throw new Error('Carousel requires at least one slide');
  const size = options.size ?? 'instagram';
  if (!(size in platforms)) throw new Error('Unknown image size');
  const prefix = options.prefix ?? size;
  if (!/^[\w-]+$/.test(prefix)) throw new Error('Carousel prefix must be a safe filename');
  const paths = launchDir(cwd); const product = JSON.parse(await readFile(paths.product, 'utf8')); const brand = await mediaBrand(cwd);
  const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const background = rgb(brand.colors.background);
  let foreground = brand.colors.foreground;
  if (contrast(rgb(foreground), background) < 7) foreground = contrast([255, 255, 255], background) >= 7 ? '#ffffff' : '#000000';
  const dir = options.outDir ? resolve(cwd, options.outDir) : join(paths.media, 'images'); await mkdir(dir, { recursive: true });
  await rm(join(dir, `${prefix}-report.json`), { force: true });
  const template = await readFile(join(packageRoot(), 'templates/images/storyboard.html'), 'utf8');
  const labels: Record<string, string> = { hook: 'THE PROBLEM', before: 'BEFORE', action: 'IN ACTION', after: 'THE MOMENT', proof: 'THE PROOF', cta: 'GET STARTED' };
  const app = await browser(); const report: CarouselReportItem[] = [];
  try {
    for (const [index, slide] of slides.entries()) {
      const dimensions = platforms[size]; const titleCard = !slide.source;
      const source = slide.source ? resolve(cwd, slide.source) : null;
      const headline = slide.caption;
      const filename = `${prefix}${slides.length > 1 ? `-${index + 1}` : ''}.png`;
      assertClean(`${product.name}\n${headline}`, `image ${filename}`);
      const values: Record<string, string> = {
        ...brand.colors, foreground, title: product.name, headline, logo: brand.logo,
        screenshot: source ? await dataImage(source) : '', host: homepageHost(product.homepage ?? product.homepageUrl ?? product.url),
        classes: [size === 'instagram' ? 'portrait' : '', titleCard ? 'title-card' : '', brand.logo ? 'has-logo' : ''].join(' '),
        eyebrow: labels[slide.role] ?? '', pagination: slides.length > 1 ? `${index + 1} / ${slides.length}` : '',
      };
      const file = join(dir, filename); await rm(file, { force: true });
      const page = await app.newPage({ viewport: { width: dimensions.width, height: dimensions.height }, deviceScaleFactor: 1 });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? '')));
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode())); });
        assertClean(await page.locator('body').innerText(), `image ${filename}`);
        const metrics = await page.locator('[data-headline]').evaluate(el => {
          const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
          return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, foreground: (style.color.match(/[\d.]+/g) ?? []).map(Number), background: (style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number) };
        });
        const png = await page.screenshot(); assertClean((await ocrWords(png)).text, `image ${filename}`);
        await writeFile(file, png);
        const result = await checkImage(file, size, metrics);
        result.checks.contrast = result.contrastRatio >= 7; result.ok = Object.values(result.checks).every(Boolean);
        report.push({ ...result, file: filename, role: slide.role, shot: slide.id, source, banned: [] as string[] });
      } catch (error) { await rm(file, { force: true }); throw error; }
      finally { await page.close(); }
    }
    await writeFile(join(dir, `${prefix}-report.json`), JSON.stringify(report, null, 2));
    if (report.some(item => !item.ok)) throw new Error('Image checks failed; see .launch/media/images/report.json');
    return { files: report.map(item => join(dir, item.file)), report };
  } finally { await app.close(); }
}

export async function storyboardImages(cwd: string, options: { size?: string; template?: string; headline?: string } = {}) {
  const shots = await storyboard(cwd);
  if (!shots) throw new Error('Storyboard images require shots with purposes');
  if (options.size && !(options.size in platforms)) throw new Error('Unknown image size');
  if (options.template && !(options.template in platforms)) throw new Error('Unknown template');
  const paths = launchDir(cwd); await rm(join(paths.media, 'images/report.json'), { force: true });
  const polished = await polish(cwd); const money = shots.find(shot => shot.moneyMoment)!;
  const slide = (shot: typeof money): CarouselSlide => {
    const capture = polished.find(item => item.id === shot.id && item.theme !== 'dark') ?? polished.find(item => item.id === shot.id);
    if (!capture) throw new Error(`No polished media for shot ${shot.id}`);
    return { id: shot.id, role: shot.purpose!, caption: shot.caption ?? '', source: shot.card ? undefined : join(paths.media, 'polished', capture.file) };
  };
  const report = [];
  for (const size of Object.keys(platforms) as Size[]) {
    if (options.size && size !== options.size) continue;
    const selected = size === 'instagram' ? ['hook', 'before', 'action', 'after', 'cta'].map(role => {
      const shot = role === 'after' ? money : shots.find(shot => shot.purpose === role);
      if (!shot) throw new Error(`Instagram carousel requires a ${role} shot; fill it from the repo`);
      return shot;
    }) : size === 'product-hunt' ? [money, ...shots.filter(shot => ['action', 'after', 'proof'].includes(shot.purpose!) && shot.id !== money.id && !shot.card)] : [money];
    const result = await renderCarousel(cwd, selected.map(slide), { size }); report.push(...result.report);
    if (size === 'instagram' || size === 'product-hunt') {
      const alias = `${size}.png`; const first = result.report[0];
      await writeFile(join(paths.media, 'images', alias), await readFile(result.files[0]));
      if (first.file !== alias) report.push({ ...first, file: alias });
      else if (size === 'product-hunt') { await writeFile(join(paths.media, 'images/product-hunt-1.png'), await readFile(result.files[0])); report.push({ ...first, file: 'product-hunt-1.png' }); }
    }
  }
  await writeFile(join(paths.media, 'images/report.json'), JSON.stringify(report, null, 2)); return report;
}
