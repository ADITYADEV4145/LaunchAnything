import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checks } from '../src/selftest/phase2.js';
import { packageRoot } from '../src/core/package-root.js';
import { channels, loadPlatform } from '../src/copy/platforms.js';
import { parsePost, inspectPost, similarity, checkPosts, type Post } from '../src/copy/check.js';
import { writeBriefs } from '../src/copy/write.js';

const root = packageRoot();
const product = { name: 'Demo', features: [{ name: 'Task editor', description: 'Edits tasks' }], claims: [{ id: 'edit', text: 'Edits tasks' }] };
const post: Post = { channel: 'x', title: 'Demo', body: 'Try this small project.', media: [], claims: [] };
function rules(p: Partial<Post>, channel = 'x') { return inspectPost({ ...post, channel, ...p }, channel, product).map(i => i.rule); }
function isolated(run: (cwd: string) => void, fixture = 'cli-tool') {
  const cwd = mkdtempSync(join(tmpdir(), 'liftoff-phase2-'));
  try { cpSync(join(root, 'fixtures', fixture), cwd, { recursive: true }); run(cwd); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
}
describe('phase 2 fixtures', () => {
  for (const fixture of ['cli-tool', 'saas-next', 'mobile-expo']) {
    it(fixture + ' passes all phase 2 checks', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'liftoff-phase2-'));
      try {
        cpSync(join(root, 'fixtures', fixture), cwd, { recursive: true });
        for (const check of checks) await check.run({ cwd, fixture });
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
});
it('loads all platform rules and rejects unknown IDs', () => {
  for (const channel of channels) expect(loadPlatform(channel).id).toBe(channel);
  expect(() => loadPlatform('../x')).toThrow('Unknown channel');
});
it('parses front matter and rejects missing, empty and invalid metadata', () => {
  expect(parsePost('---\nchannel: x\ntitle: Demo\nmedia: []\nclaims: []\n---\nHello').body).toBe('Hello');
  for (const text of ['', '---\n[]\n---\nHi', '---\ntitle: Demo\n---\n']) expect(() => parsePost(text)).toThrow();
});
it('checks citations without counting their length', () => {
  expect(rules({ body: 'Task editor works [claim:edit].', claims: ['edit'] })).toEqual([]);
  expect(rules({ body: 'Task editor works.' })).toContain('claims.uncited');
  expect(rules({ body: 'Only 2 steps.' })).toContain('claims.uncited');
  expect(rules({ body: 'Works [claim:nope].', claims: ['nope'] })).toContain('claims.unknown');
  expect(rules({ body: 'Works [claim:edit].' })).toContain('claims.undeclared');
  expect(rules({ body: 'a'.repeat(280) + ' [claim:edit]', claims: ['edit'] })).not.toContain('thread.post-length');
});
it('checks titles, hooks, links and threads', () => {
  expect(rules({ title: 'Demo' }, 'show-hn')).toEqual(expect.arrayContaining(['title.prefix','links.required']));
  expect(rules({ title: 'Show HN: revolutionary demo', link: 'https://example.test' }, 'show-hn')).toContain('words.banned');
  expect(rules({ title: 'a'.repeat(61) }, 'product-hunt')).toContain('title.length');
  expect(rules({ body: 'a'.repeat(211) }, 'linkedin')).toContain('hook.length');
  expect(rules({ body: 'a'.repeat(281) })).toContain('thread.post-length');
  expect(rules({ body: Array(11).fill('hello').join('\n---\n') })).toContain('thread.length');
  expect(rules({ body: 'https://a.test https://b.test https://c.test https://d.test' })).toContain('links.count');
});
it('uses shingle similarity and handles empty text', () => {
  expect(similarity('', '')).toBe(0);
  expect(similarity('one two three four', 'one two three four')).toBe(1);
  expect(similarity('one two three four', 'other words not alike')).toBe(0);
});
it('enforces structured channel specifics and metadata without changing the shared schema', () => {
  expect(rules({ body: 'A launch without a section.' }, 'product-hunt')).toContain('maker-comment.required');
  expect(rules({ body: '## Maker comment\n\n' }, 'product-hunt')).toContain('maker-comment.required');
  expect(rules({ body: '## Maker comment\n\nI made this.' }, 'product-hunt')).not.toContain('maker-comment.required');
  expect(rules({ media: [{slot: 'gallery-1', width: 100, height: 100}] }, 'product-hunt')).toEqual(expect.arrayContaining(['gallery.count','gallery.size']));
  expect(rules({ body: '## Maker comment\n\nI made this.', media: [
    {slot: 'gallery-1', width: 1270, height: 760}, {slot: 'gallery-2', width: 1270, height: 760}
  ] }, 'product-hunt')).toEqual([]);
  expect(rules({ subreddit: 'r/webdev' }, 'reddit')).toContain('reddit.flair-required');
  expect(rules({ subreddit: 'r/webdev', flair: 'Showoff' }, 'reddit')).toEqual([]);
  expect(rules({ subreddit: 'r/programming' }, 'reddit')).toContain('reddit.self-promotion');
  expect(rules({ subreddit: 'r/programming', selfPromotion: false }, 'reddit')).toEqual([]);
  expect(rules({ subreddit: 'r/unknown' }, 'reddit')).toContain('reddit.subreddit');
  expect(rules({ linkFirstComment: true, link: 'https://example.test' }, 'linkedin')).toEqual([]);
  expect(rules({ linkFirstComment: true }, 'linkedin')).toContain('links.comment-required');
  expect(rules({ linkFirstComment: true, link: 'https://example.test', body: 'See https://example.test' }, 'linkedin')).toContain('links.first-comment');
  expect(rules({ linkFirstComment: true }, 'x')).toContain('links.placement');
  expect(rules({ title: 'a'.repeat(61) }, 'email')).toContain('subject.length');
  for (const channel of ['tiktok','reels','shorts'])
    expect(rules({ body: 'a'.repeat(loadPlatform(channel).captionMax! + 1) }, channel)).toContain('caption.length');
  const text = '---\nchannel: reddit\ntitle: Demo\nmedia: []\nclaims: []\nsubreddit: r/webdev\nflair: Showoff\nselfPromotion: true\n---\nHello';
  expect(parsePost(text).subreddit).toBe('r/webdev');
  expect(() => parsePost(text.replace('selfPromotion: true', 'selfPromotion: yes'))).toThrow('Invalid phase 2 metadata');
  expect(() => parsePost(text.replace('flair: Showoff', 'flair: ""'))).toThrow('Invalid phase 2 metadata');
  expect(() => parsePost(text.replace('flair: Showoff', 'unknown: value'))).toThrow();
});
it('records honest source verification status', () => {
  for (const channel of channels) {
    const platform = loadPlatform(channel);
    expect(readFileSync(join(root, 'rules/platforms', channel + '.yaml'), 'utf8')).toMatch(/^kind: platform\n/);
    expect(platform.lastVerified).toBe(platform.verifiedFields.length ? '2026-11-21' : null);
    expect(platform.verificationNotes.length).toBeGreaterThan(0);
  }
});
it('tracks failures, missing/schema/duplicate posts and removes stale fixes', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const posts = join(cwd, '.launch/posts');
  expect(checkPosts(cwd).issues.some(i => i.rule === 'post.missing')).toBe(true);
  writeFileSync(join(posts, 'x.md'), 'bad');
  expect(checkPosts(cwd, ['x']).issues[0].rule).toBe('post.schema');
  expect(checkPosts(cwd, ['x']).askUser).toBe(true);
  const good = readFileSync(join(cwd, '.liftoff-fixture/phase2/good/x.md'), 'utf8');
  writeFileSync(join(posts, 'x.md'), good);
  writeFileSync(join(posts, 'reddit.md'), good.replace('channel: x', 'channel: reddit'));
  expect(checkPosts(cwd, ['x','reddit']).issues.some(i => i.rule === 'text.duplicate')).toBe(true);
  expect(checkPosts(cwd, ['x'])).toMatchObject({ passed: true, attempts: 0, askUser: false });
  expect(existsSync(join(posts, 'fix-list.md'))).toBe(false);
}));
it('loads brand voice, detects local copywriting and rejects invalid inputs', () => isolated(cwd => {
  expect(() => writeBriefs(cwd)).toThrow();
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const configPath = join(cwd, '.launch/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(join(cwd, 'brand.md'), 'Direct and calm');
  writeFileSync(configPath, JSON.stringify({ ...config, brandKit: 'brand.md' }));
  mkdirSync(join(cwd, '.claude/skills/copywriting'), { recursive: true });
  writeFileSync(join(cwd, '.claude/skills/copywriting/SKILL.md'), 'Polish');
  const result = writeBriefs(cwd, ['x']);
  expect(result.briefs).toHaveLength(1);
  expect(result.copywriting).toContain(join(cwd, '.claude/skills/copywriting'));
  expect(readFileSync(result.briefs[0], 'utf8')).toContain('Direct and calm');
  writeFileSync(configPath, '{}');
  expect(() => writeBriefs(cwd)).toThrow('config:');
}));
it('CLI failures are JSON and exit nonzero', () => isolated(cwd => {
  for (const name of ['write','check']) {
    const result = spawnSync(process.execPath, ['--import','tsx', join(root,'src/cli.ts'), name, '--cwd', cwd, '--json'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  }
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import','tsx', join(root,'src/cli.ts'), ...args, '--cwd', cwd, '--json'], { encoding: 'utf8' });
  const missing = run('check', '--channel', 'x');
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, data: { passed: false } });
  const brief = run('write', '--channel', 'x', '--channel', 'reddit');
  expect(brief.status).toBe(0);
  expect(JSON.parse(brief.stdout).data.briefs).toHaveLength(2);
}));
