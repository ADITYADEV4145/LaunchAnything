import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFile } from '../core/schema.js';
import { assertSafePath, atomicWrite } from '../copy/safe-path.js';

export function parseBrand(html: string, site?: string) {
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const tags = [...html.matchAll(/<(meta|link)\b[^>]*>/gi)].map(m => {
    const attrs: Record<string, string> = {};
    for (const a of m[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4]);
    return attrs;
  });
  const meta = (key: string) => tags.find(t => t.property === key || t.name === key)?.content ?? '';
  const url = (value: string) => {
    if (!value) return '';
    try { const u = new URL(value, site); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return value.startsWith('/') ? value : ''; }
  };
  const icon = tags.find(t => /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(t.rel ?? ''))?.href ?? '';
  return {
    name: meta('og:site_name') || meta('og:title') || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim(),
    description: meta('description') || meta('og:description'), logoUrl: url(icon), iconUrl: url(icon),
    ogImage: url(meta('og:image')),
    colors: [...new Set([meta('theme-color'), ...[...html.matchAll(/#[\da-f]{3,8}\b/gi)].map(m => m[0])].filter(Boolean))],
    fonts: [...new Set([...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)].flatMap(m => m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''))))],
  };
}
export async function importBrand(cwd: string, options: { site?: string; siteFile?: string }) {
  let html: string;
  if (options.siteFile) html = await readFile(options.siteFile, 'utf8');
  else {
    const url = new URL(options.site!);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Site must be an HTTP(S) URL');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Site returned HTTP ${response.status}`);
    html = await response.text();
  }
  const brand = parseBrand(html, options.site);
  const checked = validateFile('brand', brand);
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const target = join(cwd, '.launch/brand.json');
  const kitPath = join(cwd, '.launch/brand-kit.json');
  const configPath = join(cwd, '.launch/config.json');
  for (const path of [target, kitPath, configPath]) assertSafePath(cwd, path);
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
    const checked = validateFile('config', config);
    if (!checked.valid) throw new Error(checked.errors.join('; '));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const kit = { ...brand,
    colors: brand.colors.length ? { accent: brand.colors[0] } : {},
    fonts: brand.fonts.length ? { heading: brand.fonts[0], body: brand.fonts[0] } : {},
  };
  await mkdir(join(cwd, '.launch'), { recursive: true });
  atomicWrite(cwd, target, JSON.stringify(brand, null, 2) + '\n');
  atomicWrite(cwd, kitPath, JSON.stringify(kit, null, 2) + '\n');
  if (config) atomicWrite(cwd, configPath, JSON.stringify({ ...config, brandKit: '.launch/brand-kit.json' }, null, 2) + '\n');
  return brand;
}
