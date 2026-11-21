# Phase 1b: Launch Brief

After plan, run `liftoff brief --json`. This offline command creates a deterministic
scaffold from product.json, optional research/pains.json and plan.md. It never calls
an LLM. Missing pain research warns, not fails. Present research must satisfy
Phase 0's schema (including at least one pain). Missing product or plan,
malformed research and invalid briefs fail. Limits and section order live in
`rules/brief.yaml` (version 1).

The agent edits `.launch/brief.md`: replace pending wording, verify objections,
pricing, competitor claims, feature-to-pain mappings, metrics and schedule with the
human. Pending entries are explicit unknowns, not invented facts. Three taglines
use `- Tagline 1:` through `- Tagline 3:`; key messages use three `- ` bullets;
FAQ uses 8–12 `### ` question headings. Keep all fourteen `## ` headings in order.

Every named feature needs `[feature:0](product.json#/features/0)` on the same line;
the feature map must include every feature. Every named pain similarly needs
`[pain:0](research/pains.json#/pains/0)`. Indices refer to current input arrays.
Top pains are ranked by mentions, then intensity, and include their original quote URLs.
Every nonempty competitor-comparison line must contain an HTTP(S) source URL,
or use exactly `No verified competitor claims available.` Honest unknowns beat
unsupported comparisons. Validation checks structural grounding, not semantic
truth: the human must verify each source supports its associated claim.

Run `liftoff validate brief --json`, then `liftoff brief --json` to render the
agent-edited Markdown as self-contained printable HTML. Existing Markdown is
preserved. The embedded SHA-256 covers product, pains, plan and rule version;
changed inputs warn `stale-brief`. Review changes, then `brief --force` regenerates
the scaffold (overwriting edits deliberately). Do not alter fingerprints to hide
unreviewed changes. HTML contains inline print CSS and no external assets/scripts.

Phase 0 owns `schemas/pains.schema.json` and the imported Pains/Pain types.
The document contains `idea`, `pains`, and `competitors`. Each pain includes
`name`, `description`, `mentions` (at least 3), `intensity` (1–5),
`date_range: {start,end}`, `quotes: [{text,url}]` (3–5 HTTPS links, each quote at
most 25 words), `current_tools: string[]`, `shortcomings`, and optional
`solution_feature`. See [phase0.md](phase0.md) for the full evidence contract.
Run `liftoff research check` to verify verbatim quotes, cached URLs and independent
sources before generating the brief. Phase 1b enforces the shared schema and
quote word limit without fetching URLs or duplicating Phase 0's provenance checks.

Later-phase agents must read brief.md as their messaging source, preserving its
key messages and citations. Run `liftoff selftest --through 1b --json` for the gate.
