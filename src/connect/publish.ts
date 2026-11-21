import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadReview, readOptional } from '../review/posts.js';
import { decisions, requireApproval } from '../review/approvals.js';
import { readReceipts } from '../adapters/index.js';
import type { PublishReceipt } from '../adapters/index.js';
import { requireConnection } from './registry.js';
import { chromeBrowser, type BrowserDriver } from './browser.js';
import { forms, fillForm, type BrowserPlatform } from './forms.js';
import { reserveCap } from './caps.js';
import { assistedReminder } from './payloads.js';

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
    if (connection.route !== 'browser' || !Object.hasOwn(forms, post.channel))
      throw new Error(`${post.channel}: ${connection.route} connection recorded; live API/MCP dispatch is not configured. Use the default offline paste kit`);
    queue.push({ post, connection });
  }
  const receipts: PublishReceipt[] = [];
  for (const { post, connection } of queue) {
    await reserveCap(paths.root, post.channel, connection.account, options.now);
    await writeFile(join(paths.root, `${post.channel}-assisted.ics`), assistedReminder(post.channel, post.scheduledAt, post.scheduledAt.slice(0, 10)));
    const driver = await (options.browser ?? chromeBrowser)(connection.profile!);
    try {
      await fillForm(driver, post, paths.root);
      const url = await driver.waitForUrl(forms[post.channel as BrowserPlatform].result, options.timeout ?? 600000);
      const receipt: PublishReceipt = { channel: post.channel, id: `manual:${post.channel}:${post.hash}`, url, status: 'published', scheduledAt: post.scheduledAt };
      const previous = await readReceipts(cwd);
      const merged = previous.posts.filter(p => p.channel !== receipt.channel || p.id !== receipt.id);
      await writeFile(paths.published, JSON.stringify({ posts: [...merged, receipt] }, null, 2) + '\n');
      receipts.push(receipt);
    } finally { await driver.close(); }
  }
  return { mode: 'assisted', posts: receipts };
}
