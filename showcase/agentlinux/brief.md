<!-- liftoff-brief-v1 inputs:79da8d5f91c6d304e4a20fef5880188cc375677c7e8e6e2874f0f1181d3f24c4 -->
# Launch Brief: Agent Linux

## Positioning statement

Agent Linux: A source-built Linux desktop preview for agents on Apple silicon Macs For Apple silicon Mac developers exploring supervised agent desktop workflows. Problem: An agent and a person need a shared desktop with an explicit boundary for human control. [product.json](product.json)

## Target users and top pains

Audience: Apple silicon Mac developers exploring supervised agent desktop workflows [product.json](product.json)

Pain research unavailable; no validated pains supplied.

## One-liner and alternative taglines

One-liner: A source-built Linux desktop preview for agents on Apple silicon Macs [product.json](product.json)

- Tagline 1: A local desktop experiment for supervised agents. [product.json](product.json#/claims)
- Tagline 2: Connect to an existing machine over MCP. [product.json](product.json#/claims/1)
- Tagline 3: Keep human control explicit. [product.json](product.json#/claims/2)

## Key messages

- A source-built Linux desktop preview for agents on Apple silicon Macs [product.json](product.json)
- For Apple silicon Mac developers exploring supervised agent desktop workflows. [product.json](product.json)
- An agent and a person need a shared desktop with an explicit boundary for human control. [product.json](product.json)

## Proof points with sources

- The README describes a source-built local developer preview, not public binaries or a hosted service (README.md). [product.json](product.json#/proofPoints/0)
- The MCP command connects to existing machine state rather than starting the local VM (internal/cli/mcp.go). [product.json](product.json#/proofPoints/1)
- The viewer supports an interactive human-input mode (internal/cli/view.go). [product.json](product.json#/proofPoints/2)

## Feature-to-pain map

- Source-built preview: Build the local developer preview for an Apple silicon Mac; the app is not notarized and no public VM image is published. [feature:0](product.json#/features/0) — Pain mapping unverified.
- Existing-machine MCP: Connect an MCP client to existing local machine state; start the VM separately. [feature:1](product.json#/features/1) — Pain mapping unverified.
- Human handoff: Use the interactive viewer to take control of the same guest desktop. [feature:2](product.json#/features/2) — Pain mapping unverified.

## Competitor comparison

No verified competitor claims available.

## Likely objections with answers

- Is this suitable for our workflow? Review the sourced features; suitability requires human evaluation.

## FAQ

### 1. Who is this for?
Apple silicon Mac developers exploring supervised agent desktop workflows [product.json](product.json)

### 2. What problem does it address?
An agent and a person need a shared desktop with an explicit boundary for human control. [product.json](product.json)

### 3. What does it do?
It provides a source-built local developer preview with MCP access to existing machine state and an interactive guest viewer. [product.json](product.json#/claims)

### 4. Where is the evidence?
Inspect README.md, the MCP and desktop guides, and the implementation files referenced by the manifest. CLI help captures are not evidence of a running guest. [product.json](product.json#/claims)

### 5. What does it cost?
No production price is claimed; cloud and billing are development prototypes. [product.json](product.json#/claims/3)

### 6. Is there a free tier?
No hosted free-tier entitlement is claimed by this kit. [product.json](product.json#/claims/3)

### 7. How do I get started?
Use the source-build instructions on a supported Apple silicon Mac. Public binaries and VM images are not published, and the native app is not notarized. [product.json](product.json#/claims/0)

### 8. What remains unverified?
A Mac VM boot, native viewer and guest agent session were not exercised on the Linux kit-building host. Guest agent qualification remains a documented limitation. [product.json](product.json#/claims/3)

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

The Linux host cannot verify the supported-Mac desktop flow. Captures show CLI help only. Pricing, competitor research and feature-to-pain mapping remain unverified. Maintainer approval is required before publication.
