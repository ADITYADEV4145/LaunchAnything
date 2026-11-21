import type { Check } from './types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadScript, media, validateScript } from '../video/script.js';
import { render, run } from '../video/render.js';
import { check } from '../video/check.js';

export const checks: Check[] = [{ name: 'phase 4 ffmpeg fallback, captured references and video checks', async run({cwd,fixture}) {
  const start = Date.now();
  const paths = launchDir(cwd);
  await mkdir(paths.video,{recursive:true});
  await mkdir(paths.media,{recursive:true});
  let captures = await media(cwd);
  if (!captures.length) {
    const file = 'phase4-standin.png';
    await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=0x17243a:s=640x360','-vf',"drawbox=x=20:y=20:w=600:h=40:color=0x468aff:t=fill,drawbox=x=20:y=80:w=150:h=250:color=0x263c59:t=fill,drawbox=x=190:y=80:w=430:h=100:color=0x365572:t=fill",'-frames:v','1','-threads','1',join(paths.media,file)]);
    captures = [file];
  }
  const script = {scenes:Array.from({length:6},(_,i) => ({shot:captures[i % captures.length],text:`Phase four product workflow ${i+1}`,duration:5}))};
  await writeFile(join(paths.video,'script.json'),JSON.stringify(script));
  await loadScript(cwd);
  let rejected = false;
  try { await validateScript(cwd,{scenes:script.scenes.map(s => ({...s,shot:'phase4-missing.png'}))}); } catch { rejected = true; }
  if (!rejected) throw new Error('Missing captured shot was accepted');
  const selected = fixture === 'saas-next' ? ['16x9','9x16','1x1'] as const : ['1x1'] as const;
  await render(cwd,'ffmpeg',[...selected]);
  await check(cwd,[...selected]);
  const elapsed = Date.now()-start;
  await mkdir(join(cwd,'.liftoff-fixture'),{recursive:true});
  await writeFile(join(cwd,'.liftoff-fixture','phase4-timing.json'),JSON.stringify({elapsedMs:elapsed,formats:selected}));
  if (elapsed > 300000) throw new Error(`Phase 4 exceeded five minutes: ${elapsed}ms`);
} }];
