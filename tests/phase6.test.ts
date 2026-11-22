import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { launchDir } from '../src/core/launch-dir.js';
import { packageRoot } from '../src/core/package-root.js';
import { checkpointAt, collect } from '../src/results/collect.js';
import { readJson, writeJson } from '../src/results/files.js';
import { githubStarsDelta } from '../src/results/github.js';
import { learn, loadPlanLessons } from '../src/results/history.js';
import { receipt } from '../src/results/receipt.js';
import { checks } from '../src/selftest/phase6.js';

const dirs: string[] = [];
const config = { profile: 'devtool', launchType: 'relaunch', timezone: 'America/Los_Angeles',
  launchDate: '2026-03-07', channels: ['x', 'devto'], profileConfirmed: true };
const now = new Date('2026-03-10T08:00:00Z');

async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-results-'));
  dirs.push(cwd);
  const paths = launchDir(cwd);
  await writeJson(paths.config, config);
  await writeJson(paths.published, { posts: [
    { channel: 'x', id: 'one', url: 'https://example.test/one', status: 'published', scheduledAt: '2026-03-08T02:00:00Z' },
    { channel: 'x', id: 'two', status: 'published' },
    { channel: 'devto', id: 'three', status: 'manual' },
    { channel: 'devto', id: 'cancelled', status: 'cancelled' },
  ] });
  return { cwd, paths };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

it('selects checkpoints by launch calendar date across DST', () => {
  expect(() => checkpointAt(config, new Date('2026-03-08T07:59:00Z'))).toThrow('T+1 has not arrived');
  expect(checkpointAt(config, new Date('2026-03-08T08:00:00Z'))).toBe('T+1');
  expect(checkpointAt(config, new Date('2026-03-10T06:59:00Z'))).toBe('T+1');
  expect(checkpointAt(config, now)).toBe('T+3');
  expect(checkpointAt(config, new Date('2026-03-14T07:00:00Z'))).toBe('T+7');
});

it('joins by channel and id; overlays imported fields without counting missing as zero', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(join(paths.root, 'metrics.json'), { posts: [
    { channel: 'x', id: 'one', metrics: { views: 21, signups: 0, starsDelta: -2 } },
    { channel: 'x', id: 'two', metrics: { views: 9, starsDelta: -2 } },
  ] });
  const readStatus = vi.fn(async (post: { id: string }) => {
    if (post.id === 'one') return { metrics: { views: 13, likes: 4 } };
    if (post.id === 'three') throw new Error('private-token');
  });
  const result = await collect(cwd, { now, readStatus });
  expect(readStatus.mock.calls.map(([post]) => post.id)).toEqual(['one', 'two', 'three']);
  expect(result.results.channels).toEqual([
    { channel: 'x', views: 30, likes: 4, signups: 0 }, { channel: 'devto' },
    { channel: 'github-release', starsDelta: -2 },
  ]);
  expect(result.warnings.join()).not.toContain('private-token');
  expect(await readJson(result.snapshot)).toEqual(await readJson(paths.results));
});

it('rejects mismatched imported post ids, invalid numbers and duplicate rows', async () => {
  const { cwd, paths } = await workspace();
  const input = join(paths.root, 'metrics.json');
  await writeJson(input, { posts: [{ channel: 'devto', id: 'one' }] });
  await expect(collect(cwd, { now })).rejects.toThrow('No eligible published.json entry');
  await writeJson(input, { posts: [{ channel: 'x', id: 'one', metrics: { views: -1 } }] });
  await expect(collect(cwd, { now })).rejects.toThrow('Invalid x views count');
  await writeJson(input, { posts: [{ channel: 'x', id: 'one' }, { channel: 'x', id: 'one' }] });
  await expect(collect(cwd, { now })).rejects.toThrow('Duplicate metrics');
});

it('drafts only verified owned unanswered comments and escapes active content', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(join(paths.root, 'metrics.json'), { posts: [
    { channel: 'x', id: 'one', owned: true, comments: [
      { id: 'unanswered', author: '@reader', body: '<img src=x onerror=alert(1)>', answered: false, url: 'javascript:alert(1)' },
      { id: 'answered', author: 'another', body: 'already responded', answered: true },
    ] },
    { channel: 'devto', id: 'three', comments: [{ id: 'unknown-owner', author: 'third', body: 'not ours', answered: false }] },
  ] });
  const result = await collect(cwd, { now, replies: true });
  expect(result.replies?.count).toBe(1);
  const drafts = await readFile(result.replies!.path!, 'utf8');
  expect(drafts).toContain('human approval required');
  expect(drafts).toContain('&lt;img');
  expect(drafts).not.toMatch(/already responded|not ours|javascript:|<img/);
  expect(await readFile(paths.report, 'utf8')).toContain('already responded');
});

it('saves scoped, idempotent history and retains the observation that changed the slot', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(join(paths.root, 'metrics.json'), { posts: [
    { channel: 'x', id: 'one', metrics: { views: 72, clicks: 5 }, hook: 'Command-line insight' },
    { channel: 'devto', id: 'three', metrics: { views: 0, clicks: 0 } },
  ] });
  await collect(cwd, { now });
  const history = join(cwd, 'history.json');
  await learn(cwd, history);
  const learned = await learn(cwd, history);
  expect(learned.observations.find(item => item.channel === 'devto')?.lesson).toContain('Zero clicks');
  expect((await readJson(history) as { profiles: { devtool: unknown[] } }).profiles.devtool).toHaveLength(2);
  expect(await loadPlanLessons('indie-saas', history)).toEqual([]);
  const recommendations = await loadPlanLessons('devtool', history);
  expect(recommendations).toHaveLength(1);
  expect(recommendations[0]).toMatchObject({ channel: 'x', time: '18:00', observation: expect.stringContaining('Command-line insight') });
});

