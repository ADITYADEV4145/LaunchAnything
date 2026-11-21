import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { endCardSeconds, loadScript, productName, resolveShot, srt, totalDuration } from './script.js';

const exec = promisify(execFile);
export async function run(binary: string, args: string[], cwd?: string) {
  try { return await exec(binary, args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 240000 }); }
  catch (e) { const err = e as Error & {stderr?: string}; throw new Error(`${binary}: ${err.stderr?.slice(-2500) || err.message}`); }
}
export const formats = {
  '16x9': { width: 1280, height: 720, file: 'demo-16x9.mp4', composition: 'Demo' },
  '9x16': { width: 720, height: 1280, file: 'short-9x16.mp4', composition: 'Short' },
  '1x1': { width: 720, height: 720, file: 'square-1x1.mp4', composition: 'Square' },
} as const;
export type Format = keyof typeof formats;
export function parseFormats(value = '16x9,9x16,1x1'): Format[] {
  const selected = [...new Set(value.split(','))];
  if (!selected.length || selected.some(f => !(f in formats))) throw new Error('Format must be 16x9,9x16,1x1');
  return selected as Format[];
}
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
export async function fileHash(path: string) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
export async function remotionCli(cwd: string): Promise<string | undefined> {
  cwd = resolve(cwd);
  try { return createRequire(join(cwd, 'package.json')).resolve('@remotion/cli/remotion-cli.js'); }
  catch {
    const local = join(cwd, 'node_modules', '.bin', 'remotion');
    if (await exists(local)) return realpath(local);
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      const binary = join(dir,'remotion');
      if (await exists(binary)) return realpath(binary);
    }
  }
}
export async function render(cwd: string, renderer = 'auto', selected: Format[] = parseFormats()) {
  if (!['auto','remotion','ffmpeg'].includes(renderer)) throw new Error('Renderer must be auto, remotion or ffmpeg');
  const script = await loadScript(cwd);
  const dir = launchDir(cwd).video;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'captions.srt'), srt(script));
  const cli = renderer === 'ffmpeg' ? undefined : await remotionCli(cwd);
  if (renderer === 'remotion' && !cli) throw new Error('Remotion is not installed. Install templates/video/remotion dependencies locally or use --renderer ffmpeg.');
  const chosen = cli ? 'remotion' : 'ffmpeg';
  const work = await mkdtemp(join(tmpdir(), 'liftoff-video-'));
  const name = await productName(cwd);
  let logo: string | undefined;
  for (const ext of ['png','jpg','jpeg','webp','svg']) {
    const source = join(launchDir(cwd).media,`logo.${ext}`);
    if (await exists(source)) { logo = source; break; }
  }
  const paths = await Promise.all(script.scenes.map(s => resolveShot(cwd, s.shot)));
  const voices = await Promise.all(script.scenes.map(async (_, i) => {
    for (const ext of ['wav','mp3']) { const path = join(dir, 'vo', `${i}.${ext}`); if (await exists(path)) return path; }
    return undefined;
  }));
  try {
    let entry = '';
    if (cli) {
      await cp(join(packageRoot(), 'templates/video/remotion'), work, { recursive: true });
      // Resolve dependencies from the installation providing the CLI, not the temporary project.
      const modules = cli.includes('node_modules') ? cli.slice(0, cli.lastIndexOf('node_modules') + 'node_modules'.length) : join(cwd, 'node_modules');
      await symlink(modules, join(work, 'node_modules'), 'dir');
      await mkdir(join(work, 'public'), { recursive: true });
      const scenes = await Promise.all(script.scenes.map(async (s, i) => {
        const ext = paths[i].split('.').pop();
        await cp(paths[i], join(work, 'public', `${i}.${ext}`));
        return { ...s, src: `${i}.${ext}` };
      }));
      const logoFile = logo ? `logo.${logo.split('.').pop()}` : undefined;
      if (logo && logoFile) await cp(logo,join(work,'public',logoFile));
      await writeFile(join(work, 'props.json'), JSON.stringify({scenes, name, logo:logoFile, endCardSeconds}));
      entry = join(work, 'src', 'index.tsx');
    }
    for (const format of selected) {
      const spec = formats[format];
      const silent = join(work, `${format}.mp4`);
      if (cli) {
        await run(cli, ['render', entry, spec.composition, silent, '--props', join(work, 'props.json'), '--concurrency', '2', '--log', 'error', '--codec', 'h264'], work);
      } else {
        const pieces: string[] = [];
        let elapsed = 0;
        for (const [i, scene] of script.scenes.entries()) {
          const startFrame = Math.round(elapsed * 12);
          elapsed += scene.duration;
          const duration = (Math.round(elapsed * 12) - startFrame) / 12;
          const caption = join(work, 'caption.txt');
          await writeFile(caption, scene.text);
          const piece = join(work, `${format}-${i}.mp4`);
          const video = /\.(webm|mp4)$/i.test(paths[i]);
          const camera = video ? `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2` : `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},zoompan=z='min(zoom+0.0005,1.08)':x='iw/2-iw/zoom/2+sin(on/80)*10':y='ih/2-ih/zoom/2':d=1:s=${spec.width}x${spec.height}:fps=12`;
          await run('ffmpeg', ['-y','-v','error','-threads','2', ...(video ? ['-stream_loop','-1'] : ['-loop','1','-framerate','12']), '-i', paths[i], '-t', String(duration), '-vf', `${camera},drawtext=textfile=${caption}:expansion=none:fontcolor=white:fontsize=28:box=1:boxcolor=black@0.7:boxborderw=12:x=(w-tw)/2:y=h-th-60`, '-an','-r','12','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-threads','2',piece]);
          pieces.push(piece);
        }
        const title = join(work,'title.txt');
        await writeFile(title,name);
        const endCard = join(work,`${format}-end.mp4`);
        const fontSize = Math.min(48,Math.floor((spec.width-80)/Math.max(1,name.length*0.65)));
        const text = `drawtext=textfile=${title}:expansion=none:fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${logo ? 'h/2+100' : '(h-th)/2'}`;
        const filter = logo ? `[1:v]scale=160:160:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:H/2-h-20,${text}[out]` : `[0:v]${text}[out]`;
        await run('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=0x101725:s=${spec.width}x${spec.height}:r=12`,...(logo ? ['-loop','1','-i',logo] : []),'-filter_complex',filter,'-map','[out]','-t',String(endCardSeconds),'-an','-r','12','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-threads','2',endCard]);
        pieces.push(endCard);
        const list = join(work, 'concat.txt');
        await writeFile(list, pieces.map(p => `file '${p}'`).join('\n'));
        await run('ffmpeg', ['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
      }
      const output = join(dir, spec.file);
      const audioArgs: string[] = [];
      const filters: string[] = [];
      let offset = 0; let count = 0;
      voices.forEach((voice, i) => {
        if (voice) {
          audioArgs.push('-i', voice); count++;
          filters.push(`[${count}:a]atrim=0:${script.scenes[i].duration},asetpts=PTS-STARTPTS,adelay=${Math.round(offset * 1000)}:all=1[a${count}]`);
        }
        offset += script.scenes[i].duration;
      });
      if (count) {
        filters.push(`${Array.from({length:count}, (_,i) => `[a${i+1}]`).join('')}amix=inputs=${count}:normalize=0,apad,atrim=0:${totalDuration(script)},loudnorm=I=-14:TP=-1:LRA=11[a]`);
        await run('ffmpeg', ['-y','-v','error','-i',silent,...audioArgs,'-filter_complex',filters.join(';'),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-metadata','artist=Aditya',output]);
      } else await cp(silent, output);
      await writeFile(join(dir, `${spec.file}.json`), JSON.stringify({format, captions:'burned', sha256:await fileHash(output), script:JSON.stringify(script), renderer:chosen, duration:totalDuration(script), author:'Aditya'}));
    }
    return { renderer: chosen, files: selected.map(f => join(dir, formats[f].file)), captions:join(dir,'captions.srt') };
  } finally { await rm(work, { recursive:true, force:true }); }
}
