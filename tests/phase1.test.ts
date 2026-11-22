import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { packageRoot } from '../src/core/package-root.js';
import { launchDir } from '../src/core/launch-dir.js';
import { loadRule } from '../src/core/rules.js';
import { validateFile } from '../src/core/schema.js';
import { init, detectProfile, type Config } from '../src/product/init.js';
import { scan, readmeSections, routesFromFiles, githubRepository } from '../src/product/scan.js';
import { validate, validateProduct } from '../src/product/validate.js';
import { createPlan, plan } from '../src/planning/plan.js';

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'liftoff-phase1-'));
  vi.stubEnv('LIFTOFF_ALLOW_NETWORK', '0');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(cwd, { recursive: true, force: true });
});
const fixture = async (id = 'saas-next') => cp(join(packageRoot(), 'fixtures', id), cwd, { recursive: true });
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const cli = (...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), '--cwd', cwd, ...args], { encoding: 'utf8' });
const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe',
  env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' } }).toString().trim();
const settings = { yes: true, date: '2026-02-10', timezone: 'America/New_York' };
const product = async () => json(join(cwd, '.liftoff-fixture/product.json'));

describe('init', () => {
  it.each([['cli-tool', 'devtool'], ['saas-next', 'indie-saas'], ['mobile-expo', 'consumer-mobile']])('detects %s as %s', async (id, profile) => {
    await fixture(id);
    expect(await detectProfile(cwd)).toBe(profile);
    const result = await init(cwd, settings);
    expect(result.config.profile).toBe(profile);
    expect(validateFile('config', await json(result.path)).valid).toBe(true);
    expect(result.config.channels).toEqual(loadRule('profiles', profile).defaultChannels);
  });
  it('asks once and confirms without losing existing settings', async () => {
    await fixture();
    const first = await init(cwd, { timezone: 'UTC', date: '2026-02-10' });
    expect(first.config.profileConfirmed).toBe(false);
    expect(first.message).toContain('--profile indie-saas --yes');
    const confirmed = await init(cwd, { profile: 'b2b-saas', yes: true, date: '2030-01-01' });
    expect(confirmed.config).toMatchObject({ profile: 'b2b-saas', profileConfirmed: true, launchDate: '2026-02-10', timezone: 'UTC' });
    const content = await readFile(first.path, 'utf8');
    expect((await init(cwd, { ...settings, profile: 'enterprise' })).created).toBe(false);
    expect(await readFile(first.path, 'utf8')).toBe(content);
    expect((await init(cwd, { ...settings, force: true, profile: 'enterprise' })).config.profile).toBe('enterprise');
  });
  it('handles empty repositories and explicit profile selection', async () => {
    expect(await detectProfile(cwd)).toBe('devtool');
    expect((await init(cwd, { ...settings, yes: false, profile: 'consumer-mobile' })).config.profileConfirmed).toBe(true);
  });
  it('recognizes JS pricing routes and gives bin detection precedence', async () => {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '*' } }));
    await mkdir(join(cwd, 'src/app/(marketing)/pricing'), { recursive: true });
    await writeFile(join(cwd, 'src/app/(marketing)/pricing/page.js'), 'export default function Pricing() {}');
    expect(await detectProfile(cwd)).toBe('indie-saas');
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ bin: 'cli.js', dependencies: { expo: '*' } }));
    expect(await detectProfile(cwd)).toBe('devtool');
  });
  it('rejects invalid dates, timezone, profile, type and malformed package JSON', async () => {
    await expect(init(cwd, { ...settings, date: '2026-02-30' })).rejects.toThrow();
    await expect(init(cwd, { ...settings, timezone: 'Not/AZone' })).rejects.toThrow('Invalid timezone');
    await expect(init(cwd, { ...settings, profile: '../escape' })).rejects.toThrow();
    await expect(init(cwd, { ...settings, type: 'random' })).rejects.toThrow();
    await writeFile(join(cwd, 'package.json'), '{');
    await expect(init(cwd, settings)).rejects.toThrow();
  });
  it('allows force to repair a corrupt config', async () => {
    await mkdir(launchDir(cwd).root);
    await writeFile(launchDir(cwd).config, '{');
    await expect(init(cwd, settings)).rejects.toThrow();
    expect((await init(cwd, { ...settings, force: true })).created).toBe(true);
  });
});

