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
LinkedIn's first paragraph is the hook. First-comment links stay outside the post.

Run `liftoff check --json`. Rewrite using .launch/posts/fix-list.md and re-check.
After at most three failed loops, stop and ask the user; check-state.json tracks
consecutive failures and resets on a pass. A pass removes the stale fix list.
Never fabricate tryable URLs: Show HN needs a working demo or runnable repository.
Manual checks still include subreddit rules/flair, media dimensions, link validity,
platform policy changes and approval. This tool never publishes.
