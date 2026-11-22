import { deepEqual, equal, match, ok } from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { launchDir } from '../core/launch-dir.js';
import { criteria, judgeKeys } from '../copy/judge.js';
import { loadReview } from '../review/posts.js';
import { MockBrowser } from '../connect/browser.js';
import { mockAdapter } from '../go/adapters.js';
import { go } from '../go/run.js';
import { parseSchedule } from '../go/schedule.js';
import type { PublishReceipt } from '../adapters/index.js';

const link = 'https://github.com/ADITYADEV4145/GroundWork';
const navigation = 'GroundWork searches symbols through a local index and prints file locations and signatures.';
const article = `Finding a definition in an unfamiliar repository can take longer than planning the edit itself.
I want the source in front of me before I ask an agent to change it.
This walkthrough uses the GroundWork launch kit as a reading exercise, not as a claim about agent accuracy.

## Before and after

Before starting a patch, I write down the behavior I want to change.
Then I look for the definition that owns that behavior.
A familiar name is a clue, not proof that I have found the right implementation.
I read the surrounding module and its callers before choosing where the edit belongs.
That pause matters most when several packages use similar names for different jobs.

After locating a candidate, I keep the file path beside my notes.
${navigation}
Those locations give me a place to start reading.
They do not tell me that a proposed patch is correct.
I still need to inspect the body, understand the inputs, and find the tests that describe the intended behavior.

## How it works

The recorded launch demo includes a symbol search against GroundWork itself.
The following command is the lookup shown in the bundled case study:

\`\`\`sh
node dist/cli/main.js --root . symbols findCode --limit 3
\`\`\`

I would use the returned locations to choose a file to open, rather than asking the agent to guess a replacement from a name.
The signature is useful context for reading a call.
It is not a substitute for checking the implementation and the conventions around it.
When a result looks promising, I follow the references in the source tree and read the nearby tests.

For a review, I keep observations separate from guesses.
An observation might be a definition that accepts an optional argument.
A guess might be that all callers always supply that argument.
I can check the guess by reading the callers, but I should not present it as established behavior before doing so.
This is the habit I want from an agent working beside me.

The launch screenshots are examples of the interface and the source lookup.
They are not a controlled comparison with another coding workflow.
I would not use an image of search results to claim that an agent made fewer mistakes.
That would need a separate evaluation with clearly described inputs, expected outcomes, and failures that another person could inspect.

## Reading a proposed patch

Once I have the relevant definition open, I ask what the patch changes for its caller.
Does it change an error into an empty result?
Does it add a requirement that was previously optional?
Does it move a decision from the caller into a shared helper?
These questions make the review more concrete than asking whether the new code looks tidy.

I also compare the proposed helper with the surrounding code.
A short implementation can still be the wrong abstraction if a nearby module already owns the same decision.
Conversely, similar spelling does not prove that unrelated behaviors should share a helper.
The source is what lets me distinguish those cases.
I want the agent to explain that distinction in terms of actual callers rather than broad style preferences.

For each changed behavior, I look for a focused test.
The normal case should show what the caller receives when its inputs are valid.
An empty case should explain what happens when there is nothing to return.
An error case should show what the caller can rely on when the underlying operation fails.
I do not treat a successful compile as evidence that all of those behaviors were exercised.

## Limits

This article describes a way to inspect source before editing it.
It does not establish that GroundWork improves an agent's final patch.
The bundled launch kit explicitly separates its real lookup demonstration from a benchmark comparison.
That boundary is useful: someone trying the project should know what the evidence shows and what remains an open question.

A lookup also cannot decide the right product behavior for a maintainer.
If a change alters what a user receives, I still need a decision about the intended behavior.
Reading more source may clarify the options, but it cannot replace that decision.
I would rather stop at a genuine ambiguity than quietly turn a technical guess into a product requirement.

## Try the reading exercise

I maintain this project, so this is an invitation to inspect my work rather than an independent endorsement.
Open the repository, choose an unfamiliar symbol, and compare its definition with a caller you can follow.
Keep the question small enough that another developer could check your conclusion from the same files.
If a result sends you to an unhelpful location, tell me which question you were trying to answer.

The feedback I want is specific to that reading step.
Was the location useful, was the signature enough to choose a file, and what did you still have to discover by hand?
Please avoid sharing private source or credentials in a public report.
The repository is here: ${link}
Which part of inspecting a proposed call would you want to see in the next demo?`;

