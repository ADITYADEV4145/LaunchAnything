import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeBriefs } from '../copy/write.js';
import { checkPosts, parsePost } from '../copy/check.js';
import { judgePosts, criteria } from '../copy/judge.js';
import { createHash } from 'node:crypto';
import type { Check, CheckContext } from './types.js';

function setup({ cwd }: CheckContext) {
  const base = join(cwd, '.liftoff-fixture/phase2');
  const expected = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/expected.json'), 'utf8'));
  mkdirSync(join(cwd, '.launch'), { recursive: true });
  writeFileSync(join(cwd, '.launch/config.json'), JSON.stringify({
    profile: expected.profile, channels: expected.allowedChannels, launchType: 'new-product',
    timezone: 'UTC', launchDate: '2026-09-25', profileConfirmed: true
  }));
  cpSync(join(base, 'product.json'), join(cwd, '.launch/product.json'));
  return { base, channels: expected.allowedChannels as string[] };
}
export const checks: Check[] = [
  { name: 'phase 2 briefs for every channel', run(ctx) {
    const { channels } = setup(ctx);
    const result = writeBriefs(ctx.cwd, channels);
    if (result.briefs.length !== channels.length || !result.briefs.every(existsSync)) throw new Error('Missing brief');
    for (const channel of channels) if (existsSync(join(ctx.cwd, '.launch/posts', channel + '.md'))) throw new Error('write generated a post');
  } },
  { name: 'phase 2 good posts pass', run(ctx) {
    const { base } = setup(ctx);
    cpSync(join(base, 'good'), join(ctx.cwd, '.launch/posts'), { recursive: true });
    const result = checkPosts(ctx.cwd);
    if (!result.passed) throw new Error(JSON.stringify(result.issues));
  } },
  { name: 'phase 2 v2 writing: hidden claims, pain-first openers and judge gate', run(ctx) {
    const { base, channels } = setup(ctx);
    const posts = join(ctx.cwd, '.launch/posts');
    cpSync(join(base, 'good'), posts, { recursive: true });
    for (const channel of channels) {
      const post = parsePost(readFileSync(join(posts, channel + '.md'), 'utf8'));
      if (/\[claim:/.test(post.title + post.body) || !post.citations?.length) throw new Error(channel + ' shows raw claim tags or has no citations');
    }
    const x = join(posts, 'x.md'), original = readFileSync(x, 'utf8');
    try {
      const first = parsePost(original).body.split('\n---\n')[0];
      writeFileSync(x, original.replaceAll(first, 'I built a thing for this.'));
      const rules = checkPosts(ctx.cwd, ['x']).issues.map(i => i.rule);
      if (!rules.includes('opener.banned')) throw new Error('Banned opener accepted: ' + rules.join(', '));
      writeFileSync(x, original);
      const statuses: string[] = [];
      mkdirSync(join(posts, 'judge'), { recursive: true });
      for (let loop = 0; loop < 3; loop++) {
        writeFileSync(x, original + '\n'.repeat(loop));
        writeFileSync(join(posts, 'judge/x.scores.json'), JSON.stringify({ sourceHash: createHash('sha256').update(readFileSync(x)).digest('hex'),
          judge: 'selftest', scores: Object.fromEntries(criteria.map(c => [c, c === 'proof' ? 5 : 9])), reasons: ['proof: cite a metric'] }));
        statuses.push(judgePosts(ctx.cwd, ['x']).verdicts[0].status);
      }
      if (statuses.join() !== 'rewrite,rewrite,flagged') throw new Error('Judge gate loops: ' + statuses.join());
    } finally { writeFileSync(x, original); rmSync(join(posts, 'judge'), { recursive: true, force: true }); rmSync(join(posts, 'judge.json'), { force: true }); }
  } },
  ...Object.entries({ 'too-long': 'thread.post-length', uncited: 'claims.uncited', banned: 'words.banned', links: 'links.count', 'reddit-flair': 'reddit.flair-required' }).map(([seed, rule]): Check => ({
    name: 'phase 2 bad ' + seed + ' fails ' + rule, run(ctx) {
      const { base } = setup(ctx);
      const channel = seed === 'banned' ? 'show-hn' : seed === 'reddit-flair' ? 'reddit' : 'x';
      const post = join(ctx.cwd, '.launch/posts', channel + '.md');
      mkdirSync(join(ctx.cwd, '.launch/posts'), { recursive: true });
      const previous = existsSync(post) ? readFileSync(post) : undefined;
      try {
        cpSync(join(base, 'bad', seed + '.md'), post);
        const result = checkPosts(ctx.cwd, [channel]);
        if (result.passed || !result.issues.some(issue => issue.rule === rule)) throw new Error(JSON.stringify(result));
      } finally { if (previous) writeFileSync(post, previous); else rmSync(post, { force: true }); }
    }
  }))
];
