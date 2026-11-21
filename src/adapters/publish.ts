import { writeFile } from 'node:fs/promises';
import { destination, readReceipts, selectAdapter } from './index.js';
import { decisions, requireApproval } from '../review/approvals.js';
import { loadReview, validate } from '../review/posts.js';
import type { PublishReceipt } from './index.js';

export async function publish(cwd?: string, confirm = false, env = process.env) {
  const { paths, config, posts } = await loadReview(cwd);
  const { approvals, skips } = await decisions(paths);
  const skipped = posts.filter(post => skips[post.channel] === post.hash).map(post => post.channel);
  const active = posts.filter(post => !skipped.includes(post.channel));
  for (const post of active) requireApproval(post, approvals, config.approvers);
  const queue = await Promise.all(active.map(async post => {
    const adapter = await selectAdapter(post.channel, cwd, env);
    adapter.validate(post);
    return { post, adapter };
  }));
  const plan = queue.map(({ post, adapter }) => ({
    channel: post.channel, adapter: adapter.name, submitUrl: destination(post.channel), scheduledAt: post.scheduledAt,
    hash: post.hash, title: post.title, body: post.body,
    ...(post.linkFirstComment ? { firstComment: post.link } : { link: post.link }),
    media: post.media.map(({ path, slot }) => ({ path, slot })),
  }));
  if (!confirm) return { mode: 'dry-run' as const, posts: plan, skipped };
  const { posts: previous } = await readReceipts(cwd);
  const receipts: PublishReceipt[] = [];
  for (const { post, adapter } of queue) receipts.push(await adapter.schedule(post, cwd));
  const byKey = new Map(previous.map(receipt => [`${receipt.channel}:${receipt.id}`, receipt]));
  for (const receipt of receipts) byKey.set(`${receipt.channel}:${receipt.id}`, receipt);
  const data = validate<{ posts: PublishReceipt[] }>('published', { posts: [...byKey.values()] });
  await writeFile(paths.published, JSON.stringify(data, null, 2) + '\n');
  return { mode: 'offline-staging' as const, posts: receipts, skipped, path: paths.published };
}
