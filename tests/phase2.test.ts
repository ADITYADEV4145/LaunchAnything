import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checks } from '../src/selftest/phase2.js';
import { packageRoot } from '../src/core/package-root.js';
import { channels, loadPlatform } from '../src/copy/platforms.js';
import { parsePost, inspectPost, similarity, checkPosts, type Post } from '../src/copy/check.js';
import { writeBriefs } from '../src/copy/write.js';
import { assertSafePath, atomicWrite } from '../src/copy/safe-path.js';
import { extractLinks } from '../src/copy/links.js';

const root = packageRoot();
it('refuses symlinked output directories and files without touching external targets', () => {
  for (const target of ['.launch', '.launch/posts', '.launch/posts/briefs', '.launch/posts/briefs/x.md', '.launch/posts/check-state.json', '.launch/posts/fix-list.md', '.launch/posts/check-results.json']) {
    isolated(cwd => {
      checks[0].run({ cwd, fixture: 'cli-tool' });
      const outside = mkdtempSync(join(tmpdir(), 'liftoff-outside-'));
      try {
        const path = join(cwd, target);
        if (existsSync(path)) renameSync(path, join(outside, 'original'));
        const directory = !target.endsWith('.md') && !target.endsWith('.json');
        const destination = join(outside, directory ? 'directory' : 'sentinel');
        if (directory) cpSync(join(outside, 'original'), destination, { recursive: true });
        else writeFileSync(destination, 'unchanged');
        symlinkSync(destination, path);
        const before = directory ? readFileSync(join(outside, 'original', target === '.launch' ? 'config.json' : target.endsWith('briefs') ? 'x.md' : 'briefs/x.md'), 'utf8') : 'unchanged';
        if (!target.includes('check-state') && !target.includes('fix-list') && !target.includes('check-results')) expect(() => writeBriefs(cwd, ['x'])).toThrow('Unsafe');
        if (!target.includes('briefs')) expect(() => checkPosts(cwd, ['x'])).toThrow('Unsafe');
        if (!directory) expect(readFileSync(destination, 'utf8')).toBe(before);
      } finally { rmSync(outside, { recursive: true, force: true }); }
    });
  }
  isolated(cwd => {
    expect(() => assertSafePath(cwd, join(cwd, '..', 'escaped'))).toThrow('outside repository');
    rmSync(join(cwd, '.launch'), { recursive: true, force: true });
    symlinkSync(join(cwd, 'missing'), join(cwd, '.launch'));
    expect(() => assertSafePath(cwd, join(cwd, '.launch/posts/x.md'))).toThrow('Unsafe');
  });
});
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
it('accepts phase 5b metadata in check while rejecting invalid extension types', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const text = '---\nchannel: x\ntitle: Launch\nmedia: []\nclaims: []\nhashtags: [local, build]\ncoverFrame: 2\nname: Product\ntagline: Local launch\nmakerComment: Hello\n---\nTry this small project.';
  writeFileSync(join(cwd, '.launch/posts/x.md'), text);
  expect(checkPosts(cwd, ['x']).issues.filter(issue => issue.rule === 'post.schema')).toEqual([]);
  expect(parsePost(text)).toMatchObject({ hashtags: ['local', 'build'], coverFrame: 2, name: 'Product', tagline: 'Local launch', makerComment: 'Hello' });
  expect(parsePost(text.replace('hashtags: [local, build]', 'hashtags: []'))).toMatchObject({ hashtags: [] });
  for (const [valid, invalid] of [['hashtags: [local, build]', 'hashtags: wrong'], ['coverFrame: 2', 'coverFrame: -1'], ['name: Product', 'name: []'], ['tagline: Local launch', 'tagline: 3'], ['makerComment: Hello', 'makerComment: true']])
    expect(() => parsePost(text.replace(valid, invalid))).toThrow('Invalid phase 2 metadata');
}));
it('checks citations without counting their length', () => {
  expect(rules({ body: 'Task editor works [claim:edit].', claims: ['edit'] })).toEqual([]);
  expect(rules({ body: 'Task editor works.' })).toContain('claims.uncited');
  expect(rules({ body: 'Only 2 steps.' })).toContain('claims.uncited');
  expect(rules({ body: 'Works [claim:nope].', claims: ['nope'] })).toContain('claims.unknown');
  expect(rules({ body: 'Works [claim:edit].' })).toContain('claims.undeclared');
  expect(rules({ body: 'a'.repeat(280) + ' [claim:edit]', claims: ['edit'] })).not.toContain('thread.post-length');
});
it('checks citations across soft wraps but ignores list numbering', () => {
  expect(rules({ body: 'Task editor works\n[claim:edit].', claims: ['edit'] })).not.toContain('claims.uncited');
  expect(rules({ body: 'Task editor\nworks.\n[claim:edit]', claims: ['edit'] })).not.toContain('claims.uncited');
  expect(rules({ body: 'Only 2 steps.\n[claim:edit]\nAnother 3 steps.', claims: ['edit'] })).toContain('claims.uncited');
  expect(rules({ body: '1. Try the project.\n2) Share feedback.' })).not.toContain('claims.uncited');
  expect(rules({ body: '1. Task editor works\n   [claim:edit].\n2. Share feedback.', claims: ['edit'] })).not.toContain('claims.uncited');
  expect(rules({ body: '1. Only 2 steps.' })).toContain('claims.uncited');
  expect(rules({ body: 'Task editor works.\n\n[claim:edit]', claims: ['edit'] })).toContain('claims.uncited');
  expect(rules({ body: 'Task editor works. Another sentence [claim:edit].', claims: ['edit'] })).toContain('claims.uncited');
});
it('keeps citations within their thread post and paragraph', () => {
  for (const boundary of ['\n---\n', '\r\n---\r\n', '\n\n']) {
    expect(rules({ body: 'Task editor [claim:edit]' + boundary + 'Only 2 steps', claims: ['edit'] })).toContain('claims.uncited');
    expect(rules({ body: 'Task editor' + boundary + 'Only 2 steps [claim:edit]', claims: ['edit'] })).toContain('claims.uncited');
    expect(rules({ body: 'Task editor [claim:edit]' + boundary + 'Only 2 steps [claim:edit]', claims: ['edit'] })).not.toContain('claims.uncited');
  }
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
it('deduplicates links after removing trailing prose punctuation', () => {
  expect(rules({
    body: 'https://a.test/path. https://a.test/path, (https://a.test/path) https://a.test/path! https://a.test/path? https://b.test.',
    link: 'https://a.test/path'
  })).not.toContain('links.count');
  expect(rules({ body: 'https://a.test https://b.test https://c.test.' })).toContain('links.count');
});
it('extracts adjacent Markdown targets and deduplicates decorated bare links', () => {
  expect(rules({ body: '[a](https://a.test)[b](https://b.test)[c](https://c.test)' })).toContain('links.count');
  expect(rules({
    body: '**https://a.test** _https://a.test_ [a](https://a.test)[b](<https://b.test> "Title")',
    link: 'https://a.test'
  })).not.toContain('links.count');
  expect(rules({
    body: '[a](https://a.test)[again](https://a.test) https://b.test',
    link: 'https://a.test'
  })).not.toContain('links.count');
  expect(rules({ body: '**https://a.test** [b](https://b.test)[c](https://c.test)' })).toContain('links.count');
});
it('stops bare URLs before adjacent Markdown links', () => {
  for (const markdown of ['[docs](https://b.example)', '![docs](https://b.example)', '[docs](https://b.example "see https://title.example")']) {
    const text = 'https://a.example-' + markdown;
    expect(extractLinks(text)).toEqual(['https://a.example-', 'https://b.example']);
    expect(rules({ body: text })).not.toContain('links.count');
    expect(rules({ body: text + ' https://c.example' })).toContain('links.count');
  }
  expect(extractLinks('https://a.example/?filter[key]=[value]')).toEqual(['https://a.example/?filter[key]=[value]']);
  expect(extractLinks('https://a.example/path-[broken]')).toEqual(['https://a.example/path-[broken]']);
});

it('consumes Markdown titles that wrap across lines', () => {
  for (const newline of ['\n', '\r\n']) {
    for (const [open, close] of [['"', '"'], ["'", "'"], ['(', ')']]) {
      const text = '[x](https://a.example' + newline + '  ' + open + 'see https://b.example' + newline + '  for more' + close + ')';
      expect(extractLinks(text)).toEqual(['https://a.example']);
      expect(rules({ body: text + ' https://c.example' })).not.toContain('links.count');
    }
  }
});

it('rejects hostless URL schemes across link sources', () => {
  expect(extractLinks('https:// http://')).toEqual([]);
  expect(extractLinks('[x](https://) <http://> https://?q=x')).toEqual([]);
  expect(extractLinks('http://localhost https://example.com')).toEqual(['http://localhost', 'https://example.com']);
});

it('terminates quoted bare URLs at Unicode prose boundaries', () => {
  for (const boundary of ['—', '–', '。', '，', '\u2003']) {
    expect(extractLinks("'https://demo.example'" + boundary + 'then try it')).toEqual(['https://demo.example']);
    expect(rules({ body: "'https://demo.example'" + boundary + 'then try https://demo.example https://other.example' })).not.toContain('links.count');
  }
});

it('consumes angle autolinks whole without bare URL boundaries', () => {
  const urls = ['https://a.example/x)y', 'https://a.example/x)z', 'https://a.example/a→b', 'https://a.example/a→c'];
  expect(extractLinks(urls.map(url => '<' + url + '>').join(' '))).toEqual(urls);
  expect(rules({ body: urls.slice(0, 3).map(url => '<' + url + '>').join(' ') })).toContain('links.count');
});

it('consumes redirect URLs without rescanning embedded destinations', () => {
  const redirect = 'https://r.example/?to=https://docs.example';
  expect(extractLinks(redirect)).toEqual([redirect]);
  expect(rules({ body: redirect + ' https://docs.example' })).not.toContain('links.count');
});

it('preserves internal apostrophes and separates arrow-joined bare URLs', () => {
  const url = "https://example.com/it's";
  expect(extractLinks(url)).toEqual([url]);
  expect(extractLinks("see https://x.com/a's page")).toEqual(["https://x.com/a's"]);
  expect(extractLinks("'" + url + "'")).toEqual([url]);
  expect(rules({ body: '[visit](' + url + ') ' + url, link: url })).not.toContain('links.count');
  for (const arrow of ['->', '→']) {
    expect(extractLinks('(https://a.com)' + arrow + '(https://b.com)')).toEqual(['https://a.com', 'https://b.com']);
    expect(rules({ body: '(https://a.com)' + arrow + '(https://b.com) https://c.com' })).toContain('links.count');
  }
});

it('excludes multiline Markdown titles from link destinations', () => {
  for (const newline of ['\n', '\r\n']) {
    for (const title of ['"see https://b.com"', "'see https://b.com'", '(see https://b.com)']) {
      const markdown = '[x](https://a.com' + newline + '  ' + title + ')';
      expect(extractLinks(markdown)).toEqual(['https://a.com']);
      expect(rules({ body: markdown + ' https://c.com', link: 'https://a.com' })).not.toContain('links.count');
    }
  }
  expect(extractLinks('[x](<https://a.com>\n  "see https://b.com")')).toEqual(['https://a.com']);
  expect(extractLinks('[x](https://a.com\n  "unterminated https://b.com)')).toContain('https://b.com');
});

it('preserves balanced parentheses and brackets across every URL source', () => {
  const wiki = 'https://en.wikipedia.org/wiki/Foo_(bar)';
  const query = 'https://example.test/?filter[key]=[value]';
  expect(extractLinks('[wiki](' + wiki + ')')).toEqual([wiki]);
  expect(extractLinks('[nested](https://example.test/a_(b_(c)))')).toEqual(['https://example.test/a_(b_(c))']);
  expect(extractLinks('[query](<' + query + '> "Title")')).toEqual([query]);
  expect(extractLinks('(' + wiki + '). **' + query + '**')).toEqual([wiki, query]);
  expect(extractLinks('[escaped](https://example.test/a_\\(b\\))')).toEqual(['https://example.test/a_(b)']);
  expect(extractLinks('No links.')).toEqual([]);
  expect(extractLinks('[broken](https://example.test/a_(b')).toEqual(['https://example.test/a_(b']);
  expect(rules({
    body: '[wiki](' + wiki + ')[query](' + query + ') **' + wiki + '**',
    link: query
  })).not.toContain('links.count');
  expect(rules({ body: '[wiki](' + wiki + ')[query](' + query + ') https://third.test' })).toContain('links.count');
});
it('requires an HTTP(S) URL for tryable Show HN links', () => {
  for (const link of [undefined, 'mailto:maker@example.test', 'ftp://example.test/demo', 'javascript:alert(0)', 'https://'])
    expect(rules({ title: 'Show HN: Demo', link }, 'show-hn')).toContain('links.required');
  for (const link of ['https://example.test/demo', 'http://example.test/demo'])
    expect(rules({ title: 'Show HN: Demo', link }, 'show-hn')).not.toContain('links.required');
});
it('excludes thread separators from the X total budget', () => {
  expect(rules({ body: Array(10).fill('a'.repeat(280)).join('\n---\n') })).toEqual([]);
  expect(rules({ body: Array(10).fill('a'.repeat(280)).join('\r\n---\r\n') })).toEqual([]);
  expect(rules({ body: 'a'.repeat(281) })).toContain('thread.post-length');
  expect(rules({ body: Array(11).fill('hello').join('\n---\n') })).toContain('thread.length');
});
it('uses shingle similarity and handles empty text', () => {
  expect(similarity('', '')).toBe(0);
  expect(similarity('one two three four', 'one two three four')).toBe(1);
  expect(similarity('one two three four', 'other words not alike')).toBe(0);
});
it('detects short and non-Latin duplicates with Unicode-aware similarity', () => {
  expect(similarity('Hello', 'hello')).toBe(1);
  expect(similarity('Two words [claim:edit]', 'two  words')).toBe(1);
  expect(similarity('你好世界', '你好世界')).toBe(1);
  expect(similarity('Привет мир снова', 'привет мир снова!')).toBe(1);
  expect(similarity('café project', 'cafe\u0301 project')).toBe(1);
  expect(similarity('🚀', '🚀')).toBe(1);
  expect(similarity('Hello', 'Goodbye')).toBe(0);
  expect(similarity('你好', '再见')).toBe(0);
  expect(similarity('', '')).toBe(0);
});
it('preserves Hindi vowel marks and Unicode numbers in similarity tokens', () => {
  expect(similarity('कि कि कि', 'की की की')).toBe(0);
  expect(similarity('कि', 'की')).toBe(0);
  expect(similarity('कि कि कि', 'कि कि कि!')).toBe(1);
  expect(similarity('पाठ १', 'पाठ २')).toBe(0);
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
  expect(rules({ subreddit: 'r/webdev', flair: 'Showoff', body: 'I built this.' }, 'reddit')).toEqual([]);
  expect(rules({ subreddit: 'r/programming' }, 'reddit')).toContain('reddit.self-promotion');
  expect(rules({ subreddit: 'r/programming', selfPromotion: false, body: 'I built this.' }, 'reddit')).toEqual([]);
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
  const good = readFileSync(join(cwd, '.liftoff-fixture/phase2/good/x.md'), 'utf8') + '\nI built this.\n';
  writeFileSync(join(posts, 'x.md'), good);
  writeFileSync(join(posts, 'reddit.md'), good.replace('channel: x', 'channel: reddit'));
  expect(checkPosts(cwd, ['x','reddit']).issues.some(i => i.rule === 'text.duplicate')).toBe(true);
  expect(checkPosts(cwd, ['x'])).toMatchObject({ passed: true, attempts: 0, askUser: false });
  expect(existsSync(join(posts, 'fix-list.md'))).toBe(false);
}));
it('records missing, invalid and passing source hashes while preserving unchecked results', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const posts = join(cwd, '.launch/posts');
  const reportPath = join(posts, 'check-results.json');
  const read = () => JSON.parse(readFileSync(reportPath, 'utf8')).posts as {channel: string; sourceHash: string | null; issues: {rule: string; message: string}[]}[];
  checkPosts(cwd);
  const missing = read();
  expect(missing).toHaveLength(5);
  for (const entry of missing) {
    expect(entry.sourceHash).toBeNull();
    expect(entry.issues).toEqual([{ rule: 'post.missing', message: 'Missing planned post' }]);
  }
  const xPath = join(posts, 'x.md');
  const invalid = Buffer.from([0xff, 0x0d, 0x0a]);
  writeFileSync(xPath, invalid);
  checkPosts(cwd, ['x']);
  expect(read().find(entry => entry.channel === 'x')).toMatchObject({
    sourceHash: createHash('sha256').update(invalid).digest('hex'),
    issues: [{ rule: 'post.schema', message: expect.any(String) }]
  });
  const good = readFileSync(join(cwd, '.liftoff-fixture/phase2/good/x.md'), 'utf8').replace(/\n/g, '\r\n') + '\r\n';
  writeFileSync(xPath, good);
  expect(checkPosts(cwd, ['x']).passed).toBe(true);
  const pass = read().find(entry => entry.channel === 'x')!;
  expect(pass).toEqual({ channel: 'x', sourceHash: createHash('sha256').update(Buffer.from(good)).digest('hex'), issues: [] });
  expect(read().filter(entry => entry.channel !== 'x')).toEqual(missing.filter(entry => entry.channel !== 'x'));
  writeFileSync(xPath, good + ' ');
  checkPosts(cwd, ['reddit']);
  expect(read().find(entry => entry.channel === 'x')).toEqual(pass);
  checkPosts(cwd, ['x']);
  expect(read().find(entry => entry.channel === 'x')!.sourceHash).not.toBe(pass.sourceHash);
}));
it('records cross-channel issues for each affected channel and clears them on recheck', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const posts = join(cwd, '.launch/posts');
  const good = readFileSync(join(cwd, '.liftoff-fixture/phase2/good/x.md'), 'utf8') + '\nI built this.\n';
  writeFileSync(join(posts, 'x.md'), good);
  writeFileSync(join(posts, 'reddit.md'), good.replace('channel: x', 'channel: reddit\nsubreddit: r/SideProject'));
  expect(checkPosts(cwd, ['x','reddit']).passed).toBe(false);
  const report = JSON.parse(readFileSync(join(posts, 'check-results.json'), 'utf8'));
  expect(report.posts).toHaveLength(2);
  for (const entry of report.posts) {
    expect(entry.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.issues).toEqual([{ rule: 'text.duplicate', message: 'Over 60% similarity with another channel' }]);
  }
  checkPosts(cwd, ['x']);
  const updated = JSON.parse(readFileSync(join(posts, 'check-results.json'), 'utf8'));
  expect(updated.posts.find((entry: {channel: string}) => entry.channel === 'x').issues).toEqual([]);
  expect(updated.posts.find((entry: {channel: string}) => entry.channel === 'reddit')).toEqual(report.posts[0]);
}));
it('recovers malformed prior results and rewrite state with output warnings', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const path = join(cwd, '.launch/posts/check-results.json');
  for (const invalid of ['{', '{"posts":{}}', '{"posts":[{"channel":"x","sourceHash":"bad","issues":[]}]}']) {
    writeFileSync(path, invalid);
    writeFileSync(join(cwd, '.launch/posts/check-state.json'), invalid);
    const result = checkPosts(cwd, ['x']);
    expect(result.warnings).toEqual([
      'Malformed check-results.json ignored; previous entries were discarded.',
      'Malformed check-state.json ignored; rewrite attempts were reset.'
    ]);
    expect(result.attempts).toBe(1);
    expect(JSON.parse(readFileSync(path, 'utf8')).posts).toMatchObject([{channel: 'x', sourceHash: null}]);
  }
}));
it('preserves check artifacts on partial writes and rename failures', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  for (const name of ['check-results.json','check-state.json','fix-list.md']) {
    const path = join(cwd, '.launch/posts', name);
    const original = name.endsWith('.json') ? '{"preserve":true}' : 'Original fix list';
    writeFileSync(path, original);
    const write = fs.writeFileSync;
    const failingWrite = vi.spyOn(fs, 'writeFileSync').mockImplementation((file) => {
      write(file, 'partial');
      throw new Error('Write failed');
    });
    try { expect(() => atomicWrite(cwd, path, 'replacement')).toThrow('Write failed'); }
    finally { failingWrite.mockRestore(); }
    expect(readFileSync(path, 'utf8')).toBe(original);
    const failingRename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('Rename failed'); });
    try { expect(() => atomicWrite(cwd, path, 'replacement')).toThrow('Rename failed'); }
    finally { failingRename.mockRestore(); }
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(fs.readdirSync(join(cwd, '.launch/posts')).filter(name => name.endsWith('.tmp'))).toEqual([]);
    atomicWrite(cwd, path, 'replacement');
    expect(readFileSync(path, 'utf8')).toBe('replacement');
  }
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
it('limits default briefs and checks to channels scheduled in plan.md', () => isolated(cwd => {
  checks[0].run({ cwd, fixture: 'cli-tool' });
  const config = JSON.parse(readFileSync(join(cwd, '.launch/config.json'), 'utf8'));
  const [first, second, ...rest] = config.channels as string[];
  expect(rest.length).toBeGreaterThan(0);
  writeFileSync(join(cwd, '.launch/plan.md'), ['| Channel | Local date | Local time | Why | Preparation lead time |',
    '| --- | --- | --- | --- | --- |', `| ${first} | 2026-09-25 | 09:00 | a | 1 day(s) |`,
    `| ${second} | 2026-09-25 | 09:00 | b | 1 day(s) |`].join('\n'));
  expect(writeBriefs(cwd).briefs.map(path => path.split('/').pop())).toEqual([first + '.md', second + '.md']);
  const missing = checkPosts(cwd).issues.filter(i => i.rule === 'post.missing').map(i => i.channel);
  expect(missing.every(channel => channel === first || channel === second)).toBe(true);
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
}), 30000);
