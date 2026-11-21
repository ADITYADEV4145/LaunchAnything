import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';

export interface Scene { shot: string; text: string; duration: number; voiceover?: string }
export interface Script { scenes: Scene[] }
export const endCardSeconds = 3;
export function totalDuration(script: Script) { return script.scenes.reduce((n, s) => n + s.duration, 0) + endCardSeconds; }
export interface Shot { id: string; route: string; viewport: {width: number; height: number}; record?: boolean; theme?: 'light' | 'dark'; waitFor?: string; actions?: {type: string; selector: string; text?: string}[] }
export async function shots(cwd: string): Promise<Shot[]> {
  try {
    const data = parse(await readFile(launchDir(cwd).shots, 'utf8'));
    const check = validateFile('shots', data);
    if (!check.valid) throw new Error(check.errors.join('; '));
    return data.shots;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}
export async function media(cwd: string) {
  try { return (await readdir(launchDir(cwd).media)).filter(f => /\.(png|jpe?g|webm|mp4)$/i.test(f)).sort(); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}
export async function resolveShot(cwd: string, shot: string): Promise<string> {
  const root = await realpath(launchDir(cwd).media);
  const ids = await shots(cwd);
  const candidates = [shot.replace(/^\.launch\/media\//, ''), ...(ids.some(s => s.id === shot) ? ['webm','mp4','png','jpg','jpeg'].map(ext => `${shot}.${ext}`) : [])];
  for (const candidate of candidates) {
    if (!/\.(png|jpe?g|webm|mp4)$/i.test(candidate)) continue;
    try {
      const path = await realpath(resolve(root, candidate));
      if (path.startsWith(root + sep) && (await stat(path)).isFile()) return path;
    } catch { /* Try the next captured extension. */ }
  }
  throw new Error(`Shot does not resolve to captured media: ${shot}`);
}
export async function validateScript(cwd: string, data: unknown): Promise<Script> {
  const result = validateFile('video-script', data);
  if (!result.valid) throw new Error(result.errors.join('; '));
  const script = data as Script;
  const duration = totalDuration(script);
  if (duration < 30 || duration > 60) throw new Error('Total duration including the 3-second end card must be 30–60 seconds');
  for (const scene of script.scenes) await resolveShot(cwd, scene.shot);
  return script;
}
export async function loadScript(cwd: string) { return validateScript(cwd, JSON.parse(await readFile(join(launchDir(cwd).video, 'script.json'), 'utf8'))); }
export async function productName(cwd: string) {
  try { const p = JSON.parse(await readFile(launchDir(cwd).product, 'utf8')); return String(p.name ?? p.productName ?? 'Product'); }
  catch { return 'Product'; }
}
function timestamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2,'0')}:${String(Math.floor(ms / 60000) % 60).padStart(2,'0')}:${String(Math.floor(ms / 1000) % 60).padStart(2,'0')},${String(ms % 1000).padStart(3,'0')}`;
}
export function srt(script: Script) {
  let time = 0;
  return script.scenes.map((scene, i) => { const start = time; time += scene.duration; return `${i + 1}\n${timestamp(start)} --> ${timestamp(time)}\n${scene.text}\n`; }).join('\n');
}
