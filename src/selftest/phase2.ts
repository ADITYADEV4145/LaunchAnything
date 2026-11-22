import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeBriefs } from '../copy/write.js';
import { checkPosts } from '../copy/check.js';
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
