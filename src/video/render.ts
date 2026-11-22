import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, delimiter, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { endCardSeconds, loadScript, resolveShot, srt, totalDuration, sceneDuration } from './script.js';
import { renderClip } from './clip.js';
import { branding, endAsset, frameLayout, sceneAssets } from './design.js';
import { detectContent } from './crop.js';
import { narrationFiles } from './voice.js';
import { loadStyle, motionFilter } from './styles.js';
import { brandVideo } from './brand.js';
import { assertNarrationFits } from './audio.js';

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
export function formatSpec(format: Format, resolution?: string) {
  if (resolution && !['720p','1080p'].includes(resolution)) throw new Error('Resolution must be 720p or 1080p');
  const spec = formats[format];
  return resolution === '1080p' ? {...spec,width:Math.round(spec.width*1.5),height:Math.round(spec.height*1.5)} : spec;
}
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
export async function render(cwd: string, renderer = 'auto', selected: Format[] = parseFormats(), options: { music?: string } = {}) {
  if (!['auto','remotion','ffmpeg'].includes(renderer)) throw new Error('Renderer must be auto, remotion or ffmpeg');
  const script = await loadScript(cwd,selected);
  const style = await loadStyle(cwd,script.style);
  const dir = launchDir(cwd).video;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'captions.srt'), srt(script));
  if (script.scenes.some(scene => scene.role) || options.music) {
    const voices = await narrationFiles(cwd, script.scenes);
    const results = [];
    for (const format of selected) {
      const scenes = await Promise.all(script.scenes.map(async scene => ({ role: scene.role, caption: scene.text, source: await resolveShot(cwd, scene.shot), duration: sceneDuration(scene, format, script.scenes.some(scene => scene.role)), highlight: scene.highlight })));
      const result = await renderClip(cwd, scenes, { format, renderer: renderer as 'auto' | 'ffmpeg' | 'remotion', voice: voices, music: options.music, style:script.style, title:script.title, tagline:script.tagline, resolution:script.resolution });
      await writeFile(`${result.file}.json`, JSON.stringify({ ...result.receipt, script: JSON.stringify(script) }, null, 2));
      await writeFile(join(dir, `captions-${format}.srt`), srt({ ...script, scenes: script.scenes.map(scene => ({ ...scene, duration: sceneDuration(scene, format, script.scenes.some(scene => scene.role)) })) }));
      results.push(result);
    }
    return { renderer: results[0]?.receipt.renderer ?? renderer, files: results.map(result => result.file), captions: join(dir, 'captions.srt') };
  }
  const cli = renderer === 'ffmpeg' ? undefined : await remotionCli(cwd);
  if (renderer === 'remotion' && !cli) throw new Error('Remotion is not installed. Install templates/video/remotion dependencies locally or use --renderer ffmpeg.');
  const chosen = cli ? 'remotion' : 'ffmpeg';
  const work = await mkdtemp(join(tmpdir(), 'liftoff-video-'));
  const brand = await branding(cwd);
  let logo: string | undefined;
  for (const ext of ['png','jpg','jpeg','webp','svg']) {
    const source = join(launchDir(cwd).media,`logo.${ext}`);
    if (await exists(source)) { logo = source; break; }
  }
  const paths = await Promise.all(script.scenes.map(s => resolveShot(cwd, s.shot)));
  const voices = await narrationFiles(cwd,script.scenes,undefined,false);
  try {
    await assertNarrationFits(cwd,script.scenes.map(scene=>scene.duration),voices);
    const dimensions = await Promise.all(paths.map(async path => JSON.parse((await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path])).stdout).streams[0] as {width:number;height:number}));
    let terminal = false;
    try { terminal = JSON.parse(await readFile(join(launchDir(cwd).media,'manifest.json'),'utf8')).frame === 'terminal'; } catch { /* Ordinary captures use browser or phone framing. */ }
    let shotManifest:{kind:string;files:string[]}[]=[];
    try { shotManifest=JSON.parse(await readFile(join(launchDir(cwd).media,'shots','manifest.json'),'utf8')); } catch { /* Phase-3 captures are optional. */ }
    const terminals=paths.map(path=>terminal || shotManifest.some(shot=>shot.kind==='terminal' && shot.files.some(file=>join(launchDir(cwd).media,'shots',file)===path)));
    const focused=await Promise.all(paths.map(async (path,i)=>{
      const {width,height}=dimensions[i];
      if (terminals[i] || height/width>1.5 || selected.every(f=>formats[f].width>formats[f].height)) return;
      const crop=await detectContent(path,width,height);
      if (!crop) return;
      const video=/\.(mp4|webm)$/i.test(path),target=join(work,`focus-${i}.${video?'webm':'png'}`);
      await run('ffmpeg',['-y','-v','error','-i',path,'-vf',`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,...(video?['-an','-c:v','libvpx-vp9','-crf','28','-b:v','0','-cpu-used','8']:['-frames:v','1']),'-threads','1',target]);
      return {path:target,crop};
    }));
    const assets: Record<string,{plate:string;caption:string;source:string;frame:ReturnType<typeof frameLayout>}[]> = {};
    const endCards: Record<string,string> = {};
    const png = async (source:string) => {
      const target = source.replace(/\.svg$/,'.png');
      await run('ffmpeg',['-y','-v','error','-i',source,'-frames:v','1','-threads','1',target]);
      return target;
    };
    for (const format of selected) {
      const {width,height} = formatSpec(format,script.resolution);
      assets[format] = [];
      for (const [i,scene] of script.scenes.entries()) {
        const focus=width<=height?focused[i]:undefined;
        const frame=frameLayout(width,height,dimensions[i].width,dimensions[i].height,terminals[i],focus?.crop);
        const source=await sceneAssets(work,`${format}-${i}`,width,height,frame,brand,scene.text,i,script.scenes.length,style);
        assets[format].push({plate:await png(source.platePath),caption:await png(source.captionPath),source:focus?.path??paths[i],frame});
      }
      endCards[format] = await png(await endAsset(work,format,width,height,brand,logo,style));
    }
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
        const layouts: Record<string,unknown> = {};
        for (const format of selected) {
          const asset=assets[format][i];
          for (const file of [asset.plate,asset.caption]) await cp(file,join(work,'public',basename(file)));
          const src=`${format}-${i}.${asset.source.split('.').pop()}`;
          await cp(asset.source,join(work,'public',src));
          const spec = formatSpec(format,script.resolution);
          layouts[`${spec.width}x${spec.height}`]={...asset,src,plate:basename(asset.plate),caption:basename(asset.caption)};
        }
        return { ...s, src: `${i}.${ext}`, layouts };
      }));
      const endLayouts: Record<string,string> = {};
      for (const format of selected) {
        await cp(endCards[format],join(work,'public',basename(endCards[format])));
        const spec = formatSpec(format,script.resolution);
        endLayouts[`${spec.width}x${spec.height}`]=basename(endCards[format]);
      }
      await writeFile(join(work, 'props.json'), JSON.stringify({scenes, endCards:endLayouts, endCardSeconds, style, resolution:script.resolution}));
      entry = join(work, 'src', 'index.tsx');
    }
    for (const format of selected) {
      const spec = formatSpec(format,script.resolution);
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
          const piece = join(work, `${format}-${i}.mp4`);
          const video = /\.(webm|mp4)$/i.test(paths[i]);
          const {frame,plate,caption,source}=assets[format][i];
          const innerW=Math.floor(frame.width*.96/2)*2,innerH=Math.floor(frame.height*.96/2)*2;
          const camera=`scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,pad=${frame.width}:${frame.height}:(ow-iw)/2:(oh-ih)/2:color=${frame.kind==='terminal'?'0x111b30':'white'},zoompan=z='1+0.015*on/${Math.max(1,duration*12)}':x='iw/2-iw/zoom/2':y=0:d=1:s=${frame.width}x${frame.height}:fps=12`;
          const detail=frame.detail;
          const footage=detail?`[1:v]fps=12,split[full][detail];[full]${camera}[shot];[detail]crop=iw:ih*${detail.fraction}:0:0,scale=${detail.width}:${detail.height}[inset];[0:v][inset]overlay=${detail.x}:${detail.y}[plate]`:`[1:v]fps=12,${camera}[shot]`;
          const filter=`${footage};[${detail?'plate':'0:v'}][shot]overlay=${frame.x}:${frame.y}[base];[2:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=${Math.max(0,duration-.25)}:d=0.25:alpha=1[caption];[base][caption]overlay,${motionFilter(style,spec.width,spec.height,duration)}[out]`;
          await run('ffmpeg',['-y','-v','error','-filter_complex_threads','2','-loop','1','-framerate','12','-i',plate,...(video?['-stream_loop','-1']:['-loop','1','-framerate','12']),'-i',source,'-loop','1','-framerate','12','-i',caption,'-filter_complex',filter,'-map','[out]','-t',String(duration),'-an','-r','12','-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-threads','2',piece]);
          pieces.push(piece);
        }
        const endCard = join(work,`${format}-end.mp4`);
        await run('ffmpeg',['-y','-v','error','-loop','1','-framerate','12','-i',endCards[format],'-t',String(endCardSeconds),'-an','-r','12','-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-threads','2',endCard]);
        pieces.push(endCard);
        const list = join(work, 'concat.txt');
        await writeFile(list, pieces.map(p => `file '${p}'`).join('\n'));
        await run('ffmpeg', ['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
      }
      const output = join(dir, spec.file);
      const branded = await brandVideo(cwd,work,silent,spec.width,spec.height,script);
      const audioArgs: string[] = [];
      const filters: string[] = [];
      let offset = script.titleCardSeconds ?? 0; let count = 0;
      voices.forEach((voice, i) => {
        if (voice) {
          audioArgs.push('-i', voice); count++;
          filters.push(`[${count}:a]asetpts=PTS-STARTPTS,adelay=${Math.round(offset * 1000)}:all=1[a${count}]`);
        }
        offset += script.scenes[i].duration;
      });
      if (count) {
        filters.push(`${Array.from({length:count}, (_,i) => `[a${i+1}]`).join('')}amix=inputs=${count}:normalize=0,apad,atrim=0:${totalDuration(script)},loudnorm=I=-14:TP=-1:LRA=11[a]`);
        await run('ffmpeg', ['-y','-v','error','-i',branded,...audioArgs,'-filter_complex',filters.join(';'),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-metadata','artist=Aditya',output]);
      } else await cp(branded, output);
      await writeFile(join(dir, `${spec.file}.json`), JSON.stringify({format, captions:'burned', sha256:await fileHash(output), script:JSON.stringify(script), renderer:chosen, duration:totalDuration(script), author:'Aditya'}));
    }
    return { renderer: chosen, files: selected.map(f => join(dir, formats[f].file)), captions:join(dir,'captions.srt') };
  } finally { await rm(work, { recursive:true, force:true }); }
}
