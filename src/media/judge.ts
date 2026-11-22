import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile, copyFile, realpath } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { Browser } from 'playwright';
import { launchDir } from '../core/launch-dir.js';
import { browser, escapeHtml, exec } from '../visuals/runtime.js';
import { maskSecrets } from '../visuals/privacy.js';
import { dataImage, mediaBrand, optionalJson, storyboard } from './assets.js';
import { ocrWords, scanBanned, type OcrWord } from './banned.js';
import { terminalCapHeight, type TerminalRegion } from './terminal.js';

export interface Scores { readability: number; focus: number; brand: number; clutter: number }
export interface JudgeItem {
  file: string; sha256: string; scored: boolean; timestamp?: number; video?: string;
  banned: string[]; heuristic?: Scores; scores?: Scores; overall?: number; fixes: string[];
  terminalCapHeight?: number;
  metrics?: { confidence: number; capHeight: number; contrast: number; cornerWordmark: boolean; cornerLogo: boolean; highlightCount: number; wordsPerMegapixel: number; edgeDensity: number; salientArea: number };
}
export interface JudgeReport { ok: boolean; items: JudgeItem[]; errors: string[]; contactSheets: string[]; videoSheets: string[]; vision: string }
interface Asset { file: string; path: string; scored: boolean; timestamp?: number; video?: string }
export async function sampleVideoFrames(video:string,dir:string) {
  await exec('ffmpeg',['-y','-v','error','-i',video,'-vf','fps=1:start_time=0:round=up','-threads','1',join(dir,'%06d.png')],{timeout:240000});
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const keys = ['readability', 'focus', 'brand', 'clutter'] as const;
const fixes: Record<keyof Scores, string> = {
  readability: 're-render: increase main text size, use contrast >=7:1, and remove blur',
  focus: 're-render: show one clear money moment or highlight; remove competing content',
  brand: 're-render: add the product logo/wordmark in a corner and use brand colors',
  clutter: 're-render: reduce text and visual noise; crop to the relevant product content',
};
async function walk(root: string, excluded: string, workRoot: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    if (path === excluded || root.startsWith(workRoot) && entry.isDirectory() && entry.name.startsWith('.clip-')) continue;
    if (entry.isSymbolicLink()) throw new Error(`Media symlink is not allowed: ${maskSecrets(entry.name)}`);
    if (entry.isDirectory()) files.push(...await walk(path,excluded,workRoot));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
export async function hasJudgeMedia(cwd: string): Promise<boolean> {
  const paths = launchDir(cwd); const excluded = join(paths.media, 'judge');
  const files = (await Promise.all([walk(paths.media, excluded, paths.video), walk(paths.video, excluded, paths.video)])).flat();
  return files.some(file => /\.(png|jpe?g|webp|svg|bmp|tiff?|avif|mp4|webm|mov|gif)$/i.test(file));
}
function quantile(values: number[], fraction: number) { return values.length ? values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0; }
async function logoReference(app: Browser, logo: string): Promise<PNG | undefined> {
  if (!logo) return;
  const page = await app.newPage({viewport:{width:64,height:64}});
  try {
    await page.route('**/*', route => route.abort());
    await page.setContent(`<body style="margin:0;background:transparent"><img width="64" height="64" style="object-fit:contain" src="${escapeHtml(logo)}"></body>`);
    await page.locator('img').evaluate(async (el: HTMLImageElement) => el.decode());
    return PNG.sync.read(await page.screenshot({omitBackground:true}));
  } finally { await page.close(); }
}
function cornerLogo(image: PNG, logo?: PNG) {
  if (!logo) return false;
  const points: {x:number;y:number;rgb:number[]}[] = [];
  for (let y=4;y<64;y+=8) for (let x=4;x<64;x+=8) {
    const offset=(y*64+x)*4;
    if (logo.data[offset+3]>245) points.push({x,y,rgb:[logo.data[offset],logo.data[offset+1],logo.data[offset+2]]});
  }
  if (points.length<4) return false;
  points.sort((a,b)=>Math.max(...b.rgb)-Math.max(...a.rgb));
  const anchor=points[0];
  const close=(x:number,y:number,rgb:number[])=>{
    if (x<0 || y<0 || x>=image.width || y>=image.height) return false;
    const offset=(Math.round(y)*image.width+Math.round(x))*4;
    return rgb.every((channel,index)=>Math.abs(image.data[offset+index]-channel)<=50);
  };
  for (let y=0;y<image.height;y+=3) {
    if (y>image.height*.25 && y<image.height*.8) continue;
    for (let x=0;x<image.width;x+=3) {
      if (x>image.width*.4 && x<image.width*.6 || !close(x,y,anchor.rgb)) continue;
      for (let size=24;size<=Math.min(256,image.height*.2);size+=4) {
        const scale=size/64,left=x-anchor.x*scale,top=y-anchor.y*scale;
        if (left<0 || top<0 || left+size>image.width || top+size>image.height) continue;
        let matched=0;
        for (const point of points) if (close(left+point.x*scale,top+point.y*scale,point.rgb)) matched++;
        if (matched/points.length>=.9) return true;
      }
    }
  }
  return false;
}
function highlights(image: PNG, accent: number[], words: OcrWord[]) {
  const step=Math.max(1,Math.ceil(Math.max(image.width,image.height)/600));
  const width=Math.ceil(image.width/step),height=Math.ceil(image.height/step),mask=new Uint8Array(width*height);
  for(let y=Math.floor(height*.15);y<height*.85;y++) for(let x=Math.floor(width*.05);x<width*.95;x++) {
    const offset=(Math.min(image.height-1,y*step)*image.width+Math.min(image.width-1,x*step))*4;
    if(accent.every((value,index)=>Math.abs(image.data[offset+index]-value)<40)) mask[y*width+x]=1;
  }
  for(const word of words) {
    const left=Math.max(0,Math.floor((word.x-1)/step)),right=Math.min(width,Math.ceil((word.x+word.width+1)/step));
    const top=Math.max(0,Math.floor((word.y-1)/step)),bottom=Math.min(height,Math.ceil((word.y+word.height+1)/step));
    for(let y=top;y<bottom;y++) mask.fill(0,y*width+left,y*width+right);
  }
  const boxes: {left:number;right:number;top:number;bottom:number}[]=[];
  for(let index=0;index<mask.length;index++) {
    if(!mask[index]) continue;
    const queue=[index];mask[index]=0;let left=width,right=0,top=height,bottom=0;
    for(let head=0;head<queue.length;head++) {
      const current=queue[head],x=current%width,y=Math.floor(current/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const next of [x>0?current-1:-1,x+1<width?current+1:-1,current-width,current+width]) if(next>=0 && next<mask.length && mask[next]) { mask[next]=0;queue.push(next); }
    }
    const w=right-left+1,h=bottom-top+1,area=w*h/(width*height);
    if(w*step>=Math.max(15,image.width*.025) && h*step>=10 && w/h>=.4 && w/h<=30 && area>=.0001 && area<=.25 && queue.length/(w*h)<.7) {
      const rows=new Map<number,number[]>(),cols=new Map<number,number[]>();
      for(const pixel of queue) {
        const x=pixel%width,y=Math.floor(pixel/width);
        if(!rows.has(y)) rows.set(y,[]);rows.get(y)!.push(x);
        if(!cols.has(x)) cols.set(x,[]);cols.get(x)!.push(y);
      }
      const longest=(values:number[])=>{
        values.sort((a,b)=>a-b);let run=0,best=0,previous=-2;
        for(const value of values) { run=value===previous+1?run+1:1;best=Math.max(best,run);previous=value; }
        return best;
      };
      const horizontal=(from:number,to:number)=>[...rows].some(([y,values])=>y>=from && y<=to && longest(values)>=w*.45);
      const vertical=(from:number,to:number)=>[...cols].some(([x,values])=>x>=from && x<=to && longest(values)>=h*.35);
      const band=Math.max(1,Math.min(w,h)*.2);
      if(!horizontal(top,top+band) || !horizontal(bottom-band,bottom) || !vertical(left,left+band) || !vertical(right-band,right)) continue;
      const overlaps=boxes.filter(box=>box.left<=right && box.right>=left && box.top<=bottom && box.bottom>=top);
      for(const box of overlaps) { left=Math.min(left,box.left);right=Math.max(right,box.right);top=Math.min(top,box.top);bottom=Math.max(bottom,box.bottom);boxes.splice(boxes.indexOf(box),1); }
      boxes.push({left,right,top,bottom});
    }
  }
  return boxes.length;
}
function measure(image: PNG, words: OcrWord[], name: string, colors: {background:string;accent:string}, keywords: string[], critical: boolean, logo?: PNG) {
  const {width, height, data} = image;
  const valid = words.filter(word => word.conf >= 0 && word.text.length > 1);
  const mainHeight = quantile(valid.map(word => word.height), .95);
  const large = valid.filter(word => word.height >= mainHeight * .7);
  const confidence = valid.length ? valid.reduce((sum, word) => sum + word.conf, 0) / valid.length : 0;
  const capHeight = quantile(large.map(word => word.height), .5) / height;
  const ratios = large.map(word => {
    const pixels: number[] = [];
    const stride = Math.max(1, Math.floor(Math.sqrt(word.width * word.height / 2500)));
    for (let y = Math.max(0, word.y - 2); y < Math.min(height, word.y + word.height + 2); y += stride) for (let x = Math.max(0, word.x - 2); x < Math.min(width, word.x + word.width + 2); x += stride) {
      const offset = (y * width + x) * 4;
      const rgb = [data[offset], data[offset + 1], data[offset + 2]];
      const luminance = rgb.map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
      pixels.push(luminance[0] * .2126 + luminance[1] * .7152 + luminance[2] * .0722);
    }
    return (quantile(pixels, .95) + .05) / (quantile(pixels, .05) + .05);
  });
  const textContrast = quantile(ratios, .5);
  const names = name.split(/\s+/).map(normalize).filter(Boolean);
  const corner = valid.filter(word => (word.y < height * .25 || word.y + word.height > height * .8) && (word.x < width * .4 || word.x + word.width > width * .6));
  const cornerWordmark = names.length > 0 && names.every(token => corner.some(word => normalize(word.text) === token));
  const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const bg = rgb(colors.background), accent = rgb(colors.accent);
  const logoPresent = !cornerWordmark && cornerLogo(image,logo);
  const highlightCount = highlights(image,accent,valid);
  let edges = 0, samples = 0, background = 0, accents = 0;
  const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 500000)));
  for (let y = 0; y < height - 1; y += stride) for (let x = 0; x < width - 1; x += stride) {
    const offset = (y * width + x) * 4; samples++;
    if (bg.every((value, channel) => Math.abs(data[offset + channel] - value) < 30)) background++;
    if (accent.every((value, channel) => Math.abs(data[offset + channel] - value) < 45)) accents++;
    if ([0, 1, 2].some(channel => Math.abs(data[offset + channel] - data[offset + 4 + channel]) > 45 || Math.abs(data[offset + channel] - data[offset + width * 4 + channel]) > 45)) edges++;
  }
  const edgeDensity = edges / Math.max(1, samples);
  const wordsPerMegapixel = valid.length / (width * height / 1e6);
  const bounds = large.length ? { x: Math.min(...large.map(word => word.x)), y: Math.min(...large.map(word => word.y)), right: Math.max(...large.map(word => word.x + word.width)), bottom: Math.max(...large.map(word => word.y + word.height)) } : undefined;
  const salientArea = bounds ? (bounds.right - bounds.x) * (bounds.bottom - bounds.y) / (width * height) : 0;
  const relevant = valid.some(word => keywords.some(keyword => normalize(word.text).includes(keyword)));
  const scores: Scores = {
    readability: Math.min(confidence >= 85 ? 10 : confidence >= 70 ? 8 : 5, capHeight >= .025 ? 10 : capHeight >= .018 ? 8 : 5, textContrast >= 7 ? 10 : 4),
    focus: (salientArea >= .003 && salientArea <= .75 || highlightCount===1) && (!critical || relevant || highlightCount===1) && highlightCount<=1 ? 9 : 5,
    brand: cornerWordmark || logoPresent ? Math.min(10, 8 + Number(background / Math.max(1, samples) >= .05) + Number(accents / Math.max(1, samples) >= .00005)) : 4,
    clutter: Math.min(wordsPerMegapixel <= 220 ? 10 : wordsPerMegapixel <= 400 ? 8 : 5, edgeDensity <= .12 ? 10 : edgeDensity <= .22 ? 8 : 4),
  };
  return { scores, metrics: { confidence, capHeight, contrast: textContrast, cornerWordmark, cornerLogo:logoPresent, highlightCount, wordsPerMegapixel, edgeDensity, salientArea } };
}
async function sheets(app: Browser, assets: Asset[], items: JudgeItem[], dir: string, prefix: string, pageSize: number) {
  const files: string[] = [];
  for (let start = 0; start < assets.length; start += pageSize) {
    const batch = assets.slice(start, start + pageSize); const columns = Math.min(4, batch.length);
    const cells = await Promise.all(batch.map(async asset => {
      const item = items.find(item => item.file === maskSecrets(asset.file))!;
      const content = item.banned.length ? `<strong>BANNED: ${escapeHtml(item.banned.join(', '))}</strong>` : `<img src="${await dataImage(asset.path)}">`;
      return `<article><div>${content}</div><footer>${escapeHtml(maskSecrets(asset.file))}<br>${asset.scored ? 'QUALITY + SAFETY' : 'SAFETY ONLY'}${item.overall === undefined ? '' : ` · ${item.overall}/10`}</footer></article>`;
    }));
    const page = await app.newPage({ viewport: {width: columns * 360, height: Math.ceil(batch.length / columns) * 250}, deviceScaleFactor: 1 });
    const path = join(dir, `${prefix}${start ? `-${Math.floor(start / pageSize) + 1}` : ''}.png`);
    try {
      await page.route('**/*', route => route.abort());
      await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#101827;color:white;font:12px Arial;display:grid;grid-template-columns:repeat(${columns},360px)}article{padding:12px;border:1px solid #334155;height:250px}article div{height:190px;display:flex;align-items:center;justify-content:center;background:#080e18}img{max-width:100%;max-height:100%;object-fit:contain}footer{padding-top:6px;overflow-wrap:anywhere;color:#dbeafe}strong{color:#ffb4b4}</style><body>${cells.join('')}</body></html>`);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      await page.screenshot({path}); files.push(path);
    } finally { await page.close(); }
  }
  return files;
}

