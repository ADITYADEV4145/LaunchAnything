import { it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checks } from '../src/selftest/phase2.js';
import { packageRoot } from '../src/core/package-root.js';
import { checkPosts, inspectPost, parsePost } from '../src/copy/check.js';
import { pickVariant, stripClaims } from '../src/copy/edit.js';
import { judgePosts, criteria } from '../src/copy/judge.js';
import { prepareBlindTest, recordBlindTest, tallyBlindTest, plainPrompt } from '../src/copy/blind-test.js';
import { writeBriefs } from '../src/copy/write.js';
import { loadExemplars, loadVoiceGuidelines } from '../src/copy/guides.js';
import { buildReview } from '../src/review/page.js';

const root = packageRoot();
function project(run: (cwd: string, posts: string) => void | Promise<void>, fixture = 'cli-tool') {
  return async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'liftoff-partc-'));
    try {
      cpSync(join(root, 'fixtures', fixture), cwd, { recursive: true });
      checks[1].run({ cwd, fixture });
      await run(cwd, join(cwd, '.launch/posts'));
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  };
}
const rulesFor = (cwd: string, channel: string) => checkPosts(cwd, [channel]).issues.map(i => i.rule);
const edit = (posts: string, channel: string, change: (source: string) => string) => {
  const path = join(posts, channel + '.md');
  writeFileSync(path, change(readFileSync(path, 'utf8')));
};

