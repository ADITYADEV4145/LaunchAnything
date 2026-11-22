import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { dataImage } from '../media/assets.js';
import { branding } from './design.js';
import { run } from './render.js';
import { loadStyle } from './styles.js';

export const titleCardSeconds = 2.5;
export async function findLogo(cwd: string) {
  const dir = launchDir(cwd).media;
  let files: string[];
  try { files = await readdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  const file = files.sort().find(file => /^logo\.(svg|png|jpe?g|webp)$/i.test(file));
  if (file) { const path = join(dir, file); await access(path); return path; }
}

export async function brandVideo(cwd: string, work: string, silent: string, width: number, height: number, options: { title?: string; tagline?: string; style?: string } = {}) {
  const logo = await findLogo(cwd);
  if (!logo) return silent;
  const brand = await branding(cwd);
  const style = await loadStyle(cwd, options.style);
  const image = await dataImage(logo);
  const app = await browser();
  const title = join(work, 'brand-title.png'), watermark = join(work, 'brand-watermark.png');
  try {
    const page = await app.newPage({ viewport: { width, height } });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<body style="margin:0;background:${style.palette.background[0]};color:${style.palette.text};font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center"><img style="width:28vw;height:28vh;object-fit:contain" src="${escapeHtml(image)}"><h1 style="font-size:7vh;margin:3vh 5vw 1vh;max-width:90vw;overflow-wrap:anywhere">${escapeHtml(options.title ?? brand.name)}</h1><p style="font-size:3.5vh;max-width:86vw;margin:1vh 0">${escapeHtml(options.tagline ?? brand.tagline)}</p></body>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    if (!await page.locator('body').evaluate(el => el.scrollHeight <= innerHeight)) throw new Error('Title card text does not fit; shorten title or tagline');
    await page.screenshot({ path: title });
    await page.setContent(`<body style="margin:0;background:transparent"><img style="position:absolute;right:2vw;top:2vh;width:7vw;height:7vh;object-fit:contain;background:#101827ed;border-radius:8px;padding:6px" src="${escapeHtml(image)}"></body>`);
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
    await page.screenshot({ path: watermark, omitBackground: true });
  } finally { await app.close(); }
  const output = join(work, 'branded.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-filter_complex_threads', '2', '-loop', '1', '-framerate', '12', '-i', title, '-i', silent, '-loop', '1', '-framerate', '12', '-i', watermark,
    '-filter_complex', `[0:v]trim=duration=${titleCardSeconds},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[title];[1:v][2:v]overlay=shortest=1,setsar=1,format=yuv420p[body];[title][body]concat=n=2:v=1:a=0[out]`,
    '-map', '[out]', '-an', '-r', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', output]);
  return output;
}