describe('scan', () => {
  it('handles empty repo without Git or README', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const result = await scan(cwd);
    expect(result.scan).toMatchObject({ readmeSections: [], package: {}, license: '', commits: [], routes: [], screenshots: [] });
    expect(validateFile('scan', await json(result.path)).valid).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(readmeSections('')).toEqual([]);
    expect(readmeSections('Intro\n# Features\nExample')).toEqual([
      { heading: 'Introduction', body: 'Intro' }, { heading: 'Features', body: 'Example' },
    ]);
  });
  it('collects README, package, license, routes, homepage and media while skipping generated dirs', async () => {
    await fixture();
    await mkdir(join(cwd, 'node_modules/cached'), { recursive: true });
    await writeFile(join(cwd, 'node_modules/cached/screenshot.png'), 'ignored');
    await mkdir(join(cwd, 'assets'));
    await writeFile(join(cwd, 'assets/screenshot.png'), 'candidate');
    const result = await scan(cwd);
    expect(result.scan.landingUrl).toBe('https://teamnest.example');
    expect(result.scan.routes).toContain('/pricing');
    expect(result.scan.license).toContain('MIT License');
    expect(result.scan.screenshots).toEqual(['assets/screenshot.png']);
    expect((result.scan.readmeSections as unknown[]).length).toBeGreaterThan(2);
    expect(routesFromFiles(['pages/dashboard/index.tsx', 'app/_layout.tsx', 'app/index.tsx', 'bin/tool', 'node_modules/x.js']))
      .toEqual(['/dashboard', 'bin/tool']);
  });
  it('derives only real Next routes, ignoring components, route groups, private folders and framework pages', () => {
    expect(routesFromFiles([
      'app/page.tsx', 'app/(marketing)/pricing/page.tsx', 'app/components/Button.tsx', 'app/lib/db.ts',
      'app/_private/page.tsx', 'app/_private/nested/route.ts', 'app/(marketing)/layout.tsx',
      'src/app/(dashboard)/teams/[id]/page.jsx', 'src/app/api/health/route.ts',
      'src/app/@modal/(group)/page.tsx', 'pages/_app.tsx', 'pages/_document.tsx', 'pages/_error.tsx',
      'pages/api/users.ts', 'pages/api/index.ts', 'pages/index.tsx', 'src/pages/docs/index.tsx',
      'pages/blog/[slug].tsx', 'bin/tool',
    ])).toEqual(['/', '/pricing', '/teams/[id]', '/api/health', '/docs', '/blog/[slug]', 'bin/tool']);
    expect(routesFromFiles([])).toEqual([]);
    expect(routesFromFiles(['app/components/Button.tsx', 'app/lib/db.ts'])).toEqual([]);
  });
  it('retains Expo file-based routes without mistaking them for Next pages', async () => {
    await fixture('mobile-expo');
    const pkg = await json(join(cwd, 'package.json'));
    pkg.dependencies['expo-router'] = '^5.0.0';
    await writeFile(join(cwd, 'package.json'), JSON.stringify(pkg));
    await mkdir(join(cwd, 'app/(tabs)'), { recursive: true });
    await writeFile(join(cwd, 'app/(tabs)/index.tsx'), 'export default function Home() {}');
    await writeFile(join(cwd, 'app/(tabs)/settings.tsx'), 'export default function Settings() {}');
    await writeFile(join(cwd, 'app/_layout.tsx'), 'export default function Layout() {}');
    expect((await scan(cwd)).scan.routes).toEqual(['/', '/settings']);
    expect(routesFromFiles(['app/index.tsx', 'app/settings.tsx', 'app/_layout.tsx'], 'expo')).toEqual(['/', '/settings']);
  });
  it('does not infer URL routes from an Expo app without expo-router', async () => {
    await fixture('mobile-expo');
    await mkdir(join(cwd, 'app'), { recursive: true });
    await writeFile(join(cwd, 'app/index.tsx'), 'export default function Home() {}');
    await writeFile(join(cwd, 'app/page.tsx'), 'export default function Page() {}');
    await writeFile(join(cwd, 'app/profile.tsx'), 'export default function Profile() {}');
    expect((await scan(cwd)).scan.routes).toEqual([]);
  });
  it('includes the pages/api page while excluding handlers inside pages/api/', () => {
    expect(routesFromFiles(['pages/api.tsx', 'pages/api/users.ts', 'src/pages/api/status.ts']))
      .toEqual(['/api']);
    expect(routesFromFiles(['src/pages/api.jsx', 'pages/api/index.ts', 'pages/api/v1/users.ts']))
      .toEqual(['/api']);
  });
  it('strips Expo platform suffixes and deduplicates the resulting routes', () => {
    expect(routesFromFiles([
      'app/profile.ios.tsx', 'app/profile.android.tsx', 'app/profile.web.tsx',
      'app/profile.native.tsx', 'app/profile.tsx', 'app/index.ios.tsx',
      'app/_layout.native.tsx', 'app/(tabs)/settings.web.jsx',
    ], 'expo')).toEqual(['/profile', '/', '/settings']);
    expect(routesFromFiles(['app/profile.ios.tsx'])).toEqual([]);
  });
  it('skips Next intercepting overlays, including nested intercepts, without inventing routes', () => {
    const overlays = [
      'app/(.)photo/page.tsx', 'app/(..)photo/page.tsx', 'app/(..)(..)photo/page.tsx',
      'app/(...)photo/page.tsx',
      'src/app/(group)/@modal/(.)photo/[id]/page.tsx',
      'app/feed/(..)photo/[id]/page.tsx', 'app/feed/deep/(..)(..)photo/[id]/page.tsx',
      'app/feed/(...)photo/[id]/page.tsx', 'app/feed/(.)photo/[id]/route.ts',
    ];
    expect(routesFromFiles(overlays)).toEqual([]);
    expect(routesFromFiles([
      ...overlays, 'app/photo/page.tsx',
      'app/(group)/photo/[id]/page.tsx',
    ])).toEqual(['/photo', '/photo/[id]']);
    expect(routesFromFiles(['app/(.)photo/component.tsx'])).toEqual([]);
  });
  it('falls back to README URLs and all commits before a tag, then scans only commits since tag', async () => {
    await writeFile(join(cwd, 'README.md'), '# Example\nSee [site](https://example.test/launch).\n');
    git('init', '--initial-branch=main');
    git('add', 'README.md');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial');
    expect((await scan(cwd)).scan.commits).toHaveLength(1);
    git('tag', 'v0.1.0');
    expect((await scan(cwd)).scan.commits).toHaveLength(0);
    await writeFile(join(cwd, 'feature.txt'), 'new feature');
    git('add', 'feature.txt');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Add feature');
    const result = await scan(cwd);
    expect(result.scan.commits).toEqual([{ sha: git('rev-parse', 'HEAD'), subject: 'Add feature' }]);
    expect(result.scan.landingUrl).toBe('https://example.test/launch');
  });
  it('reads history larger than 1 MiB and warns if Git cannot read history', async () => {
    git('init', '--initial-branch=main');
    const subject = 'Large history subject ' + 'x'.repeat(65_000);
    for (let i = 0; i < 18; i++) git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', subject);
    const result = await scan(cwd);
    const commits = result.scan.commits as { sha: string; subject: string }[];
    expect(commits).toHaveLength(18);
    expect(commits.every(commit => commit.subject === subject)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(commits))).toBeGreaterThan(1024 * 1024);
    expect(result.warnings).toEqual([]);
    await writeFile(join(cwd, '.git/HEAD'), 'ref: refs/heads/missing\n');
    const unreadable = await scan(cwd);
    expect(unreadable.scan.commits).toEqual([]);
    expect(unreadable.warnings).toContain('Git history could not be read; commits are empty (Git may be unavailable or the repository may have no commits).');
  });
  it('keeps network opt-in, accepts only public star counts and tolerates all fetch failures', async () => {
    git('init', '--initial-branch=main');
    git('remote', 'add', 'origin', 'git@github.com:example/product.git');
    const network = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ private: false, stargazers_count: 12 }) });
    vi.stubGlobal('fetch', network);
    await scan(cwd);
    expect(network).not.toHaveBeenCalled();
    expect((await scan(cwd, { github: true })).scan.stars).toBe(12);
    expect(network.mock.calls[0][0]).toBe('https://api.github.com/repos/example/product');
    network.mockResolvedValueOnce({ ok: true, json: async () => ({ private: true, stargazers_count: 12 }) });
    expect((await scan(cwd, { github: true })).scan).not.toHaveProperty('stars');
    network.mockRejectedValueOnce(new Error('offline'));
    expect((await scan(cwd, { github: true })).warnings).toContain('GitHub stars unavailable; continuing with local facts.');
    network.mockResolvedValueOnce({ ok: false, status: 404 });
    expect((await scan(cwd, { github: true })).warnings).toContain('GitHub stars unavailable; continuing with local facts.');
    vi.stubEnv('LIFTOFF_ALLOW_NETWORK', '1');
    expect((await scan(cwd)).scan.stars).toBe(12);
    expect(githubRepository('https://github.com/owner/repo.git')).toBe('owner/repo');
    expect(githubRepository('https://evil.test/owner/repo')).toBeUndefined();
  });
});

