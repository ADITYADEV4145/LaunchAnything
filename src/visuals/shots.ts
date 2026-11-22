import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { PNG } from 'pngjs';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { browser, runTerminal, start, escapeHtml, CaptureError } from './runtime.js';
import { assertPrivate } from './privacy.js';
import { guard, gif, ocrCheck } from './capture.js';
import { captureModernShot, modernShot, type MediaShot as Shot } from './modern-shot.js';
export async function takeShots(cwd: string, options: { url?: string; command?: string; only?: string; ids?: Set<string> } = {}) {
  const paths = launchDir(cwd);
  const spec = parse(await readFile(paths.shots, 'utf8')) as { shots: Shot[]; baseUrl?: string; startCommand?: string; readyTimeoutMs?: number };
  const validation = validateFile('shots', spec); if (!validation.valid) throw new Error(validation.errors.join('; '));
  const selected = spec.shots.filter(s => (!options.only || s.id === options.only) && (!options.ids || options.ids.has(s.id)));
  if (!selected.length) throw new Error('No matching shots');
  if (new Set(spec.shots.map(s => s.id)).size !== spec.shots.length || spec.shots.some(s => !/^[\w-]+$/.test(s.id))) throw new Error('Shot IDs must be unique safe filenames');
  let config: { redact?: string[]; brandKit?: string } = {}; try { config = JSON.parse(await readFile(paths.config, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const dir = join(paths.media, 'shots'); await mkdir(dir, { recursive: true });
  let previous: { id: string }[] = [];
  if (options.ids || options.only) {
    try { previous = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    previous = previous.filter(s => spec.shots.some(shot => shot.id === s.id) && !selected.some(shot => shot.id === s.id));
    await writeFile(join(dir,'manifest.json'),JSON.stringify(previous,null,2));
  } else {
    await rm(join(dir,'manifest.json'),{force:true});
  }
  let stop = () => {}; let url = options.url ?? spec.baseUrl;
  const app = await browser(); const manifest = [];
  try {
    if (selected.some(s => !s.commands && !s.card)) {
      if (!url) {
        let dev = false; try { dev = Boolean(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).scripts?.dev); } catch { /* no package */ }
        const command = options.command ?? spec.startCommand ?? (dev ? 'npm run dev' : undefined);
        if (!command) throw new CaptureError('Provide --url, baseUrl or a start command');
        url = 'http://127.0.0.1:3000'; stop = start(command, cwd);
      }
      const deadline = Date.now() + (spec.readyTimeoutMs ?? 30000);
      const readyUrls = [...new Set([url, new URL(selected.find(s => !s.commands && !s.card)!.route!, url).href])];
      while (true) {
        let ready = false;
        for (const candidate of readyUrls) {
          try { const response = await fetch(candidate, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); if (response.status < 500) { ready = true; break; } } catch { /* not ready */ }
        }
        if (ready) break;
        if (Date.now() >= deadline) throw new CaptureError('App readiness timeout');
        await new Promise(r => setTimeout(r, 150));
      }
    }
    for (const shot of selected) {
      if (spec.shots.some(s => s.purpose) || modernShot(shot)) {
        manifest.push(await captureModernShot(cwd, shot, app, dir, url, config)); continue;
      }
      const pngPath = join(dir, `${shot.id}.png`); const gifPath = join(dir, `${shot.id}.gif`);
      await Promise.all([rm(pngPath, { force: true }), rm(gifPath, { force: true })]);
      const page = await app.newPage({ viewport: shot.viewport, colorScheme: shot.theme ?? 'light', deviceScaleFactor: 1 });
      const frames: Buffer[] = []; let redactedCount = 0;
      try {
        if (shot.commands) {
          let transcript = '';
          for (const command of shot.commands) {
            transcript += `$ ${command}\n${await runTerminal(command, cwd)}\n`;
          }
          assertPrivate(transcript);
          for (const fraction of [0.15, 0.4, 0.7, 1]) {
            await page.setContent(`<body style="margin:0;background:#101827;color:#e8f0ff;padding:40px;font:20px monospace"><div>● ● ● &nbsp; terminal</div><pre style="white-space:pre-wrap">${escapeHtml(transcript.slice(0, Math.ceil(transcript.length * fraction)))}</pre>`);
            const frame = await page.screenshot(); await ocrCheck(frame); frames.push(frame);
          }
        } else {
          await page.goto(new URL(shot.route!, url!).href, { waitUntil: 'networkidle' });
          redactedCount = await guard(page, config.redact ?? []);
          if (shot.record) { const frame = await page.screenshot(); await ocrCheck(frame); frames.push(frame); }
          for (const action of shot.actions ?? []) {
            const locator = page.locator(action.selector);
            if (action.type === 'click') await locator.click(); else if (action.type === 'type') await locator.fill(action.text ?? ''); else await locator.waitFor();
          }
          if (shot.waitFor) await page.locator(shot.waitFor).waitFor();
          redactedCount = await guard(page, config.redact ?? []);
        }
        const png = await page.screenshot({ fullPage: shot.fullPage ?? false }); const ocr = await ocrCheck(png);
        frames.push(png); const files = [`${shot.id}.png`];
        await writeFile(pngPath, png);
        if (shot.record || shot.commands) { await writeFile(gifPath, gif(frames)); files.push(`${shot.id}.gif`); }
        const { width, height } = PNG.sync.read(png);
        manifest.push({ id: shot.id, kind: shot.commands ? 'terminal' : shot.viewport.width < 600 ? 'mobile' : 'web', files, width, height, redactedCount, secretsFound: 0, ocr });
      } finally { await page.close(); }
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify([...previous, ...manifest], null, 2)); return manifest;
  } finally { stop(); await app.close(); }
}
