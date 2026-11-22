<!-- liftoff-brief-v1 inputs:cf8783f23c8ff807181d7f4e02b01a3d85e5671082d112702d9fd62bb10e134e -->
# Launch Brief: Liftoff

## Positioning statement

Liftoff turns repository facts into a local launch kit, with sources and human review. [product.json](product.json)

## Target users and top pains

For developers and coding agents preparing a launch. The working problem: turning code into launch assets without losing evidence or human control. This is product positioning, not validated customer research. No external pain evidence was collected. [product.json](product.json)

## One-liner and alternative taglines

One-liner: Grounded launch kits from your repository, reviewed locally. [product.json](product.json)

- Tagline 1: From repository facts to launch assets.
- Tagline 2: Keep the evidence. Keep human review.
- Tagline 3: Prepare locally. Launch deliberately.

## Key messages

- Start with repository evidence. [product.json](product.json#/claims/0)
- Capture actual product output. [product.json](product.json#/claims/2)
- Approve the exact post and media hash. [product.json](product.json#/claims/8)

## Proof points with sources

- Scan repository facts: [src/product/scan.ts](../src/product/scan.ts).
- Validate source files: [src/product/validate.ts](../src/product/validate.ts).
- Capture terminal commands: [src/visuals/shots.ts](../src/visuals/shots.ts).
- Render captioned videos: [src/video/render.ts](../src/video/render.ts).
- Match approval hashes: [src/review/approvals.ts](../src/review/approvals.ts).

## Feature-to-pain map

- Repository scan: inspect local evidence. [feature:0](product.json#/features/0)
- Terminal capture: show actual command output. [feature:1](product.json#/features/1)
- Demo rendering: compose captured media. [feature:2](product.json#/features/2)
- Local review: retain human control. [feature:3](product.json#/features/3)

These are intended workflow benefits, not measured customer outcomes.

## Competitor comparison

No verified competitor claims available.

## Likely objections with answers

- Does this publish automatically? This self-demo never posts or stages a release. Approval is still required for the exact post and media hash. [source](../src/review/approvals.ts)
- Does the CLI write the copy? The agent authors copy; the CLI supplies writing briefs and checks. [source](../src/copy/write.ts)

## FAQ

### 1. Who is this for?
Developers and coding agents. [product.json](product.json)

### 2. What problem does it address?
Retaining evidence and human control while preparing launch assets. [product.json](product.json)

### 3. What footage is captured?
Actual local command output, rendered as terminal images and GIFs. [source](../src/visuals/shots.ts)

### 4. Where do facts come from?
Repository-relative source files listed in product.json. [source](../src/product/validate.ts)

### 5. Who writes the words?
The agent, using sourced product facts. [source](../src/copy/write.ts)

### 6. What renders the demo?
The built-in ffmpeg path; Remotion is optional. [source](../src/video/render.ts)

### 7. What does approval cover?
The exact post source and attached media bytes. [source](../src/review/posts.ts)

### 8. Are there launch results?
Not for this offline demo. No public posts, audience counts or lessons are invented.

## Pricing and free-tier story

The repository is MIT-licensed. No hosted pricing or free-tier promise is made. [license](../LICENSE)

## Channel plan with dates

Offline sample date: November 24, 2026, UTC. The generated plan covers Show HN, Reddit, X and DEV. These are preparation suggestions, not scheduled external posts. [plan.md](plan.md)

## Launch-day schedule hour by hour

08:00 — Verify facts and media.
09:00 — Review exact hashes with the human.
10:00 — The human decides whether to launch.
11:00 — Review feedback, if any.
12:00 — Record only measured results.

## Success metrics

No launch has occurred. Metrics and lessons remain unavailable. Future checkpoints should use measured views, clicks and signups, without claiming causation. [source](../src/results/report.ts)

## Open risks

Customer pains and competitor comparisons are unresearched. The local draft is unapproved. No public launch or measured outcome is represented here.
