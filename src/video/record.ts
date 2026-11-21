import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { launchDir } from '../core/launch-dir.js';
import { shots } from './script.js';

export async function record(cwd: string, base: string) {
  const url = new URL(base);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('--url must be an HTTP(S) base URL');
  const selected = (await shots(cwd)).filter(s => s.record);
  if (!selected.length) return {files:[], message:'No shots have record: true'};
  let playwright;
  try {
    const path = createRequire(join(cwd,'package.json')).resolve('playwright');
    const mod = await import(path);
    playwright = mod.chromium ? mod : mod.default;
  } catch { throw new Error('Playwright is not installed locally. Install playwright and its Chromium browser to record shots.'); }
  const dir = launchDir(cwd).media;
  await mkdir(dir,{recursive:true});
  const browser = await playwright.chromium.launch({headless:true});
  const files: string[] = [];
  try {
    for (const shot of selected) {
      if (!/^[a-zA-Z0-9_-]+$/.test(shot.id)) throw new Error(`Unsafe shot id: ${shot.id}`);
      const target = new URL(shot.route,url);
      if (target.origin !== url.origin) throw new Error('Shot routes must remain on the base URL origin');
      const context = await browser.newContext({viewport:shot.viewport, colorScheme:shot.theme, recordVideo:{dir, size:shot.viewport}});
      let video: {path(): Promise<string>} | null = null;
      try {
        const page = await context.newPage();
        await page.goto(target.href);
        if (shot.waitFor) await page.locator(shot.waitFor).waitFor();
        for (const action of shot.actions ?? []) {
          if (action.type === 'click') await page.locator(action.selector).click();
          else if (action.type === 'type') await page.locator(action.selector).fill(action.text ?? '');
          else await page.locator(action.selector).waitFor();
        }
        await page.waitForTimeout(1000);
        video = page.video();
      } finally { await context.close(); }
      if (!video) throw new Error(`No video was recorded for ${shot.id}`);
      const output = join(dir,`${shot.id}.webm`);
      await rename(await video.path(),output);
      files.push(output);
    }
  } finally { await browser.close(); }
  return {files};
}
