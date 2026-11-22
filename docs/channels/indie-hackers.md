# Indie Hackers

## What Liftoff does and why

Share first-person building lessons and disclose affiliation. Describe evidence, not a generic advertisement.

Eligible planning profiles: `indie-saas`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **1 day**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **120 characters**. Body **1–10000 characters**; at most **3 links**. No mandatory link field.
- Share first-person building lessons and disclose affiliation. Describe evidence, not a generic advertisement.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel indie-hackers` for an agent brief, write `.launch/posts/indie-hackers.md` with valid YAML front matter, then `liftoff check --channel indie-hackers`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

This channel has no connection-registry publishing route. Liftoff prepares channel briefs, checks agent-written grounded copy and stages local paste-ready files. A human chooses the destination and publishes; there is no automated submission.

## Troubleshooting

### Approval and local staging

- `<channel>: exact post and media hash not approved (new or edited post)` means the source or media changed; review and approve the exact current hash again. Configured approvers can also produce `<channel>: missing approval from <name>`.
- `No matching approved posts to assist` means the selected channel has no eligible non-skipped posts; check channel selection, drafts and review decisions.
- Normal `publish` is a preview; `publish --confirm` writes local paste files, attachments and receipts, not external posts. Inspect the destination before retrying a failed assisted attempt: after two dispatch failures Liftoff retains a manual paste file rather than silently retrying forever.

## Sources

- [Planning policy](../../rules/channels/indie-hackers.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/indie-hackers.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).

[All channels](README.md)