/** OCR all local media; score finished images and rendered frames. Vision items use {file, sha256, readability, focus, brand, clutter}; hard safety/provenance rules cannot be overridden. */
export async function judge(cwd: string, options: { heuristicOnly?: boolean; writeVisionTemplate?: boolean } = {}): Promise<JudgeReport> {
  const paths = launchDir(cwd); const dir = join(paths.media, 'judge'); await mkdir(dir, {recursive:true});
  await rm(join(dir, 'report.json'), {force:true});
  const report: JudgeReport = {ok:false,items:[],errors:[],contactSheets:[],videoSheets:[],vision:options.heuristicOnly ? 'heuristic-only' : 'not-provided'};
  const app = await browser();
  try {
    await rm(join(dir, 'frames'), {recursive:true,force:true}); await mkdir(join(dir, 'frames'));
    for(const file of await readdir(dir)) if(/^(?:contact-sheet|video-[a-f0-9]{12})(?:-\d+)?\.png$/.test(file)) await rm(join(dir,file));
    const files = [...await walk(paths.media,dir,paths.video), ...await walk(paths.video,dir,paths.video)];
    const assets: Asset[] = [], images: Asset[] = []; const videos = new Map<string, Asset[]>();
    const label = (path: string) => relative(cwd, path).split('\\').join('/');
    for (const path of files) {
      const file = label(path); const extension = extname(path).toLowerCase();
      const image = /\.(png|jpe?g|webp|svg|bmp|tiff?|avif)$/.test(extension);
      const video = /\.(mp4|webm|mov|gif)$/.test(extension);
      if (!image && !video) continue;
      const id = hash(Buffer.from(file)).slice(0, 12);
      if (video) {
        const frameDir = join(dir, 'frames', id); await mkdir(frameDir);
        try { await sampleVideoFrames(path,frameDir); }
        catch { throw new Error(`Unable to sample video: ${maskSecrets(file)}`); }
        const scored = path.startsWith(paths.video + '/') || path.startsWith(join(paths.media,'images') + '/') || path.startsWith(join(paths.media,'polished') + '/');
        const frames = (await readdir(frameDir)).filter(file => file.endsWith('.png')).sort().map((frame, index) => ({file:`${file}@${index}s`,path:join(frameDir,frame),scored,timestamp:index,video:file}));
        if (!frames.length) throw new Error(`Video has no sampled frames: ${maskSecrets(file)}`);
        assets.push(...frames); videos.set(file,frames);
      } else {
        let raster = path;
        if (extension !== '.png') {
          raster = join(dir, 'frames', `${id}.png`);
          if (extension === '.svg') {
            const page = await app.newPage({viewport:{width:1024,height:1024}});
            try { await page.route('**/*', route => route.abort()); await page.setContent(`<img style="max-width:1000px;max-height:1000px" src="${await dataImage(path)}">`); await page.locator('img').evaluate(async (el: HTMLImageElement) => el.decode()); await page.locator('img').screenshot({path:raster}); }
            finally { await page.close(); }
          } else {
            try { await exec('ffmpeg',['-y','-v','error','-i',path,'-frames:v','1','-threads','1',raster]); } catch { throw new Error(`Unable to decode image: ${maskSecrets(file)}`); }
          }
        }
        const asset = {file,path:raster,scored:path.startsWith(join(paths.media,'images') + '/') || path.startsWith(join(paths.media,'polished') + '/')};
        assets.push(asset); images.push(asset);
      }
    }
    if (!assets.length) throw new Error('No media found to judge');
    const planned = await storyboard(cwd); const money = planned?.find(shot => shot.moneyMoment);
    const product = await optionalJson(paths.product); const brand = await mediaBrand(cwd); const logo = await logoReference(app,brand.logo);
    const keywords = (money?.caption ?? '').split(/\s+/).map(normalize).filter(word => word.length >= 4 && !['before','after','your','with','they','from','that','this'].includes(word));
    const imageRecords = await optionalJson(join(paths.media, 'images/report.json'));
    const polishedRecords = await optionalJson(join(paths.media, 'polished/manifest.json'));
    for (const asset of assets) {
      const png = await readFile(asset.path); const ocr = await ocrWords(png); const banned = scanBanned(ocr.text);
      const item: JudgeItem = {file:maskSecrets(asset.file),sha256:hash(asset.video ? png : await readFile(resolve(cwd, asset.file))),scored:asset.scored,timestamp:asset.timestamp,video:asset.video ? maskSecrets(asset.video) : undefined,banned,fixes:[]};
      if (banned.length) report.errors.push(`${maskSecrets(asset.file)}: banned ${banned.join(', ')}`);
      if (asset.scored) {
        const measured = measure(PNG.sync.read(png),ocr.words,String(product.name ?? 'Product'),brand.colors,keywords,Boolean(planned) && /\/(?:x|product-hunt-1|og)\.png$/.test(asset.file),logo);
        item.heuristic = measured.scores; item.scores = {...measured.scores}; item.metrics = measured.metrics;
        let terminalBox: TerminalRegion | undefined;
        if (asset.video) {
          const receipt = await optionalJson(resolve(cwd, asset.video) + '.json');
          let start = 0;
          for (const scene of receipt.scenes ?? []) {
            if (asset.timestamp! >= start && asset.timestamp! < start + scene.duration) { terminalBox = scene.terminal?.box; break; }
            start += scene.duration;
          }
        } else {
          const record = Array.isArray(imageRecords) ? imageRecords.find(record => resolve(paths.media, 'images', record.file) === asset.path) : undefined;
          const polished = Array.isArray(polishedRecords) ? polishedRecords.find(record => resolve(paths.media, 'polished', record.file) === asset.path) : undefined;
          terminalBox = record?.terminal?.box ?? polished?.terminalBox;
        }
        item.terminalCapHeight = terminalCapHeight(ocr.words, PNG.sync.read(png).height, terminalBox);
        if (item.terminalCapHeight !== undefined && item.terminalCapHeight < .022) {
          item.scores.readability = Math.min(item.scores.readability, 5);
          item.heuristic.readability = item.scores.readability;
          report.errors.push(`${maskSecrets(asset.file)}: terminal text cap height below 2.2%; reflow the transcript at a larger font, never crop`);
        }
      }
      report.items.push(item);
    }
    const provenance = await optionalJson(join(paths.media,'images/report.json'));
    for (const name of planned ? ['x.png','product-hunt-1.png'] : []) {
      if (!images.some(asset => asset.file === label(join(paths.media,'images',name)))) continue;
      const record = Array.isArray(provenance) ? provenance.find(item => item.file === name) : undefined;
      let correct = false;
      if (money && typeof record?.source === 'string' && (!record.shot || record.shot === money.id)) {
        try {
          const source = await realpath(resolve(cwd,record.source));
          for (const suffix of ['', '-dark']) { try { if (source === await realpath(join(paths.media,'polished',`${money.id}${suffix}.png`))) correct = true; } catch { /* A theme variant is optional. */ } }
        } catch { /* Missing sources cannot prove provenance. */ }
      }
      if (!correct) report.errors.push(`${name}: provenance must identify the polished money-moment shot; regenerate images from the storyboard`);
    }
    if (!options.heuristicOnly) {
      let vision;
      try { vision=JSON.parse(await readFile(join(dir,'vision.json'),'utf8')); }
      catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') { report.errors.push('Invalid vision.json: expected valid JSON');report.vision='invalid'; } }
      if (vision !== undefined) {
        const errorsBefore=report.errors.length;
        if (!vision || !Array.isArray(vision.items)) report.errors.push('Invalid vision.json: expected items with file, sha256 and four numeric scores');
        const seen = new Set<string>();
        for (const entry of Array.isArray(vision?.items) ? vision.items : []) {
          const item = report.items.find(item => item.file === entry?.file && item.scored);
          if (!item || entry.sha256 !== item.sha256 || seen.has(entry.file)) { report.errors.push(`Stale or mismatched vision.json asset: ${maskSecrets(String(entry?.file ?? '(missing file)'))}`); continue; }
          if (!keys.every(key => typeof entry[key] === 'number' && Number.isFinite(entry[key]) && entry[key] >= 0 && entry[key] <= 10)) { report.errors.push(`Invalid vision scores for ${maskSecrets(item.file)}; each score must be 0–10`); continue; }
          item.scores = Object.fromEntries(keys.map(key => [key,entry[key]])) as unknown as Scores; seen.add(entry.file);
        }
        report.vision = report.errors.length>errorsBefore ? 'invalid' : 'per-asset overrides';
      }
    }
    for (const item of report.items) if (item.scores) {
      item.overall = Math.min(...Object.values(item.scores));
      item.fixes = keys.filter(key => item.scores![key] < 8).map(key => `${key}: ${fixes[key]}`);
      report.errors.push(...item.fixes.map(fix => `${maskSecrets(item.file)}: ${fix}`));
    }
    images.sort((a,b) => Number(b.scored) - Number(a.scored) || a.file.localeCompare(b.file));
    report.contactSheets = await sheets(app,images,report.items,dir,'contact-sheet',24);
    for (const [video,frames] of videos) report.videoSheets.push(...await sheets(app,frames,report.items,dir,`video-${hash(Buffer.from(video)).slice(0,12)}`,120));
    if (!report.contactSheets.length && report.videoSheets.length) { await copyFile(report.videoSheets[0],join(dir,'contact-sheet.png')); report.contactSheets.push(join(dir,'contact-sheet.png')); }
    if (options.writeVisionTemplate) await writeFile(join(dir,'vision-template.json'),JSON.stringify({items:report.items.filter(item => item.scored).map(item => ({file:item.file,sha256:item.sha256,readability:null,focus:null,brand:null,clutter:null,notes:'Review this asset, supply 0–10 scores, and save as vision.json'}))},null,2));
    report.ok = report.errors.length === 0;
  } catch (error) { report.errors.push(maskSecrets((error as Error).message)); }
  finally { await app.close(); await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)); }
  if (!report.ok) throw new Error(`Media judge failed:\n${report.errors.join('\n')}`);
  return report;
}
