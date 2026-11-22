import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import type { MediaShot } from '../visuals/modern-shot.js';

export async function optionalJson(path: string) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}
export async function dataImage(path: string): Promise<string> {
  const extension = extname(path).slice(1).toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(extension)) throw new Error('Unsupported media image format');
  return `data:image/${extension === 'svg' ? 'svg+xml' : extension};base64,${(await readFile(path)).toString('base64')}`;
}
export async function storyboard(cwd: string): Promise<MediaShot[] | undefined> {
  let data;
  try { data = parse(await readFile(launchDir(cwd).shots, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (!data?.shots?.some((shot: MediaShot) => shot.purpose)) return;
  const result = validateFile('shots', data);
  if (!result.valid) throw new Error(result.errors.join('; '));
  return data.shots;
}
export async function mediaBrand(cwd: string) {
  const paths = launchDir(cwd); const config = await optionalJson(paths.config);
  const brand = config.brandKit ? await optionalJson(resolve(cwd, config.brandKit)) : {};
  let logo = brand.logo ? await dataImage(resolve(cwd, brand.logo)) : '';
  if (!logo) {
    let files: string[] = [];
    try { files = await readdir(paths.media); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const file = files.sort().find(file => /^logo\.(png|svg|jpe?g|webp)$/i.test(file));
    if (file) logo = await dataImage(join(paths.media, file));
  }
  const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  return { logo, colors: { background: color(brand.colors?.background, '#101827'), foreground: color(brand.colors?.foreground, '#ffffff'), accent: color(brand.colors?.accent, '#77e5b3') } };
}
export function homepageHost(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || /^(?:localhost|127\.|0\.|\[?::1\]?|.*\.localhost$)/i.test(url.hostname)) return '';
    return url.hostname;
  } catch { return ''; }
}
export async function mediaHost(cwd: string, product: Record<string, any>): Promise<string> {
  const pkg = await optionalJson(join(cwd, 'package.json'));
  const values = [product.homepage, product.homepageUrl, product.url, product.repo, product.repository?.url, product.repository, pkg.homepage, pkg.repository?.url, pkg.repository];
  return values.map(value => homepageHost(typeof value === 'string' ? value.replace(/^git\+/, '').replace(/^git@([^:]+):/, 'https://$1/') : value)).find(Boolean) ?? '';
}
