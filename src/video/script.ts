import { readFile, readdir, realpath, stat, mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { storyboard } from '../media/assets.js';
import { polish } from '../media/polish.js';
import { loadStyle } from './styles.js';

export type SceneRole = 'hook' | 'before' | 'action' | 'after' | 'proof' | 'cta';
export interface Scene { shot: string; text: string; duration: number; voiceover?: string; role?: SceneRole; shortDuration?: number; highlight?: {x:number;y:number;width:number;height:number} }
export interface Script { scenes: Scene[]; style?: string }
export interface Gate { id: string; name: string; status: 'pass' | 'fail' | 'skipped'; detail: string }
export const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
export function readcheck(script: Script, captions = srt(script)): Gate {
  const errors: string[] = [];
  if (!script.scenes.length) errors.push('No scenes');
  script.scenes.forEach((scene, i) => {
    if (!Number.isFinite(scene.duration) || scene.duration < 0.5 + words(scene.text).length / 3) errors.push(`Scene ${i + 1}: text needs more reading time`);
    if (scene.voiceover && words(scene.voiceover).length > scene.duration * 2.8) errors.push(`Scene ${i + 1}: voiceover exceeds 2.8 words/s`);
  });
  const boundaries = (value: string) => [...value.matchAll(/^(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})$/gm)].map(m => [m[1], m[2]]);
  if (JSON.stringify(boundaries(captions)) !== JSON.stringify(boundaries(srt(script)))) errors.push('SRT cue map does not align with scene boundaries');
  return {id:'G3', name:'readcheck', status:errors.length ? 'fail' : 'pass', detail:errors.join('; ') || 'Reading time, voiceover rate and SRT cue map align'};
}
export function chromeLint(script: Script): Gate {
  const bad = script.scenes.flatMap((scene, i) => /\b\d+\s*\/\s*\d+\b|\bstep\s+\d+\s+of\s+\d+\b|\d+(?:\.\d+)?\s*%|[▮▯█░▓▒■□]/iu.test(scene.text) ? [`Scene ${i + 1}`] : []);
  return {id:'G4', name:'no-page-chrome', status:bad.length ? 'fail' : 'pass', detail:bad.length ? `${bad.join(', ')} contains counters or progress markers` : 'No counters or progress markers'};
}
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
  const style = await loadStyle(cwd,script.style);
  if ((style.id !== 'midnight' || style.custom) && script.scenes.some(scene => [scene.duration, ...(scene.role ? [sceneDuration(scene,'9x16',true)] : [])].some(duration => duration < style.pacing.min || duration > style.pacing.max))) throw new Error(`Scene duration outside ${style.id} pacing (${style.pacing.min}–${style.pacing.max}s)`);
  const duration = totalDuration(script);
  const modern = script.scenes.some(scene => scene.role);
  if (!modern && (script.scenes.length < 6 || script.scenes.some(scene => scene.text.trim().split(/\s+/).length > 8))) throw new Error('Legacy scripts require 6–10 scenes and captions of 1–8 words');
  if (duration < (modern ? 45 : 30) || duration > 60) throw new Error(`Total duration including the 3-second end card must be ${modern ? '45' : '30'}–60 seconds`);
  if (modern) {
    const hookLimit = Math.max(3, Math.ceil((.5 + words(script.scenes[0].text).length / 3) * 12) / 12);
    if (script.scenes[0].role !== 'hook' || script.scenes[0].duration > hookLimit || sceneDuration(script.scenes[0], '9x16') > hookLimit || script.scenes.slice(1).some(scene => scene.role === 'hook')) throw new Error('Hook must be first and at most 3 seconds, extended only for minimum reading time');
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
    const readingSeconds = Math.ceil((.5 + words(shot.caption ?? '').length / 3) * 12) / 12;
    const duration = shot.purpose === 'hook' ? Math.max(3, readingSeconds) : Math.round(base[shot.purpose!] / weight * 44 * 12) / 12;
    const shortDuration = shot.purpose === 'hook' ? Math.max(3, readingSeconds) : Math.max(duration * .5, readingSeconds);
    scenes.push({ shot: source, text: shot.caption ?? '', voiceover: shot.caption, role: shot.purpose as SceneRole, duration, shortDuration, ...(shot.moneyMoment && capture.highlight ? { highlight: capture.highlight } : {}) });
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
