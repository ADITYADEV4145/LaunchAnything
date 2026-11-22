import type { Command } from 'commander';
import { printEstimate } from '../adopt/estimate.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { launchDir } from '../core/launch-dir.js';
import { doctor } from '../core/doctor.js';
import { loadScript, media, productName, readcheck, shots, scriptFromShots } from '../video/script.js';
import { render, parseFormats } from '../video/render.js';
import { check } from '../video/check.js';
import { record } from '../video/record.js';
import { voice } from '../video/voice.js';
import { checkStyles, forkStyle, listStyles, stylesGallery } from '../video/styles.js';

export function register(program: Command) {
  const video = program.command('video').description('Render grounded demo footage').option('--renderer <renderer>','auto, remotion or ffmpeg','auto').option('--format <formats>','Comma-separated aspect ratios','16x9,9x16,1x1').option('--music <file>', 'Local music bed');
  const action = (cmd: Command, name: string, work: (cwd:string, opts:Record<string,string>) => Promise<unknown>) => {
    cmd.action(async () => {
      const opts = commandOptions(cmd);
      try { printEstimate(opts.cwd ?? process.cwd(), 'video', opts.json, parseFormats(cmd.optsWithGlobals().format).length); output(`video ${name}`,await work(opts.cwd ?? process.cwd(),cmd.optsWithGlobals()),opts.json); }
      catch (e) { output(`video ${name}`,undefined,opts.json,(e as Error).message); }
    });
  };
  action(video,'',async (cwd,opts) => { const selected = parseFormats(opts.format); const result = await render(cwd,opts.renderer,selected,{music:opts.music}); return {...result,checks:await check(cwd,selected)}; });
  const styles = video.command('styles').description('List video styles and write a still-frame gallery').option('--fork <id>', 'Copy a style locally').option('--as <id>', 'New local style id');
  action(styles,'styles',async (cwd,opts) => {
    if (opts.fork || opts.as) { if (!opts.fork || !opts.as) throw new Error('Use --fork <id> --as <new> together'); return forkStyle(cwd,opts.fork,opts.as); }
    return stylesGallery(cwd);
  });
  action(styles.command('check'),'styles check',async cwd => checkStyles(cwd));
  action(video.command('voice').option('--dry-run', 'Print requests without contacting ElevenLabs or writing files'),'voice',async (cwd, opts) => voice(cwd, {dryRun:Boolean(opts.dryRun)}));
  action(video.command('script').option('--from-shots', 'Write a script from storyboard captures').description('Print agent brief and validate an existing script'),'script',async (cwd, opts) => {
    if (opts.fromShots) { const script = await scriptFromShots(cwd); return {script,valid:true,readcheck:readcheck(script)}; }
    const brief = {styles:(await listStyles(cwd)).map(({id,name,summary,pacing}) => ({id,name,summary,pacing})), defaultStyle:'midnight', product:await productName(cwd), shots:await shots(cwd), media:await media(cwd), capabilities:await doctor(cwd), rules:'Agent: choose optional script.style from the available styles; midnight is the unchanged default. Respect its pacing. Prefer video script --from-shots for storyboards (45–60s long, 20–35s short, hook first and at most 3s). Legacy scripts use 6–10 scenes, shot, text (1–8 words), duration, optional voiceover; total 30–60s including the 3s end card. Use real captured or polished product media. Only explicit video voice can call ElevenLabs; preview with --dry-run. Local voice files go in .launch/video/vo/<zero-based scene index>.wav or .mp3. Credit only Aditya.'};
    try { await readFile(join(launchDir(cwd).video,'script.json')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {brief,valid:null}; throw e; }
    try { const script = await loadScript(cwd,parseFormats(opts.format)); return {brief,valid:true,script,readcheck:readcheck(script)}; }
    catch (e) { throw new Error(`${(e as Error).message}\nAgent brief: ${JSON.stringify(brief)}`); }
  });
  action(video.command('record').requiredOption('--url <base>','Application base URL'),'record',async (cwd,opts) => record(cwd,opts.url));
  action(video.command('render'),'render',async (cwd,opts) => render(cwd,opts.renderer,parseFormats(opts.format),{music:opts.music}));
  action(video.command('check'),'check',async (cwd,opts) => check(cwd,parseFormats(opts.format)));
}
