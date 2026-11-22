---
name: liftoff
description: Plan a product launch, feature release, changelog or relaunch from a repository using sourced product facts. Use when the user asks to launch, announce a release, prepare a launch kit or make a product launch video.
---

# Liftoff

## Install and first kit

```sh
npx skills add ADITYADEV4145/LaunchAnything
npm i -g launch-liftoff
liftoff setup
liftoff demo
```

Setup checks tools and accounts; `--yes`/`--json` never prompts. Import a brand
with `--site URL` (explicit network access) or `--site-file HTML` (offline),
and owned writing with `--voice PATHS...`. Demo uses prepared offline fixture
content; it never posts. Run `liftoff init` next for the real repository.
`liftoff estimate` reports planning estimates only. Telemetry is off by default;
`liftoff telemetry on` enables anonymous local demo stage counts only, never uploads.

## Product launch video

Read [the launch-video workflow](references/launch-video.md) before planning or
producing a launch film. Start with a sourced storyboard and one real product
payoff. A skill edit, plan or research request is not permission to render.
Require the original logo, spoken narration, captions and a phone-size
readability check for the launch cut unless the user explicitly changes the brief.

## Phase 2b: founder voice

See [phase2b](references/phase2b.md). Learn from 20–50 owned samples with
`liftoff voice learn`; measure with `liftoff voice score --json`. The agent
rewrites using the returned three references; the CLI never calls an LLM.
Run check for versioned AI tells, grounded audience counts, honest affiliation,
and voice fit. Keep private samples private.

The agent is the model; the CLI never calls an LLM API. All commands support
`--cwd <repository>` and `--json`. State lives in that repository's `.launch/`.

## Run order

doctor → research → audience → init → confirm profile → scan → agent writes product.json → validate → plan → brief.
Phase 1 product understanding and planning and phase 5 review/local staging are
implemented. Phases 2–4 and 6 remain stubs; never claim they created assets.

## research — phase 0

Before product planning, derive 8–15 queries from the idea: problem words,
competitors, "I wish", "alternative to", and "why is X so". Run research fetch,
cluster cached evidence, write pains.json, check, then report. Never invent quotes.
See [phase0.md](references/phase0.md) for credentials and the evidence contract.

## audience — phase 0b

After verified pain research, run `liftoff audience prepare --json` for a community
map, editable outreach and build-in-public drafts, and a non-submitting Kit waitlist
preview. Review rules and exact draft hashes with the human. Never contact research
authors or sync signup data. See [phase0b.md](references/phase0b.md).

## doctor

Run `liftoff doctor --json` before starting. Prefer relevant installed skills or MCP
tools, but missing optional integrations must not block the built-in planning path.
For media, inspect versions, requiredFor and installHint: Tesseract and Chrome are
required for storyboards; FFmpeg/ffprobe for animations and videos. VHS is optional
(HTML fallback when absent), but an installed VHS requires ttyd. Never download
tools without the user's permission merely because doctor reports them missing.

## init

Run `liftoff init --type new-product --timezone UTC --date YYYY-MM-DD --json`.
Use feature, changelog or relaunch when appropriate. Ask the user to confirm the
detected profile once, then rerun `liftoff init --profile <profile> --yes`.
Do not pass --yes on the user's behalf before confirmation. Existing configuration
is preserved except this explicit confirmation; --force replaces it deliberately.

## scan

Run `liftoff scan --json`. Read scan.json, README and relevant source files.
It is offline by default. Use --github only with permission to fetch public stars;
network failures do not block local scanning. Do not treat raw facts as verified copy.

## validate

Write `.launch/product.json` yourself from the evidence; see
[product-json.md](references/product-json.md). Run `liftoff validate product --json`.
Fix every error. Resolve commit warnings by inspecting/fetching history or replacing
the source with a verifiable one. Never invent proof, metrics or customer claims.
Other JSON artifacts can be checked by schema name; YAML shots are supported too.

## plan

Run `liftoff plan --json`. It uses the confirmed profile, launch type, allowed channel
rules, launch date and timezone. Review `.launch/plan.md` with the user. The plan is
2–4 channels with local posting times and a T-7 to T+3 checklist, under 120 lines.
See [phase1.md](references/phase1.md) for detection, scheduling and history hooks.

