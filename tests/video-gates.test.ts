import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeLint, readcheck, sceneDuration, scriptFromShots, srt, totalDuration, words } from '../src/video/script.js';
import * as polishing from '../src/media/polish.js';
import { endCardGate, motionGates, transcriptCoverage, voiceGate } from '../src/video/check.js';
import { run } from '../src/video/render.js';

const dirs: string[] = [];
async function fixture(source: string, duration = 4) {
  const dir = await mkdtemp(join(tmpdir(),'video-gates-')); dirs.push(dir);
  const path = join(dir,'test.mp4');
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i',source,'-t',String(duration),'-c:v','libx264','-pix_fmt','yuv420p','-threads','1',path]);
  return path;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir,{recursive:true,force:true}))); });
const script = {scenes:[{shot:'test.png',text:'Read this sentence',duration:3,voiceover:'Read this sentence'}]};
describe('video gates',() => {
  it('passes moving test footage',async () => {
    expect((await motionGates(await fixture('testsrc2=s=96x64:r=12'))).map(g => g.status)).toEqual(['pass','pass','pass']);
  },30000);
  it('detects black, identical samples and a frozen tail',async () => {
    const gates = await motionGates(await fixture('color=black:s=96x64:r=12'));
    expect(gates.map(g => g.status)).toEqual(['fail','fail','fail']);
    expect(gates[0].detail).toContain('identical');
  },30000);
  it('allows a three-second static hold but rejects longer nonblack freezes',async () => {
    const short = await motionGates(await fixture('color=red:s=96x64:r=12',3));
    expect(short[1].status).toBe('pass');
    expect(short[2].status).toBe('pass');
    expect((await motionGates(await fixture('color=red:s=96x64:r=12')))[2].status).toBe('fail');
  },30000);
  it('reports decoding errors instead of throwing out the gate results',async () => {
    const gates = await motionGates('/does-not-exist/video.mp4');
    expect(gates.every(g => g.status === 'fail')).toBe(true);
  },30000);
  it('checks reading time, speaking rate, empty scripts and the cue map',() => {
    expect(readcheck(script).status).toBe('pass');
    expect(readcheck({scenes:[]}).status).toBe('fail');
    expect(readcheck({scenes:[{...script.scenes[0],duration:1}]}).detail).toContain('voiceover');
    expect(readcheck(script,srt(script).replace('00:00:03,000','00:00:02,900')).status).toBe('fail');
    expect(readcheck(script,'').detail).toContain('cue map');
  });
  it('bans progress chrome without banning ordinary prose',() => {
    for (const text of ['3/6','01 / 06','step 2 of 5','Loading 50%','▮▯']) expect(chromeLint({scenes:[{...script.scenes[0],text}]}).status).toBe('fail');
    expect(chromeLint(script).status).toBe('pass');
    expect(chromeLint({scenes:[]}).status).toBe('pass');
  });
  it.each(['Keep every local change private on your device','Keep every local change safely stored and available on your own device'])('gives a generated hook reading and narration time in both cuts: %s',async caption => {
    const cwd=await mkdtemp(join(tmpdir(),'video-hook-')); dirs.push(cwd);
    await mkdir(join(cwd,'.launch/media/polished'),{recursive:true});
    const shots=['hook','before','after','cta'].map(purpose=>({id:purpose,purpose,card:true,moneyMoment:purpose==='after',viewport:{width:800,height:600},caption:purpose==='hook'?caption:'Keep work private'}));
    await writeFile(join(cwd,'.launch/shots.yaml'),JSON.stringify({shots}));
    await writeFile(join(cwd,'.launch/media/polished/frame.png'),'captured image');
    vi.spyOn(polishing,'polish').mockResolvedValue(shots.map(shot=>({id:shot.id,file:'frame.png',theme:'light'})) as never);
    const generated=await scriptFromShots(cwd);
    for(const format of ['16x9','9x16']) {
      expect(readcheck({scenes:generated.scenes.map(scene=>({...scene,duration:sceneDuration(scene,format,true)}))}).status).toBe('pass');
      expect(totalDuration(generated,format)).toBeLessThanOrEqual(format==='9x16'?35:60);
    }
    expect(generated.scenes[0].duration).toBeGreaterThan(3);
    expect(generated.scenes[0].duration).toBeGreaterThanOrEqual(words(caption).length/2.8+.25);
    expect(generated.scenes[0].shortDuration).toBe(generated.scenes[0].duration);
  });
  it('measures the final scene boundary against the file duration',() => {
    expect(endCardGate(script,6.25).status).toBe('pass');
    expect(endCardGate(script,6.26).status).toBe('fail');
    expect(endCardGate(script,NaN).status).toBe('fail');
  });
  it('keeps a readable short hook within a near-cap vertical storyboard',async()=>{
    const cwd=await mkdtemp(join(tmpdir(),'video-hook-cap-')); dirs.push(cwd);
    await mkdir(join(cwd,'.launch/media/polished'),{recursive:true});
    const roles=['hook','before','action','after','proof','proof','proof','cta'];
    const shots=roles.map((purpose,index)=>({id:`${purpose}-${index}`,purpose,card:true,moneyMoment:purpose==='after',viewport:{width:800,height:600},caption:purpose==='hook'?'Private':purpose==='cta'?'Keep every local change safely stored on your device':purpose==='proof'?'Keep every local change safely stored and available on your device':'Keep every local change safely stored and available on your own device'}));
    await writeFile(join(cwd,'.launch/shots.yaml'),JSON.stringify({shots}));
    await writeFile(join(cwd,'.launch/media/polished/frame.png'),'captured image');
    vi.spyOn(polishing,'polish').mockResolvedValue(shots.map(shot=>({id:shot.id,file:'frame.png',theme:'light'})) as never);
    const generated=await scriptFromShots(cwd);
    expect(generated.scenes[0].duration).toBeCloseTo(5/6);
    expect(generated.scenes[0].shortDuration).toBe(generated.scenes[0].duration);
    expect(totalDuration(generated,'9x16')).toBeGreaterThan(34);
    expect(totalDuration(generated,'9x16')).toBeLessThanOrEqual(35);
    expect(totalDuration(generated,'9x16')+3-generated.scenes[0].duration).toBeGreaterThan(35);
    for(const format of ['16x9','9x16']) expect(readcheck({scenes:generated.scenes.map(scene=>({...scene,duration:sceneDuration(scene,format,true)}))}).status).toBe('pass');
  });
  it('normalizes transcription words and skips absent audio',async () => {
    expect(transcriptCoverage('Hello, WORLD!','hello world')).toBe(1);
    expect(transcriptCoverage('one two three four five','one two three four')).toBe(.8);
    expect(transcriptCoverage('one two','unrelated')).toBe(0);
    expect(transcriptCoverage('','')).toBe(1);
    expect(await voiceGate('/does-not-exist','/does-not-exist',script,false)).toMatchObject({status:'skipped',detail:'No narration in rendered audio'});
    expect((await voiceGate('/does-not-exist','/does-not-exist',{scenes:[]})).status).toBe('skipped');
  });
  it('runs both local STT adapters, rejects poor transcripts and reports tool errors',async () => {
    const dir = await mkdtemp(join(tmpdir(),'video-stt-')); dirs.push(dir);
    const video=join(dir,'final.mp4');
    await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=white:s=96x64:r=12','-f','lavfi','-i','sine=frequency=440','-t','6','-c:v','libx264','-threads','1','-c:a','aac',video]);
    const takes=join(dir,'.launch/video/vo'); await mkdir(takes,{recursive:true});
    await writeFile(join(takes,'0.wav'),'not the rendered audio');
    await writeFile(join(takes,'0.mp3'),'not the rendered audio either');
    await writeFile(join(takes,'1.mp3'),'another local take');
    const ffmpeg=(await run('which',['ffmpeg'])).stdout.trim();
    const ffprobe=(await run('which',['ffprobe'])).stdout.trim();
    await symlink(ffmpeg,join(dir,'ffmpeg'));
    const previous = process.env.PATH;
    try {
      process.env.PATH = dir;
      expect((await voiceGate(dir,video,script)).status).toBe('skipped');
      for (const name of ['whisper','whisper-cli']) {
        const binary = join(dir,name);
        const adapter = name === 'whisper' ? 'const input=a[0],out=a[a.indexOf("--output_dir")+1]+"/"+require("node:path").basename(input,".wav")+".txt";' : 'const input=a[a.indexOf("-f")+1],out=a[a.indexOf("-of")+1]+".txt";';
        const stub = (transcript: string) => `#!${process.execPath}\nconst a=process.argv.slice(2);${adapter}const fs=require('node:fs');if(fs.readFileSync(input).subarray(0,4).toString()!=="RIFF")process.exit(2);const probe=JSON.parse(require('node:child_process').execFileSync(${JSON.stringify(ffprobe)},['-v','error','-show_entries','format=duration','-of','json',input]));fs.writeFileSync(${JSON.stringify(join(dir,'duration.json'))},JSON.stringify(probe));fs.writeFileSync(out,${JSON.stringify(transcript)});`;
        await writeFile(binary,stub('READ this sentence!')); await chmod(binary,0o755);
        expect((await voiceGate(dir,video,script)).status).toBe('pass');
        expect(Number(JSON.parse(await readFile(join(dir,'duration.json'),'utf8')).format.duration)).toBeCloseTo(3,1);
        const short={scenes:[{...script.scenes[0],duration:1,voiceover:undefined},{...script.scenes[0],duration:1.5}]};
        expect((await voiceGate(dir,video,short)).status).toBe('pass');
        expect(Number(JSON.parse(await readFile(join(dir,'duration.json'),'utf8')).format.duration)).toBeCloseTo(1.5,1);
        const partial={scenes:[{...script.scenes[0],duration:1.25},{...script.scenes[0],voiceover:undefined},{...script.scenes[0],voiceover:'No take exists for this scene'}]};
        expect((await voiceGate(dir,video,partial)).status).toBe('pass');
        expect(Number(JSON.parse(await readFile(join(dir,'duration.json'),'utf8')).format.duration)).toBeCloseTo(1.25,1);
        expect((await voiceGate(dir,video,{scenes:[partial.scenes[1]]})).status).toBe('skipped');
        expect((await voiceGate(dir,video,{scenes:[partial.scenes[1],partial.scenes[1],partial.scenes[2]]})).status).toBe('skipped');
        await writeFile(binary,stub('unrelated words'));
        expect((await voiceGate(dir,video,script)).status).toBe('fail');
        expect((await voiceGate(dir,'/missing/export.mp4',script)).status).toBe('fail');
        await writeFile(binary,`#!${process.execPath}\nprocess.exit(1);`);
        expect((await voiceGate(dir,video,script)).status).toBe('fail');
        await rm(binary);
      }
    } finally { process.env.PATH = previous; }
  },30000);
});