it('good fixtures keep claim tags out of the visible text', project((cwd, posts) => {
  for (const name of readdirSync(posts).filter(n => n.endsWith('.md'))) {
    const post = parsePost(readFileSync(join(posts, name), 'utf8'));
    expect(post.title + post.body).not.toMatch(/\[claim:/);
    expect(post.citations?.length).toBeGreaterThan(0);
  }
  expect(checkPosts(cwd).passed).toBe(true);
}));

it('rejects raw claim tags and moves them into citations with claims strip', project((cwd, posts) => {
  edit(posts, 'github-release', s => s.replace(/^citations:[\s\S]*?(?=---\n## )/m, '')
    .replace('Small daily task lists should not need a setup guide.', 'Small daily task lists should not need a setup guide. [claim:pain:1]')
    .replace('The CLI adds and lists tasks in a local JSON file.', 'The CLI adds and lists tasks in a local JSON file [claim:interface].'));
  expect(rulesFor(cwd, 'github-release')).toContain('claims.inline-tag');
  expect(stripClaims(cwd, ['github-release']).changed).toEqual(['github-release']);
  const post = parsePost(readFileSync(join(posts, 'github-release.md'), 'utf8'));
  expect(post.body).not.toMatch(/\[claim:/);
  expect(post.citations).toEqual(expect.arrayContaining([{ text: 'The CLI adds and lists tasks in a local JSON file.', claim: 'interface' }]));
  expect(checkPosts(cwd, ['github-release']).issues).toEqual([]);
}));

it('requires every draft to open with a cited pain or proof, never a banned opener', project((cwd, posts) => {
  const opener = 'Small daily task lists should not need a setup guide.';
  for (const bad of ['I built a small checklist.', 'Introducing Tasklight for checklists.', 'Excited to share my checklist.', 'Hi HN, I built a checklist.', "We're excited to share a checklist."]) {
    edit(posts, 'github-release', s => s.replaceAll(opener, bad));
    expect(rulesFor(cwd, 'github-release')).toContain('opener.banned');
    edit(posts, 'github-release', s => s.replaceAll(bad, opener));
  }
  edit(posts, 'github-release', s => s.replace('{ text: "' + opener + '", pain: 1 }', '{ text: "Review the source before running it locally.", pain: 1 }'));
  expect(rulesFor(cwd, 'github-release')).toContain('opener.grounded');
}));

it('flags citation text that is not in the post', project((cwd, posts) => {
  edit(posts, 'github-release', s => s.replace('claim: interface }', 'claim: interface }\n  - { text: "A sentence that is not there.", claim: interface }'));
  expect(rulesFor(cwd, 'github-release')).toContain('citations.text');
}));

it('enforces the Show HN, X and DEV.to templates', project((cwd, posts) => {
  edit(posts, 'show-hn', s => s.replace(/## First comment outline[\s\S]*$/, ''));
  expect(rulesFor(cwd, 'show-hn')).toContain('template.section');
  edit(posts, 'show-hn', s => s.replaceAll('Show HN: Tasklight – a checklist CLI that keeps tasks in one JSON file', 'Show HN: Tasklight'));
  expect(rulesFor(cwd, 'show-hn')).toEqual(expect.arrayContaining(['template.title', 'variants.pattern']));
  edit(posts, 'x', s => s.replace('media: [{ slot: hero }]', 'media: []').replace(/\n---\nTry it here: (\S+) Which command would you rename first\?\n/, '\n'));
  expect(rulesFor(cwd, 'x')).toEqual(expect.arrayContaining(['template.first-media', 'template.last-link', 'template.last-ask']));
  edit(posts, 'x', s => s.replace(/\n---\nIt does not sync[^\n]*\n/, '\n'));
  expect(rulesFor(cwd, 'x')).toContain('template.thread');
  edit(posts, 'devto', s => s.replace(/## What I learned building it[\s\S]*?(?=## Limits)/, '').replace(/```bash[\s\S]*?```/, ''));
  expect(rulesFor(cwd, 'devto')).toEqual(expect.arrayContaining(['template.words', 'template.code']));
  edit(posts, 'devto', s => s.replace('## Limits', '## Gaps'));
  expect(rulesFor(cwd, 'devto')).toContain('template.heading');
}));

it('enforces the Product Hunt, LinkedIn and vertical video templates', project(async (cwd, posts) => {
  edit(posts, 'product-hunt', s => s.replace(/## Gallery order[\s\S]*$/, '').replace('What would your team need', 'Your team needs').replace('trusts a board like this?', 'trusts a board like this.'));
  expect(rulesFor(cwd, 'product-hunt')).toEqual(expect.arrayContaining(['template.section', 'template.section-ask']));
  edit(posts, 'linkedin', s => s.replace('media: [{ slot: board }]', 'media: []').replace('Not doing it, just finding it.', 'Not doing it. Just finding it. Every week.'));
  expect(rulesFor(cwd, 'linkedin')).toEqual(expect.arrayContaining(['template.media', 'template.paragraphs']));
}, 'saas-next'));

it('checks vertical video caption and on-screen text', project((cwd, posts) => {
  edit(posts, 'tiktok', s => s.replace(/## On-screen text[\s\S]*$/, ''));
  expect(rulesFor(cwd, 'tiktok')).toContain('template.section');
}, 'mobile-expo'));

it('requires two variants and picks between them', project((cwd, posts) => {
  edit(posts, 'show-hn', s => s.replace(/variants:\n  title:\n.*\n.*\n/, ''));
  expect(rulesFor(cwd, 'show-hn')).toContain('variants.missing');
  rmSync(join(posts, 'show-hn.md'));
  cpSync(join(cwd, '.liftoff-fixture/phase2/good/show-hn.md'), join(posts, 'show-hn.md'));
  expect(pickVariant(cwd, 'show-hn', 2).title).toBe('Show HN: Tasklight – a terminal to-do list you can read with cat');
  expect(checkPosts(cwd, ['show-hn']).passed).toBe(true);
  pickVariant(cwd, 'x', 2);
  const x = parsePost(readFileSync(join(posts, 'x.md'), 'utf8'));
  expect(x.body.split('\n---\n')[0]).toBe(x.variants!.hook![1]);
  expect(x.picked).toBe(2);
  expect(checkPosts(cwd, ['x']).passed).toBe(true);
  edit(posts, 'x', s => s.replace(/^A checklist should not need[^\n]*\n---/m, 'Some other opening about a list with a citation.\n---'));
  expect(rulesFor(cwd, 'x')).toContain('variants.hook');
  expect(() => pickVariant(cwd, 'github-release', 1)).toThrow('no variants');
}));

it('applies the researched founder voice when no voice.json exists', project((cwd, posts) => {
  edit(posts, 'github-release', s => s.replace('Review the source before running it locally.', 'Review the seamless, cutting-edge source before running it locally!!'));
  expect(rulesFor(cwd, 'github-release')).toEqual(expect.arrayContaining(['voice.hype', 'voice.exclamation']));
  const guide = loadVoiceGuidelines();
  expect(guide.rules.map(r => r.id)).toEqual(expect.arrayContaining(['pain-first', 'limits', 'by-hand']));
  expect(guide.sources.every(s => /^https:\/\//.test(s.url))).toBe(true);
  expect(readFileSync(writeBriefs(cwd, ['x']).briefs[0], 'utf8')).toContain('Researched founder voice'.slice(0, 0) + guide.rules[0].rule);
}));

it('briefs carry the template, real exemplars and the opening pain', project(cwd => {
  const brief = readFileSync(writeBriefs(cwd, ['show-hn']).briefs[0], 'utf8');
  expect(brief).toContain('## Open with this');
  expect(brief).toContain('pain 1: Keep a small daily workflow understandable');
  expect(brief).toContain('## Template for show-hn');
  expect(brief).toContain('https://news.ycombinator.com/item?id=');
  expect(brief).not.toContain('Every sentence with a number or feature name needs [claim:id]');
  for (const channel of ['show-hn', 'devto']) expect(loadExemplars(channel).examples.length).toBeGreaterThanOrEqual(3);
  for (const channel of ['x', 'product-hunt', 'linkedin', 'reddit', 'tiktok']) {
    const exemplars = loadExemplars(channel);
    expect(exemplars.examples).toEqual([]);
    expect(exemplars.patterns.length).toBeGreaterThan(0);
  }
}));

it('judge gate rewrites up to three loops and then red-flags with reasons', project(async (cwd, posts) => {
  const judgeDir = join(posts, 'judge');
  const scores = (value: number) => {
    const hash = createHash('sha256').update(readFileSync(join(posts, 'x.md'))).digest('hex');
    mkdirSync(judgeDir, { recursive: true });
    writeFileSync(join(judgeDir, 'x.scores.json'), JSON.stringify({ sourceHash: hash, judge: 'test judge',
      scores: Object.fromEntries(criteria.map(c => [c, c === 'hook' ? value : 9])), reasons: ['hook: lead with the result'] }));
  };
  const first = judgePosts(cwd, ['x']);
  expect(existsSync(join(judgeDir, 'x.md'))).toBe(true);
  expect(readFileSync(join(judgeDir, 'x.md'), 'utf8')).toContain('specificity');
  expect(first.verdicts[0].source).toBe('local');
  scores(9);
  expect(judgePosts(cwd, ['x']).verdicts[0]).toMatchObject({ status: 'pass', source: 'model', judge: 'test judge' });
  const loops = [];
  for (let i = 0; i < 3; i++) {
    edit(posts, 'x', s => s + '\n');
    scores(6);
    loops.push(judgePosts(cwd, ['x']).verdicts[0]);
    expect(judgePosts(cwd, ['x']).verdicts[0].attempts).toBe(loops.at(-1)!.attempts);
  }
  expect(loops.map(v => v.status)).toEqual(['rewrite', 'rewrite', 'flagged']);
  expect(loops[2].reasons).toContain('hook: lead with the result');
  const stale = JSON.parse(readFileSync(join(judgeDir, 'x.scores.json'), 'utf8'));
  writeFileSync(join(judgeDir, 'x.scores.json'), JSON.stringify({ ...stale, sourceHash: 'f'.repeat(64) }));
  expect(judgePosts(cwd, ['x']).verdicts[0].source).toBe('local');
}));

it('review shows sources on hover, variants and the judge red flag without raw tags', project(async (cwd, posts) => {
  for (const name of readdirSync(posts)) if (name !== 'show-hn.md') rmSync(join(posts, name), { recursive: true, force: true });
  const config = JSON.parse(readFileSync(join(cwd, '.launch/config.json'), 'utf8'));
  writeFileSync(join(cwd, '.launch/config.json'), JSON.stringify({ ...config, channels: ['show-hn'] }));
  const hash = createHash('sha256').update(readFileSync(join(posts, 'show-hn.md'))).digest('hex');
  writeFileSync(join(posts, 'judge.json'), JSON.stringify({ posts: [{ channel: 'show-hn', sourceHash: hash, source: 'model',
    scores: Object.fromEntries(criteria.map(c => [c, 5])), local: Object.fromEntries(criteria.map(c => [c, 5])),
    reasons: ['proof: cite a number'], attempts: 3, status: 'flagged' }] }));
  const html = readFileSync((await buildReview(cwd)).path, 'utf8');
  const card = html.split('<article data-channel="show-hn">')[1].split('</article>')[0];
  expect(card).not.toContain('[claim:');
  expect(card).toContain('<span class="cited" title="Source interface: The CLI adds and lists tasks in a local JSON file. (bin/tasklight.js)">');
  expect(card).toContain('title="Source pain:1: Keep a small daily workflow understandable without complex setup.');
  expect(card).toContain('Red flag');
  expect(card).toContain('proof: cite a number');
  expect(card).toContain('Title variants');
  expect(card).toContain('liftoff pick --channel show-hn --variant 2');
}));

it('blind test randomizes A/B, records only supplied answers and needs 80% of real votes', project(async (cwd, posts) => {
  expect(() => tallyBlindTest(cwd)).toThrow('prepare');
  const waiting = prepareBlindTest(cwd, 3);
  expect(waiting.ready).toBe(false);
  const prompt = readFileSync(join(cwd, '.launch/blind-test/plain-claude-prompt.md'), 'utf8');
  expect(prompt).toContain(plainPrompt);
  expect(prompt).toContain(readFileSync(join(cwd, 'README.md'), 'utf8').trim());
  writeFileSync(join(cwd, '.launch/blind-test/plain/show-hn.md'), 'Show HN: Tasklight, a simple CLI\n\nI built a revolutionary CLI.');
  writeFileSync(join(cwd, '.launch/blind-test/plain/x.md'), 'Excited to share Tasklight!');
  expect(() => prepareBlindTest(cwd, 2)).toThrow('3 to 5');
  const ready = prepareBlindTest(cwd, 3);
  expect(ready.ready).toBe(true);
  const data = JSON.parse(readFileSync(join(cwd, '.launch/blind-test.json'), 'utf8'));
  expect(data.testers).toHaveLength(3);
  const sheet = readFileSync(ready.sheets![0], 'utf8');
  expect(sheet).toContain('Which would you click?');
  expect(sheet).not.toMatch(/liftoff|plain claude/i);
  expect(sheet).not.toContain('[claim:');
  expect(sheet).not.toContain('First comment outline');
  expect(tallyBlindTest(cwd)).toMatchObject({ passed: false, note: expect.stringContaining('3 real developers') });
  const liftoffSide = (i: number, channel: 'show-hn' | 'x') => data.testers[i].liftoffIs[channel] as string;
  const other = (side: string) => side === 'A' ? 'B' : 'A';
  for (const channel of ['show-hn', 'x'] as const) for (let i = 0; i < 3; i++) {
    const pick = i === 2 && channel === 'x' ? other(liftoffSide(i, channel)) : liftoffSide(i, channel);
    recordBlindTest(cwd, { tester: 'tester-' + (i + 1), channel, click: pick, trust: liftoffSide(i, channel),
      missingA: liftoffSide(i, channel) === 'A' ? 'a real number' : 'nothing', missingB: liftoffSide(i, channel) === 'B' ? 'a real number' : 'nothing' });
  }
  const tally = tallyBlindTest(cwd);
  expect(tally.channels.find(c => c.channel === 'show-hn')).toMatchObject({ votes: 3, liftoffClick: 3, passed: true });
  expect(tally.channels.find(c => c.channel === 'x')).toMatchObject({ votes: 3, liftoffClick: 2, needed: 3, passed: false });
  expect(tally.passed).toBe(false);
  expect(readFileSync(writeBriefs(cwd, ['x']).briefs[0], 'utf8')).toContain('## What blind testers said was missing last time\n\n- a real number');
  judgePosts(cwd, ['x']);
  expect(readFileSync(join(posts, 'judge/x.md'), 'utf8')).toContain('- a real number');
  expect(() => recordBlindTest(cwd, { tester: 'tester-9', channel: 'x', click: 'A', trust: 'A', missingA: '', missingB: '' })).toThrow('Unknown tester');
  expect(() => prepareBlindTest(cwd, 3)).toThrow('--force');
}));
