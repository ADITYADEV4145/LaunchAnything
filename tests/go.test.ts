import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { parseSchedule, displayTime } from '../src/go/schedule.js';
import { go } from '../src/go/run.js';
import { liveAdapter, mockAdapter, routeFor } from '../src/go/adapters.js';
import { readConsent, saveConsent, sameScope } from '../src/go/consent.js';
import { goFixture } from '../src/selftest/phaseF.js';
import { MockBrowser } from '../src/connect/browser.js';
import { criteria, judgeKeys } from '../src/copy/judge.js';
import { packageRoot } from '../src/core/package-root.js';
import { loadReview } from '../src/review/posts.js';
import { MemoryKeychain } from '../src/connect/keychain.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-go-')); temporary.push(cwd);
  return goFixture(cwd);
}
const table = '| Why | Local time | Channel | Local date |\n| --- | --- | --- | --- |\n| Demo | 09:00 | x | 2026-09-25 |\n';
it('parses reordered table headers and displays wall-clock dates in the founder timezone', () => {
  const [slot] = parseSchedule(table, 'America/New_York');
  expect(slot.scheduledAt).toBe('2026-09-25T13:00:00.000Z');
  expect(slot.local).toBe('2026-09-25 09:00 America/New_York');
  expect(displayTime(slot.scheduledAt, 'Asia/Kolkata')).toBe('2026-09-25 18:30');
  expect(parseSchedule(table + '\nOther details\n| Name | Status |\n| --- | --- |\n| Demo | ready |', 'America/New_York')).toHaveLength(1);
});
it('rejects missing, empty, duplicate, invalid and DST-nonexistent schedule rows', () => {
  for (const value of ['', '| Channel | Local date | Local time |', table + '| More | 10:00 | x | 2026-09-25 |',
    table.replace('2026-09-25', '2026-02-30'), table.replace('09:00', '25:00'), table.replace('2026-09-25', '2026-03-08').replace('09:00', '02:30')])
    expect(() => parseSchedule(value, 'America/New_York')).toThrow();
});
it('dry run writes nothing and never invokes an adapter', async () => {
  const { work, paths } = await fixture(), before = await readdir(paths.root, { recursive: true });
  const publish = vi.fn();
  const result = await go(work, { adapter: { publish } });
  expect(result.mode).toBe('dry-run'); expect(publish).not.toHaveBeenCalled();
  expect(await readdir(paths.root, { recursive: true })).toEqual(before);
  expect(await readConsent(paths.root)).toEqual({ version: 1, grants: [] });
});
it('mock end-to-end fills forms without Submit, persists links and feeds command center', async () => {
  const { work, paths, channels } = await fixture();
  const browsers = new Map<string, MockBrowser>();
  const adapter = mockAdapter(channel => {
    const browser = new MockBrowser(channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/123/mock/' : 'https://news.ycombinator.com/item?id=123');
    browsers.set(channel, browser); return browser;
  });
  const result = await go(work, { mock: true, confirm: true, yes: true, noWait: true, adapter });
  expect('board' in result && result.board.every(row => row.status === 'live')).toBe(true);
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toHaveLength(channels.length);
  for (const browser of browsers.values()) {
    expect(browser.actions.some(action => action.action === 'fill')).toBe(true);
    expect(browser.actions.some(action => /submit|click/i.test(action.selector ?? action.action))).toBe(false);
  }
  const center = await readFile(join(paths.root, 'warroom.md'), 'utf8');
  for (const channel of channels) expect(center).toContain(channel);
  const publish = vi.fn();
  await go(work, { mock: true, confirm: true, noWait: true, adapter: { publish } });
  expect(publish).not.toHaveBeenCalled();
}, 30000);
it('retries exactly once then writes paste files and failed board entries', async () => {
  const { work, paths, channels } = await fixture();
  const publish = vi.fn().mockRejectedValue(new Error('offline'));
  const result = await go(work, { mock: true, confirm: true, yes: true, noWait: true, adapter: { publish } });
  expect(publish).toHaveBeenCalledTimes(channels.length * 2);
  expect('board' in result && result.board.every(row => row.status === 'failed' && row.paste)).toBe(true);
  expect(await readdir(join(paths.root, 'go-paste'))).toHaveLength(channels.length);
  await expect(readFile(paths.published)).rejects.toMatchObject({ code: 'ENOENT' });
}, 30000);
it('uses injectable clock/sleep to wait for each schedule slot', async () => {
  const { work } = await fixture(); let now = Date.parse('2026-09-25T12:59:00Z');
  const sleep = vi.fn(async (ms: number) => { now += ms; });
  await go(work, { mock: true, confirm: true, yes: true, now: () => new Date(now), sleep });
  expect(sleep).toHaveBeenCalledWith(60000);
  expect(sleep).toHaveBeenCalledTimes(5);
}, 30000);
it('a founder taking time to submit a form does not block API routes', async () => {
  const { work } = await fixture();
  let finish!: () => void;
  const founder = new Promise<void>(resolve => { finish = resolve; });
  const published: string[] = [];
  const adapter = mockAdapter();
  await go(work, { mock: true, confirm: true, yes: true, noWait: true, adapter: { async publish(context) {
    if (context.post.channel === 'show-hn') await founder;
    else { published.push(context.post.channel); if (published.length === 4) finish(); }
    return adapter.publish(context);
  } } });
  expect(published).toContain('devto');
}, 30000);
it('HTTP adapters use connected keychain credentials and require live IDs/URLs', async () => {
  const { work } = await fixture();
  const { posts, paths } = await loadReview(work, undefined, () => '2026-09-25T13:00:00.000Z');
  const post = posts.find(post => post.channel === 'devto')!, keychain = new MemoryKeychain();
  await keychain.set('devto:founder', 'fixture-token');
  const request = vi.fn(async () => new Response(JSON.stringify({ id: 123, url: 'https://dev.to/founder/demo' }), { status: 200 }));
  const adapter = liveAdapter({ keychain, request });
  const context = { post, connection: { platform: 'devto', account: 'founder', route: 'api' as const, connectedAt: '' }, root: paths.root, notify: vi.fn() };
  expect(await adapter.publish(context)).toMatchObject({ status: 'published', url: 'https://dev.to/founder/demo' });
  expect(request.mock.calls[0][0]).toBe('https://dev.to/api/articles');
  request.mockImplementation(async () => new Response('{}', { status: 200 }));
  await expect(adapter.publish(context)).rejects.toThrow('live URL and ID');
  request.mockImplementation(async () => new Response('{}', { status: 503 }));
  await expect(adapter.publish(context)).rejects.toThrow('503');
  await expect(adapter.publish({ ...context, post: { ...post, channel: 'x' } })).rejects.toThrow('no verified official publish tool');
});
it('consents once across new content, but new accounts ask; revoke removes consent', async () => {
  const { work, paths } = await fixture();
  const ask = vi.fn(async () => true);
  await go(work, { mock: true, confirm: true, noWait: true, ask, by: 'Aditya' });
  expect(ask).toHaveBeenCalledTimes(1);
  const post = join(paths.posts, 'github-release.md');
  await writeFile(post, (await readFile(post, 'utf8')).replace('Tasklight: repository snapshot', 'Tasklight: updated repository snapshot'));
  await writeFile(join(paths.posts, 'judge/github-release.scores.json'), JSON.stringify({ ...judgeKeys(work, 'github-release'),
    judge: 'fixture', scores: Object.fromEntries(criteria.map(key => [key, 9])), reasons: [] }));
  await go(work, { mock: true, confirm: true, noWait: true, ask });
  expect(ask).toHaveBeenCalledTimes(1);
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toHaveLength(6);
  const audit = JSON.parse(await readFile(join(paths.root, 'go-approvals.json'), 'utf8'));
  expect(audit.grants.every((grant: any) => grant.source === 'standing-consent' && grant.by === 'Aditya')).toBe(true);
  await expect(go(work, { mock: true, confirm: true, noWait: true, account: 'different-founder' })).rejects.toThrow('Standing consent required');
  await go(work, { revoke: true });
  expect((await readConsent(paths.root, true)).grants).toHaveLength(0);
  await expect(go(work, { mock: true, confirm: true, noWait: true })).rejects.toThrow('Standing consent required');
}, 30000);
it('does not treat different channels, routes or accounts as the same consent', async () => {
  const { paths } = await fixture();
  const grant = { channel: 'x', route: 'official-mcp', account: 'Aditya', by: 'Aditya', at: new Date().toISOString() };
  await saveConsent(paths.root, { version: 1, grants: [grant] });
  expect((await readConsent(paths.root)).grants).toEqual([grant]);
  for (const scope of [{ ...grant, channel: 'devto' }, { ...grant, route: 'postiz' }, { ...grant, account: 'Other' }])
    expect(sameScope(grant, scope)).toBe(false);
  expect((await readConsent(paths.root, true)).grants).toHaveLength(0);
});
it('quality gates block publication even with consent', async () => {
  const { work, paths } = await fixture();
  await writeFile(join(paths.posts, 'x.md'), (await readFile(join(paths.posts, 'x.md'), 'utf8')) + '\nRevolutionary game-changer.\n');
  const publish = vi.fn();
  await expect(go(work, { mock: true, confirm: true, yes: true, noWait: true, adapter: { publish } })).rejects.toThrow('Quality gates');
  expect(publish).not.toHaveBeenCalled();
});
it('maps the requested platforms without silently using another route', () => {
  for (const channel of ['linkedin', 'instagram', 'tiktok', 'youtube', 'threads', 'bluesky']) expect(routeFor(channel)).toBe('postiz');
  expect(routeFor('email')).toBe('kit-mcp'); expect(routeFor('product-hunt')).toBe('official-mcp');
  expect(() => routeFor('unknown')).toThrow();
});
it('CLI dry run is the default and mock --confirm works noninteractively after chat approval', async () => {
  const { work } = await fixture();
  const cli = (...args: string[]) => spawnSync(process.execPath,
    ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), 'go', '--cwd', work, '--json', ...args], { encoding: 'utf8' });
  const preview = cli(); expect(preview.status, preview.stderr).toBe(0);
  expect(JSON.parse(preview.stdout).data.mode).toBe('dry-run');
  const publish = cli('--mock', '--confirm', '--yes', '--no-wait'); expect(publish.status, publish.stderr).toBe(0);
  expect(JSON.parse(publish.stdout).data.board.every((row: any) => row.status === 'live')).toBe(true);
}, 30000);
