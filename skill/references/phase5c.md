# Phase 5c: adapter registry

Run `liftoff adapters --cwd <project> --json` to inspect sites and the adapter
selected now. This is read-only. All adapters only stage local files, never post.
Selection prefers connected MCP names, then environment keys, then manual.

Drop one YAML file into `.launch/sites/` or `$LIFTOFF_HOME/sites/` (default
`~/.config/liftoff/sites/`). Discovery is cached per project for this process;
restart after editing site definitions. Duplicate IDs are errors, not overrides.

```yaml
kind: site
id: betalist
name: BetaList
version: 1
lastVerified: "2026-01-01"
sources: ["https://betalist.com/"]
submitUrl: https://betalist.com/submit
route: manual
channel:
  profiles: [devtool, indie-saas]
  bestPostingTimes: ["09:00"]
  bestPostingDays: [tue, wed, thu]
  leadTimeDays: 7
copy:
  verified: false
  verifiedFields: []
  verificationNotes: ["Verify submission policies yourself before use."]
  title: {required: true, maxLength: 80}
  body: {minLength: 20, maxLength: 1000}
  maxLinks: 1
  requiredLink: false
  bannedWords: []
  guidance: ["Describe the product factually."]
```

This illustrates the format, not verified BetaList policy. No bundled custom site
is claimed to be verified. Use the same copy fields as rules/platforms YAML,
excluding kind/id/name (version/date/sources come from the site). Channel fields
are the scheduling fields from rules/channels; identity/version/date are inherited.
Optional label and goal override receipt/review labels and plan rationale.

Manual is the default route: publish --confirm creates a paste kit and calendar
reminder after exact-content human approval. For offline integration staging set
route: integration and adapters: [postiz] (also buffer, ayrshare, github-release,
devto, email). This never enables network submission. Add the ID to config.channels
and use plan, write, check, review and publish normally. Unknown IDs are rejected.
