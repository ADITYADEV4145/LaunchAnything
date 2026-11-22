# Liftoff

Repo in, launch kit out — with grounded claims and human approval.
TypeScript CLI and agent skill for Node.js 22+. No server, database or LLM API calls.

**Implemented:** phase-1 init/scan/validate/plan and phase-5 review/local staging,
plus doctor and fixture checks. Phases 2–4 and 6 remain explicit stubs (exit 2).

## Install

```sh
npx skills add ADITYADEV4145/LaunchAnything
npm i -g launch-liftoff
liftoff setup
```

For development: `npm ci`, `npm run dev -- doctor`. Build with `npm run build`;
test with `npm test`; check types with `npm run typecheck`.

The skill is in `skill/SKILL.md` with a YAML name/description; the skills CLI
discovers SKILL.md files in repository subdirectories. Select `liftoff` when prompted.

### First kit (offline demo)

Run `liftoff demo` for a bundled Tasklight repository in a fresh temporary directory,
or `liftoff demo --dir ./my-demo --open` (the directory must not exist).
Each stage and total elapsed time are reported, ending at `.launch/review/index.html`.
Prepared fixture copy stands in for agent-written product facts and posts. No accounts,
network requests, LLM calls, publishing or posting are involved. Chrome and FFmpeg are
optional: missing tools skip their assets with a note. A local file opener is only
launched with `--open`. The sample kit is not approved launch copy for your product.

For your repository, `liftoff setup --yes --json` reports tools, fix commands and
PH/X/Kit/Postiz/GitHub connection commands without prompting or changing accounts.
Interactive setup connects one account at a time through the existing OS keychain;
tokens are read from environment variables, not recorded in configuration.
`liftoff setup --site https://example.com` explicitly fetches HTML only (no linked
resources); `--site-file ./site.html` imports offline. The imported `.launch/brand.json`
contains best-effort name, description, icon/logo URL, OG image, inline theme colors and
font families. `.launch/brand-kit.json` adapts the first color to the image accent
and first font to heading/body fonts. Import updates `config.brandKit` when initialized;
otherwise the next `init` discovers it. Remote logo URLs remain metadata (no logo is
downloaded). Missing fields retain image defaults; external CSS and JavaScript are not run.
`--voice ./samples/*.md` delegates to `voice learn`. Next run `liftoff init`.

`liftoff estimate [--stage write|video|publish|demo]` estimates agent input tokens
(chars/4), output tokens per planned channel, direct X API costs and render time.
These are deterministic planning heuristics, not bills or performance guarantees.
Write/video/publish/demo print a short estimate before running (suppressed in JSON).

### Privacy

Telemetry is **off by default**. `liftoff telemetry on|off|status` controls a local
`~/.liftoff/telemetry.json` file (`LIFTOFF_HOME` overrides the directory).
When on, demo records only allowlisted stage, completion, rounded durationMs and
CLI version in `telemetry-events.jsonl` beside the config. No content, paths, repo
names or handles are stored. **Local only; nothing is uploaded.** `DO_NOT_TRACK=1`
or `LIFTOFF_TELEMETRY=0` overrides opt-in. Delete these files to erase the data.

## Every release is a small launch

`liftoff release --draft` reads the new tag's commits since the previous tag and
writes a review-only kit under `.launch/releases/<tag>/`: changelog, GitHub notes,
scored selection, channel drafts, changed-screen captures and a relaunch plan.
Use `--issues closed-issues.json` for offline issue evidence, `--no-shots` to list
captures without taking them, and `releaseChannels` in config to select from x,
linkedin, email and devto. No LLM or publish adapter is called.

`liftoff progress [--since ISO-date] [--now ISO-date]` writes weekly X/LinkedIn
drafts with one latest real screenshot, or explicitly reports that none exists.
`liftoff release --install-action` installs the tag-push workflow. It runs
`liftoff release --draft --open-pr --json`, pushes only the kit and release history
and opens a review PR. GitHub Actions must be permitted to create PRs. Nothing
publishes; approve and post manually. See [release rules](skill/references/launch-ops.md).

## Proof: two repos, nothing posted

- [Showcase: full GroundWork and Agent Linux kits, media and review pages](showcase/README.md) — real pipeline runs; launch results and three outside-owner permissions are pending.
- [GroundWork: from a symbol lookup to a launch kit](docs/case-studies/groundwork.md)
- [Agent Linux: a launch kit without booting the Mac-only VM](docs/case-studies/agentlinux.md)

See what Liftoff produced, what still took judgment, and where the approval gate stopped each dry run.

## Commands

See the [channel guides](docs/channels/README.md) for rules, timing, formats,
automation boundaries and route-specific troubleshooting for all 15 channels.

## LaunchBench

**Liftoff win rate: not yet measured, pending human votes.**
LaunchBench compares agent-written Liftoff and plain-model posts for 20 real public
open-source products on Show HN and X. No votes, preferred posts or results are
fabricated; the CLI never calls an LLM. `liftoff bench prepare`, `bench pair`,
`bench record --votes FILE`, `bench score` and `bench run` support a reproducible
blind human comparison. See the [protocol and rerun instructions](bench/launchbench/README.md).

## Command reference

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

## Benchmark-backed product inputs

Before `liftoff write` or `liftoff brief`, product.json must validate. Use `problem: { summary, pains? }` (up to three researched pains with pain_index and exactly two source quotes), `audience: { who, where?, uses? }`, and `money_moment: { before, action, after }`. Communities and competitors are checked against local research when present. Existing proofPoints, features and claims remain required.

Configure `proof.benchmarks` in .launch/config.json with a slug name, optional command and 1–3 repos, results JSON path, and metrics (`metric`, `pointer`, `unit`, `context`). Run `liftoff proof run` (`--skip-run` reads recorded results; `--timeout <s>` defaults to 1800). `{repo}` is substituted in commands and result paths. No benchmarks? The command writes .launch/proof/plan.md and exits non-zero. It never invents measurements.

Paste emitted metrics into the required product.json `proof` array. Each includes `metric`, `value`, `unit`, `context`, `source_file` and an RFC 6901 `source_pointer`. Validation requires a schema-valid `.launch/proof/<name>.json` record, resolves the pointer within its `/results` subtree, and requires exact value equality. If the original results file is present, its SHA-256 must still match the record; otherwise rerun `liftoff proof run`. Do not type or fabricate benchmark values. Run `liftoff validate product --json`; errors block writing and brief generation.
