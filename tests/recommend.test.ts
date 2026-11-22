import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { groundworkRecommendGate } from '../src/selftest/phaseB.js';
import { groundworkGoFixture } from '../src/selftest/groundwork-go.js';
import { recommend, chooseAngle } from '../src/recommend/index.js';
import { displayTime, parseSchedule } from '../src/go/schedule.js';
import { scoreEvidence } from '../src/communities/index.js';
import type { Evidence } from '../src/communities/adapters.js';

describe('recommend', () => {
  it('uses community observed hours and cites rules, reach and account requirements', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'recommend-'));
    try {
      const { work, paths, timezone } = await groundworkGoFixture(cwd);
      const evidence = JSON.parse(await readFile(resolve('fixtures/cli-tool/.liftoff-fixture/communities-evidence.json'), 'utf8')) as Evidence[];
      const sub = scoreEvidence(evidence[0], ['pain tracking'], [], {}, timezone);
      await writeFile(join(paths.root, 'communities.json'), JSON.stringify({ subreddits: [sub], recommended: [sub.subreddit], plan: [], threads: [], other: [] }));
      const result = await recommend(work, { historyPath: join(work, 'history.json') });
      const reddit = result.channels.find(row => row.channel === 'reddit')!;
      expect(reddit.time).toBe(sub.bestHours[0].split(' ')[0]);
      expect(reddit.why).toContain(`${sub.painMentions} pain mentions`);
      expect(reddit.why).toContain(sub.rulesUrl);
      expect(reddit.why).toContain(`${sub.activity.subscribers} members`);
      sub.eligibility = 'fails';
      await writeFile(join(paths.root, 'communities.json'), JSON.stringify({ subreddits: [sub], recommended: [sub.subreddit], plan: [], threads: [], other: [] }));
      expect((await recommend(work, { historyPath: join(work, 'history.json') })).channels.some(row => row.channel === 'reddit')).toBe(false);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);
  it('passes the GroundWork top-five, sequencing and learned observation gate', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'recommend-'));
    try { await groundworkRecommendGate(cwd); } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);
  it('handles empty evidence, missing eligibility, offline PH and adapter errors deterministically', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'recommend-'));
    try {
      const { work, paths } = await groundworkGoFixture(cwd);
      const historyPath = join(work, 'no-history.json');
      const first = await recommend(work, { historyPath });
      expect(first.skip.some(row => row.channel === 'reddit')).toBe(true);
      expect(first.markdown).toContain('unverified, check via PH MCP');
      expect((await recommend(work, { historyPath, productHunt: { async openDates() { throw new Error('offline'); } } })).markdown).toBe(first.markdown);
      expect((await recommend(work, { historyPath })).markdown).toBe(first.markdown);
      await writeFile(join(paths.root, 'communities.json'), '{bad json');
      await expect(recommend(work, { historyPath })).rejects.toThrow();
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);
  it('converts source windows across DST and respects verified PH dates', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'recommend-'));
    try {
      const { work, paths } = await groundworkGoFixture(cwd);
      const config = JSON.parse(await readFile(paths.config, 'utf8'));
      for (const [date, expected] of [['2026-01-06', '08:01'], ['2026-07-07', '07:01']]) {
        await writeFile(paths.config, JSON.stringify({ ...config, channels: ['product-hunt'], launchDate: date, timezone: 'UTC' }));
        const result = await recommend(work, { historyPath: join(work, 'history.json'), productHunt: { async openDates() { return { dates: [date], source: 'PH MCP fixture' }; } } });
        expect(result.channels[0].time).toBe(expected);
        expect(displayTime(parseSchedule(result.markdown, 'UTC')[0].scheduledAt, 'America/Los_Angeles').slice(11)).toBe('00:01');
      }
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);
  it('returns structured CLI JSON without sending anything', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'recommend-'));
    try {
      const { work } = await groundworkGoFixture(cwd);
      const output = execFileSync(process.execPath, ['--import', 'tsx', resolve('src/cli.ts'), '--cwd', work, 'recommend', '--history', join(work, 'history.json'), '--json'], { encoding: 'utf8', timeout: 30000 });
      expect(JSON.parse(output).data.markdown).toContain('| Channel | Local date | Local time |');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30000);
  it('uses only recorded inputs for angle selection', () => {
    const product = { audience: { who: 'developers' }, problem: { summary: 'source lookup' } };
    expect(chooseAngle('show-hn', product).angle).toBe('build story');
    expect(chooseAngle('reddit', product).angle).toBe('pain story');
    expect(chooseAngle('devto', product).angle).toBe('technical deep dive');
    expect(chooseAngle('indie-hackers', { ...product, competitors: [{ name: 'tool', dislikes: ['opaque state'] }] }).angle).toBe('contrarian take');
    expect(chooseAngle('x', { ...product, money_moment: { before: 'before', action: 'run', after: 'after' } }).angle).toBe('before/after demo');
  });
});
