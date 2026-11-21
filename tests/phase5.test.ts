import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it } from 'vitest';
import { getAdapter, selectAdapter } from '../src/adapters/index.js';
import { publish } from '../src/adapters/publish.js';
import { launchDir } from '../src/core/launch-dir.js';
import { packageRoot } from '../src/core/package-root.js';
import { buildReview } from '../src/review/page.js';
import { selftest } from '../src/selftest/index.js';

const temp: string[] = [];
afterEach(async () => {
  await Promise.all(temp.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function project(enterprise = false) {
  const cwd = await mkdtemp(join(tmpdir(), 'liftoff-phase5-'));
  temp.push(cwd);
  const paths = launchDir(cwd);
  await mkdir(paths.posts, { recursive: true });
  await writeFile(paths.config, JSON.stringify({
    profile: enterprise ? 'enterprise' : 'devtool',
    launchType: 'new-product', channels: ['show-hn'], launchDate: '2026-07-14',
    timezone: 'America/New_York', profileConfirmed: true,
    approvers: enterprise ? [{ name: 'Owner' }, { name: 'Counsel', role: 'legal-review' }] : [],
  }));
  await writeFile(paths.plan, '| Channel | Local date | Local time | Why | Preparation lead time |\n' +
    '| --- | --- | --- | --- | --- |\n| show-hn | 2026-07-15 | 14:30 | Demo | 1 day(s) |\n');
  const markdown = '---\ntitle: A local launch\nmedia: []\nclaims: []\n---\n</script><script>Bad input</script>\n';
  await writeFile(join(paths.posts, 'show-hn.md'), markdown);
  return { cwd, paths, markdown };
}

const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), ...args, '--cwd', cwd, '--json'], { encoding: 'utf8' });

it('builds a review page and defaults the CLI to an approval-gated dry run', async () => {
  const { cwd, paths } = await project();
  const review = cli(cwd, 'review');
  expect(review.status, review.stderr).toBe(0);
  const data = JSON.parse(review.stdout).data;
  expect(data.posts[0].scheduledAt).toBe('2026-07-15T18:30:00.000Z');
  const html = await readFile(data.path, 'utf8');
  expect(html).toContain('&lt;/script&gt;&lt;script&gt;Bad input');
  expect(html).not.toContain('</script><script>Bad input');
  expect(cli(cwd, 'publish').status).toBe(1);
  expect(cli(cwd, 'publish', '--confirm', '--dry-run').status).toBe(1);
  await writeFile(paths.approvals, JSON.stringify({ approvals: [{
    channel: 'show-hn', hash: data.posts[0].hash, name: 'Reviewer', time: '2026-07-13T09:00:00Z',
  }] }));
  const preview = cli(cwd, 'publish');
  expect(preview.status, preview.stderr).toBe(0);
  expect(JSON.parse(preview.stdout).data).toMatchObject({ mode: 'dry-run', posts: [{
    channel: 'show-hn', adapter: 'manual', submitUrl: 'https://news.ycombinator.com/submit',
    scheduledAt: '2026-07-15T18:30:00.000Z',
  }] });
  await expect(readFile(paths.published)).rejects.toMatchObject({ code: 'ENOENT' });
});

function reviewTab(cwd: string, html: string, reviewer: string, openWriter = localWriter) {
  const snapshot = html.match(/<script id="snapshot" type="application\/json">([^<]+)<\/script>/)![1];
  const script = html.match(/<script>([\s\S]+)<\/script><\/html>/)![1];
  const feedback = { textContent: '' };
  const state = { textContent: '' };
  const input = { value: '', focus() {} };
  const editor = { hidden: true, querySelector: () => input };
  const actions: Record<string, () => Promise<void>> = {};
  const buttons = ['approve', 'skip', 'edit', 'save'].map(action => ({
    dataset: { action },
    addEventListener(_event: string, listener: () => Promise<void>) { actions[action] = listener; },
  }));
  const article = {
    dataset: { channel: 'show-hn' },
    querySelector: (selector: string) => ({ '.feedback': feedback, '.state': state, '.edit': editor })[selector],
    querySelectorAll: () => buttons,
  };
  const selector = { value: reviewer };
  function directory(dir: string) {
    return {
      async getDirectoryHandle(name: string) { return directory(join(dir, name)); },
      async getFileHandle(name: string, options?: { create: boolean }) {
        const filename = join(dir, name);
        if (options?.create) await writeFile(filename, '', { flag: 'wx' }).catch(error => {
          if (error.code !== 'EEXIST') throw error;
        });
        return {
          async getFile() { return { text: () => readFile(filename, 'utf8').catch(error => {
            if (error.code === 'ENOENT') error.name = 'NotFoundError';
            throw error;
          }) }; },
          createWritable: (options?: { mode: string }) => openWriter(filename, options),
        };
      },
    };
  }
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => id === 'snapshot' ? { textContent: snapshot } : selector,
      querySelectorAll: () => [article],
    },
    window: { showDirectoryPicker: async () => directory(cwd) },
    setTimeout,
  });
  return { actions, feedback, input, selector, state };
}

async function localWriter(filename: string, _options?: { mode: string }) {
  return { write: (content: string) => writeFile(filename, content), async close() {}, async abort() {} };
}

