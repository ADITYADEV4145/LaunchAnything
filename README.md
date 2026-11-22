# Liftoff

Repo in, launch kit out — with grounded claims and human approval.
TypeScript CLI and agent skill for Node.js 22+. No server, database or LLM API calls.

**Implemented:** phase-1 init/scan/validate/plan and phase-5 review/local staging,
plus doctor and fixture checks. Phases 2–4 and 6 remain explicit stubs (exit 2).

## Install

```sh
npm install -g launch-liftoff
liftoff doctor --json
```

For development: `npm ci`, `npm run dev -- doctor`. Build with `npm run build`;
test with `npm test`; check types with `npm run typecheck`.

## Proof: two repos, nothing posted

- [GroundWork: from a symbol lookup to a launch kit](docs/case-studies/groundwork.md)
- [Agent Linux: a launch kit without booting the Mac-only VM](docs/case-studies/agentlinux.md)

See what Liftoff produced, what still took judgment, and where the approval gate stopped each dry run.

## Commands

All commands accept `--json` and `--cwd <repository>`. JSON is one object:
`{ok, command, data}` on success, `{ok, command, error}` on failure.
Selftest retains its per-check report in data even when some checks fail.

| Phase | Commands | Status |
| --- | --- | --- |
| 0b | audience | Local Kit waitlist preview, community map, and audience drafts |
| 1 | init, scan, validate, plan | Implemented |
| Foundation | doctor, selftest --through N | Implemented; phase 1 and 5 checks |
| 2 | write, check | Stubs |
| 3 | shots, images | Stubs |
| 4 | video | Stub |
| 5 | review, publish | Local approval and staging; no external posting |
| 5b | connect, publish --confirm --assist | Own accounts; official PH draft MCP, X discovery/manual fallback, browser-assisted HN/Reddit |
| 6 | results, learn, receipt | Stubs |

Doctor lists skill names, MCP server names (never configuration values), and executable
availability. Missing extras never fail it. CLI tool detection uses PATH; it does not
download or execute npm packages. Later phases may add local-package adapters.

## Folder contract

**Find your first readers before launch day.** Once you have a checked
[Pain Report](skill/references/phase0.md), run `liftoff audience prepare` to find
where the problem is already being discussed. You get a community map, conversation
starters, and a Kit waitlist preview under `.launch/audience/` — nothing goes live.
[Try the local workflow](skill/references/phase0b.md).

For offline launch readiness, run `liftoff prelaunch --init`, then follow the
[pre-launch guide](skill/references/prelaunch.md) to score readiness, audit launch
pages and support, and draft tracking links and a signup form.

All paths below are relative to `<cwd>/.launch/`:

```text
config.json    scan.json     product.json    plan.md
posts/         shots.yaml    media/          video/
review/        approvals.json                published.json
results.json   report.md
```

Schemas live in schemas/ (JSON Schema draft 2020-12). Post schema covers parsed Markdown
front matter; shots schema covers parsed YAML. History is stored separately at
`~/.liftoff/history.json`. Markdown, media and directories are not JSON documents.
Product features and claims require file/commit/URL sources. Schema validation checks
structure; later commands enforce source existence, citations, approvals and privacy.

Profile/channel YAML is under rules/. Posting times are initial heuristics in the
configured timezone, not researched performance promises. Phase 2 owns rules/platforms/.

## Add a phase

1. Replace only your command modules in src/commands/.
2. Put implementation in phase-owned directories listed in CONTRIBUTING/AGENTS.md.
3. Replace your src/selftest/phaseN.ts checks; add fixture data under each
   fixtures/*/.liftoff-fixture/ with phase-specific names.
4. Add tests in tests/phaseN.test.ts and run the gate.

The selftest registry runs phases 1..N on fresh temporary copies of all three fixtures.
Each copy gets a deterministic Git baseline, tag v0.1.0 and later commit; copies are
removed after the run. Phases 2–4 and 6 intentionally fail until implemented,
so cumulative gates above phase 1 still report those unimplemented phases.
Fixtures ship in npm so installed selftest works without a source checkout.

## Safety

Never publish without human approval of the exact post and media hash. Never auto-post
to Hacker News or Reddit, and never auto-reply. Optional integrations need fallbacks.
Scan is offline by default; GitHub stars require --github or LIFTOFF_ALLOW_NETWORK=1.
Publish is a no-network preview by default; --confirm stages local artifacts only.
`--confirm --assist` opts into connected-account assistance: official Product Hunt
draft/readiness/preview (never submit), official X capability discovery with manual
fallback, or browser filling without Submit. LinkedIn accepts official API routes
only; direct API/Postiz/Buffer dispatch remains offline staging. See the
[own-account guide](skill/references/phase5b.md) for X review costs, keychain setup,
retry/manual recovery, caps and URL receipts. Tests and selftests use mocks only.
MIT; author Aditya.
