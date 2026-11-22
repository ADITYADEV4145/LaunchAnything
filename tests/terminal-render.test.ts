import { expect, it } from 'vitest';
import { browser } from '../src/visuals/runtime.js';
import { renderTerminal, terminalCapHeight } from '../src/media/terminal.js';
import { ocrWords } from '../src/media/banned.js';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { renderCarousel } from '../src/media/platform-images.js';
import { renderClip } from '../src/video/clip.js';
import { exec } from '../src/visuals/runtime.js';

const text = "$ gw check\nBLOCK grounding (unknown-export): label.ts:1\nWhy: 'formatCurrency' is not exported in money.ts. Did you mean formatPrice (money.ts:1, formatPrice(cents: number): string)?\nFix: Use formatPrice (money.ts:1): formatPrice(cents: number): string.";
it('reflows real output for phone and landscape targets without losing identifiers or the highlight', async () => {
  const app=await browser();
  try {
    for(const target of [{width:676,height:729,frame:1280,columns:44,floor:.0225},{width:1408,height:440,frame:900,columns:80,floor:.025}]) {
      const result=await renderTerminal(app,{text,highlight:'BLOCK'},{...target,minCapHeight:target.frame*target.floor,title:'Scope',accent:'#77e5b3'});
      expect(result.width).toBeLessThanOrEqual(target.width);expect(result.height).toBeLessThanOrEqual(target.height);
      expect(result.terminal.columns).toBeLessThanOrEqual(target.columns);
      expect(result.terminal.capHeight).toBeGreaterThanOrEqual(target.frame*target.floor);
      const box=result.terminal.box;
      expect((box.x-1)/result.width).toBeGreaterThanOrEqual(.025);
      expect((box.x-1)/result.width).toBeLessThanOrEqual(.03);
      expect(result.width-box.x-box.width).toBe(box.x);
      expect(result.highlight).toBeDefined();
      const ocr=await ocrWords(result.png);
      const body=ocr.words.filter(word=>word.y>=box.y-2&&word.y+word.height<=box.y+box.height+2);
      expect(Math.min(...body.map(word=>word.x))/result.width).toBeGreaterThanOrEqual(.025);
      expect(Math.max(...body.map(word=>word.x+word.width))).toBeLessThanOrEqual(result.width-box.x+2);
      expect(terminalCapHeight(ocr.words,target.frame,result.terminal.box)).toBeGreaterThanOrEqual(target.floor-.0005);
      expect(ocr.text).toContain('money.ts');expect(ocr.text).toContain('formatPrice');
    }
    await expect(renderTerminal(app,{text:'foo'},{width:676,height:729,minCapHeight:28,columns:44,title:'Scope',accent:'#77e5b3'})).rejects.toThrow('Banned');
    await expect(renderTerminal(app,{text:'READY\n'.repeat(100)},{width:676,height:100,minCapHeight:28,columns:44,title:'Scope',accent:'#77e5b3'})).rejects.toThrow('cannot fit');
    const empty=await renderTerminal(app,{text:''},{width:676,height:729,minCapHeight:28,columns:44,title:'Scope',accent:'#77e5b3'});
    expect(empty.height).toBeGreaterThan(0);
  } finally {await app.close();}
},30000);

it('uses target-aware transcripts in both standalone renderers and keeps phone text readable after video encoding', async () => {
  const cwd=await mkdtemp(join(tmpdir(),'terminal-render-'));
  try {
    await mkdir(join(cwd,'.launch'));
    await writeFile(join(cwd,'.launch/product.json'),JSON.stringify({name:'Scope'}));
    const terminal={text,highlight:'BLOCK'};
    const images=await renderCarousel(cwd,[{role:'after',caption:'Catch missing exports',terminal}],{size:'x'});
    expect(images.report[0].terminal!.capHeight).toBeGreaterThanOrEqual(900*.025);
    await writeFile(join(cwd,'source.png'),PNG.sync.write(new PNG({width:10,height:10})));
    const clip=await renderClip(cwd,[{role:'after',caption:'Catch missing exports',source:'source.png',duration:1,terminal}],{format:'9x16',renderer:'ffmpeg'});
    const scene=clip.receipt.scenes[0];expect(scene.crop).toBeUndefined();
    expect(scene.terminal!.capHeight).toBeGreaterThanOrEqual(1280*.022);
    const frame=join(cwd,'frame.png');
    await exec('ffmpeg',['-y','-v','error','-ss','0.5','-i',clip.file,'-frames:v','1','-threads','1',frame]);
    expect(terminalCapHeight((await ocrWords(await readFile(frame))).words,1280,scene.terminal!.box)).toBeGreaterThanOrEqual(.022);
    expect(scene.highlight).toBeDefined();
  } finally {await rm(cwd,{recursive:true,force:true});}
},90000);