export async function groundworkGoFixture(cwd: string) {
  const work = join(cwd, '.liftoff-fixture', 'phaseF-groundwork'), paths = launchDir(work);
  await mkdir(work, { recursive: true });
  await cp(join(packageRoot(), 'showcase/groundwork'), paths.root, { recursive: true });
  await rm(paths.posts, { recursive: true, force: true });
  await mkdir(join(paths.posts, 'judge'), { recursive: true });
  const channels = ['product-hunt', 'x', 'linkedin', 'devto', 'github-release', 'email', 'show-hn', 'reddit'];
  const timezone = 'America/Chicago';
  await writeFile(paths.config, JSON.stringify({ profile: 'devtool', launchType: 'new-product', profileConfirmed: true,
    channels, launchDate: '2026-12-01', timezone, approvers: [] }));
  const product = JSON.parse(await readFile(paths.product, 'utf8'));
  const screenshots = (await readdir(join(paths.media, 'shots'))).filter(name => name.endsWith('.png')).length;
  await mkdir(join(paths.root, 'proof'), { recursive: true });
  await writeFile(join(paths.root, 'proof/phaseF-groundwork.json'), JSON.stringify({ results: { screenshots } }));
  await writeFile(paths.product, JSON.stringify({ ...product, audience: { who: product.audience }, problem: { summary: product.problem },
    proof: [{ metric: 'bundled screenshot files', value: screenshots, unit: 'files', context: 'Counted in the copied launch kit, not a performance benchmark',
      source_file: '.launch/proof/phaseF-groundwork.json', source_pointer: '/results/screenshots' }],
    money_moment: { before: 'Find a definition before editing unfamiliar source', action: 'Inspect the recorded symbol lookup', after: 'Read the returned file locations and signatures' } }));
  const xHook = 'An unfamiliar call is hard to review when its definition is still a guess.';
  const bodies: Record<string, { title: string; body: string; extra?: Record<string, unknown> }> = {
    'product-hunt': { title: 'GroundWork: inspect definitions before editing', extra: { variants: { title: ['GroundWork: inspect definitions before editing', 'GroundWork: a local map for source review'] } },
      body: `Finding the right definition can interrupt a coding session. ${navigation}\n\n## Maker comment\n\nI maintain GroundWork because I want to read the source behind a proposed edit before trusting it. The launch demo records an actual lookup in the project itself. I am looking for feedback on confusing matches and false alarms, not claiming a measured improvement in agent accuracy. What would make a source lookup useful during your next review?\n\n## Gallery order\n\n- Source lookup screenshot\n- Verification options screenshot` },
    x: { title: 'GroundWork source-reading thread', extra: { variants: { hook: [xHook, 'A plausible function name does not show me what its implementation accepts.'] } },
      body: `${xHook}\n---\n${navigation}\n---\nMy demo records a real lookup, not a benchmark of final patch quality. I want to keep that distinction visible while collecting feedback.\n---\nTry inspecting a symbol before the next edit: ${link} Which missing context would make you open another file?` },
    linkedin: { title: 'Read the implementation behind a proposed call', body: `Reviewing an unfamiliar codebase is slower when the proposed call has no source context.\n\nFor my next review, I want the definition open beside the patch, rather than a confident explanation of what a function probably does.\n\n${navigation}\n\nI maintain this project and would like feedback from developers who check generated changes against existing code. Where does a source lookup fit into your review?` },
    devto: { title: 'Inspecting source before asking an agent for a patch', body: article },
    'github-release': { title: 'GroundWork: launch-kit source snapshot', body: `## Source snapshot\n\nStarting a patch without a definition leaves the reviewer guessing about the call. This source snapshot points to the recorded launch lookup and its limits.\n\n${navigation}\n\nReview the linked source before changing a caller. No agent accuracy result is claimed in this snapshot.` },
    email: { title: 'GroundWork: try a source lookup before your next edit', body: `Picking up an unfamiliar module can leave you unsure where to begin reading.\n\nYou asked to hear about this launch, so I am sharing the recorded lookup and the source behind it.\n\n${navigation}\n\nI maintain GroundWork and would value a reply about the context you still needed after opening a result. This demonstration does not measure patch correctness.\n\nRead the launch source: ${link}\nUse the sending tool's unsubscribe control if you no longer want updates.` },
    'show-hn': { title: 'Show HN: GroundWork – a local code map for source review', extra: { variants: { title: ['Show HN: GroundWork – a local code map for source review', 'Show HN: GroundWork – inspect symbols before changing a call'] } },
      body: `Finding a definition in a new repository can distract from the change you meant to make. ${navigation} I maintain this project and the launch demo records a real lookup, not a measured improvement in agent accuracy. Try the source at ${link}\n\n## First comment outline\n\n- Backstory: inspect definitions before changing calls.\n- Demo: follow the recorded lookup into the source.\n- Limits: no patch accuracy benchmark is claimed.\n- Feedback: which lookup result was hardest to interpret?` },
    reddit: { title: 'I want to inspect the definition before trusting a generated call', extra: { subreddit: 'r/SideProject', flair: 'Feedback', selfPromotion: true },
      body: `Getting oriented in someone else's repository often means chasing a name through several files. I maintain GroundWork and am sharing a small source-reading demo rather than a promise about generated patch quality.\n\n${navigation}\n\nThe attached launch kit shows the lookup on the project itself. I would like to hear which context you still need after finding a likely definition. Would you start with the caller or the implementation when checking an unfamiliar edit?\n\nDisclosure: I built this project. Source: ${link}` },
  };
  const firstSentence = (body: string) => body.replace(/^## .*\n+/, '').split(/(?<=[.!?])\s/)[0];
  for (const channel of channels) {
    const { title, body, extra } = bodies[channel];
    const citations: Record<string, unknown>[] = [{ text: firstSentence(body), pain: 1 }, { text: navigation, claim: 'navigation' }];
    if (channel === 'x') citations.push({ text: 'A plausible function name does not show me what its implementation accepts.', pain: 1 });
    if (channel === 'devto') citations.push({ text: 'node dist/cli/main.js --root . symbols findCode --limit 3', claim: 'navigation' });
    const media = ['x', 'linkedin'].includes(channel) ? [{ slot: 'hero', path: 'media/shots/source-lookup.png' }] : [];
    await writeFile(join(paths.posts, channel + '.md'), '---\n' + stringify({ channel, title, media, claims: ['navigation'], citations, link, ...extra }) + '---\n' + body + '\n');
  }
  await writeFile(join(paths.root, 'recommendations.md'), '| Local time | Channel | Local date |\n| --- | --- | --- |\n' +
    channels.map((channel, i) => `| 09:0${i} | ${channel} | 2026-12-01 |`).join('\n') + '\n');
  const slots = parseSchedule((await readFile(join(paths.root, 'recommendations.md'), 'utf8')), timezone);
  const review = await loadReview(work, undefined, channel => slots.find(slot => slot.channel === channel)!.scheduledAt);
  await writeFile(paths.approvals, JSON.stringify({ approvals: review.posts.map(post => ({ channel: post.channel, hash: post.hash,
    name: 'GroundWork fixture reviewer', time: '2026-11-30T15:00:00.000Z' })) }));
  for (const channel of channels) await writeFile(join(paths.posts, 'judge', channel + '.scores.json'), JSON.stringify({ ...judgeKeys(work, channel),
    judge: 'GroundWork deterministic fixture reviewer', scores: Object.fromEntries(criteria.map(key => [key, 9])), reasons: [] }));
  return { work, paths, channels, timezone };
}

export async function groundworkGoGate(cwd: string, log?: (message: string) => void) {
  const fixture = await groundworkGoFixture(cwd), { work, paths, channels, timezone } = fixture;
  const browsers = new Map<string, MockBrowser>(), questions: string[] = [];
  const adapter = mockAdapter(channel => {
    const browser = new MockBrowser(channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/123/mock/' : 'https://news.ycombinator.com/item?id=123');
    browsers.set(channel, browser); return browser;
  });
  const result = await go(work, { mock: true, confirm: true, yes: true, noWait: true, adapter, log,
    ask: async question => { questions.push(question); return true; } });
  if (!('board' in result) || !result.board) throw new Error('Missing mock board');
  equal(questions.length, 1); match(questions[0], /Product Hunt.*final Submit/);
  deepEqual(new Set(result.board.map(row => row.channel)), new Set(channels));
  ok(result.board.every(row => row.status === 'live' && row.url));
  const receipts = JSON.parse(await readFile(paths.published, 'utf8')).posts as PublishReceipt[];
  equal(receipts.length, channels.length);
  for (const channel of channels) ok(receipts.some(post => post.channel === channel && post.status === 'published' && post.url?.startsWith('https://')));
  for (const [index, channel] of channels.entries()) {
    const row: { at: string; scheduledAt: string } = result.timeline.find(entry => entry.channel === channel)!;
    equal(row.at, `2026-12-01 09:0${index} ${timezone}`);
    equal(row.scheduledAt, `2026-12-01T15:0${index}:00.000Z`);
  }
  deepEqual([...browsers.keys()].sort(), ['reddit', 'show-hn']);
  for (const browser of browsers.values()) {
    ok(browser.actions.some(action => action.action === 'open'));
    ok(browser.actions.some(action => action.action === 'fill'));
    ok(browser.actions.every(action => ['open', 'fill', 'select', 'upload', 'close'].includes(action.action)));
    ok(browser.actions.every(action => !/submit|button|click/i.test(action.selector ?? '')));
  }
  const center = await readFile(join(paths.root, 'warroom.md'), 'utf8');
  for (const post of receipts) { ok(center.includes(post.channel)); ok(center.includes(post.url!)); }
  await go(work, { mock: true, confirm: true, noWait: true,
    ask: async () => { throw new Error('PH final submit must not be requested twice for a live launch'); },
    adapter: { async publish() { throw new Error('Already live post dispatched twice'); } } });
  return { ...fixture, result, browsers, questions, receipts };
}
