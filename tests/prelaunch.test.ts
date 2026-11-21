import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { publish } from '../src/adapters/publish.js';
import { launchDir } from '../src/core/launch-dir.js';
import { packageRoot } from '../src/core/package-root.js';
import { emptyInput, inputPath, type Input } from '../src/prelaunch/input.js';
import { initializePrelaunch, prelaunch } from '../src/prelaunch/kit.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
const inputs = {
  ...emptyInput,
  checks: {
    install: { passed: true, notes: 'Fixture: clean sandbox install exited successfully.' },
    demo: { passed: true, notes: 'Fixture: signed-out session reached the demo.' },
    mainPath: { passed: true, notes: 'Fixture: completed the documented first action.' },
  },
  installCommand: 'npm install -g sample@1.0.0',
  landingUrl: 'https://example.test/start?ref=demo&utm_source=old&UTM_Source=old&tag=a&tag=b#intro',
  campaign: 'recorded-launch',
  landingSnapshot: 'recorded.html',
  demoUrl: 'https://example.test/demo',
  demoAboveFold: true,
  landingLcpMs: 2600,
  ogImageUrl: 'https://example.test/share.png',
  feedbackUrl: 'https://github.com/sample/project/discussions',
} satisfies Input;
const record = (cwd: string, input: Input) => writeFile(inputPath(cwd), JSON.stringify(input));
const pending = { passed: false, notes: 'Not yet verified.' };
const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), ...args, '--cwd', cwd, '--json'], { encoding: 'utf8' });

async function project(fixture?: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-prelaunch-'));
  directories.push(cwd);
  if (fixture) await cp(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
  const paths = launchDir(cwd);
  await mkdir(paths.posts, { recursive: true });
  await writeFile(paths.config, JSON.stringify({
    profile: 'devtool', launchType: 'new-product', channels: ['show-hn', 'x', 'x'], launchDate: '2026-07-14',
    timezone: 'UTC', profileConfirmed: true,
  }));
  initializePrelaunch(cwd);
  return { cwd, paths };
}

it.each([
  ['cli-tool', 'resend'], ['saas-next', 'loops'], ['mobile-expo', 'kit'],
] as const)('makes an offline kit for %s with %s drafts', async (fixture, provider) => {
  const { cwd } = await project(fixture);
  const original = await readFile(join(cwd, 'README.md'), 'utf8');
  const remote = vi.fn(() => { throw new Error('unexpected network call'); });
  vi.stubGlobal('fetch', remote);
  await record(cwd, { ...inputs, waitlist: { provider, action: '/api/signup' } });
  await writeFile(join(cwd, 'recorded.html'), [
    '<!doctype html>', '<html><head>', '<title>Recorded fixture</title>', '</head><body>',
    '<h1>Fixture product</h1><a href="/demo">Try the demo</a>',
    '<!-- <meta property="og:image" content="https://example.test/ignored.png"> -->',
    '</body></html>', '',
  ].join('\n'));
  const report = prelaunch(cwd);
  expect(remote).not.toHaveBeenCalled();
  expect(report.readiness).toMatchObject({ score: 100, ready: true });
  expect(report.landing.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ check: 'demo-above-fold', status: 'pass' }),
    expect.objectContaining({ check: 'og-image', status: 'fail' }),
    expect.objectContaining({ check: 'page-speed', status: 'fail' }),
  ]));
  expect(report.support.checks.map(({ status }) => status)).toEqual(['fail', 'pass', 'fail']);
  expect(report.capture.provider).toBe(provider);
  const readArtifact = (name: string) => readFile(join(cwd, name), 'utf8');
  expect(await readArtifact(report.files.signupForm)).toContain('<form action="/api/signup" method="post">');
  expect(await readArtifact(report.files.welcomeEmail)).toContain('unsubscribe');
  const channels = JSON.parse(await readArtifact(report.files.trackingLinks));
  expect(Object.keys(channels)).toEqual(['show-hn', 'x']);
  const url = new URL(channels.x);
  expect([...url.searchParams]).toEqual([
    ['ref', 'demo'], ['tag', 'a'], ['tag', 'b'], ['utm_source', 'x'],
    ['utm_medium', 'launch'], ['utm_campaign', 'recorded-launch'],
  ]);
  expect(url.hash).toBe('#intro');
  expect(await readFile(join(cwd, 'README.md'), 'utf8')).toBe(original);
  const patch = join(cwd, report.files.suggestedFixes);
  execFileSync('git', ['apply', '--check', patch], { cwd });
  execFileSync('git', ['apply', patch], { cwd });
  const reviewed = prelaunch(cwd);
  expect(reviewed.support).toMatchObject({ feedbackUrl: inputs.feedbackUrl });
  expect(reviewed.support.checks[0].status).toBe('fail'); // Draft FAQs are not ready.
  expect(reviewed.readme.checks.map(({ status }) => status)).toEqual(['pass', 'pass', 'pass', 'pass']);
  expect(reviewed.landing.checks.find(({ check }) => check === 'og-image')?.status).toBe('pass');
});

