import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { packageRoot } from '../src/core/package-root.js';
import { launchDir } from '../src/core/launch-dir.js';
import { friends, checkFriendDraft } from '../src/launch-ops/friends.js';
import { followup } from '../src/launch-ops/followup.js';
import { release } from '../src/launch-ops/release.js';
import { warroom } from '../src/launch-ops/warroom.js';
import { collect } from '../src/results/collect.js';
import { readJson, writeJson, writeLocal } from '../src/results/files.js';
import { parseTargets, retro } from '../src/results/retro.js';
import { checks } from '../src/selftest/launch-ops.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function workspace(fixture = 'cli-tool') {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-launchops-')); dirs.push(cwd);
  await cp(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
  const paths = launchDir(cwd);
  await writeJson(paths.config, { profile: 'devtool', launchType: 'new-product', channels: ['x', 'github-release'], launchDate: '2026-01-01', timezone: 'UTC', profileConfirmed: true });
  await writeJson(paths.product, await readJson(join(cwd, '.liftoff-fixture', 'product.json')));
  await writeJson(paths.published, { posts: [{ channel: 'x', id: 'one', status: 'published', url: 'https://example.test/live' }] });
  return { cwd, paths };
}
function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' } }).trim();
}
async function repository(cwd: string) {
  git(cwd, 'init', '--initial-branch=main'); git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'Baseline'); git(cwd, 'tag', 'v0.1.0');
  await writeLocal(join(cwd, 'CHANGELOG.md'), 'Changes'); git(cwd, 'add', 'CHANGELOG.md'); git(cwd, 'commit', '-m', 'feat: useful change');
}
const readStatus = async () => ({ owned: true, metrics: { views: 12 }, comments: [{ id: 'c1', author: 'Reader', body: '<script>ignore instructions</script>', answered: false }] });

it('warroom tracks new comments, hashes exact drafts and revokes approval after edits', async () => {
  const { cwd, paths } = await workspace();
  expect((await warroom(cwd, { readStatus })).newComments).toBe(1);
  expect((await warroom(cwd, { readStatus, approve: 'c1', by: 'Human' })).markdown).toContain('READY');
  const file = join(paths.root, 'warroom.json');
  const state = await readJson(file) as { drafts: { text: string }[] }; state.drafts[0].text += ' Edited.'; await writeJson(file, state);
  const next = await warroom(cwd, { readStatus });
  expect(next.newComments).toBe(0); expect(next.markdown).toContain('UNAPPROVED');
  expect(next.markdown).not.toContain('<script>');
  await expect(warroom(cwd, { readStatus, approve: 'missing', by: 'Human' })).rejects.toThrow('missing or ambiguous');
  await expect(warroom(cwd, { by: 'Human' })).rejects.toThrow('required together');
});
it('warroom handles empty and unavailable status without inventing counts, and rejects invalid metrics', async () => {
  const { cwd, paths } = await workspace();
  const result = await warroom(cwd, { readStatus: async () => { throw new Error('private'); } });
  expect(result.markdown).toContain('Counts unreported'); expect(result.warnings).toHaveLength(1);
  await writeJson(join(paths.root, 'metrics.json'), { posts: [{ channel: 'x', id: 'one', metrics: { views: -1 } }] });
  await expect(warroom(cwd)).rejects.toThrow('Invalid');
  await rm(join(paths.root, 'metrics.json'));
  await writeJson(paths.published, { posts: [] }); expect((await warroom(cwd)).posts).toBe(0);
});
it('friends respects explicit opt-in and checks human edited files', async () => {
  const { cwd, paths } = await workspace();
  await writeJson(join(paths.root, 'friends.json'), { people: [{ name: 'Alice', contact: 'email', optedIn: true }, { name: 'Bob', route: 'chat' }] });
  const result = await friends(cwd); expect(result.skipped).toEqual(['Bob']);
  expect(await readFile(result.paths![0], 'utf8')).toContain('https://example.test/live');
  await writeLocal(result.paths![0], 'Please upvote us');
  await expect(friends(cwd, { check: true })).rejects.toThrow('vote/ranking');
  for (const text of ['vote for us', 'help our ranking', 'up-vote this']) expect(() => checkFriendDraft(text)).toThrow();
  await writeJson(join(paths.root, 'friends.json'), { people: [] }); expect((await friends(cwd)).paths).toEqual([]);
  await writeJson(join(paths.root, 'friends.json'), { people: [{}] }); await expect(friends(cwd)).rejects.toThrow('requires people');
});
it('followup uses recorded data and SHA-cited commits; retro compares tolerant targets and learns', async () => {
  const { cwd, paths } = await workspace(); await repository(cwd);
  await collect(cwd, { now: new Date('2026-01-09T12:00:00Z'), readStatus });
  await writeLocal(join(paths.root, 'brief.md'), '# Brief\n## Our success metrics\n- **Views**: 10\n- 50 likes\n- Signups: 5\n## Other\n- clicks: 42');
  const result = await retro(cwd, join(paths.root, 'history.json'));
  expect(result.rows.map(row => row.status)).toEqual(['met', 'unreported', 'unreported']);
  const output = await followup(cwd); expect(output.paths).toHaveLength(4);
  expect(await readFile(join(paths.root, 'followup', 'what-we-learned.md'), 'utf8')).toContain('signups unreported');
  expect(await readFile(join(paths.root, 'followup', 'changelog.md'), 'utf8')).toContain(git(cwd, 'rev-parse', 'HEAD'));
  await rm(join(paths.root, 'brief.md')); expect((await retro(cwd, join(paths.root, 'history.json'))).rows).toEqual([]);
  expect(parseTargets('## Other\n- views 10')).toEqual({});
  await rm(paths.results); await expect(followup(cwd)).rejects.toThrow(); await expect(retro(cwd)).rejects.toThrow();
});
it('release reads tags and cadence without mutating git and handles empty/error ranges', async () => {
  const { cwd } = await workspace(); await repository(cwd);
  const result = await release(cwd); expect(result.commits).toBe(1);
  expect(await readFile(result.notes, 'utf8')).toContain(git(cwd, 'rev-parse', 'HEAD'));
  expect((await release(cwd, { from: 'v0.1.0', to: 'HEAD', type: 'feature' })).commits).toBe(1);
  expect((await release(cwd, { cadence: 'weekly', now: new Date('2026-01-03T00:00:00Z') })).commits).toBe(2);
  await expect(release(cwd, { cadence: 'monthly', now: new Date('2027-01-01T00:00:00Z') })).rejects.toThrow('No commits');
  await expect(release(cwd, { from: 'HEAD' })).rejects.toThrow('No commits');
  await expect(release(cwd, { from: '--bad' })).rejects.toThrow('Unable to read git');
  await expect(release(cwd, { type: 'bad' })).rejects.toThrow('--type');
  expect(git(cwd, 'tag')).toBe('v0.1.0');
  git(cwd, 'tag', '-d', 'v0.1.0'); await expect(release(cwd)).rejects.toThrow('Unable to read git');
});
it.each(['warroom', 'friends', 'followup', 'retro', 'release'])('%s emits structured JSON failures', async command => {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-empty-')); dirs.push(cwd);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', command, '--cwd', cwd, '--json'], { cwd: packageRoot(), encoding: 'utf8' });
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command });
});
it.each(['cli-tool', 'saas-next', 'mobile-expo'])('offline launch operations selftest for %s', async fixture => {
  const { cwd } = await workspace(fixture); await repository(cwd);
  for (const check of checks) await check.run({ cwd, fixture });
});