it('records named approvals, skips, and edits through the page script', async () => {
  const { cwd, paths, markdown } = await project(true);
  const { path, posts } = await buildReview(cwd);
  const html = await readFile(path, 'utf8');
  const { actions, feedback, input, selector, state } = reviewTab(cwd, html, '0');
  await actions.approve();
  expect(feedback.textContent).toContain('Still needed: Counsel');
  await expect(publish(cwd, true)).rejects.toThrow('Counsel (legal-review)');
  selector.value = '1';
  await actions.approve();
  expect(state.textContent).toBe('Approved');
  expect(JSON.parse(await readFile(paths.approvals, 'utf8')).approvals).toMatchObject([
    { name: 'Owner', hash: posts[0].hash }, { name: 'Counsel', role: 'legal-review', hash: posts[0].hash },
  ]);
  await actions.skip();
  expect((await publish(cwd)).skipped).toEqual(['show-hn']);
  await actions.approve();
  expect((await publish(cwd)).skipped).toEqual([]);
  await actions.edit();
  expect(input.value).toBe(markdown);
  input.value = markdown.replace('local launch', 'new launch');
  await actions.save();
  expect(await readFile(join(paths.posts, 'show-hn.md'), 'utf8')).toBe(input.value);
  expect(state.textContent).toBe('Edited');
  await expect(publish(cwd, true)).rejects.toThrow('exact post and media hash not approved');
});

it('merges approvals when two tabs overlap before the first write commits', async () => {
  const { cwd, paths } = await project(true);
  const { path, posts } = await buildReview(cwd);
  const html = await readFile(path, 'utf8');
  await writeFile(paths.approvals, '{"approvals":[]}');
  const firstWriting = Promise.withResolvers<void>();
  const secondOpening = Promise.withResolvers<void>();
  let attempts = 0;
  let locked = false;
  async function openWriter(filename: string, options?: { mode: string }) {
    const attempt = ++attempts;
    if (attempt === 2) secondOpening.resolve();
    const exclusive = options?.mode === 'exclusive';
    if (exclusive && locked) throw new DOMException('Writer already open', 'NoModificationAllowedError');
    if (exclusive) locked = true;
    const writer = await localWriter(filename);
    return {
      async write(content: string) {
        if (attempt === 1) {
          firstWriting.resolve();
          await secondOpening.promise;
        }
        await writer.write(content);
      },
      async close() { if (exclusive) locked = false; },
      async abort() { if (exclusive) locked = false; },
    };
  }
  const owner = reviewTab(cwd, html, '0', openWriter);
  const counsel = reviewTab(cwd, html, '1', openWriter);
  const ownerApproval = owner.actions.approve();
  await firstWriting.promise;
  await Promise.all([ownerApproval, counsel.actions.approve()]);
  expect(JSON.parse(await readFile(paths.approvals, 'utf8')).approvals).toMatchObject([
    { name: 'Owner', hash: posts[0].hash }, { name: 'Counsel', role: 'legal-review', hash: posts[0].hash },
  ]);
  expect(counsel.state.textContent).toBe('Approved');
});

it('resolves local receipt adapters for phase 6 and makes cancellation visible to status', async () => {
  const { cwd, paths } = await project();
  await writeFile(join(cwd, '.mcp.json'), '{"mcpServers":{"devto":{},"buffer":{}}}');
  expect((await selectAdapter('devto', cwd, {})).name).toBe('devto');
  expect((await selectAdapter('x', cwd, { AYRSHARE_API_KEY: 'mock' })).name).toBe('buffer');
  expect((await selectAdapter('reddit', cwd, { AYRSHARE_API_KEY: 'mock' })).name).toBe('manual');
  expect((await selectAdapter('email', cwd, {})).name).toBe('email');
  const record = { channel: 'x', id: 'buffer:x:fixture', status: 'manual' };
  await writeFile(paths.published, JSON.stringify({ posts: [record] }));
  const adapter = getAdapter(record.channel, record.id);
  expect(adapter.name).toBe('buffer');
  await expect(adapter.status(record.channel, record.id, cwd)).resolves.toEqual({ status: 'manual' });
  await expect(adapter.status(record.channel, 'missing', cwd)).resolves.toBeUndefined();
  await expect(adapter.cancel(record.channel, record.id, cwd)).resolves.toEqual({ status: 'cancelled' });
  await expect(adapter.status(record.channel, record.id, cwd)).resolves.toEqual({ status: 'cancelled' });
});

it('retains skipped and previous-version receipts across confirmed publishes without duplicating an ID', async () => {
  const { cwd, paths, markdown } = await project();
  async function approve() {
    const { posts: [{ channel, hash }] } = await buildReview(cwd);
    await writeFile(paths.approvals, JSON.stringify({ approvals: [
      { channel, hash, name: 'Reviewer', time: '2026-07-13T09:00:00Z' },
    ] }));
    return { channel, hash };
  }
  const { channel, hash } = await approve();
  const first = await publish(cwd, true);
  if (first.mode !== 'offline-staging') throw new Error('Expected offline staging');
  const [original] = first.posts;
  const adapter = getAdapter(channel, original.id);

  await writeFile(join(paths.review, 'skipped.json'), JSON.stringify({ [channel]: hash }));
  expect((await publish(cwd, true)).posts).toEqual([]);
  await expect(adapter.status(channel, original.id, cwd)).resolves.toEqual({ status: 'manual' });
  await expect(adapter.cancel(channel, original.id, cwd)).resolves.toEqual({ status: 'cancelled' });

  await writeFile(join(paths.posts, channel + '.md'), markdown.replace('local launch', 'new launch'));
  await approve();
  const edited = await publish(cwd, true);
  if (edited.mode !== 'offline-staging') throw new Error('Expected offline staging');
  expect(edited.posts[0].id).not.toBe(original.id);
  await publish(cwd, true);
  expect(JSON.parse(await readFile(paths.published, 'utf8')).posts).toEqual([
    { ...original, status: 'cancelled' }, ...edited.posts,
  ]);
});

it('runs all phase 5 checks for every fixture', async () => {
  const { results } = await selftest(5);
  const checks = results.filter(result => result.phase === 5);
  expect(checks).toHaveLength(9);
  expect(checks.filter(result => !result.ok)).toEqual([]);
});
