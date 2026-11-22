import { lstat, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { assertSafePath } from '../copy/safe-path.js';
import { record } from './metrics.js';
import { missing, readJson } from './files.js';

interface MediaBrief { source: { channel: string; id: string }; frames: string[] }

async function localMedia(cwd: string, media: string, input: unknown, clip: boolean) {
  const fail = () => new Error(`Each ${clip ? 'clip' : 'image'} must be a supported local file under .launch/media.`);
  if (typeof input !== 'string' || !input.trim() || isAbsolute(input)) throw fail();
  const path = resolve(media, input);
  const rel = relative(media, path);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw fail();
  const ext = extname(path).toLowerCase();
  if (!/^(?:\.png|\.jpe?g|\.webp)$/.test(ext) && !(clip && /^(?:\.mp4|\.webm)$/.test(ext))) throw fail();
  assertSafePath(cwd, path);
  const info = await lstat(path).catch(error => {
    if (!missing(error)) throw error;
  });
  if (!info?.isFile()) throw fail();
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(12);
    await file.read(head);
    const matches = ext === '.png' ? head.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      : ext === '.mp4' ? head.toString('ascii', 4, 8) === 'ftyp'
      : ext === '.webm' ? head.subarray(0, 4).toString('hex') === '1a45dfa3'
      : ext === '.webp' ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
      : head.subarray(0, 3).toString('hex') === 'ffd8ff';
    if (!matches) throw fail();
  } finally { await file.close(); }
  return relative(cwd, path);
}

export async function renderRepurposeMedia(cwd: string, drafts: string, brief: MediaBrief, sourcesPath: string) {
  const { channel, postId, frames } = record(await readJson(resolve(cwd, sourcesPath)));
  if (channel !== brief.source.channel || postId !== brief.source.id)
    throw new Error('Media sources must identify the selected post in repurpose-media.json.');
  if (!Array.isArray(frames) || frames.length !== brief.frames.length)
    throw new Error('Supply one media source per caption in repurpose-media.json, in the same order.');
  const media = launchDir(cwd).media;
  const sources = await Promise.all(frames.map(async frame => {
    const { image, clip } = record(frame);
    const still = await localMedia(cwd, media, image, false);
    return { still, footage: clip === undefined ? still : await localMedia(cwd, media, clip, true) };
  }));
  const { renderCarousel } = await import('../media/platform-images.js');
  const { renderClip } = await import('../video/clip.js');
  await mkdir(drafts, { recursive: true, mode: 0o700 });
  const outDir = await mkdtemp(join(drafts, 'repurpose-assets-'));
  try {
    const carousel = await renderCarousel(cwd, brief.frames.map((caption, index) =>
      ({ role: index === 0 ? 'hook' : 'frame', caption, source: sources[index].still })),
    { size: 'instagram', prefix: 'carousel', outDir });
    const vertical = await renderClip(cwd, brief.frames.map((caption, index) =>
      ({ caption, source: sources[index].footage, duration: 4 })),
    { format: '9x16', renderer: 'ffmpeg', outFile: join(outDir, 'clip-9x16.mp4') });
    return {
      carousel: { files: carousel.files.map(file => relative(cwd, file)), report: relative(cwd, join(outDir, 'carousel-report.json')) },
      vertical: { file: relative(cwd, vertical.file), receipt: relative(cwd, vertical.file + '.json'), duration: vertical.duration },
    };
  } catch (error) {
    await rm(outDir, { force: true, recursive: true });
    throw error;
  }
}
