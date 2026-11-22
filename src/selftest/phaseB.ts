import { equal, match, notEqual, ok } from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { groundworkGoFixture } from './groundwork-go.js';
import { recommend } from '../recommend/index.js';
import { parseSchedule } from '../go/schedule.js';
import { collect } from '../results/collect.js';
import { learn } from '../results/history.js';
import type { Check } from './types.js';

export async function groundworkRecommendGate(cwd: string) {
  const { work, paths, timezone } = await groundworkGoFixture(cwd);
  const historyPath = join(work, 'recommend-history.json');
  const first = await recommend(work, { historyPath });
  ok(first.channels.length >= 5);
  for (const row of first.channels.slice(0, 5)) match(row.why, /rules\/channels\/.*\.yaml|pains.json:|communities.json r\//);
  const slots = parseSchedule(first.markdown, timezone);
  equal(slots.length, first.channels.length);
  ok(slots.every(slot => slot.local.endsWith(timezone)));
  const big = first.channels.filter(row => !['x', 'email', 'blog', 'github-release'].includes(row.channel));
  equal(new Set(big.map(row => row.date + ' ' + row.time.slice(0, 2))).size, big.length);
  const firstBig = big.map(row => row.instant).sort()[0];
  ok(first.channels.filter(row => ['x', 'email', 'github-release'].includes(row.channel)).every(row => row.instant > firstBig));
  await writeFile(paths.published, JSON.stringify({ posts: [{ channel: 'x', id: 'recommend-history', status: 'published', scheduledAt: '2026-12-01T22:00:00Z' }] }));
  await collect(work, { now: new Date('2026-12-02T22:00:00Z'), readStatus: async () => ({ metrics: { clicks: 1 } }) });
  const learned = await learn(work, historyPath);
  const second = await recommend(work, { historyPath });
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
