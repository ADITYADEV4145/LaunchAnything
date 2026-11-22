import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { packageRoot } from '../src/core/package-root.js';
import { launchDir } from '../src/core/launch-dir.js';
import { friends, checkFriendDraft } from '../src/launch-ops/friends.js';
import { followup } from '../src/launch-ops/followup.js';
import { release, releaseSince } from '../src/launch-ops/release.js';
import { warroom } from '../src/launch-ops/warroom.js';
import { collect } from '../src/results/collect.js';
import { readJson, writeJson, writeLocal } from '../src/results/files.js';
import { parseTargets, retro } from '../src/results/retro.js';
import { checks } from '../src/selftest/launch-ops.js';
import { affected, cleanTitle, clipScenes, closedIssuesInRange, draftPosts, judge, technical, relaunch, type Change } from '../src/launch-ops/release-kit.js';
import { progress, isoWeek } from '../src/launch-ops/progress.js';

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
it('warroom preserves edited and approved drafts until a comment is observed answered', async () => {
  const { cwd, paths } = await workspace();
  await warroom(cwd, { readStatus });
  const file = join(paths.root, 'warroom.json');
  const state = await readJson(file) as { drafts: { text: string }[] };
  state.drafts[0].text = 'A human-edited reply.';
  await writeJson(file, state);
  await warroom(cwd, { readStatus, approve: 'c1', by: 'Human' });
  const approved = await readJson(file);
  await writeJson(join(paths.root, 'metrics.json'), { posts: [{ channel: 'x', id: 'one', comments: [] }] });
  expect((await warroom(cwd, { readStatus })).markdown).toContain('READY');
  expect(await readJson(file)).toEqual(approved);
  await rm(join(paths.root, 'metrics.json'));
  expect((await warroom(cwd, { readStatus: async () => undefined })).markdown).toContain('A human-edited reply.');
  expect((await warroom(cwd, { readStatus })).markdown).toContain('READY');
  expect(await readJson(file)).toEqual(approved);
  await warroom(cwd, { readStatus: async () => ({ ...await readStatus(), comments: [{ ...((await readStatus()).comments[0]), answered: true }] }) });
  expect(await readJson(file)).toMatchObject({ drafts: [] });
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
  for (const text of ['vote for us', 'help our ranking', 'up-vote this', 'Please help by upvoting our HN post', 'Help improve our rankings', 'upvoted', 'downvoting', 'voting', 'ranked', 'ranks']) expect(() => checkFriendDraft(text)).toThrow();
  for (const text of ['frank', 'crankshaft']) expect(() => checkFriendDraft(text)).not.toThrow();
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
  expect(result.notes).toBe(join(cwd, '.launch', 'releases', git(cwd, 'rev-parse', '--short', 'HEAD'), 'notes.md'));
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
it('monthly release cadence clamps month ends and preserves the UTC time', () => {
  expect(releaseSince(new Date('2026-03-31T12:34:56Z'), 'monthly').toISOString()).toBe('2026-02-28T12:34:56.000Z');
  expect(releaseSince(new Date('2024-03-31T12:34:56Z'), 'monthly').toISOString()).toBe('2024-02-29T12:34:56.000Z');
  expect(releaseSince(new Date('2026-03-15T12:34:56Z'), 'monthly').toISOString()).toBe('2026-02-15T12:34:56.000Z');
  expect(releaseSince(new Date('2026-03-31T12:34:56Z'), 'weekly').toISOString()).toBe('2026-03-24T12:34:56.000Z');
});
it('scores user-noticeable changes, technical posts and relaunch substance deterministically', () => {
  expect(judge('feat: command help', ['bin/tool.js'], [12]).score).toBe(7);
  expect(judge('docs: typo', ['README.md']).score).toBe(0);
  expect(judge('chore: dependency', ['package.json']).score).toBe(0);
  expect(judge('fix: crash', []).score).toBe(4);
  expect(technical('indie-saas', [{ title: 'Updated copy', files: ['README.md'] }])).toBe(false);
  expect(technical('devtool', [])).toBe(true);
  expect(technical('indie-saas', [{ title: 'perf: query', files: [] }])).toBe(true);
  const change = { sha: 'abc', title: 'feat: help', body: '', files: ['bin/tool.js'], issues: [], ...judge('feat: help', ['bin/tool.js']) };
  expect(relaunch([]).ph).toBe(false);
  expect(relaunch(Array(5).fill(change)).ph).toBe(false);
  expect(relaunch(Array(6).fill(change))).toMatchObject({ ph: true, hn: false });
  expect(relaunch([...Array(5).fill(change), { ...change, title: 'perf: query 30% faster' }] as Change[]).hn).toBe(true);
});
it.each([
  ['feat(cli): clearer command help (#123)', 'Clearer command help'],
  ['fix!: prevent a crash (#7)', 'Prevent a crash'],
  ['perf(api)!: faster queries', 'Faster queries'],
  ['already useful copy', 'Already useful copy'],
  ['fix: échapper les caractères', 'Échapper les caractères'],
  ['', ''],
  ['feat: (#123)', ''],
])('cleans user-facing subject %j without git metadata', (raw, expected) => {
  expect(cleanTitle(raw)).toBe(expected);
});
it('uses cleaned selected titles in posts and clip scenes while preserving source subjects and hashes', async () => {
  const { paths } = await workspace();
  const changes: Change[] = [
    { sha: 'abc123', title: 'feat(cli)!: clearer command help (#123)', body: '', files: [], issues: [], score: 4, reasons: [] },
    { sha: 'def456', title: 'fix: prevent a crash (#124)', body: '', files: [], issues: [], score: 4, reasons: [] },
  ];
  await draftPosts(paths.root, ['email'], changes, c => `git show ${c.sha}`);
  const post = await readFile(join(paths.root, 'posts/email.md'), 'utf8');
  const [body, sources] = post.split('<!-- Sources');
  expect(body).toContain('Clearer command help');
  expect(body).toContain('Prevent a crash');
  expect(body).not.toMatch(/feat\(|fix:|\(#\d+\)/);
  expect(sources).toContain('feat(cli)!: clearer command help (#123) (abc123)');
  expect(sources).toContain('fix: prevent a crash (#124) (def456)');
  const scenes = clipScenes(['changed'], changes);
  expect(scenes).toHaveLength(6);
  expect(scenes.map(s => s.text)).toEqual(Array(3).fill(['Clearer command help', 'Prevent a crash']).flat());
  const longTitle = 'feat: one two three four five six seven eight nine ten (#9)';
  expect(clipScenes(['changed'], [{ title: longTitle }]).slice(0, 2).map(s => s.text)).toEqual(['One two three four five six seven eight', 'nine ten']);
  expect(clipScenes([], changes)).toEqual([]);
  expect(clipScenes(['changed'], [])).toEqual([]);
});
it('filters API issues by closure date inclusively, excluding PRs and updated-but-previously-closed issues', () => {
  const since = '2026-01-02T00:00:00Z', until = '2026-01-09T00:00:00Z';
  const issue = { number: 1, title: 'Command help', state: 'closed', closed_at: since };
  const issues = [
    issue,
    { ...issue, number: 2, closed_at: until },
    { ...issue, number: 3, closed_at: '2026-01-01T23:59:59Z', updated_at: until },
    { ...issue, number: 4, closed_at: '2026-01-09T00:00:01Z' },
    { ...issue, number: 5, pull_request: { url: 'https://api.github.com/repos/example/tool/pulls/5' } },
    { ...issue, number: 6, state: 'open' },
    { ...issue, number: 7, closed_at: null },
    { ...issue, number: 8, closed_at: 'invalid' },
    { number: 9, title: 'No closure date', state: 'closed' },
  ];
  expect(closedIssuesInRange(issues, since, until).map(i => i.number)).toEqual([1, 2]);
  expect(closedIssuesInRange([], since, until)).toEqual([]);
  expect(closedIssuesInRange(issues, 'invalid', until)).toEqual([]);
});
it('maps routes, explicit sources, global files and terminal changes without reshooting other screens', () => {
  expect(affected({ route: '/settings' }, ['src/app/settings/page.tsx'])).toBe(true);
  expect(affected({ route: '/' }, ['pages/index.tsx'])).toBe(true);
  expect(affected({ route: '/settings' }, ['pages/other.tsx'])).toBe(false);
  expect(affected({ route: '/settings' }, ['src/app/layout.tsx'])).toBe(true);
  expect(affected({ sources: ['src/settings/**'] }, ['src/settings/form.tsx'])).toBe(true);
  expect(affected({ sources: ['src/settings/*'] }, ['src/other.ts'])).toBe(false);
  expect(affected({ commands: ['node --version'] }, ['bin/tool.js'])).toBe(true);
  expect(affected({ commands: ['node --version'] }, ['docs/tool.md'])).toBe(false);
});
it('writes weekly drafts with no invented screenshot, one latest real image, and deterministic date errors', async () => {
  const { cwd, paths } = await workspace(); await repository(cwd);
  const options = { now: '2026-01-03T00:00:00Z' };
  const empty = await progress(cwd, options);
  expect(empty.image).toBeUndefined();
  expect(await readFile(join(empty.folder, 'progress.md'), 'utf8')).toContain('image skipped');
  await writeLocal(join(paths.media, 'shots', 'real.png'), 'actual fixture capture');
  const withImage = await progress(cwd, options);
  expect(withImage.image).toBe('real.png');
  expect(await readFile(join(withImage.folder, 'media/real.png'), 'utf8')).toBe('actual fixture capture');
  expect((await progress(cwd, { now: '2027-01-01' })).commits).toBe(0);
  expect(isoWeek(new Date('2027-01-01'))).toBe('2026-W53');
  await expect(progress(cwd, { now: 'bad' })).rejects.toThrow('Invalid');
});
it('honors release channel overrides, no-shots and offline issue input with empty-post fallback', async () => {
  const { cwd, paths } = await workspace(); await repository(cwd);
  const config = await readJson(paths.config) as Record<string, unknown>;
  await writeJson(paths.config, { ...config, releaseChannels: ['email'] });
  const issues = join(cwd, 'issues.json'); await writeJson(issues, [{ number: 5, title: 'Fix command help', state: 'closed', html_url: 'https://github.com/example/tool/issues/5' }, { number: 6, title: 'Offline issue without URL' }]);
  const kit = await release(cwd, { issues, shots: false });
  expect(kit.channels).toEqual(['email']);
  expect(await readFile(join(kit.notes, '../github-release.md'), 'utf8')).toContain('Fix command help');
  for (const file of ['changelog.md', 'github-release.md']) {
    const notes = await readFile(join(kit.notes, '..', file), 'utf8');
    expect(notes).toContain('[#5](https://github.com/example/tool/issues/5): Fix command help');
    expect(notes).toContain('#6: Offline issue without URL');
    expect(notes).toContain(`feat: useful change (git show ${git(cwd, 'rev-parse', 'HEAD')})`);
  }
  await writeJson(issues, {}); await expect(release(cwd, { issues })).rejects.toThrow('--issues');
  await expect(release(cwd, { openPr: true })).rejects.toThrow('requires --draft');
  await writeLocal(join(cwd, 'docs.md'), 'Internal docs'); git(cwd, 'add', 'docs.md'); git(cwd, 'commit', '-m', 'docs: internal notes');
  const quiet = await release(cwd, { from: 'HEAD^' }); expect(quiet.channels).toEqual([]);
  expect(await readFile(join(quiet.notes, '../selection.json'), 'utf8')).toContain('No posts recommended');
});
it('release uses the exact target tag rather than the requested ref label', async () => {
  const { cwd } = await workspace(); await repository(cwd);
  git(cwd, 'tag', 'v0.2.0');
  const tagged = await release(cwd, { from: 'v0.1.0', to: 'HEAD' });
  expect(tagged.notes).toBe(join(cwd, '.launch', 'releases', 'v0-2-0', 'notes.md'));
  await writeLocal(join(cwd, 'CHANGELOG.md'), 'More changes');
  git(cwd, 'add', 'CHANGELOG.md'); git(cwd, 'commit', '-m', 'fix: another change');
  const untagged = await release(cwd);
  expect(untagged.notes).toBe(join(cwd, '.launch', 'releases', git(cwd, 'rev-parse', '--short', 'HEAD'), 'notes.md'));
  expect(untagged.notes).not.toBe(tagged.notes);
  expect((await release(cwd, { from: 'v0.1.0', to: 'v0.2.0' })).notes).toBe(tagged.notes);
});
it.each(['warroom', 'friends', 'followup', 'retro', 'release'])('%s emits structured JSON failures', async command => {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-empty-')); dirs.push(cwd);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', command, '--cwd', cwd, '--json'], { cwd: packageRoot(), encoding: 'utf8' });
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command });
});
it.each(['cli-tool', 'saas-next', 'mobile-expo'])('offline launch operations selftest for %s', async fixture => {
  const { cwd } = await workspace(fixture); await repository(cwd);
  for (const check of checks) await check.run({ cwd, fixture });
}, 120000);
