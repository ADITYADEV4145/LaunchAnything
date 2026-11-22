import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { stringify } from 'yaml';
import { browser, exec } from '../src/visuals/runtime.js';
import * as runtime from '../src/visuals/runtime.js';
import * as banned from '../src/media/banned.js';
import { captionGeometry, checkStore, exportStore, groundedCaption, parseStoreTargets, pngGates, rgbPng, storeLayout, storeTargets, type StoreShot, type StoreTarget } from '../src/media/store.js';

const dirs:string[]=[];
const product={name:'Scope',claims:[{id:'local',text:'Keep work private',sources:[{type:'file',ref:'README.md'}]}],features:[{name:'Local history',description:'Review changes offline',sources:[{type:'file',ref:'README.md'}]}]};
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const cwd=await mkdtemp(join(tmpdir(),'store-shots-')); dirs.push(cwd);
  await mkdir(join(cwd,'.launch/media/shots'),{recursive:true});
  await writeFile(join(cwd,'.launch/product.json'),JSON.stringify(product));
  const shots=[{id:'work',route:'/',viewport:{width:800,height:600},claim:'local'}];
  await writeFile(join(cwd,'.launch/shots.yaml'),stringify({shots}));
  await writeFile(join(cwd,'.launch/media/shots/manifest.json'),JSON.stringify([{id:'work',kind:'web',files:['work.png']} ]));
  const source=png(800,600); await writeFile(join(cwd,'.launch/media/shots/work.png'),source);
  return {cwd,shots,source};
}
function png(width:number,height:number,background=[16,24,39],ink?:{box:{x:number;y:number;width:number;height:number};color:number[]}) {
  const image=new PNG({width,height});
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const text=ink && x>ink.box.x+20 && x<ink.box.x+80 && y>ink.box.y+20 && y<ink.box.y+50;
    const offset=(y*width+x)*4; image.data.set([...(text?ink.color:background),255],offset);
  }
  return PNG.sync.write(image,{colorType:2});
}
async function receipt(cwd:string,source:Buffer) {
  const target='og',layout=storeLayout(1200,630);
  const bytes=png(1200,630,[16,24,39],{box:layout.captionBox,color:[255,255,255]});
  const entry:StoreShot={target,order:1,file:'og/01-work.png',sourceShot:'work',sourceFile:'work.png',sourceSha256:sha(source),sha256:sha(bytes),caption:'Keep work private',claim:'local',captionBox:layout.captionBox,safeArea:layout.safeArea,deviceBox:layout.deviceBox,textColor:'#ffffff',style:'midnight'};
  await mkdir(join(cwd,'.launch/media/store/og'),{recursive:true});
  await writeFile(join(cwd,'.launch/media/store/og/01-work.png'),bytes);
  await saveReceipt(cwd,[entry]); return entry;
}
async function saveReceipt(cwd:string,entries:StoreShot[]) {await writeFile(join(cwd,'.launch/media/store/manifest.json'),JSON.stringify(entries));}
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});

