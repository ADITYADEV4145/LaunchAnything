import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { goFixture } from '../src/selftest/phaseF.js';
import { recommend } from '../src/recommend/index.js';
import { go } from '../src/go/run.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-go-recommend-')); temporary.push(cwd);
  return goFixture(cwd);
}

it('a Reddit draft omitted by recommend does not block scheduled channels in go', async () => {
  const { work, paths } = await fixture();
  const result = await recommend(work, { historyPath: join(work, 'history.json') });
  expect(result.skip.some(row => row.channel === 'reddit')).toBe(true);
  expect(await readFile(join(paths.posts, 'reddit.md'), 'utf8')).toContain('reddit');
  const preview = await go(work);
  expect('timeline' in preview && preview.timeline.map(row => row.channel)).not.toContain('reddit');
  const launched = await go(work, { confirm: true, mock: true, yes: true, noWait: true });
  expect('board' in launched && launched.board?.some(row => row.channel === 'show-hn' && row.status === 'live')).toBe(true);
  expect('board' in launched && launched.board?.some(row => row.channel === 'reddit')).toBe(false);
}, 30000);

it('a missing plan schedule row remains an error without recommendations', async () => {
  const { work, paths } = await fixture();
  await rm(join(paths.root, 'recommendations.md'));
  await writeFile(paths.plan, '| Channel | Local date | Local time |\n| --- | --- | --- |\n| show-hn | 2026-09-25 | 09:00 |\n');
  await expect(go(work)).rejects.toThrow('missing schedule row');
}, 30000);
