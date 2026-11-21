import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadReview, mediaType, readOptional } from '../review/posts.js';
import { decisions, requireApproval } from '../review/approvals.js';
import { getAdapter, readReceipts } from '../adapters/index.js';
import type { PublishReceipt } from '../adapters/index.js';
import { requireConnection } from './registry.js';
import { chromeBrowser, type BrowserDriver } from './browser.js';
import { forms, fillForm, frontMatter, type BrowserPlatform } from './forms.js';
import { reserveCap } from './caps.js';
import { assistedReminder, instagramPayload } from './payloads.js';

export interface AssistOptions { channel?: string; account?: string; home?: string; browser?: (profile: string) => Promise<BrowserDriver>; now?: Date; timeout?: number }
export async function assistedPublish(cwd: string | undefined, options: AssistOptions = {}) {
  const { paths, config, posts } = await loadReview(cwd);
  const { approvals, skips } = await decisions(paths);
  const selected = posts.filter(p => (!options.channel || p.channel === options.channel) && skips[p.channel] !== p.hash);
  if (!selected.length) throw new Error('No matching approved posts to assist');
  const plan = await readOptional(paths.plan);
  const order = plan?.split('\n').map(line => line.split('|')[1]?.trim()) ?? [];
  selected.sort((a, b) => {
    const rank = (channel: string) => order.includes(channel) ? order.indexOf(channel) : Number.MAX_SAFE_INTEGER;
    return rank(a.channel) - rank(b.channel);
  });
  const queue = [];
  for (const post of selected) {
    requireApproval(post, approvals, config.approvers);
    const connection = await requireConnection(post.channel, options.account, options.home);
    const route = connection.route === 'api' ? post.channel : connection.route;
    const adapter = connection.route === 'browser' ? undefined : getAdapter(post.channel, route + ':');
    if (adapter) {
      if (adapter.name !== route) throw new Error(`${post.channel}: unsupported connected route ${connection.route}`);
      adapter.validate(post);
    } else if (!Object.hasOwn(forms, post.channel)) throw new Error(`${post.channel}: no browser form available`);
    let instagram;
    if (post.channel === 'instagram') {
      const extra = frontMatter(post);
      const hashtags = extra.hashtags ?? [];
      if (!Array.isArray(hashtags) || hashtags.some(tag => typeof tag !== 'string'))
        throw new Error('Instagram hashtags must be a list of strings');
      instagram = instagramPayload({ gallery: post.media.filter(m => mediaType(m.path)?.startsWith('image/')).map(m => m.path),
        verticalVideo: post.media.find(m => mediaType(m.path)?.startsWith('video/') && /9[x:–-]16/i.test(m.slot + ' ' + m.path))?.path ?? '',
        caption: post.body, hashtags, coverFrame: extra.coverFrame === undefined ? 0 : extra.coverFrame as number });
    }
    queue.push({ post, connection, adapter, instagram });
  }
  const receipts: PublishReceipt[] = [];
  for (const { post, connection, adapter, instagram } of queue) {
    await reserveCap(paths.root, post.channel, connection.account, options.now);
    let receipt: PublishReceipt;
    if (adapter) {
      receipt = await adapter.schedule(post, cwd);
      if (instagram) await writeFile(new URL('instagram-payload.json', receipt.url), JSON.stringify(instagram, null, 2) + '\n');
    } else {
      await writeFile(join(paths.root, `${post.channel}-assisted.ics`), assistedReminder(post.channel, post.scheduledAt, post.scheduledAt.slice(0, 10)));
      const driver = await (options.browser ?? chromeBrowser)(connection.profile!);
      try {
        await fillForm(driver, post, paths.root);
        const url = await driver.waitForUrl(forms[post.channel as BrowserPlatform].result, options.timeout ?? 600000);
        receipt = { channel: post.channel, id: `browser:${post.channel}:${post.hash}`, url, status: 'published', scheduledAt: post.scheduledAt };
      } finally { await driver.close(); }
    }
    const previous = await readReceipts(cwd);
    const merged = previous.posts.filter(p => p.channel !== receipt.channel || p.id !== receipt.id);
    await writeFile(paths.published, JSON.stringify({ posts: [...merged, receipt] }, null, 2) + '\n');
    receipts.push(receipt);
  }
  return { mode: 'assisted', posts: receipts };
}
