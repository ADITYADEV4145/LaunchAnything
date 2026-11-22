import { strict as assert } from 'node:assert';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { stringify } from 'yaml';
import type { Check } from './types.js';
import type { MediaShot } from '../visuals/modern-shot.js';
import { planShots } from '../media/director.js';
import { takeShots } from '../visuals/shots.js';
import { makeImages } from '../visuals/images.js';
import { platforms, pngSize, type Size } from '../visuals/check.js';
import { judge } from '../media/judge.js';
import { scriptFromShots } from '../video/script.js';
import { render } from '../video/render.js';
import { check } from '../video/check.js';

export const checks: Check[] = [{name:'Part D storyboard safety, branded image set, heuristic judge and video durations',async run({cwd,fixture}) {
  if (!['cli-tool','saas-next'].includes(fixture)) return;
  const work=await mkdtemp(join(tmpdir(),'liftoff-media-'));
  const launch=join(work,'.launch');
  const source=fixture==='saas-next' ? await readFile(join(cwd,'app/page.tsx'),'utf8') : '';
  const markup=source.slice(source.indexOf('<main>'),source.indexOf('</main>')+7);
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end(req.url==='/unsafe' ? '<body><canvas width="1200" height="500"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.font="48px monospace";c.fillText("cat x | sed fixtures/",40,150)</script>' : `<body style="margin:0;padding:50px;background:#101827;color:white;font:36px Arial"><style>main{padding:30px}h1{font-size:54px}section{border:4px solid #77e5b3;padding:20px}a{color:#77e5b3}</style>${markup}</body>`);
  });
  try {
    await mkdir(launch,{recursive:true});
    const product=JSON.parse(await readFile(join(cwd,'.liftoff-fixture/product.json'),'utf8'));
    await cp(join(cwd,'package.json'),join(work,'package.json'));
    if (fixture==='cli-tool') await cp(join(cwd,'bin'),join(work,'bin'),{recursive:true});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const web=fixture==='saas-next';
    product.money_moment = web ? {summary:'See priorities in one place',before:product.problem,after:'See priorities in one place',proof:'Shared weekly board',route:'/',selector:'main',highlight:{selector:'section'}} :
      {summary:'Keep tasks in a portable JSON file',before:product.problem,after:'Keep tasks in a portable JSON file',proof:product.features[0].name,commands:['node bin/tasklight.js list'],setup:['node bin/tasklight.js add Prepare launch'],highlight:{text:'Prepare launch'}};
    await writeFile(join(launch,'product.json'),JSON.stringify(product));
    const planned=await planShots(work);
    assert.ok(planned.storyboard.shots.length>=4 && planned.storyboard.shots.length<=8);
    assert.equal(planned.storyboard.shots.filter(shot=>shot.moneyMoment).length,1);
    await writeFile(join(work,'prepare.cjs'),'require("node:fs").writeFileSync("preview.txt","cat x | sed fixtures/")');
    await writeFile(join(work,'preview.cjs'),'console.log(require("node:fs").readFileSync("preview.txt","utf8"))');
    const unsafe:MediaShot={id:'unsafe',viewport:{width:1200,height:700},...(web?{route:'/unsafe',deviceScale:2}:{setup:['node prepare.cjs'],commands:['node preview.cjs']})};
    await writeFile(join(launch,'shots.yaml'),stringify({shots:[unsafe]}));
    await assert.rejects(takeShots(work,{url}),/banned.*(?:shell-pipe|fixture-path)/);
    assert.equal((await readdir(join(launch,'media/shots'))).some(file=>file.startsWith('unsafe.')),false);
    const shots:MediaShot[]=planned.storyboard.shots.filter(shot=>shot.purpose!=='proof').map((shot):MediaShot=>{
      if (['hook','cta'].includes(shot.purpose)) return {id:shot.id,purpose:shot.purpose,caption:shot.caption,card:true,viewport:shot.viewport};
      return {...shot,themes:['light']};
    });
    await writeFile(join(launch,'shots.yaml'),stringify({shots}));
    await takeShots(work,{url});
    const images=await makeImages(work);assert.ok(images.every(image=>image.ok));
    const files=await readdir(join(launch,'media/images'));
    assert.equal(files.filter(file=>/^instagram-\d+\.png$/.test(file)).length,5);
    assert.ok(files.includes('product-hunt-1.png') && files.includes('product-hunt-2.png'));
    for(const file of files.filter(file=>file.endsWith('.png'))) {
      const size=file.replace(/-\d+(?=\.png$)/,'').replace(/\.png$/,'') as Size;
      assert.deepEqual(pngSize(await readFile(join(launch,'media/images',file))),{width:platforms[size].width,height:platforms[size].height});
    }
    assert.equal((await judge(work,{heuristicOnly:true})).ok,true);
    await scriptFromShots(work);
    await render(work,'ffmpeg',['16x9','9x16']);
    for(const video of await check(work,['16x9','9x16'])) assert.ok(video.duration>=(video.format==='16x9'?45:20) && video.duration<=(video.format==='16x9'?60:35));
  } finally {
    server.closeAllConnections();if(server.listening) await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(work,{recursive:true,force:true});
  }
}}];
