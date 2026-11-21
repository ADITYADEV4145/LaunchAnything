import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchDir } from '../core/launch-dir.js';
import { readOptional, validate } from '../review/posts.js';
import type { ReviewPost } from '../review/posts.js';
import { assistedReminder } from '../connect/payloads.js';

export type AdapterName = 'postiz' | 'buffer' | 'ayrshare' | 'github-release' | 'devto' | 'email' | 'manual';
type ReceiptStatus = 'manual' | 'scheduled' | 'published' | 'failed' | 'cancelled';
export interface PublishReceipt {
  channel: string;
  id: string;
  url?: string;
  scheduledAt?: string;
  status: ReceiptStatus;
}
export interface AdapterStatus {
  status: ReceiptStatus;
  metrics?: Record<string, number>;
  owned?: boolean;
  comments?: { id: string; author: string; body: string; url?: string; answered: boolean }[];
}
export interface PublishAdapter {
  name: AdapterName;
  validate(post: ReviewPost): void;
  schedule(post: ReviewPost, cwd?: string): Promise<PublishReceipt>;
  status(channel: string, id: string, cwd?: string): Promise<AdapterStatus | undefined>;
  cancel(channel: string, id: string, cwd?: string): Promise<AdapterStatus | undefined>;
}

const destinations: Record<string, string> = {
  'show-hn': 'https://news.ycombinator.com/submit',
  reddit: 'https://www.reddit.com/submit',
  'product-hunt': 'https://www.producthunt.com/posts/new',
  x: 'https://x.com/compose/post',
  linkedin: 'https://www.linkedin.com/feed/',
  devto: 'https://dev.to/new',
};
const manualOnly = new Set(['show-hn', 'reddit', 'product-hunt']);
const social = ['x', 'linkedin', 'tiktok', 'reels', 'shorts', 'instagram'];
const supported: Record<AdapterName, string[]> = {
  postiz: social, buffer: social, ayrshare: social,
  'github-release': ['github-release'], devto: ['devto'], email: ['email'], manual: [],
};
const envKeys: Partial<Record<AdapterName, string[]>> = {
  postiz: ['POSTIZ_API_KEY'], buffer: ['BUFFER_ACCESS_TOKEN', 'BUFFER_API_KEY'],
  ayrshare: ['AYRSHARE_API_KEY'], 'github-release': ['GH_TOKEN', 'GITHUB_TOKEN'],
  devto: ['DEVTO_API_KEY'],
};
const integrations = ['postiz', 'buffer', 'ayrshare', 'github-release', 'devto'] as const;
const accepts = (name: AdapterName, channel: string) => name === 'manual' || supported[name].includes(channel);

async function mcpNames(cwd?: string) {
  const repo = resolve(cwd ?? process.cwd());
  const paths = [join(repo, '.mcp.json'), join(homedir(), '.claude.json')];
  const groups: Set<string>[] = [];
  for (const path of paths) {
    try {
      const config = JSON.parse(await readOptional(path) ?? '{}');
      for (const servers of [config?.projects?.[repo]?.mcpServers, config?.mcpServers]) {
        groups.push(new Set(Object.keys(servers ?? {}).map(name => name.toLowerCase())));
      }
    } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  return groups;
}

export async function selectAdapter(channel: string, cwd?: string, env = process.env) {
  if (manualOnly.has(channel) || channel === 'email') return getAdapter(channel);
  const eligible = integrations.filter(name => accepts(name, channel));
  if (!eligible.length) return getAdapter(channel);
  const groups = await mcpNames(cwd);
  const selected = groups.map(mcp =>
    eligible.find(name => [name, name + '-mcp', 'mcp-' + name].some(alias => mcp.has(alias)))).find(Boolean)
    ?? eligible.find(name => envKeys[name]?.some(key => Boolean(env[key])));
  return selected ? adapters[selected] : getAdapter(channel);
}

export function destination(channel: string) {
  return destinations[channel];
}

export async function readReceipts(cwd?: string) {
  return validate<{ posts: PublishReceipt[] }>('published',
    JSON.parse(await readOptional(launchDir(cwd).published) ?? '{"posts":[]}'));
}

function reminder(id: string, post: ReviewPost, url: string) {
  if (manualOnly.has(post.channel)) return assistedReminder(post.channel, post.scheduledAt, post.scheduledAt.slice(0, 10));
  const icsDate = (date: string) => date.replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Liftoff//Launch reminder//EN',
    'BEGIN:VEVENT', `UID:${id}@liftoff.local`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(post.scheduledAt)}`, `SUMMARY:Prepare ${post.channel} launch post`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Review the paste-ready launch post',
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

function offlineAdapter(name: AdapterName): PublishAdapter {
  function validatePost(post: ReviewPost) {
    if (!accepts(name, post.channel) || (manualOnly.has(post.channel) && name !== 'manual'))
      throw new Error(`${name} cannot stage ${post.channel}`);
  }
  function find(posts: PublishReceipt[], channel: string, id: string) {
    if (getAdapter(channel, id).name === name) return posts.find(post => post.channel === channel && post.id === id);
  }
  return {
    name,
    validate: validatePost,
    async schedule(post, cwd) {
      validatePost(post);
      const id = `${name}:${post.channel}:${post.hash}`;
      const folder = join(launchDir(cwd).review, 'ready', post.channel, post.hash);
      await mkdir(folder, { recursive: true });
      const file = join(folder, 'post.txt');
      const copy = [name === 'email' ? `Subject: ${post.title}` : post.title, post.body,
        !post.linkFirstComment && post.link && !post.body.includes(post.link) ? post.link : undefined].filter(Boolean);
      await writeFile(file, copy.join('\n\n') + '\n');
      if (post.linkFirstComment && post.link) await writeFile(join(folder, 'first-comment.txt'), post.link + '\n');
      for (const [index, media] of post.media.entries()) {
        await writeFile(join(folder, `attachment-${index + 1}${extname(media.path)}`), media.bytes);
      }
      const url = destination(post.channel);
      if (name === 'manual' && url) await writeFile(join(folder, 'reminder.ics'), reminder(id, post, url));
      return { channel: post.channel, id, url: pathToFileURL(file).href, scheduledAt: post.scheduledAt, status: 'manual' };
    },
    async status(channel, id, cwd) {
      const post = find((await readReceipts(cwd)).posts, channel, id);
      return post && { status: post.status };
    },
    async cancel(channel, id, cwd) {
      const data = await readReceipts(cwd);
      const post = find(data.posts, channel, id);
      if (!post) return;
      post.status = 'cancelled';
      await writeFile(launchDir(cwd).published, JSON.stringify(data, null, 2) + '\n');
      return { status: post.status };
    },
  };
}

const adapters = Object.fromEntries([...integrations, 'email', 'manual'].map(name =>
  [name, offlineAdapter(name as AdapterName)])) as Record<AdapterName, PublishAdapter>;

export function getAdapter(channel: string, id?: string): PublishAdapter {
  if (manualOnly.has(channel)) return adapters.manual;
  if (channel === 'email') return adapters.email;
  const name = id?.split(':', 1)[0];
  if (name && Object.hasOwn(adapters, name) && accepts(name as AdapterName, channel)) return adapters[name as AdapterName];
  return adapters.manual;
}
