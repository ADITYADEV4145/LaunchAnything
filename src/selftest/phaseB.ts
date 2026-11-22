import { deepEqual, equal, match, notEqual, ok } from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { groundworkGoFixture } from './groundwork-go.js';
import { recommend } from '../recommend/index.js';
import { parseSchedule } from '../go/schedule.js';
import { collect } from '../results/collect.js';
import { learn } from '../results/history.js';
import type { Check } from './types.js';
import { packageRoot } from '../core/package-root.js';
import { loadRule } from '../core/rules.js';
import { reportCommunities, type Report } from '../communities/index.js';
import type { Evidence } from '../communities/adapters.js';

export async function groundworkRecommendFixture(cwd: string) {
  const fixture = await groundworkGoFixture(cwd), { work, paths } = fixture;
  const source = join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture');
  await mkdir(join(paths.root, 'research'), { recursive: true });
  await cp(join(source, 'groundwork-community-pains.json'), join(paths.root, 'research/pains.json'));
  const evidence = JSON.parse(await readFile(join(source, 'communities-evidence.json'), 'utf8')) as Evidence[];
  const raw = join(paths.root, 'communities/raw/reddit');
  await mkdir(raw, { recursive: true });
  for (const item of evidence) await writeFile(join(raw, item.subreddit + '.json'), JSON.stringify(item));
  const checked = await reportCommunities(work);
  ok(checked.valid, checked.errors.join('; '));
  const report = JSON.parse(await readFile(join(paths.root, 'communities.json'), 'utf8')) as Report;
  ok(report.subreddits.some(sub => sub.painMentions > 0), 'Part E fixture must provide pain evidence');
  return fixture;
}

function assertGroundworkSchedule(result: Awaited<ReturnType<typeof recommend>>, timezone: string) {
  const slots = parseSchedule(result.markdown, timezone);
  equal(slots.length, result.channels.length);
  ok(slots.every(slot => slot.local.endsWith(timezone)));
  equal(new Set(result.channels.map(row => row.date + ' ' + row.time.slice(0, 2))).size, result.channels.length,
    'Every channel needs its own local response hour');
  const big = result.channels.filter(row => !['x', 'email', 'blog', 'github-release'].includes(row.channel));
  const firstBig = Math.min(...big.map(row => Date.parse(row.instant)));
  ok(result.channels.filter(row => ['x', 'email', 'blog', 'github-release'].includes(row.channel))
    .every(row => Date.parse(row.instant) >= firstBig + 3600000), 'Owned slots must follow the first big slot by at least one hour');
}

export async function groundworkRecommendGate(cwd: string) {
  const { work, paths, timezone } = await groundworkRecommendFixture(cwd);
  const historyPath = join(work, 'recommend-history.json');
  const first = await recommend(work, { historyPath });
  ok(first.channels.length >= 5);
  deepEqual(first.channels.slice(0, 5).map(row => row.channel), ['show-hn', 'devto', 'reddit', 'x', 'github-release']);
  for (const row of first.channels.slice(0, 5)) {
    const rule = loadRule('channels', row.channel, work);
    ok(row.why.includes(`rules/channels/${row.channel}.yaml:`));
    ok((rule.profiles as string[]).includes('devtool'));
    match(row.why, /pains\.json: \d+ pain clusters|communities\.json r\/\w+: \d+ pain mentions|rules\/channels\/[\w-]+\.yaml:/);
  }
  ok(first.channels.find(row => row.channel === 'reddit')!.scoring.citedSources > 0);
  assertGroundworkSchedule(first, timezone);
  await writeFile(paths.published, JSON.stringify({ posts: [{ channel: 'x', id: 'recommend-history', status: 'published', scheduledAt: '2026-12-01T22:00:00Z' }] }));
  await collect(work, { now: new Date('2026-12-02T22:00:00Z'), readStatus: async () => ({ metrics: { clicks: 1 } }) });
  const learned = await learn(work, historyPath);
  const second = await recommend(work, { historyPath });
  assertGroundworkSchedule(second, timezone);
  notEqual(second.channels.find(row => row.channel === 'x')?.time, first.channels.find(row => row.channel === 'x')?.time);
  ok(second.markdown.includes(learned.observations.find(row => row.channel === 'x')!.lesson));
  return { first, second, work };
}
export const checks: Check[] = [{ name: 'Part B GroundWork data-grounded top five, founder timezone and learned time choice', async run({ cwd }) {
  const { second } = await groundworkRecommendGate(cwd);
  // Optional evidence directory is supplied by the caller, never a source fixture.
  if (process.env.LIFTOFF_SELFTEST_EVIDENCE) {
    await mkdir(process.env.LIFTOFF_SELFTEST_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.LIFTOFF_SELFTEST_EVIDENCE, 'groundwork-recommendations.md'), second.markdown);
  }
} }];
