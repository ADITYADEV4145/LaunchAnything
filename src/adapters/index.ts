import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { site } from '../core/registry.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchDir } from '../core/launch-dir.js';
import { readOptional, validate } from '../review/posts.js';
import type { ReviewPost } from '../review/posts.js';
import { assistedReminder } from '../connect/payloads.js';

export type AdapterName = 'postiz' | 'buffer' | 'ayrshare' | 'github-release' | 'devto' | 'email' | 'manual' | 'linkedin-api';
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
  validate(post: ReviewPost, cwd?: string): void;
  schedule(post: ReviewPost, cwd?: string): Promise<PublishReceipt>;
  status(channel: string, id: string, cwd?: string): Promise<AdapterStatus | undefined>;
  cancel(channel: string, id: string, cwd?: string): Promise<AdapterStatus | undefined>;
}

interface Metadata { id: AdapterName; name: string; priority: number; channels: string[]; envKeys: string[]; mcpAliases: string[] }
const metadata = readdirSync(join(packageRoot(), 'rules/adapters')).filter(f => f.endsWith('.yaml'))
  .map(f => parse(readFileSync(join(packageRoot(), 'rules/adapters', f), 'utf8')) as Metadata)
  .sort((a, b) => a.priority - b.priority);
const integrations = metadata.filter(m => m.id !== 'manual').map(m => m.id);
const accepts = (name: AdapterName, channel: string, cwd?: string) => {
  const target = site(channel, cwd);
  return name === 'manual' || target.route === 'integration' &&
    (target.adapters ? target.adapters.includes(name) : metadata.find(m => m.id === name)!.channels.includes(channel));
};

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

export async function adapterSelection(channel: string, cwd?: string, env = process.env) {
  const target = site(channel, cwd);
  if (target.route === 'manual') return { adapter: getAdapter(channel, undefined, cwd), reason: 'manual' };
  if (channel === 'email') return { adapter: adapters.email, reason: 'manual' };
  const eligible = integrations.filter(name => accepts(name, channel, cwd));
  for (const group of await mcpNames(cwd)) for (const name of eligible) {
    const alias = metadata.find(m => m.id === name)!.mcpAliases.find(alias => group.has(alias));
    if (alias) return { adapter: adapters[name], reason: 'mcp:' + alias };
  }
  for (const name of eligible) {
    const key = metadata.find(m => m.id === name)!.envKeys.find(key => Boolean(env[key]));
    if (key) return { adapter: adapters[name], reason: 'env:' + key };
  }
  return { adapter: getAdapter(channel, undefined, cwd), reason: 'manual' };
}
export async function selectAdapter(channel: string, cwd?: string, env = process.env) {
  return (await adapterSelection(channel, cwd, env)).adapter;
}
export function destination(channel: string, cwd?: string) { return site(channel, cwd).submitUrl; }

export async function readReceipts(cwd?: string) {
  return validate<{ posts: PublishReceipt[] }>('published',
    JSON.parse(await readOptional(launchDir(cwd).published) ?? '{"posts":[]}'));
}

function reminder(id: string, post: ReviewPost, url: string, cwd?: string) {
  if (!site(post.channel, cwd).custom && site(post.channel, cwd).route === 'manual') return assistedReminder(post.channel, post.scheduledAt);
  const icsDate = (date: string) => date.replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Liftoff//Launch reminder//EN',
    'BEGIN:VEVENT', `UID:${id}@liftoff.local`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(post.scheduledAt)}`, `SUMMARY:Prepare ${post.channel} launch post`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Review the paste-ready launch post',
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

function offlineAdapter(name: AdapterName): PublishAdapter {
  function validatePost(post: ReviewPost, cwd?: string) {
    if (!accepts(name, post.channel, cwd))
      throw new Error(`${name} cannot stage ${post.channel}`);
  }
  function find(posts: PublishReceipt[], channel: string, id: string, cwd?: string) {
    if (getAdapter(channel, id, cwd).name === name) return posts.find(post => post.channel === channel && post.id === id);
  }
  return {
    name,
    validate: validatePost,
    async schedule(post, cwd) {
      validatePost(post, cwd);
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
      const url = destination(post.channel, cwd);
      if (name === 'manual' && url) await writeFile(join(folder, 'reminder.ics'), reminder(id, post, url, cwd));
      return { channel: post.channel, id, url: pathToFileURL(file).href, scheduledAt: post.scheduledAt, status: 'manual' };
    },
    async status(channel, id, cwd) {
      const post = find((await readReceipts(cwd)).posts, channel, id, cwd);
      return post && { status: post.status };
    },
    async cancel(channel, id, cwd) {
      const data = await readReceipts(cwd);
      const post = find(data.posts, channel, id, cwd);
      if (!post) return;
      post.status = 'cancelled';
      await writeFile(launchDir(cwd).published, JSON.stringify(data, null, 2) + '\n');
      return { status: post.status };
    },
  };
}

const adapters = Object.fromEntries(metadata.map(({ id: name }) =>
  [name, offlineAdapter(name as AdapterName)])) as Record<AdapterName, PublishAdapter>;

export function getAdapter(channel: string, id?: string, cwd?: string): PublishAdapter {
  if (site(channel, cwd).route === 'manual') return adapters.manual;
  if (channel === 'email') return adapters.email;
  const name = id?.split(':', 1)[0];
  if (name && Object.hasOwn(adapters, name) && accepts(name as AdapterName, channel, cwd)) return adapters[name as AdapterName];
  return adapters.manual;
}
