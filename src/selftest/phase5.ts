import { deepEqual, equal, match, rejects } from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import { join } from 'node:path';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAdapter } from '../adapters/index.js';
import { publish } from '../adapters/publish.js';
import { launchDir } from '../core/launch-dir.js';
import { buildReview } from '../review/page.js';
import type { Check } from './types.js';

const channels = ['show-hn', 'reddit', 'product-hunt'];
const copy = `---
title: Fixture launch
body: A test launch post.
media:
  - slot: screenshot
    path: media/fixture.svg
claims: []
---
`;

async function approvedFixture(cwd: string, name: string) {
  const work = join(cwd, '.liftoff-fixture', 'phase5-' + name);
  const paths = launchDir(work);
  await mkdir(paths.posts, { recursive: true });
  await mkdir(paths.media, { recursive: true });
  await writeFile(paths.config, JSON.stringify({
    profile: 'devtool', launchType: 'new-product', channels, timezone: 'UTC',
    launchDate: '2026-07-14', profileConfirmed: true,
  }));
  await writeFile(join(paths.media, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  for (const channel of channels) await writeFile(join(paths.posts, channel + '.md'), copy);
  const review = await buildReview(work);
  match(await readFile(review.path, 'utf8'), /Launch review/);
  await writeFile(paths.approvals, JSON.stringify({ approvals: review.posts.map(({ channel, hash }) =>
    ({ channel, hash, name: 'Fixture reviewer', time: '2026-07-13T09:00:00Z' })) }));
  return { work, paths };
}

export const checks: Check[] = [
  { name: 'edited post and changed media are refused', async run({ cwd }) {
    const { work, paths } = await approvedFixture(cwd, 'stale');
    const post = join(paths.posts, 'show-hn.md');
    await writeFile(post, copy.replace('Fixture launch', 'Edited launch'));
    await rejects(publish(work, true, {}), /show-hn: exact post and media hash not approved/);
    await writeFile(post, copy);
    await writeFile(join(paths.media, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    await rejects(publish(work, true, {}), /exact post and media hash not approved/);
    await rejects(readFile(paths.published), { code: 'ENOENT' });
  } },
  { name: 'default dry run has no network or publish outputs', async run({ cwd }) {
    const { work, paths } = await approvedFixture(cwd, 'dry-run');
    await writeFile(join(paths.posts, 'x.md'), copy);
    const review = await buildReview(work);
    await writeFile(paths.approvals, JSON.stringify({ approvals: review.posts.map(({ channel, hash }) =>
      ({ channel, hash, name: 'Fixture reviewer', time: '2026-07-13T09:00:00Z' })) }));
    await writeFile(join(work, '.mcp.json'), '{"mcpServers":{"buffer":{"url":"https://example.invalid"}}}');
    const network = () => { throw new Error('Unexpected network call'); };
    const hooks = [mock.method(globalThis, 'fetch', network), mock.method(http, 'request', network),
      mock.method(http, 'get', network), mock.method(https, 'request', network), mock.method(https, 'get', network),
      mock.method(Socket.prototype, 'connect', network)];
    try {
      const plan = await publish(work, undefined, { POSTIZ_API_KEY: 'fixture-key' });
      equal(plan.mode, 'dry-run');
      equal(plan.posts.length, channels.length + 1);
      equal(plan.posts.find(post => post.channel === 'x' && 'adapter' in post && post.adapter === 'buffer')?.channel, 'x');
      for (const hook of hooks) equal(hook.mock.callCount(), 0);
    } finally {
      for (const hook of hooks) hook.mock.restore();
    }
    await rejects(readFile(paths.published), { code: 'ENOENT' });
    await rejects(readFile(join(paths.review, 'ready')), { code: 'ENOENT' });
  } },
  { name: 'manual launch kits include paste files and reminders', async run({ cwd }) {
    const { work, paths } = await approvedFixture(cwd, 'manual');
    const result = await publish(work, true, {});
    equal(result.mode, 'offline-staging');
    if (result.mode !== 'offline-staging') throw new Error('Expected offline staging');
    const receipts = JSON.parse(await readFile(paths.published, 'utf8')).posts;
    deepEqual(receipts, result.posts);
    deepEqual(receipts.map((receipt: { channel: string }) => receipt.channel), [...channels].sort());
    for (const post of result.posts) {
      equal(post.status, 'manual');
      equal(await readFile(fileURLToPath(post.url!), 'utf8'), 'Fixture launch\n\nA test launch post.\n');
      match(await readFile(new URL('reminder.ics', post.url), 'utf8'), /BEGIN:VALARM/);
      deepEqual(await getAdapter(post.channel, post.id).status(post.channel, post.id, work), { status: 'manual' });
    }
  } },
];
