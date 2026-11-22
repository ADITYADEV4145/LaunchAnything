import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stringify } from 'yaml';
import { axes, captionContrast, checkStyles, distinctAxes, forkStyle, listStyles, loadStyle, motionFilter, parseStyle, styleGate, stylesGallery, type VideoStyle } from '../src/video/styles.js';
import { endAsset, frameLayout, sceneAssets } from '../src/video/design.js';
import { run } from '../src/video/render.js';
import { renderClip } from '../src/video/clip.js';
import { browser } from '../src/visuals/runtime.js';

const dirs: string[] = [];
async function fixture() { const dir=await mkdtemp(join(tmpdir(),'video-styles-')); dirs.push(dir); return dir; }
const source = (s:VideoStyle) => { const {direction,custom,...data}=s; return `---\n${stringify(data)}---\n\n${direction}\n`; };
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true}))); });
describe('video styles',() => {
  it('parses six complete distinct presets with accessible captions',async () => {
    const styles=await listStyles(await fixture());
    expect(styles.map(s=>s.id)).toEqual(['brutalist','midnight','mono','neon','paper','warm']);
    const midnight=styles.find(s=>s.id==='midnight')!;
    for (const style of styles) {
      expect(captionContrast(style)).toBeGreaterThanOrEqual(7);
      expect(parseStyle(source(style))).toEqual(style);
      if(style.id!=='midnight') expect(distinctAxes(style,midnight).length).toBeGreaterThanOrEqual(4);
    }
    expect(()=>parseStyle('')).toThrow('frontmatter');
    expect(()=>parseStyle('---\nid: empty\n---\n')).toThrow();
    expect(()=>parseStyle(source({...midnight,palette:{...midnight.palette,text:'#101827'}}))).toThrow('contrast');
    expect(()=>parseStyle(source({...midnight,pacing:{min:9,max:1}}))).toThrow('pacing');
    expect(()=>parseStyle(source({...midnight,camera:'invalid' as never}))).toThrow('motion');
  });
  it('counts semantic axis changes independent of YAML key ordering',async () => {
    const base=await loadStyle(await fixture());
    expect(distinctAxes(base,{...base,palette:{accent:base.palette.accent,text:base.palette.text,background:base.palette.background,captionBackground:base.palette.captionBackground}})).toEqual([]);
    expect(distinctAxes({...base,name:'renamed',direction:'changed'},base)).toEqual([]);
    expect(axes).toHaveLength(6);
  });
  it('forks safely, enforces four axes and loads local overrides',async () => {
    const cwd=await fixture();
    const fork=await forkStyle(cwd,'midnight','local');
    expect((await styleGate(cwd,fork.style)).status).toBe('fail');
    await expect(checkStyles(cwd)).rejects.toThrow('0/6');
    await expect(forkStyle(cwd,'midnight','local')).rejects.toThrow('exists');
    await expect(forkStyle(cwd,'midnight','../escape')).rejects.toThrow('Invalid');
    const paper=await loadStyle(cwd,'paper');
    await writeFile(fork.path,source({...paper,id:'local',base:'midnight'}));
    expect((await styleGate(cwd,await loadStyle(cwd,'local'))).status).toBe('pass');
    await expect(checkStyles(cwd)).resolves.toBeDefined();
    await forkStyle(cwd,'paper','midnight');
    expect((await loadStyle(cwd)).custom).toBe(true);
    expect((await loadStyle(cwd)).palette).toEqual(paper.palette);
    await expect(loadStyle(cwd,'missing')).rejects.toThrow();
  });
  it('writes a gallery from actual SVG plates, never a video',async () => {
    const cwd=await fixture(); const result=await stylesGallery(cwd);
    const html=await readFile(result.gallery,'utf8');
    expect(result.gallery).toBe(join(cwd,'.launch/video/styles.html'));
    expect(html.match(/<article>/g)).toHaveLength(6);
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('font-family:Georgia, serif');
    expect(html).not.toContain('<video');
  });
  it('preserves the exact default SVGs for explicit midnight and styles plates/end cards',async () => {
    const cwd=await fixture(); const brand={name:'Example',tagline:'Real useful work',homepage:'example.com'};
    const frame=frameLayout(640,360,640,360);
    const base=await sceneAssets(cwd,'base',640,360,frame,brand,'Real work',0,1);
    const midnight=await sceneAssets(cwd,'midnight',640,360,frame,brand,'Real work',0,1,await loadStyle(cwd));
    expect(await readFile(base.platePath,'utf8')).toBe(await readFile(midnight.platePath,'utf8'));
    expect(await readFile(base.captionPath,'utf8')).toBe(await readFile(midnight.captionPath,'utf8'));
    for(const style of await listStyles(cwd)) {
      const asset=await sceneAssets(cwd,style.id,640,360,frame,brand,'Real work',0,1,style);
      const end=await endAsset(cwd,style.id,640,360,brand,undefined,style);
      expect(await readFile(end,'utf8')).toContain('<svg');
      if(style.id!=='midnight') {
        expect(await readFile(asset.platePath,'utf8')).toContain(style.palette.background[0]);
        expect(await readFile(asset.captionPath,'utf8')).toContain(style.palette.captionBackground);
      }
    }
  });
  it('applies all camera and transition filters to tiny fixture frames',async () => {
    const cwd=await fixture();
    for(const style of await listStyles(cwd)) await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=96x64:r=12','-vf',motionFilter(style,96,64,1),'-t','1','-threads','1','-f','null','-']);
  },30000);
  it('lists and forks styles through the CLI in JSON mode',async () => {
    const cwd=await fixture(); const exec=promisify(execFile);
    const cli=async (...args:string[])=>JSON.parse((await exec(process.execPath,['--import','tsx','src/cli.ts','--cwd',cwd,'--json','video','styles',...args])).stdout);
    expect((await cli()).data.styles).toHaveLength(6);
    expect((await cli('--fork','midnight','--as','custom')).ok).toBe(true);
    await expect(cli('check')).rejects.toThrow();
  },30000);
  it('renders top-caption styles above the safe cutoff despite Chromium rounding',async context => {
    let app; try { app=await browser(); } catch { context.skip(true,'Chrome unavailable'); return; }
    await app.close();
    const cwd=await fixture(); const source=join(cwd,'capture.png');
    await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=white:s=96x64','-frames:v','1','-threads','1',source]);
    for(const style of ['paper','mono']) for(const format of ['16x9','1x1'] as const) {
      const result=await renderClip(cwd,[{caption:'Keep work private',source,duration:2}],{style,format,renderer:'ffmpeg'});
      expect(result.receipt.scenes[0].captionContrast).toBeGreaterThanOrEqual(7);
    }
  },120000);
});