it('reads a public GitHub star delta against the scan baseline through a GET-only API', async () => {
  const { cwd, paths } = await workspace();
  execFileSync('git', ['init', '--initial-branch=main'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:fixture/launch.git'], { cwd });
  await writeJson(paths.scan, { stars: 21, readmeSections: [], package: {}, commits: [], routes: [], screenshots: [] });
  const request = vi.fn(async () => new Response(JSON.stringify({ private: false, stargazers_count: 17 })));
  expect(await githubStarsDelta(cwd, request)).toBe(-4);
  expect(request).toHaveBeenCalledWith('https://api.github.com/repos/fixture/launch',
    expect.objectContaining({ redirect: 'error' }));
  request.mockResolvedValue(new Response(JSON.stringify({ private: true, stargazers_count: 99 })));
  expect(await githubStarsDelta(cwd, request)).toBeUndefined();
});

it('makes a standalone SVG without active markup or claimed unique reach', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(paths.results, { observedAt: now.toISOString(), channels: [{ channel: 'x', views: 0 }] });
  const fixture = await readJson(join(packageRoot(), 'fixtures', 'cli-tool', '.liftoff-fixture', 'product.json')) as object;
  await writeJson(paths.product, { ...fixture, name: '<script>&' });
  const image = await receipt(cwd);
  const svg = await readFile(image.path, 'utf8');
  expect(svg).toContain('&lt;script&gt;&amp;');
  expect(svg).not.toContain('<script>');
  expect(svg).toContain('Views are not unique reach');
  expect(svg).toContain('Not reported');
  expect(svg).toContain('launched with Liftoff');
  await receipt(cwd, false);
  expect(await readFile(image.path, 'utf8')).not.toContain('launched with Liftoff');
});

it('includes a tracked GitHub release with only stars but does not list untracked repository-wide stars as a channel', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(paths.results, { observedAt: now.toISOString(), channels: [{ channel: 'github-release', starsDelta: 12 }] });
  let image = await receipt(cwd);
  expect(await readFile(image.path, 'utf8')).not.toContain('>GitHub release</text>');
  await writeJson(paths.published, { posts: [{ channel: 'github-release', id: 'release', status: 'published' }] });
  image = await receipt(cwd);
  const svg = await readFile(image.path, 'utf8');
  expect(svg).toContain('>GitHub release</text>');
  expect(svg).not.toContain('None recorded');
  await rm(paths.published);
  image = await receipt(cwd);
  expect(await readFile(image.path, 'utf8')).not.toContain('>GitHub release</text>');
});

it('returns one structured CLI result and exits nonzero on bad input', async () => {
  const { cwd, paths } = await workspace();
  const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args, '--cwd', cwd, '--json'],
    { cwd: packageRoot(), encoding: 'utf8', env: { ...process.env, HOME: cwd, USERPROFILE: cwd } });
  for (const command of ['learn', 'receipt']) {
    const result = cli(command);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ command, ok: false });
  }
  await writeJson(join(paths.root, 'metrics.json'), { posts: [{ channel: 'x', id: 'one', metrics: { views: 8 } }] });
  const result = cli('results', '--replies');
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ command: 'results', ok: true, data: { replies: { count: 0 } } });
  const history = cli('learn');
  expect(history.status, history.stdout + history.stderr).toBe(0);
  expect(await readJson(join(cwd, '.liftoff', 'history.json'))).toMatchObject({ profiles: { devtool: [{ bestHour: 18 }] } });
  const image = cli('receipt', '--no-footer');
  expect(image.status, image.stdout + image.stderr).toBe(0);
  expect(await readFile(JSON.parse(image.stdout).data.path, 'utf8')).not.toContain('launched with Liftoff');
}, 30000);

it('loads learned history from home on the next CLI plan', async () => {
  const { cwd, paths } = await workspace();
  const plan = () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'plan', '--cwd', cwd, '--json'],
      { cwd: packageRoot(), encoding: 'utf8', env: { ...process.env, HOME: cwd, USERPROFILE: cwd } });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout).data;
  };
  expect(plan().channels).toContainEqual(expect.objectContaining({ id: 'x', time: '09:00' }));
  await writeJson(join(paths.root, 'metrics.json'), { posts: [{ channel: 'x', id: 'one', metrics: { views: 8 } }] });
  await collect(cwd, { now });
  await learn(cwd, join(cwd, '.liftoff', 'history.json'));
  const next = plan();
  expect(next.channels).toContainEqual(expect.objectContaining({ id: 'x', time: '18:00' }));
  expect(next.markdown).toContain('recorded 8 views');
}, 30000);

it.each(['cli-tool', 'saas-next', 'mobile-expo'])('passes Phase 6 checks independently for %s', async fixture => {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-phase6-'));
  dirs.push(cwd);
  const { cp } = await import('node:fs/promises');
  await cp(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
  for (const check of checks) await check.run({ cwd, fixture });
});
