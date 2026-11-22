import assert from 'node:assert/strict';
import { mock } from 'node:test';
import http from 'node:http';
import https from 'node:https';
import { Socket } from 'node:net';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { connect, requireConnection } from '../connect/registry.js';
import { MemoryKeychain } from '../connect/keychain.js';
import { MockBrowser } from '../connect/browser.js';
import { assistedPublish } from '../connect/publish.js';
import { reserveCap } from '../connect/caps.js';
import { loadReview } from '../review/posts.js';
import type { Check } from './types.js';
import { MockMcpClient, productHuntTools } from '../connect/mcp.js';
import { buildReview } from '../review/page.js';
import { publish } from '../adapters/publish.js';
import { liveUrls, published as launchPublished } from '../launch-ops/common.js';
import { collect } from '../results/collect.js';

export async function phase5bGate(cwd: string) {
  const workspace = join(cwd, '.liftoff-fixture', 'phase5b-work');
  const paths = launchDir(workspace);
  const home = join(cwd, '.liftoff-fixture', 'phase5b-home');
  await mkdir(paths.posts, { recursive: true });
  await writeFile(paths.config, JSON.stringify({ profile: 'devtool', channels: ['show-hn'], launchType: 'new-product', launchDate: '2026-07-14', timezone: 'UTC', profileConfirmed: true }));
  await writeFile(join(paths.posts, 'show-hn.md'), '---\ntitle: Own account\nmedia: []\nclaims: []\nlink: https://example.test\n---\nLocal launch.\n');
  const keychain = new MemoryKeychain();
  const token = 'phase5b-private-token';
  await connect({ platform: 'devto', route: 'api', account: 'owner' }, token, keychain, home);
  assert.equal(await keychain.get('devto:owner'), token);
  await assert.rejects(requireConnection('reddit', undefined, home), /connect your own account/);
  const browser = new MockBrowser();
  const options = { home, browser: async () => browser };
  await assert.rejects(assistedPublish(workspace, options), /not approved/);
  assert.equal(browser.actions.length, 0);
  const { posts: [post] } = await loadReview(workspace);
  await writeFile(paths.approvals, JSON.stringify({ approvals: [{ channel: post.channel, hash: post.hash, name: 'Owner', time: new Date().toISOString() }] }));
  await assert.rejects(assistedPublish(workspace, options), /connect your own account/);
  await connect({ platform: 'show-hn', route: 'browser', account: 'owner', profile: workspace }, undefined, keychain, home);
  const result = await assistedPublish(workspace, options);
  assert.equal(result.posts[0].status, 'published');
  assert.equal(browser.actions.filter(a => a.action === 'fill').length, 3);
  await assert.rejects(browser.fill('input[type="submit"]', ''), /Submit/);
  const count = browser.actions.length;
  await assert.rejects(assistedPublish(workspace, options), /daily cap/);
  assert.equal(browser.actions.length, count);
  await reserveCap(paths.root, 'reddit', 'owner');
  await assert.rejects(reserveCap(paths.root, 'reddit', 'other'), /one subreddit/);
  await writeFile(join(paths.posts, 'x.md'), '---\ntitle: Own account\nmedia: []\nclaims: []\n---\nLocal launch.\n');
  const { posts } = await loadReview(workspace);
  await writeFile(paths.approvals, JSON.stringify({ approvals: posts.map(p => ({ channel: p.channel, hash: p.hash, name: 'Owner', time: new Date().toISOString() })) }));
  const network = () => { throw new Error('Unexpected network call'); };
  const hooks = [mock.method(globalThis, 'fetch', network), mock.method(http, 'request', network),
    mock.method(http, 'get', network), mock.method(https, 'request', network), mock.method(https, 'get', network),
    mock.method(Socket.prototype, 'connect', network)];
  try {
    await assert.rejects(assistedPublish(workspace, { ...options, channel: 'x' }), /connect your own account/);
    await connect({ platform: 'x', route: 'buffer', account: 'owner' }, token, keychain, home);
    const staged = await assistedPublish(workspace, { ...options, channel: 'x' });
    assert.equal(staged.posts[0].status, 'manual');
    assert.match(staged.posts[0].id, /^buffer:x:/);
    assert.equal(await readFile(new URL(staged.posts[0].url!), 'utf8'), 'Own account\n\nLocal launch.\n');
    assert.equal(JSON.parse(await readFile(paths.published, 'utf8')).posts.length, 2);
    assert.equal(browser.actions.length, count);
    const xPath = join(paths.posts, 'x.md');
    const source = await readFile(xPath, 'utf8');
    await writeFile(xPath, source + 'Edited after approval.\n');
    await assert.rejects(assistedPublish(workspace, { ...options, channel: 'x' }), /not approved/);
    await writeFile(xPath, source);
    const receipts = await readFile(paths.published, 'utf8');
    assert.equal((await publish(workspace)).mode, 'dry-run');
    assert.equal(await readFile(paths.published, 'utf8'), receipts);
    const review = await buildReview(workspace);
    const html = await readFile(review.path, 'utf8');
    assert.ok(html.includes('$0.015'));
    assert.ok(html.indexOf('X API cost before approval') < html.indexOf('data-action="approve"', html.indexOf('X API cost before approval')));
    const launch = await launchPublished(workspace);
    assert.ok(liveUrls(launch).includes('https://news.ycombinator.com/item?id='));
    const seen: unknown[] = [];
    await collect(workspace, { now: new Date('2026-07-15T12:00:00Z'), readStatus: async post => { seen.push(post); return { views: 1 }; } });
    assert.deepEqual(seen, launch);
    await assert.rejects(connect({ platform: 'linkedin', route: 'browser', account: 'owner', profile: workspace }, undefined, keychain, home), /official API/);
    await assert.rejects(connect({ platform: 'linkedin', route: 'mcp', account: 'owner' }, token, keychain, home), /website-driving MCP/);
    await writeFile(join(paths.posts, 'product-hunt.md'), '---\ntitle: Own product\nmedia: []\nclaims: []\nlink: https://example.test\n---\nLocal product launch.\n');
    const { posts: phPosts } = await loadReview(workspace);
    await writeFile(paths.approvals, JSON.stringify({ approvals: phPosts.map(p => ({ channel: p.channel, hash: p.hash, name: 'Owner', time: new Date().toISOString() })) }));
    await connect({ platform: 'product-hunt', account: 'owner' }, token, keychain, home);
    const ph = new MockMcpClient('product-hunt');
    const drafted = await assistedPublish(workspace, { home, channel: 'product-hunt', keychain, mcp: async () => ph });
    assert.equal(drafted.posts[0].status, 'manual');
    assert.deepEqual(ph.calls.map(call => call.name), productHuntTools);
    await assert.rejects(ph.callTool('submit_launch', {}), /refused/);
    await connect({ platform: 'x', account: 'owner' }, token, keychain, home);
    const x = new MockMcpClient('x', [{ name: 'unverified_write_tool' }]);
    const fallback = await assistedPublish(workspace, { home, channel: 'x', keychain, mcp: async () => x });
    assert.equal(x.discoveries, 2);
    assert.equal(x.calls.length, 0);
    assert.equal(fallback.posts[0].status, 'manual');
    assert.ok((await readFile(new URL(fallback.posts[0].url!), 'utf8')).includes('Local launch.'));
    assert.equal(JSON.parse(await readFile(new URL('failure.json', fallback.posts[0].url), 'utf8')).attempts, 2);
    for (const hook of hooks) assert.equal(hook.mock.callCount(), 0);
  } finally { for (const hook of hooks) hook.mock.restore(); }
  async function scan(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else assert.ok(!(await readFile(path, 'utf8')).includes(token), 'Token leaked to .launch');
    }
  }
  await scan(paths.root);
  assert.ok(!(await readFile(join(home, 'connections.json'), 'utf8')).includes(token));
}
export const checks: Check[] = [{ name: 'phase 5b mock browser, keychain, approvals, connections and caps', run: ({ cwd }) => phase5bGate(cwd) }];
