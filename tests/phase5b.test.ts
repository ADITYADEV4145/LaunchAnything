import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { phase5bGate } from '../src/selftest/phase5b.js';
import { MemoryKeychain } from '../src/connect/keychain.js';
import { connect, connections, removeConnection, requireConnection } from '../src/connect/registry.js';
import { MockBrowser } from '../src/connect/browser.js';
import { fillForm, forms } from '../src/connect/forms.js';
import { assistedReminder, instagramPayload, productHuntDate, productHuntPayload } from '../src/connect/payloads.js';
import type { ReviewPost } from '../src/review/posts.js';
import { loadReview } from '../src/review/posts.js';
import { assistedPublish } from '../src/connect/publish.js';
import { publish } from '../src/adapters/publish.js';
import { dailyCaps, reserveCap } from '../src/connect/caps.js';
import { lockTimeout, recoveryTimeout, tryLock } from '../src/connect/lock.js';
import { launchDir } from '../src/core/launch-dir.js';
import type { Route } from '../src/connect/registry.js';
import { HttpMcpClient, MockMcpClient, mcpDraft, officialServers, productHuntTools } from '../src/connect/mcp.js';
import { xCost } from '../src/connect/costs.js';
import { buildReview } from '../src/review/page.js';

const temp: string[] = [];
async function workspace() { const path = await mkdtemp(join(tmpdir(), 'liftoff-5b-')); temp.push(path); return path; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(temp.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it('defaults PH to official MCP draft, readiness and preview without submission', async () => {
  const { cwd, paths, home } = await approvedPost('product-hunt', [], { link: 'https://example.test', name: 'Own product' });
  const keys = new MemoryKeychain();
  expect((await connect({ platform: 'product-hunt', account: 'owner' }, 'private-token', keys, home)).route).toBe('mcp');
  const client = new MockMcpClient('product-hunt');
  const result = await assistedPublish(cwd, { home, keychain: keys, mcp: async (platform, token) => {
    expect(platform).toBe('product-hunt'); expect(token).toBe('private-token'); return client;
  } });
  expect(client.calls.map(call => call.name)).toEqual(productHuntTools);
  expect(client.calls[0].args).toMatchObject({ url: 'https://example.test', values: { name: 'Own product', description: 'Caption.' } });
  expect(result.posts[0]).toMatchObject({ status: 'manual', url: 'https://www.producthunt.com/posts/new' });
  const { posts: [post] } = await loadReview(cwd);
  const preview = await readFile(join(paths.review, 'mcp', post.hash, 'product-hunt-preview.json'), 'utf8');
  expect(preview).toContain('Draft preview');
  expect(preview).not.toContain('private-token');
});
it.each(['submit_launch', 'publish_post', 'launch', 'update_launch', 'prepare_launch_asset', 'unrecognized'])('real and mock MCP refuse %s before any request', async name => {
  const request = vi.fn();
  const real = new HttpMcpClient('product-hunt', 'token', request);
  const mock = new MockMcpClient('product-hunt');
  await expect(real.callTool(name, {})).rejects.toThrow('MCP tool refused');
  await expect(mock.callTool(name, {})).rejects.toThrow('MCP tool refused');
  expect(request).not.toHaveBeenCalled(); expect(mock.calls).toEqual([]);
});
it.each(['empty', 'error', 'malformed', 'blocked'])('handles %s official PH capabilities or readiness safely', async state => {
  const { cwd, paths } = await approvedPost('product-hunt', [], { link: 'https://example.test' });
  const { posts: [post] } = await loadReview(cwd);
  const client = new MockMcpClient('product-hunt', state === 'empty' ? [] : productHuntTools.map(name => ({ name })));
  if (state === 'error') client.respond = () => ({ isError: true });
  if (state === 'malformed') client.respond = () => ({ status: 'ok', data: {} });
  if (state === 'blocked') {
    const respond = client.respond;
    client.respond = (name, args) => name === 'get_launch' ? { status: 'ok', data: { status: 'draft',
      url: 'https://www.producthunt.com/posts/new', assessment: { submission: 'blocked' } } } : respond(name, args);
    expect((await mcpDraft('product-hunt', client, post, paths.root)).status).toBe('manual');
  } else await expect(mcpDraft('product-hunt', client, post, paths.root)).rejects.toThrow();
  expect(client.calls.every(call => productHuntTools.includes(call.name as typeof productHuntTools[number]))).toBe(true);
});
it('discovers official X capabilities without trusting an advertised unverified write tool', async () => {
  const { cwd, paths } = await approvedPost('x');
  const { posts: [post] } = await loadReview(cwd);
  const client = new MockMcpClient('x', [{ name: 'create_tweet' }]);
  await expect(mcpDraft('x', client, post, paths.root)).rejects.toThrow('No verified official X post-create tool');
  expect(client.discoveries).toBe(1); expect(client.calls).toEqual([]);
});
it.each([
  { extra: {}, config: undefined, expected: '$0.015' },
  { extra: { link: 'https://example.test' }, config: undefined, expected: '$0.20' },
  { extra: {}, config: { create: 0.123 }, expected: '$0.123' },
  { extra: { link: 'https://example.test' }, config: { withUrl: 0 }, expected: '$0.00' },
  { extra: {}, config: { create: null }, expected: 'cost unknown — set it in config' },
])('shows sourced or configured X costs before approval: %j', async ({ extra, config, expected }) => {
  const { cwd, paths } = await approvedPost('x', [], extra);
  await writeFile(paths.approvals, '{"approvals":[]}');
  if (config) await writeFile(paths.config, JSON.stringify({ ...JSON.parse(await readFile(paths.config, 'utf8')), xApiCost: config }));
  const review = await buildReview(cwd);
  const html = await readFile(review.path, 'utf8');
  expect(html).toContain(expected); expect(html).toContain('https://docs.x.com/x-api/getting-started/pricing');
  expect(html.indexOf('X API cost before approval')).toBeLessThan(html.indexOf('data-action="approve"'));
  expect(html).toContain('Awaiting approval');
});
it('prices inline and bare URLs, empty posts, and invalid overrides safely', async () => {
  expect(xCost({ title: '', body: '' })).toContain('$0.015');
  for (const body of ['https://example.test/path', 'www.example.test', 'Visit example.com now'])
    expect(xCost({ title: '', body })).toContain('$0.20');
  expect(() => xCost({ title: '', body: '' }, { create: -1 })).toThrow('Invalid X API cost');
  const { cwd, paths } = await approvedPost('x');
  await writeFile(paths.config, JSON.stringify({ ...JSON.parse(await readFile(paths.config, 'utf8')), xApiCost: { create: 'cheap' } }));
  await expect(buildReview(cwd)).rejects.toThrow('config:');
});
it.each(['json', 'sse'])('uses initialized official HTTP MCP with keychain bearer and %s responses', async format => {
  const methods: string[] = [];
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(url).toBe(officialServers['product-hunt']);
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' });
    const body = JSON.parse(String(init?.body)); methods.push(body.method);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = body.method === 'tools/list' ? { tools: [{ name: 'get_launch' }] } : {};
    const message = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    return new Response(format === 'sse' ? `data: ${message}\n\n` : message,
      { headers: { 'Content-Type': format === 'sse' ? 'text/event-stream' : 'application/json', 'mcp-session-id': 'session' } });
  });
  const client = new HttpMcpClient('product-hunt', 'secret', request);
  expect(await client.listTools()).toEqual([{ name: 'get_launch' }]);
  await client.callTool('get_launch', { launch_id: 'draft' });
  expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  expect(request.mock.calls[2][1]?.headers).toMatchObject({ 'Mcp-Session-Id': 'session' });
});

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
it.each(['postiz', 'buffer', 'api'] as const)('allows LinkedIn official API route %s without website automation', async route => {
  const { cwd, home } = await approvedPost('linkedin');
  await connect({ platform: 'linkedin', route, account: 'urn:li:person:owner' }, 'secret', new MemoryKeychain(), home);
  const browser = vi.fn();
  const result = await assistedPublish(cwd, { home, browser });
  expect(result.posts[0]).toMatchObject({ status: 'manual', id: expect.stringContaining(route === 'api' ? 'linkedin-api:' : route + ':') });
  expect(browser).not.toHaveBeenCalled();
  if (route === 'api') {
    const request = JSON.parse(await readFile(new URL('linkedin-api-request.json', result.posts[0].url), 'utf8'));
    expect(request).toMatchObject({ url: 'https://api.linkedin.com/rest/posts', body: { author: 'urn:li:person:owner' } });
    expect(JSON.stringify(request)).not.toContain('secret');
  }
});
it.each([{ route: 'browser' }, { route: 'mcp' }, { route: 'buffer', server: 'https://website-driver.test/mcp' },
  { route: 'api', profile: '/chrome' }])('rejects LinkedIn website automation at connect and dispatch: %j', async input => {
  const { cwd, home } = await approvedPost('linkedin');
  const connection = { platform: 'linkedin', account: 'owner', ...input, route: input.route as Route };
  await expect(connect(connection, 'secret', new MemoryKeychain(), home)).rejects.toThrow('LinkedIn requires the official API');
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'connections.json'), JSON.stringify([{ ...connection, connectedAt: new Date().toISOString() }]));
  await expect(requireConnection('linkedin', undefined, home)).rejects.toThrow('website-driving MCP');
  await expect(assistedPublish(cwd, { home })).rejects.toThrow('LinkedIn requires the official API');
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
it.each(['dead', 'expired', 'legacy', 'malformed'])('recovers %s locks for connections and caps', async state => {
  const home = await workspace();
  const root = await workspace();
  const timestamp = Date.now() - lockTimeout - 1000;
  if (state === 'dead') vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('No process'), { code: 'ESRCH' }); });
  for (const path of [join(home, 'connections.lock'), join(root, 'publish-caps.lock')]) {
    await writeFile(path, state === 'legacy' ? '' : state === 'malformed' ? '{' : JSON.stringify({ pid: state === 'dead' ? 2147483647 : process.pid, timestamp: state === 'dead' ? Date.now() : timestamp }));
    if (state === 'legacy' || state === 'malformed') await utimes(path, new Date(timestamp), new Date(timestamp));
  }
  const keys = new MemoryKeychain();
  await connect({ platform: 'x', route: 'buffer', account: 'owner' }, 'token', keys, home);
  expect((await connections(home))[0].account).toBe('owner');
  await reserveCap(root, 'reddit', 'owner');
  await expect(reserveCap(root, 'reddit', 'other')).rejects.toThrow('daily cap');
  await expect(readFile(join(home, 'connections.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(root, 'publish-caps.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('records lock ownership and leaves a fresh live or permission-protected lock alone', async () => {
  const root = await workspace();
  const path = join(root, 'publish-caps.lock');
  const release = await tryLock(path);
  expect(release).toBeTypeOf('function');
  const record = JSON.parse(await readFile(path, 'utf8'));
  expect(record).toMatchObject({ pid: process.pid, timestamp: expect.any(Number), owner: expect.any(String) });
  expect(Date.now() - record.timestamp).toBeLessThan(lockTimeout);
  expect(await tryLock(path)).toBeUndefined();
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('Not permitted'), { code: 'EPERM' }); });
  await expect(reserveCap(root, 'x', 'owner')).rejects.toThrow('Another assisted publish');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(record);
  await release!();
});
it('does not release a replacement lock when an expired owner finishes', async () => {
  const root = await workspace();
  const path = join(root, 'connections.lock');
  const releaseOld = await tryLock(path);
  const record = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...record, timestamp: Date.now() - lockTimeout - 1000 }));
  const releaseNew = await tryLock(path);
  expect(releaseNew).toBeTypeOf('function');
  await releaseOld!();
  expect(await tryLock(path)).toBeUndefined();
  await releaseNew!();
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('does not remove a replacement lock when a stale recoverer resumes', async () => {
  const root = await workspace();
  const path = join(root, 'connections.lock');
  await writeFile(path, JSON.stringify({ pid: process.pid, timestamp: Date.now() - lockTimeout - 1000, owner: 'stale' }));
  const observed = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const first = tryLock(path, async () => { observed.resolve(); await resume.promise; });
  await observed.promise;
  const replacement = await tryLock(path);
  expect(replacement).toBeTypeOf('function');
  const current = await readFile(path, 'utf8');
  resume.resolve();
  expect(await first).toBeUndefined();
  expect(await readFile(path, 'utf8')).toBe(current);
  expect(await tryLock(path)).toBeUndefined();
  await replacement!();
});
it('allows only one winner among simultaneous stale-lock recoverers', async () => {
  const root = await workspace();
  const path = join(root, 'publish-caps.lock');
  await writeFile(path, JSON.stringify({ pid: process.pid, timestamp: Date.now() - lockTimeout - 1000, owner: 'stale' }));
  const releases = await Promise.all(Array.from({ length: 8 }, () => tryLock(path)));
  const winners = releases.filter(release => release !== undefined);
  expect(winners).toHaveLength(1);
  expect(await tryLock(path)).toBeUndefined();
  await winners[0]!();
});
it.each(['dead', 'expired', 'empty', 'live'])('handles a %s recovery guard without wedging or stealing', async state => {
  const root = await workspace();
  const path = join(root, 'connections.lock');
  const guard = path + '.recover';
  const stale = JSON.stringify({ pid: process.pid, timestamp: Date.now() - lockTimeout - 1000, owner: 'stale' });
  await writeFile(path, stale);
  await mkdir(guard);
  if (state === 'empty') {
    const old = new Date(Date.now() - recoveryTimeout - 1000);
    await utimes(guard, old, old);
  } else {
    await writeFile(join(guard, 'guard-owner'), JSON.stringify({ pid: state === 'dead' ? 2147483647 : process.pid,
      timestamp: state === 'expired' ? Date.now() - recoveryTimeout - 1000 : Date.now() }));
    if (state === 'dead') {
      const kill = process.kill.bind(process);
      vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid === 2147483647) throw Object.assign(new Error('No process'), { code: 'ESRCH' });
        return kill(pid, signal);
      });
    }
  }
  const release = await tryLock(path);
  if (state === 'live') {
    expect(release).toBeUndefined();
    expect(await readFile(path, 'utf8')).toBe(stale);
  } else {
    expect(release).toBeTypeOf('function');
    await release!();
  }
});
it.each(['reddit', 'product-hunt'] as const)('fills %s without any submit operation', async channel => {
  const browser = new MockBrowser(channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/abc/title/' : 'https://www.producthunt.com/posts/my-product');
  const post = { channel, title: 'Product', body: 'Description', scheduledAt: '2026-07-14T12:00:00Z',
    source: '---\nsubreddit: test\nflair: Launch\n---\n', media: [{ path: 'media/gallery.png', slot: 'gallery', bytes: Buffer.from('mock') }, { path: 'media/9x16.mp4', slot: 'video', bytes: Buffer.from('mock') }] } as ReviewPost;
  const cleanup = await fillForm(browser, post, '/launch');
  try {
    expect(browser.actions.some(a => a.action === 'upload')).toBe(true);
    expect(await browser.waitForUrl(forms[channel].result, 1)).toBe(browser.result);
    expect('click' in browser).toBe(false);
    expect(browser.actions.some(a => /submit|button/.test(a.selector ?? ''))).toBe(false);
    browser.result = forms[channel].url;
    await expect(browser.waitForUrl(forms[channel].result, 1)).rejects.toThrow('Timed out');
  } finally { await cleanup(); }
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
  else {
    const cleanup = await fillForm(browser, post, paths.root);
    expect(await readFile(uploaded, 'utf8')).toBe('fixture media');
    await cleanup();
  }
  expect(uploaded).not.toBe('');
  await expect(readFile(uploaded)).rejects.toMatchObject({ code: 'ENOENT' });
});
it.each(['published', 'timeout', 'close failure'])('keeps approved uploads through browser completion: %s', async outcome => {
  const { cwd, paths, home } = await approvedPost('reddit', ['gallery.png'], { subreddit: 'r/test' });
  await connect({ platform: 'reddit', route: 'browser', account: 'owner', profile: cwd }, undefined, new MemoryKeychain(), home);
  const browser = new MockBrowser('https://www.reddit.com/r/test/comments/abc/title/');
  let uploaded = '';
  browser.upload = async (_selector, files) => { uploaded = files[0]; };
  browser.waitForUrl = async () => {
    expect(await readFile(uploaded, 'utf8')).toBe('fixture media');
    if (outcome === 'timeout') throw new Error('Timed out');
    return browser.result;
  };
  let closed = false;
  browser.close = async () => {
    expect(await readFile(uploaded, 'utf8')).toBe('fixture media');
    closed = true;
    if (outcome === 'close failure') throw new Error('Close failed');
  };
  const result = assistedPublish(cwd, { home, browser: async () => browser });
  if (outcome === 'timeout') expect((await result).posts[0].status).toBe('manual');
  else expect((await result).posts[0].status).toBe('published');
  expect(closed).toBe(true);
  await expect(readFile(uploaded)).rejects.toMatchObject({ code: 'ENOENT' });
});
it.each(['empty', 'unverified', 'failure'])('retains a manual X paste file after two %s discovery attempts', async state => {
  const { cwd, paths, home } = await approvedPost('x', ['gallery.png']);
  const keys = new MemoryKeychain();
  await connect({ platform: 'x', account: 'owner' }, 'token', keys, home);
  const client = new MockMcpClient('x', state === 'unverified' ? [{ name: 'create_tweet' }] : []);
  if (state === 'failure') client.listTools = vi.fn(async () => { client.discoveries++; throw new Error('token must never be logged'); });
  const result = await assistedPublish(cwd, { home, keychain: keys, mcp: async () => client });
  expect(client.discoveries).toBe(2); expect(client.calls).toEqual([]);
  expect(result.posts[0].status).toBe('manual');
  expect(await readFile(new URL(result.posts[0].url!), 'utf8')).toContain('Caption.');
  expect(await readFile(new URL('attachment-1.png', result.posts[0].url), 'utf8')).toBe('fixture media');
  expect(JSON.parse(await readFile(new URL('failure.json', result.posts[0].url), 'utf8'))).toMatchObject({ attempts: 2, status: 'manual' });
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toEqual(result.posts);
  expect(result.warnings.join(' ')).not.toContain('token');
  expect(JSON.parse(await readFile(join(paths.root, 'publish-caps.json'), 'utf8'))).toHaveLength(1);
});
it.each(['transient', 'permanent'])('retries failed dispatch once and preserves %s outcomes', async state => {
  const { cwd, paths, home } = await approvedPost('product-hunt', [], { link: 'https://example.test' });
  const keys = new MemoryKeychain();
  await connect({ platform: 'product-hunt', account: 'owner' }, 'token', keys, home);
  const client = new MockMcpClient('product-hunt');
  const respond = client.respond;
  let attempts = 0;
  client.respond = (name, args) => {
    if (name === 'start_launch' && (++attempts === 1 || state === 'permanent')) throw new Error('Transient failure');
    return respond(name, args);
  };
  const result = await assistedPublish(cwd, { home, keychain: keys, mcp: async () => client });
  expect(attempts).toBe(2);
  expect(client.calls.filter(call => call.name === 'start_launch').map(call => call.args.idempotency_key)[0])
    .toBe(client.calls.filter(call => call.name === 'start_launch').map(call => call.args.idempotency_key)[1]);
  if (state === 'transient') expect(result.posts[0].id).toMatch(/^mcp:/);
  else expect(await readFile(new URL(result.posts[0].url!), 'utf8')).toContain('Caption.');
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toEqual(result.posts);
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
  const ph = assistedReminder('product-hunt', '2026-07-14T07:01:00Z');
  expect(ph).toContain('DTSTART;TZID=America/Los_Angeles:20260714T000100');
  expect(ph).toContain('TRIGGER:-PT24H');
  expect(ph).toContain('TRIGGER:-PT1H');
  expect(assistedReminder('reddit', '2026-07-14T12:00:00.000Z')).toContain('DTSTART:20260714T120000Z');
  expect(assistedReminder('show-hn', '2026-07-14T12:00:00Z')).toContain('liftoff publish --confirm --assist show-hn');
});
it('uses the Pacific launch date for forms and both Product Hunt reminder paths', async () => {
  expect(productHuntDate('2026-07-15T01:00:00Z')).toBe('2026-07-14');
  expect(productHuntDate('2026-01-15T07:00:00Z')).toBe('2026-01-14');
  expect(() => productHuntDate('invalid')).toThrow();
  const { cwd, paths, home } = await approvedPost('product-hunt');
  await writeFile(paths.plan, '| Channel | Local date | Local time |\n| --- | --- | --- |\n| product-hunt | 2026-07-15 | 01:00 |\n');
  await connect({ platform: 'product-hunt', route: 'browser', account: 'owner', profile: cwd }, undefined, new MemoryKeychain(), home);
  const browser = new MockBrowser('https://www.producthunt.com/posts/product');
  await assistedPublish(cwd, { home, browser: async () => browser });
  expect(browser.actions).toContainEqual({ action: 'fill', selector: '[name="launchAt"]', value: '2026-07-14T00:01:00' });
  const start = 'DTSTART;TZID=America/Los_Angeles:20260714T000100';
  expect(await readFile(join(paths.root, 'product-hunt-assisted.ics'), 'utf8')).toContain(start);
  const { posts: [receipt] } = await publish(cwd, true, {});
  expect(await readFile(new URL('reminder.ics', receipt.url), 'utf8')).toContain(start);
});