describe('store screenshot pure gates',()=>{
  it('selects exact targets and rejects empty or unknown selections',()=>{
    expect(parseStoreTargets()).toEqual(Object.keys(storeTargets));
    expect(parseStoreTargets('og,play,og')).toEqual(['og','play']);
    for(const value of ['',',','unknown','og,','toString','../og']) expect(()=>parseStoreTargets(value)).toThrow('Targets');
    expect(Object.values(storeTargets)).toEqual([{width:1290,height:2796},{width:1242,height:2688},{width:1080,height:1920},{width:1270,height:760},{width:1200,height:630},{width:1600,height:900}]);
  });
  it('resolves sourced claim ids and feature names without inventing or shortening copy',()=>{
    expect(groundedCaption(product,{claim:'local'})).toEqual({claim:'local',caption:'Keep work private'});
    expect(groundedCaption(product,{claim:'features/Local history'}).caption).toBe('Review changes offline');
    expect(groundedCaption(product,{claim:'local',caption:'  Work privately  '}).caption).toBe('Work privately');
    for(const shot of [{caption:'Work privately'},{claim:'missing',caption:'Work privately'},{claim:'local',caption:''},{claim:'local',caption:'one two three four five six seven'}]) expect(()=>groundedCaption(product,shot)).toThrow();
    expect(()=>groundedCaption({claims:[{id:'local',text:'one two three four five six seven',sources:[{}]}]},{claim:'local'})).toThrow('Write a grounded caption');
    expect(()=>groundedCaption({claims:[{id:'local',text:'Work privately',sources:[]}]},{claim:'local'})).toThrow('resolvable');
    expect(()=>groundedCaption({},{})).toThrow('resolvable');
  });
  it('keeps every target caption inside 6% safe margins and above the fitted device',()=>{
    for(const {width,height} of Object.values(storeTargets)) {
      const {captionBox,safeArea,deviceBox}=storeLayout(width,height);
      expect(captionGeometry(captionBox,safeArea,deviceBox,width,height)).toBe(true);
      expect(captionGeometry({...captionBox,x:0},safeArea,deviceBox,width,height)).toBe(false);
      expect(captionGeometry(captionBox,{x:0,y:0,width,height},deviceBox,width,height)).toBe(false);
      expect(captionGeometry(captionBox,safeArea,{...deviceBox,y:captionBox.y},width,height)).toBe(false);
      expect(captionGeometry({...captionBox,width:0},safeArea,deviceBox,width,height)).toBe(false);
    }
  });
  it('measures PNG dimensions, actual RGB color type, caption ink and pixel contrast',()=>{
    const box=storeLayout(1200,630).captionBox;
    const bytes=png(1200,630,[16,24,39],{box,color:[255,255,255]});
    expect(pngGates(bytes,'og',box,'#ffffff').every(g=>g.status==='pass')).toBe(true);
    expect(pngGates(bytes,'x',box,'#ffffff').find(g=>g.id==='size')?.status).toBe('fail');
    const alpha=PNG.sync.write(PNG.sync.read(bytes),{colorType:6});
    expect(pngGates(alpha,'og',box,'#ffffff').find(g=>g.id==='rgb')?.status).toBe('fail');
    expect(pngGates(rgbPng(alpha),'og',box,'#ffffff').find(g=>g.id==='rgb')?.status).toBe('pass');
    const faint=png(1200,630,[220,220,220],{box,color:[255,255,255]});
    expect(pngGates(faint,'og',box,'#ffffff').find(g=>g.id==='contrast')?.status).toBe('fail');
    expect(pngGates(png(1200,630),'og',box,'#ffffff').find(g=>g.id==='contrast')?.status).toBe('fail');
    expect(pngGates(bytes,'og',{...box,x:-1},'#ffffff').find(g=>g.id==='contrast')?.status).toBe('fail');
    expect(()=>pngGates(Buffer.from('not png'),'og',box,'#ffffff')).toThrow();
  });
});

