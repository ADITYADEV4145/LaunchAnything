---
name: liftoff
description: Plan a product launch, feature release, changelog or relaunch from a repository using sourced product facts. Use when the user asks to launch, announce a release or prepare a launch kit.
---

# Liftoff

## Phase 2b: founder voice

See [phase2b](references/phase2b.md). Learn from 20–50 owned samples with
`liftoff voice learn`; measure with `liftoff voice score --json`. The agent
rewrites using the returned three references; the CLI never calls an LLM.
Run check for versioned AI tells, grounded audience counts, honest affiliation,
and voice fit. Keep private samples private.

The agent is the model; the CLI never calls an LLM API. All commands support
`--cwd <repository>` and `--json`. State lives in that repository's `.launch/`.

## Run order

doctor → init → confirm profile → scan → agent writes product.json → validate → plan.
Phase 1 product understanding and planning and phase 5 review/local staging are
implemented. Phases 2–4 and 6 remain stubs; never claim they created assets.

## research — phase 0

Before product planning, derive 8–15 queries from the idea: problem words,
competitors, "I wish", "alternative to", and "why is X so". Run research fetch,
cluster cached evidence, write pains.json, check, then report. Never invent quotes.
See [phase0.md](references/phase0.md) for credentials and the evidence contract.

## doctor

Run `liftoff doctor --json` before starting. Prefer relevant installed skills or MCP
tools, but missing optional integrations must not block the built-in planning path.

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

## selftest

Run `liftoff selftest --through 1` to exercise all three fixture repositories.
Phase 5 also has fixture checks. Higher cumulative gates still fail at the
unimplemented phases 2–4 (and phase 6).

## write and check — phase 2

Future: prepare channel-native copy and enforce citations and platform rules.

## shots and images — phase 3

Future: capture real product screenshots, redact secrets and compose launch images.

## video — phase 4

Future: render real-footage demos and vertical cuts with optional-tool fallbacks.

## review and publish — phase 5

Run `liftoff review` to build a local approval page for exact post+media hashes.
`liftoff publish` defaults to a no-network dry run; `--confirm` writes local paste
files, reminders and receipts, not external posts. Nothing may be staged without
matching human approval.

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
Use `release` for smaller tag-based feature/changelog announcements. These commands
never send anything. See [launch-ops.md](references/launch-ops.md) for flags and files.
