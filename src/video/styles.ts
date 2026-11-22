import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { launchDir } from '../core/launch-dir.js';
import { contrast } from '../visuals/check.js';
import type { Gate } from './script.js';

export const axes = ['palette','typography','pacing','transition','camera','captionPosition'] as const;
export interface VideoStyle {
  id: string; name: string; summary: string;
  palette: { background: string[]; text: string; accent: string; captionBackground: string };
  typography: { fontFamily: string; weight: number; case: 'none' | 'uppercase' | 'lowercase' };
  pacing: { min: number; max: number };
  transition: 'cut' | 'fade' | 'slide'; camera: 'static-push' | 'push-in' | 'pan';
  captionPosition: 'top' | 'bottom' | 'center';
  base?: string; direction: string; custom?: boolean;
}
const validId = (id: string) => /^[a-z][a-z0-9-]{0,63}$/.test(id);
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function parseStyle(source: string): VideoStyle {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('STYLE.md requires YAML frontmatter');
  const s = parse(match[1]);
  if (!s || typeof s !== 'object' || !validId(s.id ?? '') || typeof s.name !== 'string' || !s.name.trim() || typeof s.summary !== 'string' || !s.summary.trim() || !match[2].trim()) throw new Error('Style requires id, name, summary and direction');
  if (!Array.isArray(s.palette?.background) || s.palette.background.length < 2 || !s.palette.background.every(color) || ![s.palette.text,s.palette.accent,s.palette.captionBackground].every(color)) throw new Error('Style palette requires hex colors and at least two gradient stops');
  if (typeof s.typography?.fontFamily !== 'string' || !/^[\w ,'-]+$/.test(s.typography.fontFamily) || !Number.isInteger(s.typography.weight) || s.typography.weight < 100 || s.typography.weight > 900 || !['none','uppercase','lowercase'].includes(s.typography.case)) throw new Error('Invalid style typography');
  if (!Number.isFinite(s.pacing?.min) || !Number.isFinite(s.pacing?.max) || s.pacing.min < 0 || s.pacing.max <= 0 || s.pacing.min > s.pacing.max) throw new Error('Invalid style pacing');
  if (!['cut','fade','slide'].includes(s.transition) || !['static-push','push-in','pan'].includes(s.camera) || !['top','bottom','center'].includes(s.captionPosition)) throw new Error('Invalid style motion or caption position');
  if (s.base !== undefined && (typeof s.base !== 'string' || !validId(s.base))) throw new Error('Invalid base style');
  const result = {...s,direction:match[2].trim()} as VideoStyle;
  if (captionContrast(result) < 7) throw new Error('Style caption contrast must be at least 7:1');
  return result;
}
const rgb = (hex: string) => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)) as [number,number,number];
export function captionContrast(style: VideoStyle) { return contrast(rgb(style.palette.text),rgb(style.palette.captionBackground)); }
export function distinctAxes(style: VideoStyle, base: VideoStyle) {
  const canonical = (value: unknown): string => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,JSON.parse(canonical(v))])) : value);
  return axes.filter(axis => canonical(style[axis]) !== canonical(base[axis]));
}
const builtins = join(packageRoot(),'templates/video/styles');
export async function loadStyle(cwd: string, id = 'midnight', builtin = false): Promise<VideoStyle> {
  if (!validId(id)) throw new Error(`Invalid style id: ${id}`);
  if (!builtin) {
    try { const s = parseStyle(await readFile(join(launchDir(cwd).video,'styles',id,'STYLE.md'),'utf8')); if (s.id !== id) throw new Error('Style id must match directory'); return {...s,custom:true}; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  const s = parseStyle(await readFile(join(builtins,id,'STYLE.md'),'utf8'));
  if (s.id !== id) throw new Error('Style id must match directory');
  return s;
}
export async function listStyles(cwd: string) {
  const ids = new Set(await readdir(builtins));
  try { for (const id of await readdir(join(launchDir(cwd).video,'styles'))) ids.add(id); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  return Promise.all([...ids].sort().map(id => loadStyle(cwd,id)));
}
export async function styleGate(cwd: string, style: VideoStyle): Promise<Gate> {
  if (!style.custom) return {id:'style-distinct',name:'style-distinct',status:'skipped',detail:'Built-in style'};
  try {
    const base = await loadStyle(cwd,style.base ?? style.id,true);
    const changed = distinctAxes(style,base);
    return {id:'style-distinct',name:'style-distinct',status:changed.length >= 4 ? 'pass':'fail',detail:`${style.id} differs from ${base.id} on ${changed.length}/6 axes (${changed.join(', ')}); need at least 4`};
  } catch (e) { return {id:'style-distinct',name:'style-distinct',status:'fail',detail:(e as Error).message}; }
}
export async function checkStyles(cwd: string) {
  const results = await Promise.all((await listStyles(cwd)).map(async style => ({style:style.id,...await styleGate(cwd,style)})));
  const failed = results.filter(r => r.status === 'fail');
  if (failed.length) throw new Error(failed.map(r => r.detail).join('; '));
  return results;
}
export async function forkStyle(cwd: string, id: string, name: string) {
  if (!validId(name)) throw new Error('Invalid new style id');
  const source = await loadStyle(cwd,id);
  const target = join(launchDir(cwd).video,'styles',name,'STYLE.md');
  try { await access(target); throw new Error(`Style already exists: ${name}`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const {direction,custom,...data} = source;
  await mkdir(join(launchDir(cwd).video,'styles',name),{recursive:true});
  await writeFile(target,`---\n${stringify({...data,id:name,name,base:source.base ?? source.id})}---\n\n${direction}\n`,{flag:'wx'});
  return {path:target,style:await loadStyle(cwd,name)};
}
export function styleText(text: string, style: VideoStyle) { return style.typography.case === 'uppercase' ? text.toUpperCase() : style.typography.case === 'lowercase' ? text.toLowerCase() : text; }
export function motionFilter(style: VideoStyle, width: number, height: number, duration: number) {
  const frames = Math.max(1,duration*12);
  const zoom = style.camera === 'push-in' ? '.08' : '.04';
  const x = style.camera === 'pan' ? `'(iw-iw/zoom)*on/${frames}'` : "'iw/2-iw/zoom/2'";
  const z = style.camera === 'pan' ? '1.04' : `'1+${zoom}*on/${frames}'`;
  const transition = style.transition === 'fade' ? `,fade=t=in:d=0.25:color=${style.palette.background[0]},fade=t=out:st=${Math.max(0,duration-.25)}:d=0.25:color=${style.palette.background[0]}` : style.transition === 'slide' ? `,pad=iw*2:ih:0:0:color=${style.palette.background[0]},crop=iw/2:ih:x='iw/2*max(0,1-t/0.25)'` : '';
  return `zoompan=z=${z}:x=${x}:y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=12${transition}`;
}
export async function stylesGallery(cwd: string) {
  const styles = await listStyles(cwd);
  const {sceneAssets,frameLayout} = await import('./design.js');
  const dir = join(launchDir(cwd).video,'style-gallery'); await mkdir(dir,{recursive:true});
  const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const cards = [];
  for (const style of styles) {
    const asset = await sceneAssets(dir,style.id,640,360,frameLayout(640,360,640,360),{name:'Your product',tagline:'Real work, clearly told',homepage:'example.com'},'Show the moment that matters',0,1,style);
    const data = async (path: string) => `data:image/svg+xml;base64,${(await readFile(path)).toString('base64')}`;
    cards.push(`<article><h2>${escape(style.name)}</h2><p>${escape(style.summary)}</p><div class="swatch" style="background:linear-gradient(135deg,${style.palette.background.join(',')})"></div><p style="font-family:${escape(style.typography.fontFamily)};font-weight:${style.typography.weight}">${escape(styleText('Real work, clearly told',style))}</p><div class="frame"><img alt="${escape(style.id)} plate" src="${await data(asset.platePath)}"><img alt="${escape(style.id)} captions" src="${await data(asset.captionPath)}"></div></article>`);
  }
  const gallery = join(launchDir(cwd).video,'styles.html');
  await writeFile(gallery,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Video styles</title><style>body{font:16px system-ui;background:#eee;color:#111;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{background:white;padding:20px;border-radius:12px}.swatch{height:60px}.frame{position:relative;aspect-ratio:16/9}.frame img{position:absolute;width:100%;height:100%}</style><h1>Video style gallery</h1><main>${cards.join('')}</main></html>`);
  return {styles,gallery};
}