describe('product validation', () => {
  it('validates real sources and rejects absent sources, missing files, directories and long one-liners', async () => {
    await fixture();
    const good = await product();
    expect(await validateProduct(cwd, good)).toEqual({ valid: true, errors: [], warnings: [] });
    for (const mutate of [
      (p: typeof good) => { p.features[0].sources = []; },
      (p: typeof good) => { p.features[0].sources[0].ref = 'missing.tsx'; },
      (p: typeof good) => { p.features[0].sources[0].ref = 'app'; },
      (p: typeof good) => { p.oneLiner = 'x'.repeat(81); },
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      expect((await validateProduct(cwd, bad)).valid).toBe(false);
    }
    expect((await validateProduct(cwd, {})).valid).toBe(false);
    expect((await validateProduct(cwd, null)).valid).toBe(false);
  });
  it('rejects escaping paths and symlinks, validates URLs, and warns for missing commits', async () => {
    await fixture();
    const p = await product();
    const outside = join(cwd, '..');
    await symlink(outside, join(cwd, 'outside'), 'dir');
    p.features[0].sources = [{ type: 'file', ref: '/etc/hosts' }];
    expect((await validateProduct(cwd, p)).valid).toBe(false);
    p.features[0].sources = [{ type: 'file', ref: 'outside' }];
    expect((await validateProduct(cwd, p)).valid).toBe(false);
    p.features[0].sources = [{ type: 'url', ref: 'file:///etc/hosts' }];
    expect((await validateProduct(cwd, p)).valid).toBe(false);
    p.features[0].sources = [{ type: 'url', ref: 'https://example.test' }];
    expect((await validateProduct(cwd, p)).valid).toBe(true);
    p.features[0].sources = [{ type: 'commit', ref: 'deadbeef' }];
    const warned = await validateProduct(cwd, p);
    expect(warned.valid).toBe(true);
    expect(warned.warnings).toHaveLength(1);
    git('init', '--initial-branch=main');
    git('add', 'README.md');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Source');
    p.features[0].sources = [{ type: 'commit', ref: git('rev-parse', 'HEAD') }];
    expect((await validateProduct(cwd, p)).warnings).toHaveLength(0);
    p.claims.push(structuredClone(p.claims[0]));
    expect((await validateProduct(cwd, p)).errors).toContain('/claims ids must be unique');
  });
  it('supports generic JSON/YAML validation and clear file errors', async () => {
    await init(cwd, settings);
    expect((await validate(cwd, 'config')).valid).toBe(true);
    await writeFile(join(cwd, 'shots.yaml'), 'shots:\n  - id: home\n    route: /\n    viewport: {width: 1200, height: 800}\n');
    expect((await validate(cwd, 'shots', 'shots.yaml')).valid).toBe(true);
    await expect(validate(cwd, 'product')).rejects.toThrow();
    await expect(validate(cwd, '../config')).rejects.toThrow('Invalid schema kind');
    await expect(validate(cwd, 'unknown')).rejects.toThrow('Specify --file');
    await writeFile(join(cwd, 'invalid.json'), '{');
    await expect(validate(cwd, 'product', 'invalid.json')).rejects.toThrow();
  });
});

describe('planning', () => {
  it('uses deterministic profile-allowed rules, local dates and launch-type counts', async () => {
    await fixture();
    const config = (await init(cwd, settings)).config;
    for (const [type, count] of [['new-product', 4], ['feature', 3], ['changelog', 2], ['relaunch', 3]] as const) {
      const result = createPlan({ ...config, launchType: type, channels: ['tiktok', ...config.channels, 'show-hn'] });
      expect(result.channels).toHaveLength(count);
      expect(result.channels.every(c => config.channels.includes(c.id))).toBe(true);
      expect(result.markdown).toContain('Timezone: America/New_York');
      expect(result.markdown.split('\n').length).toBeLessThan(120);
      expect(createPlan({ ...config, launchType: type }).markdown).toBe(result.markdown);
    }
    const weekend = createPlan(config, { date: '2026-02-14' });
    expect(weekend.channels[0]).toMatchObject({ date: '2026-02-17', time: '09:00' });
    const stored = await json(launchDir(cwd).config);
    const written = await plan(cwd, { date: '2026-02-14', lessons: [] });
    expect(await readFile(written.path, 'utf8')).toBe(weekend.markdown);
    expect(await json(launchDir(cwd).config)).toEqual(stored);
    for (let day = -7; day <= 3; day++) expect(written.markdown).toContain(`T${day >= 0 ? '+' : ''}${day}:`);
  });
  it('rejects unconfirmed, invalid or insufficient allowed inputs', async () => {
    const config = (await init(cwd, { ...settings, yes: false })).config;
    expect(() => createPlan(config)).toThrow('Confirm the profile');
    expect(() => createPlan({ ...config, profileConfirmed: true, channels: ['tiktok', 'instagram'] })).toThrow('at least two');
    expect(() => createPlan({ ...config, profileConfirmed: true }, { date: 'bad' })).toThrow();
    await expect(plan(join(cwd, 'absent'))).rejects.toThrow();
  });
  it('exposes an explicit phase-6 hook with visible observations, not implicit history', async () => {
    const config: Config = (await init(cwd, settings)).config;
    const baseline = createPlan(config);
    const updated = createPlan(config, { lessons: [{ channel: baseline.channels[0].id, time: '15:30', observation: 'Earlier launch had more clicks at this hour.' }] });
    expect(updated.channels[0].time).toBe('15:30');
    expect(updated.markdown).toContain('time changed to 15:30 based on observation');
    expect(() => createPlan(config, { lessons: [{ channel: baseline.channels[0].id, time: '99:99', observation: 'bad' }] })).toThrow('Invalid history');
  });
});

it('CLI workflow supports confirmation text, JSON envelopes and nonzero validation failures', async () => {
  await fixture();
  const started = cli('init', '--timezone', 'UTC', '--date', '2026-02-10', '--json');
  expect(started.status, started.stderr).toBe(0);
  expect(JSON.parse(started.stdout).data.message).toContain('--profile indie-saas --yes');
  expect(cli('init').stdout).toContain('Confirm the detected profile');
  expect(cli('plan', '--json').status).toBe(1);
  expect(cli('init', '--profile', 'indie-saas', '--yes', '--json').status).toBe(0);
  expect(cli('scan', '--json').status).toBe(0);
  await cp(join(cwd, '.liftoff-fixture/product.json'), launchDir(cwd).product);
  expect(JSON.parse(cli('validate', 'product', '--json').stdout).ok).toBe(true);
  const result = cli('plan', '--json');
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).data.channels).toHaveLength(4);
  const bad = await product();
  bad.features[0].sources[0].ref = 'missing.tsx';
  await writeFile(launchDir(cwd).product, JSON.stringify(bad));
  const rejected = cli('validate', 'product', '--json');
  expect(rejected.status).toBe(1);
  expect(JSON.parse(rejected.stdout)).toMatchObject({ ok: false, command: 'validate' });
  expect(JSON.parse(rejected.stdout).error).toContain('file must exist');
}, 30000);
