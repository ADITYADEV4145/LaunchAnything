import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProduct } from '../product/validate.js';
import { context } from './context.js';
import { loadPlatform } from './platforms.js';
import { assertSafePath } from './safe-path.js';
import { loadVoice } from '../voice/learn.js';
import { groundedClaims, pains, proofs, proofText } from './citations.js';
import { loadExemplars, loadVoiceGuidelines } from './guides.js';
import { blindFeedback } from './blind-test.js';

export function writeBriefs(cwd: string, selected?: string[]) {
  const ctx = context(cwd, selected);
  const checked = validateProduct(cwd, ctx.product);
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const directory = join(ctx.paths.posts, 'briefs');
  assertSafePath(cwd, directory);
  for (const channel of ctx.channels) assertSafePath(cwd, join(directory, channel + '.md'));
  mkdirSync(directory, { recursive: true });
  const briefs = ctx.channels.map(channel => {
    const path = join(directory, channel + '.md');
    const platform = loadPlatform(channel, cwd), voice = loadVoice(cwd), exemplars = loadExemplars(channel, cwd);
    const guide = loadVoiceGuidelines(), feedback = blindFeedback(cwd, channel);
    const variant = platform.template?.variants === 'title'
      ? 'variants:\n  title:\n    - "' + (channel === 'show-hn' ? 'Show HN: ' + ctx.product.name + ' – <what it does, plain words>' : '<tagline A>') + '"\n    - "<variant B>"\n'
      : platform.template?.variants === 'hook' ? 'variants:\n  hook:\n    - "<post 1, option A: the pain>"\n    - "<post 1, option B: the result>"\n' : '';
    writeFileSync(path, [
      '# Writing brief: ' + channel,
      'Write the post yourself; liftoff never generates or publishes copy.',
      '## Open with this',
      'Every draft opens with the top pain or the strongest proof metric. Never open with "I built", "Introducing" or "Excited to".',
      pains(ctx.product).map((p, i) => '- pain ' + (i + 1) + ': ' + p.text + (p.quotes.length ? ' — in their words: ' + p.quotes.slice(0, 2).map(q => JSON.stringify(q)).join(', ') : '')).join('\n') || '- No pain recorded in product.json; run liftoff research first.',
      proofs(ctx.product).map(p => '- proof ' + p.metric + ': ' + proofText(p)).join('\n') || '- No proof metrics in product.json yet.',
      ...(() => { const m = (ctx.product as { money_moment?: { before: string; action: string; after: string } }).money_moment;
        return m ? ['Money moment (lead media and gallery image 1): before ' + m.before + ' → ' + m.action + ' → after ' + m.after + '.'] : []; })(),
      '## Grounded product facts and claim IDs', JSON.stringify(ctx.product, null, 2),
      'Citable IDs: ' + groundedClaims(ctx.product).map(c => c.id).join(', ') + '.',
      'Use only supported facts. Keep the post text clean: no [claim:...] tags. Instead list each factual sentence (any number or feature name) under citations in front matter, quoted exactly, with the claim, proof or pain it rests on. The review page shows each source on hover. Declare cited claim IDs in claims.',
      '## Template for ' + channel, (platform.template?.summary ?? ['No channel template; follow the platform rules.']).map(line => '- ' + line).join('\n'),
      '## What good looks like', exemplars.source,
      exemplars.patterns.map(p => '- ' + p).join('\n') || '- No patterns recorded.',
      exemplars.examples.slice(0, 3).map(e => '> ' + e.title + (e.excerpt ? '\n> ' + e.excerpt : '') + '\n> ' + e.url + '\n\nWhy it works: ' + e.why).join('\n\n') || 'No real exemplars stored for this channel.',
      ...(feedback.length ? ['## What blind testers said was missing last time', feedback.map(f => '- ' + f).join('\n')] : []),
      '## Platform rules', JSON.stringify(platform, null, 2),
      '## Founder voice', voice ? JSON.stringify(voice, null, 2)
        : guide.note + '\n\n' + guide.rules.map(r => '- ' + r.rule + (r.avoid ? ' Avoid: ' + r.avoid + '.' : '') + (r.prefer ? ' Prefer: ' + r.prefer : '')
          + ' (' + (guide.sources.find(s => s.id === r.source)?.url ?? r.source) + ')').join('\n'),
      'Editorial limits are conservative local budgets, not guarantees of platform acceptance.',
      '## Tone', String(ctx.profile.tone), '## Brand voice', ctx.brand || 'No brand kit supplied.',
      '## Optional copywriting polish', ctx.copywriting.length ? ctx.copywriting.join('\n') : 'copywriting skill not detected.',
      'If present, run the copywriting skill after drafting; preserve facts and citations.',
      '## Exact output format',
      'Write .launch/posts/' + channel + '.md, with YAML front matter followed by Markdown:',
      '\n```markdown\n---\nchannel: ' + channel + '\ntitle: "A factual title"\n' + variant + 'media: []\nclaims: [claim-id]\ncitations:\n  - { text: "The exact factual sentence.", claim: claim-id }\n  - { text: "The opening pain sentence.", pain: 1 }\n# link: https://your-real-tryable-product.example\n---\nThe opening pain sentence. The exact factual sentence.\n```',
      'Write two variants where the template asks for them; the title (or post 1) must be one of them. liftoff pick --channel ' + channel + ' --variant 2 swaps in the other.',
      'Do not include the code fence in the file. media entries are {slot, path?}. link is optional unless required by the platform.',
      'For X threads separate posts with a line containing exactly --- (after front matter). Each post must fit independently.',
      'For LinkedIn make the first paragraph a hook within 210 characters. For a first-comment link, set linkFirstComment: true and link: https://your-real-url in front matter; keep URLs out of the body. The link still counts toward maxLinks.',
      'Product Hunt title is the tagline (60 characters). Body must contain a ## Maker comment section with text. Use gallery-1 etc. media slots for supplied gallery assets, adding width: 1270 and height: 760. When supplying gallery images, provide at least two. These sizes are unverified local budgets, not confirmed live requirements.',
      'Reddit front matter must name subreddit: r/SideProject (or another configured target), optional flair: "Target flair", and selfPromotion: true (default). A configured flair requirement or forbidden self-promotion policy is enforced. Unknown targets fail. Restricted communities require manual review of permitted timing and topics.',
      'Read verifiedFields and verificationNotes: null lastVerified means no constraint value was confirmed. Unverified policies are conservative local gates, not current platform guarantees. Show HN links must be ready to try now; live availability is a human check.',
      'Run liftoff check; fix the rule IDs in fix-list.md and re-check. After three failed checks ask the user.',
      'Then run liftoff judge. A separate judge (another model or a person, never the writer) reads .launch/posts/judge/' + channel + '.md and scores hook, specificity, proof, native style, clarity and voice; every score must reach 8/10. Below that, rewrite and judge again, at most three loops; after that the draft goes to review with a red flag and the judge\'s reasons.'
    ].join('\n\n') + '\n');
    return path;
  });
  return { briefs, copywriting: ctx.copywriting };
}
