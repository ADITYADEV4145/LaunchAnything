import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { launchDir } from '../core/launch-dir.js';
import { doctor } from '../core/doctor.js';
import { loadScript, media, productName, shots } from '../video/script.js';
import { render, parseFormats } from '../video/render.js';
import { check } from '../video/check.js';
import { record } from '../video/record.js';

export function register(program: Command) {
  const video = program.command('video').description('Render grounded demo footage').option('--renderer <renderer>','auto, remotion or ffmpeg','auto').option('--format <formats>','Comma-separated aspect ratios','16x9,9x16,1x1');
  const action = (cmd: Command, name: string, work: (cwd:string, opts:Record<string,string>) => Promise<unknown>) => {
    cmd.action(async () => {
      const opts = commandOptions(cmd);
      try { output(`video ${name}`,await work(opts.cwd ?? process.cwd(),cmd.optsWithGlobals()),opts.json); }
      catch (e) { output(`video ${name}`,undefined,opts.json,(e as Error).message); }
    });
  };
  action(video,'',async (cwd,opts) => { const selected = parseFormats(opts.format); const result = await render(cwd,opts.renderer,selected); return {...result,checks:await check(cwd,selected)}; });
  action(video.command('script').description('Print agent brief and validate an existing script'),'script',async cwd => {
    const brief = {product:await productName(cwd), shots:await shots(cwd), media:await media(cwd), capabilities:await doctor(cwd), rules:'Agent: write .launch/video/script.json with 6–10 scenes, shot, text (1–8 words), duration in seconds, optional voiceover. Total 30–60 seconds. Use only captured media, never generated images. No LLM/TTS calls are made by the CLI. Optional TTS MCP audio goes in .launch/video/vo/<zero-based scene index>.wav or .mp3. Credit only Aditya.'};
    try { await readFile(join(launchDir(cwd).video,'script.json')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {brief,valid:null}; throw e; }
    try { return {brief,valid:true,script:await loadScript(cwd)}; }
    catch (e) { throw new Error(`${(e as Error).message}\nAgent brief: ${JSON.stringify(brief)}`); }
  });
  action(video.command('record').requiredOption('--url <base>','Application base URL'),'record',async (cwd,opts) => record(cwd,opts.url));
  action(video.command('render'),'render',async (cwd,opts) => render(cwd,opts.renderer,parseFormats(opts.format)));
  action(video.command('check'),'check',async (cwd,opts) => check(cwd,parseFormats(opts.format)));
}