## brief — phase 1b

Run `liftoff brief --json`, edit the deterministic scaffold with verified messaging,
then `liftoff validate brief --json` and `liftoff brief --json` to export printable
HTML. Existing edits are preserved; `--force` explicitly replaces them. Missing
pain research and changed inputs warn. See [phase1b.md](references/phase1b.md).
Later-phase agents must read brief.md as their single messaging source.

## selftest gates

Run `liftoff selftest --through 1` to exercise all three fixture repositories.
Run `liftoff selftest --through 7 --json` for the cumulative gate, including Part D
on cli-tool and saas-next. It renders real fixture captures and both video cuts,
checks exact dimensions/five carousel slides, rejects unsafe frames with cleanup,
and runs the heuristic judge. Phase 7 is the dedicated slower media regression
gate; through 6 retains the baseline workflow. No voice API or GroundWork run is included.

## write and check — phase 2

Write briefs, then posts that open on a cited pain or proof, follow each channel's
template and keep claims in citations metadata. Run check, then judge (three loops
max, then a red flag). See references/phase2.md and scripts/blind-test.md.

## shots and images — phase 3

Run `liftoff shots plan` from product.json money_moment, then review its 4–8 shots
against the repository. Keep exactly one moneyMoment; replace every TODO command
or route. `--force` deliberately replaces an existing plan. Keep setup hidden and
never display fixture/tmp paths, pipes, credentials or debug output. Capture with
`liftoff shots` (`--url` for a running web app), then `liftoff media polish` and
`liftoff images` (which also polishes). Do not invent UI or product claims.

Polished media and platform images use corner logo/wordmark branding. Set a local
config.brandKit file (logo/colors/music), or media/logo.*; otherwise the product
name is used. Images use the polished money moment; PH gets a gallery and IG gets
five slides. Legacy shots without new fields keep the old rendering path.

Run `liftoff media judge --json` after images and again after video. It safety-scans
all images, raw captures and 1-fps video frames, scoring publishable images and
rendered frames only. Read judge/report.json and view every contact sheet under
.launch/media/judge/. Fix scores below 8; never weaken banned/provenance checks.
For vision review, `--write-vision-template` writes current per-asset hashes.
After actually viewing the assets, fill honest scores and save as vision.json.
Valid SHA-256-bound scores override heuristics; stale hashes fail, and safety or
money-moment provenance cannot be overridden. `--heuristic-only` is for local
heuristic checks. Review gates finished media before human approval.

## video — phase 4

For a storyboard, run `liftoff video script --from-shots`, optionally `liftoff video voice --dry-run` then `liftoff video voice` (ElevenLabs key required), and `liftoff video --renderer ffmpeg`. Music defaults to a local generated pad; use `--music <file>` or `brandKit.music` to supply a bed. With Remotion installed, run `npx skills add remotion-dev/skills` and follow its video-shotcraft recipes; the same roles, branding, captions and highlights are passed to both renderers. No voice key means captions-only, not an error.

Long cuts are 45–60s; vertical cuts 20–35s. Use `--format 16x9,9x16` and run
`liftoff video check` for the same formats. Legacy scripts retain 30–60s. Never
request new credentials: without a provisioned key, report captions-only.

For standalone composition without shots.yaml, import renderCarousel from
`launch-liftoff/dist/media/platform-images.js` and renderClip from
`launch-liftoff/dist/video/clip.js`. Both need product.json and local sources.
Carousel takes `{role, caption, source?}[]` and `{size?, outDir?, prefix?}`, returning
`{files, report}`. Clip takes `{role?, caption, source, duration}[]` and
`{format?, music?, voice?, outFile?, renderer?}`, returning `{file, duration, receipt}`.
Voice is an indexed array of local audio paths. Clip uses supplied durations plus
a three-second end card; neither renderer calls an API. See README's media section.

## review and publish — phase 5

Run `liftoff review` to build a local approval page for exact post+media hashes.
`liftoff publish` defaults to a no-network dry run; `--confirm` writes local paste
files, reminders and receipts, not external posts. Nothing may be staged without
matching human approval.

## One-go publishing — Part F

