import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { launchDir } from '../src/core/launch-dir.js';
import { packageRoot } from '../src/core/package-root.js';
import { checkpointAt, collect } from '../src/results/collect.js';
import { readJson, writeJson } from '../src/results/files.js';
import { githubStarsDelta } from '../src/results/github.js';
import { learn, loadJudgeWeights, loadPlanLessons } from '../src/results/history.js';
import { receipt } from '../src/results/receipt.js';
import { checks } from '../src/selftest/phase6.js';
import { pngSize } from '../src/visuals/check.js';

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
  expect(checkpointAt(config, new Date('2026-04-06T06:59:00Z'))).toBe('T+7');
  expect(checkpointAt(config, new Date('2026-04-06T07:00:00Z'))).toBe('T+30');
});

async function repurposeFixture() {
  const { cwd, paths } = await workspace();
  await writeJson(paths.config, { ...config, launchDate: '2020-03-07' });
  await writeJson(paths.product, { name: 'Fixture Linter' });
  await writeJson(join(paths.root, 'metrics.json'), { posts: [
    { channel: 'x', id: 'one', copy: 'Find missing exports. Check the output.', metrics: { signups: 2 } },
  ] });
  const sourcesPath = join(cwd, 'sources.json');
  const source = { channel: 'x', postId: 'one', frames: [{ image: 'fixture.png' }, { image: 'fixture.png' }] };
  return { cwd, paths, source, sourcesPath };
}

it('renders an opt-in carousel and portrait clip from fixture media without changing launch assets or receipts', async () => {
  const { cwd, paths, source, sourcesPath } = await repurposeFixture();
  await writeJson(sourcesPath, source);
  await mkdir(paths.media);
  const still = PNG.sync.write(new PNG({ width: 64, height: 36, fill: true }));
  const fixturePath = join(paths.media, 'fixture.png');
  await writeFile(fixturePath, still);
  const published = await readFile(paths.published, 'utf8');
  const initial = await collect(cwd);
  const briefPath = join(initial.drafts, 'repurpose-media.json');
  const brief = await readJson(briefPath);
  expect(brief).toMatchObject({ frames: ['Find missing exports.', 'Check the output.'] });
  expect((await readdir(initial.drafts)).some(name => name.startsWith('repurpose-assets-'))).toBe(false);

  const result = spawnSync(process.execPath,
    ['--import', 'tsx', 'src/cli.ts', 'results', '--repurpose-media', 'sources.json', '--cwd', cwd, '--json'],
    { cwd: packageRoot(), encoding: 'utf8', timeout: 90_000 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const { drafts, media } = JSON.parse(result.stdout).data;
  expect(drafts).toBe(initial.drafts);
  expect(await readJson(briefPath)).toEqual({ ...(brief as object), artifacts: media });
  expect(media.carousel.files).toHaveLength(2);
  for (const path of [...media.carousel.files, media.carousel.report, media.vertical.file, media.vertical.receipt]) {
    const folder = dirname(resolve(cwd, path));
    expect(dirname(folder)).toBe(drafts);
    expect(basename(folder)).toMatch(/^repurpose-assets-/);
  }
  for (const path of media.carousel.files)
    expect(pngSize(await readFile(join(cwd, path)))).toEqual({ width: 1080, height: 1350 });
  expect(await readJson(join(cwd, media.carousel.report))).toMatchObject([
    { ok: true, source: fixturePath }, { ok: true, source: fixturePath },
  ]);
  expect(await readJson(join(cwd, media.vertical.receipt))).toMatchObject({ format: '9x16', duration: 11,
    scenes: [{ caption: 'Find missing exports.' }, { caption: 'Check the output.' }] });
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'json', join(cwd, media.vertical.file)], { encoding: 'utf8' });
  const [{ width, height }] = JSON.parse(probe).streams;
  expect(width * 16).toBe(height * 9);
  expect(await readdir(paths.media)).toEqual(['fixture.png']);
  expect(await readFile(fixturePath)).toEqual(still);
  expect(await readFile(paths.published, 'utf8')).toBe(published);
}, 100_000);

