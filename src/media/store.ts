import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { browser, escapeHtml, exec } from '../visuals/runtime.js';
import { contrast } from '../visuals/check.js';
import type { MediaShot } from '../visuals/modern-shot.js';
import type { Gate } from '../video/script.js';
import { loadStyle, styleText } from '../video/styles.js';
import { mediaBrand, mediaFrame, mediaHost } from './assets.js';
import { assertClean, ocrWords } from './banned.js';

export const storeTargets = {
  'appstore-6.9': {width:1320,height:2868}, 'appstore-6.5': {width:1242,height:2688},
  play: {width:1080,height:1920}, 'product-hunt': {width:1270,height:760},
  og: {width:1200,height:630}, x: {width:1600,height:900},
} as const;
export type StoreTarget = keyof typeof storeTargets;
export interface Box { x:number; y:number; width:number; height:number }
interface Capture { id:string; kind:string; files:string[]; variants?:Record<string,string> }
export interface StoreShot {
  target:StoreTarget; order:number; file:string; sourceShot:string; sourceFile:string;
  sourceSha256:string; sha256:string; caption:string; claim:string;
  captionBox:Box; safeArea:Box; deviceBox:Box; textColor:string; style:string;
}
const hash = (bytes:Buffer) => createHash('sha256').update(bytes).digest('hex');
export function parseStoreTargets(value = Object.keys(storeTargets).join(',')): StoreTarget[] {
  const selected = [...new Set(value.split(','))];
  if (!selected.length || selected.some(t => !Object.hasOwn(storeTargets,t))) throw new Error(`Targets must be ${Object.keys(storeTargets).join(',')}`);
  return selected as StoreTarget[];
}
export function groundedCaption(product: {claims?:{id:string;text:string;sources?:unknown[]}[];features?:{name:string;description:string;sources?:unknown[]}[]}, shot: {claim?:string;caption?:string}) {
  const claim = product.claims?.find(c => c.id === shot.claim);
  const feature = shot.claim?.startsWith('features/') ? product.features?.find(f => f.name === shot.claim!.slice('features/'.length)) : undefined;
  const text = claim?.text ?? feature?.description;
  const sources = claim?.sources ?? feature?.sources;
  if (!text || !sources?.length) throw new Error('Caption requires a resolvable product claim id or features/<name> with sources');
  const caption = (shot.caption ?? text).trim();
  const count = caption.split(/\s+/).filter(Boolean).length;
  if (count < 1 || count > 6) throw new Error('Write a grounded caption of 1–6 words in shots.yaml; claim text cannot be auto-shortened');
  return {caption,claim:shot.claim!};
}
export function storeLayout(width:number,height:number): {safeArea:Box;captionBox:Box;deviceBox:Box;portrait:boolean} {
  const portrait = height > width;
  const mx = Math.ceil(width*.06), my = Math.ceil(height*.06);
  const safeArea = {x:mx,y:my,width:width-2*mx,height:height-2*my};
  const captionBox = {x:Math.ceil(width*.08),y:Math.ceil(height*.08),width:Math.floor(width*.84),height:Math.floor(height*(portrait?.14:.18))};
  const top = captionBox.y+captionBox.height+Math.ceil(height*.04);
  const available = {width:width*.84,height:height-my-top-12};
  const ratio = portrait ? 380/750 : 1200/650;
  const w = Math.min(available.width,available.height*ratio), h = w/ratio;
  return {safeArea,captionBox,deviceBox:{x:(width-w)/2,y:top+(available.height-h)/2,width:w,height:h},portrait};
}
export function inside(box:Box,outer:Box) {
  return [box.x,box.y,box.width,box.height,outer.x,outer.y,outer.width,outer.height].every(Number.isFinite) && box.width>0 && box.height>0 && box.x>=outer.x && box.y>=outer.y && box.x+box.width<=outer.x+outer.width && box.y+box.height<=outer.y+outer.height;
}
export function captionGeometry(caption:Box,safe:Box,device:Box,width:number,height:number) {
  const minimum = {x:width*.06,y:height*.06,width:width*.88,height:height*.88};
  return inside(safe,minimum) && inside(caption,safe) && device.width>0 && device.height>0 && caption.y+caption.height <= device.y;
}
export function rgbPng(bytes:Buffer) {
  const image=PNG.sync.read(bytes);
  for(let i=0;i<image.data.length;i+=4) {
    const alpha=image.data[i+3]/255;
    for(let c=0;c<3;c++) image.data[i+c]=Math.round(image.data[i+c]*alpha+255*(1-alpha));
    image.data[i+3]=255;
  }
  return PNG.sync.write(image,{colorType:2});
}
export function pngGates(bytes:Buffer,target:StoreTarget,box:Box,textColor:string): Gate[] {
  const image=PNG.sync.read(bytes), expected=storeTargets[target];
  const result = (id:string,pass:boolean,detail:string):Gate => ({id,name:id,status:pass?'pass':'fail',detail});
  const gates = [result('size',image.width===expected.width && image.height===expected.height,`${image.width}x${image.height}; expected ${expected.width}x${expected.height}`),result('rgb',bytes[25]===2,`PNG color type ${bytes[25]}; expected RGB (2)` )];
  if (!inside(box,{x:0,y:0,width:image.width,height:image.height}) || !/^#[\da-f]{6}$/i.test(textColor)) return [...gates,result('contrast',false,'Invalid caption box or text color')];
  const foreground=[1,3,5].map(i=>parseInt(textColor.slice(i,i+2),16));
  const pixel=(x:number,y:number)=>{const offset=(Math.floor(y)*image.width+Math.floor(x))*4;return [...image.data.subarray(offset,offset+3)];};
  const backgrounds = [pixel(box.x+2,box.y+2),pixel(box.x+box.width-3,box.y+2),pixel(box.x+2,box.y+box.height-3),pixel(box.x+box.width-3,box.y+box.height-3)];
  const ratio=Math.min(...backgrounds.map(background=>contrast(foreground,background)));
  let ink=false;
  for(let y=Math.ceil(box.y);y<box.y+box.height && !ink;y++) for(let x=Math.ceil(box.x);x<box.x+box.width;x++) {
    if(pixel(x,y).every((c,i)=>Math.abs(c-foreground[i])<=12)) { ink=true; break; }
  }
  gates.push(result('contrast',ratio>=4.5 && ink,`${ratio.toFixed(2)}:1 from rendered caption background; text pixels ${ink?'present':'missing'}; need 4.5:1`));
  return gates;
}
async function inputs(cwd:string) {
  const paths=launchDir(cwd);
  const spec=parse(await readFile(paths.shots,'utf8'));
  const valid=validateFile('shots',spec); if(!valid.valid) throw new Error(valid.errors.join('; '));
  const shots=spec.shots as MediaShot[];
  if (new Set(shots.map(s=>s.id)).size!==shots.length || shots.some(s=>!/^\w[\w-]*$/.test(s.id))) throw new Error('Shot ids must be unique safe filenames');
  const captures=JSON.parse(await readFile(join(paths.media,'shots/manifest.json'),'utf8')) as Capture[];
  if(!Array.isArray(captures) || new Set(captures.map(c=>c.id)).size!==captures.length) throw new Error('Invalid capture manifest');
  const product=JSON.parse(await readFile(paths.product,'utf8'));
  return {paths,shots,captures,product};
}
async function sourcePath(cwd:string,capture:Capture,file:string) {
  if(basename(file)!==file || !/\.png$/i.test(file) || !capture.files?.includes(file)) throw new Error('Source is not a PNG in the capture manifest');
  const root=await realpath(join(launchDir(cwd).media,'shots'));
  const path=await realpath(join(root,file));
  if(!path.startsWith(root+sep)) throw new Error('Source escapes captures directory');
  return path;
}
async function canOcr() { try { await exec('tesseract',['--version']); return true; } catch { return false; } }
export async function checkStore(cwd:string) {
  return checkStoreDirectory(cwd,join(launchDir(cwd).media,'store'));
}
async function checkStoreDirectory(cwd:string,dir:string) {
  const {paths,shots,captures,product}=await inputs(cwd);
  const entries=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')) as StoreShot[];
  if(!Array.isArray(entries) || !entries.length) throw new Error('No store exports; run shots export');
  const ordered=[...shots].sort((a,b)=>Number(Boolean(b.moneyMoment))-Number(Boolean(a.moneyMoment)));
  const ocr=await canOcr(); const results=[];
  for(const entry of entries) {
    const gates:Gate[]=[];
    const gate=async(id:string,work:()=>Promise<string>|string) => { try {gates.push({id,name:id,status:'pass',detail:await work()});} catch(e) {gates.push({id,name:id,status:'fail',detail:(e as Error).message});} };
    let bytes:Buffer|undefined;
    await gate('gallery-order',()=>{
      const gallery=entries.filter(e=>e.target===entry.target);
      if(gallery.length!==ordered.length || gallery.some((e,i)=>e.order!==i+1 || e.sourceShot!==ordered[i].id)) throw new Error('Gallery must contain every storyboard shot, money moment first, then storyboard order');
      return 'Money moment first, then complete storyboard order';
    });
    await gate('file',async()=>{
      if(!Object.hasOwn(storeTargets,entry.target) || entry.file!==`${entry.target}/${String(entry.order).padStart(2,'0')}-${entry.sourceShot}.png` || !/^\w[\w-]*$/.test(entry.sourceShot)) throw new Error('Invalid export filename or target');
      const root=await realpath(dir); const path=await realpath(resolve(root,entry.file));
      if(!path.startsWith(root+sep)) throw new Error('Export escapes store directory');
      bytes=await readFile(path); if(hash(bytes)!==entry.sha256) throw new Error('Export changed since rendering'); return 'Export matches receipt';
    });
    if(bytes) await gate('png',()=>{gates.push(...pngGates(bytes!,entry.target,entry.captionBox,entry.textColor));return 'PNG decoded';});
    await gate('caption',()=>{
      const shot=shots.find(s=>s.id===entry.sourceShot); if(!shot) throw new Error('Shot no longer exists');
      const grounded=groundedCaption(product,shot);
      if(grounded.caption!==entry.caption || grounded.claim!==entry.claim) throw new Error('Caption or claim is stale');
      return '1–6 words and product claim resolves';
    });
    await gate('safe-area',()=>{
      const size=storeTargets[entry.target]; if(!size || !captionGeometry(entry.captionBox,entry.safeArea,entry.deviceBox,size.width,size.height)) throw new Error('Caption must be inside 6% safe area and above device');
      return 'Caption is inside safe area and clear of device';
    });
    await gate('source',async()=>{
      const capture=captures.find(c=>c.id===entry.sourceShot); if(!capture) throw new Error('Capture no longer exists in manifest');
      const bytes=await readFile(await sourcePath(cwd,capture,entry.sourceFile));
      if(hash(bytes)!==entry.sourceSha256) throw new Error('Stale export: captured source changed since export');
      return 'Embedded capture source hash matches current real capture';
    });
    if(ocr && bytes) await gate('banned-content',async()=>{assertClean((await ocrWords(bytes!)).text,'store screenshot'); return 'OCR banned-content guard clean';});
    else gates.push({id:'banned-content',name:'banned-content',status:'skipped',detail:ocr?'Output unavailable':'Tesseract is not available'});
    results.push({file:entry.file,gates});
  }
  await writeFile(join(dir,'check.json'),JSON.stringify(results,null,2));
  const failed=results.flatMap(r=>r.gates.filter(g=>g.status==='fail').map(g=>`${r.file} ${g.id}: ${g.detail}`));
  if(failed.length) throw new Error(`Failed screenshot gates: ${failed.join('; ')}`);
  return results;
}
async function publishStore(candidate:string,destination:string,parent:string) {
  const backupRoot=await mkdtemp(join(parent,'.store-previous-'));
  const backup=join(backupRoot,'gallery'); let previous=false;
  try {
    try { await rename(destination,backup); previous=true; }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
    await rename(candidate,destination);
  } catch(error) {
    if(previous) await rename(backup,destination);
    await rm(backupRoot,{recursive:true,force:true});
    throw error;
  }
  await rm(backupRoot,{recursive:true,force:true}).catch(()=>{});
}
export async function exportStore(cwd:string,targets:StoreTarget[]=parseStoreTargets(),styleId='midnight') {
  const {paths,shots,captures,product}=await inputs(cwd);
  const style=await loadStyle(cwd,styleId), brand=await mediaBrand(cwd), host=await mediaHost(cwd,product);
  const ordered=[...shots].sort((a,b)=>Number(Boolean(b.moneyMoment))-Number(Boolean(a.moneyMoment)));
  if(!ordered.length) throw new Error('No captured shots to export');
  const prepared=await Promise.all(ordered.map(async shot=>{
    const capture=captures.find(c=>c.id===shot.id)!;
    if(!capture) throw new Error(`Missing capture for ${shot.id}; run shots first`);
    const file=capture.variants?.light ?? capture.files.find(f=>f.endsWith('.png'));
    if(!file) throw new Error(`Missing PNG for ${shot.id}`);
    const png=await readFile(await sourcePath(cwd,capture,file));
    const caption=groundedCaption(product,shot); assertClean(caption.caption,'store caption');
    return {shot,capture,file,png,...caption};
  }));
  await mkdir(paths.media,{recursive:true});
  const dir=await mkdtemp(join(paths.media,'.store-'));
  let app:Awaited<ReturnType<typeof browser>>|undefined; const report:StoreShot[]=[];
  try {
    app=await browser();
    for(const target of targets) {
      if(!Object.hasOwn(storeTargets,target)) throw new Error('Unknown store target');
      const {width,height}=storeTargets[target], layout=storeLayout(width,height);
      await mkdir(join(dir,target),{recursive:true});
      for(const [index,item] of prepared.entries()) {
        const {shot,capture,png}=item;
        const virtual=layout.portrait?{width:380,height:750}:{width:1200,height:650};
        const kind=layout.portrait?'phone':capture.kind==='terminal'?'terminal':'browser';
        const frame=await mediaFrame({...brand.colors,title:product.name,logo:brand.logo,logoClass:'',frameWidth:String(virtual.width),contentHeight:String(virtual.height-(layout.portrait?45:46)),kind,addressClass:'address',windowTitle:host||product.name,screenshot:`data:image/png;base64,${png.toString('base64')}`,caption:'',cardClass:'',hx:'0',hy:'0',hw:'0',hh:'0',ringDisplay:'none'});
        const framed=frame.replace('</style>',`html,body{width:100%;height:100%}.brand{display:none}body{padding:0;display:block;min-height:0;background:transparent}.window{width:100%;height:100%;box-sizing:border-box}.content{height:calc(100% - ${layout.portrait?25:46}px)}.content img{width:100%;height:100%;object-fit:contain}.phone .content{height:calc(100% - 25px)}</style>`);
        const {captionBox:c,deviceBox:d}=layout;
        const page=await app.newPage({viewport:{width,height},deviceScaleFactor:1});
        try {
          await page.route('**/*',route=>route.abort());
          await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,${style.palette.background.join(',')});width:${width}px;height:${height}px;overflow:hidden}.caption{position:absolute;left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;background:${style.palette.captionBackground};color:${style.palette.text};font:${style.typography.weight} ${Math.floor(width*(layout.portrait?.065:.04))}px/1.15 ${style.typography.fontFamily};border-radius:12px}.device{position:absolute;left:${d.x}px;top:${d.y}px;width:${d.width}px;height:${d.height}px}iframe{border:0;width:${virtual.width}px;height:${virtual.height}px;transform:scale(${d.width/virtual.width});transform-origin:top left}.logo{position:absolute;right:8%;bottom:2%;height:${height*.025}px;max-width:25%;object-fit:contain}</style><body><div class="caption">${escapeHtml(styleText(item.caption,style))}</div><div class="device"><iframe title="Captured product" srcdoc="${escapeHtml(framed)}"></iframe></div>${brand.logo?`<img class="logo" src="${escapeHtml(brand.logo)}">`:''}</body></html>`);
          await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
          const content=page.frames().find(f=>f.parentFrame()); if(!content) throw new Error('Capture frame did not load');
          await content.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(image=>image.getAttribute('src')).map(image=>image.decode()));});
          const fits=await page.locator('.caption').evaluate(el=>el.scrollHeight<=el.clientHeight && el.scrollWidth<=el.clientWidth);
          if(!fits) throw new Error(`Caption for ${shot.id} does not fit; write a shorter caption`);
          const bytes=rgbPng(await page.screenshot()); const file=`${target}/${String(index+1).padStart(2,'0')}-${shot.id}.png`;
          await writeFile(join(dir,file),bytes);
          report.push({target,order:index+1,file,sourceShot:shot.id,sourceFile:item.file,sourceSha256:hash(png),sha256:hash(bytes),caption:item.caption,claim:item.claim,captionBox:c,safeArea:layout.safeArea,deviceBox:d,textColor:style.palette.text,style:style.id});
        } finally {await page.close();}
      }
    }
    await writeFile(join(dir,'manifest.json'),JSON.stringify(report,null,2));
    const checks=await checkStoreDirectory(cwd,dir);
    await app.close(); app=undefined;
    await publishStore(dir,join(paths.media,'store'),paths.media);
    return {manifest:report,checks};
  } finally {try {await app?.close();} finally {await rm(dir,{recursive:true,force:true});}}
}
