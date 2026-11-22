import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

it.each(['A sourced statement [claim:scan]', 'No citations here', '', '<script>bad</script> [claim:<img src=x onerror=bad>]'])
('renders review citations as escaped badges without changing approval inputs: %s', async body => {
  const { cwd, paths } = await project();
  const source = `---\ntitle: Launch [claim:scan]\nmedia: []\nclaims: [scan]\n---\n${body}\n`;
  await writeFile(join(paths.posts, 'show-hn.md'), source);
  if (!body) {
    await expect(buildReview(cwd)).rejects.toThrow('/body must NOT have fewer than 1 characters');
    return;
  }
  const { path, posts } = await buildReview(cwd);
  const html = await readFile(path, 'utf8');
  const card = html.split('<article data-channel="show-hn">')[1].split('</article>')[0];
  expect(card).toContain('<sup class="claim" title="Source claim: scan">scan</sup>');
  expect(card).not.toContain('[claim:');
  expect(card).not.toContain('<script>bad</script>');
  expect(card).not.toContain('<img src=x');
  if (body.includes('<img')) expect(card).toContain('Source claim: &lt;img src=x onerror=bad&gt;');
  const snapshot = JSON.parse(html.match(/<script id="snapshot" type="application\/json">([\s\S]*?)<\/script>/)![1]);
  expect(snapshot.posts['show-hn'].source).toBe(source);
  const bytes = Buffer.from(source);
  expect(posts[0].hash).toBe(createHash('sha256').update(String(bytes.length) + ':').update(bytes).digest('hex'));
});

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

it('stages a LinkedIn first-comment link separately from the main post', async () => {
  const { cwd, paths } = await project();
  const link = 'https://example.test/launch';
  await rm(join(paths.posts, 'show-hn.md'));
  await writeFile(paths.plan, (await readFile(paths.plan, 'utf8')).replace('show-hn', 'linkedin'));
  await writeFile(join(paths.posts, 'linkedin.md'), `---
channel: linkedin
title: Launch notes
media: []
claims: []
link: ${link}
linkFirstComment: true
---
Here is what I built.
`);
  const { path, posts: [{ channel, hash }] } = await buildReview(cwd);
  await writeFile(paths.approvals, JSON.stringify({ approvals: [
    { channel, hash, name: 'Reviewer', time: '2026-07-13T09:00:00Z' },
  ] }));
  const staged = await publish(cwd, true, {});
  if (staged.mode !== 'offline-staging') throw new Error('Expected offline staging');
  const main = new URL(staged.posts[0].url!);
  expect(await readFile(main, 'utf8')).toBe('Launch notes\n\nHere is what I built.\n');
  expect(await readFile(new URL('first-comment.txt', main), 'utf8')).toBe(link + '\n');
  expect((await publish(cwd, false, {})).posts[0]).toMatchObject({ firstComment: link });
  expect(await readFile(path, 'utf8')).toContain('First comment: ');
});

it('shows only matching platform check verdicts, with failing rules and the fix-list path', async () => {
  const { cwd, paths, markdown } = await project();
  const reddit = '---\nchannel: reddit\ntitle: Project notes\nsubreddit: r/SideProject\nflair: Showcase\n' +
    'media: []\nclaims: []\n---\nI built a tool to help with local launches.\n';
  await writeFile(paths.plan, await readFile(paths.plan, 'utf8') + '| reddit | 2026-07-15 | 15:00 | Demo | 1 day(s) |\n');
  await writeFile(join(paths.posts, 'reddit.md'), reddit);
  const present = async () => readFile((await buildReview(cwd)).path, 'utf8');
  expect(await present()).toContain('Not checked — run <code>liftoff check</code>');

  const sourceHash = (source: string) => createHash('sha256').update(source).digest('hex');
  await writeFile(join(paths.posts, 'fix-list.md'), '# Fix list\n');
  await writeFile(join(paths.posts, 'check-results.json'), JSON.stringify({ posts: [
    { channel: 'show-hn', sourceHash: sourceHash(markdown), issues: [{ rule: 'title.prefix', message: 'Missing <prefix>' }] },
    { channel: 'reddit', sourceHash: sourceHash(reddit), issues: [] },
  ] }));
  const html = await present();
  const showHnCard = html.split('<article data-channel="show-hn">')[1].split('</article>')[0];
  const redditCard = html.split('<article data-channel="reddit">')[1].split('</article>')[0];
  expect(showHnCard).toContain('Last platform check</dt><dd>Fail');
  expect(showHnCard).toContain('<code>title.prefix</code>: Missing &lt;prefix&gt;');
  expect(showHnCard).toContain('Fix list: <code>.launch/posts/fix-list.md</code>');
  expect(redditCard).toContain('Last platform check</dt><dd>Pass');

  await writeFile(join(paths.posts, 'show-hn.md'), markdown.replace('local launch', 'edited launch'));
  const stale = await present();
  expect(stale).not.toContain('title.prefix');
  expect(stale).toContain('Not checked — run <code>liftoff check</code>');
});

