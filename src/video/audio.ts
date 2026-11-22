import { join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { optionalJson } from '../media/assets.js';
import { run } from './render.js';

export async function mixAudio(cwd: string, work: string, silent: string, output: string, durations: number[], voices: (string | undefined)[], music?: string) {
  const duration = durations.reduce((sum, value) => sum + value, 3);
  const config = await optionalJson(launchDir(cwd).config);
  const kit = config.brandKit ? await optionalJson(resolve(cwd, config.brandKit)) : {};
  const source = music ?? kit.music;
  const bed = join(work, 'music.wav');
  const inputs = source ? ['-stream_loop', '-1', '-i', resolve(cwd, source)] : ['-f', 'lavfi', '-i', 'aevalsrc=0.12*(sin(2*PI*130.8128*t)+sin(2*PI*164.8138*t)+sin(2*PI*195.9977*t)):s=48000'];
  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-t', String(duration), '-af', `lowpass=f=700,afade=t=in:d=1,afade=t=out:st=${Math.max(0, duration - 1.5)}:d=1.5,loudnorm=I=-30:TP=-6:LRA=7`, '-ar', '48000', '-ac', '2', bed]);
  const args = ['-i', silent, '-i', bed]; const filters: string[] = [];
  let count = 0; let offset = 0;
  voices.forEach((voice, index) => {
    if (voice) {
      args.push('-i', resolve(cwd, voice)); count++;
      filters.push(`[${count + 1}:a]atrim=0:${durations[index]},asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-2:LRA=7,adelay=${Math.round(offset * 1000)}:all=1[v${count}]`);
    }
    offset += durations[index];
  });
  if (count) filters.push(`${Array.from({ length: count }, (_, index) => `[v${index + 1}]`).join('')}amix=inputs=${count}:normalize=0,apad,atrim=0:${duration}[vo]`, '[1:a][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=7[a]');
  else filters.push('[1:a]loudnorm=I=-26:TP=-3:LRA=7[a]');
  await run('ffmpeg', ['-y', '-v', 'error', ...args, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[a]', '-t', String(duration), '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-metadata', 'artist=Aditya', output]);
  return { mode: count ? 'voiceover' as const : 'music-only' as const, music: String(source ?? 'generated-pad'), targetLUFS: count ? -14 : -26 };
}
