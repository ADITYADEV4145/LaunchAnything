import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchDir } from '../core/launch-dir.js';
import { fileHash, formats, formatSpec, type Format, parseFormats, run } from './render.js';
import { chromeLint, endCardSeconds, loadScript, readcheck, srt, totalDuration, sceneDuration, words, type Gate, type Script } from './script.js';

import { loadStyle, styleGate } from './styles.js';
import { narrationFiles } from './voice.js';

async function gate(id: string, name: string, work: () => Promise<string>): Promise<Gate> {
  try { return {id,name,status:'pass',detail:await work()}; }
  catch (e) { return {id,name,status:'fail',detail:(e as Error).message}; }
}
export async function motionGates(path: string): Promise<Gate[]> {
  return Promise.all([
    gate('G0','moves',async () => {
      const decoded = await run('ffmpeg',['-v','error','-i',path,'-f','null','-']);
      if (decoded.stderr.trim()) throw new Error(decoded.stderr);
      const sampled = await run('ffmpeg',['-v','error','-i',path,'-vf','fps=2,scale=64:64','-an','-f','framemd5','-']);
      const hashes = sampled.stdout.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').at(-1)?.trim());
      if (new Set(hashes).size < 2) throw new Error('Sampled frames are all identical or absent');
      return 'Clean decode and differing sampled frames';
    }),
    gate('G1','no-black',async () => {
      const {stderr} = await run('ffmpeg',['-hide_banner','-i',path,'-vf','blackdetect=d=0.1:pix_th=0.10','-an','-f','null','-']);
      if (/black_start:/.test(stderr)) throw new Error('Black segment detected');
      return 'No black segments';
    }),
    gate('G2','no-freeze',async () => {
      const {stderr} = await run('ffmpeg',['-hide_banner','-i',path,'-vf','freezedetect=n=-60dB:d=3','-an','-f','null','-']);
      const durations = [...stderr.matchAll(/freeze_duration:\s*([\d.]+)/g)].map(m => Number(m[1]));
      const starts = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)];
      const ends = [...stderr.matchAll(/freeze_end:\s*([\d.]+)/g)];
      if (durations.some(d => d > 3)) throw new Error('Frozen stretch longer than 3 seconds');
      if (starts.length > ends.length) {
        const probe = JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).stdout);
        if (Number(probe.format.duration) - Number(starts.at(-1)![1]) > 3) throw new Error('Frozen tail longer than 3 seconds');
      }
      return 'No frozen stretches longer than 3 seconds';
    }),
  ]);
}
export function endCardGate(script: Script, duration: number): Gate {
  const measured = duration - (script.titleCardSeconds ?? 0) - script.scenes.reduce((n,s) => n + s.duration,0);
  return {id:'G5',name:'end-card',status:Number.isFinite(measured) && Math.abs(measured-endCardSeconds)<=0.25 ? 'pass':'fail',detail:`Last scene boundary to file end: ${measured.toFixed(3)}s; expected ${endCardSeconds}s ±0.25`};
}
export function transcriptCoverage(script: string, transcript: string) {
  const expected = words(script), actual = new Set(words(transcript));
  return expected.length ? expected.filter(word => actual.has(word)).length / expected.length : 1;
}
export async function voiceGate(cwd: string, video: string, script: Script, narrated = true): Promise<Gate> {
  const skipped = (detail: string): Gate => ({id:'G6',name:'voice-stt',status:'skipped',detail});
  if (!narrated) return skipped('No narration in rendered audio');
  const takes = await narrationFiles(cwd,script.scenes,undefined,false);
  if (!takes.some((take,index) => take && script.scenes[index].voiceover?.trim())) return skipped('No narration in rendered audio');
  let binary: string | undefined;
  for (const name of ['whisper','whisper-cli']) {
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      const path = join(directory,name);
      try { await access(path,constants.X_OK); binary=path; break; } catch { /* Try next executable. */ }
    }
    if (binary) break;
  }
  if (!binary) return skipped('Neither whisper nor whisper-cli is on PATH');
  return gate('G6','voice-stt',async () => {
    const work = await mkdtemp(join(tmpdir(),'liftoff-stt-'));
    try {
      let offset = script.titleCardSeconds ?? 0;
      for (const [index,scene] of script.scenes.entries()) {
        const start = offset; offset += scene.duration;
        if (!takes[index] || !scene.voiceover?.trim()) continue;
        const output = join(work,`${index}`), audio = `${output}.wav`;
        await run('ffmpeg',['-y','-v','error','-ss',String(start),'-i',video,'-t',String(scene.duration),'-map','0:a:0','-vn','-ac','1','-ar','16000',audio]);
        if (binary!.endsWith('whisper-cli')) await run(binary!,['-f',audio,'-otxt','-of',output]);
        else await run(binary!,[audio,'--output_format','txt','--output_dir',work]);
        const transcript = await readFile(`${output}.txt`,'utf8');
        const coverage = transcriptCoverage(scene.voiceover,transcript);
        if (coverage < .8) throw new Error(`Scene ${index + 1}: rendered audio transcript covers ${(coverage*100).toFixed(1)}% of script words; need 80%`);
      }
      return 'Rendered audio covers at least 80% of each narrated scene in this cut';
    } finally { await rm(work,{recursive:true,force:true}); }
  });
}