it('rejects stale post selections, missing mappings and media outside the local asset tree', async () => {
  const { cwd, paths, source, sourcesPath } = await repurposeFixture();
  const initial = await collect(cwd);
  const briefPath = join(initial.drafts, 'repurpose-media.json');
  const brief = await readFile(briefPath, 'utf8');
  const run = async (manifest: unknown) => {
    await writeJson(sourcesPath, manifest);
    return collect(cwd, { repurposeMediaPath: sourcesPath });
  };
  await expect(run({ ...source, postId: 'two' })).rejects.toThrow('selected post');
  await expect(run({ ...source, frames: [] })).rejects.toThrow('one media source per caption');
  await expect(run({ ...source, frames: [{ image: '../outside.png' }, source.frames[1]] })).rejects.toThrow('local file');
  await mkdir(paths.media);
  await writeFile(join(paths.media, 'fixture.png'), 'not an image');
  await expect(run(source)).rejects.toThrow('local file');
  await writeFile(join(paths.media, 'fixture.png'), PNG.sync.write(new PNG({ width: 64, height: 36 })));
  await expect(run({ ...source, frames: [{ image: 'fixture.png', clip: 'https://example.test/remote.mp4' }, source.frames[1]] }))
    .rejects.toThrow('clip must be a supported local file');
  await symlink(join(paths.media, 'fixture.png'), join(paths.media, 'linked.png'), 'file');
  await expect(run({ ...source, frames: [{ image: 'linked.png' }, { image: 'linked.png' }] })).rejects.toThrow('Unsafe symlink');
  expect(await readFile(briefPath, 'utf8')).toBe(brief);
  expect((await readdir(initial.drafts)).some(name => name.startsWith('repurpose-assets-'))).toBe(false);
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

it('rejects ambiguous UTM mappings and keeps unmatched analytics separate', async () => {
  const { cwd, paths } = await workspace();
  const input = join(paths.root, 'metrics.json');
  await writeJson(input, { posts: [{ channel: 'x', id: 'one', utmContent: 'shared' },
    { channel: 'x', id: 'two', utmContent: 'shared' }] });
  await expect(collect(cwd, { now })).rejects.toThrow('Multiple posts share the same utmContent');
  await writeJson(input, { posts: [], attribution: [{ signups: 8 }, { signups: 4 }] });
  await expect(collect(cwd, { now })).rejects.toThrow('Duplicate UTM attribution row');
  await writeJson(input, { posts: [], attribution: [{ utmContent: 'unknown', signups: 8 }] });
  const result = await collect(cwd, { now });
  expect(result.results.channels.every(row => row.signups === undefined)).toBe(true);
  expect(await readFile(paths.report, 'utf8')).toContain('excluded from post and channel totals): signups: 8');
});

it('turns recorded checkpoints into attribution, feedback drafts, repurposing, and reusable calibration', async () => {
  const { cwd, paths } = await workspace();
  const fixture = join(packageRoot(), 'fixtures', 'cli-tool', '.liftoff-fixture', 'part-g-metrics.json');
  const input = join(paths.root, 'metrics.json');
  const data = JSON.parse(await readFile(fixture, 'utf8'));
  await writeJson(paths.published, { posts: [
    { channel: 'x', id: 'one', status: 'published', scheduledAt: '2026-03-08T01:00:00Z' },
    { channel: 'x', id: 'two', status: 'published', scheduledAt: '2026-03-07T23:00:00Z' },
    { channel: 'show-hn', id: 'hn', status: 'published' },
  ] });
  await writeJson(input, data);
  const day1 = await collect(cwd, { now: new Date('2026-03-08T20:00:00Z') });
  expect(await readFile(join(day1.drafts, 't-plus-1-thank-you.md'), 'utf8')).toContain('18 signups');

  const carousel = vi.fn(() => 'fixture-carousel');
  const vertical = vi.fn(() => 'fixture-clip');
  const day3 = await collect(cwd, { now, repurposeMedia: { carousel, vertical } });
  expect(day3.feedback).toEqual({ faq: 6, issues: 3, objections: 1 });
  expect(day3.results.channels).toContainEqual(expect.objectContaining({ channel: 'x', clicks: 40, signups: 18, waitlistConversions: 9 }));
  const report = await readFile(day3.report, 'utf8');
  expect(report).toContain('| x | one | fixture-a | 1200 | 4 | 9 | 2 | 1 | clicks, signups, waitlistConversions |');
  expect(report).toContain('| x | two | fixture-b | 500 | 3 | 31 | 16 | 8 | clicks, signups, waitlistConversions |');
  expect(report).toContain('signups: 11');
  expect(await readFile(join(day3.drafts, 't-plus-3-lessons.md'), 'utf8')).toContain('Show HN: 4 views');
  expect(await readFile(join(day3.drafts, 'faq.md'), 'utf8')).toContain('draft for site and README');
  const issues = await readJson(join(day3.drafts, 'issues.json')) as Array<{ title: string; labels: string[]; body: string }>;
  expect(issues).toHaveLength(3);
  expect(issues.every(issue => issue.labels.includes('from-launch'))).toBe(true);
  expect(issues.find(issue => issue.title === 'Please add CSV export.')?.body).toMatch(/comment a3.*comment b2/);
  expect(await readFile(join(day3.drafts, 'exemplar-notes.md'), 'utf8')).toContain('privacy risk');
  expect(await readFile(join(day3.drafts, 'repurpose.md'), 'utf8')).toContain('Source: x / two');
  expect(carousel).toHaveBeenCalledWith(expect.objectContaining({ hook: 'See exactly what changed.' }));
  expect(vertical).toHaveBeenCalledOnce();
  expect(day3.media).toEqual({ carousel: 'fixture-carousel', vertical: 'fixture-clip' });

  const history = join(cwd, 'history.json');
  const learned = await learn(cwd, history);
  expect(learned.observations.find(row => row.channel === 'x')).toMatchObject({
    bestHour: 15, bestHook: 'See exactly what changed.', bestAngle: 'Sample export',
  });
  const weights = await loadJudgeWeights('devtool', 'fixture-v1', history);
  expect(weights?.specificity).toBeGreaterThan(50);
  expect(weights?.polish).toBeLessThan(50);
  expect(await loadJudgeWeights('devtool', 'other-rubric', history)).toBeUndefined();

  const day7 = await collect(cwd, { now: new Date('2026-03-14T21:00:00Z') });
  const email = join(day7.drafts, 't-plus-7-email.md');
  expect(await readFile(email, 'utf8')).not.toContain('We’ve shipped');
  await writeJson(input, { ...data, shippedFix: { channel: 'x', postId: 'two', commentId: 'b2',
    title: 'CSV export', releaseUrl: 'https://example.test/releases/2' } });
  await collect(cwd, { now: new Date('2026-03-14T21:00:00Z') });
  expect(await readFile(email, 'utf8')).toContain('We’ve shipped CSV export');
  const day30 = await collect(cwd, { now: new Date('2026-04-06T21:00:00Z') });
  expect(day30.checkpoint).toBe('T+30');
  expect(await readJson(day7.snapshot)).toBeDefined();
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
