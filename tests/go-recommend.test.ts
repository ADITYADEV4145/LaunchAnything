import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { goFixture } from '../src/selftest/phaseF.js';
import { recommend } from '../src/recommend/index.js';
import { go } from '../src/go/run.js';
import { mockAdapter } from '../src/go/adapters.js';
import { groundworkGoFixture } from '../src/selftest/groundwork-go.js';

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

it('dry run holds owned follow-ups without a live receipt of the first big post', async () => {
  const { work } = await fixture();
  const result = await go(work);
  if (result.mode !== 'dry-run') throw new Error('Expected preview');
  expect(result.timeline.filter(row => ['x', 'github-release'].includes(row.channel)).every(row => row.status === 'held')).toBe(true);
  expect(result.timeline.find(row => row.channel === 'show-hn')?.status).toBe('queued');
}, 30000);

it('failed first big submission holds owned slots even when another big channel succeeds', async () => {
  const { work, paths } = await fixture();
  const mock = mockAdapter();
  const publish = vi.fn(async (context: Parameters<typeof mock.publish>[0]) => {
    if (context.post.channel === 'show-hn') throw new Error('Founder did not submit');
    return mock.publish(context);
  });
  const result = await go(work, { confirm: true, mock: true, yes: true, noWait: true, adapter: { publish } });
  expect(publish.mock.calls.map(([context]) => context.post.channel)).not.toContain('x');
  expect(publish.mock.calls.map(([context]) => context.post.channel)).not.toContain('github-release');
  expect('board' in result && result.board?.filter(row => ['x', 'github-release'].includes(row.channel)).every(row => row.status === 'held')).toBe(true);
  expect('board' in result && result.board?.some(row => row.channel === 'devto' && row.status === 'live')).toBe(true);
  const receipts = JSON.parse(await readFile(paths.published, 'utf8')).posts;
  expect(receipts.some((row: { channel: string }) => ['x', 'github-release'].includes(row.channel))).toBe(false);
}, 30000);

it('owned dispatch waits for the persisted first-big receipt and resumes on a later run', async () => {
  const { work, paths } = await fixture();
  const mock = mockAdapter();
  await go(work, { confirm: true, mock: true, yes: true, noWait: true, adapter: { async publish(context) {
    if (['x', 'github-release'].includes(context.post.channel)) {
      const receipts = JSON.parse(await readFile(join(paths.root, 'published.mock.json'), 'utf8')).posts;
      expect(receipts.some((row: { channel: string; status: string; url?: string }) => row.channel === 'show-hn' && row.status === 'published' && row.url)).toBe(true);
    }
    return mock.publish(context);
  } } });
  const preview = await go(work, { mock: true });
  expect('timeline' in preview && preview.timeline.filter(row => ['x', 'github-release'].includes(row.channel)).every(row => row.status === 'queued')).toBe(true);
}, 30000);

it('email is held with other owned channels when the first PH slot has no receipt', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-go-email-')); temporary.push(cwd);
  const { work } = await groundworkGoFixture(cwd);
  const mock = mockAdapter();
  const publish = vi.fn(async (context: Parameters<typeof mock.publish>[0]) => {
    if (context.post.channel === 'product-hunt') throw new Error('No PH receipt');
    return mock.publish(context);
  });
  const result = await go(work, { confirm: true, mock: true, yes: true, noWait: true, phSubmit: true, adapter: { publish } });
  expect(publish.mock.calls.some(([context]) => context.post.channel === 'email')).toBe(false);
  expect('board' in result && result.board?.find(row => row.channel === 'email')).toMatchObject({ status: 'held', reason: 'Waiting for a live receipt of product-hunt' });
}, 30000);