describe('store receipts and CLI',()=>{
  it('persists pass/skipped gates without Chrome and fails stale source captures',async()=>{
    const {cwd,source}=await fixture(); await receipt(cwd,source);
    vi.spyOn(runtime,'exec').mockRejectedValue(new Error('not installed'));
    const result=await checkStore(cwd);
    expect(result[0].gates.filter(g=>g.status==='fail')).toEqual([]);
    expect(result[0].gates.find(g=>g.id==='banned-content')?.status).toBe('skipped');
    await writeFile(join(cwd,'.launch/media/shots/work.png'),png(800,600,[0,0,0]));
    await expect(checkStore(cwd)).rejects.toThrow('Stale export');
    const gates=JSON.parse(await readFile(join(cwd,'.launch/media/store/check.json'),'utf8'))[0].gates;
    expect(gates.find((g:{id:string})=>g.id==='source').status).toBe('fail');
  });
  it('runs the existing banned-content OCR guard when available, including error cases',async()=>{
    const {cwd,source}=await fixture(); await receipt(cwd,source);
    vi.spyOn(runtime,'exec').mockResolvedValue({stdout:'available',stderr:''} as never);
    const ocr=vi.spyOn(banned,'ocrWords').mockResolvedValue({text:'Keep work private',words:[]});
    expect((await checkStore(cwd))[0].gates.find(g=>g.id==='banned-content')?.status).toBe('pass');
    ocr.mockResolvedValue({text:'foo',words:[]});
    await expect(checkStore(cwd)).rejects.toThrow('Banned content');
    ocr.mockRejectedValue(new Error('OCR failed'));
    await expect(checkStore(cwd)).rejects.toThrow('OCR failed');
  });
  it('fails modified exports, unresolved claims, unsafe geometry, order and changed membership',async()=>{
    const {cwd,source}=await fixture(); const entry=await receipt(cwd,source);
    vi.spyOn(runtime,'exec').mockRejectedValue(new Error('not installed'));
    await saveReceipt(cwd,[{...entry,claim:'missing',captionBox:{...entry.captionBox,x:0},order:2}]);
    await expect(checkStore(cwd)).rejects.toThrow('gallery-order');
    const results=JSON.parse(await readFile(join(cwd,'.launch/media/store/check.json'),'utf8'));
    expect(results[0].gates.filter((g:{status:string})=>g.status==='fail').map((g:{id:string})=>g.id)).toEqual(expect.arrayContaining(['caption','safe-area','file','gallery-order']));
    await saveReceipt(cwd,[entry]);
    await writeFile(join(cwd,'.launch/media/store/og/01-work.png'),png(1200,630));
    await expect(checkStore(cwd)).rejects.toThrow('Export changed');
    await writeFile(join(cwd,'.launch/media/shots/manifest.json'),'[]');
    await expect(checkStore(cwd)).rejects.toThrow('Capture no longer exists');
  });
  it('rejects sources outside the capture manifest, symlinks and empty manifests',async()=>{
    const {cwd,source}=await fixture(); const entry=await receipt(cwd,source);
    vi.spyOn(runtime,'exec').mockRejectedValue(new Error('not installed'));
    await saveReceipt(cwd,[{...entry,sourceFile:'../work.png'}]);
    await expect(checkStore(cwd)).rejects.toThrow('Source is not a PNG');
    await saveReceipt(cwd,[{...entry,sourceFile:'linked.png'}]);
    await writeFile(join(cwd,'outside.png'),source); await symlink(join(cwd,'outside.png'),join(cwd,'.launch/media/shots/linked.png'));
    await writeFile(join(cwd,'.launch/media/shots/manifest.json'),JSON.stringify([{id:'work',kind:'web',files:['linked.png']} ]));
    await expect(checkStore(cwd)).rejects.toThrow('Source escapes');
    await saveReceipt(cwd,[]); await expect(checkStore(cwd)).rejects.toThrow('No store exports');
  });
  it('exposes export/check JSON CLI errors without requiring Chrome',async()=>{
    const {cwd}=await fixture();
    for(const args of [['export','--targets','bad'],['check']]) {
      const result=await exec(process.execPath,['--import','tsx','src/cli.ts','--cwd',cwd,'--json','shots',...args]).catch(error=>error);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ok:false,command:`shots ${args[0]}`});
    }
  },30000);
});

it('exports all exact targets with money moment first and automatically checks real captured fixture pixels',async context=>{
  let app;
  try {app=await browser();} catch {context.skip(true,'Chrome unavailable'); return;}
  const {cwd,shots}=await fixture();
  const page=await app.newPage({viewport:{width:800,height:600}});
  try {
    await page.setContent('<body style="margin:0;background:#e8f0fa;font:32px Arial;padding:80px;color:#172238"><h1>Scope</h1><p>Local history</p><button>Review changes</button></body>');
    await page.screenshot({path:join(cwd,'.launch/media/shots/work.png')});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(cwd,'.launch/media/shots/moment.png')});
  } finally {await app.close();}
  const moment={...shots[0],id:'moment',moneyMoment:true,viewport:{width:390,height:844},caption:'Review changes privately'};
  await writeFile(join(cwd,'.launch/shots.yaml'),stringify({shots:[...shots,moment]}));
  await writeFile(join(cwd,'.launch/media/shots/manifest.json'),JSON.stringify([{id:'work',kind:'web',files:['work.png']},{id:'moment',kind:'mobile',files:['moment.png']}]));
  const result=await exportStore(cwd);
  expect(result.manifest).toHaveLength(12);
  expect(result.checks.flatMap(r=>r.gates).some(g=>g.status==='fail')).toBe(false);
  for(const target of parseStoreTargets()) {
    const gallery=result.manifest.filter(entry=>entry.target===target);
    expect(gallery.map(e=>e.sourceShot)).toEqual(['moment','work']);
    for(const entry of gallery) {
      expect(entry).toMatchObject({target,captionBox:expect.any(Object),safeArea:expect.any(Object),sourceSha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
      const bytes=await readFile(join(cwd,'.launch/media/store',entry.file));
      expect(pngGates(bytes,target,entry.captionBox,entry.textColor).every(g=>g.status==='pass')).toBe(true);
    }
  }
  const cli=await exec(process.execPath,['--import','tsx','src/cli.ts','--cwd',cwd,'--json','shots','check'],{timeout:30000});
  expect(JSON.parse(cli.stdout).ok).toBe(true);
},120000);
