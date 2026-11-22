# Agent Linux launch kit

## Source and scope

Generated on 2026-11-22 from a disposable copy of
[Agent Linux at b7c6f02](https://github.com/ADITYADEV4145/AgentLinux/tree/b7c6f02f20d92acd68258e1ecb15fa3359f8078d).
The original checkout was read-only. No earlier `.launch` kit was found there.
Each feature and claim in [product.json](product.json) cites real source files at
that revision; references are relative to the upstream tree, not this kit folder.

**This kit does not demonstrate a running Mac VM.** Agent Linux is a source-built
local developer preview for Apple silicon Macs, without public binaries or VM
images; the native app is not notarized. See the sourced manifest for boundaries.

## What was produced

- [Product manifest](product.json), [source scan](scan.json), [plan](plan.md),
  [authored brief](brief.md) and [printable brief](brief.html).
- Drafts for all planned channels: [Show HN](posts/show-hn.md),
  [Reddit](posts/reddit.md), [X thread](posts/x.md), [DEV article](posts/devto.md).
  First-person language is proposed maintainer copy for Aditya, not his approval.
- Captures of [built CLI help](media/shots/cli-overview.png) and
  [MCP command help](media/shots/mcp-options.png), animated terminal captures,
  and six image sizes with [checks](media/images/report.json).
- A [silent captioned square video](video/square-1x1.mp4) (30 seconds, about 4.4 MiB),
  script/captions and [review page](review/index.html).
- [Post checker output](posts/check-results.json) and sanitized command records in
  [pipeline-record.json](pipeline-record.json) / [finish-record.json](finish-record.json).

## Commands run

Liftoff was built with `npm run build` in its own checkout. The host CLI was built
in the disposable Agent Linux copy (Go dependencies were downloaded during setup):

```sh
go build -trimpath -o bin/agent-linux ./cmd/agent-linux
HOME=. bin/agent-linux --help
HOME=. bin/agent-linux mcp --help
HOME=. bin/agent-linux view --help
```

For help captures, `HOME=.` keeps help's default paths repository-relative; it does
not create or simulate a guest machine. The commands below used Liftoff's built
`dist/cli.js`, with `--cwd` targeting only the copy (`$LIFTOFF` is the built file;
`$COPY` is the disposable repository):

```sh
node "$LIFTOFF" init --cwd "$COPY" --profile devtool --yes --timezone UTC --date 2026-12-01 --json
node "$LIFTOFF" scan --cwd "$COPY" --json
# Agent wrote product.json after reading the real README, CLI and guides.
node "$LIFTOFF" validate product --cwd "$COPY" --json
node "$LIFTOFF" plan --cwd "$COPY" --json
node "$LIFTOFF" brief --cwd "$COPY" --json
node "$LIFTOFF" write --cwd "$COPY" --json
# Agent authored the brief, channel posts, shots specification and video script.
node "$LIFTOFF" shots --cwd "$COPY" --json
node "$LIFTOFF" images --cwd "$COPY" --json
node "$LIFTOFF" brief --cwd "$COPY" --json
node "$LIFTOFF" check --cwd "$COPY" --json
node "$LIFTOFF" video --renderer ffmpeg --format 1x1 --cwd "$COPY" --json
node "$LIFTOFF" review --cwd "$COPY" --json
```

No bundled fixture or fabricated output was used. [shots.yaml](shots.yaml) executes
the actual built CLI. Media is browser-rendered terminal help, not a product desktop
capture; the video repeats static captures with honest limitation captions.
OCR was unavailable (`ocr:false`); terminal text passed the built-in privacy guard.

## Elapsed time and limits

About **153 seconds (2 minutes 33 seconds)** from init configuration creation
(01:58:28 UTC) to review HTML creation (02:01:01 UTC), including agent authoring
and rendering. This excludes initial copying/dependency/build preparation. Runs
overlapped with GroundWork; this is not an independent installation-time benchmark.

Manifest validation and post checks reported success. A native Swift app, Mac VM
boot, interactive viewer and real guest-agent session were **not** exercised on
this Linux host. The README's guest-agent qualification limitations remain in force.
Cloud and billing are development prototypes, not demonstrated services here.
Pain research, pricing and audience fit are unverified; the plan's date is illustrative.
Everything remains unapproved; check current community rules before any manual post.

## Results

**not launched yet, no real results — pending**

Nothing was submitted or published. There are no measured launch visits, signups,
conversions, user testimonials or revenue. Add results only with dated public links
and real evidence after an owner-approved launch.
