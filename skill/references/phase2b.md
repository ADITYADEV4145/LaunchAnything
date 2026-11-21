# Phase 2b: your voice, not AI voice

Use only writing the founder owns, never scraped customer posts.
Collect 20–50 distinct samples in text/Markdown paragraphs or an X JSON/tweets.js
archive. Links must first be saved locally by the user or agent; the CLI never
fetches them. Run `liftoff voice learn samples/*.md --readme --json`.
Below 20 distinct samples fails; above 50 keeps the longest. Each stored sample
is bounded to 4000 characters. The profile contains private writing: review it
before committing or sharing .launch/voice.json. “Never used” means absent from
these samples, not a claim about every word the founder has ever written.

Run `liftoff voice score --channel x --json`. Low scores return three owned
references and a rewrite brief. The agent, not the CLI, rewrites; preserve
supported facts and citations. Length, vocabulary and formality scores are
heuristics, not authorship detectors. Empty drafts fail.

Run `liftoff write` for platform style and voice references, then `liftoff check`.
Fix ai-tells.*, honesty.* and voice.score issues in the generated fix list.
Never invent counts, praise, customer identity or affiliation.
If setting front matter account, it must equal the channel's user-owned entry
in config.accounts. This is a local declaration, not remote ownership verification.
Community disclosure flags are conservative local policies, not verified live rules.
Read current community rules before posting. After three failed loops ask the user.

Gate: `liftoff selftest --through 2b --json`.
