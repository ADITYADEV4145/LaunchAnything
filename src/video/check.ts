import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { fileHash, formats, type Format, parseFormats, run } from './render.js';
import { loadScript, srt } from './script.js';

export function checkProbe(probe: {format: {duration: string}; streams: {codec_type: string; width?: number; height?: number}[]}, format: Format) {
  const duration = Number(probe.format.duration);
  const max = format === '9x16' ? 60 : format === '16x9' ? 180 : 140;
  if (!Number.isFinite(duration) || duration < 30 || duration > max + 0.15) throw new Error(`Duration ${duration}s invalid for ${format} (30–${max}s)`);
  const video = probe.streams.find(s => s.codec_type === 'video');
  if (video?.width !== formats[format].width || video?.height !== formats[format].height) throw new Error(`Incorrect resolution for ${format}`);
  return {duration, width:video.width, height:video.height, audio:probe.streams.some(s => s.codec_type === 'audio')};
}
export async function check(cwd: string, selected: Format[] = parseFormats()) {
  const dir = launchDir(cwd).video;
  const script = await loadScript(cwd);
  if ((await readFile(join(dir,'captions.srt'),'utf8')).trim() !== srt(script).trim()) throw new Error('Captions SRT missing or out of date');
  const results = [];
  for (const format of selected) {
    const path = join(dir,formats[format].file);
    const probe = JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path])).stdout);
    const info = checkProbe(probe, format);
    const expected = script.scenes.reduce((n,s) => n+s.duration,0);
    if (Math.abs(info.duration - expected) > 0.25) throw new Error(`Rendered duration differs from script: ${path}`);
    const receipt = JSON.parse(await readFile(`${path}.json`,'utf8'));
    if (receipt.sha256 !== await fileHash(path) || receipt.script !== JSON.stringify(script)) throw new Error(`Stale video caption receipt: ${path}`);
    if (receipt.captions !== 'burned' && !probe.streams.some((s: {codec_type:string}) => s.codec_type === 'subtitle')) throw new Error(`Captions not present: ${path}`);
    let loudness: number | undefined;
    if (info.audio) {
      const {stderr} = await run('ffmpeg',['-hide_banner','-i',path,'-af','ebur128','-f','null','-']);
      const matches = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
      loudness = Number(matches.at(-1)?.[1]);
      if (!Number.isFinite(loudness) || Math.abs(loudness + 14) > 2) throw new Error(`Audio loudness ${loudness} LUFS; expected -14 ±2`);
    }
    results.push({format, ...info, captions:true, loudness});
  }
  return results;
}
