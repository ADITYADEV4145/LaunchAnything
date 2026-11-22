import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { writeJson, writeLocal } from '../results/files.js';
import { draftPosts, readChanges } from './release-kit.js';

export function isoWeek(now: Date) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
export async function progress(cwd: string, options: { since?: string; now?: string } = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const since = options.since ? new Date(options.since) : new Date(now.getTime() - 7 * 86400000);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(since.getTime()) || since > now) throw new Error('Invalid progress date range');
  const changes = readChanges(cwd, ['HEAD', `--since=${since.toISOString()}`, `--until=${now.toISOString()}`]);
  const folder = join(launchDir(cwd).root, 'progress', isoWeek(now));
  await rm(join(folder, 'media'), { recursive: true, force: true });
  await draftPosts(folder, ['x', 'linkedin'], changes, c => `git show ${c.sha}`);
  const shots = join(launchDir(cwd).media, 'shots');
  let candidates: { file: string; time: number }[] = [];
  try { candidates = await Promise.all((await readdir(shots)).filter(f => /\.(png|jpe?g)$/i.test(f)).map(async file => ({ file, time: (await stat(join(shots, file))).mtimeMs }))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  candidates.sort((a, b) => b.time - a.time || a.file.localeCompare(b.file));
  const image = candidates[0]?.file;
  if (image) { await mkdir(join(folder, 'media'), { recursive: true }); await cp(join(shots, image), join(folder, 'media', image)); }
  await writeLocal(join(folder, 'progress.md'), `# Weekly progress\n\n${changes.length ? changes.map(c => `- ${c.title} (${c.sha})`).join('\n') : 'No commits in this window.'}\n\n${image ? `Screenshot: ![Recent capture](media/${image})` : 'No real screenshot available; image skipped.'}\n`);
  await writeJson(join(folder, 'progress.json'), { since: since.toISOString(), now: now.toISOString(), image: image ?? null, commits: changes.length });
  return { folder, image, commits: changes.length };
}
