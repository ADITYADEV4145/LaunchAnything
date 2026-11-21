# Liftoff

Repo in, launch kit out — with grounded claims and human approval.
TypeScript CLI and agent skill for Node.js 22+. No server, database or LLM API calls.

**Foundation only:** doctor and the phase-1 fixture smoke gate work. Pipeline commands
are explicit stubs (exit 2); real phase-1 init/scan/validate/plan is next.

## Install

```sh
npm install -g launch-liftoff
liftoff doctor --json
```

For development: `npm ci`, `npm run dev -- doctor`. Build with `npm run build`;
test with `npm test`; check types with `npm run typecheck`.

## Commands

All commands accept `--json` and `--cwd <repository>`. JSON is one object:
`{ok, command, data}` on success, `{ok, command, error}` on failure.
Selftest retains its per-check report in data even when some checks fail.

| Phase | Commands | Foundation status |
| --- | --- | --- |
| 1 | init, scan, validate, plan | Stubs |
| Foundation | doctor, selftest --through N | Implemented; phase 1 smoke checks only |
| 2 | write, check | Stubs |
| 3 | shots, images | Stubs |
| 4 | video | Stub |
| 5 | review, publish | Stubs |
| 6 | results, learn, receipt | Stubs |

Doctor lists skill names, MCP server names (never configuration values), and executable
availability. Missing extras never fail it. CLI tool detection uses PATH; it does not
download or execute npm packages. Later phases may add local-package adapters.

## Folder contract

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
removed after the run. Phase 2–6 checks intentionally fail until implemented.
Fixtures ship in npm so installed selftest works without a source checkout.

## Safety

Never publish without human approval of the exact post and media hash. Never auto-post
to Hacker News or Reddit, and never auto-reply. Optional integrations need fallbacks.
The foundation makes no network calls except package installation. MIT; author Aditya.
