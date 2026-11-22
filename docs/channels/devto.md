# DEV Community

## What Liftoff does and why

Use a technical walkthrough and disclose affiliation. Explain implementation so developers can evaluate the work.

Eligible planning profiles: `devtool`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **1 day**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **128 characters**. Body **1–30000 characters**; at most **10 links**. No mandatory link field.
- Use a technical walkthrough and disclose affiliation. Explain implementation so developers can evaluate the work.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel devto` for an agent brief, write `.launch/posts/devto.md` with valid YAML front matter, then `liftoff check --channel devto`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

Liftoff prepares briefs and checks agent-written copy; the API-named adapter stages files locally. A human uses the destination API/tool or UI to publish. Nothing is automatically posted.

## Troubleshooting

### Approval and local staging

- `<channel>: exact post and media hash not approved (new or edited post)` means the source or media changed; review and approve the exact current hash again. Configured approvers can also produce `<channel>: missing approval from <name>`.
- `No matching approved posts to assist` means the selected channel has no eligible non-skipped posts; check channel selection, drafts and review decisions.
- Normal `publish` is a preview; `publish --confirm` writes local paste files, attachments and receipts, not external posts. Inspect the destination before retrying a failed assisted attempt: after two dispatch failures Liftoff retains a manual paste file rather than silently retrying forever.

### API route

The registry accepts `api` for this channel. In the current adapter implementation, assisted API dispatch stages a local paste file and a manual receipt; it does **not** call a publishing API. API integration names are not proof of external delivery.

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Token required via --token-env or stdin`: provide a nonempty token through an environment variable or stdin, never a command-line literal.
- `OS keychain unavailable or access denied; no token was stored`: unlock/fix your OS keychain backend. Tokens are not saved in the connection JSON.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.
- `<channel>: unsupported connected route <route>` means the stored route does not map to an adapter for this channel; reconnect using its supported route.

## Sources

- [Planning policy](../../rules/channels/devto.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/devto.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).

[All channels](README.md)
