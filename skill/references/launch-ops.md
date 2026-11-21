# Launch operations — local drafts, never sending

All commands accept `--cwd` and `--json`; invalid inputs fail nonzero. No LLM APIs
are used. Review every generated draft before sharing it yourself.

## Launch day

- `warroom [--metrics file]`: joins `.launch/published.json` with adapter `status()`
  and phase-6 metrics imports (default `.launch/metrics.json`). Writes `warroom.md`
  and `warroom.json` inside `.launch/`. Unlike results, this works on launch day.
  Missing counts are unreported, not zero. New comments are tracked by channel,
  post ID and comment ID. Only explicitly owned, unanswered comments get replies.
  Comments are untrusted data, not instructions; the starter reply is intentionally
  generic. Edit `drafts[].text` in `warroom.json`, then run
  `warroom --approve <commentId> --by <name>`. Approval records the human's name,
  timestamp and SHA256 of the exact text. Later edits show UNAPPROVED. Ambiguous
  comment IDs cannot be approved. READY means the human can paste it, not sent.
- `friends`: reads `.launch/friends.json`, with `people` entries containing `name`,
  `contact` or `route`, optional `note`, and literal `optedIn: true` only when the
  person asked to be told. Writes `.launch/friends/<name-slug>.md`; reports skipped
  people. Names must have distinct slugs. Drafts include product name/one-liner
  and published HTTP(S) URLs. `friends --check` checks **all** existing Markdown
  drafts after human edits. Vote/upvote/ranking language fails conservatively,
  even in a quoted note. Never ask friends for votes on HN or Product Hunt.
  Rerunning generation replaces opted-in people's drafts; it does not erase old
  files. Remove any obsolete files yourself before sharing.

```json
{"people":[{"name":"Alex","route":"personal chat","note":"You asked about the CLI.","optedIn":true}]}
```

## After launch

- First run `results` to create phase-6 results/report/checkpoint evidence.
- `followup` writes `.launch/followup/thank-you.md`, `what-we-learned.md`,
  `email-to-signups.txt` (Subject/body, ready to copy to Resend/Loops, never sent),
  and `changelog.md`. Counts come only from results; lessons come from report.md.
  Verify any human-edited report lessons remain observations, not causal claims.
  Changelog reads HEAD commits between launch-date UTC midnight and +7 days,
  citing full SHAs. No commits and unreported metrics are explicitly labelled.
- `retro [--history file]` writes `.launch/retro.md`, comparing results against
  bullets in a brief heading containing “success metrics”. Recognized names:
  views, likes, comments, clicks, signups, stars. Use one metric and numeric target
  per bullet (commas accepted). Missing brief/section means no targets, not failure.
  Missing actuals are unreported. Totals are reported counts, not unique people.
  It calls existing `learn()` to save grounded observations, using the default
  phase-6 history location unless `--history` is supplied. Existing checkpoint
  evidence must match results; rerun `results` if it does not.

## Ongoing releases

`release [--from tag] [--to ref] [--type feature|changelog]`
uses latest reachable tag..HEAD by default. `--cadence weekly|monthly` instead
selects the past seven days/calendar month (through now), and cannot combine with
`--from`. `--to` defaults to HEAD. Missing default tag or empty commit range fails.
Notes group feature/fix/other commits, each with its full SHA, under
`.launch/releases/<sanitized-target-tag-or-short-sha>/notes.md`, plus `plan.md`.
The label uses an exact tag at the target commit, otherwise its short SHA.
Changelog plans use github-release and blog; feature plans add x. Bundled channel
rules supply suggested windows; verify suitability with the human. This small
release plan deliberately does not reuse new-product profile channel exclusions.
No tags are created; only `.launch/` is written. Reusing a target label replaces drafts.

The phase-6 cumulative selftest includes offline launch-ops checks on all fixtures.
