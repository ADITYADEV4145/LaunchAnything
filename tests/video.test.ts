import { afterEach, expect, it, vi } from 'vitest';
import { access, mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderCarousel } from '../src/media/platform-images.js';
import { renderClip } from '../src/video/clip.js';
import { voice } from '../src/video/voice.js';
import { takeShots } from '../src/visuals/shots.js';
import { browser, exec } from '../src/visuals/runtime.js';
import { run, render } from '../src/video/render.js';
import { check } from '../src/video/check.js';
import { totalDuration, validateScript } from '../src/video/script.js';
import { pngSize } from '../src/visuals/check.js';
import { ocrWords } from '../src/media/banned.js';

const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await Promise.all(dirs.splice(0).map(dir => rm(dir, {recursive:true,force:true}))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'clip-')); dirs.push(cwd);
  await mkdir(join(cwd,'.launch/media'), {recursive:true});
  await writeFile(join(cwd,'.launch/product.json'), JSON.stringify({name:'Scope',oneLiner:'Ground your next change',homepage:'https://scope.example'}));
  const app = await browser();
  try { const page = await app.newPage({viewport:{width:1000,height:360}}); await page.setContent('<body style="background:#101827;color:white;font:48px monospace;padding:40px">BLOCK grounding<br>Missing export: label</body>'); await page.screenshot({path:join(cwd,'.launch/media/real.png')}); }
  finally { await app.close(); }
  return cwd;
}
async function loudness(file: string) {
  const {stderr} = await run('ffmpeg',['-hide_banner','-i',file,'-af','ebur128','-f','null','-']);
  return Number([...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
}
async function legacyScript(cwd: string) {
  await mkdir(join(cwd,'.launch/video'),{recursive:true});
  const script={scenes:Array.from({length:6},(_,index)=>({shot:'real.png',text:'Catch unknown exports',duration:5,...(index===0?{voiceover:'Catch unknown exports'}:{})}))};
  await writeFile(join(cwd,'.launch/video/script.json'),JSON.stringify(script)); return script;
}

it('exports standalone carousel and clip renderers without shots.yaml, with quiet deterministic music and readable plates', async () => {
  const cwd=await fixture();
  const carousel=await renderCarousel(cwd,[{role:'after',caption:'Catch unknown exports',source:'.launch/media/real.png'}],{size:'x',outDir:'out',prefix:'launch'});
  expect(carousel.report[0]).toMatchObject({ok:true,role:'after',banned:[]});
  expect(pngSize(await readFile(carousel.files[0]))).toEqual({width:1600,height:900});
  const result=await renderClip(cwd,[{role:'after',caption:'Catch unknown exports',source:'.launch/media/real.png',duration:2,highlight:{x:38,y:48,width:170,height:55}}],{renderer:'ffmpeg',outFile:'out/direct.mp4'});
  expect(result.duration).toBe(5); expect(result.receipt.audio.mode).toBe('music-only');
  expect(result.receipt.scenes[0].captionFont).toBeGreaterThanOrEqual(720*.04);
  expect(result.receipt.scenes[0].captionContrast).toBeGreaterThanOrEqual(7);
  expect(result.receipt.scenes[0].highlight).toBeDefined(); expect(await loudness(result.file)).toBeLessThan(-20);
  await expect(access(join(cwd,'.launch/shots.yaml'))).rejects.toThrow();
  await expect(renderClip(cwd,[])).rejects.toThrow('requires');
  await expect(renderCarousel(cwd,[])).rejects.toThrow('requires');
  await expect(renderClip(cwd,[{caption:'foo',source:'.launch/media/real.png',duration:2}])).rejects.toThrow('Banned');
  await expect(renderClip(cwd,[{caption:'Catch unknown exports',source:'absent.png',duration:2}])).rejects.toThrow();
},120000);

it('keeps portrait margins and trims a focus-anchored inset for wide highlighted stills',async()=>{
  const cwd=await fixture();
  const result=await renderClip(cwd,[{role:'after',caption:'Catch unknown exports',source:'.launch/media/real.png',duration:1,highlight:{x:38,y:48,width:170,height:55}}],{format:'9x16',renderer:'ffmpeg'});
  expect(result.receipt.scenes[0].crop).toEqual({x:0,y:0,width:900,height:360});
  expect(result.receipt.scenes[0].frame.width).toBe(676);
  expect(result.receipt.scenes[0].highlight!.x).toBeGreaterThanOrEqual(0);
});

it('plans voice without writes, reports missing keys, mocks ElevenLabs and mixes VO to -14 ±2 LUFS',async()=>{
  const cwd=await fixture(); await legacyScript(cwd);
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch); vi.stubEnv('ELEVENLABS_API_KEY','local-unit-key'); vi.stubEnv('ELEVENLABS_VOICE_ID','local-voice');
  const before=await readdir(join(cwd,'.launch/video'));
  const plan=await voice(cwd,{dryRun:true}); expect(plan.mode).toBe('dry-run'); expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(join(cwd,'.launch/video'))).toEqual(before);
  expect(plan.requests[0]).toMatchObject({url:'https://api.elevenlabs.io/v1/text-to-speech/local-voice',body:{text:'Catch unknown exports',model_id:'eleven_multilingual_v2'}});
  vi.stubEnv('ELEVENLABS_API_KEY',''); expect((await voice(cwd)).mode).toBe('captions-only'); expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('ELEVENLABS_API_KEY','local-unit-key');
  fetch.mockResolvedValueOnce(new Response('',{status:429})); await expect(voice(cwd)).rejects.toThrow('429');
  await expect(access(join(cwd,'.launch/video/vo'))).rejects.toThrow();
  fetch.mockResolvedValueOnce(new Response(new Uint8Array())); await expect(voice(cwd)).rejects.toThrow('empty audio');
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',join(cwd,'voice.mp3')]);
  fetch.mockResolvedValueOnce(new Response(await readFile(join(cwd,'voice.mp3'))));
  const generated=await voice(cwd);
  expect(fetch).toHaveBeenLastCalledWith('https://api.elevenlabs.io/v1/text-to-speech/local-voice',expect.objectContaining({method:'POST',headers:{'xi-api-key':'local-unit-key','Content-Type':'application/json'},body:JSON.stringify(plan.requests[0].body)}));
  expect(generated.files).toHaveLength(1);
  const result=await renderClip(cwd,[{role:'after',caption:'Catch unknown exports',source:'.launch/media/real.png',duration:3}],{renderer:'ffmpeg',voice:generated.files,music:'voice.mp3'});
  expect(result.receipt.audio.mode).toBe('voiceover'); expect(Math.abs(await loudness(result.file)+14)).toBeLessThanOrEqual(2);
},120000);