it('keeps structured failure details and treats unmeasured viewport and speed as unverified', async () => {
  const { cwd } = await project('cli-tool');
  const init = cli(cwd, 'prelaunch', '--init');
  expect(init.status).toBe(1);
  expect(JSON.parse(init.stdout).error).toContain('Already exists');
  await record(cwd, { ...inputs, checks: { ...inputs.checks, demo: pending }, demoAboveFold: null, landingLcpMs: null });
  await writeFile(join(cwd, 'recorded.html'), '<a href="/demo">Demo</a>');
  const result = cli(cwd, 'prelaunch');
  expect(result.status, result.stderr).toBe(1);
  const body = JSON.parse(result.stdout);
  expect(body).toMatchObject({ ok: false, command: 'prelaunch', data: { readiness: { score: 70, threshold: 80 } } });
  expect(body.data.landing.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ check: 'demo-above-fold', status: 'unverified' }),
    expect.objectContaining({ check: 'page-speed', status: 'unverified' }),
  ]));
  await record(cwd, { ...inputs, threshold: 70, checks: { ...inputs.checks, demo: pending } });
  expect(prelaunch(cwd).readiness.ready).toBe(true);
});

it('blocks staging on fresh evidence without bypassing approval or affecting preview', async () => {
  const { cwd, paths } = await project();
  await record(cwd, inputs);
  prelaunch(cwd); // A passing report is not sufficient after evidence changes.
  const source = '---\ntitle: Sample\nmedia: []\nclaims: []\n---\nFixture post.\n';
  const hash = createHash('sha256').update(String(Buffer.byteLength(source)) + ':').update(source).digest('hex');
  const approval = { channel: 'show-hn', hash, name: 'Fixture reviewer', time: '2026-07-13T09:00:00Z' };
  await writeFile(join(paths.posts, 'show-hn.md'), source);
  await writeFile(paths.approvals, JSON.stringify({ approvals: [approval] }));
  await record(cwd, { ...inputs, checks: { ...inputs.checks, mainPath: pending } });
  expect((await publish(cwd, false, {})).mode).toBe('dry-run');
  await expect(publish(cwd, true, {})).rejects.toThrow(/readiness 60\/100 is below 80/);
  await expect(readFile(paths.published)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(paths.review, 'ready'))).rejects.toMatchObject({ code: 'ENOENT' });
  await record(cwd, inputs);
  await writeFile(join(paths.posts, 'show-hn.md'), source + 'Changed after review.');
  await expect(publish(cwd, true, {})).rejects.toThrow(/exact post and media hash not approved/);
  await writeFile(join(paths.posts, 'show-hn.md'), source);
  expect((await publish(cwd, true, {})).mode).toBe('offline-staging');
});

it('rejects unchecked pass claims, unsafe routes, paths, and credentials', async () => {
  const { cwd } = await project();
  await record(cwd, { ...inputs, checks: { ...inputs.checks, demo: { passed: true, notes: ' ' } } });
  expect(() => prelaunch(cwd)).toThrow(/checks\/demo\/notes/);
  await record(cwd, { ...inputs, waitlist: { provider: 'kit', action: '//outside.example/collect' } });
  expect(() => prelaunch(cwd)).toThrow(/waitlist\/action/);
  await record(cwd, { ...inputs, landingUrl: 'https://user:pass@example.test' });
  expect(() => prelaunch(cwd)).toThrow(/credential-free/);
  await record(cwd, { ...inputs, readme: '../README.md' });
  expect(() => prelaunch(cwd)).toThrow(/repository-relative/);
  await record(cwd, { ...inputs, readme: 'alias.md' });
  await symlink(join(packageRoot(), 'README.md'), join(cwd, 'alias.md'));
  expect(() => prelaunch(cwd)).toThrow(/Unsafe symlink/);
  await rm(inputPath(cwd));
  await symlink(join(packageRoot(), 'package.json'), inputPath(cwd));
  await expect(publish(cwd, true, {})).rejects.toThrow(/Unsafe symlink/);
});
