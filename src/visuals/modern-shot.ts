import { mkdir, readFile, writeFile, rm, mkdtemp, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Browser, Page } from 'playwright';
import { PNG } from 'pngjs';
import { assertClean, ocrWords, scanBanned, type OcrWord } from '../media/banned.js';
import { exec, sanitizedEnv, runTerminal, escapeHtml } from './runtime.js';
import { guard } from './capture.js';
import { terminalLayout } from './terminal-layout.js';

type Box = { x: number; y: number; width: number; height: number };
export interface MediaShot {
  id: string; route?: string; commands?: string[]; viewport: { width: number; height: number };
  theme?: 'light' | 'dark'; themes?: ('light' | 'dark')[]; deviceScale?: number;
  record?: boolean; fullPage?: boolean; waitFor?: string; element?: string;
  actions?: { type: string; selector: string; text?: string }[];
  purpose?: string; caption?: string; moneyMoment?: boolean; setup?: string[];
  highlight?: { selector: string } | { text: string } | Box;
  card?: boolean; fontSize?: number; cols?: number; rows?: number; width?: number; height?: number;
}
export function modernShot(shot: MediaShot): boolean {
  return ['purpose', 'caption', 'moneyMoment', 'themes', 'deviceScale', 'element', 'setup', 'highlight', 'card', 'fontSize', 'cols', 'rows', 'width', 'height'].some(key => key in shot);
}
class BannedFrame extends Error {
  constructor(readonly frame: number, readonly rules: string[]) { super(rules.join(', ')); }
}
function clean(text: string, frame: number) {
  const rules = scanBanned(text);
  if (rules.length) throw new BannedFrame(frame, rules);
  assertClean(text, `frame ${frame}`);
}
const shellQuote = (text: string) => `'${text.replace(/'/g, `'"'"'`)}'`;
function literal(text: string): string {
  const delimiter = ['"', "'", '`'].find(quote => !text.includes(quote));
  if (!delimiter || /[\r\n\x00-\x1f]/.test(text)) throw new Error('VHS path/theme cannot contain control characters or all three quote styles');
  return `${delimiter}${text}${delimiter}`;
}
function typeCommand(command: string): string[] {
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(command)) throw new Error('VHS commands cannot contain terminal control characters');
  return [...command.split('\n').flatMap(line => [
    ...line.split(/(")/).filter(Boolean).map(part => `Type ${literal(part)}`),
    'Enter',
  ]), 'Sleep 500ms', 'Wait+Line@30s /\\$$/'];
}
function wordBox(words: OcrWord[], text: string): Box | undefined {
  const tokenize = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}_$]+/gu) ?? [value.toLowerCase().trim()];
  const wanted = tokenize(text);
  const tokens = words.flatMap(box => tokenize(box.text).map(value => ({ value, box })));
  const index = tokens.findIndex((_, index) => wanted.every((word, offset) => tokens[index + offset]?.value === word));
  if (index < 0) return;
  const matches = tokens.slice(index, index + wanted.length).map(token => token.box);
  const x = Math.min(...matches.map(word => word.x)), y = Math.min(...matches.map(word => word.y));
  return { x, y, width: Math.max(...matches.map(word => word.x + word.width)) - x, height: Math.max(...matches.map(word => word.y + word.height)) - y };
}
async function availableVhs(): Promise<boolean> {
  try { await exec('vhs', ['--version'], { env: sanitizedEnv() }); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new Error('VHS is installed but could not start'); }
}
async function sample(file: string, check: (png: Buffer) => Promise<unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-frames-'));
  try {
    await exec('ffmpeg', ['-v', 'error', '-threads', '1', '-i', file, '-vf', 'fps=1', '-threads', '1', join(dir, '%06d.png')], { env: sanitizedEnv(), timeout: 120000 });
    const frames = (await readdir(dir)).sort();
    if (!frames.length) throw new Error('No frames available for required OCR scan');
    for (const frame of frames) await check(await readFile(join(dir, frame)));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
async function terminal(cwd: string, shot: MediaShot, page: Page, dir: string, tape: string, scratch: string, theme?: string) {
  const outputs = ['gif', 'mp4', 'png'].map(ext => join(dir, `${shot.id}.${ext}`));
  const script = ['set -e', `{\n${shot.setup?.join('\n') || ':'}\n} >/dev/null 2>&1`, 'set +e', ...(shot.commands ?? []).flatMap(command => [`printf '%s\\n' ${shellQuote('$ ' + command)}`, command]), ':'].join('\n');
  const transcript = await runTerminal(`bash --noprofile --norc -c ${shellQuote(script)}`, cwd);
  clean(transcript, 0);
  const layout = terminalLayout(transcript, shot);
  clean(layout.text, 0);
  await page.setViewportSize({ width: layout.width, height: layout.height });
  const recording = join(dir, '..', 'tapes', `${shot.id}.txt`); await writeFile(recording, layout.text + '\n');
  const lines = [
    ...outputs.slice(0, 2).map(path => `Output ${literal(path)}`),
    'Set Shell "bash"', `Set FontSize ${shot.fontSize ?? 32}`, `Set Width ${layout.width}`, `Set Height ${layout.height}`,
    'Set Padding 40', `Set Theme ${literal(theme ?? 'Catppuccin Mocha')}`, 'Set TypingSpeed 40ms',
    'Hide', ...typeCommand("export PS1='$ '; unset PROMPT_COMMAND"),
    ...(shot.setup ?? []).map(command => `# Recorded setup: ${JSON.stringify(command)}`),
    ...typeCommand(`clear; cat ${shellQuote(recording)}`), 'Show',
    'Sleep 1s', `Screenshot ${literal(outputs[2])}`, 'Sleep 100ms',
  ];
  await writeFile(tape, lines.join('\n') + '\n');
  if (await availableVhs()) {
    try { await exec('vhs', [tape], { cwd, env: sanitizedEnv(), timeout: 180000, maxBuffer: 4 * 1024 * 1024 }); }
    catch { throw new Error('VHS capture failed or timed out (output withheld); check shot commands and VHS dependencies'); }
    try { await readFile(outputs[2]); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await exec('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', outputs[1], '-frames:v', '1', '-threads', '1', outputs[2]], { env: sanitizedEnv(), timeout: 30000 });
    }
    return { renderer: 'vhs' as const, columns: layout.columns, transcript };
  }
  for (const [index, fraction] of [0.15, 0.4, 0.7, 1].entries()) {
    await page.setContent(`<body style="margin:0;background:#101827;color:#e8f0ff;padding:40px;font:${shot.fontSize ?? 32}px monospace"><pre style="margin:0;white-space:pre">${escapeHtml(layout.text.slice(0, Math.ceil(layout.text.length * fraction)))}</pre>`);
    const png = await page.screenshot();
    await writeFile(join(scratch, `frame-${index.toString().padStart(4, '0')}.png`), png);
  }
  await writeFile(outputs[2], await page.screenshot());
  for (const [output, args] of [[outputs[0], ['-vf', 'fps=10']], [outputs[1], ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']]] as [string, string[]][]) {
    await exec('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(scratch, 'frame-%04d.png'), ...args, '-threads', '1', output], { env: sanitizedEnv(), timeout: 120000 });
  }
  return { renderer: 'html' as const, columns: layout.columns, transcript };
}
export async function captureModernShot(cwd: string, shot: MediaShot, app: Browser, dir: string, url: string | undefined, config: { redact?: string[]; brandKit?: string }) {
  const tapes = join(dir, '..', 'tapes'); await mkdir(tapes, { recursive: true });
  const tape = resolve(tapes, `${shot.id}.tape`);
  const cleanup = async () => {
    await Promise.all(['png', 'gif', 'mp4'].flatMap(ext => [join(dir, `${shot.id}.${ext}`), join(dir, `${shot.id}-dark.${ext}`)]).map(file => rm(file, { force: true })));
    await rm(tape, { force: true });
    await rm(join(tapes, `${shot.id}.txt`), { force: true });
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    await cleanup();
    const scratch = await mkdtemp(join(tmpdir(), 'liftoff-capture-'));
    let frame = 0;
    const check = async (png: Buffer) => { const ocr = await ocrWords(png); clean(ocr.text, ++frame); return ocr; };
    try {
      for (const command of shot.commands ?? []) clean(command, 0);
      const files: string[] = []; const variants: Partial<Record<'light' | 'dark', string>> = {};
      const highlights: Partial<Record<'light' | 'dark', Box>> = {};
      let highlight: Box | undefined; let redactedCount = 0; let renderer: 'vhs' | 'html' | 'playwright' = 'playwright';
      let columns: number | undefined;
      let transcript: string | undefined;
      let width = 0, height = 0; const scale = shot.commands ? 1 : shot.deviceScale ?? 2;
      const themes = shot.commands ? [shot.theme ?? 'dark'] : shot.themes ?? [shot.theme ?? 'light'];
      for (const theme of themes) {
        const page = await app.newPage({ viewport: shot.commands ? { width: shot.width ?? 1600, height: shot.height ?? 900 } : shot.viewport, colorScheme: theme, deviceScaleFactor: shot.commands ? shot.deviceScale ?? 2 : scale });
        try {
          let png: Buffer;
          const name = `${shot.id}${themes.length > 1 && theme === 'dark' ? '-dark' : ''}.png`;
          if (shot.commands) {
            let terminalTheme: string | undefined;
            if (config.brandKit) {
              const brand = JSON.parse(await readFile(resolve(cwd, config.brandKit), 'utf8'));
              terminalTheme = brand.terminalTheme ?? brand.theme;
            }
            ({ renderer, columns, transcript } = await terminal(cwd, shot, page, dir, tape, scratch, terminalTheme));
            png = await readFile(join(dir, name)); files.push(`${shot.id}.gif`, `${shot.id}.mp4`);
          } else if (shot.card) {
            clean(shot.caption ?? '', 0);
            await page.setContent(`<body style="background:#101827;color:white;font:64px sans-serif;display:grid;place-items:center;height:100vh;margin:0">${escapeHtml(shot.caption ?? '')}</body>`);
            png = await page.screenshot(); await writeFile(join(dir, name), png);
          } else {
            await page.goto(new URL(shot.route!, url).href, { waitUntil: 'networkidle' });
            redactedCount = await guard(page, config.redact ?? [], text => clean(text, frame + 1));
            const captured: Buffer[] = [];
            const capture = async () => {
              await guard(page, config.redact ?? [], text => clean(text, frame + 1));
              const image = shot.element ? await page.locator(shot.element).screenshot() : await page.screenshot({ fullPage: shot.fullPage ?? false });
              await check(image); captured.push(image); return image;
            };
            if (shot.record) await capture();
            for (const action of shot.actions ?? []) {
              const locator = page.locator(action.selector);
              if (action.type === 'click') await locator.click(); else if (action.type === 'type') await locator.fill(action.text ?? ''); else await locator.waitFor();
              if (shot.record) await capture();
            }
            if (shot.waitFor) await page.locator(shot.waitFor).waitFor();
            png = await capture(); await writeFile(join(dir, name), png);
            if (shot.highlight && 'selector' in shot.highlight) {
              const target = await page.locator(shot.highlight.selector).boundingBox();
              const area = shot.element ? await page.locator(shot.element).boundingBox() : shot.fullPage ? { x: -(await page.evaluate(() => scrollX)), y: -(await page.evaluate(() => scrollY)) } : { x: 0, y: 0 };
              if (!target || !area) throw new Error(`Shot ${shot.id}: highlight selector is not visible`);
              highlights[theme] = { x: (target.x - area.x) * scale, y: (target.y - area.y) * scale, width: target.width * scale, height: target.height * scale };
            }
            if (shot.record) {
              for (const [index, image] of captured.entries()) await writeFile(join(scratch, `web-${index.toString().padStart(4, '0')}.png`), image);
              const animation = name.replace(/\.png$/, '.gif');
              await exec('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(scratch, 'web-%04d.png'), '-threads', '1', join(dir, animation)], { env: sanitizedEnv(), timeout: 120000 }); files.push(animation);
            }
          }
          const ocr = await check(png);
          if (shot.highlight && 'text' in shot.highlight) {
            const box = wordBox(ocr.words, shot.highlight.text);
            if (!box) throw new Error(`Shot ${shot.id}: highlight text not found by OCR`);
            highlights[theme] = box;
          } else if (shot.highlight && 'x' in shot.highlight) highlights[theme] = shot.highlight;
          highlight ??= highlights[theme];
          variants[theme] = name; files.push(name);
          ({ width, height } = PNG.sync.read(png));
        } finally { await page.close(); }
      }
      for (const file of files.filter(file => /\.(gif|mp4)$/.test(file))) await sample(join(dir, file), check);
      const actualScale = shot.commands ? renderer === 'vhs' ? 1 : shot.deviceScale ?? 2 : scale;
      return { id: shot.id, kind: shot.commands ? 'terminal' : shot.viewport.width < 600 ? 'mobile' : 'web', files, width, height, columns, transcript, redactedCount, secretsFound: 0, ocr: true, purpose: shot.purpose, caption: shot.caption, moneyMoment: shot.moneyMoment ?? false, variants, highlight, highlights, renderer, scale: actualScale, banned: [] as string[] };
    } catch (error) {
      await cleanup();
      if (!(error instanceof BannedFrame)) throw error;
      if (attempt === 1) throw new Error(`Shot ${shot.id} frame ${error.frame}: banned ${error.rules.join(', ')}. Fix the shot (hide setup, change commands/route) and re-run liftoff shots.`);
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
  throw new Error('Shot capture did not complete');
}
