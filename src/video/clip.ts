import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { packageRoot } from '../core/package-root.js';
import { browser, escapeHtml } from '../visuals/runtime.js';
import { mediaBrand, homepageHost, optionalJson } from '../media/assets.js';
import { assertClean, ocrWords } from '../media/banned.js';
import { formats, fileHash, remotionCli, run, type Format } from './render.js';
import { mixAudio } from './audio.js';
import type { SceneRole } from './script.js';
import { contrast } from '../visuals/check.js';
import { terminalSource, renderTerminal, type TerminalTranscript, type TerminalMetrics } from '../media/terminal.js';

export interface ClipScene { role?: SceneRole; caption: string; source: string; duration: number; highlight?: { x: number; y: number; width: number; height: number }; terminal?: TerminalTranscript }
export interface ClipOptions { format?: Format; music?: string; voice?: (string | undefined)[]; outFile?: string; renderer?: 'auto' | 'ffmpeg' | 'remotion' }
export interface ClipFrame { x: number; y: number; width: number; height: number; kind: string }
export interface ClipReceipt {
  sha256: string; format: Format; captions: 'burned'; renderer: 'ffmpeg' | 'remotion'; duration: number;
  audio: Awaited<ReturnType<typeof mixAudio>>; author: string; logo: 'logo' | 'wordmark';
  scenes: (Omit<ClipScene, 'terminal'> & { terminal?: TerminalMetrics; frame: ClipFrame; crop?: {x:number;y:number;width:number;height:number}; captionFont: number; captionContrast: number })[];
}

