import assert from 'node:assert/strict';
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
