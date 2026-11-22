<!-- liftoff-brief-v1 inputs:ec8b211036639274672defbb3367feab5058c95159048aa4c5d40917eeda544d -->
# Launch Brief: GroundWork

## Positioning statement

GroundWork: A local code map and source-grounding checks for coding agents For Developers using coding agents on existing repositories. Problem: Agents need precise code locations and source definitions before changing an unfamiliar repository. [product.json](product.json)

## Target users and top pains

Audience: Developers using coding agents on existing repositories [product.json](product.json)

Pain research unavailable; no validated pains supplied.

## One-liner and alternative taglines

One-liner: A local code map and source-grounding checks for coding agents [product.json](product.json)

- Tagline 1: Find the definition before changing the code. [product.json](product.json#/claims/0)
- Tagline 2: Local code context for coding agents. [product.json](product.json#/claims/3)
- Tagline 3: Check new calls against real definitions. [product.json](product.json#/claims/2)

## Key messages

- A local code map and source-grounding checks for coding agents [product.json](product.json)
- For Developers using coding agents on existing repositories. [product.json](product.json)
- Agents need precise code locations and source definitions before changing an unfamiliar repository. [product.json](product.json)

## Proof points with sources

- The symbol command prints ranked matches with file locations and signatures (src/cli/commands/query.ts). [product.json](product.json#/proofPoints/0)
- The duplicate gate reports duplicated implementations when the agent stops; strict mode can hold the stop (src/hooks/handlers/duplicate_gate.ts). [product.json](product.json#/proofPoints/1)
- The grounding hook checks new calls against source definitions (src/hooks/handlers/grounding.ts). [product.json](product.json#/proofPoints/2)

## Feature-to-pain map

- Symbol lookup: Search symbols and inspect their definitions through the local index. [feature:0](product.json#/features/0) — Pain mapping unverified.
- Reuse gate: Report duplicated implementations at agent stop; standard mode provides context and strict mode can hold the stop. [feature:1](product.json#/features/1) — Pain mapping unverified.
- Call grounding: Check new calls against source definitions through the agent hook. [feature:2](product.json#/features/2) — Pain mapping unverified.

## Competitor comparison

No verified competitor claims available.

## Likely objections with answers

- Is this suitable for our workflow? Review the sourced features; suitability requires human evaluation.

## FAQ

### 1. Who is this for?
Developers using coding agents on existing repositories [product.json](product.json)

### 2. What problem does it address?
Agents need precise code locations and source definitions before changing an unfamiliar repository. [product.json](product.json)

### 3. What does it do?
It searches indexed symbols and provides source-grounding feedback through agent hooks. [product.json](product.json#/claims)

### 4. Where is the evidence?
Inspect the files cited in the manifest; this kit also includes an actual lookup captured against the copied source. [product.json](product.json#/claims)

### 5. What does it cost?
No pricing promise is made here. Consult the maintainer before publishing a commercial claim. [product.json](product.json)

### 6. Is there a free tier?
No tier or service entitlement has been verified for this kit. [product.json](product.json)

### 7. How do I get started?
Read the repository README, build the CLI, then initialize the local index before querying symbols. [product.json](product.json#/claims/0)

### 8. What remains unverified?
Agent patch quality, comparative speed, customer demand and launch outcomes were not measured. Human approval and current community-rule checks remain pending.

## Pricing and free-tier story

Pricing and free-tier details unverified. Agent must inspect authoritative pricing sources before making promises.

## Channel plan with dates

Launch plan

Profile: devtool | Launch type: new-product
Launch date: 2026-12-01 | Timezone: UTC
All scheduled dates and times below are local wall-clock times in this timezone.
Posting windows are starting heuristics, not performance promises.

Channels

| Channel | Local date | Local time | Why | Preparation lead time |
| --- | --- | --- | --- | --- |
| show-hn | 2026-12-01 | 09:00 | Invite hands-on feedback from technical peers with a tryable demo; introduce the product with grounded proof | 1 day(s) |
| reddit | 2026-12-01 | 09:00 | Invite relevant community feedback with a manual, subreddit-appropriate submission; introduce the product with grounded proof | 1 day(s) |
| x | 2026-12-01 | 09:00 | Share a concise update and invite direct conversation; introduce the product with grounded proof | 1 day(s) |
| devto | 2026-12-01 | 09:00 | Explain the implementation with a technical walkthrough; introduce the product with grounded proof | 1 day(s) |

Use the next allowed posting day on or after launch day; prepare assets at least the listed lead time ahead.
Every post requires human approval. Show HN and Reddit are paste-ready manual submissions only.

T-7 to T+3 checklist

- [ ] T-7: Confirm audience, profile, source-backed claims and channel selection.
- [ ] T-6: Check channel rules and start any longer-lead launch preparation.
- [ ] T-5: Verify product access, landing page and pricing.
- [ ] T-4: Draft channel-native posts with claim citations.
- [ ] T-3: Capture real screenshots and redact private information.
- [ ] T-2: Prepare demo assets and verify links and media dimensions.
- [ ] T-1: Collect human approvals for exact posts and media hashes.
- [ ] T+0: Submit approved posts at the listed local times; never auto-post to HN or Reddit.
- [ ] T+1: Record initial observations and draft replies for human review.
- [ ] T+2: Check unanswered questions; do not auto-reply.
- [ ] T+3: Record metrics and lessons without claiming causation.

History observations
- No history observation changed a time slot; using bundled channel scheduling defaults.


## Launch-day schedule hour by hour

08:00 — Verify assets and approvals.

09:00 — Review scheduled channel times in plan.md.

10:00 — Human launches approved channels at their planned times.

11:00 — Monitor feedback.

12:00 — Review questions.

13:00 — Record issues.

14:00 — Review replies with human.

15:00 — Check links.

16:00 — Capture initial metrics.

17:00 — Record follow-ups.

## Success metrics

Targets pending human agreement. Track visits, activation and qualified feedback; no baseline or outcome is assumed.

## Open risks

Pricing, competitor research and feature-to-pain mapping remain unverified. Agent-authored copy and real terminal captures still need maintainer approval; no comparative agent evaluation was performed.