it.each(['missing', 'unreadable'])('shows a null-hash failure even when the only post is %s', async condition => {
  const { cwd, paths } = await project();
  const source = join(paths.posts, 'show-hn.md');
  await rm(source);
  if (condition === 'unreadable') await mkdir(source);
  await writeFile(join(paths.posts, 'check-results.json'), JSON.stringify({ posts: [
    { channel: 'show-hn', sourceHash: null, issues: [{ rule: 'post.missing', message: 'Could not read planned post' }] },
  ] }));
  const { path, posts } = await buildReview(cwd);
  const html = await readFile(path, 'utf8');
  expect(posts).toEqual([]);
  expect(html).toContain('show-hn · Post unavailable');
  expect(html).toContain('Last platform check</dt><dd>Fail');
  expect(html).toContain('<code>post.missing</code>: Could not read planned post');
  expect(html).not.toContain('data-action="approve"');
  await expect(publish(cwd, true)).rejects.toThrow();
});

it('does not apply a null-hash verdict after the missing post is created', async () => {
  const { cwd, paths, markdown } = await project();
  const source = join(paths.posts, 'show-hn.md');
  await rm(source);
  await writeFile(join(paths.posts, 'check-results.json'), JSON.stringify({ posts: [
    { channel: 'show-hn', sourceHash: null, issues: [{ rule: 'post.missing', message: 'Missing planned post' }] },
  ] }));
  const page = async () => readFile((await buildReview(cwd)).path, 'utf8');
  expect(await page()).toContain('<code>post.missing</code>: Missing planned post');
  await writeFile(source, markdown);
  const restored = await page();
  expect(restored).toContain('Last platform check</dt><dd>Not checked');
  expect(restored).not.toContain('Missing planned post');
});

it('shows stale approvals with the previous approver after copy or attachment bytes change', async () => {
  const { cwd, paths, markdown } = await project();
  const postFile = join(paths.posts, 'show-hn.md');
  const mediaFile = join(paths.media, 'example.svg');
  const source = markdown.replace('media: []', 'media:\n  - slot: screenshot\n    path: media/example.svg');
  await mkdir(paths.media);
  await writeFile(mediaFile, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(postFile, source);
  const { path, posts: [{ channel, hash }] } = await buildReview(cwd);
  const state = async () => (await readFile(path, 'utf8')).match(/<span class="state">([^<]+)/)?.[1];
  expect(await state()).toBe('Awaiting approval');
  await writeFile(paths.approvals, JSON.stringify({ approvals: [
    { channel, hash, name: 'Taylor & Co.', time: '2026-07-13T09:00:00Z' },
  ] }));
  await buildReview(cwd);
  expect(await state()).toBe('Approved');

  await writeFile(postFile, source.replace('local launch', 'new launch'));
  await buildReview(cwd);
  const stale = 'Approval stale: copy or attachments changed (previously approved by Taylor &amp; Co.)';
  expect(await state()).toBe(stale);
  await expect(publish(cwd, true)).rejects.toThrow('exact post and media hash not approved');

  await writeFile(postFile, source);
  await writeFile(mediaFile, '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  await buildReview(cwd);
  expect(await state()).toBe(stale);
  await expect(publish(cwd, true)).rejects.toThrow('exact post and media hash not approved');
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
}, 180000);
