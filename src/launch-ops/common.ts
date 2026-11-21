import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { launchDir } from '../core/launch-dir.js';
import { checked, missing, readJson } from '../results/files.js';
import type { PublishedPost } from '../results/metrics.js';

export const root = (cwd: string) => launchDir(cwd).root;
export const slug = (text: string) => text.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'draft';
export async function optionalText(path: string) {
  try { return await readFile(path, 'utf8'); } catch (error) { if (missing(error)) return ''; throw error; }
}
export async function published(cwd: string) {
  return checked<{ posts: PublishedPost[] }>('published', await readJson(launchDir(cwd).published)).posts;
}
export async function product(cwd: string) {
  return checked<{ name: string; oneLiner: string }>('product', await readJson(launchDir(cwd).product));
}
export function liveUrls(posts: PublishedPost[]) {
  return posts.filter(p => p.status === 'published' && p.url && /^https?:\/\//i.test(p.url)).map(p => `${p.channel}: ${p.url}`).join('\n') || 'Live URLs not reported.';
}
export function git(cwd: string, ...args: string[]) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error(`Unable to read git ${args[0]}; check repository and refs.`); }
}
export function commits(cwd: string, args: string[]) {
  return git(cwd, 'log', '--format=%H%x09%s', ...args).split('\n').filter(Boolean).map(line => {
    const [sha, ...title] = line.split('\t'); return { sha, title: title.join(' ') };
  });
}
export function commitNotes(rows: ReturnType<typeof commits>) {
  return ['Features', 'Fixes', 'Other'].map(group => {
    const selected = rows.filter(row => (row.title.startsWith('feat') ? 'Features' : row.title.startsWith('fix') ? 'Fixes' : 'Other') === group);
    return selected.length ? `## ${group}\n\n${selected.map(row => `- ${row.title.replace(/[\r\n]/g, ' ')} (${row.sha})`).join('\n')}\n` : '';
  }).filter(Boolean).join('\n');
}
