import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { totalDuration, validateScript, srt } from '../src/video/script.js';
import { check, checkProbe } from '../src/video/check.js';
import { parseFormats, remotionCli, render, run } from '../src/video/render.js';
import { record } from '../src/video/record.js';
import { frameLayout, wrapText } from '../src/video/design.js';
import { prepareFixtureVideo } from '../src/selftest/phase4.js';
import { cp, readFile } from 'node:fs/promises';
import { packageRoot } from '../src/core/package-root.js';

const dirs: string[] = [];
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(),'phase4-test-')); dirs.push(cwd);
  await mkdir(join(cwd,'.launch/media'),{recursive:true});
  await mkdir(join(cwd,'.launch/video'),{recursive:true});
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=navy:s=320x180','-frames:v','1','-threads','1',join(cwd,'.launch/media/real.png')]);
  const script = {scenes:Array.from({length:6}, () => ({shot:'real.png',text:'Real product footage',duration:5}))};
  await writeFile(join(cwd,'.launch/video/script.json'),JSON.stringify(script));
  return {cwd,script};
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d,{recursive:true,force:true}))); });
describe('phase 4',() => {
  it('fits complete footage and wraps even long unbroken captions',() => {
    for(const [width,height] of [[1280,720],[720,1280],[720,720]]) {
      const frame=frameLayout(width,height,1280,800);
      expect(frame.width/frame.height).toBeCloseTo(1.6,1);
      expect(frame.x).toBeGreaterThan(0);
      expect(frame.x+frame.width).toBeLessThan(width);
      expect(frame.y+frame.height).toBeLessThan(height*.73);
    }
    expect(frameLayout(1280,720,390,844).kind).toBe('phone');
    expect(wrapText('',15)).toEqual([]);
    expect(wrapText('UnbrokenExtraordinaryProductName',10).every(l=>l.length<=10)).toBe(true);
  });
  it('uses real bundled fixture captures and source copy, including SaaS navigation',async () => {
    const cwd=await mkdtemp(join(tmpdir(),'phase4-real-'));dirs.push(cwd);
    await cp(join(packageRoot(),'fixtures/saas-next'),cwd,{recursive:true});
    const script=await prepareFixtureVideo(cwd,'saas-next');
    expect(script.scenes.some(s=>s.shot.endsWith('.webm'))).toBe(true);
    expect(new Set(script.scenes.map(s=>s.shot)).size).toBeGreaterThan(1);
    expect(script.scenes.every(s=>s.text.split(/\s+/).length<=8 && !/phase four|placeholder/i.test(s.text))).toBe(true);
    expect(JSON.parse(await readFile(join(cwd,'.launch/media/manifest.json'),'utf8')).capturedAt).toBeTruthy();
    await expect(validateScript(cwd,script)).resolves.toEqual(script);
  });
  it('validates schema, duration, real files, shot IDs and containment',async () => {
    const {cwd,script} = await setup();
    await expect(validateScript(cwd,script)).resolves.toEqual(script);
    await expect(validateScript(cwd,{scenes:[]})).rejects.toThrow();
    await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,text:'This has far too many words for one caption now'}))})).rejects.toThrow();
    await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,duration:1}))})).rejects.toThrow('30–60');
    const longest = {scenes:script.scenes.map(s => ({...s,duration:9.5}))};
    expect(totalDuration(await validateScript(cwd,longest))).toBe(60);
    await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,duration:10}))})).rejects.toThrow('end card');
    await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,shot:'missing.png'}))})).rejects.toThrow('captured media');
    await writeFile(join(cwd,'.launch/shots.yaml'),'shots:\n  - id: real\n    route: /\n    viewport: {width: 320, height: 180}\n');
    await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,shot:'real'}))})).resolves.toBeDefined();
    await writeFile(join(cwd,'outside.png'),'not a capture');
    await symlink(join(cwd,'outside.png'),join(cwd,'.launch/media/link.png'));
    for (const shot of ['../../outside.png','link.png','https://example.com/image.png']) await expect(validateScript(cwd,{scenes:script.scenes.map(s => ({...s,shot}))})).rejects.toThrow();
  });
  it('generates precise SRT and empty captions',() => {
    expect(srt({scenes:[]})).toBe('');
    expect(srt({scenes:[{shot:'x',text:'Hello',duration:1.25},{shot:'y',text:'World',duration:2}]})).toBe('1\n00:00:00,000 --> 00:00:01,250\nHello\n\n2\n00:00:01,250 --> 00:00:03,250\nWorld\n');
  });
  it('checks platform durations and exact dimensions',() => {
    const probe = {format:{duration:'30'},streams:[{codec_type:'video',width:720,height:1280}]};
    expect(checkProbe(probe,'9x16').audio).toBe(false);
    expect(() => checkProbe({...probe,format:{duration:'61'}},'9x16')).toThrow('Duration');
    expect(() => checkProbe({...probe,streams:[]},'9x16')).toThrow('resolution');
    expect(() => parseFormats('bad')).toThrow();
    expect(() => parseFormats('')).toThrow();
    expect(() => checkProbe({...probe,format:{duration:'NaN'}},'9x16')).toThrow('Duration');
    const landscape = {...probe,format:{duration:'100'},streams:[{codec_type:'video',width:1280,height:720}]};
    expect(checkProbe(landscape,'16x9').platforms).toEqual([
      {platform:'youtube-shorts',maxSeconds:60,compliant:false,required:false},
      {platform:'x',maxSeconds:140,compliant:true,required:true},
      {platform:'product-hunt',maxSeconds:180,compliant:true,required:true},
    ]);
    expect(() => checkProbe({...landscape,format:{duration:'141'}},'16x9')).toThrow('Duration');
    const square = {...landscape,streams:[{codec_type:'video',width:720,height:720}]};
    expect(checkProbe(square,'1x1').platforms.filter(p => p.required).map(p => p.platform)).toEqual(['x']);
  });
  it('handles absent recording requests and clearly reports missing optional Playwright',async () => {
    const {cwd} = await setup();
    await expect(record(cwd,'http://localhost:3000')).resolves.toMatchObject({files:[]});
    await expect(record(cwd,'file:///etc/passwd')).rejects.toThrow('HTTP(S)');
    await writeFile(join(cwd,'.launch/shots.yaml'),'shots:\n  - id: real\n    route: /\n    viewport: {width: 320, height: 180}\n    record: true\n');
    await expect(record(cwd,'http://localhost:3000')).rejects.toThrow('Playwright is not installed');
    await expect(render(cwd,'invalid',['1x1'])).rejects.toThrow('Renderer');
    await expect(render(cwd,'remotion',['1x1'])).rejects.toThrow('Remotion is not installed');
    const bin = join(cwd,'bin');
    await mkdir(bin);
    const target = join(cwd,'remotion-cli.js');
    await writeFile(target,'');
    await symlink(target,join(bin,'remotion'));
    const previous = process.env.PATH;
    try {
      process.env.PATH = bin;
      await expect(remotionCli(cwd)).resolves.toBe(target);
    } finally { process.env.PATH = previous; }
  });
  it('renders ffmpeg without Remotion, checks silent captions, and rejects stale captions',async () => {
    const {cwd} = await setup();
    const result = await render(cwd,'ffmpeg',['1x1']);
    expect(result.renderer).toBe('ffmpeg');
    expect(await check(cwd,['1x1'])).toMatchObject([{captions:true,audio:false,width:720,height:720,duration:33}]);
    await writeFile(join(cwd,'.launch/video/captions.srt'),'');
    await expect(check(cwd,['1x1'])).rejects.toThrow('Captions');
  },120000);
  it('mixes agent-provided voiceover and checks -14 LUFS',async () => {
    const {cwd} = await setup();
    const vo = join(cwd,'.launch/video/vo');
    await mkdir(vo);
    await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=orange:s=160x100','-frames:v','1','-threads','1',join(cwd,'.launch/media/logo.png')]);
    for (let i = 0; i < 6; i++) await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=5',join(vo,`${i}.wav`)]);
    await render(cwd,'ffmpeg',['1x1']);
    const result = await check(cwd,['1x1']);
    expect(result[0].audio).toBe(true);
    expect(result[0].loudness).toBeCloseTo(-14,0);
    await writeFile(join(cwd,'.launch/video/square-1x1.mp4.json'),'{}');
    await expect(check(cwd,['1x1'])).rejects.toThrow('Stale');
  },120000);
});
