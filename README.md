# Liftoff

## Community distribution

`liftoff communities fetch [queries...]`, `liftoff communities import <file>`, `liftoff communities report` (or `liftoff communities`), and `liftoff communities check` discover evidence-backed communities and create local, manual-only drafts. Outputs: `.launch/communities.json` and `.launch/communities.md`. Optional founder account fallback: `.launch/communities/founder.json` with `{ "reddit": { "karma": 100, "accountAgeDays": 90 } }`. No posting or sending is performed.

Repo in, launch kit out — with grounded claims and human approval.
TypeScript CLI and agent skill for Node.js 22+. No server, database or LLM API calls.

Includes grounded planning, local media production, human review/local staging,
doctor and cumulative fixture checks.

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
| B | recommend [--history path] | Deterministic ranked channels, angles, founder-local schedule and skip reasons in .launch/recommendations.md; no publishing |
| Foundation | doctor, selftest --through N | Local dependency probes and cumulative checks through phase 7 (Part D media), plus Part I |
| 2 | write, check, judge, pick, claims strip, blind-test | Briefs with templates, exemplars and founder voice; checks; judge gate; blind test ([scripts/blind-test.md](scripts/blind-test.md)) |
| 3 | shots plan, shots, media polish, images, media judge | Storyboard capture, branded platform sets, safety and quality gates |
| 4 | video script, video voice, video, video check | Branded long/short cuts, optional voice, local music and ffmpeg fallback |
| 5 | review, publish | Local approval and staging; no external posting |
| 5b | connect, publish --confirm --assist | Own accounts; official PH draft MCP, X discovery/manual fallback, browser-assisted HN/Reddit |
| 6 | results, learn, receipt | Stubs |

Doctor lists skill names, MCP server names (never configuration values), and executable
availability, versions, stage requirements and install hints. Missing extras never
fail doctor itself. CLI detection uses PATH; Chrome also checks the bundled
Playwright browser and configured executable paths. Probes never download packages.

## Media workflow (local/offline)

```sh
liftoff shots plan                 # reads product.json money_moment; --force replaces a plan
# Review captions/actions against the repository; replace every TODO before capture.
liftoff shots                     # add --url http://127.0.0.1:3000 for a running web app
liftoff media polish
liftoff images                    # automatically polishes storyboards
liftoff media judge --json
liftoff video script --from-shots
liftoff video voice --dry-run
liftoff video --renderer ffmpeg --format 16x9,9x16
liftoff video check --format 16x9,9x16
liftoff media judge --json        # includes the rendered videos
```

The director makes 4–8 ordered shots with exactly one money moment. `money_moment`
may be an object with summary/before/after/proof, commands/setup or route, and
highlight; strings and missing values fall back to verified product copy. Planning
is a scaffold, not permission to invent claims or execute unreviewed commands.
Legacy shots without new fields retain their original rendering path.

Storyboards use scale-2 web capture and light/dark variants, or VHS CLI tapes with
hidden setup. If VHS is absent, an HTML terminal plus ffmpeg is used. Tesseract is
required for storyboard safety checks; Chrome is required for media layouts.
FFmpeg/ffprobe are required for animation/video processing. VHS is optional, but
an installed VHS requires ttyd; a broken VHS installation is not silently skipped.
Run doctor for versions and actionable installation hints.

Polished shots in `.launch/media/polished/` have corner logos/wordmarks, frames,
shadows and accent highlights. Set `config.brandKit` to a local JSON file with
`logo`, `colors` and optional `music`, or put `logo.svg/png/jpg/webp` in media/;
without a logo, the product name is the wordmark. Platform files have exact sizes:
OG 1200×630, X 1600×900, LinkedIn 1200×627, YouTube 1280×720, Product Hunt
1270×760 and Instagram 1080×1350. X/OG/LinkedIn/YouTube/PH start from the polished
money moment. PH gets a gallery; Instagram gets five slides (hook, before, action,
after, CTA), with `instagram.png` aliasing slide 1. Reports retain source provenance.

Judge OCR-scans **all** media images, including raw captures, plus one frame per
second of animations/videos. Quality scores apply only to images/, polished/ and
rendered video frames. Banned content and incorrect X/PH-first provenance always
fail; errors name files/timestamps and rules without reproducing secret values.
Contact sheets, sampled frames and report.json are under `.launch/media/judge/`.
Any readability, focus, brand or clutter score below 8/10 fails with a fix.
Review runs this gate before building the approval page when finished media exists.

For a human/agent vision review, run `media judge --write-vision-template`, view
the contact sheets, supply honest 0–10 scores in the generated template, and save
it as `vision.json` in the judge directory. Each item uses `file`, `sha256`,
`readability`, `focus`, `brand`, `clutter`; image hashes bind original image bytes,
and `video.mp4@Ns` hashes bind that sampled PNG. Valid per-asset scores override
heuristics; stale hashes are rejected. They cannot override banned content or
provenance. `--heuristic-only` ignores vision overrides and is used by selftest.

Role-based scripts render 45–60s at 16x9/1x1 and 20–35s at 9x16; legacy scripts
keep their 30–60s rule. Every scene has corner branding, a high-contrast caption
plate, and money-moment highlights. Music is a deterministic local pad by default;
use `--music <file>` or brandKit.music to replace it. `video voice` is the only
optional network adapter: explicitly run it with ELEVENLABS_API_KEY (and optional
ELEVENLABS_VOICE_ID) to create indexed vo/*.mp3 files. Dry-run writes nothing and
never sends requests; no key reports captions-only. Never commit credentials.

### Standalone media renderers

These exports need `.launch/product.json` and local source files, not shots.yaml:

```ts
import { renderCarousel } from 'launch-liftoff/dist/media/platform-images.js';
import { renderClip } from 'launch-liftoff/dist/video/clip.js';

await renderCarousel(cwd, [{ role: 'hook', caption: verifiedCaption }], {
  size: 'instagram', outDir: 'out', prefix: 'launch',
}); // { files, report }; optional slide.source is a local image path
await renderClip(cwd, [{ role: 'after', caption: verifiedCaption,
  source: 'out/launch.png', duration: 5 }], {
  format: '9x16', outFile: 'out/clip.mp4', renderer: 'ffmpeg',
}); // { file, duration, receipt }; adds a three-second end card
```

Carousel options are `size`, `outDir`, `prefix`. Clip options include `format`,
`music`, indexed local `voice` paths, `outFile`, and `renderer`. Durations are used
verbatim by renderClip; script generation owns the long/short duration policy.
Neither standalone renderer calls a voice API.

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
removed after the run. Phase 7 is a dedicated, slower Part D media regression gate;
`selftest --through 6` retains the baseline launch workflow. Run
`selftest --through 7 --json` to include Part D checks on
cli-tool and saas-next: money-moment planning, rejected unsafe frames and cleanup,
capture/polish, exact platform dimensions and five-slide carousel, heuristic judge,
and rendered long/short video durations. No GroundWork run or external API is used.
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
