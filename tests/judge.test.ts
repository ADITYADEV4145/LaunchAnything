import { afterEach, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { judge, type JudgeReport } from '../src/media/judge.js';
import { browser, exec } from '../src/visuals/runtime.js';
import { buildReview } from '../src/review/page.js';

const dirs: string[] = [];
const logo='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="10" fill="#77e5b3"/><path d="M10 27V13h20v14H10zm6-5h8v-4h-8z" fill="#101827" fill-rule="evenodd"/></svg>';
afterEach(async()=>{ await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true}))); });
async function picture(path: string, text='Catch unknown exports', color='#ffffff', bg='#101827', branded=true, logoOnly=false) {
  const app=await browser();
  try {
    const page=await app.newPage({viewport:{width:1200,height:700},deviceScaleFactor:1});
    await page.setContent(`<body style="margin:0;background:${bg};color:${color};font-family:Arial;padding:60px"><header style="font-size:38px;font-weight:bold">${branded?logoOnly?logo:'Scope':''}</header><main style="font-size:68px;font-weight:bold;margin-top:120px;border-left:6px solid ${branded?'#77e5b3':color};padding:20px">${text}</main></body>`);
    await page.screenshot({path});
  } finally { await app.close(); }
}
async function fixture() {
  const cwd=await mkdtemp(join(tmpdir(),'judge-')); dirs.push(cwd);
  const media=join(cwd,'.launch/media');
  for (const dir of ['images','polished','shots']) await mkdir(join(media,dir),{recursive:true});
  await mkdir(join(cwd,'.launch/video'));
  await writeFile(join(cwd,'.launch/product.json'),JSON.stringify({name:'Scope'}));
  const shots=['hook','before','after','cta'].map(purpose=>({id:purpose,purpose,caption:'Catch unknown exports',viewport:{width:1200,height:700},...(purpose==='after'?{moneyMoment:true}:{}),commands:['node app.cjs']}));
  await writeFile(join(cwd,'.launch/shots.yaml'),JSON.stringify({shots}));
  await picture(join(media,'polished/after.png')); await picture(join(media,'polished/before.png'),'Inspect local source');
  for (const file of ['x.png','product-hunt-1.png']) await copyFile(join(media,'polished/after.png'),join(media,'images',file));
  await picture(join(media,'shots/raw.png'),'Ready','#ffffff','#101827',false);
  await writeFile(join(media,'images/report.json'),JSON.stringify(['x.png','product-hunt-1.png'].map(file=>({file,shot:'after',source:join(media,'polished/after.png')}))));
  return cwd;
}
async function report(cwd:string):Promise<JudgeReport> { return JSON.parse(await readFile(join(cwd,'.launch/media/judge/report.json'),'utf8')); }
async function overrides(cwd:string, items:JudgeReport['items']) {
  await writeFile(join(cwd,'.launch/media/judge/vision.json'),JSON.stringify({items:items.filter(item=>item.scored).map(item=>({file:item.file,sha256:item.sha256,readability:9,focus:9,brand:9,clutter:9}))}));
}

it('judges a clean storyboard set and rendered frames, scans unbranded raw captures without quality scoring, and excludes its own outputs',async()=>{
  const cwd=await fixture();
  await exec('ffmpeg',['-y','-v','error','-loop','1','-i',join(cwd,'.launch/media/polished/after.png'),'-t','2','-r','12','-c:v','libx264','-pix_fmt','yuv420p','-threads','1',join(cwd,'.launch/video/demo.mp4')]);
  const result=await judge(cwd,{writeVisionTemplate:true}); expect(result.ok).toBe(true);
  expect(result.items.filter(item=>item.video)).toHaveLength(2); expect(result.videoSheets).toHaveLength(1);
  expect(result.items.find(item=>item.file.endsWith('shots/raw.png'))).toMatchObject({scored:false,banned:[]});
  expect(result.items.filter(item=>item.scored).every(item=>item.overall!>=8)).toBe(true);
  expect((await readFile(result.contactSheets[0])).subarray(1,4).toString()).toBe('PNG');
  const template=JSON.parse(await readFile(join(cwd,'.launch/media/judge/vision-template.json'),'utf8'));
  expect(template.items[0]).toMatchObject({sha256:expect.stringMatching(/^[a-f0-9]{64}$/),readability:null});
  await overrides(cwd,result.items); expect((await judge(cwd)).items).toHaveLength(result.items.length);
},120000);

it('scores a letterboxed terminal with a readable main caption independently of small UI copy and corner branding',async()=>{
  const cwd=await fixture(); const path=join(cwd,'.launch/media/images/portrait.png');
  const app=await browser();
  try {
    const page=await app.newPage({viewport:{width:720,height:1280}});
    await page.setContent(`<body style="margin:0;background:#101827;color:white;font-family:Arial"><header style="position:absolute;left:36px;top:40px;font-size:32px">Scope</header><pre style="position:absolute;left:50px;top:400px;font-size:13px">${Array(6).fill('BLOCK grounding: inspect the missing export in local source').join('\n')}</pre><div style="position:absolute;left:36px;top:900px;width:640px;border-left:5px solid #77e5b3;font-size:60px;font-weight:bold;padding:15px">Catch unknown exports before they ship</div></body>`);
    await page.screenshot({path});
  } finally { await app.close(); }
  const item=(await judge(cwd)).items.find(item=>item.file.endsWith('/portrait.png'))!;
  expect(item.scores!.focus).toBeGreaterThanOrEqual(8);
  expect(item.scores!.readability).toBeGreaterThanOrEqual(8);
});