export function checkProbe(probe: {format: {duration: string}; streams: {codec_type: string; width?: number; height?: number}[]}, format: Format, storyboard = false, resolution?: string) {
  const duration = Number(probe.format.duration);
  const platforms = Object.entries({'youtube-shorts':60, x:140, 'product-hunt':180}).map(([platform,maxSeconds]) => ({platform,maxSeconds,compliant:Number.isFinite(duration) && duration <= maxSeconds,required:platform === 'youtube-shorts' ? format === '9x16' : platform === 'x' ? format !== '9x16' : format === '16x9'}));
  if (!Number.isFinite(duration) || duration < (storyboard ? format === '9x16' ? 20 : 45 : 30) || (storyboard && duration > (format === '9x16' ? 35 : 60)) || platforms.some(p => p.required && !p.compliant)) throw new Error(`Duration ${duration}s invalid for ${format}: ${JSON.stringify(platforms)}`);
  const video = probe.streams.find(s => s.codec_type === 'video');
  const spec = formatSpec(format,resolution);
  if (video?.width !== spec.width || video?.height !== spec.height) throw new Error(`Incorrect resolution for ${format}`);
  return {duration, platforms, width:video.width, height:video.height, audio:probe.streams.some(s => s.codec_type === 'audio')};
}
export async function check(cwd: string, selected: Format[] = parseFormats()) {
  const dir = launchDir(cwd).video;
  const script = await loadScript(cwd,selected);
  const captions = await readFile(join(dir,'captions.srt'),'utf8');
  if (captions.trim() !== srt(script).trim()) throw new Error('Captions SRT missing or out of date');
  const style = await loadStyle(cwd,script.style);
  const distinct = style.custom ? await styleGate(cwd,style) : undefined;
  const results = [];
  for (const format of selected) {
    const path = join(dir,formats[format].file);
    const probe = JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path])).stdout);
    const modern = script.scenes.some(scene => scene.role);
    const timedScript = {...script,scenes:script.scenes.map(scene => ({...scene,duration:sceneDuration(scene,format,modern)}))};
    const timedCaptions = modern ? await readFile(join(dir,`captions-${format}.srt`),'utf8') : captions;
    const info = checkProbe(probe, format, modern, script.resolution);
    if (modern && (await readFile(join(dir, `captions-${format}.srt`), 'utf8')).trim() !== srt(timedScript).trim()) throw new Error(`Captions SRT out of date for ${format}`);
    const expected = totalDuration(script, format);
    if (Math.abs(info.duration - expected) > 0.25) throw new Error(`Rendered duration differs from script: ${path}`);
    const receipt = JSON.parse(await readFile(`${path}.json`,'utf8'));
    if (receipt.sha256 !== await fileHash(path) || receipt.script !== JSON.stringify(script)) throw new Error(`Stale video caption receipt: ${path}`);
    if (receipt.captions !== 'burned' && !probe.streams.some((s: {codec_type:string}) => s.codec_type === 'subtitle')) throw new Error(`Captions not present: ${path}`);
    let loudness: number | undefined;
    const gates = [...await motionGates(path),readcheck(timedScript,timedCaptions),chromeLint(script),endCardGate(timedScript,info.duration),await voiceGate(cwd,path,timedScript,info.audio && receipt.audio?.mode !== 'music-only')];
    if (distinct) gates.push(distinct);
    if (info.audio) gates.push(await gate('loudness','loudness',async () => {
      const {stderr} = await run('ffmpeg',['-hide_banner','-i',path,'-af','ebur128','-f','null','-']);
      const matches = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
      loudness = Number(matches.at(-1)?.[1]);
      const musicOnly = receipt.audio?.mode === 'music-only';
      if (!Number.isFinite(loudness) || (musicOnly ? loudness >= -20 : Math.abs(loudness + 14) > 2)) throw new Error(`Audio loudness ${loudness} LUFS; expected ${musicOnly ? 'quieter than -20' : '-14 ±2'}`);
      return `${loudness} LUFS (${musicOnly ? 'music-only, quieter than -20' : '-14 ±2'})`;
    }));
    else gates.push({id:'loudness',name:'loudness',status:'skipped',detail:'No audio stream'});
    results.push({format, ...info, captions:true, loudness,gates});
  }
  await writeFile(join(dir,'check.json'),JSON.stringify(results,null,2));
  const failed = results.flatMap(result => result.gates.filter(g => g.status === 'fail').map(g => `${result.format} ${g.id} ${g.name}: ${g.detail}`));
  if (failed.length) throw new Error(`Failed video gates: ${failed.join('; ')}`);
  return results;
}
