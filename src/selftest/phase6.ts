import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { plan } from '../planning/plan.js';
import { collect } from '../results/collect.js';
import { readJson, writeJson } from '../results/files.js';
import { learn } from '../results/history.js';
import { manualObservations, postKey, type PublishedPost } from '../results/metrics.js';
import { receipt } from '../results/receipt.js';
import type { Check } from './types.js';

export const checks: Check[] = [{
  name: 'recorded metrics produce a report, local replies, receipt and a changed second plan',
  async run({ cwd }) {
    const fixtures = join(cwd, '.liftoff-fixture');
    const workspace = join(fixtures, 'phase6-work');
    const paths = launchDir(workspace);
    const { profile, allowedChannels } = await readJson(join(fixtures, 'expected.json')) as {
      profile: string; allowedChannels: string[];
    };
    const launchDate = '2026-01-06';
    await writeJson(paths.config, {
      profile, channels: ['x', ...allowedChannels.filter(channel => channel !== 'x')],
      launchType: 'new-product', timezone: 'America/Chicago', launchDate, profileConfirmed: true,
    });
    const historyPath = join(workspace, 'history.json');
    const first = await plan(workspace, { historyPath });
    assert.equal(first.channels.find(channel => channel.id === 'x')?.time, '09:00');
    const posts: PublishedPost[] = [{ channel: 'x', id: 'fixture-x', status: 'published', scheduledAt: '2026-01-06T22:00:00Z' }];
    await writeJson(paths.published, { posts });
    const recordings = manualObservations(await readJson(join(fixtures, 'phase6-metrics.json')), posts);
    const readStatus = async (post: PublishedPost) => recordings.get(postKey(post.channel, post.id));
    for (const [day, checkpoint] of [[7, 'T+1'], [9, 'T+3'], [13, 'T+7'], [36, 'T+30']] as const) {
      const result = await collect(workspace, {
        now: new Date(Date.UTC(2026, 0, day, 22)), readStatus, replies: true,
      });
      assert.equal(result.checkpoint, checkpoint);
      assert.deepEqual(await readJson(result.snapshot), result.results);
      assert.equal(result.results.channels.find(row => row.channel === 'x')?.views, recordings.get(postKey('x', 'fixture-x'))?.metrics?.views);
      assert.equal(result.replies?.count, 1);
    }
    const report = await readFile(paths.report, 'utf8');
    assert.match(report, /Lessons \(observations, not causal claims\)/);
    assert.match(report, /Fixture reader/);
    assert.doesNotMatch(await readFile(join(paths.root, 'replies.md'), 'utf8'), /Answered fixture comment/);
    const learned = await learn(workspace, historyPath);
    const lesson = learned.observations.find(observation => observation.channel === 'x');
    assert.equal(lesson?.bestHour, 16);
    assert.ok(await readJson(historyPath));
    const second = await plan(workspace, { historyPath });
    assert.equal(second.channels.find(channel => channel.id === 'x')?.time, '16:00');
    assert.ok(second.markdown.includes(`time changed to 16:00 based on observation: ${lesson!.lesson.slice(0, 240)}`));
    const image = await receipt(workspace, false);
    assert.doesNotMatch(await readFile(image.path, 'utf8'), /launched with Liftoff/);
  },
}];
