import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { registry, site } from '../src/core/registry.js';
import { packageRoot } from '../src/core/package-root.js';
import { adapterSelection } from '../src/adapters/index.js';
import { loadAdapterMetadata } from '../src/adapters/metadata.js';
import { publish } from '../src/adapters/publish.js';
import { writeBriefs } from '../src/copy/write.js';
import { checkPosts } from '../src/copy/check.js';
import { createPlan } from '../src/planning/plan.js';
import { buildReview } from '../src/review/page.js';
import { validate } from '../src/product/validate.js';

const dirs: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'liftoff-5c-')); dirs.push(dir); return dir; };
afterEach(() => { vi.unstubAllEnvs(); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
function definition(id = 'betalist') {
  return { kind: 'site', id, name: 'BetaList', version: 1, lastVerified: '2026-01-01',
    sources: ['https://betalist.com/'], submitUrl: 'https://betalist.com/submit',
    channel: { profiles: ['devtool'], bestPostingTimes: ['09:00'], bestPostingDays: ['tue'], leadTimeDays: 7 },
    copy: { verified: false, verifiedFields: [], verificationNotes: ['Unverified local budgets'],
      title: { required: true, maxLength: 80 }, body: { minLength: 10, maxLength: 1000 },
      maxLinks: 1, requiredLink: false, bannedWords: ['guaranteed'], guidance: [] } };
}
function add(cwd: string, value = definition(), name = 'betalist') {
  const dir = join(cwd, '.launch/sites'); mkdirSync(dir, { recursive: true });
  const path = join(dir, name + '.yaml'); writeFileSync(path, stringify(value)); return path;
}
const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), ...args, '--cwd', cwd, '--json'], { encoding: 'utf8' });

it('loads validated adapter display names and accepts an empty metadata directory', () => {
  expect(loadAdapterMetadata().map(adapter => adapter.name)).toEqual([
    'Postiz', 'Buffer', 'Ayrshare', 'GitHub Releases', 'DEV', 'Email', 'Manual',
  ]);
  expect(loadAdapterMetadata(temp())).toEqual([]);
});

it('reports adapter schema and YAML errors with the file path', () => {
  const directory = temp(), path = join(directory, 'invalid.yaml');
  writeFileSync(path, stringify({ id: 'buffer', name: 'Buffer', priority: -1,
    channels: ['invalid channel'], envKeys: ['bad-key'], mcpAliases: [] }));
  expect(() => loadAdapterMetadata(directory)).toThrow(path);
  expect(() => loadAdapterMetadata(directory)).toThrow('/priority');
  expect(() => loadAdapterMetadata(directory)).toThrow('/channels/0');
  expect(() => loadAdapterMetadata(directory)).toThrow('/envKeys/0');
  writeFileSync(path, 'id: [');
  expect(() => loadAdapterMetadata(directory)).toThrow(path);
  writeFileSync(path, '');
  expect(() => loadAdapterMetadata(directory)).toThrow('must be object');
});

