# Email

## What Liftoff does and why

Title is the subject (60-character editorial budget, not a protocol maximum). Use a consent-compliant audience and unsubscribe controls in your sending tool.

Eligible planning profiles: `b2b-saas`, `enterprise`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **1 day**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **60 characters**. Body **1–10000 characters**; at most **5 links**. No mandatory link field.
- Title is the subject (60-character editorial budget, not a protocol maximum). Use a consent-compliant audience and unsubscribe controls in your sending tool.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel email` for an agent brief, write `.launch/posts/email.md` with valid YAML front matter, then `liftoff check --channel email`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

The email adapter writes a local Subject/body paste file; it never sends email. Separately, audience prepare creates a Kit waitlist preview and consent-aware local signup/import files. A Kit API token can be stored with `liftoff connect kit --route api`; this is credential storage only, not a live Kit sending or publishing adapter. A human configures their Kit form/audience, consent and unsubscribe controls and performs any sending.

## Troubleshooting

### Approval and local staging

- `<channel>: exact post and media hash not approved (new or edited post)` means the source or media changed; review and approve the exact current hash again. Configured approvers can also produce `<channel>: missing approval from <name>`.
- `No matching approved posts to assist` means the selected channel has no eligible non-skipped posts; check channel selection, drafts and review decisions.
- Normal `publish` is a preview; `publish --confirm` writes local paste files, attachments and receipts, not external posts. Inspect the destination before retrying a failed assisted attempt: after two dispatch failures Liftoff retains a manual paste file rather than silently retrying forever.

### Kit / email route

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Token required via --token-env or stdin`: provide a nonempty token through an environment variable or stdin, never a command-line literal.
- `OS keychain unavailable or access denied; no token was stored`: unlock/fix your OS keychain backend. Tokens are not saved in the connection JSON.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.

- `Consent timestamp cannot be in the future`: an imported Kit signup has a future consent timestamp; correct the original consent evidence, never invent consent.
- `Missing local file: <path>`: required audience setup/signup input does not exist; run audience prepare and provide the documented local inputs.
- `Unsupported route <route> for kit`: Kit credential storage only accepts api. There is no connected email publish route; use the local email adapter and your own consent-compliant sending tool.

## Sources

- [Planning policy](../../rules/channels/email.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/email.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).
- [Kit local waitlist](../../src/audience/waitlist.ts) and [audience file validation](../../src/audience/files.ts).

[All channels](README.md)
