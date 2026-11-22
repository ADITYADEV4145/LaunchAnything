import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { platforms, checkImage, contrast, type Size } from '../visuals/check.js';
import { assertClean, ocrWords } from './banned.js';
import { mediaBrand, dataImage, mediaHost, storyboard } from './assets.js';
import { polish } from './polish.js';
import { terminalSource, renderTerminal, type TerminalTranscript, type TerminalMetrics } from './terminal.js';
export interface CarouselSlide { role: string; caption: string; source?: string; id?: string; terminal?: TerminalTranscript }
export interface CarouselOptions { size?: Size; outDir?: string; prefix?: string }
export type CarouselReportItem = Awaited<ReturnType<typeof checkImage>> & { file: string; role: string; shot?: string; source: string | null; banned: string[]; terminal?: TerminalMetrics };
/** Render local image slides or caption-only brand cards without shots.yaml. One slide uses prefix.png; multiple slides use prefix-1.png, etc. */
export async function renderCarousel(cwd: string, slides: CarouselSlide[], options: CarouselOptions = {}): Promise<{ files: string[]; report: CarouselReportItem[] }> {
  if (!slides.length) throw new Error('Carousel requires at least one slide');
  const size = options.size ?? 'instagram';
  if (!(size in platforms)) throw new Error('Unknown image size');
  const prefix = options.prefix ?? size;
  if (!/^[\w-]+$/.test(prefix)) throw new Error('Carousel prefix must be a safe filename');
  const paths = launchDir(cwd); const product = JSON.parse(await readFile(paths.product, 'utf8')); const brand = await mediaBrand(cwd);
  const host = await mediaHost(cwd, product);
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
      const dimensions = platforms[size]; const titleCard = !slide.source && !slide.terminal;
      const source = slide.source ? resolve(cwd, slide.source) : null;
      const transcript = slide.terminal ?? (source ? await terminalSource(cwd, source) : undefined);
      let terminal: TerminalMetrics | undefined;
      const headline = slide.caption;
      const filename = `${prefix}${slides.length > 1 ? `-${index + 1}` : ''}.png`;
      assertClean(`${product.name}\n${headline}`, `image ${filename}`);
      const values: Record<string, string> = {
        ...brand.colors, foreground, title: product.name, headline, logo: brand.logo,
        screenshot: source ? await dataImage(source) : '', host,
        classes: [size === 'instagram' ? 'portrait' : '', titleCard ? 'title-card' : '', brand.logo ? 'has-logo' : '', transcript ? 'terminal-image' : ''].join(' '),
        eyebrow: labels[slide.role] ?? '', pagination: slides.length > 1 ? `${index + 1} / ${slides.length}` : '',
      };
      const file = join(dir, filename); await rm(file, { force: true });
      const page = await app.newPage({ viewport: { width: dimensions.width, height: dimensions.height }, deviceScaleFactor: 1 });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? '')));
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode())); });
        if (transcript) {
          const stage = (await page.locator('.stage').boundingBox())!;
          const portrait = dimensions.height > dimensions.width;
          const rendered = await renderTerminal(app, transcript, { width: stage.width, height: stage.height, minCapHeight: dimensions.height * (portrait ? .022 : .025), columns: portrait ? 44 : 80, title: product.name, accent: brand.colors.accent });
          await page.locator('.stage img').evaluate(async (image: HTMLImageElement, src) => { image.src = src; await image.decode(); }, `data:image/png;base64,${rendered.png.toString('base64')}`);
          const scale = Math.min(stage.width / rendered.width, stage.height / rendered.height);
          terminal = { ...rendered.terminal, capHeight: rendered.terminal.capHeight * scale, box: { x: stage.x + (stage.width - rendered.width * scale) / 2 + rendered.terminal.box.x * scale, y: stage.y + (stage.height - rendered.height * scale) / 2 + rendered.terminal.box.y * scale, width: rendered.terminal.box.width * scale, height: rendered.terminal.box.height * scale } };
        }
        assertClean(await page.locator('body').innerText(), `image ${filename}`);
        const metrics = await page.locator('[data-headline]').evaluate(el => {
          const box = el.getBoundingClientRect(); const style = getComputedStyle(el);
          return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, foreground: (style.color.match(/[\d.]+/g) ?? []).map(Number), background: (style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number) };
        });
        const png = await page.screenshot(); assertClean((await ocrWords(png)).text, `image ${filename}`);
        await writeFile(file, png);
        const result = await checkImage(file, size, metrics);
        result.checks.contrast = result.contrastRatio >= 7; result.ok = Object.values(result.checks).every(Boolean);
        report.push({ ...result, file: filename, role: slide.role, shot: slide.id, source, terminal, banned: [] as string[] });
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
