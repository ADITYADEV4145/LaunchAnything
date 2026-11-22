import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { adapterMetadata } from '../src/adapters/metadata.js';
import { getAdapter, type PublishReceipt } from '../src/adapters/index.js';
import { isLiveReceiptFor } from '../src/adapters/receipts.js';
import { groundworkGoFixture } from '../src/selftest/groundwork-go.js';
import { loadReview } from '../src/review/posts.js';
import { mcpDraft, MockMcpClient } from '../src/connect/mcp.js';

it.each(adapterMetadata.map(adapter => [adapter.id, adapter.channels[0] ?? 'product-hunt']))(
  'recognizes a %s staging receipt after the documented manual release', async (name, channel) => {
    const cwd = await mkdtemp(join(tmpdir(), 'liftoff-receipt-'));
    try {
      const { work } = await groundworkGoFixture(cwd);
      const { posts } = await loadReview(work, undefined, () => '2026-01-06T15:00:00.000Z');
      const post = posts.find(post => post.channel === channel)!;
      const adapter = getAdapter(channel, `${name}:${channel}:unused`, work);
      expect(adapter.name).toBe(name);
      const receipt = await adapter.schedule(post, work);
      expect(isLiveReceiptFor(receipt, post, 'unrelated')).toBe(false);
      const released = { ...receipt, status: 'published' as const, url: 'https://example.test/live' };
      expect(isLiveReceiptFor(released, post, 'unrelated')).toBe(true);
      expect(isLiveReceiptFor(released, { ...post, hash: 'a'.repeat(64) }, 'unrelated')).toBe(false);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);

it('recognizes the PH MCP draft identity only after manual publication', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-receipt-'));
  try {
    const { work, paths } = await groundworkGoFixture(cwd);
    const { posts } = await loadReview(work, undefined, () => '2026-01-06T15:00:00.000Z');
    const post = posts.find(post => post.channel === 'product-hunt')!;
    const receipt = await mcpDraft('product-hunt', new MockMcpClient('product-hunt'), post, paths.root);
    expect(isLiveReceiptFor(receipt, post, 'unrelated')).toBe(false);
    expect(isLiveReceiptFor({ ...receipt, status: 'published', url: 'https://www.producthunt.com/posts/live' }, post, 'unrelated')).toBe(true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
}, 30000);

it.each(['go', 'go-mock'])('recognizes a normalized %s approval identity without treating opaque IDs as content hashes', prefix => {
  const post = { channel: 'show-hn', hash: 'a'.repeat(64) }, identity = `${prefix}:${'b'.repeat(64)}`;
  const receipt: PublishReceipt = { channel: post.channel, id: identity, status: 'published', url: 'https://example.test/live' };
  expect(isLiveReceiptFor(receipt, post, identity)).toBe(true);
  expect(isLiveReceiptFor(receipt, post, `${prefix}:${'c'.repeat(64)}`)).toBe(false);
  expect(isLiveReceiptFor({ ...receipt, channel: 'reddit' }, post, identity)).toBe(false);
  for (const url of [undefined, '', 'https://', 'http://example.test/live', 'file:///draft']) {
    expect(isLiveReceiptFor({ ...receipt, url }, post, identity)).toBe(false);
  }
  for (const status of ['manual', 'scheduled', 'failed', 'cancelled'] as const) {
    expect(isLiveReceiptFor({ ...receipt, status }, post, identity)).toBe(false);
  }
});
