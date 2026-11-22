import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { equal, ok } from 'node:assert/strict';
import { packageRoot } from '../core/package-root.js';
import { launchDir } from '../core/launch-dir.js';
import { criteria, judgeKeys } from '../copy/judge.js';
import { go } from '../go/run.js';
import type { Check } from './types.js';
import { groundworkGoGate } from './groundwork-go.js';

export async function goFixture(cwd: string) {
  const work = join(cwd, '.liftoff-fixture', 'phaseF'), paths = launchDir(work);
  const base = join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/phase2');
  const channels = ['show-hn', 'reddit', 'x', 'devto', 'github-release'];
  await mkdir(join(paths.posts, 'judge'), { recursive: true });
  await mkdir(paths.media, { recursive: true });
  await writeFile(join(paths.media, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await cp(join(base, 'product.json'), paths.product);
  await writeFile(paths.config, JSON.stringify({ profile: 'devtool', launchType: 'new-product', profileConfirmed: true,
    channels, launchDate: '2026-09-25', timezone: 'America/New_York' }));
  for (const channel of channels) {
    const source = (await readFile(join(base, 'good', channel + '.md'), 'utf8')).replace('media: [{ slot: hero }]', 'media: [{ slot: hero, path: media/fixture.svg }]');
    await writeFile(join(paths.posts, channel + '.md'), source);
    await writeFile(join(paths.posts, 'judge', channel + '.scores.json'), JSON.stringify({ ...judgeKeys(work, channel),
      judge: 'Part F deterministic fixture reviewer', scores: Object.fromEntries(criteria.map(key => [key, 9])), reasons: [] }));
  }
  await writeFile(join(paths.root, 'recommendations.md'), '| Local time | Channel | Local date |\n| --- | --- | --- |\n' +
    channels.map((channel, i) => `| 09:0${i} | ${channel} | 2026-09-25 |`).join('\n') + '\n');
  return { work, paths, channels };
}

export const checks: Check[] = [{ name: 'Part F timezone timeline and mock one-go publishing', async run({ cwd }) {
  const { work, paths, channels } = await goFixture(cwd);
  const preview = await go(work);
  equal(preview.mode, 'dry-run');
  if (preview.mode !== 'dry-run') throw new Error('Expected preview');
  equal(preview.timeline.length, channels.length);
  ok(preview.timeline.every(row => row.at.includes('America/New_York')));
  const result = await go(work, { confirm: true, mock: true, yes: true, noWait: true });
  if (!('board' in result) || !result.board) throw new Error('Missing board');
  ok(result.board.every(row => row.status === 'live'));
  equal(JSON.parse(await readFile(paths.published, 'utf8')).posts.length, channels.length);
  const center = await readFile(join(paths.root, 'warroom.md'), 'utf8');
  ok(channels.every(channel => center.includes(channel)));
} }, { name: 'Part F GroundWork all-route mock publishing, manual Submit and Chicago timeline', async run({ cwd }) {
  await groundworkGoGate(cwd);
} }];
