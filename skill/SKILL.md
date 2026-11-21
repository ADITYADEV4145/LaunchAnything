---
name: liftoff
description: Plan a product launch, feature release, changelog or relaunch from a repository using sourced product facts. Use when the user asks to launch, announce a release or prepare a launch kit.
---

# Liftoff

The agent is the model; the CLI never calls an LLM API. All commands support
`--cwd <repository>` and `--json`. State lives in that repository's `.launch/`.

## Run order

doctor → init → confirm profile → scan → agent writes product.json → validate → plan.
Only product understanding and planning are implemented in phase 1. Later commands
remain stubs; never claim they created assets or published anything.

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
Higher gates intentionally fail until those phases are implemented.

## write and check — phase 2

Future: prepare channel-native copy and enforce citations and platform rules.

## shots and images — phase 3

Future: capture real product screenshots, redact secrets and compose launch images.

## video — phase 4

Future: render real-footage demos and vertical cuts with optional-tool fallbacks.

## review and publish — phase 5

Future: human approval of exact post+media hashes, then approved scheduling or manual
paste-ready submissions. Nothing may publish without matching human approval.

## results, learn and receipt — phase 6

Future: collect metrics, save observations for the next plan and create a receipt.
Never claim causation from launch metrics alone.

## Hard safety rules

Every claim must cite a source in product.json. Never auto-post to Hacker News or
Reddit. Never auto-reply. No fabricated screenshots, no approval bypasses and no
secrets in captured media. Platform rules belong in versioned YAML, not prompts.