/** Render local footage with branded captions, music and optional indexed voice files; durations are used verbatim, plus a 3-second end card. No shots.yaml is required. */
export async function renderClip(cwd: string, scenes: ClipScene[], options: ClipOptions = {}): Promise<{ file: string; duration: number; receipt: ClipReceipt }> {
  if (!scenes.length || scenes.some(scene => !Number.isFinite(scene.duration) || scene.duration <= 0 || !scene.caption.trim())) throw new Error('Clip requires captioned scenes with positive finite durations');
  const format = options.format ?? '16x9';
  if (!(format in formats)) throw new Error('Unknown clip format');
  if (options.renderer && !['auto', 'ffmpeg', 'remotion'].includes(options.renderer)) throw new Error('Unknown clip renderer');
  const spec = formats[format]; const { width, height } = spec;
  const file = options.outFile ? resolve(cwd, options.outFile) : join(launchDir(cwd).video, spec.file);
  await mkdir(dirname(file), { recursive: true });
  const cli = options.renderer === 'ffmpeg' ? undefined : await remotionCli(cwd);
  if (options.renderer === 'remotion' && !cli) throw new Error('Remotion is not installed; use --renderer ffmpeg');
  const brand = await mediaBrand(cwd); const product = await optionalJson(launchDir(cwd).product);
  const name = String(product.name ?? 'Product'); const host = homepageHost(product.homepage ?? product.url);
  assertClean(`${name}\n${host}\n${scenes.map(scene => scene.caption).join('\n')}`, 'clip captions');
  const work = await mkdtemp(join(dirname(file), '.clip-')); const app = await browser();
  const duration = scenes.reduce((sum, scene) => sum + scene.duration, 3);
  const assets: { plate: string; caption: string; ring: string; source: string; bare: boolean; terminal?: TerminalMetrics; crop?: {x:number;y:number;width:number;height:number}; highlight?: ClipScene['highlight']; frame: {x:number;y:number;width:number;height:number;kind:string} }[] = [];
  const pieces: string[] = [];
  try {
    const all = [...scenes, { role: 'cta' as const, caption: name, source: scenes[0].source, duration: 3 }];
    for (const [index, scene] of all.entries()) {
      const end = index === scenes.length; const card = end || scene.role === 'hook' || scene.role === 'cta';
      let source = resolve(cwd, scene.source); await access(source);
      if (!/\.(png|jpe?g|webp|mp4|webm)$/i.test(source)) throw new Error('Clip sources must be local images or video');
      const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', source])).stdout).streams[0];
      let box = scene.highlight;
      let terminal: TerminalMetrics | undefined;
      const transcript = !card ? scene.terminal ?? await terminalSource(cwd, source) : undefined;
      if (transcript) {
        const rendered = await renderTerminal(app, transcript, { width: width * .94, height: height * .57, minCapHeight: height * (format === '16x9' ? .025 : .0225), columns: format === '16x9' ? 80 : 44, title: name, accent: brand.colors.accent });
        source = join(work, `${index}-terminal.png`); await writeFile(source, rendered.png);
        probe.width = rendered.width; probe.height = rendered.height;
        box = rendered.highlight; terminal = rendered.terminal;
      }
      const scale = Math.min(width * .94 / probe.width, height * .57 / probe.height);
      const fw = Math.max(2, Math.floor(probe.width * scale / 2) * 2), fh = Math.max(2, Math.floor(probe.height * scale / 2) * 2);
      const frame = { x: Math.round((width - fw) / 2), y: Math.round(height * .15 + (height * .57 - fh) / 2), width: fw, height: fh, kind: 'terminal' };
      if (terminal) terminal = { ...terminal, capHeight: terminal.capHeight * fh / probe.height, box: { x: frame.x + terminal.box.x * fw / probe.width, y: frame.y + terminal.box.y * fh / probe.height, width: terminal.box.width * fw / probe.width, height: terminal.box.height * fh / probe.height } };
      const highlight = !card && box ? { x: frame.x + box.x * fw / probe.width - 5, y: frame.y + box.y * fh / probe.height - 5, width: box.width * fw / probe.width + 10, height: box.height * fh / probe.height + 10 } : undefined;
      const page = await app.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const plate = join(work, `${index}-plate.png`), caption = join(work, `${index}-caption.png`), ring = join(work, `${index}-ring.png`);
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;width:100vw;height:100vh;background:${brand.colors.background};color:white;font-family:Arial,sans-serif;overflow:hidden}header{position:absolute;left:5vw;top:4vh;display:flex;align-items:center;gap:14px;font-size:${Math.max(24, height * .027)}px;font-weight:700}header img{max-width:150px;height:${height * .045}px}header img[src=""]{display:none}header i{height:10px;width:10px;background:${brand.colors.accent};border-radius:50%}.caption{position:absolute;left:5vw;width:90vw;bottom:${card ? '31vh' : '7vh'};padding:2vh 2vw;background:#101827;border-left:5px solid ${brand.colors.accent};font-size:${height * (card ? .065 : .048)}px;font-weight:700;line-height:1.16;letter-spacing:-.02em;text-wrap:balance}.role{font-size:${height * .018}px;letter-spacing:.2em;color:#cbd5e1;margin-bottom:1.2vh}footer{position:absolute;bottom:2.5vh;left:5vw;color:#cbd5e1;font-size:${Math.max(14, height * .017)}px}.ring{position:absolute;border:4px solid ${brand.colors.accent};border-radius:9px;box-shadow:0 0 0 4px ${brand.colors.accent}22,0 0 20px ${brand.colors.accent}88;${highlight ? `left:${highlight.x}px;top:${highlight.y}px;width:${highlight.width}px;height:${highlight.height}px` : 'display:none'}}</style><body><header><i></i><img src="${escapeHtml(brand.logo)}"><span>${escapeHtml(name)}</span></header><div class="caption"><div class="role">${escapeHtml(end ? 'GET STARTED' : scene.role === 'after' ? 'THE MOMENT' : (scene.role ?? '').toUpperCase())}</div>${escapeHtml(scene.caption)}</div><footer>${escapeHtml(host)}</footer><div class="ring"></div></body></html>`);
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getAttribute('src')).map(image => image.decode())); });
        const fits = await page.locator('.caption').evaluate(el => { const box = el.getBoundingClientRect(); return box.top >= innerHeight * .14 && box.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; });
        if (!fits) throw new Error('Clip caption does not fit at the minimum readable font size; shorten the caption');
        await page.addStyleTag({ content: '.caption,.ring{visibility:hidden}' }); await page.screenshot({ path: plate });
        await page.addStyleTag({ content: 'body{background:transparent}header,footer{visibility:hidden}.caption{visibility:visible}' });
        const captionPng = await page.screenshot({ omitBackground: true }); assertClean((await ocrWords(captionPng)).text, 'clip caption plate'); await writeFile(caption, captionPng);
        await page.addStyleTag({ content: '.caption{visibility:hidden}.ring{visibility:visible}' }); await page.screenshot({ path: ring, omitBackground: true });
      } finally { await page.close(); }
      assets.push({ plate, caption, ring, source, frame, bare: true, highlight, terminal });
      if (cli) continue;
      const piece = join(work, `${index}.mp4`); const video = /\.(mp4|webm)$/i.test(source);
      const footage = card ? '[0:v]null[base]' : `[1:v]fps=12,scale=${fw}:${fh}[shot];[0:v][shot]overlay=${frame.x}:${frame.y}[base]`;
      const filter = `${footage};[base][${card ? 1 : 2}:v]overlay[captioned];[${card ? 2 : 3}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=0.75:d=0.25:alpha=1,trim=duration=1,loop=loop=-1:size=12:start=0,setpts=N/(12*TB)[ring];[captioned][ring]overlay[out]`;
      const footageInput = card ? [] : [...(video ? ['-stream_loop', '-1'] : ['-loop', '1', '-framerate', '12']), '-i', source];
      await run('ffmpeg', ['-y', '-v', 'error', '-filter_complex_threads', '2', '-loop', '1', '-framerate', '12', '-i', plate, ...footageInput, '-loop', '1', '-framerate', '12', '-i', caption, '-loop', '1', '-framerate', '12', '-i', ring, '-filter_complex', filter, '-map', '[out]', '-t', String(scene.duration), '-an', '-r', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', piece]);
      pieces.push(piece);
    }
    const silent = join(work, 'silent.mp4');
    if (cli) {
      await cp(join(packageRoot(), 'templates/video/remotion'), work, { recursive: true });
      const modules = cli.includes('node_modules') ? cli.slice(0, cli.lastIndexOf('node_modules') + 'node_modules'.length) : join(cwd, 'node_modules');
      await symlink(modules, join(work, 'node_modules'), 'dir'); await mkdir(join(work, 'public'));
      const propsScenes = [];
      for (const [index, scene] of scenes.entries()) {
        const asset = assets[index]; const src = `source-${index}.${asset.source.split('.').pop()}`;
        for (const path of [asset.plate, asset.caption, asset.ring]) await cp(path, join(work, 'public', basename(path)));
        await cp(asset.source, join(work, 'public', src));
        propsScenes.push({ ...scene, text: scene.caption, src, card: scene.role === 'hook' || scene.role === 'cta', layouts: { [`${width}x${height}`]: { ...asset, accent: brand.colors.accent, src, plate: basename(asset.plate), caption: basename(asset.caption), ring: basename(asset.ring) } } });
      }
      const end = assets.at(-1)!;
      const endCard = join(work, 'public', 'end.png');
      await run('ffmpeg', ['-y', '-v', 'error', '-i', end.plate, '-i', end.caption, '-filter_complex', 'overlay', '-frames:v', '1', '-threads', '1', endCard]);
      await writeFile(join(work, 'props.json'), JSON.stringify({ scenes: propsScenes, endCards: { [`${width}x${height}`]: 'end.png' }, endCardSeconds: 3, logo: brand.logo }));
      await run(cli, ['render', join(work, 'src/index.tsx'), spec.composition, silent, '--props', join(work, 'props.json'), '--concurrency', '2', '--log', 'error', '--codec', 'h264'], work);
    } else {
      await writeFile(join(work, 'concat.txt'), pieces.map(path => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'));
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'concat.txt'), '-c', 'copy', silent]);
    }
    const audio = await mixAudio(cwd, work, silent, file, scenes.map(scene => scene.duration), options.voice ?? [], options.music);
    const receipt: ClipReceipt = { sha256: await fileHash(file), format, captions: 'burned', renderer: cli ? 'remotion' : 'ffmpeg', duration, audio, author: 'Aditya', scenes: scenes.map((scene, index) => ({ ...scene, terminal: assets[index].terminal, frame: assets[index].frame, crop: assets[index].crop, highlight: assets[index].highlight, captionFont: height * (scene.role === 'hook' || scene.role === 'cta' ? .065 : .048), captionContrast: contrast([255,255,255], [16,24,39]) })), logo: brand.logo ? 'logo' : 'wordmark' };
    await writeFile(`${file}.json`, JSON.stringify(receipt, null, 2)); return { file, duration, receipt };
  } catch (error) { await rm(file, { force: true }); await rm(`${file}.json`, { force: true }); throw error; }
  finally { await app.close(); await rm(work, { recursive: true, force: true }); }
}
