import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import { validateFile } from '../core/schema.js';

export interface Approver { name: string; role?: string }
interface Config {
  profile: string;
  launchDate: string;
  timezone: string;
  approvers?: Approver[];
}
interface Post {
  channel?: string;
  title: string;
  body: string;
  media: { slot: string; path?: string }[];
  link?: string;
  claims: string[];
}
interface Media { slot: string; path: string; bytes: Buffer }
export interface ReviewPost extends Omit<Post, 'channel' | 'media'> {
  channel: string;
  label: string;
  filename: string;
  source: string;
  media: Media[];
  scheduledAt: string;
  hash: string;
}

export function validate<T>(kind: string, value: unknown): T {
  const result = validateFile(kind, value);
  if (!result.valid) throw new Error(`${kind}: ${result.errors.join('; ')}`);
  return value as T;
}

export async function readOptional(path: string) {
  try { return await readFile(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function readLocalFile(root: string, path: string) {
  const inside = (target: string) => {
    const rel = relative(root, target);
    return rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  };
  if (!inside(path)) throw new Error('Post or attachment is outside .launch');
  const target = await realpath(path);
  if (!inside(target) || !(await stat(target)).isFile()) throw new Error('Post or attachment is not a local .launch file');
  return readFile(target);
}

function parsePost(source: string, channel: string) {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${channel}: expected YAML front matter`);
  const front: unknown = parse(match[1]);
  if (!front || typeof front !== 'object' || Array.isArray(front)) throw new Error(`${channel}: invalid front matter`);
  const data = { ...front, ...(!('body' in front) && { body: match[2].trim() }) };
  const post = validate<Post>('post', data);
  if (post.channel && post.channel !== channel) throw new Error(`${channel}: post channel does not match filename`);
  if (match[2].trim() && 'body' in front && match[2].trim() !== post.body.trim())
    throw new Error(`${channel}: Markdown and front matter bodies disagree`);
  return post;
}

function wallTime(date: string, time: string, timezone: string) {
  const expected = date + 'T' + time;
  const nominal = Date.parse(expected + ':00Z');
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== expected)
    throw new Error(`Invalid schedule: ${expected}`);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const local = (ms: number) => formatter.format(ms).replace(' ', 'T');
  const candidates = [-24, 0, 24].map(hours => {
    const probe = nominal + hours * 3600000;
    return nominal - (Date.parse(local(probe) + ':00Z') - probe);
  }).filter(ms => local(ms) === expected);
  if (!candidates.length) throw new Error(`Schedule does not exist in ${timezone}: ${expected}`);
  return new Date(Math.min(...candidates)).toISOString();
}

function schedule(plan: string | undefined, channel: string, config: Config, defaultTime: string) {
  if (plan === undefined) return wallTime(config.launchDate, defaultTime, config.timezone);
  const dateTime = plan.split(/\r?\n/).map(line => line.split('|').map(cell => cell.trim()))
    .find(cells => cells[0] === '' && cells[1] === channel && /^\d{4}-\d{2}-\d{2}$/.test(cells[2] ?? ''));
  if (!dateTime) throw new Error(`${channel}: no scheduled row in plan.md`);
  const timezone = /^Launch date: .* \| Timezone: ([^\r\n]+)/m.exec(plan)?.[1].trim() ?? config.timezone;
  return wallTime(dateTime[2], dateTime[3], timezone);
}

function postHash(source: Buffer, media: Media[]) {
  const digest = createHash('sha256');
  for (const bytes of [source, ...media.map(item => item.bytes)]) {
    digest.update(String(bytes.length) + ':').update(bytes);
  }
  return digest.digest('hex');
}

export function mediaType(path: string) {
  const types: Record<string, string> = {
    '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  };
  return types[extname(path).toLowerCase()];
}

export async function loadReview(cwd?: string) {
  const paths = launchDir(cwd);
  const config = validate<Config>('config', JSON.parse(await readFile(paths.config, 'utf8')));
  const names = (config.approvers ?? []).map(({ name }) => name);
  if (names.some(name => !name.trim()) || new Set(names).size !== names.length)
    throw new Error('Configured approvers must have distinct, nonblank names');
  if (config.profile === 'enterprise' && !config.approvers?.some(approver => approver.role === 'legal-review'))
    throw new Error('Enterprise launches need a configured legal-review approver');
  const root = await realpath(paths.root);
  const plan = await readOptional(paths.plan);
  const filenames = (await readdir(paths.posts)).filter(name => name.endsWith('.md')).sort();
  if (!filenames.length) throw new Error('No .launch/posts/<channel>.md files found');
  const posts: ReviewPost[] = [];
  for (const filename of filenames) {
    const channel = filename.slice(0, -3);
    const rule = loadRule('channels', channel);
    const raw = await readLocalFile(root, join(root, 'posts', filename));
    const source = raw.toString('utf8');
    const post = parsePost(source, channel);
    const media: Media[] = [];
    for (const { slot, path } of post.media) {
      if (!path) throw new Error(`${channel}: link a local file for media slot ${slot} before review`);
      const resolved = path.startsWith('.launch/') ? resolve(root, '..', path) : resolve(root, path);
      media.push({ slot, path, bytes: await readLocalFile(root, resolved) });
    }
    posts.push({ ...post, channel, filename, source, media, hash: postHash(raw, media),
      label: String(rule.name),
      scheduledAt: schedule(plan, channel, config, (rule.bestPostingTimes as string[])[0]) });
  }
  return { paths, config, posts };
}
