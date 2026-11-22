import { afterEach, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { voice } from '../src/video/voice.js';
import { formatSpec, render, run } from '../src/video/render.js';
import { renderClip } from '../src/video/clip.js';
import { validateScript, srt, totalDuration } from '../src/video/script.js';
import { checkProbe, endCardGate } from '../src/video/check.js';
import { assertNarrationFits } from '../src/video/audio.js';

const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true}))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(),'brand-voice-')); dirs.push(cwd);
  await mkdir(join(cwd,'.launch/media'),{recursive:true});
  await mkdir(join(cwd,'.launch/video'),{recursive:true});
  await writeFile(join(cwd,'.launch/product.json'),JSON.stringify({name:'Orbit',oneLiner:'Find your next change'}));
  const png = new PNG({width:320,height:200}); png.data.fill(90);
  for (let i=3;i<png.data.length;i+=4) png.data[i]=255;
  await writeFile(join(cwd,'.launch/media/capture.png'),PNG.sync.write(png));
  const script = {scenes:Array.from({length:6},()=>({shot:'capture.png',text:'Find the source',duration:4.5,voiceover:'Find the source'}))};
  await writeFile(join(cwd,'.launch/video/script.json'),JSON.stringify(script));
  return {cwd,script};
}
async function stubPiper(cwd: string, body = `process.stdin.resume();process.stdin.on('end',()=>require('fs').writeFileSync(process.argv[process.argv.indexOf('--output_file')+1],'RIFF stub audio'));`) {
  const binary = join(cwd,'piper-stub');
  await writeFile(binary,`#!${process.execPath}\n${body}\n`); await chmod(binary,0o755);
  const model = join(cwd,'english.onnx'); await writeFile(model,'model'); await writeFile(model+'.json','{}');
  vi.stubEnv('ELEVENLABS_API_KEY',''); vi.stubEnv('LIFTOFF_PIPER_BIN',binary); vi.stubEnv('LIFTOFF_PIPER_MODEL',model);
  return {binary,model};
}
it('synthesizes indexed local voice takes, records model provenance and removes stale mp3s',async()=>{
  const {cwd}=await fixture(); await stubPiper(cwd);
  const dir=join(cwd,'.launch/video/vo'); await mkdir(dir); await writeFile(join(dir,'0.mp3'),'stale');
  const plan=await voice(cwd,{dryRun:true}); expect(plan).toMatchObject({mode:'dry-run',engine:'piper',model:'english.onnx',files:[]});
  expect(await readdir(dir)).toEqual(['0.mp3']);
  const result=await voice(cwd); expect(result.files).toHaveLength(6);
  expect(result).toMatchObject({mode:'voiceover',engine:'piper',model:'english.onnx'});
  expect(await readFile(result.files[0],'utf8')).toBe('RIFF stub audio');
  expect(await readdir(dir)).not.toContain('0.mp3');
  expect(JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'))).toMatchObject({engine:'piper',model:'english.onnx'});
});
it('handles no narration and no local configuration without contacting a service',async()=>{
  const {cwd,script}=await fixture(); await stubPiper(cwd);
  await writeFile(join(cwd,'.launch/video/script.json'),JSON.stringify({...script,scenes:script.scenes.map(({voiceover,...scene})=>scene)}));
  expect(await voice(cwd)).toMatchObject({engine:'piper',requests:[],files:[]});
  vi.stubEnv('LIFTOFF_PIPER_MODEL','');
  expect(await voice(cwd)).toMatchObject({mode:'captions-only',requests:[],files:[]});
});
it('fails clearly for missing models, missing binaries and failed or empty local synthesis',async()=>{
  const {cwd}=await fixture(); const {model}=await stubPiper(cwd);
  vi.stubEnv('LIFTOFF_PIPER_MODEL',join(cwd,'absent.onnx')); await expect(voice(cwd)).rejects.toThrow();
  vi.stubEnv('LIFTOFF_PIPER_MODEL',model); vi.stubEnv('LIFTOFF_PIPER_BIN',join(cwd,'absent')); await expect(voice(cwd)).rejects.toThrow('binary is unavailable');
  await stubPiper(cwd,`process.stderr.write('model failed');process.exit(2);`); await expect(voice(cwd)).rejects.toThrow('Piper synthesis failed (2)');
  await stubPiper(cwd,`require('fs').writeFileSync(process.argv[process.argv.indexOf('--output_file')+1],'');`); await expect(voice(cwd)).rejects.toThrow('empty audio');
  expect(await readdir(join(cwd,'.launch/video/vo'))).toEqual([]);
});

async function logo(cwd: string) {
  await writeFile(join(cwd,'.launch/media/logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ff00cc"/></svg>');
}
async function frame(cwd: string, video: string, seconds: number) {
  const path=join(cwd,`frame-${seconds}.png`);
  await run('ffmpeg',['-y','-v','error','-ss',String(seconds),'-i',video,'-frames:v','1','-threads','1',path]);
  return PNG.sync.read(await readFile(path));
}
function pink(png: PNG,x: number,y: number) { const i=(Math.floor(y)*png.width+Math.floor(x))*4; return png.data[i]>200 && png.data[i+1]<60 && png.data[i+2]>140; }
it('accounts for the conditional title card in duration limits, captions and the end-card gate',async()=>{
  const {cwd,script}=await fixture();
  expect(totalDuration(await validateScript(cwd,script))).toBe(30);
  await logo(cwd);
  const validated=await validateScript(cwd,script);
  expect(totalDuration(validated)).toBe(32.5);
  expect(srt(validated)).toContain('00:00:02,500 --> 00:00:07,000');
  expect(endCardGate(validated,32.5).status).toBe('pass');
  await expect(validateScript(cwd,{...script,scenes:script.scenes.map(scene=>({...scene,duration:9.5}))})).rejects.toThrow('title card');
});
it('renders a large SVG logo title and corner watermark throughout legacy and clip footage',async()=>{
  const {cwd,script}=await fixture(); await logo(cwd);
  await writeFile(join(cwd,'.launch/video/script.json'),JSON.stringify({...script,title:'Custom title',tagline:'Custom tagline'}));
  const result=await render(cwd,'ffmpeg',['1x1']);
  const title=await frame(cwd,result.files[0],1);
  expect(pink(title,360,240)).toBe(true);
  expect(pink(title,680,40)).toBe(true);
  for (const second of [3,8,13,18,23,26]) {
    const scene=await frame(cwd,result.files[0],second);
    expect(pink(scene,680,40)).toBe(true);
  }
  const probe=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',result.files[0]])).stdout);
  expect(Number(probe.format.duration)).toBeCloseTo(32.5,1);
  const clip=await renderClip(cwd,[{caption:'Find the source',source:'.launch/media/capture.png',duration:1}],{renderer:'ffmpeg',format:'1x1'});
  expect(clip.duration).toBe(6.5);
  expect(pink(await frame(cwd,clip.file,3),680,40)).toBe(true);
  await writeFile(join(cwd,'.launch/media/logo.svg'),'invalid SVG');
  await expect(renderClip(cwd,[{caption:'Find the source',source:'.launch/media/capture.png',duration:1}],{renderer:'ffmpeg'})).rejects.toThrow();
},120000);
it('supports native 1080p composition and validates the requested output resolution',async()=>{
  const {cwd}=await fixture();
  expect(formatSpec('16x9','1080p')).toMatchObject({width:1920,height:1080});
  expect(()=>formatSpec('16x9','invalid')).toThrow('Resolution');
  const clip=await renderClip(cwd,[{caption:'Find the source',source:'.launch/media/capture.png',duration:1}],{renderer:'ffmpeg',resolution:'1080p'});
  const probe=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',clip.file])).stdout);
  expect(probe.streams[0]).toMatchObject({width:1920,height:1080});
  probe.format.duration='45';
  expect(checkProbe(probe,'16x9',false,'1080p')).toMatchObject({width:1920,height:1080});
  expect(()=>checkProbe(probe,'16x9')).toThrow('Incorrect resolution');
},120000);
it('rejects overlong narration instead of trimming speech, including clips and legacy videos',async()=>{
  const {cwd}=await fixture(); const audio=join(cwd,'long.wav');
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=5',audio]);
  await expect(assertNarrationFits(cwd,[2],[audio])).rejects.toThrow('extend the scene duration');
  await expect(assertNarrationFits(cwd,[5],[audio])).resolves.toBeUndefined();
  await expect(assertNarrationFits(cwd,[],[])).resolves.toBeUndefined();
  await expect(assertNarrationFits(cwd,[5],[join(cwd,'missing.wav')])).rejects.toThrow();
  await expect(renderClip(cwd,[{caption:'Find the source',source:'.launch/media/capture.png',duration:2}],{renderer:'ffmpeg',voice:[audio]})).rejects.toThrow('extend the scene duration');
  await mkdir(join(cwd,'.launch/video/vo')); await writeFile(join(cwd,'.launch/video/vo/0.wav'),await readFile(audio));
  await expect(render(cwd,'ffmpeg',['1x1'])).rejects.toThrow('extend the scene duration');
},120000);