it('fails banned video frames with timestamps and rule names, without reproducing OCR content',async()=>{
  const cwd=await fixture(); const bad=join(cwd,'bad.png'); await picture(bad,'sed log | grep fixtures/');
  await exec('ffmpeg',['-y','-v','error','-loop','1','-t','1','-i',join(cwd,'.launch/media/polished/after.png'),'-loop','1','-t','1','-i',bad,'-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-r','12','-c:v','libx264','-pix_fmt','yuv420p','-threads','1',join(cwd,'.launch/video/unsafe.mp4')]);
  await expect(judge(cwd)).rejects.toThrow(/unsafe\.mp4@1s: banned.*shell-pipe/);
  const saved=await report(cwd); expect(saved.items.find(item=>item.timestamp===1)?.banned).toContain('fixture-path');
  expect(JSON.stringify(saved)).not.toContain('sed log');
  await overrides(cwd,saved.items); await expect(judge(cwd)).rejects.toThrow('banned');
},120000);

it('rejects stale per-asset vision hashes and allows valid scores to override rather than take the minimum',async()=>{
  const cwd=await fixture(); const initial=await judge(cwd);
  const item=initial.items.find(item=>item.file.endsWith('images/x.png'))!;
  await writeFile(join(cwd,'.launch/media/judge/vision.json'),JSON.stringify({items:[{file:item.file,sha256:'0'.repeat(64),readability:9,focus:9,brand:9,clutter:9}]}));
  await expect(judge(cwd)).rejects.toThrow('Stale or mismatched vision.json');
  await rm(join(cwd,'.launch/media/judge/vision.json'));
  await picture(join(cwd,item.file),'Catch unknown exports','#737373','#777777');
  await expect(judge(cwd)).rejects.toThrow('readability: re-render');
  const failed=await report(cwd); const low=failed.items.find(asset=>asset.file===item.file)!;
  expect(low.metrics!.contrast).toBeLessThan(7); expect(low.heuristic!.readability).toBeLessThan(8);
  await overrides(cwd,failed.items); const accepted=await judge(cwd);
  expect(accepted.items.find(asset=>asset.file===item.file)!.scores!.readability).toBe(9);
},120000);

it('fails non-money source provenance even with valid vision overrides',async()=>{
  const cwd=await fixture(); const initial=await judge(cwd); await overrides(cwd,initial.items);
  const path=join(cwd,'.launch/media/images/report.json'); const entries=JSON.parse(await readFile(path,'utf8'));
  entries[0].source=join(cwd,'.launch/media/polished/before.png'); await writeFile(path,JSON.stringify(entries));
  await expect(judge(cwd)).rejects.toThrow('x.png: provenance must identify');
},120000);

it('gates storyboard review on banned raw captures and writes an actionable empty-input report',async()=>{
  const cwd=await fixture(); await picture(join(cwd,'.launch/media/shots/raw.png'),'cat log | grep fixtures/');
  await expect(buildReview(cwd)).rejects.toThrow('shots/raw.png: banned');
  await rm(join(cwd,'.launch/shots.yaml'));
  await expect(buildReview(cwd)).rejects.toThrow('shots/raw.png: banned');
  const empty=await mkdtemp(join(tmpdir(),'judge-empty-')); dirs.push(empty);
  await expect(judge(empty)).rejects.toThrow('No media found'); expect((await report(empty)).ok).toBe(false);
},120000);

it('detects the actual corner logo even when OCR has no product wordmark',async()=>{
  const cwd=await fixture(); await writeFile(join(cwd,'.launch/media/logo.svg'),logo);
  await picture(join(cwd,'.launch/media/images/logo-only.png'),'Catch unknown exports','#ffffff','#101827',true,true);
  const result=await judge(cwd);
  const item=result.items.find(item=>item.file.endsWith('/logo-only.png'))!;
  expect(item.metrics).toMatchObject({cornerWordmark:false,cornerLogo:true}); expect(item.scores!.brand).toBeGreaterThanOrEqual(8);
},120000);

it('counts nested rings as one highlight but rejects two separate focus targets',async()=>{
  const cwd=await fixture(); const path=join(cwd,'.launch/media/images/rings.png');
  const box=(left:number,top:number,width:number,height:number)=>`<span style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:3px solid #77e5b3"></span>`;
  await picture(path,'Catch unknown exports<span style="color:#77e5b3;text-decoration:underline;position:absolute;left:200px;top:450px;font-size:40px">Simple pricing</span>');
  expect((await judge(cwd)).items.find(item=>item.file.endsWith('/rings.png'))!.metrics!.highlightCount).toBe(0);
  await picture(path,`Catch unknown exports${box(100,450,200,90)}${box(110,460,180,70)}`);
  const clean=await judge(cwd); expect(clean.items.find(item=>item.file.endsWith('/rings.png'))!.metrics!.highlightCount).toBe(1);
  await picture(path,`Catch unknown exports${box(100,450,200,90)}${box(600,450,200,90)}`);
  await expect(judge(cwd)).rejects.toThrow('rings.png: focus: re-render');
},120000);

it('scans nested raw directories and never reproduces secret OCR text in errors or the report',async()=>{
  const cwd=await fixture(); const nested=join(cwd,'.launch/media/shots/judge'); await mkdir(nested);
  await picture(join(nested,'private.png'),'owner@example.com','#ffffff','#101827',false);
  await expect(judge(cwd)).rejects.toThrow('shots/judge/private.png: banned email');
  const saved=await readFile(join(cwd,'.launch/media/judge/report.json'),'utf8'); expect(saved).not.toContain('owner@example.com');
},120000);
