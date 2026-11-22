import { readFile, readdir, realpath, stat, mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { storyboard } from '../media/assets.js';
import { polish } from '../media/polish.js';

export type SceneRole = 'hook' | 'before' | 'action' | 'after' | 'proof' | 'cta';
export interface Scene { shot: string; text: string; duration: number; voiceover?: string; role?: SceneRole; shortDuration?: number; highlight?: {x:number;y:number;width:number;height:number} }
export interface Script { scenes: Scene[] }
export const endCardSeconds = 3;
export function sceneDuration(scene: Scene, format = '16x9', storyboard = Boolean(scene.role)) { return format === '9x16' && storyboard ? scene.shortDuration ?? scene.duration * .5 : scene.duration; }
export function totalDuration(script: Script, format = '16x9') { return script.scenes.reduce((n, s) => n + sceneDuration(s, format, script.scenes.some(scene => scene.role)), 0) + endCardSeconds; }
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
  const captures:string[]=[];
  for (const directory of ['', 'shots']) {
    try { captures.push(...(await readdir(join(launchDir(cwd).media,directory))).filter(f => /\.(png|jpe?g|webm|mp4)$/i.test(f)).map(f=>directory?`${directory}/${f}`:f)); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  return captures.sort();
}
export async function resolveShot(cwd: string, shot: string): Promise<string> {
  const root = await realpath(launchDir(cwd).media);
  const ids = await shots(cwd);
  const candidates = [shot.replace(/^\.launch\/media\//, ''), ...(ids.some(s => s.id === shot) ? ['webm','mp4','png','jpg','jpeg'].flatMap(ext => [`${shot}.${ext}`,`shots/${shot}.${ext}`]) : [])];
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
  const modern = script.scenes.some(scene => scene.role);
  if (!modern && (script.scenes.length < 6 || script.scenes.some(scene => scene.text.trim().split(/\s+/).length > 8))) throw new Error('Legacy scripts require 6–10 scenes and captions of 1–8 words');
  if (duration < (modern ? 45 : 30) || duration > 60) throw new Error(`Total duration including the 3-second end card must be ${modern ? '45' : '30'}–60 seconds`);
  if (modern) {
    if (script.scenes[0].role !== 'hook' || script.scenes[0].duration > 3 || sceneDuration(script.scenes[0], '9x16') > 3 || script.scenes.slice(1).some(scene => scene.role === 'hook')) throw new Error('Hook must be first and at most 3 seconds');
    const short = totalDuration(script, '9x16');
    if (short < 20 || short > 35) throw new Error('Short duration including end card must be 20–35 seconds');
  }
  for (const scene of script.scenes) await resolveShot(cwd, scene.shot);
  return script;
}
export async function scriptFromShots(cwd: string): Promise<Script> {
  const planned = await storyboard(cwd);
  if (!planned) throw new Error('Video script --from-shots requires a storyboard');
  const polished = await polish(cwd);
  const base: Record<string, number> = { hook: 3, before: 7, action: 9, after: 15, proof: 8, cta: 5 };
  const weight = planned.reduce((sum, shot) => sum + (shot.purpose === 'hook' ? 0 : base[shot.purpose!]), 0);
  const scenes: Scene[] = [];
  for (const shot of planned) {
    const capture = polished.find(item => item.id === shot.id && item.theme !== 'dark') ?? polished.find(item => item.id === shot.id)!;
    let source = `polished/${capture.file}`;
    const footage = `shots/${shot.id}.mp4`;
    if (shot.commands && !shot.moneyMoment && !shot.card) {
      try { await access(join(launchDir(cwd).media, footage)); source = footage; } catch { /* Still captures remain valid scene sources. */ }
    }
    const duration = shot.purpose === 'hook' ? 3 : Math.round(base[shot.purpose!] / weight * 44 * 12) / 12;
    scenes.push({ shot: source, text: shot.caption ?? '', voiceover: shot.caption, role: shot.purpose as SceneRole, duration, shortDuration: shot.purpose === 'hook' ? 2 : duration * .5, ...(shot.moneyMoment && capture.highlight ? { highlight: capture.highlight } : {}) });
  }
  const script = await validateScript(cwd, { scenes });
  await mkdir(launchDir(cwd).video, { recursive: true });
  await writeFile(join(launchDir(cwd).video, 'script.json'), JSON.stringify(script, null, 2)); return script;
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