Run `liftoff go` first: it is a read-only preview of cost, routes and the full timeline
in config.timezone. It reads the Channel / Local date / Local time table in
`.launch/recommendations.md`, falling back to plan.md only when recommendations
is absent. Do not promise that an unavailable official tool can publish.

Ask the founder once in chat for standing permission to publish future content on
the displayed channels, routes and connected accounts, including the displayed
paid-tool costs. After they say yes, run `liftoff go --confirm --yes --by "<founder>"`.
This saves revocable, account-scoped consent in `.launch/go-consent.json` with who
and when. New content and later schedules on those same channels/accounts do not
ask again. Adding a channel, changing its route or switching accounts requires new
consent. `liftoff go --revoke` revokes it. Consent never skips check/judge quality
gates, configured additional reviewers, or the founder's manual HN/Reddit Submit.
Each newly approved exact post/media hash is recorded with its standing-consent
provenance in go-approvals.json and the normal approvals file.

PH requires a separate final-submit confirmation per launch (`--ph-submit` only
after the founder explicitly agrees). HN/Reddit are prefilled, ring the terminal
bell, and wait for the founder to press Submit; never click Submit for them.
Failures retry once, then appear as failed with a paste file under `.launch/go-paste/`.
Inspect the destination for duplicates before using a paste file. Live URLs feed
published.json and the warroom immediately. Postiz / official MCP routes can fail
closed when no verified publish tool or live URL is available; a paste file is not
a live post. Current live HTTP adapters support text-only DEV/GitHub/Postiz;
official X/Kit publishing tools are not verified and PH draft tools cannot submit.

Use `--mock --no-wait --confirm --yes` only in an isolated disposable fixture launch.
Mock consent and approvals are separate from real standing consent. Mock links
are marked with go-mock IDs in published.json; never use a mock launch for a real
release. The Part F selftest gate is `liftoff selftest --through F --json`.

## results, learn and receipt — phase 6

Run `liftoff results --replies` at T+1, T+3 and T+7 to collect the current checkpoint.
Review the report and local reply drafts with the human; never auto-reply.
Run `liftoff learn` to inform future plans and `liftoff receipt` for a shareable image.
See [phase6.md](references/phase6.md) for data gaps and observation guidelines.

## Hard safety rules

Every claim must cite a source in product.json. Never auto-post to Hacker News or
Reddit. Never auto-reply. No fabricated screenshots, no approval bypasses and no
secrets in captured media. Platform rules belong in versioned YAML, not prompts.

## Launch day, after and ongoing

Use `warroom` on launch day for local metrics and reply approvals, and `friends`
only for people who explicitly asked to hear about the launch. Run `friends --check`
after editing drafts. After collecting phase-6 results, use `followup` and `retro`.
Use `release --draft` for tag-based kits and `progress` for weekly screenshot drafts.
Use `release --install-action` for the review-only tag-push PR workflow. These commands
never send anything. See [launch-ops.md](references/launch-ops.md) for flags and files.

## Benchmark-backed product inputs

Before `liftoff write` or `liftoff brief`, product.json must validate. Use `problem: { summary, pains? }` (up to three researched pains with pain_index and exactly two source quotes), `audience: { who, where?, uses? }`, and `money_moment: { before, action, after }`. Communities and competitors are checked against local research when present. Existing proofPoints, features and claims remain required.

Configure `proof.benchmarks` in .launch/config.json with a slug name, optional command and 1–3 repos, results JSON path, and metrics (`metric`, `pointer`, `unit`, `context`). Run `liftoff proof run` (`--skip-run` reads recorded results; `--timeout <s>` defaults to 1800). `{repo}` is substituted in commands and result paths. No benchmarks? The command writes .launch/proof/plan.md and exits non-zero. It never invents measurements.

Paste emitted metrics into the required product.json `proof` array. Each includes `metric`, `value`, `unit`, `context`, `source_file` and an RFC 6901 `source_pointer`. Validation requires a schema-valid `.launch/proof/<name>.json` record, resolves the pointer within its `/results` subtree, and requires exact value equality. If the original results file is present, its SHA-256 must still match the record; otherwise rerun `liftoff proof run`. Do not type or fabricate benchmark values. Run `liftoff validate product --json`; errors block writing and brief generation.