it('discovers and carries a single site through plan/write/check/review and approval-gated offline publish', async () => {
  const cwd = temp(); add(cwd);
  const config = { profile: 'devtool', launchType: 'new-product', channels: ['betalist', 'x'],
    timezone: 'UTC', launchDate: '2026-07-14', profileConfirmed: true };
  writeFileSync(join(cwd, '.launch/config.json'), JSON.stringify(config));
  cpSync(join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/phase2/product.json'), join(cwd, '.launch/product.json'));
  expect(createPlan(config, { cwd }).channels.map(c => c.id)).toContain('betalist');
  expect(writeBriefs(cwd, ['betalist']).briefs).toHaveLength(1);
  const file = join(cwd, '.launch/posts/betalist.md');
  const copy = '---\nchannel: betalist\ntitle: Launch notes\nmedia: []\nclaims: []\n---\nA small local project for thoughtful people.\n';
  writeFileSync(file, copy);
  expect(checkPosts(cwd, ['betalist']).issues).toEqual([]);
  writeFileSync(file, copy + 'guaranteed');
  expect(checkPosts(cwd, ['betalist']).issues.map(i => i.rule)).toContain('words.banned');
  writeFileSync(file, copy);
  const review = await buildReview(cwd);
  expect(readFileSync(review.path, 'utf8')).toContain('BetaList');
  await expect(publish(cwd)).rejects.toThrow();
  writeFileSync(join(cwd, '.launch/approvals.json'), JSON.stringify({ approvals: [{
    channel: 'betalist', hash: review.posts[0].hash, name: 'Owner', time: '2026-07-13T09:00:00Z',
  }] }));
  expect((await publish(cwd)).mode).toBe('dry-run');
  writeFileSync(file, copy + 'Edited.');
  await expect(publish(cwd, true)).rejects.toThrow();
  writeFileSync(file, copy);
  const result = cli(cwd, 'publish', '--confirm');
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const staged = JSON.parse(result.stdout).data;
  expect(staged.mode).toBe('offline-staging');
  const post = new URL(staged.posts[0].url);
  expect(readFileSync(post, 'utf8')).toContain('A small local project');
  expect(readFileSync(new URL('reminder.ics', post), 'utf8')).toContain('https://betalist.com/submit');
  const listing = cli(cwd, 'adapters');
  expect(listing.status, listing.stdout).toBe(0);
  expect(JSON.parse(listing.stdout).data).toContainEqual(expect.objectContaining({ id: 'betalist', source: 'project', route: 'manual', adapter: 'manual', reason: 'manual' }));
});

it('names both files on collisions and the file and schema errors on invalid definitions', () => {
  const builtin = temp(); const path = add(builtin, definition('x'));
  expect(() => registry(builtin)).toThrow(path);
  expect(() => registry(builtin)).toThrow('rules/channels/x.yaml');
  const duplicate = temp(); const a = add(duplicate); const b = add(duplicate, definition(), 'second');
  expect(() => registry(duplicate)).toThrow(a); expect(() => registry(duplicate)).toThrow(b);
  const invalid = temp(); const bad = add(invalid, { ...definition(), submitUrl: 'http://invalid.test' });
  expect(() => registry(invalid)).toThrow(bad); expect(() => registry(invalid)).toThrow('pattern');
  expect(() => site('unknown', temp())).toThrow('Known ids:');
});

it('discovers user sites through LIFTOFF_HOME and caches separately per cwd', () => {
  const home = temp(); mkdirSync(join(home, 'sites'));
  writeFileSync(join(home, 'sites/betalist.yaml'), stringify(definition()));
  vi.stubEnv('LIFTOFF_HOME', home);
  const cwd = temp(); expect(site('betalist', cwd)).toMatchObject({ source: 'user', path: join(home, 'sites/betalist.yaml') });
  expect(registry(cwd)).toBe(registry(cwd));
  const other = temp(); add(other); expect(() => registry(other)).toThrow('collision');
});

it.each(['project', 'user'])('rejects reserved %s site IDs before check can overwrite or delete a draft', source => {
  const cwd = temp();
  let path: string;
  if (source === 'project') path = add(cwd, definition('fix-list'));
  else {
    const home = temp(); mkdirSync(join(home, 'sites'));
    path = join(home, 'sites/reserved.yaml');
    writeFileSync(path, stringify(definition('fix-list')));
    vi.stubEnv('LIFTOFF_HOME', home);
  }
  mkdirSync(join(cwd, '.launch/posts'), { recursive: true });
  writeFileSync(join(cwd, '.launch/config.json'), JSON.stringify({ profile: 'devtool',
    launchType: 'new-product', channels: ['fix-list'], timezone: 'UTC',
    launchDate: '2026-07-14', profileConfirmed: true }));
  cpSync(join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/phase2/product.json'), join(cwd, '.launch/product.json'));
  const draft = join(cwd, '.launch/posts/fix-list.md');
  writeFileSync(draft, 'Keep this draft intact.');
  expect(() => registry(cwd)).toThrow(path);
  expect(() => registry(cwd)).toThrow('reserved site id fix-list');
  expect(() => checkPosts(cwd)).toThrow('reserved site id fix-list');
  expect(readFileSync(draft, 'utf8')).toBe('Keep this draft intact.');
});

it('preserves built-in MCP-before-env ordering and stages integration sites offline', async () => {
  const cwd = temp();
  expect((await adapterSelection('x', cwd, { BUFFER_API_KEY: 'fixture' })).reason).toBe('env:BUFFER_API_KEY');
  writeFileSync(join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { 'mcp-ayrshare': {} } }));
  expect((await adapterSelection('x', cwd, { POSTIZ_API_KEY: 'fixture' })).reason).toBe('mcp:mcp-ayrshare');
  for (const id of ['show-hn', 'reddit', 'product-hunt']) expect((await adapterSelection(id, cwd, { POSTIZ_API_KEY: 'fixture' })).adapter.name).toBe('manual');
  expect((await adapterSelection('email', cwd, {})).adapter.name).toBe('email');
  const custom = temp(); add(custom, { ...definition(), route: 'integration', adapters: ['buffer'] } as ReturnType<typeof definition>);
  expect((await adapterSelection('betalist', custom, { BUFFER_API_KEY: 'fixture' })).adapter.name).toBe('buffer');
  expect((await adapterSelection('betalist', custom, {})).adapter.name).toBe('manual');
  expect((await adapterSelection('blog', custom, {})).reason).toBe('manual');
});

it('validates config channels against the registry for the config cwd', async () => {
  const cwd = temp(); add(cwd);
  const path = join(cwd, '.launch/config.json');
  const config = { profile: 'devtool', launchType: 'new-product', channels: ['betalist', 'x'],
    timezone: 'UTC', launchDate: '2026-07-14', profileConfirmed: true };
  writeFileSync(path, JSON.stringify(config));
  expect(await validate(cwd, 'config')).toMatchObject({ valid: true, errors: [] });
  writeFileSync(path, JSON.stringify({ ...config, channels: ['typo', 'another-typo'] }));
  const invalid = await validate(cwd, 'config');
  expect(invalid.valid).toBe(false);
  expect(invalid.errors).toHaveLength(2);
  expect(invalid.errors[0]).toContain('Unknown channel: typo. Known ids:');
  expect(invalid.errors[0]).toContain('betalist');
  expect(invalid.errors[0]).toContain('x');
  expect(invalid.errors[1]).toContain('Unknown channel: another-typo. Known ids:');
  const result = cli(cwd, 'validate', 'config');
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command: 'validate',
    error: expect.stringContaining('Unknown channel: typo. Known ids:') });
  writeFileSync(path, JSON.stringify({ ...config, channels: [] }));
  expect(await validate(cwd, 'config')).toMatchObject({ valid: false });
});
