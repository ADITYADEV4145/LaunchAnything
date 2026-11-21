import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { context } from './context.js';
import { loadPlatform } from './platforms.js';

export function writeBriefs(cwd: string, selected?: string[]) {
  const ctx = context(cwd, selected);
  const directory = join(ctx.paths.posts, 'briefs');
  mkdirSync(directory, { recursive: true });
  const briefs = ctx.channels.map(channel => {
    const path = join(directory, channel + '.md');
    writeFileSync(path, [
      '# Writing brief: ' + channel,
      'Write the post yourself; liftoff never generates or publishes copy.',
      '## Grounded product facts and claim IDs', JSON.stringify(ctx.product, null, 2),
      'Use only supported facts. Every sentence with a number or feature name needs [claim:id]. Declare all cited IDs in claims. Titles can carry citations too.',
      '## Platform rules', JSON.stringify(loadPlatform(channel), null, 2),
      'Editorial limits are conservative local budgets, not guarantees of platform acceptance.',
      '## Tone', String(ctx.profile.tone), '## Brand voice', ctx.brand || 'No brand kit supplied.',
      '## Optional copywriting polish', ctx.copywriting.length ? ctx.copywriting.join('\n') : 'copywriting skill not detected.',
      'If present, run the copywriting skill after drafting; preserve facts and citations.',
      '## Exact output format',
      'Write .launch/posts/' + channel + '.md, with YAML front matter followed by Markdown:',
      '\n```markdown\n---\nchannel: ' + channel + '\ntitle: "A factual title"\nmedia: []\nclaims: [claim-id]\n# link: https://your-real-tryable-product.example\n---\nA factual sentence [claim:claim-id].\n```',
      'Do not include the code fence in the file. media entries are {slot, path?}. link is optional unless required by the platform.',
      'For X threads separate posts with a line containing exactly --- (after front matter). Each post must fit independently.',
      'For LinkedIn make the first paragraph a hook within 210 characters. A link may instead go in the first comment; do not add it to front matter in that case.',
      'Product Hunt title is the tagline; body is the maker comment. Use gallery-1 etc. media slots for supplied gallery assets.',
      'Reddit: check the target subreddit rules manually, disclose affiliation and select its required flair before posting.',
      'Run liftoff check; fix the rule IDs in fix-list.md and re-check. After three failed checks ask the user.'
    ].join('\n\n') + '\n');
    return path;
  });
  return { briefs, copywriting: ctx.copywriting };
}
