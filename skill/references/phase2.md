# Phase 2: channel-native copy

Run `liftoff write --json` after config and grounded product facts are ready.
Use `--channel x reddit` to select channels; otherwise config.channels is the plan.
Briefs live in .launch/posts/briefs; write posts in .launch/posts, never in briefs.
Read each brief's rules, tone, citations, format and optional brand voice.
If a local or home .claude/skills/copywriting/SKILL.md exists, use it for a polish
pass without inventing facts or removing citations. No network or LLM is called by liftoff.

Posts use YAML front matter: channel, title, media (slot and optional path), claims,
and optional link. The body is Markdown. Put [claim:id] on each sentence containing
a number or product feature name and declare the ID in claims.
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
Malformed prior results and symlinked output paths are rejected rather than overwritten.
After at most three failed loops, stop and ask the user; check-state.json tracks
consecutive failures and resets on a pass. A pass removes the stale fix list.
Never fabricate tryable URLs: Show HN needs a working demo or runnable repository.
Manual checks still include subreddit rules/flair, media dimensions, link validity,
platform policy changes and approval. This tool never publishes.
