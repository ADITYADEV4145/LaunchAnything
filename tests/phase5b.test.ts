import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { phase5bGate } from '../src/selftest/phase5b.js';
import { MemoryKeychain } from '../src/connect/keychain.js';
import { connect, connections, removeConnection } from '../src/connect/registry.js';
import { MockBrowser } from '../src/connect/browser.js';
import { fillForm, forms } from '../src/connect/forms.js';
import { assistedReminder, instagramPayload, productHuntPayload } from '../src/connect/payloads.js';
import type { ReviewPost } from '../src/review/posts.js';
import { loadReview } from '../src/review/posts.js';
import { assistedPublish } from '../src/connect/publish.js';
import { publish } from '../src/adapters/publish.js';
import { dailyCaps } from '../src/connect/caps.js';
import { launchDir } from '../src/core/launch-dir.js';
import type { Route } from '../src/connect/registry.js';

const temp: string[] = [];
async function workspace() { const path = await mkdtemp(join(tmpdir(), 'liftoff-5b-')); temp.push(path); return path; }
afterEach(async () => { await Promise.all(temp.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function approvedPost(channel: string, media: string[] = [], extra = {}) {
  const cwd = await workspace();
  const paths = launchDir(cwd);
  const home = join(cwd, 'connections');
  await mkdir(paths.posts, { recursive: true });
  await mkdir(paths.media, { recursive: true });
  await writeFile(paths.config, JSON.stringify({ profile: 'devtool', channels: [channel], launchType: 'new-product', launchDate: '2026-07-14', timezone: 'UTC', profileConfirmed: true }));
  for (const name of media) await writeFile(join(paths.media, name), 'fixture media');
  const source = '---\n' + stringify({ title: 'Launch', media: media.map(name => ({ path: 'media/' + name, slot: 'attachment' })), claims: [], ...extra }) + '---\nCaption.\n';
  await writeFile(join(paths.posts, channel + '.md'), source);
  const { posts: [post] } = await loadReview(cwd);
  await writeFile(paths.approvals, JSON.stringify({ approvals: [{ channel, hash: post.hash, name: 'Owner', time: new Date().toISOString() }] }));
  return { cwd, paths, home };
}

it.each([['x', 'postiz', 'postiz'], ['x', 'buffer', 'buffer'], ['devto', 'api', 'devto'], ['github-release', 'api', 'github-release']] as const)('stages connected %s through %s without opening a browser', async (channel, route, adapter) => {
  const { cwd, paths, home } = await approvedPost(channel);
  const browser = async () => { throw new Error('Unexpected browser'); };
  await expect(assistedPublish(cwd, { home, browser })).rejects.toThrow('connect your own account');
  await connect({ platform: channel, route: route as Route, account: 'owner' }, 'token', new MemoryKeychain(), home);
  const result = await assistedPublish(cwd, { home, browser });
  expect(result.posts[0]).toMatchObject({ channel, status: 'manual' });
  expect(result.posts[0].id).toMatch(new RegExp('^' + adapter + ':'));
  expect(await readFile(new URL(result.posts[0].url!), 'utf8')).toBe('Launch\n\nCaption.\n');
  await assistedPublish(cwd, { home, browser });
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toEqual(result.posts);
  for (let count = 2; count < (dailyCaps[channel] ?? 2); count++) await assistedPublish(cwd, { home, browser });
  await expect(assistedPublish(cwd, { home, browser })).rejects.toThrow('daily cap');
});

it.each([undefined, 3])('stages Instagram gallery, 9:16 reel, caption and first comment (cover %s)', async coverFrame => {
  const { cwd, home } = await approvedPost('instagram', ['gallery.png', 'short-9x16.mp4', 'wide-16x9.mp4'], { hashtags: ['build', '#local'], ...(coverFrame === undefined ? {} : { coverFrame }) });
  await connect({ platform: 'instagram', route: 'buffer', account: 'owner' }, 'token', new MemoryKeychain(), home);
  const { posts: [receipt] } = await assistedPublish(cwd, { home });
  expect(JSON.parse(await readFile(new URL('instagram-payload.json', receipt.url), 'utf8'))).toEqual({
    carousel: { images: ['media/gallery.png'] }, reel: { video: 'media/short-9x16.mp4', aspectRatio: '9:16', coverFrame: coverFrame ?? 0 }, caption: 'Caption.', firstComment: '#build #local',
  });
});

it.each([
  { media: [], extra: {}, error: 'Instagram requires' },
  { media: ['short-9x16.mp4'], extra: {}, error: 'Instagram requires' },
  { media: ['gallery.png', 'wide-16x9.mp4'], extra: {}, error: 'Instagram requires' },
  { media: ['gallery.png', 'short-9x16.mp4'], extra: { hashtags: 'wrong' }, error: 'hashtags must be a list' },
  { media: ['gallery.png', 'short-9x16.mp4'], extra: { coverFrame: -1 }, error: 'Instagram requires' },
])('refuses invalid Instagram assets or metadata: $error', async ({ media, extra, error }) => {
  const { cwd, paths, home } = await approvedPost('instagram', media, extra);
  await connect({ platform: 'instagram', route: 'postiz', account: 'owner' }, 'token', new MemoryKeychain(), home);
  await expect(assistedPublish(cwd, { home })).rejects.toThrow(error);
  await expect(readFile(paths.published)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(paths.root, 'publish-caps.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('runs the mock-only gate including approvals, secret isolation and cap refusal', async () => {
  await phase5bGate(await workspace());
});
it('retains the browser-published URL and status after later offline staging', async () => {
  const { cwd, paths, home } = await approvedPost('show-hn');
  await connect({ platform: 'show-hn', route: 'browser', account: 'owner', profile: cwd }, undefined, new MemoryKeychain(), home);
  const { posts: [published] } = await assistedPublish(cwd, { home, browser: async () => new MockBrowser() });
  const staged = await publish(cwd, true, {});
  expect(staged.posts[0].status).toBe('manual');
  expect(staged.posts[0].id).not.toBe(published.id);
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toEqual([published, ...staged.posts]);
  expect(published).toMatchObject({ status: 'published', url: 'https://news.ycombinator.com/item?id=123' });
});
it('validates route and token without persisting invalid connections', async () => {
  const home = await workspace();
  const keys = new MemoryKeychain();
  await expect(connect({ platform: 'reddit', route: 'api', account: 'me' }, 'secret', keys, home)).rejects.toThrow('Unsupported route');
  await expect(connect({ platform: 'devto', route: 'api', account: 'me' }, '', keys, home)).rejects.toThrow('Token required');
  await expect(connect({ platform: 'reddit', route: 'browser', account: 'me' }, undefined, keys, home)).rejects.toThrow('--profile');
  expect(await connections(home)).toEqual([]);
});
it('serializes concurrent connects and removes across keychain waits', async () => {
  const home = await workspace();
  const keys = new MemoryKeychain();
  const input = (account: string) => ({ platform: 'x', route: 'buffer' as const, account });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const set = keys.set.bind(keys);
  keys.set = async (account, token) => {
    if (account === 'x:first') { entered.resolve(); await release.promise; }
    await set(account, token);
  };
  const first = connect(input('first'), 'one', keys, home);
  await entered.promise;
  const second = connect(input('second'), 'two', keys, home);
  release.resolve();
  await Promise.all([first, second]);
  expect((await connections(home)).map(r => r.account).sort()).toEqual(['first', 'second']);
  const deleting = Promise.withResolvers<void>();
  const finishDelete = Promise.withResolvers<void>();
  const remove = keys.delete.bind(keys);
  keys.delete = async account => { deleting.resolve(); await finishDelete.promise; await remove(account); };
  const removal = removeConnection('x', 'first', keys, home);
  await deleting.promise;
  const third = connect(input('third'), 'three', keys, home);
  finishDelete.resolve();
  await Promise.all([removal, third]);
  expect((await connections(home)).map(r => r.account).sort()).toEqual(['second', 'third']);
  expect(await keys.get('x:first')).toBeUndefined();
  expect(await keys.get('x:third')).toBe('three');
});
it('releases the registry lock without saving after a keychain error', async () => {
  const home = await workspace();
  const keys = new MemoryKeychain();
  const input = { platform: 'x', route: 'buffer' as const, account: 'owner' };
  await expect(connect(input, 'token', { ...keys, get: async () => undefined, delete: async () => {}, set: async () => { throw new Error('Keychain denied'); } }, home)).rejects.toThrow('Keychain denied');
  expect(await connections(home)).toEqual([]);
  await connect(input, 'token', keys, home);
  expect(await connections(home)).toHaveLength(1);
});
it.each(['reddit', 'product-hunt'] as const)('fills %s without any submit operation', async channel => {
  const browser = new MockBrowser(channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/abc/title/' : 'https://www.producthunt.com/posts/my-product');
  const post = { channel, title: 'Product', body: 'Description', scheduledAt: '2026-07-14T12:00:00Z',
    source: '---\nsubreddit: test\nflair: Launch\n---\n', media: [{ path: 'media/gallery.png', slot: 'gallery', bytes: Buffer.from('mock') }, { path: 'media/9x16.mp4', slot: 'video', bytes: Buffer.from('mock') }] } as ReviewPost;
  await fillForm(browser, post, '/launch');
  expect(browser.actions.some(a => a.action === 'upload')).toBe(true);
  expect(await browser.waitForUrl(forms[channel].result, 1)).toBe(browser.result);
  expect('click' in browser).toBe(false);
  expect(browser.actions.some(a => /submit|button/.test(a.selector ?? ''))).toBe(false);
  browser.result = forms[channel].url;
  await expect(browser.waitForUrl(forms[channel].result, 1)).rejects.toThrow('Timed out');
});
it.each(['changed', 'symlink', 'upload failure'])('uploads only approved bytes and cleans staging after %s', async change => {
  const { cwd, paths } = await approvedPost('reddit', ['gallery.png'], { subreddit: 'r/test' });
  const { posts: [post] } = await loadReview(cwd);
  const original = join(paths.media, 'gallery.png');
  if (change === 'symlink') {
    const outside = join(cwd, 'outside.png');
    await writeFile(outside, 'unapproved outside bytes');
    await rm(original);
    await symlink(outside, original);
  } else await writeFile(original, 'unapproved changed bytes');
  const browser = new MockBrowser();
  let uploaded = '';
  browser.upload = async (_selector, files) => {
    uploaded = files[0];
    expect(uploaded).not.toBe(original);
    expect(await readFile(uploaded, 'utf8')).toBe('fixture media');
    if (change === 'upload failure') throw new Error('Upload failed');
  };
  if (change === 'upload failure') await expect(fillForm(browser, post, paths.root)).rejects.toThrow('Upload failed');
  else await fillForm(browser, post, paths.root);
  expect(uploaded).not.toBe('');
  await expect(readFile(uploaded)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('builds Instagram assets and first comment and refuses missing assets', () => {
  expect(instagramPayload({ gallery: ['a.png', 'b.png'], verticalVideo: '9x16.mp4', caption: 'Launch', hashtags: ['build', '#local'], coverFrame: 2 })).toMatchObject({
    carousel: { images: ['a.png', 'b.png'] }, reel: { aspectRatio: '9:16', coverFrame: 2 }, caption: 'Launch', firstComment: '#build #local',
  });
  expect(() => instagramPayload({ gallery: [], verticalVideo: '', caption: '', hashtags: [], coverFrame: -1 })).toThrow('Instagram requires');
});
it('builds PT launch scheduling and timed open-and-fill alarms', () => {
  const input = { name: 'Product', tagline: 'Tagline', description: 'Description', gallery: [], makerComment: 'Hi', date: '2026-07-14' };
  expect(productHuntPayload(input)).toMatchObject({ launchAt: '2026-07-14T00:01:00', timezone: 'America/Los_Angeles' });
  expect(() => productHuntPayload({ ...input, name: '' })).toThrow('requires');
  const ph = assistedReminder('product-hunt', '2026-07-14T07:01:00Z', input.date);
  expect(ph).toContain('DTSTART;TZID=America/Los_Angeles:20260714T000100');
  expect(ph).toContain('TRIGGER:-PT24H');
  expect(ph).toContain('TRIGGER:-PT1H');
  expect(assistedReminder('reddit', '2026-07-14T12:00:00.000Z')).toContain('DTSTART:20260714T120000Z');
  expect(assistedReminder('show-hn', '2026-07-14T12:00:00Z')).toContain('liftoff publish --confirm --assist show-hn');
});
