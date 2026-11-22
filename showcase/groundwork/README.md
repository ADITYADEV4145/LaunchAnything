# GroundWork launch kit

## Source and scope

Generated on 2026-11-22 from a disposable copy of
[GroundWork at 5874573](https://github.com/ADITYADEV4145/GroundWork/tree/587457364678e8162ac956ea6bada55e74c9e14d).
The original checkout was read-only. No earlier `.launch` kit was found there.
Every feature and claim in [product.json](product.json) cites files in that source
tree; those references are repository-relative, not files bundled with this kit.

## What was produced

- [Product manifest](product.json), [source scan](scan.json), [plan](plan.md),
  [authored brief](brief.md) and [printable brief](brief.html).
- Drafts for every planned channel: [Show HN](posts/show-hn.md),
  [Reddit](posts/reddit.md), [X thread](posts/x.md), [DEV article](posts/devto.md).
  First-person language is proposed maintainer copy for Aditya, not his approval.
- [Actual symbol lookup](media/shots/source-lookup.png),
  [verification-command help](media/shots/verify-options.png), animated terminal
  captures and six image sizes with [checks](media/images/report.json).
- [Silent, captioned square video](video/square-1x1.mp4) (30 seconds, about 2.1 MiB),
  its script/captions and [review page](review/index.html).
- [Post checker output](posts/check-results.json) and sanitized command records in
  [pipeline-record.json](pipeline-record.json) / [finish-record.json](finish-record.json).

## Commands run

Liftoff was built with `npm run build` in its own checkout. In the disposable
GroundWork copy, existing dependencies were reused and `npm run build` was run.
The real CLI initialized an index and returned matches for `findCode`:

```sh
node dist/cli/main.js --root . init --json
node dist/cli/main.js --root . symbols findCode --limit 3
```

The following commands used the built Liftoff `dist/cli.js`, with `--cwd` pointing
only at the disposable copy (`$LIFTOFF` is that built file; `$COPY` is the copy):

```sh
node "$LIFTOFF" init --cwd "$COPY" --profile devtool --yes --timezone UTC --date 2026-12-01 --json
node "$LIFTOFF" scan --cwd "$COPY" --json
# Agent wrote product.json after inspecting the real README and source files.
node "$LIFTOFF" validate product --cwd "$COPY" --json
node "$LIFTOFF" plan --cwd "$COPY" --json
node "$LIFTOFF" brief --cwd "$COPY" --json
node "$LIFTOFF" write --cwd "$COPY" --json
# After correcting a source interpretation, validate/plan/write were refreshed
# and brief --force regenerated its scaffold; the agent then authored brief/posts.
node "$LIFTOFF" shots --cwd "$COPY" --json
node "$LIFTOFF" images --cwd "$COPY" --json
node "$LIFTOFF" brief --cwd "$COPY" --json
node "$LIFTOFF" check --cwd "$COPY" --json
node "$LIFTOFF" video --renderer ffmpeg --format 1x1 --cwd "$COPY" --json
node "$LIFTOFF" review --cwd "$COPY" --json
```

The captures execute the commands in [shots.yaml](shots.yaml). No prepared demo
fixture, fabricated terminal output or generated product screenshot was used.
The images derive from those real captures; the video reuses the static captures
with captions, rather than recording an autonomous agent session. OCR was unavailable
(`ocr:false` in the capture manifest); terminal text passed the built-in privacy guard.

## Elapsed time and limits

About **153 seconds (2 minutes 33 seconds)** from the init configuration timestamp
(01:58:27 UTC) to review HTML creation (02:01:00 UTC), including agent authoring and
media work. This excludes initial repository copying/dependency/build preparation.
The Agent Linux run overlapped; this is one observed prepared-environment run,
not a new-user installation benchmark or a promised completion time.

Manifest validation and post checks reported success. There was no comparative
agent evaluation, hook-quality measurement, launch or external publishing.
Pain research, competitor research, pricing and audience fit remain unverified.
The plan's date is illustrative, not an approved schedule. Review the exact copy,
media and live community rules before approving anything. HN and Reddit remain manual.

## Results

**not launched yet, no real results — pending**

No posts were submitted and no approvals were granted. There are no measured
launch visits, signups, conversions, customer quotes or revenue to report.
Future results must include dated public links and evidence, not estimates.
