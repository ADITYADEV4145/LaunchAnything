import type { Check } from './types.js';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadScript, media, validateScript } from '../video/script.js';
import { render } from '../video/render.js';
import { check } from '../video/check.js';
import { packageRoot } from '../core/package-root.js';

export async function prepareFixtureVideo(cwd:string,fixture:string) {
  const paths=launchDir(cwd);
  await mkdir(paths.video,{recursive:true});
  await mkdir(paths.media,{recursive:true});
  let captures=await media(cwd);
  let sceneFiles:string[]=captures;
  if (!captures.length) {
    const footage=join(packageRoot(),'templates/video/footage',fixture);
    await cp(footage,paths.media,{recursive:true});
    const manifest=JSON.parse(await readFile(join(footage,'manifest.json'),'utf8'));
    sceneFiles=manifest.sceneFiles;
    captures=await media(cwd);
  }
  if (!captures.length) throw new Error(`No captured footage for ${fixture}`);
  let product;
  try { product=JSON.parse(await readFile(paths.product,'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    product=JSON.parse(await readFile(join(cwd,'.liftoff-fixture/product.json'),'utf8'));
    await writeFile(paths.product,JSON.stringify(product));
  }
  const description=String(product.oneLiner).replace(/[.]$/,'');
  const parts=description.split(/\s(?:with|that|to)\s/);
  const headline=parts[0].split(/\s+/).slice(0,8).join(' ');
  const detail=parts.slice(1).join(' ').split(/\s+/).slice(0,8).join(' ') || product.name;
  const captions=[headline,product.features[0].name,detail,product.audience.who,product.name,product.features[0].name];
  const script={scenes:Array.from({length:6},(_,i)=>({shot:sceneFiles[i%sceneFiles.length],text:captions[i].split(/\s+/).slice(0,8).join(' '),duration:4.5}))};
  await writeFile(join(paths.video,'script.json'),JSON.stringify(script));
  return script;
}

export const checks: Check[] = [{ name: 'phase 4 auto/fallback rendering, captured references and video checks', async run({cwd,fixture}) {
  const start = Date.now();
  const paths = launchDir(cwd);
  const script=await prepareFixtureVideo(cwd,fixture);
  await loadScript(cwd);
  let rejected = false;
  try { await validateScript(cwd,{scenes:script.scenes.map(s => ({...s,shot:'phase4-missing.png'}))}); } catch { rejected = true; }
  if (!rejected) throw new Error('Missing captured shot was accepted');
  const selected = fixture === 'saas-next' ? ['16x9','9x16','1x1'] as const : ['1x1'] as const;
  const result = await render(cwd,fixture === 'saas-next' ? 'auto' : 'ffmpeg',[...selected]);
  await check(cwd,[...selected]);
  const elapsed = Date.now()-start;
  await mkdir(join(cwd,'.liftoff-fixture'),{recursive:true});
  await writeFile(join(cwd,'.liftoff-fixture','phase4-timing.json'),JSON.stringify({elapsedMs:elapsed,formats:selected,renderer:result.renderer}));
  if (elapsed > 300000) throw new Error(`Phase 4 exceeded five minutes: ${elapsed}ms`);
} }];