it('captures a CLI storyboard, writes --from-shots, renders both cuts and passes video check',async()=>{
  const cwd=await fixture();
  const captions=['Unknown exports should never ship','An import points to a missing export','Inspect local source','Catch unknown exports before they ship','Locate the missing symbol','Ground your next change'];
  const roles=['hook','before','action','after','proof','cta'];
  const shots=roles.map((purpose,index)=>({id:purpose,purpose,caption:captions[index],viewport:{width:1600,height:900},...(index===0 || index===5?{card:true}:{commands:['node app.cjs']}),...(index===3?{moneyMoment:true,highlight:{text:'BLOCK'}}:{})}));
  await writeFile(join(cwd,'app.cjs'),'console.log("BLOCK grounding (unknown-export): label.ts:1\\nMissing export: label");');
  await writeFile(join(cwd,'.launch/shots.yaml'),JSON.stringify({shots})); await takeShots(cwd);
  const {stdout}=await exec(process.execPath,['--import','tsx','src/cli.ts','--cwd',cwd,'--json','video','script','--from-shots'],{timeout:120000});
  expect(JSON.parse(stdout).data.valid).toBe(true);
  const script=JSON.parse(await readFile(join(cwd,'.launch/video/script.json'),'utf8'));
  expect(script.scenes.map((scene:{role:string})=>scene.role)).toEqual(roles);
  expect(script.scenes[0].duration).toBeLessThanOrEqual(3); expect(script.scenes[3].duration).toBe(Math.max(...script.scenes.map((scene:{duration:number})=>scene.duration)));
  expect(script.scenes[3].shot).toBe('polished/after.png'); expect(script.scenes[2].shot).toBe('shots/action.mp4');
  expect(totalDuration(script)).toBeGreaterThanOrEqual(45); expect(totalDuration(script)).toBeLessThanOrEqual(60);
  expect(totalDuration(script,'9x16')).toBeGreaterThanOrEqual(20); expect(totalDuration(script,'9x16')).toBeLessThanOrEqual(35);
  await expect(validateScript(cwd,{...script,scenes:script.scenes.map((scene:object,index:number)=>({...scene,...(index===0?{duration:4}:{})}))})).rejects.toThrow('Hook');
  await expect(validateScript(cwd,{...script,scenes:script.scenes.map((scene:object)=>({...scene,shortDuration:8}))})).rejects.toThrow();
  await render(cwd,'ffmpeg',['16x9','9x16']); const checked=await check(cwd,['16x9','9x16']);
  expect(checked.every(result=>result.captions && result.audio && result.loudness! < -20)).toBe(true);
  const receipt=JSON.parse(await readFile(join(cwd,'.launch/video/demo-16x9.mp4.json'),'utf8'));
  expect(receipt.scenes[3].highlight).toBeDefined();
  await run('ffmpeg',['-y','-v','error','-ss','1','-i',join(cwd,'.launch/video/short-9x16.mp4'),'-frames:v','1','-threads','1',join(cwd,'hook.png')]);
  expect((await ocrWords(await readFile(join(cwd,'hook.png')))).text).toContain('Scope');
},300000);
