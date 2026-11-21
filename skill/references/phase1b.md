# Phase 1b: Launch Brief

After plan, run `liftoff brief --json`. This offline command creates a deterministic
scaffold from product.json, optional research/pains.json and plan.md. It never calls
an LLM. Missing or empty pain research warns, not fails. Missing product or plan,
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
Top pains are ranked by mentionCount and include their original quote URLs.
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

Until Phase 0 supplies a schema, pains.json has `{pains: [...]}` with each pain:
`name`, `description`, `mentionCount`, `dateRange: {start,end}`, `quotes: [{text,url}]`
(3–5, each at most 25 words), `currentSolutions: string[]`, `shortcomings: string`.
Phase 1b does not fetch URLs or verify raw research provenance; Phase 0 owns that.

Later-phase agents must read brief.md as their messaging source, preserving its
key messages and citations. Run `liftoff selftest --through 1b --json` for the gate.
