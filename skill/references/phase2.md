# Phase 2: channel-native copy

Run `liftoff write --json` after config and grounded product facts are ready.
Use `--channel x reddit` to select channels; otherwise config.channels is the plan.
Briefs live in .launch/posts/briefs; write posts in .launch/posts, never in briefs.
Read each brief's rules, tone, citations, format and optional brand voice.
If a local or home .claude/skills/copywriting/SKILL.md exists, use it for a polish
pass without inventing facts or removing citations. No network or LLM is called by liftoff.

Posts use YAML front matter: channel, title, media (slot and optional path), claims,
citations, optional variants and optional link. The body is Markdown and carries no
[claim:...] tags: list each sentence containing a number or product feature name
under citations, quoted exactly, with the claim ID, proof metric or pain it rests on
({ text, claim } / { text, proof } / { text, pain: 1 }); declare claim IDs in claims.
Old drafts with inline tags fail claims.inline-tag; `liftoff claims strip` moves them
into citations. The review page shows each cited sentence's source on hover.

Every draft opens with the top pain or the strongest proof metric, cited. Openers
"I built", "Introducing" and "Excited to" fail opener.banned. Each channel's template
is in its platform YAML (template) and enforced as template.* rules: Show HN title,
3-5 sentence description and ## First comment outline; X 4-6 posts, media on post 1,
link and question in the last post; Reddit disclosure and flair; DEV.to 800-1500
words with code, before/after, how it works and limits; Product Hunt tagline,
description, ## Maker comment under 200 words with an ask and ## Gallery order;
LinkedIn hook, paragraphs of at most two sentences and an image; vertical video
## Caption and ## On-screen text. Show HN and Product Hunt need variants.title and X
needs variants.hook (two each); `liftoff pick --channel x --variant 2` swaps them.
Briefs include real exemplars from rules/exemplars (plus .launch/exemplars) and, when
no voice.json exists, the researched founder voice in rules/voice/founder.yaml,
checked as voice.* rules. HN asks that Show HN text be typed by hand: treat that
draft as an outline the founder retells in their own words.

After check passes, run `liftoff judge`. It writes .launch/posts/judge/<channel>.md
for a separate judge (another model or a person, never the writer), which answers in
<channel>.scores.json with the post's sourceHash and 0-10 scores for hook,
specificity, proof, native, clarity and voice. Without that file a local heuristic
scores the draft. Every score must reach 8. Below that, rewrite from
.launch/posts/judge/fixes.md and judge again; after three loops the draft is kept
with status flagged and shows a red flag with the judge's reasons on review.
Blind testing against plain Claude follows scripts/blind-test.md.
X thread posts are separated by a line containing exactly --- after front matter.
Citations are stripped before measuring length. Title is Product Hunt's tagline,
email's subject, or the platform headline; Product Hunt body is the maker comment.
LinkedIn's first paragraph is the hook. First-comment links stay outside the body.
To stage a LinkedIn first-comment link, set linkFirstComment: true and link in front
matter; keep URLs out of the body. Product Hunt needs a ## Maker comment section.
Supplied gallery media use gallery-* slots with width and height metadata matching
the local gallery budget. Reddit requires subreddit metadata and, where configured,
flair; selfPromotion defaults to true and forbidden targets fail.
Read verifiedFields and verificationNotes before treating any budget as platform
policy. Unverified subreddit entries are conservative local gates, not live rules.

Run `liftoff check --json`. Rewrite using .launch/posts/fix-list.md and re-check.
Each check with valid config/product writes .launch/posts/check-results.json:
`{ "posts": [{ "channel": "x", "sourceHash": "<sha256>", "issues": [] }] }`.
sourceHash is lowercase SHA-256 of the exact Markdown file bytes, including front
matter, whitespace and line endings, even when parsing fails. Missing or unreadable
posts use null. Each issue contains only rule and message; cross-channel duplicate
issues appear on every affected checked channel. An empty issues array means that
channel passed that check, not that an old hash still matches the current file.
Results merge by channel: checked entries replace old entries; unchecked entries
remain unchanged (including stale hashes/issues), also when using --channel.
Consumers must compare sourceHash with the current file before trusting a pass.
Reports, rewrite state and fix lists are replaced atomically via a same-directory
temporary file and rename under the symlink guard. A failed write leaves the old
artifact intact. Malformed prior results are treated as empty; malformed state
resets rewrite attempts. Both recoveries appear in the check output's warnings.
Symlinked output paths are still rejected.
After at most three failed loops, stop and ask the user; check-state.json tracks
consecutive failures and resets on a pass. A pass removes the stale fix list.
Never fabricate tryable URLs: Show HN needs a working demo or runnable repository.
Manual checks still include subreddit rules/flair, media dimensions, link validity,
platform policy changes and approval. This tool never publishes.
